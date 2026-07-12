import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DB } from '@core/database/database.module';
import type * as schema from '@core/database/schema';
import { NotificationsService } from '@modules/notifications/notifications.service';
import {
  throwBadRequest,
  throwConflict,
  throwForbidden,
  throwNotFound,
} from '@shared/errors/throw';
import { RidesRepository } from '../rides/rides.repository';
import { TRIP_STATUSES, type TripStatus } from '../trips.types';
import { TripsRepository } from '../trips/trips.repository';
import { ChatGateway } from './chat.gateway';
import { ChatRepository } from './chat.repository';
import {
  parseCursor,
  toInboxItemResponse,
  toInboxListResponse,
  toMessageListResponse,
  toMessageResponse,
} from './chat.mapper';
import type {
  ChatMessageListResponseDto,
  ChatMessageResponseDto,
} from './dto/chat-message-response.dto';
import type {
  ChatInboxItemDto,
  ChatInboxResponseDto,
} from './dto/chat-inbox-item.dto';
import type { ChatInboxQueryDto } from './dto/chat-inbox-query.dto';
import type { ListChatMessagesQueryDto } from './dto/list-chat-messages-query.dto';
import type { SendChatMessageDto } from './dto/send-chat-message.dto';
import type { ThreadRole } from './chat.types';

// Active trip statuses — exported from trips.types but checked here by value.
const ACTIVE_STATUS: TripStatus = 'active';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @Inject(DB) private readonly db: PostgresJsDatabase<typeof schema>,
    private readonly repo: ChatRepository,
    private readonly tripsRepo: TripsRepository,
    private readonly ridesRepo: RidesRepository,
    private readonly gateway: ChatGateway,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ── Inbox ────────────────────────────────────────────────────────────────

  async listInbox(
    userId: string,
    query: ChatInboxQueryDto,
  ): Promise<ChatInboxResponseDto> {
    const rows = await this.repo.listInboxThreads(this.db, userId, {
      tripId: query.tripId,
    });
    const filtered = query.unreadOnly
      ? rows.filter((r) => r.unreadCount > 0)
      : rows;
    return toInboxListResponse(filtered, userId);
  }

  async getThread(
    requesterId: string,
    threadId: string,
  ): Promise<ChatInboxItemDto> {
    const rows = await this.repo.listInboxThreads(this.db, requesterId, {
      threadId,
    });
    if (rows.length === 0) {
      throwNotFound('CHAT_THREAD_NOT_FOUND', 'Thread not found');
    }
    // listInboxThreads already enforces the OR(driver, passenger) condition,
    // so an empty result means either not found or not a participant.
    return toInboxItemResponse(rows[0], requesterId);
  }

  // ── Read tracking ─────────────────────────────────────────────────────────

  async markRead(requesterId: string, threadId: string): Promise<void> {
    const thread = await this.repo.findThreadById(this.db, threadId);
    if (!thread) {
      throwNotFound('CHAT_THREAD_NOT_FOUND', 'Thread not found');
    }
    const role = await this.resolveRole(
      requesterId,
      thread.tripId,
      thread.passengerId,
    );
    await this.repo.markRead(this.db, threadId, role);
  }

  // ── Messages ─────────────────────────────────────────────────────────────

  async listMessages(
    requesterId: string,
    threadId: string,
    query: ListChatMessagesQueryDto,
  ): Promise<ChatMessageListResponseDto> {
    const thread = await this.repo.findThreadById(this.db, threadId);
    if (!thread) {
      throwNotFound('CHAT_THREAD_NOT_FOUND', 'Thread not found');
    }
    await this.assertIsParticipant(
      requesterId,
      thread.tripId,
      thread.passengerId,
    );

    const cursor = query.cursor ? parseCursor(query.cursor) : undefined;
    const rows = await this.repo.listMessages(
      this.db,
      threadId,
      query.limit + 1,
      cursor,
    );
    return toMessageListResponse(rows, query.limit);
  }

  async sendMessage(
    senderId: string,
    threadId: string,
    body: SendChatMessageDto,
  ): Promise<ChatMessageResponseDto> {
    const thread = await this.repo.findThreadById(this.db, threadId);
    if (!thread) {
      throwNotFound('CHAT_THREAD_NOT_FOUND', 'Thread not found');
    }

    const driverId = await this.assertIsParticipant(
      senderId,
      thread.tripId,
      thread.passengerId,
    );
    await this.assertTripIsActive(thread.tripId);

    if (body.rideId) {
      const ride = await this.ridesRepo.findById(this.db, body.rideId);
      if (!ride || ride.tripId !== thread.tripId) {
        throwBadRequest(
          'CHAT_RIDE_WRONG_TRIP',
          "rideId does not belong to this thread's trip",
        );
      }
    }

    const message = await this.repo.insertMessage(this.db, {
      id: randomUUID(),
      threadId,
      senderId,
      rideId: body.rideId ?? null,
      body: body.body,
    });

    const response = toMessageResponse(message);
    this.gateway.emitMessageCreated(threadId, response);

    // Emit real-time inbox update to both participants' personal rooms.
    const threadUpdatedPayload = {
      threadId,
      tripId: thread.tripId,
      latestMessage: response,
      updatedAt: response.createdAt,
    };
    this.gateway.emitThreadUpdated(driverId, threadUpdatedPayload);
    this.gateway.emitThreadUpdated(thread.passengerId, threadUpdatedPayload);

    // Push notification to the recipient (not the sender).
    const recipientId = senderId === driverId ? thread.passengerId : driverId;
    this.notificationsService
      .sendChatMessage(recipientId, {
        threadId,
        tripId: thread.tripId,
        senderName: message.senderName,
        body: body.body,
      })
      .catch((err: unknown) => {
        this.logger.error('Failed to send chat push notification', err);
      });

    return response;
  }

  async deleteMessage(requesterId: string, messageId: string): Promise<void> {
    const message = await this.repo.findMessageById(this.db, messageId);
    if (!message) {
      throwNotFound('CHAT_MESSAGE_NOT_FOUND', 'Message not found');
    }
    if (message.senderId !== requesterId) {
      throwForbidden(
        'CHAT_DELETE_NOT_SENDER',
        'Only the sender can delete a message',
      );
    }
    const deleted = await this.repo.softDeleteMessage(
      this.db,
      messageId,
      requesterId,
    );
    // Only emit when the update actually touched a row (not already deleted).
    if (deleted) {
      this.gateway.emitMessageDeleted(message.threadId, messageId);
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  /**
   * Checks that userId is either the trip driver or the thread passenger.
   * Returns the driverId so callers can reuse it without an extra DB round-trip.
   */
  private async assertIsParticipant(
    userId: string,
    tripId: string,
    passengerId: string,
  ): Promise<string> {
    const driverId = await this.tripsRepo.findDriverId(this.db, tripId);
    if (driverId !== userId && passengerId !== userId) {
      throwForbidden(
        'CHAT_NOT_PARTICIPANT',
        'You are not a participant in this thread',
      );
    }
    if (driverId === null) {
      // Data invariant: thread's trip must exist with a driver — treat orphaned thread as not found.
      throwNotFound('CHAT_THREAD_NOT_FOUND', 'Thread not found');
    }
    return driverId;
  }

  private async resolveRole(
    userId: string,
    tripId: string,
    passengerId: string,
  ): Promise<ThreadRole> {
    const driverId = await this.tripsRepo.findDriverId(this.db, tripId);
    if (driverId !== userId && passengerId !== userId) {
      throwForbidden(
        'CHAT_NOT_PARTICIPANT',
        'You are not a participant in this thread',
      );
    }
    return driverId === userId ? 'driver' : 'passenger';
  }

  private async assertTripIsActive(tripId: string): Promise<void> {
    const trip = await this.tripsRepo.findById(this.db, tripId);
    const status = trip?.status;
    if (!status || status !== ACTIVE_STATUS) {
      throwConflict(
        'CHAT_TRIP_NOT_ACTIVE',
        'Cannot send messages on a trip that is not active',
      );
    }
    // Compile-time guard: ensures ACTIVE_STATUS stays within the union.
    const _check: (typeof TRIP_STATUSES)[number] = ACTIVE_STATUS;
    void _check;
  }
}
