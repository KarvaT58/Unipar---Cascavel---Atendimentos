"use client"

import * as React from "react"
import {
  ArrowUpRightIcon,
  CheckCircle2Icon,
  HeadsetIcon,
  InboxIcon,
  TicketPlusIcon,
  UsersRoundIcon,
} from "lucide-react"
import {
  Area as RechartsArea,
  AreaChart as RechartsAreaChart,
  CartesianGrid as RechartsCartesianGrid,
  XAxis as RechartsXAxis,
} from "recharts"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { AppState } from "@/lib/app-state"
import type { AdminUser, Sector } from "@/lib/admin-data"
import {
  fetchBackendState,
  fetchCurrentSession,
  type BackendAuthenticatedUser,
} from "@/lib/backend-client"
import type { ServiceTicket } from "@/lib/service-ticket-data"

type DashboardMetrics = {
  initiatedByMe: number
  sectorOpen: number
  assignedToMe: number
  closedByMe: number
}

type ChartParticipant = {
  key: string
  name: string
  color: string
  userId?: string
}

type ChartDataPoint = {
  date: string
  [key: string]: string | number
}

type DashboardContentProps = {
  metrics: DashboardMetrics
  sectorLabel: string
  userName: string
  chartData: ChartDataPoint[]
  chartParticipants: ChartParticipant[]
  databaseError?: string
}

const dashboardChartColors = [
  "#ff0018",
  "#f97316",
  "#22c55e",
  "#f59e0b",
  "#a78bfa",
  "#14b8a6",
  "#e879f9",
  "#84cc16",
  "#fb7185",
  "#94a3b8",
]

const rangeOptions = [
  { value: "90d", label: "Últimos 3 meses", days: 90 },
  { value: "30d", label: "Últimos 30 dias", days: 30 },
  { value: "7d", label: "Últimos 7 dias", days: 7 },
] as const

type TimeRange = (typeof rangeOptions)[number]["value"]

export function DashboardContent({
  metrics,
  sectorLabel,
  userName,
  chartData,
  chartParticipants,
  databaseError,
}: DashboardContentProps) {
  const [dashboardData, setDashboardData] =
    React.useState<DashboardContentProps>({
      metrics,
      sectorLabel,
      userName,
      chartData,
      chartParticipants,
      databaseError,
    })
  const [timeRange, setTimeRange] = React.useState<TimeRange>("90d")
  const {
    metrics: currentMetrics,
    sectorLabel: currentSectorLabel,
    userName: currentUserName,
    chartData: currentChartData,
    chartParticipants: currentChartParticipants,
    databaseError: currentDatabaseError,
  } = dashboardData

  React.useEffect(() => {
    let cancelled = false

    async function refreshDashboard() {
      if (document.visibilityState === "hidden") {
        return
      }

      try {
        const [currentUser, envelope] = await Promise.all([
          fetchCurrentSession(),
          fetchBackendState(),
        ])

        if (cancelled || !currentUser) {
          return
        }

        setDashboardData(createDashboardData(envelope.state, currentUser))
      } catch {
        if (!cancelled) {
          setDashboardData((currentData) => currentData)
        }
      }
    }

    function handleRefresh() {
      void refreshDashboard()
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void refreshDashboard()
      }
    }

    handleRefresh()
    window.addEventListener("focus", handleRefresh)
    document.addEventListener("visibilitychange", handleVisibilityChange)

    const intervalId = window.setInterval(handleRefresh, 10_000)

    return () => {
      cancelled = true
      window.removeEventListener("focus", handleRefresh)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      window.clearInterval(intervalId)
    }
  }, [])

  const metricCards = [
    {
      title: "Chamados iniciados",
      value: currentMetrics.initiatedByMe,
      summary: "Abertos por você",
      description: "Criados nos últimos 30 dias",
      icon: TicketPlusIcon,
    },
    {
      title: "Fila do setor",
      value: currentMetrics.sectorOpen,
      summary: `Pendentes envolvendo ${currentSectorLabel}`,
      description: "Chamados do setor nos últimos 30 dias",
      icon: InboxIcon,
    },
    {
      title: "Minha fila",
      value: currentMetrics.assignedToMe,
      summary: "Em atendimento por você",
      description: "Atribuídos nos últimos 30 dias",
      icon: HeadsetIcon,
    },
    {
      title: "Encerrados por mim",
      value: currentMetrics.closedByMe,
      summary: "Finalizados por você",
      description: "Resolvidos nos últimos 30 dias",
      icon: CheckCircle2Icon,
    },
  ]

  const chartConfig = React.useMemo(() => {
    return currentChartParticipants.reduce<ChartConfig>(
      (config, participant) => {
        config[participant.key] = {
          label: participant.name,
          color: participant.color,
        }

        return config
      },
      {
        atendimentos: {
          label: "Atendimentos",
        },
      }
    )
  }, [currentChartParticipants])

  const filteredData = React.useMemo(() => {
    const referenceDate = getReferenceDate(currentChartData)
    const selectedRange =
      rangeOptions.find((option) => option.value === timeRange) ??
      rangeOptions[0]
    const startDate = new Date(referenceDate)
    startDate.setDate(startDate.getDate() - (selectedRange.days - 1))

    return currentChartData.filter((item) => parseDateKey(item.date) >= startDate)
  }, [currentChartData, timeRange])

  const visibleChartParticipants = React.useMemo(() => {
    return currentChartParticipants.filter((participant) =>
      filteredData.some((item) => Number(item[participant.key] ?? 0) > 0)
    )
  }, [currentChartParticipants, filteredData])

  const hasChartValues = visibleChartParticipants.length > 0

  return (
    <section className="flex h-full min-h-0 flex-col gap-5 overflow-auto">
      {currentDatabaseError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {currentDatabaseError}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metricCards.map((metric) => (
          <MetricCard key={metric.title} {...metric} />
        ))}
      </div>

      <Card className="overflow-hidden border-border/80 bg-linear-to-b from-card to-background/80 pt-0">
        <CardHeader className="flex items-start gap-3 border-b px-4 py-4 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/12 text-primary">
              <UsersRoundIcon className="size-5" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-base">
                Atendimentos resolvidos
              </CardTitle>
              <CardDescription>
                {currentUserName} comparado com colegas do {currentSectorLabel}
              </CardDescription>
            </div>
          </div>
          <Select
            value={timeRange}
            onValueChange={(value) =>
              setTimeRange((value ?? "90d") as TimeRange)
            }
          >
            <SelectTrigger
              className="w-full sm:ml-auto sm:w-[160px]"
              aria-label="Selecionar período"
            >
              <SelectValue placeholder="Últimos 3 meses" />
            </SelectTrigger>
            <SelectContent className="rounded-lg">
              {rangeOptions.map((option) => (
                <SelectItem
                  key={option.value}
                  value={option.value}
                  className="rounded-md"
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="px-2 pt-4 sm:px-5 sm:pt-5">
          {hasChartValues ? (
            <ChartContainer
              config={chartConfig}
              className="aspect-auto h-[300px] w-full"
            >
              <RechartsAreaChart data={filteredData}>
                <defs>
                  {visibleChartParticipants.map((participant) => (
                    <linearGradient
                      key={participant.key}
                      id={`fill-${participant.key}`}
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor={participant.color}
                        stopOpacity={0.55}
                      />
                      <stop
                        offset="95%"
                        stopColor={participant.color}
                        stopOpacity={0.04}
                      />
                    </linearGradient>
                  ))}
                </defs>
                <RechartsCartesianGrid vertical={false} />
                <RechartsXAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={28}
                  tickFormatter={(value: string) =>
                    parseDateKey(value).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "short",
                    })
                  }
                />
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      labelFormatter={(value) =>
                        parseDateKey(String(value)).toLocaleDateString("pt-BR", {
                          dateStyle: "medium",
                        })
                      }
                      indicator="dot"
                    />
                  }
                />
                {visibleChartParticipants.map((participant) => (
                  <RechartsArea
                    key={participant.key}
                    dataKey={participant.key}
                    name={participant.name}
                    type="natural"
                    fill={`url(#fill-${participant.key})`}
                    stroke={participant.color}
                    strokeWidth={2.5}
                    dot={false}
                  />
                ))}
                <ChartLegend content={<ChartLegendContent />} />
              </RechartsAreaChart>
            </ChartContainer>
          ) : (
            <div className="flex h-[300px] items-center justify-center rounded-md border border-dashed border-border/80 bg-background/40 px-4 text-center text-sm text-muted-foreground">
              Nenhum atendimento resolvido neste período.
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  )
}

function MetricCard({
  title,
  value,
  summary,
  description,
  icon: Icon,
}: {
  title: string
  value: number
  summary: string
  description: string
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <Card className="min-h-44 overflow-hidden border-border/80 bg-linear-to-b from-card to-background/80 p-0 shadow-[inset_0_1px_0_rgb(255_255_255/0.04)]">
      <CardContent className="flex h-full flex-col justify-between gap-5 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm text-muted-foreground">{title}</p>
            <p className="mt-2 text-3xl font-bold tabular-nums tracking-normal text-foreground">
              {value.toLocaleString("pt-BR")}
            </p>
          </div>
          <div className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-background/80 px-2 py-1 text-xs font-semibold text-foreground">
            <ArrowUpRightIcon className="size-3.5 text-primary" />
            30d
          </div>
        </div>
        <div className="grid gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Icon className="size-4 text-primary" />
            <span className="min-w-0 truncate">{summary}</span>
          </div>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function createDashboardData(
  state: AppState,
  currentUser: BackendAuthenticatedUser
): DashboardContentProps {
  const now = new Date()
  const since30Days = startOfDay(subDays(now, 29))
  const since90Days = startOfDay(subDays(now, 89))
  const tickets = state.serviceTickets
  const participants = buildParticipants(
    currentUser.id,
    getDashboardSectorUsers(state.adminUsers, currentUser)
  )
  const participantUserIds = new Set(
    participants
      .map((participant) => participant.userId)
      .filter((userId): userId is string => Boolean(userId))
  )
  const resolvedTickets = tickets
    .filter(
      (ticket) =>
        ticket.status === "completed" &&
        isOnOrAfter(ticket.closedAt, since90Days) &&
        Boolean(ticket.closedById) &&
        participantUserIds.has(ticket.closedById ?? "")
    )
    .map((ticket) => ({
      resolvedAt: ticket.closedAt ?? null,
      resolvedById: ticket.closedById ?? null,
    }))

  return {
    metrics: {
      initiatedByMe: countTickets(tickets, (ticket) =>
        isCurrentUserTicket(ticket.requesterId, currentUser.id) &&
        isOnOrAfter(ticket.createdAt, since30Days)
      ),
      sectorOpen: countTickets(tickets, (ticket) =>
        isSectorTicket(ticket, currentUser.sector) &&
        ticket.status !== "completed"
      ),
      assignedToMe: countTickets(tickets, (ticket) =>
        isCurrentUserTicket(ticket.assignedToId, currentUser.id) &&
        ticket.status !== "completed"
      ),
      closedByMe: countTickets(tickets, (ticket) =>
        isCurrentUserTicket(ticket.closedById, currentUser.id) &&
        ticket.status === "completed" &&
        isOnOrAfter(ticket.closedAt, since30Days)
      ),
    },
    sectorLabel: currentUser.sector,
    userName: currentUser.name,
    chartParticipants: participants.map((participant) => ({
      key: participant.key,
      name: participant.name,
      color: participant.color,
    })),
    chartData: createResolvedChartData(participants, resolvedTickets, 90),
    databaseError: undefined,
  }
}

function getDashboardSectorUsers(
  adminUsers: AdminUser[],
  currentUser: BackendAuthenticatedUser
) {
  const usersById = new Map<string, { id: string; name: string }>()

  adminUsers
    .filter(
      (user) =>
        user.status === "active" &&
        user.sector === currentUser.sector
    )
    .forEach((user) => {
      usersById.set(user.id, {
        id: user.id,
        name: user.name,
      })
    })

  if (!usersById.has(currentUser.id)) {
    usersById.set(currentUser.id, {
      id: currentUser.id,
      name: currentUser.name,
    })
  }

  return Array.from(usersById.values()).sort((first, second) =>
    first.name.localeCompare(second.name)
  )
}

function buildParticipants(
  currentUserId: string,
  users: Array<{ id: string; name: string }>
): ChartParticipant[] {
  const colleagues = users.filter((user) => user.id !== currentUserId)

  return [
    {
      key: "series_0",
      name: "Você",
      color: dashboardChartColors[0],
      userId: currentUserId,
    },
    ...colleagues.map((user, index) => ({
      key: `series_${index + 1}`,
      name: getFirstName(user.name),
      color: getChartColor(index + 1),
      userId: user.id,
    })),
  ]
}

function createResolvedChartData(
  participants: ChartParticipant[],
  tickets: Array<{ resolvedAt: Date | null; resolvedById: string | null }>,
  days: number
) {
  const participantByUserId = new Map(
    participants
      .filter((participant) => participant.userId)
      .map((participant) => [participant.userId, participant])
  )
  const data = createEmptyChartData(participants, days)
  const dataByDate = new Map(data.map((item) => [item.date, item]))

  tickets.forEach((ticket) => {
    if (!ticket.resolvedAt || !ticket.resolvedById) {
      return
    }

    const participant = participantByUserId.get(ticket.resolvedById)
    const day = dataByDate.get(toDateKey(ticket.resolvedAt))

    if (!participant || !day) {
      return
    }

    day[participant.key] = Number(day[participant.key] ?? 0) + 1
  })

  return data
}

function createEmptyChartData(participants: ChartParticipant[], days: number) {
  const today = startOfDay(new Date())
  const data: ChartDataPoint[] = []

  for (let index = days - 1; index >= 0; index--) {
    const date = subDays(today, index)
    const item: ChartDataPoint = { date: toDateKey(date) }

    participants.forEach((participant) => {
      item[participant.key] = 0
    })

    data.push(item)
  }

  return data
}

function countTickets(
  tickets: ServiceTicket[],
  predicate: (ticket: ServiceTicket) => boolean
) {
  return tickets.reduce((total, ticket) => total + (predicate(ticket) ? 1 : 0), 0)
}

function isCurrentUserTicket(userId: string | undefined, currentUserId: string) {
  return Boolean(userId) && userId === currentUserId
}

function isSectorTicket(ticket: ServiceTicket, sector: Sector) {
  return (
    ticket.requesterSector === sector ||
    ticket.targetSector === sector ||
    ticket.assignedToSector === sector
  )
}

function isOnOrAfter(date: Date | undefined, startDate: Date) {
  return date instanceof Date && date >= startDate
}

function subDays(date: Date, days: number) {
  const nextDate = new Date(date)

  nextDate.setDate(nextDate.getDate() - days)

  return nextDate
}

function startOfDay(date: Date) {
  const nextDate = new Date(date)

  nextDate.setHours(0, 0, 0, 0)

  return nextDate
}

function toDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")

  return `${year}-${month}-${day}`
}

function getFirstName(name: string) {
  return name.trim().split(/\s+/)[0] || name
}

function getChartColor(index: number) {
  return dashboardChartColors[index] ?? `hsl(${(index * 47) % 360} 80% 62%)`
}

function getReferenceDate(chartData: ChartDataPoint[]) {
  const lastDate = chartData.at(-1)?.date

  return lastDate ? parseDateKey(lastDate) : new Date()
}

function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number)

  return new Date(year, (month ?? 1) - 1, day ?? 1)
}
