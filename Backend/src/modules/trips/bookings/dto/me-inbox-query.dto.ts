import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class MeInboxQueryDto {
  @ApiPropertyOptional({
    description: 'Scope the inbox to a single trip.',
    example: 'trip_1',
  })
  @IsOptional()
  @IsString()
  tripId?: string;

  @ApiPropertyOptional({
    description: 'Scope the inbox to a single passenger.',
    example: 'usr_passenger',
  })
  @IsOptional()
  @IsString()
  passengerId?: string;

  @ApiPropertyOptional({ default: 1, example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}
