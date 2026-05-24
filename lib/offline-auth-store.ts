import bcrypt from "bcryptjs"
import { randomUUID } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import type { NextRequest } from "next/server"

import {
  canUseOfflineFallback,
  isLocalDataOnlyEnabled,
  readBooleanEnv,
  shouldSeedLocalAdminUser,
} from "@/lib/local-mode"
import {
  createRandomToken,
  decryptString,
  encryptString,
  hashSensitiveValue,
  hashToken,
} from "@/lib/security"

type OfflineUserStatus = "ACTIVE" | "DISABLED"
type OfflineUserRole = "USER" | "ADMIN"
type OfflineAccessRequestStatus = "PENDING" | "APPROVED" | "REJECTED"
type OfflinePasswordRecoveryStatus = "PENDING" | "RESOLVED" | "DISMISSED"

type OfflineUser = {
  id: string
  name: string
  email: string
  sector: string
  phone: string | null
  cpfHash: string
  cpfCiphertext?: string | null
  passwordHash: string
  passwordCiphertext?: string | null
  role: OfflineUserRole
  status: OfflineUserStatus
  createdAt: string
  updatedAt: string
}

type OfflineSession = {
  id: string
  userId: string
  tokenHash: string
  expiresAt: string
  userAgent?: string | null
  ipAddress?: string | null
  createdAt: string
}

export type OfflineAccessRequest = {
  id: string
  name: string
  email: string
  sector: string
  phone: string
  cpfHash: string
  cpfCiphertext: string
  cpfLast4: string
  status: OfflineAccessRequestStatus
  acceptedTerms: boolean
  approvedAt?: string | null
  rejectedAt?: string | null
  handledById?: string | null
  createdUserId?: string | null
  createdAt: string
  updatedAt: string
}

type OfflinePasswordRecoveryRequest = {
  id: string
  username: string
  email: string
  sector: string
  whatsapp: string
  status: OfflinePasswordRecoveryStatus
  resolvedAt?: string | null
  createdAt: string
  updatedAt: string
}

type OfflineStore = {
  version: 1
  users: OfflineUser[]
  sessions: OfflineSession[]
  accessRequests: OfflineAccessRequest[]
  passwordRecoveryRequests: OfflinePasswordRecoveryRequest[]
}

type OfflineUserForSession = {
  id: string
  name: string
  email: string
  sector: string
  phone: string | null
  cpfHash: string
  cpfCiphertext?: string | null
  passwordHash: string
  passwordCiphertext?: string | null
  role: OfflineUserRole
  status: OfflineUserStatus
  createdAt: Date
  updatedAt: Date
}

type OfflineAccessRequestInput = {
  name: string
  email: string
  sector: string
  phone: string
  cpfHash: string
  cpfCiphertext: string
  cpfLast4: string
}

type OfflinePasswordRecoveryInput = {
  username: string
  email: string
  sector: string
  whatsapp: string
}

export type OfflineUserRow = {
  id: string
  name: string
  email: string
  sector: string
  phone: string | null
  role: OfflineUserRole
  status: OfflineUserStatus
  createdAt: string
  updatedAt: string
}

export type OfflineUserDetails = OfflineUserRow & {
  cpf: string
  password: string
}

export type OfflineAccessRequestDetails = {
  id: string
  name: string
  email: string
  sector: string
  phone: string
  cpf: string
}

export type OfflineUserSaveInput = {
  id?: string
  requestId?: string
  name: string
  email: string
  sector: string
  phone: string
  cpfHash?: string
  cpfCiphertext?: string
  passwordHash?: string
  passwordCiphertext?: string
  role: OfflineUserRole
  status?: OfflineUserStatus
}

type OfflineWriteResult =
  | { ok: true }
  | { ok: false; status: number; message: string }

const offlineStorePath = path.join(
  process.cwd(),
  ".local-data",
  "auth-fallback.json"
)
const sessionMaxAgeSeconds = 60 * 60 * 24 * 7

let updateChain: Promise<void> = Promise.resolve()

export function isOfflineFallbackEnabled() {
  if (!canUseOfflineFallback()) {
    return false
  }

  return (
    isLocalDataOnlyEnabled() ||
    readBooleanEnv(process.env.AUTH_OFFLINE_FALLBACK) ||
    process.env.NODE_ENV === "development"
  )
}

export async function ensureDefaultOfflineAdminUser() {
  if (!isOfflineFallbackEnabled() || !shouldSeedLocalAdminUser()) {
    return null
  }

  const config = getDefaultOfflineAdminConfig()

  return updateOfflineStore(async (store) => {
    const now = new Date().toISOString()
    const existingUser = store.users.find(
      (user) =>
        user.id === "offline_user_local_admin" ||
        user.email.toLowerCase() === config.email
    )

    if (existingUser) {
      existingUser.name = existingUser.name || config.name
      existingUser.email = config.email
      existingUser.sector = existingUser.sector || config.sector
      existingUser.phone = existingUser.phone || config.phone
      existingUser.role = "ADMIN"
      existingUser.status = "ACTIVE"
      existingUser.updatedAt = now

      return toUserRow(existingUser)
    }

    const user: OfflineUser = {
      id: "offline_user_local_admin",
      name: config.name,
      email: config.email,
      sector: config.sector,
      phone: config.phone,
      cpfHash: hashSensitiveValue(config.cpf),
      cpfCiphertext: encryptString(config.cpf),
      passwordHash: await bcrypt.hash(config.password, 12),
      passwordCiphertext: encryptString(config.password),
      role: "ADMIN",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    }

    store.users.push(user)

    return toUserRow(user)
  })
}

export async function createOfflineAccessRequest(
  input: OfflineAccessRequestInput
): Promise<OfflineWriteResult> {
  if (!isOfflineFallbackEnabled()) {
    return offlineDisabledResult()
  }

  return updateOfflineStore((store) => {
    const existingUser = store.users.find(
      (user) =>
        user.email === input.email ||
        user.phone === input.phone ||
        user.cpfHash === input.cpfHash
    )

    if (existingUser) {
      return {
        ok: false,
        status: 409,
        message: getOfflineDuplicateAccessUserMessage(existingUser, input),
      }
    }

    const existingRequest = store.accessRequests.find(
      (request) =>
        request.status === "PENDING" &&
        (request.email === input.email ||
          request.phone === input.phone ||
          request.cpfHash === input.cpfHash)
    )

    if (existingRequest) {
      return {
        ok: false,
        status: 409,
        message: getOfflineDuplicateAccessRequestMessage(
          existingRequest,
          input
        ),
      }
    }

    const now = new Date().toISOString()

    store.accessRequests.push({
      id: `offline_access_${randomUUID()}`,
      name: input.name,
      email: input.email,
      sector: input.sector,
      phone: input.phone,
      cpfHash: input.cpfHash,
      cpfCiphertext: input.cpfCiphertext,
      cpfLast4: input.cpfLast4,
      status: "PENDING",
      acceptedTerms: true,
      approvedAt: null,
      rejectedAt: null,
      handledById: null,
      createdUserId: null,
      createdAt: now,
      updatedAt: now,
    })

    return { ok: true }
  })
}

export async function createOfflinePasswordRecoveryRequest(
  input: OfflinePasswordRecoveryInput
): Promise<OfflineWriteResult> {
  if (!isOfflineFallbackEnabled()) {
    return offlineDisabledResult()
  }

  return updateOfflineStore((store) => {
    const now = new Date().toISOString()

    store.passwordRecoveryRequests.push({
      id: `offline_recovery_${randomUUID()}`,
      username: input.username,
      email: input.email,
      sector: input.sector,
      whatsapp: input.whatsapp,
      status: "PENDING",
      resolvedAt: null,
      createdAt: now,
      updatedAt: now,
    })

    return { ok: true }
  })
}

export async function listPendingOfflineAccessRequests() {
  if (!isOfflineFallbackEnabled()) {
    return []
  }

  const store = await readOfflineStore()

  return store.accessRequests
    .filter((request) => request.status === "PENDING")
    .sort((first, second) => second.createdAt.localeCompare(first.createdAt))
}

export async function listOfflineUsers(): Promise<OfflineUserRow[]> {
  if (!isOfflineFallbackEnabled()) {
    return []
  }

  await ensureDefaultOfflineAdminUser().catch(logOfflineAdminSeedError)

  const store = await readOfflineStore()

  return store.users
    .map(toUserRow)
    .sort((first, second) => first.name.localeCompare(second.name))
}

export async function getOfflineAccessRequestDetails(
  requestId: string
): Promise<OfflineAccessRequestDetails | null> {
  if (!isOfflineFallbackEnabled()) {
    return null
  }

  const store = await readOfflineStore()
  const accessRequest = store.accessRequests.find(
    (request) => request.id === requestId && request.status === "PENDING"
  )

  if (!accessRequest) {
    return null
  }

  return {
    id: accessRequest.id,
    name: accessRequest.name,
    email: accessRequest.email,
    sector: accessRequest.sector,
    phone: accessRequest.phone,
    cpf: decryptString(accessRequest.cpfCiphertext),
  }
}

export async function getOfflineUserDetails(
  userId: string
): Promise<OfflineUserDetails | null> {
  if (!isOfflineFallbackEnabled()) {
    return null
  }

  const store = await readOfflineStore()
  const user = store.users.find((storedUser) => storedUser.id === userId)

  if (!user) {
    return null
  }

  return {
    ...toUserRow(user),
    cpf: user.cpfCiphertext ? decryptString(user.cpfCiphertext) : "",
    password: user.passwordCiphertext
      ? decryptString(user.passwordCiphertext)
      : "",
  }
}

export async function saveOfflineUser(input: OfflineUserSaveInput) {
  assertOfflineFallbackEnabled()

  return updateOfflineStore((store) => {
    const now = new Date().toISOString()
    const currentUser = input.id
      ? store.users.find((user) => user.id === input.id)
      : null

    if (input.id && !currentUser) {
      throw new Error("Usuário não encontrado.")
    }

    const duplicateUser = store.users.find(
      (user) =>
        user.id !== input.id &&
        (user.email === input.email ||
          user.phone === input.phone ||
          Boolean(input.cpfHash && user.cpfHash === input.cpfHash))
    )

    if (duplicateUser) {
      throw new Error(getOfflineDuplicateUserMessage(duplicateUser, input))
    }

    if (currentUser) {
      currentUser.name = input.name
      currentUser.email = input.email
      currentUser.sector = input.sector
      currentUser.phone = input.phone
      currentUser.role = input.role
      currentUser.status = input.status ?? currentUser.status
      currentUser.updatedAt = now

      if (input.cpfHash) {
        currentUser.cpfHash = input.cpfHash
        currentUser.cpfCiphertext = input.cpfCiphertext ?? null
      }

      if (input.passwordHash) {
        currentUser.passwordHash = input.passwordHash
        currentUser.passwordCiphertext = input.passwordCiphertext ?? null
      }

      return toUserRow(currentUser)
    }

    if (!input.cpfHash || !input.passwordHash) {
      throw new Error("CPF e senha são obrigatórios para criar usuário.")
    }

    const user: OfflineUser = {
      id: `offline_user_${randomUUID()}`,
      name: input.name,
      email: input.email,
      sector: input.sector,
      phone: input.phone,
      cpfHash: input.cpfHash,
      cpfCiphertext: input.cpfCiphertext ?? null,
      passwordHash: input.passwordHash,
      passwordCiphertext: input.passwordCiphertext ?? null,
      role: input.role,
      status: input.status ?? "ACTIVE",
      createdAt: now,
      updatedAt: now,
    }

    store.users.push(user)

    if (input.requestId) {
      const accessRequest = store.accessRequests.find(
        (request) => request.id === input.requestId
      )

      if (accessRequest?.status === "PENDING") {
        accessRequest.status = "APPROVED"
        accessRequest.approvedAt = now
        accessRequest.createdUserId = user.id
        accessRequest.updatedAt = now
      }
    }

    return toUserRow(user)
  })
}

export async function setOfflineUserBlocked(userId: string, blocked: boolean) {
  assertOfflineFallbackEnabled()

  return updateOfflineStore((store) => {
    const user = store.users.find((storedUser) => storedUser.id === userId)

    if (!user) {
      throw new Error("Usuário não encontrado.")
    }

    user.status = blocked ? "DISABLED" : "ACTIVE"
    user.updatedAt = new Date().toISOString()

    if (blocked) {
      store.sessions = store.sessions.filter(
        (session) => session.userId !== user.id
      )
    }

    return toUserRow(user)
  })
}

export async function deleteOfflineUser(userId: string) {
  assertOfflineFallbackEnabled()

  return updateOfflineStore((store) => {
    const userExists = store.users.some((user) => user.id === userId)

    if (!userExists) {
      throw new Error("Usuário não encontrado.")
    }

    store.users = store.users.filter((user) => user.id !== userId)
    store.sessions = store.sessions.filter(
      (session) => session.userId !== userId
    )

    return { ok: true }
  })
}

export async function approveOfflineAccessRequest(
  requestId: string,
  handledById?: string
) {
  assertOfflineFallbackEnabled()

  return updateOfflineStore(async (store) => {
    const accessRequest = store.accessRequests.find(
      (request) => request.id === requestId
    )

    if (!accessRequest || accessRequest.status !== "PENDING") {
      throw new Error("Solicitação não encontrada ou já analisada.")
    }

    const existingUser = store.users.find(
      (user) =>
        user.email === accessRequest.email ||
        user.phone === accessRequest.phone ||
        user.cpfHash === accessRequest.cpfHash
    )

    if (existingUser) {
      throw new Error(
        getOfflineDuplicateAccessUserMessage(existingUser, accessRequest)
      )
    }

    const cpf = decryptString(accessRequest.cpfCiphertext)
    const now = new Date().toISOString()
    const user: OfflineUser = {
      id: `offline_user_${randomUUID()}`,
      name: accessRequest.name,
      email: accessRequest.email,
      sector: accessRequest.sector,
      phone: accessRequest.phone,
      cpfHash: accessRequest.cpfHash,
      cpfCiphertext: accessRequest.cpfCiphertext,
      passwordHash: await bcrypt.hash(cpf, 12),
      passwordCiphertext: encryptString(cpf),
      role: "USER",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    }

    store.users.push(user)

    accessRequest.status = "APPROVED"
    accessRequest.approvedAt = now
    accessRequest.handledById = handledById ?? null
    accessRequest.createdUserId = user.id
    accessRequest.updatedAt = now

    return {
      name: accessRequest.name,
      email: accessRequest.email,
    }
  })
}

export async function rejectOfflineAccessRequest(
  requestId: string,
  handledById?: string
) {
  assertOfflineFallbackEnabled()

  return updateOfflineStore((store) => {
    const accessRequest = store.accessRequests.find(
      (request) => request.id === requestId
    )

    if (!accessRequest || accessRequest.status !== "PENDING") {
      throw new Error("Solicitação não encontrada ou já analisada.")
    }

    const now = new Date().toISOString()

    accessRequest.status = "REJECTED"
    accessRequest.rejectedAt = now
    accessRequest.handledById = handledById ?? null
    accessRequest.updatedAt = now

    return { ok: true }
  })
}

export async function findOfflineUserByEmail(email: string) {
  if (!isOfflineFallbackEnabled()) {
    return null
  }

  await ensureDefaultOfflineAdminUser().catch(logOfflineAdminSeedError)

  const store = await readOfflineStore()
  const user = store.users.find(
    (storeUser) =>
      storeUser.email === email && storeUser.status === "ACTIVE"
  )

  return user ? toSessionUser(user) : null
}

export async function createOfflineSession(
  userId: string,
  request?: NextRequest | Request
) {
  assertOfflineFallbackEnabled()

  const token = createRandomToken()
  const expiresAt = new Date(Date.now() + sessionMaxAgeSeconds * 1000)
  const headers = request?.headers

  await updateOfflineStore((store) => {
    store.sessions.push({
      id: `offline_session_${randomUUID()}`,
      userId,
      tokenHash: hashToken(token),
      expiresAt: expiresAt.toISOString(),
      userAgent: headers?.get("user-agent"),
      ipAddress:
        headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        headers?.get("x-real-ip"),
      createdAt: new Date().toISOString(),
    })

    return { ok: true }
  })

  return { token, expiresAt }
}

export async function getOfflineSessionUser(token?: string) {
  if (!token || !isOfflineFallbackEnabled()) {
    return null
  }

  await ensureDefaultOfflineAdminUser().catch(logOfflineAdminSeedError)

  const tokenHash = hashToken(token)
  const now = new Date()
  const store = await readOfflineStore()
  const session = store.sessions.find(
    (storedSession) => storedSession.tokenHash === tokenHash
  )

  if (!session) {
    return null
  }

  if (new Date(session.expiresAt) <= now) {
    await destroyOfflineSession(token)
    return null
  }

  const user = store.users.find(
    (storedUser) =>
      storedUser.id === session.userId && storedUser.status === "ACTIVE"
  )

  return user ? toSessionUser(user) : null
}

export async function destroyOfflineSession(token?: string) {
  if (!token || !isOfflineFallbackEnabled()) {
    return
  }

  const tokenHash = hashToken(token)

  await updateOfflineStore((store) => {
    store.sessions = store.sessions.filter(
      (session) => session.tokenHash !== tokenHash
    )

    return { ok: true }
  }).catch(() => undefined)
}

async function updateOfflineStore<T>(
  update: (store: OfflineStore) => T | Promise<T>
) {
  const run = updateChain.then(async () => {
    const store = await readOfflineStore()
    const result = await update(store)

    await writeOfflineStore(store)

    return result
  })

  updateChain = run.then(
    () => undefined,
    () => undefined
  )

  return run
}

async function readOfflineStore(): Promise<OfflineStore> {
  try {
    const file = await readFile(offlineStorePath, "utf8")
    const parsed = JSON.parse(file) as Partial<OfflineStore>

    return {
      version: 1,
      users: Array.isArray(parsed.users) ? parsed.users : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      accessRequests: Array.isArray(parsed.accessRequests)
        ? parsed.accessRequests
        : [],
      passwordRecoveryRequests: Array.isArray(
        parsed.passwordRecoveryRequests
      )
        ? parsed.passwordRecoveryRequests
        : [],
    }
  } catch {
    return createEmptyStore()
  }
}

async function writeOfflineStore(store: OfflineStore) {
  await mkdir(path.dirname(offlineStorePath), { recursive: true })
  await writeFile(offlineStorePath, JSON.stringify(store, null, 2), "utf8")
}

function createEmptyStore(): OfflineStore {
  return {
    version: 1,
    users: [],
    sessions: [],
    accessRequests: [],
    passwordRecoveryRequests: [],
  }
}

function getDefaultOfflineAdminConfig() {
  const email =
    process.env.LOCAL_AUTH_USER_EMAIL?.trim().toLowerCase() ||
    "dev@unipar.br"
  const password = process.env.LOCAL_AUTH_USER_PASSWORD || "12345678"
  const name = process.env.LOCAL_AUTH_USER_NAME?.trim() || "Dev Local"
  const sector =
    process.env.LOCAL_AUTH_USER_SECTOR?.trim().toLowerCase() || "ti"
  const phone = normalizeOptionalDigits(
    process.env.LOCAL_AUTH_USER_PHONE ?? "45999999999"
  )
  const cpf = normalizeLocalCpf(process.env.LOCAL_AUTH_USER_CPF)

  return {
    name,
    email,
    password,
    sector,
    phone,
    cpf,
  }
}

function normalizeOptionalDigits(value: string) {
  const digits = onlyDigits(value)

  return digits || null
}

function normalizeLocalCpf(value: string | undefined) {
  const digits = onlyDigits(value ?? "")

  return digits.length === 11 ? digits : "00000000000"
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, "")
}

function toUserRow(user: OfflineUser): OfflineUserRow {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    sector: user.sector,
    phone: user.phone,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }
}

function toSessionUser(user: OfflineUser): OfflineUserForSession {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    sector: user.sector,
    phone: user.phone,
    cpfHash: user.cpfHash,
    cpfCiphertext: user.cpfCiphertext,
    passwordHash: user.passwordHash,
    passwordCiphertext: user.passwordCiphertext,
    role: user.role,
    status: user.status,
    createdAt: new Date(user.createdAt),
    updatedAt: new Date(user.updatedAt),
  }
}

function assertOfflineFallbackEnabled() {
  if (!isOfflineFallbackEnabled()) {
    throw new Error("Modo local de teste não está habilitado.")
  }
}

function logOfflineAdminSeedError(error: unknown) {
  console.warn("Nao foi possivel criar o usuario local inicial.", error)
}

function offlineDisabledResult(): OfflineWriteResult {
  return {
    ok: false,
    status: 503,
    message: "Banco de dados indisponível no momento.",
  }
}

function getOfflineDuplicateAccessUserMessage(
  user: Pick<OfflineUser, "email" | "phone" | "cpfHash">,
  input: Pick<OfflineAccessRequestInput, "email" | "phone" | "cpfHash" | "cpfCiphertext">
) {
  if (user.email === input.email) {
    return `O e-mail ${input.email} já está vinculado a um usuário.`
  }

  if (user.phone === input.phone) {
    return `O telefone ${formatPhoneForMessage(input.phone)} já está vinculado a um usuário.`
  }

  if (user.cpfHash === input.cpfHash) {
    return `O CPF ${formatCpfForMessage(decryptString(input.cpfCiphertext))} já está vinculado a um usuário.`
  }

  return "Esses dados já estão vinculados a um usuário."
}

function getOfflineDuplicateAccessRequestMessage(
  request: Pick<OfflineAccessRequest, "email" | "phone" | "cpfHash">,
  input: Pick<OfflineAccessRequestInput, "email" | "phone" | "cpfHash" | "cpfCiphertext">
) {
  if (request.email === input.email) {
    return `Já existe uma solicitação pendente para o e-mail ${input.email}.`
  }

  if (request.phone === input.phone) {
    return `Já existe uma solicitação pendente para o telefone ${formatPhoneForMessage(input.phone)}.`
  }

  if (request.cpfHash === input.cpfHash) {
    return `Já existe uma solicitação pendente para o CPF ${formatCpfForMessage(decryptString(input.cpfCiphertext))}.`
  }

  return "Já existe uma solicitação pendente para esses dados."
}

function getOfflineDuplicateUserMessage(
  user: Pick<OfflineUser, "email" | "phone" | "cpfHash">,
  input: Pick<OfflineUserSaveInput, "email" | "phone" | "cpfHash">
) {
  if (user.email === input.email) {
    return `O e-mail ${input.email} já está vinculado a outro usuário.`
  }

  if (user.phone && user.phone === input.phone) {
    return `O telefone ${formatPhoneForMessage(input.phone)} já está vinculado a outro usuário.`
  }

  if (input.cpfHash && user.cpfHash === input.cpfHash) {
    return "A senha informada já está vinculada a outro usuário."
  }

  return "Já existe outro usuário com esses dados."
}

function formatPhoneForMessage(phone: string) {
  return `${phone.slice(0, 2)} ${phone.slice(2, 7)}-${phone.slice(7)}`
}

function formatCpfForMessage(cpf: string) {
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`
}
