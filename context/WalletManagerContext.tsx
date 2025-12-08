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
import { useDatabaseContext } from './DatabaseContext';
import { useCurrency } from './CurrencyContext';
import { ActivityType, globalEvents } from '@/utils/common';
import {
  SdkEvent,
  SdkEvent_Tags,
  PaymentType,
  Payment,
  PaymentStatus,
  PaymentDetails_Tags,
} from '@breeztech/breez-sdk-spark-react-native';
import { CurrencyConversionService } from '@/services/CurrencyConversionService';

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
  isWalletManagerInitialized: boolean;
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
  const { executeOperation } = useDatabaseContext();
  const { preferredCurrency } = useCurrency();

  const [activeWallet, setActiveWallet] = useState<Wallet | undefined>(undefined);
  const [walletInfo, setWalletInfo] = useState<WalletInfo | undefined>(undefined);
  const [preferredWallet, setPreferredWallet] = useState<WalletType | null>(null);
  const [isWalletManagerInitialized, setIsWalletManagerInitialized] = useState(false);
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
   * Setup event listener for Breez wallet to track activities and payment status
   */
  const setupBreezEventListener = useCallback(
    (breezWallet: BreezService) => {
      const handler = async (event: SdkEvent) => {
        console.log('[BREEZ EVENT]:', event);

        // Extract event type and payment data
        let paymentData: Payment;

        switch (event.tag) {
          case SdkEvent_Tags.PaymentPending:
          case SdkEvent_Tags.PaymentSucceeded:
          case SdkEvent_Tags.PaymentFailed:
            paymentData = event.inner.payment;
            break;
          default:
            return; // Early exit if not a payment event
        }

        const { amount, id, paymentType: pType, status: pStatus, details } = paymentData;
        const amountInSats = Number(amount);
        if (pType === PaymentType.Send) return;

        const statusMap = {
          pending: { status: 'pending' as const, statusEntry: null },
          succeeded: { status: 'positive' as const, statusEntry: 'payment_completed' as const },
          failed: { status: 'negative' as const, statusEntry: 'payment_failed' as const },
        };

        const activityTypeMap = {
          send: {
            type: ActivityType.Pay,
            messages: {
              pending: 'Payment pending',
              succeeded: 'Payment completed',
              failed: 'Payment failed',
            },
          },
          receive: {
            type: ActivityType.Receive,
            messages: {
              pending: 'Waiting for payment',
              succeeded: 'Payment received',
              failed: 'Payment failed',
            },
          },
        };

        const eventType =
          pStatus === PaymentStatus.Pending
            ? 'pending'
            : pStatus === PaymentStatus.Completed
              ? 'succeeded'
              : 'failed';
        const { status, statusEntry } = statusMap[eventType];
        const typeConfig = activityTypeMap['receive'];

        if (!typeConfig) return;

        try {
          // Convert amount to preferred currency
          const convertedAmt = await CurrencyConversionService.convertAmount(
            amountInSats,
            'sats',
            preferredCurrency
          );
          const invoice =
            details?.tag === PaymentDetails_Tags.Lightning ? details.inner.invoice : null;

          // Create or update activity
          const activityId = await executeOperation(db =>
            db.addActivity({
              type: typeConfig.type,
              service_key: 'Breez Wallet',
              service_name: 'Breez Wallet',
              detail: typeConfig.messages[eventType],
              date: new Date(),
              amount: amountInSats,
              currency: 'sats',
              converted_amount: convertedAmt,
              converted_currency: preferredCurrency,
              request_id: id,
              subscription_id: null, // TODO: link to subscription if applicable
              status,
              invoice,
            })
          );

          if (activityId) {
            const createdActivity = await executeOperation(db => db.getActivity(activityId), null);
            if (createdActivity) {
              globalEvents.emit(
                status === 'pending' ? 'activityAdded' : 'activityUpdated',
                status === 'pending' ? createdActivity : { activityId }
              );
            }
          }

          // Add payment status entry if needed
          if (statusEntry && invoice) {
            try {
              await executeOperation(db => db.addPaymentStatusEntry(invoice, statusEntry), null);
            } catch (statusError) {
              console.error('Failed to add payment status entry:', statusError);
            }
          }
        } catch (error) {
          console.error('Failed to handle Breez payment event:', error);
        }
      };

      breezWallet.addEventListener({ onEvent: handler }).catch(error => {
        console.error('Failed to setup Breez event listener:', error);
      });
    },
    [executeOperation, preferredCurrency]
  );

  /**
   * Create or return a cached wallet instance (uses ref to avoid dependency cycle)
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
          // Setup event listener for Breez wallet
          setupBreezEventListener(instance as BreezService);
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
    [mnemonic, onStatusChange, setupBreezEventListener, walletUrl]
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
   * Single initialization effect - runs only once to set up wallets
   */
  useEffect(() => {
    const init = async () => {
      if (!mnemonic) return;

      try {
        // Initialize Breez wallet at startup
        await getWallet(WALLET_TYPE.BREEZ);

        // Restore preferred wallet
        const stored = await AsyncStorage.getItem(PREFERRED_WALLET_KEY);
        if (stored) {
          const walletType = JSON.parse(stored) as WalletType;
          await switchActiveWallet(walletType);
        } else {
          // Default to Breez
          await switchActiveWallet(WALLET_TYPE.BREEZ);
        }

        setIsWalletManagerInitialized(true);
      } catch (error) {
        console.error('Failed to initialize wallet manager:', JSON.stringify(error));
      }
    };

    init();
  }, [getWallet, mnemonic, switchActiveWallet]);

  /**
   * If wallet url is removed, update global status and switch to breez as preferred
   */
  useEffect(() => {
    if (isWalletManagerInitialized) {
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
    }
  }, [walletUrl, switchActiveWallet, getWallet, isWalletManagerInitialized]);

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
    isWalletManagerInitialized,
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
