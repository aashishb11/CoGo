import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsLatitude,
  IsLongitude,
  IsOptional,
  Validate,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({
  name: 'cultucatEventDetailOriginConsistency',
  async: false,
})
class CultucatEventDetailOriginConsistencyConstraint implements ValidatorConstraintInterface {
  validate(_: unknown, args: ValidationArguments) {
    const dto = args.object as CultucatEventDetailQueryDto;
    const latProvided = dto.originLat !== undefined;
    const lngProvided = dto.originLng !== undefined;
    return latProvided === lngProvided;
  }

  defaultMessage() {
    return 'originLat and originLng must be provided together';
  }
}

export class CultucatEventDetailQueryDto {
  @ApiPropertyOptional({ example: 41.3874 })
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  originLat?: number;

  @ApiPropertyOptional({ example: 2.1686 })
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  @Validate(CultucatEventDetailOriginConsistencyConstraint)
  originLng?: number;
}
