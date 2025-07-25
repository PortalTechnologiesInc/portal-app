import React, { useState, useEffect } from 'react';
import { StyleSheet, TouchableOpacity, Alert, TextInput, View, ToastAndroid } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, X } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import { DatabaseService } from '@/services/database';
import Dropdown from 'react-native-input-select';
import { useThemeColor } from '@/hooks/useThemeColor';

import relayListFile from '../assets/RelayListist.json';
import { TSelectedItem } from 'react-native-input-select/lib/typescript/src/types/index.types';
import { useNostrService } from '@/context/NostrServiceContext';

function makeList(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line: string) => line.trim())
    .filter((line: string) => line.length > 0);
}

function splitArray<T>(arr: T[], predicate: (item: T) => boolean): [T[], T[]] {
  const pass: T[] = [];
  const fail: T[] = [];
  for (const item of arr) {
    (predicate(item) ? pass : fail).push(item);
  }
  return [pass, fail];
}

function isWebsocketUri(uri: string): boolean {
  const regex = /^wss?:\/\/([a-zA-Z0-9.-]+)(:\d+)?(\/[^\s]*)?$/;
  return regex.test(uri);
}

export default function NostrRelayManagementScreen() {
  const router = useRouter();
  const [everyPopularRelayList, setEveryRelayList] = useState<string[]>([]);
  const [selectedRelays, setSelectedRelays] = useState<string[]>([]);
  const [customRelayTextFieldValue, setCustomRelayTextFieldValue] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [activeRelaysList, setActiveRelaysList] = useState<string[]>([]); // Fix: Make this a state variable

  // Theme colors
  const backgroundColor = useThemeColor({}, 'background');
  const surfaceSecondaryColor = useThemeColor({}, 'surfaceSecondary');
  const primaryTextColor = useThemeColor({}, 'textPrimary');
  const secondaryTextColor = useThemeColor({}, 'textSecondary');
  const inputBackgroundColor = useThemeColor({}, 'inputBackground');
  const inputBorderColor = useThemeColor({}, 'inputBorder');
  const inputPlaceholderColor = useThemeColor({}, 'inputPlaceholder');
  const buttonSecondaryColor = useThemeColor({}, 'buttonSecondary');
  const buttonSecondaryTextColor = useThemeColor({}, 'buttonSecondaryText');

  const nostrService = useNostrService();
  const sqliteContext = useSQLiteContext();
  const DB = new DatabaseService(sqliteContext);

  // Load relay data on mount
  useEffect(() => {
    const partialList = relayListFile;
    const loadEveryRelayList = async () => {
      try {
        setEveryRelayList(partialList);
      } catch (error) {
        console.error('Error loading relays data:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadEveryRelayList();

    const loadRelaysData = async () => {
      try {
        const currentRelays = (await DB.getRelays()).map(value => value.ws_uri);
        setActiveRelaysList(currentRelays); // Fix: Use setter function

        const [popularRelays, customRelays] = splitArray(currentRelays, item =>
          partialList.includes(item)
        );

        setSelectedRelays(popularRelays);
        setCustomRelayTextFieldValue(customRelays.join('\n'));
      } catch (error) {
        console.error('Error loading relays data:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadRelaysData();
  }, []);

  const handleClearInput = async () => {
    try {
      // Clear the wallet URL in storage
      setCustomRelayTextFieldValue('');
    } catch (error) {
      console.error('Error clearing wallet URL:', error);
      Alert.alert('Error', 'Failed to clear wallet URL. Please try again.');
    }
  };

  const updateRelays = async () => {
    const customRelays = makeList(customRelayTextFieldValue);
    for (const relay of customRelays) {
      if (!isWebsocketUri(relay)) {
        ToastAndroid.showWithGravity(
          'Websocket format is wrong',
          ToastAndroid.LONG,
          ToastAndroid.CENTER
        );
        return;
      }
    }
    let newlySelectedRelays = selectedRelays?.concat(customRelays);

    let promises: Promise<void>[] = [];
    for (const oldRelay of activeRelaysList) {
      if (!newlySelectedRelays.includes(oldRelay)) {
        const promise = nostrService.portalApp?.removeRelay(oldRelay);
        if (promise) {
          promises.push(promise);
        }
      }
    }
    for (const newRelay of newlySelectedRelays) {
      if (!activeRelaysList.includes(newRelay)) {
        const promise = nostrService.portalApp?.addRelay(newRelay);
        if (promise) {
          promises.push(promise);
        }
      }
    }

    try {
      await Promise.all([...promises, DB.updateRelays(newlySelectedRelays)]);
      setActiveRelaysList(newlySelectedRelays);
    } catch (error) {
      console.error(error);
    }
    router.back();
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor }]} edges={['top']}>
        <ThemedView style={styles.container}>
          <ThemedView style={styles.header}>
            <ThemedText style={[styles.headerText, { color: primaryTextColor }]}>
              Nostr Management
            </ThemedText>
          </ThemedView>
          <ThemedView style={styles.content}>
            <ThemedText style={{ color: primaryTextColor }}>Loading...</ThemedText>
          </ThemedView>
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
          <ThemedText style={[styles.headerText, { color: primaryTextColor }]}>
            Relay Management
          </ThemedText>
        </ThemedView>

        <ThemedView style={styles.content}>
          <ThemedText style={[styles.description, { color: secondaryTextColor }]}>
            Choose the Nostr relays you want to use for Nostr Wallet Connect. Relays help broadcast
            and receive transactions—pick reliable ones for better speed and connectivity. You can
            add custom relays or use trusted defaults.
          </ThemedText>

          {/* Add Relays Input */}
          <ThemedText style={[styles.titleText, { color: primaryTextColor }]}>
            Popular relays:
          </ThemedText>
          <View style={[styles.dropdownContainer, { backgroundColor: surfaceSecondaryColor }]}>
            <Dropdown
              modalControls={{
                modalOptionsContainerStyle: {
                  padding: 10,
                  backgroundColor: surfaceSecondaryColor,
                },
              }}
              listComponentStyles={{
                itemSeparatorStyle: {
                  opacity: 0,
                  margin: 2,
                },
              }}
              dropdownStyle={{
                paddingEnd: 50,
                backgroundColor: surfaceSecondaryColor,
                borderColor: inputBorderColor,
              }}
              searchControls={{
                textInputStyle: {
                  backgroundColor: inputBackgroundColor,
                  color: primaryTextColor,
                },
              }}
              checkboxControls={{
                checkboxStyle: {
                  borderRadius: 30,
                },
                checkboxComponent: <View />,
                checkboxUnselectedColor: inputBorderColor,
              }}
              isMultiple
              isSearchable
              placeholder="Select an option..."
              options={everyPopularRelayList.map(relay => {
                return { label: relay, value: relay };
              })}
              selectedValue={selectedRelays as TSelectedItem[]}
              onValueChange={value => {
                setSelectedRelays(value as string[]);
              }}
              primaryColor={buttonSecondaryColor}
            />
          </View>

          {/* Custom Relays Input */}
          <ThemedText style={[styles.titleText, { color: primaryTextColor }]}>
            Custom relays:
          </ThemedText>
          <View style={styles.relaysUrlContainer}>
            <View style={[styles.relaysUrlInputContainer, { borderBottomColor: inputBorderColor }]}>
              <TextInput
                style={[styles.relaysUrlInput, { color: primaryTextColor }]}
                value={customRelayTextFieldValue}
                multiline
                numberOfLines={9}
                onChangeText={setCustomRelayTextFieldValue}
                placeholder="Enter a list of relays url separated by a newline char"
                placeholderTextColor={inputPlaceholderColor}
              />
              <TouchableOpacity style={styles.textFieldAction} onPress={handleClearInput}>
                <X size={20} color={primaryTextColor} />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.saveButton, { backgroundColor: buttonSecondaryColor }]}
            onPress={updateRelays}
          >
            <ThemedText style={[styles.saveButtonText, { color: buttonSecondaryTextColor }]}>
              Save relays
            </ThemedText>
          </TouchableOpacity>
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
    // color handled by theme
  },
  titleText: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 20,
    marginBottom: 12,
    // color handled by theme
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
  dropdownContainer: {
    // backgroundColor handled by theme
    borderRadius: 12,
    padding: 4,
    marginBottom: 8,
  },
  relaysUrlContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  relaysUrlInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    // borderBottomColor handled by theme
    marginRight: 12,
  },
  relaysUrlInput: {
    flex: 1,
    // color handled by theme
    fontSize: 16,
    paddingVertical: 8,
  },
  textFieldAction: {
    paddingHorizontal: 8,
  },
  saveButton: {
    // backgroundColor handled by theme
    padding: 16,
    borderRadius: 12,
    width: '100%',
    maxWidth: 500,
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 8,
  },
  saveButtonText: {
    // color handled by theme
    fontSize: 16,
    fontWeight: 'bold',
  },
});
