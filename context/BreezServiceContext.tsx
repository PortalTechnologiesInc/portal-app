import React, { createContext, useContext, useState, useMemo, useEffect, useCallback } from 'react';
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
  getInfo?: () => Promise<GetInfoResponse>;
}

// Provider component
interface BreezServiceProviderProps {
  children: React.ReactNode;
}

export const BreezeServiceProvider: React.FC<BreezServiceProviderProps> = ({ children }) => {
  const { mnemonic } = useMnemonic();
  const seed = useMemo(
    () => (mnemonic ? new Seed.Mnemonic({ mnemonic, passphrase: undefined }) : undefined),
    [mnemonic]
  );
  const config = useMemo(() => {
    let config = defaultConfig(Network.Mainnet);
    config.apiKey = process.env.EXPO_PUBLIC_BREEZ_API_KEY;
    return config;
  }, []);
  const [sdk, setSdk] = useState<BreezSdkInterface | undefined>(undefined);

  useEffect(() => {
    const connectFn = async () => {
      if (!config || !seed) {
        return;
      }

      setSdk(await connect({ config, seed, storageDir: `${FileSystem.documentDirectory}/data` }));
    };
    connectFn();

    return () => {
      if (sdk) {
        sdk.disconnect();
      }
    };
  }, [config, sdk, seed]);

  const getInfo = useCallback(async () => {
    if (!sdk) {
      throw new Error('SDK not initialized');
    }

    return await sdk.getInfo({
      ensureSynced: false,
    });
  }, [sdk]);

  const contextValue: BreezServiceContextType = {
    getInfo,
  };

  return (
    <BreezServiceContext.Provider value={contextValue}>{children}</BreezServiceContext.Provider>
  );
};

// Hook to use the NostrService context
export const useBreezService = () => {
  const context = useContext(BreezServiceContext);
  if (!context) {
    throw new Error('useNostrService must be used within a NostrServiceProvider');
  }
  return context;
};

export default BreezeServiceProvider;
