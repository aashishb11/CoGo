import { Star } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { type DriverTripDto } from '@/features/trips/api';
import {
  formatOneTimeDate,
  isRecurringTrip,
  normalizePointLabel,
  normalizeTripTime,
  recurringWeekdayDots,
} from '@/features/trips/utils/trip-display';
import { type Lang, toLang } from '@/shared/i18n';
import { FontSize, FontWeight, Palette, Radii, Spacing } from '@/shared/theme';
import { TripTypePill } from '@/shared/ui/components/trip-type-pill';

type FavoriteTripCardProps = {
  trip: DriverTripDto;
  isUnfavoritePending?: boolean;
  onPress?: (tripId: string) => void;
  onUnfavorite?: (tripId: string) => void;
  onDriverPress?: (driverId: string) => void;
};

function deriveInitials(name: string | null | undefined): string {
  if (!name) return '?';
  return (
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() ?? '')
      .join('') || '?'
  );
}

/**
 * Compact, single-row card used inside the favorites list (and inline on the
 * Find tab). Mirrors the mockup's `FavoriteTripCard` at App.jsx:1001-1028 — a
 * smaller, denser variant of the trip card without status/route timeline,
 * suitable for browsing saved routes at a glance.
 */
export function FavoriteTripCard({
  trip,
  isUnfavoritePending = false,
  onPress,
  onUnfavorite,
  onDriverPress,
}: FavoriteTripCardProps) {
  const { t, i18n } = useTranslation();
  const lang = (toLang(i18n.resolvedLanguage) ?? 'es') as Lang;

  const origin = normalizePointLabel(trip.origin);
  const destination = normalizePointLabel(trip.destination);
  const time = normalizeTripTime(trip);
  const recurring = isRecurringTrip(trip);
  const schedule = recurring ? recurringWeekdayDots(trip, lang) : formatOneTimeDate(trip, lang);
  const driverName =
    typeof trip.driver?.fullName === 'string' && trip.driver.fullName.trim().length > 0
      ? trip.driver.fullName.trim()
      : null;
  const driverInitials = deriveInitials(driverName);
  const driverId = trip.driver?.userId;
  const tripTypeLabel = recurring
    ? t('passengerTrips.type.recurring')
    : t('passengerTrips.type.oneTime');

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress ? () => onPress(trip.id) : undefined}
      style={({ pressed }) => [styles.card, pressed && onPress ? styles.cardPressed : null]}
    >
      <Pressable
        accessibilityLabel={
          driverName ? t('passengerTrips.driver.openProfile', { name: driverName }) : undefined
        }
        accessibilityRole={onDriverPress && driverId ? 'button' : undefined}
        disabled={!(onDriverPress && driverId)}
        hitSlop={6}
        onPress={onDriverPress && driverId ? () => onDriverPress(driverId as string) : undefined}
        style={styles.avatar}
      >
        <Text style={styles.avatarText}>{driverInitials}</Text>
      </Pressable>

      <View style={styles.body}>
        <Text numberOfLines={1} style={styles.route}>
          {origin} → {destination}
        </Text>
        <View style={styles.metaRow}>
          <TripTypePill label={tripTypeLabel} type={recurring ? 'recurring' : 'sporadic'} />
          {driverName ? (
            <>
              <Text style={styles.metaDot}>•</Text>
              <Text numberOfLines={1} style={styles.metaText}>
                {driverName}
              </Text>
            </>
          ) : null}
          {schedule ? (
            <>
              <Text style={styles.metaDot}>•</Text>
              <Text numberOfLines={1} style={styles.metaText}>
                {schedule}
              </Text>
            </>
          ) : null}
          {time && time !== '--:--' ? (
            <>
              <Text style={styles.metaDot}>•</Text>
              <Text style={styles.metaText}>{time}</Text>
            </>
          ) : null}
        </View>
      </View>

      {onUnfavorite ? (
        <Pressable
          accessibilityLabel={t('favoriteTrips.action.remove')}
          accessibilityRole="button"
          accessibilityState={{ busy: isUnfavoritePending, disabled: isUnfavoritePending }}
          disabled={isUnfavoritePending}
          hitSlop={10}
          onPress={() => onUnfavorite(trip.id)}
          style={({ pressed }) => [styles.bookmarkBtn, pressed && styles.bookmarkBtnPressed]}
        >
          <Star color={Palette.warning} fill={Palette.warning} size={20} strokeWidth={2} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Palette.card,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Palette.border,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  cardPressed: {
    backgroundColor: Palette.backgroundMuted,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Palette.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: {
    color: Palette.primaryDark,
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  route: {
    color: Palette.text,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  metaText: {
    color: Palette.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    flexShrink: 1,
  },
  metaDot: {
    color: Palette.border,
    fontSize: FontSize.xs,
  },
  bookmarkBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  bookmarkBtnPressed: {
    opacity: 0.7,
  },
});
