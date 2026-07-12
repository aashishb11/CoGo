import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { CONVERSATION_STYLES, MUSIC_GENRES } from '../../trips.types';
import { LocationDto, RecurringScheduleDto } from './create-trip.dto';
import { IsYmd } from './validators/is-ymd.validator';
import { MusicConsistent } from './validators/music-consistent.validator';

export class UpdateTripDto {
  @ApiPropertyOptional({ type: () => LocationDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => LocationDto)
  origin?: LocationDto;

  @ApiPropertyOptional({ type: () => LocationDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => LocationDto)
  destination?: LocationDto;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsInt()
  @Min(1)
  seatsOffered?: number;

  @ApiPropertyOptional({
    example: 500,
    description:
      'Per-seat fare in EUR cents. Non-negative integer. Updates the trip price for future accepts; existing accepted bookings keep the fare frozen at accept time.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  pricePerSeatCents?: number;

  @ApiPropertyOptional({ example: 'car_1' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  carId?: string;

  @ApiPropertyOptional({ enum: CONVERSATION_STYLES, example: 'casual' })
  @IsOptional()
  @IsIn([...CONVERSATION_STYLES, null])
  conversationStyle?: (typeof CONVERSATION_STYLES)[number] | null;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  smokeAllowed?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  @MusicConsistent()
  musicAllowed?: boolean;

  @ApiPropertyOptional({ enum: MUSIC_GENRES, example: 'indie' })
  @IsOptional()
  @IsIn([...MUSIC_GENRES, null])
  musicGenre?: (typeof MUSIC_GENRES)[number] | null;

  @ApiPropertyOptional({ example: '2026-04-01T08:30:00.000Z' })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  departureAt?: Date;

  @ApiPropertyOptional({ type: () => RecurringScheduleDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => RecurringScheduleDto)
  schedule?: RecurringScheduleDto;

  @ApiPropertyOptional({ example: '2026-04-01' })
  @IsOptional()
  @IsYmd()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-04-30' })
  @IsOptional()
  @IsYmd()
  endDate?: string;
}
