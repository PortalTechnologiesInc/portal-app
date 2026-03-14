'use client';

import { detectText, TextRecognitionResult } from '@react-native-ml-kit/text-recognition';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { ArrowLeft, Camera as CameraIcon, CheckCircle, XCircle } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import * as Crypto from 'react-native-quick-crypto';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useThemeColor } from '@/hooks/useThemeColor';
import { isMrzText, type MrzData, parseMrz } from '@/utils/mrz';

export default function PassportMrzScanScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraRef, setCameraRef] = useState<CameraView | null>(null);
  const [mrzText, setMrzText] = useState<string | null>(null);
  const [parsedMrz, setParsedMrz] = useState<MrzData | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<'pending' | 'success' | 'error'>('pending');
  const [errorMsg, setErrorMsg] = useState<string>('');

  const backgroundColor = useThemeColor({}, 'background');
  const cardBackgroundColor = useThemeColor({}, 'cardBackground');
  const primaryTextColor = useThemeColor({}, 'textPrimary');
  const secondaryTextColor = useThemeColor({}, 'textSecondary');
  const buttonPrimaryColor = useThemeColor({}, 'buttonPrimary');
  const buttonPrimaryTextColor = useThemeColor({}, 'buttonPrimaryText');

  // Check if text looks like MRZ
  const checkMrzFormat = useCallback((text: string): boolean => {
    return isMrzText(text);
  }, []);

  // Capture and process image
  const captureAndProcess = useCallback(async () => {
    if (!cameraRef || scanning) return;

    setScanning(true);
    setErrorMsg('');
    setScanResult('pending');

    try {
      // Take picture
      const photo = await cameraRef.takePictureAsync({
        quality: 0.5, // Lower quality for faster processing
        base64: false, // Don't need base64
      });

      if (!photo?.uri) {
        throw new Error('Failed to capture image');
      }

      // Read image and detect text
      // Note: ML Kit text detection in React Native may not work perfectly
      // In production, you'd want to convert to a format ML Kit can process
      const textResult = await detectText({
        uri: photo.uri,
      });

      // Extract all text from the image
      let extractedText = '';
      for (const block of textResult.blocks) {
        extractedText += block.text + '\n';
      }

      console.log('[MRZ] Extracted text:', extractedText);

      // Check if text looks like MRZ
      if (checkMrzFormat(extractedText)) {
        setMrzText(extractedText);

        // Parse MRZ
        const parsed = parseMrz(extractedText);
        if (parsed && parsed.checkDigitsValid) {
          setParsedMrz(parsed);
          setScanResult('success');
        } else if (parsed) {
          setErrorMsg('MRZ check digits invalid. Please ensure the document is clear and not damaged.');
          setScanResult('error');
        } else {
          setErrorMsg('Could not parse MRZ. Please ensure the document is properly aligned and text is clear.');
          setScanResult('error');
        }
      } else {
        setErrorMsg('No MRZ text detected. Please ensure the document is properly aligned in the camera frame.');
        setScanResult('error');
      }
    } catch (error) {
      console.error('[MRZ] Error:', error);
      setErrorMsg('Error processing image. Please try again.');
      setScanResult('error');
    } finally {
      setScanning(false);
    }
  }, [cameraRef, scanning, checkMrzFormat]);

  // Handle back button (Android)
  useEffect(() => {
    const handleBackPress = () => {
      router.replace('/(tabs)');
      return true;
    };

    if (Platform.OS === 'android') {
      // In Expo Router, we might need to use a different approach for back navigation
    }

    return () => {
      // Cleanup
    };
  }, [router]);

  const requestCameraAccess = async () => {
    if (!permission?.granted) {
      await requestPermission();
    }
  };

  if (!permission) {
    return <ThemedView style={styles.loadingContainer}>
      <ThemedText>Loading...</ThemedText>
    </ThemedView>;
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.container}>
          <ThemedText style={styles.headerText}>Camera Access Required</ThemedText>
          <ThemedText style={styles.descriptionText}>
            We need camera access to scan the MRZ (machine readable zone) on your passport or ID card.
          </ThemedText>
          <TouchableOpacity style={styles.grantButton} onPress={requestCameraAccess}>
            <ThemedText style={styles.grantButtonText}>Grant Camera Access</ThemedText>
          </TouchableOpacity>
        </ThemedView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]} edges={['top']}>
      {/* Header */}
      <ThemedView style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            router.replace('/(tabs)');
          }}
          style={styles.backButton}
        >
          <ArrowLeft size={24} color={primaryTextColor} />
        </TouchableOpacity>
        <ThemedText style={[styles.headerText, { color: primaryTextColor }]}>
          Scan MRZ
        </ThemedText>
      </ThemedView>

      {/* Camera View */}
      {!parsedMrz ? (
        <View style={styles.cameraContainer}>
          <CameraView
            style={styles.camera}
            ref={setCameraRef}
            facing="back"
          >
            {/* MRZ Guide Overlay */}
            <View style={styles.overlayContainer}>
              {/* Corner indicators */}
              <View style={[styles.corner, styles.topLeft]} />
              <View style={[styles.corner, styles.topRight]} />
              <View style={[styles.corner, styles.bottomLeft]} />
              <View style={[styles.corner, styles.bottomRight]} />

              {/* MRZ text guide */}
              <View style={styles.guideTextContainer}>
                <ThemedText style={styles.guideText}>
                  Align MRZ in frame
                </ThemedText>
                <ThemedText style={styles.subGuideText}>
                  Hold phone steady and tap capture when ready
                </ThemedText>
              </View>
            </View>
          </CameraView>

          {/* Capture Button */}
          <ThemedView style={styles.captureContainer}>
            <TouchableOpacity
              style={[styles.captureButton, { backgroundColor: buttonPrimaryColor }]}
              onPress={captureAndProcess}
              disabled={scanning}
            >
              <ThemedText style={[styles.captureButtonText, { color: buttonPrimaryTextColor }]}>
                {scanning ? 'Processing...' : 'Capture MRZ'}
              </ThemedText>
            </TouchableOpacity>
          </ThemedView>
        </View>
      ) : (
        <ThemedView style={styles.resultContainer}>
          <ThemedText style={styles.resultTitle}>MRZ Detected</ThemedText>

          <ThemedView style={styles.infoCard}>
            <ThemedText style={styles.infoLabel}>Document Type</ThemedText>
            <ThemedText style={styles.infoValue}>
              {parsedMrz.documentType === 'P' ? 'Passport' : 'ID Card'}
            </ThemedText>

            <ThemedText style={styles.infoLabel}>Name</ThemedText>
            <ThemedText style={styles.infoValue}>
              {parsedMrz.surname}, {parsedMrz.givenNames}
            </ThemedText>

            <ThemedText style={styles.infoLabel}>Nationality</ThemedText>
            <ThemedText style={styles.infoValue}>{parsedMrz.nationality}</ThemedText>

            <ThemedText style={styles.infoLabel}>Date of Birth</ThemedText>
            <ThemedText style={styles.infoValue}>{parsedMrz.dateOfBirth}</ThemedText>

            <ThemedText style={styles.infoLabel}>Expiry Date</ThemedText>
            <ThemedText style={styles.infoValue}>{parsedMrz.expiryDate}</ThemedText>

            <ThemedText style={styles.infoLabel}>Document Number</ThemedText>
            <ThemedText style={styles.infoValue}>{parsedMrz.documentNumber}</ThemedText>

            <ThemedView style={styles.verifiedBadge}>
              <CheckCircle size={16} color={statusConnectedColor} />
              <ThemedText style={styles.verifiedText}>Verified</ThemedText>
            </ThemedView>
          </ThemedView>

          <TouchableOpacity
            style={[styles.continueButton, { backgroundColor: buttonPrimaryColor }]}
            onPress={() => {
              router.push({
                pathname: '/(onboarding)/passport-nfc-scan',
                params: {
                  mrzData: JSON.stringify(parsedMrz),
                },
              });
            }}
          >
            <ThemedText style={[styles.continueButtonText, { color: buttonPrimaryTextColor }]}>
              Continue to NFC Scan
            </ThemedText>
          </TouchableOpacity>
        </ThemedView>
      )}

      {/* Error Display */}
      {scanResult === 'error' && (
        <ThemedView style={styles.errorContainer}>
          <XCircle size={32} color={statusErrorColor} />
          <ThemedText style={styles.errorText}>{errorMsg}</ThemedText>
          <TouchableOpacity
            style={[styles.retryButton, { backgroundColor: buttonPrimaryColor }]}
            onPress={captureAndProcess}
          >
            <ThemedText style={[styles.retryButtonText, { color: buttonPrimaryTextColor }]}>
              Retry
            </ThemedText>
          </TouchableOpacity>
        </ThemedView>
      )}
    </SafeAreaView>
  );
}

const statusConnectedColor = useThemeColor({}, 'statusConnected');
const statusErrorColor = useThemeColor({}, 'statusError');

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  headerText: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  cameraContainer: {
    flex: 1,
    position: 'relative',
  },
  camera: {
    flex: 1,
  },
  overlayContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  corner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderWidth: 3,
  },
  topLeft: {
    top: 20,
    left: 20,
    borderBottomWidth: 0,
    borderRightWidth: 0,
    borderTopLeftRadius: 8,
  },
  topRight: {
    top: 20,
    right: 20,
    borderBottomWidth: 0,
    borderLeftWidth: 0,
    borderTopRightRadius: 8,
  },
  bottomLeft: {
    bottom: 20,
    left: 20,
    borderTopWidth: 0,
    borderRightWidth: 0,
    borderBottomLeftRadius: 8,
  },
  bottomRight: {
    bottom: 20,
    right: 20,
    borderTopWidth: 0,
    borderLeftWidth: 0,
    borderBottomRightRadius: 8,
  },
  guideTextContainer: {
    alignItems: 'center',
    marginTop: 40,
  },
  guideText: {
    fontSize: 18,
    fontWeight: '600',
    color: 'white',
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 4,
  },
  subGuideText: {
    fontSize: 14,
    color: 'white',
    opacity: 0.9,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.4,
    shadowRadius: 2,
    elevation: 2,
  },
  captureContainer: {
    padding: 24,
    paddingBottom: 40,
    alignItems: 'center',
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#fff',
  },
  captureButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  resultContainer: {
    flex: 1,
    padding: 24,
  },
  resultTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 24,
  },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
  },
  infoLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginBottom: 16,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  verifiedText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#22c55e',
    marginLeft: 6,
  },
  continueButton: {
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignItems: 'center',
  },
  continueButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  errorContainer: {
    padding: 24,
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
    marginVertical: 16,
    color: '#ef4444',
  },
  retryButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
