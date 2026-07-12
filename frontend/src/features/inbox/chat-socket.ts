import { Platform } from 'react-native';
import { type Socket, io } from 'socket.io-client';

import { authClient, baseURL } from '@/features/auth/auth-client';

// Socket.IO namespace exposed by the backend's realtime API. See
// https://cogo-backend.onrender.com/api/docs/ws.
const CHAT_NAMESPACE = '/chat';

const socketURL = `${baseURL.endsWith('/') ? baseURL.slice(0, -1) : baseURL}${CHAT_NAMESPACE}`;

let currentSocket: Socket | null = null;
let currentUserId: string | null = null;

function getNativeAuthHeaders(): Record<string, string> {
  if (Platform.OS === 'web') return {};
  const cookie = authClient.getCookie();
  return cookie ? { Cookie: cookie } : {};
}

function buildSocket(): Socket {
  return io(socketURL, {
    transports: ['websocket'],
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 8000,
    withCredentials: true,
    extraHeaders: getNativeAuthHeaders(),
  });
}

/**
 * Returns a process-wide Socket.IO client bound to the `/chat` namespace.
 * Disconnects and rebuilds when the signed-in user changes so the new
 * session's cookie is sent on the next handshake.
 */
export function getChatSocket(userId: string | null | undefined): Socket | null {
  const normalized = userId && userId.trim() ? userId.trim() : null;

  if (!normalized) {
    if (currentSocket) {
      currentSocket.removeAllListeners();
      currentSocket.disconnect();
      currentSocket = null;
      currentUserId = null;
    }
    return null;
  }

  if (currentSocket && currentUserId === normalized) {
    if (!currentSocket.connected) {
      currentSocket.connect();
    }
    return currentSocket;
  }

  if (currentSocket) {
    currentSocket.removeAllListeners();
    currentSocket.disconnect();
  }

  currentSocket = buildSocket();
  currentUserId = normalized;
  return currentSocket;
}

export type JoinThreadAck = {
  ok?: boolean;
  error?: 'UNAUTHORIZED' | 'THREAD_NOT_FOUND' | 'FORBIDDEN' | string;
};

export function emitJoinThread(socket: Socket, threadId: string): Promise<JoinThreadAck> {
  return new Promise((resolve) => {
    socket.emit('join_thread', { threadId }, (ack: JoinThreadAck | undefined) => {
      resolve(ack ?? { ok: false });
    });
  });
}
