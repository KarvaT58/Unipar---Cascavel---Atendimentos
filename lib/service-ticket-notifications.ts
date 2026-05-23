import type {
  ServiceTicket,
  ServiceTicketMessage,
  ServiceTicketUser,
} from "@/lib/service-ticket-data"

export const SERVICE_TICKET_NOTIFICATION_EVENT =
  "service-ticket-notifications-updated"

const SERVICE_TICKET_NOTIFICATION_STORAGE_LIMIT = 800

type NotificationUser = Pick<ServiceTicketUser, "id" | "sector">

export type ServiceTicketNotificationSnapshot = {
  allKeys: Set<string>
  unreadKeys: Set<string>
  unreadByTicket: Record<string, number>
  keysByTicket: Record<string, string[]>
}

export function getServiceTicketNotificationSnapshot(
  tickets: ServiceTicket[],
  currentUser: NotificationUser,
  readKeys: Set<string>
): ServiceTicketNotificationSnapshot {
  const allKeys = new Set<string>()
  const unreadKeys = new Set<string>()
  const unreadByTicket: Record<string, number> = {}
  const keysByTicket: Record<string, string[]> = {}

  tickets.forEach((ticket) => {
    if (!canUserSeeTicketNotification(ticket, currentUser)) {
      return
    }

    ticket.messages.forEach((message) => {
      if (!canNotifyUserAboutMessage(ticket, message, currentUser)) {
        return
      }

      const key = getServiceTicketNotificationKey(ticket, message)

      allKeys.add(key)
      keysByTicket[ticket.id] = [...(keysByTicket[ticket.id] ?? []), key]

      if (!readKeys.has(key)) {
        unreadKeys.add(key)
        unreadByTicket[ticket.id] = (unreadByTicket[ticket.id] ?? 0) + 1
      }
    })
  })

  return {
    allKeys,
    unreadKeys,
    unreadByTicket,
    keysByTicket,
  }
}

export function getServiceTicketNotificationKey(
  ticket: ServiceTicket,
  message: ServiceTicketMessage
) {
  const kind = message.isSystem ? "action" : "message"

  return `service-ticket:${ticket.id}:${message.id}:${message.authorId}:${kind}`
}

export function getServiceTicketNotificationReadStorageKey(userId: string) {
  return `service-ticket-notifications-read:${userId}`
}

export function getServiceTicketNotificationSoundStorageKey(userId: string) {
  return `service-ticket-notifications-sounded:${userId}`
}

export function getServiceTicketNotificationPendingStorageKey(userId: string) {
  return `service-ticket-notifications-pending:${userId}`
}

export function readServiceTicketNotificationReadKeys(userId: string) {
  return readServiceTicketNotificationStoredKeys(
    getServiceTicketNotificationReadStorageKey(userId),
    userId
  )
}

export function readServiceTicketNotificationSoundKeys(userId: string) {
  return readServiceTicketNotificationStoredKeys(
    getServiceTicketNotificationSoundStorageKey(userId),
    userId
  )
}

export function readServiceTicketNotificationPendingKeys(userId: string) {
  return readServiceTicketNotificationStoredKeys(
    getServiceTicketNotificationPendingStorageKey(userId),
    userId
  )
}

export function writeServiceTicketNotificationSoundKeys(
  userId: string,
  soundKeys: Set<string>
) {
  writeServiceTicketNotificationStoredKeys(
    getServiceTicketNotificationSoundStorageKey(userId),
    userId,
    soundKeys
  )
}

export function writeServiceTicketNotificationPendingKeys(
  userId: string,
  pendingKeys: Set<string>
) {
  writeServiceTicketNotificationStoredKeys(
    getServiceTicketNotificationPendingStorageKey(userId),
    userId,
    pendingKeys
  )
}

function readServiceTicketNotificationStoredKeys(
  storageKey: string,
  userId: string
) {
  if (typeof window === "undefined" || !userId) {
    return new Set<string>()
  }

  try {
    const storedValue = window.localStorage.getItem(storageKey)
    const parsedValue = storedValue ? JSON.parse(storedValue) : []

    return new Set(Array.isArray(parsedValue) ? parsedValue : [])
  } catch {
    return new Set<string>()
  }
}

export function writeServiceTicketNotificationReadKeys(
  userId: string,
  readKeys: Set<string>
) {
  writeServiceTicketNotificationStoredKeys(
    getServiceTicketNotificationReadStorageKey(userId),
    userId,
    readKeys
  )
}

function writeServiceTicketNotificationStoredKeys(
  storageKey: string,
  userId: string,
  keys: Set<string>
) {
  if (typeof window === "undefined" || !userId) {
    return
  }

  try {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify(
        Array.from(keys).slice(-SERVICE_TICKET_NOTIFICATION_STORAGE_LIMIT)
      )
    )
  } catch {
    // A notificação visual continua funcionando mesmo se o storage for bloqueado.
  }
}

export function markServiceTicketNotificationKeysRead(
  userId: string,
  notificationKeys: Iterable<string>
) {
  const keys = Array.from(notificationKeys)

  if (keys.length === 0) {
    return false
  }

  const readKeys = readServiceTicketNotificationReadKeys(userId)
  const previousSize = readKeys.size

  keys.forEach((key) => readKeys.add(key))

  const addedReadKey = readKeys.size !== previousSize

  if (addedReadKey) {
    writeServiceTicketNotificationReadKeys(userId, readKeys)
  }
  const pendingKeys = readServiceTicketNotificationPendingKeys(userId)
  let removedPendingKey = false

  keys.forEach((key) => {
    if (pendingKeys.delete(key)) {
      removedPendingKey = true
    }
  })

  if (removedPendingKey) {
    writeServiceTicketNotificationPendingKeys(userId, pendingKeys)
  }

  if (addedReadKey || removedPendingKey) {
    notifyServiceTicketNotificationsChanged()
  }

  return addedReadKey || removedPendingKey
}

export function notifyServiceTicketNotificationsChanged() {
  if (typeof window === "undefined") {
    return
  }

  window.dispatchEvent(new Event(SERVICE_TICKET_NOTIFICATION_EVENT))
}

function canUserSeeTicketNotification(
  ticket: ServiceTicket,
  user: NotificationUser
) {
  if (ticket.requesterId === user.id) {
    return true
  }

  if (isTicketInSectorQueue(ticket)) {
    return ticket.targetSector === user.sector
  }

  return ticket.assignedToId === user.id
}

function canNotifyUserAboutMessage(
  ticket: ServiceTicket,
  message: ServiceTicketMessage,
  user: NotificationUser
) {
  if (message.authorId === user.id) {
    return false
  }

  if (message.isInternal && message.authorSector !== user.sector) {
    return false
  }

  if (ticket.requesterId === user.id) {
    return true
  }

  if (isTicketInSectorQueue(ticket)) {
    return ticket.targetSector === user.sector
  }

  return ticket.assignedToId === user.id
}

function isTicketInSectorQueue(ticket: ServiceTicket) {
  return ticket.status === "open" || !ticket.assignedToId
}
