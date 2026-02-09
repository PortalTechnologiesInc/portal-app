import { Mnemonic, Nsec } from 'portal-app-lib';

export type ValidationResult = { isValid: true } | { isValid: false; error: string };

export function validateImportedMnemonic(phrase: string): ValidationResult {
  const trimmedPhrase = phrase.trim().toLowerCase();

  if (!trimmedPhrase) {
    return { isValid: false, error: 'Please enter a seed phrase.' };
  }

  const words = trimmedPhrase.split(/\s+/);
  if (words.length !== 12) {
    return { isValid: false, error: 'Seed phrase must be exactly 12 words' };
  }

  try {
    // portal-app-lib validates via constructor; throws on invalid mnemonic.
    new Mnemonic(trimmedPhrase);
    return { isValid: true };
  } catch {
    return {
      isValid: false,
      error: 'Invalid seed phrase. Please check your words and try again.',
    };
  }
}

export function validateImportedNsec(nsec: string): ValidationResult {
  const trimmedNsec = nsec.trim().toLowerCase();

  if (!trimmedNsec) {
    return { isValid: false, error: 'Please enter an nsec.' };
  }

  try {
    new Nsec(trimmedNsec);
    return { isValid: true };
  } catch (error) {
    return {
      isValid: false,
      error:
        error instanceof Error ? error.message : 'Invalid Nsec. Please check your Nsec and try again.',
    };
  }
}

export type VerificationChallenge = {
  word1: { index: number; value: string };
  word2: { index: number; value: string };
};

export function createVerificationChallenge(seedPhrase: string): VerificationChallenge {
  const words = seedPhrase.split(' ');
  const randomIndex1 = Math.floor(Math.random() * 12);
  let randomIndex2 = Math.floor(Math.random() * 12);

  while (randomIndex2 === randomIndex1) {
    randomIndex2 = Math.floor(Math.random() * 12);
  }

  const [firstIndex, secondIndex] = [randomIndex1, randomIndex2].sort((a, b) => a - b);

  return {
    word1: { index: firstIndex, value: words[firstIndex] },
    word2: { index: secondIndex, value: words[secondIndex] },
  };
}

