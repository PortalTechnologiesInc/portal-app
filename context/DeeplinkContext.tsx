import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { parseCashuToken, parseKeyHandshakeUrl } from 'portal-app-lib';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { useNostrService } from '@/context/NostrServiceContext';
import { usePendingRequests } from '@/context/PendingRequestsContext';
import { getServiceNameFromMintUrl, globalEvents } from '@/utils/common';
import { useDatabaseContext } from './DatabaseContext';
import { useECash } from './ECashContext';
import { useOnboarding } from './OnboardingContext';

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
  const { isOnboardingComplete } = useOnboarding();
  const { executeOperation, executeOnNostr } = useDatabaseContext();

  // Handle deeplink URLs
  const handleDeepLink = useCallback(
    async (url: string) => {
      try {
        switch (true) {
          case url.startsWith('portal://'):
            try {
              const parsedUrl = parseKeyHandshakeUrl(url);

              // Show the skeleton loader
              showSkeletonLoader(parsedUrl);

              // Send auth init request
              await nostrService.sendKeyHandshake(parsedUrl);
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

              await executeOnNostr(async db => {
                let mintsList = await db.readMints();

                // Convert to Set to prevent duplicates, then back to array
                const mintsSet = new Set([tokenInfo.mintUrl, ...mintsList]);
                mintsList = Array.from(mintsSet);

                db.storeMints(mintsList);
              });

              // Emit event to notify that wallet balances have changed
              globalEvents.emit('walletBalancesChanged', {
                mintUrl: tokenInfo.mintUrl,
                unit: tokenInfo.unit.toLowerCase(),
              });
              // Record activity for token receipt
              try {
                // For Cashu direct, use mint URL as service identifier
                const serviceKey = tokenInfo.mintUrl;
                const unitInfo = await wallet.getUnitInfo();
                const ticketTitle = unitInfo?.title || wallet.unit();
                const serviceName = getServiceNameFromMintUrl(serviceKey);

                // Add activity to database using ActivitiesContext directly
                const activity = {
                  type: 'ticket_received' as const,
                  service_key: serviceKey,
                  service_name: serviceName, // Use readable service name from mint URL
                  detail: ticketTitle, // Use ticket title as detail
                  date: new Date(),
                  amount: tokenInfo.amount ? Number(tokenInfo.amount) : null, // Store actual number of tickets, not divided by 1000
                  currency: null,
                  request_id: `cashu-direct-${Date.now()}`,
                  subscription_id: null,
                  status: 'neutral' as const,
                  converted_amount: null,
                  converted_currency: null,
                };

                // Use database service for activity recording
                const activityId = await executeOperation(db => db.addActivity(activity), null);

                if (activityId) {
                  // Emit event for UI updates
                  globalEvents.emit('activityAdded', activity);
                } else {
                  console.warn('Failed to record Cashu token activity due to database issues');
                }
              } catch (activityError) {
                console.error('Error recording Cashu direct activity:', activityError);
              }
              Alert.alert(
                'Ticket Added Successfully!',
                `Great! You've received a ${tokenInfo.unit} ticket from ${tokenInfo.mintUrl}.`
              );
            } catch (error) {
              console.error('Failed to process ticket deeplink:', error);
              Alert.alert(
                'Ticket Processing Error',
                'There was a problem redeeming the ticket. The ticket may have already been used.'
              );
              return;
            }
            router.push('/(tabs)/Tickets');
            break;

          default:
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
      handleDeepLink(event.url);
    });

    return () => {
      subscription.remove();
    };
  }, [handleDeepLink, isOnboardingComplete]);

  // // Handle initial URL on cold start
  useEffect(() => {
    (async () => {
      if (!isOnboardingComplete) return;

      try {
        const initialUrl = await Linking.getInitialURL();
        if (initialUrl) {
          handleDeepLink(initialUrl);
        }
      } catch (e) {
        console.error('Failed to get initial URL:', e);
      }
    })();
  }, [isOnboardingComplete]);

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
