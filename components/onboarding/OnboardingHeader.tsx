import { ArrowLeft } from 'lucide-react-native';
import { Image, TouchableOpacity, View } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useThemeColor } from '@/hooks/useThemeColor';
import { onboardingLogo } from './assets';
import { onboardingStyles as styles } from './styles';

export function OnboardingHeader({
  title = 'Portal Setup',
  onBack,
}: {
  title?: string;
  onBack: () => void;
}) {
  const textPrimary = useThemeColor({}, 'textPrimary');

  return (
    <ThemedView style={styles.header}>
      <TouchableOpacity
        onPress={onBack}
        style={styles.backButton}
        activeOpacity={0.7}
        hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
      >
        <ArrowLeft size={24} color={textPrimary} />
      </TouchableOpacity>
      <ThemedText style={[styles.headerText, { color: textPrimary }]}>{title}</ThemedText>
      <View style={styles.headerLogoWrapper}>
        <Image source={onboardingLogo} style={styles.headerLogo} resizeMode="contain" />
      </View>
    </ThemedView>
  );
}
