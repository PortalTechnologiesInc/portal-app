import { useRouter } from 'expo-router';
import { ArrowLeft, Plus, X } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  ToastAndroid,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useDatabaseContext } from '@/context/DatabaseContext';
import { useNostrService } from '@/context/NostrServiceContext';
import { useThemeColor } from '@/hooks/useThemeColor';
import { PortalAppManager } from '@/services/PortalAppManager';
import popularRelayListFile from '../assets/RelayList.json';

const MAX_RELAY_CONNECTIONS = 6;
const MIN_RELAY_CONNECTIONS = 1;
const DEBOUNCE_DELAY_MS = 800; // Delay before executing relay updates after user stops clicking

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
  const updateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitialLoadRef = useRef(true);

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
        const relaysSet: Set<string> = new Set();

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
      } catch (_error) {
      } finally {
        setIsLoading(false);
      }
    };
    loadRelaysList();
  }, [executeOperation]); // Simplified dependency

  const updateRelays = useCallback(async () => {
    // Enforce minimum relay connections limit
    if (selectedRelays.length < MIN_RELAY_CONNECTIONS) {
      ToastAndroid.showWithGravity(
        `At least ${MIN_RELAY_CONNECTIONS} relay ${MIN_RELAY_CONNECTIONS === 1 ? 'connection' : 'connections'} required`,
        ToastAndroid.LONG,
        ToastAndroid.CENTER
      );
      return;
    }

    // Enforce maximum relay connections limit
    if (selectedRelays.length > MAX_RELAY_CONNECTIONS) {
      ToastAndroid.showWithGravity(
        `Maximum ${MAX_RELAY_CONNECTIONS} relay connections allowed. Please remove some relays.`,
        ToastAndroid.LONG,
        ToastAndroid.CENTER
      );
      return;
    }

    const newlySelectedRelays = selectedRelays;

    const removePromises: Promise<void>[] = [];
    const addPromises: Promise<void>[] = [];

    // Handle relay removals
    for (const oldRelay of activeRelaysList) {
      if (!newlySelectedRelays.includes(oldRelay)) {
        // Mark relay as removed in the context to prevent it from showing in connection status
        nostrService.markRelayAsRemoved(oldRelay);

        const promise = PortalAppManager.tryGetInstance().removeRelay(oldRelay);
        if (promise) {
          removePromises.push(
            promise.catch(_error => {
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

        const promise = PortalAppManager.tryGetInstance().addRelay(newRelay);
        if (promise) {
          addPromises.push(
            promise.catch(_error => {
              // Don't throw - allow other operations to continue
            })
          );
        }
      }
    }

    try {
      await Promise.all(removePromises);
      await Promise.all(addPromises);
      await executeOperation(db => db.updateRelays(newlySelectedRelays), null);

      setActiveRelaysList(newlySelectedRelays);
    } catch (_error: any) {
      ToastAndroid.showWithGravity(
        'Failed to update relays. Please try again.',
        ToastAndroid.LONG,
        ToastAndroid.CENTER
      );
    }
  }, [selectedRelays, activeRelaysList, nostrService, executeOperation]);

  // Auto-update relays when selectedRelays changes (debounced)
  // This ensures rapid clicks only trigger one update after the user stops clicking
  useEffect(() => {
    // Skip update on initial load - check if still loading or if activeRelaysList is empty
    // This prevents the debounce effect from running when selectedRelays is set during initial load
    // We check activeRelaysList.length === 0 because during initial load, activeRelaysList is empty
    // until the state updates are processed, so this ensures we skip the first update cycle
    if (isInitialLoadRef.current || isLoading || activeRelaysList.length === 0) {
      // Mark initial load as complete once we have data and are not loading
      // Use setTimeout to ensure this runs after React has fully processed state updates
      if (!isLoading && activeRelaysList.length > 0 && isInitialLoadRef.current) {
        const timeoutId = setTimeout(() => {
          isInitialLoadRef.current = false;
        }, 0);
        return () => clearTimeout(timeoutId);
      }
      return;
    }

    // Clear existing timeout to reset the debounce timer
    // This means if user clicks rapidly, we keep resetting the timer
    // and only execute once after they stop clicking for DEBOUNCE_DELAY_MS
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
      updateTimeoutRef.current = null;
    }

    // Set new timeout - will only execute if user stops clicking for DEBOUNCE_DELAY_MS
    updateTimeoutRef.current = setTimeout(() => {
      updateRelays();
      updateTimeoutRef.current = null;
    }, DEBOUNCE_DELAY_MS);

    // Cleanup timeout on unmount or when selectedRelays changes again
    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
        updateTimeoutRef.current = null;
      }
    };
  }, [isLoading, activeRelaysList, activeRelaysList.length, updateRelays]);

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

    // Check if limit is reached
    if (selectedRelays.length >= MAX_RELAY_CONNECTIONS) {
      ToastAndroid.showWithGravity(
        `Maximum ${MAX_RELAY_CONNECTIONS} relay connections allowed`,
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

  const itemRows: string[][] = [[], [], [], [], []];

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

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
        >
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <ThemedText style={[styles.description, { color: secondaryTextColor }]}>
              Choose the Nostr relays you want to use for Nostr Wallet Connect. Relays help
              broadcast and receive transactions—pick reliable ones for better speed and
              connectivity. You can add custom relays or use trusted defaults. Changes are saved
              automatically. At least {MIN_RELAY_CONNECTIONS} relay{' '}
              {MIN_RELAY_CONNECTIONS === 1 ? 'connection is' : 'connections are'} required (maximum{' '}
              {MAX_RELAY_CONNECTIONS}).
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
                  <View key={`row-${row.join('-')}`} style={styles.relayRow}>
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
                            opacity:
                              (!selectedRelays.includes(relay) &&
                                selectedRelays.length >= MAX_RELAY_CONNECTIONS) ||
                                (selectedRelays.includes(relay) &&
                                  selectedRelays.length <= MIN_RELAY_CONNECTIONS)
                                ? 0.5
                                : 1,
                          },
                        ]}
                        onPress={() => {
                          if (selectedRelays.includes(relay)) {
                            // Prevent deselecting the last relay
                            if (selectedRelays.length <= MIN_RELAY_CONNECTIONS) {
                              ToastAndroid.showWithGravity(
                                `At least ${MIN_RELAY_CONNECTIONS} relay ${MIN_RELAY_CONNECTIONS === 1 ? 'connection' : 'connections'} required`,
                                ToastAndroid.LONG,
                                ToastAndroid.CENTER
                              );
                              return;
                            }
                            setSelectedRelays(selectedRelays.filter(r => r !== relay));
                          } else {
                            if (selectedRelays.length >= MAX_RELAY_CONNECTIONS) {
                              ToastAndroid.showWithGravity(
                                `Maximum ${MAX_RELAY_CONNECTIONS} relay connections allowed`,
                                ToastAndroid.LONG,
                                ToastAndroid.CENTER
                              );
                              return;
                            }
                            setSelectedRelays([...selectedRelays, relay]);
                          }
                        }}
                        disabled={
                          (!selectedRelays.includes(relay) &&
                            selectedRelays.length >= MAX_RELAY_CONNECTIONS) ||
                          (selectedRelays.includes(relay) &&
                            selectedRelays.length <= MIN_RELAY_CONNECTIONS)
                        }
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
                style={[
                  styles.addCustomRelayButton,
                  {
                    backgroundColor: buttonSecondaryColor,
                    opacity: selectedRelays.length >= MAX_RELAY_CONNECTIONS ? 0.5 : 1,
                  },
                ]}
                onPress={() => {
                  if (selectedRelays.length >= MAX_RELAY_CONNECTIONS) {
                    ToastAndroid.showWithGravity(
                      `Maximum ${MAX_RELAY_CONNECTIONS} relay connections allowed`,
                      ToastAndroid.LONG,
                      ToastAndroid.CENTER
                    );
                    return;
                  }
                  setShowCustomRelayInput(true);
                }}
                disabled={selectedRelays.length >= MAX_RELAY_CONNECTIONS}
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
          </ScrollView>
        </KeyboardAvoidingView>
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
  updatingText: {
    fontSize: 14,
    fontStyle: 'italic',
    marginTop: 8,
    marginBottom: 8,
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
