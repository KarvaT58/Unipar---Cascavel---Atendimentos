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
  updatedAt?: Date;
}

export interface KanbanBoardState {
  columns: KanbanColumn[];
  cardsById: Record<string, KanbanCard>;
  labels: KanbanLabel[];
  updatedAt?: Date;
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
  deletedAnnouncementEventIds: string[];
  kanbanColumns: KanbanColumn[];
  kanbanCardsById: Record<string, KanbanCard>;
  kanbanLabels: KanbanLabel[];
  kanbanBoardsByUserId: Record<string, KanbanBoardState>;
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
  deletedAnnouncementEventIds: [],
  kanbanColumns: [],
  kanbanCardsById: {},
  kanbanLabels: [],
  kanbanBoardsByUserId: {},
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
  "conversationStateUpdatedAt",
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

function getContactKey(contact: Contact) {
  return `${contact.ownerId ?? "global"}:${contact.id}`;
}

function getContactStateFreshnessTime(contact: Contact) {
  return contact.conversationStateUpdatedAt?.getTime();
}

function mergeContact(storedContact: Contact, incomingContact: Contact) {
  const storedStateFreshness = getContactStateFreshnessTime(storedContact);
  const incomingStateFreshness = getContactStateFreshnessTime(incomingContact);
  const archiveStateContact =
    storedStateFreshness !== undefined &&
    (incomingStateFreshness === undefined ||
      storedStateFreshness > incomingStateFreshness)
      ? storedContact
      : incomingContact;

  return {
    ...storedContact,
    ...incomingContact,
    isArchived: archiveStateContact.isArchived,
    conversationStateUpdatedAt:
      archiveStateContact.conversationStateUpdatedAt ??
      incomingContact.conversationStateUpdatedAt ??
      storedContact.conversationStateUpdatedAt,
    hiddenForUserIds: mergeStringLists(
      storedContact.hiddenForUserIds,
      incomingContact.hiddenForUserIds,
    ),
  };
}

function mergeContactBuckets(
  storedActiveContacts: Contact[],
  storedArchivedContacts: Contact[],
  incomingActiveContacts: Contact[],
  incomingArchivedContacts: Contact[],
) {
  const contactsByKey = new Map<string, Contact>();
  const addContact = (contact: Contact) => {
    const contactKey = getContactKey(contact);
    const storedContact = contactsByKey.get(contactKey);

    contactsByKey.set(
      contactKey,
      storedContact ? mergeContact(storedContact, contact) : contact,
    );
  };

  storedActiveContacts.forEach(addContact);
  storedArchivedContacts.forEach(addContact);
  incomingActiveContacts.forEach(addContact);
  incomingArchivedContacts.forEach(addContact);

  const contacts = Array.from(contactsByKey.values());

  return {
    active: contacts.filter((contact) => !contact.isArchived),
    archived: contacts.filter((contact) => contact.isArchived),
  };
}

function normalizeGroupMetadata(metadata: GroupMetadataState) {
  const creatorId =
    metadata.creatorId ||
    metadata.adminIds[0] ||
    metadata.participantIds[0] ||
    "";
  const adminIds = mergeStringLists(
    metadata.adminIds,
    creatorId ? [creatorId] : [],
  );
  const participantIds = mergeStringLists(metadata.participantIds, adminIds);

  return {
    ...metadata,
    creatorId,
    participantIds,
    adminIds,
  };
}

function getGroupMetadataFreshnessTime(metadata: GroupMetadataState) {
  return metadata.updatedAt?.getTime();
}

function getFreshestGroupMetadata(
  storedMetadata: GroupMetadataState,
  incomingMetadata: GroupMetadataState,
) {
  const storedUpdatedAt = getGroupMetadataFreshnessTime(storedMetadata);
  const incomingUpdatedAt = getGroupMetadataFreshnessTime(incomingMetadata);

  if (incomingUpdatedAt === undefined && storedUpdatedAt !== undefined) {
    return storedMetadata;
  }

  if (incomingUpdatedAt !== undefined && storedUpdatedAt !== undefined) {
    return incomingUpdatedAt >= storedUpdatedAt
      ? incomingMetadata
      : storedMetadata;
  }

  return incomingMetadata;
}

function mergeGroupMetadataCollections(
  storedMetadataById: Record<string, GroupMetadataState>,
  incomingMetadataById: Record<string, GroupMetadataState>,
) {
  const groupIds = new Set([
    ...Object.keys(storedMetadataById),
    ...Object.keys(incomingMetadataById),
  ]);

  return Object.fromEntries(
    Array.from(groupIds).map((groupId) => {
      const storedMetadata = storedMetadataById[groupId];
      const incomingMetadata = incomingMetadataById[groupId];

      if (!storedMetadata) {
        return [groupId, normalizeGroupMetadata(incomingMetadata)];
      }

      if (!incomingMetadata) {
        return [groupId, normalizeGroupMetadata(storedMetadata)];
      }

      return [
        groupId,
        normalizeGroupMetadata(
          getFreshestGroupMetadata(storedMetadata, incomingMetadata),
        ),
      ];
    }),
  );
}

function normalizeKanbanBoard(board: KanbanBoardState): KanbanBoardState {
  return {
    columns: board.columns ?? [],
    cardsById: board.cardsById ?? {},
    labels: board.labels ?? [],
    updatedAt: board.updatedAt,
  };
}

function getKanbanBoardFreshnessTime(board: KanbanBoardState) {
  return board.updatedAt?.getTime();
}

function getFreshestKanbanBoard(
  storedBoard: KanbanBoardState,
  incomingBoard: KanbanBoardState,
) {
  const storedUpdatedAt = getKanbanBoardFreshnessTime(storedBoard);
  const incomingUpdatedAt = getKanbanBoardFreshnessTime(incomingBoard);

  if (incomingUpdatedAt === undefined && storedUpdatedAt !== undefined) {
    return storedBoard;
  }

  if (incomingUpdatedAt !== undefined && storedUpdatedAt !== undefined) {
    return incomingUpdatedAt >= storedUpdatedAt ? incomingBoard : storedBoard;
  }

  return incomingBoard;
}

function mergeKanbanBoardsByUserId(
  storedBoardsByUserId: Record<string, KanbanBoardState>,
  incomingBoardsByUserId: Record<string, KanbanBoardState>,
) {
  const userIds = new Set([
    ...Object.keys(storedBoardsByUserId),
    ...Object.keys(incomingBoardsByUserId),
  ]);

  return Object.fromEntries(
    Array.from(userIds).map((userId) => {
      const storedBoard = storedBoardsByUserId[userId];
      const incomingBoard = incomingBoardsByUserId[userId];

      if (!storedBoard) {
        return [userId, normalizeKanbanBoard(incomingBoard)];
      }

      if (!incomingBoard) {
        return [userId, normalizeKanbanBoard(storedBoard)];
      }

      return [
        userId,
        normalizeKanbanBoard(getFreshestKanbanBoard(storedBoard, incomingBoard)),
      ];
    }),
  );
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

function getAnnouncementEventFreshnessTime(event: AnnouncementEvent) {
  return event.updatedAt?.getTime();
}

function getFreshestAnnouncementEvent(
  storedEvent: AnnouncementEvent,
  incomingEvent: AnnouncementEvent,
) {
  const storedUpdatedAt = getAnnouncementEventFreshnessTime(storedEvent);
  const incomingUpdatedAt = getAnnouncementEventFreshnessTime(incomingEvent);

  if (incomingUpdatedAt === undefined && storedUpdatedAt !== undefined) {
    return storedEvent;
  }

  if (incomingUpdatedAt !== undefined && storedUpdatedAt !== undefined) {
    return incomingUpdatedAt >= storedUpdatedAt ? incomingEvent : storedEvent;
  }

  return incomingEvent;
}

function mergeAnnouncementEvents(
  storedEvents: AnnouncementEvent[],
  incomingEvents: AnnouncementEvent[],
  deletedEventIds: string[],
) {
  const deletedEventIdSet = new Set(deletedEventIds);
  const eventsById = new Map<string, AnnouncementEvent>();

  storedEvents.forEach((event) => {
    if (!deletedEventIdSet.has(event.id)) {
      eventsById.set(event.id, event);
    }
  });

  incomingEvents.forEach((event) => {
    if (deletedEventIdSet.has(event.id)) return;

    const storedEvent = eventsById.get(event.id);
    eventsById.set(
      event.id,
      storedEvent ? getFreshestAnnouncementEvent(storedEvent, event) : event,
    );
  });

  return Array.from(eventsById.values()).sort(
    (firstEvent, secondEvent) =>
      firstEvent.scheduledAt.getTime() - secondEvent.scheduledAt.getTime() ||
      firstEvent.id.localeCompare(secondEvent.id),
  );
}

export function mergeAppStates(
  storedState: AppState,
  incomingState: AppState,
): AppState {
  const deletedAnnouncementEventIds = mergeStringLists(
    storedState.deletedAnnouncementEventIds,
    incomingState.deletedAnnouncementEventIds,
  );
  const directContactBuckets = mergeContactBuckets(
    storedState.contacts,
    storedState.archivedContacts,
    incomingState.contacts,
    incomingState.archivedContacts,
  );
  const groupContactBuckets = mergeContactBuckets(
    storedState.groups,
    storedState.archivedGroups,
    incomingState.groups,
    incomingState.archivedGroups,
  );

  return {
    ...storedState,
    ...incomingState,
    contacts: directContactBuckets.active,
    archivedContacts: directContactBuckets.archived,
    groups: groupContactBuckets.active,
    archivedGroups: groupContactBuckets.archived,
    messagesByContact: mergeMessageCollections(
      storedState.messagesByContact,
      incomingState.messagesByContact,
    ),
    groupMessagesByContact: mergeMessageCollections(
      storedState.groupMessagesByContact,
      incomingState.groupMessagesByContact,
    ),
    groupMetadataById: mergeGroupMetadataCollections(
      storedState.groupMetadataById,
      incomingState.groupMetadataById,
    ),
    serviceTickets: mergeServiceTickets(
      storedState.serviceTickets,
      incomingState.serviceTickets,
    ),
    announcementEvents: mergeAnnouncementEvents(
      storedState.announcementEvents,
      incomingState.announcementEvents,
      deletedAnnouncementEventIds,
    ),
    deletedAnnouncementEventIds,
    kanbanBoardsByUserId: mergeKanbanBoardsByUserId(
      storedState.kanbanBoardsByUserId,
      incomingState.kanbanBoardsByUserId,
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
