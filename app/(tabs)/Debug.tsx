import React, { useState, useEffect } from 'react';
import { StyleSheet, View, ScrollView, TouchableOpacity, Alert, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useThemeColor } from '@/hooks/useThemeColor';
import { LogLevel } from 'portal-app-lib';
import Dropdown from 'react-native-input-select';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Log level options for dropdown
const LOG_LEVEL_OPTIONS = [
  { label: 'Trace (Most Verbose)', value: LogLevel.Trace },
  { label: 'Debug', value: LogLevel.Debug },
  { label: 'Info', value: LogLevel.Info },
  { label: 'Warn', value: LogLevel.Warn },
  { label: 'Error (Least Verbose)', value: LogLevel.Error },
];

const STORAGE_KEYS = {
  LOGGER_ENABLED: '@debug_logger_enabled',
  LOG_LEVEL: '@debug_log_level',
};

export default function DebugScreen() {
  const [isLoggerEnabled, setIsLoggerEnabled] = useState(false);
  const [currentLogLevel, setCurrentLogLevel] = useState<LogLevel>(LogLevel.Info);
  const [isInitialized, setIsInitialized] = useState(false);

  // Theme colors
  const backgroundColor = useThemeColor({}, 'background');
  const cardBackgroundColor = useThemeColor({}, 'cardBackground');
  const surfaceSecondaryColor = useThemeColor({}, 'surfaceSecondary');
  const primaryTextColor = useThemeColor({}, 'textPrimary');
  const secondaryTextColor = useThemeColor({}, 'textSecondary');
  const buttonColor = useThemeColor({}, 'buttonSecondary');
  const buttonTextColor = useThemeColor({}, 'buttonSecondaryText');

  // Load settings from storage on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const savedLoggerEnabled = await AsyncStorage.getItem(STORAGE_KEYS.LOGGER_ENABLED);
        const savedLogLevel = await AsyncStorage.getItem(STORAGE_KEYS.LOG_LEVEL);

        if (savedLoggerEnabled !== null) {
          setIsLoggerEnabled(JSON.parse(savedLoggerEnabled));
        }

        if (savedLogLevel !== null) {
          setCurrentLogLevel(parseInt(savedLogLevel, 10));
        }

        setIsInitialized(true);
      } catch (error) {
        console.error('Failed to load debug settings:', error);
        setIsInitialized(true);
      }
    };

    loadSettings();
  }, []);

  // Note: Logger initialization is handled by NostrServiceContext
  // This debug screen is for future implementation
  useEffect(() => {
    if (!isInitialized) return;

    // For now, just log the intended settings
    console.log(
      `Debug settings updated: enabled=${isLoggerEnabled}, level=${LogLevel[currentLogLevel]}`
    );
    console.log('ℹ️ Note: Logger control will be implemented in future versions');
  }, [isLoggerEnabled, currentLogLevel, isInitialized]);

  const handleLoggerToggle = async (enabled: boolean) => {
    setIsLoggerEnabled(enabled);
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.LOGGER_ENABLED, JSON.stringify(enabled));
    } catch (error) {
      console.error('Failed to save logger enabled state:', error);
    }
  };

  const handleLogLevelChange = async (value: LogLevel) => {
    setCurrentLogLevel(value);
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.LOG_LEVEL, value.toString());
    } catch (error) {
      console.error('Failed to save log level:', error);
    }
  };

  const handleClearLogs = () => {
    console.clear();
    console.log('🧹 Console cleared from Debug screen');
  };

  const handleTestLogs = () => {
    Alert.alert(
      'Logger Status',
      'Portal-app-lib logging is currently enabled by default. Check your console during normal app usage (relay connections, wallet operations, etc.) to see library logs.'
    );
  };

  if (!isInitialized) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor }]} edges={['top']}>
        <ThemedView style={styles.container}>
          <ThemedText style={[styles.title, { color: primaryTextColor }]}>
            Loading Debug Settings...
          </ThemedText>
        </ThemedView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]} edges={['top']}>
      <ThemedView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Header */}
          <ThemedText style={[styles.title, { color: primaryTextColor }]}>
            🐛 Debug Console
          </ThemedText>
          <ThemedText style={[styles.subtitle, { color: secondaryTextColor }]}>
            Development mode only - Configure portal-app-lib logging
          </ThemedText>

          {/* Logger Controls */}
          <ThemedView style={[styles.section, { backgroundColor: cardBackgroundColor }]}>
            <ThemedText style={[styles.sectionTitle, { color: primaryTextColor }]}>
              📊 Portal Library Logging
            </ThemedText>

            <ThemedText style={[styles.description, { color: secondaryTextColor }]}>
              Debug interface for portal-app-lib logging configuration. Currently, logging is
              handled automatically by the NostrService context.
            </ThemedText>

            <ThemedText style={[styles.warningText, { color: secondaryTextColor }]}>
              ℹ️ Note: Dynamic logger control will be implemented in future versions.
            </ThemedText>

            {/* Logger Enable/Disable */}
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <ThemedText style={[styles.settingLabel, { color: primaryTextColor }]}>
                  Enable Portal Logging (Future)
                </ThemedText>
                <ThemedText style={[styles.settingSubtext, { color: secondaryTextColor }]}>
                  {isLoggerEnabled
                    ? 'Placeholder - currently always on'
                    : 'Placeholder - currently always on'}
                </ThemedText>
              </View>
              <Switch
                value={isLoggerEnabled}
                onValueChange={handleLoggerToggle}
                trackColor={{ false: '#767577', true: buttonColor }}
                thumbColor={isLoggerEnabled ? '#ffffff' : '#f4f3f4'}
              />
            </View>

            {/* Log Level Selector */}
            {isLoggerEnabled && (
              <View style={styles.settingColumn}>
                <ThemedText style={[styles.settingLabel, { color: primaryTextColor }]}>
                  Log Level (Future)
                </ThemedText>
                <ThemedText style={[styles.settingSubtext, { color: secondaryTextColor }]}>
                  Placeholder - currently fixed at Trace
                </ThemedText>

                <View
                  style={[styles.dropdownContainer, { backgroundColor: surfaceSecondaryColor }]}
                >
                  <Dropdown
                    options={LOG_LEVEL_OPTIONS}
                    selectedValue={currentLogLevel}
                    onValueChange={handleLogLevelChange}
                    placeholder="Select log level..."
                    dropdownStyle={{
                      backgroundColor: surfaceSecondaryColor,
                      borderColor: surfaceSecondaryColor,
                    }}
                    modalControls={{
                      modalOptionsContainerStyle: {
                        backgroundColor: cardBackgroundColor,
                      },
                    }}
                    searchControls={{
                      textInputStyle: {
                        backgroundColor: surfaceSecondaryColor,
                        color: primaryTextColor,
                      },
                    }}
                    primaryColor={buttonColor}
                  />
                </View>
              </View>
            )}
          </ThemedView>

          {/* Actions */}
          <ThemedView style={[styles.section, { backgroundColor: cardBackgroundColor }]}>
            <ThemedText style={[styles.sectionTitle, { color: primaryTextColor }]}>
              🔧 Debug Actions
            </ThemedText>

            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: buttonColor }]}
              onPress={handleTestLogs}
            >
              <ThemedText style={[styles.actionButtonText, { color: buttonTextColor }]}>
                📋 Check Logger Status
              </ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: buttonColor }]}
              onPress={handleClearLogs}
            >
              <ThemedText style={[styles.actionButtonText, { color: buttonTextColor }]}>
                🧹 Clear Console
              </ThemedText>
            </TouchableOpacity>
          </ThemedView>

          {/* Info */}
          <ThemedView style={[styles.section, { backgroundColor: cardBackgroundColor }]}>
            <ThemedText style={[styles.sectionTitle, { color: primaryTextColor }]}>
              💡 How to Use
            </ThemedText>
            <ThemedText style={[styles.infoText, { color: secondaryTextColor }]}>
              1. Portal-app-lib logging is currently enabled by default{'\n'}
              2. Check your console/debugger for library logs{'\n'}
              3. Use the app normally (connect wallet, send payments, etc.){'\n'}
              4. Watch for library logs with target prefixes{'\n'}
              5. UI controls are placeholders for future implementation{'\n'}
              6. Current logging level: Trace (most verbose)
            </ThemedText>
          </ThemedView>
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
  scrollContent: {
    padding: 20,
    gap: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
    fontStyle: 'italic',
  },
  section: {
    borderRadius: 12,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  warningText: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 16,
    fontStyle: 'italic',
    opacity: 0.8,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    marginBottom: 8,
  },
  settingColumn: {
    marginTop: 16,
  },
  settingInfo: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 2,
  },
  settingSubtext: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  dropdownContainer: {
    marginTop: 8,
    borderRadius: 8,
    padding: 4,
  },
  actionButton: {
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 8,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  infoText: {
    fontSize: 14,
    lineHeight: 20,
  },
});
