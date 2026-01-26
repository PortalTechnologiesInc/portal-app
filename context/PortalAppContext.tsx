import {
  IncomingPaymentRequest_Tags,
  keyToHex,
  type RecurringPaymentRequest,
  type SinglePaymentRequest,
} from 'portal-app-lib';
import React, { createContext, useCallback, useEffect, useRef, useState } from 'react';
import { PromptUserWithPendingCard } from '@/queue/providers/PromptUser';
import { HandleRecurringPaymentRequestTask } from '@/queue/tasks/HandleRecurringPaymentRequest';
import { HandleSinglePaymentRequestTask } from '@/queue/tasks/HandleSinglePaymentRequest';
import { ProcessAuthRequestTask } from '@/queue/tasks/ProcessAuthRequest';
import { enqueueTask, ProviderRepository, Task } from '@/queue/WorkQueue';
import { PortalAppManager } from '@/services/PortalAppManager';
import { getKeypairFromKey } from '@/utils/keyHelpers';
import type { PendingRequest, RelayInfo } from '@/utils/types';
import { useCurrency } from './CurrencyContext';
import { useDatabaseContext } from './DatabaseContext';
import { useKey } from './KeyContext';
import { useNostrService } from './NostrServiceContext';
import { useWalletManager } from './WalletManagerContext';
import { HandleCancelSubscriptionResponseTask } from '@/queue/tasks/HandleCancelSubscriptionResponse';
import { HandleCashuDirectContentTask } from '@/queue/tasks/HandleCashuDirectContent';
import { HandleCashuBurnRequestTask } from '@/queue/tasks/HandleCashuBurnRequest';
import { HandleNostrConnectRequestTask } from '@/queue/tasks/HandleNostrConnectRequest';

interface PortalAppProviderProps {
  children: React.ReactNode;
}

export interface PortalAppProviderType {
  pendingRequests: { [key: string]: PendingRequest };
  dismissPendingRequest: (id: string) => void;
}

const PortalAppContext = createContext<PortalAppProviderType | null>(null);

export const PortalAppProvider: React.FC<PortalAppProviderProps> = ({ children }) => {
  const { isInitialized } = useNostrService();
  const { executeOperation, executeOnNostr } = useDatabaseContext();
  const [pendingRequests, setPendingRequests] = useState<{ [key: string]: PendingRequest }>({});
  const pendingRequestsRef = useRef<{ [key: string]: PendingRequest }>({});
  const listenersInitializedRef = useRef(false);
  const { activeWallet } = useWalletManager();
  const { preferredCurrency } = useCurrency();
  const { mnemonic, nsec } = useKey();

  // Keep ref in sync with state so listeners always access current value
  useEffect(() => {
    pendingRequestsRef.current = pendingRequests;
    console.log('[PortalAppContext] Registering providers');
    ProviderRepository.register(
      new PromptUserWithPendingCard(setPendingRequests),
      'PromptUserProvider'
    );
    console.log('[PortalAppContext] Providers registered');
  }, [setPendingRequests]);

  const initializeApp = useCallback(() => {
    // Prevent re-registering listeners if they're already initialized
    // This prevents Rust panics from trying to register listeners multiple times
    if (listenersInitializedRef.current) {
      console.log('[PORTAL_APP]: Listeners already initialized, skipping');
      return;
    }

    console.log('[PORTAL_APP]: Initializing app and setting up listeners');
    const app = PortalAppManager.tryGetInstance();

    const keypair = getKeypairFromKey({ mnemonic, nsec });
    const publicKeyStr = keypair.publicKey().toString();

    //cashu receive token
    (async () => {
      while (true) {
        try {
          const event = await app.nextCashuDirect();
          const task = new HandleCashuDirectContentTask(event);
          console.log('[PortalAppContext] Enqueuing HandleCashuDirectContentTask.');
          enqueueTask(task);
        } catch (error) {
          console.error('[PortalAppContext] Error running task', error);
        }
      }
    })();

    // listener to burn tokens
    (async () => {
      while (true) {
        try {
          const event = await app.nextCashuRequest();
          const task = new HandleCashuBurnRequestTask(event);
          console.log('[PortalAppContext] Enqueuing HandleCashuBurnRequestTask.');
          enqueueTask(task);
        } catch (error) {
          console.error('[PortalAppContext] Error running task', error);
        }
      }
    })();

    /**
     * these logic go inside the new listeners that will be implemented
     */
    (async () => {
      while (true) {
        try {
          const event = await app.nextAuthChallenge();
          const id = event.eventId;
          const task = new ProcessAuthRequestTask(event);
          console.log('[PortalAppContext] Enqueuing ProcessAuthRequestTask for request:', id);
          enqueueTask(task);
        } catch (error) {
          console.error('[PortalAppContext] Error running task', error);
        }
      }
    })();

    (async () => {
      while (true) {
        try {
          const event = await app.nextPaymentRequest();
          switch (event.tag) {
            case IncomingPaymentRequest_Tags.Single: {
              const singlePaymentRequest = event.inner[0] as SinglePaymentRequest;
              const task = await new HandleSinglePaymentRequestTask(singlePaymentRequest);
              console.log(
                '[PortalAppContext] Enqueuing HandleSinglePaymentRequestTask for request:',
                singlePaymentRequest.eventId
              );
              enqueueTask(task);
              break;
            }
            case IncomingPaymentRequest_Tags.Recurring: {
              const recurringPaymentRequest = event.inner[0] as RecurringPaymentRequest;
              const task = await new HandleRecurringPaymentRequestTask(recurringPaymentRequest);
              console.log(
                '[PortalAppContext] Enqueuing HandleRecurringPaymentRequestTask for request:',
                recurringPaymentRequest.eventId
              );
              enqueueTask(task);
              break;
            }
          }
          const id = event.inner[0].eventId;
        } catch (error) {
          console.error('[PortalAppContext] Error running task', error);
        }
      }
    })();

    // Listen for closed recurring payments
    (async () => {
      while (true) {
        try {
          const event = await app.nextClosedRecurringPayment();
          const task = new HandleCancelSubscriptionResponseTask(event);
          console.log('[PortalAppContext] Enqueuing HandleCancelSubscriptionResponseTask');
          enqueueTask(task);
        } catch (error) {
          console.error('[PortalAppContext] Error running task', error);
        }
      }
    })();

    (async () => {
      while (true) {
        try {
          const event = await app.nextNip46Request();
          const task = new HandleNostrConnectRequestTask(
            event,
            keyToHex(publicKeyStr)
          );
          console.log('[PortalAppContext] Enqueuing HandleNostrConnectRequestTask');
          enqueueTask(task);
        } catch (error) {
          console.error('[PortalAppContext] Error running task', error);
        }
      }
    })();
  }, [executeOperation, executeOnNostr, activeWallet, preferredCurrency]);

  const dismissPendingRequest = useCallback((id: string) => {
    setPendingRequests(prev => {
      const newPendingRequests = { ...prev };
      delete newPendingRequests[id];
      return newPendingRequests;
    });
  }, []);

  useEffect(() => {
    if (!isInitialized) {
      // Reset flag when not initialized so it can be initialized again
      listenersInitializedRef.current = false;
      return;
    }
    // Only initialize once - guard prevents re-initialization
    if (!listenersInitializedRef.current) {
      initializeApp();
    }
  }, [isInitialized, initializeApp]);

  const contextValue: PortalAppProviderType = {
    pendingRequests,
    dismissPendingRequest,
  };

  return <PortalAppContext.Provider value={contextValue}>{children}</PortalAppContext.Provider>;
};

export const usePortalApp = (): PortalAppProviderType => {
  const context = React.useContext(PortalAppContext);
  if (!context) {
    throw new Error('usePortalApp must be used within a PortalAppProvider');
  }
  return context;
};
