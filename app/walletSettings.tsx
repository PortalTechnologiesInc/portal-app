import React from 'react';
import { StyleSheet, TouchableOpacity, View, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useRouter } from 'expo-router';
import { ArrowLeft, Star, StarOff, Wallet, Zap } from 'lucide-react-native';
import { WALLET_CONNECTION_STATUS, WALLET_TYPE, WalletType } from '@/models/WalletType';
import { useWalletManager } from '@/context/WalletManagerContext';
import { useKey } from '@/context/KeyContext';

export default function WalletSettings() {
  const router = useRouter();

  const backgroundColor = useThemeColor({}, 'background');
  const cardBackgroundColor = useThemeColor({}, 'cardBackground');
  const primaryTextColor = useThemeColor({}, 'textPrimary');
  const secondaryTextColor = useThemeColor({}, 'textSecondary');
  const buttonPrimaryColor = useThemeColor({}, 'buttonPrimary');

  const { switchActiveWallet, preferredWallet, walletStatus } = useWalletManager();
  const { walletUrl } = useKey();

  const statusConnectedColor = useThemeColor({}, 'statusConnected');
  const statusConnectingColor = useThemeColor({}, 'statusConnecting');

  const getWalletStatusText = (type: WalletType) => {
    const status = walletStatus.get(type);
    if (!status) return WALLET_CONNECTION_STATUS.NOT_CONFIGURED;
    return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase().replaceAll('_', ' ');
  };

  const getStatusColor = (type: WalletType) => {
    const status = walletStatus.get(type);
    if (status === WALLET_CONNECTION_STATUS.CONNECTED) {
      return statusConnectedColor;
    }
    if (status === WALLET_CONNECTION_STATUS.CONNECTING) {
      return statusConnectingColor;
    }
    return secondaryTextColor;
  };

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
            onPress={() => router.push('/Wallet')}
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
                    <View style={styles.cardStatusRow}>
                      <ThemedText style={[styles.cardSubtitle, { color: secondaryTextColor }]}>
                        {getWalletStatusText(WALLET_TYPE.BREEZ)}
                      </ThemedText>
                      <View
                        style={[
                          styles.statusIndicator,
                          {
                            backgroundColor: getStatusColor(WALLET_TYPE.BREEZ),
                          },
                        ]}
                      />
                    </View>
                  </View>
                </View>
              </View>
              {/* <ChevronRight size={24} color={secondaryTextColor} /> */}
              <TouchableOpacity onPress={() => switchActiveWallet(WALLET_TYPE.BREEZ)}>
                {preferredWallet === WALLET_TYPE.BREEZ ? (
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
                        {getWalletStatusText(WALLET_TYPE.NWC)}
                      </ThemedText>
                      <View
                        style={[
                          styles.statusIndicator,
                          {
                            backgroundColor: getStatusColor(WALLET_TYPE.NWC),
                          },
                        ]}
                      />
                    </View>
                  </View>
                </View>
              </View>
              {/* <ChevronRight size={24} color={secondaryTextColor} /> */}
              <TouchableOpacity onPress={() => walletUrl && switchActiveWallet(WALLET_TYPE.NWC)}>
                {preferredWallet === WALLET_TYPE.NWC ? (
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
