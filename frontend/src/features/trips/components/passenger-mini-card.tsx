import { Check, ChevronRight, Hourglass } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useProfile } from '@/features/profile/queries';
import { FontSize, FontWeight, Palette, Radii, Shadow, Spacing } from '@/shared/theme';

type PassengerMiniCardProps = {
  passengerId: string;
  boarded: boolean;
  onPress?: (passengerId: string) => void;
};

function getInitials(name: string | undefined | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || '?';
}

/**
 * Compact card for the live-ride passenger list. Resolves the passenger name
 * via the cached public-profile query and shows a status chip indicating
 * whether the driver has already scanned the QR (boarded) or not. The
 * passenger name falls back to the id while the profile is loading or if
 * the profile lookup 404s.
 */
export function PassengerMiniCard({ passengerId, boarded, onPress }: PassengerMiniCardProps) {
  const { t } = useTranslation();
  const profileQuery = useProfile(passengerId);
  const profile = profileQuery.data ?? null;

  const username =
    typeof profile?.username === 'string' && profile.username.trim().length > 0
      ? profile.username.trim()
      : null;
  const displayName = username ?? passengerId;
  const initials = getInitials(username ?? passengerId);

  const StatusIcon = boarded ? Check : Hourglass;

  const content = (
    <>
      <View style={[styles.avatar, boarded && styles.avatarBoarded]}>
        <Text style={[styles.avatarText, boarded && styles.avatarTextBoarded]}>{initials}</Text>
      </View>
      <View style={styles.textWrap}>
        <Text numberOfLines={1} style={styles.name}>
          {displayName}
        </Text>
        <View style={styles.statusRow}>
          <StatusIcon
            color={boarded ? Palette.success : Palette.warning}
            size={11}
            strokeWidth={2.6}
          />
          <Text style={[styles.statusText, boarded ? styles.statusBoarded : styles.statusPending]}>
            {boarded
              ? t('rideLifecycle.live.passenger.boarded')
              : t('rideLifecycle.live.passenger.notBoarded')}
          </Text>
        </View>
      </View>
      {onPress ? <ChevronRight color={Palette.textSecondary} size={18} /> : null}
    </>
  );

  if (!onPress) {
    return <View style={styles.card}>{content}</View>;
  }

  return (
    <Pressable
      accessibilityLabel={displayName}
      accessibilityRole="button"
      onPress={() => onPress(passengerId)}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Palette.card,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Palette.border,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    ...Shadow.cardSoft,
  },
  cardPressed: {
    opacity: 0.85,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Palette.backgroundMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarBoarded: {
    backgroundColor: Palette.successSurface,
  },
  avatarText: {
    color: Palette.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
  },
  avatarTextBoarded: {
    color: Palette.success,
  },
  textWrap: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  name: {
    color: Palette.text,
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
  },
  statusBoarded: {
    color: Palette.success,
  },
  statusPending: {
    color: Palette.warning,
  },
});
