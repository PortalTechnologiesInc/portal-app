import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  Alert,
  View,
  ScrollView,
  RefreshControl,
  Switch,
  Modal,
  FlatList,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  ChevronRight,
  Fingerprint,
  Shield,
  X,
  Check,
  Wallet,
  Wifi,
} from 'lucide-react-native';
import { Moon, Sun, Smartphone } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useOnboarding } from '@/context/OnboardingContext';
import {
  isWalletConnected,
  walletUrlEvents,
  deleteMnemonic,
  getMnemonic,
  getWalletUrl,
} from '@/services/SecureStorageService';
import { resetDatabase } from '@/services/database/DatabaseProvider';
import { useNostrService } from '@/context/NostrServiceContext';
import { showToast } from '@/utils/Toast';
import { authenticateForSensitiveAction } from '@/services/BiometricAuthService';
import { useTheme, ThemeMode } from '@/context/ThemeContext';
import { useCurrency } from '@/context/CurrencyContext';
import { Currency, CurrencyHelpers } from '@/utils/currency';
import { useThemeColor } from '@/hooks/useThemeColor';

export default function SettingsScreen() {
  const router = useRouter();
  const { resetOnboarding } = useOnboarding();
  const nostrService = useNostrService();
  const { themeMode, setThemeMode } = useTheme();
  const {
    preferredCurrency,
    setPreferredCurrency,
    getCurrentCurrencyDisplayName,
    getCurrentCurrencySymbol,
  } = useCurrency();
  const [isWalletConnectedState, setIsWalletConnectedState] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isCurrencyModalVisible, setIsCurrencyModalVisible] = useState(false);
  const [walletUrl, setWalletUrl] = useState('');

  // Theme colors
  const backgroundColor = useThemeColor({}, 'background');
  const cardBackgroundColor = useThemeColor({}, 'cardBackground');
  const primaryTextColor = useThemeColor({}, 'textPrimary');
  const secondaryTextColor = useThemeColor({}, 'textSecondary');
  const inputBorderColor = useThemeColor({}, 'inputBorder');
  const buttonPrimaryColor = useThemeColor({}, 'buttonPrimary');
  const buttonDangerColor = useThemeColor({}, 'buttonDanger');
  const buttonPrimaryTextColor = useThemeColor({}, 'buttonPrimaryText');
  const buttonDangerTextColor = useThemeColor({}, 'buttonDangerText');
  const statusConnectedColor = useThemeColor({}, 'statusConnected');

  // Get real NWC connection status
  const { nwcConnectionStatus, nwcConnectionError } = nostrService;

  // Initialize wallet connection status
  useEffect(() => {
    const checkWalletConnection = async () => {
      try {
        const url = await getWalletUrl();
        setWalletUrl(url);
        const walletConnected = await isWalletConnected();
        // Use real NWC connection status if available, otherwise fall back to URL existence
        const realConnectionStatus =
          nwcConnectionStatus !== null ? nwcConnectionStatus : walletConnected;
        setIsWalletConnectedState(realConnectionStatus);
      } catch (error) {
        console.error('Error checking connection:', error);
      }
    };

    const initializeSettings = async () => {
      await checkWalletConnection();
      setIsLoading(false);
    };

    initializeSettings();

    // Subscribe to wallet URL changes
    const subscription = walletUrlEvents.addListener('walletUrlChanged', async newUrl => {
      setWalletUrl(newUrl || '');
      setIsWalletConnectedState(Boolean(newUrl?.trim()));
    });

    return () => subscription.remove();
  }, [nwcConnectionStatus]);

  // Update wallet connection status when nwcConnectionStatus changes
  useEffect(() => {
    if (nwcConnectionStatus !== null) {
      setIsWalletConnectedState(nwcConnectionStatus);
    }
  }, [nwcConnectionStatus]);

  const handleWalletCardPress = () => {
    router.push({
      pathname: '/wallet',
      params: {
        source: 'settings',
      },
    });
  };

  const handleNostrCardPress = () => {
    router.push('/relays');
  };

  const handleExportMnemonic = () => {
    authenticateForSensitiveAction(async () => {
      console.log('Exporting mnemonic...');
      try {
        const mnemonic = await getMnemonic();
        console.log('Mnemonic:', mnemonic);
        if (mnemonic) {
          Clipboard.setString(mnemonic);
          showToast('Mnemonic copied to clipboard', 'success');
        } else {
          showToast('No mnemonic found', 'error');
        }
      } catch (error) {
        console.error('Error exporting mnemonic:', error);
        showToast('Failed to export mnemonic', 'error');
      }
    }, 'Authenticate to export your seed phrase');
  };

  const handleExportAppData = () => {
    authenticateForSensitiveAction(async () => {
      console.log('Exporting app data...');
      // TODO: Implement app data export logic
      showToast('App data export not yet implemented', 'success');
    }, 'Authenticate to export app data');
  };

  const handleThemeChange = () => {
    // Cycle through theme options: auto -> light -> dark -> auto
    const nextTheme: ThemeMode =
      themeMode === 'auto' ? 'light' : themeMode === 'light' ? 'dark' : 'auto';

    setThemeMode(nextTheme);
    showToast(
      `Theme changed to ${
        nextTheme === 'auto' ? 'Auto (System)' : nextTheme === 'light' ? 'Light' : 'Dark'
      }`,
      'success'
    );
  };

  const handleCurrencyChange = () => {
    setIsCurrencyModalVisible(true);
  };

  const handleCurrencySelect = (currency: Currency) => {
    setPreferredCurrency(currency);
    setIsCurrencyModalVisible(false);
  };

  const currencies = Object.values(Currency);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      // Refresh connection status for both relays and NWC wallet
      await nostrService.refreshNwcConnectionStatus();
    } catch (error) {
      console.error('Error refreshing connection status:', error);
    }
    setRefreshing(false);
  };

  const handleClearAppData = () => {
    Alert.alert(
      'Reset App',
      'This will reset all app data and take you back to onboarding. Are you sure?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Clear Data',
          style: 'destructive',
          onPress: () => {
            authenticateForSensitiveAction(async () => {
              try {
                // Delete mnemonic first
                deleteMnemonic();
                // Reset the database
                await resetDatabase();
                // Reset onboarding state
                await resetOnboarding();
              } catch (error) {
                console.error('Error clearing app data:', error);
                Alert.alert('Error', 'Failed to Reset App. Please try again.');
              }
            }, 'Authenticate to reset all app data');
          },
        },
      ]
    );
  };

  function getWalletStatusText() {
    if (!walletUrl || !walletUrl.trim()) return 'Not configured';
    if (nwcConnectionStatus === true) return 'Connected';
    if (nwcConnectionStatus === false) {
      return nostrService.nwcConnectionError
        ? `Error: ${nostrService.nwcConnectionError}`
        : 'Disconnected';
    }
    if (nwcConnectionStatus === null) return 'Connecting...';
    return 'Unknown';
  }

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: backgroundColor }]} edges={['top']}>
        <ThemedView style={styles.container}>
          <ThemedView style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <ArrowLeft size={20} color={primaryTextColor} />
            </TouchableOpacity>
            <ThemedText
              style={styles.headerText}
              lightColor={primaryTextColor}
              darkColor={primaryTextColor}
            >
              Settings
            </ThemedText>
          </ThemedView>
          <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
            <ThemedText style={{ color: primaryTextColor }}>Loading...</ThemedText>
          </ScrollView>
        </ThemedView>
      </SafeAreaView>
    );
  }

  const renderCurrencyItem = ({ item }: { item: Currency }) => (
    <TouchableOpacity
      style={[styles.currencyItem, { backgroundColor: cardBackgroundColor }]}
      onPress={() => handleCurrencySelect(item)}
      activeOpacity={0.7}
    >
      <View style={styles.currencyItemContent}>
        <View style={styles.currencyItemLeft}>
          <View style={[styles.currencyItemSymbol, { backgroundColor: buttonPrimaryColor }]}>
            <ThemedText style={[styles.currencyItemSymbolText, { color: buttonPrimaryTextColor }]}>
              {CurrencyHelpers.getSymbol(item)}
            </ThemedText>
          </View>
          <View style={styles.currencyItemText}>
            <ThemedText style={[styles.currencyItemName, { color: primaryTextColor }]}>
              {CurrencyHelpers.getName(item)}
            </ThemedText>
            <ThemedText style={[styles.currencyItemDisplayName, { color: secondaryTextColor }]}>
              {CurrencyHelpers.getDisplayName(item)}
            </ThemedText>
          </View>
        </View>
        {preferredCurrency === item && <Check size={20} color={statusConnectedColor} />}
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: backgroundColor }]} edges={['top']}>
      <ThemedView style={styles.container}>
        <ThemedView style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={20} color={primaryTextColor} />
          </TouchableOpacity>
          <ThemedText
            style={styles.headerText}
            lightColor={primaryTextColor}
            darkColor={primaryTextColor}
          >
            Settings
          </ThemedText>
        </ThemedView>

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[statusConnectedColor]}
              tintColor={statusConnectedColor}
              title="Pull to refresh connection"
              titleColor={primaryTextColor}
            />
          }
        >
          {/* Wallet Section */}
          <ThemedView style={styles.section}>
            <ThemedText style={[styles.sectionTitle, { color: primaryTextColor }]}>
              Wallet
            </ThemedText>
            <ThemedView style={styles.walletSection}>
              <TouchableOpacity
                style={[styles.card, { backgroundColor: cardBackgroundColor }]}
                onPress={handleWalletCardPress}
                activeOpacity={0.7}
              >
                <View style={styles.cardContent}>
                  <View style={styles.cardLeft}>
                    <View style={styles.cardHeader}>
                      <View style={[styles.cardIcon, { backgroundColor: buttonPrimaryColor }]}>
                        <Wallet size={20} color={buttonPrimaryTextColor} />
                      </View>
                      <View style={styles.cardText}>
                        <ThemedText style={[styles.cardTitle, { color: primaryTextColor }]}>
                          Wallet Connect
                        </ThemedText>
                        <View style={styles.cardStatusRow}>
                          <ThemedText style={[styles.cardStatus, { color: secondaryTextColor }]}>
                            {getWalletStatusText()}
                          </ThemedText>
                          <View
                            style={[
                              styles.statusIndicator,
                              {
                                backgroundColor: isWalletConnectedState
                                  ? statusConnectedColor
                                  : secondaryTextColor,
                              },
                            ]}
                          />
                        </View>
                      </View>
                    </View>
                  </View>
                  <ChevronRight size={24} color={secondaryTextColor} />
                </View>
              </TouchableOpacity>
            </ThemedView>
            <ThemedView style={styles.walletSection}>
              <TouchableOpacity
                style={[styles.card, { backgroundColor: cardBackgroundColor }]}
                onPress={handleCurrencyChange}
                activeOpacity={0.7}
              >
                <View style={styles.cardContent}>
                  <View style={styles.cardLeft}>
                    <ThemedText style={[styles.cardTitle, { color: primaryTextColor }]}>
                      Preferred Currency
                    </ThemedText>
                    <ThemedText style={[styles.cardStatus, { color: secondaryTextColor }]}>
                      {getCurrentCurrencyDisplayName()}
                    </ThemedText>
                  </View>
                  <View style={[styles.currencyIndicator, { backgroundColor: buttonPrimaryColor }]}>
                    <ThemedText style={[styles.currencySymbol, { color: buttonPrimaryTextColor }]}>
                      {getCurrentCurrencySymbol()}
                    </ThemedText>
                  </View>
                </View>
              </TouchableOpacity>
            </ThemedView>
          </ThemedView>

          {/* Nostr Section */}
          <ThemedView style={styles.section}>
            <View style={[styles.sectionDivider, { backgroundColor: inputBorderColor }]} />
            <ThemedText style={[styles.sectionTitle, { color: primaryTextColor }]}>
              Relays
            </ThemedText>
            <ThemedView style={styles.walletSection}>
              <TouchableOpacity
                style={[styles.card, { backgroundColor: cardBackgroundColor }]}
                onPress={handleNostrCardPress}
                activeOpacity={0.7}
              >
                <View style={styles.cardContent}>
                  <View style={styles.cardLeft}>
                    <View style={styles.cardHeader}>
                      <View style={[styles.cardIcon, { backgroundColor: buttonPrimaryColor }]}>
                        <Wifi size={20} color={buttonPrimaryTextColor} />
                      </View>
                      <View style={styles.cardText}>
                        <ThemedText style={[styles.cardTitle, { color: primaryTextColor }]}>
                          Nostr relays
                        </ThemedText>
                        <ThemedText style={[styles.cardStatus, { color: secondaryTextColor }]}>
                          Manage the Nostr relays your app connects to
                        </ThemedText>
                      </View>
                    </View>
                  </View>
                  <ChevronRight size={24} color={secondaryTextColor} />
                </View>
              </TouchableOpacity>
            </ThemedView>
          </ThemedView>

          {/* Theme Section */}
          <ThemedView style={styles.section}>
            <ThemedText style={[styles.sectionTitle, { color: primaryTextColor }]}>
              Appearance
            </ThemedText>
            <ThemedView style={styles.themeSection}>
              <ThemedView style={[styles.themeCard, { backgroundColor: cardBackgroundColor }]}>
                <TouchableOpacity
                  onPress={handleThemeChange}
                  activeOpacity={0.7}
                  style={styles.themeCardTouchable}
                >
                  <View style={styles.themeCardContent}>
                    <View style={styles.themeCardLeft}>
                      <View style={styles.themeIconContainer}>
                        {themeMode === 'auto' ? (
                          <Smartphone size={24} color={buttonPrimaryColor} />
                        ) : themeMode === 'light' ? (
                          <Sun size={24} color={statusConnectedColor} />
                        ) : (
                          <Moon size={24} color={buttonPrimaryColor} />
                        )}
                      </View>
                      <View style={styles.themeTextContainer}>
                        <ThemedText style={[styles.themeTitle, { color: primaryTextColor }]}>
                          Theme
                        </ThemedText>
                        <ThemedText style={[styles.themeStatus, { color: secondaryTextColor }]}>
                          {themeMode === 'auto'
                            ? 'Auto (System)'
                            : themeMode === 'light'
                              ? 'Light'
                              : 'Dark'}
                        </ThemedText>
                      </View>
                    </View>
                    <View style={[styles.themeIndicator, { backgroundColor: buttonPrimaryColor }]}>
                      <ThemedText style={[styles.tapToChange, { color: buttonPrimaryTextColor }]}>
                        Tap to change
                      </ThemedText>
                    </View>
                  </View>
                </TouchableOpacity>
              </ThemedView>
            </ThemedView>
          </ThemedView>

          {/* Security Section */}
          <ThemedView style={styles.section}>
            <ThemedText style={[styles.sectionTitle, { color: primaryTextColor }]}>
              Security
            </ThemedText>
            <ThemedView style={styles.securitySection}>
              <View style={[styles.appLockOption, { backgroundColor: cardBackgroundColor }]}>
                <View style={styles.appLockLeft}>
                  <View style={styles.appLockIconContainer}>
                    <Shield size={24} color={secondaryTextColor} />
                  </View>
                  <View style={styles.appLockTextContainer}>
                    <ThemedText style={[styles.appLockTitle, { color: secondaryTextColor }]}>
                      App Lock
                    </ThemedText>
                    <ThemedText style={[styles.appLockDescription, { color: secondaryTextColor }]}>
                      App lock feature has been disabled
                    </ThemedText>
                  </View>
                </View>
                <Switch
                  value={false}
                  onValueChange={() => {}}
                  disabled={true}
                  trackColor={{
                    false: inputBorderColor,
                    true: inputBorderColor,
                  }}
                  thumbColor={inputBorderColor}
                  ios_backgroundColor={inputBorderColor}
                />
              </View>
            </ThemedView>
          </ThemedView>

          {/* Export Section */}
          <ThemedView style={styles.section}>
            <ThemedText style={[styles.sectionTitle, { color: primaryTextColor }]}>
              Export
            </ThemedText>
            <ThemedView style={styles.exportSection}>
              <TouchableOpacity
                style={[styles.exportButton, { backgroundColor: buttonPrimaryColor }]}
                onPress={handleExportMnemonic}
              >
                <View style={styles.exportButtonContent}>
                  <ThemedText style={[styles.exportButtonText, { color: buttonPrimaryTextColor }]}>
                    Export Mnemonic
                  </ThemedText>
                  <View style={styles.fingerprintIcon}>
                    <Fingerprint size={20} color={buttonPrimaryTextColor} />
                  </View>
                </View>
              </TouchableOpacity>
            </ThemedView>
            <ThemedView style={styles.exportSection}>
              <TouchableOpacity
                style={[styles.exportButton, { backgroundColor: buttonPrimaryColor }]}
                onPress={handleExportAppData}
              >
                <View style={styles.exportButtonContent}>
                  <ThemedText style={[styles.exportButtonText, { color: buttonPrimaryTextColor }]}>
                    Export App Data
                  </ThemedText>
                  <View style={styles.fingerprintIcon}>
                    <Fingerprint size={20} color={buttonPrimaryTextColor} />
                  </View>
                </View>
              </TouchableOpacity>
            </ThemedView>
          </ThemedView>

          {/* Extra Section */}
          <ThemedView style={styles.section}>
            <ThemedText style={[styles.sectionTitle, { color: primaryTextColor }]}>
              Extra
            </ThemedText>
            <ThemedView style={styles.extraSection}>
              <TouchableOpacity
                style={[styles.clearDataButton, { backgroundColor: buttonDangerColor }]}
                onPress={handleClearAppData}
              >
                <View style={styles.clearDataButtonContent}>
                  <ThemedText
                    style={[styles.clearDataButtonText, { color: buttonDangerTextColor }]}
                  >
                    Reset App
                  </ThemedText>
                  <View style={styles.fingerprintIcon}>
                    <Fingerprint size={20} color={buttonDangerTextColor} />
                  </View>
                </View>
              </TouchableOpacity>
            </ThemedView>
          </ThemedView>
        </ScrollView>
      </ThemedView>

      {/* Currency Selector Modal */}
      <Modal
        visible={isCurrencyModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setIsCurrencyModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setIsCurrencyModalVisible(false)}
        >
          <TouchableOpacity
            style={[styles.modalContent, { backgroundColor: backgroundColor }]}
            activeOpacity={1}
            onPress={e => e.stopPropagation()}
          >
            <View style={styles.modalHeader}>
              <ThemedText style={[styles.modalTitle, { color: primaryTextColor }]}>
                Select Currency
              </ThemedText>
              <TouchableOpacity
                onPress={() => setIsCurrencyModalVisible(false)}
                style={styles.modalCloseButton}
              >
                <X size={24} color={secondaryTextColor} />
              </TouchableOpacity>
            </View>
            {currencies.length > 0 ? (
              <FlatList
                data={currencies}
                renderItem={renderCurrencyItem}
                keyExtractor={item => item}
                style={styles.currencyList}
                showsVerticalScrollIndicator={false}
              />
            ) : (
              <ThemedText style={[{ color: primaryTextColor, textAlign: 'center', padding: 20 }]}>
                No currencies available
              </ThemedText>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 20,
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
  },
  contentContainer: {
    paddingVertical: 12,
  },
  section: {
    marginBottom: 24,
    width: '100%',
  },
  sectionDivider: {
    height: 1,
    marginBottom: 16,
    opacity: 0.3,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  walletSection: {
    paddingVertical: 12,
    width: '100%',
  },
  themeSection: {
    paddingVertical: 12,
    width: '100%',
  },
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  cardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardLeft: {
    flex: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cardText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  cardStatus: {
    fontSize: 14,
  },
  cardStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 8,
  },
  exportSection: {
    paddingVertical: 6,
    width: '100%',
  },
  exportButton: {
    padding: 16,
    borderRadius: 12,
    width: '100%',
    maxWidth: 500,
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 8,
  },
  exportButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  exportButtonContent: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    position: 'relative',
  },
  fingerprintIcon: {
    position: 'absolute',
    right: 0,
  },
  securitySection: {
    paddingVertical: 12,
    width: '100%',
  },
  appLockOption: {
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  appLockLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  appLockIconContainer: {
    marginRight: 12,
  },
  appLockTextContainer: {
    flex: 1,
  },
  appLockTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  appLockDescription: {
    fontSize: 14,
    lineHeight: 18,
  },
  themeCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  themeCardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  themeCardLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  themeIconContainer: {
    marginRight: 12,
  },
  themeTextContainer: {
    flex: 1,
  },
  themeTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  themeStatus: {
    fontSize: 14,
  },
  themeIndicator: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  tapToChange: {
    fontSize: 12,
    fontWeight: '500',
  },
  themeCardTouchable: {
    width: '100%',
  },
  extraSection: {
    paddingVertical: 12,
    width: '100%',
  },
  clearDataButton: {
    padding: 16,
    borderRadius: 12,
    width: '100%',
    maxWidth: 500,
    alignItems: 'center',
    alignSelf: 'center',
  },
  clearDataButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    alignSelf: 'center',
    justifyContent: 'center',
    width: '100%',
    maxWidth: 500,
    marginRight: 0,
    paddingRight: 0,
    paddingLeft: 0,
    marginLeft: 0,
  },
  clearDataButtonContent: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    position: 'relative',
  },
  currencyIndicator: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    minWidth: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  currencySymbol: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingHorizontal: 20,
    height: '80%',
    minHeight: 400,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  modalCloseButton: {
    padding: 4,
  },
  currencyList: {
    flex: 1,
    paddingBottom: 20,
    minHeight: 200,
  },
  // Currency item styles
  currencyItem: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  currencyItemContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  currencyItemLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  currencyItemSymbol: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  currencyItemSymbolText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  currencyItemText: {
    flex: 1,
  },
  currencyItemName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  currencyItemDisplayName: {
    fontSize: 14,
  },
});
