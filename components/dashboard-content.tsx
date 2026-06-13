"use client"

import * as React from "react"
import {
  ArrowUpRightIcon,
  CheckCircle2Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  HeadsetIcon,
  InboxIcon,
  TicketPlusIcon,
  UsersRoundIcon,
} from "lucide-react"
import {
  CartesianGrid as RechartsCartesianGrid,
  Line as RechartsLine,
  LineChart as RechartsLineChart,
  XAxis as RechartsXAxis,
} from "recharts"

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
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
import type { Sector } from "@/lib/admin-data"
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

const dashboardCurrentUserColor = "#ff0018"
const DASHBOARD_CHART_DAYS = 90
const GOOD_PRACTICE_ROTATION_MS = 8_000

const goodPractices = [
  {
    category: "Atendimento",
    title: "Registre o contexto antes de transferir",
    description:
      "Inclua o que já foi verificado e o próximo passo esperado. Isso evita retrabalho entre setores.",
  },
  {
    category: "Comunicação",
    title: "Use mensagens objetivas e completas",
    description:
      "Explique o pedido, o impacto e o prazo em uma única mensagem sempre que possível.",
  },
  {
    category: "Prioridade",
    title: "Reserve a prioridade para o que é realmente urgente",
    description:
      "Ao marcar tudo como urgente, os casos críticos perdem destaque e demoram mais para ser percebidos.",
  },
  {
    category: "Organização",
    title: "Atualize o status durante o atendimento",
    description:
      "Um chamado atualizado ajuda toda a equipe a entender o andamento sem precisar interromper o responsável.",
  },
  {
    category: "Segurança",
    title: "Evite compartilhar dados sensíveis no chat",
    description:
      "Use apenas as informações necessárias e confirme o destinatário antes de enviar anexos ou dados pessoais.",
  },
  {
    category: "Colaboração",
    title: "Finalize com uma orientação clara",
    description:
      "Ao concluir, registre a solução aplicada e qualquer cuidado necessário para evitar que o problema retorne.",
  },
] as const

const rangeOptions = [
  { value: "90d", label: "Últimos 90 dias", days: 90 },
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
  const [practiceIndex, setPracticeIndex] = React.useState(0)
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
    const startDate = startOfDay(
      subDays(referenceDate, selectedRange.days - 1)
    )

    return currentChartData.filter((item) => parseDateKey(item.date) >= startDate)
  }, [currentChartData, timeRange])

  const visibleChartParticipants = React.useMemo(() => {
    void filteredData

    return currentChartParticipants
  }, [currentChartParticipants, filteredData])

  const hasChartValues = visibleChartParticipants.length > 0
  const periodSummary = React.useMemo(() => {
    return filteredData.reduce(
      (summary, item) => {
        const dailyTotal = visibleChartParticipants.reduce(
          (total, participant) =>
            total + Number(item[participant.key] ?? 0),
          0
        )

        return {
          resolved: summary.resolved + dailyTotal,
          activeDays: summary.activeDays + (dailyTotal > 0 ? 1 : 0),
        }
      },
      { resolved: 0, activeDays: 0 }
    )
  }, [filteredData, visibleChartParticipants])
  const activePractice = goodPractices[practiceIndex]

  const showPreviousPractice = React.useCallback(() => {
    setPracticeIndex(
      (currentIndex) =>
        (currentIndex - 1 + goodPractices.length) % goodPractices.length
    )
  }, [])

  const showNextPractice = React.useCallback(() => {
    setPracticeIndex(
      (currentIndex) => (currentIndex + 1) % goodPractices.length
    )
  }, [])

  React.useEffect(() => {
    const intervalId = window.setInterval(
      showNextPractice,
      GOOD_PRACTICE_ROTATION_MS
    )

    return () => window.clearInterval(intervalId)
  }, [showNextPractice])

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

      <Card className="flex min-h-[520px] flex-1 flex-col overflow-hidden border-border/80 bg-linear-to-b from-card to-background/80 pt-0">
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
                Atendimentos diários de {currentUserName}
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
              <SelectValue placeholder="Últimos 90 dias" />
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
        <CardContent className="flex min-h-[300px] flex-1 flex-col px-2 pt-4 sm:px-5 sm:pt-5">
          {hasChartValues ? (
            <ChartContainer
              config={chartConfig}
              className="aspect-auto min-h-[300px] w-full flex-1"
            >
              <RechartsLineChart data={filteredData}>
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
                          day: "2-digit",
                          month: "long",
                          year: "numeric",
                        })
                      }
                      indicator="dot"
                    />
                  }
                />
                {visibleChartParticipants.map((participant) => (
                  <RechartsLine
                    key={participant.key}
                    dataKey={participant.key}
                    name={participant.name}
                    type="monotone"
                    stroke={participant.color}
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                ))}
                <ChartLegend content={<ChartLegendContent />} />
              </RechartsLineChart>
            </ChartContainer>
          ) : (
            <div className="flex h-[300px] items-center justify-center rounded-md border border-dashed border-border/80 bg-background/40 px-4 text-center text-sm text-muted-foreground">
              Nenhum atendimento resolvido neste período.
            </div>
          )}
        </CardContent>
        <CardFooter className="grid items-stretch border-t bg-muted/15 p-0 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-h-32 min-w-0 items-center gap-4 px-5 py-4 sm:px-6">
            <div
              key={activePractice.title}
              className="dashboard-practice-enter min-w-0 flex-1"
              aria-live="polite"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Boas práticas no atendimento
                </span>
                <span className="text-xs font-medium text-muted-foreground">
                  {activePractice.category}
                </span>
              </div>
              <p className="mt-2 text-sm font-semibold text-foreground">
                {activePractice.title}
              </p>
              <p className="mt-1 max-w-4xl text-sm leading-5 text-muted-foreground">
                {activePractice.description}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <span className="mr-2 hidden text-xs tabular-nums text-muted-foreground sm:inline">
                {practiceIndex + 1} de {goodPractices.length}
              </span>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label="Boa prática anterior"
                onClick={showPreviousPractice}
              >
                <ChevronLeftIcon />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label="Próxima boa prática"
                onClick={showNextPractice}
              >
                <ChevronRightIcon />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 border-t lg:border-l lg:border-t-0">
            <PeriodSummary
              label="Resolvidos no período"
              value={periodSummary.resolved}
            />
            <PeriodSummary
              label="Dias com atividade"
              value={periodSummary.activeDays}
              className="border-l"
            />
          </div>
        </CardFooter>
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
  const sinceChartStart = startOfDay(subDays(now, DASHBOARD_CHART_DAYS - 1))
  const tickets = state.serviceTickets
  const participants = buildParticipants(currentUser)
  const resolvedTickets = tickets
    .filter(
      (ticket) =>
        ticket.status === "completed" &&
        isOnOrAfter(ticket.closedAt, sinceChartStart) &&
        isCurrentUserTicket(ticket.closedById, currentUser.id)
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
    chartData: createResolvedChartData(
      participants,
      resolvedTickets,
      DASHBOARD_CHART_DAYS
    ),
    databaseError: undefined,
  }
}

function buildParticipants(
  currentUser: Pick<BackendAuthenticatedUser, "id" | "name">
): ChartParticipant[] {
  return [
    {
      key: "series_0",
      name: currentUser.name,
      color: dashboardCurrentUserColor,
      userId: currentUser.id,
    },
  ]
}

function PeriodSummary({
  label,
  value,
  className,
}: {
  label: string
  value: number
  className?: string
}) {
  return (
    <div
      className={`flex min-h-32 flex-col justify-center px-5 py-4 ${className ?? ""}`}
    >
      <p className="text-3xl font-bold tabular-nums text-foreground">
        {value.toLocaleString("pt-BR")}
      </p>
      <p className="mt-1 text-xs leading-4 text-muted-foreground">{label}</p>
    </div>
  )
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
  const currentDay = startOfDay(new Date())
  const data: ChartDataPoint[] = []

  for (let index = days - 1; index >= 0; index--) {
    const date = subDays(currentDay, index)
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

function getReferenceDate(chartData: ChartDataPoint[]) {
  const lastDate = chartData.at(-1)?.date

  return lastDate ? parseDateKey(lastDate) : new Date()
}

function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number)

  return new Date(year, (month ?? 1) - 1, day ?? 1)
}
