import React, { createContext, useCallback, useEffect, useRef, useState } from 'react';
import {
  listenForAuthChallenge,
  listenForCashuDirect,
  listenForCashuRequest,
  listenForDeletedSubscription,
  listenForNostrConnectRequest,
  listenForPaymentRequest,
} from '@/listeners/NostrEventsListeners';
import { PromptUserWithPendingCard } from '@/queue/providers/PromptUser';
import { ProviderRepository, Task } from '@/queue/WorkQueue';
import { PortalAppManager } from '@/services/PortalAppManager';
import { getKeypairFromKey } from '@/utils/keyHelpers';
import type { PendingRequest, RelayInfo } from '@/utils/types';
import { useCurrency } from './CurrencyContext';
import { useDatabaseContext } from './DatabaseContext';
import { useKey } from './KeyContext';
import { useNostrService } from './NostrServiceContext';
import { useWalletManager } from './WalletManagerContext';

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

    listenForCashuDirect(app);
    listenForCashuRequest(app);
    listenForAuthChallenge(app);
    listenForPaymentRequest(app);
    listenForDeletedSubscription(app);
    listenForNostrConnectRequest(app, publicKeyStr);
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
