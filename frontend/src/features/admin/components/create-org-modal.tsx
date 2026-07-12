import { zodResolver } from '@hookform/resolvers/zod';
import { Building2, X } from 'lucide-react-native';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { z } from 'zod';

import { useCreateOrganization } from '../queries';
import { CreateOrgSchema, type CreateOrgFormValues } from '../schemas';

import { mapErrorToMessageKey } from '@/shared/api';
import { Palette, Radii, Shadow, Spacing } from '@/shared/theme';
import { formStyles } from '@/shared/theme/form-styles';
import { translateZodMessage } from '@/shared/utils/zod-error-map';

type Props = {
  visible: boolean;
  onClose: () => void;
  onCreated?: () => void;
};

export function CreateOrgModal({ visible, onClose, onCreated }: Props) {
  const { t } = useTranslation();
  const createOrg = useCreateOrganization();

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateOrgFormValues, unknown, z.output<typeof CreateOrgSchema>>({
    resolver: zodResolver(CreateOrgSchema),
    defaultValues: { name: '', domain: '' },
  });

  function handleClose() {
    if (isSubmitting || createOrg.isPending) return;
    reset({ name: '', domain: '' });
    createOrg.reset();
    onClose();
  }

  const onSubmit = handleSubmit(async (values) => {
    try {
      await createOrg.mutateAsync(values);
      reset({ name: '', domain: '' });
      onCreated?.();
      onClose();
    } catch {
      // error surfaced via createOrg.error
    }
  });

  const submitErrorKey = createOrg.error ? mapErrorToMessageKey(createOrg.error) : null;

  return (
    <Modal animationType="fade" onRequestClose={handleClose} transparent visible={visible}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <Pressable onPress={handleClose} style={StyleSheet.absoluteFill} />

        <View style={styles.popup}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.iconCircle}>
                <Building2 color={Palette.primary} size={18} />
              </View>
              <Text style={styles.title}>{t('admin.org.create.title')}</Text>
            </View>
            <Pressable hitSlop={12} onPress={handleClose} style={styles.closeBtn}>
              <X color={Palette.textSecondary} size={20} />
            </Pressable>
          </View>

          <View style={styles.body}>
            <View style={formStyles.field}>
              <Text style={formStyles.label}>{t('admin.org.create.name.label')}</Text>
              <Controller
                control={control}
                name="name"
                render={({ field: { value, onChange, onBlur } }) => (
                  <TextInput
                    autoCapitalize="words"
                    autoCorrect={false}
                    onBlur={onBlur}
                    onChangeText={onChange}
                    placeholder={t('admin.org.create.name.placeholder')}
                    placeholderTextColor={Palette.textSecondary}
                    style={[formStyles.input, errors.name && formStyles.inputError]}
                    value={value}
                  />
                )}
              />
              {errors.name?.message ? (
                <Text style={formStyles.errorText}>{translateZodMessage(errors.name.message)}</Text>
              ) : null}
            </View>

            <View style={formStyles.field}>
              <Text style={formStyles.label}>{t('admin.org.create.domain.label')}</Text>
              <Controller
                control={control}
                name="domain"
                render={({ field: { value, onChange, onBlur } }) => (
                  <TextInput
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    onBlur={onBlur}
                    onChangeText={onChange}
                    placeholder={t('admin.org.create.domain.placeholder')}
                    placeholderTextColor={Palette.textSecondary}
                    style={[formStyles.input, errors.domain && formStyles.inputError]}
                    value={value}
                  />
                )}
              />
              {errors.domain?.message ? (
                <Text style={formStyles.errorText}>
                  {translateZodMessage(errors.domain.message)}
                </Text>
              ) : null}
            </View>

            {submitErrorKey ? <Text style={formStyles.formError}>{t(submitErrorKey)}</Text> : null}

            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                disabled={createOrg.isPending}
                onPress={handleClose}
                style={({ pressed }) => [
                  formStyles.secondaryButton,
                  styles.actionButton,
                  pressed && !createOrg.isPending && formStyles.primaryButtonPressed,
                ]}
              >
                <Text style={formStyles.secondaryButtonText}>{t('admin.org.create.cancel')}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={createOrg.isPending}
                onPress={() => {
                  void onSubmit();
                }}
                style={({ pressed }) => [
                  formStyles.primaryButton,
                  styles.actionButton,
                  pressed && !createOrg.isPending && formStyles.primaryButtonPressed,
                  createOrg.isPending && formStyles.primaryButtonDisabled,
                ]}
              >
                {createOrg.isPending ? (
                  <ActivityIndicator color={Palette.textOnPrimary} size="small" />
                ) : (
                  <Text style={formStyles.primaryButtonText}>{t('admin.org.create.submit')}</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Palette.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  popup: {
    width: '100%',
    maxWidth: 460,
    backgroundColor: Palette.card,
    borderRadius: Radii.xl,
    overflow: 'hidden',
    ...Shadow.authCard,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Palette.border,
    gap: Spacing.md,
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Palette.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    color: Palette.text,
    fontSize: 17,
    fontWeight: '700',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Palette.backgroundMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  body: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  actionButton: {
    flex: 1,
  },
});
