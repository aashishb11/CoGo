import type { InboxThreadRow, MessageWithSender } from './chat.types';
import type {
  ChatMessageResponseDto,
  ChatMessageListResponseDto,
} from './dto/chat-message-response.dto';
import type {
  ChatInboxItemDto,
  ChatInboxResponseDto,
} from './dto/chat-inbox-item.dto';

// ── Message mappers ───────────────────────────────────────────────────────

export function toMessageResponse(
  row: MessageWithSender,
): ChatMessageResponseDto {
  const deleted = row.deletedAt !== null;
  return {
    id: row.id,
    threadId: row.threadId,
    sender: { id: row.senderId, name: row.senderName },
    rideId: row.rideId ?? null,
    body: deleted ? '' : row.body,
    createdAt: row.createdAt,
    deleted,
  };
}

export function toMessageListResponse(
  rows: MessageWithSender[],
  limit: number,
): ChatMessageListResponseDto {
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const items = page.map(toMessageResponse);

  let nextCursor: string | null = null;
  if (hasMore) {
    const last = page[page.length - 1];
    nextCursor = Buffer.from(
      JSON.stringify({ createdAt: last.createdAt, id: last.id }),
    ).toString('base64url');
  }

  return { items, nextCursor };
}

export function parseCursor(
  raw: string,
): { createdAt: Date; id: string } | undefined {
  try {
    const decoded = Buffer.from(raw, 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded) as { createdAt: string; id: string };
    return { createdAt: new Date(parsed.createdAt), id: parsed.id };
  } catch {
    return undefined;
  }
}

// ── Inbox mappers ─────────────────────────────────────────────────────────

export function toInboxItemResponse(
  row: InboxThreadRow,
  userId: string,
): ChatInboxItemDto {
  const role = row.trip.driverId === userId ? 'driver' : 'passenger';
  const lastReadAt =
    role === 'driver'
      ? (row.thread.driverLastReadAt ?? null)
      : (row.thread.passengerLastReadAt ?? null);

  const latestMessage =
    row.latestMsgId !== null
      ? {
          id: row.latestMsgId,
          sender: {
            id: row.latestMsgSenderId!,
            name: row.latestMsgSenderName!,
          },
          body: row.latestMsgDeletedAt != null ? '' : row.latestMsgBody!,
          createdAt: row.latestMsgCreatedAt!,
          deleted: row.latestMsgDeletedAt != null,
        }
      : null;

  return {
    id: row.thread.id,
    role,
    trip: {
      id: row.trip.id,
      origin: row.trip.originLabel,
      destination: row.trip.destinationLabel,
      departureAt: row.trip.departureAt ?? null,
      status: row.trip.status,
    },
    driver: {
      id: row.driver.id,
      name: row.driver.name,
      avatar: row.driver.image ?? null,
    },
    passenger: {
      id: row.passenger.id,
      name: row.passenger.name,
      avatar: row.passenger.image ?? null,
    },
    latestMessage,
    unreadCount: row.unreadCount,
    lastReadAt,
    createdAt: row.thread.createdAt,
  };
}

export function toInboxListResponse(
  rows: InboxThreadRow[],
  userId: string,
): ChatInboxResponseDto {
  return { items: rows.map((r) => toInboxItemResponse(r, userId)) };
}
