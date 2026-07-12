import { Map, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { FontSize, FontWeight, Palette, Spacing, Typography } from '@/shared/theme';
import { formStyles } from '@/shared/theme/form-styles';

type LocationPickerModalProps = {
  apiKey: string;
  cancelLabel: string;
  confirmLabel: string;
  hintLabel: string;
  loadingLabel: string;
  onClose: () => void;
  onConfirm: (location: { latitude: number; longitude: number; address: string }) => void;
  title: string;
  visible: boolean;
  initialCenter?: {
    latitude: number;
    longitude: number;
  } | null;
};

export function LocationPickerModal({
  cancelLabel,
  onClose,
  title,
  visible,
}: LocationPickerModalProps) {
  const { t } = useTranslation();
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent={false} visible={visible}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Pressable
            accessibilityLabel={cancelLabel}
            accessibilityRole="button"
            hitSlop={10}
            onPress={onClose}
            style={({ pressed }) => [styles.closeButton, pressed && styles.closeButtonPressed]}
          >
            <X color={Palette.text} size={22} />
          </Pressable>
          <Text numberOfLines={1} style={styles.title}>
            {title}
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.content}>
          <View style={styles.iconCircle}>
            <Map color={Palette.primaryDark} size={32} />
          </View>
          <Text style={styles.mainText}>{t('createTrip.mapPicker.webUnavailable.title')}</Text>
          <Text style={styles.subText}>{t('createTrip.mapPicker.webUnavailable.description')}</Text>

          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [
              formStyles.secondaryButton,
              styles.actionButton,
              pressed && styles.secondaryButtonPressed,
            ]}
          >
            <Text style={formStyles.secondaryButtonText}>{cancelLabel}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Palette.background,
  },
  header: {
    minHeight: 64,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    paddingTop: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Palette.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.backgroundMuted,
  },
  closeButtonPressed: {
    opacity: 0.85,
  },
  headerSpacer: {
    width: 36,
    height: 36,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    color: Palette.text,
    fontSize: FontSize.xl,
    lineHeight: 22,
    fontWeight: FontWeight.bold,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.xxl,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.primarySurface,
    marginBottom: Spacing.sm,
  },
  mainText: {
    ...Typography.titleSmall,
    color: Palette.text,
    textAlign: 'center',
  },
  subText: {
    ...Typography.bodySmall,
    color: Palette.textSecondary,
    textAlign: 'center',
  },
  actionButton: {
    width: undefined,
    minWidth: 200,
    marginTop: Spacing.lg,
  },
  secondaryButtonPressed: {
    opacity: 0.85,
  },
});
