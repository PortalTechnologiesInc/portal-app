import * as Constants from 'expo-constants';

export type AgeVerificationConfig = {
  mintUrl: string;
  ticketUnit: string;
};

const getAgeVerificationConfigFromExpo = (): AgeVerificationConfig | undefined => {
  // app.config.ts -> `expoConfig.extra.ageVerification`
  const extra = (Constants as any)?.default?.expoConfig?.extra;
  const cfg = extra?.ageVerification;

  const mintUrl = typeof cfg?.mintUrl === 'string' ? cfg.mintUrl : undefined;
  const ticketUnit = typeof cfg?.ticketUnit === 'string' ? cfg.ticketUnit : undefined;

  if (!mintUrl || !ticketUnit) return undefined;

  return { mintUrl, ticketUnit };
};

export const isAgeVerificationTicket = (mintUrl?: string, unit?: string): boolean => {
  if (!mintUrl || !unit) return false;
  const config = getAgeVerificationConfigFromExpo();
  if (!config) return false;
  return mintUrl === config.mintUrl && unit.toLowerCase() === config.ticketUnit.toLowerCase();
};
