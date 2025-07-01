import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Colors } from '@/constants/Colors';
import { router, useLocalSearchParams } from 'expo-router';
import { Flashlight, FlashlightOff } from 'lucide-react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColor } from '@/hooks/useThemeColor';

// Define the type for the barcode scanner result
type BarcodeResult = {
  type: string;
  data: string;
};

export default function WalletQRScannerScreen() {
  const [scanned, setScanned] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [enableTorch, setEnableTorch] = useState(false);
  const params = useLocalSearchParams();

  // Theme colors
  const backgroundColor = useThemeColor({}, 'background');
  const textPrimary = useThemeColor({}, 'textPrimary');
  const tintColor = useThemeColor({}, 'tint');
  const buttonPrimary = useThemeColor({}, 'buttonPrimary');
  const buttonPrimaryText = useThemeColor({}, 'buttonPrimaryText');

  const toggleTorch = () => {
    setEnableTorch(!enableTorch);
  };

  const handleBarCodeScanned = (result: BarcodeResult) => {
    if (scanned) return;

    const { data } = result;
    setScanned(true);

    // Add a unique timestamp to ensure URL is processed as new
    const timestamp = Date.now();

    // Use replace instead of push to remove the QR scanner from navigation history
    setTimeout(() => {
      router.replace({
        pathname: '/wallet',
        params: {
          scannedUrl: data,
          source: params.source || 'settings', // Maintain source parameter
          returnToWallet: params.returnToWallet || 'false', // Parameter to control navigation after confirmation
          timestamp: timestamp.toString(), // Add timestamp to ensure URL is unique each scan
        },
      });
    }, 300); // Reduced timeout to minimize lag
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
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => {
              // Check if we came from wallet management
              if (params.returnToWallet === 'true') {
                router.back(); // Return to wallet management
              } else {
                // Return to original source (settings)
                router.replace({
                  pathname: '/(tabs)/Settings',
                });
              }
            }}
          >
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
              {enableTorch ? (
                <Flashlight size={24} color="white" />
              ) : (
                <FlashlightOff size={24} color="white" />
              )}
            </TouchableOpacity>
            <Text style={styles.instructions}>Scan a wallet QR code</Text>
          </View>
        </View>
      </CameraView>

      {scanned && (
        <View style={styles.scannedOverlay}>
          <Text style={[styles.scannedText, { color: tintColor }]}>Wallet URL Scanned!</Text>
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
    borderRightWidth: 3,
    borderTopWidth: 0,
  },
  bottomLeft: {
    left: 0,
    bottom: 0,
    top: undefined,
    borderRightWidth: 0,
    borderTopWidth: 0,
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
  backButton: {
    position: 'absolute',
    top: 50,
    left: 20,
    zIndex: 10,
    padding: 8,
  },
  flashButton: {
    padding: 10,
    borderRadius: 50,
    backgroundColor: 'rgba(50, 50, 50, 0.8)',
  },
  permissionButton: {
    // backgroundColor handled by theme
    padding: 15,
    borderRadius: 8,
    marginTop: 20,
  },
  permissionButtonText: {
    // color handled by theme
    fontSize: 16,
    fontWeight: 'bold',
  },
  scannedOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scannedText: {
    // color handled by theme
    fontSize: 22,
    fontWeight: 'bold',
  },
});
