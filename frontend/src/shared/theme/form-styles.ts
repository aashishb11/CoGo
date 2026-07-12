import { StyleSheet } from 'react-native';

import { FontWeight, Palette, Radii, Spacing, Typography } from './index';

export const formStyles = StyleSheet.create({
  field: {
    gap: Spacing.sm,
  },
  label: {
    ...Typography.label,
    color: Palette.text,
  },
  input: {
    width: '100%',
    minHeight: 52,
    borderWidth: 1,
    borderColor: Palette.border,
    borderRadius: Radii.md,
    backgroundColor: Palette.card,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    ...Typography.body,
    color: Palette.text,
  },
  inputMultiline: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  inputError: {
    borderColor: Palette.danger,
  },
  errorText: {
    ...Typography.bodySmall,
    color: Palette.danger,
    fontWeight: FontWeight.medium,
  },
  formError: {
    ...Typography.bodySmall,
    color: Palette.danger,
    fontWeight: FontWeight.medium,
    paddingHorizontal: Spacing.xs,
  },
  successText: {
    ...Typography.bodySmall,
    color: Palette.success,
    fontWeight: FontWeight.semibold,
  },
  primaryButton: {
    width: '100%',
    minHeight: 52,
    borderRadius: Radii.md,
    backgroundColor: Palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  primaryButtonPressed: {
    opacity: 0.88,
  },
  primaryButtonDisabled: {
    opacity: 0.55,
  },
  primaryButtonText: {
    ...Typography.button,
    color: Palette.textOnPrimary,
  },
  secondaryButton: {
    width: '100%',
    minHeight: 52,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Palette.border,
    backgroundColor: Palette.card,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  secondaryButtonText: {
    ...Typography.button,
    color: Palette.text,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    minHeight: 52,
  },
  loadingText: {
    ...Typography.bodySmall,
    color: Palette.textSecondary,
    fontWeight: FontWeight.medium,
  },
  passwordToggle: {
    position: 'absolute',
    right: Spacing.md,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
  },
  passwordFieldWrapper: {
    position: 'relative',
  },
  inputWithIcon: {
    paddingRight: 48,
  },
});
