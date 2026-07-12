import { ApiProperty } from '@nestjs/swagger';

export class CarModelResponseDto {
  @ApiProperty({ example: 'model_uuid' })
  id!: string;

  @ApiProperty({ example: 'BMW' })
  brand!: string;

  @ApiProperty({ example: '330i' })
  name!: string;

  @ApiProperty({ example: 2023 })
  year!: number;

  @ApiProperty({ example: 'Compact Cars' })
  type!: string;

  @ApiProperty({ example: 0.155 })
  co2KgPerKm!: number;
}
