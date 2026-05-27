import type { AppState } from "@/lib/app-state"
import type { Prisma } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import type {
  ServiceTicket,
  ServiceTicketAttachment,
  ServiceTicketMessage,
  ServiceTicketTransfer,
} from "@/lib/service-ticket-data"

type ServiceTicketDatabase = Pick<
  Prisma.TransactionClient,
  | "serviceTicketRecord"
  | "serviceTicketMessageRecord"
  | "serviceTicketAttachmentRecord"
  | "serviceTicketTransferRecord"
>

type ServiceTicketRecordWithRelations = Awaited<
  ReturnType<typeof readServiceTicketRecords>
>[number]

function toDate(value: Date | string | null | undefined, fallback = new Date()) {
  if (value instanceof Date) {
    return value
  }

  if (typeof value === "string") {
    const date = new Date(value)

    if (!Number.isNaN(date.getTime())) {
      return date
    }
  }

  return fallback
}

function nullToUndefined<T>(value: T | null): T | undefined {
  return value ?? undefined
}

function buildAttachmentRecordId(
  ticketId: string,
  attachmentId: string,
  messageId?: string
) {
  return [ticketId, messageId ?? "ticket", attachmentId].join(":")
}

function normalizeTicketAttachment(
  attachment: ServiceTicketAttachment,
  ticketId: string,
  messageId?: string
) {
  return {
    id: buildAttachmentRecordId(ticketId, attachment.id, messageId),
    attachmentId: attachment.id,
    ticketId,
    messageId: messageId ?? null,
    name: attachment.name,
    size: attachment.size,
    kind: attachment.kind,
    url: attachment.url,
    extension: attachment.extension ?? null,
  }
}

function mapAttachmentRecord(
  attachment: ServiceTicketRecordWithRelations["attachments"][number]
): ServiceTicketAttachment {
  return {
    id: attachment.attachmentId,
    name: attachment.name,
    size: attachment.size,
    kind: attachment.kind as ServiceTicketAttachment["kind"],
    url: attachment.url,
    extension: nullToUndefined(attachment.extension),
  }
}

function mapMessageRecord(
  message: ServiceTicketRecordWithRelations["messages"][number]
): ServiceTicketMessage {
  return {
    id: message.id,
    authorId: message.authorId,
    authorName: message.authorName,
    authorSector: message.authorSector as ServiceTicketMessage["authorSector"],
    content: message.content,
    createdAt: message.createdAt,
    attachments: message.attachments.map(mapAttachmentRecord),
    isSystem: message.isSystem,
    isInternal: message.isInternal,
  }
}

function mapTransferRecord(
  transfer: ServiceTicketRecordWithRelations["transfers"][number]
): ServiceTicketTransfer {
  return {
    id: transfer.id,
    createdAt: transfer.createdAt,
    fromSector: transfer.fromSector as ServiceTicketTransfer["fromSector"],
    toSector: transfer.toSector as ServiceTicketTransfer["toSector"],
    transferredById: transfer.transferredById,
    transferredByName: transfer.transferredByName,
    assignedToId: nullToUndefined(transfer.assignedToId),
    assignedToName: nullToUndefined(transfer.assignedToName),
  }
}

function mapTicketRecord(
  ticket: ServiceTicketRecordWithRelations
): ServiceTicket {
  return {
    id: ticket.id,
    title: ticket.title,
    description: ticket.description,
    requesterId: ticket.requesterId,
    requesterName: ticket.requesterName,
    requesterSector: ticket.requesterSector as ServiceTicket["requesterSector"],
    targetSector: ticket.targetSector as ServiceTicket["targetSector"],
    priority: ticket.priority as ServiceTicket["priority"],
    status: ticket.status as ServiceTicket["status"],
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    lastInteractionAt: ticket.lastInteractionAt,
    assignedToId: nullToUndefined(ticket.assignedToId),
    assignedToName: nullToUndefined(ticket.assignedToName),
    assignedToSector: nullToUndefined(
      ticket.assignedToSector as ServiceTicket["assignedToSector"] | null
    ),
    attachments: ticket.attachments
      .filter((attachment) => !attachment.messageId)
      .map(mapAttachmentRecord),
    messages: ticket.messages.map(mapMessageRecord),
    transfers: ticket.transfers.map(mapTransferRecord),
    closedAt: nullToUndefined(ticket.closedAt),
    closedById: nullToUndefined(ticket.closedById),
    closedByName: nullToUndefined(ticket.closedByName),
    closeDescription: nullToUndefined(ticket.closeDescription),
    reopenedAt: nullToUndefined(ticket.reopenedAt),
    reopenedById: nullToUndefined(ticket.reopenedById),
    reopenedByName: nullToUndefined(ticket.reopenedByName),
    reopenReason: nullToUndefined(ticket.reopenReason),
  }
}

async function readServiceTicketRecords(db: ServiceTicketDatabase = prisma) {
  return db.serviceTicketRecord.findMany({
    orderBy: [
      { lastInteractionAt: "desc" },
      { updatedAt: "desc" },
      { title: "asc" },
    ],
    include: {
      attachments: {
        orderBy: { id: "asc" },
      },
      messages: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        include: {
          attachments: {
            orderBy: { id: "asc" },
          },
        },
      },
      transfers: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      },
    },
  })
}

function comparableDate(value: Date | string | null | undefined) {
  const date = toDate(value, new Date(0))

  return date.toISOString()
}

function comparableAttachment(attachment: ServiceTicketAttachment) {
  return {
    id: attachment.id,
    name: attachment.name,
    size: attachment.size,
    kind: attachment.kind,
    url: attachment.url,
    extension: attachment.extension ?? null,
  }
}

function comparableMessage(message: ServiceTicketMessage) {
  return {
    id: message.id,
    authorId: message.authorId,
    authorName: message.authorName,
    authorSector: message.authorSector,
    content: message.content,
    createdAt: comparableDate(message.createdAt),
    attachments: [...(message.attachments ?? [])]
      .map(comparableAttachment)
      .sort((first, second) => first.id.localeCompare(second.id)),
    isSystem: Boolean(message.isSystem),
    isInternal: Boolean(message.isInternal),
  }
}

function comparableTransfer(transfer: ServiceTicketTransfer) {
  return {
    id: transfer.id,
    createdAt: comparableDate(transfer.createdAt),
    fromSector: transfer.fromSector,
    toSector: transfer.toSector,
    transferredById: transfer.transferredById,
    transferredByName: transfer.transferredByName,
    assignedToId: transfer.assignedToId ?? null,
    assignedToName: transfer.assignedToName ?? null,
  }
}

function comparableTicket(ticket: ServiceTicket) {
  return {
    id: ticket.id,
    title: ticket.title,
    description: ticket.description,
    requesterId: ticket.requesterId,
    requesterName: ticket.requesterName,
    requesterSector: ticket.requesterSector,
    targetSector: ticket.targetSector,
    priority: ticket.priority,
    status: ticket.status,
    createdAt: comparableDate(ticket.createdAt),
    updatedAt: comparableDate(ticket.updatedAt),
    lastInteractionAt: comparableDate(ticket.lastInteractionAt),
    assignedToId: ticket.assignedToId ?? null,
    assignedToName: ticket.assignedToName ?? null,
    assignedToSector: ticket.assignedToSector ?? null,
    attachments: [...ticket.attachments]
      .map(comparableAttachment)
      .sort((first, second) => first.id.localeCompare(second.id)),
    messages: [...ticket.messages]
      .map(comparableMessage)
      .sort((first, second) => first.id.localeCompare(second.id)),
    transfers: [...ticket.transfers]
      .map(comparableTransfer)
      .sort((first, second) => first.id.localeCompare(second.id)),
    closedAt: ticket.closedAt ? comparableDate(ticket.closedAt) : null,
    closedById: ticket.closedById ?? null,
    closedByName: ticket.closedByName ?? null,
    closeDescription: ticket.closeDescription ?? null,
    reopenedAt: ticket.reopenedAt ? comparableDate(ticket.reopenedAt) : null,
    reopenedById: ticket.reopenedById ?? null,
    reopenedByName: ticket.reopenedByName ?? null,
    reopenReason: ticket.reopenReason ?? null,
  }
}

export function areServiceTicketListsEqual(
  firstTickets: ServiceTicket[],
  secondTickets: ServiceTicket[]
) {
  const firstComparable = [...firstTickets]
    .map(comparableTicket)
    .sort((first, second) => first.id.localeCompare(second.id))
  const secondComparable = [...secondTickets]
    .map(comparableTicket)
    .sort((first, second) => first.id.localeCompare(second.id))

  return JSON.stringify(firstComparable) === JSON.stringify(secondComparable)
}

export async function readServiceTicketsFromDatabase(
  db: ServiceTicketDatabase = prisma
) {
  const records = await readServiceTicketRecords(db)

  return records.map(mapTicketRecord)
}

export async function hydrateServiceTicketsFromDatabase(state: AppState) {
  const databaseTickets = await readServiceTicketsFromDatabase()

  if (databaseTickets.length === 0) {
    return state
  }

  return {
    ...state,
    serviceTickets: databaseTickets,
  }
}

export function omitDatabaseBackedServiceTickets(state: AppState): AppState {
  return {
    ...state,
    serviceTickets: [],
  }
}

export function hydrateServiceTicketsWithDatabaseRows(
  state: AppState,
  databaseTickets: ServiceTicket[]
): AppState {
  if (databaseTickets.length === 0) {
    return state
  }

  return {
    ...state,
    serviceTickets: databaseTickets,
  }
}

export async function syncServiceTicketsToDatabase(
  db: ServiceTicketDatabase,
  tickets: ServiceTicket[]
) {
  const ticketIds = tickets.map((ticket) => ticket.id)

  if (ticketIds.length === 0) {
    await db.serviceTicketRecord.deleteMany({})
    return
  }

  await db.serviceTicketRecord.deleteMany({
    where: {
      id: {
        notIn: ticketIds,
      },
    },
  })

  for (const ticket of tickets) {
    await db.serviceTicketRecord.upsert({
      where: { id: ticket.id },
      update: {
        title: ticket.title,
        description: ticket.description,
        requesterId: ticket.requesterId,
        requesterName: ticket.requesterName,
        requesterSector: ticket.requesterSector,
        targetSector: ticket.targetSector,
        priority: ticket.priority,
        status: ticket.status,
        createdAt: toDate(ticket.createdAt),
        updatedAt: toDate(ticket.updatedAt),
        lastInteractionAt: toDate(ticket.lastInteractionAt),
        assignedToId: ticket.assignedToId ?? null,
        assignedToName: ticket.assignedToName ?? null,
        assignedToSector: ticket.assignedToSector ?? null,
        closedAt: ticket.closedAt ? toDate(ticket.closedAt) : null,
        closedById: ticket.closedById ?? null,
        closedByName: ticket.closedByName ?? null,
        closeDescription: ticket.closeDescription ?? null,
        reopenedAt: ticket.reopenedAt ? toDate(ticket.reopenedAt) : null,
        reopenedById: ticket.reopenedById ?? null,
        reopenedByName: ticket.reopenedByName ?? null,
        reopenReason: ticket.reopenReason ?? null,
      },
      create: {
        id: ticket.id,
        title: ticket.title,
        description: ticket.description,
        requesterId: ticket.requesterId,
        requesterName: ticket.requesterName,
        requesterSector: ticket.requesterSector,
        targetSector: ticket.targetSector,
        priority: ticket.priority,
        status: ticket.status,
        createdAt: toDate(ticket.createdAt),
        updatedAt: toDate(ticket.updatedAt),
        lastInteractionAt: toDate(ticket.lastInteractionAt),
        assignedToId: ticket.assignedToId ?? null,
        assignedToName: ticket.assignedToName ?? null,
        assignedToSector: ticket.assignedToSector ?? null,
        closedAt: ticket.closedAt ? toDate(ticket.closedAt) : null,
        closedById: ticket.closedById ?? null,
        closedByName: ticket.closedByName ?? null,
        closeDescription: ticket.closeDescription ?? null,
        reopenedAt: ticket.reopenedAt ? toDate(ticket.reopenedAt) : null,
        reopenedById: ticket.reopenedById ?? null,
        reopenedByName: ticket.reopenedByName ?? null,
        reopenReason: ticket.reopenReason ?? null,
      },
    })

    await db.serviceTicketAttachmentRecord.deleteMany({
      where: { ticketId: ticket.id },
    })
    await db.serviceTicketTransferRecord.deleteMany({
      where: { ticketId: ticket.id },
    })
    await db.serviceTicketMessageRecord.deleteMany({
      where: { ticketId: ticket.id },
    })

    if (ticket.messages.length > 0) {
      await db.serviceTicketMessageRecord.createMany({
        data: ticket.messages.map((message) => ({
          id: message.id,
          ticketId: ticket.id,
          authorId: message.authorId,
          authorName: message.authorName,
          authorSector: message.authorSector,
          content: message.content,
          createdAt: toDate(message.createdAt),
          isSystem: Boolean(message.isSystem),
          isInternal: Boolean(message.isInternal),
        })),
      })
    }

    const attachmentRecords = [
      ...ticket.attachments.map((attachment) =>
        normalizeTicketAttachment(attachment, ticket.id)
      ),
      ...ticket.messages.flatMap((message) =>
        (message.attachments ?? []).map((attachment) =>
          normalizeTicketAttachment(attachment, ticket.id, message.id)
        )
      ),
    ]

    if (attachmentRecords.length > 0) {
      await db.serviceTicketAttachmentRecord.createMany({
        data: attachmentRecords,
      })
    }

    if (ticket.transfers.length > 0) {
      await db.serviceTicketTransferRecord.createMany({
        data: ticket.transfers.map((transfer) => ({
          id: transfer.id,
          ticketId: ticket.id,
          createdAt: toDate(transfer.createdAt),
          fromSector: transfer.fromSector,
          toSector: transfer.toSector,
          transferredById: transfer.transferredById,
          transferredByName: transfer.transferredByName,
          assignedToId: transfer.assignedToId ?? null,
          assignedToName: transfer.assignedToName ?? null,
        })),
      })
    }
  }
}
