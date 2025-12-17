import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { Currency, CurrencyHelpers } from '../utils/currency';

interface CurrencyContextType {
  preferredCurrency: Currency;
  setPreferredCurrency: (currency: Currency) => void;
  getNextCurrency: () => Currency;
  getCurrentCurrencySymbol: () => string;
  getCurrentCurrencyDisplayName: () => string;
  formatAmount: (amount: number) => string;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [preferredCurrency, setPreferredCurrency] = useState<Currency>(Currency.USD);

  // Load saved currency preference on startup
  useEffect(() => {
    const loadCurrencyPreference = async () => {
      try {
        const savedCurrency = await AsyncStorage.getItem('preferred_currency');
        if (savedCurrency && CurrencyHelpers.isValidCurrency(savedCurrency)) {
          setPreferredCurrency(savedCurrency as Currency);
        }
      } catch (error) {
        console.error('Error loading currency preference:', error);
      }
    };
    loadCurrencyPreference();
  }, []);

  // Save currency preference when it changes
  const handleSetPreferredCurrency = async (currency: Currency) => {
    try {
      setPreferredCurrency(currency);
      await AsyncStorage.setItem('preferred_currency', currency);
    } catch (error) {
      console.error('Error saving currency preference:', error);
    }
  };

  // Get the next currency in the cycle
  const getNextCurrency = (): Currency => {
    return CurrencyHelpers.getNextCurrency(preferredCurrency);
  };

  // Get current currency symbol
  const getCurrentCurrencySymbol = (): string => {
    return CurrencyHelpers.getSymbol(preferredCurrency);
  };

  // Get current currency display name
  const getCurrentCurrencyDisplayName = (): string => {
    return CurrencyHelpers.getDisplayName(preferredCurrency);
  };

  // Format amount with current currency
  const formatAmount = (amount: number): string => {
    return CurrencyHelpers.formatAmount(amount, preferredCurrency);
  };

  return (
    <CurrencyContext.Provider
      value={{
        preferredCurrency,
        setPreferredCurrency: handleSetPreferredCurrency,
        getNextCurrency,
        getCurrentCurrencySymbol,
        getCurrentCurrencyDisplayName,
        formatAmount,
      }}
    >
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (context === undefined) {
    throw new Error('useCurrency must be used within a CurrencyProvider');
  }
  return context;
}

/**
 * Usage Examples:
 *
 * // In any component that needs currency information:
 * import { useCurrency } from '@/context/CurrencyContext';
 *
 * function MyComponent() {
 *   const {
 *     preferredCurrency,
 *     setPreferredCurrency,
 *     getNextCurrency,
 *     getCurrentCurrencySymbol,
 *     getCurrentCurrencyDisplayName,
 *     formatAmount
 *   } = useCurrency();
 *
 *   // Display formatted amount with preferred currency
 *   const displayPrice = formatAmount(100); // e.g., "$100" or "€100"
 *
 *   // Cycle to next currency
 *   const handleCurrencyChange = () => {
 *     const nextCurrency = getNextCurrency();
 *     setPreferredCurrency(nextCurrency);
 *   };
 *
 *   return (
 *     <View>
 *       <Text>Price: {displayPrice}</Text>
 *       <Text>Currency: {getCurrentCurrencyDisplayName()}</Text>
 *       <Button title="Change Currency" onPress={handleCurrencyChange} />
 *     </View>
 *   );
 * }
 */
