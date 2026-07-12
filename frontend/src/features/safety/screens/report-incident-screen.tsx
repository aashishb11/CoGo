import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useRequireAuth } from '@/features/auth/queries';
import { ReportIncidentSheet } from '@/features/safety/components/report-incident-sheet';
import { Palette } from '@/shared/theme';

function readParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

/**
 * Transparent-modal wrapper around the bottom sheet so the trip-details ride
 * row can deep-link straight into the report form without scaffolding a
 * full screen. Mirrors the rate-ride-screen pattern.
 */
export default function ReportIncidentScreen() {
  useRequireAuth();
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ rideId?: string | string[] }>();
  const rideId = readParam(params.rideId).trim();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (rideId) setVisible(true);
  }, [rideId]);

  function handleClose() {
    setVisible(false);
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/agenda');
    }
  }

  useEffect(() => {
    if (!rideId) handleClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rideId]);

  return (
    <View accessibilityLabel={t('safety.incidents.report.title')} style={styles.screen}>
      <ReportIncidentSheet onClose={handleClose} rideId={rideId} visible={visible} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Palette.background,
  },
});
