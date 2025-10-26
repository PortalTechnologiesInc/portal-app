import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useRouter } from 'expo-router';
import { ArrowLeft, HandCoins, Send } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet, ScrollView, TouchableOpacity, View, Button, Text } from 'react-native';
import { Colors } from 'react-native/Libraries/NewAppScreen';
import { useBreezService } from '@/context/BreezServiceContext';
import { useEffect, useState } from 'react';
import { ListPaymentsRequest, Payment, ReceivePaymentMethod } from '@breeztech/breez-sdk-spark-react-native';

export default function MyWalletManagementSecret() {
  const router = useRouter();

  const { balanceInSats, refreshWalletInfo, receivePayment } = useBreezService();
  const [invoice, setInvoice] = useState('');

  const backgroundColor = useThemeColor({}, 'background');
  const primaryTextColor = useThemeColor({}, 'textPrimary');
  const secondaryTextColor = useThemeColor({}, 'textSecondary');
  const buttonPrimaryColor = useThemeColor({}, 'buttonPrimary');
  const buttonPrimaryTextColor = useThemeColor({}, 'buttonPrimaryText');

  useEffect(() => {
    const getInfo = async () => {
      const paymentMethod = new ReceivePaymentMethod.Bolt11Invoice({
        description: 'Turetta',
        amountSats: BigInt(1000),
      });
      const invoice = await receivePayment(paymentMethod);
      setInvoice(invoice);
    };

    getInfo();

    setInterval(() => {
      refreshWalletInfo();
    }, 1000);
  }, []);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]} edges={['top']}>
      <ThemedView style={[styles.container, { backgroundColor }]}>
        <ThemedView style={[styles.header, { backgroundColor }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={20} color={primaryTextColor} />
          </TouchableOpacity>
          <ThemedText style={[styles.headerText, { color: primaryTextColor }]}>
            Wallet Management
          </ThemedText>
        </ThemedView>
        <ThemedView style={{ ...styles.content, gap: 10 }}>
          <ThemedView style={{ flexDirection: 'row' }}>
            <View>
              <ThemedText type='subtitle' style={{ color: primaryTextColor }}>Balance</ThemedText>
              <ThemedText type='title' style={{ color: primaryTextColor }}>{balanceInSats} sats</ThemedText>
            </View>
          </ThemedView>
          <View style={ styles.sectionDivider } />
          <ThemedView style={{ flex: 1 }}>
            <ScrollView>

            </ScrollView>
          </ThemedView>
          <ThemedView style={{ flexDirection: 'row', justifyContent: 'center' }} >
            <ThemedView style={{ flexDirection: 'row', gap: 40, backgroundColor: buttonPrimaryColor, borderRadius: 25, paddingTop: 10, paddingBottom: 10, paddingLeft: 30, paddingRight: 30, }}>
              <TouchableOpacity>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <HandCoins color={buttonPrimaryTextColor} />
                  <ThemedText style={{ fontWeight: 'bold', color: buttonPrimaryTextColor }}>Receive</ThemedText>
                </View>
              </TouchableOpacity>
              <TouchableOpacity>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Send color={buttonPrimaryTextColor} />
                  <ThemedText style={{ fontWeight: 'bold', color: buttonPrimaryTextColor }}>Send</ThemedText>
                </View>
              </TouchableOpacity>
            </ThemedView>
          </ThemedView>
        </ThemedView>
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
