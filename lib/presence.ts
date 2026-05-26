import type { UserChatStatus, UserWorkStatus } from "@/lib/admin-data"

export const PRESENCE_HEARTBEAT_MS = 15_000
export const PRESENCE_ONLINE_WINDOW_MS = 45_000
export const PRESENCE_STALE_CLIENT_MS = PRESENCE_ONLINE_WINDOW_MS + 15_000

export const USER_CHAT_STATUS_VALUES: UserChatStatus[] = [
  "online",
  "busy",
  "away",
  "offline",
]

export const USER_WORK_STATUS_VALUES: UserWorkStatus[] = [
  "available",
  "home-office",
  "meeting",
  "lunch",
  "support",
  "training",
  "external",
  "focus",
  "vacation",
]

export function isUserChatStatus(value: unknown): value is UserChatStatus {
  return (
    typeof value === "string" &&
    USER_CHAT_STATUS_VALUES.includes(value as UserChatStatus)
  )
}

export function isUserWorkStatus(value: unknown): value is UserWorkStatus {
  return (
    typeof value === "string" &&
    USER_WORK_STATUS_VALUES.includes(value as UserWorkStatus)
  )
}

export function normalizeUserChatStatus(
  value: unknown,
  fallback: UserChatStatus = "online"
): UserChatStatus {
  return isUserChatStatus(value) ? value : fallback
}

export function normalizeUserWorkStatus(
  value: unknown,
  fallback: UserWorkStatus = "available"
): UserWorkStatus {
  return isUserWorkStatus(value) ? value : fallback
}

export function isRecentPresence(
  lastSeenAt?: Date | string | null,
  referenceTime = Date.now()
) {
  if (!lastSeenAt) return false

  const seenAt =
    lastSeenAt instanceof Date ? lastSeenAt : new Date(String(lastSeenAt))
  const seenAtTime = seenAt.getTime()

  return (
    Number.isFinite(seenAtTime) &&
    referenceTime - seenAtTime <= PRESENCE_ONLINE_WINDOW_MS
  )
}

export function getDisplayChatStatus(
  chatStatus?: UserChatStatus | null,
  lastSeenAt?: Date | string | null,
  referenceTime = Date.now()
): UserChatStatus {
  const normalizedStatus = normalizeUserChatStatus(chatStatus, "offline")

  if (normalizedStatus === "offline") return "offline"

  return isRecentPresence(lastSeenAt, referenceTime)
    ? normalizedStatus
    : "offline"
}
