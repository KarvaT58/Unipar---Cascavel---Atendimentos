"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  EllipsisVerticalIcon,
  MessageCircleIcon,
  SearchIcon,
  ShieldCheckIcon,
  UserIcon,
} from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  OptionCombobox,
  accessSectorComboboxOptions,
} from "@/components/option-combobox"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  getUserChatStatusLabel,
  getUserWorkStatusLabel,
  type UserChatStatus,
  type UserWorkStatus,
} from "@/lib/admin-data"
import { formatLastSeenAt, getChatPresenceMeta } from "@/lib/chat-data"
import {
  getDisplayChatStatus,
  PRESENCE_HEARTBEAT_MS,
} from "@/lib/presence"
import { cn } from "@/lib/utils"

export type TeamUser = {
  id: string
  name: string
  email: string
  phone: string
  role: "USER" | "ADMIN"
  sector: string
  sectorLabel: string
  avatar?: string
  about?: string
  chatStatus?: UserChatStatus
  workStatus?: UserWorkStatus
  lastSeenAt?: Date
}

type TeamDirectoryProps = {
  users: TeamUser[]
}

const allFilterValue = "all"
const teamUsersPageSize = 10
const sectorFilterOptions = [
  {
    value: allFilterValue,
    label: "Todos os setores",
    description: "Mostrar equipe completa",
  },
  ...accessSectorComboboxOptions,
]

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

export function TeamDirectory({ users }: TeamDirectoryProps) {
  const router = useRouter()
  const [search, setSearch] = React.useState("")
  const [sectorFilter, setSectorFilter] = React.useState(allFilterValue)
  const [roleFilter, setRoleFilter] = React.useState(allFilterValue)
  const [page, setPage] = React.useState(1)
  const [presenceNow, setPresenceNow] = React.useState(() => Date.now())

  React.useEffect(() => {
    const refresh = () => router.refresh()
    const presenceTimerId = window.setInterval(
      () => setPresenceNow(Date.now()),
      PRESENCE_HEARTBEAT_MS
    )
    const refreshTimerId = window.setInterval(refresh, 30_000)
    const events = new EventSource("/api/realtime?lastEventId=latest")

    events.addEventListener("state", (event) => {
      if (getRealtimePayloadKey(event) === "typing") return

      refresh()
    })

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        setPresenceNow(Date.now())
        refresh()
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    window.addEventListener("focus", refresh)

    return () => {
      window.clearInterval(presenceTimerId)
      window.clearInterval(refreshTimerId)
      events.close()
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      window.removeEventListener("focus", refresh)
    }
  }, [router])

  const filteredUsers = React.useMemo(() => {
    const query = search.trim().toLowerCase()

    return users.filter((user) => {
      const matchesName = !query || user.name.toLowerCase().includes(query)
      const matchesSector =
        sectorFilter === allFilterValue || user.sector === sectorFilter
      const matchesRole =
        roleFilter === allFilterValue || user.role === roleFilter

      return matchesName && matchesSector && matchesRole
    })
  }, [roleFilter, search, sectorFilter, users])
  const totalPages = Math.max(
    1,
    Math.ceil(filteredUsers.length / teamUsersPageSize)
  )
  const safePage = Math.min(page, totalPages)
  const paginatedUsers = filteredUsers.slice(
    (safePage - 1) * teamUsersPageSize,
    safePage * teamUsersPageSize
  )

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg bg-background">
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden border-border/80 bg-background">
        <CardHeader className="border-b px-3 py-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <CardTitle className="text-base">Usuários da equipe</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {filteredUsers.length} de {users.length} usuário
                {users.length === 1 ? "" : "s"}
              </p>
            </div>

            <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-[minmax(220px,1fr)_180px_150px] lg:max-w-3xl">
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value)
                    setPage(1)
                  }}
                  placeholder="Buscar por nome"
                  className="pl-8"
                />
              </div>

              <OptionCombobox
                value={sectorFilter}
                onValueChange={(value) => {
                  setSectorFilter(value ?? allFilterValue)
                  setPage(1)
                }}
                options={sectorFilterOptions}
                placeholder="Todos os setores"
                showClear={false}
              />

              <Select
                value={roleFilter}
                onValueChange={(value) => {
                  setRoleFilter(value ?? allFilterValue)
                  setPage(1)
                }}
              >
                <SelectTrigger aria-label="Filtrar por perfil">
                  <SelectValue placeholder="Todos os perfis" />
                </SelectTrigger>
                <SelectContent className="rounded-lg">
                  <SelectItem value={allFilterValue} className="rounded-md">
                    Todos os perfis
                  </SelectItem>
                  <SelectItem value="ADMIN" className="rounded-md">
                    Admin
                  </SelectItem>
                  <SelectItem value="USER" className="rounded-md">
                    Usuário
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>

        <CardContent className="min-h-0 flex-1 overflow-auto p-0">
          {filteredUsers.length ? (
            <div className="min-w-[1180px]">
              <div className="grid grid-cols-[1.15fr_0.7fr_1.2fr_0.68fr_0.75fr_0.55fr_0.9fr_42px] gap-3 border-b bg-muted/30 px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
                <span>Usuário</span>
                <span>Telefone</span>
                <span>E-mail</span>
                <span>Presença</span>
                <span>Status</span>
                <span>Perfil</span>
                <span>Setor</span>
                <span />
              </div>
              {paginatedUsers.map((user) => (
                <TeamUserRow
                  key={user.id}
                  user={user}
                  presenceNow={presenceNow}
                />
              ))}
            </div>
          ) : (
            <div className="flex min-h-64 items-center justify-center p-6 text-center">
              <div className="grid gap-1">
                <h2 className="text-base font-semibold">
                  Nenhum usuário encontrado
                </h2>
                <p className="text-sm text-muted-foreground">
                  Ajuste a busca ou os filtros para ver outros usuários.
                </p>
              </div>
            </div>
          )}
        </CardContent>

        <div className="flex items-center justify-between gap-3 border-t px-3 py-2 text-sm">
          <span className="text-xs text-muted-foreground">Página</span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              aria-label="Página anterior"
              disabled={safePage <= 1}
              onClick={() => setPage(safePage - 1)}
            >
              <ChevronLeftIcon />
            </Button>
            <span className="flex h-7 min-w-10 items-center justify-center rounded-md border bg-muted/30 px-2 text-sm font-semibold tabular-nums">
              {safePage}
            </span>
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              aria-label="Próxima página"
              disabled={safePage >= totalPages}
              onClick={() => setPage(safePage + 1)}
            >
              <ChevronRightIcon />
            </Button>
            <span className="ml-1 text-xs text-muted-foreground">
              de {totalPages}
            </span>
          </div>
        </div>
      </Card>
    </section>
  )
}

function TeamUserRow({
  presenceNow,
  user,
}: {
  presenceNow: number
  user: TeamUser
}) {
  const chatStatus = getDisplayChatStatus(
    user.chatStatus,
    user.lastSeenAt,
    presenceNow
  )
  const presence = getChatPresenceMeta({
    chatStatus,
    isOnline: chatStatus === "online",
  })
  const offlineHint =
    chatStatus === "offline" ? formatLastSeenAt(user.lastSeenAt) : null

  return (
    <div className="grid grid-cols-[1.15fr_0.7fr_1.2fr_0.68fr_0.75fr_0.55fr_0.9fr_42px] items-center gap-3 border-b px-3 py-3 text-sm last:border-b-0">
      <div className="flex min-w-0 items-center gap-3">
        <div className="relative shrink-0">
          <Avatar className="size-10">
            {user.avatar ? (
              <AvatarImage src={user.avatar} alt={user.name} />
            ) : null}
            <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
          </Avatar>
          <span
            className={cn(
              "absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-background",
              presence.dotClassName
            )}
          />
        </div>
        <div className="min-w-0">
          <p className="truncate font-medium leading-snug">{user.name}</p>
          {user.about ? (
            <p className="truncate text-xs text-muted-foreground">
              {user.about}
            </p>
          ) : null}
        </div>
      </div>
      <span className="text-muted-foreground">{user.phone || "-"}</span>
      <span className="break-all leading-snug">{user.email}</span>
      <div className="min-w-0">
        <PresencePill status={chatStatus} />
        {offlineHint ? (
          <p className="mt-1 truncate text-[11px] text-muted-foreground">
            {offlineHint}
          </p>
        ) : null}
      </div>
      <WorkStatusPill status={user.workStatus} />
      <div className="flex min-w-0">
        <RolePill role={user.role} />
      </div>
      <span className="break-words text-muted-foreground">
        {user.sectorLabel}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Ações do usuário"
            />
          }
        >
          <EllipsisVerticalIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem render={<Link href={`/chat-interno?userId=${user.id}`} />}>
            <MessageCircleIcon />
            Iniciar conversa
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function PresencePill({ status }: { status?: UserChatStatus }) {
  const presence = getChatPresenceMeta({
    chatStatus: status,
    isOnline: status === "online",
  })

  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs font-medium text-muted-foreground">
      <span className={cn("size-1.5 rounded-full", presence.dotClassName)} />
      <span className="truncate">{getUserChatStatusLabel(status)}</span>
    </span>
  )
}

function WorkStatusPill({ status }: { status?: UserWorkStatus }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 min-w-0 max-w-[9.5rem] justify-self-start rounded-full border px-2.5 text-xs font-semibold leading-6",
        getWorkStatusPillClassName(status)
      )}
    >
      <span className="truncate">{getUserWorkStatusLabel(status)}</span>
    </span>
  )
}

function getWorkStatusPillClassName(status?: UserWorkStatus) {
  switch (status ?? "available") {
    case "available":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
    case "meeting":
      return "border-sky-500/40 bg-sky-500/10 text-sky-300"
    case "home-office":
      return "border-cyan-500/40 bg-cyan-500/10 text-cyan-300"
    case "focus":
      return "border-amber-500/40 bg-amber-500/10 text-amber-300"
    case "lunch":
      return "border-orange-500/40 bg-orange-500/10 text-orange-300"
    case "vacation":
      return "border-rose-500/40 bg-rose-500/10 text-rose-300"
    case "support":
      return "border-red-500/40 bg-red-500/10 text-red-300"
    case "training":
      return "border-violet-500/40 bg-violet-500/10 text-violet-300"
    case "external":
      return "border-slate-500/50 bg-slate-500/10 text-slate-300"
    default:
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
  }
}

function RolePill({ role }: { role: TeamUser["role"] }) {
  const admin = role === "ADMIN"

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold",
        admin
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-border bg-muted/40 text-muted-foreground"
      )}
    >
      {admin ? <ShieldCheckIcon className="size-3" /> : <UserIcon className="size-3" />}
      {admin ? "Admin" : "Usuário"}
    </span>
  )
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)

  if (!parts.length) return "U"

  return parts
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
}
