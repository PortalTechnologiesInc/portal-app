const crypto = require('crypto');

// ICAO 9303 Part 11 Section D.3 test vector
function charValue(ch) {
  if (ch === '<') return 0;
  if (ch >= '0' && ch <= '9') return ch.charCodeAt(0) - 48;
  if (ch >= 'A' && ch <= 'Z') return ch.charCodeAt(0) - 55;
  throw new Error('bad char: ' + ch);
}
function checkDigit(s) {
  const w = [7, 3, 1];
  let sum = 0;
  for (let i = 0; i < s.length; i++) sum += charValue(s[i]) * w[i % 3];
  return '' + (sum % 10);
}

const docNum = 'L898902C<';
const dob = '690806';
const expiry = '940623';

console.log('Check digits:');
console.log('  docNum check:', checkDigit(docNum), '(expect 3)');
console.log('  dob check:', checkDigit(dob), '(expect 1)');
console.log('  expiry check:', checkDigit(expiry), '(expect 6)');

const seed = docNum + checkDigit(docNum) + dob + checkDigit(dob) + expiry + checkDigit(expiry);
console.log('\nseed:', JSON.stringify(seed), 'len:', seed.length, '(expect 24)');

// SHA1 of seed bytes (ASCII) → 20 bytes
const mrzKeyBuf = crypto.createHash('sha1').update(Buffer.from(seed, 'ascii')).digest();
console.log('mrzKey (full SHA1):', mrzKeyBuf.toString('hex'));

// ICAO 9303 Section 9.7.1: Kseed = most significant 16 bytes of SHA-1 hash
const kseed = mrzKeyBuf.slice(0, 16);
console.log('Kseed (first 16 bytes):', kseed.toString('hex'));

// KDF for K_enc: SHA1(Kseed[16] || 0x00000001) → take first 16 bytes
const kEncInput = Buffer.alloc(20);
kseed.copy(kEncInput, 0);
kEncInput[16] = 0x00;
kEncInput[17] = 0x00;
kEncInput[18] = 0x00;
kEncInput[19] = 0x01;
const kEncSeed = crypto.createHash('sha1').update(kEncInput).digest();
console.log('\nK_enc seed (full SHA1):', kEncSeed.toString('hex'));
const kEnc16 = kEncSeed.slice(0, 16);
console.log('K_enc (first 16 bytes):', kEnc16.toString('hex'));

// KDF for K_mac: SHA1(Kseed[16] || 0x00000002) → take first 16 bytes
const kMacInput = Buffer.alloc(20);
kseed.copy(kMacInput, 0);
kMacInput[16] = 0x00;
kMacInput[17] = 0x00;
kMacInput[18] = 0x00;
kMacInput[19] = 0x02;
const kMacSeed = crypto.createHash('sha1').update(kMacInput).digest();
console.log('\nK_mac seed (full SHA1):', kMacSeed.toString('hex'));
const kMac16 = kMacSeed.slice(0, 16);
console.log('K_mac (first 16 bytes):', kMac16.toString('hex'));

// Parity adjustment for DES keys
function adjustParity(buf) {
  const adjusted = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i];
    let bitCount = 0;
    let temp = b;
    while (temp > 0) {
      bitCount += temp & 1;
      temp >>= 1;
    }
    adjusted[i] = bitCount % 2 === 0 ? b ^ 1 : b;
  }
  return adjusted;
}

const kEncAdj = adjustParity(kEnc16);
const kMacAdj = adjustParity(kMac16);
console.log('\nK_enc (parity adjusted):', kEncAdj.toString('hex'));
console.log('K_mac (parity adjusted):', kMacAdj.toString('hex'));

// Expected from ICAO 9303:
console.log('\n--- Expected (ICAO 9303 D.3) ---');
console.log('K_enc expected: ab94fdecf2674fdfb9b391f85d7f76f2');
console.log('K_mac expected: 7962d9ece03d1acd4c76089dce131543');

// Test 3DES encryption
const kEnc24 = Buffer.alloc(24);
kEncAdj.slice(0, 8).copy(kEnc24, 0);
kEncAdj.slice(8, 16).copy(kEnc24, 8);
kEncAdj.slice(0, 8).copy(kEnc24, 16);
const testS = Buffer.alloc(32, 0xab);
const cipher = crypto.createCipheriv('des-ede3-cbc', kEnc24, Buffer.alloc(8, 0));
cipher.setAutoPadding(false);
const eIfd = Buffer.concat([cipher.update(testS), cipher.final()]);
console.log('\nE_IFD len:', eIfd.length, '(should be 32)');
console.log('E_IFD:', eIfd.toString('hex'));

// Summary
const kEncMatch = kEncAdj.toString('hex') === 'ab94fdecf2674fdfb9b391f85d7f76f2';
const kMacMatch = kMacAdj.toString('hex') === '7962d9ece03d1acd4c76089dce131543';
console.log('\n=== RESULTS ===');
console.log('K_enc matches ICAO:', kEncMatch ? '✅ PASS' : '❌ FAIL');
console.log('K_mac matches ICAO:', kMacMatch ? '✅ PASS' : '❌ FAIL');
