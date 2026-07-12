import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAgendaFeed } from '@/features/profile/queries';
import { mapErrorToMessageKey } from '@/shared/api';
import { FontSize, FontWeight, Palette, Radii, Spacing } from '@/shared/theme';
import { BottomDrawer } from '@/shared/ui/components/bottom-drawer';

const GOOGLE_CALENDAR_SUBSCRIBE_URL = 'https://calendar.google.com/calendar/render?cid=';

type GoogleCalendarSyncDrawerProps = {
  visible: boolean;
  onClose: () => void;
};

export function GoogleCalendarSyncDrawer({ visible, onClose }: GoogleCalendarSyncDrawerProps) {
  const { t } = useTranslation();
  const feedQuery = useAgendaFeed();

  const feedUrl = feedQuery.data?.url ?? null;
  const isFetching = feedQuery.isFetching;
  const isAddDisabled = isFetching;

  async function handleAddToGoogle() {
    let url = feedUrl;
    if (!url) {
      const result = await feedQuery.refetch();
      url = result.data?.url ?? null;
    }
    if (!url) return;
    const webcalUrl = url.replace(/^https?:\/\//, 'webcal://');
    void Linking.openURL(GOOGLE_CALENDAR_SUBSCRIBE_URL + encodeURIComponent(webcalUrl));
  }

  const errorMessage = feedQuery.isError ? t(mapErrorToMessageKey(feedQuery.error)) : null;

  return (
    <BottomDrawer
      accessibilityLabel={t('agenda.calendarSync.title')}
      onClose={onClose}
      title={t('agenda.calendarSync.title')}
      visible={visible}
    >
      <View style={styles.content}>
        <Text style={styles.subtitle}>{t('agenda.calendarSync.subtitle')}</Text>

        <Pressable
          accessibilityLabel={t('agenda.calendarSync.addToGoogle')}
          accessibilityRole="button"
          accessibilityState={{ disabled: isAddDisabled, busy: isFetching }}
          disabled={isAddDisabled}
          onPress={() => void handleAddToGoogle()}
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.primaryButtonPressed,
            isAddDisabled && styles.buttonDisabled,
          ]}
        >
          {isFetching ? (
            <ActivityIndicator color={Palette.textOnPrimary} size="small" />
          ) : (
            <View style={styles.primaryButtonRow}>
              <Image
                accessibilityIgnoresInvertColors
                resizeMode="contain"
                source={require('../../../../assets/images/google-calendar.png')}
                style={styles.logo}
              />
              <Text style={styles.primaryButtonText}>{t('agenda.calendarSync.addToGoogle')}</Text>
            </View>
          )}
        </Pressable>

        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
      </View>
    </BottomDrawer>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: Spacing.md,
    paddingBottom: Spacing.md,
  },
  subtitle: {
    color: Palette.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  primaryButton: {
    backgroundColor: Palette.primary,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonPressed: {
    opacity: 0.82,
  },
  primaryButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  primaryButtonText: {
    color: Palette.textOnPrimary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
  logo: {
    width: 20,
    height: 20,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  errorText: {
    color: Palette.danger,
    fontSize: FontSize.sm,
    textAlign: 'center',
  },
});
