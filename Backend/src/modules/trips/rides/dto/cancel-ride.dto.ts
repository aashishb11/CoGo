import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelRideDto {
  @ApiPropertyOptional({
    description: 'Optional free-form reason shown to passengers.',
    example: 'Car broke down',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  cancellationReason?: string;
}
