import { Tabs } from 'expo-router';
import { Calendar, Inbox, PlusCircle, Search, User } from 'lucide-react-native';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useRequireAuth } from '@/features/auth/queries';
import { useDismissedAcceptedBookingIds } from '@/features/bookings/local-state';
import { useMyBookings } from '@/features/bookings/queries';
import { useChatNotificationWatcher } from '@/features/inbox/chat-notifications';
import { useChatInbox } from '@/features/inbox/chat-queries';
import { useInboxRequests } from '@/features/inbox/queries';
import { FontSize, FontWeight, Palette, Spacing } from '@/shared/theme';

export default function TabLayout() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const session = useRequireAuth();
  const isAuthenticated = Boolean(session.data?.user);
  const inboxQuery = useInboxRequests(isAuthenticated);
  const myBookingsQuery = useMyBookings(isAuthenticated);
  const chatInboxQuery = useChatInbox(isAuthenticated);
  const dismissedAcceptedBookingsQuery = useDismissedAcceptedBookingIds();
  // Asks for OS notification permission on first signed-in render, registers
  // an Expo push token with the backend best-effort, and surfaces a local
  // notification whenever the chat inbox polls in a new message from another
  // user. Lives in the tab layout so it runs while the user is on any tab.
  useChatNotificationWatcher(isAuthenticated);
  const driverPendingCount = inboxQuery.data
    ? new Set(inboxQuery.data.filter((item) => item.pendingCount > 0).map((item) => item.tripId))
        .size
    : 0;
  const dismissedAcceptedBookingIds = new Set(dismissedAcceptedBookingsQuery.data ?? []);
  const passengerAcceptedCount = myBookingsQuery.data
    ? new Set(
        myBookingsQuery.data
          .filter(
            (booking) =>
              booking.status === 'accepted' && !dismissedAcceptedBookingIds.has(booking.id),
          )
          .map((booking) => booking.tripId),
      ).size
    : 0;
  const unreadChatThreadsCount = chatInboxQuery.threads.filter(
    (thread) => thread.unreadCount > 0,
  ).length;
  const inboxBadgeCount = driverPendingCount + passengerAcceptedCount + unreadChatThreadsCount;

  // Gate the tabs on a settled, authenticated session so the cached UI never
  // paints for a signed-out (or session-expired) user. The redirect lives in
  // useRequireAuth's effect; returning null here keeps the shell hidden in
  // the same tick the effect fires.
  if (!isAuthenticated) {
    if (session.isPending) {
      return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={Palette.primary} size="small" />
        </View>
      );
    }
    return null;
  }

  return (
    <Tabs
      screenOptions={{
        // Each screen renders its own inline header (matches the mockup pattern
        // — white bg, brand wordmark + welcome line on Find, simple title on
        // Profile/Create) so we hide the navigation-default header here.
        headerShown: false,
        tabBarActiveTintColor: Palette.primary,
        tabBarInactiveTintColor: Palette.textSecondary,
        tabBarStyle: {
          backgroundColor: Palette.background,
          borderTopWidth: 1,
          borderTopColor: Palette.border,
          height: 60 + insets.bottom,
          paddingTop: Spacing.xs,
          paddingBottom: Math.max(Spacing.sm, insets.bottom),
        },
        tabBarLabelStyle: {
          fontSize: FontSize.xs,
          fontWeight: FontWeight.semibold,
        },
      }}
    >
      <Tabs.Screen
        name="agenda"
        options={{
          title: t('tab.agenda.title'),
          tabBarLabel: t('tab.agenda.title'),
          tabBarIcon: ({ color, size, focused }) => (
            <Calendar color={color} size={size} strokeWidth={focused ? 2.5 : 2} />
          ),
        }}
      />

      <Tabs.Screen
        name="index"
        options={{
          title: t('tab.find.title'),
          tabBarLabel: t('tab.find.title'),
          tabBarIcon: ({ color, size, focused }) => (
            <Search color={color} size={size} strokeWidth={focused ? 2.5 : 2} />
          ),
        }}
      />

      <Tabs.Screen
        name="trips/create"
        options={{
          title: t('tab.createTrip.title'),
          tabBarLabel: t('tab.createTrip.title'),
          tabBarIcon: ({ color, size, focused }) => (
            <PlusCircle color={color} size={size} strokeWidth={focused ? 2.5 : 2} />
          ),
        }}
      />

      <Tabs.Screen
        name="inbox"
        options={{
          title: t('tab.inbox.title'),
          tabBarLabel: t('tab.inbox.title'),
          tabBarBadge: inboxBadgeCount > 0 ? inboxBadgeCount : undefined,
          tabBarBadgeStyle: {
            backgroundColor: Palette.danger,
            color: Palette.textOnPrimary,
            fontSize: FontSize.xxs,
            fontWeight: FontWeight.bold,
          },
          tabBarIcon: ({ color, size, focused }) => (
            <Inbox color={color} size={size} strokeWidth={focused ? 2.5 : 2} />
          ),
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: t('tab.viewProfile.title'),
          tabBarLabel: t('tab.viewProfile.title'),
          tabBarIcon: ({ color, size, focused }) => (
            <User color={color} size={size} strokeWidth={focused ? 2.5 : 2} />
          ),
        }}
      />
    </Tabs>
  );
}
