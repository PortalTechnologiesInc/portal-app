import React, { useState, useEffect } from 'react';
import { StyleSheet, TouchableOpacity, BackHandler, View, Linking, Platform, Alert } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { usePendingRequests } from '@/context/PendingRequestsContext';
import { parseCashuToken, parseKeyHandshakeUrl } from 'portal-app-lib';
import { useNostrService } from '@/context/NostrServiceContext';
import { useThemeColor } from '@/hooks/useThemeColor';
import { ArrowLeft, Settings } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useECash } from '@/context/ECashContext';
import { useDatabaseContext } from '@/context/DatabaseContext';

// Define the type for the barcode scanner result
type BarcodeResult = {
  type: string;
  data: string;
};

export default function QRScannerScreen() {
  const [scanned, setScanned] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [enableTorch, setEnableTorch] = useState(false);
  const [showError, setShowError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const { showSkeletonLoader } = usePendingRequests();
  const nostrService = useNostrService();
  const params = useLocalSearchParams();
  const eCash = useECash();
  const { executeOperation, executeOnNostr } = useDatabaseContext();

  // Determine the mode - default to 'main' if no mode is specified
  const mode = (params.mode as string) || 'main';

  // Theme colors
  const backgroundColor = useThemeColor({}, 'background');
  const cardBackgroundColor = useThemeColor({}, 'cardBackground');
  const textPrimary = useThemeColor({}, 'textPrimary');
  const textSecondary = useThemeColor({}, 'textSecondary');
  const tintColor = useThemeColor({}, 'tint');
  const buttonPrimary = useThemeColor({}, 'buttonPrimary');
  const buttonPrimaryText = useThemeColor({}, 'buttonPrimaryText');
  const statusErrorColor = useThemeColor({}, 'statusError');
  const statusConnectedColor = useThemeColor({}, 'statusConnected');

  // Automatically request camera permission when component mounts
  useEffect(() => {
    if (!permission) {
      // Permission object not ready yet
      return;
    }

    console.log('Permission status:', permission.status, 'granted:', permission.granted, 'canAskAgain:', permission.canAskAgain);

    if (!permission.granted) {
      if (permission.status === 'undetermined') {
        // First time - automatically request permission with small delay
        console.log('Requesting permission automatically (undetermined)...');
        setTimeout(() => {
          requestPermission();
        }, 100);
      } else if (permission.canAskAgain) {
        // Previously denied but can ask again - automatically request
        console.log('Requesting permission automatically (can ask again)...');
        setTimeout(() => {
          requestPermission();
        }, 100);
      }
      // If can't ask again, we'll show the settings button (handled in render)
    }
  }, [permission, requestPermission]);

  // Handle hardware back button
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      handleBackNavigation();
      return true;
    });

    return () => backHandler.remove();
  }, []);

  const toggleTorch = () => {
    setEnableTorch(!enableTorch);
  };

  const openSettings = async () => {
    await Linking.openSettings();
  };

  const handleBackNavigation = () => {
    if (mode === 'wallet') {
      // Check if we came from wallet management
      if (params.returnToWallet === 'true') {
        router.back(); // Return to wallet management
      } else {
        // Return to original source (settings)
        router.replace({
          pathname: '/(tabs)/Settings',
        });
      }
    } else {
      // Use back() instead of replace() to maintain proper navigation stack
      // Since we came from homepage via push(), we should go back via back()
      router.back();
    }
  };

  const validateQRCode = (data: string): { isValid: boolean; error?: string } => {
    console.warn(mode);
    switch (mode) {
      case 'wallet':
        // Wallet mode: only accept nostr+walletconnect:// URLs
        if (!data.startsWith('nostr+walletconnect://')) {
          return {
            isValid: false,
            error: 'Invalid wallet QR code. Please scan a valid wallet connection QR code.',
          };
        }
        break;
      case 'main':
        // Main mode: validate that parseKeyHandshakeUrl can handle it
        try {
          parseKeyHandshakeUrl(data);
        } catch (error) {
          return {
            isValid: false,
            error: 'Invalid QR code. Please scan a valid Portal authentication QR code.',
          };
        }
        break;
      case 'ticket':
        if (!data.startsWith('portal-cashu://')) {
          return {
            isValid: false,
            error: 'Invalid ticket QR code. Please scan a valid ticket QR code.',
          };
        }
        break;
    }
    return { isValid: true };
  };

  const showErrorMessage = (message: string) => {
    setErrorMessage(message);
    setShowError(true);

    // Hide error after 3 seconds and allow scanning again
    setTimeout(() => {
      setShowError(false);
      setScanned(false);
    }, 3000);
  };

  const handleBarCodeScanned = async (result: BarcodeResult) => {
    // Prevent multiple scans
    if (scanned) return;

    const { type, data } = result;
    setScanned(true);
    console.log(`Bar code with type ${type} and data ${data} has been scanned!`);

    // Validate the QR code first
    const validation = validateQRCode(data);
    if (!validation.isValid) {
      showErrorMessage(validation.error || 'Invalid QR code');
      return;
    }

    switch (mode) {
      case 'wallet':
        // Wallet QR handling - navigate to wallet with scanned URL
        const timestamp = Date.now();
        setTimeout(() => {
          router.replace({
            pathname: '/wallet',
            params: {
              scannedUrl: data,
              source: params.source || 'settings',
              returnToWallet: params.returnToWallet || 'false',
              timestamp: timestamp.toString(),
            },
          });
        }, 300);
        break;

      case 'ticket':
        // Navigate back with clean history after a brief delay for UX
        setTimeout(() => {
          router.back();
        }, 300);

        let token;
        let tokenInfo;
        let wallet;

        try {
          token = data.replace('portal-cashu://', '');
          tokenInfo = await parseCashuToken(token);
          wallet = await eCash.addWallet(tokenInfo.mintUrl, tokenInfo.unit);
        } catch (error) {
          console.error('Failed to process ticket QR code:', error);
          Alert.alert(
            'Ticket Processing Error',
            'There was a problem processing the ticket. Please try again or contact support if the problem persists.'
          );
          return;
        }


        try {
          await wallet.receiveToken(token);

          await executeOnNostr(async (db) => {
            let mintsList = await db.readMints();

            // Convert to Set to prevent duplicates, then back to array
            const mintsSet = new Set([tokenInfo.mintUrl, ...mintsList]);
            mintsList = Array.from(mintsSet);

            db.storeMints(mintsList);
          });


          const { globalEvents } = await import('@/utils/index');
          globalEvents.emit('walletBalancesChanged', {
            mintUrl: tokenInfo.mintUrl,
            unit: tokenInfo.unit.toLowerCase(),
          });
          console.log('walletBalancesChanged event emitted from QR scanner');

          // Record activity for token receipt
          try {
            // For Cashu direct, use mint URL as service identifier
            const serviceKey = tokenInfo.mintUrl;
            const unitInfo = await wallet.getUnitInfo();
            const ticketTitle = unitInfo?.title || wallet.unit();

            // Add activity to database using ActivitiesContext directly
            const activity = {
              type: 'ticket_received' as const,
              service_key: serviceKey,
              service_name: ticketTitle,
              detail: ticketTitle,
              date: new Date(),
              amount: tokenInfo.amount ? Number(tokenInfo.amount) : null, // Store actual number of tickets, not divided by 1000
              currency: null,
              request_id: `cashu-direct-${Date.now()}`,
              subscription_id: null,
              status: 'neutral' as 'neutral',
              converted_amount: null,
              converted_currency: null,
            };
            console.warn(3);

            // Use database service for activity recording
            const activityId = await executeOperation(db => db.addActivity(activity), null);

            if (activityId) {
              console.log('Activity added to database with ID:', activityId);
              // Emit event for UI updates
              globalEvents.emit('activityAdded', activity);
              console.log('activityAdded event emitted');
              console.log('Cashu direct activity recorded successfully');
            } else {
              console.warn('Failed to record Cashu token activity due to database issues');
            }
          } catch (activityError) {
            console.error('Error recording Cashu direct activity:', activityError);
          }

          Alert.alert(
            'Ticket Added Successfully!',
            `Great! You've received a ${tokenInfo.unit} ticket from ${tokenInfo.mintUrl}.`
          );
        } catch (error) {
          console.error('Failed to process ticket QR code:', error);
          Alert.alert(
            'Ticket Processing Error',
            'There was a problem redeeming the ticket. The ticket may have already been used.'
          );
          return;
        }
        break;

      default:
        // Main QR handling - process the URL
        try {
          const parsedUrl = parseKeyHandshakeUrl(data);
          showSkeletonLoader(parsedUrl);
          await nostrService.sendKeyHandshake(parsedUrl);
        } catch (error) {
          console.error('Failed to process QR code:', error);
          showErrorMessage('Failed to process QR code. Please try again.');
          return;
        }

        // Navigate back with clean history after a brief delay for UX
        setTimeout(() => {
          router.back();
        }, 300);
        break;
    }
  };

  const getHeaderTitle = () => {
    switch (mode) {
      case 'wallet': return 'Scan Wallet QR';
      case 'ticket': return 'Scan Ticket QR';
      default: return 'Scan Authentication QR';
    }
  };

  const getInstructionText = () => {
    switch (mode) {
      case 'wallet': return 'Point your camera at a wallet connection QR code';
      case 'ticket': return 'Point your camera at a ticket QR code';
      default: return 'Point your camera at a Portal authentication QR code';
    }
  };

  const renderFlashIcon = () => {
    return (
      <Ionicons name={enableTorch ? 'flash' : 'flash-off'} size={24} color={buttonPrimaryText} />
    );
  };

  if (!permission) {
    // Camera permissions are still loading
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor }]} edges={['top']}>
        <ThemedView style={styles.container}>
          <ThemedView style={styles.header}>
            <TouchableOpacity onPress={handleBackNavigation} style={styles.backButton}>
              <ArrowLeft size={20} color={textPrimary} />
            </TouchableOpacity>
            <ThemedText style={[styles.headerText, { color: textPrimary }]}>
              {getHeaderTitle()}
            </ThemedText>
          </ThemedView>
          <ThemedView style={styles.content}>
            <View style={[styles.messageCard, { backgroundColor: cardBackgroundColor }]}>
              <ThemedText style={[styles.messageText, { color: textPrimary }]}>
                Requesting camera permission...
              </ThemedText>
            </View>
          </ThemedView>
        </ThemedView>
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    // Camera permissions are not granted yet
    const wasAsked = permission?.status !== 'undetermined';
    const canAskAgain = permission?.canAskAgain !== false;

    // If permission was denied and can't ask again, show settings option
    if (wasAsked && !canAskAgain) {
      return (
        <SafeAreaView style={[styles.safeArea, { backgroundColor }]} edges={['top']}>
          <ThemedView style={styles.container}>
            <ThemedView style={styles.header}>
              <TouchableOpacity onPress={handleBackNavigation} style={styles.backButton}>
                <ArrowLeft size={20} color={textPrimary} />
              </TouchableOpacity>
              <ThemedText style={[styles.headerText, { color: textPrimary }]}>
                {getHeaderTitle()}
              </ThemedText>
            </ThemedView>
            <ThemedView style={styles.content}>
              <View style={[styles.messageCard, { backgroundColor: cardBackgroundColor }]}>
                <ThemedText style={[styles.messageTitle, { color: textPrimary }]}>
                  Camera Access Required
                </ThemedText>
                <ThemedText style={[styles.messageText, { color: textSecondary }]}>
                  Camera access was denied. If you wish to use the QR scanner, please enable camera permissions in your device settings.
                </ThemedText>
                {Platform.OS !== 'ios' && (
                  <TouchableOpacity
                    style={[styles.permissionButton, { backgroundColor: buttonPrimary }]}
                    onPress={openSettings}
                  >
                    <View style={styles.buttonContent}>
                      <Settings size={16} color={buttonPrimaryText} style={styles.buttonIcon} />
                      <ThemedText style={[styles.permissionButtonText, { color: buttonPrimaryText }]}>
                        Open Settings
                      </ThemedText>
                    </View>
                  </TouchableOpacity>
                )}
              </View>
            </ThemedView>
          </ThemedView>
        </SafeAreaView>
      );
    }

    // For all other cases (undetermined or can ask again), show loading state
    // The permission request will be triggered automatically by useEffect
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor }]} edges={['top']}>
        <ThemedView style={styles.container}>
          <ThemedView style={styles.header}>
            <TouchableOpacity onPress={handleBackNavigation} style={styles.backButton}>
              <ArrowLeft size={20} color={textPrimary} />
            </TouchableOpacity>
            <ThemedText style={[styles.headerText, { color: textPrimary }]}>
              {getHeaderTitle()}
            </ThemedText>
          </ThemedView>
          <ThemedView style={styles.content}>
            <View style={[styles.messageCard, { backgroundColor: cardBackgroundColor }]}>
              <ThemedText style={[styles.messageTitle, { color: textPrimary }]}>
                Requesting Camera Access...
              </ThemedText>
              <ThemedText style={[styles.messageText, { color: textSecondary }]}>
                Please allow camera access in the permission dialog to scan QR codes.
              </ThemedText>
            </View>
          </ThemedView>
        </ThemedView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]} edges={['top']}>
      <ThemedView style={styles.container}>
        {/* Header */}
        <ThemedView style={styles.header}>
          <TouchableOpacity onPress={handleBackNavigation} style={styles.backButton}>
            <ArrowLeft size={20} color={textPrimary} />
          </TouchableOpacity>
          <ThemedText style={[styles.headerText, { color: textPrimary }]}>
            {getHeaderTitle()}
          </ThemedText>
        </ThemedView>

        {/* Camera Container */}
        <View style={styles.cameraContainer}>
          <CameraView
            style={styles.camera}
            facing="back"
            enableTorch={enableTorch}
            onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
            barcodeScannerSettings={{
              barcodeTypes: ['qr'],
            }}
          >
            {/* Camera Overlay */}
            <View style={styles.cameraOverlay}>
              {/* Scanner Frame */}
              <View style={styles.scannerFrame}>
                <View
                  style={[
                    styles.scannerCorner,
                    styles.topLeft,
                    {
                      borderColor: showError
                        ? statusErrorColor
                        : scanned
                          ? statusConnectedColor
                          : tintColor,
                    },
                  ]}
                />
                <View
                  style={[
                    styles.scannerCorner,
                    styles.topRight,
                    {
                      borderColor: showError
                        ? statusErrorColor
                        : scanned
                          ? statusConnectedColor
                          : tintColor,
                    },
                  ]}
                />
                <View
                  style={[
                    styles.scannerCorner,
                    styles.bottomLeft,
                    {
                      borderColor: showError
                        ? statusErrorColor
                        : scanned
                          ? statusConnectedColor
                          : tintColor,
                    },
                  ]}
                />
                <View
                  style={[
                    styles.scannerCorner,
                    styles.bottomRight,
                    {
                      borderColor: showError
                        ? statusErrorColor
                        : scanned
                          ? statusConnectedColor
                          : tintColor,
                    },
                  ]}
                />
              </View>
            </View>
          </CameraView>
        </View>

        {/* Bottom Controls */}
        <ThemedView style={styles.bottomControls}>
          <View style={[styles.controlsCard, { backgroundColor: cardBackgroundColor }]}>
            <ThemedText style={[styles.instructionText, { color: textSecondary }]}>
              {getInstructionText()}
            </ThemedText>

            <TouchableOpacity
              style={[styles.flashButton, { backgroundColor: buttonPrimary }]}
              onPress={toggleTorch}
            >
              {renderFlashIcon()}
              <ThemedText style={[styles.flashButtonText, { color: buttonPrimaryText }]}>
                {enableTorch ? 'Turn Off Flash' : 'Turn On Flash'}
              </ThemedText>
            </TouchableOpacity>
          </View>
        </ThemedView>

        {/* Status Overlay */}
        {(scanned || showError) && (
          <View style={styles.statusOverlay}>
            <View style={[styles.statusCard, { backgroundColor: cardBackgroundColor }]}>
              <ThemedText
                style={[
                  styles.statusText,
                  {
                    color: showError ? statusErrorColor : statusConnectedColor,
                  },
                ]}
              >
                {
                  showError
                    ? errorMessage
                    : 'QR Code Scanned!'
                }
              </ThemedText>
            </View>
          </View>
        )}
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
    paddingTop: 10,
    paddingBottom: 20,
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
    justifyContent: 'center',
  },
  messageCard: {
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  messageTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
  },
  messageText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },
  permissionButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    minWidth: 150,
    alignItems: 'center',
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  buttonIcon: {
    marginRight: 8,
  },
  permissionButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  cameraContainer: {
    flex: 1,
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 20,
    overflow: 'hidden',
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scannerFrame: {
    width: 250,
    height: 250,
    position: 'relative',
  },
  scannerCorner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderWidth: 4,
  },
  topLeft: {
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  topRight: {
    top: 0,
    right: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderLeftWidth: 0,
    borderTopWidth: 0,
  },
  bottomControls: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  controlsCard: {
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
  },
  instructionText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 24,
  },
  flashButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    minWidth: 160,
    justifyContent: 'center',
  },
  flashButtonText: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  statusOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  statusCard: {
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    maxWidth: 300,
  },
  statusText: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
});
