import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  Validate,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({
  name: 'cultucatEventsQueryConsistency',
  async: false,
})
class CultucatEventsQueryConsistencyConstraint implements ValidatorConstraintInterface {
  validate(_: unknown, args: ValidationArguments) {
    const dto = args.object as ListCultucatEventsQueryDto;
    if (dto.dateFrom && dto.dateTo && dto.dateFrom >= dto.dateTo) {
      return false;
    }

    const hasCoordinates =
      dto.lat !== undefined ||
      dto.lng !== undefined ||
      dto.radiusKm !== undefined;
    const hasCompleteCoordinates =
      dto.lat !== undefined &&
      dto.lng !== undefined &&
      dto.radiusKm !== undefined;
    const hasMunicipality = dto.municipality !== undefined;

    if (hasMunicipality && hasCoordinates) {
      return false;
    }
    if (!hasMunicipality && !hasCompleteCoordinates) {
      return false;
    }
    if (hasCoordinates && !hasCompleteCoordinates) {
      return false;
    }
    return true;
  }

  defaultMessage(args: ValidationArguments) {
    const dto = args.object as ListCultucatEventsQueryDto;
    if (dto.dateFrom && dto.dateTo && dto.dateFrom >= dto.dateTo) {
      return 'dateFrom must be before dateTo';
    }

    const hasCoordinates =
      dto.lat !== undefined ||
      dto.lng !== undefined ||
      dto.radiusKm !== undefined;
    const hasCompleteCoordinates =
      dto.lat !== undefined &&
      dto.lng !== undefined &&
      dto.radiusKm !== undefined;
    const hasMunicipality = dto.municipality !== undefined;

    if (hasMunicipality && hasCoordinates) {
      return 'Provide either municipality or lat/lng/radiusKm, not both';
    }
    if (hasCoordinates && !hasCompleteCoordinates) {
      return 'lat, lng, and radiusKm must be provided together';
    }
    return 'Provide either municipality or lat/lng/radiusKm';
  }
}

export class ListCultucatEventsQueryDto {
  @ApiProperty({ example: '2026-05-01T00:00:00.000Z' })
  @Type(() => Date)
  @IsDate()
  dateFrom!: Date;

  @ApiProperty({ example: '2026-05-31T23:59:59.000Z' })
  @Type(() => Date)
  @IsDate()
  @Validate(CultucatEventsQueryConsistencyConstraint)
  dateTo!: Date;

  @ApiPropertyOptional({ example: 41.3874 })
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  lat?: number;

  @ApiPropertyOptional({ example: 2.1686 })
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  lng?: number;

  @ApiPropertyOptional({ example: 15 })
  @IsOptional()
  @Type(() => Number)
  @IsPositive()
  radiusKm?: number;

  @ApiPropertyOptional({ example: 'Barcelona' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  municipality?: string;

  @ApiPropertyOptional({ default: 1, example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;
}
