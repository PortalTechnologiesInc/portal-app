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
   * @param fromC - Source currency
   * @param toC - Target currency
   * @returns Promise<number> - Converted amount
   */
  static async convertAmount(amount: number, fromC: string, toC: string): Promise<number> {
    const fromCurrency = fromC.toUpperCase();
    const toCurrency = toC.toUpperCase();
    try {
      switch (true) {
        case !isFinite(amount) || amount <= 0:
          return 0;
        case fromCurrency == toCurrency:
          return amount;

        // btc, sats, millisats cases
        case fromCurrency == Currency.BTC && toCurrency == Currency.SATS:
          return amount * 100_000_000;
        case fromCurrency == Currency.BTC && toCurrency == Currency.MSATS:
          return amount * 100_000_000_000;
        case fromCurrency == Currency.SATS && toCurrency == Currency.BTC:
          return amount / 100_000_000;
        case fromCurrency == Currency.SATS && toCurrency == Currency.MSATS:
          return amount * 1000;
        case fromCurrency == Currency.MSATS && toCurrency == Currency.BTC:
          return amount / 100_000_000_000;
        case fromCurrency == Currency.MSATS && toCurrency == Currency.SATS:
          return amount / 1000;

        // from btc, sats or millisats to fiat cases
        case fromCurrency == Currency.BTC &&
          toCurrency != Currency.SATS &&
          toCurrency != Currency.MSATS: {
          const btcPriceTo = await CurrencyConversionService.getBtcPriceForCurrency(toCurrency);
          return amount * btcPriceTo;
        }
        case fromCurrency == Currency.SATS &&
          toCurrency != Currency.BTC &&
          toCurrency != Currency.MSATS: {
          const btcPriceTo = await CurrencyConversionService.getBtcPriceForCurrency(toCurrency);
          return (amount * btcPriceTo) / 100_000_000;
        }
        case fromCurrency == Currency.MSATS &&
          toCurrency != Currency.BTC &&
          toCurrency != Currency.SATS: {
          const btcPriceTo = await CurrencyConversionService.getBtcPriceForCurrency(toCurrency);
          return (amount * btcPriceTo) / 100_000_000_000;
        }

        // from fiat to btc, sats or millisats cases
        case fromCurrency != Currency.SATS &&
          fromCurrency != Currency.MSATS &&
          toCurrency == Currency.BTC: {
          const btcPriceFrom = await CurrencyConversionService.getBtcPriceForCurrency(fromCurrency);
          return amount / btcPriceFrom;
        }
        case fromCurrency != Currency.BTC &&
          fromCurrency != Currency.MSATS &&
          toCurrency == Currency.SATS: {
          const btcPriceFrom = await CurrencyConversionService.getBtcPriceForCurrency(fromCurrency);
          return (amount / btcPriceFrom) * 100_000_000;
        }
        case fromCurrency != Currency.BTC &&
          fromCurrency != Currency.SATS &&
          toCurrency == Currency.MSATS: {
          const btcPriceFrom = await CurrencyConversionService.getBtcPriceForCurrency(fromCurrency);
          return (amount / btcPriceFrom) * 100_000_000_000;
        }

        // from fiat to fiat case
        default: {
          const btcPriceFrom = await CurrencyConversionService.getBtcPriceForCurrency(fromCurrency);
          const btcPriceTo = await CurrencyConversionService.getBtcPriceForCurrency(toCurrency);
          return (amount * btcPriceTo) / btcPriceFrom;
        }
      }
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
