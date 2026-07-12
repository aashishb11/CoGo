import { Injectable } from '@nestjs/common';
import { and, desc, eq, isNull, lt, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { DbClient } from '@core/database/database.module';
import { chatMessages, chatThreads, trips, user } from '@core/database/schema';
import type { ChatMessage, ChatThread } from '@core/database/schema';
import type { InsertChatThread } from '@core/database/schema/chat-threads.schema';
import type {
  InboxThreadRow,
  MessageWithSender,
  ThreadRole,
} from './chat.types';

type InsertMessage = {
  id: string;
  threadId: string;
  senderId: string;
  rideId?: string | null;
  body: string;
};

type InboxFilters = {
  tripId?: string;
  threadId?: string;
};

@Injectable()
export class ChatRepository {
  // ── Thread reads ─────────────────────────────────────────────────────────

  async findThreadById(
    db: DbClient,
    threadId: string,
  ): Promise<ChatThread | null> {
    const [row] = await db
      .select()
      .from(chatThreads)
      .where(eq(chatThreads.id, threadId))
      .limit(1);
    return row ?? null;
  }

  async findThreadByTripAndPassenger(
    db: DbClient,
    tripId: string,
    passengerId: string,
  ): Promise<ChatThread | null> {
    const [row] = await db
      .select()
      .from(chatThreads)
      .where(
        and(
          eq(chatThreads.tripId, tripId),
          eq(chatThreads.passengerId, passengerId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  // Inserts a thread row, silently ignoring a duplicate (trip, passenger) pair.
  async upsertThread(
    db: DbClient,
    data: InsertChatThread,
  ): Promise<ChatThread> {
    const [row] = await db
      .insert(chatThreads)
      .values(data)
      .onConflictDoNothing()
      .returning();
    if (row) return row;
    const existing = await this.findThreadByTripAndPassenger(
      db,
      data.tripId,
      data.passengerId,
    );
    return existing!;
  }

  // ── Unified inbox ─────────────────────────────────────────────────────────

  /**
   * Returns every thread the user participates in (as driver or passenger),
   * enriched with trip data, both participants, the latest message, and
   * per-user unread count. One row per thread, sorted newest-activity-first.
   *
   * Optional filters:
   *   tripId   — scope to a single trip
   *   threadId — fetch exactly one thread (used by GET /chat-threads/:id)
   */
  async listInboxThreads(
    db: DbClient,
    userId: string,
    filters?: InboxFilters,
  ): Promise<InboxThreadRow[]> {
    const driverUser = alias(user, 'driver_user');
    const passengerUser = alias(user, 'passenger_user');
    const msgSender = alias(user, 'msg_sender');

    // DISTINCT ON picks the latest message row per thread, ordered by created_at DESC.
    const latestMsg = db
      .selectDistinctOn([chatMessages.threadId], {
        threadId: chatMessages.threadId,
        id: chatMessages.id,
        senderId: chatMessages.senderId,
        body: chatMessages.body,
        createdAt: chatMessages.createdAt,
        deletedAt: chatMessages.deletedAt,
      })
      .from(chatMessages)
      .orderBy(chatMessages.threadId, desc(chatMessages.createdAt))
      .as('latest_msg');

    // Correlated subquery counts unread messages for the current user in each thread.
    const unreadCount = sql<number>`(
      SELECT COUNT(*)::int
      FROM "chat_messages" cm2
      WHERE cm2."thread_id" = ${chatThreads.id}
        AND cm2."sender_id" != ${userId}
        AND cm2."deleted_at" IS NULL
        AND CASE
          WHEN ${trips.driverId} = ${userId}
            THEN (${chatThreads.driverLastReadAt} IS NULL
                  OR cm2."created_at" > ${chatThreads.driverLastReadAt})
          ELSE (${chatThreads.passengerLastReadAt} IS NULL
                OR cm2."created_at" > ${chatThreads.passengerLastReadAt})
        END
    )`;

    const conditions = [
      or(eq(trips.driverId, userId), eq(chatThreads.passengerId, userId)),
    ];
    if (filters?.tripId) {
      conditions.push(eq(chatThreads.tripId, filters.tripId));
    }
    if (filters?.threadId) {
      conditions.push(eq(chatThreads.id, filters.threadId));
    }

    const rows = await db
      .select({
        thread: chatThreads,
        trip: trips,
        driver: {
          id: driverUser.id,
          name: driverUser.name,
          image: driverUser.image,
        },
        passenger: {
          id: passengerUser.id,
          name: passengerUser.name,
          image: passengerUser.image,
        },
        latestMsgId: latestMsg.id,
        latestMsgSenderId: latestMsg.senderId,
        latestMsgSenderName: msgSender.name,
        latestMsgBody: latestMsg.body,
        latestMsgCreatedAt: latestMsg.createdAt,
        latestMsgDeletedAt: latestMsg.deletedAt,
        unreadCount,
      })
      .from(chatThreads)
      .innerJoin(trips, eq(chatThreads.tripId, trips.id))
      .innerJoin(driverUser, eq(trips.driverId, driverUser.id))
      .innerJoin(passengerUser, eq(chatThreads.passengerId, passengerUser.id))
      .leftJoin(latestMsg, eq(latestMsg.threadId, chatThreads.id))
      .leftJoin(msgSender, eq(latestMsg.senderId, msgSender.id))
      .where(and(...conditions))
      .orderBy(
        desc(sql`COALESCE(${latestMsg.createdAt}, ${chatThreads.createdAt})`),
      );

    return rows;
  }

  // ── Read tracking ─────────────────────────────────────────────────────────

  async markRead(
    db: DbClient,
    threadId: string,
    role: ThreadRole,
  ): Promise<void> {
    const patch =
      role === 'driver'
        ? { driverLastReadAt: new Date() }
        : { passengerLastReadAt: new Date() };
    await db.update(chatThreads).set(patch).where(eq(chatThreads.id, threadId));
  }

  // ── Message reads ─────────────────────────────────────────────────────────

  async listMessages(
    db: DbClient,
    threadId: string,
    limit: number,
    cursor?: { createdAt: Date; id: string },
  ): Promise<MessageWithSender[]> {
    const rows = await db
      .select({
        message: chatMessages,
        senderName: user.name,
      })
      .from(chatMessages)
      .innerJoin(user, eq(chatMessages.senderId, user.id))
      .where(
        and(
          eq(chatMessages.threadId, threadId),
          cursor
            ? or(
                lt(chatMessages.createdAt, cursor.createdAt),
                and(
                  eq(chatMessages.createdAt, cursor.createdAt),
                  lt(chatMessages.id, cursor.id),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(desc(chatMessages.createdAt), desc(chatMessages.id))
      .limit(limit);

    return rows.map((r) => ({ ...r.message, senderName: r.senderName }));
  }

  async findMessageById(
    db: DbClient,
    messageId: string,
  ): Promise<ChatMessage | null> {
    const [row] = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.id, messageId))
      .limit(1);
    return row ?? null;
  }

  // ── Message writes ────────────────────────────────────────────────────────

  async insertMessage(
    db: DbClient,
    data: InsertMessage,
  ): Promise<MessageWithSender> {
    const [row] = await db
      .insert(chatMessages)
      .values({
        id: data.id,
        threadId: data.threadId,
        senderId: data.senderId,
        rideId: data.rideId ?? null,
        body: data.body,
      })
      .returning();

    const [userRow] = await db
      .select({ name: user.name })
      .from(user)
      .where(eq(user.id, data.senderId))
      .limit(1);

    return { ...row, senderName: userRow?.name ?? '' };
  }

  // Returns null when the message was already soft-deleted (idempotent).
  async softDeleteMessage(
    db: DbClient,
    messageId: string,
    deletedByUserId: string,
  ): Promise<ChatMessage | null> {
    const [row] = await db
      .update(chatMessages)
      .set({ deletedAt: new Date(), deletedByUserId })
      .where(
        and(eq(chatMessages.id, messageId), isNull(chatMessages.deletedAt)),
      )
      .returning();
    return row ?? null;
  }
}
