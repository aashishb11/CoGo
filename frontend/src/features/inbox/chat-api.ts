import { apiFetch, withParams } from '@/shared/api/client';

export type ChatRole = 'driver' | 'passenger';

type ChatTripLocationDto = {
  label?: string | null;
};

export type ChatTripDto = {
  id?: string | null;
  originLabel?: string | null;
  destinationLabel?: string | null;
  origin?: ChatTripLocationDto | null;
  destination?: ChatTripLocationDto | null;
  type: 'sporadic' | 'recurring';
};

export type ChatParticipantDto = {
  id: string;
  name: string;
  avatar?: unknown | null;
};

export type ChatMessageSenderDto = {
  id: string;
  name: string;
};

export type ChatLatestMessageDto = {
  id: string;
  sender: ChatMessageSenderDto;
  body: string;
  createdAt: string;
  deleted: boolean;
};

export type ChatInboxItemDto = {
  id: string;
  role: ChatRole;
  tripId?: string | null;
  trip: ChatTripDto;
  driver: ChatParticipantDto;
  passenger: ChatParticipantDto;
  latestMessage?: ChatLatestMessageDto | null;
  unreadCount: number;
  lastReadAt?: unknown | null;
  createdAt: string;
};

export type ChatMessageDto = {
  id: string;
  threadId: string;
  sender: ChatMessageSenderDto;
  rideId?: string | null;
  body: string;
  createdAt: string;
  deleted: boolean;
};

export type SendChatMessageInput = {
  body: string;
  rideId?: string;
};

type ChatInboxResponse = {
  items?: ChatInboxItemDto[];
};

type ChatMessageListResponse = {
  items?: ChatMessageDto[];
  nextCursor?: string | null;
};

const ENDPOINTS = {
  inbox: '/api/me/chat-inbox',
  thread: '/api/chat-threads/:threadId',
  threadRead: '/api/chat-threads/:threadId/read',
  threadMessages: '/api/chat-threads/:threadId/messages',
  message: '/api/chat-messages/:messageId',
} as const;

export async function listChatInbox(): Promise<ChatInboxItemDto[]> {
  const result = await apiFetch<ChatInboxResponse>({
    path: ENDPOINTS.inbox,
    method: 'GET',
  });

  return Array.isArray(result?.items) ? result.items : [];
}

export async function getChatThread(threadId: string): Promise<ChatInboxItemDto | null> {
  const trimmed = threadId.trim();
  if (!trimmed) {
    return null;
  }
  return apiFetch<ChatInboxItemDto>({
    path: withParams(ENDPOINTS.thread, { threadId: trimmed }),
    method: 'GET',
    allowNotFound: true,
  });
}

export async function listChatMessages(threadId: string): Promise<ChatMessageDto[]> {
  const trimmed = threadId.trim();
  if (!trimmed) {
    return [];
  }
  const result = await apiFetch<ChatMessageListResponse>({
    path: withParams(ENDPOINTS.threadMessages, { threadId: trimmed }),
    method: 'GET',
  });
  return Array.isArray(result?.items) ? result.items : [];
}

export async function sendChatMessage(
  threadId: string,
  input: SendChatMessageInput,
): Promise<ChatMessageDto | null> {
  const trimmed = threadId.trim();
  return apiFetch<ChatMessageDto>({
    path: withParams(ENDPOINTS.threadMessages, { threadId: trimmed }),
    method: 'POST',
    body: input,
  });
}

export async function markChatThreadRead(threadId: string): Promise<void> {
  const trimmed = threadId.trim();
  await apiFetch<null>({
    path: withParams(ENDPOINTS.threadRead, { threadId: trimmed }),
    method: 'POST',
  });
}

export async function deleteChatMessage(messageId: string): Promise<void> {
  const trimmed = messageId.trim();
  await apiFetch<null>({
    path: withParams(ENDPOINTS.message, { messageId: trimmed }),
    method: 'DELETE',
  });
}
