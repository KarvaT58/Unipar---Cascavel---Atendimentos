import {
  EMPTY_APP_STATE,
  mergeAppStates,
  normalizeAppState,
  serializeAppState,
  type AppState,
  type AppStateEnvelope,
} from "@/lib/app-state"
import {
  SECTOR_OPTIONS,
  type AdminUser,
  type Sector,
} from "@/lib/admin-data"
import {
  canUseOfflineFallback,
  isLocalDataOnlyEnabled,
} from "@/lib/local-mode"
import { listOfflineUsers } from "@/lib/offline-auth-store"
import { isDatabaseConnectionError, prisma } from "@/lib/prisma"
import {
  readLatestOfflineRealtimeEventId,
  readOfflineAppState,
  readOfflineRealtimeEvents,
  saveOfflineAppState,
} from "@/lib/server/offline-state-store"
import type { Prisma } from "@/lib/generated/prisma/client"

const STATE_KEY = "main"
const DATABASE_RETRY_DELAY_MS = 30_000

let databaseFallbackUntil = 0
let databaseFallbackLogged = false

export interface RealtimeEvent {
  id: number
  clientId: string | null
  source: string
  createdAt: string
  payload: unknown
}

type AuthUserRow = {
  id: string
  name: string
  email: string
  sector: string
  phone?: string | null
  role: string
  status: string
  createdAt: Date | string
  updatedAt: Date | string
}

function toJsonValue(state: AppState) {
  return JSON.parse(serializeAppState(state)) as Prisma.InputJsonValue
}

export async function readAppState(): Promise<AppStateEnvelope> {
  if (shouldUseOfflineFallback()) {
    return withHydratedAuthUsers(await readOfflineAppState())
  }

  try {
    const document = await prisma.appStateDocument.findUnique({
      where: { key: STATE_KEY },
    })

    if (!document) {
      await prisma.appStateDocument.create({
        data: {
          key: STATE_KEY,
          data: toJsonValue(EMPTY_APP_STATE),
          revision: BigInt(0),
        },
      })

      return {
        state: await hydrateAppStateAuthUsers(EMPTY_APP_STATE),
        revision: 0,
        databaseConnected: true,
      }
    }

    return {
      state: await hydrateAppStateAuthUsers(normalizeAppState(document.data)),
      revision: Number(document.revision),
      databaseConnected: true,
    }
  } catch (error) {
    if (!canUseOfflineFallback()) {
      throw error
    }

    handleDatabaseFallback(error)

    return withHydratedAuthUsers(await readOfflineAppState())
  }
}

export async function saveAppState(
  state: AppState,
  clientId: string,
  source = "state"
) {
  if (shouldUseOfflineFallback()) {
    return saveOfflineAppState(state, clientId, source)
      .then(withHydratedAuthUsers)
      .catch(() => ({
        state,
        revision: 0,
        databaseConnected: false,
      }))
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const currentDocument = await tx.appStateDocument.findUnique({
        where: { key: STATE_KEY },
      })
      const stateToSave = currentDocument
        ? mergeAppStates(normalizeAppState(currentDocument.data), state)
        : state
      const document = currentDocument
        ? await tx.appStateDocument.update({
            where: { key: STATE_KEY },
            data: {
              data: toJsonValue(stateToSave),
              revision: { increment: BigInt(1) },
            },
          })
        : await tx.appStateDocument.create({
            data: {
              key: STATE_KEY,
              data: toJsonValue(stateToSave),
              revision: BigInt(1),
            },
          })
      const revision = Number(document.revision)

      await tx.realtimeEvent.create({
        data: {
          clientId,
          source,
          payload: {
            revision,
            key: STATE_KEY,
          },
        },
      })

      return {
        state: normalizeAppState(document.data),
        revision,
      }
    })

    return {
      ...result,
      state: await hydrateAppStateAuthUsers(result.state),
      databaseConnected: true,
    }
  } catch (error) {
    if (!canUseOfflineFallback()) {
      throw error
    }

    handleDatabaseFallback(error)

    return saveOfflineAppState(state, clientId, source)
      .then(withHydratedAuthUsers)
      .catch(() => ({
        state,
        revision: 0,
        databaseConnected: false,
      }))
  }
}

export async function readRealtimeEvents(afterId: number) {
  if (shouldUseOfflineFallback()) {
    return readOfflineRealtimeEvents(afterId).catch(() => [])
  }

  try {
    const events = await prisma.realtimeEvent.findMany({
      where: {
        id: { gt: BigInt(Math.max(0, Math.floor(afterId))) },
      },
      orderBy: { id: "asc" },
      take: 100,
    })

    return events.map<RealtimeEvent>((event) => ({
      id: Number(event.id),
      clientId: event.clientId,
      source: event.source,
      payload: event.payload,
      createdAt: event.createdAt.toISOString(),
    }))
  } catch (error) {
    if (!canUseOfflineFallback()) {
      throw error
    }

    handleDatabaseFallback(error)

    return readOfflineRealtimeEvents(afterId).catch(() => [])
  }
}

export async function readLatestRealtimeEventId() {
  if (shouldUseOfflineFallback()) {
    return readLatestOfflineRealtimeEventId().catch(() => 0)
  }

  try {
    const latestEvent = await prisma.realtimeEvent.findFirst({
      orderBy: { id: "desc" },
      select: { id: true },
    })

    return Number(latestEvent?.id ?? 0)
  } catch (error) {
    if (!canUseOfflineFallback()) {
      throw error
    }

    handleDatabaseFallback(error)

    return readLatestOfflineRealtimeEventId().catch(() => 0)
  }
}

function shouldUseOfflineFallback() {
  return (
    isLocalDataOnlyEnabled() ||
    (canUseOfflineFallback() && Date.now() < databaseFallbackUntil)
  )
}

async function withHydratedAuthUsers(envelope: AppStateEnvelope) {
  return {
    ...envelope,
    state: await hydrateAppStateAuthUsers(envelope.state),
  }
}

async function hydrateAppStateAuthUsers(state: AppState) {
  const authUsers = await readAuthUsers().catch(() => [])

  if (authUsers.length === 0) {
    return state
  }

  return {
    ...state,
    adminUsers: mergeAdminUsersWithAuthUsers(state.adminUsers, authUsers),
  }
}

async function readAuthUsers(): Promise<AuthUserRow[]> {
  if (shouldUseOfflineFallback()) {
    return listOfflineUsers()
  }

  try {
    return await prisma.user.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        sector: true,
        phone: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    })
  } catch (error) {
    if (!canUseOfflineFallback()) {
      throw error
    }

    handleDatabaseFallback(error)

    return listOfflineUsers()
  }
}

function mergeAdminUsersWithAuthUsers(
  stateUsers: AdminUser[],
  authUsers: AuthUserRow[]
) {
  const usersByEmail = new Map<string, AdminUser>()

  stateUsers.forEach((user) => {
    usersByEmail.set(user.email.toLowerCase(), user)
  })

  authUsers.forEach((authUser) => {
    const normalizedEmail = authUser.email.toLowerCase()
    const currentUser = usersByEmail.get(normalizedEmail)
    const nextUser = toAdminUser(authUser, currentUser)

    usersByEmail.set(normalizedEmail, nextUser)
  })

  return Array.from(usersByEmail.values()).sort((first, second) =>
    first.name.localeCompare(second.name)
  )
}

function toAdminUser(
  user: AuthUserRow,
  currentUser?: AdminUser
): AdminUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    sector: toWorkspaceSector(user.sector),
    password: currentUser?.password ?? "",
    isAdmin: user.role === "ADMIN",
    status: user.status === "DISABLED" ? "blocked" : "active",
    createdAt:
      user.createdAt instanceof Date ? user.createdAt : new Date(user.createdAt),
    avatar: currentUser?.avatar,
    about: currentUser?.about,
    chatStatus: currentUser?.chatStatus,
    workStatus: currentUser?.workStatus,
  }
}

function toWorkspaceSector(sector: string): Sector {
  const normalizedSector = sector.trim().toLowerCase()
  const sectorMap: Record<string, Sector> = {
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
    sju: "Serviço de Assistência Jurídica",
    mt: "Motorista",
  }

  return (
    sectorMap[normalizedSector] ??
    SECTOR_OPTIONS.find(
      (sectorOption) => sectorOption.toLowerCase() === normalizedSector
    ) ??
    "TI"
  )
}

function handleDatabaseFallback(error: unknown) {
  if (!isDatabaseConnectionError(error)) {
    console.error(error)
    return
  }

  databaseFallbackUntil = Date.now() + DATABASE_RETRY_DELAY_MS

  if (!databaseFallbackLogged) {
    databaseFallbackLogged = true
    console.warn(
      "Banco de dados indisponível. Usando fallback local até o PostgreSQL responder novamente."
    )
  }
}
