import { redirect } from "next/navigation"

import { UserCreationAdmin } from "@/components/user-creation-admin"
import {
  listOfflineUsers,
  listPendingOfflineAccessRequests,
} from "@/lib/offline-auth-store"
import { canUseOfflineFallback } from "@/lib/local-mode"
import { prisma } from "@/lib/prisma"
import { getSectorLabel } from "@/lib/sectors"
import { decryptString } from "@/lib/security"
import { getSessionUser } from "@/lib/session"
import { formatDateBR, formatDateTimeBR, formatPhoneBR } from "@/lib/validators"

export const dynamic = "force-dynamic"

export default async function CriacaoUsuariosPage() {
  const currentUser = await getSessionUser().catch(() => null)

  if (!currentUser) {
    redirect("/login")
  }

  if (currentUser.role !== "ADMIN") {
    redirect("/dashboard")
  }

  const result = await prisma
    .$transaction([
      prisma.accessRequest.findMany({
        where: { status: "PENDING" },
        orderBy: { createdAt: "desc" },
      }),
      prisma.user.findMany({
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
      }),
    ])
    .then(([requests, users]) => ({
      requests,
      users,
      databaseError: undefined,
    }))
    .catch(async (error) => {
      if (!canUseOfflineFallback()) {
        throw error
      }

      return {
      requests: await listPendingOfflineAccessRequests(),
      users: await listOfflineUsers(),
      databaseError:
        "Banco de dados indisponível. Modo local de teste ativo até o PostgreSQL voltar.",
      }
    })

  return (
    <UserCreationAdmin
      databaseError={result.databaseError}
      currentUserId={currentUser.id}
      requests={result.requests.map((request) => {
        const sector = getSectorLabel(request.sector)

        return {
          id: request.id,
          name: request.name,
          email: request.email,
          sector: request.sector,
          sectorLabel: `${sector.code} - ${sector.name}`,
          phone: formatPhoneBR(request.phone),
          rawPhone: request.phone,
          cpf: safelyDecrypt(request.cpfCiphertext),
          createdAt: formatDateTimeBR(new Date(request.createdAt)),
        }
      })}
      users={result.users.map((user) => {
        const sector = getSectorLabel(user.sector)

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          sector: user.sector,
          sectorLabel: `${sector.code} - ${sector.name}`,
          phone: user.phone ? formatPhoneBR(user.phone) : "",
          rawPhone: user.phone ?? "",
          role: user.role === "ADMIN" ? "ADMIN" : "USER",
          status: user.status === "DISABLED" ? "DISABLED" : "ACTIVE",
          createdAt: formatDateBR(new Date(user.createdAt)),
          updatedAt: formatDateBR(new Date(user.updatedAt)),
        }
      })}
    />
  )
}

function safelyDecrypt(value: string) {
  try {
    return decryptString(value)
  } catch {
    return ""
  }
}
