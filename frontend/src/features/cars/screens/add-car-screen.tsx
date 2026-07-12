import { useRouter } from 'expo-router';
import { X } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useRequireAuth } from '@/features/auth/queries';
import { CarForm } from '@/features/cars/forms/car-form';
import { useCreateCar } from '@/features/cars/queries';
import type { CreateCarInput } from '@/features/cars/schemas';
import { mapErrorToMessageKey } from '@/shared/api';
import { Palette, Spacing, Typography } from '@/shared/theme';

export default function AddCarScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const session = useRequireAuth();
  const userId = session.data?.user?.id ?? null;
  const createCarMutation = useCreateCar(userId);

  const [formError, setFormError] = useState<string | null>(null);

  function handleClose() {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/cars');
  }

  async function handleSubmit(data: CreateCarInput) {
    setFormError(null);
    if (!userId) return;
    try {
      await createCarMutation.mutateAsync(data);
      handleClose();
    } catch (error) {
      setFormError(t(mapErrorToMessageKey(error)));
    }
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>{t('manageCars.form.title')}</Text>
        </View>
        <Pressable
          accessibilityLabel={t('manageCars.delete.confirm.cancel')}
          hitSlop={10}
          onPress={handleClose}
          style={styles.closeButton}
        >
          <X color={Palette.text} size={22} />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom, Spacing.lg) + Spacing.lg },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <CarForm formError={formError} onCancel={handleClose} onSubmit={handleSubmit} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Palette.background,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xxl,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Palette.border,
  },
  headerLeft: {
    flex: 1,
  },
  title: {
    ...Typography.title,
    color: Palette.text,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Palette.backgroundMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: Spacing.xxl,
    paddingTop: Spacing.lg,
  },
});
