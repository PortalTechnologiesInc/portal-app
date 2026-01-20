import { Stack } from 'expo-router';
import { OnboardingFlowProvider } from '@/context/OnboardingFlowContext';
import { useThemeColor } from '@/hooks/useThemeColor';

export default function OnboardingLayout() {
  const backgroundColor = useThemeColor({}, 'background');

  return (
    <OnboardingFlowProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor },
        }}
      />
    </OnboardingFlowProvider>
  );
}

