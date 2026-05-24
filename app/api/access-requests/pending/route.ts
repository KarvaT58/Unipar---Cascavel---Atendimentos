import { NextResponse } from "next/server"

import { canUseOfflineFallback } from "@/lib/local-mode"
import { listPendingOfflineAccessRequests } from "@/lib/offline-auth-store"
import { prisma } from "@/lib/prisma"
import { getSectorLabel } from "@/lib/sectors"
import { decryptString } from "@/lib/security"
import { getSessionUser } from "@/lib/session"
import { formatDateTimeBR, formatPhoneBR } from "@/lib/validators"

export const dynamic = "force-dynamic"

export async function GET() {
  const currentUser = await getSessionUser().catch(() => null)

  if (!currentUser || currentUser.role !== "ADMIN") {
    return NextResponse.json(
      { message: "Apenas administradores podem ver solicitações." },
      { status: 403 }
    )
  }

  const requests = await prisma.accessRequest
    .findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "desc" },
    })
    .catch((error) => {
      if (!canUseOfflineFallback()) {
        throw error
      }

      return listPendingOfflineAccessRequests()
    })

  return NextResponse.json({
    requests: requests.map((request) => {
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
    }),
  })
}

function safelyDecrypt(value: string) {
  try {
    return decryptString(value)
  } catch {
    return ""
  }
}
