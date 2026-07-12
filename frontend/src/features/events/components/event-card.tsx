import { Image } from 'expo-image';
import { Calendar, MapPin } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { CultucatEventDto } from '@/features/events/types';
import { formatDistanceKm, formatEventDate } from '@/features/events/utils/format';
import { type Lang, toLang } from '@/shared/i18n';
import { FontSize, FontWeight, Palette, Radii, Shadow, Spacing } from '@/shared/theme';

type EventCardProps = {
  event: CultucatEventDto;
  onPress: (event: CultucatEventDto) => void;
  /**
   * `list` (default): horizontal card with a small image on the left. Used in
   * full-width vertical lists. `carousel`: fixed-width vertical card with a
   * wide image on top. Used inside horizontal scroll sections.
   */
  variant?: 'list' | 'carousel';
};

export function EventCard({ event, onPress, variant = 'list' }: EventCardProps) {
  const { i18n, t } = useTranslation();
  const lang = (toLang(i18n.resolvedLanguage) ?? 'es') as Lang;
  const date = formatEventDate(event.startDate, lang);
  const placeLine = [event.location, event.municipality].filter(Boolean).join(' · ');
  const distance =
    typeof event.distanceFromOriginKm === 'number'
      ? t('events.card.distance', { km: formatDistanceKm(event.distanceFromOriginKm, lang) })
      : '';
  const isCarousel = variant === 'carousel';

  return (
    <Pressable
      accessibilityLabel={event.title}
      accessibilityRole="button"
      onPress={() => onPress(event)}
      style={({ pressed }) => [
        isCarousel ? styles.cardCarousel : styles.card,
        pressed && styles.cardPressed,
      ]}
    >
      {event.imageUrl ? (
        <Image
          contentFit="cover"
          source={{ uri: event.imageUrl }}
          style={isCarousel ? styles.imageCarousel : styles.image}
        />
      ) : (
        <View style={[isCarousel ? styles.imageCarousel : styles.image, styles.imagePlaceholder]} />
      )}
      <View style={isCarousel ? styles.bodyCarousel : styles.body}>
        <Text numberOfLines={2} style={styles.title}>
          {event.title}
        </Text>
        {date ? (
          <View style={styles.metaRow}>
            <Calendar color={Palette.textSecondary} size={14} strokeWidth={2.2} />
            <Text numberOfLines={1} style={styles.metaText}>
              {date}
            </Text>
          </View>
        ) : null}
        {placeLine ? (
          <View style={styles.metaRow}>
            <MapPin color={Palette.textSecondary} size={14} strokeWidth={2.2} />
            <Text numberOfLines={1} style={styles.metaText}>
              {placeLine}
            </Text>
          </View>
        ) : null}
        {distance ? <Text style={styles.distance}>{distance}</Text> : null}
      </View>
    </Pressable>
  );
}

const IMAGE_SIZE = 72;
const CAROUSEL_CARD_WIDTH = 240;
const CAROUSEL_IMAGE_HEIGHT = 120;

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radii.xl,
    backgroundColor: Palette.card,
    borderWidth: 1,
    borderColor: Palette.border,
    ...Shadow.cardSoft,
  },
  cardCarousel: {
    width: CAROUSEL_CARD_WIDTH,
    borderRadius: Radii.xl,
    backgroundColor: Palette.card,
    borderWidth: 1,
    borderColor: Palette.border,
    overflow: 'hidden',
    ...Shadow.cardSoft,
  },
  cardPressed: {
    opacity: 0.92,
  },
  image: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
    borderRadius: Radii.md,
    backgroundColor: Palette.backgroundMuted,
  },
  imageCarousel: {
    width: '100%',
    height: CAROUSEL_IMAGE_HEIGHT,
    backgroundColor: Palette.backgroundMuted,
  },
  imagePlaceholder: {
    backgroundColor: Palette.backgroundMuted,
  },
  body: {
    flex: 1,
    gap: Spacing.xs,
    justifyContent: 'center',
  },
  bodyCarousel: {
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  title: {
    color: Palette.text,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  metaText: {
    color: Palette.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    flexShrink: 1,
  },
  distance: {
    color: Palette.primary,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    marginTop: Spacing.xs,
  },
});
