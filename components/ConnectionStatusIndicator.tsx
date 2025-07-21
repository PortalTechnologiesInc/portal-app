import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  View,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ScrollView,
  Animated,
  AppState,
} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { useNostrService } from '@/context/NostrServiceContext';
import type { RelayInfo, ConnectionSummary } from '@/utils/types';
import { Wifi, Wallet, X, CheckCircle, XCircle, AlertCircle } from 'lucide-react-native';
import { useThemeColor } from '@/hooks/useThemeColor';

type ConnectionStatus = 'connected' | 'partial' | 'disconnected';

interface ConnectionStatusIndicatorProps {
  size?: number;
  expandDuration?: number; // How long to show expanded state (ms)
  triggerRefresh?: number; // When this value changes, trigger an immediate refresh
}

// Pure function for wallet status derivation - better performance and testability
const deriveWalletStatus = (
  nwcWallet: any,
  nwcConnectionStatus: boolean | null,
  isWalletConnectedState: boolean
) => {
  const isConfigured = Boolean(nwcWallet);
  if (!isConfigured) {
    return { configured: false, connected: false };
  }

  // Use real NWC connection status if available, otherwise fall back to wallet connected state
  const realWalletStatus =
    nwcConnectionStatus !== null ? nwcConnectionStatus : isWalletConnectedState;
  return { configured: true, connected: realWalletStatus };
};

export const ConnectionStatusIndicator: React.FC<ConnectionStatusIndicatorProps> = ({
  size = 12,
  expandDuration = 3000, // 3 seconds default
  triggerRefresh,
}) => {
  const pillHeight = size + 14; // Make pill taller - increased height
  const router = useRouter();
  const [modalVisible, setModalVisible] = useState(false);
  const [scaleValue] = useState(new Animated.Value(1));
  const [opacityValue] = useState(new Animated.Value(1));
  const [pillWidthValue] = useState(new Animated.Value(size)); // For pill expansion - start with dot size for perfect fit
  const [textOpacityValue] = useState(new Animated.Value(0)); // For text fade in/out
  const [borderOpacityValue] = useState(new Animated.Value(0)); // For border and background fade in/out
  const [isOnline, setIsOnline] = useState(true);
  const [showRelayDetails, setShowRelayDetails] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Refs for managing timers and previous status
  const expandTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevStatus = useRef<ConnectionStatus | null>(null);

  const {
    isWalletConnected: isWalletConnectedState,
    nwcWallet,
    nwcConnectionStatus,
    nwcConnectionError,
    refreshNwcConnectionStatus,
    relayStatuses,
    allRelaysConnected,
    connectedCount,
  } = useNostrService();

  // Network connectivity detection
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOnline(state.isConnected ?? false);
    });
    return () => unsubscribe();
  }, []);

  // Immediate update on mount and app state changes
  useEffect(() => {
    const handleAppStateChange = (nextAppState: string) => {
      if (nextAppState === 'active') {
        console.log('🔄 ConnectionStatusIndicator: App became active - refreshing status (nwc)');
        // Trigger immediate refresh when app becomes active
        refreshNwcConnectionStatus();
      }
    };

    // Initial immediate refresh on mount
    console.log('🔄 ConnectionStatusIndicator: Component mounted - refreshing status (nwc)');
    refreshNwcConnectionStatus();

    // Listen for app state changes
    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription?.remove();
    };
  }, [refreshNwcConnectionStatus]);

  // Handle external refresh triggers (e.g., from homepage focus)
  useEffect(() => {
    if (triggerRefresh !== undefined) {
      console.log('🔄 ConnectionStatusIndicator: External refresh triggered (nwc)');
      refreshNwcConnectionStatus();
    }
  }, [triggerRefresh, refreshNwcConnectionStatus]);

  // Memoized wallet status - eliminates redundant effect and state
  const walletStatus = useMemo(() => {
    return deriveWalletStatus(nwcWallet, nwcConnectionStatus, isWalletConnectedState);
  }, [nwcWallet, nwcConnectionStatus, isWalletConnectedState]);

  // Optimized overall status calculation with fewer dependencies
  const overallConnectionStatus: ConnectionStatus = useMemo(() => {
    if (!isOnline) return 'disconnected';

    const statusChecks = [allRelaysConnected];

    // Only include wallet status if a wallet is actually configured
    if (walletStatus.configured) {
      statusChecks.push(walletStatus.connected);
    }

    const connectedCount = statusChecks.filter(Boolean).length;
    const totalChecks = statusChecks.length;

    if (connectedCount === totalChecks && totalChecks > 0) return 'connected';
    return 'partial';
  }, [isOnline, allRelaysConnected, walletStatus]);

  // Get status text for pill expansion
  const getStatusDisplayText = (status: ConnectionStatus): string => {
    switch (status) {
      case 'connected':
        return 'Connected';
      case 'partial':
        return 'Partial';
      case 'disconnected':
        return !isOnline ? 'Offline' : 'Disconnected';
      default:
        return 'Unknown';
    }
  };

  // Theme colors
  const cardBackgroundColor = useThemeColor({}, 'cardBackground');
  const surfaceSecondaryColor = useThemeColor({}, 'surfaceSecondary');
  const surfaceTertiaryColor = useThemeColor({}, 'surfaceTertiary');
  const textPrimaryColor = useThemeColor({}, 'textPrimary');
  const textSecondaryColor = useThemeColor({}, 'textSecondary');
  const overlayBackgroundColor = useThemeColor({}, 'overlayBackground');
  const statusConnectedColor = useThemeColor({}, 'statusConnected');
  const statusConnectingColor = useThemeColor({}, 'statusConnecting');
  const statusDisconnectedColor = useThemeColor({}, 'statusDisconnected');

  // Use theme-aware status colors
  const getThemeStatusColor = (status: ConnectionStatus): string => {
    switch (status) {
      case 'connected':
        return statusConnectedColor;
      case 'partial':
        return statusConnectingColor;
      case 'disconnected':
        return statusDisconnectedColor;
      default:
        return statusDisconnectedColor;
    }
  };

  // Get softer inner background color
  const getSofterInnerColor = (status: ConnectionStatus): string => {
    switch (status) {
      case 'connected':
        return statusConnectedColor + '20'; // Add 20% opacity
      case 'partial':
        return statusConnectingColor + '20';
      case 'disconnected':
        return statusDisconnectedColor + '20';
      default:
        return statusDisconnectedColor + '20';
    }
  };

  // Handle pill expansion when status changes
  useEffect(() => {
    // Check if status actually changed
    if (prevStatus.current !== null && prevStatus.current !== overallConnectionStatus) {
      // Clear any existing timer
      if (expandTimer.current) {
        clearTimeout(expandTimer.current);
      }

      // Expand the pill
      setIsExpanded(true);
      Animated.parallel([
        Animated.timing(pillWidthValue, {
          toValue: 100, // Expand to fit text - reduced width
          duration: 300,
          useNativeDriver: false,
        }),
        Animated.timing(textOpacityValue, {
          toValue: 1,
          duration: 200,
          useNativeDriver: false, // Changed to false to avoid conflicts
        }),
        // Border opacity animation removed - using transparent color instead
      ]).start();

      // Set timer to collapse back to dot
      expandTimer.current = setTimeout(() => {
        setIsExpanded(false);
        Animated.parallel([
          Animated.timing(pillWidthValue, {
            toValue: size, // Collapse to dot size
            duration: 300,
            useNativeDriver: false,
          }),
          Animated.timing(textOpacityValue, {
            toValue: 0,
            duration: 200,
            useNativeDriver: false, // Changed to false to avoid conflicts
          }),
          // Border opacity animation removed - using transparent color instead
        ]).start();
      }, expandDuration);
    }

    // Update previous status
    prevStatus.current = overallConnectionStatus;

    // Cleanup timer on unmount
    return () => {
      if (expandTimer.current) {
        clearTimeout(expandTimer.current);
      }
    };
  }, [
    overallConnectionStatus,
    expandDuration,
    pillWidthValue,
    textOpacityValue,
    borderOpacityValue,
    pillHeight,
  ]);

  // Optimized animation effect with proper cleanup (for pulsing when not connected)
  useEffect(() => {
    if (overallConnectionStatus !== 'connected' && !isExpanded) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(opacityValue, {
            toValue: 0.3,
            duration: 800,
            useNativeDriver: false, // Changed to false to avoid conflicts
          }),
          Animated.timing(opacityValue, {
            toValue: 1,
            duration: 800,
            useNativeDriver: false, // Changed to false to avoid conflicts
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      opacityValue.setValue(1);
    }
  }, [overallConnectionStatus, opacityValue, isExpanded]);

  // Optimized press handler with better animation sequence
  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scaleValue, {
        toValue: 0.8,
        duration: 100,
        useNativeDriver: false, // Changed to false to avoid conflicts
      }),
      Animated.timing(scaleValue, {
        toValue: 1,
        duration: 100,
        useNativeDriver: false, // Changed to false to avoid conflicts
      }),
    ]).start();

    setModalVisible(true);
  };

  // Pure helper functions - better testability
  const getConnectionIcon = (isConnected: boolean) => {
    return isConnected ? (
      <CheckCircle size={20} color={statusConnectedColor} />
    ) : (
      <XCircle size={20} color={statusDisconnectedColor} />
    );
  };

  const getStatusText = (isConnected: boolean) => {
    return isConnected ? 'Connected' : 'Disconnected';
  };

  // Navigation handlers
  const handleWalletNavigation = () => {
    setModalVisible(false);
    router.push({
      pathname: '/wallet',
      params: { source: 'modal' },
    });
  };

  const handleRelayNavigation = () => {
    setModalVisible(false);
    router.push('/relays');
  };

  return (
    <>
      <TouchableOpacity
        onPress={handlePress}
        style={styles.consistentContainer}
        activeOpacity={0.7}
      >
        <Animated.View
          style={[
            styles.statusPillOuter,
            {
              width: pillWidthValue,
              height: pillHeight, // Always use pill height for consistent UI
              borderRadius: pillHeight / 2,
              opacity: opacityValue,
              transform: [{ scale: scaleValue }],
            },
          ]}
        >
          {/* Animated inner background */}
          <Animated.View
            style={[
              styles.animatedBackground,
              {
                backgroundColor: isExpanded
                  ? getSofterInnerColor(overallConnectionStatus)
                  : 'transparent',
                width: '100%',
                height: '100%',
                borderRadius: pillHeight / 2,
                opacity: 1,
              },
            ]}
          />

          {/* Content container - always visible */}
          <View
            style={[
              styles.contentContainer,
              {
                paddingHorizontal: 8, // Consistent padding for text spacing
              },
            ]}
          >
            {/* Center dot - always visible */}
            <View
              style={[
                styles.centerDot,
                {
                  backgroundColor: getThemeStatusColor(overallConnectionStatus),
                  width: size,
                  height: size,
                  borderRadius: size / 2,
                },
              ]}
            />

            {/* Status text - only visible when expanded */}
            <Animated.Text
              style={[
                styles.statusText,
                {
                  color: getThemeStatusColor(overallConnectionStatus),
                  opacity: textOpacityValue,
                },
              ]}
            >
              {getStatusDisplayText(overallConnectionStatus)}
            </Animated.Text>
          </View>
        </Animated.View>
      </TouchableOpacity>

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={[styles.modalOverlay, { backgroundColor: overlayBackgroundColor }]}>
          {/* Transparent overlay to close modal when tapping outside content */}
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            onPress={() => setModalVisible(false)}
          />
          <View style={[styles.modalContent, { backgroundColor: cardBackgroundColor }]}>
            <View style={styles.modalHeader}>
              <ThemedText style={[styles.modalTitle, { color: textPrimaryColor }]}>
                Connection Status
              </ThemedText>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeButton}>
                <X size={24} color={textSecondaryColor} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={true}>
              {/* Overall Status */}
              <View style={[styles.detailCard, { backgroundColor: surfaceSecondaryColor }]}>
                <View style={styles.detailRow}>
                  <View style={[styles.detailIcon, { backgroundColor: surfaceTertiaryColor }]}>
                    <View
                      style={[
                        styles.overallStatusDot,
                        { backgroundColor: getThemeStatusColor(overallConnectionStatus) },
                      ]}
                    />
                  </View>
                  <View style={styles.detailContent}>
                    <ThemedText style={[styles.detailLabel, { color: textSecondaryColor }]}>
                      Overall Status
                    </ThemedText>
                    <ThemedText style={[styles.detailValue, { color: textPrimaryColor }]}>
                      {!isOnline && 'Device Offline'}
                      {isOnline &&
                        overallConnectionStatus === 'connected' &&
                        'All Systems Connected'}
                      {isOnline &&
                        overallConnectionStatus === 'partial' &&
                        'Connection Issues Detected'}
                      {isOnline &&
                        overallConnectionStatus === 'disconnected' &&
                        'Connection Issues'}
                    </ThemedText>
                  </View>
                </View>
              </View>

              {/* Connection Details - only show when online */}
              {isOnline && (
                <>
                  {/* Relay Status - Separate Rounded Row */}
                  <View style={[styles.detailCard, { backgroundColor: surfaceSecondaryColor }]}>
                    <TouchableOpacity
                      style={styles.detailRow}
                      onPress={handleRelayNavigation}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.detailIcon, { backgroundColor: surfaceTertiaryColor }]}>
                        <Wifi
                          size={20}
                          color={allRelaysConnected ? statusConnectedColor : statusConnectingColor}
                        />
                      </View>
                      <View style={styles.detailContent}>
                        <ThemedText style={[styles.detailLabel, { color: textSecondaryColor }]}>
                          Relay Connections
                        </ThemedText>
                        <ThemedText style={[styles.detailValue, { color: textPrimaryColor }]}>
                          {allRelaysConnected ? 'All Connected' : 'Partial'}
                        </ThemedText>
                        <ThemedText
                          style={[styles.detailDescription, { color: textSecondaryColor }]}
                        >
                          {relayStatuses.length > 0
                            ? (() => {
                                const connected = relayStatuses.filter(r => r.connected).length;
                                const total = relayStatuses.length;
                                return `${connected}/${total} relays connected`;
                              })()
                            : 'Nostr relay connections for messaging'}
                        </ThemedText>

                        {/* More Info Toggle */}
                        {relayStatuses.length > 0 && (
                          <TouchableOpacity
                            style={styles.moreInfoButton}
                            onPress={e => {
                              e.stopPropagation(); // Prevent parent row navigation
                              setShowRelayDetails(!showRelayDetails);
                            }}
                          >
                            <ThemedText style={[styles.moreInfoText, { color: textPrimaryColor }]}>
                              {showRelayDetails ? 'Less info' : 'More info'}
                            </ThemedText>
                            <ThemedText
                              style={[
                                styles.moreInfoArrow,
                                {
                                  color: textPrimaryColor,
                                  transform: [{ rotate: showRelayDetails ? '180deg' : '0deg' }],
                                },
                              ]}
                            >
                              ▼
                            </ThemedText>
                          </TouchableOpacity>
                        )}
                      </View>
                      <View style={styles.detailRight}>
                        {getConnectionIcon(allRelaysConnected)}
                      </View>
                    </TouchableOpacity>

                    {/* Expandable Relay Details */}
                    {showRelayDetails && relayStatuses.length > 0 && (
                      <View style={styles.expandedRelayDetails}>
                        <View style={styles.compactRelayGrid}>
                          {relayStatuses
                            .slice() // Create a copy to avoid mutating original array
                            .sort((a, b) => a.url.localeCompare(b.url)) // Sort by URL for consistent order
                            .map((relay: RelayInfo) => {
                              // Get status color
                              const getStatusColor = (status: string) => {
                                switch (status) {
                                  case 'Connected':
                                    return statusConnectedColor;
                                  case 'Connecting':
                                  case 'Pending':
                                  case 'Initialized':
                                    return statusConnectingColor;
                                  case 'Disconnected':
                                  case 'Terminated':
                                  case 'Banned':
                                    return statusDisconnectedColor;
                                  default:
                                    return statusDisconnectedColor;
                                }
                              };

                              // Get short relay name
                              const getShortRelayName = (url: string) => {
                                try {
                                  const hostname = new URL(url).hostname;
                                  return hostname
                                    .replace('relay.', '')
                                    .replace('.', '')
                                    .slice(0, 8);
                                } catch {
                                  return url.slice(0, 8);
                                }
                              };

                              return (
                                <View
                                  key={relay.url}
                                  style={[
                                    styles.detailedRelayItem,
                                    { backgroundColor: surfaceTertiaryColor },
                                  ]}
                                >
                                  <View style={styles.detailedRelayHeader}>
                                    <ThemedText
                                      style={[
                                        styles.detailedRelayName,
                                        { color: textPrimaryColor },
                                      ]}
                                    >
                                      {getShortRelayName(relay.url)}
                                    </ThemedText>
                                    <ThemedText
                                      style={[
                                        styles.detailedRelayStatus,
                                        { color: getStatusColor(relay.status) },
                                      ]}
                                    >
                                      {relay.status}
                                    </ThemedText>
                                  </View>
                                  <ThemedText
                                    style={[styles.detailedRelayUrl, { color: textSecondaryColor }]}
                                  >
                                    {relay.url}
                                  </ThemedText>
                                </View>
                              );
                            })}
                        </View>
                      </View>
                    )}
                  </View>

                  {/* Wallet - Separate Rounded Row */}
                  <View style={[styles.detailCard, { backgroundColor: surfaceSecondaryColor }]}>
                    <TouchableOpacity
                      style={styles.detailRow}
                      onPress={handleWalletNavigation}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.detailIcon, { backgroundColor: surfaceTertiaryColor }]}>
                        <Wallet
                          size={20}
                          color={
                            walletStatus.configured
                              ? walletStatus.connected
                                ? statusConnectedColor
                                : statusDisconnectedColor
                              : textSecondaryColor
                          }
                        />
                      </View>
                      <View style={styles.detailContent}>
                        <ThemedText style={[styles.detailLabel, { color: textSecondaryColor }]}>
                          Wallet Connection
                        </ThemedText>
                        <ThemedText style={[styles.detailValue, { color: textPrimaryColor }]}>
                          {walletStatus.configured
                            ? getStatusText(walletStatus.connected)
                            : 'Not configured'}
                        </ThemedText>
                        <ThemedText
                          style={[styles.detailDescription, { color: textSecondaryColor }]}
                        >
                          {walletStatus.configured
                            ? nwcConnectionError || 'NWC wallet configured'
                            : 'No wallet configured in settings'}
                        </ThemedText>
                      </View>
                      <View style={styles.detailRight}>
                        {walletStatus.configured ? (
                          getConnectionIcon(walletStatus.connected)
                        ) : (
                          <AlertCircle size={20} color={textSecondaryColor} />
                        )}
                      </View>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 8,
  },
  containerIdle: {
    // Absolutely no padding or margin in idle mode
  },
  consistentContainer: {
    // Add padding to increase touchable area
    padding: 8,
  },
  statusDot: {
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
  statusPill: {
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
    overflow: 'hidden',
  },
  statusPillOuter: {
    position: 'relative',
    // Shadow removed to prevent visual shifts
  },
  statusPillInner: {
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: 8,
    gap: 6,
  },
  animatedBorder: {
    position: 'absolute',
    // borderWidth handled dynamically
  },
  animatedBackground: {
    position: 'absolute',
  },
  contentContainer: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  centerDot: {
    // Basic dot styling - colors handled dynamically
  },
  modalOverlay: {
    flex: 1,
    // backgroundColor handled by theme (overlayBackground)
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    // backgroundColor handled by theme (cardBackground)
    borderRadius: 12,
    padding: 20,
    width: '90%',
    maxWidth: 380,
    maxHeight: '70%', // Increased to prevent unnecessary scrolling when dropdown is closed
    display: 'flex',
    flexDirection: 'column',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    // color handled by theme (textPrimary)
  },
  closeButton: {
    padding: 4,
  },
  detailCard: {
    // backgroundColor handled by theme
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    minHeight: 80,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
  },
  detailIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    // backgroundColor handled by theme (skeletonHighlight)
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 14,
    // color handled by theme (textSecondary)
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 16,
    // color handled by theme (textPrimary)
    fontWeight: '500',
  },
  detailDescription: {
    fontSize: 14,
    // color handled by theme (textSecondary)
    marginTop: 2,
  },
  detailRight: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  separator: {
    height: 1,
    // backgroundColor handled by theme (borderPrimary)
    marginVertical: 8,
  },
  overallStatusDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  moreInfoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingVertical: 4,
  },
  moreInfoText: {
    fontSize: 12,
    // color handled by theme (textPrimary)
    fontWeight: '500',
    marginRight: 6,
  },
  moreInfoArrow: {
    fontSize: 10,
    // color handled by theme (textPrimary)
  },
  expandedRelayDetails: {
    marginTop: 12,
    paddingLeft: 16,
  },
  compactRelayGrid: {
    flexDirection: 'column',
    gap: 4,
  },
  detailedRelayItem: {
    // backgroundColor handled by theme
    padding: 12,
    borderRadius: 12,
    marginBottom: 6,
  },
  detailedRelayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  detailedRelayName: {
    fontSize: 13,
    // color handled by theme (textPrimary)
    fontWeight: '600',
  },
  detailedRelayStatus: {
    fontSize: 11,
    fontWeight: '500',
  },
  detailedRelayUrl: {
    fontSize: 10,
    // color handled by theme (textSecondary)
  },
  relayUrl: {
    fontSize: 12,
    // color handled by theme (textSecondary)
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    width: '90%',
    maxHeight: '80%',
    borderRadius: 12,
    padding: 20,
    elevation: 5,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
});
