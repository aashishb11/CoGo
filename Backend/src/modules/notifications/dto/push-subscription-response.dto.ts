import { ApiProperty } from '@nestjs/swagger';
import type { PushSubscriptionSettings } from '@core/database/schema/push-subscriptions.schema';

export class PushSubscriptionSettingsDto implements PushSubscriptionSettings {
  @ApiProperty({ example: true })
  traffic_alerts!: boolean;
}

export class PushSubscriptionResponseDto {
  @ApiProperty({ example: 'sub_uuid' })
  id!: string;

  @ApiProperty({
    example: 'https://fcm.googleapis.com/fcm/send/dE8...',
    description:
      'Browser-issued endpoint URL. Acts as the unique key per device/install.',
  })
  endpoint!: string;

  @ApiProperty({ type: () => PushSubscriptionSettingsDto })
  settings!: PushSubscriptionSettingsDto;

  @ApiProperty({ example: '2026-04-30T18:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-04-30T18:00:00.000Z' })
  updatedAt!: Date;
}
