import { Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import type { DbClient } from '@core/database/database.module';
import { pushSubscriptions } from '@core/database/schema';
import type {
  InsertPushSubscription,
  PushSubscription,
  PushSubscriptionSettings,
} from '@core/database/schema/push-subscriptions.schema';

@Injectable()
export class NotificationsRepository {
  async findByUser(tx: DbClient, userId: string): Promise<PushSubscription[]> {
    return tx
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId));
  }

  async findOwned(
    tx: DbClient,
    id: string,
    userId: string,
  ): Promise<PushSubscription | null> {
    const [row] = await tx
      .select()
      .from(pushSubscriptions)
      .where(
        and(eq(pushSubscriptions.id, id), eq(pushSubscriptions.userId, userId)),
      )
      .limit(1);
    return row ?? null;
  }

  async findByUserIds(
    tx: DbClient,
    userIds: string[],
  ): Promise<PushSubscription[]> {
    if (userIds.length === 0) {
      return [];
    }
    return tx
      .select()
      .from(pushSubscriptions)
      .where(inArray(pushSubscriptions.userId, userIds));
  }

  /**
   * Upsert by `endpoint` (the browser-stable unique key). On conflict the row
   * is rebound to the requesting user and `keys` / `settings` / `updatedAt`
   * are refreshed — handles "user re-subscribes on the same device" and
   * "different user signs in on the same device" with the same write.
   */
  async upsertByEndpoint(
    tx: DbClient,
    row: InsertPushSubscription,
  ): Promise<PushSubscription> {
    const [inserted] = await tx
      .insert(pushSubscriptions)
      .values(row)
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: {
          userId: row.userId,
          keys: row.keys,
          settings: row.settings,
          updatedAt: new Date(),
        },
      })
      .returning();
    return inserted;
  }

  async updateSettingsOwned(
    tx: DbClient,
    id: string,
    userId: string,
    settings: PushSubscriptionSettings,
  ): Promise<PushSubscription | null> {
    const [updated] = await tx
      .update(pushSubscriptions)
      .set({ settings, updatedAt: new Date() })
      .where(
        and(eq(pushSubscriptions.id, id), eq(pushSubscriptions.userId, userId)),
      )
      .returning();
    return updated ?? null;
  }

  async deleteOwned(
    tx: DbClient,
    id: string,
    userId: string,
  ): Promise<boolean> {
    const deleted = await tx
      .delete(pushSubscriptions)
      .where(
        and(eq(pushSubscriptions.id, id), eq(pushSubscriptions.userId, userId)),
      )
      .returning({ id: pushSubscriptions.id });
    return deleted.length > 0;
  }

  /** Used by the outbound-push path when the browser reports the subscription
   *  is gone (HTTP 404/410). Not user-scoped — the row is dead either way. */
  async deleteById(tx: DbClient, id: string): Promise<void> {
    await tx.delete(pushSubscriptions).where(eq(pushSubscriptions.id, id));
  }
}
