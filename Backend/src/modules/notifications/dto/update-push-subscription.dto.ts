import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, ValidateNested } from 'class-validator';
import { PushSubscriptionSettingsInputDto } from './upsert-push-subscription.dto';

export class UpdatePushSubscriptionDto {
  @ApiPropertyOptional({
    type: () => PushSubscriptionSettingsInputDto,
    description:
      'Partial settings patch. Omitted flags keep their current value; included flags replace.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => PushSubscriptionSettingsInputDto)
  settings?: PushSubscriptionSettingsInputDto;
}
