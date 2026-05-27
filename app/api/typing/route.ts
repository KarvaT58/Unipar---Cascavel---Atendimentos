import { NextResponse } from "next/server"

import { prisma } from "@/lib/prisma"
import { getSessionUser } from "@/lib/session"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

type TypingScope = "chat" | "group"

function getString(body: Record<string, unknown>, key: string) {
  const value = body[key]

  return typeof value === "string" ? value.trim() : undefined
}

function getTypingScope(value: unknown): TypingScope | null {
  return value === "chat" || value === "group" ? value : null
}

export async function POST(request: Request) {
  const currentUser = await getSessionUser().catch(() => null)

  if (!currentUser) {
    return NextResponse.json(
      { message: "Sessão expirada. Faça login novamente." },
      { status: 401 }
    )
  }

  const body = ((await request.json().catch(() => ({}))) ?? {}) as Record<
    string,
    unknown
  >
  const scope = getTypingScope(body.scope)
  const targetId = getString(body, "targetId")
  const clientId = getString(body, "clientId") ?? null

  if (!scope || !targetId) {
    return NextResponse.json(
      { message: "Indicador de digitação inválido." },
      { status: 400 }
    )
  }

  await prisma.realtimeEvent.create({
    data: {
      clientId,
      source: `typing:${currentUser.id}`,
      payload: {
        key: "typing",
        typing: {
          scope,
          targetId,
          userId: currentUser.id,
          userName: currentUser.name,
          isTyping: body.isTyping === true,
          updatedAt: new Date().toISOString(),
        },
      },
    },
  })

  return NextResponse.json({ ok: true })
}

export async function PUT(request: Request) {
  return POST(request)
}
