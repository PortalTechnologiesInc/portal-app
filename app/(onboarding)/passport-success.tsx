'use client';

import { useLocalSearchParams, useRouter } from 'expo-router';
import { CheckCircle2, ChevronRight } from 'lucide-react-native';
import { useEffect } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useThemeColor } from '@/hooks/useThemeColor';
import type { PassportData } from '@/services/PassportNfcService';

export default function PassportSuccessScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  let passportData: PassportData | null = null;
  const passportDataParam = params?.passportData;
  if (typeof passportDataParam === 'string') {
    try {
      passportData = JSON.parse(passportDataParam) as PassportData;
    } catch {
      passportData = null;
    }
  }

  const backgroundColor = useThemeColor({}, 'background');
  const cardBackgroundColor = useThemeColor({}, 'cardBackground');
  const secondaryTextColor = useThemeColor({}, 'textSecondary');
  const statusConnectedColor = useThemeColor({}, 'statusConnected');

  // Extract passport info
  const mrz = passportData?.mrz;
  const name = mrz ? `${mrz.surname}, ${mrz.givenNames}` : '<Unknown>';
  const nationality = mrz?.nationality || 'N/A';
  const dob = mrz?.dateOfBirth || 'N/A';
  const expiry = mrz?.expiryDate || 'N/A';

  useEffect(() => {
    // Auto-navigate after delay
    const timer = setTimeout(() => {
      router.replace('/(tabs)');
    }, 3000);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]}>
      <View style={styles.container}>
        {/* Success Icon */}
        <View style={styles.iconContainer}>
          <CheckCircle2 size={80} color={statusConnectedColor} />
        </View>

        {/* Success Message */}
        <ThemedText style={styles.title}>Passport Verified!</ThemedText>
        <ThemedText style={styles.subtitle}>Passport data successfully read from chip</ThemedText>

        {/* Passport Info Card */}
        <ThemedView style={[styles.infoCard, { backgroundColor: cardBackgroundColor }]}>
          <View style={styles.infoRow}>
            <ThemedText style={styles.infoLabel}>Name</ThemedText>
            <ThemedText style={styles.infoValue}>{name}</ThemedText>
          </View>
          <View style={styles.infoRow}>
            <ThemedText style={styles.infoLabel}>Nationality</ThemedText>
            <ThemedText style={styles.infoValue}>{nationality}</ThemedText>
          </View>
          <View style={styles.infoRow}>
            <ThemedText style={styles.infoLabel}>Date of Birth</ThemedText>
            <ThemedText style={styles.infoValue}>{dob}</ThemedText>
          </View>
          <View style={styles.infoRow}>
            <ThemedText style={styles.infoLabel}>Expiry Date</ThemedText>
            <ThemedText style={styles.infoValue}>{expiry}</ThemedText>
          </View>
        </ThemedView>

        {/* Log Notice */}
        <ThemedView style={[styles.noticeCard, { backgroundColor: cardBackgroundColor }]}>
          <ThemedText style={styles.noticeTitle}>Data Logged</ThemedText>
          <ThemedText style={styles.noticeText}>
            Passport data has been logged locally for future verification.
            <ThemedText style={{ color: secondaryTextColor }}>
              {'\n'}(See console for full details)
            </ThemedText>
          </ThemedText>
        </ThemedView>

        {/* Back to Home */}
        <TouchableOpacity
          style={[styles.homeButton, { backgroundColor: statusConnectedColor }]}
          onPress={() => router.replace('/(tabs)')}
        >
          <ThemedText style={styles.homeButtonText}>Continue to Home</ThemedText>
          <ChevronRight size={20} color="white" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
  },
  iconContainer: {
    marginBottom: 24,
    marginTop: 60,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 32,
  },
  infoCard: {
    width: '100%',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  infoLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  noticeCard: {
    width: '100%',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  noticeTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
  },
  noticeText: {
    fontSize: 12,
    color: '#666',
  },
  homeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    gap: 8,
  },
  homeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
});
