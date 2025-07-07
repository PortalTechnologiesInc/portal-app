import React, { useState, useEffect } from 'react';
import { StyleSheet, TouchableOpacity, BackHandler, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { usePendingRequests } from '@/context/PendingRequestsContext';
import { parseKeyHandshakeUrl } from 'portal-app-lib';
import { useNostrService } from '@/context/NostrServiceContext';
import { useThemeColor } from '@/hooks/useThemeColor';
import { Flashlight, FlashlightOff, ArrowLeft } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';

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

  // Determine the mode - default to 'main' if no mode is specified
  const mode = (params.mode as string) || 'main';
  const isWalletMode = mode === 'wallet';

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

  const handleBackNavigation = () => {
    if (isWalletMode) {
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
      // Replace navigation stack to return to tabs cleanly
      router.replace('/(tabs)');
    }
  };

  const validateQRCode = (data: string): { isValid: boolean; error?: string } => {
    if (isWalletMode) {
      // Wallet mode: only accept nostr+walletconnect:// URLs
      if (!data.startsWith('nostr+walletconnect://')) {
        return {
          isValid: false,
          error: 'Invalid wallet QR code. Please scan a valid wallet connection QR code.',
        };
      }
    } else {
      // Main mode: validate that parseKeyHandshakeUrl can handle it
      try {
        parseKeyHandshakeUrl(data);
      } catch (error) {
        return {
          isValid: false,
          error: 'Invalid QR code. Please scan a valid Portal authentication QR code.',
        };
      }
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

  const handleBarCodeScanned = (result: BarcodeResult) => {
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

    if (isWalletMode) {
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
    } else {
      // Main QR handling - process the URL
      try {
        const parsedUrl = parseKeyHandshakeUrl(data);
        showSkeletonLoader(parsedUrl);
        nostrService.sendKeyHandshake(parsedUrl);
      } catch (error) {
        console.error('Failed to process QR code:', error);
        showErrorMessage('Failed to process QR code. Please try again.');
        return;
      }

      // Navigate back with clean history after a brief delay for UX
      setTimeout(() => {
        router.replace('/(tabs)');
      }, 300);
    }
  };

  const getHeaderTitle = () => {
    return isWalletMode ? 'Scan Wallet QR' : 'Scan QR Code';
  };

  const getInstructionText = () => {
    return isWalletMode 
      ? 'Point your camera at a wallet connection QR code' 
      : 'Point your camera at a Portal authentication QR code';
  };

  const renderFlashIcon = () => {
    if (isWalletMode) {
      return enableTorch ? (
        <Flashlight size={24} color={buttonPrimaryText} />
      ) : (
        <FlashlightOff size={24} color={buttonPrimaryText} />
      );
    } else {
      return <Ionicons name={enableTorch ? 'flash' : 'flash-off'} size={24} color={buttonPrimaryText} />;
    }
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
                Camera Permission Required
              </ThemedText>
              <ThemedText style={[styles.messageText, { color: textSecondary }]}>
                We need access to your camera to scan QR codes
              </ThemedText>
              <TouchableOpacity
                style={[styles.permissionButton, { backgroundColor: buttonPrimary }]}
                onPress={requestPermission}
              >
                <ThemedText style={[styles.permissionButtonText, { color: buttonPrimaryText }]}>
                  Grant Permission
                </ThemedText>
              </TouchableOpacity>
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
                <View style={[styles.scannerCorner, styles.topLeft, { 
                  borderColor: showError ? statusErrorColor : (scanned ? statusConnectedColor : tintColor) 
                }]} />
                <View style={[styles.scannerCorner, styles.topRight, { 
                  borderColor: showError ? statusErrorColor : (scanned ? statusConnectedColor : tintColor) 
                }]} />
                <View style={[styles.scannerCorner, styles.bottomLeft, { 
                  borderColor: showError ? statusErrorColor : (scanned ? statusConnectedColor : tintColor) 
                }]} />
                <View style={[styles.scannerCorner, styles.bottomRight, { 
                  borderColor: showError ? statusErrorColor : (scanned ? statusConnectedColor : tintColor) 
                }]} />
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
              <ThemedText style={[styles.statusText, { 
                color: showError ? statusErrorColor : statusConnectedColor 
              }]}>
                {showError ? errorMessage : (isWalletMode ? 'Wallet QR Scanned!' : 'QR Code Scanned!')}
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
