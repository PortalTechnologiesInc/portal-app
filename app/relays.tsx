import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  Alert,
  TextInput,
  View,
  ToastAndroid,
} from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Colors } from '@/constants/Colors';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, X } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import { DatabaseService } from '@/services/database';
import Dropdown from 'react-native-input-select';

import relayListFile from '../assets/RelayListist.json';
import { TSelectedItem } from 'react-native-input-select/lib/typescript/src/types/index.types';
import { useNostrService } from '@/context/NostrServiceContext';

function makeList(text: string): string[] {
  return text.split(/\r?\n/)
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
  return regex.test(uri)
}

export default function NostrRelayManagementScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [everyPopularRelayList, setEveryRelayList] = useState<string[]>([]);
  const [selectedRelays, setSelectedRelays] = useState<string[]>([]);
  const [customRelayTextFieldValue, setCustomRelayTextFieldValue] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  const nostrService = useNostrService();
  const sqliteContext = useSQLiteContext();
  const DB = new DatabaseService(sqliteContext);
  let activeRelaysList: string[] = [];

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

    }
    loadEveryRelayList()

    const loadRelaysData = async () => {
      try {
        activeRelaysList = (await DB.getRelays()).map(value => value.ws_uri);
        const [popularRelays, customRelays] = splitArray(activeRelaysList, item => partialList.includes(item))

        setSelectedRelays(popularRelays);
        setCustomRelayTextFieldValue(customRelays.join('\n'));
      } catch (error) {
        console.error('Error loading relays data:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadRelaysData()
  }, []);

  // Navigate back to previous screen
  const handleBackPress = () => {
    // Check navigation parameters
    const sourceParam = params.source as string | undefined;
    const returnToWalletParam = params.returnToWallet as string | undefined;

    // If we have a source param and it's not a QR scan from wallet itself, navigate directly to that screen
    if (sourceParam === 'settings') {
      router.replace('/settings');
    } else {
      // Otherwise use normal back navigation
      router.back();
    }
  };

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
        ToastAndroid.showWithGravity('Websocket format is wrong', ToastAndroid.LONG, ToastAndroid.CENTER);
        return
      }
    }
    let newlySelectedRelays = selectedRelays?.concat(customRelays)


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
    } catch (error) {
      console.error(error);
    }
    router.back();
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ThemedView style={styles.container}>
          <ThemedView style={styles.header}>
            <ThemedText
              style={styles.headerText}
              lightColor={Colors.darkGray}
              darkColor={Colors.almostWhite}
            >
              Nostr Management
            </ThemedText>
          </ThemedView>
          <ThemedView style={styles.content}>
            <ThemedText>Loading...</ThemedText>
          </ThemedView>
        </ThemedView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ThemedView style={styles.container}>
        <ThemedView style={styles.header}>
          <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
            <ArrowLeft size={20} color={Colors.almostWhite} />
          </TouchableOpacity>
          <ThemedText
            style={styles.headerText}
            lightColor={Colors.darkGray}
            darkColor={Colors.almostWhite}
          >
            Relay Management
          </ThemedText>
        </ThemedView>

        <ThemedView style={styles.content}>
          <ThemedText style={styles.description}>
            Choose the Nostr relays you want to use for Nostr Wallet Connect. Relays help broadcast and receive transactions—pick reliable ones for better speed and connectivity. You can add custom relays or use trusted defaults.
          </ThemedText>

          {/* Add Relays Input */}
          <ThemedText
            style={styles.titleText}
            lightColor={Colors.darkGray}
            darkColor={Colors.almostWhite}
          >
            Popular relays:
          </ThemedText>
          <Dropdown
            modalControls={{
              modalOptionsContainerStyle: {
                padding: 10,
                backgroundColor: Colors.almostWhite,
              },
            }}
            listComponentStyles={{
              itemSeparatorStyle: {
                opacity: 0,
                margin: 2
              },
            }}
            dropdownStyle={{
              paddingEnd: 50,
              backgroundColor: Colors.almostWhite,
            }}
            searchControls={{
              textInputStyle: {
                backgroundColor: Colors.almostWhite,
              },
            }}
            checkboxControls={{
              checkboxStyle: {
                borderRadius: 30,
              },
              checkboxComponent: <View />,
              checkboxUnselectedColor: Colors.almostWhite
            }}
            isMultiple
            isSearchable
            placeholder="Select an option..."
            options={everyPopularRelayList.map((relay) => { return { label: relay, value: relay } })}
            selectedValue={selectedRelays as TSelectedItem[]}
            onValueChange={(value) => { setSelectedRelays(value as string[]) }}
            primaryColor={Colors.darkGray}
          />

          {/* Custom Relays Input */}
          <ThemedText
            style={styles.titleText}
            lightColor={Colors.darkGray}
            darkColor={Colors.almostWhite}
          >
            Custom relays:
          </ThemedText>
          <View style={styles.relaysUrlContainer}>
            <View style={styles.relaysUrlInputContainer}>
              <TextInput
                style={styles.relaysUrlInput}
                value={customRelayTextFieldValue}
                multiline
                numberOfLines={9}
                onChangeText={setCustomRelayTextFieldValue}
                placeholder="Enter a list of relays url separated by a newline char"
                placeholderTextColor={Colors.gray}
              />
              <TouchableOpacity style={styles.textFieldAction} onPress={handleClearInput}>
                <X size={20} color={Colors.almostWhite} />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={styles.saveButton}
            onPress={updateRelays}
          >
            <ThemedText style={styles.saveButtonText}>
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
    backgroundColor: '#000000',
  },
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 20,
    backgroundColor: '#000000',
  },
  backButton: {
    marginRight: 15,
  },
  headerText: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  titleText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  description: {
    color: Colors.almostWhite,
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 24,
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
    borderBottomColor: Colors.gray,
    marginRight: 12,
  },
  relaysUrlInput: {
    flex: 1,
    color: Colors.almostWhite,
    fontSize: 16,
    paddingVertical: 8,
  },
  textFieldAction: {
    paddingHorizontal: 8,
  },
	saveButton: {
		backgroundColor: Colors.primaryDark,
		padding: 16,
		borderRadius: 8,
		width: '100%',
		maxWidth: 500,
		alignItems: 'center',
		alignSelf: 'center',
		marginBottom: 8,
	},
	saveButtonText: {
		color: Colors.almostWhite,
		fontSize: 16,
		fontWeight: 'bold',
	},
});