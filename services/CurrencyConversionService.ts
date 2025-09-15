import { MarketApi } from 'portal-app-lib';
import { Currency, CurrencyHelpers } from '@/utils/currency';

/**
 * Currency conversion service for converting amounts between different currencies
 */
export class CurrencyConversionService {
  // Simple in-memory cache for BTC prices by currency code
  private static market = new MarketApi();
  private static priceCache: Map<string, { price: number; ts: number }> = new Map();
  private static readonly CACHE_TTL_MS = 60_000;

  private static async getBtcPriceForCurrency(currencyCode: string): Promise<number> {
    const code = String(currencyCode || '').toUpperCase();
    const now = Date.now();

    const cached = CurrencyConversionService.priceCache.get(code);
    if (cached && now - cached.ts < CurrencyConversionService.CACHE_TTL_MS) {
      return cached.price;
    }

    const marketData = await CurrencyConversionService.market.fetchMarketData(code);
    const btcPrice =
      typeof (marketData as any).rate === 'number' && isFinite((marketData as any).rate)
        ? (marketData as any).rate
        : Number((marketData as any).price);

    if (!isFinite(btcPrice) || btcPrice <= 0) {
      throw new Error('Invalid BTC price received');
    }

    CurrencyConversionService.priceCache.set(code, { price: btcPrice, ts: now });
    return btcPrice;
  }

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
      // Treat input amount as millisatoshis (msats) as provided by payment requests
      const amountMsats = Number(amount);
      if (!isFinite(amountMsats) || amountMsats <= 0) {
        return 0;
      }

      // Fast-path conversions for BTC/SATS without network calls
      if (toCurrency === Currency.SATS || toCurrency === 'SATS') {
        // 1 sat = 1000 msats
        return amountMsats / 1000;
      }

      const sats = amountMsats / 1000; // msats -> sats
      if (toCurrency === Currency.BTC || toCurrency === 'BTC') {
        // 1 BTC = 100,000,000 sats
        return sats / 100_000_000;
      }

      // For fiat and other supported user currencies, fetch BTC price in that currency (with cache)
      const btcPrice = await CurrencyConversionService.getBtcPriceForCurrency(toCurrency);

      const btcAmount = sats / 100_000_000;
      return btcAmount * btcPrice;
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
      // SATS: whole number, symbol after
      return `≈ ${Math.round(amount)} ${symbol}`;
    }

    if (currency === Currency.BTC) {
      // BTC: up to 8 decimals, trim trailing zeros
      const fixed = amount.toFixed(8);
      const trimmed = fixed
        .replace(/\.0+$/, '') // remove trailing .0... entirely
        .replace(/(\.\d*?[1-9])0+$/, '$1'); // trim trailing zeros keeping last non-zero
      return `≈ ${symbol}${trimmed}`;
    }

    // Fiat and others: 2 decimals
    return `≈ ${symbol}${amount.toFixed(2)}`;
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
}
