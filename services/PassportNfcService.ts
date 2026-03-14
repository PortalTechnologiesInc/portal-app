/**
 * Passport NFC Service
 * Implements BAC (Basic Access Control) protocol and data group reading
 * Uses ICAO 9303 eMRTD standard
 */

import NfcManager, { NfcTech } from 'react-native-nfc-manager';
import { deriveBacKeys, MrzData } from '@/utils/mrz';
import * as CryptoUtils from '@/utils/crypto';

/** ICAO 9303 EF File Identifiers */
function dgToFid(dgNumber: number): [number, number] {
  // EF.COM = 0x1E, EF.SOD = 0x1D, DG1 = 0x1F, DG2..DG16 = 0x01..0x0F
  if (dgNumber === 0x1e) return [0x01, 0x1e]; // EF.COM
  if (dgNumber === 0x1d) return [0x01, 0x1d]; // EF.SOD
  if (dgNumber === 1) return [0x01, 0x1f];     // DG1
  // DGn (n>=2) → 0x01, n-1
  return [0x01, dgNumber - 1];
}

export interface PassportData {
  mrz: MrzData;
  dg1Raw: string; // Hex string of DG1 (personal data)
  dg2Raw: string; // Hex string of DG2 (face image)
  sodRaw: string; // Hex string of SOD (security object)
  activeAuthSupported: boolean;
  readTimestamp: Date;
}

export interface ReadError {
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
  private ssc: Uint8Array | null = null; // Send Sequence Counter (8 bytes, big-endian)

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
  async startReading(mrzData: MrzData): Promise<PassportData> {
    if (!this.nfcEnabled) {
      await this.initialize();
    }

    try {
      // Request IsoDep technology for smart card communication
      await NfcManager.requestTechnology(NfcTech.IsoDep);

      // Increase IsoDep timeout to 10s (default 2s can drop during EXTERNAL AUTH)
      try { await (NfcManager as any).setTimeout(10000); } catch (_) {}

      const tag = await NfcManager.getTag();
      if (!tag) {
        throw new ReadError('TAG_NOT_FOUND', 'No NFC tag detected');
      }

      this.isoDep = tag;

      // Perform BAC authentication
      const bacKeys = await this.bacAuth(mrzData);

      // Read data groups
      const dg1Raw = await this.readDataGroup(0x01); // DG1 = MRZ data
      const dg2Raw = await this.readDataGroup(0x02); // DG2 = face image
      const sodRaw = await this.readDataGroup(0x1d); // SOD = security object

      // Check if Active Authentication is supported
      const activeAuthSupported = await this.checkActiveAuth();

      return {
        mrz: mrzData,
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
    console.log('[PassportNFC] MRZ seed string:', JSON.stringify(bacSeed), `(${bacSeed.length} chars)`);
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
    console.log('[PassportNFC] k_enc_raw len:', k_enc_raw.length, 'k_mac_raw len:', k_mac_raw.length);

    // Convert keys to 24-byte 3DES keys (two-key 3DES: K1 K2 K1)
    const k_enc_3des = CryptoUtils.expand16To24Bytes(k_enc_raw);
    const k_mac_3des = CryptoUtils.expand16To24Bytes(k_mac_raw);
    console.log('[PassportNFC] k_enc_3des len:', k_enc_3des.length, 'k_mac_3des len:', k_mac_3des.length);

    // 4. Build S = RND.IFD || RND.IC || K.IFD
    const s = new Uint8Array(rndIfd.length + rndIc.length + kifd.length);
    s.set(rndIfd, 0);
    s.set(rndIc, rndIfd.length);
    s.set(kifd, rndIfd.length + rndIc.length);
    console.log('[PassportNFC] S len:', s.length, 'rndIc:', Array.from(rndIc).map(b=>b.toString(16).padStart(2,'0')).join(''));

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

    const externalAuth = this.buildApdu(
      0x00,
      0x82,
      0x00,
      0x00,
      0,  // No Le — avoid case-4 APDU rejection by some chips
      Array.from(externalAuthData)
    );
    console.log('[PassportNFC] EXTERNAL AUTH APDU len:', externalAuth.length / 2, 'bytes');

    let authResp: string;
    try {
      authResp = await this.transceive(externalAuth);
      console.log('[PassportNFC] EXTERNAL AUTH RX:', authResp);
    } catch (e: any) {
      // Log the raw exception to distinguish NFC drop vs protocol error
      console.log('[PassportNFC] EXTERNAL AUTH transceive threw:', e?.message, e?.code, JSON.stringify(e));
      throw new ReadError('BAC_AUTH_FAILED', 'BAC authentication failed - passport rejected credentials');
    }

    if (!this.isSuccess(authResp!)) {
      const sw = authResp!.slice(-4);
      console.log('[PassportNFC] EXTERNAL AUTH bad SW:', sw);
      throw new ReadError('BAC_AUTH_FAILED', `BAC authentication failed: SW=${sw}`);
    }

    // Parse EXTERNAL AUTHENTICATE response (40 data bytes + 9000)
    const authData = authResp!.slice(0, -4); // strip SW
    if (authData.length !== 80) { // 40 bytes = 80 hex chars
      throw new ReadError('BAC_AUTH_FAILED', `Unexpected auth response length: ${authData.length / 2} bytes`);
    }

    const eIc = CryptoUtils.hexToBytes(authData.substring(0, 64));  // 32 bytes
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
    const sessionK_enc = CryptoUtils.expand16To24Bytes(sessionKeys.k_enc);
    const sessionK_mac = CryptoUtils.expand16To24Bytes(sessionKeys.k_mac);

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

  /**
   * Read a Data Group (DG) from the passport chip using Secure Messaging
   */
  private async readDataGroup(dgNumber: number): Promise<string> {
    const fid = dgToFid(dgNumber);
    console.log(`[PassportNFC] Reading DG${dgNumber}, FID: ${fid.map(b => b.toString(16).padStart(2, '0')).join(' ')}`);

    // SM-wrapped SELECT EF by FID (P1=0x02 select by EF id, P2=0x0C no FCI)
    const selectResp = await this.smTransceive(0x00, 0xa4, 0x02, 0x0c, fid, null);
    if (!selectResp.success) {
      throw new ReadError(`DG${dgNumber}_SELECT_FAILED`, `Failed to select DG${dgNumber}: SW=${selectResp.sw}`);
    }

    // Read binary in chunks with SM
    const CHUNK_SIZE = 0xe0; // 224 bytes — safe with SM overhead
    let buffer = new Uint8Array(0);
    let offset = 0;
    let totalLength = -1;

    while (true) {
      const p1 = (offset >> 8) & 0xff;
      const p2 = offset & 0xff;

      const readResp = await this.smTransceive(0x00, 0xb0, p1, p2, [], CHUNK_SIZE);
      if (!readResp.success) {
        // 6B00 or 6282 can mean end of file
        if (readResp.sw === '6b00' || readResp.sw === '6282') break;
        throw new ReadError(`DG${dgNumber}_READ_FAILED`, `Failed to read DG${dgNumber} at offset ${offset}: SW=${readResp.sw}`);
      }

      const chunk = readResp.data;
      // Append chunk to buffer
      const newBuf = new Uint8Array(buffer.length + chunk.length);
      newBuf.set(buffer, 0);
      newBuf.set(chunk, buffer.length);
      buffer = newBuf;

      // After first read, parse TLV header to get total length
      if (totalLength < 0 && buffer.length >= 2) {
        totalLength = this.parseTlvTotalLength(buffer);
        console.log(`[PassportNFC] DG${dgNumber} total TLV length: ${totalLength}`);
      }

      offset += chunk.length;

      // Stop conditions
      if (totalLength >= 0 && offset >= totalLength) break;
      if (chunk.length < CHUNK_SIZE) break;
    }

    console.log(`[PassportNFC] DG${dgNumber} read successful (${buffer.length} bytes)`);
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
   * Check if Active Authentication is supported
   */
  private async checkActiveAuth(): Promise<boolean> {
    // AA detection via EF.DG15 presence — try SM-wrapped select
    try {
      const resp = await this.smTransceive(0x00, 0xa4, 0x02, 0x0c, [0x01, 0x0f], null);
      return resp.success;
    } catch {
      return false;
    }
  }

  // ─── Secure Messaging (ICAO 9303) ───

  /**
   * Increment SSC (8-byte big-endian counter)
   */
  private incrementSSC(): void {
    if (!this.ssc) throw new Error('SSC not initialized');
    for (let i = 7; i >= 0; i--) {
      this.ssc[i] = (this.ssc[i]! + 1) & 0xff;
      if (this.ssc[i] !== 0) break; // no carry
    }
  }

  /**
   * SM-protect an APDU command
   * Returns the wrapped APDU hex string
   */
  private smProtect(cla: number, ins: number, p1: number, p2: number, data: number[], le: number | null): string {
    if (!this.sessionK_enc || !this.sessionK_mac || !this.ssc) {
      throw new Error('Session keys not established');
    }

    this.incrementSSC();

    const mCla = cla | 0x0c;

    // DO87: encrypted command data
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

    // MAC input: SSC || padded(mCla||INS||P1||P2) || DO87 || DO97
    const cmdHeader = CryptoUtils.iso9797Pad(new Uint8Array([mCla, ins, p1, p2]));
    const macInputParts: number[] = [...Array.from(this.ssc), ...Array.from(cmdHeader), ...do87, ...do97];
    // computeMac applies iso9797Pad internally
    const mac = CryptoUtils.computeMac(this.sessionK_mac, new Uint8Array(macInputParts));

    // DO8E: MAC
    const do8e = [0x8e, 0x08, ...Array.from(mac)];

    // Build final APDU
    const smData = [...do87, ...do97, ...do8e];
    const apdu = [mCla, ins, p1, p2, smData.length, ...smData, 0x00];

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

    // Decrypt DO87 data if present
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

  /**
   * Send an SM-protected APDU and unwrap the response
   */
  private async smTransceive(
    cla: number, ins: number, p1: number, p2: number,
    data: number[], le: number | null
  ): Promise<{ success: boolean; data: Uint8Array; sw: string }> {
    const apdu = this.smProtect(cla, ins, p1, p2, data, le);
    const responseHex = await this.transceive(apdu);

    // If response is just a SW (4 hex chars), no SM wrapping to undo
    if (responseHex.length <= 4) {
      return { success: responseHex === '9000', data: new Uint8Array(0), sw: responseHex };
    }

    const result = this.smUnprotect(responseHex);
    const success = result.sw === '9000';
    return { success, data: result.data, sw: result.sw };
  }

  /**
   * Transceive APDU to tag
   */
  private async transceive(apdu: string): Promise<string> {
    if (!this.isoDep) {
      throw new ReadError('NFC_NOT_INITIALIZED', 'NFC not initialized');
    }

    console.log('[PassportNFC] >> TX:', apdu);
    const apduBytes = this.hexToBytes(apdu);
    const response = await NfcManager.transceive(apduBytes);

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
   * Generate random bytes
   */
  private randomBytes(length: number): Uint8Array {
    return CryptoUtils.randomBytes(length);
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
