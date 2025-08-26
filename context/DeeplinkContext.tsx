import { createContext, useContext, useCallback, type ReactNode, useRef } from 'react';
import { useEffect } from 'react';
import * as Linking from 'expo-linking';
import { parseKeyHandshakeUrl } from 'portal-app-lib';
import { usePendingRequests } from '@/context/PendingRequestsContext';
import { useNostrService } from '@/context/NostrServiceContext';

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

  // Handle deeplink URLs
  const handleDeepLink = useCallback(
    (url: string) => {
      console.log('Handling deeplink URL:', url);

      try {
        const validUrl = url.startsWith('portal://');
        if (!validUrl) {
          console.log('Invalid URL, skipping:', url);
          return;
        }

        const parsedUrl = parseKeyHandshakeUrl(url);

        // Check and reconnect relays if needed (Android background kill scenario)
        nostrService.checkAndReconnectRelays();

        // Show the skeleton loader
        showSkeletonLoader(parsedUrl);

        // Send auth init request
        nostrService.sendKeyHandshake(parsedUrl);
      } catch (error: any) {
        console.error('Failed to handle deeplink URL:', error.inner);
      }
    },
    [showSkeletonLoader, nostrService]
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
