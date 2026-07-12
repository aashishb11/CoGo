import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateBookingsDto {
  @ApiProperty({
    description:
      'IDs of the rides on this trip the passenger wants to book. The whole batch is created atomically — any validation failure on any ride rolls the entire request back.',
    type: [String],
    example: ['ride_1', 'ride_2'],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsString({ each: true })
  rideIds!: string[];

  @ApiPropertyOptional({
    description: 'Optional free-form note shown to the driver.',
    example: 'I can be at the pickup spot 5 minutes earlier if needed.',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}
