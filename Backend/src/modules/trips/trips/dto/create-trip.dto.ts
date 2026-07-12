import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDate,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
  Validate,
  ValidateNested,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
  type ValidationArguments,
} from 'class-validator';
import { Type } from 'class-transformer';
import { formatInTimeZone } from 'date-fns-tz';
import {
  EXTERNAL_EVENT_PROVIDERS,
  type ExternalEventContext,
} from '@shared/external-events/external-event.types';
import type {
  ConversationStyle,
  Location,
  MusicGenre,
  TripType,
} from '../../trips.types';
import {
  CONVERSATION_STYLES,
  MUSIC_GENRES,
  TRIP_TYPES,
} from '../../trips.types';
import { IsYmd } from './validators/is-ymd.validator';
import { MusicConsistent } from './validators/music-consistent.validator';

const SCHEDULE_TIMEZONE = 'Europe/Madrid';
const todayInScheduleTz = (): string =>
  formatInTimeZone(new Date(), SCHEDULE_TIMEZONE, 'yyyy-MM-dd');

export class LocationDto implements Location {
  @ApiProperty({ example: 'Plaça Catalunya' })
  @IsString()
  @IsNotEmpty()
  label!: string;

  @ApiProperty({ example: 41.387 })
  @IsNumber()
  lat!: number;

  @ApiProperty({ example: 2.17 })
  @IsNumber()
  lng!: number;
}

@ValidatorConstraint({ name: 'atLeastOneDay', async: false })
class AtLeastOneDayConstraint implements ValidatorConstraintInterface {
  validate(_: unknown, args: ValidationArguments) {
    const dto = args.object as RecurringDaysDto;
    return (
      dto.monday ||
      dto.tuesday ||
      dto.wednesday ||
      dto.thursday ||
      dto.friday ||
      dto.saturday ||
      dto.sunday
    );
  }
  defaultMessage() {
    return 'At least one day must be active';
  }
}

export class RecurringDaysDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  @Validate(AtLeastOneDayConstraint)
  monday!: boolean;

  @ApiProperty({ example: true })
  @IsBoolean()
  tuesday!: boolean;

  @ApiProperty({ example: true })
  @IsBoolean()
  wednesday!: boolean;

  @ApiProperty({ example: true })
  @IsBoolean()
  thursday!: boolean;

  @ApiProperty({ example: true })
  @IsBoolean()
  friday!: boolean;

  @ApiProperty({ example: false })
  @IsBoolean()
  saturday!: boolean;

  @ApiProperty({ example: false })
  @IsBoolean()
  sunday!: boolean;
}

export class RecurringScheduleDto {
  @ApiProperty({ type: () => RecurringDaysDto })
  @ValidateNested()
  @Type(() => RecurringDaysDto)
  daysOfWeek!: RecurringDaysDto;

  @ApiProperty({ example: '08:30' })
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'timeOfDay must be in HH:MM format',
  })
  timeOfDay!: string;
}

export class ExternalEventContextDto implements ExternalEventContext {
  @ApiProperty({ enum: EXTERNAL_EVENT_PROVIDERS, example: 'cultucat' })
  @IsIn(EXTERNAL_EVENT_PROVIDERS)
  provider!: ExternalEventContext['provider'];

  @ApiProperty({
    example: '8421',
    description:
      "CultuCat's numeric event id (as a string) returned by `/api/cultucat/events`.",
  })
  @IsString()
  @IsNotEmpty()
  eventId!: string;
}

@ValidatorConstraint({ name: 'tripTypeConsistency', async: false })
class TripTypeConstraint implements ValidatorConstraintInterface {
  validate(_: unknown, args: ValidationArguments) {
    const dto = args.object as CreateTripDto;
    if (dto.type === 'sporadic') {
      if (!dto.departureAt) return false;
      if (dto.schedule !== undefined) return false;
      if (dto.startDate !== undefined || dto.endDate !== undefined)
        return false;
      if (dto.departureAt.getTime() <= Date.now()) return false;
    }
    if (dto.type === 'recurring') {
      if (!dto.schedule) return false;
      if (dto.departureAt !== undefined) return false;
      if (!dto.startDate || !dto.endDate) return false;
      if (dto.endDate < dto.startDate) return false;
      if (dto.endDate < todayInScheduleTz()) return false;
    }
    return true;
  }

  defaultMessage(args: ValidationArguments) {
    const dto = args.object as CreateTripDto;
    if (dto.type === 'sporadic') {
      if (!dto.departureAt) return 'departureAt is required for sporadic trips';
      if (dto.schedule !== undefined)
        return 'schedule must not be present for sporadic trips';
      if (dto.startDate !== undefined || dto.endDate !== undefined)
        return 'startDate/endDate must not be present for sporadic trips';
      if (dto.departureAt.getTime() <= Date.now())
        return 'departureAt must be in the future';
    }
    if (dto.type === 'recurring') {
      if (!dto.schedule) return 'schedule is required for recurring trips';
      if (dto.departureAt !== undefined)
        return 'departureAt must not be present for recurring trips';
      if (!dto.startDate || !dto.endDate)
        return 'startDate and endDate are required for recurring trips';
      if (dto.endDate < dto.startDate)
        return 'endDate must be on or after startDate';
      if (dto.endDate < todayInScheduleTz())
        return 'endDate must be on or after today (Europe/Madrid)';
    }
    return 'Invalid trip configuration';
  }
}

@ValidatorConstraint({ name: 'externalEventContextSporadicOnly', async: false })
class ExternalEventContextSporadicOnlyConstraint implements ValidatorConstraintInterface {
  validate(_: unknown, args: ValidationArguments) {
    const dto = args.object as CreateTripDto;
    return !dto.externalEventContext || dto.type === 'sporadic';
  }

  defaultMessage() {
    return 'externalEventContext is supported only for sporadic trips';
  }
}

export class CreateTripDto {
  @ApiProperty({ example: 'car_1' })
  @IsString()
  @IsNotEmpty()
  carId!: string;

  @ApiProperty({ enum: TRIP_TYPES, example: 'sporadic' })
  @IsIn(TRIP_TYPES)
  @Validate(TripTypeConstraint)
  type!: TripType;

  @ApiProperty({ type: () => LocationDto })
  @ValidateNested()
  @Type(() => LocationDto)
  origin!: LocationDto;

  @ApiProperty({
    type: () => LocationDto,
    description: 'Trip destination. Always provided by the frontend.',
  })
  @ValidateNested()
  @Type(() => LocationDto)
  destination!: LocationDto;

  @ApiPropertyOptional({ enum: CONVERSATION_STYLES, example: 'casual' })
  @IsOptional()
  @IsIn([...CONVERSATION_STYLES, null])
  conversationStyle?: ConversationStyle | null;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  smokeAllowed?: boolean;

  @ApiProperty({ example: true })
  @IsBoolean()
  @MusicConsistent()
  musicAllowed!: boolean;

  @ApiPropertyOptional({ enum: MUSIC_GENRES, example: 'indie' })
  @IsOptional()
  @IsIn([...MUSIC_GENRES, null])
  musicGenre?: MusicGenre | null;

  @ApiPropertyOptional({ example: '2026-03-28T08:30:00.000Z' })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  departureAt?: Date;

  @ApiPropertyOptional({ type: () => RecurringScheduleDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => RecurringScheduleDto)
  schedule?: RecurringScheduleDto;

  @ApiPropertyOptional({
    description:
      'First day of the recurring window (inclusive). Required for recurring trips, forbidden for sporadic. YYYY-MM-DD.',
    example: '2026-04-01',
  })
  @IsOptional()
  @IsYmd()
  startDate?: string;

  @ApiPropertyOptional({
    description:
      'Last day of the recurring window (inclusive). Required for recurring trips, forbidden for sporadic. YYYY-MM-DD.',
    example: '2026-04-30',
  })
  @IsOptional()
  @IsYmd()
  endDate?: string;

  @ApiProperty({ example: 3 })
  @IsInt()
  @Min(1)
  seatsOffered!: number;

  @ApiProperty({
    example: 500,
    description:
      'Per-seat fare in EUR cents. Non-negative integer; the driver chooses the price and the platform takes no fee. Frozen onto each accepted booking as `fareCents`.',
  })
  @IsInt()
  @Min(0)
  pricePerSeatCents!: number;

  @ApiPropertyOptional({
    type: () => ExternalEventContextDto,
    description:
      'Optional CultuCat event reference (sporadic trips only). Traces the trip back to a CultuCat event; the backend validates the event exists and that the destination is near it.',
  })
  @IsOptional()
  @ValidateNested()
  @Validate(ExternalEventContextSporadicOnlyConstraint)
  @Type(() => ExternalEventContextDto)
  externalEventContext?: ExternalEventContextDto;
}
