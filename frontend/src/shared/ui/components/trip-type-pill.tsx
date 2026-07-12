import { Calendar, Repeat } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { FontSize, FontWeight, Palette } from '@/shared/theme';

type TripTypePillProps = {
  type: 'recurring' | 'sporadic';
  label: string;
};

export function TripTypePill({ type, label }: TripTypePillProps) {
  const Icon = type === 'recurring' ? Repeat : Calendar;
  return (
    <View style={styles.row}>
      <Icon color={Palette.textSecondary} size={11} />
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  text: {
    color: Palette.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
  },
});
