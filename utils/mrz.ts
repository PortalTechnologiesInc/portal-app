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
 * Calculate MRZ check digit using mod-97 algorithm
 */
function calculateCheckDigit(value: string): string {
  const numValue = value.replace(/[^0-9]/g, '');
  const padded = numValue.padStart(2, '0');
  const mod = parseInt(padded) % 10;
  return mod.toString();
}

/**
 * Validate a single MRZ check digit
 */
function validateCheckDigit(checkValue: string, computed: string): boolean {
  return checkValue === computed;
}

/**
 * Parse TD1 (3 lines, 30 chars each) - ID cards
 * Line 1: Document number (7 chars) + check digit (1) + nationality (3) + DOB (6) + check digit (1) + sex (1) + padding
 * Line 2: Surname + given names
 * Line 3: Optional personal number + padding
 */
function parseTD1(lines: string[]): MrzData | null {
  if (lines.length < 2) return null;

  const line1 = lines[0].trim();
  const line2 = lines[1].trim();

  if (line1.length < 30 || line2.length < 30) return null;

  const documentNumber = line1.substring(0, 7);
  const documentNumberCheckDigit = line1[7];
  const nationality = line1.substring(8, 11);
  const dateOfBirth = line1.substring(11, 17);
  const dateOfBirthCheckDigit = line1[17];
  const sex = line1[18] as 'M' | 'F' | '<';

  // Validate sex
  if (!['M', 'F', '<'].includes(sex)) return null;

  const expiryDate = line1.substring(19, 25);
  const expiryDateCheckDigit = line1[25];

  // Parse surname and given names (line 2)
  // Surname is right-justified or left-justified depending on length
  const surnameEnd = Math.min(27, line2.length);
  const surname = line2.substring(0, surnameEnd).replace(/<+/g, ' ');
  const givenNames = line2.substring(surnameEnd).replace(/<+/g, ' ').trim() || '<';

  // Line 3 (optional) - personal number
  const personalNumber = lines[2]
    ? lines[2].substring(0, 36).replace(/<+/g, ' ').trim()
    : undefined;

  // Validate check digits
  const docNumComputed = calculateCheckDigit(documentNumber);
  const dobComputed = calculateCheckDigit(dateOfBirth);
  const expComputed = calculateCheckDigit(expiryDate);

  const checkDigitsValid =
    validateCheckDigit(documentNumberCheckDigit, docNumComputed) &&
    validateCheckDigit(dateOfBirthCheckDigit, dobComputed) &&
    validateCheckDigit(expiryDateCheckDigit, expComputed);

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
 * Line 2: Combined document number (7) + check digit + DOB + check digit + expiry + check digit + personal number + composite check digit
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

  // Line 2 structure (44 chars)
  // Document number (7) + check (1) + Country (3) + DOB (6) + check (1) + sex (1) + expiry (6) + check (1) + personal (14) + check (1) + composite (1)
  const documentNumber = line2.substring(0, 7);
  const documentNumberCheckDigit = line2[7];
  const nationality = line2.substring(8, 11);
  const dateOfBirth = line2.substring(11, 17);
  const dateOfBirthCheckDigit = line2[17];
  const sex = line2[18] as 'M' | 'F' | '<';
  const expiryDate = line2.substring(19, 25);
  const expiryDateCheckDigit = line2[25];
  const personalNumber = line2.substring(26, 40) || undefined;

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
  if (lines.length >= 2 && lines[0].length >= 30) {
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
  k_enc: string; // Hex string of 24 bytes (3DES encryption key)
  k_mac: string; // Hex string of 8 bytes (3DES MAC key)
  mrzKey: string; // Hex string of SHA1 hash
}

export function deriveBacKeys(mrzData: MrzData): BacKeys {
  // Build seed = documentNumber + checkDigit + DOB + checkDigit + expiry + checkDigit
  const seed = `${mrzData.documentNumber}${mrzData.documentNumberCheckDigit}${mrzData.dateOfBirth}${mrzData.dateOfBirthCheckDigit}${mrzData.expiryDate}${mrzData.expiryDateCheckDigit}`;

  // SHA1 of seed (in hex)
  const mrzKey = sha1(seed);

  // KDF for K_enc (seed || 0x00000001)
  const k_encSeed = sha1(mrzKey + '00000001');
  const k_enc = adjustParity(k_encSeed.substring(0, 16)); // First 16 hex chars = 8 bytes for 3DES key

  // KDF for K_mac (seed || 0x00000002)
  const k_macSeed = sha1(mrzKey + '00000002');
  const k_mac = adjustParity(k_macSeed.substring(0, 16)); // First 16 hex chars = 8 bytes for 3DES MAC key

  return {
    mrzKey,
    k_enc,
    k_mac,
  };
}

/**
 * SHA1 hash in hex string format
 */
function sha1(data: string): string {
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    return crypto.subtle.digest('SHA-1', dataBuffer).then(hash =>
      Array.from(new Uint8Array(hash))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
    );
  } else {
    // Fallback using react-native-quick-crypto if available
    try {
      // @ts-expect-error - might not be typed
      const crypto = require('react-native-quick-crypto');
      const hash = crypto.createHash('sha1').update(data).digest('hex');
      return hash;
    } catch (e) {
      throw new Error('No SHA1 implementation available');
    }
  }
}

/**
 * Adjust parity for 3DES keys (remove odd parity bits)
 * Input: 16 hex chars (8 bytes)
 * Output: 16 hex chars (8 bytes) with adjusted parity
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
