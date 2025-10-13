import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import * as FileSystem from 'expo-file-system';
import { useMnemonic } from './MnemonicContext';
import {
  Seed,
  defaultConfig,
  Network,
  connect,
  BreezSdkInterface,
  GetInfoResponse,
} from '@breeztech/breez-sdk-spark-react-native';

// Create context with default values
const BreezServiceContext = createContext<BreezServiceContextType | null>(null);

// Context type definition
export interface BreezServiceContextType {
  isInitialized: boolean;
  balanceInSats?: bigint;
  refreshWalletInfo: () => Promise<GetInfoResponse>;
}

// Provider component
interface BreezServiceProviderProps {
  children: React.ReactNode;
}

export const BreezeServiceProvider: React.FC<BreezServiceProviderProps> = ({ children }) => {
  const { mnemonic } = useMnemonic();
  const sdk = useRef<BreezSdkInterface | undefined>(undefined);
  const [isInitialized, setIsInitialized] = useState(false);
  const [walletInfo, setWalletInfo] = useState<GetInfoResponse | undefined>(undefined);
  const isCancelledRef = useRef(false);

  // Initialize Breez SDK when mnemonic is available
  useEffect(() => {
    if (!mnemonic || mnemonic.trim() === '') {
      console.info('Mnemonic is not available yet. Cannot initialize Breez SDK.');
      return;
    }

    if (isInitialized) {
      console.info('Breez SDK is already initialized.');
      return;
    }

    setIsInitialized(false);
    isCancelledRef.current = false;

    const connectSdk = async () => {
      try {
        const seed = new Seed.Mnemonic({ mnemonic, passphrase: undefined });
        const config = defaultConfig(Network.Mainnet);
        config.apiKey = process.env.EXPO_PUBLIC_BREEZ_API_KEY;

        const sdkInstance = await connect({
          config,
          seed,
          storageDir: FileSystem.documentDirectory + 'breez-wallet',
        });

        if (isCancelledRef.current) {
          sdkInstance.disconnect();
          return;
        }

        sdk.current = sdkInstance;
        setIsInitialized(true);
      } catch (error) {
        if (!isCancelledRef.current) {
          console.error('Error initializing Breez SDK:', error);
        }
      }
    };

    connectSdk();

    return () => {
      isCancelledRef.current = true;
      setIsInitialized(false);
      if (sdk.current) {
        sdk.current.disconnect();
        sdk.current = undefined;
      }
    };
  }, [mnemonic, isInitialized]);

  const getWalletInfo = useCallback(async (sdk: BreezSdkInterface) => {
    return sdk.getInfo({
      ensureSynced: false,
    });
  }, []);

  const refreshWalletInfo = useCallback(async () => {
    if (!sdk.current) {
      throw new Error('Breez SDK is not initialized');
    }

    try {
      const info = await getWalletInfo(sdk.current);
      if (!isCancelledRef.current) {
        setWalletInfo(info);
      }
      return info;
    } catch (error) {
      console.error('Error refreshing wallet info:', error);
      throw error;
    }
  }, [getWalletInfo]);

  const contextValue: BreezServiceContextType = {
    isInitialized,
    refreshWalletInfo,
    balanceInSats: walletInfo?.balanceSats,
  };

  return (
    <BreezServiceContext.Provider value={contextValue}>{children}</BreezServiceContext.Provider>
  );
};

// Hook to use the BreezService context
export const useBreezService = () => {
  const context = useContext(BreezServiceContext);
  if (!context) {
    throw new Error('useBreezService must be used within a BreezServiceProvider');
  }
  return context;
};

export default BreezeServiceProvider;
