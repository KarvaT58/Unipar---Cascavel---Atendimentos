import type { UserChatStatus, UserWorkStatus } from "@/lib/admin-data"
import {
  getDisplayChatStatus,
  normalizeUserChatStatus,
  normalizeUserWorkStatus,
  PRESENCE_STALE_CLIENT_MS,
} from "@/lib/presence"
import { prisma } from "@/lib/prisma"

type PresenceClientState = "active" | "inactive"

type PresenceUpdate = {
  userId: string
  clientId?: string | null
  chatStatus?: UserChatStatus
  workStatus?: UserWorkStatus
  state?: PresenceClientState
  emit?: boolean
  source?: string
}

type PresenceRow = {
  chatStatus?: string | null
  preferredChatStatus?: string | null
  workStatus?: string | null
  lastSeenAt?: Date | string | null
} | null

export type UserPresenceSnapshot = {
  chatStatus: UserChatStatus
  workStatus: UserWorkStatus
  lastSeenAt?: Date
}

function getPresenceClientRecordId(userId: string, clientId: string) {
  return `${userId}:${clientId}`
}

function getStaleClientBoundary(referenceDate = new Date()) {
  return new Date(referenceDate.getTime() - PRESENCE_STALE_CLIENT_MS)
}

function toPresenceSnapshot(
  presence: PresenceRow,
  referenceTime = Date.now()
): UserPresenceSnapshot {
  const lastSeenAt = presence?.lastSeenAt
    ? new Date(presence.lastSeenAt)
    : undefined

  return {
    chatStatus: getDisplayChatStatus(
      normalizeUserChatStatus(presence?.chatStatus, "offline"),
      lastSeenAt,
      referenceTime
    ),
    workStatus: normalizeUserWorkStatus(presence?.workStatus, "available"),
    lastSeenAt,
  }
}

async function emitPresenceEvent(
  userId: string,
  clientId: string | null,
  source: string
) {
  await prisma.realtimeEvent
    .create({
      data: {
        clientId,
        source,
        payload: {
          key: "presence",
          userId,
        },
      },
    })
    .catch(() => undefined)
}

function hasPresenceDisplayChange(
  before: UserPresenceSnapshot,
  after: UserPresenceSnapshot
) {
  return (
    before.chatStatus !== after.chatStatus ||
    before.workStatus !== after.workStatus
  )
}

export async function getUserPresenceSnapshot(userId: string) {
  const presence = await prisma.userPresence.findUnique({
    where: { userId },
    select: {
      chatStatus: true,
      preferredChatStatus: true,
      workStatus: true,
      lastSeenAt: true,
    },
  })

  return toPresenceSnapshot(presence)
}

export function getHydratedPresenceSnapshot(presence: PresenceRow) {
  return toPresenceSnapshot(presence)
}

export async function updateUserPresence({
  userId,
  clientId,
  chatStatus,
  workStatus,
  state = "active",
  emit = true,
  source = "presence",
}: PresenceUpdate) {
  const now = new Date()
  const staleBefore = getStaleClientBoundary(now)
  const recordClientId = clientId?.trim() || null
  const clientRecordId = recordClientId
    ? getPresenceClientRecordId(userId, recordClientId)
    : null
  const previousPresence = await prisma.userPresence.findUnique({
    where: { userId },
    select: {
      chatStatus: true,
      preferredChatStatus: true,
      workStatus: true,
      lastSeenAt: true,
    },
  })
  const before = toPresenceSnapshot(previousPresence)
  const preferredChatStatus =
    chatStatus ??
    normalizeUserChatStatus(previousPresence?.preferredChatStatus, "online")
  const activeChatStatus = chatStatus ?? preferredChatStatus

  await prisma.$transaction(async (tx) => {
    await tx.userPresence.upsert({
      where: { userId },
      create: {
        userId,
        chatStatus: state === "active" ? activeChatStatus : "offline",
        preferredChatStatus,
        workStatus: workStatus ?? "available",
        lastSeenAt: now,
      },
      update: {
        ...(state === "active" ? { chatStatus: activeChatStatus } : {}),
        ...(chatStatus ? { preferredChatStatus: chatStatus } : {}),
        ...(workStatus ? { workStatus } : {}),
        lastSeenAt: now,
      },
    })

    await tx.userPresenceClient.updateMany({
      where: {
        userId,
        isActive: true,
        lastSeenAt: { lt: staleBefore },
      },
      data: {
        isActive: false,
      },
    })

    if (clientRecordId && recordClientId) {
      await tx.userPresenceClient.upsert({
        where: { id: clientRecordId },
        create: {
          id: clientRecordId,
          userId,
          clientId: recordClientId,
          isActive: state === "active",
          lastSeenAt: now,
        },
        update: {
          isActive: state === "active",
          lastSeenAt: now,
        },
      })
    }

    if (state === "inactive") {
      if (!clientRecordId) {
        await tx.userPresenceClient.updateMany({
          where: { userId, isActive: true },
          data: { isActive: false },
        })
      }

      const activeClientCount = await tx.userPresenceClient.count({
        where: {
          userId,
          isActive: true,
          lastSeenAt: { gte: staleBefore },
        },
      })

      if (activeClientCount === 0) {
        await tx.userPresence.update({
          where: { userId },
          data: {
            chatStatus: "offline",
            lastSeenAt: now,
          },
        })
      }
    }
  })

  const nextPresence = await prisma.userPresence.findUnique({
    where: { userId },
    select: {
      chatStatus: true,
      preferredChatStatus: true,
      workStatus: true,
      lastSeenAt: true,
    },
  })
  const after = toPresenceSnapshot(nextPresence)

  if (emit && hasPresenceDisplayChange(before, after)) {
    await emitPresenceEvent(userId, recordClientId, source)
  }

  return after
}

export async function forceUserOnline(userId: string) {
  return updateUserPresence({
    userId,
    state: "active",
    source: "presence:login",
  })
}

export async function markUserOffline(userId: string, clientId?: string | null) {
  return updateUserPresence({
    userId,
    clientId,
    state: "inactive",
    source: "presence:logout",
  })
}
