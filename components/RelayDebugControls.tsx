/**
 * Relay Debug Controls Component
 *
 * Temporary debugging component to enable/disable relay status logging
 * Add this component to any screen to control debug logging
 */

import React, { useState, useEffect } from 'react';
import { View, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useThemeColor } from '@/hooks/useThemeColor';
import {
  relayDebugLogger,
  enableRelayDebug,
  disableRelayDebug,
  generateReadableDebugLog,
} from '@/utils/RelayDebugLogger';

export const RelayDebugControls: React.FC = () => {
  const [isDebugEnabled, setIsDebugEnabled] = useState(false);
  const [logPreview, setLogPreview] = useState<string>('');

  // Theme colors
  const backgroundColor = useThemeColor({}, 'background');
  const primaryTextColor = useThemeColor({}, 'textPrimary');
  const secondaryTextColor = useThemeColor({}, 'textSecondary');
  const buttonColor = useThemeColor({}, 'buttonSecondary');
  const buttonTextColor = useThemeColor({}, 'buttonSecondaryText');
  const cardBackgroundColor = useThemeColor({}, 'cardBackground');

  const handleToggleDebug = () => {
    if (isDebugEnabled) {
      disableRelayDebug();
      setIsDebugEnabled(false);
      Alert.alert('Debug Disabled', 'Relay status debugging has been disabled.');
    } else {
      enableRelayDebug();
      setIsDebugEnabled(true);
      Alert.alert(
        'Debug Enabled',
        'Check your console for the live relay status table.\n\n' +
          'The table updates every 2 seconds and shows:\n' +
          '• Relay URLs and their current status\n' +
          '• Connection state and timing\n' +
          '• App state during status changes\n' +
          '• Live updates during background/foreground transitions'
      );
    }
  };

  const handleExportDebugData = async () => {
    try {
      const readableLog = generateReadableDebugLog();
      await Clipboard.setString(readableLog);

      // Update preview
      setLogPreview(
        readableLog.split('\n').slice(0, 10).join('\n') + '\n... (Full log copied to clipboard)'
      );

      Alert.alert(
        'Debug Log Copied! 📋',
        `Complete debug log has been copied to your clipboard.\n\n` +
          `The log includes:\n` +
          `• Session summary and relay status\n` +
          `• Detailed timeline of all events\n` +
          `• App state transitions\n` +
          `• Status changes with timestamps\n\n` +
          `You can now paste it into any text editor, chat, or email.`,
        [
          {
            text: 'Show Preview',
            onPress: () => {
              // Show first few lines as preview
              const preview = readableLog.split('\n').slice(0, 15).join('\n');
              Alert.alert('Log Preview', preview + '\n\n... (Full log is in clipboard)');
            },
          },
          { text: 'OK', style: 'default' },
        ]
      );
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      Alert.alert('Export Error', 'Failed to copy to clipboard. Check console for the log data.');
      // Fallback: log to console
      console.log('🐛 RELAY DEBUG LOG:\n', generateReadableDebugLog());
    }
  };

  const handleClearConsole = () => {
    console.clear();
    console.log('🧹 Console cleared by user');
  };

  // Update log preview periodically when debug is enabled
  useEffect(() => {
    if (!isDebugEnabled) {
      setLogPreview('');
      return;
    }

    const updatePreview = () => {
      try {
        const fullLog = generateReadableDebugLog();
        // Show last 8 lines of the log for preview
        const lines = fullLog.split('\n');
        const recentLines = lines.slice(-12, -2); // Skip the last 2 lines (separator and generation time)
        const preview = recentLines.join('\n');
        setLogPreview(preview || 'No events recorded yet...');
      } catch (error) {
        setLogPreview('Error generating preview');
      }
    };

    // Update immediately
    updatePreview();

    // Update every 3 seconds while debugging
    const interval = setInterval(updatePreview, 3000);

    return () => clearInterval(interval);
  }, [isDebugEnabled]);

  return (
    <ThemedView style={[styles.container, { backgroundColor: cardBackgroundColor }]}>
      <ThemedText style={[styles.title, { color: primaryTextColor }]}>
        🐛 Relay Debug Controls
      </ThemedText>

      <ThemedText style={[styles.description, { color: secondaryTextColor }]}>
        Monitor relay status changes in real-time. Useful for debugging background/foreground
        transition issues.
      </ThemedText>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.button, { backgroundColor: isDebugEnabled ? '#ff6b6b' : '#51cf66' }]}
          onPress={handleToggleDebug}
        >
          <ThemedText style={[styles.buttonText, { color: '#ffffff' }]}>
            {isDebugEnabled ? '⏸️ Stop Debug' : '▶️ Start Debug'}
          </ThemedText>
        </TouchableOpacity>

        {isDebugEnabled && (
          <>
            <TouchableOpacity
              style={[styles.button, { backgroundColor: buttonColor }]}
              onPress={handleExportDebugData}
            >
              <ThemedText style={[styles.buttonText, { color: buttonTextColor }]}>
                📋 Export Data
              </ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, { backgroundColor: buttonColor }]}
              onPress={handleClearConsole}
            >
              <ThemedText style={[styles.buttonText, { color: buttonTextColor }]}>
                🧹 Clear Console
              </ThemedText>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Log preview section */}
      {isDebugEnabled && logPreview && (
        <View style={[styles.previewContainer, { backgroundColor: backgroundColor }]}>
          <ThemedText style={[styles.previewTitle, { color: primaryTextColor }]}>
            📜 Recent Events Preview
          </ThemedText>
          <ScrollView style={styles.previewScroll} showsVerticalScrollIndicator={false}>
            <ThemedText style={[styles.previewText, { color: secondaryTextColor }]}>
              {logPreview}
            </ThemedText>
          </ScrollView>
        </View>
      )}

      <ThemedText style={[styles.instructions, { color: secondaryTextColor }]}>
        📱 Instructions:{'\n'}
        1. Tap "Start Debug" to begin logging{'\n'}
        2. Check console for live table updates{'\n'}
        3. Put app in background/foreground{'\n'}
        4. Watch events in preview above{'\n'}
        5. Tap "Export Data" to copy full log{'\n'}
        6. Paste log into any text editor or chat
      </ThemedText>
    </ThemedView>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    margin: 16,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  buttonContainer: {
    gap: 8,
    marginBottom: 16,
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  instructions: {
    fontSize: 12,
    lineHeight: 16,
    fontStyle: 'italic',
  },
  previewContainer: {
    marginVertical: 12,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
    maxHeight: 200,
  },
  previewTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  previewScroll: {
    flex: 1,
  },
  previewText: {
    fontSize: 10,
    fontFamily: 'monospace',
    lineHeight: 14,
  },
});

export default RelayDebugControls;
