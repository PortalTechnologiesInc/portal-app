import { Ionicons } from '@expo/vector-icons';
import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react-native';
import {
  Currency_Tags,
  type NostrConnectEvent,
  NostrConnectMethod,
  type NostrConnectRequest,
  type RecurringPaymentRequest,
  type SinglePaymentRequest,
} from 'portal-app-lib';
import type { FC } from 'react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Layout } from '@/constants/Layout';
import { useCurrency } from '@/context/CurrencyContext';
import { useECash } from '@/context/ECashContext';
import { useNostrService } from '@/context/NostrServiceContext';
import { useWalletManager } from '@/context/WalletManagerContext';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useWalletStatus } from '@/hooks/useWalletStatus';
import { FetchServiceProfileTask } from '@/queue/tasks/ProcessAuthRequest';
import { CurrencyConversionService } from '@/services/CurrencyConversionService';
import { formatActivityAmount, normalizeCurrencyForComparison } from '@/utils/currency';
import { getServiceNameFromProfile } from '@/utils/nostrHelper';
import type { PendingRequest } from '@/utils/types';
import { usePendingRequests } from '../context/PendingRequestsContext';
import { SkeletonPulse } from './PendingRequestSkeletonCard';

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
    case 'nostrConnect':
      return 'Nostr Connect';
    default:
      return 'Unknown Request';
  }
};

// Function to truncate a pubkey to the format: "npub1...123456"
const truncatePubkey = (pubkey: string | undefined) => {
  if (!pubkey) return '';
  return `${pubkey.substring(0, 16)}...${pubkey.substring(pubkey.length - 16)}`;
};

export const PendingRequestCard: FC<PendingRequestCardProps> = React.memo(
  ({ request }) => {
    const { approve, deny } = usePendingRequests();
    const { id, metadata, type } = request;
    const nostrService = useNostrService();
    const { wallets } = useECash();
    const { preferredCurrency } = useCurrency();
    const { eCashLoading, hasECashWallets } = useWalletStatus();
    const [serviceName, setServiceName] = useState<string | null>(null);
    const [isServiceNameLoading, setIsServiceNameLoading] = useState(true);
    const [requestorName, setRequestorName] = useState<string | null>(null);
    const [isRequestorNameLoading, setIsRequestorNameLoading] = useState(false);
    const [hasInsufficientBalance, setHasInsufficientBalance] = useState(false);
    const [convertedAmount, setConvertedAmount] = useState<number | null>(null);
    const [isConvertingCurrency, setIsConvertingCurrency] = useState(false);
    const [isPermissionsExpanded, setIsPermissionsExpanded] = useState(false);
    const isMounted = useRef(true);
    const { activeWallet, walletInfo: _walletInfo } = useWalletManager();

    // Extract payment information - needed for balance checking
    const recipientPubkey = (metadata as SinglePaymentRequest).recipient;
    const isPaymentRequest = type === 'payment';
    const isSubscriptionRequest = type === 'subscription';
    const isTicketRequest = type === 'ticket';
    const isNostrConnect = type === 'nostrConnect';
    const nostrConnectMethod = (
      (metadata as NostrConnectEvent).message.inner[0] as NostrConnectRequest
    ).method;
    const nostrConnectParams = (
      (metadata as NostrConnectEvent).message.inner[0] as NostrConnectRequest
    ).params;
    const content = (metadata as SinglePaymentRequest)?.content;
    const amount = content?.amount ?? (isTicketRequest ? (metadata as any)?.inner?.amount : null);

    // For ticket requests, get the requestor's pubkey from mainKey (CashuRequestContentWithKey structure)
    const _ticketRequestorPubkey = isTicketRequest
      ? (metadata as any)?.mainKey || (metadata as any)?.serviceKey
      : null;

    // Theme colors
    const cardBackgroundColor = useThemeColor({}, 'cardBackground');
    const primaryTextColor = useThemeColor({}, 'textPrimary');
    const secondaryTextColor = useThemeColor({}, 'textSecondary');
    const borderColor = useThemeColor({}, 'borderPrimary');
    const shadowColor = useThemeColor({}, 'shadowColor');
    const skeletonBaseColor = useThemeColor({}, 'skeletonBase');
    const warningColor = useThemeColor({}, 'statusError');
    const tertiaryColor = useThemeColor({}, 'textTertiary');
    const buttonSuccessColor = useThemeColor({}, 'buttonSuccessText');
    const buttonSecondaryColor = useThemeColor({}, 'buttonSecondary');
    const buttonSuccessBgColor = useThemeColor({}, 'buttonSuccess');

    const calendarObj =
      type === 'subscription'
        ? (metadata as RecurringPaymentRequest)?.content?.recurrence.calendar
        : null;

    const recurrence = calendarObj?.inner.toHumanReadable(false);

    useEffect(() => {
      // Reset mounted flag at the start of each effect
      isMounted.current = true;

      let serviceKey: string;
      if (type === 'nostrConnect' && 'nostrClientPubkey' in (metadata as any)) {
        serviceKey = (metadata as NostrConnectEvent).nostrClientPubkey;
      } else if ('serviceKey' in (metadata as any)) {
        serviceKey = (metadata as any).serviceKey;
      } else {
        console.error(
          `[PendingRequestCard] Unable to determine service key for request type: ${type}`
        );
        throw new Error('Service key not found in request metadata');
      }

      if (type === 'ticket' && request.ticketTitle) {
        setServiceName(request.ticketTitle);
        setIsServiceNameLoading(false);
        // For ticket requests, also fetch the requestor's name
        const fetchRequestorName = async () => {
          if (!isMounted.current) return;

          // CashuRequestContentWithKey structure: has mainKey (the requestor's pubkey)
          // Check both mainKey and serviceKey as the structure might vary
          const requestorServiceKey = (metadata as any)?.mainKey || (metadata as any)?.serviceKey;
          if (!requestorServiceKey) {
            return;
          }

          try {
            setIsRequestorNameLoading(true);
            const profile = await new FetchServiceProfileTask(serviceKey).run();
            const name = getServiceNameFromProfile(profile);
            if (isMounted.current) {
              setRequestorName(name);
              setIsRequestorNameLoading(false);
            }
          } catch (_error) {
            if (isMounted.current) {
              setRequestorName(null);
              setIsRequestorNameLoading(false);
            }
          }
        };

        fetchRequestorName();
      } else {
        const fetchServiceName = async () => {
          if (!isMounted.current) return;
          try {
            setIsServiceNameLoading(true);
            const profile = await new FetchServiceProfileTask(serviceKey).run();
            const name = getServiceNameFromProfile(profile);
            if (isMounted.current) {
              setServiceName(name);
              setIsServiceNameLoading(false);
            }
          } catch (_error) {
            if (isMounted.current) {
              setServiceName(null);
              setIsServiceNameLoading(false);
            }
          }
        };

        fetchServiceName();
      }

      return () => {
        isMounted.current = false;
      };
    }, [type, metadata, request.ticketTitle]);

    // Check for insufficient balance on payment requests
    useEffect(() => {
      const checkBalance = async () => {
        if (!isMounted.current) return;

        // Only check balance for payment and subscription requests
        if (!isPaymentRequest && !isSubscriptionRequest) {
          setHasInsufficientBalance(false);
          return;
        }

        // If no wallet configured, insufficient balance check is irrelevant
        const hasWorkingWallet = hasECashWallets || activeWallet !== undefined;
        if (!hasWorkingWallet) {
          setHasInsufficientBalance(false);
          return;
        }

        const content = (metadata as SinglePaymentRequest)?.content;
        if (!content || amount == null) {
          setHasInsufficientBalance(false);
          return;
        }

        try {
          let requestedMsats = Number(amount);

          if (content.currency.tag === Currency_Tags.Fiat) {
            // For fiat payments, convert to msats and check NWC wallet balance
            try {
              const fiatCurrency = (content.currency as any).inner;
              const rawFiatAmount = Number(amount);
              const normalizedFiatAmount = rawFiatAmount / 100; // incoming amount is in minor units (e.g., cents)
              const amountInMsat = await CurrencyConversionService.convertAmount(
                normalizedFiatAmount,
                fiatCurrency[0],
                'MSATS'
              );

              requestedMsats = Math.round(amountInMsat);
            } catch (_error) {
              setHasInsufficientBalance(false);
            }
          }

          const requiredSats = Math.ceil(requestedMsats / 1000); // Convert msats to sats for eCash
          let canPay = false;
          const walletInfo = await activeWallet?.getWalletInfo();
          const walletBalance = Number(walletInfo?.balanceInSats) || 0;
          // 1) Consider NWC LN wallet balance (msats)
          // const walletBalance = Number(walletInfo?.balanceInSats);
          if (!Number.isNaN(walletBalance) && walletBalance >= requiredSats) {
            canPay = true;
          }

          for (const [_walletKey, wallet] of Object.entries(wallets)) {
            try {
              const balance = await wallet.getBalance();
              if (balance >= requiredSats) {
                canPay = true;
                break;
              }
            } catch (_error) {}
          }

          setHasInsufficientBalance(!canPay);
        } catch (_error) {
          setHasInsufficientBalance(false);
        }
      };

      checkBalance();
    }, [
      isPaymentRequest,
      isSubscriptionRequest,
      hasECashWallets,
      metadata,
      amount,
      wallets,
      activeWallet,
    ]);

    // Currency conversion effect
    useEffect(() => {
      const convertCurrency = async () => {
        if (!isMounted.current) return;

        // Only convert for payment and subscription requests with amounts
        if ((!isPaymentRequest && !isSubscriptionRequest) || amount == null) {
          setConvertedAmount(null);
          setIsConvertingCurrency(false);
          return;
        }

        const content = (metadata as SinglePaymentRequest)?.content;
        if (!content) {
          setConvertedAmount(null);
          setIsConvertingCurrency(false);
          return;
        }

        // Determine source currency and normalized display currency
        const isFiat = content.currency.tag === Currency_Tags.Fiat;
        const fiatCurrency = isFiat ? (content.currency as any).inner : null;
        const sourceCurrency = isFiat
          ? Array.isArray(fiatCurrency)
            ? fiatCurrency[0]
            : fiatCurrency
          : 'MSATS';

        // Normalize display currency for comparison (MSATS -> SATS, handle case)
        const normalizedDisplayCurrency = isFiat
          ? normalizeCurrencyForComparison(sourceCurrency)
          : 'SATS'; // MSATS normalizes to SATS for display
        const normalizedPreferredCurrency = normalizeCurrencyForComparison(preferredCurrency);

        // Skip conversion if currencies are the same (case-insensitive, with sats normalization)
        if (
          normalizedDisplayCurrency &&
          normalizedPreferredCurrency &&
          normalizedDisplayCurrency === normalizedPreferredCurrency
        ) {
          // No conversion needed - currencies match
          if (isMounted.current) {
            setConvertedAmount(null);
            setIsConvertingCurrency(false);
          }
          return;
        }

        try {
          setIsConvertingCurrency(true);

          const sourceAmount = isFiat ? Number(amount) / 100 : Number(amount);

          // Convert to user's preferred currency
          const converted = await CurrencyConversionService.convertAmount(
            sourceAmount,
            sourceCurrency,
            preferredCurrency
          );

          if (isMounted.current) {
            setConvertedAmount(converted);
            setIsConvertingCurrency(false);
          }
        } catch (_error) {
          if (isMounted.current) {
            setConvertedAmount(null);
            setIsConvertingCurrency(false);
          }
        }
      };

      convertCurrency();
    }, [isPaymentRequest, isSubscriptionRequest, amount, metadata, preferredCurrency]);

    // Format service name - for tickets, use requestor name; for others, use service name
    const formatServiceName = () => {
      if (isTicketRequest) {
        // For ticket requests, show requestor name as main service name (matching payment request style)
        return requestorName || 'Unknown Requestor';
      }
      return serviceName || 'Unknown Service';
    };

    // Format secondary info - for tickets, show ticket title; for others, show recipient pubkey
    const formatSecondaryInfo = () => {
      if (isTicketRequest) {
        // For ticket requests, show ticket title as secondary info
        if (amount && Number(amount) > 1) {
          const ticketAmount = Number(amount);
          return `${serviceName || request.ticketTitle || 'Unknown Ticket'} x ${ticketAmount}`;
        }
        return serviceName || request.ticketTitle || 'Unknown Ticket';
      }
      // For payment/subscription requests, show truncated recipient pubkey
      return truncatePubkey(recipientPubkey);
    };

    // Normalize amount and currency from request format to formatActivityAmount format
    const getNormalizedAmountAndCurrency = (): {
      normalizedAmount: number;
      normalizedCurrency: string;
    } | null => {
      if (!content || amount == null) return null;

      if (content.currency.tag === Currency_Tags.Fiat) {
        const fiatCodeRaw = (content.currency as any).inner;
        const fiatCode = Array.isArray(fiatCodeRaw) ? fiatCodeRaw[0] : fiatCodeRaw;
        // Convert from minor units (cents) to major units (dollars)
        const normalizedAmount = Number(amount) / 100;
        return { normalizedAmount, normalizedCurrency: String(fiatCode).toUpperCase() };
      } else {
        // Millisats: convert to sats
        const normalizedAmount = Number(amount) / 1000;
        return { normalizedAmount, normalizedCurrency: 'SATS' };
      }
    };

    // Determine what warning to show (if any)
    const warningInfo = useMemo(() => {
      // Only show warnings for payment and subscription requests
      if (!isPaymentRequest && !isSubscriptionRequest) {
        return null;
      }

      // Don't show warnings while wallet status is still loading
      if (eCashLoading) {
        return null;
      }

      // Check if user has any functional wallet
      // For eCash: must have wallets, for Lightning: must be actually connected (not just configured)
      const hasWorkingWallet = hasECashWallets || activeWallet !== undefined;

      if (!hasWorkingWallet) {
        return {
          type: 'no-wallet',
          message: 'No wallet configured',
          description: 'Configure a wallet to make payments',
        };
      }

      if (hasInsufficientBalance) {
        return {
          type: 'insufficient-balance',
          message: 'Insufficient balance',
          description: 'Not enough funds to complete this payment',
        };
      }

      return null;
    }, [
      isPaymentRequest,
      isSubscriptionRequest,
      hasECashWallets,
      activeWallet,
      hasInsufficientBalance,
      eCashLoading,
    ]);

    // Determine if approve button should be disabled
    const isApproveDisabled = () => {
      // Only disable for payment and subscription requests
      if (!isPaymentRequest && !isSubscriptionRequest) {
        return false;
      }

      // Don't disable while wallet status is still loading
      if (eCashLoading) {
        return false;
      }

      // Check if user has any functional wallet
      const hasWorkingWallet = hasECashWallets || activeWallet !== undefined;

      // Disable if no wallet configured or insufficient balance
      return !hasWorkingWallet || hasInsufficientBalance;
    };

    const approveDisabled = isApproveDisabled();

    return (
      <View style={[styles.card, { backgroundColor: cardBackgroundColor, shadowColor }]}>
        <Text style={[styles.requestType, { color: secondaryTextColor }]}>
          {getRequestTypeText(type)}
        </Text>

        <Text
          style={[
            styles.serviceName,
            { color: primaryTextColor },
            (isTicketRequest ? !requestorName : !serviceName) && styles.unknownService,
          ]}
        >
          {isTicketRequest ? (
            // For ticket requests, show requestor name (loading state)
            isRequestorNameLoading ? (
              <SkeletonPulse
                style={[styles.serviceNameSkeleton, { backgroundColor: skeletonBaseColor }]}
              />
            ) : (
              formatServiceName()
            )
          ) : // For payment/subscription requests, show service name (loading state)
          isServiceNameLoading ? (
            <SkeletonPulse
              style={[styles.serviceNameSkeleton, { backgroundColor: skeletonBaseColor }]}
            />
          ) : // For payment/subscription requests, show service name (loading state)
          isServiceNameLoading ? (
            <SkeletonPulse
              style={[styles.serviceNameSkeleton, { backgroundColor: skeletonBaseColor }]}
            />
          ) : (
            formatServiceName()
          )}
        </Text>

        <Text style={[styles.serviceInfo, { color: secondaryTextColor }]}>
          {isTicketRequest
            ? // For ticket requests, show ticket title as secondary info
              formatSecondaryInfo()
            : // For payment/subscription requests, show truncated recipient pubkey
              formatSecondaryInfo()}
        </Text>

        {(isPaymentRequest || isSubscriptionRequest) && amount !== null && (
          <View style={[styles.amountContainer, { borderColor }]}>
            {isSubscriptionRequest ? (
              <View style={styles.amountRow}>
                <Text style={[styles.amountText, { color: primaryTextColor }]}>
                  {(() => {
                    const normalized = getNormalizedAmountAndCurrency();
                    return normalized
                      ? formatActivityAmount(
                          normalized.normalizedAmount,
                          normalized.normalizedCurrency
                        )
                      : '';
                  })()}
                </Text>
                <Text style={[styles.recurranceText, { color: primaryTextColor }]}>
                  {recurrence?.toLowerCase()}
                </Text>
              </View>
            ) : (
              <Text style={[styles.amountText, { color: primaryTextColor }]}>
                {(() => {
                  const normalized = getNormalizedAmountAndCurrency();
                  return normalized
                    ? formatActivityAmount(
                        normalized.normalizedAmount,
                        normalized.normalizedCurrency
                      )
                    : '';
                })()}
              </Text>
            )}

            {/* Converted amount display - only show if currencies are different */}
            {(isConvertingCurrency || convertedAmount !== null) &&
              (() => {
                if (!content || amount == null) return false;
                const isFiat = content.currency.tag === Currency_Tags.Fiat;

                // Normalize currencies for comparison
                if (isFiat) {
                  const fiatCodeRaw = (content.currency as any).inner;
                  const fiatCode = Array.isArray(fiatCodeRaw) ? fiatCodeRaw[0] : fiatCodeRaw;
                  const normalizedFiat = normalizeCurrencyForComparison(fiatCode);
                  const normalizedPreferred = normalizeCurrencyForComparison(preferredCurrency);
                  return normalizedFiat !== normalizedPreferred;
                }
                // For MSATS, normalized display currency is SATS
                const normalizedPreferred = normalizeCurrencyForComparison(preferredCurrency);
                return 'SATS' !== normalizedPreferred;
              })() && (
                <View style={styles.convertedAmountContainer}>
                  {isConvertingCurrency ? (
                    <SkeletonPulse
                      style={[
                        styles.convertedAmountSkeleton,
                        { backgroundColor: skeletonBaseColor },
                      ]}
                    />
                  ) : (
                    <Text style={[styles.convertedAmountText, { color: secondaryTextColor }]}>
                      {CurrencyConversionService.formatConvertedAmountWithFallback(
                        convertedAmount,
                        preferredCurrency
                      )}
                    </Text>
                  )}
                </View>
              )}
          </View>
        )}

        {isNostrConnect && (
          <View style={[styles.nostrConnectContainer, { borderColor }]}>
            {(() => {
              // For Connect method (nip46), show requested permissions
              if (nostrConnectMethod === NostrConnectMethod.Connect) {
                const requestedPermissions = nostrConnectParams.at(2);

                if (!requestedPermissions) return null;

                // Parse permissions (can be string or array)
                const permissions =
                  typeof requestedPermissions === 'string'
                    ? requestedPermissions.split(',').map(p => p.trim())
                    : [];

                if (permissions.length === 0) return null;

                const maxCollapsedItems = 3;
                const shouldShowExpand = permissions.length > maxCollapsedItems;
                const displayedPermissions = isPermissionsExpanded
                  ? permissions
                  : permissions.slice(0, maxCollapsedItems);

                return (
                  <View style={styles.permissionsContainer}>
                    <TouchableOpacity
                      style={styles.permissionsHeader}
                      onPress={() =>
                        shouldShowExpand && setIsPermissionsExpanded(!isPermissionsExpanded)
                      }
                      disabled={!shouldShowExpand}
                      activeOpacity={shouldShowExpand ? 0.7 : 1}
                    >
                      <Text style={[styles.permissionsLabel, { color: secondaryTextColor }]}>
                        Requested Permissions {shouldShowExpand && `(${permissions.length})`}
                      </Text>
                      {shouldShowExpand &&
                        (isPermissionsExpanded ? (
                          <ChevronUp size={16} color={secondaryTextColor} />
                        ) : (
                          <ChevronDown size={16} color={secondaryTextColor} />
                        ))}
                    </TouchableOpacity>
                    <View style={styles.permissionsList}>
                      {displayedPermissions.map((permission: string) => (
                        <View key={permission} style={styles.permissionItem}>
                          <Text style={[styles.permissionText, { color: primaryTextColor }]}>
                            {permission}
                          </Text>
                        </View>
                      ))}
                      {!isPermissionsExpanded && shouldShowExpand && (
                        <Text style={[styles.showMoreText, { color: secondaryTextColor }]}>
                          +{permissions.length - maxCollapsedItems} more
                        </Text>
                      )}
                    </View>
                  </View>
                );
              } else {
                return (
                  <View style={styles.methodInfoContainer}>
                    <Text style={[styles.methodDescription, { color: secondaryTextColor }]}>
                      Nostr Connect request
                    </Text>
                  </View>
                );
              }
            })()}
          </View>
        )}

        {warningInfo && (
          <View
            style={[
              styles.warningContainer,
              { backgroundColor: `${warningColor}15`, borderColor: `${warningColor}40` },
            ]}
          >
            <AlertTriangle size={16} color={warningColor} />
            <View style={styles.warningTextContainer}>
              <Text style={[styles.warningMessage, { color: warningColor }]}>
                {warningInfo.message}
              </Text>
              <Text style={[styles.warningDescription, { color: secondaryTextColor }]}>
                {warningInfo.description}
              </Text>
            </View>
          </View>
        )}

        <View style={styles.actions}>
          <TouchableOpacity
            style={[
              styles.button,
              styles.approveButton,
              {
                backgroundColor: approveDisabled ? buttonSecondaryColor : buttonSuccessBgColor,
              },
            ]}
            onPress={() => !approveDisabled && approve(id)}
            disabled={approveDisabled}
          >
            <Ionicons
              name="checkmark-outline"
              size={20}
              color={approveDisabled ? tertiaryColor : buttonSuccessColor}
            />
            <Text
              style={[
                styles.buttonText,
                { color: approveDisabled ? tertiaryColor : buttonSuccessColor },
              ]}
            >
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
            <Ionicons
              name="close-outline"
              size={20}
              color={useThemeColor({}, 'buttonDangerText')}
            />
            <Text style={[styles.buttonText, { color: useThemeColor({}, 'buttonDangerText') }]}>
              Deny
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  },
  (prevProps, nextProps) => {
    // Only re-render if the request id or type changes
    return (
      prevProps.request.id === nextProps.request.id &&
      prevProps.request.type === nextProps.request.type
    );
  }
);

PendingRequestCard.displayName = 'PendingRequestCard';

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
  serviceInfoSkeleton: {
    borderRadius: 4,
    width: 120,
    height: 14,
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
  serviceNameSkeleton: {
    borderRadius: 8,
    marginBottom: 8,
    width: '80%',
    height: 20,
  },
  warningContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 16,
    gap: 10,
  },
  warningTextContainer: {
    flex: 1,
    gap: 2,
  },
  warningMessage: {
    fontSize: 14,
    fontWeight: '600',
  },
  warningDescription: {
    fontSize: 12,
    fontWeight: '400',
  },
  convertedAmountContainer: {
    alignItems: 'center',
    marginTop: 8,
  },
  convertedAmountText: {
    fontSize: 14,
    fontWeight: '500',
    fontStyle: 'italic',
  },
  convertedAmountSkeleton: {
    width: 80,
    height: 14,
    borderRadius: 4,
  },
  nostrConnectContainer: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
    marginBottom: 20,
  },
  permissionsContainer: {
    gap: 12,
  },
  permissionsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  permissionsLabel: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    flex: 1,
  },
  permissionsList: {
    gap: 8,
  },
  permissionItem: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  permissionText: {
    fontSize: 14,
    fontWeight: '500',
  },
  showMoreText: {
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 4,
    textAlign: 'center',
  },
  methodInfoContainer: {
    gap: 8,
  },
  methodDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
});
