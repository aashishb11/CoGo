import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { MessageCircle } from 'lucide-react-native';
import { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useRequireAuth } from '@/features/auth/queries';
import {
  useChatMessages,
  useChatThread,
  useChatThreadTripLabel,
  useDeleteChatMessage,
  useMarkChatThreadRead,
  useSendChatMessage,
} from '@/features/inbox/chat-queries';
import { useChatThreadRealtime } from '@/features/inbox/chat-realtime';
import type { ChatMessage } from '@/features/inbox/chat-types';
import { ChatComposer } from '@/features/inbox/components/chat-composer';
import { ChatMessageBubble } from '@/features/inbox/components/chat-message-bubble';
import { mapErrorToMessageKey } from '@/shared/api';
import { popOrReplace } from '@/shared/navigation/back';
import { openUserProfile } from '@/shared/navigation/open-user-profile';
import { FontSize, FontWeight, Palette, Radii, Shadow, Spacing, Typography } from '@/shared/theme';
import { ScreenHeader } from '@/shared/ui/components/screen-header';

const CHAT_BACKGROUND = require('../../../../assets/images/patron-6-zigzag.png');

export default function ChatThreadScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const session = useRequireAuth();
  const currentUserId = session.data?.user?.id ?? null;
  const params = useLocalSearchParams();
  const id = params.id;
  const threadId = typeof id === 'string' ? id.trim() : '';

  // When opened via deep link / push notification there's no stack to pop, so
  // fall back to the chats sub-tab of inbox.
  const handleBack = useCallback(() => {
    popOrReplace(router, { pathname: '/(tabs)/inbox', params: { tab: 'chats' } });
  }, [router]);

  const threadQuery = useChatThread(threadId);
  const messagesQuery = useChatMessages(threadId);
  const sendMutation = useSendChatMessage();
  const markReadMutation = useMarkChatThreadRead();
  const deleteMutation = useDeleteChatMessage();
  useChatThreadRealtime(threadId);

  const thread = threadQuery.thread;
  const tripLabel = useChatThreadTripLabel(thread?.tripId ?? null, thread?.tripLabel ?? '');
  const messages = messagesQuery.messages;
  const isLoading = threadQuery.isLoading || messagesQuery.isLoading;
  const loadErrorMessage = threadQuery.error
    ? t(mapErrorToMessageKey(threadQuery.error))
    : messagesQuery.error
      ? t(mapErrorToMessageKey(messagesQuery.error))
      : '';
  const sendErrorMessage = sendMutation.error ? t(mapErrorToMessageKey(sendMutation.error)) : '';
  const deleteErrorMessage = deleteMutation.error
    ? t(mapErrorToMessageKey(deleteMutation.error))
    : '';

  useEffect(() => {
    if (!thread) return;
    if (thread.unreadCount <= 0) return;
    markReadMutation.mutate(thread.id);
    // markReadMutation is stable per render of this hook instance; we only want to
    // fire when the thread or its unread state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread?.id, thread?.unreadCount]);

  // Refetch immediately when the user navigates back into the chat so they
  // don't have to wait for the next poll tick to see new messages.
  useFocusEffect(
    useCallback(() => {
      if (!threadId) return;
      void threadQuery.refetch();
      void messagesQuery.refetch();
      // refetch fns are stable per query instance; depending on them would
      // cause the effect to refire on every render.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [threadId]),
  );

  async function handleSend(body: string) {
    sendMutation.reset();
    await sendMutation.mutateAsync({ threadId, input: { body } });
  }

  function handleLongPress(message: ChatMessage) {
    if (!message.fromSelf || message.deleted) return;
    Alert.alert(t('chat.delete.title'), t('chat.delete.message'), [
      { text: t('chat.delete.cancel'), style: 'cancel' },
      {
        text: t('chat.delete.confirm'),
        style: 'destructive',
        onPress: () => {
          deleteMutation.reset();
          deleteMutation.mutate({ threadId, messageId: message.id });
        },
      },
    ]);
  }

  if (!isLoading && !thread) {
    return (
      <View style={styles.screen}>
        <ScreenHeader
          back={{
            onPress: handleBack,
            accessibilityLabel: t('chat.back'),
          }}
          title={t('chat.notFoundTitle')}
        />
        <View style={styles.notFoundWrap}>
          <View style={styles.notFoundIconCircle}>
            <MessageCircle color={Palette.primary} size={26} strokeWidth={2.3} />
          </View>
          <Text style={styles.notFoundText}>{t('chat.notFound')}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader
        back={{
          onPress: handleBack,
          accessibilityLabel: t('chat.back'),
        }}
        onTitlePress={
          thread?.participantUserId
            ? () =>
                openUserProfile(router, {
                  targetUserId: thread.participantUserId!,
                  currentUserId,
                })
            : undefined
        }
        subtitle={tripLabel}
        title={thread?.participantName ?? ''}
        titleAccessibilityLabel={
          thread?.participantName
            ? t('chat.openParticipantProfile', { name: thread.participantName })
            : undefined
        }
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardAvoid}
      >
        <ImageBackground
          imageStyle={styles.chatBackgroundImage}
          resizeMode="cover"
          source={CHAT_BACKGROUND}
          style={styles.chatBackground}
        >
          {isLoading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={Palette.primary} size="small" />
            </View>
          ) : loadErrorMessage ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorText}>{loadErrorMessage}</Text>
            </View>
          ) : messages.length === 0 ? (
            <View style={styles.emptyWrap}>
              <View style={styles.emptyIconCircle}>
                <MessageCircle color={Palette.primary} size={26} strokeWidth={2.3} />
              </View>
              <Text style={styles.emptyTitle}>{t('chat.empty.title')}</Text>
              <Text style={styles.emptyDescription}>{t('chat.empty.description')}</Text>
            </View>
          ) : (
            <FlatList
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              contentContainerStyle={styles.listContent}
              data={messages}
              inverted
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <ChatMessageBubble message={item} onLongPress={handleLongPress} />
              )}
              showsVerticalScrollIndicator={false}
              style={styles.list}
            />
          )}

          {sendErrorMessage ? (
            <View style={styles.sendErrorBanner}>
              <Text style={styles.sendErrorText}>{sendErrorMessage}</Text>
            </View>
          ) : null}

          {deleteErrorMessage ? (
            <View style={styles.sendErrorBanner}>
              <Text style={styles.sendErrorText}>{deleteErrorMessage}</Text>
            </View>
          ) : null}
        </ImageBackground>

        <ChatComposer isSending={sendMutation.isPending} onSend={handleSend} />
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Palette.backgroundMuted,
  },
  keyboardAvoid: {
    flex: 1,
  },
  chatBackground: {
    flex: 1,
    backgroundColor: Palette.backgroundMuted,
  },
  chatBackgroundImage: {
    opacity: 0.35,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  separator: {
    height: Spacing.sm,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyWrap: {
    flex: 1,
    margin: Spacing.lg,
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
  errorCard: {
    margin: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    borderRadius: Radii.xl,
    borderWidth: 1,
    backgroundColor: Palette.dangerSurface,
    borderColor: Palette.danger,
    alignItems: 'center',
  },
  errorText: {
    color: Palette.danger,
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    textAlign: 'center',
  },
  sendErrorBanner: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radii.md,
    backgroundColor: Palette.dangerSurface,
  },
  sendErrorText: {
    color: Palette.danger,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    textAlign: 'center',
  },
  notFoundWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    padding: Spacing.xxl,
  },
  notFoundIconCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: Palette.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notFoundText: {
    color: Palette.textSecondary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    textAlign: 'center',
  },
});
