import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class CancelMyBookingsDto {
  @ApiProperty({
    description:
      'Cancels every non-terminal booking the authenticated passenger has on this trip.',
    example: 'trip_1',
  })
  @IsString()
  tripId!: string;
}
