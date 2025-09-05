import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  TextInput,
  View,
  ToastAndroid,
  ScrollView,
} from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useRouter } from 'expo-router';
import { ArrowLeft, X, Plus } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDatabaseContext } from '@/context/DatabaseContext';
import { useThemeColor } from '@/hooks/useThemeColor';

import popularRelayListFile from '../assets/RelayList.json';
import { useNostrService } from '@/context/NostrServiceContext';

function isWebsocketUri(uri: string): boolean {
  const regex = /^wss?:\/\/([a-zA-Z0-9.-]+)(:\d+)?(\/[^\s]*)?$/;
  return regex.test(uri);
}

export default function NostrRelayManagementScreen() {
  const router = useRouter();

  // list of relays the user can choose from
  const [popularRelayList, setPopularRelayList] = useState<string[]>([]);

  // list of relays selected by the user. If they are just being added they're not active until saved.
  const [selectedRelays, setSelectedRelays] = useState<string[]>([]);

  // list of active relays. These are fetched from the db and are the relays currently used by the library.
  const [activeRelaysList, setActiveRelaysList] = useState<string[]>([]);

  const [customRelayTextFieldValue, setCustomRelayTextFieldValue] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [filterText, setFilterText] = useState<string>('');
  const [showCustomRelayInput, setShowCustomRelayInput] = useState<boolean>(false);

  // Theme colors
  const backgroundColor = useThemeColor({}, 'background');
  const primaryTextColor = useThemeColor({}, 'textPrimary');
  const secondaryTextColor = useThemeColor({}, 'textSecondary');
  const inputBackgroundColor = useThemeColor({}, 'inputBackground');
  const inputBorderColor = useThemeColor({}, 'inputBorder');
  const inputPlaceholderColor = useThemeColor({}, 'inputPlaceholder');
  const buttonPrimaryColor = useThemeColor({}, 'buttonPrimary');
  const buttonSecondaryColor = useThemeColor({}, 'buttonSecondary');
  const buttonPrimaryTextColor = useThemeColor({}, 'buttonPrimaryText');

  const nostrService = useNostrService();
  const { executeOperation } = useDatabaseContext();

  // Load relay data on mount
  useEffect(() => {
    const loadRelaysList = async () => {
      try {
        let relaysSet: Set<string> = new Set();

        const activeRelays = await executeOperation(
          db => db.getRelays().then(relays => relays.map(value => value.ws_uri)),
          []
        );

        activeRelays.forEach(relayUrl => {
          relaysSet.add(relayUrl);
        });

        popularRelayListFile.forEach(relayUrl => {
          relaysSet.add(relayUrl);
        });

        setActiveRelaysList(activeRelays);
        setSelectedRelays(activeRelays);
        setPopularRelayList(Array.from(relaysSet));
      } catch (error) {
        console.error('Error loading relays data:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadRelaysList();
  }, [executeOperation]); // Simplified dependency

  const handleAddCustomRelay = () => {
    const customRelay = customRelayTextFieldValue.trim();

    if (!isWebsocketUri(customRelay)) {
      ToastAndroid.showWithGravity(
        'Websocket format is wrong',
        ToastAndroid.LONG,
        ToastAndroid.CENTER
      );
      return;
    }

    // Add to popular relays list if not already present
    if (!popularRelayList.includes(customRelay)) {
      setPopularRelayList([customRelay, ...popularRelayList]);
    }

    // Add to selected relays if not already selected
    if (!selectedRelays.includes(customRelay)) {
      setSelectedRelays([customRelay, ...selectedRelays]);
    }

    // Clear input and hide the input field
    setCustomRelayTextFieldValue('');
    setShowCustomRelayInput(false);
  };

  const updateRelays = async () => {
    let newlySelectedRelays = selectedRelays;

    let removePromises: Promise<void>[] = [];
    let addPromises: Promise<void>[] = [];

    // Handle relay removals
    for (const oldRelay of activeRelaysList) {
      if (!newlySelectedRelays.includes(oldRelay)) {
        // Mark relay as removed in the context to prevent it from showing in connection status
        nostrService.markRelayAsRemoved(oldRelay);

        const promise = nostrService.portalApp?.removeRelay(oldRelay);
        if (promise) {
          removePromises.push(
            promise.catch(error => {
              console.error('❌ Failed to remove relay:', oldRelay, error.inner || error.message);
              // Don't throw - allow other operations to continue
            })
          );
        }
      }
    }

    // Handle relay additions
    for (const newRelay of newlySelectedRelays) {
      if (!activeRelaysList.includes(newRelay)) {
        // Clear from removed list and add to native layer
        nostrService.clearRemovedRelay(newRelay);

        const promise = nostrService.portalApp?.addRelay(newRelay);
        if (promise) {
          addPromises.push(
            promise.catch(error => {
              console.error('❌ Failed to add relay:', newRelay, error.inner || error.message);
              // Don't throw - allow other operations to continue
            })
          );
        }
      }
    }

    try {
      // Wait for all removal operations first
      console.log('🗑️ Processing relay removals...');
      await Promise.all(removePromises);

      // Then handle additions
      console.log('➕ Processing relay additions...');
      await Promise.all(addPromises);

      // If relays were added, trigger global reconnect to get status updates
      if (addPromises.length > 0) {
        console.log('🔄 Triggering global reconnect for newly added relays...');
        await nostrService.triggerGlobalReconnect();
      }

      // Finally update the database
      console.log('💾 Updating database...');
      await executeOperation(db => db.updateRelays(newlySelectedRelays), null);

      setActiveRelaysList(newlySelectedRelays);
      console.log('✅ Relay update completed successfully');
    } catch (error: any) {
      console.error('❌ Critical error during relay update:', error.inner || error.message);
      ToastAndroid.showWithGravity(
        'Failed to update relays. Please try again.',
        ToastAndroid.LONG,
        ToastAndroid.CENTER
      );
    }
    router.back();
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor }]} edges={['top']}>
        <ThemedView style={styles.container}>
          <ThemedView style={styles.header}>
            <ThemedText style={styles.headerText}>Nostr Management</ThemedText>
          </ThemedView>
          <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
            <ThemedText>Loading...</ThemedText>
          </ScrollView>
        </ThemedView>
      </SafeAreaView>
    );
  }

  // Filter popular relays based on filter text
  const filteredRelays = popularRelayList.filter(relay =>
    relay.toLowerCase().includes(filterText.toLowerCase())
  );

  const itemRows: string[][] = [[], [], [], []];

  filteredRelays.forEach((item, index) => {
    itemRows[index % itemRows.length].push(item);
  });

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]} edges={['top']}>
      <ThemedView style={styles.container}>
        <ThemedView style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={20} color={primaryTextColor} />
          </TouchableOpacity>
          <ThemedText style={[styles.headerText, { color: primaryTextColor }]}>
            Relay Management
          </ThemedText>
        </ThemedView>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          <ThemedText style={[styles.description, { color: secondaryTextColor }]}>
            Choose the Nostr relays you want to use for Nostr Wallet Connect. Relays help broadcast
            and receive transactions—pick reliable ones for better speed and connectivity. You can
            add custom relays or use trusted defaults.
          </ThemedText>

          {/* Add Relays Input */}
          <ThemedText style={styles.titleText}>Popular relays:</ThemedText>
          <View style={[styles.filterContainer, { borderBottomColor: inputBorderColor }]}>
            <TextInput
              style={[styles.filterInput, { color: primaryTextColor }]}
              value={filterText}
              onChangeText={setFilterText}
              placeholder="Filter relays..."
              placeholderTextColor={inputPlaceholderColor}
            />
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.relayScrollView}
          >
            <View style={styles.relayListContainer}>
              {itemRows.map((row, rowIndex) => (
                <View key={`row-${rowIndex}`} style={styles.relayRow}>
                  {row.map((relay, index) => (
                    <TouchableOpacity
                      key={`relay-${rowIndex}-${index}-${relay}`}
                      style={[
                        styles.relayItem,
                        {
                          backgroundColor: selectedRelays.includes(relay)
                            ? buttonPrimaryColor
                            : inputBackgroundColor,
                          borderColor: inputBorderColor,
                        },
                      ]}
                      onPress={() => {
                        if (selectedRelays.includes(relay)) {
                          setSelectedRelays(selectedRelays.filter(r => r !== relay));
                        } else {
                          setSelectedRelays([...selectedRelays, relay]);
                        }
                      }}
                    >
                      <ThemedText
                        style={[
                          styles.relayItemText,
                          {
                            color: selectedRelays.includes(relay)
                              ? buttonPrimaryTextColor
                              : primaryTextColor,
                          },
                        ]}
                      >
                        {relay}
                      </ThemedText>
                    </TouchableOpacity>
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>

          {/* Custom Relays Section */}
          <ThemedText style={[styles.titleText, { color: primaryTextColor }]}>
            Custom relays:
          </ThemedText>

          {!showCustomRelayInput ? (
            <TouchableOpacity
              style={[styles.addCustomRelayButton, { backgroundColor: buttonSecondaryColor }]}
              onPress={() => setShowCustomRelayInput(true)}
            >
              <Plus size={20} color={buttonPrimaryTextColor} />
              <ThemedText
                style={[styles.addCustomRelayButtonText, { color: buttonPrimaryTextColor }]}
              >
                Add custom relay
              </ThemedText>
            </TouchableOpacity>
          ) : (
            <View style={styles.customRelaysUrlContainer}>
              <View
                style={[styles.relaysUrlInputContainer, { borderBottomColor: inputBorderColor }]}
              >
                <TextInput
                  style={[styles.relaysUrlInput, { color: primaryTextColor }]}
                  value={customRelayTextFieldValue}
                  onChangeText={setCustomRelayTextFieldValue}
                  placeholder="Enter relay URL (e.g., wss://relay.example.com)"
                  placeholderTextColor={inputPlaceholderColor}
                />
                <TouchableOpacity
                  style={styles.textFieldAction}
                  onPress={() => setShowCustomRelayInput(false)}
                >
                  <X size={20} color={primaryTextColor} />
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={[styles.confirmCustomRelayButton, { backgroundColor: buttonPrimaryColor }]}
                onPress={handleAddCustomRelay}
              >
                <ThemedText
                  style={[styles.confirmCustomRelayButtonText, { color: buttonPrimaryTextColor }]}
                >
                  Add
                </ThemedText>
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity
            style={[styles.saveButton, { backgroundColor: buttonPrimaryColor }]}
            onPress={updateRelays}
          >
            <ThemedText style={[styles.saveButtonText, { color: buttonPrimaryTextColor }]}>
              Save relays
            </ThemedText>
          </TouchableOpacity>
        </ScrollView>
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
    // color handled by theme
  },
  titleText: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 20,
    marginBottom: 12,
    // color handled by theme
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  description: {
    // color handled by theme
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 24,
  },
  relayScrollView: {
    marginBottom: 24,
  },
  relayListContainer: {
    flexDirection: 'column',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  relayRow: {
    justifyContent: 'space-between',
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  relayItem: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderColor: 'transparent', // Default border
  },
  relayItemText: {
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  addCustomRelayButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    gap: 8,
  },
  addCustomRelayButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  customRelaysUrlContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    gap: 12,
  },
  relaysUrlInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    // borderBottomColor handled by theme
  },
  relaysUrlInput: {
    flex: 1,
    // color handled by theme
    fontSize: 16,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  textFieldAction: {
    paddingHorizontal: 8,
  },
  confirmCustomRelayButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  confirmCustomRelayButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  saveButton: {
    // backgroundColor handled by theme
    padding: 16,
    borderRadius: 12,
    width: '100%',
    maxWidth: 500,
    alignItems: 'center',
    alignSelf: 'center',
    marginTop: 32,
    marginBottom: 8,
  },
  saveButtonText: {
    // color handled by theme
    fontSize: 16,
    fontWeight: 'bold',
  },
  filterContainer: {
    borderBottomWidth: 1,
    marginBottom: 12,
  },
  filterInput: {
    fontSize: 16,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
});
