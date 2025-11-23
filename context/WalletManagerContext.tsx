import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  Wallet,
  WalletType,
  WALLET_TYPE,
  WalletTypeMap,
  WalletConnectionStatus,
  WALLET_CONNECTION_STATUS,
} from '@/models/WalletType';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BreezService } from '@/services/BreezService';
import { NwcService } from '@/services/NwcService';
import { WalletInfo } from '@/utils/types';
import { useKey } from './KeyContext';

export interface WalletManagerContextType {
  activeWallet?: Wallet;
  walletInfo?: WalletInfo;
  switchActiveWallet: (walletType: WalletType) => Promise<void>;
  refreshWalletInfo: () => Promise<void>;
  preferredWallet?: WalletType | null;
  getWallet: <T extends WalletType>(walletType: T) => Promise<WalletTypeMap[T]>;
  walletStatus: Map<WalletType, WalletConnectionStatus>;
  prepareSendPayment: (paymentRequest: string, amountSats: bigint) => Promise<unknown>;
  sendPayment: (paymentRequest: string, amountSats: bigint) => Promise<string>;
  receivePayment: (amountSats: bigint) => Promise<string>;
}

interface WalletManagerContextProviderProps {
  children: React.ReactNode;
}

const WalletManagerContext = createContext<WalletManagerContextType | null>(null);

const PREFERRED_WALLET_KEY = 'preferred_wallet';

export const WalletManagerContextProvider: React.FC<WalletManagerContextProviderProps> = ({
  children,
}) => {
  const { mnemonic, walletUrl } = useKey();

  const [activeWallet, setActiveWallet] = useState<Wallet | undefined>(undefined);
  const [walletInfo, setWalletInfo] = useState<WalletInfo | undefined>(undefined);
  const [preferredWallet, setPreferredWallet] = useState<WalletType | null>(null);

  // Wallet cache
  const walletCacheRef = useRef<Map<WalletType, Wallet>>(new Map());

  const defaultStatuses: Map<WalletType, WalletConnectionStatus> = new Map([
    [WALLET_TYPE.BREEZ, WALLET_CONNECTION_STATUS.DISCONNECTED],
    [WALLET_TYPE.NWC, WALLET_CONNECTION_STATUS.NOT_CONFIGURED],
  ]);

  const [walletStatus, setWalletStatus] = useState<Map<WalletType, WalletConnectionStatus>>(
    new Map(defaultStatuses)
  );

  const onStatusChange = useCallback(
    (walletType: WalletType) => (status: WalletConnectionStatus) => {
      setWalletStatus(prev => new Map(prev).set(walletType, status));
    },
    []
  );

  /**
   * Create or return a cached wallet instance
   */
  const getWallet = useCallback(
    async <T extends WalletType>(walletType: T): Promise<WalletTypeMap[T]> => {
      if (!mnemonic) throw new Error('Missing mnemonic for wallet creation');
      if (walletCacheRef.current.has(walletType)) {
        return walletCacheRef.current.get(walletType)! as WalletTypeMap[T];
      }

      let instance: WalletTypeMap[T];

      switch (walletType) {
        case WALLET_TYPE.BREEZ:
          instance = (await BreezService.create(
            mnemonic,
            onStatusChange(walletType)
          )) as WalletTypeMap[T];
          break;

        case WALLET_TYPE.NWC:
          if (!walletUrl) {
            throw new Error('Missing wallet URL for NWC wallet creation');
          }
          instance = (await NwcService.create(
            walletUrl,
            onStatusChange(walletType)
          )) as WalletTypeMap[T];
          break;

        default:
          throw new Error(`Unsupported wallet type: ${walletType}`);
      }

      walletCacheRef.current.set(walletType, instance);
      return instance;
    },
    [mnemonic, walletUrl, onStatusChange]
  );

  /**
   * Switch active & persist preference (acts as toggle)
   */
  const switchActiveWallet = useCallback(
    async (walletType: WalletType) => {
      const wallet = await getWallet(walletType);

      setActiveWallet(wallet);
      setPreferredWallet(walletType);

      await AsyncStorage.setItem(PREFERRED_WALLET_KEY, JSON.stringify(walletType));
    },
    [getWallet]
  );

  /**
   * Get balance and update state
   */
  const refreshWalletInfo = useCallback(async () => {
    if (!activeWallet) return;
    const balance = await activeWallet.getWalletInfo();
    setWalletInfo(balance);
  }, [activeWallet]);

  /**
   * Restore preferred wallet on mount
   */
  useEffect(() => {
    const init = async () => {
      if (!mnemonic) return;

      const stored = await AsyncStorage.getItem(PREFERRED_WALLET_KEY);

      if (stored) {
        const walletType = JSON.parse(stored) as WalletType;
        await switchActiveWallet(walletType);
      } else {
        // default
        await switchActiveWallet(WALLET_TYPE.BREEZ);
      }
    };

    init();
  }, [mnemonic, switchActiveWallet]);

  /**
   * If wallet url is removed, update global status and switch to breez as preferred
   */
  useEffect(() => {
    if (!walletUrl) {
      setWalletStatus(prev =>
        new Map(prev).set(WALLET_TYPE.NWC, WALLET_CONNECTION_STATUS.NOT_CONFIGURED)
      );
      walletCacheRef.current.delete(WALLET_TYPE.NWC);
      switchActiveWallet(WALLET_TYPE.BREEZ);
    } else {
      walletCacheRef.current.delete(WALLET_TYPE.NWC);
      getWallet(WALLET_TYPE.NWC);
    }
  }, [walletUrl, switchActiveWallet, getWallet]);

  /**
   * Auto-refresh when wallet changes
   */
  useEffect(() => {
    refreshWalletInfo();
  }, [activeWallet, refreshWalletInfo]);

  /**
   * Forwarded wallet actions
   */
  const sendPayment = useCallback(
    async (paymentRequest: string, amountSats: bigint) => {
      if (!activeWallet) throw new Error('No active wallet available');
      return activeWallet.sendPayment(paymentRequest, amountSats);
    },
    [activeWallet]
  );

  const receivePayment = useCallback(
    async (amountSats: bigint) => {
      if (!activeWallet) throw new Error('No active wallet available');
      return activeWallet.receivePayment(amountSats);
    },
    [activeWallet]
  );

  const prepareSendPayment = useCallback(
    async (paymentRequest: string, amountSats: bigint) => {
      if (!activeWallet) throw new Error('No active wallet available');
      return activeWallet.prepareSendPayment(paymentRequest, amountSats);
    },
    [activeWallet]
  );

  const contextValue: WalletManagerContextType = {
    activeWallet,
    walletInfo,
    refreshWalletInfo,
    switchActiveWallet,
    preferredWallet,
    getWallet,
    sendPayment,
    receivePayment,
    prepareSendPayment,
    walletStatus,
  };

  return (
    <WalletManagerContext.Provider value={contextValue}>{children}</WalletManagerContext.Provider>
  );
};

export const useWalletManager = () => {
  const context = useContext(WalletManagerContext);
  if (!context) {
    throw new Error('useWalletManager must be used within a WalletManagerContextProvider');
  }
  return context;
};

export default WalletManagerContextProvider;
