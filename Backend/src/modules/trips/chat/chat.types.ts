import type { ChatMessage, ChatThread } from '@core/database/schema';
import type { Trip } from '@core/database/schema/trips.schema';

export type ThreadRole = 'driver' | 'passenger';

export type MessageWithSender = ChatMessage & {
  senderName: string;
};

// Projection returned by the unified inbox repository query.
export type InboxThreadRow = {
  thread: ChatThread;
  trip: Trip;
  driver: { id: string; name: string; image: string | null };
  passenger: { id: string; name: string; image: string | null };
  latestMsgId: string | null;
  latestMsgSenderId: string | null;
  latestMsgSenderName: string | null;
  latestMsgBody: string | null;
  latestMsgCreatedAt: Date | null;
  latestMsgDeletedAt: Date | null;
  unreadCount: number;
};
