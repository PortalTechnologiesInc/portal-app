import React, { useCallback, useState } from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  View,
  ScrollView,
  Alert,
  TextInput,
} from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useRouter } from 'expo-router';
import { ArrowLeft, RotateCcw, Plus, AlertCircle, X } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useECash } from '@/context/ECashContext';
import { useDatabaseContext } from '@/context/DatabaseContext';
import { globalEvents } from '@/utils/index';

export default function RecoverTicketsScreen() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [mintUrls, setMintUrls] = useState<string[]>(['']);

  // Theme colors
  const backgroundColor = useThemeColor({}, 'background');
  const primaryTextColor = useThemeColor({}, 'textPrimary');
  const secondaryTextColor = useThemeColor({}, 'textSecondary');
  const cardBackgroundColor = useThemeColor({}, 'cardBackground');
  const buttonPrimaryColor = useThemeColor({}, 'buttonPrimary');
  const buttonPrimaryTextColor = useThemeColor({}, 'buttonPrimaryText');
  const statusConnectedColor = useThemeColor({}, 'statusConnected');
  const inputBackgroundColor = useThemeColor({}, 'inputBackground');
  const inputBorderColor = useThemeColor({}, 'inputBorder');
  const inputPlaceholderColor = useThemeColor({}, 'inputPlaceholder');
  const buttonDangerColor = useThemeColor({}, 'buttonDanger');
  const buttonDangerTextColor = useThemeColor({}, 'buttonDangerText');

  const { addWallet, wallets } = useECash();
  const { executeOperation } = useDatabaseContext();

  const addNewUrlField = () => {
    setMintUrls([...mintUrls, '']);
  };

  const removeMintUrl = (index: number) => {
    const newUrls = mintUrls.filter((_, i) => i !== index);
    setMintUrls(newUrls);
  };

  const updateMintUrl = (index: number, value: string) => {
    const newUrls = [...mintUrls];
    newUrls[index] = value;
    setMintUrls(newUrls);
  };

  const isValidUrl = (url: string) => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  const handleRecoverTickets = useCallback(async () => {
    const validUrls = mintUrls.filter(url => url.trim() && isValidUrl(url.trim()));

    if (validUrls.length === 0) {
      Alert.alert('No URLs', 'Please enter at least one valid mint server URL.');
      return;
    }
    setIsLoading(true);
    try {
      for (const url of validUrls) {
        const response = await Promise.race([
          fetch(`${url}/v1/keys`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Request timeout')), 8000)
          ),
        ]);

        if (!response.ok) {
          console.warn(`Failed to connect to mint: ${url}`);
          Alert.alert(`Failed to connect to mint: ${url}`);
          continue; // Skip this URL and continue with the next one
        }

        const mintKeys = await response.json();

        if (!mintKeys.keysets) {
          console.warn(`Mint response of ${url} does not match the expected standard.\nPlease check the URL and try again if it\'s wrong.`);
          Alert.alert(`Mint response of ${url} does not match the expected standard.\nPlease check the URL and try again if it\'s wrong.`);
          continue;
        } else if (mintKeys.keysets.length == 0) {
          console.warn(`Mint response of ${url} does not contains any ticket unit.`);
          Alert.alert(`Mint response of ${url} does not contains any ticket unit.`);
          continue;
        }

        for (const keyset of mintKeys.keysets) {
          await addWallet(
            url,
            keyset.unit.toLowerCase()
          );

          // Emit event to notify that wallet balances have changed
          globalEvents.emit('walletBalancesChanged', {
            mintUrl: url,
            unit: keyset.unit.toLowerCase(),
          });

          console.log('Cashu token processed successfully');
        }

        Alert.alert(
          'Recovery Successful',
          `Tickets have been successfully recovered from ${validUrls.length} mint server(s). You can find your recovered tickets in the Tickets section.`,
          [{ text: 'OK', onPress: (str?: string) => router.back() }]
        );
      }
    } catch (error) {
      console.error('Error recovering tickets:', error);
      Alert.alert(
        'Recovery Failed',
        'Failed to recover tickets. Please check your connection and try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsLoading(false);
    }
  }, [mintUrls, addWallet, router]);

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
            Recover Tickets
          </ThemedText>
        </ThemedView>

        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          {/* Info Section */}
          <ThemedView style={[styles.infoCard, { backgroundColor: cardBackgroundColor }]}>
            <View style={styles.infoHeader}>
              <View style={[styles.infoIcon, { backgroundColor: statusConnectedColor }]}>
                <AlertCircle size={20} color={buttonPrimaryTextColor} />
              </View>
              <ThemedText style={[styles.infoTitle, { color: primaryTextColor }]}>
                Ticket Recovery
              </ThemedText>
            </View>
            <ThemedText style={[styles.infoDescription, { color: secondaryTextColor }]}>
              If you're missing tickets or they haven't appeared in your wallet, you can try to recover them by entering the mint server URLs that emitted the tickets. Note that the mint URL may differ from the generic event URL, so if you encounter errors, please contact the event organizer for assistance.
            </ThemedText>
          </ThemedView>

          {/* Mint Server URLs */}
          <ThemedText style={[styles.sectionTitle, { color: primaryTextColor }]}>
            Mint Server URLs
          </ThemedText>

          <ThemedView style={[styles.urlInputCard, { backgroundColor: cardBackgroundColor }]}>
            <ThemedText style={[styles.urlInputLabel, { color: primaryTextColor }]}>
              Enter mint server URLs that emitted tickets:
            </ThemedText>

            {mintUrls.map((url, index) => (
              <View key={index} style={styles.urlInputRow}>
                <TextInput
                  style={[
                    styles.urlInput,
                    {
                      backgroundColor: inputBackgroundColor,
                      borderColor: inputBorderColor,
                      color: primaryTextColor,
                    },
                  ]}
                  value={url}
                  onChangeText={(value) => updateMintUrl(index, value)}
                  placeholder="https://mint.example.com"
                  placeholderTextColor={inputPlaceholderColor}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                />
                {index != 0 &&
                  <TouchableOpacity
                    style={[styles.removeButton, { backgroundColor: buttonDangerColor }]}
                    onPress={() => removeMintUrl(index)}
                  >
                    <X size={16} color={buttonDangerTextColor} />
                  </TouchableOpacity>
                }
              </View>
            ))}
          </ThemedView>

          {/* Add More URLs Button */}
          <TouchableOpacity
            style={[styles.addMoreButton, { backgroundColor: cardBackgroundColor, borderColor: inputBorderColor }]}
            onPress={addNewUrlField}
            activeOpacity={0.7}
          >
            <View style={styles.addMoreButtonContent}>
              <Plus size={20} color={primaryTextColor} />
              <ThemedText style={[styles.addMoreButtonText, { color: primaryTextColor }]}>
                Add More URLs
              </ThemedText>
            </View>
          </TouchableOpacity>

          {/* Start Recovery Button */}
          <TouchableOpacity
            style={[styles.recoveryButton, { backgroundColor: buttonPrimaryColor }]}
            onPress={handleRecoverTickets}
            disabled={isLoading}
            activeOpacity={0.7}
          >
            <View style={styles.recoveryButtonContent}>
              <RotateCcw size={20} color={buttonPrimaryTextColor} />
              <ThemedText style={[styles.recoveryButtonText, { color: buttonPrimaryTextColor }]}>
                Start Recovery
              </ThemedText>
            </View>
          </TouchableOpacity>
          {isLoading && (
            <ThemedText style={[styles.loadingText, { color: primaryTextColor }]}>
              Recovering tickets... Please wait.
            </ThemedText>
          )}
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    marginTop: 24,
  },
  infoCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  infoIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  infoDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
  loadingText: {
    marginTop: 14,
    fontSize: 14,
    textAlign: 'center',
  },
  urlInputCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  urlInputLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 12,
  },
  urlInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  urlInput: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 16,
    marginRight: 8,
  },
  removeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addMoreButton: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  addMoreButtonContent: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addMoreButtonText: {
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 8,
  },
  recoveryButton: {
    padding: 16,
    borderRadius: 12,
    width: '100%',
    maxWidth: 500,
    alignItems: 'center',
    alignSelf: 'center',
    marginTop: 24,
  },
  recoveryButtonContent: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  recoveryButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
});
