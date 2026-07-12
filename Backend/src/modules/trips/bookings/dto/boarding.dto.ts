import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class BoardingTokenResponseDto {
  @ApiProperty({
    description:
      'Rotating HMAC-signed token to render in the passenger QR. Refresh before `validUntil` (rotation window ~30s) — the FE polls.',
    example: 'YmtfMXwzNTAwMDA.abc123…',
  })
  token!: string;

  @ApiProperty({
    description:
      'Exclusive end of the current rotation window. Scanning after this requires a fresh fetch (the server still accepts one slot of skew).',
    example: '2026-05-25T10:00:30.000Z',
  })
  validUntil!: Date;
}

export class BoardingScanRequestDto {
  @ApiProperty({
    description:
      'Token produced by `GET /me/bookings/:id/boarding-token` and scanned off the passenger QR.',
    example: 'YmtfMXwzNTAwMDA.abc123…',
  })
  @IsString()
  @MinLength(1)
  token!: string;
}

export class BoardingScanResponseDto {
  @ApiProperty({ example: 'bk_1' })
  bookingId!: string;

  @ApiProperty({ example: 'ride_1' })
  rideId!: string;

  @ApiProperty({
    example: 500,
    description: 'Fare in EUR cents that was captured from the passenger.',
  })
  fareCents!: number;

  @ApiProperty({
    example: '2026-05-25T10:00:12.000Z',
    description: 'Timestamp the booking was marked boarded.',
  })
  boardedAt!: Date;
}
