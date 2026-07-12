import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Bell, MessageCircle } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useRequireAuth } from '@/features/auth/queries';
import { type BookingResponse } from '@/features/bookings/api';
import {
  useDismissAcceptedBookings,
  useDismissedAcceptedBookingIds,
} from '@/features/bookings/local-state';
import {
  useAcceptTripBookings,
  useMyBookings,
  useRejectTripBookings,
} from '@/features/bookings/queries';
import { type InboxItem } from '@/features/inbox/api';
import { useChatInbox } from '@/features/inbox/chat-queries';
import { ChatThreadListItem } from '@/features/inbox/components/chat-thread-list-item';
import { InboxRequestCard } from '@/features/inbox/components/inbox-request-card';
import { InboxRequestDetailsModal } from '@/features/inbox/components/inbox-request-details-modal';
import {
  SentBookingCard,
  type SentBookingGroup,
} from '@/features/inbox/components/sent-booking-card';
import { useInboxRequests } from '@/features/inbox/queries';
import { mapErrorToMessageKey } from '@/shared/api';
import { FontSize, FontWeight, Palette, Radii, Shadow, Spacing, Typography } from '@/shared/theme';
import { BrandLogo } from '@/shared/ui/components/brand-logo';
import { ScreenHeader } from '@/shared/ui/components/screen-header';
import { SegmentedControl } from '@/shared/ui/components/segmented-control';

type InboxTab = 'chats' | 'requests';
type RequestsTab = 'received' | 'sent';

function groupSentBookings(bookings: BookingResponse[]): SentBookingGroup[] {
  const groups = new Map<string, BookingResponse[]>();

  for (const booking of bookings) {
    const current = groups.get(booking.tripId) ?? [];
    current.push(booking);
    groups.set(booking.tripId, current);
  }

  return Array.from(groups.entries()).map(([tripId, groupBookings]) => ({
    tripId,
    bookings: groupBookings,
  }));
}

function hasVisibleSentBooking(
  group: SentBookingGroup,
  dismissedAcceptedBookingIds: ReadonlySet<string>,
) {
  return group.bookings.some(
    (booking) => booking.status !== 'accepted' || !dismissedAcceptedBookingIds.has(booking.id),
  );
}

export default function InboxScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const session = useRequireAuth();
  const tabParam = useLocalSearchParams<{ tab?: string }>().tab;
  const initialTab: InboxTab = tabParam === 'chats' ? 'chats' : 'requests';
  const [activeTab, setActiveTab] = useState<InboxTab>(initialTab);
  // Re-apply the URL tab param only when it actually changes (e.g. user came
  // back from a chat thread with `?tab=chats`). Without the ref guard, a user
  // who manually switches sub-tab would be snapped back on every render.
  const lastAppliedTabParam = useRef<string | undefined>(tabParam);
  useEffect(() => {
    if (tabParam === lastAppliedTabParam.current) return;
    lastAppliedTabParam.current = tabParam;
    if (tabParam === 'chats' || tabParam === 'requests') {
      setActiveTab(tabParam);
    }
  }, [tabParam]);
  const [activeRequestsTab, setActiveRequestsTab] = useState<RequestsTab>('received');
  const [selectedRequest, setSelectedRequest] = useState<InboxItem | null>(null);
  const isAuthenticated = Boolean(session.data?.user);
  const requestsQuery = useInboxRequests(isAuthenticated);
  const myBookingsQuery = useMyBookings(isAuthenticated);
  const chatInboxQuery = useChatInbox(isAuthenticated);
  const dismissedAcceptedBookingsQuery = useDismissedAcceptedBookingIds();
  const acceptMutation = useAcceptTripBookings();
  const dismissAcceptedBookingsMutation = useDismissAcceptedBookings();
  const rejectMutation = useRejectTripBookings();

  useFocusEffect(
    useCallback(() => {
      if (!session.data?.user) return;

      void requestsQuery.refetch();
      void myBookingsQuery.refetch();
      void chatInboxQuery.refetch();
    }, [chatInboxQuery, myBookingsQuery, requestsQuery, session.data?.user]),
  );

  const isReceivedLoading = session.isPending || requestsQuery.isLoading;
  const isSentLoading = session.isPending || myBookingsQuery.isLoading;
  const isChatsLoading = session.isPending || chatInboxQuery.isLoading;
  const receivedErrorMessage = requestsQuery.error
    ? t(mapErrorToMessageKey(requestsQuery.error))
    : '';
  const sentErrorMessage = myBookingsQuery.error
    ? t(mapErrorToMessageKey(myBookingsQuery.error))
    : '';
  const chatsErrorMessage = chatInboxQuery.error
    ? t(mapErrorToMessageKey(chatInboxQuery.error))
    : '';
  const chatThreads = chatInboxQuery.threads;
  const actionErrorMessage =
    acceptMutation.error || rejectMutation.error
      ? t(mapErrorToMessageKey(acceptMutation.error ?? rejectMutation.error))
      : '';
  const dismissedAcceptedBookingIds = useMemo(
    () => new Set(dismissedAcceptedBookingsQuery.data ?? []),
    [dismissedAcceptedBookingsQuery.data],
  );
  const requests = (requestsQuery.data ?? []).filter((item) => item.pendingCount > 0);
  const sentBookingGroups = useMemo(
    () =>
      groupSentBookings(myBookingsQuery.data ?? []).filter((group) =>
        hasVisibleSentBooking(group, dismissedAcceptedBookingIds),
      ),
    [dismissedAcceptedBookingIds, myBookingsQuery.data],
  );

  function closeRequestDetails() {
    setSelectedRequest(null);
    acceptMutation.reset();
    rejectMutation.reset();
  }

  async function handleDismissAccepted(group: SentBookingGroup) {
    const acceptedBookingIds = group.bookings
      .filter((booking) => booking.status === 'accepted')
      .map((booking) => booking.id);

    if (acceptedBookingIds.length === 0) {
      return;
    }

    try {
      await dismissAcceptedBookingsMutation.mutateAsync(acceptedBookingIds);
    } catch {
      // Local dismiss errors should not crash the inbox.
    }
  }

  async function handleAcceptRequest(item: InboxItem) {
    acceptMutation.reset();
    rejectMutation.reset();
    try {
      await acceptMutation.mutateAsync({
        tripId: item.tripId,
        input: { passengerId: item.passenger.id },
      });
      closeRequestDetails();
    } catch {
      // The mutation error is rendered inside the modal.
    }
  }

  async function handleRejectRequest(item: InboxItem) {
    acceptMutation.reset();
    rejectMutation.reset();
    try {
      await rejectMutation.mutateAsync({
        tripId: item.tripId,
        input: { passengerId: item.passenger.id },
      });
      closeRequestDetails();
    } catch {
      // The mutation error is rendered inside the modal.
    }
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader
        bottom={
          <SegmentedControl
            onChange={setActiveTab}
            options={[
              { value: 'chats', label: t('inbox.tabs.chats') },
              { value: 'requests', label: t('inbox.tabs.requests') },
            ]}
            value={activeTab}
            variant="underline"
          />
        }
        rightAction={<BrandLogo accessibilityLabel={t('header.brand')} size="compact" />}
        subtitle={t('inbox.subtitle')}
        title={t('tab.inbox.title')}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        style={styles.scroll}
      >
        <View style={styles.content}>
          {activeTab === 'chats' ? (
            isChatsLoading ? (
              <LoadingState label={t('inbox.chats.loading')} />
            ) : chatsErrorMessage ? (
              <ErrorState message={chatsErrorMessage} />
            ) : chatThreads.length === 0 ? (
              <EmptyState
                description={t('inbox.chats.emptyDescription')}
                icon="chat"
                title={t('inbox.chats.emptyTitle')}
              />
            ) : (
              <View style={styles.list}>
                <Text style={styles.sectionLabel}>{t('inbox.chats.sectionTitle')}</Text>
                {chatThreads.map((thread) => (
                  <ChatThreadListItem
                    key={thread.id}
                    onPress={(threadId) =>
                      router.push({
                        pathname: '/chat/[id]',
                        params: { id: threadId },
                      })
                    }
                    thread={thread}
                  />
                ))}
              </View>
            )
          ) : (
            <View style={styles.requestsContent}>
              <SegmentedControl
                onChange={setActiveRequestsTab}
                options={[
                  { value: 'received', label: t('inbox.requests.tabs.received') },
                  { value: 'sent', label: t('inbox.requests.tabs.sent') },
                ]}
                value={activeRequestsTab}
              />

              {activeRequestsTab === 'received' ? (
                isReceivedLoading ? (
                  <LoadingState label={t('inbox.requests.loading')} />
                ) : receivedErrorMessage ? (
                  <ErrorState message={receivedErrorMessage} />
                ) : requests.length === 0 ? (
                  <EmptyState
                    description={t('inbox.requests.emptyDescription')}
                    icon="request"
                    title={t('inbox.requests.emptyTitle')}
                  />
                ) : (
                  <View style={styles.list}>
                    <Text style={styles.sectionLabel}>{t('inbox.requests.sectionTitle')}</Text>
                    {requests.map((item) => (
                      <InboxRequestCard
                        item={item}
                        key={`${item.tripId}-${item.passenger.id}`}
                        onViewDetails={setSelectedRequest}
                      />
                    ))}
                  </View>
                )
              ) : isSentLoading ? (
                <LoadingState label={t('inbox.sent.loading')} />
              ) : sentErrorMessage ? (
                <ErrorState message={sentErrorMessage} />
              ) : sentBookingGroups.length === 0 ? (
                <EmptyState
                  description={t('inbox.sent.emptyDescription')}
                  icon="request"
                  title={t('inbox.sent.emptyTitle')}
                />
              ) : (
                <View style={styles.list}>
                  <Text style={styles.sectionLabel}>{t('inbox.sent.sectionTitle')}</Text>
                  {sentBookingGroups.map((group) => (
                    <SentBookingCard
                      dismissedAcceptedBookingIds={dismissedAcceptedBookingIds}
                      group={group}
                      isDismissingAccepted={dismissAcceptedBookingsMutation.isPending}
                      key={group.tripId}
                      onDismissAccepted={(nextGroup) => {
                        void handleDismissAccepted(nextGroup);
                      }}
                    />
                  ))}
                </View>
              )}
            </View>
          )}
        </View>
      </ScrollView>

      <InboxRequestDetailsModal
        actionError={actionErrorMessage}
        isAccepting={acceptMutation.isPending}
        isRejecting={rejectMutation.isPending}
        item={selectedRequest}
        onAccept={(item) => {
          void handleAcceptRequest(item);
        }}
        onClose={closeRequestDetails}
        onReject={(item) => {
          void handleRejectRequest(item);
        }}
        visible={selectedRequest !== null}
      />
    </View>
  );
}

type EmptyStateProps = {
  icon: 'chat' | 'request';
  title: string;
  description: string;
};

function EmptyState({ icon, title, description }: EmptyStateProps) {
  const Icon = icon === 'chat' ? MessageCircle : Bell;

  return (
    <View style={styles.emptyCard}>
      <View style={styles.emptyIconCircle}>
        <Icon color={Palette.primary} size={26} strokeWidth={2.3} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDescription}>{description}</Text>
    </View>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <View style={styles.statusCard}>
      <ActivityIndicator color={Palette.primary} size="small" />
      <Text style={styles.statusText}>{label}</Text>
    </View>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <View style={[styles.statusCard, styles.errorCard]}>
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Palette.backgroundMuted,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xxxl,
  },
  content: {
    width: '100%',
    maxWidth: 620,
    gap: Spacing.lg,
  },
  list: {
    gap: Spacing.md,
  },
  requestsContent: {
    gap: Spacing.lg,
  },
  sectionLabel: {
    color: Palette.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: Spacing.xs,
  },
  statusCard: {
    minHeight: 148,
    backgroundColor: Palette.card,
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: Palette.border,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    ...Shadow.cardSoft,
  },
  statusText: {
    color: Palette.textSecondary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.medium,
    textAlign: 'center',
  },
  errorCard: {
    backgroundColor: Palette.dangerSurface,
    borderColor: Palette.danger,
  },
  errorText: {
    color: Palette.danger,
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    textAlign: 'center',
  },
  emptyCard: {
    minHeight: 220,
    backgroundColor: Palette.card,
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: Palette.border,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xxl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    ...Shadow.cardSoft,
  },
  emptyIconCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: Palette.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
  emptyTitle: {
    ...Typography.titleSmall,
    color: Palette.text,
    textAlign: 'center',
  },
  emptyDescription: {
    color: Palette.textSecondary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.medium,
    lineHeight: 20,
    textAlign: 'center',
  },
});
