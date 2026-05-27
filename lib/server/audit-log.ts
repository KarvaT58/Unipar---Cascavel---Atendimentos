import type { AppState } from "@/lib/app-state"
import type { Prisma } from "@/lib/generated/prisma/client"

const MAX_AUDIT_ENTRIES_PER_SAVE = 80

export type AuditActor = {
  id?: string | null
  name?: string | null
  email?: string | null
}

type EntityRecord = Record<string, unknown> & { id: string }

type TrackedCollection = {
  key: keyof AppState
  entityType: string
  label: string
  fields: string[]
}

const trackedCollections: TrackedCollection[] = [
  {
    key: "serviceTickets",
    entityType: "service_ticket",
    label: "atendimento",
    fields: [
      "status",
      "priority",
      "targetSector",
      "assignedToId",
      "closedAt",
      "reopenedAt",
      "lastInteractionAt",
    ],
  },
  {
    key: "loanRequests",
    entityType: "loan",
    label: "emprestimo",
    fields: [
      "status",
      "lenderSector",
      "requestedReturnDate",
      "approvedById",
      "returnedAt",
      "resolvedAt",
    ],
  },
  {
    key: "announcementEvents",
    entityType: "announcement",
    label: "anuncio/evento",
    fields: ["title", "scheduledAt", "recipientIds", "attachments"],
  },
  {
    key: "adminUsers",
    entityType: "user",
    label: "usuario",
    fields: ["name", "email", "sector", "isAdmin", "status"],
  },
  {
    key: "adminReports",
    entityType: "report",
    label: "denuncia",
    fields: ["status", "sourceKind", "sourceName"],
  },
  {
    key: "groups",
    entityType: "group",
    label: "grupo",
    fields: ["name", "isArchived", "isMuted", "isPinned"],
  },
  {
    key: "archivedGroups",
    entityType: "group",
    label: "grupo arquivado",
    fields: ["name", "isArchived", "isMuted", "isPinned"],
  },
  {
    key: "contacts",
    entityType: "conversation",
    label: "conversa",
    fields: ["name", "isArchived", "isMuted", "isPinned", "hiddenForUserIds"],
  },
  {
    key: "archivedContacts",
    entityType: "conversation",
    label: "conversa arquivada",
    fields: ["name", "isArchived", "isMuted", "isPinned", "hiddenForUserIds"],
  },
  {
    key: "helpItems",
    entityType: "help_item",
    label: "item de ajuda",
    fields: ["title", "images"],
  },
  {
    key: "extensionItems",
    entityType: "extension",
    label: "ramal",
    fields: ["name", "sector", "extension"],
  },
]

export function createAppStateAuditLogEntries({
  actor,
  previousState,
  nextState,
  revision,
  source,
}: {
  actor?: AuditActor
  previousState: AppState
  nextState: AppState
  revision: number
  source: string
}) {
  const entries: Prisma.AuditLogCreateManyInput[] = []

  for (const collection of trackedCollections) {
    entries.push(
      ...createCollectionAuditEntries({
        actor,
        collection,
        previousItems: getCollectionItems(previousState, collection.key),
        nextItems: getCollectionItems(nextState, collection.key),
        revision,
        source,
      })
    )

    if (entries.length >= MAX_AUDIT_ENTRIES_PER_SAVE) {
      return entries.slice(0, MAX_AUDIT_ENTRIES_PER_SAVE)
    }
  }

  entries.push(
    ...createMessageAuditEntries({
      actor,
      previousState,
      nextState,
      revision,
      source,
    })
  )

  entries.push(
    ...createKanbanAuditEntries({
      actor,
      previousState,
      nextState,
      revision,
      source,
    })
  )

  return entries.slice(0, MAX_AUDIT_ENTRIES_PER_SAVE)
}

function createCollectionAuditEntries({
  actor,
  collection,
  previousItems,
  nextItems,
  revision,
  source,
}: {
  actor?: AuditActor
  collection: TrackedCollection
  previousItems: EntityRecord[]
  nextItems: EntityRecord[]
  revision: number
  source: string
}) {
  const entries: Prisma.AuditLogCreateManyInput[] = []
  const previousById = new Map(previousItems.map((item) => [item.id, item]))
  const nextById = new Map(nextItems.map((item) => [item.id, item]))

  for (const item of nextItems) {
    const previousItem = previousById.get(item.id)

    if (!previousItem) {
      entries.push(
        createAuditLogEntry({
          actor,
          action: "created",
          entityType: collection.entityType,
          entityId: item.id,
          summary: `${collection.label} criado: ${getEntityName(item)}`,
          metadata: {
            revision,
            source,
            collection: collection.key,
          },
        })
      )
      continue
    }

    const changedFields = getChangedFields(
      previousItem,
      item,
      collection.fields
    )

    if (changedFields.length > 0) {
      entries.push(
        createAuditLogEntry({
          actor,
          action: "updated",
          entityType: collection.entityType,
          entityId: item.id,
          summary: `${collection.label} atualizado: ${getEntityName(item)}`,
          metadata: {
            revision,
            source,
            collection: collection.key,
            changedFields,
          },
        })
      )
    }
  }

  for (const item of previousItems) {
    if (nextById.has(item.id)) continue

    entries.push(
      createAuditLogEntry({
        actor,
        action: "deleted",
        entityType: collection.entityType,
        entityId: item.id,
        summary: `${collection.label} removido: ${getEntityName(item)}`,
        metadata: {
          revision,
          source,
          collection: collection.key,
        },
      })
    )
  }

  return entries
}

function createMessageAuditEntries({
  actor,
  previousState,
  nextState,
  revision,
  source,
}: {
  actor?: AuditActor
  previousState: AppState
  nextState: AppState
  revision: number
  source: string
}) {
  const entries: Prisma.AuditLogCreateManyInput[] = []

  entries.push(
    ...createMessageBucketAuditEntries({
      actor,
      previousBuckets: previousState.messagesByContact,
      nextBuckets: nextState.messagesByContact,
      entityType: "direct_message",
      revision,
      source,
    })
  )
  entries.push(
    ...createMessageBucketAuditEntries({
      actor,
      previousBuckets: previousState.groupMessagesByContact,
      nextBuckets: nextState.groupMessagesByContact,
      entityType: "group_message",
      revision,
      source,
    })
  )

  return entries
}

function createMessageBucketAuditEntries({
  actor,
  previousBuckets,
  nextBuckets,
  entityType,
  revision,
  source,
}: {
  actor?: AuditActor
  previousBuckets: Record<string, Array<{ id: string }>>
  nextBuckets: Record<string, Array<{ id: string }>>
  entityType: string
  revision: number
  source: string
}) {
  const entries: Prisma.AuditLogCreateManyInput[] = []

  for (const [conversationId, nextMessages] of Object.entries(nextBuckets)) {
    const previousMessages = previousBuckets[conversationId] ?? []
    const previousIds = new Set(previousMessages.map((message) => message.id))
    const addedIds = nextMessages
      .map((message) => message.id)
      .filter((messageId) => !previousIds.has(messageId))

    if (addedIds.length === 0) continue

    entries.push(
      createAuditLogEntry({
        actor,
        action: "message.created",
        entityType,
        entityId: conversationId,
        summary: `${addedIds.length} mensagem(ns) adicionada(s)`,
        metadata: {
          revision,
          source,
          conversationId,
          messageIds: addedIds.slice(0, 20),
          addedCount: addedIds.length,
        },
      })
    )
  }

  return entries
}

function createKanbanAuditEntries({
  actor,
  previousState,
  nextState,
  revision,
  source,
}: {
  actor?: AuditActor
  previousState: AppState
  nextState: AppState
  revision: number
  source: string
}) {
  const entries: Prisma.AuditLogCreateManyInput[] = []
  const userIds = new Set([
    ...Object.keys(previousState.kanbanBoardsByUserId),
    ...Object.keys(nextState.kanbanBoardsByUserId),
  ])

  for (const userId of userIds) {
    const previousBoard = previousState.kanbanBoardsByUserId[userId]
    const nextBoard = nextState.kanbanBoardsByUserId[userId]

    if (stableStringify(previousBoard) === stableStringify(nextBoard)) {
      continue
    }

    entries.push(
      createAuditLogEntry({
        actor,
        action: previousBoard ? "updated" : "created",
        entityType: "kanban_board",
        entityId: userId,
        summary: `kanban atualizado para usuario ${userId}`,
        metadata: {
          revision,
          source,
          boardOwnerId: userId,
        },
      })
    )
  }

  return entries
}

function createAuditLogEntry({
  actor,
  action,
  entityType,
  entityId,
  summary,
  metadata,
}: {
  actor?: AuditActor
  action: string
  entityType: string
  entityId?: string | null
  summary: string
  metadata: Record<string, unknown>
}): Prisma.AuditLogCreateManyInput {
  return {
    actorId: actor?.id ?? null,
    actorName: actor?.name ?? null,
    actorEmail: actor?.email ?? null,
    action,
    entityType,
    entityId,
    summary,
    metadata: toJsonValue(metadata),
  }
}

function getCollectionItems(state: AppState, key: keyof AppState) {
  const value = state[key]

  if (!Array.isArray(value)) return []

  return (value as unknown[]).filter(isEntityRecord)
}

function isEntityRecord(value: unknown): value is EntityRecord {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as { id?: unknown }).id === "string"
  )
}

function getEntityName(item: EntityRecord) {
  const value =
    item.title ??
    item.name ??
    item.sourceName ??
    item.email ??
    item.extension ??
    item.id

  return String(value)
}

function getChangedFields(
  previousItem: EntityRecord,
  nextItem: EntityRecord,
  fields: string[]
) {
  return fields.filter(
    (field) => stableStringify(previousItem[field]) !== stableStringify(nextItem[field])
  )
}

function stableStringify(value: unknown) {
  return JSON.stringify(toComparableValue(value))
}

function toComparableValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()

  if (Array.isArray(value)) return value.map(toComparableValue)

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entryValue]) => entryValue !== undefined)
        .sort(([firstKey], [secondKey]) => firstKey.localeCompare(secondKey))
        .map(([entryKey, entryValue]) => [
          entryKey,
          toComparableValue(entryValue),
        ])
    )
  }

  return value ?? null
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(toComparableValue(value))) as Prisma.InputJsonValue
}
