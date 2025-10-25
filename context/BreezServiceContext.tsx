import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import * as FileSystem from 'expo-file-system';
import { useMnemonic } from './MnemonicContext';
import {
  Seed,
  defaultConfig,
  Network,
  connect,
  BreezSdkInterface,
  GetInfoResponse,
  ReceivePaymentMethod,
  SendPaymentOptions,
  EventListener,
  PrepareSendPaymentResponse,
  SendPaymentMethod,
  OnchainConfirmationSpeed,
} from '@breeztech/breez-sdk-spark-react-native';

// Create context with default values
const BreezServiceContext = createContext<BreezServiceContextType | null>(null);

type ReceivePaymentFn = (receivePaymentMethod: ReceivePaymentMethod) => Promise<string>;
type PrepareSendPaymentFn = (
  paymentRequest: string,
  amountSats: bigint
) => Promise<PrepareSendPaymentResponse>;
type SendPaymentFn = (prepareResponse: PrepareSendPaymentResponse) => Promise<void>;

// Context type definition
export interface BreezServiceContextType {
  balanceInSats?: bigint;
  refreshWalletInfo: () => Promise<void>;
  receivePayment: ReceivePaymentFn;
  prepareSendPaymentRequest: PrepareSendPaymentFn;
  sendPayment: SendPaymentFn;
  addEventListener: (callback: EventListener) => Promise<string>;
  removeEventListener: (listenerId: string) => Promise<boolean>;
}

// Provider component
interface BreezServiceProviderProps {
  children: React.ReactNode;
}

export const BreezeServiceProvider: React.FC<BreezServiceProviderProps> = ({ children }) => {
  const { mnemonic } = useMnemonic();
  const [client, setClient] = useState<BreezSdkInterface | undefined>(undefined);
  const [walletInfo, setWalletInfo] = useState<GetInfoResponse | undefined>(undefined);

  // Initialize Breez SDK when mnemonic is available
  useEffect(() => {
    if (!mnemonic || mnemonic.trim() === '') {
      console.info('Mnemonic is not available yet. Cannot initialize Breez SDK.');
      return;
    }

    let isCancelled = false;
    let clientInstance: BreezSdkInterface;

    const connectSdk = async () => {
      try {
        const seed = new Seed.Mnemonic({ mnemonic, passphrase: undefined });
        const config = defaultConfig(Network.Mainnet);
        config.apiKey = process.env.EXPO_PUBLIC_BREEZ_API_KEY;

        const dirUri = FileSystem.documentDirectory + 'breez-wallet';
        const storageDir = dirUri.replace('file://', '');
        await FileSystem.makeDirectoryAsync(dirUri, { intermediates: true });

        clientInstance = await connect({
          config,
          seed,
          storageDir,
        });

        if (isCancelled) {
          return;
        }

        setClient(clientInstance);
      } catch (error) {
        console.error('Error initializing Breez SDK:', JSON.stringify(error));
      }
    };

    connectSdk();

    return () => {
      isCancelled = true;
      clientInstance?.disconnect();
      setClient(undefined);
    };
  }, [mnemonic]);

  const refreshWalletInfo = useCallback(async () => {
    if (!client) {
      return;
    }

    try {
      const info = await client.getInfo({
        ensureSynced: false,
      });
      setWalletInfo(info);
    } catch (error) {
      console.error('Error refreshing wallet info:', error);
      throw error;
    }
  }, [client]);

  useEffect(() => {
    refreshWalletInfo();
  }, [refreshWalletInfo]);

  const receivePayment = useCallback<ReceivePaymentFn>(
    async receivePaymentMethod => {
      if (!client) {
        throw new Error('Breez SDK is not initialized');
      }

      try {
        const response = await client.receivePayment({
          paymentMethod: receivePaymentMethod,
        });

        console.log(response.paymentRequest);
        return response.paymentRequest;
      } catch (error) {
        console.error('Error getting invoice:', error);
        throw error;
      }
    },
    [client]
  );

  const prepareSendPaymentRequest = useCallback<PrepareSendPaymentFn>(
    async (paymentRequest, amountSats) => {
      if (!client) {
        throw new Error('Breez SDK is not initialized');
      }

      try {
        const prepareResponse = await client.prepareSendPayment({
          amountSats,
          paymentRequest,
        });

        return prepareResponse;
      } catch (error) {
        console.error('Error preparing send payment:', error);
        throw error;
      }
    },
    [client]
  );

  const sendPayment = useCallback<SendPaymentFn>(
    async prepareResponse => {
      if (!client) {
        throw new Error('Breez SDK is not initialized');
      }

      try {
        let sendOptions = undefined;
        if (prepareResponse.paymentMethod instanceof SendPaymentMethod.Bolt11Invoice) {
          sendOptions = new SendPaymentOptions.Bolt11Invoice({
            preferSpark: false,
            completionTimeoutSecs: 10,
          });
        } else if (prepareResponse.paymentMethod instanceof SendPaymentMethod.BitcoinAddress) {
          sendOptions = new SendPaymentOptions.BitcoinAddress({
            confirmationSpeed: OnchainConfirmationSpeed.Medium,
          });
        }

        const sendResponse = await client.sendPayment({
          prepareResponse,
          options: sendOptions,
        });

        console.log(sendResponse);
      } catch (error) {
        console.error('Error getting invoice:', error);
        throw error;
      }
    },
    [client]
  );

  const addEventListener = useCallback(
    (callback: EventListener) => {
      if (!client) {
        throw new Error('Breez SDK is not initialized');
      }
      return client.addEventListener(callback);
    },
    [client]
  );

  const removeEventListener = useCallback(
    (listenerId: string) => {
      if (!client) {
        throw new Error('Breez SDK is not initialized');
      }
      return client.removeEventListener(listenerId);
    },
    [client]
  );

  const contextValue: BreezServiceContextType = {
    balanceInSats: walletInfo?.balanceSats,
    refreshWalletInfo,
    receivePayment,
    prepareSendPaymentRequest,
    sendPayment,
    addEventListener,
    removeEventListener,
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
