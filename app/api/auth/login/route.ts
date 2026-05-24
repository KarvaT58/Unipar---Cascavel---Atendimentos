import bcrypt from "bcryptjs"
import { NextResponse, type NextRequest } from "next/server"

import {
  createOfflineSession,
  findOfflineUserByEmail,
} from "@/lib/offline-auth-store"
import {
  canUseOfflineFallback,
  isLocalDataOnlyEnabled,
} from "@/lib/local-mode"
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
  const passwordCandidate =
    passwordDigits.length === 11 ? passwordDigits : password

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

  if (isLocalDataOnlyEnabled()) {
    return loginOfflineUser(email, passwordCandidate, request)
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } })

    if (!user || user.status !== "ACTIVE") {
      return invalidCredentialsResponse()
    }

    const passwordMatches = await bcrypt.compare(
      passwordCandidate,
      user.passwordHash
    )

    if (!passwordMatches) {
      return invalidCredentialsResponse()
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
    if (!canUseOfflineFallback()) {
      return NextResponse.json(
        {
          message:
            "Banco de dados indisponivel no momento. Tente novamente em instantes.",
        },
        { status: 503 }
      )
    }

    const offlineResponse = await loginOfflineUser(
      email,
      passwordCandidate,
      request
    )

    if (offlineResponse.status !== 503) {
      return offlineResponse
    }

    return NextResponse.json(
      {
        message:
          "Banco de dados indisponivel no momento. O usuario local inicial nao foi criado.",
      },
      { status: 503 }
    )
  }
}

async function loginOfflineUser(
  email: string,
  passwordCandidate: string,
  request: NextRequest
) {
  const offlineUser = await findOfflineUserByEmail(email).catch(() => null)

  if (!offlineUser) {
    return NextResponse.json(
      { message: "Usuario local nao encontrado." },
      { status: 503 }
    )
  }

  const passwordMatches = await bcrypt.compare(
    passwordCandidate,
    offlineUser.passwordHash
  )

  if (!passwordMatches) {
    return invalidCredentialsResponse()
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

function invalidCredentialsResponse() {
  return NextResponse.json(
    { message: "E-mail ou senha invalidos." },
    { status: 401 }
  )
}

function getString(body: unknown, key: string) {
  if (!body || typeof body !== "object" || !(key in body)) {
    return ""
  }

  const value = (body as Record<string, unknown>)[key]

  return typeof value === "string" ? value.trim() : ""
}
