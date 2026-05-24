"use server"

import bcrypt from "bcryptjs"
import { revalidatePath } from "next/cache"
import type { Prisma } from "@/lib/generated/prisma/client"

import {
  deleteOfflineUser,
  getOfflineAccessRequestDetails,
  getOfflineUserDetails,
  rejectOfflineAccessRequest,
  saveOfflineUser,
  setOfflineUserBlocked,
} from "@/lib/offline-auth-store"
import { canUseOfflineFallback } from "@/lib/local-mode"
import { prisma } from "@/lib/prisma"
import {
  decryptString,
  encryptString,
  hashSensitiveValue,
} from "@/lib/security"
import { getSessionUser } from "@/lib/session"
import {
  isInstitutionalEmail,
  normalizeAccessPhone,
  normalizeEmail,
} from "@/lib/validators"

type UserRoleValue = "USER" | "ADMIN"
type UserStatusValue = "ACTIVE" | "DISABLED"

export type ActionResult = {
  ok: boolean
  message: string
}

export type UserRowPayload = {
  id: string
  name: string
  email: string
  sector: string
  phone: string | null
  role: UserRoleValue
  status: UserStatusValue
  createdAt: string
  updatedAt: string
}

export type UserDetailsPayload = UserRowPayload & {
  cpf: string
  password: string
}

export type AccessRequestDetailsPayload = {
  id: string
  name: string
  email: string
  sector: string
  phone: string
  cpf: string
}

export type SaveUserInput = {
  id?: string
  requestId?: string
  name: string
  email: string
  sector: string
  phone: string
  password: string
  confirmPassword: string
  isAdmin: boolean
}

type SaveUserResult = ActionResult & {
  user?: UserRowPayload
}

type DetailsResult<T> = ActionResult & {
  data?: T
}

class DuplicateDataError extends Error {}

export async function getAccessRequestDetails(
  requestId: string
): Promise<DetailsResult<AccessRequestDetailsPayload>> {
  const admin = await requireAdmin()

  if (!admin.ok) {
    return admin
  }

  try {
    const request = await prisma.accessRequest.findUnique({
      where: { id: requestId },
      select: {
        id: true,
        name: true,
        email: true,
        sector: true,
        phone: true,
        cpfCiphertext: true,
        status: true,
      },
    })

    if (!request || request.status !== "PENDING") {
      return {
        ok: false,
        message: "Solicitação não encontrada ou já analisada.",
      }
    }

    return {
      ok: true,
      message: "Dados carregados.",
      data: {
        id: request.id,
        name: request.name,
        email: request.email,
        sector: request.sector,
        phone: request.phone,
        cpf: decryptString(request.cpfCiphertext),
      },
    }
  } catch {
    if (!canUseOfflineFallback()) {
      return {
        ok: false,
        message: "Banco de dados indisponivel no momento.",
      }
    }

    const offlineRequest = await getOfflineAccessRequestDetails(requestId).catch(
      () => null
    )

    if (!offlineRequest) {
      return {
        ok: false,
        message: "Solicitação não encontrada no modo local.",
      }
    }

    return {
      ok: true,
      message: "Dados carregados.",
      data: offlineRequest,
    }
  }
}

export async function getUserDetails(
  userId: string
): Promise<DetailsResult<UserDetailsPayload>> {
  const admin = await requireAdmin()

  if (!admin.ok) {
    return admin
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        sector: true,
        phone: true,
        cpfCiphertext: true,
        passwordCiphertext: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    if (!user) {
      return { ok: false, message: "Usuário não encontrado." }
    }

    return {
      ok: true,
      message: "Usuário carregado.",
      data: {
        ...toUserPayload(user),
        cpf: safelyDecrypt(user.cpfCiphertext),
        password: safelyDecrypt(user.passwordCiphertext),
      },
    }
  } catch {
    if (!canUseOfflineFallback()) {
      return {
        ok: false,
        message: "Banco de dados indisponivel no momento.",
      }
    }

    const offlineUser = await getOfflineUserDetails(userId).catch(() => null)

    if (!offlineUser) {
      return { ok: false, message: "Usuário não encontrado no modo local." }
    }

    return {
      ok: true,
      message: "Usuário carregado.",
      data: offlineUser,
    }
  }
}

export async function saveUser(
  input: SaveUserInput
): Promise<SaveUserResult> {
  const admin = await requireAdmin()

  if (!admin.ok) {
    return admin
  }

  const validation = await validateUserInput(input)

  if (!validation.ok) {
    return validation
  }

  const data = validation.data
  const role = input.id === admin.userId ? "ADMIN" : data.role

  try {
    const user = await prisma.$transaction(async (tx) => {
      const duplicateWhere: Prisma.UserWhereInput[] = [
        { email: data.email },
        { phone: data.phone },
      ]

      if (data.cpfHash) {
        duplicateWhere.push({ cpfHash: data.cpfHash })
      }

      const duplicateUser = await tx.user.findFirst({
        where: {
          OR: duplicateWhere,
          ...(input.id ? { NOT: { id: input.id } } : {}),
        },
        select: {
          email: true,
          phone: true,
          cpfHash: true,
        },
      })

      if (duplicateUser) {
        throw new DuplicateDataError(
          getDuplicateUserMessage(duplicateUser, {
            email: data.email,
            phone: data.phone,
            cpfHash: data.cpfHash,
          })
        )
      }

      if (input.id) {
        const updateData: Prisma.UserUpdateInput = {
          name: data.name,
          email: data.email,
          sector: data.sector,
          phone: data.phone,
          role,
        }

        if (data.cpfHash) {
          updateData.cpfHash = data.cpfHash
          updateData.cpfCiphertext = data.cpfCiphertext
        }

        if (data.passwordHash) {
          updateData.passwordHash = data.passwordHash
          updateData.passwordCiphertext = data.passwordCiphertext
        }

        return tx.user.update({
          where: { id: input.id },
          data: updateData,
        })
      }

      if (!data.cpfHash || !data.passwordHash) {
        throw new Error("CPF e senha são obrigatórios para criar usuário.")
      }

      const createdUser = await tx.user.create({
        data: {
          name: data.name,
          email: data.email,
          sector: data.sector,
          phone: data.phone,
          cpfHash: data.cpfHash,
          cpfCiphertext: data.cpfCiphertext,
          passwordHash: data.passwordHash,
          passwordCiphertext: data.passwordCiphertext,
          role,
          status: "ACTIVE",
        },
      })

      if (input.requestId) {
        await tx.accessRequest.updateMany({
          where: { id: input.requestId, status: "PENDING" },
          data: {
            status: "APPROVED",
            approvedAt: new Date(),
            handledById: admin.userId,
            createdUserId: createdUser.id,
          },
        })
      }

      return createdUser
    })

    revalidatePath("/criacao-usuarios")

    return {
      ok: true,
      message: input.id ? "Usuário atualizado." : "Usuário criado.",
      user: toUserPayload(user),
    }
  } catch (error) {
    if (error instanceof DuplicateDataError) {
      return {
        ok: false,
        message: error.message,
      }
    }

    if (!canUseOfflineFallback()) {
      return {
        ok: false,
        message: "Banco de dados indisponivel no momento.",
      }
    }

    try {
      const offlineUser = await saveOfflineUser({
        id: input.id,
        requestId: input.requestId,
        name: data.name,
        email: data.email,
        sector: data.sector,
        phone: data.phone,
        cpfHash: data.cpfHash,
        cpfCiphertext: data.cpfCiphertext,
        passwordHash: data.passwordHash,
        passwordCiphertext: data.passwordCiphertext,
        role,
      })

      revalidatePath("/criacao-usuarios")

      return {
        ok: true,
        message: input.id
          ? "Usuário local atualizado."
          : "Usuário local criado.",
        user: offlineUser,
      }
    } catch (offlineError) {
      return {
        ok: false,
        message:
          offlineError instanceof Error
            ? offlineError.message
            : error instanceof Error
              ? error.message
              : "Não foi possível salvar o usuário.",
      }
    }
  }
}

export async function rejectAccessRequest(
  requestId: string
): Promise<ActionResult> {
  const admin = await requireAdmin()

  if (!admin.ok) {
    return admin
  }

  const result = await prisma.accessRequest
    .updateMany({
      where: { id: requestId, status: "PENDING" },
      data: {
        status: "REJECTED",
        rejectedAt: new Date(),
        handledById: admin.userId,
      },
    })
    .catch(() => null)

  if (!result) {
    if (!canUseOfflineFallback()) {
      return {
        ok: false,
        message: "Banco de dados indisponivel no momento.",
      }
    }

    return rejectOfflineAccessRequest(requestId, admin.userId)
      .then(() => {
        revalidatePath("/criacao-usuarios")

        return {
          ok: true,
          message: "Solicitação local rejeitada.",
        }
      })
      .catch((error) => ({
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Banco de dados indisponível no momento.",
      }))
  }

  if (!result.count) {
    return {
      ok: false,
      message: "Solicitação não encontrada ou já analisada.",
    }
  }

  revalidatePath("/criacao-usuarios")

  return {
    ok: true,
    message: "Solicitação rejeitada.",
  }
}

export async function setUserBlocked(
  userId: string,
  blocked: boolean
): Promise<SaveUserResult> {
  const admin = await requireAdmin()

  if (!admin.ok) {
    return admin
  }

  if (userId === admin.userId && blocked) {
    return {
      ok: false,
      message: "Você não pode bloquear o próprio usuário administrador.",
    }
  }

  try {
    const user = await prisma.$transaction(async (tx) => {
      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: { status: blocked ? "DISABLED" : "ACTIVE" },
      })

      if (blocked) {
        await tx.session.deleteMany({ where: { userId } })
      }

      return updatedUser
    })

    revalidatePath("/criacao-usuarios")

    return {
      ok: true,
      message: blocked ? "Usuário bloqueado." : "Usuário desbloqueado.",
      user: toUserPayload(user),
    }
  } catch (error) {
    if (!canUseOfflineFallback()) {
      return {
        ok: false,
        message: "Banco de dados indisponivel no momento.",
      }
    }

    try {
      const offlineUser = await setOfflineUserBlocked(userId, blocked)

      revalidatePath("/criacao-usuarios")

      return {
        ok: true,
        message: blocked
          ? "Usuário local bloqueado."
          : "Usuário local desbloqueado.",
        user: offlineUser,
      }
    } catch (offlineError) {
      return {
        ok: false,
        message:
          offlineError instanceof Error
            ? offlineError.message
            : error instanceof Error
              ? error.message
              : "Não foi possível alterar o status do usuário.",
      }
    }
  }
}

export async function deleteUser(userId: string): Promise<ActionResult> {
  const admin = await requireAdmin()

  if (!admin.ok) {
    return admin
  }

  if (userId === admin.userId) {
    return {
      ok: false,
      message: "Você não pode apagar o próprio usuário administrador.",
    }
  }

  try {
    await prisma.user.delete({ where: { id: userId } })

    revalidatePath("/criacao-usuarios")

    return { ok: true, message: "Usuário apagado." }
  } catch (error) {
    if (!canUseOfflineFallback()) {
      return {
        ok: false,
        message: "Banco de dados indisponivel no momento.",
      }
    }

    try {
      await deleteOfflineUser(userId)

      revalidatePath("/criacao-usuarios")

      return { ok: true, message: "Usuário local apagado." }
    } catch (offlineError) {
      return {
        ok: false,
        message:
          offlineError instanceof Error
            ? offlineError.message
            : error instanceof Error
              ? error.message
              : "Não foi possível apagar o usuário.",
      }
    }
  }
}

async function requireAdmin() {
  const currentUser = await getSessionUser().catch(() => null)

  if (!currentUser) {
    return {
      ok: false as const,
      message: "Entre como administrador para continuar.",
    }
  }

  if (currentUser.role !== "ADMIN") {
    return {
      ok: false as const,
      message: "Apenas administradores podem gerenciar usuários.",
    }
  }

  return {
    ok: true as const,
    userId: currentUser.id,
  }
}

async function validateUserInput(input: SaveUserInput) {
  const name = input.name.trim()
  const email = normalizeEmail(input.email)
  const sector = input.sector.trim()
  const phoneDigits = normalizeAccessPhone(input.phone)
  const password = input.password.trim()
  const confirmPassword = input.confirmPassword.trim()
  const shouldUpdatePassword =
    !input.id || Boolean(password || confirmPassword)

  if (!name || !email || !sector || !phoneDigits) {
    return {
      ok: false as const,
      message: "Preencha nome, e-mail, setor e telefone.",
    }
  }

  if (!isInstitutionalEmail(email)) {
    return {
      ok: false as const,
      message: "Use apenas e-mail institucional @unipar.br.",
    }
  }

  if (shouldUpdatePassword && (!password || !confirmPassword)) {
    return {
      ok: false as const,
      message: "Preencha a senha e a confirmação de senha.",
    }
  }

  if (shouldUpdatePassword && password !== confirmPassword) {
    return {
      ok: false as const,
      message: "Senha e confirmação de senha precisam ser iguais.",
    }
  }

  if (shouldUpdatePassword && password.length < 8) {
    return {
      ok: false as const,
      message: "A senha precisa ter pelo menos 8 caracteres.",
    }
  }

  if (!input.id && !password) {
    return {
      ok: false as const,
      message: "Informe a senha para criar o usuário.",
    }
  }

  return {
    ok: true as const,
    data: {
      name,
      email,
      sector,
      phone: phoneDigits,
      role: (input.isAdmin ? "ADMIN" : "USER") as UserRoleValue,
      cpfHash: shouldUpdatePassword ? hashSensitiveValue(password) : undefined,
      cpfCiphertext: shouldUpdatePassword ? encryptString(password) : undefined,
      passwordHash: shouldUpdatePassword
        ? await bcrypt.hash(password, 12)
        : undefined,
      passwordCiphertext: shouldUpdatePassword
        ? encryptString(password)
        : undefined,
    },
  }
}

function toUserPayload(user: {
  id: string
  name: string
  email: string
  sector: string
  phone: string | null
  role: string
  status: string
  createdAt: Date | string
  updatedAt: Date | string
}): UserRowPayload {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    sector: user.sector,
    phone: user.phone,
    role: user.role === "ADMIN" ? "ADMIN" : "USER",
    status: user.status === "DISABLED" ? "DISABLED" : "ACTIVE",
    createdAt:
      user.createdAt instanceof Date ? user.createdAt.toISOString() : user.createdAt,
    updatedAt:
      user.updatedAt instanceof Date ? user.updatedAt.toISOString() : user.updatedAt,
  }
}

function safelyDecrypt(value?: string | null) {
  if (!value) {
    return ""
  }

  try {
    return decryptString(value)
  } catch {
    return ""
  }
}

function getDuplicateUserMessage(
  user: { email: string; phone: string | null; cpfHash: string },
  input: { email: string; phone: string; cpfHash?: string }
) {
  if (user.email === input.email) {
    return `O e-mail ${input.email} já está vinculado a outro usuário.`
  }

  if (user.phone === input.phone) {
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
