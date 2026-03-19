/**
 * MRZ (Machine Readable Zone) utilities for passport/ID card parsing
 * Supports TD1 (3-line ID cards) and TD3 (2-line passports) formats per ICAO 9303
 */

export interface MrzData {
  documentType: 'P' | 'I'; // Passport (P) or ID card (I)
  documentNumber: string;
  documentNumberCheckDigit: string;
  nationality: string;
  dateOfBirth: string;
  dateOfBirthCheckDigit: string;
  sex: 'M' | 'F' | '<';
  expiryDate: string;
  expiryDateCheckDigit: string;
  surname: string;
  givenNames: string;
  personalNumber?: string;
  checkDigitsValid: boolean;
  lines: string[];
  format: 'TD1' | 'TD3';
}

/**
 * Calculate MRZ check digit using ICAO 9303 7-3-1 weighting algorithm.
 * Each character is mapped to a value (0-9 for digits, A=10..Z=35, <=0),
 * multiplied by the repeating weight pattern 7,3,1, summed, then mod 10.
 */
export function calculateCheckDigit(value: string): string {
  const weights = [7, 3, 1];
  let sum = 0;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    let val: number;
    if (ch >= '0' && ch <= '9') {
      val = ch.charCodeAt(0) - 48; // '0'=0 .. '9'=9
    } else if (ch >= 'A' && ch <= 'Z') {
      val = ch.charCodeAt(0) - 55; // 'A'=10 .. 'Z'=35
    } else {
      val = 0; // '<' and any filler
    }
    sum += val * weights[i % 3];
  }
  return (sum % 10).toString();
}

/**
 * Validate a single MRZ check digit
 */
function validateCheckDigit(checkValue: string, computed: string): boolean {
  return checkValue === computed;
}

/**
 * Parse TD1 (3 lines × 30 chars each) - ID cards
 * Per ICAO 9303 Part 5:
 *
 * Line 1 (30 chars):
 *   [0-1]  Document type (e.g. "I<")
 *   [2-4]  Issuing country (3 chars)
 *   [5-13] Document number (9 chars)
 *   [14]   Document number check digit
 *   [15-29] Optional data 1 (15 chars)
 *
 * Line 2 (30 chars):
 *   [0-5]  Date of birth (YYMMDD)
 *   [6]    DOB check digit
 *   [7]    Sex (M/F/<)
 *   [8-13] Date of expiry (YYMMDD)
 *   [14]   Expiry check digit
 *   [15-17] Nationality (3 chars)
 *   [18-28] Optional data 2 (11 chars)
 *   [29]   Composite check digit
 *
 * Line 3 (30 chars):
 *   [0-29] Name: SURNAME<<GIVEN<NAMES<<<...
 */
function parseTD1(lines: string[]): MrzData | null {
  if (lines.length < 3) return null;

  const line1 = lines[0].trim();
  const line2 = lines[1].trim();
  const line3 = lines[2].trim();

  if (line1.length < 30 || line2.length < 30 || line3.length < 30) return null;

  // Line 1
  const documentNumber = line1.substring(5, 14);
  const documentNumberCheckDigit = line1[14];

  // Line 2
  const dateOfBirth = line2.substring(0, 6);
  const dateOfBirthCheckDigit = line2[6];
  const sex = line2[7] as 'M' | 'F' | '<';
  if (!['M', 'F', '<'].includes(sex)) return null;
  const expiryDate = line2.substring(8, 14);
  const expiryDateCheckDigit = line2[14];
  const nationality = line2.substring(15, 18).replace(/<+$/g, '');

  // Line 3: name
  const nameParts = line3.split('<<');
  const surname = (nameParts[0] || '').replace(/<+/g, ' ').trim();
  const givenNames = (nameParts.slice(1).join(' ') || '').replace(/<+/g, ' ').trim() || '<';

  // Optional data
  const optional1 = line1.substring(15, 30);
  const optional2 = line2.substring(18, 29);
  const personalNumber = (optional1 + optional2).replace(/<+/g, ' ').trim() || undefined;

  // Validate check digits
  const docNumComputed = calculateCheckDigit(line1.substring(5, 14));
  const dobComputed = calculateCheckDigit(dateOfBirth);
  const expComputed = calculateCheckDigit(expiryDate);

  // Composite check digit (line2[29]) covers:
  //   line1[5..29] + line2[0..6] + line2[8..14] + line2[18..28]
  const compositeData =
    line1.substring(5, 30) +
    line2.substring(0, 7) +
    line2.substring(8, 15) +
    line2.substring(18, 29);
  const compositeCheck = line2[29];
  const compositeComputed = calculateCheckDigit(compositeData);

  const checkDigitsValid =
    validateCheckDigit(documentNumberCheckDigit, docNumComputed) &&
    validateCheckDigit(dateOfBirthCheckDigit, dobComputed) &&
    validateCheckDigit(expiryDateCheckDigit, expComputed) &&
    validateCheckDigit(compositeCheck, compositeComputed);

  return {
    documentType: 'I',
    documentNumber,
    documentNumberCheckDigit,
    nationality,
    dateOfBirth,
    dateOfBirthCheckDigit,
    sex,
    expiryDate,
    expiryDateCheckDigit,
    surname,
    givenNames,
    personalNumber,
    checkDigitsValid,
    lines,
    format: 'TD1',
  };
}

/**
 * Parse TD3 (2 lines, 44 chars each) - Passports
 * Line 1: P<COUNTRY<SURNAME<GIVEN_NAMES<<<<<<<<<<<<<<<<<<<<<<
 *          Document number (9) + check digit (1) + nationality (3) + DOB (6) + check digit (1) + sex (1) + expiry (6) + check digit (1) + optional personal number (14) + check digit (1)
 * Line 2: Document number (9) + check (1) + nationality (3) + DOB (6) + check (1) + sex (1) + expiry (6) + check (1) + optional (14) + check (1) + composite (1)
 */
function parseTD3(lines: string[]): MrzData | null {
  if (lines.length < 1) return null;

  const line1 = lines[0].trim();
  const line2 = lines[1]?.trim() || '';

  if (line1.length < 44) return null;

  // Line 1 structure
  // P (type) + C (check for P or I) + Country (3) + Surname (up to 39) + Given names
  const documentType = line1[0] as 'P' | 'I';
  if (documentType !== 'P') return null; // Only supporting passports for now

  const country = line1.substring(2, 5);
  const surnameEnd = line1.indexOf('<', 5);
  const surname = surnameEnd > 5 ? line1.substring(5, surnameEnd).replace(/<+/g, ' ') : '<';
  const givenNames =
    line1
      .substring(surnameEnd + 1)
      .replace(/<+/g, ' ')
      .trim() || '<';

  // Line 2 structure per ICAO 9303 TD3 (44 chars):
  // Doc number (9) + check (1) + Nationality (3) + DOB (6) + check (1) +
  // Sex (1) + Expiry (6) + check (1) + Optional data (14) + check (1) + Composite (1)
  const documentNumber = line2.substring(0, 9);
  const documentNumberCheckDigit = line2[9];
  const nationality = line2.substring(10, 13);
  const dateOfBirth = line2.substring(13, 19);
  const dateOfBirthCheckDigit = line2[19];
  const sex = line2[20] as 'M' | 'F' | '<';
  const expiryDate = line2.substring(21, 27);
  const expiryDateCheckDigit = line2[27];
  const personalNumber = line2.substring(28, 42) || undefined;

  // Validate sex
  if (!['M', 'F', '<'].includes(sex)) return null;

  // Validate check digits
  const docNumComputed = calculateCheckDigit(documentNumber);
  const dobComputed = calculateCheckDigit(dateOfBirth);
  const expComputed = calculateCheckDigit(expiryDate);

  const checkDigitsValid =
    validateCheckDigit(documentNumberCheckDigit, docNumComputed) &&
    validateCheckDigit(dateOfBirthCheckDigit, dobComputed) &&
    validateCheckDigit(expiryDateCheckDigit, expComputed);

  return {
    documentType: 'P',
    documentNumber,
    documentNumberCheckDigit,
    nationality,
    dateOfBirth,
    dateOfBirthCheckDigit,
    sex,
    expiryDate,
    expiryDateCheckDigit,
    surname,
    givenNames,
    personalNumber,
    checkDigitsValid,
    lines: [line1, line2],
    format: 'TD3',
  };
}

/**
 * Parse MRZ lines into structured data
 * Returns TD1 or TD3 format
 */
export function parseMrz(text: string): MrzData | null {
  const lines = text
    .split('\n')
    .map(l => l.trim().toUpperCase())
    .filter(l => l.length >= 28); // At least 28 chars to be considered MRZ

  if (lines.length === 0) return null;

  // Check for TD3 (passports - 2 lines, 44 chars)
  if (lines.length >= 2 && lines[0].length >= 44 && lines[0].startsWith('P<')) {
    return parseTD3(lines.slice(0, 2));
  }

  // Check for TD1 (ID cards - 3 lines, 30 chars)
  if (lines.length >= 3 && lines[0].length >= 30 && lines[0].length <= 36) {
    return parseTD1(lines.slice(0, 3));
  }

  return null;
}

/**
 * Check if text contains MRZ-like lines
 */
export function isMrzText(text: string): boolean {
  const lines = text
    .split('\n')
    .map(l => l.trim().toUpperCase())
    .filter(l => l.length > 0);

  // Look for MRZ-like lines (44 chars for passports, 30 for ID cards)
  // MRZ charset: A-Z, 0-9, < (space/padding)
  const mrzPattern = /^[A-Z0-9<]{30,44}$/;

  const hasValidLines = lines.some(l => mrzPattern.test(l));
  const hasMultipleLines = lines.length >= 2;

  return hasValidLines && hasMultipleLines;
}

/**
 * Derive BAC (Basic Access Control) keys from MRZ data
 * Uses ICAO 9303 BAC v2 protocol
 *
 * MRZ Key = SHA1(documentNumber + checkDigit + dateOfBirth + checkDigit + expiryDate + checkDigit)
 *
 * Key Derivation Function (KDF):
 * seed = SHA1(mrzKey)
 * K_enc = adjust_parity(SHA1(seed || 0x00000001)[0:16])  // 3DES key
 * K_mac = adjust_parity(SHA1(seed || 0x00000002)[0:16])  // 3DES MAC key
 */

export interface BacKeys {
  k_enc: string; // Hex string of 16 bytes (3DES encryption key seed)
  k_mac: string; // Hex string of 16 bytes (3DES MAC key seed)
  mrzKey: string; // Hex string of SHA1 hash
}

/**
 * Interface matching @getportal/mrz-scanner's MRZResult type.
 * Dates are YYYY-MM-DD, documentNumber has no < fillers.
 */
export interface MrzScannerResult {
  documentType: string;
  issuingCountry: string;
  lastName: string;
  firstName: string;
  documentNumber: string; // No < fillers
  nationality: string;
  dateOfBirth: string; // YYYY-MM-DD
  sex: string;
  expiryDate: string; // YYYY-MM-DD
  optionalData: string;
  checksumValid: boolean;
  format: 'TD1' | 'TD3';
}

/**
 * Convert YYYY-MM-DD → YYMMDD (take last 2 of year + MM + DD)
 */
export function dateToMrzFormat(isoDate: string): string {
  // "1990-08-06" → "900806", "2025-12-31" → "251231"
  const parts = isoDate.split('-');
  if (parts.length !== 3) throw new Error(`Invalid date format: ${isoDate}`);
  const yy = parts[0].slice(-2); // Last 2 digits of year
  return yy + parts[1] + parts[2];
}

/**
 * Pad document number to 9 chars with '<' filler (ICAO 9303 TD3 field width).
 * BAC key derivation requires the document number as it appears in the MRZ,
 * which is always 9 characters, right-padded with '<'.
 */
export function padDocumentNumber(docNum: string): string {
  return docNum.padEnd(9, '<');
}

/**
 * Convert MRZResult from @getportal/mrz-scanner into MrzData for BAC key derivation.
 * Handles:
 * - documentNumber padding (< filler to 9 chars)
 * - date format conversion (YYYY-MM-DD → YYMMDD)
 * - check digit computation
 */
export function mrzScannerResultToMrzData(result: MrzScannerResult): MrzData {
  const docNum = padDocumentNumber(result.documentNumber);
  const dob = dateToMrzFormat(result.dateOfBirth);
  const exp = dateToMrzFormat(result.expiryDate);

  const docNumCheck = calculateCheckDigit(docNum);
  const dobCheck = calculateCheckDigit(dob);
  const expCheck = calculateCheckDigit(exp);

  return {
    documentType: (result.documentType === 'P' ? 'P' : 'I') as 'P' | 'I',
    documentNumber: docNum,
    documentNumberCheckDigit: docNumCheck,
    nationality: result.nationality || result.issuingCountry,
    dateOfBirth: dob,
    dateOfBirthCheckDigit: dobCheck,
    sex: (result.sex || '<') as 'M' | 'F' | '<',
    expiryDate: exp,
    expiryDateCheckDigit: expCheck,
    surname: result.lastName,
    givenNames: result.firstName,
    checkDigitsValid: result.checksumValid,
    lines: [],
    format: result.format,
  };
}

export function deriveBacKeys(mrzData: MrzData): BacKeys {
  const quickCrypto = require('react-native-quick-crypto');

  // Build seed = documentNumber + checkDigit + DOB + checkDigit + expiry + checkDigit
  const seed = `${mrzData.documentNumber}${mrzData.documentNumberCheckDigit}${mrzData.dateOfBirth}${mrzData.dateOfBirthCheckDigit}${mrzData.expiryDate}${mrzData.expiryDateCheckDigit}`;

  // SHA1 of ASCII seed → 40 hex chars (20 bytes)
  const mrzKeyHex = sha1(seed);

  // Convert hex → binary for proper ICAO 9303 KDF (must hash binary, not hex string)
  function hexToUint8Array(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes;
  }

  const mrzKeyBytes = hexToUint8Array(mrzKeyHex); // 20 bytes

  // ICAO 9303 Section 9.7.1: Kseed = most significant 16 bytes of SHA-1 hash
  // BUG FIX: was using all 20 bytes, must use only first 16!
  const kseed = mrzKeyBytes.slice(0, 16); // 16 bytes

  // KDF for K_enc: SHA1(Kseed || 0x00000001)
  const kEncInput = new Uint8Array(20);
  kEncInput.set(kseed, 0);
  kEncInput[16] = 0x00;
  kEncInput[17] = 0x00;
  kEncInput[18] = 0x00;
  kEncInput[19] = 0x01;
  const k_encSeed = quickCrypto.createHash('sha1').update(kEncInput).digest('hex') as string;
  const k_enc = adjustParity(k_encSeed.substring(0, 32)); // First 16 bytes

  // KDF for K_mac: SHA1(Kseed || 0x00000002)
  const kMacInput = new Uint8Array(20);
  kMacInput.set(kseed, 0);
  kMacInput[16] = 0x00;
  kMacInput[17] = 0x00;
  kMacInput[18] = 0x00;
  kMacInput[19] = 0x02;
  const k_macSeed = quickCrypto.createHash('sha1').update(kMacInput).digest('hex') as string;
  const k_mac = adjustParity(k_macSeed.substring(0, 32)); // First 16 bytes

  return {
    mrzKey: mrzKeyHex,
    k_enc,
    k_mac,
  };
}

/**
 * SHA1 hash in hex string format (synchronous, using react-native-quick-crypto)
 */
function sha1(data: string): string {
  const quickCrypto = require('react-native-quick-crypto');
  const hash = quickCrypto.createHash('sha1').update(data).digest('hex');
  return hash;
}

/**
 * Adjust parity for 3DES keys (set odd parity on each byte)
 * Input: hex string (any even length)
 * Output: hex string with adjusted parity bits
 */
function adjustParity(inputHex: string): string {
  const bytes = [];
  for (let i = 0; i < inputHex.length; i += 2) {
    bytes.push(parseInt(inputHex.substring(i, i + 2), 16));
  }

  const adjusted = [];
  for (const byte of bytes) {
    // Count set bits
    let bitCount = 0;
    let temp = byte;
    while (temp > 0) {
      bitCount += temp & 1;
      temp >>= 1;
    }

    // If even parity, flip last bit to make odd
    if (bitCount % 2 === 0) {
      adjusted.push(byte ^ 1);
    } else {
      adjusted.push(byte);
    }
  }

  return adjusted.map(b => b.toString(16).padStart(2, '0')).join('');
}
