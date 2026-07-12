import { Image, type ImageSource } from 'expo-image';
import { Award } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { GamificationBadge } from '@/features/gamification/types';
import { FontSize, FontWeight, Palette, Radii, Spacing } from '@/shared/theme';
import { BottomDrawer } from '@/shared/ui/components/bottom-drawer';

type BadgesListProps = {
  badges?: GamificationBadge[] | null;
  emptyLabel?: string;
};

const BADGE_LABEL_KEYS = {
  first_driver_ride: 'gamification.badge.firstDriverRide',
  co2_savior: 'gamification.badge.co2Saver',
  eco_warrior: 'gamification.badge.warrior',
  ride_milestone_10: 'gamification.badge.tenRides',
} as const;

const BADGE_DESCRIPTION_KEYS = {
  first_driver_ride: 'gamification.badgeDescription.firstDriverRide',
  co2_savior: 'gamification.badgeDescription.co2Saver',
  eco_warrior: 'gamification.badgeDescription.warrior',
  ride_milestone_10: 'gamification.badgeDescription.tenRides',
} as const satisfies Record<keyof typeof BADGE_LABEL_KEYS, string>;

type BadgeKey = keyof typeof BADGE_LABEL_KEYS;

const BADGE_ALIASES: Record<string, BadgeKey> = {
  first_ride_driver: 'first_driver_ride',
  first_driver_ride: 'first_driver_ride',
  co2_savior: 'co2_savior',
  co_2_savior: 'co2_savior',
  eco_warrior: 'eco_warrior',
  ride_milestone_10: 'ride_milestone_10',
};

const BADGE_IMAGES: Partial<Record<keyof typeof BADGE_LABEL_KEYS, ImageSource>> = {
  first_driver_ride: require('../../../../assets/images/first.webp'),
  co2_savior: require('../../../../assets/images/savior.webp'),
  eco_warrior: require('../../../../assets/images/warrior.webp'),
  ride_milestone_10: require('../../../../assets/images/10.webp'),
};

const BADGE_ORDER: BadgeKey[] = [
  'first_driver_ride',
  'ride_milestone_10',
  'co2_savior',
  'eco_warrior',
];

function normalizeBadgeKey(id: string): BadgeKey | null {
  const normalized = id
    .trim()
    .toLowerCase()
    .replaceAll(/[\[\]'"]/g, '')
    .replaceAll('-', '_')
    .replaceAll(/\s+/g, '_');
  return BADGE_ALIASES[normalized] ?? null;
}

function getBadgeSortIndex(badge: GamificationBadge): number {
  const badgeKey = normalizeBadgeKey(badge.id);
  if (!badgeKey) return BADGE_ORDER.length;
  const index = BADGE_ORDER.indexOf(badgeKey);
  return index === -1 ? BADGE_ORDER.length : index;
}

function humanizeBadgeId(id: string): string {
  return id
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatAwardedAt(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function BadgesList({ badges, emptyLabel }: BadgesListProps) {
  const { t } = useTranslation();
  const [activeBadgeKeyValue, setActiveBadgeKeyValue] = useState<string | null>(null);
  const visibleBadges = [...(badges ?? [])].sort(
    (a, b) => getBadgeSortIndex(a) - getBadgeSortIndex(b),
  );
  const activeBadge =
    visibleBadges.find((badge) => `${badge.id}-${badge.awardedAt}` === activeBadgeKeyValue) ?? null;
  const activeBadgeKey = activeBadge ? normalizeBadgeKey(activeBadge.id) : null;
  const activeBadgeLabel = activeBadgeKey
    ? t(BADGE_LABEL_KEYS[activeBadgeKey])
    : activeBadge
      ? humanizeBadgeId(activeBadge.id)
      : '';
  const activeBadgeDescription = activeBadgeKey
    ? t(BADGE_DESCRIPTION_KEYS[activeBadgeKey])
    : t('gamification.badgeDescription.unknown');
  const activeBadgeAwardedAt = activeBadge ? formatAwardedAt(activeBadge.awardedAt) : null;

  if (visibleBadges.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyText}>{emptyLabel ?? t('gamification.badges.empty')}</Text>
      </View>
    );
  }

  const activeBadgeImage = activeBadgeKey ? BADGE_IMAGES[activeBadgeKey] : null;

  return (
    <View style={styles.wrap}>
      <View style={styles.badgeWrap}>
        {visibleBadges.map((badge) => {
          const key = `${badge.id}-${badge.awardedAt}`;
          const badgeKey = normalizeBadgeKey(badge.id);
          const labelKey = badgeKey ? BADGE_LABEL_KEYS[badgeKey] : null;
          const label = labelKey ? t(labelKey) : humanizeBadgeId(badge.id);
          const image = badgeKey ? BADGE_IMAGES[badgeKey] : null;
          return (
            <View key={key} style={styles.badgeItem}>
              {image ? (
                <Pressable
                  accessibilityHint={t('gamification.badges.hint')}
                  accessibilityLabel={label}
                  accessibilityRole="button"
                  onPress={() => setActiveBadgeKeyValue(key)}
                  style={({ pressed }) => [styles.imageBadge, pressed && styles.badgePressed]}
                >
                  <Image contentFit="contain" source={image} style={styles.badgeImage} />
                </Pressable>
              ) : (
                <Pressable
                  accessibilityHint={t('gamification.badges.hint')}
                  accessibilityLabel={label}
                  accessibilityRole="button"
                  onPress={() => setActiveBadgeKeyValue(key)}
                  style={({ pressed }) => [styles.badge, pressed && styles.badgePressed]}
                >
                  <Award color={Palette.primaryDark} size={14} strokeWidth={2.4} />
                  <Text numberOfLines={1} style={styles.badgeText}>
                    {label}
                  </Text>
                </Pressable>
              )}
            </View>
          );
        })}
      </View>
      <BottomDrawer
        onClose={() => setActiveBadgeKeyValue(null)}
        title={activeBadgeLabel}
        visible={activeBadge !== null}
      >
        <View style={styles.sheetContent}>
          {activeBadgeImage ? (
            <Image contentFit="contain" source={activeBadgeImage} style={styles.sheetImage} />
          ) : (
            <View style={styles.sheetIconFallback}>
              <Award color={Palette.primaryDark} size={48} strokeWidth={2.2} />
            </View>
          )}
          <Text style={styles.sheetDescription}>{activeBadgeDescription}</Text>
          {activeBadgeAwardedAt ? (
            <Text style={styles.sheetAwardedAt}>
              {t('gamification.badges.awardedAt', { date: activeBadgeAwardedAt })}
            </Text>
          ) : null}
        </View>
      </BottomDrawer>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.sm,
  },
  badgeWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    alignItems: 'flex-start',
  },
  badgeItem: {
    alignItems: 'center',
    maxWidth: 156,
  },
  imageBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeImage: {
    width: 72,
    height: 72,
  },
  badgePressed: {
    opacity: 0.78,
  },
  badge: {
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    borderRadius: Radii.pill,
    borderWidth: 1,
    borderColor: Palette.primary,
    backgroundColor: Palette.primarySurface,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
  },
  badgeText: {
    color: Palette.primaryDark,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
  },
  sheetContent: {
    alignItems: 'center',
    gap: Spacing.md,
    paddingBottom: Spacing.md,
  },
  sheetImage: {
    width: 120,
    height: 120,
  },
  sheetIconFallback: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.primarySurface,
  },
  sheetDescription: {
    color: Palette.text,
    fontSize: FontSize.md,
    fontWeight: FontWeight.medium,
    lineHeight: 22,
    textAlign: 'center',
  },
  sheetAwardedAt: {
    color: Palette.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    textAlign: 'center',
  },
  emptyWrap: {
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Palette.border,
    backgroundColor: Palette.backgroundMuted,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  emptyText: {
    color: Palette.textSecondary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.medium,
  },
});
