import { Mnemonic, Nsec, KeypairInterface } from 'portal-app-lib';

/**
 * Type representing available key material
 * NOTE: Mnemonic and nsec are MUTUALLY EXCLUSIVE:
 * - If mnemonic exists: nsec can be derived from it when needed
 * - If nsec exists: only nsec is stored, no mnemonic
 */
export type KeyMaterial = {
  mnemonic?: string | null;
  nsec?: string | null;
};

/**
 * Key type detection
 */
export type KeyType = 'mnemonic' | 'nsec' | null;

/**
 * Check if a string is in nsec format (bech32 encoded private key)
 * Validates format by checking prefix and bech32 characters, but doesn't enforce exact length
 * since nsec can have variable lengths. Actual validation happens when creating Nsec object.
 */
export function isNsec(value: string): boolean {
  if (!value || typeof value !== 'string') {
    return false;
  }
  const trimmed = value.trim().toLowerCase();
  // Nsec format: nsec1 followed by bech32 characters (variable length, typically 52-63 chars)
  // Minimum length check: nsec1 (5) + at least 32 bech32 chars for a valid private key
  return /^nsec1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{32,}$/.test(trimmed);
}

/**
 * Check if a string is in mnemonic format (12 words)
 */
export function isMnemonic(value: string): boolean {
  if (!value || typeof value !== 'string') {
    return false;
  }
  const words = value.trim().split(/\s+/);
  return words.length === 12;
}

/**
 * Detect the type of a key string
 */
export function getKeyType(key: string | null): KeyType {
  if (!key) {
    return null;
  }
  if (isNsec(key)) {
    return 'nsec';
  }
  if (isMnemonic(key)) {
    return 'mnemonic';
  }
  return null;
}

/**
 * Check if key material has either mnemonic or nsec
 * Since they're mutually exclusive, only one should exist
 */
export function hasKey(key: KeyMaterial): boolean {
  return Boolean(key.mnemonic?.trim() || key.nsec?.trim());
}

/**
 * Get the available key type from key material
 * Returns whichever exists (they're mutually exclusive)
 */
export function getAvailableKeyType(key: KeyMaterial): KeyType {
  if (key.mnemonic?.trim()) {
    return 'mnemonic';
  }
  if (key.nsec?.trim()) {
    return 'nsec';
  }
  return null;
}

/**
 * Create Keypair from nsec using Nsec class
 */
function keypairFromNsec(nsec: string): KeypairInterface {
  const trimmed = nsec.trim().toLowerCase();
  if (!isNsec(trimmed)) {
    throw new Error('Invalid nsec format');
  }

  try {
    // Create Nsec object and get keypair from it
    const nsecObj = new Nsec(trimmed);
    return nsecObj.getKeypair();
  } catch (error) {
    throw new Error(`Failed to create keypair from nsec: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get Keypair from either mnemonic or nsec
 * Since they're mutually exclusive, only one will exist
 */
export function getKeypairFromKey(key: KeyMaterial): KeypairInterface {
  if (!hasKey(key)) {
    throw new Error('No valid key material found. Please provide either mnemonic or nsec.');
  }

  // Use mnemonic if available
  if (key.mnemonic?.trim()) {
    try {
      const mnemonicObj = new Mnemonic(key.mnemonic.trim());
      return mnemonicObj.getKeypair();
    } catch (error) {
      throw new Error(`Failed to create keypair from mnemonic: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Use nsec if available (mnemonic and nsec are mutually exclusive)
  if (key.nsec?.trim()) {
    try {
      return keypairFromNsec(key.nsec.trim());
    } catch (error) {
      throw new Error(`Failed to create keypair from nsec: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  throw new Error('No valid key material found');
}

/**
 * Derive nsec from mnemonic
 * Used when exporting nsec in settings (mnemonic → keypair → nsec)
 */
export function deriveNsecFromMnemonic(mnemonic: string): string {
  if (!mnemonic?.trim()) {
    throw new Error('Mnemonic is required to derive nsec');
  }

  try {
    const mnemonicObj = new Mnemonic(mnemonic.trim());
    const keypair = mnemonicObj.getKeypair();
    
    // Use keypair.nsec() method to get nsec string
    return keypair.nsec();
  } catch (error) {
    throw new Error(`Failed to derive nsec from mnemonic: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get Cashu seed from key material
 * Supports both mnemonic and nsec formats
 * - If mnemonic exists: uses Mnemonic.deriveCashu()
 * - If nsec exists: uses Nsec.deriveCashu()
 */
export function getCashuSeedFromKey(key: KeyMaterial): Buffer {
  if (!hasKey(key)) {
    throw new Error('No valid key material found. Please provide either mnemonic or nsec.');
  }

  // Cashu seed derivation from mnemonic
  if (key.mnemonic?.trim()) {
    try {
      const mnemonicObj = new Mnemonic(key.mnemonic.trim());
      const cashuSeed = mnemonicObj.deriveCashu();
      // Convert ArrayBuffer to Buffer if needed
      return Buffer.from(cashuSeed);
    } catch (error) {
      throw new Error(`Failed to derive Cashu seed from mnemonic: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Cashu seed derivation from nsec using Nsec.deriveCashu()
  if (key.nsec?.trim()) {
    try {
      const nsecObj = new Nsec(key.nsec.trim());
      const cashuSeed = nsecObj.deriveCashu();
      // Convert ArrayBuffer to Buffer if needed
      return Buffer.from(cashuSeed);
    } catch (error) {
      throw new Error(`Failed to derive Cashu seed from nsec: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  throw new Error('No valid key material found');
}

/**
 * Get Mnemonic object from key material
 * Returns null if only nsec is available (can't convert nsec → mnemonic)
 */
export function getMnemonicFromKey(key: KeyMaterial): Mnemonic | null {
  if (key.mnemonic?.trim()) {
    try {
      return new Mnemonic(key.mnemonic.trim());
    } catch (error) {
      throw new Error(`Failed to create Mnemonic object: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Cannot convert nsec to mnemonic (one-way function)
  // If user imported nsec, mnemonic doesn't exist
  return null;
}

/**
 * Get Nsec object from key material
 * Returns null if only mnemonic is available (would need to derive nsec)
 */
export function getNsecFromKey(key: KeyMaterial): Nsec | null {
  if (key.nsec?.trim()) {
    try {
      return new Nsec(key.nsec.trim());
    } catch (error) {
      throw new Error(`Failed to create Nsec object: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Can derive nsec from mnemonic, but returns null here
  // Use deriveNsecFromMnemonic() if you need the nsec string
  return null;
}

/**
 * Get nsec string from key material
 * - If nsec exists: returns the stored nsec string
 * - If mnemonic exists: derives nsec from mnemonic and returns it
 * - Otherwise: throws an error
 * Used for exporting nsec in settings
 */
export function getNsecStringFromKey(key: KeyMaterial): string {
  if (!hasKey(key)) {
    throw new Error('No valid key material found. Please provide either mnemonic or nsec.');
  }

  // If nsec exists, return it directly
  if (key.nsec?.trim()) {
    return key.nsec.trim();
  }

  // If mnemonic exists, derive nsec from it
  if (key.mnemonic?.trim()) {
    return deriveNsecFromMnemonic(key.mnemonic.trim());
  }

  throw new Error('No valid key material found');
}

/**
 * Validate key material and return error message if invalid
 * Ensures mutual exclusivity (only one should exist)
 */
export function validateKeyMaterial(key: KeyMaterial): { isValid: boolean; error?: string } {
  if (!hasKey(key)) {
    return { isValid: false, error: 'No key material provided' };
  }

  // Check if both exist (shouldn't happen, but validate anyway)
  if (key.mnemonic?.trim() && key.nsec?.trim()) {
    return { isValid: false, error: 'Both mnemonic and nsec cannot exist simultaneously' };
  }

  if (key.mnemonic?.trim()) {
    try {
      new Mnemonic(key.mnemonic.trim());
      return { isValid: true };
    } catch (error) {
      return {
        isValid: false,
        error: error instanceof Error ? error.message : 'Invalid mnemonic format',
      };
    }
  }

  if (key.nsec?.trim()) {
    // Validate by trying to create Nsec object
    try {
      new Nsec(key.nsec.trim());
      return { isValid: true };
    } catch (error) {
      return {
        isValid: false,
        error: error instanceof Error ? error.message : 'Invalid nsec format',
      };
    }
  }

  return { isValid: false, error: 'No valid key material found' };
}
