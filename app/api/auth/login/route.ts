import bcrypt from "bcryptjs"
import { NextResponse, type NextRequest } from "next/server"

import {
  createOfflineSession,
  findOfflineUserByEmail,
} from "@/lib/offline-auth-store"
import { prisma } from "@/lib/prisma"
import { createSession, setSessionCookie } from "@/lib/session"
import {
  isInstitutionalEmail,
  normalizeEmail,
  onlyDigits,
} from "@/lib/validators"

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const email = normalizeEmail(getString(body, "email"))
  const password = getString(body, "password")
  const passwordDigits = onlyDigits(password)
  const passwordCandidate = passwordDigits.length === 11 ? passwordDigits : password

  if (!email || !password) {
    return NextResponse.json(
      { message: "Preencha e-mail e senha." },
      { status: 400 }
    )
  }

  if (!isInstitutionalEmail(email)) {
    return NextResponse.json(
      { message: "Acesse usando seu e-mail institucional @unipar.br." },
      { status: 400 }
    )
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } })

    if (!user || user.status !== "ACTIVE") {
      return NextResponse.json(
        { message: "E-mail ou senha inválidos." },
        { status: 401 }
      )
    }

    const passwordMatches = await bcrypt.compare(
      passwordCandidate,
      user.passwordHash
    )

    if (!passwordMatches) {
      return NextResponse.json(
        { message: "E-mail ou senha inválidos." },
        { status: 401 }
      )
    }

    const session = await createSession(user.id, request)
    const response = NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        sector: user.sector,
        role: user.role,
      },
    })

    setSessionCookie(response, session.token, session.expiresAt)

    return response
  } catch {
    const offlineUser = await findOfflineUserByEmail(email).catch(() => null)

    if (offlineUser) {
      const passwordMatches = await bcrypt.compare(
        passwordCandidate,
        offlineUser.passwordHash
      )

      if (!passwordMatches) {
        return NextResponse.json(
          { message: "E-mail ou senha inválidos." },
          { status: 401 }
        )
      }

      const session = await createOfflineSession(offlineUser.id, request)
      const response = NextResponse.json({
        user: {
          id: offlineUser.id,
          name: offlineUser.name,
          email: offlineUser.email,
          sector: offlineUser.sector,
          role: offlineUser.role,
        },
        offline: true,
      })

      setSessionCookie(response, session.token, session.expiresAt)

      return response
    }

    return NextResponse.json(
      {
        message:
          "Banco de dados indisponível no momento. No modo local, libere uma solicitação em Criação de usuários antes de entrar.",
      },
      { status: 503 }
    )
  }
}

function getString(body: unknown, key: string) {
  if (!body || typeof body !== "object" || !(key in body)) {
    return ""
  }

  const value = (body as Record<string, unknown>)[key]

  return typeof value === "string" ? value.trim() : ""
}
