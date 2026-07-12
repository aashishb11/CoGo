import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
} from 'class-validator';

export class AcceptBookingsDto {
  @ApiProperty({
    description: 'ID of the passenger whose batch is being acted on.',
    example: 'usr_1',
  })
  @IsString()
  passengerId!: string;

  @ApiPropertyOptional({
    description:
      'Subset of booking IDs to accept. Omit to act on all pending bookings of this passenger on this trip.',
    type: [String],
    example: ['bk_1', 'bk_2'],
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsString({ each: true })
  bookingIds?: string[];
}
