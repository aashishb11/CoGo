import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
// `web-push` is a CommonJS module; under the e2e suite's native ESM mode
// (`useESM: true` in test/jest-e2e.json), `import * as webpush` would wrap the
// module's exports inside `default` and `setVapidDetails` would be undefined.
// The default-import form goes through esModuleInterop and works in both modes.
import webpush from 'web-push';
import { DB } from '@core/database/database.module';
import type * as schema from '@core/database/schema';
import type {
  PushSubscription,
  PushSubscriptionSettings,
} from '@core/database/schema/push-subscriptions.schema';
import {
  FALLBACK_LOCALE,
  resolveLocalesByUserIds,
  type Locale,
} from '@shared/i18n/locale';
import { isExpoPushToken } from '@shared/push/expo-push';
import type { UpdatePushSubscriptionDto } from './dto/update-push-subscription.dto';
import type { UpsertPushSubscriptionDto } from './dto/upsert-push-subscription.dto';
import { NotificationsRepository } from './notifications.repository';

export interface TrafficAlertPayload {
  rideId: string;
  delayMinutes: number;
  scheduledDeparture: Date;
}

export interface ChatMessagePayload {
  threadId: string;
  tripId: string;
  senderName: string;
  body: string;
}

export interface RideAutoCompletedPayload {
  rideId: string;
  capturedCount: number;
  refundedCount: number;
}

export interface RideDriverNoShowPayload {
  rideId: string;
}

export interface RideAutoCancelledPayload {
  rideId: string;
}

const DEFAULT_SETTINGS: PushSubscriptionSettings = { traffic_alerts: true };

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

interface DeliverablePayload {
  title: string;
  body: string;
  /** Extra fields delivered to the client (includes the `type` discriminator). */
  data: Record<string, unknown>;
  /** Android notification channel — Expo transport only. */
  channelId?: string;
}

interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

interface ExpoPushResponse {
  data?: ExpoPushTicket | ExpoPushTicket[];
}

const rideAutoCompletedCopy: Record<
  Locale,
  {
    title: string;
    body: (params: { capturedCount: number; refundedCount: number }) => string;
  }
> = {
  en: {
    title: 'Ride auto-completed',
    body: ({ capturedCount, refundedCount }) =>
      `Your ride was auto-completed: ${capturedCount} charged, ${refundedCount} refunded.`,
  },
  es: {
    title: 'Viaje completado automáticamente',
    body: ({ capturedCount, refundedCount }) =>
      `Tu viaje se ha completado automáticamente: ${capturedCount} cobros, ${refundedCount} reembolsos.`,
  },
  ca: {
    title: 'Viatge completat automàticament',
    body: ({ capturedCount, refundedCount }) =>
      `El teu viatge s'ha completat automàticament: ${capturedCount} cobraments, ${refundedCount} reemborsaments.`,
  },
};

const rideDriverNoShowCopy: Record<Locale, { title: string; body: string }> = {
  en: {
    title: 'Ride cancelled — never started',
    body: 'A ride you were scheduled to drive was cancelled because it was never started.',
  },
  es: {
    title: 'Viaje cancelado — no iniciado',
    body: 'Un viaje que tenías programado conducir ha sido cancelado porque nunca se inició.',
  },
  ca: {
    title: 'Viatge cancel·lat — no iniciat',
    body: 'Un viatge que tenies programat conduir ha estat cancel·lat perquè mai es va iniciar.',
  },
};

const rideAutoCancelledPassengerCopy: Record<
  Locale,
  { title: string; body: string }
> = {
  en: {
    title: 'Ride cancelled',
    body: 'A ride you had booked was cancelled. Any held funds have been released.',
  },
  es: {
    title: 'Viaje cancelado',
    body: 'Un viaje que habías reservado ha sido cancelado. Los fondos retenidos han sido liberados.',
  },
  ca: {
    title: 'Viatge cancel·lat',
    body: 'Un viatge que havies reservat ha estat cancel·lat. Els fons retinguts han estat alliberats.',
  },
};

const trafficAlertCopy: Record<
  Locale,
  { title: string; body: (delayMinutes: number) => string }
> = {
  en: {
    title: '⚠️ Traffic alert',
    body: (n) => `Your ride has a ${n}-minute traffic delay.`,
  },
  es: {
    title: '⚠️ Aviso de tráfico',
    body: (n) => `Tu viaje tiene un retraso de ${n} minutos por tráfico.`,
  },
  ca: {
    title: '⚠️ Avís de trànsit',
    body: (n) => `El teu viatge té un retard de ${n} minuts pel trànsit.`,
  },
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly expoAccessToken: string | undefined;

  constructor(
    @Inject(DB) private readonly db: PostgresJsDatabase<typeof schema>,
    private readonly configService: ConfigService,
    private readonly repo: NotificationsRepository,
  ) {
    webpush.setVapidDetails(
      configService.getOrThrow<string>('VAPID_SUBJECT'),
      configService.getOrThrow<string>('VAPID_PUBLIC_KEY'),
      configService.getOrThrow<string>('VAPID_PRIVATE_KEY'),
    );
    // Optional: Expo recommends an access token to authenticate push sends.
    // Unset is fine — the push service accepts unauthenticated sends too.
    this.expoAccessToken = configService.get<string>('EXPO_ACCESS_TOKEN');
  }

  // ── Subscription management ─────────────────────────────────────────────

  async list(userId: string): Promise<PushSubscription[]> {
    return this.repo.findByUser(this.db, userId);
  }

  async upsert(
    userId: string,
    body: UpsertPushSubscriptionDto,
  ): Promise<PushSubscription> {
    const settings: PushSubscriptionSettings = {
      ...DEFAULT_SETTINGS,
      ...(body.settings ?? {}),
    };
    return this.repo.upsertByEndpoint(this.db, {
      id: randomUUID(),
      userId,
      endpoint: body.endpoint,
      keys: body.keys,
      settings,
    });
  }

  async updateSettings(
    userId: string,
    id: string,
    body: UpdatePushSubscriptionDto,
  ): Promise<PushSubscription> {
    const existing = await this.repo.findOwned(this.db, id, userId);
    if (!existing) {
      throw new NotFoundException('Push subscription not found');
    }
    const settings: PushSubscriptionSettings = {
      ...existing.settings,
      ...(body.settings ?? {}),
    };
    const updated = await this.repo.updateSettingsOwned(
      this.db,
      id,
      userId,
      settings,
    );
    if (!updated) {
      // Lost a race with a concurrent delete; surface as 404.
      throw new NotFoundException('Push subscription not found');
    }
    return updated;
  }

  async delete(userId: string, id: string): Promise<void> {
    const deleted = await this.repo.deleteOwned(this.db, id, userId);
    if (!deleted) {
      throw new NotFoundException('Push subscription not found');
    }
  }

  // ── Outbound push ───────────────────────────────────────────────────────

  /**
   * Dispatches a traffic alert Web Push notification to all provided user IDs.
   * Title / body strings are localized per recipient via Profile.locale,
   * falling back to the default when the user has no locale set or the
   * stored value is unknown. Subscriptions with `traffic_alerts: false` are
   * silently skipped. Expired subscriptions (HTTP 404/410) are pruned.
   */
  async sendTrafficAlert(
    userIds: string[],
    payload: TrafficAlertPayload,
  ): Promise<void> {
    if (userIds.length === 0) return;

    const subs = await this.repo.findByUserIds(this.db, userIds);
    if (subs.length === 0) return;

    const localeByUserId = await resolveLocalesByUserIds(this.db, userIds);

    await Promise.all(
      subs.map(async (sub) => {
        if (!sub.settings.traffic_alerts) return;

        const locale = localeByUserId.get(sub.userId) ?? FALLBACK_LOCALE;
        const copy = trafficAlertCopy[locale];
        await this.deliver(sub, {
          title: copy.title,
          body: copy.body(payload.delayMinutes),
          data: {
            type: 'traffic_alert',
            rideId: payload.rideId,
            delayMinutes: payload.delayMinutes,
            scheduledDeparture: payload.scheduledDeparture.toISOString(),
          },
        });
      }),
    );
  }

  /**
   * Sends a chat message push notification to the recipient's subscribed devices.
   * Failures are logged and swallowed so they never interrupt the message flow.
   */
  async sendChatMessage(
    recipientId: string,
    payload: ChatMessagePayload,
  ): Promise<void> {
    const subs = await this.repo.findByUserIds(this.db, [recipientId]);
    if (subs.length === 0) return;

    const truncatedBody =
      payload.body.length > 80 ? `${payload.body.slice(0, 77)}…` : payload.body;

    await Promise.all(
      subs.map((sub) =>
        this.deliver(sub, {
          title: payload.senderName,
          body: truncatedBody,
          channelId: 'chat-messages',
          data: {
            type: 'chat.message',
            threadId: payload.threadId,
            tripId: payload.tripId,
          },
        }),
      ),
    );
  }

  /**
   * Driver-only summary push fired by the rides-sweep cron after it auto-
   * completes an idle in-progress ride. Failures are swallowed so a missing
   * subscription never aborts the sweep tick.
   */
  async sendRideAutoCompleted(
    driverId: string,
    payload: RideAutoCompletedPayload,
  ): Promise<void> {
    await this.dispatchSimple([driverId], 'ride.auto_completed', payload, {
      copy: rideAutoCompletedCopy,
      body: (locale) =>
        rideAutoCompletedCopy[locale].body({
          capturedCount: payload.capturedCount,
          refundedCount: payload.refundedCount,
        }),
    });
  }

  /**
   * Driver-only push fired by the rides-sweep cron after it cancels a
   * stranded active ride (driver never started).
   */
  async sendRideDriverNoShow(
    driverId: string,
    payload: RideDriverNoShowPayload,
  ): Promise<void> {
    await this.dispatchSimple([driverId], 'ride.driver_no_show', payload, {
      copy: rideDriverNoShowCopy,
      body: (locale) => rideDriverNoShowCopy[locale].body,
    });
  }

  /**
   * Passenger-side companion notification for a stranded-active sweep:
   * every accepted-or-pending passenger on the cancelled ride is told the
   * ride was cancelled and (if a hold was active) refunded.
   */
  async sendRideAutoCancelled(
    passengerIds: string[],
    payload: RideAutoCancelledPayload,
  ): Promise<void> {
    if (passengerIds.length === 0) return;
    await this.dispatchSimple(passengerIds, 'ride.auto_cancelled', payload, {
      copy: rideAutoCancelledPassengerCopy,
      body: (locale) => rideAutoCancelledPassengerCopy[locale].body,
    });
  }

  /**
   * Internal fan-out helper for "simple" notifications — locale-aware
   * title + body, no per-recipient gating beyond settings (these payloads
   * don't have a settings toggle today). Mirrors the shape of
   * `sendTrafficAlert` / `sendChatMessage`.
   */
  private async dispatchSimple<P extends { rideId: string }>(
    userIds: string[],
    type: string,
    payload: P,
    copyHelpers: {
      copy: Record<Locale, { title: string }>;
      body: (locale: Locale) => string;
    },
  ): Promise<void> {
    const subs = await this.repo.findByUserIds(this.db, userIds);
    if (subs.length === 0) return;

    const localeByUserId = await resolveLocalesByUserIds(this.db, userIds);

    await Promise.all(
      subs.map((sub) => {
        const locale = localeByUserId.get(sub.userId) ?? FALLBACK_LOCALE;
        return this.deliver(sub, {
          title: copyHelpers.copy[locale].title,
          body: copyHelpers.body(locale),
          data: { type, ...payload },
        });
      }),
    );
  }

  // ── Delivery routing ──────────────────────────────────────────────────────

  /**
   * Routes one notification to the right transport based on the stored
   * endpoint: native clients register an Expo push token, browsers a Web Push
   * URL. Per-subscription errors are handled inside each transport (prune dead
   * subscriptions, log the rest) and never rethrown, so one bad subscription
   * can't abort a fan-out.
   */
  private async deliver(
    sub: PushSubscription,
    payload: DeliverablePayload,
  ): Promise<void> {
    if (isExpoPushToken(sub.endpoint)) {
      await this.deliverExpo(sub, payload);
    } else {
      await this.deliverWebPush(sub, payload);
    }
  }

  private async deliverWebPush(
    sub: PushSubscription,
    payload: DeliverablePayload,
  ): Promise<void> {
    const message = JSON.stringify({
      ...payload.data,
      title: payload.title,
      body: payload.body,
    });
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: sub.keys },
        message,
      );
    } catch (err: unknown) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await this.repo.deleteById(this.db, sub.id);
        this.logger.log(`Pruned expired subscription ${sub.id}`);
      } else {
        this.logger.error(`Web push failed for sub ${sub.id}`, err);
      }
    }
  }

  private async deliverExpo(
    sub: PushSubscription,
    payload: DeliverablePayload,
  ): Promise<void> {
    const message = {
      to: sub.endpoint,
      title: payload.title,
      body: payload.body,
      data: payload.data,
      sound: 'default',
      priority: 'high',
      ...(payload.channelId ? { channelId: payload.channelId } : {}),
    };
    try {
      const response = await fetch(EXPO_PUSH_ENDPOINT, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          ...(this.expoAccessToken
            ? { authorization: `Bearer ${this.expoAccessToken}` }
            : {}),
        },
        body: JSON.stringify([message]),
      });

      if (!response.ok) {
        this.logger.error(
          `Expo push failed for sub ${sub.id}: HTTP ${response.status} ${await response.text()}`,
        );
        return;
      }

      const result = (await response.json()) as ExpoPushResponse;
      const ticket = Array.isArray(result.data) ? result.data[0] : result.data;
      // DeviceNotRegistered can also surface later in the async receipt rather
      // than the ticket; we prune on the ticket here and rely on the next send
      // to clean up the rest (receipt polling is intentionally out of scope).
      if (ticket?.status === 'error') {
        if (ticket.details?.error === 'DeviceNotRegistered') {
          await this.repo.deleteById(this.db, sub.id);
          this.logger.log(`Pruned unregistered Expo subscription ${sub.id}`);
        } else {
          this.logger.error(
            `Expo push rejected for sub ${sub.id}: ${ticket.message ?? ticket.details?.error}`,
          );
        }
      }
    } catch (err: unknown) {
      this.logger.error(`Expo push request failed for sub ${sub.id}`, err);
    }
  }
}
