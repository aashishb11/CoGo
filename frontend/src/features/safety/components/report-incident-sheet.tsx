import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useCreateRideIncident } from '@/features/safety/queries';
import { IncidentCategorySchema, type IncidentCategory } from '@/features/safety/schemas';
import { mapErrorToMessageKey } from '@/shared/api';
import { FontSize, FontWeight, Palette, Radii, Spacing, Typography } from '@/shared/theme';
import { formStyles } from '@/shared/theme/form-styles';
import { BottomDrawer } from '@/shared/ui/components/bottom-drawer';
import { Toast, type ToastKind } from '@/shared/ui/components/toast';

const NOTE_MAX = 1000;
const CATEGORIES: IncidentCategory[] = IncidentCategorySchema.options;

type ReportIncidentSheetProps = {
  visible: boolean;
  onClose: () => void;
  rideId: string;
  onSuccess?: () => void;
};

// Self-contained incident reporter. Same UX shape as RateCounterpartySheet:
// the sheet hosts the form, transitions to a success panel after a successful
// POST (so the Toast has time to render before the parent route unmounts),
// and surfaces backend errors inline via mapErrorToMessageKey.
export function ReportIncidentSheet({
  visible,
  onClose,
  rideId,
  onSuccess,
}: ReportIncidentSheetProps) {
  const { t } = useTranslation();
  const create = useCreateRideIncident();

  const [category, setCategory] = useState<IncidentCategory | null>(null);
  const [note, setNote] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [toast, setToast] = useState<{ kind: ToastKind; message: string } | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    if (visible) {
      setCategory(null);
      setNote('');
      setSubmitted(false);
      setToast(null);
    }
  }, [visible]);

  async function handleSubmit() {
    if (!category) return;
    try {
      await create.mutateAsync({
        rideId,
        input: {
          category,
          note: note.trim() ? note.trim() : undefined,
        },
      });
      setSubmitted(true);
      onSuccess?.();
    } catch (error) {
      setToast({ kind: 'error', message: t(mapErrorToMessageKey(error)) });
    }
  }

  const isSubmitting = create.isPending;
  const canSubmit = Boolean(category) && !isSubmitting;

  return (
    <>
      <BottomDrawer
        accessibilityLabel={t('safety.incidents.report.title')}
        onClose={onClose}
        title={t('safety.incidents.report.title')}
        visible={visible}
      >
        {submitted ? (
          <View style={styles.successWrap}>
            <Text style={styles.successText}>{t('safety.incidents.report.success')}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => [
                formStyles.primaryButton,
                styles.successCta,
                pressed && formStyles.primaryButtonPressed,
              ]}
            >
              <Text style={formStyles.primaryButtonText}>{t('common.action.close')}</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Text style={styles.subtitle}>{t('safety.incidents.report.subtitle')}</Text>

            <View style={styles.section}>
              <Text style={styles.label}>{t('safety.incidents.report.categoryLabel')}</Text>
              <View style={styles.categoryGrid}>
                {CATEGORIES.map((value) => {
                  const selected = category === value;
                  return (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      disabled={isSubmitting}
                      key={value}
                      onPress={() => setCategory(value)}
                      style={({ pressed }) => [
                        styles.categoryChip,
                        selected && styles.categoryChipActive,
                        pressed && !isSubmitting && styles.categoryChipPressed,
                      ]}
                    >
                      <Text
                        style={[styles.categoryChipText, selected && styles.categoryChipTextActive]}
                      >
                        {t(`safety.incidents.category.${value}` as const)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.label}>{t('safety.incidents.report.noteLabel')}</Text>
              <TextInput
                editable={!isSubmitting}
                maxLength={NOTE_MAX}
                multiline
                onChangeText={setNote}
                placeholder={t('safety.incidents.report.notePlaceholder')}
                placeholderTextColor={Palette.textSecondary}
                style={[formStyles.input, formStyles.inputMultiline]}
                value={note}
              />
            </View>

            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                disabled={isSubmitting}
                onPress={onClose}
                style={({ pressed }) => [
                  formStyles.secondaryButton,
                  styles.actionButton,
                  pressed && !isSubmitting && styles.actionPressed,
                ]}
              >
                <Text style={formStyles.secondaryButtonText}>
                  {t('safety.incidents.report.cancel')}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={!canSubmit}
                onPress={() => {
                  void handleSubmit();
                }}
                style={({ pressed }) => [
                  formStyles.primaryButton,
                  styles.actionButton,
                  pressed && canSubmit && formStyles.primaryButtonPressed,
                  !canSubmit && formStyles.primaryButtonDisabled,
                ]}
              >
                {isSubmitting ? (
                  <View style={formStyles.loadingRow}>
                    <ActivityIndicator color={Palette.textOnPrimary} size="small" />
                    <Text style={formStyles.primaryButtonText}>
                      {t('safety.incidents.report.submitting')}
                    </Text>
                  </View>
                ) : (
                  <Text style={formStyles.primaryButtonText}>
                    {t('safety.incidents.report.submit')}
                  </Text>
                )}
              </Pressable>
            </View>
          </>
        )}
      </BottomDrawer>

      <Toast
        kind={toast?.kind ?? 'error'}
        message={toast?.message ?? ''}
        onDismiss={dismissToast}
        visible={toast !== null}
      />
    </>
  );
}

const styles = StyleSheet.create({
  subtitle: {
    ...Typography.body,
    color: Palette.textSecondary,
    marginBottom: Spacing.lg,
  },
  section: {
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  label: {
    ...Typography.label,
    color: Palette.text,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  categoryChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radii.pill,
    borderWidth: 1,
    borderColor: Palette.border,
    backgroundColor: Palette.card,
  },
  categoryChipActive: {
    borderColor: Palette.danger,
    backgroundColor: Palette.dangerSurface,
  },
  categoryChipPressed: {
    opacity: 0.8,
  },
  categoryChipText: {
    color: Palette.text,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
  categoryChipTextActive: {
    color: Palette.danger,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  actionButton: {
    flex: 1,
  },
  actionPressed: {
    opacity: 0.85,
  },
  successWrap: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    gap: Spacing.md,
  },
  successText: {
    ...Typography.title,
    color: Palette.text,
    textAlign: 'center',
  },
  successCta: {
    alignSelf: 'stretch',
    marginTop: Spacing.md,
  },
});
