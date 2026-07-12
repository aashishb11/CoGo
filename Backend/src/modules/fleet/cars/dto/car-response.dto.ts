import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CarModelResponseDto } from '@modules/fleet/car-models/dto/car-model-response.dto';

export class CarResponseDto {
  @ApiProperty({ example: 'car_uuid' })
  id!: string;

  @ApiProperty({ example: 'usr_uuid' })
  userId!: string;

  @ApiProperty({ example: 'model_uuid' })
  modelId!: string;

  @ApiProperty({ example: '1234ABC' })
  plate!: string;

  @ApiPropertyOptional({ example: 'Red' })
  color!: string | null;

  @ApiProperty({ example: 4 })
  passengerSeats!: number;

  @ApiPropertyOptional({ type: () => CarModelResponseDto })
  model?: CarModelResponseDto;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
