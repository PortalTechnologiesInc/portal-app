import { createContext, useContext, useCallback, type ReactNode, useRef } from 'react';
import { useEffect } from 'react';
import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';
import { parseKeyHandshakeUrl } from 'portal-app-lib';
import { usePendingRequests } from '@/context/PendingRequestsContext';
import { useNostrService } from '@/context/NostrServiceContext';
import { router } from 'expo-router';

// Key for storing pending deeplinks
const PENDING_DEEPLINK_KEY = 'PENDING_DEEPLINK';

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
  // Track processed URLs to avoid duplicates
  const processedUrls = useRef<Set<string>>(new Set());
  // Track last processing time to implement cooldown
  const lastProcessTime = useRef<Record<string, number>>({});
  // Track if initial URL has been processed
  const initialUrlProcessed = useRef<boolean>(false);

  // Handle deeplink URLs
  const handleDeepLink = useCallback(
    (url: string) => {
      // Skip if this URL has already been processed
      if (processedUrls.current.has(url)) {
        console.log('URL already processed, skipping:', url);
        return;
      }

      // Implement a cooldown period (3 seconds) to prevent multiple rapid processing
      const now = Date.now();
      const lastTime = lastProcessTime.current[url] || 0;
      if (now - lastTime < 3000) {
        console.log('URL processed too recently, cooldown active:', url);
        return;
      }

      console.log('Handling deeplink URL:', url);
      // Mark this URL as processed and update last process time
      processedUrls.current.add(url);
      lastProcessTime.current[url] = now;

      try {
        // Check if this is a basic scheme URL without authentication parameters
        // Handle the case where URL might be just "portal://" or similar basic scheme
        const isBasicSchemeUrl =
          url === 'portal://' ||
          url.match(/^portal:\/\/\/?$/) ||
          (!url.includes('?') &&
            !url.includes('#') &&
            url.replace('portal://', '').replace('/', '') === '');

        if (isBasicSchemeUrl) {
          console.log('Basic scheme URL detected, skipping authentication parsing:', url);
          return;
        }

        // Parse the URL only if it contains actual authentication parameters
        const parsedUrl = parseKeyHandshakeUrl(url);
        console.log('Parsed deeplink URL:', parsedUrl);

        // Show the skeleton loader
        showSkeletonLoader(parsedUrl);

        // Send auth init request
        nostrService.sendKeyHandshake(parsedUrl);
      } catch (error) {
        console.error('Failed to handle deeplink URL:', error);
      }
    },
    [showSkeletonLoader, nostrService]
  );

  // Check for any pending deeplinks that were stored when the app wasn't fully initialized
  useEffect(() => {
    const checkPendingDeeplinks = async () => {
      try {
        const pendingDeeplink = await SecureStore.getItemAsync(PENDING_DEEPLINK_KEY);
        if (pendingDeeplink) {
          console.log('Found pending deeplink:', pendingDeeplink);
          // Clear the stored deeplink
          await SecureStore.deleteItemAsync(PENDING_DEEPLINK_KEY);
          // Process the deeplink
          handleDeepLink(pendingDeeplink);
        }
      } catch (error) {
        console.error('Error checking for pending deeplinks:', error);
      }
    };

    checkPendingDeeplinks();
  }, [handleDeepLink]);

  // Listen for deeplink events
  useEffect(() => {
    // Don't handle initial URL here - let [...deeplink].tsx handle cold start deeplinks
    // This prevents double navigation when app is opened with deeplink
    
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
