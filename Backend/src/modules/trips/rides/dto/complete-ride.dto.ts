import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export const UNSCANNED_OUTCOMES = ['boarded', 'refund'] as const;
export type UnscannedOutcome = (typeof UNSCANNED_OUTCOMES)[number];

export class UnscannedOutcomeDto {
  @ApiPropertyOptional({ example: 'bk_1' })
  @IsString()
  bookingId!: string;

  @ApiPropertyOptional({
    description:
      "Per-passenger override for a booking that wasn't scanned at boarding. `boarded` captures the hold (charge them anyway); `refund` releases it.",
    enum: UNSCANNED_OUTCOMES,
    example: 'refund',
  })
  @IsIn(UNSCANNED_OUTCOMES as unknown as string[])
  outcome!: UnscannedOutcome;
}

export class CompleteRideDto {
  @ApiPropertyOptional({
    description:
      'Per-passenger overrides for bookings that were not scanned at boarding. Bookings already scanned (have `boardedAt`) are always captured and these overrides are ignored. Bookings absent from this list fall back to the default rule (post-departure no-show → capture; pre-departure complete → release).',
    type: () => UnscannedOutcomeDto,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => UnscannedOutcomeDto)
  unscannedOutcomes?: UnscannedOutcomeDto[];
}
