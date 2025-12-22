import { PaymentType, type SdkEvent, SdkEvent_Tags } from '@breeztech/breez-sdk-spark-react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import LottieView from 'lottie-react-native';
import { ArrowDownUp, ArrowLeft, ClipboardCopy, HandCoins, QrCode, X } from 'lucide-react-native';
import { Currency } from 'portal-app-lib';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
} from 'react-native';
import { Colors } from 'react-native/Libraries/NewAppScreen';
import QRCode from 'react-native-qrcode-svg';
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
import { PortalAppManager } from '@/services/PortalAppManager';
import { Currency as CurrencyConv } from '@/utils/currency';
import { showToast } from '@/utils/Toast';

const portalLogo = require('../../assets/images/iosLight.png');

enum PageState {
  GetInvoiceInfo = 0,
  InvoiceCreating = 1,
  ShowInvoiceInfo = 2,
  ShowPaymentSent = 3,
  PaymentReceived = 4,
}

export default function MyWalletManagementSecret() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const { preferredCurrency, getCurrentCurrencySymbol } = useCurrency();
  const { executeOperation } = useDatabaseContext();

  const backgroundColor = useThemeColor({}, 'background');
  const primaryTextColor = useThemeColor({}, 'textPrimary');
  const secondaryTextColor = useThemeColor({}, 'textSecondary');
  const buttonPrimaryColor = useThemeColor({}, 'buttonPrimary');
  const buttonPrimaryTextColor = useThemeColor({}, 'buttonPrimaryText');
  const inputBackground = useThemeColor({}, 'inputBackground');
  const placeholderColor = useThemeColor({}, 'inputPlaceholder');
  const { getWallet } = useWalletManager();
  const [breezWallet, setBreezWallet] = useState<BreezService | null>(null);
  const [amount, setAmount] = useState('0');
  const [description, setDescription] = useState('');
  const [convertedAmount, setConvertedAmount] = useState(0);
  const [isConverting, setIsConverting] = useState(false);
  const [isPaymentRequestLoading, setIsPaymentRequestLoading] = useState(false);
  const [pageState, setPageState] = useState(PageState.GetInvoiceInfo);
  const [invoice, setInvoice] = useState('');
  const [contactNpub, setContactNpub] = useState<string | null>(null);
  const [reverseCurrency, setReverseCurrency] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);

  const textInputRef = useRef<TextInput | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!amount || amount === '0') {
      setConvertedAmount(0);
      setIsConverting(false);
      return;
    }

    setIsConverting(true);

    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    timeoutRef.current = setTimeout(async () => {
      const numAmount = Number(amount);

      const converted = await CurrencyConversionService.convertAmount(
        numAmount,
        reverseCurrency ? preferredCurrency : 'sats',
        reverseCurrency ? 'sats' : preferredCurrency
      );

      setConvertedAmount(converted);
      setIsConverting(false);
    }, 800);
  }, [amount, preferredCurrency, reverseCurrency]);

  const handleChangeText = useCallback(
    (input: string) => {
      if (reverseCurrency) {
        const cleaned = input.replace(/[^0-9.]/g, '');
        const parts = cleaned.split('.');

        if (parts.length > 2) return;
        if (parts[1]?.length > 2) return;

        parts[0] = parts[0].replace(/^0+(?!$)/, '');
        if (parts[0] === '') parts[0] = '0';

        const result = parts.join('.');
        setAmount(result === '' ? '0' : result);
      } else {
        const cleaned = input.replace(/\D/g, '');
        if (cleaned === '') {
          setAmount('0');
        } else {
          setAmount(cleaned.replace(/^0+(?!$)/, '') || '0');
        }
      }
    },
    [reverseCurrency]
  );

  const reverseCurrencyTap = useCallback(async () => {
    setIsSwitching(true);
    const currentAmountNum = Number(amount) || 0;

    let newAmountInTargetCurrency: number;

    if (reverseCurrency) {
      newAmountInTargetCurrency = await CurrencyConversionService.convertAmount(
        currentAmountNum,
        preferredCurrency,
        'sats'
      );
      newAmountInTargetCurrency = Math.floor(newAmountInTargetCurrency);
    } else {
      newAmountInTargetCurrency = await CurrencyConversionService.convertAmount(
        currentAmountNum,
        'sats',
        preferredCurrency
      );
      newAmountInTargetCurrency = Number(newAmountInTargetCurrency.toFixed(2));
    }

    setReverseCurrency(prev => !prev);
    setAmount(newAmountInTargetCurrency === 0 ? '0' : newAmountInTargetCurrency.toString());
    setIsSwitching(false);
  }, [amount, reverseCurrency, preferredCurrency]);

  const waitForPayment = useCallback(
    (_invoice: string, amount: bigint): Promise<void> => {
      return new Promise(resolve => {
        if (!breezWallet) {
          resolve();
          return;
        }

        let listenerId: string;
        const handler = async (event: SdkEvent) => {
          console.log('[BREEZ EVENT]:', event);

          let isPaid = false;
          if (event.tag === SdkEvent_Tags.PaymentSucceeded) {
            const { amount: paymentAmount, paymentType } = event.inner.payment;
            isPaid = paymentType === PaymentType.Receive && amount === paymentAmount;
          }

          if (isPaid) {
            breezWallet.removeEventListener(listenerId);
            resolve();
          }
        };

        breezWallet
          .addEventListener({
            onEvent: handler,
          })
          .then(id => {
            listenerId = id;
          });
      });
    },
    [breezWallet]
  );

  const generateInvoice = useCallback(async () => {
    if (!breezWallet) return;

    setPageState(PageState.InvoiceCreating);
    const amountSats = reverseCurrency ? BigInt(convertedAmount) : BigInt(amount);
    const createdInvoice = await breezWallet?.receivePayment(amountSats, description);

    // Add payment status entry when invoice is created
    try {
      await executeOperation(
        db => db.addPaymentStatusEntry(createdInvoice, 'payment_started'),
        null
      );
    } catch (error) {
      console.error('Failed to add payment_started status entry:', error);
    }

    setInvoice(createdInvoice);
    setPageState(PageState.ShowInvoiceInfo);

    await waitForPayment(createdInvoice, amountSats);
    setPageState(PageState.PaymentReceived);

    setTimeout(() => {
      router.dismissTo('/Wallet');
    }, 2000);
  }, [
    amount,
    breezWallet,
    convertedAmount,
    description,
    reverseCurrency,
    router,
    waitForPayment,
    executeOperation,
  ]);

  const sendPaymentRequest = useCallback(async () => {
    if (contactNpub == null) return;
    if (breezWallet == null) return;

    setIsPaymentRequestLoading(true);

    try {
      const amountSats = reverseCurrency ? BigInt(Math.trunc(convertedAmount)) : BigInt(amount);

      const invoice = await breezWallet.receivePayment(amountSats, description);
      const nowPlus24HoursMs = Date.now() + 24 * 60 * 60 * 1000;

      await PortalAppManager.tryGetInstance().singlePaymentRequest(contactNpub, {
        amount: amountSats * BigInt(1000),
        description,
        currency: new Currency.Millisats(),
        invoice,
        requestId: '',
        expiresAt: BigInt(nowPlus24HoursMs),
        authToken: undefined,
        currentExchangeRate: undefined,
        subscriptionId: undefined,
      });

      await executeOperation(db => db.saveNip05Contact(contactNpub));
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      Alert.alert('Error', 'Error while sendig the request. Retry.');
      return;
    } finally {
      setIsPaymentRequestLoading(false);
    }

    setPageState(PageState.ShowPaymentSent);
    setTimeout(() => {
      router.dismissTo('/Wallet');
    }, 2000);
  }, [
    contactNpub,
    breezWallet,
    reverseCurrency,
    convertedAmount,
    amount,
    description,
    executeOperation,
    router,
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
    const npub = params.npub as string | null;
    setContactNpub(npub);
  }, [params]);

  useEffect(() => {
    const t = setTimeout(() => {
      textInputRef.current?.focus();
    }, 150);

    return () => clearTimeout(t);
  }, []);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <ScrollView
            contentContainerStyle={{ flexGrow: 1 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <ThemedView style={[styles.container, { backgroundColor }]}>
              <ThemedView style={[styles.header, { backgroundColor }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                  <ArrowLeft size={20} color={primaryTextColor} />
                </TouchableOpacity>
                <ThemedText style={[styles.headerText, { color: primaryTextColor }]}>Receive</ThemedText>
              </ThemedView>

              {pageState === PageState.GetInvoiceInfo ? (
                <ThemedView
                  style={{
                    ...styles.content,
                    flex: 1,
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: 20,
                  }}
                >
                  <ThemedView
                    style={{
                      gap: 20,
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '80%',
                      flex: 1,
                    }}
                  >
                    <ThemedView style={{ alignItems: 'center' }}>
                      <ThemedView style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <TextInput
                          ref={textInputRef}
                          style={{
                            color: primaryTextColor,
                            textAlign: 'center',
                            fontSize: 40,
                          }}
                          placeholderTextColor={placeholderColor}
                          autoCorrect={false}
                          value={amount}
                          onBlur={() => {
                            if (amount === '') setAmount('0');
                          }}
                          onFocus={() => {
                            if (amount === '0') setAmount('');
                          }}
                          autoCapitalize="none"
                          keyboardType="number-pad"
                          placeholder={`0`}
                          onChangeText={handleChangeText}
                          onSubmitEditing={Keyboard.dismiss}
                          returnKeyType='done'
                        />
                        {
                          <Text style={{ color: secondaryTextColor, fontSize: 25 }}>
                            {reverseCurrency ? getCurrentCurrencySymbol() : 'Sats'}
                          </Text>
                        }
                      </ThemedView>

                      <TouchableOpacity
                        onPress={reverseCurrencyTap}
                        disabled={isSwitching}
                        style={{ paddingTop: 10, paddingBottom: 10, paddingLeft: 30, paddingRight: 30 }}
                      >
                        <ThemedView style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                          {isSwitching ? (
                            <ActivityIndicator size="small" color={secondaryTextColor} />
                          ) : (
                            <ArrowDownUp size={30} color={secondaryTextColor} />
                          )}
                        </ThemedView>
                      </TouchableOpacity>

                      {isConverting ? (
                        <ActivityIndicator color={primaryTextColor} size="small" />
                      ) : (
                        <ThemedText>
                          {CurrencyConversionService.formatConvertedAmountWithFallback(
                            convertedAmount,
                            reverseCurrency ? CurrencyConv.SATS : preferredCurrency
                          )}
                        </ThemedText>
                      )}
                    </ThemedView>

                    <TextInput
                      style={[
                        styles.verificationInput,
                        {
                          backgroundColor: inputBackground,
                          color: primaryTextColor,
                          textAlign: 'center',
                        },
                      ]}
                      editable
                      multiline
                      numberOfLines={4}
                      maxLength={40}
                      autoCorrect={false}
                      autoCapitalize="none"
                      keyboardType="default"
                      placeholder="Description"
                      placeholderTextColor={placeholderColor}
                      value={description}
                      onChangeText={text => setDescription(text)}
                      returnKeyType='done'
                    />
                  </ThemedView>

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
                    {contactNpub == null ? (
                      <TouchableOpacity onPress={generateInvoice}>
                        <ThemedView
                          style={{ flexDirection: 'row', gap: 10, backgroundColor: buttonPrimaryColor }}
                        >
                          <QrCode color={buttonPrimaryTextColor} />
                          <ThemedText style={{ fontWeight: 'bold', color: buttonPrimaryTextColor }}>
                            Generate invoice
                          </ThemedText>
                        </ThemedView>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity onPress={sendPaymentRequest}>
                        <ThemedView
                          style={{ flexDirection: 'row', gap: 10, backgroundColor: buttonPrimaryColor }}
                        >
                          {isPaymentRequestLoading ? (
                            <ActivityIndicator size="small" color={buttonPrimaryTextColor} />
                          ) : (
                            <>
                              <HandCoins color={buttonPrimaryTextColor} />
                              <ThemedText style={{ fontWeight: 'bold', color: buttonPrimaryTextColor }}>
                                Request payment
                              </ThemedText>
                            </>
                          )}
                        </ThemedView>
                      </TouchableOpacity>
                    )}
                  </ThemedView>
                </ThemedView>
              ) : pageState === PageState.InvoiceCreating ? (
                <ThemedView style={{ alignItems: 'center', justifyContent: 'center', flex: 1 }}>
                  <ActivityIndicator color={primaryTextColor} size={60} />
                </ThemedView>
              ) : pageState === PageState.ShowInvoiceInfo ? (
                <ThemedView style={{ ...styles.content, flex: 1, gap: 20, alignItems: 'center' }}>
                  <ThemedView
                    style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 20 }}
                  >
                    <ThemedView
                      style={{
                        borderColor: primaryTextColor,
                        borderWidth: 2,
                        padding: 10,
                        borderRadius: 10,
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}
                    >
                      <QRCode size={300} value={invoice} quietZone={5} />

                      <Image
                        source={portalLogo}
                        style={{
                          position: 'absolute',
                          width: 100,
                          height: 100,
                          backgroundColor: 'white',
                          borderRadius: 30,
                          borderColor: 'black',
                          borderWidth: 2,
                        }}
                      />
                    </ThemedView>

                    <ThemedView style={{ flexDirection: 'row', gap: 10 }}>
                      <Text style={{ color: primaryTextColor, fontSize: 20 }}>Amount</Text>
                      <ThemedView>
                        <Text style={{ color: secondaryTextColor, fontSize: 20 }}>
                          {reverseCurrency ? parseInt(convertedAmount.toString()) : amount} sats
                        </Text>
                        <Text style={{ color: secondaryTextColor, fontSize: 20 }}>
                          {CurrencyConversionService.formatConvertedAmountWithFallback(
                            reverseCurrency ? Number(amount) : convertedAmount,
                            preferredCurrency
                          )}
                        </Text>
                      </ThemedView>
                    </ThemedView>

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
                      <TouchableOpacity
                        onPress={() => {
                          Clipboard.setString(invoice);
                          showToast('Invoice copied in the clipboard!', 'success');
                        }}
                      >
                        <ThemedView
                          style={{ flexDirection: 'row', gap: 10, backgroundColor: buttonPrimaryColor }}
                        >
                          <ClipboardCopy color={buttonPrimaryTextColor} />
                          <ThemedText style={{ fontWeight: 'bold', color: buttonPrimaryTextColor }}>
                            Copy
                          </ThemedText>
                        </ThemedView>
                      </TouchableOpacity>
                    </ThemedView>
                  </ThemedView>

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
                    <TouchableOpacity
                      onPress={() => {
                        setAmount('0');
                        setDescription('');
                        setPageState(PageState.GetInvoiceInfo);
                        setInvoice('');
                      }}
                    >
                      <ThemedView
                        style={{ flexDirection: 'row', gap: 10, backgroundColor: buttonPrimaryColor }}
                      >
                        <X color={buttonPrimaryTextColor} />
                        <ThemedText style={{ fontWeight: 'bold', color: buttonPrimaryTextColor }}>
                          Cancel
                        </ThemedText>
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
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
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
  verificationInput: {
    width: '100%',
    borderRadius: 8,
    padding: 15,
    fontSize: 16,
    marginBottom: 10,
  },
});
