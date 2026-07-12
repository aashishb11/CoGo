import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class RejectBookingsDto {
  @ApiProperty({
    description: 'ID of the passenger whose batch is being acted on.',
    example: 'usr_1',
  })
  @IsString()
  passengerId!: string;

  @ApiPropertyOptional({
    description:
      'Subset of booking IDs to reject. Omit to act on every non-terminal booking of this passenger on this trip.',
    type: [String],
    example: ['bk_1'],
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsString({ each: true })
  bookingIds?: string[];

  @ApiPropertyOptional({
    description: 'Free-form reason from the driver.',
    example: 'Pickup too far out of the way',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  rejectionReason?: string;
}

export class RejectAllBookingsDto {
  @ApiPropertyOptional({
    description: 'Free-form reason from the driver.',
    example: 'Trip details changed',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  rejectionReason?: string;
}
