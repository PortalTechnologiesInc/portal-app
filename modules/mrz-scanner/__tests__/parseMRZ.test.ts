import type { MRZResult } from '../src/parseMRZ';
import { computeCheckDigit, parseMRZ } from '../src/parseMRZ';

// ─────────────────────────────────────────────────────────────
// Check digit algorithm tests
// ─────────────────────────────────────────────────────────────

describe('computeCheckDigit', () => {
  test('single digit characters', () => {
    // "0" → 0*7 = 0 mod 10 = 0
    expect(computeCheckDigit('0')).toBe('0');
  });

  test('simple numeric string', () => {
    // "520727" → 5*7+2*3+0*1+7*7+2*3+7*1 = 35+6+0+49+6+7 = 103 → 103%10 = 3
    expect(computeCheckDigit('520727')).toBe('3');
  });

  test('alpha characters', () => {
    // "AB" → A=10, B=11 → 10*7 + 11*3 = 70+33 = 103 → 3
    expect(computeCheckDigit('AB')).toBe('3');
  });

  test('filler characters treated as 0', () => {
    // "<<<" → 0*7+0*3+0*1 = 0
    expect(computeCheckDigit('<<<')).toBe('0');
  });

  test('ICAO example: document number L898902C3', () => {
    // L=21, 8,9,8,9,0,2,C=12,3
    // 21*7 + 8*3 + 9*1 + 8*7 + 9*3 + 0*1 + 2*7 + 12*3 + 3*1
    // = 147 + 24 + 9 + 56 + 27 + 0 + 14 + 36 + 3 = 316 → 316%10 = 6
    expect(computeCheckDigit('L898902C3')).toBe('6');
  });

  test('DOB 740812', () => {
    // 7*7+4*3+0*1+8*7+1*3+2*1 = 49+12+0+56+3+2 = 122 → 2
    expect(computeCheckDigit('740812')).toBe('2');
  });

  test('expiry 120415', () => {
    // 1*7+2*3+0*1+4*7+1*3+5*1 = 7+6+0+28+3+5 = 49 → 9
    expect(computeCheckDigit('120415')).toBe('9');
  });
});

// ─────────────────────────────────────────────────────────────
// TD-3 (Passport) parsing
// ─────────────────────────────────────────────────────────────

describe('parseMRZ — TD-3 (passport)', () => {
  const TD3_LINE1 = 'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<';
  const TD3_LINE2 = 'L898902C36UTO7408122F1204159ZE184226B<<<<<10';
  const td3MRZ = `${TD3_LINE1}\n${TD3_LINE2}`;

  let result: MRZResult;

  beforeAll(() => {
    result = parseMRZ(td3MRZ);
  });

  test('detects TD3 format', () => {
    expect(result.format).toBe('TD3');
  });

  test('parses document type', () => {
    expect(result.documentType).toBe('P');
  });

  test('parses issuing country', () => {
    expect(result.issuingCountry).toBe('UTO');
  });

  test('parses last name', () => {
    expect(result.lastName).toBe('ERIKSSON');
  });

  test('parses first name', () => {
    expect(result.firstName).toBe('ANNA MARIA');
  });

  test('parses document number', () => {
    expect(result.documentNumber).toBe('L898902C3');
  });

  test('parses nationality', () => {
    expect(result.nationality).toBe('UTO');
  });

  test('parses date of birth', () => {
    expect(result.dateOfBirth).toBe('1974-08-12');
  });

  test('parses sex', () => {
    expect(result.sex).toBe('F');
  });

  test('parses expiry date', () => {
    expect(result.expiryDate).toBe('2012-04-15');
  });

  test('parses optional data', () => {
    expect(result.optionalData).toBe('ZE184226B');
  });

  test('validates checksums', () => {
    expect(result.checksumValid).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// TD-1 (ID card) parsing
// ─────────────────────────────────────────────────────────────

describe('parseMRZ — TD-1 (ID card)', () => {
  const TD1_LINE1 = 'I<UTOD231458907<<<<<<<<<<<<<<<';
  const TD1_LINE2 = '7408122F1204159UTO<<<<<<<<<<<6';
  const TD1_LINE3 = 'ERIKSSON<<ANNA<MARIA<<<<<<<<<<';

  // TD-1 lines must be 30 chars
  expect(TD1_LINE1.length).toBe(30);
  expect(TD1_LINE2.length).toBe(30);

  const td1MRZ = `${TD1_LINE1}\n${TD1_LINE2}\n${TD1_LINE3}`;

  let result: MRZResult;

  beforeAll(() => {
    result = parseMRZ(td1MRZ);
  });

  test('detects TD1 format', () => {
    expect(result.format).toBe('TD1');
  });

  test('parses document type', () => {
    expect(result.documentType).toBe('I');
  });

  test('parses issuing country', () => {
    expect(result.issuingCountry).toBe('UTO');
  });

  test('parses last name', () => {
    expect(result.lastName).toBe('ERIKSSON');
  });

  test('parses first name', () => {
    expect(result.firstName).toBe('ANNA MARIA');
  });

  test('parses document number', () => {
    expect(result.documentNumber).toBe('D23145890');
  });

  test('parses date of birth', () => {
    expect(result.dateOfBirth).toBe('1974-08-12');
  });

  test('parses sex', () => {
    expect(result.sex).toBe('F');
  });

  test('parses expiry date', () => {
    expect(result.expiryDate).toBe('2012-04-15');
  });

  test('parses nationality', () => {
    expect(result.nationality).toBe('UTO');
  });

  test('validates checksums', () => {
    expect(result.checksumValid).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// Checksum validation — corrupt MRZ
// ─────────────────────────────────────────────────────────────

describe('parseMRZ — checksum validation', () => {
  test('detects corrupted TD-3 document number', () => {
    const line1 = 'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<';
    // Corrupt doc number: changed L to X
    const line2 = 'X898902C36UTO7408122F1204159ZE184226B<<<<<10';
    const result = parseMRZ(`${line1}\n${line2}`);
    expect(result.checksumValid).toBe(false);
  });

  test('detects corrupted TD-3 DOB', () => {
    const line1 = 'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<';
    // Corrupt DOB: changed 74 to 75
    const line2 = 'L898902C36UTO7508122F1204159ZE184226B<<<<<10';
    const result = parseMRZ(`${line1}\n${line2}`);
    expect(result.checksumValid).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
// Error handling
// ─────────────────────────────────────────────────────────────

describe('parseMRZ — error handling', () => {
  test('throws on unrecognized format', () => {
    expect(() => parseMRZ('HELLO')).toThrow('Unrecognized MRZ format');
  });

  test('throws on wrong line lengths', () => {
    expect(() => parseMRZ('LINE1\nLINE2')).toThrow('Unrecognized MRZ format');
  });
});
