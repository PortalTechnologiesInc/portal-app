import { useState, useEffect, useRef } from 'react';
import type { FC } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePendingRequests } from '../context/PendingRequestsContext';
import { useNostrService } from '@/context/NostrServiceContext';
import { useECash } from '@/context/ECashContext';
import type { SinglePaymentRequest, RecurringPaymentRequest } from 'portal-app-lib';
import type { PendingRequest } from '@/utils/types';
import { useThemeColor } from '@/hooks/useThemeColor';
import { Layout } from '@/constants/Layout';

interface PendingRequestCardProps {
  request: PendingRequest;
  key?: string;
}

const getRequestTypeText = (type: string) => {
  switch (type) {
    case 'login':
      return 'Login Request';
    case 'payment':
      return 'Payment Request';
    case 'subscription':
      return 'Subscription Request';
    case 'certificate':
      return 'Certificate Request';
    case 'identity':
      return 'Identity Request';
    case 'ticket':
      return 'Ticket Request';
    default:
      return 'Unknown Request';
  }
};

// Function to truncate a pubkey to the format: "npub1...123456"
const truncatePubkey = (pubkey: string | undefined) => {
  if (!pubkey) return '';
  return `${pubkey.substring(0, 16)}...${pubkey.substring(pubkey.length - 16)}`;
};

export const PendingRequestCard: FC<PendingRequestCardProps> = ({ request }) => {
  const { approve, deny } = usePendingRequests();
  const { id, metadata, type } = request;
  const nostrService = useNostrService();
  const { wallets } = useECash();
  const [serviceName, setServiceName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const isMounted = useRef(true);

  // Theme colors
  const cardBackgroundColor = useThemeColor({}, 'cardBackground');
  const primaryTextColor = useThemeColor({}, 'textPrimary');
  const secondaryTextColor = useThemeColor({}, 'textSecondary');
  const borderColor = useThemeColor({}, 'borderPrimary');
  const shadowColor = useThemeColor({}, 'shadowColor');

  // Add debug logging when a card is rendered
  console.log(
    `Rendering card ${id} of type ${type} with service key ${(metadata as SinglePaymentRequest).serviceKey}`
  );

  const calendarObj =
    type === 'subscription'
      ? (metadata as RecurringPaymentRequest)?.content?.recurrence.calendar
      : null;

  const recurrence = calendarObj?.inner.toHumanReadable(false);

  // Extract service key based on request type
  const getServiceKey = () => {
    if (type === 'ticket') {
      return (metadata as any)?.title || 'Unknown Ticket';
    }
    return (metadata as SinglePaymentRequest).serviceKey;
  };

  const serviceKey = getServiceKey();

  useEffect(() => {
    const fetchServiceName = async () => {
      if (!isMounted.current) return;

      // For ticket requests, get ticket title from wallet unit
      if (type === 'ticket') {
        try {
          const cashuEvent = metadata as any;
          console.log('Ticket request metadata:', cashuEvent);
          console.log('Available wallets:', Object.keys(wallets));

          if (cashuEvent.inner?.mintUrl && cashuEvent.inner?.unit) {
            console.log('Looking for wallet with mintUrl:', cashuEvent.inner.mintUrl);
            // Get the wallet to get the unit name (ticket title)
            const wallet = wallets[cashuEvent.inner.mintUrl];
            if (wallet) {
              const ticketTitle = wallet.unit();
              console.log('Found wallet, ticket title:', ticketTitle);
              setServiceName(ticketTitle);
            } else {
              console.log('Wallet not found, using unit:', cashuEvent.inner.unit);
              setServiceName(cashuEvent.inner.unit || 'Unknown Ticket');
            }
          } else {
            console.log('Missing mintUrl or unit in cashuEvent');
            setServiceName('Unknown Ticket');
          }
          setIsLoading(false);
        } catch (error) {
          console.error('Error getting ticket title:', error);
          setServiceName('Unknown Ticket');
          setIsLoading(false);
        }
        return;
      }

      try {
        setIsLoading(true);
        const name = await nostrService.getServiceName(serviceKey);

        if (isMounted.current) {
          setServiceName(name);
          setIsLoading(false);
        }
      } catch (error) {
        console.error('Failed to fetch service name:', error);
        if (isMounted.current) {
          setServiceName(null);
          setIsLoading(false);
        }
      }
    };

    fetchServiceName();

    // Cleanup function to prevent state updates after unmount
    return () => {
      isMounted.current = false;
    };
  }, [serviceKey, nostrService, type, metadata, wallets]);

  const recipientPubkey = (metadata as SinglePaymentRequest).recipient;

  // Extract payment information if this is a payment request
  const isPaymentRequest = type === 'payment';
  const isSubscriptionRequest = type === 'subscription';
  const isTicketRequest = type === 'ticket';

  const amount =
    (metadata as SinglePaymentRequest)?.content?.amount ||
    (metadata as RecurringPaymentRequest)?.content?.amount ||
    (isTicketRequest ? (metadata as any)?.inner?.amount : null);

  // For Ticket requests, only show sending tokens (not receiving)
  const isTicketSending =
    isTicketRequest && (metadata as any)?.inner?.mintUrl && (metadata as any)?.inner?.amount;

  return (
    <View style={[styles.card, { backgroundColor: cardBackgroundColor, shadowColor }]}>
      <Text style={[styles.requestType, { color: secondaryTextColor }]}>
        {getRequestTypeText(type)}
      </Text>

      <Text
        style={[
          styles.serviceName,
          { color: primaryTextColor },
          !serviceName && styles.unknownService,
        ]}
      >
        {serviceName || 'Unknown Service'}
      </Text>

      <Text style={[styles.serviceInfo, { color: secondaryTextColor }]}>
        {truncatePubkey(recipientPubkey)}
      </Text>

      {(isPaymentRequest || isSubscriptionRequest) && amount !== null && (
        <View style={[styles.amountContainer, { borderColor }]}>
          {isSubscriptionRequest ? (
            <View style={styles.amountRow}>
              <Text style={[styles.amountText, { color: primaryTextColor }]}>
                {Number(amount) / 1000} sats
              </Text>
              <Text style={[styles.recurranceText, { color: primaryTextColor }]}>
                {recurrence?.toLowerCase()}
              </Text>
            </View>
          ) : (
            <Text style={[styles.amountText, { color: primaryTextColor }]}>
              {Number(amount) / 1000} sats
            </Text>
          )}
        </View>
      )}

      <View style={styles.actions}>
        <TouchableOpacity
          style={[
            styles.button,
            styles.approveButton,
            { backgroundColor: useThemeColor({}, 'buttonSuccess') },
          ]}
          onPress={() => approve(id)}
        >
          <Ionicons
            name="checkmark-outline"
            size={20}
            color={useThemeColor({}, 'buttonSuccessText')}
          />
          <Text style={[styles.buttonText, { color: useThemeColor({}, 'buttonSuccessText') }]}>
            Approve
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.button,
            styles.denyButton,
            { backgroundColor: useThemeColor({}, 'buttonDanger') },
          ]}
          onPress={() => deny(id)}
        >
          <Ionicons name="close-outline" size={20} color={useThemeColor({}, 'buttonDangerText')} />
          <Text style={[styles.buttonText, { color: useThemeColor({}, 'buttonDangerText') }]}>
            Deny
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    width: Layout.cardWidth, // Centralized card width
    elevation: 2,
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.22,
    shadowRadius: 2.22,
  },
  requestType: {
    fontSize: 14,
    fontWeight: '400',
    marginBottom: 8,
  },
  serviceName: {
    fontSize: 26,
    fontWeight: '600',
    marginBottom: 4,
  },
  unknownService: {
    fontStyle: 'italic',
  },
  serviceInfo: {
    fontSize: 14,
    marginBottom: 12,
  },
  amountContainer: {
    borderWidth: 1,
    textAlign: 'center',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 20,
    alignSelf: 'center',
    marginBottom: 20,
    width: '100%',
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    width: '100%',
  },
  amountText: {
    fontSize: 30,
    fontWeight: '700',
    textAlign: 'center',
  },
  recurranceText: {
    fontSize: 15,
    fontWeight: '400',
    marginLeft: 15,
    alignSelf: 'flex-end',
    paddingBottom: 5,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    marginHorizontal: 4,
  },
  denyButton: {
    // backgroundColor handled by theme
  },
  approveButton: {
    // backgroundColor handled by theme
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
