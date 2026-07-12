import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ERROR_CODES, type ErrorCode } from './error-codes';

export class ErrorResponseDto {
  @ApiProperty({ enum: ERROR_CODES, example: 'BAD_REQUEST' })
  code!: ErrorCode;

  @ApiProperty({ example: 400 })
  statusCode!: number;

  @ApiProperty({ example: 'Validation failed' })
  message!: string;

  @ApiPropertyOptional({
    description:
      'Optional structured payload — present for codes that carry extra data (e.g. ACTIVE_BOOKINGS_PRESENT carries rideIds + count).',
    type: 'object',
    additionalProperties: true,
  })
  details?: Record<string, unknown> | null;
}
