import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class CreateWithdrawalDto {
  @ApiProperty({
    description:
      'Withdrawal amount in EUR cents. Must be a positive integer; the service enforces that it does not exceed the wallet available balance.',
    example: 500,
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  amountCents!: number;
}
