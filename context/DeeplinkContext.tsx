import { createContext, useContext, useCallback, type ReactNode, useRef } from 'react';
import { useEffect } from 'react';
import * as Linking from 'expo-linking';
import { parseCashuToken, parseKeyHandshakeUrl } from 'portal-app-lib';
import { usePendingRequests } from '@/context/PendingRequestsContext';
import { useNostrService } from '@/context/NostrServiceContext';
import { useECash } from './ECashContext';
import { Alert } from 'react-native';
import { router } from 'expo-router';

// Define the context type
type DeeplinkContextType = {
  handleDeepLink: (url: string) => void;
};

// Create the context
const DeeplinkContext = createContext<DeeplinkContextType | undefined>(undefined);

// Provider component
export const DeeplinkProvider = ({ children }: { children: ReactNode }) => {
  const { showSkeletonLoader } = usePendingRequests();
  const nostrService = useNostrService();
  const { addWallet } = useECash();

  // Handle deeplink URLs
  const handleDeepLink = useCallback(
    async (url: string) => {
      console.log('Handling deeplink URL:', url);

      try {
        switch (true) {
          case url.startsWith('portal://'):
            try {
              const parsedUrl = parseKeyHandshakeUrl(url);

              // Show the skeleton loader
              showSkeletonLoader(parsedUrl);

              // Send auth init request
              nostrService.sendKeyHandshake(parsedUrl);
            } catch (error) {
              console.error('Failed to process the auth deeplink:', error);
              return;
            }
            break;

          case url.startsWith('portal-cashu://'):
            try {
              const token = url.replace('portal-cashu://', '');
              const tokenInfo = await parseCashuToken(token);
              const wallet = await addWallet(tokenInfo.mintUrl, tokenInfo.unit);
              await wallet.receiveToken(token);

              // Emit event to notify that wallet balances have changed
              const { globalEvents } = await import('@/utils/index');
              globalEvents.emit('walletBalancesChanged', {
                mintUrl: tokenInfo.mintUrl,
                unit: tokenInfo.unit.toLowerCase(),
              });
              console.log
              Alert.alert(
                'Ticket Added Successfully!',
                `Great! You've received a ${tokenInfo.unit} ticket from ${tokenInfo.mintUrl}.`
              );
            } catch (error) {
              console.error('Failed to process ticket deeplink:', error);
              return;
            }
            router.push('/(tabs)/Tickets');
            break;

          default:
            console.log('Invalid URL, skipping:', url);
            break;
        }
      } catch (error: any) {
        console.error('Failed to handle deeplink URL:', error.inner);
      }
    },
    [showSkeletonLoader, nostrService, addWallet]
  );

  // Listen for deeplink events
  useEffect(() => {
    // Only add event listener for URL events that happen while the app is running
    const subscription = Linking.addEventListener('url', event => {
      console.log('Got URL event while app running:', event.url);
      handleDeepLink(event.url);
    });

    return () => {
      subscription.remove();
    };
  }, [handleDeepLink]);

  // Provide context value
  const contextValue: DeeplinkContextType = {
    handleDeepLink,
  };

  return <DeeplinkContext.Provider value={contextValue}>{children}</DeeplinkContext.Provider>;
};

// Hook to use the deeplink context
export const useDeeplink = (): DeeplinkContextType => {
  const context = useContext(DeeplinkContext);
  if (!context) {
    throw new Error('useDeeplink must be used within a DeeplinkProvider');
  }
  return context;
};
