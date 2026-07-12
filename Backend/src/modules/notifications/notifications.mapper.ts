import type { PushSubscription } from '@core/database/schema/push-subscriptions.schema';
import type { PushSubscriptionResponseDto } from './dto/push-subscription-response.dto';

export function toPushSubscriptionResponse(
  row: PushSubscription,
): PushSubscriptionResponseDto {
  return {
    id: row.id,
    endpoint: row.endpoint,
    settings: row.settings,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
