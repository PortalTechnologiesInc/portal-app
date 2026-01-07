import {
  PaymentType,
  type PrepareSendPaymentResponse,
  type SdkEvent,
  SdkEvent_Tags,
  SendPaymentMethod,
} from '@breeztech/breez-sdk-spark-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import bolt11 from 'light-bolt11-decoder';
import LottieView from 'lottie-react-native';
import { ArrowLeft, Ban, Send } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { Colors } from 'react-native/Libraries/NewAppScreen';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useCurrency } from '@/context/CurrencyContext';
import { useDatabaseContext } from '@/context/DatabaseContext';
import { useWalletManager } from '@/context/WalletManagerContext';
import { useThemeColor } from '@/hooks/useThemeColor';
import { WALLET_TYPE } from '@/models/WalletType';
import type { BreezService } from '@/services/BreezService';
import { CurrencyConversionService } from '@/services/CurrencyConversionService';
import { ActivityType, globalEvents } from '@/utils/common';

enum PageState {
  PaymentRecap = 0,
  PaymentSent = 1,
}

export default function MyWalletManagementSecret() {
  const { invoice } = useLocalSearchParams<{ invoice: string }>();
  const router = useRouter();

  const { preferredCurrency } = useCurrency();
  const { getWallet } = useWalletManager();
  const { executeOperation } = useDatabaseContext();
  const [breezWallet, setBreezWallet] = useState<BreezService | null>(null);
  const [balanceSats, setBalanceSats] = useState<bigint | null>(null);

  const [amountMillisats, setAmountMillisats] = useState<number | null>(null);
  const [convertedAmount, setConvertedAmount] = useState<number | null>(null);
  const [feesInSats, setFeesInSats] = useState<number | null>(null);
  const [convertedFeesInSats, setConvertedFeesInSats] = useState<number | null>(null);
  const [description, setDescription] = useState<string | null>(null);
  const [prepareSendPaymentResponse, setPrepareSendPaymentResponse] =
    useState<PrepareSendPaymentResponse | null>(null);
  const [isSendPaymentLoading, setIsSendPaymentLoading] = useState(false);
  const [pageState, setPageState] = useState(PageState.PaymentRecap);
  const [isPaymentSent, setIsPaymentSent] = useState(false);

  const backgroundColor = useThemeColor({}, 'background');
  const primaryTextColor = useThemeColor({}, 'textPrimary');
  const secondaryTextColor = useThemeColor({}, 'textSecondary');
  const buttonPrimaryColor = useThemeColor({}, 'buttonPrimary');
  const buttonPrimaryTextColor = useThemeColor({}, 'buttonPrimaryText');
  const errorColor = useThemeColor({}, 'statusError');

  const totalToPaySats = useMemo(() => {
    if (!amountMillisats || feesInSats == null) return null;
    return amountMillisats / 1000 + feesInSats;
  }, [amountMillisats, feesInSats]);

  const canPay = useMemo(() => {
    if (isSendPaymentLoading) return false;
    if (totalToPaySats == null || balanceSats == null) return false;
    if (!prepareSendPaymentResponse) return false;

    return totalToPaySats > 0 && totalToPaySats <= balanceSats;
  }, [isSendPaymentLoading, totalToPaySats, balanceSats, prepareSendPaymentResponse]);

  const payDisabledMessage = useMemo(() => {
    if (isSendPaymentLoading) {
      return 'Processing payment…';
    }

    if (balanceSats == null || totalToPaySats == null) {
      return 'Calculating payment details…';
    }

    if (totalToPaySats > balanceSats) {
      return `Insufficient balance: ${balanceSats} sats available, ${totalToPaySats} sats required`;
    }

    return null;
  }, [isSendPaymentLoading, balanceSats, totalToPaySats]);

  const payDisableMessageColor = useMemo(() => {
    if (totalToPaySats != null && balanceSats != null && totalToPaySats > balanceSats)
      return errorColor;
    return primaryTextColor;
  }, [totalToPaySats, balanceSats, primaryTextColor, errorColor]);

  useEffect(() => {
    if (!isPaymentSent) return;
    if (!isSendPaymentLoading) return;

    setIsSendPaymentLoading(false);

    setPageState(PageState.PaymentSent);

    setTimeout(() => {
      router.dismissTo('/Wallet');
    }, 2000);
  }, [isPaymentSent, isSendPaymentLoading, router]);

  const confirmPayment = useCallback(async () => {
    if (breezWallet == null) return;
    if (prepareSendPaymentResponse == null) return;

    setIsSendPaymentLoading(true);

    // Add payment status entry when payment is started
    try {
      const activityId = await executeOperation(db =>
        db.addActivity({
          type: ActivityType.Pay,
          service_key: 'Breez Wallet',
          service_name: 'Breez Wallet',
          detail: 'Payment pending',
          date: new Date(),
          amount: (amountMillisats ?? 0) / 1000,
          currency: 'sats',
          converted_amount: convertedAmount,
          converted_currency: preferredCurrency,
          request_id: invoice,
          subscription_id: null, // TODO: link to subscription if applicable
          status: 'neutral',
          invoice,
        })
      );

      await executeOperation(db => db.addPaymentStatusEntry(invoice, 'payment_started'), null);
      if (activityId) {
        const createdActivity = await executeOperation(db => db.getActivity(activityId), null);
        if (createdActivity) {
          globalEvents.emit('activityAdded', createdActivity);
        }
      }

      await breezWallet.sendPaymentWithPrepareResponse(prepareSendPaymentResponse);

      await executeOperation(db =>
        db.updateActivityStatus(activityId, 'positive', 'Payment completed')
      );
      await executeOperation(db => db.addPaymentStatusEntry(invoice, 'payment_completed'), null);
      globalEvents.emit('activityUpdated', { activityId });
    } catch (_error) {}

    setIsSendPaymentLoading(false);

    setPageState(PageState.PaymentSent);

    setTimeout(() => {
      router.dismissTo('/Wallet');
    }, 2000);
  }, [
    breezWallet,
    prepareSendPaymentResponse,
    invoice,
    router,
    executeOperation,
    amountMillisats,
    convertedAmount,
    preferredCurrency,
  ]);

  useEffect(() => {
    let active = true;

    getWallet(WALLET_TYPE.BREEZ).then(wallet => {
      if (active) setBreezWallet(wallet);
    });

    return () => {
      active = false;
    };
  }, [getWallet]);

  useEffect(() => {
    if (!breezWallet) return;

    breezWallet.getWalletInfo().then(info => {
      setBalanceSats(info.balanceInSats ?? null);
    });
  }, [breezWallet]);

  useEffect(() => {
    if (breezWallet == null) return;

    let listenerId: string;
    const handler = async (event: SdkEvent) => {
      let isPaid = false;
      if (
        event.tag === SdkEvent_Tags.PaymentSucceeded ||
        event.tag === SdkEvent_Tags.PaymentPending
      ) {
        const { paymentType } = event.inner.payment;
        isPaid = paymentType === PaymentType.Send;
      }

      if (isPaid) {
        breezWallet.removeEventListener(listenerId);
        setIsPaymentSent(true);
      }
    };

    breezWallet
      .addEventListener({
        onEvent: handler,
      })
      .then(id => {
        listenerId = id;
      });
  }, [breezWallet]);

  useEffect(() => {
    if (breezWallet == null) return;

    const parseInvoiceData = async () => {
      bolt11.decode(invoice).sections.map(async section => {
        if (section.name === 'amount') {
          setAmountMillisats(Number(section.value));
          const converted = await CurrencyConversionService.convertAmount(
            Number(section.value) / 1000,
            'sats',
            preferredCurrency
          );
          setConvertedAmount(converted);

          const prepareResponse = await breezWallet?.prepareSendPayment(
            invoice,
            BigInt(Number(section.value) / 1000)
          );

          setPrepareSendPaymentResponse(prepareResponse);
          if (prepareResponse.paymentMethod instanceof SendPaymentMethod.Bolt11Invoice) {
            const { lightningFeeSats, sparkTransferFeeSats } = prepareResponse.paymentMethod.inner;
            const totalFees = lightningFeeSats + (sparkTransferFeeSats ?? BigInt(0));
            const convertedFees = await CurrencyConversionService.convertAmount(
              Number(totalFees),
              'sats',
              preferredCurrency
            );
            setFeesInSats(Number(totalFees));
            setConvertedFeesInSats(convertedFees);
          }
        } else if (section.name === 'description') {
          setDescription(section.value);
        }
      });
    };

    parseInvoiceData();
  }, [invoice, breezWallet, preferredCurrency]);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]} edges={['top']}>
      <ThemedView style={[styles.container, { backgroundColor }]}>
        <ThemedView style={[styles.header, { backgroundColor }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={20} color={primaryTextColor} />
          </TouchableOpacity>
          <ThemedText style={[styles.headerText, { color: primaryTextColor }]}>Pay</ThemedText>
        </ThemedView>

        {pageState === PageState.PaymentRecap ? (
          <ThemedView
            style={{
              ...styles.content,
              flex: 1,
              justifyContent: 'center',
              alignItems: 'center',
              gap: 20,
            }}
          >
            <ThemedView style={{ gap: 5, alignItems: 'center', justifyContent: 'center', flex: 1 }}>
              <ThemedView style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-end' }}>
                <Text style={{ color: primaryTextColor, fontSize: 50, fontWeight: 'bold' }}>
                  {amountMillisats ? amountMillisats / 1000 : 0}
                </Text>
                <Text style={{ color: secondaryTextColor, fontSize: 30 }}>sats</Text>
              </ThemedView>

              <ThemedView style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
                <Text style={{ color: secondaryTextColor, fontSize: 30 }}>
                  {CurrencyConversionService.formatConvertedAmountWithFallback(
                    convertedAmount,
                    preferredCurrency
                  )}
                </Text>
              </ThemedView>

              <ThemedView>
                <ThemedView style={{ flexDirection: 'row', gap: 10, width: '70%' }}>
                  <ThemedView style={{ width: '40%', alignItems: 'flex-end' }}>
                    <ThemedText type="defaultSemiBold">Description</ThemedText>
                  </ThemedView>
                  <ThemedView style={{ width: '60%', alignItems: 'flex-start' }}>
                    <ThemedText>{description ?? 'No description'}</ThemedText>
                  </ThemedView>
                </ThemedView>
              </ThemedView>

              <ThemedView style={{ flexDirection: 'row', gap: 10, width: '70%' }}>
                <ThemedView style={{ width: '40%', alignItems: 'flex-end' }}>
                  <ThemedText type="defaultSemiBold">Fee</ThemedText>
                </ThemedView>
                <ThemedView style={{ width: '60%', alignItems: 'flex-start' }}>
                  <ThemedView style={{ flexDirection: 'row', gap: 5 }}>
                    <ThemedText>{feesInSats} sats</ThemedText>
                    <ThemedText style={{ color: secondaryTextColor }}>
                      {CurrencyConversionService.formatConvertedAmountWithFallback(
                        convertedFeesInSats,
                        preferredCurrency
                      )}
                    </ThemedText>
                  </ThemedView>
                </ThemedView>
              </ThemedView>
            </ThemedView>

            {payDisabledMessage && (
              <ThemedText
                style={{
                  color: payDisableMessageColor,
                  fontSize: 14,
                  textAlign: 'center',
                  marginBottom: 8,
                }}
              >
                {payDisabledMessage}
              </ThemedText>
            )}

            <ThemedView
              style={{
                flexDirection: 'row',
                gap: 40,
                backgroundColor: buttonPrimaryColor,
                borderRadius: 25,
                paddingTop: 10,
                paddingBottom: 10,
                paddingLeft: 30,
                paddingRight: 30,
              }}
            >
              <TouchableOpacity onPress={confirmPayment} disabled={!canPay}>
                <ThemedView
                  style={{ flexDirection: 'row', gap: 10, backgroundColor: buttonPrimaryColor }}
                >
                  {isSendPaymentLoading ? (
                    <ActivityIndicator size="small" color={buttonPrimaryTextColor} />
                  ) : (
                    <>
                      {canPay ? (
                        <>
                          <Send color={buttonPrimaryTextColor} />
                          <ThemedText style={{ fontWeight: 'bold', color: buttonPrimaryTextColor }}>
                            Pay
                          </ThemedText>
                        </>
                      ) : (
                        <Ban color={buttonPrimaryTextColor} />
                      )}
                    </>
                  )}
                </ThemedView>
              </TouchableOpacity>
            </ThemedView>
          </ThemedView>
        ) : (
          <ThemedView
            style={{
              alignItems: 'center',
              justifyContent: 'center',
              flex: 1,
              gap: 30,
            }}
          >
            <LottieView
              source={require('../../assets/icons/CheckAnimation.json')}
              autoPlay
              loop={false}
              style={{ width: 200, height: 200 }}
            />
          </ThemedView>
        )}
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    // backgroundColor handled by theme
  },
  container: {
    flex: 1,
    // backgroundColor handled by theme
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 20,
    // backgroundColor handled by theme
  },
  backButton: {
    marginRight: 15,
  },
  headerText: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  description: {
    // color handled by theme
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 24,
  },
  walletUrlCard: {
    borderRadius: 20,
    padding: 16,
    marginBottom: 24,
    // backgroundColor handled by theme
  },
  walletUrlHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  walletUrlLabel: {
    fontSize: 16,
    fontWeight: '600',
    // color handled by theme
  },
  walletUrlInputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  walletUrlInput: {
    flex: 1,
    // color and backgroundColor handled by theme
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginRight: 8,
    textAlignVertical: 'top',
    minHeight: 44,
    maxHeight: 200,
  },
  walletUrlAction: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    // backgroundColor handled by theme
  },
  walletUrlActions: {
    flexDirection: 'column',
    gap: 8,
  },
  deleteButton: {
    marginTop: 4,
  },
  qrCodeButton: {
    // backgroundColor handled by theme
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusContainer: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  statusText: {
    fontSize: 16,
    color: Colors.almostWhite,
  },
  walletStatusContainer: {
    // backgroundColor handled by theme
    borderRadius: 20,
    padding: 16,
    marginTop: 16,
    minHeight: 80,
  },
  walletStatusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  walletStatusTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  connectionStatusSection: {
    marginBottom: 0,
  },
  connectionStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  connectionStatusIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    // backgroundColor handled by theme
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  loadingSpinner: {
    // Could add rotation animation here if needed
  },
  connectionStatusContent: {
    flex: 1,
  },
  connectionStatusHorizontal: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  connectionStatusLabel: {
    fontSize: 14,
    color: Colors.dirtyWhite,
  },
  connectionStatusValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  connectionStatusError: {
    fontSize: 13,
    color: '#FF4444',
    fontStyle: 'italic',
  },
  connectionStatusDescription: {
    fontSize: 13,
    color: Colors.gray,
    fontStyle: 'italic',
  },
  walletInfoSection: {
    marginTop: 8,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginTop: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
  },
  refreshButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  refreshButtonText: {
    fontSize: 18,
    marginTop: -2,
    fontWeight: 'bold',
  },

  walletInfoLoading: {
    fontSize: 14,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 16,
  },
  walletInfoError: {
    fontSize: 14,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 16,
  },
  walletInfoPlaceholder: {
    fontSize: 14,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 16,
  },
  walletInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  walletInfoItem: {
    flex: 1,
  },
  walletInfoItemWithLabels: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  walletInfoField: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  walletInfoFieldLabel: {
    fontSize: 14,
    color: Colors.dirtyWhite,
    marginRight: 6,
  },
  walletInfoFieldValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  walletInfoLabel: {
    fontSize: 14,
    color: Colors.dirtyWhite,
    marginBottom: 4,
  },
  walletInfoValue: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  walletInfoSubtext: {
    fontSize: 13,
    color: Colors.gray,
    fontStyle: 'italic',
  },
});
