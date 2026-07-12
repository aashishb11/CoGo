import { StyleSheet } from 'react-native';

import { FontSize, FontWeight, Palette, Radii, Shadow, Spacing } from '@/shared/theme';

// Section-scoped styles for the create-trip feature. Kept local because the
// vocabulary (role toggle, weekday chips, preference pills) is unique to this
// screen.
export const createTripStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Palette.backgroundMuted,
  },
  container: {
    width: '100%',
    maxWidth: 1120,
    alignSelf: 'center',
    paddingHorizontal: Spacing.xxl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xxl + Spacing.md,
    // Spacing rule (shared with find-trips): the gap between sections is
    // `Spacing.xxxl` (32). Each section's internal title→content gap is
    // `Spacing.sm` (8). The 4× ratio groups each title tightly with its
    // card and leaves generous breathing room above.
    gap: Spacing.xxxl,
  },
  card: {
    backgroundColor: Palette.card,
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: Palette.border,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xl,
    ...Shadow.cardSoft,
  },
  cardCompact: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
  },
  // Canonical section-title style. Compact uppercase kicker so each card
  // beneath the title remains the visual anchor. Used by find-trips and
  // create-trip (route, schedule, vehicle, preferences). The title→content
  // gap is owned by the section's wrapping `<View>` (Spacing.sm) — adding
  // a marginBottom here would double-count it.
  label: {
    color: Palette.textSecondary,
    fontSize: FontSize.xs,
    lineHeight: 16,
    fontWeight: FontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: Spacing.xs,
  },
  inputShell: {
    minHeight: 60,
    borderRadius: Radii.lg,
    backgroundColor: Palette.card,
    borderWidth: 1,
    borderColor: Palette.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm + 2,
  },
  inputShellError: {
    borderColor: Palette.danger,
  },
  inputShellReadOnly: {
    opacity: 0.55,
  },
  lockedNotice: {
    marginTop: Spacing.sm,
    color: Palette.textSecondary,
    fontSize: FontSize.base,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  input: {
    flex: 1,
    color: Palette.text,
    fontSize: FontSize.xl,
    lineHeight: 22,
    fontWeight: FontWeight.medium,
  },
  errorText: {
    marginTop: Spacing.xs + 2,
    color: Palette.danger,
    fontSize: FontSize.base,
    lineHeight: 18,
    fontWeight: FontWeight.medium,
  },
  pickOnMapButton: {
    marginTop: Spacing.sm,
    alignSelf: 'flex-start',
    minHeight: 36,
    borderRadius: Radii.sm + 2,
    borderWidth: 1,
    borderColor: Palette.border,
    backgroundColor: Palette.primarySurface,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  pickOnMapButtonPressed: {
    opacity: 0.88,
  },
  pickOnMapButtonText: {
    color: Palette.primaryDark,
    fontSize: FontSize.md,
    lineHeight: 20,
    fontWeight: FontWeight.bold,
  },
  weekdaysRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm + 2,
  },
  dayChip: {
    height: 36,
    borderRadius: Radii.lg,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: Palette.border,
    backgroundColor: Palette.card,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayChipSelected: {
    backgroundColor: Palette.primarySurface,
    borderColor: Palette.primary,
  },
  dayChipText: {
    color: Palette.text,
    fontSize: FontSize.lg,
    lineHeight: 20,
    fontWeight: FontWeight.semibold,
  },
  dayChipTextSelected: {
    color: Palette.primaryDark,
  },
  preferencesCard: {
    gap: Spacing.md,
  },
  preferenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm + 2,
  },
  preferenceStack: {
    gap: Spacing.sm,
  },
  preferenceLabel: {
    color: Palette.text,
    fontSize: FontSize.lg,
    lineHeight: 20,
    fontWeight: FontWeight.semibold,
  },
  preferenceLabelWithIcon: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  preferenceSwitchBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  preferenceValue: {
    color: Palette.textSecondary,
    fontSize: FontSize.base,
    lineHeight: 18,
    fontWeight: FontWeight.bold,
    minWidth: 24,
    textAlign: 'right',
  },
  musicPillsRow: {
    marginTop: 2,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  musicPill: {
    minHeight: 34,
    borderRadius: Radii.pill,
    borderWidth: 1,
    borderColor: Palette.border,
    backgroundColor: Palette.card,
    paddingHorizontal: Spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  musicPillText: {
    color: Palette.text,
    fontSize: FontSize.base,
    lineHeight: 18,
    fontWeight: FontWeight.bold,
  },
  submitButton: {
    // No marginTop — the parent screen's section gap (Spacing.xxxl, 32)
    // already provides the spacing above the CTA, matching the gap
    // between every other section above it.
    height: 60,
    borderRadius: Radii.lg,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.primary,
  },
  submitButtonPressed: {
    opacity: 0.92,
  },
  submitButtonDisabled: {
    opacity: 0.55,
  },
  submitButtonText: {
    color: Palette.textOnPrimary,
    fontSize: FontSize['2xl'],
    lineHeight: 24,
    fontWeight: FontWeight.extrabold,
  },
  backendErrorText: {
    marginTop: Spacing.sm + 2,
    color: Palette.danger,
    fontSize: FontSize.base,
    lineHeight: 18,
    fontWeight: FontWeight.semibold,
  },
  submitButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  secondaryButton: {
    marginTop: Spacing.md,
    minHeight: 52,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Palette.primary,
    backgroundColor: Palette.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  secondaryButtonPressed: {
    opacity: 0.85,
  },
  secondaryButtonText: {
    color: Palette.primaryDark,
    fontSize: FontSize.xl,
    lineHeight: 22,
    fontWeight: FontWeight.bold,
  },
  vehicleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm + 2,
  },
  vehicleOption: {
    minHeight: 56,
    minWidth: 170,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 1,
    borderWidth: 1,
    borderColor: Palette.border,
    backgroundColor: Palette.card,
    justifyContent: 'center',
  },
  vehicleOptionSelected: {
    backgroundColor: Palette.primarySurface,
    borderColor: Palette.primary,
  },
  vehicleOptionName: {
    color: Palette.text,
    fontSize: FontSize.md,
    lineHeight: 18,
    fontWeight: FontWeight.semibold,
  },
  vehicleOptionPlate: {
    color: Palette.textSecondary,
    fontSize: FontSize.sm,
    lineHeight: 16,
    fontWeight: FontWeight.semibold,
    marginTop: 2,
  },
  vehicleOptionTextSelected: {
    color: Palette.primaryDark,
  },
  vehicleEmptyText: {
    color: Palette.textSecondary,
    fontSize: FontSize.base,
    lineHeight: 18,
    fontWeight: FontWeight.medium,
  },
  vehicleAddButton: {
    minHeight: 56,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.lg,
    borderWidth: 1,
    borderColor: Palette.primary,
    borderStyle: 'dashed',
    backgroundColor: Palette.primarySurface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  vehicleAddButtonText: {
    color: Palette.primaryDark,
    fontSize: FontSize.lg,
    lineHeight: 20,
    fontWeight: FontWeight.bold,
  },
  vehicleAddPill: {
    minHeight: 56,
    minWidth: 170,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 1,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Palette.primary,
    backgroundColor: Palette.primarySurface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  vehicleAddPillText: {
    color: Palette.primaryDark,
    fontSize: FontSize.md,
    lineHeight: 18,
    fontWeight: FontWeight.bold,
  },
});
