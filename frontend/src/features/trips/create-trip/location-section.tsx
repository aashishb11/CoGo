import { Ticket } from 'lucide-react-native';
import { Controller, type Control, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { type SelectedPlace } from './place-autocomplete-input';
import { createTripStyles as styles } from './styles';
import { type CreateTripFormValues } from './use-create-trip';

import { RouteCard } from '@/features/trips/components/route-card';
import { type MapLocation } from '@/features/trips/create-trip/types';
import { LocationField } from '@/features/trips/location-picker/location-field';
import { FontSize, FontWeight, Palette, Radii, Shadow, Spacing } from '@/shared/theme';

type Props = {
  apiKey: string;
  control: Control<CreateTripFormValues>;
  originLocation: MapLocation | null;
  destinationLocation: MapLocation | null;
  onSelectOriginPlace: (place: SelectedPlace) => void;
  onSelectDestinationPlace: (place: SelectedPlace) => void;
  /** Optional clear handlers wired through to each `LocationField`. */
  onClearOriginPlace?: () => void;
  onClearDestinationPlace?: () => void;
  onSwap?: () => void;
  /** When set, the destination row becomes a read-only display showing the event venue name. */
  lockedDestinationLabel?: string;
};

export function LocationSection({
  apiKey,
  control,
  originLocation,
  destinationLocation,
  onSelectOriginPlace,
  onSelectDestinationPlace,
  onClearOriginPlace,
  onClearDestinationPlace,
  onSwap,
  lockedDestinationLabel,
}: Props) {
  const { t } = useTranslation();

  const originValue = (useWatch({ control, name: 'origin' }) as string | undefined) ?? '';
  const destinationValue = (useWatch({ control, name: 'destination' }) as string | undefined) ?? '';

  const destinationLocked = Boolean(lockedDestinationLabel);

  return (
    <View style={localStyles.section}>
      <Text style={localStyles.sectionTitle}>{t('createTrip.routeSection.title')}</Text>
      <Controller
        control={control}
        name="origin"
        render={({ fieldState: originState }) => (
          <Controller
            control={control}
            name="destination"
            render={({ fieldState: destState }) => (
              <>
                {destinationLocked ? (
                  <LockedDestinationCard
                    apiKey={apiKey}
                    hasError={Boolean(originState.error)}
                    label={lockedDestinationLabel!}
                    onClearOriginPlace={onClearOriginPlace}
                    onSelectOriginPlace={onSelectOriginPlace}
                    originLocation={originLocation}
                    originValue={originValue}
                  />
                ) : (
                  <RouteCard
                    apiKey={apiKey}
                    destination={{
                      rowLabel: t('createTrip.destination.cardLabel'),
                      placeholder: t('createTrip.destination.placeholder'),
                      value: destinationValue,
                      initialCenter: destinationLocation,
                      drawerTitle: t('createTrip.destination.cardLabel'),
                      mapTitle: t('createTrip.mapPicker.destinationTitle'),
                      onClear: onClearDestinationPlace,
                      onSelectPlace: onSelectDestinationPlace,
                    }}
                    hasError={Boolean(originState.error || destState.error)}
                    onSwap={onSwap}
                    origin={{
                      rowLabel: t('createTrip.origin.cardLabel'),
                      placeholder: t('createTrip.origin.placeholder'),
                      value: originValue,
                      initialCenter: originLocation,
                      drawerTitle: t('createTrip.origin.cardLabel'),
                      mapTitle: t('createTrip.mapPicker.originTitle'),
                      onClear: onClearOriginPlace,
                      onSelectPlace: onSelectOriginPlace,
                    }}
                    swapAccessibilityLabel={t('createTrip.routeSection.swap')}
                  />
                )}
                {originState.error || (!destinationLocked && destState.error) ? (
                  <Text style={styles.errorText}>{t('createTrip.routeSection.required')}</Text>
                ) : null}
              </>
            )}
          />
        )}
      />
    </View>
  );
}

type LockedDestinationCardProps = {
  apiKey: string;
  label: string;
  originValue: string;
  originLocation: MapLocation | null;
  onSelectOriginPlace: (place: SelectedPlace) => void;
  onClearOriginPlace?: () => void;
  hasError: boolean;
};

function LockedDestinationCard({
  apiKey,
  label,
  originValue,
  originLocation,
  onSelectOriginPlace,
  onClearOriginPlace,
  hasError,
}: LockedDestinationCardProps) {
  const { t } = useTranslation();
  return (
    <View style={[localStyles.mixedCard, hasError && localStyles.mixedCardError]}>
      <LocationField
        apiKey={apiKey}
        dot="origin"
        drawerTitle={t('createTrip.origin.cardLabel')}
        initialCenter={originLocation}
        mapTitle={t('createTrip.mapPicker.originTitle')}
        onClear={onClearOriginPlace}
        onSelectPlace={onSelectOriginPlace}
        placeholder={t('createTrip.origin.placeholder')}
        rowLabel={t('createTrip.origin.cardLabel')}
        value={originValue}
      />
      <View style={localStyles.mixedDivider} />
      {/* Locked destination — not tappable, backend-validated to event coords */}
      <View
        accessibilityLabel={`${t('createTrip.eventDestinationLabel')}: ${label}`}
        accessible
        style={localStyles.lockedRow}
      >
        <View style={localStyles.lockedDot}>
          <Ticket color={Palette.primaryDark} size={12} />
        </View>
        <View style={localStyles.lockedBody}>
          <Text style={localStyles.lockedRowLabel}>{t('createTrip.eventDestinationLabel')}</Text>
          <Text numberOfLines={1} style={localStyles.lockedRowValue}>
            {label}
          </Text>
        </View>
      </View>
    </View>
  );
}

const localStyles = StyleSheet.create({
  section: {
    gap: Spacing.md,
  },
  sectionTitle: {
    color: Palette.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: Spacing.xs,
  },
  mixedCard: {
    backgroundColor: Palette.card,
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: Palette.border,
    paddingHorizontal: Spacing.lg,
    ...Shadow.cardSoft,
  },
  mixedCardError: {
    borderColor: Palette.danger,
  },
  mixedDivider: {
    height: 1,
    backgroundColor: Palette.border,
    marginLeft: 12 + Spacing.md,
  },
  lockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    minHeight: 60,
  },
  lockedDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.primarySurface,
  },
  lockedBody: {
    flex: 1,
    minWidth: 0,
  },
  lockedRowLabel: {
    color: Palette.primaryDark,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  lockedRowValue: {
    color: Palette.primaryDark,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.semibold,
  },
});
