import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { type Socket } from 'socket.io-client';

import { useSession } from '@/features/auth/queries';
import {
  type ChatInboxItemDto,
  type ChatLatestMessageDto,
  type ChatMessageDto,
} from '@/features/inbox/chat-api';
import { chatQueryKeys } from '@/features/inbox/chat-queries';
import { emitJoinThread, getChatSocket } from '@/features/inbox/chat-socket';
import { invalidateAll } from '@/shared/query/invalidation';

type ChatMessageCreatedPayload = ChatMessageDto;

type ChatMessageDeletedPayload = {
  messageId: string;
};

type ChatThreadUpdatedPayload = {
  threadId: string;
  tripId?: string | null;
  latestMessage?: ChatLatestMessageDto | null;
  updatedAt?: string | null;
};

function isOptimisticId(id: string): boolean {
  return id.startsWith('optimistic-');
}

function upsertMessage(messages: ChatMessageDto[] | undefined, incoming: ChatMessageDto) {
  const next: ChatMessageDto[] = messages ? [...messages] : [];

  // Drop matching optimistic placeholder (same sender + body, still pending).
  // The backend assigns a real id, so we can't compare ids directly.
  const optimisticIndex = next.findIndex(
    (m) =>
      isOptimisticId(m.id) &&
      m.threadId === incoming.threadId &&
      m.sender.id === incoming.sender.id &&
      m.body === incoming.body,
  );
  if (optimisticIndex !== -1) {
    next.splice(optimisticIndex, 1);
  }

  const realIndex = next.findIndex((m) => m.id === incoming.id);
  if (realIndex !== -1) {
    next[realIndex] = incoming;
    return next;
  }

  // Messages list is newest-first.
  return [incoming, ...next];
}

/**
 * Subscribes to live updates for a single thread. Joins the room on connect
 * and rewires the handlers whenever the socket reconnects.
 */
export function useChatThreadRealtime(threadId: string) {
  const queryClient = useQueryClient();
  const session = useSession();
  const userId = session.data?.user?.id ?? null;
  const trimmedThreadId = threadId.trim();

  useEffect(() => {
    if (!userId || !trimmedThreadId) return;
    const socket: Socket | null = getChatSocket(userId);
    if (!socket) return;
    const activeSocket: Socket = socket;

    let cancelled = false;

    async function join() {
      const ack = await emitJoinThread(activeSocket, trimmedThreadId);
      if (cancelled) return;
      if (!ack.ok) {
        // Authorization or thread errors: REST polling still works as fallback.
        return;
      }
    }

    function handleConnect() {
      void join();
    }

    function handleMessageCreated(payload: ChatMessageCreatedPayload) {
      if (!payload || payload.threadId !== trimmedThreadId) return;
      queryClient.setQueryData<ChatMessageDto[]>(chatQueryKeys.messages(trimmedThreadId), (old) =>
        upsertMessage(old, payload),
      );
      invalidateAll(queryClient, [chatQueryKeys.thread(trimmedThreadId), chatQueryKeys.inbox()]);
    }

    function handleMessageDeleted(payload: ChatMessageDeletedPayload) {
      if (!payload?.messageId) return;
      queryClient.setQueryData<ChatMessageDto[]>(chatQueryKeys.messages(trimmedThreadId), (old) =>
        old
          ? old.map((m) => (m.id === payload.messageId ? { ...m, body: '', deleted: true } : m))
          : old,
      );
      invalidateAll(queryClient, [chatQueryKeys.thread(trimmedThreadId), chatQueryKeys.inbox()]);
    }

    activeSocket.on('connect', handleConnect);
    activeSocket.on('chat.message.created', handleMessageCreated);
    activeSocket.on('chat.message.deleted', handleMessageDeleted);
    if (activeSocket.connected) {
      void join();
    }

    return () => {
      cancelled = true;
      activeSocket.off('connect', handleConnect);
      activeSocket.off('chat.message.created', handleMessageCreated);
      activeSocket.off('chat.message.deleted', handleMessageDeleted);
    };
  }, [queryClient, trimmedThreadId, userId]);
}

/**
 * Listens to `chat.thread.updated` events on the user-level room and keeps
 * the inbox cache in sync without per-thread joins. The server adds the
 * caller to `user:<userId>` automatically on handshake.
 *
 * Tears down the singleton socket when `enabled` flips off (sign-out) so
 * the cookie of the next signed-in user is sent on a fresh handshake.
 */
export function useChatInboxRealtime(enabled: boolean) {
  const queryClient = useQueryClient();
  const session = useSession();
  const userId = session.data?.user?.id ?? null;

  useEffect(() => {
    if (!enabled || !userId) {
      getChatSocket(null);
      return;
    }
    const socket = getChatSocket(userId);
    if (!socket) return;

    function handleThreadUpdated(payload: ChatThreadUpdatedPayload) {
      if (!payload?.threadId) return;

      queryClient.setQueryData<ChatInboxItemDto[]>(chatQueryKeys.inbox(), (old) => {
        if (!old) return old;
        const idx = old.findIndex((item) => item.id === payload.threadId);
        if (idx === -1) {
          // Unknown thread — trigger a refetch instead of guessing the shape.
          void queryClient.invalidateQueries({ queryKey: chatQueryKeys.inbox() });
          return old;
        }
        const next = [...old];
        const existing = next[idx];
        const latest = payload.latestMessage ?? existing.latestMessage ?? null;
        const senderId = latest?.sender?.id;
        const isFromOther = senderId ? senderId !== userId : true;
        next[idx] = {
          ...existing,
          latestMessage: latest,
          unreadCount: isFromOther ? existing.unreadCount + 1 : existing.unreadCount,
        };
        return next;
      });

      invalidateAll(queryClient, [chatQueryKeys.thread(payload.threadId)]);
    }

    socket.on('chat.thread.updated', handleThreadUpdated);

    return () => {
      socket.off('chat.thread.updated', handleThreadUpdated);
    };
  }, [enabled, queryClient, userId]);
}
