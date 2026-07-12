export type ChatThread = {
  id: string;
  tripId: string | null;
  participantUserId: string | null;
  participantName: string;
  participantInitials: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
  /**
   * Trip label embedded in the chat-inbox response (e.g. "Mataró -> Barcelona").
   * Empty when the backend doesn't populate it; screens that need a guaranteed
   * label should fall back to `useTripById(tripId)`.
   */
  tripLabel: string;
};

export type ChatMessage = {
  id: string;
  threadId: string;
  body: string;
  sentAt: string;
  fromSelf: boolean;
  deleted: boolean;
};
