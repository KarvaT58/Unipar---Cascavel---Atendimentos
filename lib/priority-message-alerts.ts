import type { AppState, GroupMetadataState } from "@/lib/app-state";
import { isMessageHiddenForUser, type Message } from "@/lib/chat-data";

export const PRIORITY_MESSAGE_OPEN_REQUEST_STORAGE_KEY =
  "priority-message-open-request";

export type PriorityMessageScope = "chat" | "group";

export interface PriorityMessageOpenRequest {
  scope: PriorityMessageScope;
  conversationId: string;
  messageId: string;
  userId: string;
  createdAt: number;
}

export interface PendingPriorityMessageAlert {
  conversationId: string;
  conversationName: string;
  message: Message;
  scope: PriorityMessageScope;
  senderName: string;
}

const DIRECT_CONVERSATION_PREFIX = "dm:";

export function getPriorityMessageAlertStorageKey(userId: string) {
  return `priority-message-alerts:${userId}`;
}

export function getPriorityMessageAlertKey(
  scope: PriorityMessageScope,
  conversationId: string,
  message: Message,
) {
  return `${scope}:${conversationId}:${message.id}:${message.senderId ?? "unknown"}`;
}

export function getPriorityMessagePreview(message: Message) {
  if (message.deletedForEveryone) return "Mensagem apagada";

  const content = message.content.trim();

  if (message.isForwarded) {
    if (content) return `Encaminhada: ${content}`;

    switch (message.attachment?.type) {
      case "image":
        return "Encaminhada: Foto";
      case "video":
        return "Encaminhada: Vídeo";
      case "audio":
        return "Encaminhada: Áudio";
      case "document":
        return `Encaminhada: ${message.attachment.name}`;
      default:
        return "Encaminhada: Mensagem";
    }
  }

  if (content) return content;

  switch (message.attachment?.type) {
    case "image":
      return "Foto";
    case "video":
      return "Vídeo";
    case "audio":
      return "Áudio";
    case "document":
      return message.attachment.name;
    default:
      return "Mensagem";
  }
}

export function findPendingPriorityMessageAlert(
  state: AppState,
  userId: string,
): PendingPriorityMessageAlert | null {
  if (!userId) return null;

  const seenKeys = new Set(
    state.priorityMessageAlertSeenKeysByUserId[userId] ?? [],
  );
  const alerts: PendingPriorityMessageAlert[] = [];

  Object.entries(state.messagesByContact).forEach(
    ([conversationId, messages]) => {
      const directParticipants = parseDirectConversationKey(conversationId);
      const canContainMessage =
        conversationId === userId || Boolean(directParticipants?.includes(userId));

      if (!canContainMessage) return;

      messages.forEach((message) => {
        if (!isPendingPriorityMessage(message, userId)) return;

        const contactId =
          getDirectContactId(conversationId, message, userId) ??
          message.senderId;

        if (!contactId) return;

        const alertKey = getPriorityMessageAlertKey("chat", contactId, message);

        if (seenKeys.has(alertKey)) return;

        alerts.push({
          conversationId: contactId,
          conversationName: getUserDisplayName(state, contactId, message.senderName),
          message,
          scope: "chat",
          senderName: getUserDisplayName(state, message.senderId, message.senderName),
        });
      });
    },
  );

  Object.entries(state.groupMessagesByContact).forEach(([groupId, messages]) => {
    if (!canUserSeeGroup(groupId, userId, state.groupMetadataById)) return;

    messages.forEach((message) => {
      if (!isPendingPriorityMessage(message, userId)) return;

      const alertKey = getPriorityMessageAlertKey("group", groupId, message);

      if (seenKeys.has(alertKey)) return;

      alerts.push({
        conversationId: groupId,
        conversationName: getGroupDisplayName(state, groupId),
        message,
        scope: "group",
        senderName: getUserDisplayName(state, message.senderId, message.senderName),
      });
    });
  });

  return alerts.sort(
    (firstAlert, secondAlert) =>
      firstAlert.message.timestamp.getTime() -
        secondAlert.message.timestamp.getTime() ||
      firstAlert.message.id.localeCompare(secondAlert.message.id),
  )[0] ?? null;
}

function parseDirectConversationKey(key: string) {
  if (!key.startsWith(DIRECT_CONVERSATION_PREFIX)) return null;

  const [firstUserId, secondUserId] = key
    .slice(DIRECT_CONVERSATION_PREFIX.length)
    .split(":");

  if (!firstUserId || !secondUserId) return null;

  return [firstUserId, secondUserId] as const;
}

function getDirectContactId(
  conversationId: string,
  message: Message,
  userId: string,
) {
  if (message.senderId && message.senderId !== userId) return message.senderId;

  const directParticipants = parseDirectConversationKey(conversationId);

  if (!directParticipants) return null;

  const [firstUserId, secondUserId] = directParticipants;

  if (firstUserId === userId) return secondUserId;
  if (secondUserId === userId) return firstUserId;

  return null;
}

function isPendingPriorityMessage(message: Message, userId: string) {
  return (
    Boolean(message.isPriority) &&
    !message.deletedForEveryone &&
    !isMessageHiddenForUser(message, userId) &&
    Boolean(message.senderId) &&
    message.senderId !== userId
  );
}

function getGroupMemberIds(metadata: GroupMetadataState) {
  return Array.from(
    new Set([
      metadata.creatorId,
      ...metadata.adminIds,
      ...metadata.participantIds,
    ]),
  );
}

function canUserSeeGroup(
  groupId: string,
  userId: string,
  metadataById: Record<string, GroupMetadataState>,
) {
  const metadata = metadataById[groupId];

  return metadata ? getGroupMemberIds(metadata).includes(userId) : false;
}

function getUserDisplayName(
  state: AppState,
  userId?: string,
  fallbackName = "Contato",
) {
  if (!userId) return fallbackName;

  return (
    state.adminUsers.find((user) => user.id === userId)?.name ??
    [...state.contacts, ...state.archivedContacts].find(
      (contact) => contact.id === userId,
    )?.name ??
    fallbackName
  );
}

function getGroupDisplayName(state: AppState, groupId: string) {
  return (
    [...state.groups, ...state.archivedGroups].find(
      (group) => group.id === groupId,
    )?.name ?? "Grupo"
  );
}
