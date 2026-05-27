import { DashboardContent } from "@/components/dashboard-content"
import { SECTOR_OPTIONS, type Sector } from "@/lib/admin-data"
import { readAppState } from "@/lib/server/state-store"
import { getSessionUser } from "@/lib/session"
import type { ServiceTicket } from "@/lib/service-ticket-data"

export const dynamic = "force-dynamic"

const currentUserChartColor = "#ff0018"
const DASHBOARD_CHART_DAYS = 90

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
  const fallbackParticipants = buildParticipants(currentUser)
  const fallback = createFallbackDashboardData({
    participants: fallbackParticipants,
    sectorLabel: currentSector,
    userName: currentUser.name,
  })

  try {
    const { state } = await readAppState()
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
        DASHBOARD_CHART_DAYS
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
      color: currentUserChartColor,
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
    chartData: createEmptyChartData(participants, DASHBOARD_CHART_DAYS),
    databaseError: undefined as string | undefined,
  }
}

function buildParticipants(
  currentUser: { id: string; name: string }
): ChartParticipant[] {
  return [
    {
      key: "series_0",
      name: currentUser.name,
      color: currentUserChartColor,
      userId: currentUser.id,
    },
  ]
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

