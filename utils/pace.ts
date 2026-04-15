/**
 * PACE (Password Authenticated Connection Establishment) utilities
 * Implements BSI TR-03110 / ICAO 9303 PACE protocol helpers
 */

// ─── ASN.1 / TLV helpers ───

export interface PACEInfo {
  oid: number[];
  version: number;
  parameterId: number;
}

export interface PACEConfig {
  agreementAlg: 'DH' | 'ECDH';
  mappingType: 'GM' | 'IM';
  cipher: '3DES' | 'AES-128' | 'AES-192' | 'AES-256';
  digest: 'SHA-1' | 'SHA-256';
  keyLength: number; // bytes
}

/**
 * Parse EF.CardAccess hex to extract the first PACEInfo.
 * Delegates to parseAllPACEInfo and returns the first match.
 */
export function parsePACEInfo(hex: string): PACEInfo | null {
  const all = parseAllPACEInfo(hex);
  return all[0] ?? null;
}

/**
 * Parse EF.CardAccess hex to extract ALL PACEInfo entries.
 * EF.CardAccess is a SET OF SecurityInfo (ASN.1 DER).
 * PACEInfo ::= SEQUENCE { protocol OID, version INTEGER, parameterId INTEGER OPTIONAL }
 */
export function parseAllPACEInfo(hex: string): PACEInfo[] {
  const data = hexToBytes(hex);
  const results: PACEInfo[] = [];
  let pos = 0;

  // Outer SET (tag 0x31)
  if (pos >= data.length || data[pos] !== 0x31) return results;
  pos++;
  const setLen = parseDERLength(data, pos);
  pos = setLen.nextPos;

  const setEnd = pos + setLen.length;

  while (pos < setEnd) {
    // Each SecurityInfo is a SEQUENCE (tag 0x30)
    if (data[pos] !== 0x30) break;
    pos++;
    const seqLen = parseDERLength(data, pos);
    pos = seqLen.nextPos;
    const seqEnd = pos + seqLen.length;

    // First element: OID (tag 0x06)
    if (pos < seqEnd && data[pos] === 0x06) {
      pos++;
      const oidLen = parseDERLength(data, pos);
      pos = oidLen.nextPos;
      const oidBytes = Array.from(data.slice(pos, pos + oidLen.length));
      pos += oidLen.length;

      if (isPACEOID(oidBytes)) {
        let version = 2;
        let parameterId = -1;

        // version INTEGER
        if (pos < seqEnd && data[pos] === 0x02) {
          pos++;
          const vLen = parseDERLength(data, pos);
          pos = vLen.nextPos;
          version = readIntegerBytes(data, pos, vLen.length);
          pos += vLen.length;
        }

        // parameterId INTEGER (optional)
        if (pos < seqEnd && data[pos] === 0x02) {
          pos++;
          const pLen = parseDERLength(data, pos);
          pos = pLen.nextPos;
          parameterId = readIntegerBytes(data, pos, pLen.length);
          pos += pLen.length;
        }

        results.push({ oid: oidBytes, version, parameterId });
      }
    }

    pos = seqEnd;
  }

  return results;
}

function parseDERLength(data: Uint8Array, pos: number): { length: number; nextPos: number } {
  // biome-ignore lint/style/noNonNullAssertion: bounded index into Uint8Array
  const first = data[pos]!;
  if (first < 0x80) return { length: first, nextPos: pos + 1 };
  const numBytes = first & 0x7f;
  let length = 0;
  for (let i = 0; i < numBytes; i++) {
    // biome-ignore lint/style/noNonNullAssertion: bounded index into Uint8Array
    length = (length << 8) | data[pos + 1 + i]!;
  }
  return { length, nextPos: pos + 1 + numBytes };
}

function readIntegerBytes(data: Uint8Array, pos: number, len: number): number {
  let val = 0;
  // biome-ignore lint/style/noNonNullAssertion: bounded index into Uint8Array
  for (let i = 0; i < len; i++) val = (val << 8) | data[pos + i]!;
  return val;
}

/** Check if OID bytes start with id-PACE prefix: 0.4.0.127.0.7.2.2.4 */
function isPACEOID(oidBytes: number[]): boolean {
  // id-PACE = 0.4.0.127.0.7.2.2.4
  // BER encoding: 04 00 7f 00 07 02 02 04 ...
  const prefix = [0x04, 0x00, 0x7f, 0x00, 0x07, 0x02, 0x02, 0x04];
  if (oidBytes.length < prefix.length) return false;
  return prefix.every((b, i) => oidBytes[i] === b);
}

/**
 * Decode PACE OID to protocol configuration.
 *
 * OID structure: id-PACE . agreementAlg . cipher
 *   agreementAlg: 1=DH-GM, 2=ECDH-GM, 3=DH-IM, 4=ECDH-IM
 *   cipher: 1=3DES-CBC-CBC, 2=AES-CBC-CMAC-128, 3=AES-CBC-CMAC-192, 4=AES-CBC-CMAC-256
 */
export function getPACEConfig(oid: number[]): PACEConfig {
  // OID bytes after id-PACE prefix (8 bytes): [agreementAlgByte, cipherByte]
  const algByte = oid[8] ?? 0;
  const cipherByte = oid[9] ?? 0;

  const agreementAlg: 'DH' | 'ECDH' = algByte === 1 || algByte === 3 ? 'DH' : 'ECDH';
  const mappingType: 'GM' | 'IM' = algByte <= 2 ? 'GM' : 'IM';

  let cipher: PACEConfig['cipher'];
  let keyLength: number;
  let digest: PACEConfig['digest'];

  switch (cipherByte) {
    case 1:
      cipher = '3DES';
      keyLength = 16;
      digest = 'SHA-1';
      break;
    case 2:
      cipher = 'AES-128';
      keyLength = 16;
      digest = 'SHA-1';
      break;
    case 3:
      cipher = 'AES-192';
      keyLength = 24;
      digest = 'SHA-256';
      break;
    case 4:
      cipher = 'AES-256';
      keyLength = 32;
      digest = 'SHA-256';
      break;
    default:
      cipher = 'AES-128';
      keyLength = 16;
      digest = 'SHA-1';
  }

  return { agreementAlg, mappingType, cipher, digest, keyLength };
}

/** Encode OID bytes back to dotted-decimal string for MSE:Set AT */
export function oidBytesToHex(oid: number[]): string {
  return oid.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── Standardized Domain Parameters (BSI TR-03110 Annex A) ───

export interface DHParams {
  p: string; // hex
  q: string; // hex
  g: string; // hex
}

/**
 * Standardized DH domain parameters per BSI TR-03110-3 Table A.1.
 * parameterId 0: 1024-bit MODP, 160-bit subgroup
 * parameterId 1: 2048-bit MODP, 224-bit subgroup
 * parameterId 2: 2048-bit MODP, 256-bit subgroup
 */
export function getStandardizedDHParams(parameterId: number): DHParams | null {
  return DH_PARAMS[parameterId] ?? null;
}

const DH_PARAMS: Record<number, DHParams> = {
  0: {
    p: 'b10b8f96a080e01dde92de5eae5d54ec52c99fbcfb06a3c69a6a9dca52d23b616073e28675a23d189838ef1e2ee652c013ecb4aea906112324975c3cd49b83bfaccbdd7d90c4bd7098488e9c219a73724effd6fae5644738faa31a4ff55bccc0a151af5f0dc8b4bd45bf37df365c1a65e68cfda76d4da708df1fb2bc2e4a4371',
    q: 'f518aa8781a8df278aba4e7d64b7cb9d49462353',
    g: 'a4d1cbd5c3fd34126765a442efb99905f8104dd258ac507fd6406cff14266d31266fea1e5c41564b777e690f5504f213160217b4b01b886a5e91547f9e2749f4d7fbd7d3b9a92ee1909d0d2263f80a76a6a24c087a091f531dbf0a0169b6a28ad662a4d18e73afa32d779d5918d08bc8858f4dcef97c2a24855e6eeb22b3b2e5',
  },
  1: {
    p: 'ad107e1e9123a9d0d660faa79559c51fa20d64e5683b9fd1b54b1597b61d0a75e6fa141df95a56dbaf9a3c407ba1df15eb3d688a309c180e1de6b85a1274a0a66d3f8152ad6ac2129037c9edefda4df8d91e8fef55b7394b7ad5b7d0b6c12207c9f98d11ed34dbf6c6ba0b2c8bbc27be6a00e0a0b9c49708b3bf8a317091883681286130bc8985db1602e714415d9330278273c7de31efdc7310f7121fd5a07415987d9adc0a486dcdf93acc44328387315d75e198c641a480cd86a1b9e587e8be60e69cc928b2b9c52172e413042e9b23f10b0e16e79763c9b53dcf4ba80a29e3fb73c16b8e75b97ef363e2ffa31f71cf9de5384e71b81c0ac4dffe0c10e64f',
    q: '801c0d34c58d93fe997177101f80535a4738cebcbf389a99b36371eb',
    g: 'ac4032ef4f2d9ae39df30b5c8ffdac506cdebe7b89998caf74866a08cfe4ffe3a6824a4e10b9a6f0dd921f01a70c4afaab739d7700c29f52c57db17c620a8652be5e9001a8d66ad7c17669101999024af4d027275ac1348bb8a762d0521bc98ae247150422ea1ed409939d54da7460cdb5f6c6b250717cbef180eb34118e98d119529a45d6f834566e3025e316a330efbb77a86f0c1ab15b051ae3d428c8f8acb70a8137150b8eeb10e183edd19963ddd9e263e4770589ef6aa21e7f5f2ff381b539cce3409d13cd566afbb48d6c019181e1bcfe94b30269edfe72fe9b6aa4bd7b5a0f1c71cfff4c19c418e1f6ec017981bc087f2a7065b384b890d3191f2bfa',
  },
  2: {
    // RFC 5114 Section 2.3 — 2048-bit MODP with 256-bit Prime Order Subgroup
    p: '87a8e61db4b6663cffbbd19c651959998ceef608660dd0f25d2ceed4435e3b00e00df8f1d61957d4faf7df4561b2aa3016c3d91134096faa3bf4296d830e9a7c209e0c6497517abd5a8a9d306bcf67ed91f9e6725b4758c022e0b1ef4275bf7b6c5bfc11d45f9088b941f54eb1e59bb8bc39a0bf12307f5c4fdb70c581b23f76b63acae1caa6b7902d52526735488a0ef13c6d9a51bfa4ab3ad8347796524d8ef6a167b5a41825d967e144e5140564251ccacb83e6b486f6b3ca3f7971506026c0b857f689962856ded4010abd0be621c3a3960a54e710c375f26375d7014103a4b54330c198af126116d2276e11715f693877fad7ef09cadb094ae91e1a1597',
    q: '8cf83642a709a097b447997640129da299b1a47d1eb3750ba308b0fe64f5fbd3',
    g: '3fb32c9b73134d0b2e77506660edbd484ca7b18f21ef205407f4793a1a0ba12510dbc15077be463fff4fed4aac0bb555be3a6c1b0c6b47b1bc3773bf7e8c6f62901228f8c28cbb18a55ae31341000a650196f931c77a57f2ddf463e5e9ec144b777de62aaab8a8628ac376d282d6ed3864e67982428ebc831d14348f6f2f9193b5045af2767164e1dfc967c1fb3f2e55a4bd1bffe83b9c80d052b985d182ea0adb2a3b7313d3fe14c8484b1e052588b9b7d2bbd2df016199ecd06e1557cd0915b3353bbb64e0ec377fd028370df92b52c7891428cdc67eb6184b523d1db246c32f63078490f00ef8d647d148d47954515e2327cfef98c582664b4631',
  },
};

/**
 * Map EC parameterId to curve name usable by @noble/curves.
 * BSI TR-03110-3 Table A.2
 */
export function getECCurveName(parameterId: number): string | null {
  const map: Record<number, string> = {
    8: 'secp192r1',
    9: 'brainpoolP192r1',
    10: 'secp224r1',
    11: 'brainpoolP224r1',
    12: 'secp256r1',
    13: 'brainpoolP256r1',
    14: 'brainpoolP320r1',
    15: 'secp384r1',
    16: 'brainpoolP384r1',
    17: 'brainpoolP512r1',
    18: 'secp521r1',
  };
  return map[parameterId] ?? null;
}

// ─── General Authenticate TLV wrap / unwrap ───

/** Wrap data into a DO with the given tag: [tag, length, ...data] */
export function wrapDO(tag: number, data: number[]): number[] {
  if (data.length === 0) return [];
  const len = berLength(data.length);
  return [tag, ...len, ...data];
}

/** Unwrap a DO with the given tag from a 7C response body */
export function unwrapDO(tag: number, data: Uint8Array): Uint8Array {
  let pos = 0;
  // Skip outer 7C wrapper if present
  if (data[pos] === 0x7c) {
    pos++;
    const outerLen = parseDERLength(data, pos);
    pos = outerLen.nextPos;
  }

  while (pos < data.length) {
    // biome-ignore lint/style/noNonNullAssertion: bounded index into Uint8Array
    const t = data[pos]!;
    pos++;
    const len = parseDERLength(data, pos);
    pos = len.nextPos;
    if (t === tag) {
      return data.slice(pos, pos + len.length);
    }
    pos += len.length;
  }
  throw new Error(`DO tag 0x${tag.toString(16)} not found in response`);
}

/** Wrap a General Authenticate command body: 7C [ ...innerDOs ] */
export function wrapGA(innerDOs: number[]): number[] {
  const len = berLength(innerDOs.length);
  return [0x7c, ...len, ...innerDOs];
}

function berLength(length: number): number[] {
  if (length < 0x80) return [length];
  if (length < 0x100) return [0x81, length];
  return [0x82, (length >> 8) & 0xff, length & 0xff];
}

// ─── Utility ───

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}
