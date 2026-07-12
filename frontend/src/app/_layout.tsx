import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import 'react-native-reanimated';

import { ProfileLocaleSync } from '@/providers/profile-locale-sync';
import '@/shared/i18n';
import { queryClient } from '@/shared/query/client';
import { ErrorBoundary } from '@/shared/ui/error-boundary';

export const unstable_settings = {
  anchor: '(tabs)',
};

function RootNavigator() {
  const { t } = useTranslation();

  return (
    <ErrorBoundary>
      <ThemeProvider value={DefaultTheme}>
        <Stack screenOptions={{ animation: 'slide_from_right', headerShown: false }}>
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="modal"
            options={{
              presentation: 'modal',
              title: t('settings.language.label'),
            }}
          />
          <Stack.Screen
            name="add-car"
            options={{
              presentation: 'modal',
              headerShown: false,
            }}
          />
          <Stack.Screen name="rides/[rideId]/live" options={{ headerShown: false }} />
          <Stack.Screen name="rides/[rideId]/complete" options={{ headerShown: false }} />
          <Stack.Screen
            name="rides/[rideId]/scan"
            options={{ headerShown: false, presentation: 'fullScreenModal' }}
          />
          <Stack.Screen
            name="bookings/[bookingId]/boarding-pass"
            options={{ headerShown: false, presentation: 'fullScreenModal' }}
          />
          <Stack.Screen
            name="rides/[rideId]/incident"
            options={{
              presentation: 'transparentModal',
              animation: 'fade',
              headerShown: false,
            }}
          />
          <Stack.Screen name="profile/incidents" options={{ headerShown: false }} />
        </Stack>

        <StatusBar style="dark" />
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <ProfileLocaleSync />
        <RootNavigator />
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
