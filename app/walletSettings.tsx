import React, { useEffect, useState } from 'react';
import { StyleSheet, TouchableOpacity, View, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useRouter } from 'expo-router';
import { ArrowLeft, Star, StarOff, Wallet, Zap } from 'lucide-react-native';
import { useNostrService } from '@/context/NostrServiceContext';
import { useWalletStatus } from '@/hooks/useWalletStatus';
import { getWalletUrl, walletUrlEvents } from '@/services/SecureStorageService';
import WalletType from '@/models/WalletType';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function WalletSettings() {
  const router = useRouter();
  const nostrService = useNostrService();

  const backgroundColor = useThemeColor({}, 'background');
  const cardBackgroundColor = useThemeColor({}, 'cardBackground');
  const primaryTextColor = useThemeColor({}, 'textPrimary');
  const secondaryTextColor = useThemeColor({}, 'textSecondary');
  const buttonPrimaryColor = useThemeColor({}, 'buttonPrimary');

  const [walletUrl, setWalletUrl] = useState('');

  const { hasLightningWallet, isLightningConnected, isLoading } = useWalletStatus();
  const { nwcConnectionStatus, nwcConnectionError, nwcConnecting } = nostrService;
  const statusConnectedColor = useThemeColor({}, 'statusConnected');

  const [preferredWallet, setPreferredWallet] = useState<WalletType | null>(null);

  async function togglePreferredWallet(wallet: WalletType) {
    await setPreferredWallet(wallet);
    await AsyncStorage.setItem('preferred_wallet', JSON.stringify(wallet));
  }

  useEffect(() => {
    const fetchPreferredWallet = async () => {
      const preferredWallet = await AsyncStorage.getItem('preferred_wallet');
      if (preferredWallet) {
        const tmp = JSON.parse(preferredWallet);
        console.log('Preferred wallet loaded:', tmp);
        setPreferredWallet(tmp);
      } else {
        setPreferredWallet(null);
      }
    };
    fetchPreferredWallet();
  }, []);

  useEffect(() => {
    const loadWalletUrl = async () => {
      try {
        const url = await getWalletUrl();
        setWalletUrl(url);
      } catch (error) {
        console.error('Error loading wallet URL:', error);
      }
    };

    loadWalletUrl();

    const subscription = walletUrlEvents.addListener('walletUrlChanged', async newUrl => {
      setWalletUrl(newUrl || '');
    });

    return () => subscription.remove();
  }, []);

  function getWalletStatusText() {
    if (!walletUrl || !walletUrl.trim()) return 'Not configured';
    if (nwcConnectionStatus === true) return 'Connected';
    if (nwcConnectionStatus === false) {
      return nwcConnectionError ? `Error: ${nwcConnectionError}` : 'Disconnected';
    }
    if (nwcConnecting) return 'Connecting...';
    if (nwcConnectionStatus === null && hasLightningWallet) return 'Connecting...';
    return 'Not configured';
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

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]} edges={['top']}>
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
            Wallet Settings
          </ThemedText>
        </ThemedView>

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          {/* Breez Wallet */}
          <TouchableOpacity
            style={[styles.card, { backgroundColor: cardBackgroundColor }]}
            onPress={() => router.push('/breezwallet')}
            activeOpacity={0.7}
          >
            <View style={styles.cardContent}>
              <View style={styles.cardLeft}>
                <View style={styles.cardHeader}>
                  <View style={styles.iconContainer}>
                    <Zap size={22} color={buttonPrimaryColor} />
                  </View>
                  <View style={styles.cardText}>
                    <ThemedText style={[styles.cardTitle, { color: primaryTextColor }]}>
                      Breez Wallet
                    </ThemedText>
                    <ThemedText style={[styles.cardSubtitle, { color: secondaryTextColor }]}>
                      Manage your Breez Lightning wallet
                    </ThemedText>
                  </View>
                </View>
              </View>
              {/* <ChevronRight size={24} color={secondaryTextColor} /> */}
              <TouchableOpacity onPress={() => togglePreferredWallet(WalletType.BREEZ)}>
                {preferredWallet === WalletType.BREEZ ? (
                  <Star size={22} color={buttonPrimaryColor} fill={buttonPrimaryColor} />
                ) : (
                  <StarOff size={22} color={secondaryTextColor} />
                )}
              </TouchableOpacity>
            </View>
          </TouchableOpacity>

          {/* Nostr Wallet */}
          <TouchableOpacity
            style={[styles.card, { backgroundColor: cardBackgroundColor }]}
            onPress={() => router.push('/wallet')}
            activeOpacity={0.7}
          >
            <View style={styles.cardContent}>
              <View style={styles.cardLeft}>
                <View style={styles.cardHeader}>
                  <View style={styles.iconContainer}>
                    <Wallet size={22} color={buttonPrimaryColor} />
                  </View>
                  <View style={styles.cardText}>
                    <ThemedText style={[styles.cardTitle, { color: primaryTextColor }]}>
                      Wallet Connect
                    </ThemedText>
                    <View style={styles.cardStatusRow}>
                      <ThemedText style={[styles.cardSubtitle, { color: secondaryTextColor }]}>
                        {getWalletStatusText()}
                      </ThemedText>
                      <View
                        style={[
                          styles.statusIndicator,
                          {
                            backgroundColor: isLightningConnected
                              ? statusConnectedColor
                              : secondaryTextColor,
                          },
                        ]}
                      />
                    </View>
                  </View>
                </View>
              </View>
              {/* <ChevronRight size={24} color={secondaryTextColor} /> */}
              <TouchableOpacity onPress={() => togglePreferredWallet(WalletType.NWC)}>
                {preferredWallet === WalletType.NWC ? (
                  <Star size={22} color={buttonPrimaryColor} fill={buttonPrimaryColor} />
                ) : (
                  <StarOff size={22} color={secondaryTextColor} />
                )}
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </ScrollView>
      </ThemedView>
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
    paddingTop: 16,
    paddingBottom: 16,
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
    paddingVertical: 16,
  },
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
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
  iconContainer: {
    marginRight: 12,
  },
  cardText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  cardStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  cardSubtitle: {
    fontSize: 14,
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 8,
  },
});
