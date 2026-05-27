export type MessageAttachment =
  | {
      type: "image";
      src: string;
      alt: string;
    }
  | {
      type: "video";
      src?: string;
      thumbnail: string;
      duration: string;
      title?: string;
    }
  | {
      type: "audio";
      src?: string;
      duration: string;
      waveform: number[];
    }
  | {
      type: "document";
      name: string;
      meta: string;
      extension: string;
      src?: string;
    };

export interface Message {
  id: string;
  content: string;
  timestamp: Date;
  isOwn: boolean;
  senderId?: string;
  senderName?: string;
  status: "sent" | "delivered" | "read";
  isPriority?: boolean;
  isForwarded?: boolean;
  isPinned?: boolean;
  isFavorite?: boolean;
  pinnedForUserIds?: string[];
  favoriteForUserIds?: string[];
  messagePreferencesByUserId?: Record<string, MessageConversationPreference>;
  isEdited?: boolean;
  deletedForMe?: boolean;
  hiddenForUserIds?: string[];
  deletedForEveryone?: boolean;
  attachment?: MessageAttachment;
  replyTo?: {
    id: string;
    content: string;
    senderName: string;
  };
}

export type ChatPresenceStatus = "online" | "offline" | "busy" | "away";

export const CHAT_PRESENCE_META: Record<
  ChatPresenceStatus,
  { label: string; dotClassName: string }
> = {
  online: { label: "Online", dotClassName: "bg-emerald-500" },
  offline: { label: "Offline", dotClassName: "bg-muted-foreground" },
  busy: { label: "Ocupado", dotClassName: "bg-destructive" },
  away: { label: "Ausente", dotClassName: "bg-yellow-500" },
};

export function getChatPresenceStatus(user: {
  chatStatus?: ChatPresenceStatus;
  isOnline?: boolean;
}) {
  return user.chatStatus ?? (user.isOnline ? "online" : "offline");
}

export function getChatPresenceMeta(user: {
  chatStatus?: ChatPresenceStatus;
  isOnline?: boolean;
}) {
  return CHAT_PRESENCE_META[getChatPresenceStatus(user)];
}

export function formatLastSeenAt(date?: Date) {
  if (!date) return "Offline";

  const now = new Date();
  const diffInMs = now.getTime() - date.getTime();
  const diffInMinutes = Math.max(0, Math.floor(diffInMs / (1000 * 60)));

  if (diffInMinutes < 1) return "Visto por ultimo agora";

  const today = now.toDateString();
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(now.getDate() - 1);

  if (date.toDateString() === today) {
    return `Visto por ultimo hoje as ${formatTime(date)}`;
  }

  if (date.toDateString() === yesterdayDate.toDateString()) {
    return `Visto por ultimo ontem as ${formatTime(date)}`;
  }

  return `Visto por ultimo em ${date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  })} as ${formatTime(date)}`;
}

export function isMessageHiddenForUser(message: Message, userId?: string) {
  if (message.deletedForMe) return true;
  if (!userId) return false;

  return message.hiddenForUserIds?.includes(userId) ?? false;
}

export function hideMessageForUser(message: Message, userId: string): Message {
  if (isMessageHiddenForUser(message, userId)) return message;

  return {
    ...message,
    hiddenForUserIds: [...(message.hiddenForUserIds ?? []), userId],
  };
}

function hasScopedMessageFlag(
  scopedUserIds: string[] | undefined,
  fallbackFlag: boolean | undefined,
  userId: string,
) {
  if (scopedUserIds) return scopedUserIds.includes(userId);

  return Boolean(fallbackFlag);
}

export function isMessagePinnedForUser(message: Message, userId: string) {
  const userPreference = message.messagePreferencesByUserId?.[userId];

  if (userPreference?.isPinned !== undefined) {
    return userPreference.isPinned;
  }

  return hasScopedMessageFlag(message.pinnedForUserIds, message.isPinned, userId);
}

export function isMessageFavoriteForUser(message: Message, userId: string) {
  const userPreference = message.messagePreferencesByUserId?.[userId];

  if (userPreference?.isFavorite !== undefined) {
    return userPreference.isFavorite;
  }

  return hasScopedMessageFlag(
    message.favoriteForUserIds,
    message.isFavorite,
    userId,
  );
}

export function toggleMessagePinnedForUser(
  message: Message,
  userId: string,
): Message {
  const nextIsPinned = !isMessagePinnedForUser(message, userId);
  const currentPreference = message.messagePreferencesByUserId?.[userId];

  return {
    ...message,
    isPinned: undefined,
    pinnedForUserIds: Array.from(
      new Set([
        ...(message.pinnedForUserIds ?? []).filter(
          (currentUserId) => currentUserId !== userId,
        ),
        ...(nextIsPinned ? [userId] : []),
      ]),
    ),
    messagePreferencesByUserId: {
      ...(message.messagePreferencesByUserId ?? {}),
      [userId]: {
        ...currentPreference,
        isPinned: nextIsPinned,
        updatedAt: new Date(),
      },
    },
  };
}

export function toggleMessageFavoriteForUser(
  message: Message,
  userId: string,
): Message {
  const nextIsFavorite = !isMessageFavoriteForUser(message, userId);
  const currentPreference = message.messagePreferencesByUserId?.[userId];

  return {
    ...message,
    isFavorite: undefined,
    favoriteForUserIds: Array.from(
      new Set([
        ...(message.favoriteForUserIds ?? []).filter(
          (currentUserId) => currentUserId !== userId,
        ),
        ...(nextIsFavorite ? [userId] : []),
      ]),
    ),
    messagePreferencesByUserId: {
      ...(message.messagePreferencesByUserId ?? {}),
      [userId]: {
        ...currentPreference,
        isFavorite: nextIsFavorite,
        updatedAt: new Date(),
      },
    },
  };
}

export interface MessageConversationPreference {
  isPinned?: boolean;
  isFavorite?: boolean;
  updatedAt: Date;
}

export interface ContactConversationPreference {
  isMuted?: boolean;
  isPinned?: boolean;
  updatedAt: Date;
}

export interface Contact {
  id: string;
  ownerId?: string;
  hiddenForUserIds?: string[];
  conversationPreferencesByUserId?: Record<
    string,
    ContactConversationPreference
  >;
  name: string;
  avatar: string;
  email: string;
  about: string;
  lastMessage: string;
  lastMessageTime: Date;
  lastMessageIsOwn?: boolean;
  lastMessageStatus?: Message["status"];
  unreadCount: number;
  isOnline: boolean;
  chatStatus?: ChatPresenceStatus;
  workStatus?: string;
  lastSeenAt?: Date;
  isTyping: boolean;
  typingText?: string;
  isArchived: boolean;
  conversationStateUpdatedAt?: Date;
  isMuted: boolean;
  isPinned: boolean;
}

export interface DirectoryUser {
  id: string;
  name: string;
  avatar: string;
  email: string;
  about: string;
  isOnline: boolean;
  chatStatus?: ChatPresenceStatus;
  workStatus?: string;
  lastSeenAt?: Date;
}

export const contacts: Contact[] = [];
export const directoryUsers: DirectoryUser[] = [];
export const initialMessages: Record<string, Message[]> = {};

export function formatTime(date: Date): string {
  return date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatLastMessageTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return formatTime(date);
  } else if (days === 1) {
    return "Ontem";
  } else if (days < 7) {
    return date.toLocaleDateString("pt-BR", { weekday: "short" });
  } else {
    return date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
    });
  }
}
