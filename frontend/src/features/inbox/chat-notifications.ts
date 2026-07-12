import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import { useSession } from '@/features/auth/queries';
import { useChatInbox } from '@/features/inbox/chat-queries';
import { useChatInboxRealtime } from '@/features/inbox/chat-realtime';
import { apiFetch } from '@/shared/api/client';
import { Palette } from '@/shared/theme';

// Foreground handler: by default iOS hides notifications when the app is open.
// We want chat banners to surface so the user notices a new message even while
// browsing other tabs. Set at module load so the handler is in place before
// any notification can fire.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const ANDROID_CHANNEL_ID = 'chat-messages';

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: 'Chat',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: Palette.primary,
  });
}

async function requestPermissionIfNeeded(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (current.canAskAgain === false) return false;
  const next = await Notifications.requestPermissionsAsync();
  return next.granted;
}

async function registerPushSubscriptionWithBackend(): Promise<void> {
  // The OpenAPI documents POST /api/me/push-subscriptions as Web Push (browser
  // PushSubscription shape: { endpoint, keys: { p256dh, auth } }). Native push
  // tokens don't have those keys. We still register best-effort using the
  // Expo push token as the `endpoint` value with stub keys so the backend can
  // later detect "this is an Expo push token" (starts with ExponentPushToken[)
  // and route via Expo's push service instead of Web Push. If the backend
  // rejects it, we still have the foreground local-notification path below.
  try {
    const tokenResponse = await Notifications.getExpoPushTokenAsync();
    const token =
      typeof tokenResponse.data === 'string' ? tokenResponse.data : String(tokenResponse.data);
    if (!token) return;
    await apiFetch<unknown>({
      path: '/api/me/push-subscriptions',
      method: 'POST',
      body: {
        endpoint: token,
        keys: { p256dh: 'native', auth: 'native' },
      },
    });
  } catch {
    // Best-effort: don't block the chat experience if registration fails.
  }
}

/**
 * Watches the chat inbox query (already polling every ~8s) and surfaces a
 * local notification whenever a new message arrives from another user.
 *
 * This is the *foreground reliability* path: the OS banner appears even when
 * the user is browsing other tabs. True background delivery requires the
 * backend to actually send remote pushes — see registerPushSubscription above.
 */
export function useChatNotificationWatcher(enabled: boolean) {
  const router = useRouter();
  const session = useSession();
  const currentUserId = session.data?.user?.id;
  const chatInbox = useChatInbox(enabled);
  const items = chatInbox.data;
  useChatInboxRealtime(enabled);
  const seenLatestByThread = useRef<Map<string, string>>(new Map());
  const permissionAttemptedForUser = useRef<string | null>(null);

  // Ask for permission + register with backend once per signed-in user.
  useEffect(() => {
    if (!enabled || !currentUserId) return;
    if (permissionAttemptedForUser.current === currentUserId) return;
    permissionAttemptedForUser.current = currentUserId;
    void (async () => {
      await ensureAndroidChannel();
      const granted = await requestPermissionIfNeeded();
      if (granted) {
        await registerPushSubscriptionWithBackend();
      }
    })();
  }, [enabled, currentUserId]);

  // Surface a local notification when a brand-new message lands in any thread.
  useEffect(() => {
    if (!enabled || !items) return;

    for (const item of items) {
      const latest = item.latestMessage;
      if (!latest) continue;
      const previousLatestId = seenLatestByThread.current.get(item.id);
      // First observation of this thread — record without notifying so we
      // don't fire a notification for every existing message on startup.
      if (previousLatestId === undefined) {
        seenLatestByThread.current.set(item.id, latest.id);
        continue;
      }
      if (previousLatestId === latest.id) continue;
      seenLatestByThread.current.set(item.id, latest.id);
      if (latest.deleted) continue;
      if (latest.sender.id === currentUserId) continue;

      void Notifications.scheduleNotificationAsync({
        content: {
          title: latest.sender.name,
          body: latest.body,
          data: { threadId: item.id },
        },
        trigger:
          Platform.OS === 'android'
            ? {
                channelId: ANDROID_CHANNEL_ID,
                type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
                seconds: 1,
              }
            : null,
      });
    }
  }, [items, enabled, currentUserId]);

  // Tap → deep link into the right chat thread.
  useEffect(() => {
    if (!enabled) return;
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      const threadId =
        data && typeof (data as { threadId?: unknown }).threadId === 'string'
          ? ((data as { threadId: string }).threadId as string)
          : '';
      if (!threadId) return;
      router.push({ pathname: '/chat/[id]', params: { id: threadId } });
    });
    return () => subscription.remove();
  }, [enabled, router]);
}
