/**
 * BAC (Basic Access Control) Crypto Utilities
 * Implements ICAO 9303 BAC v2 protocol
 * Uses react-native-quick-crypto for 3DES operations
 */

import * as Crypto from 'react-native-quick-crypto';

/**
 * Adjust parity bits for 3DES keys (make each byte have odd parity)
 * 3DES keys require each byte to have an odd number of set bits
 */
export function adjustParity(bytes: Uint8Array): Uint8Array {
  const adjusted = new Uint8Array(bytes.length);

  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];

    // Count set bits
    let bitCount = 0;
    let temp = byte;
    while (temp > 0) {
      bitCount += temp & 1;
      temp >>= 1;
    }

    // If even parity, flip last bit to make odd
    if (bitCount % 2 === 0) {
      adjusted[i] = byte ^ 1;
    } else {
      adjusted[i] = byte;
    }
  }

  return adjusted;
}

/**
 * Pad data to multiple of block size using PKCS7 padding
 * Block size for DES/3DES is 8 bytes
 */
export function pkcs7Pad(data: Uint8Array, blockSize: number = 8): Uint8Array {
  const paddingLength = blockSize - (data.length % blockSize);
  const padded = new Uint8Array(data.length + paddingLength);

  padded.set(data);
  for (let i = 0; i < paddingLength; i++) {
    padded[data.length + i] = paddingLength;
  }

  return padded;
}

/**
 * Remove PKCS7 padding from decrypted data
 */
export function pkcs7Unpad(data: Uint8Array): Uint8Array {
  const paddingLength = data[data.length - 1];

  if (paddingLength === 0 || paddingLength > 8) {
    throw new Error('Invalid PKCS7 padding');
  }

  return data.slice(0, data.length - paddingLength);
}

/**
 * 3DES-CBC encryption for BAC
 * @param key - 24-byte 3DES key
 * @param data - Data to encrypt
 * @param iv - 8-byte initialization vector
 * @returns Encrypted data with PKCS7 padding
 */
export function des3Encrypt(data: Uint8Array, key: Uint8Array, iv: Uint8Array): Uint8Array {
  // Ensure fresh copies for quick-crypto's native layer (avoids subarray-view issues)
  const cipher = Crypto.createCipheriv('des-ede3-cbc', new Uint8Array(key), new Uint8Array(iv));
  const padded = pkcs7Pad(data);
  const a = cipher.update(padded) as Uint8Array;
  const b = cipher.final() as Uint8Array;
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

/**
 * 3DES-CBC encryption WITHOUT padding for BAC
 * Used for E_IFD where input is already a multiple of 8 bytes
 * and output must be exactly the same length as input.
 */
export function des3EncryptNopad(data: Uint8Array, key: Uint8Array, iv: Uint8Array): Uint8Array {
  if (data.length % 8 !== 0) throw new Error('Data must be a multiple of 8 bytes');
  const cipher = Crypto.createCipheriv('des-ede3-cbc', new Uint8Array(key), new Uint8Array(iv));
  cipher.setAutoPadding(false);
  const a = cipher.update(new Uint8Array(data)) as Uint8Array;
  const b = cipher.final() as Uint8Array;
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

/**
 * 3DES-CBC decryption for BAC
 * @param data - Encrypted data
 * @param key - 24-byte 3DES key
 * @param iv - 8-byte initialization vector
 * @returns Decrypted data with padding removed
 */
export function des3Decrypt(data: Uint8Array, key: Uint8Array, iv: Uint8Array): Uint8Array {
  // Ensure fresh copies for quick-crypto's native layer (avoids subarray-view issues)
  const decipher = Crypto.createDecipheriv('des-ede3-cbc', new Uint8Array(key), new Uint8Array(iv));
  const a = decipher.update(data) as Uint8Array;
  const b = decipher.final() as Uint8Array;
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return pkcs7Unpad(out);
}

/**
 * 3DES-ECB encryption (used in BAC key derivation)
 * @param key - 16-byte 3DES key (actually 16 bytes for the seed, expanded to 24)
 * @param data - 8-byte block
 * @returns Encrypted 8-byte block
 */
export function des3EcbEncrypt(key: Uint8Array, data: Uint8Array): Uint8Array {
  if (data.length !== 8) {
    throw new Error('3DES-ECB requires 8-byte blocks');
  }

  // quick-crypto's binaryLikeToArrayBuffer doesn't handle null IV;
  // ECB mode needs a zero-length IV instead
  const keyCopy = new Uint8Array(key);
  const dataCopy = new Uint8Array(data);
  const cipher = Crypto.createCipheriv('des-ede3-ecb', keyCopy, new Uint8Array(0));
  const a = cipher.update(dataCopy) as Uint8Array;
  const b = cipher.final() as Uint8Array;
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  // ECB on 8 bytes produces 16 bytes (8 data + 8 PKCS padding); take first 8
  return out.slice(0, 8);
}

/**
 * BAC Key Derivation Function (KDF)
 * Generates K_enc and K_mac from mrzKey using SHA1
 *
 * seed = SHA1(mrzKey)
 * K_enc = adjust_parity(SHA1(seed || 0x00000001)[0:16])
 * K_mac = adjust_parity(SHA1(seed || 0x00000002)[0:16])
 *
 * @param mrzKey - SHA1 hash of MRZ data (20 bytes)
 * @returns { k_enc: Uint8Array, k_mac: Uint8Array }
 */
export function deriveBacKeys(mrzKey: Uint8Array): { k_enc: Uint8Array; k_mac: Uint8Array } {
  // ICAO 9303 Section 9.7.1: Kseed = most significant 16 bytes of SHA-1 hash
  // If caller passes 20 bytes (full SHA-1), truncate to 16.
  const kseed = mrzKey.length > 16 ? mrzKey.slice(0, 16) : mrzKey;

  const kEncSeed = Crypto.createHash('sha1')
    .update(kseed)
    .update(new Uint8Array([0x00, 0x00, 0x00, 0x01]))
    .digest() as Uint8Array;

  const kEnc = adjustParity(kEncSeed.slice(0, 16));

  const kMacSeed = Crypto.createHash('sha1')
    .update(kseed)
    .update(new Uint8Array([0x00, 0x00, 0x00, 0x02]))
    .digest() as Uint8Array;

  const kMac = adjustParity(kMacSeed.slice(0, 16));

  return { k_enc: kEnc, k_mac: kMac };
}

/**
 * Single DES-ECB encryption (used in retail-MAC intermediate blocks)
 * @param key - 8-byte DES key
 * @param data - 8-byte block
 * @returns Encrypted 8-byte block
 */
export function desEcbEncrypt(key: Uint8Array, data: Uint8Array): Uint8Array {
  if (data.length !== 8) {
    throw new Error('DES-ECB requires 8-byte blocks');
  }
  if (key.length !== 8) {
    throw new Error('DES key must be 8 bytes');
  }

  // Single DES = 3DES with K||K||K — use des-ede3-ecb since des-ecb may not be available
  const tripleKey = new Uint8Array(24);
  tripleKey.set(key, 0);
  tripleKey.set(key, 8);
  tripleKey.set(key, 16);
  return des3EcbEncrypt(tripleKey, data);
}

/**
 * ISO 9797-1 padding method 2
 * Append 0x80 then 0x00 bytes until length is a multiple of 8.
 * Always adds at least one byte.
 */
export function iso9797Pad(data: Uint8Array): Uint8Array {
  const padLen = 8 - ((data.length + 1) % 8);
  const padded = new Uint8Array(data.length + 1 + (padLen === 8 ? 0 : padLen));
  padded.set(data, 0);
  padded[data.length] = 0x80;
  // remaining bytes are already 0x00
  return padded;
}

/**
 * ISO 9797-1 MAC algorithm 3 (Retail-MAC) for BAC
 *
 * ICAO 9303 BAC uses this with DES/3DES and ISO 9797 padding method 2:
 * 1. Pad input with ISO 9797 method 2
 * 2. Split into 8-byte blocks D1..Dn
 * 3. H0 = 0x0000000000000000
 *    For i = 1..n-1: Hi = DES-ECB-encrypt(K1, Hi-1 XOR Di)   (single DES)
 *    Hn = 3DES-ECB-encrypt(K_mac, Hn-1 XOR Dn)               (full 3DES)
 * 4. MAC = Hn (8 bytes)
 *
 * @param key - 24-byte 3DES MAC key (two-key: K1|K2|K1)
 * @param data - Message data (any length)
 * @returns 8-byte MAC
 */
export function computeMac(key: Uint8Array, data: Uint8Array): Uint8Array {
  if (key.length !== 24) {
    throw new Error('MAC key must be 24 bytes (3DES)');
  }

  // ISO 9797 method 2 padding
  const padded = iso9797Pad(data);

  // Split into 8-byte blocks
  const n = padded.length / 8;
  const k1 = key.slice(0, 8); // First 8 bytes for single DES (slice = copy, not view)

  // CBC with single DES for blocks 1..n-1
  let h: Uint8Array<ArrayBufferLike> = new Uint8Array(8); // H0 = zeros
  for (let i = 0; i < n - 1; i++) {
    const block = padded.slice(i * 8, (i + 1) * 8);
    const xored = new Uint8Array(8);
    for (let j = 0; j < 8; j++) {
      xored[j] = h[j]! ^ block[j]!;
    }
    h = desEcbEncrypt(k1, xored);
  }

  // Last block with full 3DES
  const lastBlock = padded.slice((n - 1) * 8, n * 8);
  const xored = new Uint8Array(8);
  for (let j = 0; j < 8; j++) {
    xored[j] = h[j]! ^ lastBlock[j]!;
  }
  h = des3EcbEncrypt(key, xored);

  return h;
}

/**
 * 3DES-CBC decryption WITHOUT padding for Secure Messaging
 * Used for SM where padding is handled separately (ISO 9797-1 method 2)
 */
export function des3DecryptCBC(key: Uint8Array, iv: Uint8Array, data: Uint8Array): Uint8Array {
  if (data.length % 8 !== 0) throw new Error('Data must be a multiple of 8 bytes');
  const decipher = Crypto.createDecipheriv('des-ede3-cbc', new Uint8Array(key), new Uint8Array(iv));
  decipher.setAutoPadding(false);
  const a = decipher.update(new Uint8Array(data)) as Uint8Array;
  const b = decipher.final() as Uint8Array;
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

/**
 * Remove ISO 9797-1 method 2 padding
 * Finds the last 0x80 byte and trims from there
 */
export function removePadding(data: Uint8Array): Uint8Array {
  for (let i = data.length - 1; i >= 0; i--) {
    if (data[i] === 0x80) {
      return data.slice(0, i);
    }
    if (data[i] !== 0x00) {
      throw new Error('Invalid ISO 9797-1 method 2 padding');
    }
  }
  throw new Error('No padding found');
}

/**
 * Generate random bytes
 */
export function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  Crypto.getRandomValues(bytes);
  return bytes;
}

/**
 * Convert hex string to Uint8Array
 */
export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Convert Uint8Array to hex string
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Build 3DES key from 16-byte seed (expand to 24 bytes)
 * BAC uses KDF to derive 16-byte keys, but 3DES needs 24 bytes
 * The expansion is: first 8 bytes + second 8 bytes + first 8 bytes (KDF repeats middle 8)
 */
export function expand16To24Bytes(seed: Uint8Array): Uint8Array {
  if (seed.length !== 16) {
    throw new Error('Key must be 16 bytes for 3DES key expansion');
  }

  // Two-key 3DES (ICAO 9303): 16-byte key → 24-byte key
  // K1 (first 8 bytes) + K2 (second 8 bytes) + K1 (first 8 bytes again)
  const expanded = new Uint8Array(24);
  expanded.set(seed.slice(0, 8), 0); // K1
  expanded.set(seed.slice(8, 16), 8); // K2
  expanded.set(seed.slice(0, 8), 16); // K1 again

  return expanded;
}

/**
 * BAC v2 specific key expansion (two-key 3DES)
 */
export function derive3DesKey(seed: Uint8Array): Uint8Array {
  if (seed.length !== 16) {
    throw new Error('Key must be 16 bytes for 3DES key derivation');
  }

  // Two-key 3DES: K1 (first 8) + K2 (second 8) + K1 (first 8 again)
  const key = new Uint8Array(24);
  key.set(seed.slice(0, 8), 0); // K1
  key.set(seed.slice(8, 16), 8); // K2
  key.set(seed.slice(0, 8), 16); // K1 again

  return key;
}
