import { NextResponse } from "next/server"

import { canUseOfflineFallback } from "@/lib/local-mode"
import { createOfflinePasswordRecoveryRequest } from "@/lib/offline-auth-store"
import { prisma } from "@/lib/prisma"
import {
  isInstitutionalEmail,
  normalizeEmail,
  normalizeWhatsapp,
} from "@/lib/validators"

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const username = getString(body, "username")
  const email = normalizeEmail(getString(body, "email"))
  const sector = getString(body, "sector")
  const whatsapp = getString(body, "whatsapp")
  const whatsappDigits = normalizeWhatsapp(whatsapp)

  if (!username || !email || !sector || !whatsapp) {
    return NextResponse.json(
      { message: "Preencha todos os campos obrigatórios." },
      { status: 400 }
    )
  }

  if (!isInstitutionalEmail(email)) {
    return NextResponse.json(
      { message: "A recuperação aceita somente e-mails com final @unipar.br." },
      { status: 400 }
    )
  }

  if (!whatsappDigits) {
    return NextResponse.json(
      { message: "Informe o número com DDD, usando 10 ou 11 dígitos." },
      { status: 400 }
    )
  }

  try {
    await prisma.passwordRecoveryRequest.create({
      data: {
        username,
        email,
        sector,
        whatsapp: whatsappDigits,
      },
    })
  } catch {
    if (!canUseOfflineFallback()) {
      return NextResponse.json(
        { message: "Banco de dados indisponível no momento." },
        { status: 503 }
      )
    }

    const offlineResult = await createOfflinePasswordRecoveryRequest({
      username,
      email,
      sector,
      whatsapp: whatsappDigits,
    }).catch(() => null)

    if (offlineResult?.ok) {
      return NextResponse.json({
        ok: true,
        whatsapp: whatsappDigits,
        offline: true,
      })
    }

    if (offlineResult && !offlineResult.ok) {
      return NextResponse.json(
        { message: offlineResult.message },
        { status: offlineResult.status }
      )
    }

    return NextResponse.json(
      { message: "Banco de dados indisponível no momento." },
      { status: 503 }
    )
  }

  return NextResponse.json({ ok: true, whatsapp: whatsappDigits })
}

function getString(body: unknown, key: string) {
  if (!body || typeof body !== "object" || !(key in body)) {
    return ""
  }

  const value = (body as Record<string, unknown>)[key]

  return typeof value === "string" ? value.trim() : ""
}
