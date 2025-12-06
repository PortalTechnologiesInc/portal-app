/**
 * Supported currencies
 */
export enum Currency {
  MSATS = 'MSATS',
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
  [Currency.MSATS]: {
    code: Currency.MSATS,
    symbol: 'msats',
    name: 'MSATS',
    displayName: 'Millisatoshis (msats)',
  },
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
 * Normalize currency string for comparison: handle "sats" → "SATS" and uppercase conversion
 * @param curr - Currency string to normalize
 * @returns Normalized currency string or null
 */
export const normalizeCurrencyForComparison = (curr: string | null | undefined): string | null => {
  if (!curr) return null;
  const trimmed = curr.trim();
  if (trimmed.toLowerCase() === 'sats') {
    return Currency.SATS;
  }
  return trimmed.toUpperCase();
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

  const original = normalizeCurrencyForComparison(originalCurrency);
  const converted = normalizeCurrencyForComparison(convertedCurrency);

  return amount !== null && amount !== undefined && !!converted && converted !== original;
};

/**
 * Format activity amount with currency symbol in consistent {currency_symbol}{value} format
 * @param amount - The amount to format (can be null)
 * @param currency - The currency code as string (can be null, will be normalized)
 * @returns Formatted string in {currency_symbol}{value} format, or 'N/A' if invalid
 */
export const formatActivityAmount = (amount: number | null, currency: string | null): string => {
  // Handle null/undefined cases
  if (amount === null || amount === undefined || isNaN(amount)) {
    return 'N/A';
  }

  if (!currency) {
    return amount.toString();
  }

  // Normalize currency string: handle lowercase "sats" and uppercase conversion
  let normalizedCurrency = currency.trim();
  if (normalizedCurrency.toLowerCase() === 'sats') {
    normalizedCurrency = Currency.SATS;
  } else {
    normalizedCurrency = normalizedCurrency.toUpperCase();
  }

  // Try to convert to Currency enum
  let currencyEnum: Currency | null = null;
  if (CurrencyHelpers.isValidCurrency(normalizedCurrency)) {
    currencyEnum = normalizedCurrency as Currency;
  }

  // If we couldn't determine the currency, return amount with original currency string
  if (!currencyEnum) {
    return `${amount.toFixed(2)} ${normalizedCurrency}`;
  }

  // Get currency symbol
  const symbol = CurrencyHelpers.getSymbol(currencyEnum);

  // Format according to currency type
  if (currencyEnum === Currency.SATS) {
    // SATS: whole number with symbol suffix (e.g., "5 sats")
    return `${Math.round(amount)} ${symbol}`;
  }

  if (currencyEnum === Currency.BTC) {
    // BTC: up to 8 decimals, trim trailing zeros
    const fixed = amount.toFixed(8);
    const trimmed = fixed
      .replace(/\.0+$/, '') // remove trailing .0... entirely
      .replace(/(\.\d*?[1-9])0+$/, '$1'); // trim trailing zeros keeping last non-zero
    return `${symbol}${trimmed}`;
  }

  // Fiat and others: 2 decimals with symbol prefix
  return `${symbol}${amount.toFixed(2)}`;
};
