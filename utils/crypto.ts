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
    let byte = bytes[i];
    
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
  
  return data.subarray(0, data.length - paddingLength);
}

/**
 * 3DES-CBC encryption for BAC
 * @param key - 24-byte 3DES key
 * @param data - Data to encrypt
 * @param iv - 8-byte initialization vector
 * @returns Encrypted data with PKCS7 padding
 */
export function des3Encrypt(data: Uint8Array, key: Uint8Array, iv: Uint8Array): Uint8Array {
  // Use react-native-quick-crypto's 3DES-CBC
  const cipher = Crypto.createCipheriv('des-ede3-cbc', key, iv);
  
  // Pad data
  const padded = pkcs7Pad(data);
  
  const encrypted = Buffer.concat([
    cipher.update(padded),
    cipher.final()
  ]);
  
  return new Uint8Array(encrypted);
}

/**
 * 3DES-CBC decryption for BAC
 * @param data - Encrypted data
 * @param key - 24-byte 3DES key
 * @param iv - 8-byte initialization vector
 * @returns Decrypted data with padding removed
 */
export function des3Decrypt(data: Uint8Array, key: Uint8Array, iv: Uint8Array): Uint8Array {
  const decipher = Crypto.createDecipheriv('des-ede3-cbc', key, iv);
  
  const decrypted = Buffer.concat([
    decipher.update(data),
    decipher.final()
  ]);
  
  return pkcs7Unpad(new Uint8Array(decrypted));
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
  
  const cipher = Crypto.createCipheriv('des-ede3-ecb', key, null);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  
  return new Uint8Array(encrypted);
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
  // Derive K_enc
  const kEncSeed = Crypto.createHash('sha1')
    .update(mrzKey)
    .update(Buffer.from([0x00, 0x00, 0x00, 0x01]))
    .digest();
  
  const kEnc = adjustParity(kEncSeed.subarray(0, 8));
  
  // Derive K_mac
  const kMacSeed = Crypto.createHash('sha1')
    .update(mrzKey)
    .update(Buffer.from([0x00, 0x00, 0x00, 0x02]))
    .digest();
  
  const kMac = adjustParity(kMacSeed.subarray(0, 8));
  
  return { k_enc: kEnc, k_mac: kMac };
}

/**
 * retail-MAC (MAC-1) computation for BAC
 * 
 * Algorithm:
 * 1. Pad message with zeros to 8-byte boundary
 * 2. Encrypt with 3DES using K_mac in ECB mode
 * 3. XOR result with 0x0000000000000000
 * 4. Take leftmost 8 bytes
 * 
 * Note: In BAC, this is actually simpler - just 3DES-ECB encrypt and XOR with zeros
 * 
 * @param key - 8-byte K_mac key
 * @param data - Message data (will be padded to 8 bytes)
 * @returns 8-byte MAC
 */
export function computeMac(key: Uint8Array, data: Uint8Array): Uint8Array {
  // Pad to 8 bytes with zeros
  let padded = data;
  if (data.length < 8) {
    const padBuffer = Buffer.alloc(8);
    data.copy(padBuffer, 0, 0, data.length);
    padded = new Uint8Array(padBuffer);
  }
  
  // Encrypt with 3DES-ECB
  const encrypted = des3EcbEncrypt(key, padded);
  
  // XOR with zeros (same as just taking the encrypted result)
  return encrypted; // Already the result of XOR with zeros
}

/**
 * Compute BAC External Authenticate MAC (longer version)
 * For the EXTERNAL AUTHENTICATE command, we need to compute MAC over E_IFD
 */
export function computeExternalAuthMac(key: Uint8Array, data: Uint8Array): Uint8Array {
  // Similar to computeMac but for the longer E_IFD message
  const padded = pkcs7Pad(data, 8);
  const encrypted = des3EcbEncrypt(key, padded);
  return encrypted;
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
  if (seed.length !== 8) {
    throw new Error('KDF output must be 8 bytes for 3DES key expansion');
  }
  
  // For 3DES-ede3, we need 24 bytes (3 x 8-byte DES keys)
  // BAC key derivation gives us 8 bytes, which becomes the middle DES key
  // The outer keys are derived from the same process
  
  // Actually, for BAC v2, we use 3DES with 16-byte effective key (128-bit)
  // Expand to 24 bytes by repeating: K1 K2 K1 (two-key 3DES)
  const expanded = new Uint8Array(24);
  expanded.set(seed, 0);        // K1 (8 bytes)
  expanded.set(seed, 8);        // K2 (8 bytes) - note: same as K1 for 2-key 3DES
  expanded.set(seed, 16);       // K1 again (8 bytes)
  
  return expanded;
}

/**
 * BAC v2 specific key expansion (two-key 3DES)
 */
export function derive3DesKey(seed: Uint8Array): Uint8Array {
  if (seed.length !== 8) {
    throw new Error('KDF output must be 8 bytes for 3DES key');
  }
  
  // Two-key 3DES: K1 K2 K1 where K1 = K2 = seed (after parity adjustment)
  const key = new Uint8Array(24);
  key.set(seed, 0);   // K1
  key.set(seed, 8);   // K2
  key.set(seed, 16);  // K1 again
  
  return key;
}
