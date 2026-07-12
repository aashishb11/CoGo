import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useSession } from '@/features/auth/queries';
import {
  type ChatInboxItemDto,
  type ChatMessageDto,
  type SendChatMessageInput,
  deleteChatMessage,
  getChatThread,
  listChatInbox,
  listChatMessages,
  markChatThreadRead,
  sendChatMessage,
} from '@/features/inbox/chat-api';
import type { ChatMessage, ChatThread } from '@/features/inbox/chat-types';
import type { DriverTripDto } from '@/features/trips/api';
import { useTripById } from '@/features/trips/queries';
import { invalidateAll } from '@/shared/query/invalidation';

// Live updates come from the Socket.IO `/chat` namespace
// (see chat-socket.ts / chat-realtime.ts). Polling stays as a safety net for
// the cases where the socket can't connect (offline, server down, expired
// session). The intervals are intentionally slow.
const MESSAGES_POLL_INTERVAL_MS = 30000;
const THREAD_POLL_INTERVAL_MS = 60000;
const INBOX_POLL_INTERVAL_MS = 60000;

export const chatQueryKeys = {
  all: () => ['chat'] as const,
  inbox: () => ['chat', 'inbox'] as const,
  thread: (threadId: string) => ['chat', 'thread', threadId] as const,
  messages: (threadId: string) => ['chat', 'thread', threadId, 'messages'] as const,
} as const;

function getInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }
  return name.trim().slice(0, 2).toUpperCase() || '??';
}

function pickOtherParticipant(item: ChatInboxItemDto) {
  return item.role === 'driver' ? item.passenger : item.driver;
}

function pickTripEndpointLabel(
  direct: string | null | undefined,
  nested: { label?: string | null } | null | undefined,
): string {
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  if (nested && typeof nested.label === 'string' && nested.label.trim()) {
    return nested.label.trim();
  }
  return '';
}

function buildEmbeddedTripLabel(trip: ChatInboxItemDto['trip'] | undefined | null): string {
  if (!trip) return '';
  const origin = pickTripEndpointLabel(trip.originLabel, trip.origin);
  const destination = pickTripEndpointLabel(trip.destinationLabel, trip.destination);
  if (!origin && !destination) return '';
  return `${origin} -> ${destination}`;
}

function pickTripId(item: ChatInboxItemDto): string | null {
  // Spec shows ChatInboxItemDto.trip as InboxTripDto (no id), but the real
  // response carries the trip ref either at item.tripId (FK column) or at
  // item.trip.id. Read both, the first non-empty wins.
  const fromRoot = typeof item.tripId === 'string' && item.tripId.trim() ? item.tripId.trim() : '';
  if (fromRoot) return fromRoot;
  const fromNested =
    typeof item.trip?.id === 'string' && item.trip.id.trim() ? item.trip.id.trim() : '';
  return fromNested || null;
}

function mapInboxItemToThread(item: ChatInboxItemDto): ChatThread {
  const other = pickOtherParticipant(item);
  const lastMessageBody = item.latestMessage?.deleted ? '' : (item.latestMessage?.body ?? '');
  return {
    id: item.id,
    tripId: pickTripId(item),
    participantUserId: typeof other.id === 'string' && other.id.trim() ? other.id.trim() : null,
    participantName: other.name,
    participantInitials: getInitials(other.name),
    lastMessage: lastMessageBody,
    lastMessageAt: item.latestMessage?.createdAt ?? item.createdAt,
    unreadCount: item.unreadCount,
    tripLabel: buildEmbeddedTripLabel(item.trip),
  };
}

function mapMessageDtoToMessage(
  dto: ChatMessageDto,
  currentUserId: string | undefined,
): ChatMessage {
  return {
    id: dto.id,
    threadId: dto.threadId,
    body: dto.deleted ? '' : dto.body,
    sentAt: dto.createdAt,
    fromSelf: Boolean(currentUserId) && dto.sender.id === currentUserId,
    deleted: dto.deleted,
  };
}

export function useChatInbox(enabled = true) {
  const query = useQuery({
    queryKey: chatQueryKeys.inbox(),
    queryFn: listChatInbox,
    enabled,
    refetchInterval: enabled ? INBOX_POLL_INTERVAL_MS : false,
  });

  const threads = useMemo<ChatThread[]>(
    () => (query.data ?? []).map(mapInboxItemToThread),
    [query.data],
  );

  return { ...query, threads };
}

export function useChatThread(threadId: string) {
  const enabled = threadId.trim().length > 0;
  const query = useQuery({
    queryKey: chatQueryKeys.thread(threadId),
    queryFn: () => getChatThread(threadId),
    enabled,
    refetchInterval: enabled ? THREAD_POLL_INTERVAL_MS : false,
  });

  const thread = useMemo<ChatThread | null>(
    () => (query.data ? mapInboxItemToThread(query.data) : null),
    [query.data],
  );

  return { ...query, thread };
}

export function useChatMessages(threadId: string) {
  const session = useSession();
  const currentUserId = session.data?.user?.id;
  const enabled = threadId.trim().length > 0;

  const query = useQuery({
    queryKey: chatQueryKeys.messages(threadId),
    queryFn: () => listChatMessages(threadId),
    enabled,
    refetchInterval: enabled ? MESSAGES_POLL_INTERVAL_MS : false,
  });

  const messages = useMemo<ChatMessage[]>(
    () => (query.data ?? []).map((dto) => mapMessageDtoToMessage(dto, currentUserId)),
    [query.data, currentUserId],
  );

  return { ...query, messages };
}

export type SendChatMessageVariables = {
  threadId: string;
  input: SendChatMessageInput;
};

type SendChatMessageMutationContext = {
  previousMessages: ChatMessageDto[] | undefined;
};

export function useSendChatMessage() {
  const queryClient = useQueryClient();
  const session = useSession();
  const currentUser = session.data?.user;

  return useMutation<
    ChatMessageDto | null,
    Error,
    SendChatMessageVariables,
    SendChatMessageMutationContext
  >({
    mutationFn: ({ threadId, input }) => sendChatMessage(threadId, input),
    onMutate: async ({ threadId, input }) => {
      const messagesKey = chatQueryKeys.messages(threadId);
      // Avoid in-flight refetches overwriting our optimistic update.
      await queryClient.cancelQueries({ queryKey: messagesKey });
      const previousMessages = queryClient.getQueryData<ChatMessageDto[]>(messagesKey);

      const optimistic: ChatMessageDto = {
        id: `optimistic-${Date.now()}`,
        threadId,
        sender: {
          id: currentUser?.id ?? 'me',
          name: currentUser?.name ?? '',
        },
        rideId: input.rideId ?? null,
        body: input.body,
        createdAt: new Date().toISOString(),
        deleted: false,
      };

      // The list is newest-first, so prepend.
      queryClient.setQueryData<ChatMessageDto[]>(messagesKey, (old) =>
        old ? [optimistic, ...old] : [optimistic],
      );

      return { previousMessages };
    },
    onError: (_err, variables, context) => {
      if (context?.previousMessages !== undefined) {
        queryClient.setQueryData(
          chatQueryKeys.messages(variables.threadId),
          context.previousMessages,
        );
      }
    },
    onSettled: (_data, _err, variables) => {
      invalidateAll(queryClient, [
        chatQueryKeys.messages(variables.threadId),
        chatQueryKeys.thread(variables.threadId),
        chatQueryKeys.inbox(),
      ]);
    },
  });
}

function readTripPointLabel(point: DriverTripDto['origin'] | undefined | null): string {
  if (!point) return '';
  if (typeof point === 'string') return point.trim();
  if (typeof point.label === 'string') return point.label.trim();
  return '';
}

function formatTripDetailLabel(trip: DriverTripDto | undefined | null): string {
  if (!trip) return '';
  const origin = readTripPointLabel(trip.origin);
  const destination = readTripPointLabel(trip.destination);
  if (!origin && !destination) return '';
  return `${origin} -> ${destination}`;
}

/**
 * Resolves the "Origin -> Destination" label for a chat thread:
 * 1. If the chat-inbox response already carries it (embeddedLabel), use that.
 * 2. Otherwise hit GET /api/trips/{tripId} via the shared trips query so the
 *    cache is shared with the rest of the app.
 */
export function useChatThreadTripLabel(
  tripId: string | null | undefined,
  embeddedLabel: string,
): string {
  const shouldFetchTrip = !embeddedLabel && Boolean(tripId);
  const tripQuery = useTripById(shouldFetchTrip ? tripId : null);

  return useMemo(() => {
    if (embeddedLabel) return embeddedLabel;
    return formatTripDetailLabel(tripQuery.data);
  }, [embeddedLabel, tripQuery.data]);
}

export function useMarkChatThreadRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (threadId: string) => markChatThreadRead(threadId),
    onSuccess: (_data, threadId) => {
      invalidateAll(queryClient, [chatQueryKeys.thread(threadId), chatQueryKeys.inbox()]);
    },
  });
}

export type DeleteChatMessageVariables = {
  threadId: string;
  messageId: string;
};

type DeleteChatMessageMutationContext = {
  previousMessages: ChatMessageDto[] | undefined;
};

export function useDeleteChatMessage() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, DeleteChatMessageVariables, DeleteChatMessageMutationContext>({
    mutationFn: ({ messageId }) => deleteChatMessage(messageId),
    onMutate: async ({ threadId, messageId }) => {
      const messagesKey = chatQueryKeys.messages(threadId);
      await queryClient.cancelQueries({ queryKey: messagesKey });
      const previousMessages = queryClient.getQueryData<ChatMessageDto[]>(messagesKey);

      queryClient.setQueryData<ChatMessageDto[]>(messagesKey, (old) =>
        old ? old.map((m) => (m.id === messageId ? { ...m, body: '', deleted: true } : m)) : old,
      );

      return { previousMessages };
    },
    onError: (_err, variables, context) => {
      if (context?.previousMessages !== undefined) {
        queryClient.setQueryData(
          chatQueryKeys.messages(variables.threadId),
          context.previousMessages,
        );
      }
    },
    onSettled: (_data, _err, variables) => {
      invalidateAll(queryClient, [
        chatQueryKeys.messages(variables.threadId),
        chatQueryKeys.thread(variables.threadId),
        chatQueryKeys.inbox(),
      ]);
    },
  });
}
