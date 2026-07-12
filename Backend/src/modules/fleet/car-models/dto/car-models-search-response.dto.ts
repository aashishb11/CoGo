import { ApiProperty } from '@nestjs/swagger';
import { CarModelResponseDto } from './car-model-response.dto';

export class CarModelsSearchResponseDto {
  @ApiProperty({ type: CarModelResponseDto, isArray: true })
  items!: CarModelResponseDto[];

  @ApiProperty({ example: 142, description: 'Total matches across all pages' })
  total!: number;

  @ApiProperty({ example: 20, description: 'Number of items in this response' })
  limit!: number;

  @ApiProperty({ example: 0 })
  offset!: number;
}
