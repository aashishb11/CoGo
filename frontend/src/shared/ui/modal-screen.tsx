import { Link } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { Palette, Radii, Spacing, Typography } from '@/shared/theme';

export default function ModalScreen() {
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('modal.title')}</Text>
      <Link href="/" dismissTo style={styles.link}>
        <Text style={styles.linkText}>{t('modal.goHome.link')}</Text>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    backgroundColor: Palette.background,
  },
  title: {
    ...Typography.title,
    color: Palette.text,
  },
  link: {
    marginTop: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: Radii.sm,
  },
  linkText: {
    ...Typography.body,
    color: Palette.primary,
  },
});
