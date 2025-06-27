import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, BackHandler } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { usePendingRequests } from '@/context/PendingRequestsContext';
import { parseKeyHandshakeUrl } from 'portal-app-lib';
import { useNostrService } from '@/context/NostrServiceContext';
import { useThemeColor } from '@/hooks/useThemeColor';

// Define the type for the barcode scanner result
type BarcodeResult = {
  type: string;
  data: string;
};

export default function QRScannerScreen() {
  const [scanned, setScanned] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [enableTorch, setEnableTorch] = useState(false);
  const { showSkeletonLoader } = usePendingRequests();
  const nostrService = useNostrService();

  // Theme colors
  const backgroundColor = useThemeColor({}, 'background');
  const textPrimary = useThemeColor({}, 'textPrimary');
  const tintColor = useThemeColor({}, 'tint');
  const buttonPrimary = useThemeColor({}, 'buttonPrimary');
  const buttonPrimaryText = useThemeColor({}, 'buttonPrimaryText');

  // Handle hardware back button
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      // Replace navigation stack to return to tabs cleanly
      router.replace('/(tabs)');
      return true;
    });

    return () => backHandler.remove();
  }, []);

  const toggleTorch = () => {
    setEnableTorch(!enableTorch);
  };

  const handleBarCodeScanned = (result: BarcodeResult) => {
    // Prevent multiple scans
    if (scanned) return;

    const { type, data } = result;
    setScanned(true);
    console.log(`Bar code with type ${type} and data ${data} has been scanned!`);

    try {
      // Show the skeleton loader
      const parsedUrl = parseKeyHandshakeUrl(data);
      showSkeletonLoader(parsedUrl);
      nostrService.sendKeyHandshake(parsedUrl);
    } catch (error) {
      console.error('Failed to process QR code:', error);
    }

    // Navigate back with clean history after a brief delay for UX
    setTimeout(() => {
      router.replace('/(tabs)');
    }, 300);
  };

  if (!permission) {
    // Camera permissions are still loading
    return (
      <View style={[styles.container, { backgroundColor }]}>
        <Text style={[styles.instructions, { color: textPrimary }]}>
          Requesting camera permission...
        </Text>
      </View>
    );
  }

  if (!permission.granted) {
    // Camera permissions are not granted yet
    return (
      <View style={[styles.container, { backgroundColor }]}>
        <Text style={[styles.instructions, { color: textPrimary }]}>
          We need your permission to use the camera
        </Text>
        <TouchableOpacity
          style={[styles.permissionButton, { backgroundColor: buttonPrimary }]}
          onPress={requestPermission}
        >
          <Text style={[styles.permissionButtonText, { color: buttonPrimaryText }]}>
            Grant Permission
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={styles.camera}
        facing="back"
        enableTorch={enableTorch}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        barcodeScannerSettings={{
          barcodeTypes: ['qr'],
        }}
      >
        <View style={styles.overlay}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.replace('/(tabs)')}>
            <Ionicons name="arrow-back" size={28} color="white" />
          </TouchableOpacity>
          <View style={styles.upperSection} />
          <View style={styles.middleSection}>
            <View style={styles.leftSection} />
            <View style={styles.scanner}>
              <View style={[styles.scannerCorner, { borderColor: tintColor }]} />
              <View style={[styles.scannerCorner, styles.topRight, { borderColor: tintColor }]} />
              <View
                style={[styles.scannerCorner, styles.bottomRight, { borderColor: tintColor }]}
              />
              <View style={[styles.scannerCorner, styles.bottomLeft, { borderColor: tintColor }]} />
            </View>
            <View style={styles.rightSection} />
          </View>
          <View style={styles.lowerSection}>
            <TouchableOpacity style={styles.flashButton} onPress={toggleTorch}>
              <Ionicons name={enableTorch ? 'flash' : 'flash-off'} size={24} color="white" />
            </TouchableOpacity>
            <Text style={styles.instructions}>Position QR code in the scanner</Text>
          </View>
        </View>
      </CameraView>

      {scanned && (
        <View style={styles.scannedOverlay}>
          <Text style={[styles.scannedText, { color: tintColor }]}>QR Code Scanned!</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  camera: {
    flex: 1,
    width: '100%',
  },
  overlay: {
    flex: 1,
  },
  upperSection: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  middleSection: {
    flexDirection: 'row',
    height: 250,
  },
  leftSection: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  scanner: {
    width: 250,
    height: 250,
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  scannerCorner: {
    position: 'absolute',
    width: 20,
    height: 20,
    // borderColor handled by theme
    borderWidth: 3,
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  topRight: {
    right: 0,
    top: 0,
    left: undefined,
    borderLeftWidth: 0,
    borderRightWidth: 3,
    borderBottomWidth: 0,
  },
  bottomRight: {
    right: 0,
    bottom: 0,
    top: undefined,
    left: undefined,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderRightWidth: 3,
    borderBottomWidth: 3,
  },
  bottomLeft: {
    left: 0,
    bottom: 0,
    top: undefined,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomWidth: 3,
  },
  rightSection: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  lowerSection: {
    flex: 2,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 30,
  },
  instructions: {
    color: 'white',
    fontSize: 16,
    marginTop: 20,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  flashButton: {
    padding: 10,
    borderRadius: 50,
    backgroundColor: 'rgba(50, 50, 50, 0.8)',
  },
  scannedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scannedText: {
    // color handled by theme
    fontSize: 22,
    fontWeight: 'bold',
  },
  permissionButton: {
    marginTop: 20,
    padding: 12,
    // backgroundColor handled by theme
    borderRadius: 8,
  },
  permissionButtonText: {
    // color handled by theme
    fontWeight: 'bold',
    fontSize: 16,
  },
  backButton: {
    position: 'absolute',
    top: 50,
    left: 20,
    zIndex: 10,
    padding: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 50,
  },
});
