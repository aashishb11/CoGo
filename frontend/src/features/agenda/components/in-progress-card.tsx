import { ChevronRight, Play, QrCode, ScanLine } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { AgendaItem } from '@/features/trips/api';
import { FontSize, FontWeight, Palette, Radii, Shadow, Spacing } from '@/shared/theme';
import { formStyles } from '@/shared/theme/form-styles';
import { RouteTimeline } from '@/shared/ui/components/route-timeline';

type Props = {
  item: AgendaItem;
  onPress: (item: AgendaItem) => void;
  onScanBoarding?: (rideId: string) => void;
  onShowBoardingPass?: (bookingId: string) => void;
};

/**
 * Big, prominent "ride in progress" card pinned at the top of the agenda. Its
 * primary CTA is role-specific:
 *  - driver  → Escanear QR de embarque
 *  - passenger → Mostrar QR de embarque
 *
 * The whole card body is tappable as a secondary path to the trip-details
 * screen, so the CTA stays a one-tap shortcut to the actual job without
 * blocking deep navigation.
 */
export function InProgressRideCard({ item, onPress, onScanBoarding, onShowBoardingPass }: Props) {
  const { t } = useTranslation();
  const isDriver = item.role === 'driver';

  const ctaLabel = isDriver
    ? t('agenda.actions.scanBoarding.label')
    : t('agenda.actions.showBoardingPass.label');

  const CtaIcon = isDriver ? ScanLine : QrCode;

  function handleCta() {
    if (isDriver) {
      onScanBoarding?.(item.rideId);
      return;
    }
    if (item.role === 'passenger') {
      onShowBoardingPass?.(item.myBookingId);
    }
  }

  const ctaEnabled = isDriver ? Boolean(onScanBoarding) : Boolean(onShowBoardingPass);

  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        onPress={() => onPress(item)}
        style={({ pressed }) => [styles.headerPressable, pressed && styles.headerPressed]}
      >
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <View style={styles.statusPill}>
              <Play color={Palette.textOnPrimary} size={10} strokeWidth={3} />
              <Text style={styles.statusPillText}>{t('agenda.inProgress.titleOne')}</Text>
            </View>
          </View>
          <ChevronRight color={Palette.primaryDark} size={18} strokeWidth={2.4} />
        </View>

        <View style={styles.routeWrap}>
          <RouteTimeline
            destination={item.destination.label}
            dropoffLabel={t('agenda.dropoff')}
            origin={item.origin.label}
            pickupLabel={t('agenda.pickup')}
          />
        </View>
      </Pressable>

      {ctaEnabled ? (
        <Pressable
          accessibilityRole="button"
          onPress={handleCta}
          style={({ pressed }) => [
            formStyles.primaryButton,
            styles.cta,
            pressed && formStyles.primaryButtonPressed,
          ]}
        >
          <View style={styles.ctaContent}>
            <CtaIcon color={Palette.textOnPrimary} size={18} strokeWidth={2.2} />
            <Text style={formStyles.primaryButtonText}>{ctaLabel}</Text>
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    // Horizontal padding matches the agenda content container
    // (paddingHorizontal: Spacing.xxl) so this card lines up with the agenda
    // cards below it instead of poking out narrower. Top/bottom margins give
    // it breathing room from the screen header and the date strip.
    marginHorizontal: Spacing.xxl,
    marginTop: Spacing.lg,
    marginBottom: Spacing.md,
    padding: Spacing.lg,
    borderRadius: Radii.lg,
    backgroundColor: Palette.primarySurface,
    borderWidth: 1,
    borderColor: Palette.primary,
    gap: Spacing.md,
    ...Shadow.cardSoft,
  },
  headerPressable: {
    gap: Spacing.md,
  },
  headerPressed: {
    opacity: 0.85,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
    minWidth: 0,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radii.pill,
    backgroundColor: Palette.primary,
  },
  statusPillText: {
    color: Palette.textOnPrimary,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.extrabold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  routeWrap: {
    paddingVertical: Spacing.xs,
  },
  cta: {
    minHeight: 48,
  },
  ctaContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
});
