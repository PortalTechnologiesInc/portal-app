/**
 * Passport NFC Service
 * Implements BAC (Basic Access Control) protocol and data group reading
 * Uses ICAO 9303 eMRTD standard
 */

import NfcManager, { NfcTech } from 'react-native-nfc-manager';
import * as Crypto from 'react-native-quick-crypto';
import { deriveBacKeys, type MrzData } from '@/utils/mrz';

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
  private k_enc: string = '';
  private k_mac: string = '';
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

    const { k_enc, k_mac, mrzKey } = deriveBacKeys(mrzData);

    try {
      // Request IsoDep technology for smart card communication
      await NfcManager.requestTechnology(NfcTech.IsoDep);

      const tag = await NfcManager.getTag();
      if (!tag) {
        throw new ReadError('TAG_NOT_FOUND', 'No NFC tag detected');
      }

      this.isoDep = tag;

      // Perform BAC authentication
      await this.bacAuth(mrzData, k_enc, k_mac);

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
  private async bacAuth(mrzData: MrzData, k_enc: string, k_mac: string): Promise<void> {
    const tag = this.isoDep;

    // 1. SELECT MRTD application (A0 00 00 02 47 10 01)
    const selectMrtd = this.buildApdu(
      0x00,
      0xa4,
      0x04,
      0x0c,
      7,
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
    const rndIc = challengeResp.substring(0, 16); // 16 hex chars = 8 bytes

    // 3. Generate RND.IFD (8 bytes random) and K.IFD (16 bytes random)
    const rndIfd = this.randomBytes(8)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    const kifd = this.randomBytes(16)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // 4. Build S = RND.IFD || RND.IC || K.IFD
    const s = rndIfd + rndIc + kifd;

    // 5. E_IFD = 3DES-CBC-encrypt(K_enc, S)
    const eIfd = this.desEncrypt(k_enc, s);

    // 6. M_IFD = MAC(K_mac, E_IFD)
    const mIfd = this.computeMac(k_mac, eIfd);

    // 7. EXTERNAL AUTHENTICATE (00 82 00 00 28 || E_IFD || M_IFD)
    const externalAuth = this.buildApdu(
      0x00,
      0x82,
      0x00,
      0x00,
      40 + 8, // 40 chars (20 bytes) E_IFD + 8 chars (4 bytes) MAC
      this.hexToBytes(eIfd + mIfd)
    );
    const authResp = await this.transceive(externalAuth);

    if (!this.isSuccess(authResp)) {
      throw new ReadError('BAC_AUTH_FAILED', 'BAC authentication failed');
    }

    // Extract session keys from response (if available)
    // For now, we'll use the keys derived from BAC
    console.log('[PassportNFC] BAC authentication successful');
  }

  /**
   * Read a Data Group (DG) from the passport chip
   * Secure Messaging: encrypt + MAC
   */
  private async readDataGroup(dgNumber: number): Promise<string> {
    // SELECT MF
    await this.selectMF();

    // SELECT eMRTD application
    const selectEMrtd = this.buildApdu(0x00, 0xa4, 0x01, 0x0c, 2, [0x01, 0x1f]);
    await this.transceive(selectEMrtd);

    // Read EF.DG
    const fid = dgNumber;
    const readApdu = this.buildApdu(0x00, 0xb0, 0x9c, fid, 0, []);

    // Add secure messaging (if session established)
    const securedApdu = this.applySecureMessaging(readApdu);

    const response = await this.transceive(securedApdu);

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
   */
  private applySecureMessaging(apdu: string): string {
    // TODO: Implement full Secure Messaging
    // For now, return APDU as-is (no encryption)
    return apdu;
  }

  /**
   * Transceive APDU to tag
   */
  private async transceive(apdu: string): Promise<string> {
    if (!this.isoDep) {
      throw new ReadError('NFC_NOT_INITIALIZED', 'NFC not initialized');
    }

    const apduBytes = this.hexToBytes(apdu);
    const response = await NfcManager.transceive(apduBytes);

    // Convert response to hex string
    const hex = Array.from(response)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

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
    const cmd = [cla, ins, p1, p2, ...data];

    // If le > 0, add it
    if (le > 0) {
      cmd.push(le);
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
  private randomBytes(length: number): number[] {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return Array.from(bytes);
  }

  /**
   * 3DES encryption (for BAC)
   */
  private desEncrypt(key: string, data: string): string {
    // TODO: Implement 3DES-CBC encryption
    // For now, return data as-is (placeholder)
    console.warn('[PassportNFC] DES encryption not fully implemented - returning plaintext');
    return data;
  }

  /**
   * Compute MAC for BAC
   */
  private computeMac(key: string, data: string): string {
    // TODO: Implement MAC computation
    // For now, return placeholder
    console.warn('[PassportNFC] MAC not fully implemented - returning placeholder');
    return '00000000'; // 4 bytes
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

  constructor(code: string, message: string, details?: any) {
    super(message);
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, ReadError.prototype);
  }
}
