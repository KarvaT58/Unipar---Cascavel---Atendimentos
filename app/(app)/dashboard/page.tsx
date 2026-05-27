import { DashboardContent } from "@/components/dashboard-content"
import { SECTOR_OPTIONS, type AdminUser, type Sector } from "@/lib/admin-data"
import { readAppState } from "@/lib/server/state-store"
import { getSessionUser } from "@/lib/session"
import type { ServiceTicket } from "@/lib/service-ticket-data"

export const dynamic = "force-dynamic"

const chartColors = [
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
const DASHBOARD_CHART_MONTHS = 12

type DashboardUser = {
  id: string
  name: string
  email: string
  sector: string
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

export default async function DashboardPage() {
  const data = await getDashboardData()

  return <DashboardContent {...data} />
}

async function getDashboardData() {
  const currentUser = await getSessionUser().catch(() => null)

  if (!currentUser) {
    return createFallbackDashboardData()
  }

  const currentSector = toWorkspaceSector(currentUser.sector)
  const fallbackParticipants = buildParticipants(currentUser.id, [
    { id: currentUser.id, name: currentUser.name },
  ])
  const fallback = createFallbackDashboardData({
    participants: fallbackParticipants,
    sectorLabel: currentSector,
    userName: currentUser.name,
  })

  try {
    const { state } = await readAppState()
    const now = new Date()
    const since30Days = startOfDay(subDays(now, 29))
    const sinceChartStart = startOfMonth(
      subMonths(now, DASHBOARD_CHART_MONTHS - 1)
    )
    const tickets = state.serviceTickets
    const sectorUsers = getDashboardSectorUsers(state.adminUsers, {
      ...currentUser,
      sector: currentSector,
    })
    const participants = buildParticipants(currentUser.id, sectorUsers)
    const participantUserIds = new Set(
      participants
        .map((participant) => participant.userId)
        .filter((userId): userId is string => Boolean(userId))
    )
    const resolvedTickets = tickets
      .filter(
        (ticket) =>
          ticket.status === "completed" &&
          isOnOrAfter(ticket.closedAt, sinceChartStart) &&
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
          isSectorTicket(ticket, currentSector) &&
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
      sectorLabel: currentSector,
      userName: currentUser.name,
      chartParticipants: participants.map((participant) => ({
        key: participant.key,
        name: participant.name,
        color: participant.color,
      })),
      chartData: createResolvedChartData(
        participants,
        resolvedTickets,
        DASHBOARD_CHART_MONTHS
      ),
      databaseError: undefined,
    }
  } catch {
    return fallback
  }
}

function createFallbackDashboardData(options?: {
  participants?: ChartParticipant[]
  sectorLabel?: string
  userName?: string
}) {
  const participants = options?.participants ?? [
    {
      key: "series_0",
      name: "Você",
      color: chartColors[0],
    },
  ]

  return {
    metrics: {
      initiatedByMe: 0,
      sectorOpen: 0,
      assignedToMe: 0,
      closedByMe: 0,
    },
    sectorLabel: options?.sectorLabel ?? "seu setor",
    userName: options?.userName ?? "Você",
    chartParticipants: participants,
    chartData: createEmptyChartData(participants, DASHBOARD_CHART_MONTHS),
    databaseError: undefined as string | undefined,
  }
}

function buildParticipants(
  currentUserId: string,
  users: Array<{ id: string; name: string }>
): ChartParticipant[] {
  const colleagues = users.filter((user) => user.id !== currentUserId)

  const participants = [
    {
      key: "series_0",
      name: "Você",
      color: chartColors[0],
      userId: currentUserId,
    },
    ...colleagues.map((user, index) => ({
      key: `series_${index + 1}`,
      name: getFirstName(user.name),
      color: getChartColor(index + 1),
      userId: user.id,
    })),
  ]

  return participants
}

function getDashboardSectorUsers(
  adminUsers: AdminUser[],
  currentUser: DashboardUser
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

const sectorMap: Record<string, string> = {
  ti: "TI",
  man: "Manutenção",
  mnt: "Monitoramento",
  ap: "Administrador Predial",
  pm: "Patrimônio",
  fin: "Financeiro",
  cia: "Secretaria",
  bb: "Biblioteca",
  csc: "Coordenação",
  dir: "Direção",
  cac: "Atendimento",
  cpa: "Centro de Psicologia Aplicada",
  sg: "Serviços Gerais",
  odt: "Odontologia",
  cse: "Centro de Saúde Escola",
  ls: "Laboratórios de Saúde",
  est: "Esterilização",
  sju: "Serviço de Assistência Jurídica",
  mt: "Motorista",
}

function toWorkspaceSector(sector: string): Sector {
  const normalizedSector = sector.trim().toLowerCase()
  const mappedSector = getSectorByCode(normalizedSector)
  const legacySectorName = sectorMap[normalizedSector]

  return (
    mappedSector ??
    SECTOR_OPTIONS.find(
      (sectorOption) =>
        sectorOption.toLowerCase() === normalizedSector ||
        sectorOption === legacySectorName
    ) ??
    "TI"
  )
}

function getSectorByCode(code: string): Sector | undefined {
  switch (code) {
    case "ti":
      return "TI"
    case "man":
      return SECTOR_OPTIONS[1]
    case "csc":
      return SECTOR_OPTIONS[2]
    case "cpa":
      return SECTOR_OPTIONS[3]
    case "cac":
      return SECTOR_OPTIONS[4]
    case "cia":
      return SECTOR_OPTIONS[5]
    case "sg":
      return SECTOR_OPTIONS[6]
    case "dir":
      return SECTOR_OPTIONS[7]
    case "odt":
      return SECTOR_OPTIONS[8]
    case "cse":
      return SECTOR_OPTIONS[9]
    case "ls":
      return SECTOR_OPTIONS[10]
    case "est":
      return "Esterilização"
    case "ap":
      return SECTOR_OPTIONS[12]
    case "pm":
      return SECTOR_OPTIONS[13]
    case "mnt":
      return SECTOR_OPTIONS[14]
    case "bb":
      return SECTOR_OPTIONS[15]
    case "sju":
      return SECTOR_OPTIONS[16]
    case "mt":
      return SECTOR_OPTIONS[17]
    case "fin":
      return SECTOR_OPTIONS[18]
    case "rh":
      return SECTOR_OPTIONS[19]
    case "com":
      return SECTOR_OPTIONS[20]
    case "mkt":
    case "marketing":
      return SECTOR_OPTIONS[21]
    default:
      return undefined
  }
}

function createResolvedChartData(
  participants: ChartParticipant[],
  tickets: Array<{ resolvedAt: Date | null; resolvedById: string | null }>,
  months: number
) {
  const participantByUserId = new Map(
    participants
      .filter((participant) => participant.userId)
      .map((participant) => [participant.userId, participant])
  )
  const data = createEmptyChartData(participants, months)
  const dataByDate = new Map(data.map((item) => [item.date, item]))

  tickets.forEach((ticket) => {
    if (!ticket.resolvedAt || !ticket.resolvedById) {
      return
    }

    const participant = participantByUserId.get(ticket.resolvedById)
    const month = dataByDate.get(toMonthKey(ticket.resolvedAt))

    if (!participant || !month) {
      return
    }

    month[participant.key] = Number(month[participant.key] ?? 0) + 1
  })

  return data
}

function createEmptyChartData(participants: ChartParticipant[], months: number) {
  const currentMonth = startOfMonth(new Date())
  const data: ChartDataPoint[] = []

  for (let index = months - 1; index >= 0; index--) {
    const date = subMonths(currentMonth, index)
    const item: ChartDataPoint = { date: toMonthKey(date) }

    participants.forEach((participant) => {
      item[participant.key] = 0
    })

    data.push(item)
  }

  return data
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

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function subMonths(date: Date, months: number) {
  const nextDate = new Date(date)

  nextDate.setMonth(nextDate.getMonth() - months, 1)

  return startOfMonth(nextDate)
}

function toMonthKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")

  return `${year}-${month}-01`
}

function getFirstName(name: string) {
  return name.trim().split(/\s+/)[0] || name
}

function getChartColor(index: number) {
  return chartColors[index] ?? `hsl(${(index * 47) % 360} 80% 62%)`
}
