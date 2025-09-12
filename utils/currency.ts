/**
 * Supported currencies
 */
export enum Currency {
  SATS = 'SATS',
  BTC = 'BTC',
  USD = 'USD',
  EUR = 'EUR',
  GBP = 'GBP',
  JPY = 'JPY',
  CAD = 'CAD',
  AUD = 'AUD',
  CHF = 'CHF',
  CNY = 'CNY',
  KRW = 'KRW',
  // Add more currencies as needed
}

/**
 * Currency configuration for display and formatting
 */
export interface CurrencyConfig {
  code: Currency;
  symbol: string;
  name: string;
  displayName: string;
}

/**
 * All available currency configurations
 */
export const CURRENCY_CONFIGS: Record<Currency, CurrencyConfig> = {
  [Currency.SATS]: {
    code: Currency.SATS,
    symbol: 'sats',
    name: 'SATS',
    displayName: 'Satoshis (sats)',
  },
  [Currency.BTC]: {
    code: Currency.BTC,
    symbol: '₿',
    name: 'BTC',
    displayName: 'Bitcoin (₿)',
  },
  [Currency.USD]: {
    code: Currency.USD,
    symbol: '$',
    name: 'USD',
    displayName: 'US Dollar ($)',
  },
  [Currency.EUR]: {
    code: Currency.EUR,
    symbol: '€',
    name: 'EUR',
    displayName: 'Euro (€)',
  },
  [Currency.GBP]: {
    code: Currency.GBP,
    symbol: '£',
    name: 'GBP',
    displayName: 'British Pound (£)',
  },
  [Currency.JPY]: {
    code: Currency.JPY,
    symbol: '¥',
    name: 'JPY',
    displayName: 'Japanese Yen (¥)',
  },
  [Currency.CAD]: {
    code: Currency.CAD,
    symbol: 'C$',
    name: 'CAD',
    displayName: 'Canadian Dollar (C$)',
  },
  [Currency.AUD]: {
    code: Currency.AUD,
    symbol: 'A$',
    name: 'AUD',
    displayName: 'Australian Dollar (A$)',
  },
  [Currency.CHF]: {
    code: Currency.CHF,
    symbol: 'CHF',
    name: 'CHF',
    displayName: 'Swiss Franc (CHF)',
  },
  [Currency.CNY]: {
    code: Currency.CNY,
    symbol: '¥',
    name: 'CNY',
    displayName: 'Chinese Yuan (¥)',
  },
  [Currency.KRW]: {
    code: Currency.KRW,
    symbol: '₩',
    name: 'KRW',
    displayName: 'South Korean Won (₩)',
  },
};

/**
 * Helper functions for currency operations
 */
export const CurrencyHelpers = {
  /**
   * Get currency symbol for a given currency
   */
  getSymbol: (currency: Currency): string => {
    return CURRENCY_CONFIGS[currency]?.symbol || currency;
  },

  /**
   * Get currency display name for a given currency
   */
  getDisplayName: (currency: Currency): string => {
    return CURRENCY_CONFIGS[currency]?.displayName || currency;
  },

  /**
   * Get currency name/code for a given currency
   */
  getName: (currency: Currency): string => {
    return CURRENCY_CONFIGS[currency]?.name || currency;
  },

  /**
   * Get all available currencies
   */
  getAllCurrencies: (): Currency[] => {
    return Object.values(Currency);
  },

  /**
   * Get the next currency in the list (cycles through all currencies)
   */
  getNextCurrency: (currentCurrency: Currency): Currency => {
    const currencies = CurrencyHelpers.getAllCurrencies();
    const currentIndex = currencies.indexOf(currentCurrency);
    const nextIndex = (currentIndex + 1) % currencies.length;
    return currencies[nextIndex];
  },

  /**
   * Format amount with currency symbol
   */
  formatAmount: (amount: number, currency: Currency): string => {
    const symbol = CurrencyHelpers.getSymbol(currency);
    return `${symbol}${amount}`;
  },

  /**
   * Check if a currency is valid
   */
  isValidCurrency: (currency: string): currency is Currency => {
    return Object.values(Currency).includes(currency as Currency);
  },
};

/**
 * Decide whether to show a converted amount given original and converted values.
 */
export const shouldShowConvertedAmount = (params: {
  amount: number | null | undefined;
  originalCurrency: string | null | undefined;
  convertedCurrency: string | null | undefined;
}): boolean => {
  const { amount, originalCurrency, convertedCurrency } = params;
  const original = originalCurrency?.toUpperCase();
  const converted = convertedCurrency?.toUpperCase();
  return amount !== null && amount !== undefined && !!converted && converted !== original;
};
