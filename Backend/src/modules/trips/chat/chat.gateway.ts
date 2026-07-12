import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { AuthService } from '@thallesp/nestjs-better-auth';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { AsyncApi, AsyncApiReceive, AsyncApiSend } from 'nestjs-asyncapi';
import { Server, Socket } from 'socket.io';
import { DB } from '@core/database/database.module';
import type * as schema from '@core/database/schema';
import { buildTrustedOrigins } from '@modules/auth/auth.factory';
import { TripsRepository } from '../trips/trips.repository';
import { ChatRepository } from './chat.repository';
import type { ThreadRole } from './chat.types';
import {
  ChatMessageDeletedPayloadDto,
  ChatThreadUpdatedPayloadDto,
  JoinThreadAckDto,
  JoinThreadRequestDto,
} from './dto/chat-events.dto';
import { ChatMessageResponseDto } from './dto/chat-message-response.dto';

interface SocketData {
  userId: string;
}

export type ThreadUpdatedPayload = {
  threadId: string;
  tripId: string;
  latestMessage: ChatMessageResponseDto;
  updatedAt: Date;
};

@Injectable()
@AsyncApi()
@WebSocketGateway({
  cors: {
    // Uses the same list as auth.factory so trusted origins stay in one place.
    // `exp://**` is a better-auth glob — Socket.IO's cors lib does not parse
    // globs, so the regex covers all exp:// Expo Go dev URLs instead.
    origin: buildTrustedOrigins().map((o) =>
      o === 'exp://**' ? /^exp:\/\// : o,
    ),
    credentials: true,
  },
  namespace: '/chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    @Inject(DB) private readonly db: PostgresJsDatabase<typeof schema>,
    private readonly authService: AuthService,
    private readonly chatRepo: ChatRepository,
    private readonly tripsRepo: TripsRepository,
  ) {}

  // ── Lifecycle ────────────────────────────────────────────────────────────

  async handleConnection(socket: Socket): Promise<void> {
    const token =
      (socket.handshake.auth as Record<string, string>)?.token ??
      socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '');

    if (!token) {
      socket.disconnect();
      return;
    }

    try {
      const session = await this.authService.api.getSession({
        headers: new Headers({ authorization: `Bearer ${token}` }),
      });

      if (!session?.user) {
        socket.disconnect();
        return;
      }

      (socket.data as SocketData).userId = session.user.id;

      // Subscribe to the user's personal room for inbox-level updates.
      await socket.join(`user:${session.user.id}`);

      this.logger.debug(
        `Socket connected: user=${session.user.id} socket=${socket.id}`,
      );
    } catch {
      socket.disconnect();
    }
  }

  handleDisconnect(socket: Socket): void {
    this.logger.debug(`Socket disconnected: ${socket.id}`);
  }

  // ── Client-to-server events ──────────────────────────────────────────────

  /**
   * Client emits `join_thread` to subscribe to real-time events for a thread.
   * Participant verification is performed by `assertCanJoin` below.
   *
   * Payload: { threadId: string }
   * Ack:     { ok: true } | { ok: false; error: string }
   */
  @AsyncApiReceive({
    channel: 'join_thread',
    summary: 'Client subscribes to live events for a chat thread',
    description:
      'Server verifies the caller is the trip driver or thread passenger ' +
      'before joining the room `thread:<threadId>`. Replies with an ack of ' +
      'shape `{ ok: true } | { ok: false, error: "UNAUTHORIZED" | "THREAD_NOT_FOUND" | "FORBIDDEN" }`.',
    message: {
      name: 'JoinThreadRequest',
      payload: JoinThreadRequestDto,
    },
  })
  @AsyncApiSend({
    channel: 'join_thread',
    summary: 'Ack returned to the client after join_thread',
    message: {
      name: 'JoinThreadAck',
      payload: JoinThreadAckDto,
    },
  })
  @SubscribeMessage('join_thread')
  async handleJoinThread(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { threadId: string },
  ): Promise<{ ok: boolean; error?: string }> {
    const userId = (socket.data as SocketData)?.userId;
    if (!userId) {
      return { ok: false, error: 'UNAUTHORIZED' };
    }

    const result = await this.assertCanJoin(userId, data.threadId);
    if ('error' in result) {
      return { ok: false, error: result.error };
    }

    await socket.join(`thread:${data.threadId}`);
    this.logger.debug(
      `User ${userId} (${result.role}) joined room thread:${data.threadId}`,
    );
    return { ok: true };
  }

  /**
   * Verifies that userId is a participant of threadId and returns the role.
   * Owned here (not on ChatService) so the gateway has no inbound dependency
   * on the service — breaks the previous gateway↔service cycle.
   */
  async assertCanJoin(
    userId: string,
    threadId: string,
  ): Promise<{ role: ThreadRole } | { error: string }> {
    const thread = await this.chatRepo.findThreadById(this.db, threadId);
    if (!thread) {
      return { error: 'THREAD_NOT_FOUND' };
    }
    const driverId = await this.tripsRepo.findDriverId(this.db, thread.tripId);
    if (driverId === userId) {
      return { role: 'driver' };
    }
    if (thread.passengerId === userId) {
      return { role: 'passenger' };
    }
    return { error: 'FORBIDDEN' };
  }

  // ── Server-to-client emitters ────────────────────────────────────────────

  @AsyncApiSend({
    channel: 'chat.message.created',
    summary: 'New message in a joined thread',
    description:
      'Emitted to room `thread:<threadId>` whenever a participant posts a message.',
    message: {
      name: 'ChatMessageCreated',
      payload: ChatMessageResponseDto,
    },
  })
  emitMessageCreated(threadId: string, message: ChatMessageResponseDto): void {
    this.server.to(`thread:${threadId}`).emit('chat.message.created', message);
  }

  @AsyncApiSend({
    channel: 'chat.message.deleted',
    summary: 'A message in a joined thread was deleted',
    description:
      'Emitted to room `thread:<threadId>` when a sender deletes their message.',
    message: {
      name: 'ChatMessageDeleted',
      payload: ChatMessageDeletedPayloadDto,
    },
  })
  emitMessageDeleted(threadId: string, messageId: string): void {
    this.server
      .to(`thread:${threadId}`)
      .emit('chat.message.deleted', { messageId });
  }

  /** Emits a lightweight inbox-row update to a specific user's personal room. */
  @AsyncApiSend({
    channel: 'chat.thread.updated',
    summary: 'Inbox-level update for one of the user’s threads',
    description:
      'Emitted to room `user:<userId>` whenever any of the user’s threads receives a new ' +
      'latest message — used to refresh inbox rows without joining each thread.',
    message: {
      name: 'ChatThreadUpdated',
      payload: ChatThreadUpdatedPayloadDto,
    },
  })
  emitThreadUpdated(userId: string, payload: ThreadUpdatedPayload): void {
    this.server.to(`user:${userId}`).emit('chat.thread.updated', payload);
  }
}
