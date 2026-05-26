import type { AnnouncementEvent } from "@/components/announcements-events-page";
import type {
  KanbanCard,
  KanbanColumn,
  KanbanLabel,
} from "@/components/kanban-page";
import type {
  AccessRequest,
  AdminReport,
  AdminUser,
  ExtensionContentItem,
  HelpContentItem,
} from "@/lib/admin-data";
import type { Contact, Message } from "@/lib/chat-data";
import type { LoanRequest } from "@/lib/loan-data";
import type { ServiceTicket } from "@/lib/service-ticket-data";

export interface GroupMetadataState {
  participantIds: string[];
  adminIds: string[];
  creatorId: string;
}

export interface TypingIndicatorState {
  scope: "chat" | "group";
  userId: string;
  userName: string;
  recipientId?: string;
  groupId?: string;
  updatedAt: Date;
}

export interface AppPageRecord {
  id: string;
  title: string;
  description: string;
  status: "todo" | "in_progress" | "done" | "blocked";
  priority: "low" | "normal" | "high";
  owner?: string;
  href?: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

export interface AppState {
  contacts: Contact[];
  archivedContacts: Contact[];
  groups: Contact[];
  archivedGroups: Contact[];
  messagesByContact: Record<string, Message[]>;
  groupMessagesByContact: Record<string, Message[]>;
  groupMetadataById: Record<string, GroupMetadataState>;
  accessRequests: AccessRequest[];
  adminUsers: AdminUser[];
  adminReports: AdminReport[];
  serviceTickets: ServiceTicket[];
  loanRequests: LoanRequest[];
  announcementEvents: AnnouncementEvent[];
  kanbanColumns: KanbanColumn[];
  kanbanCardsById: Record<string, KanbanCard>;
  kanbanLabels: KanbanLabel[];
  helpItems: HelpContentItem[];
  extensionItems: ExtensionContentItem[];
  typingIndicators: Record<string, TypingIndicatorState>;
  pageRecords: Record<string, AppPageRecord[]>;
}

export interface AppStateEnvelope {
  state: AppState;
  revision: number;
  databaseConnected: boolean;
}

export const EMPTY_APP_STATE: AppState = {
  contacts: [],
  archivedContacts: [],
  groups: [],
  archivedGroups: [],
  messagesByContact: {},
  groupMessagesByContact: {},
  groupMetadataById: {},
  accessRequests: [],
  adminUsers: [],
  adminReports: [],
  serviceTickets: [],
  loanRequests: [],
  announcementEvents: [],
  kanbanColumns: [],
  kanbanCardsById: {},
  kanbanLabels: [],
  helpItems: [],
  extensionItems: [],
  typingIndicators: {},
  pageRecords: {},
};

const DATE_FIELD_NAMES = new Set([
  "timestamp",
  "lastMessageTime",
  "createdAt",
  "updatedAt",
  "lastInteractionAt",
  "closedAt",
  "reopenedAt",
  "requestedAt",
  "rejectedAt",
  "approvedAt",
  "returnedAt",
  "resolvedAt",
  "scheduledAt",
  "completedAt",
  "lastSeenAt",
]);

function isIsoLikeDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

function reviveDateFields(value: unknown, key?: string): unknown {
  if (DATE_FIELD_NAMES.has(key ?? "") && isIsoLikeDate(value)) {
    return new Date(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => reviveDateFields(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        reviveDateFields(entryValue, entryKey),
      ]),
    );
  }

  return value;
}

export function normalizeAppState(value: unknown): AppState {
  const revivedValue = reviveDateFields(value) as Partial<AppState> | null;

  return {
    ...EMPTY_APP_STATE,
    ...(revivedValue ?? {}),
  };
}

export function serializeAppState(state: AppState) {
  return JSON.stringify(state);
}

const MESSAGE_STATUS_PRIORITY: Record<Message["status"], number> = {
  sent: 0,
  delivered: 1,
  read: 2,
};
const TYPING_INDICATOR_MERGE_TTL_MS = 3000;

function mergeStringLists(first?: string[], second?: string[]) {
  return Array.from(new Set([...(first ?? []), ...(second ?? [])]));
}

function mergeOptionalStringLists(first?: string[], second?: string[]) {
  if (!first && !second) return undefined;

  return mergeStringLists(first, second);
}

function getMessageStatusWithHighestPriority(
  first: Message["status"],
  second: Message["status"],
) {
  return MESSAGE_STATUS_PRIORITY[first] >= MESSAGE_STATUS_PRIORITY[second]
    ? first
    : second;
}

function mergeMessage(storedMessage: Message, incomingMessage: Message) {
  return {
    ...storedMessage,
    ...incomingMessage,
    status: getMessageStatusWithHighestPriority(
      storedMessage.status,
      incomingMessage.status,
    ),
    deletedForMe:
      storedMessage.deletedForMe === true ||
      incomingMessage.deletedForMe === true
        ? true
        : (incomingMessage.deletedForMe ?? storedMessage.deletedForMe),
    deletedForEveryone:
      storedMessage.deletedForEveryone === true ||
      incomingMessage.deletedForEveryone === true
        ? true
        : (incomingMessage.deletedForEveryone ??
          storedMessage.deletedForEveryone),
    hiddenForUserIds: mergeStringLists(
      storedMessage.hiddenForUserIds,
      incomingMessage.hiddenForUserIds,
    ),
    pinnedForUserIds: mergeOptionalStringLists(
      storedMessage.pinnedForUserIds,
      incomingMessage.pinnedForUserIds,
    ),
    favoriteForUserIds: mergeOptionalStringLists(
      storedMessage.favoriteForUserIds,
      incomingMessage.favoriteForUserIds,
    ),
  };
}

function mergeMessageLists(
  storedMessages: Message[],
  incomingMessages: Message[],
) {
  const messagesById = new Map<string, Message>();

  storedMessages.forEach((message) => {
    messagesById.set(message.id, message);
  });

  incomingMessages.forEach((message) => {
    const storedMessage = messagesById.get(message.id);
    messagesById.set(
      message.id,
      storedMessage ? mergeMessage(storedMessage, message) : message,
    );
  });

  return Array.from(messagesById.values()).sort(
    (firstMessage, secondMessage) => {
      const timeDifference =
        firstMessage.timestamp.getTime() - secondMessage.timestamp.getTime();

      return timeDifference || firstMessage.id.localeCompare(secondMessage.id);
    },
  );
}

function mergeMessageCollections(
  storedMessagesByConversation: Record<string, Message[]>,
  incomingMessagesByConversation: Record<string, Message[]>,
) {
  const conversationIds = new Set([
    ...Object.keys(storedMessagesByConversation),
    ...Object.keys(incomingMessagesByConversation),
  ]);

  return Object.fromEntries(
    Array.from(conversationIds).map((conversationId) => [
      conversationId,
      mergeMessageLists(
        storedMessagesByConversation[conversationId] ?? [],
        incomingMessagesByConversation[conversationId] ?? [],
      ),
    ]),
  );
}

function mergeContacts(storedContacts: Contact[], incomingContacts: Contact[]) {
  const contactsByKey = new Map<string, Contact>();
  const getContactKey = (contact: Contact) =>
    `${contact.ownerId ?? "global"}:${contact.id}`;

  storedContacts.forEach((contact) => {
    contactsByKey.set(getContactKey(contact), contact);
  });

  incomingContacts.forEach((contact) => {
    const contactKey = getContactKey(contact);
    const storedContact = contactsByKey.get(contactKey);

    contactsByKey.set(
      contactKey,
      storedContact
        ? {
            ...storedContact,
            ...contact,
            hiddenForUserIds: mergeStringLists(
              storedContact.hiddenForUserIds,
              contact.hiddenForUserIds,
            ),
          }
        : contact,
    );
  });

  return Array.from(contactsByKey.values());
}

function sortAppPageRecordList(records: AppPageRecord[]) {
  return [...records].sort(
    (firstRecord, secondRecord) =>
      secondRecord.updatedAt.getTime() - firstRecord.updatedAt.getTime() ||
      firstRecord.title.localeCompare(secondRecord.title),
  );
}

function mergeAppPageRecordCollections(
  storedRecordsByPage: Record<string, AppPageRecord[]>,
  incomingRecordsByPage: Record<string, AppPageRecord[]>,
) {
  const nextRecordsByPage = { ...storedRecordsByPage };

  Object.entries(incomingRecordsByPage).forEach(([pageKey, records]) => {
    nextRecordsByPage[pageKey] = sortAppPageRecordList(records);
  });

  return nextRecordsByPage;
}

function mergeTypingIndicators(
  storedIndicators: Record<string, TypingIndicatorState>,
  incomingIndicators: Record<string, TypingIndicatorState>,
) {
  const now = Date.now();
  const indicatorsByKey = new Map<string, TypingIndicatorState>();

  [
    ...Object.entries(storedIndicators),
    ...Object.entries(incomingIndicators),
  ].forEach(([indicatorKey, indicator]) => {
    if (
      now - new Date(indicator.updatedAt).getTime() >=
      TYPING_INDICATOR_MERGE_TTL_MS
    ) {
      return;
    }

    const storedIndicator = indicatorsByKey.get(indicatorKey);

    if (
      !storedIndicator ||
      indicator.updatedAt.getTime() > storedIndicator.updatedAt.getTime()
    ) {
      indicatorsByKey.set(indicatorKey, indicator);
    }
  });

  return Object.fromEntries(indicatorsByKey);
}

function mergeServiceTicketAttachmentLists(
  storedAttachments: ServiceTicket["attachments"],
  incomingAttachments: ServiceTicket["attachments"],
) {
  const attachmentsById = new Map<
    string,
    ServiceTicket["attachments"][number]
  >();

  storedAttachments.forEach((attachment) => {
    attachmentsById.set(attachment.id, attachment);
  });
  incomingAttachments.forEach((attachment) => {
    attachmentsById.set(attachment.id, {
      ...attachmentsById.get(attachment.id),
      ...attachment,
    });
  });

  return Array.from(attachmentsById.values());
}

function mergeServiceTicketMessages(
  storedMessages: ServiceTicket["messages"],
  incomingMessages: ServiceTicket["messages"],
) {
  const messagesById = new Map<string, ServiceTicket["messages"][number]>();

  storedMessages.forEach((message) => {
    messagesById.set(message.id, message);
  });
  incomingMessages.forEach((message) => {
    const storedMessage = messagesById.get(message.id);

    messagesById.set(message.id, {
      ...storedMessage,
      ...message,
      attachments: mergeServiceTicketAttachmentLists(
        storedMessage?.attachments ?? [],
        message.attachments ?? [],
      ),
    });
  });

  return Array.from(messagesById.values()).sort(
    (firstMessage, secondMessage) =>
      firstMessage.createdAt.getTime() - secondMessage.createdAt.getTime() ||
      firstMessage.id.localeCompare(secondMessage.id),
  );
}

function mergeServiceTicketTransfers(
  storedTransfers: ServiceTicket["transfers"],
  incomingTransfers: ServiceTicket["transfers"],
) {
  const transfersById = new Map<string, ServiceTicket["transfers"][number]>();

  storedTransfers.forEach((transfer) => {
    transfersById.set(transfer.id, transfer);
  });
  incomingTransfers.forEach((transfer) => {
    transfersById.set(transfer.id, {
      ...transfersById.get(transfer.id),
      ...transfer,
    });
  });

  return Array.from(transfersById.values()).sort(
    (firstTransfer, secondTransfer) =>
      firstTransfer.createdAt.getTime() - secondTransfer.createdAt.getTime() ||
      firstTransfer.id.localeCompare(secondTransfer.id),
  );
}

function getServiceTicketFreshnessTime(ticket: ServiceTicket) {
  return Math.max(
    ticket.updatedAt.getTime(),
    ticket.lastInteractionAt.getTime(),
    ticket.createdAt.getTime(),
  );
}

function mergeServiceTicket(
  storedTicket: ServiceTicket,
  incomingTicket: ServiceTicket,
) {
  const baseTicket =
    getServiceTicketFreshnessTime(incomingTicket) >=
    getServiceTicketFreshnessTime(storedTicket)
      ? incomingTicket
      : storedTicket;

  return {
    ...baseTicket,
    attachments: mergeServiceTicketAttachmentLists(
      storedTicket.attachments,
      incomingTicket.attachments,
    ),
    messages: mergeServiceTicketMessages(
      storedTicket.messages,
      incomingTicket.messages,
    ),
    transfers: mergeServiceTicketTransfers(
      storedTicket.transfers,
      incomingTicket.transfers,
    ),
  };
}

function mergeServiceTickets(
  storedTickets: ServiceTicket[],
  incomingTickets: ServiceTicket[],
) {
  const ticketsById = new Map<string, ServiceTicket>();

  storedTickets.forEach((ticket) => {
    ticketsById.set(ticket.id, ticket);
  });
  incomingTickets.forEach((ticket) => {
    const storedTicket = ticketsById.get(ticket.id);

    ticketsById.set(
      ticket.id,
      storedTicket ? mergeServiceTicket(storedTicket, ticket) : ticket,
    );
  });

  return Array.from(ticketsById.values()).sort(
    (firstTicket, secondTicket) =>
      secondTicket.lastInteractionAt.getTime() -
        firstTicket.lastInteractionAt.getTime() ||
      secondTicket.updatedAt.getTime() - firstTicket.updatedAt.getTime() ||
      firstTicket.title.localeCompare(secondTicket.title),
  );
}

export function mergeAppStates(
  storedState: AppState,
  incomingState: AppState,
): AppState {
  return {
    ...storedState,
    ...incomingState,
    contacts: mergeContacts(storedState.contacts, incomingState.contacts),
    archivedContacts: mergeContacts(
      storedState.archivedContacts,
      incomingState.archivedContacts,
    ),
    groups: mergeContacts(storedState.groups, incomingState.groups),
    archivedGroups: mergeContacts(
      storedState.archivedGroups,
      incomingState.archivedGroups,
    ),
    messagesByContact: mergeMessageCollections(
      storedState.messagesByContact,
      incomingState.messagesByContact,
    ),
    groupMessagesByContact: mergeMessageCollections(
      storedState.groupMessagesByContact,
      incomingState.groupMessagesByContact,
    ),
    groupMetadataById: {
      ...storedState.groupMetadataById,
      ...incomingState.groupMetadataById,
    },
    serviceTickets: mergeServiceTickets(
      storedState.serviceTickets,
      incomingState.serviceTickets,
    ),
    typingIndicators: mergeTypingIndicators(
      storedState.typingIndicators,
      incomingState.typingIndicators,
    ),
    pageRecords: mergeAppPageRecordCollections(
      storedState.pageRecords,
      incomingState.pageRecords,
    ),
  };
}
