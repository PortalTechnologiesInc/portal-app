/**
 * Passport NFC Service
 * Implements BAC (Basic Access Control) protocol and data group reading
 * Uses ICAO 9303 eMRTD standard
 */

import { Buffer } from '@craftzdog/react-native-buffer';
import NfcManager, { NfcTech } from 'react-native-nfc-manager';
import { createDiffieHellman, randomBytes } from 'react-native-quick-crypto';
import * as CryptoUtils from '@/utils/crypto';
import { deriveBacKeys, type MrzData } from '@/utils/mrz';
import {
  getECCurveName,
  getPACEConfig,
  getStandardizedDHParams,
  type PACEConfig,
  type PACEInfo,
  unwrapDO as paceUnwrapDO,
  wrapDO as paceWrapDO,
  parseAllPACEInfo,
  wrapGA,
} from '@/utils/pace';

/**
 * ICAO 9303 Part 10 — EF File Identifiers and Short File Identifiers
 *
 * Per ICAO 9303 Part 10, Table 37 / JMRTD PassportService constants:
 *   DG1  → FID 0x0101, SFID 0x01
 *   DG2  → FID 0x0102, SFID 0x02
 *   ...
 *   DG16 → FID 0x0110, SFID 0x10
 *   EF.COM → FID 0x011E, SFID 0x1E
 *   EF.SOD → FID 0x011D, SFID 0x1D
 */
function dgToFid(dgNumber: number): [number, number] {
  if (dgNumber === 0x1e) return [0x01, 0x1e]; // EF.COM
  if (dgNumber === 0x1d) return [0x01, 0x1d]; // EF.SOD
  // DG1..DG16 → FID 0x0101..0x0110
  return [0x01, dgNumber];
}

/** Map DG number to Short File Identifier (SFID) — same as low byte of FID */
function dgToSfid(dgNumber: number): number {
  if (dgNumber === 0x1e) return 0x1e; // EF.COM
  if (dgNumber === 0x1d) return 0x1d; // EF.SOD
  return dgNumber; // DG1=0x01, DG2=0x02, ..., DG16=0x10
}

export interface PassportData {
  mrz: MrzData;
  comRaw: string; // Hex string of EF.COM (data group presence list)
  dg1Raw: string; // Hex string of DG1 (personal data / MRZ)
  dg2Raw: string; // Hex string of DG2 (face image) — empty if not read
  sodRaw: string; // Hex string of SOD (security object / digital signature)
  activeAuthSupported: boolean;
  readTimestamp: Date;
}

export interface ReadErrorInfo {
  code: string;
  message: string;
  details?: any;
}

/**
 * BAC (Basic Access Control) implementation for passport NFC reading
 * Protocol: ICAO 9303 Part 10 BAC v2
 */
export class PassportNfcService {
  private nfcEnabled: boolean = false;
  private isoDep: any = null;
  private sessionK_enc: Uint8Array | null = null;
  private sessionK_mac: Uint8Array | null = null;
  private ssc: Uint8Array | null = null;
  private smCipher: '3DES' | 'AES' = '3DES';

  /**
   * Initialize NFC Manager
   */
  async initialize(): Promise<boolean> {
    try {
      const supported = await NfcManager.isSupported();
      if (!supported) {
        throw new ReadError('NFC not supported', 'NFC hardware not available');
      }

      await NfcManager.start();
      this.nfcEnabled = true;
      return true;
    } catch (error) {
      console.error('[PassportNFC] Initialize failed:', error);
      return false;
    }
  }

  /**
   * Start NFC tag reading with IsoDep technology
   * Returns when tag is found
   */
  async startReading(
    mrzData: MrzData,
    onTagFound?: () => void,
    options?: { skipPACE?: boolean }
  ): Promise<PassportData> {
    if (!this.nfcEnabled) {
      await this.initialize();
    }

    nfcScanActive = true;
    try {
      // Request IsoDep technology for smart card communication
      await NfcManager.requestTechnology(NfcTech.IsoDep);

      // Increase IsoDep timeout to 10s (default 2s can drop during EXTERNAL AUTH)
      try {
        await (NfcManager as any).setTimeout(10000);
      } catch (_) {}

      const tag = await NfcManager.getTag();
      if (!tag) {
        throw new ReadError('TAG_NOT_FOUND', 'No NFC tag detected');
      }

      this.isoDep = tag;

      // Notify caller that the tag was found (UI can show "stay still" feedback)
      onTagFound?.();

      // Reset SM cipher to default for each new read
      this.smCipher = '3DES';

      // Try PACE first; fall back to BAC if unsupported
      let usedPACE = false;
      const skipPACE = options?.skipPACE === true;
      const paceResult = skipPACE ? null : await this.readPACEInfo();
      if (paceResult) {
        try {
          await this.doPACE(mrzData, paceResult.info, paceResult.config);
          usedPACE = true;
          console.log('[PassportNFC] PACE succeeded, using PACE session keys');
        } catch (paceErr) {
          console.log(
            '[PassportNFC] PACE failed, falling back to BAC:',
            (paceErr as Error).message
          );
          // Some chips get "stuck" after a partial PACE attempt and will reject BAC secure messaging.
          // Clear local SM state and best-effort reset chip state before starting BAC.
          this.sessionK_enc = null;
          this.sessionK_mac = null;
          this.ssc = null;
          this.smCipher = '3DES';
          try {
            // SELECT MF (3F00)
            await this.transceiveBytes([0x00, 0xa4, 0x00, 0x0c, 0x02, 0x3f, 0x00]);
          } catch (_) {}
          try {
            // Re-select MRTD application (A0000002471001)
            await this.transceiveBytes([0x00, 0xa4, 0x04, 0x0c, 0x07, 0xa0, 0x00, 0x00, 0x02, 0x47, 0x10, 0x01]);
          } catch (_) {}
        }
      }

      if (!usedPACE) {
        await this.bacAuth(mrzData);
      }

      // Skip SM re-select of MRTD AID — it's already selected before BAC auth.
      // Some chips return 6F00 on SM SELECT after BAC; go directly to reading.
      // If a chip needs re-select, the SFID-based READ BINARY will fail and
      // readDataGroup falls back to SELECT-by-FID + READ BINARY anyway.

      // 1. Read EF.COM — lists which DGs are present on this passport
      let comRaw = '';
      try {
        comRaw = await this.readDataGroup(0x1e); // EF.COM
      } catch (e: any) {
        console.log('[PassportNFC] EF.COM read failed (non-fatal):', e?.message);
      }

      // Parse EF.COM to find which DGs are present
      const presentDgs = comRaw ? this.parseCOMDataGroups(comRaw) : [];
      console.log('[PassportNFC] DGs present per EF.COM:', presentDgs);

      // 2. Read EF.SOD — digital signature over data groups (primary goal)
      const sodRaw = await this.readDataGroup(0x1d);

      // 3. Read DG1 — MRZ data (needed for SOD signature verification in enclave)
      const dg1Raw = await this.readDataGroup(0x01);

      // DG2 (face photo) skipped — not needed for signature verification
      const dg2Raw = ''; // await this.readDataGroup(0x02);

      // Check if Active Authentication is supported (DG15 present)
      const activeAuthSupported = presentDgs.includes(15);

      return {
        mrz: mrzData,
        comRaw,
        dg1Raw,
        dg2Raw,
        sodRaw,
        activeAuthSupported,
        readTimestamp: new Date(),
      };
    } catch (error) {
      console.error('[PassportNFC] Reading failed:', error);
      throw error;
    } finally {
      await this.cleanup();
      nfcScanActive = false;
    }
  }

  /**
   * BAC (Basic Access Control) authentication
   * Steps:
   * 1. Select MRTD application
   * 2. GET CHALLENGE
   * 3. Send EXTERNAL AUTHENTICATE with encrypted response
   * 4. Derive session keys
   */
  private async bacAuth(mrzData: MrzData): Promise<{ k_enc: Uint8Array; k_mac: Uint8Array }> {
    const tag = this.isoDep;

    // Pre-derive BAC keys BEFORE any NFC interaction to avoid timing issues.
    // Some chips have tight timeouts between GET CHALLENGE and EXTERNAL AUTH.
    const bacKeys = deriveBacKeys(mrzData);
    const bacSeed = `${mrzData.documentNumber}${mrzData.documentNumberCheckDigit}${mrzData.dateOfBirth}${mrzData.dateOfBirthCheckDigit}${mrzData.expiryDate}${mrzData.expiryDateCheckDigit}`;
    console.log(
      '[PassportNFC] MRZ seed string:',
      JSON.stringify(bacSeed),
      `(${bacSeed.length} chars)`
    );
    console.log('[PassportNFC] mrzKey (SHA-1 hex):', bacKeys.mrzKey);
    console.log('[PassportNFC] k_enc hex:', bacKeys.k_enc);
    console.log('[PassportNFC] k_mac hex:', bacKeys.k_mac);

    // Pre-generate random values too
    const rndIfd = CryptoUtils.randomBytes(8);
    const kifd = CryptoUtils.randomBytes(16);

    // 0. Diagnostic: try to read EF.CardAccess (exists on PACE-capable chips, no auth needed)
    try {
      const selCardAccess = this.buildApdu(0x00, 0xa4, 0x02, 0x0c, 0, [0x01, 0x1c]);
      const selCaResp = await this.transceive(selCardAccess);
      console.log('[PassportNFC] EF.CardAccess SELECT:', selCaResp);
      if (this.isSuccess(selCaResp)) {
        const readCa = this.buildApdu(0x00, 0xb0, 0x00, 0x00, 0xfe);
        const caData = await this.transceive(readCa);
        console.log('[PassportNFC] EF.CardAccess DATA:', caData);
      }
    } catch (e: any) {
      console.log('[PassportNFC] EF.CardAccess not available:', e?.message);
    }

    // 1. SELECT MRTD application (A0 00 00 02 47 10 01)
    const selectMrtd = this.buildApdu(
      0x00,
      0xa4,
      0x04,
      0x0c,
      0,
      [0xa0, 0x00, 0x00, 0x02, 0x47, 0x10, 0x01]
    );
    const selectResp = await this.transceive(selectMrtd);
    if (!this.isSuccess(selectResp)) {
      throw new ReadError('SELECT_FAILED', 'Failed to select MRTD application');
    }

    // 2. GET CHALLENGE (00 84 00 00 08)
    const getChallenge = this.buildApdu(0x00, 0x84, 0x00, 0x00, 8);
    const challengeResp = await this.transceive(getChallenge);

    if (!this.isSuccess(challengeResp)) {
      throw new ReadError('CHALLENGE_FAILED', 'Failed to get challenge');
    }

    // Extract RND.IC (8 bytes) from response
    const rndIc = CryptoUtils.hexToBytes(challengeResp.substring(0, 16));

    // Convert hex strings to Uint8Array (16 bytes each)
    const k_enc_raw = CryptoUtils.hexToBytes(bacKeys.k_enc);
    const k_mac_raw = CryptoUtils.hexToBytes(bacKeys.k_mac);
    console.log(
      '[PassportNFC] k_enc_raw len:',
      k_enc_raw.length,
      'k_mac_raw len:',
      k_mac_raw.length
    );

    // Convert keys to 24-byte 3DES keys (two-key 3DES: K1 K2 K1)
    const k_enc_3des = CryptoUtils.expand16To24Bytes(k_enc_raw);
    const k_mac_3des = CryptoUtils.expand16To24Bytes(k_mac_raw);
    console.log(
      '[PassportNFC] k_enc_3des len:',
      k_enc_3des.length,
      'k_mac_3des len:',
      k_mac_3des.length
    );

    // 4. Build S = RND.IFD || RND.IC || K.IFD
    const s = new Uint8Array(rndIfd.length + rndIc.length + kifd.length);
    s.set(rndIfd, 0);
    s.set(rndIc, rndIfd.length);
    s.set(kifd, rndIfd.length + rndIc.length);
    console.log(
      '[PassportNFC] S len:',
      s.length,
      'rndIc:',
      Array.from(rndIc)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
    );

    // 5. E_IFD = 3DES-CBC-encrypt(K_enc, S)
    console.log('[PassportNFC] About to des3Encrypt');
    const eIfd = CryptoUtils.des3EncryptNopad(s, k_enc_3des, new Uint8Array(8)); // Zero IV for BAC, no padding
    console.log('[PassportNFC] E_IFD hex:', CryptoUtils.bytesToHex(eIfd), `(${eIfd.length} bytes)`);

    // 6. M_IFD = MAC(K_mac, E_IFD)
    console.log('[PassportNFC] About to computeMac');
    const mIfd = CryptoUtils.computeMac(k_mac_3des, eIfd);
    console.log('[PassportNFC] M_IFD hex:', CryptoUtils.bytesToHex(mIfd), `(${mIfd.length} bytes)`);

    // 7. EXTERNAL AUTHENTICATE (00 82 00 00 28 || E_IFD || M_IFD)
    // Note: Le=0 (omitted) — some passport chips reject case-4 APDU here.
    // The chip may return just 9000 (no mutual auth data) or the full response.
    const externalAuthData = new Uint8Array(eIfd.length + mIfd.length);
    externalAuthData.set(eIfd, 0);
    externalAuthData.set(mIfd, eIfd.length);

    // Le=0x28 (40) — request E_IC || M_IC response so we can derive proper session keys.
    // ICAO 9303 mandates the chip returns 40 bytes here.
    const externalAuth = this.buildApdu(
      0x00,
      0x82,
      0x00,
      0x00,
      0x28, // Le = 40: request E_IC || M_IC for session key derivation
      Array.from(externalAuthData)
    );
    console.log('[PassportNFC] EXTERNAL AUTH APDU len:', externalAuth.length / 2, 'bytes');

    let authResp: string;
    try {
      authResp = await this.transceive(externalAuth);
      console.log('[PassportNFC] EXTERNAL AUTH RX:', authResp);
    } catch (e: any) {
      // Log the raw exception to distinguish NFC drop vs protocol error
      console.log(
        '[PassportNFC] EXTERNAL AUTH transceive threw:',
        e?.message,
        e?.code,
        JSON.stringify(e)
      );
      throw new ReadError(
        'BAC_AUTH_FAILED',
        'BAC authentication failed - passport rejected credentials'
      );
    }

    if (!this.isSuccess(authResp!)) {
      const sw = authResp!.slice(-4);
      console.log('[PassportNFC] EXTERNAL AUTH bad SW:', sw);
      throw new ReadError('BAC_AUTH_FAILED', `BAC authentication failed: SW=${sw}`);
    }

    // Parse EXTERNAL AUTHENTICATE response
    // ICAO 9303 mandates 40 data bytes (E_IC + M_IC) but some chips return only SW 9000.
    // Fall back to using BAC keys directly as session keys when no data is returned.
    const authData = authResp!.slice(0, -4); // strip SW
    let sessionK_enc: Uint8Array;
    let sessionK_mac: Uint8Array;

    if (authData.length === 80) {
      // 40 bytes = 80 hex chars — full mutual auth
      const eIc = CryptoUtils.hexToBytes(authData.substring(0, 64)); // 32 bytes
      const mIc = CryptoUtils.hexToBytes(authData.substring(64, 80)); // 8 bytes

      // Verify MAC on E_IC
      const mIcComputed = CryptoUtils.computeMac(k_mac_3des, eIc);
      if (CryptoUtils.bytesToHex(mIcComputed) !== CryptoUtils.bytesToHex(mIc)) {
        throw new ReadError('BAC_AUTH_FAILED', 'BAC mutual authentication MAC verification failed');
      }

      // Decrypt S_IC = 3DES-CBC-Dec(K_enc, IV=zeros, E_IC)
      const sIc = CryptoUtils.des3DecryptCBC(k_enc_3des, new Uint8Array(8), eIc);

      // Verify RND.IC and RND.IFD inside S_IC
      const rndIcFromChip = sIc.slice(0, 8);
      const rndIfdFromChip = sIc.slice(8, 16);
      const kIc = sIc.slice(16, 32);

      if (CryptoUtils.bytesToHex(rndIcFromChip) !== CryptoUtils.bytesToHex(rndIc)) {
        throw new ReadError('BAC_AUTH_FAILED', 'BAC mutual auth: RND.IC mismatch');
      }
      if (CryptoUtils.bytesToHex(rndIfdFromChip) !== CryptoUtils.bytesToHex(rndIfd)) {
        throw new ReadError('BAC_AUTH_FAILED', 'BAC mutual auth: RND.IFD mismatch');
      }

      // Derive session keys: Kseed = K.IFD XOR K.IC
      const kseed = new Uint8Array(16);
      for (let i = 0; i < 16; i++) {
        kseed[i] = kifd[i]! ^ kIc[i]!;
      }

      // Use existing KDF (same as BAC key derivation but with new Kseed)
      const sessionKeys = CryptoUtils.deriveBacKeys(kseed);
      sessionK_enc = CryptoUtils.expand16To24Bytes(sessionKeys.k_enc);
      sessionK_mac = CryptoUtils.expand16To24Bytes(sessionKeys.k_mac);
      console.log('[PassportNFC] Full mutual auth: session keys derived from K.IFD XOR K.IC');
    } else {
      // Chip returned only 9000 — use BAC keys directly as session keys
      console.log('[PassportNFC] No mutual auth data from chip, using BAC keys as session keys');
      sessionK_enc = k_enc_3des;
      sessionK_mac = k_mac_3des;
    }

    // SSC = last 4 bytes of RND.IC || last 4 bytes of RND.IFD
    const ssc = new Uint8Array(8);
    ssc.set(rndIc.slice(4, 8), 0);
    ssc.set(rndIfd.slice(4, 8), 4);

    this.sessionK_enc = sessionK_enc;
    this.sessionK_mac = sessionK_mac;
    this.ssc = ssc;

    console.log('[PassportNFC] BAC authentication successful, session keys derived');
    console.log('[PassportNFC] SSC initial:', CryptoUtils.bytesToHex(ssc));

    return { k_enc: sessionK_enc, k_mac: sessionK_mac };
  }

  // ─── PACE (Password Authenticated Connection Establishment) ───

  /**
   * Attempt to read EF.CardAccess and parse PACEInfo.
   * Returns null if the file is absent or does not contain a PACE OID.
   */
  private async readPACEInfo(): Promise<{ info: PACEInfo; config: PACEConfig } | null> {
    try {
      const selectApdu = [0x00, 0xa4, 0x02, 0x0c, 0x02, 0x01, 0x1c];
      const selResp = await this.transceiveBytes(selectApdu);
      const selSw = (selResp[selResp.length - 2]! << 8) | selResp[selResp.length - 1]!;
      if (selSw !== 0x9000) return null;

      let cardAccessHex = '';
      let offset = 0;
      while (true) {
        const readApdu = [0x00, 0xb0, (offset >> 8) & 0xff, offset & 0xff, 0x00];
        const readResp = await this.transceiveBytes(readApdu);
        const sw = (readResp[readResp.length - 2]! << 8) | readResp[readResp.length - 1]!;
        if (readResp.length > 2) {
          cardAccessHex += readResp
            .slice(0, readResp.length - 2)
            .map((b: number) => b.toString(16).padStart(2, '0'))
            .join('');
        }
        if (sw === 0x9000) break;
        if (sw >> 8 === 0x61) {
          offset += readResp.length - 2;
          continue;
        }
        break;
      }

      if (!cardAccessHex) return null;
      console.log('[PassportNFC] EF.CardAccess:', cardAccessHex);

      const allInfos = parseAllPACEInfo(cardAccessHex);
      if (allInfos.length === 0) return null;

      // Log all entries for diagnostics
      for (const entry of allInfos) {
        const cfg = getPACEConfig(entry.oid);
        console.log(
          '[PassportNFC] PACEInfo found:',
          JSON.stringify({ oid: entry.oid, version: entry.version, parameterId: entry.parameterId }),
          '→', JSON.stringify(cfg)
        );
      }

      // Prefer ECDH over DH — ECDH pubkeys are ~65 bytes (fit in short APDUs),
      // DH-2048 pubkeys are 256 bytes (require extended APDUs that some chips reject).
      const preferred = allInfos.find(i => getPACEConfig(i.oid).agreementAlg === 'ECDH') ?? allInfos[0];
      if (!preferred) return null;
      const info = preferred;
      const config = getPACEConfig(info.oid);
      console.log('[PassportNFC] Selected PACEInfo:', JSON.stringify({ oid: info.oid, version: info.version, parameterId: info.parameterId }));
      console.log('[PassportNFC] PACEConfig:', JSON.stringify(config));
      return { info, config };
    } catch (e) {
      console.log('[PassportNFC] EF.CardAccess not readable:', (e as Error).message);
      return null;
    }
  }

  /**
   * PACE authentication (BSI TR-03110).
   * Supports DH-GM and ECDH-GM with 3DES and AES-128/256 ciphers.
   */
  private async doPACE(mrzData: MrzData, paceInfo: PACEInfo, config: PACEConfig): Promise<void> {
    console.log('[PassportNFC] Starting PACE authentication');

    // Derive K_pi from MRZ data (PACE password key, counter = 3)
    // BSI TR-03110: Pi = SHA-1(MRZ_information) where MRZ_information =
    //   docNo || docNoCD || DOB || DOBCD || DOE || DOECD
    const mrzConcat =
      mrzData.documentNumber +
      mrzData.documentNumberCheckDigit +
      mrzData.dateOfBirth +
      mrzData.dateOfBirthCheckDigit +
      mrzData.expiryDate +
      mrzData.expiryDateCheckDigit;
    const mrzBytes = new TextEncoder().encode(mrzConcat);
    const Crypto = require('react-native-quick-crypto');
    const mrzHash: Uint8Array = Crypto.createHash('sha1').update(mrzBytes).digest();
    const kPi = CryptoUtils.derivePACEKey(mrzHash, 3, config.cipher, config.digest);
    console.log('[PassportNFC] K_pi derived, length:', kPi.length);

    // ── MSE:Set AT ──
    const oidDO = [0x80, paceInfo.oid.length, ...paceInfo.oid]; // tag 80
    const refDO = [0x83, 0x01, 0x01]; // key reference: MRZ
    const mseData = [...oidDO, ...refDO];
    const mseApdu = [0x00, 0x22, 0xc1, 0xa4, mseData.length, ...mseData];
    const mseResp = await this.transceiveBytes(mseApdu);
    const mseSw = (mseResp[mseResp.length - 2]! << 8) | mseResp[mseResp.length - 1]!;
    if (mseSw !== 0x9000) {
      throw new ReadError('PACE_MSE_FAILED', `MSE:Set AT failed with SW=${mseSw.toString(16)}`);
    }
    console.log('[PassportNFC] MSE:Set AT success');

    // ── Step 1: Get encrypted nonce ──
    const gaStep1Body = wrapGA([]);
    const gaStep1Resp = await this.sendGA(true, gaStep1Body);
    this.checkSW(gaStep1Resp, 'PACE Step 1');
    const respData1 = new Uint8Array(gaStep1Resp.slice(0, gaStep1Resp.length - 2));
    const encryptedNonce = paceUnwrapDO(0x80, respData1);
    console.log('[PassportNFC] Encrypted nonce length:', encryptedNonce.length);

    // Decrypt nonce with K_pi
    // For 3DES the nonce is 8 bytes (BSI TR-03110-3 Table A.5); the chip may pad
    // to a full block boundary before encrypting, so strip ISO 9797-1 method 2
    // padding if the decrypted result is longer than one block.
    let nonce: Uint8Array;
    if (config.cipher === '3DES') {
      const k3des = CryptoUtils.derive3DesKey(kPi);
      const decrypted = CryptoUtils.des3DecryptCBC(k3des, new Uint8Array(8), encryptedNonce);
      if (decrypted.length > 8) {
        try {
          nonce = CryptoUtils.removePadding(decrypted);
        } catch {
          // If unpadding fails, use the raw decrypted bytes (chip may send unpadded 16-byte nonce)
          nonce = decrypted;
        }
      } else {
        nonce = decrypted;
      }
    } else {
      nonce = CryptoUtils.aesDecryptCBC(encryptedNonce, kPi, new Uint8Array(16));
    }
    console.log('[PassportNFC] Nonce decrypted, length:', nonce.length);

    // ── Steps 2-4 dispatch based on agreement algorithm ──
    let sessionKeys: { kEnc: Uint8Array; kMac: Uint8Array };
    if (config.agreementAlg === 'DH') {
      sessionKeys = await this.paceDHGM(nonce, paceInfo, config);
    } else {
      sessionKeys = await this.paceECDHGM(nonce, paceInfo, config);
    }

    // Install session keys
    this.sessionK_enc = sessionKeys.kEnc;
    this.sessionK_mac = sessionKeys.kMac;
    this.smCipher = config.cipher === '3DES' ? '3DES' : 'AES';

    // SSC starts at zero for PACE
    const sscLen = this.smCipher === 'AES' ? 16 : 8;
    this.ssc = new Uint8Array(sscLen);

    console.log('[PassportNFC] PACE authentication successful');
    console.log('[PassportNFC] SM cipher:', this.smCipher);
  }

  /**
   * PACE DH-GM steps 2-4.
   * Uses react-native-quick-crypto (OpenSSL) for DH key generation and shared
   * secret computation to avoid potential Hermes BigInt precision issues with
   * 2048-bit modular exponentiation.
   */
  private async paceDHGM(
    nonce: Uint8Array,
    paceInfo: PACEInfo,
    config: PACEConfig
  ): Promise<{ kEnc: Uint8Array; kMac: Uint8Array }> {
    const dhParams = getStandardizedDHParams(paceInfo.parameterId);
    if (!dhParams) {
      throw new ReadError(
        'PACE_UNSUPPORTED_PARAMS',
        `Unsupported DH parameterId: ${paceInfo.parameterId}`
      );
    }

    const pBuf = Buffer.from(dhParams.p, 'hex');
    const gBuf = Buffer.from(dhParams.g, 'hex');
    const pByteLen = pBuf.length;

    // ── Step 2: DH Generic Mapping (native OpenSSL) ──
    // Use getPublicKey() instead of computeSecret(g) to avoid potential KDF
    // processing that react-native-quick-crypto may apply to computeSecret results.
    const dhMap = createDiffieHellman(pBuf, gBuf);
    dhMap.generateKeys();
    const pkMapBuf = dhMap.getPublicKey() as Buffer;
    const pkMapBytes = dhStripKey(pkMapBuf);
    console.log('[PassportNFC] DH Step 2 pubkey length:', pkMapBytes.length);

    const ga2Body = wrapGA(paceWrapDO(0x81, pkMapBytes));
    const ga2Resp = await this.sendGA(true, ga2Body);
    this.checkSW(ga2Resp, 'PACE DH Step 2');

    const respData2 = new Uint8Array(ga2Resp.slice(0, ga2Resp.length - 2));
    const pkMapChipBytes = paceUnwrapDO(0x82, respData2);

    // H = pkMapChip^skMap mod p (native OpenSSL)
    const H_buf = dhMap.computeSecret(Buffer.from(pkMapChipBytes)) as Buffer;

    // g^s mod p using BigInt modPow (avoids setPrivateKey+computeSecret(g) hack
    // which may not work reliably in react-native-quick-crypto)
    const g = CryptoUtils.hexToBigInt(dhParams.g);
    const s = bytesToBigInt(nonce);
    const p = CryptoUtils.hexToBigInt(dhParams.p);
    const gsBigInt = CryptoUtils.modPow(g, s, p);

    // Mapped generator: gNew = g^s * H mod p
    const H = bytesToBigInt(new Uint8Array(H_buf));
    const gNew = (gsBigInt * H) % p;
    const gNewBuf = Buffer.from(CryptoUtils.bigIntToBytes(gNew, pByteLen));

    // ── Step 3: Ephemeral key exchange with mapped generator ──
    const dhEph = createDiffieHellman(pBuf, gNewBuf);
    dhEph.generateKeys();
    const pkEphBuf = dhEph.getPublicKey() as Buffer;
    const pkEphBytes = dhStripKey(pkEphBuf);

    const ga3Body = wrapGA(paceWrapDO(0x83, pkEphBytes));
    const ga3Resp = await this.sendGA(true, ga3Body);
    this.checkSW(ga3Resp, 'PACE DH Step 3');

    const respData3 = new Uint8Array(ga3Resp.slice(0, ga3Resp.length - 2));
    const pkEphChipBytes = paceUnwrapDO(0x84, respData3);

    // K = pkEphChip^skEph mod p (native OpenSSL)
    const K_buf = dhEph.computeSecret(Buffer.from(pkEphChipBytes)) as Buffer;
    const sharedSecret = dhPadBytes(K_buf, pByteLen);

    // ── Step 4: Derive keys + mutual authentication ──
    return this.paceStep4(sharedSecret, pkEphBytes, Array.from(pkEphChipBytes), config, paceInfo);
  }

  /**
   * PACE ECDH-GM steps 2-4.
   */
  private async paceECDHGM(
    nonce: Uint8Array,
    paceInfo: PACEInfo,
    config: PACEConfig
  ): Promise<{ kEnc: Uint8Array; kMac: Uint8Array }> {
    const curveName = getECCurveName(paceInfo.parameterId);
    if (!curveName) {
      throw new ReadError(
        'PACE_UNSUPPORTED_PARAMS',
        `Unsupported EC parameterId: ${paceInfo.parameterId}`
      );
    }

    const curve = getNobleECCurve(curveName);
    if (!curve) {
      throw new ReadError(
        'PACE_UNSUPPORTED_CURVE',
        `Curve ${curveName} not available in @noble/curves`
      );
    }

    const G = curve.ProjectivePoint.BASE;
    const s = bytesToBigInt(nonce);
    const fieldSize = Math.ceil(curve.CURVE.Fp.BYTES ?? curve.CURVE.nBitLength / 8);

    // ── Step 2: EC Generic Mapping ──
    const skMap: Uint8Array = generateECPrivateKey(curve);
    const pkMapPoint = G.multiply(bytesToBigInt(skMap));
    const pkMapBytes = Array.from(pkMapPoint.toRawBytes(false)) as number[];

    const ga2Body = wrapGA(paceWrapDO(0x81, pkMapBytes));
    const ga2Resp = await this.sendGA(true, ga2Body);
    this.checkSW(ga2Resp, 'PACE ECDH Step 2');

    const respData2 = new Uint8Array(ga2Resp.slice(0, ga2Resp.length - 2));
    const pkMapChipRaw = paceUnwrapDO(0x82, respData2);
    const pkMapChip = curve.ProjectivePoint.fromHex(CryptoUtils.bytesToHex(pkMapChipRaw));

    // H = skMap * pkMapChip
    const H = pkMapChip.multiply(bytesToBigInt(new Uint8Array(skMap)));
    // G_new = s*G + H
    const sG = G.multiply(s);
    const Gnew = sG.add(H);

    // ── Step 3: Ephemeral key exchange ──
    const skEph = generateECPrivateKey(curve);
    const pkEphPoint = Gnew.multiply(bytesToBigInt(new Uint8Array(skEph)));
    const pkEphBytes = Array.from(pkEphPoint.toRawBytes(false)) as number[];

    const ga3Body = wrapGA(paceWrapDO(0x83, pkEphBytes));
    const ga3Resp = await this.sendGA(true, ga3Body);
    this.checkSW(ga3Resp, 'PACE ECDH Step 3');

    const respData3 = new Uint8Array(ga3Resp.slice(0, ga3Resp.length - 2));
    const pkEphChipRaw = paceUnwrapDO(0x84, respData3);
    const pkEphChip = curve.ProjectivePoint.fromHex(CryptoUtils.bytesToHex(pkEphChipRaw));

    // Shared secret = x-coordinate of skEph * pkEphChip
    const sharedPoint = pkEphChip.multiply(bytesToBigInt(new Uint8Array(skEph)));
    const sharedSecret = CryptoUtils.bigIntToBytes(sharedPoint.x, fieldSize);

    // ── Step 4: Derive keys + mutual authentication ──
    return this.paceStep4(sharedSecret, pkEphBytes, Array.from(pkEphChipRaw), config, paceInfo);
  }

  /**
   * PACE Step 4: derive session keys, mutual authentication token exchange.
   */
  private async paceStep4(
    sharedSecret: Uint8Array,
    pkEphTerminal: number[],
    pkEphChip: number[],
    config: PACEConfig,
    paceInfo: PACEInfo
  ): Promise<{ kEnc: Uint8Array; kMac: Uint8Array }> {
    const kEnc = CryptoUtils.derivePACEKey(sharedSecret, 1, config.cipher, config.digest);
    const kMac = CryptoUtils.derivePACEKey(sharedSecret, 2, config.cipher, config.digest);
    console.log('[PassportNFC] PACE session keys derived');

    // BSI TR-03110-3 §A.2.4: auth token = MAC over 7F49{OID, pubKey}
    const oid = Array.from(paceInfo.oid);
    const pkTag = config.agreementAlg === 'DH' ? 0x84 : 0x86;
    const termAuthInput = buildAuthTokenInput(oid, pkTag, pkEphChip);
    const chipAuthInput = buildAuthTokenInput(oid, pkTag, pkEphTerminal);

    let tIfd: Uint8Array;
    if (config.cipher === '3DES') {
      const kMac3des = CryptoUtils.derive3DesKey(kMac);
      tIfd = CryptoUtils.computeMac(kMac3des, new Uint8Array(termAuthInput));
    } else {
      tIfd = CryptoUtils.aesCmac(kMac, new Uint8Array(termAuthInput));
      tIfd = tIfd.slice(0, 8); // Truncate to 8 bytes
    }

    const ga4Body = wrapGA(paceWrapDO(0x85, Array.from(tIfd)));
    const ga4Resp = await this.sendGA(false, ga4Body);
    this.checkSW(ga4Resp, 'PACE Step 4');

    const respData4 = new Uint8Array(ga4Resp.slice(0, ga4Resp.length - 2));
    const tIc = paceUnwrapDO(0x86, respData4);

    // Verify chip's auth token
    let tIcExpected: Uint8Array;
    if (config.cipher === '3DES') {
      const kMac3des = CryptoUtils.derive3DesKey(kMac);
      tIcExpected = CryptoUtils.computeMac(kMac3des, new Uint8Array(chipAuthInput));
    } else {
      tIcExpected = CryptoUtils.aesCmac(kMac, new Uint8Array(chipAuthInput));
      tIcExpected = tIcExpected.slice(0, 8);
    }

    if (!constantTimeEqual(tIc, tIcExpected)) {
      throw new ReadError(
        'PACE_AUTH_FAILED',
        'PACE mutual authentication failed: chip token mismatch'
      );
    }
    console.log('[PassportNFC] PACE mutual authentication verified');

    if (config.cipher === '3DES') {
      return { kEnc: CryptoUtils.derive3DesKey(kEnc), kMac: CryptoUtils.derive3DesKey(kMac) };
    }
    return { kEnc, kMac };
  }

  /**
   * Send a General Authenticate APDU with proper length encoding.
   * Uses extended length (Case 3e) when data exceeds 255 bytes.
   */
  private async sendGA(chaining: boolean, body: number[]): Promise<number[]> {
    const cla = chaining ? 0x10 : 0x00;

    if (body.length <= 255) {
      return this.transceiveBytes([cla, 0x86, 0x00, 0x00, body.length, ...body, 0x00]);
    }

    const lcHi = (body.length >> 8) & 0xff;
    const lcLo = body.length & 0xff;
    const isReject = (sw: number) =>
      sw === 0x6a80 || sw === 0x6700 || sw === 0x6800 ||
      sw === 0x6f00 || sw === 0x6e00 || sw === 0x6d00;
    const getSW = (r: number[]) => (r[r.length - 2]! << 8) | r[r.length - 1]!;

    // Try 1: Extended Case 4e, CLA=0x00, Le=0x0100 (256) — matches JMRTD default
    const resp1 = await this.transceiveBytes([
      0x00, 0x86, 0x00, 0x00, 0x00, lcHi, lcLo, ...body, 0x01, 0x00,
    ]);
    if (!isReject(getSW(resp1))) return resp1;
    console.log(`[PassportNFC] Ext 4e CLA=0x00 Le=256: SW=${getSW(resp1).toString(16)}`);

    // Try 2: Extended Case 3e, CLA=0x00, NO Le — some chips reject Le on GA
    const resp2 = await this.transceiveBytes([
      0x00, 0x86, 0x00, 0x00, 0x00, lcHi, lcLo, ...body,
    ]);
    if (!isReject(getSW(resp2))) return resp2;
    console.log(`[PassportNFC] Ext 3e CLA=0x00 no-Le: SW=${getSW(resp2).toString(16)}`);

    // Try 3: Extended Case 4e, CLA=0x10, Le=0x0200 (512)
    const resp3 = await this.transceiveBytes([
      cla, 0x86, 0x00, 0x00, 0x00, lcHi, lcLo, ...body, 0x02, 0x00,
    ]);
    if (!isReject(getSW(resp3))) return resp3;
    console.log(`[PassportNFC] Ext 4e CLA=0x10 Le=512: SW=${getSW(resp3).toString(16)}`);

    // Try 4: Extended Case 4e, CLA=0x10, Le=0x0000 (max)
    const resp4 = await this.transceiveBytes([
      cla, 0x86, 0x00, 0x00, 0x00, lcHi, lcLo, ...body, 0x00, 0x00,
    ]);
    if (!isReject(getSW(resp4))) return resp4;
    console.log(`[PassportNFC] Ext 4e CLA=0x10 Le=max: SW=${getSW(resp4).toString(16)}`);

    // Try 5: Command chaining — intermediate chunks are Case 3s (NO Le per ISO 7816-4),
    // only the final chunk includes Le.
    console.log('[PassportNFC] Extended length rejected, trying command chaining');
    const CHUNK = 128;
    let offset = 0;
    while (offset + CHUNK < body.length) {
      const chunk = body.slice(offset, offset + CHUNK);
      // Intermediate chunk: CLA=0x10 (chaining), Case 3s (no Le)
      const chunkResp = await this.transceiveBytes([
        0x10, 0x86, 0x00, 0x00, chunk.length, ...chunk,
      ]);
      const chunkSw = getSW(chunkResp);
      if (chunkSw !== 0x9000) {
        console.log(`[PassportNFC] Chain chunk@${offset}: SW=${chunkSw.toString(16)}`);
        return chunkResp;
      }
      offset += CHUNK;
    }
    // Final chunk: CLA=0x00 (last command), Case 4s (with Le)
    const last = body.slice(offset);
    return this.transceiveBytes([0x00, 0x86, 0x00, 0x00, last.length, ...last, 0x00]);
  }

  private checkSW(resp: number[], label: string): void {
    const sw = (resp[resp.length - 2]! << 8) | resp[resp.length - 1]!;
    if (sw !== 0x9000) {
      throw new ReadError(
        'PACE_APDU_ERROR',
        `${label} failed: SW=${sw.toString(16).padStart(4, '0')}`
      );
    }
  }

  /**
   * Read a Data Group (DG) from the passport chip using Secure Messaging.
   *
   * Strategy: use SFID-based READ BINARY for the first chunk (implicitly selects
   * the file per ISO 7816-4 §7.2.3), then continue with offset-based READ BINARY.
   * Falls back to explicit SELECT by FID + READ BINARY if the chip rejects SFID reads.
   */
  private async readDataGroup(dgNumber: number): Promise<string> {
    const sfid = dgToSfid(dgNumber);
    const fid = dgToFid(dgNumber);
    const label =
      dgNumber <= 0x10
        ? `DG${dgNumber}`
        : dgNumber === 0x1d
          ? 'EF.SOD'
          : dgNumber === 0x1e
            ? 'EF.COM'
            : `EF(${dgNumber.toString(16)})`;
    console.log(
      `[PassportNFC] Reading ${label}, FID: ${fid.map(b => b.toString(16).padStart(2, '0')).join('')}, SFID: ${sfid.toString(16)}`
    );

    const CHUNK_SIZE = 0xe0; // 224 bytes — safe with SM overhead
    let buffer = new Uint8Array(0);
    let offset = 0;
    let totalLength = -1;
    let useSfid = true; // try SFID-based read first

    // First read: SFID-based (P1 = 0x80 | SFID, P2 = 0x00)
    // This implicitly selects the EF and reads from offset 0.
    const firstP1 = 0x80 | sfid;
    let firstResp = await this.smTransceive(0x00, 0xb0, firstP1, 0x00, [], CHUNK_SIZE);

    if (!firstResp.success) {
      // SFID read not supported — fall back to SELECT by FID + READ BINARY
      console.log(
        `[PassportNFC] SFID read for ${label} failed (SW=${firstResp.sw}), falling back to SELECT by FID`
      );
      useSfid = false;

      const selectResp = await this.smTransceive(0x00, 0xa4, 0x02, 0x0c, fid, 0x00);
      if (!selectResp.success) {
        throw new ReadError(
          `${label}_SELECT_FAILED`,
          `Failed to select ${label}: SW=${selectResp.sw}`
        );
      }

      firstResp = await this.smTransceive(0x00, 0xb0, 0x00, 0x00, [], CHUNK_SIZE);
      if (!firstResp.success) {
        throw new ReadError(
          `${label}_READ_FAILED`,
          `Failed to read ${label} at offset 0: SW=${firstResp.sw}`
        );
      }
    }

    // Process first chunk
    buffer = new Uint8Array(firstResp.data);
    offset = buffer.length;

    if (buffer.length >= 2) {
      totalLength = this.parseTlvTotalLength(buffer);
      console.log(`[PassportNFC] ${label} total TLV length: ${totalLength}`);
    }

    // Continue reading with offset-based READ BINARY
    while (true) {
      if (totalLength >= 0 && offset >= totalLength) break;
      if (
        buffer.length > 0 &&
        firstResp.data.length < CHUNK_SIZE &&
        offset === firstResp.data.length
      )
        break;

      const p1 = (offset >> 8) & 0xff;
      const p2 = offset & 0xff;

      const readResp = await this.smTransceive(0x00, 0xb0, p1, p2, [], CHUNK_SIZE);
      if (!readResp.success) {
        // 6B00 or 6282 can mean end of file
        if (readResp.sw === '6b00' || readResp.sw === '6282') break;
        throw new ReadError(
          `${label}_READ_FAILED`,
          `Failed to read ${label} at offset ${offset}: SW=${readResp.sw}`
        );
      }

      const chunk = readResp.data;
      // Append chunk to buffer
      const newBuf = new Uint8Array(buffer.length + chunk.length);
      newBuf.set(buffer, 0);
      newBuf.set(chunk, buffer.length);
      buffer = newBuf;

      // Parse TLV header if we haven't yet
      if (totalLength < 0 && buffer.length >= 2) {
        totalLength = this.parseTlvTotalLength(buffer);
        console.log(`[PassportNFC] ${label} total TLV length: ${totalLength}`);
      }

      offset += chunk.length;

      // Stop conditions
      if (totalLength >= 0 && offset >= totalLength) break;
      if (chunk.length < CHUNK_SIZE) break;
    }

    console.log(`[PassportNFC] ${label} read successful (${buffer.length} bytes)`);
    return CryptoUtils.bytesToHex(buffer);
  }

  /**
   * Parse TLV tag+length to determine total file size (tag + length + value)
   */
  private parseTlvTotalLength(data: Uint8Array): number {
    let pos = 0;
    // Skip tag (1 or 2 bytes)
    if ((data[pos]! & 0x1f) === 0x1f) {
      pos++; // multi-byte tag
      while (pos < data.length && (data[pos]! & 0x80) !== 0) pos++;
      pos++; // final tag byte
    } else {
      pos++;
    }

    if (pos >= data.length) return -1;

    // Parse length
    const firstLen = data[pos]!;
    pos++;
    let valueLength: number;
    if (firstLen < 0x80) {
      valueLength = firstLen;
    } else {
      const numLenBytes = firstLen & 0x7f;
      if (pos + numLenBytes > data.length) return -1;
      valueLength = 0;
      for (let i = 0; i < numLenBytes; i++) {
        valueLength = (valueLength << 8) | data[pos]!;
        pos++;
      }
    }

    return pos + valueLength; // total = header + value
  }

  /**
   * Parse EF.COM to extract the list of Data Group numbers present on the chip.
   * EF.COM structure (simplified):
   *   Tag 0x60 (Application template)
   *     Tag 0x5F01 — LDS version
   *     Tag 0x5F36 — Unicode version
   *     Tag 0x5C   — Tag list (list of DG tags present)
   *
   * DG tags in the tag list: 0x61=DG1, 0x75=DG2, 0x63=DG3, ..., 0x6E=DG14, 0x6F=DG15, 0x70=DG16
   * Mapping: DG1=0x61, DG2=0x75, DG3=0x63, DG4=0x76, DG5-DG16 = 0x65..0x70
   */
  private parseCOMDataGroups(comHex: string): number[] {
    try {
      const data = CryptoUtils.hexToBytes(comHex);
      // Find tag 0x5C (tag list)
      let pos = 0;
      while (pos < data.length - 1) {
        const tag = data[pos]!;

        // Handle 2-byte tags (0x5Fxx)
        let fullTag: number;
        let tagLen: number;
        if (tag === 0x5f) {
          fullTag = (tag << 8) | data[pos + 1]!;
          tagLen = 2;
        } else {
          fullTag = tag;
          tagLen = 1;
        }

        pos += tagLen;
        if (pos >= data.length) break;

        // Parse length
        let len = data[pos]!;
        pos++;
        if (len === 0x81) {
          len = data[pos]!;
          pos++;
        } else if (len === 0x82) {
          len = (data[pos]! << 8) | data[pos + 1]!;
          pos += 2;
        }

        if (fullTag === 0x5c) {
          // Tag list found — each byte is a DG tag
          const dgs: number[] = [];
          for (let i = 0; i < len && pos + i < data.length; i++) {
            const dgTag = data[pos + i]!;
            const dgNum = this.dgTagToNumber(dgTag);
            if (dgNum > 0) dgs.push(dgNum);
          }
          return dgs;
        }

        pos += len;
      }
    } catch (e: any) {
      console.log('[PassportNFC] Failed to parse EF.COM:', e?.message);
    }
    return [];
  }

  /** Map LDS1 DG tag byte to DG number */
  private dgTagToNumber(tag: number): number {
    // ICAO 9303 Part 10: DG tags
    const tagMap: Record<number, number> = {
      97: 1,
      117: 2,
      99: 3,
      118: 4,
      101: 5,
      102: 6,
      103: 7,
      104: 8,
      105: 9,
      106: 10,
      107: 11,
      108: 12,
      109: 13,
      110: 14,
      111: 15,
      112: 16,
    };
    return tagMap[tag] ?? 0;
  }

  // ─── Secure Messaging (ICAO 9303) ───

  /** Increment SSC (big-endian counter, 8 or 16 bytes) */
  private incrementSSC(): void {
    if (!this.ssc) throw new Error('SSC not initialized');
    for (let i = this.ssc.length - 1; i >= 0; i--) {
      this.ssc[i] = (this.ssc[i]! + 1) & 0xff;
      if (this.ssc[i] !== 0) break;
    }
  }

  /**
   * SM-protect an APDU command
   * Returns the wrapped APDU hex string
   */
  private smProtect(
    cla: number,
    ins: number,
    p1: number,
    p2: number,
    data: number[],
    le: number | null
  ): string {
    if (!this.sessionK_enc || !this.sessionK_mac || !this.ssc) {
      throw new Error('Session keys not established');
    }

    this.incrementSSC();

    const mCla = cla | 0x0c;

    // DO87: encrypted command data (3DES-CBC, IV=zeros)
    const do87: number[] = [];
    if (data.length > 0) {
      const padded = CryptoUtils.iso9797Pad(new Uint8Array(data));
      const encrypted = CryptoUtils.des3EncryptNopad(padded, this.sessionK_enc, new Uint8Array(8));
      const encBytes = Array.from(encrypted);
      // TLV: 0x87, length(encrypted+1), 0x01, encrypted...
      const contentLen = encBytes.length + 1;
      if (contentLen < 0x80) {
        do87.push(0x87, contentLen, 0x01, ...encBytes);
      } else {
        // Long form length
        do87.push(0x87, 0x81, contentLen, 0x01, ...encBytes);
      }
    }

    // DO97: expected response length
    const do97: number[] = [];
    if (le !== null) {
      do97.push(0x97, 0x01, le);
    }

    // MAC input (ICAO 9303 Part 11 §9.8.6.2):
    //   SSC || pad(CLA' INS P1 P2) || DO87 || DO97
    // The command header MUST be padded separately to an 8-byte block boundary
    // (ISO 9797-1 Method 2) before concatenation with the data objects.
    // computeMac() then applies final padding to the whole concatenation.
    const paddedHeader = new Uint8Array([mCla, ins, p1, p2, 0x80, 0x00, 0x00, 0x00]);
    const macInputParts: number[] = [
      ...Array.from(this.ssc),
      ...Array.from(paddedHeader),
      ...do87,
      ...do97,
    ];
    const macInput = new Uint8Array(macInputParts);
    console.log('[PassportNFC] SM MAC input hex:', CryptoUtils.bytesToHex(macInput), `(${macInput.length} bytes)`);
    console.log('[PassportNFC] SM k_mac hex:', CryptoUtils.bytesToHex(this.sessionK_mac));
    console.log('[PassportNFC] SM k_enc hex:', CryptoUtils.bytesToHex(this.sessionK_enc));
    console.log('[PassportNFC] SM SSC hex:', CryptoUtils.bytesToHex(this.ssc));
    const mac = CryptoUtils.computeMac(this.sessionK_mac, macInput);
    console.log('[PassportNFC] SM MAC result:', CryptoUtils.bytesToHex(mac));

    // DO8E: MAC
    const do8e = [0x8e, 0x08, ...Array.from(mac)];

    // Build final APDU
    const smData = [...do87, ...do97, ...do8e];
    // Only include outer Le when DO97 is present.
    const apdu =
      le !== null ? [mCla, ins, p1, p2, smData.length, ...smData, 0x00] : [mCla, ins, p1, p2, smData.length, ...smData];

    return apdu.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * SM-unprotect a response
   * Returns decrypted data and status word
   */
  private smUnprotect(responseHex: string): { data: Uint8Array; sw: string } {
    if (!this.sessionK_enc || !this.sessionK_mac || !this.ssc) {
      throw new Error('Session keys not established');
    }

    this.incrementSSC();

    // Strip final SW (last 4 hex chars = 2 bytes)
    const bodyHex = responseHex.slice(0, -4);
    const outerSw = responseHex.slice(-4);
    const body = CryptoUtils.hexToBytes(bodyHex);

    // Parse TLV objects from body
    let do87Bytes: Uint8Array | null = null;
    let do87Raw: number[] = []; // raw TLV bytes for MAC verification
    let do99Bytes: Uint8Array | null = null;
    let do99Raw: number[] = [];
    let do8eBytes: Uint8Array | null = null;

    let pos = 0;
    while (pos < body.length) {
      const tlvStart = pos;
      const tag = body[pos]!;
      pos++;

      // Parse length (BER-TLV)
      let len = body[pos]!;
      pos++;
      if (len === 0x81) {
        len = body[pos]!;
        pos++;
      } else if (len === 0x82) {
        len = (body[pos]! << 8) | body[pos + 1]!;
        pos += 2;
      }

      const value = body.slice(pos, pos + len);
      const rawTlv = Array.from(body.slice(tlvStart, pos + len));

      if (tag === 0x87) {
        do87Bytes = value;
        do87Raw = rawTlv;
      } else if (tag === 0x99) {
        do99Bytes = value;
        do99Raw = rawTlv;
      } else if (tag === 0x8e) {
        do8eBytes = value;
      }

      pos += len;
    }

    // Verify MAC
    if (!do8eBytes || do8eBytes.length !== 8) {
      throw new ReadError('SM_MAC_MISSING', 'Response MAC (DO8E) missing or invalid');
    }

    const macInput = new Uint8Array([...Array.from(this.ssc), ...do87Raw, ...do99Raw]);
    const computedMac = CryptoUtils.computeMac(this.sessionK_mac, macInput);
    if (CryptoUtils.bytesToHex(computedMac) !== CryptoUtils.bytesToHex(do8eBytes)) {
      throw new ReadError('SM_MAC_FAILED', 'Response MAC verification failed');
    }

    // Decrypt DO87 data if present (3DES-CBC, IV=zeros)
    let decrypted = new Uint8Array(0);
    if (do87Bytes && do87Bytes.length > 1) {
      // First byte is padding indicator (0x01), skip it
      const encData = do87Bytes.slice(1);
      const raw = CryptoUtils.des3DecryptCBC(this.sessionK_enc, new Uint8Array(8), encData);
      decrypted = new Uint8Array(CryptoUtils.removePadding(raw));
    }

    // SW from DO99 or outer SW
    let sw = outerSw;
    if (do99Bytes && do99Bytes.length === 2) {
      sw = CryptoUtils.bytesToHex(do99Bytes);
    }

    return { data: decrypted, sw };
  }

  // ─── AES Secure Messaging (for PACE with AES ciphers) ───

  /**
   * SM-protect an APDU using AES-CBC + AES-CMAC.
   * SSC is 16 bytes for AES SM.
   */
  private smProtectAES(
    cla: number,
    ins: number,
    p1: number,
    p2: number,
    data: number[],
    le: number | null
  ): string {
    if (!this.sessionK_enc || !this.sessionK_mac || !this.ssc) {
      throw new Error('Session keys not established');
    }

    this.incrementSSC();

    const mCla = cla | 0x0c;

    // DO87: AES-CBC encrypted command data
    const do87: number[] = [];
    if (data.length > 0) {
      const padded = CryptoUtils.iso9797PadAES(new Uint8Array(data));
      // IV for AES SM = AES-ECB(K_enc, SSC)
      const iv = this.aesSmIV();
      const encrypted = CryptoUtils.aesEncryptCBC(padded, this.sessionK_enc, iv);
      const encBytes = Array.from(encrypted);
      const contentLen = encBytes.length + 1;
      if (contentLen < 0x80) {
        do87.push(0x87, contentLen, 0x01, ...encBytes);
      } else if (contentLen < 0x100) {
        do87.push(0x87, 0x81, contentLen, 0x01, ...encBytes);
      } else {
        do87.push(0x87, 0x82, (contentLen >> 8) & 0xff, contentLen & 0xff, 0x01, ...encBytes);
      }
    }

    // DO97: expected response length
    const do97: number[] = [];
    if (le !== null) {
      do97.push(0x97, 0x01, le);
    }

    // MAC input (ICAO 9303 / TR-03110): SSC || pad(CLA' INS P1 P2) || DO87 || DO97
    // The command header MUST be padded separately to a 16-byte block boundary
    // (ISO 9797-1 Method 2, AES block size) before concatenation with the data objects.
    // CMAC then applies its own finalization over the whole concatenation.
    const paddedHeader = new Uint8Array(16);
    paddedHeader[0] = mCla;
    paddedHeader[1] = ins;
    paddedHeader[2] = p1;
    paddedHeader[3] = p2;
    paddedHeader[4] = 0x80;
    // bytes 5-15 already 0x00
    const macInputParts = new Uint8Array([
      ...Array.from(this.ssc),
      ...Array.from(paddedHeader),
      ...do87,
      ...do97,
    ]);
    const mac = CryptoUtils.aesCmac(this.sessionK_mac, macInputParts);
    const macTruncated = mac.slice(0, 8);

    const do8e = [0x8e, 0x08, ...Array.from(macTruncated)];
    const smData = [...do87, ...do97, ...do8e];
    // Only include outer Le when DO97 is present.
    const apdu =
      le !== null ? [mCla, ins, p1, p2, smData.length, ...smData, 0x00] : [mCla, ins, p1, p2, smData.length, ...smData];

    return apdu.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * SM-unprotect a response using AES-CBC + AES-CMAC.
   */
  private smUnprotectAES(responseHex: string): { data: Uint8Array; sw: string } {
    if (!this.sessionK_enc || !this.sessionK_mac || !this.ssc) {
      throw new Error('Session keys not established');
    }

    this.incrementSSC();

    const bodyHex = responseHex.slice(0, -4);
    const outerSw = responseHex.slice(-4);
    const body = CryptoUtils.hexToBytes(bodyHex);

    let do87Bytes: Uint8Array | null = null;
    let do87Raw: number[] = [];
    let do99Bytes: Uint8Array | null = null;
    let do99Raw: number[] = [];
    let do8eBytes: Uint8Array | null = null;

    let pos = 0;
    while (pos < body.length) {
      const tlvStart = pos;
      const tag = body[pos]!;
      pos++;
      let len = body[pos]!;
      pos++;
      if (len === 0x81) {
        len = body[pos]!;
        pos++;
      } else if (len === 0x82) {
        len = (body[pos]! << 8) | body[pos + 1]!;
        pos += 2;
      }
      const value = body.slice(pos, pos + len);
      const rawTlv = Array.from(body.slice(tlvStart, pos + len));
      if (tag === 0x87) {
        do87Bytes = value;
        do87Raw = rawTlv;
      } else if (tag === 0x99) {
        do99Bytes = value;
        do99Raw = rawTlv;
      } else if (tag === 0x8e) {
        do8eBytes = value;
      }
      pos += len;
    }

    if (!do8eBytes || do8eBytes.length !== 8) {
      throw new ReadError('SM_MAC_MISSING', 'AES SM response MAC (DO8E) missing or invalid');
    }

    const macInput = new Uint8Array([...Array.from(this.ssc), ...do87Raw, ...do99Raw]);
    const computedMac = CryptoUtils.aesCmac(this.sessionK_mac, macInput).slice(0, 8);
    if (CryptoUtils.bytesToHex(computedMac) !== CryptoUtils.bytesToHex(do8eBytes)) {
      throw new ReadError('SM_MAC_FAILED', 'AES SM response MAC verification failed');
    }

    let decrypted = new Uint8Array(0);
    if (do87Bytes && do87Bytes.length > 1) {
      const encData = do87Bytes.slice(1);
      const iv = this.aesSmIV();
      const raw = CryptoUtils.aesDecryptCBC(encData, this.sessionK_enc, iv);
      decrypted = new Uint8Array(CryptoUtils.removePaddingAES(raw));
    }

    let sw = outerSw;
    if (do99Bytes && do99Bytes.length === 2) {
      sw = CryptoUtils.bytesToHex(do99Bytes);
    }
    return { data: decrypted, sw };
  }

  /** Compute AES SM IV = AES-ECB(K_enc, SSC) */
  private aesSmIV(): Uint8Array {
    const algo = this.sessionK_enc!.length === 32 ? 'aes-256-ecb' : 'aes-128-ecb';
    const Crypto = require('react-native-quick-crypto');
    const cipher = Crypto.createCipheriv(
      algo,
      new Uint8Array(this.sessionK_enc!),
      new Uint8Array(0)
    );
    cipher.setAutoPadding(false);
    const a = cipher.update(new Uint8Array(this.ssc!)) as Uint8Array;
    const b = cipher.final() as Uint8Array;
    const out = new Uint8Array(a.length + b.length);
    out.set(a, 0);
    out.set(b, a.length);
    return out;
  }

  /**
   * Send an SM-protected APDU and unwrap the response.
   * Dispatches to 3DES or AES SM based on the active cipher.
   */
  private async smTransceive(
    cla: number,
    ins: number,
    p1: number,
    p2: number,
    data: number[],
    le: number | null
  ): Promise<{ success: boolean; data: Uint8Array; sw: string }> {
    const apdu =
      this.smCipher === 'AES'
        ? this.smProtectAES(cla, ins, p1, p2, data, le)
        : this.smProtect(cla, ins, p1, p2, data, le);
    const responseHex = await this.transceive(apdu);

    if (responseHex.length <= 4) {
      return { success: responseHex === '9000', data: new Uint8Array(0), sw: responseHex };
    }

    const result =
      this.smCipher === 'AES' ? this.smUnprotectAES(responseHex) : this.smUnprotect(responseHex);
    const success = result.sw === '9000';
    return { success, data: result.data, sw: result.sw };
  }

  /**
   * Transceive APDU to tag
   */
  /** Convenience wrapper: transceive with number[] in/out */
  private async transceiveBytes(apdu: number[]): Promise<number[]> {
    const hex = apdu.map(b => b.toString(16).padStart(2, '0')).join('');
    const respHex = await this.transceive(hex);
    const resp: number[] = [];
    for (let i = 0; i < respHex.length; i += 2) {
      resp.push(parseInt(respHex.substring(i, i + 2), 16));
    }
    return resp;
  }

  private async transceive(apdu: string): Promise<string> {
    if (!this.isoDep) {
      throw new ReadError('NFC_NOT_INITIALIZED', 'NFC not initialized');
    }

    console.log('[PassportNFC] >> TX:', apdu);
    const apduBytes = this.hexToBytes(apdu);
    let response: number[] = [];

    // Use technology handler first (cross-platform); fall back to platform-specific APIs.
    if ((NfcManager as any).isoDepHandler?.transceive) {
      response = await (NfcManager as any).isoDepHandler.transceive(apduBytes);
    } else if (typeof (NfcManager as any).transceive === 'function') {
      response = await (NfcManager as any).transceive(apduBytes);
    } else if (typeof (NfcManager as any).sendCommandAPDUIOS === 'function') {
      const iosResp = await (NfcManager as any).sendCommandAPDUIOS(apduBytes);
      response = [...(iosResp?.response ?? []), iosResp?.sw1 ?? 0x6f, iosResp?.sw2 ?? 0x00];
    } else {
      throw new ReadError(
        'NFC_TRANSCEIVE_UNAVAILABLE',
        'No NFC transceive API available for current platform'
      );
    }

    const hex = Array.from(response)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    console.log('[PassportNFC] << RX:', hex);
    return hex;
  }

  /**
   * Build APDU command
   */
  private buildApdu(
    cla: number,
    ins: number,
    p1: number,
    p2: number,
    le: number,
    data: number[] = []
  ): string {
    // Correct APDU structure: CLA INS P1 P2 [Lc Data] [Le]
    const cmd = [cla, ins, p1, p2];

    if (data.length > 0) {
      cmd.push(data.length); // Lc = number of data bytes
      cmd.push(...data);
    }

    if (le > 0) {
      cmd.push(le); // Le = expected response length
    }

    return cmd.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Check if APDU response is successful (SW1=90, SW2=00)
   */
  private isSuccess(response: string): boolean {
    return response.endsWith('9000');
  }

  /**
   * Cleanup NFC resources
   */
  async cleanup(): Promise<void> {
    try {
      if (this.isoDep) {
        await NfcManager.cancelTechnologyRequest();
        this.isoDep = null;
      }
      this.sessionK_enc = null;
      this.sessionK_mac = null;
      this.ssc = null;
      this.smCipher = '3DES';
    } catch (error) {
      console.error('[PassportNFC] Cleanup failed:', error);
    }
  }

  /**
   * Convert hex string to byte array
   */
  private hexToBytes(hex: string): number[] {
    const bytes: number[] = [];
    for (let i = 0; i < hex.length; i += 2) {
      bytes.push(parseInt(hex.substring(i, i + 2), 16));
    }
    return bytes;
  }
}

// Module-level flag used by AppLockContext to suppress the app-lock trigger
// while the iOS system NFC sheet is in the foreground (AppState goes inactive
// during the scan, which would otherwise trigger a lock prompt).
let nfcScanActive = false;
export const isNfcScanInProgress = (): boolean => nfcScanActive;

// Export singleton instance
export const passportNfcService = new PassportNfcService();

export class ReadError extends Error {
  code: string;
  details?: any;

  constructor(code: string, message: string, details?: any) {
    super(message);
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, ReadError.prototype);
  }
}

// ─── PACE helpers (module-level) ───

/** Generate a random EC private key in [1, n-1] using native PRNG (Hermes-safe). */
function generateECPrivateKey(curve: any): Uint8Array {
  const order = curve.CURVE.n as bigint;
  const byteLen = Math.ceil(curve.CURVE.nBitLength / 8);
  for (;;) {
    const priv = randomBytes(byteLen) as Buffer;
    const scalar = bytesToBigInt(new Uint8Array(priv));
    if (scalar >= 1n && scalar < order) return new Uint8Array(priv);
  }
}

/**
 * Strip leading 0x00 bytes from a DH public key.
 * BSI TR-03110 §9.4.1: "The minimum number of octets SHALL be used,
 * i.e. leading octets of value 0x00 MUST NOT be used."
 */
function dhStripKey(buf: Buffer): number[] {
  let i = 0;
  while (i < buf.length - 1 && buf[i] === 0) i++;
  return Array.from(buf.slice(i));
}

/** Left-pad a DH secret Buffer to exactly `len` bytes and return as Uint8Array */
function dhPadBytes(buf: Buffer, len: number): Uint8Array {
  const out = new Uint8Array(len);
  const src = new Uint8Array(buf);
  out.set(src, len - src.length);
  return out;
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  if (hex.length === 0) return 0n;
  return BigInt(`0x${hex}`);
}

/** BSI TR-03110-3 §A.2.4: 7F49 { 06 [OID], tag [pubKey] } */
function buildAuthTokenInput(oid: number[], tag: number, pubKey: number[]): number[] {
  const oidDO = [0x06, ...berLen(oid.length), ...oid];
  const pkDO = [tag, ...berLen(pubKey.length), ...pubKey];
  const inner = [...oidDO, ...pkDO];
  return [0x7f, 0x49, ...berLen(inner.length), ...inner];
}

function berLen(length: number): number[] {
  if (length < 0x80) return [length];
  if (length < 0x100) return [0x81, length];
  return [0x82, (length >> 8) & 0xff, length & 0xff];
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

/**
 * Resolve a @noble/curves EC curve by name.
 * Supports secp and brainpool curves used in eMRTD PACE.
 */
function getNobleECCurve(name: string): any {
  try {
    // @noble/curves v2: NIST curves in "nist.js", brainpool in "misc.js"
    switch (name) {
      case 'secp256r1':
        return require('@noble/curves/nist.js').p256;
      case 'secp384r1':
        return require('@noble/curves/nist.js').p384;
      case 'secp521r1':
        return require('@noble/curves/nist.js').p521;
      case 'brainpoolP256r1':
        return require('@noble/curves/misc.js').brainpoolP256r1;
      case 'brainpoolP384r1':
        return require('@noble/curves/misc.js').brainpoolP384r1;
      case 'brainpoolP512r1':
        return require('@noble/curves/misc.js').brainpoolP512r1;
      default:
        return null;
    }
  } catch {
    return null;
  }
}
