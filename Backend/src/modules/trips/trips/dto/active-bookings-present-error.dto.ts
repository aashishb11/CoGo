import { ApiProperty } from '@nestjs/swagger';
import { ErrorResponseDto } from '@shared/errors/error-response.dto';

export class ActiveBookingsPresentDetailsDto {
  @ApiProperty({
    description:
      'IDs of future ACTIVE rides that still hold non-terminal bookings.',
    type: [String],
    example: ['ride_1', 'ride_2'],
  })
  rideIds!: string[];

  @ApiProperty({ description: 'Length of `rideIds`.', example: 2 })
  count!: number;

  // Index signature widens the class to satisfy the parent
  // ErrorResponseDto.details record type without redeclaring fields.
  [key: string]: unknown;
}

export class ActiveBookingsPresentErrorDto extends ErrorResponseDto {
  @ApiProperty({
    enum: ['ACTIVE_BOOKINGS_PRESENT'],
    example: 'ACTIVE_BOOKINGS_PRESENT',
  })
  declare code: 'ACTIVE_BOOKINGS_PRESENT';

  @ApiProperty({ type: ActiveBookingsPresentDetailsDto })
  declare details: ActiveBookingsPresentDetailsDto;
}
