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
  createAppStateAuditLogEntries,
  type AuditActor,
} from "@/lib/server/audit-log"
import { getHydratedPresenceSnapshot } from "@/lib/server/presence"
import {
  readLatestOfflineRealtimeEventId,
  readOfflineAppState,
  readOfflineRealtimeEvents,
  saveOfflineAppState,
} from "@/lib/server/offline-state-store"
import type { Prisma } from "@/lib/generated/prisma/client"

const STATE_KEY = "main"
const DATABASE_RETRY_DELAY_MS = 30_000
const STATE_TRANSACTION_MAX_WAIT_MS = 15_000
const STATE_TRANSACTION_TIMEOUT_MS = 20_000
const STATE_TRANSACTION_RETRY_DELAYS_MS = [250, 1_000, 2_500]

let databaseFallbackUntil = 0
let databaseFallbackLogged = false
let stateSaveQueue: Promise<void> = Promise.resolve()

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
  presence?: {
    chatStatus: string
    preferredChatStatus?: string | null
    workStatus: string
    lastSeenAt: Date | string | null
  } | null
}

type DatabaseSaveResult = {
  state: AppState
  revision: number
  hydrateAuthUsers?: boolean
}

function toJsonValue(state: AppState) {
  return JSON.parse(serializeAppState(state)) as Prisma.InputJsonValue
}

function omitEphemeralAppState(state: AppState): AppState {
  return {
    ...state,
    adminUsers: state.adminUsers.map((user) => {
      const persistentUser: AdminUser = { ...user }

      delete persistentUser.chatStatus
      delete persistentUser.lastSeenAt
      delete persistentUser.workStatus
      return persistentUser
    }),
    typingIndicators: EMPTY_APP_STATE.typingIndicators,
  }
}

function toComparableJsonValue(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString()
  }

  if (Array.isArray(value)) {
    return value.map((item) => toComparableJsonValue(item))
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entryValue]) => entryValue !== undefined)
        .sort(([firstKey], [secondKey]) => firstKey.localeCompare(secondKey))
        .map(([entryKey, entryValue]) => [
          entryKey,
          toComparableJsonValue(entryValue),
        ])
    )
  }

  return value
}

function serializeComparableAppState(state: AppState) {
  return JSON.stringify(toComparableJsonValue(omitEphemeralAppState(state)))
}

function hasPersistentStateChange(firstState: AppState, secondState: AppState) {
  return (
    serializeComparableAppState(firstState) !==
    serializeComparableAppState(secondState)
  )
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isTransactionStartTimeoutError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false
  }

  const errorRecord = error as Record<string, unknown>
  const message = String(errorRecord.message ?? "").toLowerCase()

  return (
    errorRecord.code === "P2028" &&
    message.includes("unable to start a transaction")
  )
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
  source = "state",
  actor?: AuditActor
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
    const result = await saveAppStateInDatabase(state, clientId, source, actor)

    return {
      ...result,
      state:
        result.hydrateAuthUsers === false
          ? result.state
          : await hydrateAppStateAuthUsers(result.state),
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

async function saveAppStateInDatabase(
  state: AppState,
  clientId: string,
  source: string,
  actor?: AuditActor
) {
  return enqueueStateSave(() =>
    saveAppStateInDatabaseNow(state, clientId, source, actor)
  )
}

function enqueueStateSave<T>(operation: () => Promise<T>) {
  const result = stateSaveQueue.then(operation, operation)

  stateSaveQueue = result.then(
    () => undefined,
    () => undefined
  )

  return result
}

async function saveAppStateInDatabaseNow(
  state: AppState,
  clientId: string,
  source: string,
  actor?: AuditActor
): Promise<DatabaseSaveResult> {
  for (
    let attempt = 0;
    attempt <= STATE_TRANSACTION_RETRY_DELAYS_MS.length;
    attempt += 1
  ) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const currentDocument = await tx.appStateDocument.findUnique({
            where: { key: STATE_KEY },
          })
          const incomingStateToSave = omitEphemeralAppState(state)
          const currentState = currentDocument
            ? normalizeAppState(currentDocument.data)
            : null

          if (currentDocument && currentState) {
            if (!hasPersistentStateChange(currentState, state)) {
              return {
                state,
                revision: Number(currentDocument.revision),
                hydrateAuthUsers: false,
              }
            }
          }

          const stateToSave = currentDocument
            ? mergeAppStates(
                omitEphemeralAppState(currentState ?? EMPTY_APP_STATE),
                incomingStateToSave
              )
            : incomingStateToSave

          if (
            currentDocument &&
            currentState &&
            !hasPersistentStateChange(currentState, stateToSave)
          ) {
            return {
              state,
              revision: Number(currentDocument.revision),
              hydrateAuthUsers: false,
            }
          }

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
          const auditEntries = createAppStateAuditLogEntries({
            actor,
            previousState: currentState ?? EMPTY_APP_STATE,
            nextState: stateToSave,
            revision,
            source,
          })

          if (auditEntries.length > 0) {
            await tx.auditLog.createMany({
              data: auditEntries,
            })
          }

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
        },
        {
          maxWait: STATE_TRANSACTION_MAX_WAIT_MS,
          timeout: STATE_TRANSACTION_TIMEOUT_MS,
        }
      )
    } catch (error) {
      const retryDelay = STATE_TRANSACTION_RETRY_DELAYS_MS[attempt]

      if (!isTransactionStartTimeoutError(error) || retryDelay === undefined) {
        throw error
      }

      await delay(retryDelay)
    }
  }

  throw new Error("Não foi possível iniciar a transação para salvar o estado.")
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
        presence: {
          select: {
            chatStatus: true,
            preferredChatStatus: true,
            workStatus: true,
            lastSeenAt: true,
          },
        },
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
  const presence = getHydratedPresenceSnapshot(
    user.presence ?? {
      chatStatus: currentUser?.chatStatus,
      workStatus: currentUser?.workStatus,
      lastSeenAt: currentUser?.lastSeenAt,
    }
  )

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
    chatStatus: presence.chatStatus,
    workStatus: presence.workStatus,
    lastSeenAt: presence.lastSeenAt,
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
    est: "Esterilização",
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
