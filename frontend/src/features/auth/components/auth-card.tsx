import { type ReactNode } from 'react';
import { StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';

import { Palette, Radii, Shadow, Spacing } from '@/shared/theme';

type AuthCardProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export default function AuthCard({ children, style }: AuthCardProps) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    backgroundColor: Palette.card,
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: Palette.border,
    paddingHorizontal: Spacing.xl,
    paddingTop: 28,
    paddingBottom: Spacing.xl,
    ...Shadow.authCard,
  },
});
