import { Currency, CurrencyHelpers } from '@/utils/currency';

/**
 * Mock exchange rates for development
 * In production, this would be fetched from a real API
 */
const MOCK_EXCHANGE_RATES: Record<string, number> = {
  SATS: 1, // Base unit
  BTC: 0.00000001, // 1 sat = 0.00000001 BTC
  USD: 0.0004, // 1 sat = ~$0.0004
  EUR: 0.00037, // 1 sat = ~€0.00037
  GBP: 0.00032, // 1 sat = ~£0.00032
  JPY: 0.06, // 1 sat = ~¥0.06
  CAD: 0.00055, // 1 sat = ~C$0.00055
  AUD: 0.00061, // 1 sat = ~A$0.00061
  CHF: 0.00036, // 1 sat = ~CHF0.00036
  CNY: 0.0029, // 1 sat = ~¥0.0029
  KRW: 0.54, // 1 sat = ~₩0.54
};

/**
 * Currency conversion service for converting amounts between different currencies
 */
export class CurrencyConversionService {
  /**
   * Convert amount from one currency to another
   * @param amount - The amount to convert
   * @param fromCurrency - Source currency
   * @param toCurrency - Target currency
   * @returns Promise<number> - Converted amount
   */
  static async convertAmount(
    amount: number,
    fromCurrency: string,
    toCurrency: string
  ): Promise<number> {
    try {
      // For now, always return 5 of the target currency as requested
      // This is a mock implementation for development
      return 5;

      // Future implementation would look like this:
      // const fromRate = MOCK_EXCHANGE_RATES[fromCurrency] || 1;
      // const toRate = MOCK_EXCHANGE_RATES[toCurrency] || 1;
      // return (amount * fromRate) / toRate;
    } catch (error) {
      console.error('Currency conversion error:', error);
      throw new Error('Failed to convert currency');
    }
  }

  /**
   * Format converted amount with currency symbol
   * @param amount - The converted amount
   * @param currency - The target currency
   * @returns Formatted string with currency symbol
   */
  static formatConvertedAmount(amount: number, currency: Currency): string {
    const symbol = CurrencyHelpers.getSymbol(currency);

    // Handle different currency symbol positions
    if (currency === Currency.SATS) {
      return `≈ ${amount.toFixed(2)} ${symbol}`;
    } else {
      return `≈ ${symbol}${amount.toFixed(2)}`;
    }
  }

  /**
   * Format converted amount with "N/A" fallback for errors
   * @param amount - The converted amount (or null/undefined for errors)
   * @param currency - The target currency
   * @returns Formatted string or "N/A"
   */
  static formatConvertedAmountWithFallback(
    amount: number | null | undefined,
    currency: Currency
  ): string {
    if (amount === null || amount === undefined || isNaN(amount)) {
      return 'N/A';
    }
    return CurrencyConversionService.formatConvertedAmount(amount, currency);
  }

  /**
   * Get exchange rate between two currencies
   * @param fromCurrency - Source currency
   * @param toCurrency - Target currency
   * @returns Exchange rate
   */
  static getExchangeRate(fromCurrency: string, toCurrency: string): number {
    const fromRate = MOCK_EXCHANGE_RATES[fromCurrency] || 1;
    const toRate = MOCK_EXCHANGE_RATES[toCurrency] || 1;
    return fromRate / toRate;
  }
}

/**
 * Interface for exchange rate data
 */
export interface ExchangeRates {
  [currency: string]: number;
}

/**
 * Interface for conversion request
 */
export interface ConversionRequest {
  amount: number;
  fromCurrency: string;
  toCurrency: string;
}

/**
 * Interface for conversion response
 */
export interface ConversionResponse {
  originalAmount: number;
  convertedAmount: number;
  fromCurrency: string;
  toCurrency: string;
  exchangeRate: number;
  timestamp: Date;
}
