/**
 * MRZ parser — pure TypeScript, no native dependencies.
 *
 * Supports TD-1 (ID cards, 3×30) and TD-3 (passports, 2×44) formats
 * per ICAO 9303 specification.
 */

export interface MRZResult {
  /** "P" for passport, "I"/"C"/"A" for ID cards, etc. */
  documentType: string;
  /** Three-letter issuing country/organization code. */
  issuingCountry: string;
  /** Last name (family name). */
  lastName: string;
  /** First name(s), space-separated. */
  firstName: string;
  /** Document number. */
  documentNumber: string;
  /** Three-letter nationality code. */
  nationality: string;
  /** Date of birth as YYYY-MM-DD (century inferred: <=current+10 → 20xx, else 19xx). */
  dateOfBirth: string;
  /** "M", "F", or "<" (unspecified). */
  sex: string;
  /** Expiry date as YYYY-MM-DD. */
  expiryDate: string;
  /** Optional data field(s), filler stripped. */
  optionalData: string;
  /**
   * Whether the three check digits required for BAC key derivation are valid:
   * document number (c1), date of birth (c2), and expiry date (c3).
   * This is sufficient for Basic Access Control and is deliberately lenient
   * towards OCR errors in optional data fields (e.g. Italian fiscal codes).
   */
  checksumValid: boolean;
  /**
   * Whether the composite/optional check digits are also valid (c4/c5 for TD3,
   * c4 for TD1).  Use this for stricter validation when optional data integrity
   * matters.
   */
  optionalChecksumValid: boolean;
  /** The raw MRZ format detected: "TD1" or "TD3". */
  format: 'TD1' | 'TD3';
}

// ---------------------------------------------------------------------------
// Character value per ICAO 9303
// ---------------------------------------------------------------------------

function charValue(ch: string): number {
  if (ch === '<') return 0;
  const code = ch.charCodeAt(0);
  // 0-9
  if (code >= 0x30 && code <= 0x39) return code - 0x30;
  // A-Z → 10-35
  if (code >= 0x41 && code <= 0x5a) return code - 0x41 + 10;
  throw new Error(`Invalid MRZ character: '${ch}'`);
}

// ---------------------------------------------------------------------------
// ICAO 9303 check-digit computation
// ---------------------------------------------------------------------------

const WEIGHTS = [7, 3, 1];

/**
 * Compute the ICAO 9303 check digit for the given string.
 * Returns a single-digit string "0"–"9".
 */
export function computeCheckDigit(input: string): string {
  let sum = 0;
  for (let i = 0; i < input.length; i++) {
    sum += charValue(input[i]) * WEIGHTS[i % 3];
  }
  return String(sum % 10);
}

/**
 * Verify that the character at `checkPos` equals the computed check digit
 * of `data`.
 */
function verifyCheck(data: string, checkDigit: string): boolean {
  return computeCheckDigit(data) === checkDigit;
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/** Convert YYMMDD to YYYY-MM-DD, inferring century. */
function parseDate(yymmdd: string, isBirth: boolean): string {
  const yy = parseInt(yymmdd.slice(0, 2), 10);
  const mm = yymmdd.slice(2, 4);
  const dd = yymmdd.slice(4, 6);

  const now = new Date();
  const currentTwoDigitYear = now.getFullYear() % 100;

  let century: number;
  if (isBirth) {
    // Birth dates: if yy <= current+10 → 2000s, else 1900s
    century = yy <= currentTwoDigitYear + 10 ? 2000 : 1900;
  } else {
    // Expiry dates: if yy <= current+50 → 2000s, else 1900s
    century = yy <= currentTwoDigitYear + 50 ? 2000 : 1900;
  }

  const yyyy = String(century + yy);
  return `${yyyy}-${mm}-${dd}`;
}

/** Strip trailing filler (<) characters. */
function stripFiller(s: string): string {
  return s.replace(/<+$/, '');
}

/** Parse name field: "LAST<<FIRST<SECOND" → { lastName, firstName }. */
function parseName(field: string): { lastName: string; firstName: string } {
  const parts = field.split('<<');
  const lastName = (parts[0] || '').replace(/</g, ' ').trim();
  const firstName = (parts[1] || '').replace(/</g, ' ').trim();
  return { lastName, firstName };
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

/**
 * Parse a raw MRZ string into structured fields.
 *
 * @param mrzString - The raw MRZ, lines separated by `\n`.
 *   - TD-3 (passport): 2 lines × 44 characters
 *   - TD-1 (ID card):  3 lines × 30 characters
 *
 * @returns Parsed MRZ result with `checksumValid` indicating integrity.
 * @throws If the MRZ format is not recognized.
 */
export function parseMRZ(mrzString: string): MRZResult {
  const lines = mrzString
    .trim()
    .split('\n')
    .map(l => l.trim());

  if (lines.length === 2 && lines[0].length === 44 && lines[1].length === 44) {
    return parseTD3(lines[0], lines[1]);
  }

  if (
    lines.length === 3 &&
    lines[0].length === 30 &&
    lines[1].length === 30 &&
    lines[2].length === 30
  ) {
    return parseTD1(lines[0], lines[1], lines[2]);
  }

  throw new Error(
    `Unrecognized MRZ format: ${lines.length} line(s), lengths [${lines.map(l => l.length).join(',')}]`
  );
}

// ---------------------------------------------------------------------------
// TD-3 (passport) — 2 lines × 44
// ---------------------------------------------------------------------------
//
// Line 1: [0]type(1) [1]subtype(1) [2-4]country(3) [5-43]name(39)
// Line 2: [0-8]docNum(9) [9]docNumCheck [10-12]nationality(3)
//          [13-18]DOB(6) [19]DOBcheck [20]sex(1) [21-26]expiry(6)
//          [27]expiryCheck [28-41]optionalData(14) [42]optionalCheck
//          [43]compositeCheck

function parseTD3(line1: string, line2: string): MRZResult {
  const documentType = stripFiller(line1.slice(0, 2));
  const issuingCountry = stripFiller(line1.slice(2, 5));
  const { lastName, firstName } = parseName(line1.slice(5, 44));

  const documentNumber = stripFiller(line2.slice(0, 9));
  const docNumCheck = line2[9];
  const nationality = stripFiller(line2.slice(10, 13));
  const dobRaw = line2.slice(13, 19);
  const dobCheck = line2[19];
  const sex = line2[20];
  const expiryRaw = line2.slice(21, 27);
  const expiryCheck = line2[27];
  const optionalRaw = line2.slice(28, 42);
  const optionalCheck = line2[42];
  const compositeCheck = line2[43];

  // Checksum validation
  const c1 = verifyCheck(line2.slice(0, 9), docNumCheck);
  const c2 = verifyCheck(dobRaw, dobCheck);
  const c3 = verifyCheck(expiryRaw, expiryCheck);
  const c4 = verifyCheck(optionalRaw, optionalCheck);
  // Composite: doc number + check + nationality + DOB + check + sex + expiry + check + optional + check
  const compositeData = line2.slice(0, 10) + line2.slice(13, 20) + line2.slice(21, 43);
  const c5 = verifyCheck(compositeData, compositeCheck);

  return {
    format: 'TD3',
    documentType,
    issuingCountry,
    lastName,
    firstName,
    documentNumber,
    nationality,
    dateOfBirth: parseDate(dobRaw, true),
    sex,
    expiryDate: parseDate(expiryRaw, false),
    optionalData: stripFiller(optionalRaw),
    checksumValid: c1 && c2 && c3,
    optionalChecksumValid: c4 && c5,
  };
}

// ---------------------------------------------------------------------------
// TD-1 (ID card) — 3 lines × 30
// ---------------------------------------------------------------------------
//
// Line 1: [0]type(1) [1]subtype(1) [2-4]country(3) [5-13]docNum(9) [14]docNumCheck
//          [15-29]optional1(15)
// Line 2: [0-5]DOB(6) [6]DOBcheck [7]sex(1) [8-13]expiry(6) [14]expiryCheck
//          [15-17]nationality(3) [18-28]optional2(11) [29]compositeCheck
// Line 3: [0-29]name(30)

function parseTD1(line1: string, line2: string, line3: string): MRZResult {
  const documentType = stripFiller(line1.slice(0, 2));
  const issuingCountry = stripFiller(line1.slice(2, 5));
  const documentNumber = stripFiller(line1.slice(5, 14));
  const docNumCheck = line1[14];
  const optional1 = line1.slice(15, 30);

  const dobRaw = line2.slice(0, 6);
  const dobCheck = line2[6];
  const sex = line2[7];
  const expiryRaw = line2.slice(8, 14);
  const expiryCheck = line2[14];
  const nationality = stripFiller(line2.slice(15, 18));
  const optional2 = line2.slice(18, 29);
  const compositeCheck = line2[29];

  const { lastName, firstName } = parseName(line3);

  // Checksum validation
  const c1 = verifyCheck(line1.slice(5, 14), docNumCheck);
  const c2 = verifyCheck(dobRaw, dobCheck);
  const c3 = verifyCheck(expiryRaw, expiryCheck);
  // Composite per ICAO 9303 TD-1:
  //   line1[5..29] (doc number + check + optional1)
  // + line2[0..6]  (DOB + check)
  // + line2[8..14] (expiry + check)
  // + line2[18..28] (optional2)
  // Excludes: type (l1[0..1]), country (l1[2..4]), sex (l2[7]), nationality (l2[15..17])
  const compositeData =
    line1.slice(5, 30) + line2.slice(0, 7) + line2.slice(8, 15) + line2.slice(18, 29);
  const c4 = verifyCheck(compositeData, compositeCheck);

  return {
    format: 'TD1',
    documentType,
    issuingCountry,
    lastName,
    firstName,
    documentNumber,
    nationality,
    dateOfBirth: parseDate(dobRaw, true),
    sex,
    expiryDate: parseDate(expiryRaw, false),
    optionalData: stripFiller(optional1 + optional2).trim(),
    checksumValid: c1 && c2 && c3,
    optionalChecksumValid: c4,
  };
}
