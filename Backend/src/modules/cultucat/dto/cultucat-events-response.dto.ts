import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EXTERNAL_EVENT_PROVIDERS } from '@shared/external-events/external-event.types';

export class CultucatTaxonomyItemDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 'Music' })
  name!: string;
}

export class CultucatExternalEventContextDto {
  @ApiProperty({ enum: EXTERNAL_EVENT_PROVIDERS, example: 'cultucat' })
  provider!: (typeof EXTERNAL_EVENT_PROVIDERS)[number];

  @ApiProperty({ example: '8421' })
  eventId!: string;
}

export class CultucatEventResponseDto {
  @ApiProperty({
    description:
      "CultuCat's numeric event id as a string. Use it in `/api/cultucat/events/:eventId` and trip externalEventContext.",
    example: '8421',
  })
  eventId!: string;

  @ApiProperty({
    description: 'CultuCat externalId preserved from the upstream payload.',
    example: 'EV-12345',
  })
  externalId!: string;

  @ApiPropertyOptional({ example: 8421, nullable: true })
  providerNumericId!: number | null;

  @ApiProperty({ example: 'Spring Festival' })
  title!: string;

  @ApiPropertyOptional({ example: 'Special Edition', nullable: true })
  subtitle!: string | null;

  @ApiPropertyOptional({
    example: 'Cultural show with activities throughout the weekend.',
    nullable: true,
  })
  description!: string | null;

  @ApiPropertyOptional({
    example: '2026-05-10T18:00:00.000Z',
    nullable: true,
  })
  startDate!: Date | null;

  @ApiPropertyOptional({
    example: '2026-05-10T22:00:00.000Z',
    nullable: true,
  })
  endDate!: Date | null;

  @ApiPropertyOptional({ example: 'From 18:00 to 22:00', nullable: true })
  schedule!: string | null;

  @ApiPropertyOptional({
    example: 'https://cultucat.example/activity',
    nullable: true,
  })
  activityUrl!: string | null;

  @ApiPropertyOptional({
    example: 'https://cultucat.example/tickets',
    nullable: true,
  })
  ticketsUrl!: string | null;

  @ApiPropertyOptional({ example: 0, nullable: true })
  minPrice!: number | null;

  @ApiPropertyOptional({ example: 25, nullable: true })
  maxPrice!: number | null;

  @ApiPropertyOptional({ example: 'Free admission', nullable: true })
  priceInfo!: string | null;

  @ApiPropertyOptional({ example: 'In-person', nullable: true })
  modality!: string | null;

  @ApiPropertyOptional({
    example: 'https://cultucat.example/image.jpg',
    nullable: true,
  })
  imageUrl!: string | null;

  @ApiPropertyOptional({ example: 'Barcelonès', nullable: true })
  region!: string | null;

  @ApiPropertyOptional({ example: 'Barcelona', nullable: true })
  municipality!: string | null;

  @ApiPropertyOptional({ example: 'Parc del Forum', nullable: true })
  location!: string | null;

  @ApiPropertyOptional({ example: 41.4121, nullable: true })
  lat!: number | null;

  @ApiPropertyOptional({ example: 2.2194, nullable: true })
  lng!: number | null;

  @ApiPropertyOptional({
    description:
      'Great-circle distance from the selected origin to the event location when origin coordinates are supplied.',
    example: 4.63,
    nullable: true,
  })
  distanceFromOriginKm!: number | null;

  @ApiProperty({ type: () => CultucatTaxonomyItemDto, isArray: true })
  scopes!: CultucatTaxonomyItemDto[];

  @ApiProperty({ type: () => CultucatTaxonomyItemDto, isArray: true })
  categories!: CultucatTaxonomyItemDto[];

  @ApiProperty({
    type: () => CultucatExternalEventContextDto,
    description: 'Context payload the frontend can pass back to trip creation.',
  })
  externalEventContext!: CultucatExternalEventContextDto;
}

export class CultucatEventListResponseDto {
  @ApiProperty({ type: () => CultucatEventResponseDto, isArray: true })
  items!: CultucatEventResponseDto[];

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 247 })
  total!: number;

  @ApiProperty({ example: true })
  hasMore!: boolean;
}
