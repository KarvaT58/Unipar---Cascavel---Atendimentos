"use client"

import * as React from "react"

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
  SERVICE_TICKET_NOTIFICATION_EVENT,
  getServiceTicketNotificationSnapshot,
  readServiceTicketNotificationPendingKeys,
  readServiceTicketNotificationReadKeys,
  readServiceTicketNotificationSoundKeys,
  writeServiceTicketNotificationPendingKeys,
  writeServiceTicketNotificationSoundKeys,
} from "@/lib/service-ticket-notifications"

const SERVICE_TICKET_NOTIFICATION_SOUND_SRC = "/audio/notificacao.mp3"
const SERVICE_TICKET_NOTIFICATION_FALLBACK_REFRESH_MS = 3000

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

export function AppSidebar({
  user,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  user: AppSidebarUser
}) {
  const [pendingAccessRequests, setPendingAccessRequests] = React.useState(0)
  const [serviceTicketNotificationCount, setServiceTicketNotificationCount] =
    React.useState(0)
  const latestAppStateRef = React.useRef<AppState | null>(null)
  const serviceTicketNotificationBaselineUserIdRef = React.useRef("")
  const serviceTicketNotificationCountRef = React.useRef(0)
  const serviceTicketUnreadKeysRef = React.useRef<Set<string>>(new Set())
  const serviceTicketNotificationRefreshIdRef = React.useRef(0)
  const notificationAudioRef = React.useRef<HTMLAudioElement | null>(null)
  const pendingNotificationSoundRef = React.useRef(false)
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

  const flushPendingNotificationSound = React.useCallback(() => {
    if (!pendingNotificationSoundRef.current) {
      return
    }

    pendingNotificationSoundRef.current = false
    playServiceTicketNotificationSound()
  }, [playServiceTicketNotificationSound])

  React.useEffect(() => {
    window.addEventListener("pointerdown", flushPendingNotificationSound)
    window.addEventListener("keydown", flushPendingNotificationSound)

    return () => {
      window.removeEventListener("pointerdown", flushPendingNotificationSound)
      window.removeEventListener("keydown", flushPendingNotificationSound)
    }
  }, [flushPendingNotificationSound])

  const refreshServiceTicketNotifications = React.useCallback(
    async (options?: { playSound?: boolean; fetchState?: boolean }) => {
      const refreshId = serviceTicketNotificationRefreshIdRef.current + 1
      serviceTicketNotificationRefreshIdRef.current = refreshId
      const shouldFetchState = options?.fetchState ?? true
      const shouldPlaySound = options?.playSound ?? false

      try {
        if (!currentNotificationUser) {
          serviceTicketNotificationBaselineUserIdRef.current = ""
          clearServiceTicketNotificationCount()
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

        const readKeys = readServiceTicketNotificationReadKeys(
          currentNotificationUser.id
        )
        const snapshot = getServiceTicketNotificationSnapshot(
          state.serviceTickets,
          currentNotificationUser,
          readKeys
        )
        const isNewNotificationUser =
          serviceTicketNotificationBaselineUserIdRef.current !==
          currentNotificationUser.id

        if (isNewNotificationUser) {
          serviceTicketNotificationBaselineUserIdRef.current =
            currentNotificationUser.id
          const pendingKeys = readServiceTicketNotificationPendingKeys(
            currentNotificationUser.id
          )
          const activePendingKeys = new Set(
            Array.from(pendingKeys).filter(
              (key) => snapshot.unreadKeys.has(key) && snapshot.allKeys.has(key)
            )
          )

          serviceTicketUnreadKeysRef.current = activePendingKeys
          commitServiceTicketNotificationCount(
            serviceTicketUnreadKeysRef.current.size
          )
          writeServiceTicketNotificationPendingKeys(
            currentNotificationUser.id,
            activePendingKeys
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
          return
        }

        const stableUnreadKeys = serviceTicketUnreadKeysRef.current

        Array.from(stableUnreadKeys).forEach((key) => {
          if (readKeys.has(key) || !snapshot.allKeys.has(key)) {
            stableUnreadKeys.delete(key)
          }
        })
        const soundKeys = readServiceTicketNotificationSoundKeys(
          currentNotificationUser.id
        )
        const newUnreadKeys = Array.from(snapshot.unreadKeys).filter(
          (key) => !soundKeys.has(key)
        )

        newUnreadKeys.forEach((key) => stableUnreadKeys.add(key))
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

        if (shouldPlaySound && newUnreadKeys.length > 0) {
          playServiceTicketNotificationSound()
        }
      } catch {
        // Mantem o ultimo contador estavel se o refresh do realtime falhar.
      }
    },
    [
      clearServiceTicketNotificationCount,
      commitServiceTicketNotificationCount,
      currentNotificationUser,
      playServiceTicketNotificationSound,
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

    eventSource.addEventListener("state", () => {
      void refreshServiceTicketNotifications({
        fetchState: true,
        playSound: true,
      })
    })

    const handleNotificationsChanged = () => {
      void refreshServiceTicketNotifications({ fetchState: false })
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key?.startsWith("service-ticket-notifications-read:")) {
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
          : item
      ),
    [serviceTicketNotificationCount]
  )

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:pt-2">
        <TeamSwitcher teams={data.teams} />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={mainItems} />
      </SidebarContent>
      <SidebarFooter>
        <NavMain className="p-0" items={footerItems} />
        <NavUser user={user} />
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
