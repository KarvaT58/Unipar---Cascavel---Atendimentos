"use client"

import * as React from "react"
import { usePathname } from "next/navigation"

import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import { TeamSwitcher, UniparLogo } from "@/components/team-switcher"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "@/components/ui/sidebar"
import {
  CalendarRangeIcon,
  CircleHelpIcon,
  HandshakeIcon,
  HeadsetIcon,
  LayoutDashboardIcon,
  MessagesSquareIcon,
  PhoneCallIcon,
  ShieldUserIcon,
  SquareKanbanIcon,
  UserPlusIcon,
  UsersIcon,
  UsersRoundIcon,
} from "lucide-react"
import { fetchBackendState } from "@/lib/backend-client"
import type { Sector } from "@/lib/admin-data"
import type { AppState } from "@/lib/app-state"
import {
  isGroupMessageReadByUser,
  isMessageHiddenForUser,
  type Message,
} from "@/lib/chat-data"
import {
  LOAN_NOTIFICATION_EVENT,
  getLoanNotificationSnapshot,
  readLoanNotificationReadKeys,
  readLoanNotificationSoundKeys,
  writeLoanNotificationPendingKeys,
  writeLoanNotificationSoundKeys,
} from "@/lib/loan-notifications"
import {
  SERVICE_TICKET_NOTIFICATION_EVENT,
  getServiceTicketNotificationSnapshot,
  readServiceTicketNotificationReadKeys,
  readServiceTicketNotificationSoundKeys,
  writeServiceTicketNotificationPendingKeys,
  writeServiceTicketNotificationSoundKeys,
} from "@/lib/service-ticket-notifications"

const SERVICE_TICKET_NOTIFICATION_SOUND_SRC = "/audio/notificacao.mp3"
const SERVICE_TICKET_NOTIFICATION_FALLBACK_REFRESH_MS = 60000
const DIRECT_CONVERSATION_PREFIX = "dm:"
const APPLICATION_TITLE = "Unipar - Cascavel Atendimentos"
const BROWSER_NOTIFICATION_ICON = "/logo.png"
const CHAT_NOTIFICATION_SOUND_STORAGE_LIMIT = 500
const workspaceNotificationPaths = new Set([
  "/ajuda",
  "/anuncios-eventos",
  "/atendimentos",
  "/chat-interno",
  "/emprestimos",
  "/grupos",
  "/kanban",
  "/ramais",
])

function normalizePathname(pathname: string | null) {
  if (!pathname) return "/"

  const normalizedPathname = pathname.replace(/\/+$/, "")

  return normalizedPathname || "/"
}

function getSidebarChatNotificationSoundStorageKey(userId: string) {
  return `sidebar-chat-notification-sound-seen:${userId}`
}

function readSidebarChatNotificationSoundKeys(userId: string) {
  try {
    const storedValue = window.localStorage.getItem(
      getSidebarChatNotificationSoundStorageKey(userId)
    )

    if (!storedValue) return new Set<string>()

    const parsedValue = JSON.parse(storedValue)

    if (!Array.isArray(parsedValue)) return new Set<string>()

    return new Set(
      parsedValue.filter((key): key is string => typeof key === "string")
    )
  } catch {
    return new Set<string>()
  }
}

function writeSidebarChatNotificationSoundKeys(
  userId: string,
  keys: Iterable<string>
) {
  try {
    window.localStorage.setItem(
      getSidebarChatNotificationSoundStorageKey(userId),
      JSON.stringify(Array.from(keys).slice(-CHAT_NOTIFICATION_SOUND_STORAGE_LIMIT))
    )
  } catch {
    // O som continua funcionando mesmo se o navegador bloquear storage.
  }
}

function canUseNativeBrowserNotifications() {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    "Notification" in window
  )
}

function getRealtimePayloadKey(event: Event) {
  try {
    const realtimeEvent = JSON.parse((event as MessageEvent).data) as {
      payload?: { key?: unknown }
    }
    const key = realtimeEvent.payload?.key

    return typeof key === "string" ? key : undefined
  } catch {
    return undefined
  }
}

const data = {
  teams: [
    {
      name: "Unipar - Cascavel",
      logo: <UniparLogo />,
      plan: "Atendimentos",
    },
  ],
  navMain: [
    {
      title: "Dashboard",
      url: "/dashboard",
      icon: <LayoutDashboardIcon />,
    },
    {
      title: "Atendimentos",
      url: "/atendimentos",
      icon: <HeadsetIcon />,
    },
    {
      title: "Chat Interno",
      url: "/chat-interno",
      icon: <MessagesSquareIcon />,
    },
    {
      title: "Grupos",
      url: "/grupos",
      icon: <UsersIcon />,
    },
    {
      title: "Equipe",
      url: "/equipe",
      icon: <UsersRoundIcon />,
    },
    {
      title: "Anúncios/Eventos",
      url: "/anuncios-eventos",
      icon: <CalendarRangeIcon />,
    },
    {
      title: "Empréstimos",
      url: "/emprestimos",
      icon: <HandshakeIcon />,
    },
    {
      title: "Kanban",
      url: "/kanban",
      icon: <SquareKanbanIcon />,
    },
  ],
  navFooter: [
    {
      title: "Ajuda",
      url: "/ajuda",
      icon: <CircleHelpIcon />,
    },
    {
      title: "Ramais",
      url: "/ramais",
      icon: <PhoneCallIcon />,
    },
    {
      title: "Criação de usuários",
      url: "/criacao-usuarios",
      icon: <UserPlusIcon />,
      separatorBefore: true,
    },
    {
      title: "Administração",
      url: "/administracao",
      icon: <ShieldUserIcon />,
    },
  ],
}

type AppSidebarUser = {
  id: string
  name: string
  email: string
  avatar: string
  notificationSector: Sector
  sectorCode: string
  sectorName: string
  isAdmin: boolean
}

type SidebarUserProfile = Pick<AppSidebarUser, "name" | "email" | "avatar">

export function AppSidebar({
  user,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  user: AppSidebarUser
}) {
  const [pendingAccessRequests, setPendingAccessRequests] = React.useState(0)
  const [serviceTicketNotificationCount, setServiceTicketNotificationCount] =
    React.useState(0)
  const [loanNotificationCount, setLoanNotificationCount] = React.useState(0)
  const [chatNotificationCount, setChatNotificationCount] = React.useState(0)
  const [groupNotificationCount, setGroupNotificationCount] = React.useState(0)
  const [sidebarUserProfile, setSidebarUserProfile] =
    React.useState<SidebarUserProfile>(() => ({
      name: user.name,
      email: user.email,
      avatar: user.avatar,
    }))
  const latestAppStateRef = React.useRef<AppState | null>(null)
  const serviceTicketNotificationBaselineUserIdRef = React.useRef("")
  const loanNotificationBaselineUserIdRef = React.useRef("")
  const chatNotificationSoundBaselineUserIdRef = React.useRef("")
  const serviceTicketNotificationCountRef = React.useRef(0)
  const loanNotificationCountRef = React.useRef(0)
  const chatNotificationCountsRef = React.useRef({ chat: 0, groups: 0 })
  const serviceTicketUnreadKeysRef = React.useRef<Set<string>>(new Set())
  const loanUnreadKeysRef = React.useRef<Set<string>>(new Set())
  const chatNotificationSoundKeysRef = React.useRef<Set<string>>(new Set())
  const serviceTicketNotificationRefreshIdRef = React.useRef(0)
  const notificationAudioRef = React.useRef<HTMLAudioElement | null>(null)
  const pendingNotificationSoundRef = React.useRef(false)
  const notificationAudioUnlockedRef = React.useRef(false)
  const nativeNotificationPermissionRequestedRef = React.useRef(false)
  const pathname = usePathname()
  const isWorkspaceNotificationPath = React.useMemo(
    () => workspaceNotificationPaths.has(normalizePathname(pathname)),
    [pathname]
  )
  const currentNotificationUser = React.useMemo(
    () =>
      user.id
        ? {
            id: user.id,
            sector: user.notificationSector,
          }
        : null,
    [user.id, user.notificationSector]
  )
  const displayedUser = React.useMemo(
    () => ({
      ...user,
      ...sidebarUserProfile,
    }),
    [sidebarUserProfile, user]
  )

  React.useEffect(() => {
    if (!user.isAdmin) {
      return
    }

    const eventSource = new EventSource("/api/access-requests/stream")

    eventSource.addEventListener("requests", (event) => {
      const payload = parseAccessRequestStreamPayload(event.data)

      if (payload) {
        setPendingAccessRequests(payload.requests.length)
      }
    })

    return () => {
      eventSource.close()
    }
  }, [user.isAdmin])

  React.useEffect(() => {
    notificationAudioRef.current = new Audio(SERVICE_TICKET_NOTIFICATION_SOUND_SRC)
    notificationAudioRef.current.preload = "auto"

    return () => {
      notificationAudioRef.current = null
    }
  }, [])

  const commitServiceTicketNotificationCount = React.useCallback(
    (count: number) => {
      if (serviceTicketNotificationCountRef.current === count) {
        return
      }

      serviceTicketNotificationCountRef.current = count
      setServiceTicketNotificationCount(count)
    },
    []
  )

  const clearServiceTicketNotificationCount = React.useCallback(() => {
    serviceTicketUnreadKeysRef.current = new Set()
    commitServiceTicketNotificationCount(0)
  }, [commitServiceTicketNotificationCount])

  const commitLoanNotificationCount = React.useCallback((count: number) => {
    if (loanNotificationCountRef.current === count) {
      return
    }

    loanNotificationCountRef.current = count
    setLoanNotificationCount(count)
  }, [])

  const clearLoanNotificationCount = React.useCallback(() => {
    loanUnreadKeysRef.current = new Set()
    commitLoanNotificationCount(0)
  }, [commitLoanNotificationCount])

  const commitChatNotificationCounts = React.useCallback(
    (counts: { chat: number; groups: number }) => {
      if (
        chatNotificationCountsRef.current.chat === counts.chat &&
        chatNotificationCountsRef.current.groups === counts.groups
      ) {
        return
      }

      chatNotificationCountsRef.current = counts
      setChatNotificationCount(counts.chat)
      setGroupNotificationCount(counts.groups)
    },
    []
  )

  const clearChatNotificationCounts = React.useCallback(() => {
    commitChatNotificationCounts({ chat: 0, groups: 0 })
  }, [commitChatNotificationCounts])

  React.useEffect(() => {
    const totalNotificationCount =
      serviceTicketNotificationCount +
      loanNotificationCount +
      chatNotificationCount +
      groupNotificationCount +
      (user.isAdmin ? pendingAccessRequests : 0)

    document.title =
      totalNotificationCount > 0
        ? `(${totalNotificationCount}) ${APPLICATION_TITLE}`
        : APPLICATION_TITLE

    return () => {
      document.title = APPLICATION_TITLE
    }
  }, [
    chatNotificationCount,
    groupNotificationCount,
    loanNotificationCount,
    pendingAccessRequests,
    serviceTicketNotificationCount,
    user.isAdmin,
  ])

  const requestNativeNotificationPermission = React.useCallback(() => {
    if (
      nativeNotificationPermissionRequestedRef.current ||
      !canUseNativeBrowserNotifications() ||
      Notification.permission !== "default"
    ) {
      return
    }

    nativeNotificationPermissionRequestedRef.current = true
    void Notification.requestPermission()
  }, [])

  const showNativeBrowserNotification = React.useCallback(
    (title: string, body: string) => {
      if (
        !canUseNativeBrowserNotifications() ||
        Notification.permission !== "granted" ||
        (document.visibilityState === "visible" && document.hasFocus())
      ) {
        return
      }

      const notification = new Notification(title, {
        body,
        icon: BROWSER_NOTIFICATION_ICON,
        badge: BROWSER_NOTIFICATION_ICON,
        tag: "unipar-atendimentos-notificacoes",
      })

      notification.onclick = () => {
        window.focus()
        notification.close()
      }
    },
    []
  )

  const playServiceTicketNotificationSound = React.useCallback(() => {
    const audio = notificationAudioRef.current

    if (!audio) {
      pendingNotificationSoundRef.current = true
      return
    }

    audio.currentTime = 0
    void audio.play().catch(() => {
      pendingNotificationSoundRef.current = true
    })
  }, [])

  const unlockNotificationSound = React.useCallback(() => {
    const audio = notificationAudioRef.current

    if (!audio || notificationAudioUnlockedRef.current) return

    const previousMuted = audio.muted

    audio.muted = true
    audio.currentTime = 0

    void audio
      .play()
      .then(() => {
        audio.pause()
        audio.currentTime = 0
        audio.muted = previousMuted
        notificationAudioUnlockedRef.current = true
      })
      .catch(() => {
        audio.muted = previousMuted
      })
  }, [])

  const flushPendingNotificationSound = React.useCallback(() => {
    if (!pendingNotificationSoundRef.current) {
      return
    }

    pendingNotificationSoundRef.current = false
    playServiceTicketNotificationSound()
  }, [playServiceTicketNotificationSound])

  const handleNotificationAudioGesture = React.useCallback(() => {
    requestNativeNotificationPermission()

    if (pendingNotificationSoundRef.current) {
      flushPendingNotificationSound()
      return
    }

    unlockNotificationSound()
  }, [
    flushPendingNotificationSound,
    requestNativeNotificationPermission,
    unlockNotificationSound,
  ])

  React.useEffect(() => {
    window.addEventListener("pointerdown", handleNotificationAudioGesture)
    window.addEventListener("keydown", handleNotificationAudioGesture)

    return () => {
      window.removeEventListener("pointerdown", handleNotificationAudioGesture)
      window.removeEventListener("keydown", handleNotificationAudioGesture)
    }
  }, [handleNotificationAudioGesture])

  const refreshServiceTicketNotifications = React.useCallback(
    async (options?: { playSound?: boolean; fetchState?: boolean }) => {
      const refreshId = serviceTicketNotificationRefreshIdRef.current + 1
      serviceTicketNotificationRefreshIdRef.current = refreshId
      const shouldFetchState = options?.fetchState ?? true
      const shouldPlaySound = options?.playSound ?? false

      try {
        if (!currentNotificationUser) {
          serviceTicketNotificationBaselineUserIdRef.current = ""
          loanNotificationBaselineUserIdRef.current = ""
          chatNotificationSoundBaselineUserIdRef.current = ""
          chatNotificationSoundKeysRef.current = new Set()
          clearServiceTicketNotificationCount()
          clearLoanNotificationCount()
          clearChatNotificationCounts()
          return
        }

        if (shouldFetchState || !latestAppStateRef.current) {
          const envelope = await fetchBackendState()

          if (refreshId !== serviceTicketNotificationRefreshIdRef.current) {
            return
          }

          latestAppStateRef.current = envelope.state
        }

        const state = latestAppStateRef.current

        if (!state) {
          return
        }

        setSidebarUserProfile(
          getSidebarUserProfile(state, user)
        )
        const chatNotificationSnapshot = getSidebarChatNotificationSnapshot(
          state,
          currentNotificationUser.id
        )
        commitChatNotificationCounts(chatNotificationSnapshot.counts)

        const readKeys = readServiceTicketNotificationReadKeys(
          currentNotificationUser.id
        )
        const snapshot = getServiceTicketNotificationSnapshot(
          state.serviceTickets,
          currentNotificationUser,
          readKeys
        )
        const loanReadKeys = readLoanNotificationReadKeys(
          currentNotificationUser.id
        )
        const loanSnapshot = getLoanNotificationSnapshot(
          state.loanRequests,
          currentNotificationUser,
          loanReadKeys
        )
        const isNewNotificationUser =
          serviceTicketNotificationBaselineUserIdRef.current !==
          currentNotificationUser.id
        const isNewLoanNotificationUser =
          loanNotificationBaselineUserIdRef.current !== currentNotificationUser.id
        const isNewChatNotificationUser =
          chatNotificationSoundBaselineUserIdRef.current !==
          currentNotificationUser.id

        if (isNewNotificationUser) {
          serviceTicketNotificationBaselineUserIdRef.current =
            currentNotificationUser.id
          serviceTicketUnreadKeysRef.current = new Set(snapshot.unreadKeys)
          commitServiceTicketNotificationCount(
            serviceTicketUnreadKeysRef.current.size
          )
          writeServiceTicketNotificationPendingKeys(
            currentNotificationUser.id,
            serviceTicketUnreadKeysRef.current
          )
          writeServiceTicketNotificationSoundKeys(
            currentNotificationUser.id,
            new Set([
              ...readServiceTicketNotificationSoundKeys(
                currentNotificationUser.id
              ),
              ...snapshot.allKeys,
            ])
          )
        }

        if (isNewChatNotificationUser) {
          chatNotificationSoundBaselineUserIdRef.current =
            currentNotificationUser.id
          chatNotificationSoundKeysRef.current = new Set([
            ...readSidebarChatNotificationSoundKeys(currentNotificationUser.id),
            ...chatNotificationSnapshot.allKeys,
          ])
          writeSidebarChatNotificationSoundKeys(
            currentNotificationUser.id,
            chatNotificationSoundKeysRef.current
          )
        }

        if (isNewLoanNotificationUser) {
          loanNotificationBaselineUserIdRef.current = currentNotificationUser.id
          loanUnreadKeysRef.current = new Set(loanSnapshot.unreadKeys)
          commitLoanNotificationCount(loanUnreadKeysRef.current.size)
          writeLoanNotificationPendingKeys(
            currentNotificationUser.id,
            loanUnreadKeysRef.current
          )
          writeLoanNotificationSoundKeys(
            currentNotificationUser.id,
            new Set([
              ...readLoanNotificationSoundKeys(currentNotificationUser.id),
              ...loanSnapshot.allKeys,
            ])
          )
        }

        if (
          isNewNotificationUser ||
          isNewLoanNotificationUser ||
          isNewChatNotificationUser
        ) {
          return
        }

        const stableUnreadKeys = new Set(snapshot.unreadKeys)
        const soundKeys = readServiceTicketNotificationSoundKeys(
          currentNotificationUser.id
        )
        const newUnreadKeys = Array.from(snapshot.unreadKeys).filter(
          (key) => !soundKeys.has(key)
        )

        serviceTicketUnreadKeysRef.current = stableUnreadKeys
        commitServiceTicketNotificationCount(stableUnreadKeys.size)
        writeServiceTicketNotificationPendingKeys(
          currentNotificationUser.id,
          stableUnreadKeys
        )

        const knownKeys = new Set([...soundKeys, ...snapshot.allKeys])
        writeServiceTicketNotificationSoundKeys(
          currentNotificationUser.id,
          knownKeys
        )

        const stableLoanUnreadKeys = new Set(loanSnapshot.unreadKeys)
        const loanSoundKeys = readLoanNotificationSoundKeys(
          currentNotificationUser.id
        )
        const newLoanUnreadKeys = Array.from(loanSnapshot.unreadKeys).filter(
          (key) => !loanSoundKeys.has(key)
        )

        loanUnreadKeysRef.current = stableLoanUnreadKeys
        commitLoanNotificationCount(stableLoanUnreadKeys.size)
        writeLoanNotificationPendingKeys(
          currentNotificationUser.id,
          stableLoanUnreadKeys
        )

        writeLoanNotificationSoundKeys(
          currentNotificationUser.id,
          new Set([...loanSoundKeys, ...loanSnapshot.allKeys])
        )

        const knownChatSoundKeys = chatNotificationSoundKeysRef.current
        const newChatAudibleKeys = Array.from(
          chatNotificationSnapshot.audibleKeys
        ).filter((key) => !knownChatSoundKeys.has(key))
        const newDirectMessageKeys = newChatAudibleKeys.filter((key) =>
          key.startsWith("chat:")
        )
        const newGroupMessageKeys = newChatAudibleKeys.filter((key) =>
          key.startsWith("group:")
        )

        chatNotificationSoundKeysRef.current = new Set([
          ...knownChatSoundKeys,
          ...chatNotificationSnapshot.allKeys,
        ])
        writeSidebarChatNotificationSoundKeys(
          currentNotificationUser.id,
          chatNotificationSoundKeysRef.current
        )

        const shouldNotifyServiceOrLoan =
          shouldPlaySound &&
          (newUnreadKeys.length > 0 || newLoanUnreadKeys.length > 0)
        const browserNotificationBody = getSidebarBrowserNotificationBody({
          serviceTickets: shouldNotifyServiceOrLoan ? newUnreadKeys.length : 0,
          loans: shouldNotifyServiceOrLoan ? newLoanUnreadKeys.length : 0,
          directMessages: newDirectMessageKeys.length,
          groupMessages: newGroupMessageKeys.length,
        })

        if (browserNotificationBody) {
          showNativeBrowserNotification(
            "Nova notificação no sistema",
            browserNotificationBody
          )
        }

        if (
          shouldNotifyServiceOrLoan ||
          (!isWorkspaceNotificationPath && newChatAudibleKeys.length > 0)
        ) {
          playServiceTicketNotificationSound()
        }
      } catch {
        // Mantem o ultimo contador estavel se o refresh do realtime falhar.
      }
    },
    [
      clearChatNotificationCounts,
      clearLoanNotificationCount,
      clearServiceTicketNotificationCount,
      commitChatNotificationCounts,
      commitLoanNotificationCount,
      commitServiceTicketNotificationCount,
      currentNotificationUser,
      isWorkspaceNotificationPath,
      playServiceTicketNotificationSound,
      showNativeBrowserNotification,
      user,
    ]
  )

  React.useEffect(() => {
    const initialRefreshId = window.setTimeout(() => {
      void refreshServiceTicketNotifications()
    }, 0)
    const fallbackRefreshId = window.setInterval(() => {
      void refreshServiceTicketNotifications({ fetchState: true })
    }, SERVICE_TICKET_NOTIFICATION_FALLBACK_REFRESH_MS)

    const eventSource = new EventSource("/api/realtime?lastEventId=latest")

    eventSource.addEventListener("state", (event) => {
      const payloadKey = getRealtimePayloadKey(event)

      if (payloadKey && payloadKey !== "main") return

      void refreshServiceTicketNotifications({
        fetchState: true,
        playSound: true,
      })
    })

    const handleNotificationsChanged = () => {
      void refreshServiceTicketNotifications({ fetchState: false })
    }

    const handleStorage = (event: StorageEvent) => {
      if (
        event.key?.startsWith("service-ticket-notifications-read:") ||
        event.key?.startsWith("loan-notifications-read:")
      ) {
        void refreshServiceTicketNotifications({ fetchState: false })
      }
    }
    const handleVisibilityRefresh = () => {
      if (document.visibilityState === "visible") {
        void refreshServiceTicketNotifications({ fetchState: true })
      }
    }
    const handleFocusRefresh = () => {
      void refreshServiceTicketNotifications({ fetchState: true })
    }

    window.addEventListener(
      SERVICE_TICKET_NOTIFICATION_EVENT,
      handleNotificationsChanged
    )
    window.addEventListener(LOAN_NOTIFICATION_EVENT, handleNotificationsChanged)
    window.addEventListener("storage", handleStorage)
    document.addEventListener("visibilitychange", handleVisibilityRefresh)
    window.addEventListener("focus", handleFocusRefresh)

    return () => {
      window.clearTimeout(initialRefreshId)
      window.clearInterval(fallbackRefreshId)
      eventSource.close()
      window.removeEventListener(
        SERVICE_TICKET_NOTIFICATION_EVENT,
        handleNotificationsChanged
      )
      window.removeEventListener(
        LOAN_NOTIFICATION_EVENT,
        handleNotificationsChanged
      )
      window.removeEventListener("storage", handleStorage)
      document.removeEventListener("visibilitychange", handleVisibilityRefresh)
      window.removeEventListener("focus", handleFocusRefresh)
    }
  }, [refreshServiceTicketNotifications])

  const footerItems = React.useMemo(() => {
    const items = user.isAdmin
      ? data.navFooter
      : data.navFooter.filter(
          (item) =>
            item.url !== "/criacao-usuarios" && item.url !== "/administracao"
        )

    return items.map((item) =>
      item.url === "/criacao-usuarios"
        ? {
            ...item,
            badgeCount:
              pendingAccessRequests > 0 ? pendingAccessRequests : undefined,
          }
        : item
    )
  }, [pendingAccessRequests, user.isAdmin])

  const mainItems = React.useMemo(
    () =>
      data.navMain.map((item) =>
        item.url === "/atendimentos" && serviceTicketNotificationCount > 0
          ? {
              ...item,
              badgeCount: serviceTicketNotificationCount,
              badgeLabel: `${serviceTicketNotificationCount} ${
                serviceTicketNotificationCount === 1
                  ? "notificação"
                  : "notificações"
              } de atendimento`,
            }
          : item.url === "/emprestimos" && loanNotificationCount > 0
            ? {
                ...item,
                badgeCount: loanNotificationCount,
                badgeLabel: `${loanNotificationCount} ${
                  loanNotificationCount === 1
                    ? "notificação"
                    : "notificações"
                } de empréstimos`,
              }
          : item
      ),
    [loanNotificationCount, serviceTicketNotificationCount]
  )

  const sidebarMainItems = React.useMemo(
    () =>
      mainItems.map((item) => {
        if (item.url === "/chat-interno" && chatNotificationCount > 0) {
          return {
            ...item,
            badgeCount: chatNotificationCount,
            badgeLabel: `${chatNotificationCount} ${
              chatNotificationCount === 1 ? "mensagem" : "mensagens"
            } no chat interno`,
          }
        }

        if (item.url === "/grupos" && groupNotificationCount > 0) {
          return {
            ...item,
            badgeCount: groupNotificationCount,
            badgeLabel: `${groupNotificationCount} ${
              groupNotificationCount === 1 ? "mensagem" : "mensagens"
            } em grupos`,
          }
        }

        return item
      }),
    [chatNotificationCount, groupNotificationCount, mainItems]
  )

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:pt-2">
        <TeamSwitcher teams={data.teams} />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={sidebarMainItems} />
      </SidebarContent>
      <SidebarFooter>
        <NavMain className="p-0" items={footerItems} />
        <NavUser user={displayedUser} />
      </SidebarFooter>
    </Sidebar>
  )
}

function parseAccessRequestStreamPayload(value: string) {
  try {
    const payload = JSON.parse(value) as {
      requests?: Array<{ id: string }>
    }

    if (!Array.isArray(payload.requests)) {
      return null
    }

    return { requests: payload.requests }
  } catch {
    return null
  }
}

function getSidebarBrowserNotificationBody({
  serviceTickets,
  loans,
  directMessages,
  groupMessages,
}: {
  serviceTickets: number
  loans: number
  directMessages: number
  groupMessages: number
}) {
  const items: string[] = []

  if (serviceTickets > 0) {
    items.push(
      `${serviceTickets} ${
        serviceTickets === 1 ? "nova notificação" : "novas notificações"
      } em Atendimentos`
    )
  }

  if (loans > 0) {
    items.push(
      `${loans} ${
        loans === 1 ? "nova notificação" : "novas notificações"
      } em Empréstimos`
    )
  }

  if (directMessages > 0) {
    items.push(
      `${directMessages} ${
        directMessages === 1 ? "nova mensagem" : "novas mensagens"
      } no Chat Interno`
    )
  }

  if (groupMessages > 0) {
    items.push(
      `${groupMessages} ${
        groupMessages === 1 ? "nova mensagem" : "novas mensagens"
      } em Grupos`
    )
  }

  return items.join(" • ")
}

function getSidebarChatNotificationSnapshot(state: AppState, userId: string) {
  const emptySnapshot = {
    counts: { chat: 0, groups: 0 },
    allKeys: new Set<string>(),
    audibleKeys: new Set<string>(),
  }

  if (!userId) return emptySnapshot

  const directMessageIds = new Set<string>()
  const counts = { chat: 0, groups: 0 }
  const allKeys = new Set<string>()
  const audibleKeys = new Set<string>()

  Object.entries(state.messagesByContact).forEach(
    ([conversationId, messages]) => {
      const directParticipants = parseDirectConversationKey(conversationId)
      const isCurrentUserInbox = conversationId === userId
      const canContainIncomingDirectMessage =
        isCurrentUserInbox ||
        Boolean(directParticipants?.includes(userId))

      if (!canContainIncomingDirectMessage) return

      messages.forEach((message) => {
        if (!shouldCountIncomingDirectMessage(message, userId)) return
        if (directMessageIds.has(message.id)) return

        const contactId = getSidebarDirectNotificationContactId(
          conversationId,
          message,
          userId
        )
        const notificationKey = getSidebarChatNotificationKey(
          "chat",
          contactId ?? conversationId,
          message
        )

        directMessageIds.add(message.id)
        counts.chat += 1
        allKeys.add(notificationKey)

        if (
          contactId &&
          !isSidebarConversationMuted(state, userId, contactId)
        ) {
          audibleKeys.add(notificationKey)
        }
      })
    }
  )

  Object.entries(state.groupMessagesByContact).forEach(([groupId, messages]) => {
    if (!canUserSeeSidebarGroup(groupId, userId, state)) return

    messages.forEach((message) => {
      if (shouldCountIncomingGroupMessage(message, userId)) {
        const notificationKey = getSidebarChatNotificationKey(
          "group",
          groupId,
          message
        )

        counts.groups += 1
        allKeys.add(notificationKey)

        if (!isSidebarConversationMuted(state, userId, groupId)) {
          audibleKeys.add(notificationKey)
        }
      }
    })
  })

  return { counts, allKeys, audibleKeys }
}

function getSidebarChatNotificationKey(
  scope: "chat" | "group",
  conversationId: string,
  message: Message
) {
  return `${scope}:${conversationId}:${message.id}:${message.senderId ?? "unknown"}`
}

function getSidebarDirectNotificationContactId(
  conversationId: string,
  message: Message,
  userId: string
) {
  if (message.senderId && message.senderId !== userId) return message.senderId

  const directParticipants = parseDirectConversationKey(conversationId)

  if (directParticipants) {
    const [firstUserId, secondUserId] = directParticipants

    if (firstUserId === userId) return secondUserId
    if (secondUserId === userId) return firstUserId
  }

  if (conversationId !== userId) return conversationId

  return null
}

function isSidebarConversationMuted(
  state: AppState,
  userId: string,
  conversationId: string
) {
  const conversation = [
    ...state.contacts,
    ...state.archivedContacts,
    ...state.groups,
    ...state.archivedGroups,
  ].find((contact) => contact.id === conversationId)
  const userPreference =
    conversation?.conversationPreferencesByUserId?.[userId]

  return userPreference?.isMuted ?? conversation?.isMuted ?? false
}

function getSidebarUserProfile(
  state: AppState,
  user: AppSidebarUser
): SidebarUserProfile {
  const stateUser = state.adminUsers.find(
    (currentUser) =>
      currentUser.id === user.id ||
      currentUser.email.toLowerCase() === user.email.toLowerCase()
  )

  return {
    name: stateUser?.name ?? user.name,
    email: stateUser?.email ?? user.email,
    avatar: stateUser?.avatar ?? user.avatar,
  }
}

function parseDirectConversationKey(key: string) {
  if (!key.startsWith(DIRECT_CONVERSATION_PREFIX)) return null

  const [firstUserId, secondUserId] = key
    .slice(DIRECT_CONVERSATION_PREFIX.length)
    .split(":")

  if (!firstUserId || !secondUserId) return null

  return [firstUserId, secondUserId] as const
}

function shouldCountIncomingDirectMessage(message: Message, userId: string) {
  if (
    message.deletedForEveryone ||
    message.status === "read" ||
    isMessageHiddenForUser(message, userId)
  ) {
    return false
  }

  if (message.senderId) return message.senderId !== userId

  return message.isOwn === false
}

function shouldCountIncomingGroupMessage(message: Message, userId: string) {
  if (
    message.deletedForEveryone ||
    isGroupMessageReadByUser(message, userId) ||
    isMessageHiddenForUser(message, userId)
  ) {
    return false
  }

  if (message.senderId) return message.senderId !== userId

  return message.isOwn === false
}

function canUserSeeSidebarGroup(
  groupId: string,
  userId: string,
  state: AppState
) {
  if (!userId) return false

  const metadata = state.groupMetadataById[groupId]

  if (!metadata) return false

  return new Set([
    metadata.creatorId,
    ...metadata.adminIds,
    ...metadata.participantIds,
  ]).has(userId)
}
