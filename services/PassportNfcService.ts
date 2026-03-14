/**
 * Passport NFC Service
 * Implements BAC (Basic Access Control) protocol and data group reading
 * Uses ICAO 9303 eMRTD standard
 */

import NfcManager, { NfcTech } from 'react-native-nfc-manager';
import { deriveBacKeys, MrzData } from '@/utils/mrz';
import * as CryptoUtils from '@/utils/crypto';

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
  private sessionCounter: number = 0;

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

    // Extract session keys from response (if available)
    // For now, we'll use the keys derived from BAC
    console.log('[PassportNFC] BAC authentication successful');

    // Store session keys for Secure Messaging
    this.sessionK_enc = k_enc_3des;
    this.sessionK_mac = k_mac_3des;

    return { k_enc: k_enc_3des, k_mac: k_mac_3des };
  }

  /**
   * Read a Data Group (DG) from the passport chip
   * Secure Messaging: encrypt + MAC
   */
  private async readDataGroup(dgNumber: number): Promise<string> {
    // SELECT MF
    await this.selectMF();

    // SELECT eMRTD application
    const selectEMrtd = this.buildApdu(0x00, 0xa4, 0x01, 0x0c, 0, [0x01, 0x1f]);
    await this.transceive(selectEMrtd);

    // Read EF.DG (without secure messaging for now)
    const fid = dgNumber;
    const readApdu = this.buildApdu(0x00, 0xb0, 0x9c, fid, 0, []);

    const response = await this.transceive(readApdu);

    if (!this.isSuccess(response)) {
      throw new ReadError(`DG${dgNumber}_READ_FAILED`, `Failed to read data group ${dgNumber}`);
    }

    // Remove SW1SW2 status bytes
    const data = response.substring(0, response.length - 4);
    console.log(
      `[PassportNFC] DG${dgNumber} read successful (${Math.ceil(data.length / 2)} bytes)`
    );

    return data;
  }

  /**
   * Check if Active Authentication is supported
   */
  private async checkActiveAuth(): Promise<boolean> {
    try {
      // Try to select AID for Active Authentication
      const aaAid = this.buildApdu(0x00, 0xa4, 0x04, 0x0c, 3, [0x93, 0x4f, 0x43]);
      const resp = await this.transceive(aaAid);
      return this.isSuccess(resp);
    } catch {
      return false;
    }
  }

  /**
   * SELECT MF (Master File)
   */
  private async selectMF(): Promise<void> {
    const selectApdu = this.buildApdu(0x00, 0xa4, 0x00, 0x0c, 0, []);
    const resp = await this.transceive(selectApdu);
    if (!this.isSuccess(resp)) {
      throw new ReadError('SELECT_MF_FAILED', 'Failed to select MF');
    }
  }

  /**
   * Apply Secure Messaging (encryption + MAC)
   * For BAC authenticated sessions, wrap APDU with:
   * - DO '87': Encrypted data (if any)
   * - DO '97': LE length
   * - DO '8E': MAC (8 bytes)
   */
  private applySecureMessaging(apdu: string): string {
    // TODO: Implement full Secure Messaging
    // For now, return APDU as-is (no encryption)
    // This should only work for DG reads without encryption
    return apdu;
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
