import {
  EMPTY_APP_STATE,
  normalizeAppState,
  serializeAppState,
  type AppPageRecord,
  type AppState,
  type GroupMetadataState,
  type KanbanBoardState,
} from "@/lib/app-state"
import type { Prisma } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import type { AccessRequest, AdminReport, AdminUser } from "@/lib/admin-data"
import type { Contact, Message } from "@/lib/chat-data"
import type { LoanRequest } from "@/lib/loan-data"
import type { AnnouncementEvent } from "@/components/announcements-events-page"

type AppStateModuleDatabase = Pick<
  Prisma.TransactionClient,
  | "adminUserStateRecord"
  | "accessRequestStateRecord"
  | "chatConversationRecord"
  | "chatMessageRecord"
  | "groupMetadataRecord"
  | "announcementEventRecord"
  | "deletedAnnouncementEventRecord"
  | "loanRequestRecord"
  | "kanbanBoardRecord"
  | "adminReportRecord"
  | "helpContentRecord"
  | "extensionContentRecord"
  | "appPageStateRecord"
  | "priorityMessageSeenRecord"
>

type ModuleFlags = {
  adminUsers: boolean
  accessRequests: boolean
  chatConversations: boolean
  chatMessages: boolean
  groupMetadata: boolean
  announcementEvents: boolean
  loanRequests: boolean
  kanbanBoards: boolean
  adminReports: boolean
  helpItems: boolean
  extensionItems: boolean
  pageRecords: boolean
  priorityMessageSeen: boolean
}

type DatabaseModuleRead = {
  state: AppState
  flags: ModuleFlags
}

const DIRECT_CHAT_SCOPE = "direct"
const GROUP_CHAT_SCOPE = "group"
const GLOBAL_KANBAN_BOARD_USER_ID = "__global__"

const EMPTY_FLAGS: ModuleFlags = {
  adminUsers: false,
  accessRequests: false,
  chatConversations: false,
  chatMessages: false,
  groupMetadata: false,
  announcementEvents: false,
  loanRequests: false,
  kanbanBoards: false,
  adminReports: false,
  helpItems: false,
  extensionItems: false,
  pageRecords: false,
  priorityMessageSeen: false,
}

function toJsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

function normalizePartialState(state: Partial<AppState>) {
  return normalizeAppState({
    ...EMPTY_APP_STATE,
    ...state,
  })
}

function encodeRecordPart(value: string | null | undefined) {
  return encodeURIComponent(value?.trim() || "_")
}

function buildRecordId(...parts: Array<string | null | undefined>) {
  return parts.map(encodeRecordPart).join(":")
}

function toDate(value: Date | string | null | undefined, fallback = new Date()) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value
  }

  if (typeof value === "string") {
    const date = new Date(value)

    if (Number.isFinite(date.getTime())) return date
  }

  return fallback
}

function getLastDate(values: Array<Date | string | undefined>) {
  return values.reduce<Date>((latestDate, value) => {
    const date = toDate(value, latestDate)

    return date.getTime() > latestDate.getTime() ? date : latestDate
  }, new Date(0))
}

function getLoanUpdatedAt(loan: LoanRequest) {
  return getLastDate([
    loan.createdAt,
    loan.rejectedAt,
    loan.approvedAt,
    loan.returnedAt,
    loan.resolvedAt,
    ...loan.postponements.map((postponement) => postponement.requestedAt),
  ])
}

function hasItems<T>(items: T[]) {
  return items.length > 0
}

function hasRecordItems<T>(record: Record<string, T[] | T>) {
  return Object.keys(record).length > 0
}

function getDatabaseBackedModuleSnapshot(state: AppState) {
  return {
    contacts: state.contacts,
    archivedContacts: state.archivedContacts,
    groups: state.groups,
    archivedGroups: state.archivedGroups,
    messagesByContact: state.messagesByContact,
    groupMessagesByContact: state.groupMessagesByContact,
    groupMetadataById: state.groupMetadataById,
    accessRequests: state.accessRequests,
    adminUsers: state.adminUsers,
    adminReports: state.adminReports,
    loanRequests: state.loanRequests,
    announcementEvents: state.announcementEvents,
    deletedAnnouncementEventIds: state.deletedAnnouncementEventIds,
    kanbanColumns: state.kanbanColumns,
    kanbanCardsById: state.kanbanCardsById,
    kanbanLabels: state.kanbanLabels,
    kanbanBoardsByUserId: state.kanbanBoardsByUserId,
    helpItems: state.helpItems,
    extensionItems: state.extensionItems,
    pageRecords: state.pageRecords,
    priorityMessageAlertSeenKeysByUserId:
      state.priorityMessageAlertSeenKeysByUserId,
  }
}

function toComparableJsonValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()

  if (Array.isArray(value)) {
    return value.map((item) => toComparableJsonValue(item))
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entryValue]) => entryValue !== undefined)
        .sort(([firstKey], [secondKey]) => firstKey.localeCompare(secondKey))
        .map(([entryKey, entryValue]) => [
          entryKey,
          toComparableJsonValue(entryValue),
        ])
    )
  }

  return value
}

function serializeComparableModuleSnapshot(state: AppState) {
  return JSON.stringify(
    toComparableJsonValue(getDatabaseBackedModuleSnapshot(state))
  )
}

export function areDatabaseBackedAppStateModulesEqual(
  firstState: AppState,
  secondState: AppState
) {
  return (
    serializeComparableModuleSnapshot(firstState) ===
    serializeComparableModuleSnapshot(secondState)
  )
}

export function hasDatabaseBackedAppStateModuleData(state: AppState) {
  return (
    hasItems(state.contacts) ||
    hasItems(state.archivedContacts) ||
    hasItems(state.groups) ||
    hasItems(state.archivedGroups) ||
    hasRecordItems(state.messagesByContact) ||
    hasRecordItems(state.groupMessagesByContact) ||
    hasRecordItems(state.groupMetadataById) ||
    hasItems(state.accessRequests) ||
    hasItems(state.adminUsers) ||
    hasItems(state.adminReports) ||
    hasItems(state.loanRequests) ||
    hasItems(state.announcementEvents) ||
    hasItems(state.deletedAnnouncementEventIds) ||
    hasItems(state.kanbanColumns) ||
    hasRecordItems(state.kanbanCardsById) ||
    hasItems(state.kanbanLabels) ||
    hasRecordItems(state.kanbanBoardsByUserId) ||
    hasItems(state.helpItems) ||
    hasItems(state.extensionItems) ||
    hasRecordItems(state.pageRecords) ||
    hasRecordItems(state.priorityMessageAlertSeenKeysByUserId)
  )
}

export function omitDatabaseBackedAppStateModules(state: AppState): AppState {
  return {
    ...state,
    contacts: EMPTY_APP_STATE.contacts,
    archivedContacts: EMPTY_APP_STATE.archivedContacts,
    groups: EMPTY_APP_STATE.groups,
    archivedGroups: EMPTY_APP_STATE.archivedGroups,
    messagesByContact: EMPTY_APP_STATE.messagesByContact,
    groupMessagesByContact: EMPTY_APP_STATE.groupMessagesByContact,
    groupMetadataById: EMPTY_APP_STATE.groupMetadataById,
    accessRequests: EMPTY_APP_STATE.accessRequests,
    adminUsers: EMPTY_APP_STATE.adminUsers,
    adminReports: EMPTY_APP_STATE.adminReports,
    loanRequests: EMPTY_APP_STATE.loanRequests,
    announcementEvents: EMPTY_APP_STATE.announcementEvents,
    deletedAnnouncementEventIds: EMPTY_APP_STATE.deletedAnnouncementEventIds,
    kanbanColumns: EMPTY_APP_STATE.kanbanColumns,
    kanbanCardsById: EMPTY_APP_STATE.kanbanCardsById,
    kanbanLabels: EMPTY_APP_STATE.kanbanLabels,
    kanbanBoardsByUserId: EMPTY_APP_STATE.kanbanBoardsByUserId,
    helpItems: EMPTY_APP_STATE.helpItems,
    extensionItems: EMPTY_APP_STATE.extensionItems,
    pageRecords: EMPTY_APP_STATE.pageRecords,
    priorityMessageAlertSeenKeysByUserId:
      EMPTY_APP_STATE.priorityMessageAlertSeenKeysByUserId,
  }
}

export async function hydrateDatabaseBackedAppStateModules(
  state: AppState,
  db: AppStateModuleDatabase = prisma
) {
  return applyDatabaseModuleRead(state, await readDatabaseBackedAppStateModules(db))
}

export async function readDatabaseBackedAppStateModules(
  db: AppStateModuleDatabase = prisma
): Promise<DatabaseModuleRead> {
  const [
    adminUserRows,
    accessRequestRows,
    conversationRows,
    messageRows,
    groupMetadataRows,
    announcementRows,
    deletedAnnouncementRows,
    loanRows,
    kanbanRows,
    adminReportRows,
    helpRows,
    extensionRows,
    appPageRows,
    prioritySeenRows,
  ] = await Promise.all([
    db.adminUserStateRecord.findMany({
      orderBy: [{ email: "asc" }, { recordId: "asc" }],
    }),
    db.accessRequestStateRecord.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    }),
    db.chatConversationRecord.findMany({
      orderBy: [{ lastMessageAt: "desc" }, { conversationId: "asc" }],
    }),
    db.chatMessageRecord.findMany({
      orderBy: [{ timestamp: "asc" }, { messageId: "asc" }],
    }),
    db.groupMetadataRecord.findMany({
      orderBy: { groupId: "asc" },
    }),
    db.announcementEventRecord.findMany({
      orderBy: [{ scheduledAt: "asc" }, { id: "asc" }],
    }),
    db.deletedAnnouncementEventRecord.findMany({
      orderBy: { deletedAt: "asc" },
    }),
    db.loanRequestRecord.findMany({
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    }),
    db.kanbanBoardRecord.findMany({
      orderBy: { userId: "asc" },
    }),
    db.adminReportRecord.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    }),
    db.helpContentRecord.findMany({
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    }),
    db.extensionContentRecord.findMany({
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    }),
    db.appPageStateRecord.findMany({
      orderBy: [{ pageKey: "asc" }, { updatedAt: "desc" }, { itemId: "asc" }],
    }),
    db.priorityMessageSeenRecord.findMany({
      orderBy: { userId: "asc" },
    }),
  ])

  const conversationState = toConversationState(conversationRows)
  const messageState = toMessageState(messageRows)
  const kanbanState = toKanbanState(kanbanRows)
  const pageRecords = toPageRecords(appPageRows)
  const priorityMessageAlertSeenKeysByUserId = Object.fromEntries(
    prioritySeenRows.map((row) => [
      row.userId,
      Array.isArray(row.seenKeys) ? (row.seenKeys as string[]) : [],
    ])
  ) as Record<string, string[]>

  const state = normalizePartialState({
    ...conversationState,
    ...messageState,
    groupMetadataById: Object.fromEntries(
      groupMetadataRows.map((row) => [
        row.groupId,
        row.data as unknown as GroupMetadataState,
      ])
    ),
    accessRequests: accessRequestRows.map(
      (row) => row.data as unknown as AccessRequest
    ),
    adminUsers: adminUserRows.map((row) => row.data as unknown as AdminUser),
    adminReports: adminReportRows.map(
      (row) => row.data as unknown as AdminReport
    ),
    loanRequests: loanRows.map((row) => row.data as unknown as LoanRequest),
    announcementEvents: announcementRows.map(
      (row) => row.data as unknown as AnnouncementEvent
    ),
    deletedAnnouncementEventIds: deletedAnnouncementRows.map((row) => row.id),
    ...kanbanState,
    helpItems: helpRows.map(
      (row) => row.data as unknown as AppState["helpItems"][number]
    ),
    extensionItems: extensionRows.map(
      (row) => row.data as unknown as AppState["extensionItems"][number]
    ),
    pageRecords,
    priorityMessageAlertSeenKeysByUserId,
  })

  return {
    state,
    flags: {
      adminUsers: adminUserRows.length > 0,
      accessRequests: accessRequestRows.length > 0,
      chatConversations: conversationRows.length > 0,
      chatMessages: messageRows.length > 0,
      groupMetadata: groupMetadataRows.length > 0,
      announcementEvents:
        announcementRows.length > 0 || deletedAnnouncementRows.length > 0,
      loanRequests: loanRows.length > 0,
      kanbanBoards: kanbanRows.length > 0,
      adminReports: adminReportRows.length > 0,
      helpItems: helpRows.length > 0,
      extensionItems: extensionRows.length > 0,
      pageRecords: appPageRows.length > 0,
      priorityMessageSeen: prioritySeenRows.length > 0,
    },
  }
}

export function applyDatabaseModuleRead(
  state: AppState,
  databaseModules: DatabaseModuleRead
): AppState {
  const { flags, state: databaseState } = databaseModules

  return {
    ...state,
    ...(flags.chatConversations
      ? {
          contacts: databaseState.contacts,
          archivedContacts: databaseState.archivedContacts,
          groups: databaseState.groups,
          archivedGroups: databaseState.archivedGroups,
        }
      : {}),
    ...(flags.chatMessages
      ? {
          messagesByContact: databaseState.messagesByContact,
          groupMessagesByContact: databaseState.groupMessagesByContact,
        }
      : {}),
    ...(flags.groupMetadata
      ? { groupMetadataById: databaseState.groupMetadataById }
      : {}),
    ...(flags.accessRequests
      ? { accessRequests: databaseState.accessRequests }
      : {}),
    ...(flags.adminUsers ? { adminUsers: databaseState.adminUsers } : {}),
    ...(flags.adminReports
      ? { adminReports: databaseState.adminReports }
      : {}),
    ...(flags.loanRequests
      ? { loanRequests: databaseState.loanRequests }
      : {}),
    ...(flags.announcementEvents
      ? {
          announcementEvents: databaseState.announcementEvents,
          deletedAnnouncementEventIds:
            databaseState.deletedAnnouncementEventIds,
        }
      : {}),
    ...(flags.kanbanBoards
      ? {
          kanbanColumns: databaseState.kanbanColumns,
          kanbanCardsById: databaseState.kanbanCardsById,
          kanbanLabels: databaseState.kanbanLabels,
          kanbanBoardsByUserId: databaseState.kanbanBoardsByUserId,
        }
      : {}),
    ...(flags.helpItems ? { helpItems: databaseState.helpItems } : {}),
    ...(flags.extensionItems
      ? { extensionItems: databaseState.extensionItems }
      : {}),
    ...(flags.pageRecords ? { pageRecords: databaseState.pageRecords } : {}),
    ...(flags.priorityMessageSeen
      ? {
          priorityMessageAlertSeenKeysByUserId:
            databaseState.priorityMessageAlertSeenKeysByUserId,
        }
      : {}),
  }
}

export async function syncDatabaseBackedAppStateModules(
  db: AppStateModuleDatabase,
  state: AppState
) {
  await Promise.all([
    db.adminUserStateRecord.deleteMany({}),
    db.accessRequestStateRecord.deleteMany({}),
    db.chatConversationRecord.deleteMany({}),
    db.chatMessageRecord.deleteMany({}),
    db.groupMetadataRecord.deleteMany({}),
    db.announcementEventRecord.deleteMany({}),
    db.deletedAnnouncementEventRecord.deleteMany({}),
    db.loanRequestRecord.deleteMany({}),
    db.kanbanBoardRecord.deleteMany({}),
    db.adminReportRecord.deleteMany({}),
    db.helpContentRecord.deleteMany({}),
    db.extensionContentRecord.deleteMany({}),
    db.appPageStateRecord.deleteMany({}),
    db.priorityMessageSeenRecord.deleteMany({}),
  ])

  await Promise.all([
    createAdminUserRows(db, state.adminUsers),
    createAccessRequestRows(db, state.accessRequests),
    createConversationRows(db, state),
    createMessageRows(db, state),
    createGroupMetadataRows(db, state.groupMetadataById),
    createAnnouncementRows(db, state),
    createLoanRows(db, state.loanRequests),
    createKanbanRows(db, state),
    createAdminReportRows(db, state.adminReports),
    createHelpRows(db, state.helpItems),
    createExtensionRows(db, state.extensionItems),
    createAppPageRows(db, state.pageRecords),
    createPrioritySeenRows(db, state.priorityMessageAlertSeenKeysByUserId),
  ])
}

function toConversationState(
  rows: Awaited<
    ReturnType<AppStateModuleDatabase["chatConversationRecord"]["findMany"]>
  >
) {
  const contacts: Contact[] = []
  const archivedContacts: Contact[] = []
  const groups: Contact[] = []
  const archivedGroups: Contact[] = []

  rows.forEach((row) => {
    const contact = row.data as unknown as Contact

    if (row.scope === GROUP_CHAT_SCOPE) {
      if (row.isArchived) archivedGroups.push(contact)
      else groups.push(contact)
      return
    }

    if (row.isArchived) archivedContacts.push(contact)
    else contacts.push(contact)
  })

  return { contacts, archivedContacts, groups, archivedGroups }
}

function toMessageState(
  rows: Awaited<
    ReturnType<AppStateModuleDatabase["chatMessageRecord"]["findMany"]>
  >
) {
  const messagesByContact: Record<string, Message[]> = {}
  const groupMessagesByContact: Record<string, Message[]> = {}

  rows.forEach((row) => {
    const target =
      row.scope === GROUP_CHAT_SCOPE
        ? groupMessagesByContact
        : messagesByContact
    const messages = target[row.conversationId] ?? []

    messages.push(row.data as unknown as Message)
    target[row.conversationId] = messages
  })

  return { messagesByContact, groupMessagesByContact }
}

function toKanbanState(
  rows: Awaited<
    ReturnType<AppStateModuleDatabase["kanbanBoardRecord"]["findMany"]>
  >
) {
  const kanbanBoardsByUserId: Record<string, KanbanBoardState> = {}
  const globalBoard = rows.find(
    (row) => row.userId === GLOBAL_KANBAN_BOARD_USER_ID
  )?.data as unknown as KanbanBoardState | undefined

  rows.forEach((row) => {
    if (row.userId === GLOBAL_KANBAN_BOARD_USER_ID) return

    const board = row.data as unknown as KanbanBoardState

    kanbanBoardsByUserId[row.userId] = board
  })

  return {
    kanbanColumns: globalBoard?.columns ?? [],
    kanbanCardsById: globalBoard?.cardsById ?? {},
    kanbanLabels: globalBoard?.labels ?? [],
    kanbanBoardsByUserId,
  }
}

function toPageRecords(
  rows: Awaited<
    ReturnType<AppStateModuleDatabase["appPageStateRecord"]["findMany"]>
  >
) {
  const pageRecords: Record<string, AppPageRecord[]> = {}

  rows.forEach((row) => {
    const records = pageRecords[row.pageKey] ?? []

    records.push(row.data as unknown as AppPageRecord)
    pageRecords[row.pageKey] = records
  })

  return pageRecords
}

async function createAdminUserRows(
  db: AppStateModuleDatabase,
  users: AdminUser[]
) {
  if (users.length === 0) return

  await db.adminUserStateRecord.createMany({
    data: users.map((user) => ({
      recordId: buildRecordId(user.id || user.email),
      userId: user.id || null,
      email: user.email || null,
      data: toJsonValue(user),
    })),
  })
}

async function createAccessRequestRows(
  db: AppStateModuleDatabase,
  requests: AccessRequest[]
) {
  if (requests.length === 0) return

  await db.accessRequestStateRecord.createMany({
    data: requests.map((request) => ({
      id: request.id,
      status: request.status,
      createdAt: toDate(request.createdAt),
      data: toJsonValue(request),
    })),
  })
}

async function createConversationRows(
  db: AppStateModuleDatabase,
  state: AppState
) {
  const rows = [
    ...state.contacts.map((contact) =>
      toConversationRecord(DIRECT_CHAT_SCOPE, contact, false)
    ),
    ...state.archivedContacts.map((contact) =>
      toConversationRecord(DIRECT_CHAT_SCOPE, contact, true)
    ),
    ...state.groups.map((contact) =>
      toConversationRecord(GROUP_CHAT_SCOPE, contact, false)
    ),
    ...state.archivedGroups.map((contact) =>
      toConversationRecord(GROUP_CHAT_SCOPE, contact, true)
    ),
  ]

  if (rows.length === 0) return

  await db.chatConversationRecord.createMany({ data: rows })
}

function toConversationRecord(
  scope: string,
  contact: Contact,
  isArchived: boolean
) {
  const conversationId = contact.id

  return {
    recordId: buildRecordId(scope, contact.ownerId ?? "global", conversationId),
    scope,
    conversationId,
    ownerId: contact.ownerId ?? null,
    isArchived,
    lastMessageAt: contact.lastMessageTime
      ? toDate(contact.lastMessageTime)
      : null,
    data: toJsonValue({
      ...contact,
      isArchived,
    }),
  }
}

async function createMessageRows(db: AppStateModuleDatabase, state: AppState) {
  const rows = [
    ...Object.entries(state.messagesByContact).flatMap(([contactId, messages]) =>
      messages.map((message) =>
        toMessageRecord(DIRECT_CHAT_SCOPE, contactId, message)
      )
    ),
    ...Object.entries(state.groupMessagesByContact).flatMap(
      ([contactId, messages]) =>
        messages.map((message) =>
          toMessageRecord(GROUP_CHAT_SCOPE, contactId, message)
        )
    ),
  ]

  if (rows.length === 0) return

  await db.chatMessageRecord.createMany({ data: rows })
}

function toMessageRecord(scope: string, conversationId: string, message: Message) {
  return {
    recordId: buildRecordId(scope, conversationId, message.id),
    scope,
    conversationId,
    messageId: message.id,
    senderId: message.senderId ?? null,
    isPriority: Boolean(message.isPriority),
    timestamp: toDate(message.timestamp),
    data: toJsonValue(message),
  }
}

async function createGroupMetadataRows(
  db: AppStateModuleDatabase,
  metadataById: Record<string, GroupMetadataState>
) {
  const entries = Object.entries(metadataById)

  if (entries.length === 0) return

  await db.groupMetadataRecord.createMany({
    data: entries.map(([groupId, metadata]) => ({
      groupId,
      data: toJsonValue(metadata),
    })),
  })
}

async function createAnnouncementRows(
  db: AppStateModuleDatabase,
  state: AppState
) {
  await Promise.all([
    state.announcementEvents.length > 0
      ? db.announcementEventRecord.createMany({
          data: state.announcementEvents.map((event) => ({
            id: event.id,
            scheduledAt: toDate(event.scheduledAt),
            eventUpdatedAt: event.updatedAt ? toDate(event.updatedAt) : null,
            data: toJsonValue(event),
          })),
        })
      : Promise.resolve(),
    state.deletedAnnouncementEventIds.length > 0
      ? db.deletedAnnouncementEventRecord.createMany({
          data: state.deletedAnnouncementEventIds.map((id) => ({ id })),
        })
      : Promise.resolve(),
  ])
}

async function createLoanRows(
  db: AppStateModuleDatabase,
  loans: LoanRequest[]
) {
  if (loans.length === 0) return

  await db.loanRequestRecord.createMany({
    data: loans.map((loan) => ({
      id: loan.id,
      status: loan.status,
      createdAt: toDate(loan.createdAt),
      updatedAt: getLoanUpdatedAt(loan),
      data: toJsonValue(loan),
    })),
  })
}

async function createKanbanRows(db: AppStateModuleDatabase, state: AppState) {
  const rows = Object.entries(state.kanbanBoardsByUserId).map(
    ([userId, board]) => ({
      userId,
      updatedAt: toDate(board.updatedAt),
      data: toJsonValue(board),
    })
  )

  if (
    state.kanbanColumns.length > 0 ||
    Object.keys(state.kanbanCardsById).length > 0 ||
    state.kanbanLabels.length > 0
  ) {
    rows.push({
      userId: GLOBAL_KANBAN_BOARD_USER_ID,
      updatedAt: new Date(),
      data: toJsonValue({
        columns: state.kanbanColumns,
        cardsById: state.kanbanCardsById,
        labels: state.kanbanLabels,
        updatedAt: new Date(),
      }),
    })
  }

  if (rows.length === 0) return

  await db.kanbanBoardRecord.createMany({ data: rows })
}

async function createAdminReportRows(
  db: AppStateModuleDatabase,
  reports: AdminReport[]
) {
  if (reports.length === 0) return

  await db.adminReportRecord.createMany({
    data: reports.map((report) => ({
      id: report.id,
      status: report.status,
      createdAt: toDate(report.createdAt),
      data: toJsonValue(report),
    })),
  })
}

async function createHelpRows(
  db: AppStateModuleDatabase,
  items: AppState["helpItems"]
) {
  if (items.length === 0) return

  await db.helpContentRecord.createMany({
    data: items.map((item, index) => ({
      id: item.id,
      sortOrder: index,
      data: toJsonValue(item),
    })),
  })
}

async function createExtensionRows(
  db: AppStateModuleDatabase,
  items: AppState["extensionItems"]
) {
  if (items.length === 0) return

  await db.extensionContentRecord.createMany({
    data: items.map((item, index) => ({
      id: item.id,
      sortOrder: index,
      data: toJsonValue(item),
    })),
  })
}

async function createAppPageRows(
  db: AppStateModuleDatabase,
  pageRecords: AppState["pageRecords"]
) {
  const rows = Object.entries(pageRecords).flatMap(([pageKey, records]) =>
    records.map((record) => ({
      recordId: buildRecordId(pageKey, record.id),
      pageKey,
      itemId: record.id,
      updatedAt: toDate(record.updatedAt),
      data: toJsonValue(record),
    }))
  )

  if (rows.length === 0) return

  await db.appPageStateRecord.createMany({ data: rows })
}

async function createPrioritySeenRows(
  db: AppStateModuleDatabase,
  seenKeysByUserId: AppState["priorityMessageAlertSeenKeysByUserId"]
) {
  const rows = Object.entries(seenKeysByUserId)

  if (rows.length === 0) return

  await db.priorityMessageSeenRecord.createMany({
    data: rows.map(([userId, seenKeys]) => ({
      userId,
      seenKeys: toJsonValue(seenKeys),
    })),
  })
}
