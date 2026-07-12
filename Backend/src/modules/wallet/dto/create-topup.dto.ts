import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';
import { TOPUP_MAX_CENTS, TOPUP_MIN_CENTS } from '../wallet.types';

export class CreateTopupDto {
  @ApiProperty({
    description: `Top-up amount in EUR cents. Must be an integer between ${TOPUP_MIN_CENTS} (1 €) and ${TOPUP_MAX_CENTS} (500 €) inclusive.`,
    example: 2000,
    minimum: TOPUP_MIN_CENTS,
    maximum: TOPUP_MAX_CENTS,
  })
  @IsInt()
  @Min(TOPUP_MIN_CENTS)
  @Max(TOPUP_MAX_CENTS)
  amountCents!: number;
}
