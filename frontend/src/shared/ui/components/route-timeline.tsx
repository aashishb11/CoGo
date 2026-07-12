import { MapPin } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { FontSize, FontWeight, Palette, Spacing } from '@/shared/theme';

type RouteTimelineProps = {
  origin: string;
  destination: string;
  pickupLabel: string;
  dropoffLabel: string;
  destIcon?: 'dot' | 'pin';
};

export function RouteTimeline({
  origin,
  destination,
  pickupLabel,
  dropoffLabel,
  destIcon = 'dot',
}: RouteTimelineProps) {
  return (
    <View style={styles.row}>
      <View style={styles.timelineCol}>
        <View style={styles.originDot} />
        <View style={styles.connectingLine} />
        {destIcon === 'pin' ? (
          <MapPin color={Palette.primary} size={14} />
        ) : (
          <View style={styles.destDot} />
        )}
      </View>
      <View style={styles.textCol}>
        <View>
          <Text style={styles.label}>{pickupLabel}</Text>
          <Text numberOfLines={1} style={styles.value}>
            {origin}
          </Text>
        </View>
        <View>
          <Text style={styles.label}>{dropoffLabel}</Text>
          <Text numberOfLines={1} style={styles.value}>
            {destination}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.lg,
  },
  timelineCol: {
    alignItems: 'center',
    paddingTop: 4,
  },
  originDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Palette.text,
  },
  connectingLine: {
    width: 2,
    height: 40,
    backgroundColor: Palette.border,
    marginVertical: 6,
  },
  destDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Palette.primary,
  },
  textCol: {
    flex: 1,
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  label: {
    color: Palette.textSecondary,
    fontSize: FontSize.sm,
    marginBottom: 4,
  },
  value: {
    color: Palette.text,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.semibold,
  },
});
