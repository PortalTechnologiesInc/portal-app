import React, { useEffect, useState } from 'react';
import { View, StyleSheet, FlatList } from 'react-native';
import { usePendingRequests } from '../context/PendingRequestsContext';
import { PendingRequestCard } from './PendingRequestCard';
import { PendingRequestSkeletonCard } from './PendingRequestSkeletonCard';
import { FailedRequestCard } from './FailedRequestCard';
import type { PendingRequest, PendingRequestType } from '@/utils/types';
import type {
  AuthChallengeEvent,
  RecurringPaymentRequest,
  SinglePaymentRequest,
} from 'portal-app-lib';
import { useNostrService } from '@/context/NostrServiceContext';
import { ThemedText } from './ThemedText';
import { useThemeColor } from '@/hooks/useThemeColor';
import { Layout } from '@/constants/Layout';
import { useDatabase } from '@/context/DatabaseContextProvider';

// Create a skeleton request that adheres to the PendingRequest interface
const createSkeletonRequest = (): PendingRequest => ({
  id: 'skeleton',
  metadata: {} as any,
  type: 'login' as const,
  timestamp: new Date(),
  result: () => {},
});

export const PendingRequestsList: React.FC = React.memo(() => {
  const { isLoadingRequest, requestFailed, pendingUrl, showSkeletonLoader, setRequestFailed } =
    usePendingRequests();
  const nostrService = useNostrService();
  const [data, setData] = useState<PendingRequest[]>([]);

  // Simple database access
  const { executeOperation } = useDatabase();

  // Theme colors
  const cardBackgroundColor = useThemeColor({}, 'cardBackground');
  const primaryTextColor = useThemeColor({}, 'textPrimary');
  const secondaryTextColor = useThemeColor({}, 'textSecondary');

  // Type guards for safe metadata access
  const hasExpiresAt = (metadata: unknown): metadata is { expiresAt: bigint } => {
    return (
      typeof metadata === 'object' &&
      metadata !== null &&
      'expiresAt' in metadata &&
      typeof (metadata as Record<string, unknown>).expiresAt === 'bigint'
    );
  };

  const hasInnerExpiresAt = (metadata: unknown): metadata is { inner: { expiresAt: bigint } } => {
    return (
      typeof metadata === 'object' &&
      metadata !== null &&
      'inner' in metadata &&
      typeof (metadata as Record<string, unknown>).inner === 'object' &&
      (metadata as Record<string, unknown>).inner !== null &&
      'expiresAt' in ((metadata as Record<string, unknown>).inner as Record<string, unknown>) &&
      typeof ((metadata as Record<string, unknown>).inner as Record<string, unknown>).expiresAt ===
        'bigint'
    );
  };

  // Updated isRequestExpired function
  const isRequestExpired = (request: PendingRequest): boolean => {
    try {
      let expiresAt: bigint | undefined;

      if (request.type === 'ticket') {
        if (hasInnerExpiresAt(request.metadata)) {
          expiresAt = request.metadata.inner.expiresAt;
        }
      } else {
        if (hasExpiresAt(request.metadata)) {
          expiresAt = request.metadata.expiresAt;
        }
      }

      // Early return if no expiration timestamp
      if (typeof expiresAt !== 'bigint') {
        return false;
      }

      // Convert from seconds to milliseconds and compare
      const currentTimeMs = BigInt(Date.now());
      const expiresAtMs = expiresAt * 1000n;
      return currentTimeMs > expiresAtMs;
    } catch (error) {
      console.warn('Error checking request expiration:', error);
      return false;
    }
  };

  // Periodic cleanup effect to remove expired requests from NostrService context
  useEffect(() => {
    const cleanupExpiredRequests = () => {
      const expiredRequestIds: string[] = [];

      Object.values(nostrService.pendingRequests).forEach(request => {
        if (isRequestExpired(request)) {
          expiredRequestIds.push(request.id);
        }
      });

      // Remove expired requests from the context
      expiredRequestIds.forEach(id => {
        console.log(`🗑️ Automatically removing expired request: ${id}`);
        nostrService.dismissPendingRequest(id);
      });
    };

    // Run cleanup immediately
    cleanupExpiredRequests();

    // Set up periodic cleanup every 5 seconds
    const cleanupInterval = setInterval(cleanupExpiredRequests, 5000);

    return () => {
      clearInterval(cleanupInterval);
    };
  }, [nostrService.pendingRequests, nostrService.dismissPendingRequest]);

  useEffect(() => {
    const processData = async () => {
      // Get sorted requests
      const sortedRequests = Object.values(nostrService.pendingRequests)
        .filter(request => {
          // Filter out expired requests using the helper function
          if (isRequestExpired(request)) {
            return false;
          }

          // Filter out payment requests with subscriptionId
          if (
            request.type === 'payment' &&
            (request.metadata as SinglePaymentRequest).content.subscriptionId
          ) {
            return false;
          }
          return true;
        })
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      const filteredRequests = await Promise.all(
        sortedRequests.map(async request => {
          // Handle different request types
          if (request.type === 'ticket') {
            // Ticket requests don't have eventId, so we can't check if they're stored
            // For now, always show them
            return request;
          }

          // For other request types, check if they're stored
          try {
            const isStored = await executeOperation(
              db => db.isPendingRequestStored((request.metadata as SinglePaymentRequest).eventId),
              false // fallback to false if operation fails
            );

            if (isStored) {
              return null; // Request is stored, so filter it out
            }
            return request; // Request is not stored, so keep it
          } catch (error) {
            console.error('Error checking if request is stored:', error);
            return request; // On error, keep the request
          }
        })
      );

      // Remove null values (filtered out requests)
      const nonStoredRequests = filteredRequests.filter(request => request !== null);

      // Add skeleton if needed
      const finalData =
        requestFailed || isLoadingRequest
          ? [createSkeletonRequest(), ...nonStoredRequests]
          : nonStoredRequests;

      setData(finalData);
    };

    processData();
  }, [nostrService.pendingRequests, isLoadingRequest, requestFailed]);

  const handleRetry = () => {
    setRequestFailed(false);
    if (pendingUrl) {
      showSkeletonLoader(pendingUrl);
      nostrService.sendKeyHandshake(pendingUrl);
    }
  };

  const handleCancel = () => {
    setRequestFailed(false);
  };

  const renderCard = (item: PendingRequest) => {
    if (item.id === 'skeleton' && requestFailed) {
      return <FailedRequestCard onRetry={handleRetry} onCancel={handleCancel} />;
    }
    if (item.id === 'skeleton') {
      return <PendingRequestSkeletonCard />;
    }
    return <PendingRequestCard request={item} />;
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <ThemedText type="title" style={[styles.title, { color: primaryTextColor }]}>
          Pending Requests
        </ThemedText>
      </View>

      {data.length === 0 ? (
        <View style={[styles.emptyContainer, { backgroundColor: cardBackgroundColor }]}>
          <ThemedText style={[styles.emptyText, { color: secondaryTextColor }]}>
            No pending requests
          </ThemedText>
        </View>
      ) : (
        <FlatList
          data={data}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={item => {
            if (item.id === 'skeleton') return 'skeleton';

            // Handle different request types for service key extraction
            let serviceKey = '';
            if (item.type === 'ticket') {
              serviceKey =
                (
                  item.metadata as
                    | AuthChallengeEvent
                    | SinglePaymentRequest
                    | RecurringPaymentRequest
                )?.serviceKey || 'unknown';
            } else {
              serviceKey = (item.metadata as SinglePaymentRequest).serviceKey;
            }

            return `${serviceKey}-${item.id}`;
          }}
          renderItem={({ item, index }) => (
            <View style={styles.cardWrapper}>{renderCard(item)}</View>
          )}
          snapToOffsets={data.map((_, index) => index * (Layout.cardWidth + 12))}
          decelerationRate="fast"
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingLeft: (Layout.screenWidth - Layout.cardWidth) / 2 - 6,
              paddingRight: (Layout.screenWidth - Layout.cardWidth) / 2 - 6,
            },
          ]}
        />
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
    marginBottom: 20,
  },
  header: {
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
  },
  emptyContainer: {
    marginHorizontal: 20,
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 100,
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
  },
  scrollContent: {
    alignItems: 'center',
  },
  cardWrapper: {
    width: Layout.cardWidth + 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  firstCard: {
    // No special styling needed
  },
  lastCard: {
    // No special styling needed
  },
});
