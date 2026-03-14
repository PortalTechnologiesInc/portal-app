import { parseMRZ, scanMRZ } from '@getportal/mrz-scanner';
import { useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useThemeColor } from '@/hooks/useThemeColor';
import { mrzScannerResultToMrzData } from '@/utils/mrz';

export default function PassportMrzScanScreen() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(true);

  const backgroundColor = useThemeColor({}, 'background');
  const primaryTextColor = useThemeColor({}, 'textPrimary');
  const buttonPrimaryColor = useThemeColor({}, 'buttonPrimary');
  const buttonPrimaryTextColor = useThemeColor({}, 'buttonPrimaryText');
  const statusErrorColor = useThemeColor({}, 'statusError');

  const startScan = useCallback(async () => {
    setError(null);
    setScanning(true);

    try {
      const rawMRZ = await scanMRZ({ timeoutMs: 30000, isChipShow: true });
      const result = parseMRZ(rawMRZ);

      if (!result.checksumValid) {
        setScanning(false);
        setError('Could not read document clearly, try again');
        return;
      }

      const mrzData = mrzScannerResultToMrzData(result);

      router.push({
        pathname: '/passport-nfc-scan',
        params: {
          mrzData: JSON.stringify(mrzData),
        },
      });
    } catch (err: any) {
      const code = err?.code || err?.message || '';

      if (code === 'ERR_CANCELLED') {
        router.back();
        return;
      }

      setScanning(false);

      if (code === 'ERR_TIMEOUT') {
        setError('Scan timed out. Please try again.');
      } else {
        setError('Something went wrong. Please try again.');
      }
    }
  }, [router]);

  useEffect(() => {
    startScan();
  }, [startScan]);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]} edges={['top']}>
      <ThemedView style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color={primaryTextColor} />
        </TouchableOpacity>
        <ThemedText style={[styles.headerText, { color: primaryTextColor }]}>
          Scan Document
        </ThemedText>
      </ThemedView>

      <ThemedView style={styles.content}>
        {scanning && !error && (
          <>
            <ActivityIndicator size="large" color={buttonPrimaryColor} />
            <ThemedText style={[styles.statusText, { color: primaryTextColor }]}>
              Scanning document...
            </ThemedText>
          </>
        )}

        {error && (
          <>
            <ThemedText style={[styles.errorText, { color: statusErrorColor }]}>{error}</ThemedText>
            <TouchableOpacity
              style={[styles.retryButton, { backgroundColor: buttonPrimaryColor }]}
              onPress={startScan}
            >
              <ThemedText style={[styles.retryButtonText, { color: buttonPrimaryTextColor }]}>
                Try Again
              </ThemedText>
            </TouchableOpacity>
          </>
        )}
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
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
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 16,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '500',
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 8,
  },
  retryButton: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignItems: 'center',
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
