import { Car, Fuel, Leaf, TreePine, Trophy, UserRound } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { BadgesList } from '@/features/gamification/components/badges-list';
import type { GamificationStats } from '@/features/gamification/types';
import { FontSize, FontWeight, Palette, Radii, Shadow, Spacing } from '@/shared/theme';

type GamificationSummaryCardProps = {
  stats: GamificationStats;
  title?: string;
  showBadges?: boolean;
  framed?: boolean;
  showXp?: boolean;
};

function formatNumber(value: number | null | undefined, fractionDigits = 0): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '0';
  return fractionDigits === 0 ? String(Math.round(value)) : value.toFixed(fractionDigits);
}

function getProgress(stats: GamificationStats): number {
  const xp = typeof stats.xpPoints === 'number' ? stats.xpPoints : 0;
  const level = typeof stats.level === 'number' ? stats.level : 0;
  const xpToNext = typeof stats.xpToNextLevel === 'number' ? stats.xpToNextLevel : 0;
  const currentLevelXp = level * level * 100;
  const nextLevelXp = xp + xpToNext;
  const span = nextLevelXp - currentLevelXp;
  if (span <= 0) return 0;
  return Math.max(0, Math.min(1, (xp - currentLevelXp) / span));
}

export function GamificationSummaryCard({
  stats,
  title,
  showBadges = true,
  framed = true,
  showXp = true,
}: GamificationSummaryCardProps) {
  const { t } = useTranslation();
  const progress = getProgress(stats);
  const ridesCompleted = (stats.ridesAsDriver ?? 0) + (stats.ridesAsPassenger ?? 0);
  const hasSustainabilityEquivalents =
    typeof stats.equivalentTreesPerYear === 'number' ||
    typeof stats.equivalentFuelLitresSaved === 'number';

  return (
    <View style={framed ? styles.card : styles.plain}>
      <View style={styles.header}>
        <View style={styles.levelCircle}>
          <Text style={styles.levelNumber}>{formatNumber(stats.level)}</Text>
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>{title ?? t('gamification.summary.title')}</Text>
          <Text style={styles.subtitle}>
            {showXp
              ? t('gamification.summary.xpValue', { value: formatNumber(stats.xpPoints) })
              : t('gamification.summary.levelValue', { value: formatNumber(stats.level) })}
          </Text>
        </View>
      </View>

      {showXp ? (
        <>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
          </View>
          <Text style={styles.progressText}>
            {t('gamification.summary.nextLevel', { value: formatNumber(stats.xpToNextLevel) })}
          </Text>
        </>
      ) : null}

      <View style={styles.metricGrid}>
        <Metric
          icon={<Trophy color={Palette.primary} size={16} />}
          label={t('gamification.summary.completedRides')}
          value={formatNumber(ridesCompleted)}
        />
        <Metric
          icon={<Leaf color={Palette.primary} size={16} />}
          label={t('gamification.summary.co2Saved')}
          value={t('gamification.summary.kgValue', {
            value: formatNumber(stats.totalCo2Saved, 1),
          })}
        />
      </View>

      <View style={styles.roleGrid}>
        <RoleMetric
          icon={<Car color={Palette.primary} size={18} />}
          label={t('gamification.summary.driverRides')}
          value={formatNumber(stats.ridesAsDriver)}
        />
        <RoleMetric
          icon={<UserRound color={Palette.primary} size={18} />}
          label={t('gamification.summary.passengerRides')}
          value={formatNumber(stats.ridesAsPassenger)}
        />
      </View>

      {hasSustainabilityEquivalents ? (
        <View style={styles.metricGrid}>
          <Metric
            icon={<TreePine color={Palette.primary} size={16} />}
            label={t('gamification.summary.treesEquivalent')}
            value={formatNumber(stats.equivalentTreesPerYear, 2)}
          />
          <Metric
            icon={<Fuel color={Palette.primary} size={16} />}
            label={t('gamification.summary.fuelEquivalent')}
            value={t('gamification.summary.literValue', {
              value: formatNumber(stats.equivalentFuelLitresSaved, 1),
            })}
          />
        </View>
      ) : null}

      {showBadges ? (
        <View style={styles.badgesSection}>
          <Text style={styles.sectionLabel}>{t('gamification.badges.title')}</Text>
          <BadgesList badges={stats.badges} />
        </View>
      ) : null}
    </View>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <View style={styles.metricIcon}>{icon}</View>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function RoleMetric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <View style={styles.roleMetric}>
      <View style={styles.roleMetricIcon}>{icon}</View>
      <Text style={styles.roleMetricValue}>{value}</Text>
      <Text style={styles.roleMetricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Palette.card,
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: Palette.border,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xl,
    gap: Spacing.md,
    ...Shadow.cardSoft,
    zIndex: 10,
    elevation: 10,
  },
  plain: {
    gap: Spacing.md,
    zIndex: 10,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  levelCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.primary,
  },
  levelNumber: {
    color: Palette.textOnPrimary,
    fontSize: FontSize['4xl'],
    fontWeight: FontWeight.extrabold,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: Palette.text,
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
  },
  subtitle: {
    marginTop: 2,
    color: Palette.textSecondary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.medium,
  },
  progressTrack: {
    height: 8,
    borderRadius: Radii.pill,
    backgroundColor: Palette.backgroundMuted,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: Radii.pill,
    backgroundColor: Palette.primary,
  },
  progressText: {
    color: Palette.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  metricGrid: {
    gap: Spacing.sm,
  },
  roleGrid: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  metric: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderRadius: Radii.md,
    backgroundColor: Palette.backgroundMuted,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  metricIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.card,
  },
  metricValue: {
    color: Palette.text,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
  metricLabel: {
    flex: 1,
    minWidth: 0,
    color: Palette.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    textAlign: 'right',
  },
  roleMetric: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    gap: Spacing.xs,
    borderRadius: Radii.md,
    backgroundColor: Palette.primarySurface,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  roleMetricIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.card,
  },
  roleMetricValue: {
    color: Palette.primaryDark,
    fontSize: FontSize['3xl'],
    fontWeight: FontWeight.extrabold,
  },
  roleMetricLabel: {
    color: Palette.primaryDark,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    textAlign: 'center',
  },
  badgesSection: {
    gap: Spacing.sm,
    paddingTop: Spacing.sm,
    zIndex: 100,
    elevation: 100,
  },
  sectionLabel: {
    color: Palette.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
});
