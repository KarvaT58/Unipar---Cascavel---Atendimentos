import { NextResponse } from "next/server"

import type { Prisma } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { getSessionUser } from "@/lib/session"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const CALL_SIGNAL_TYPES = new Set([
  "offer",
  "answer",
  "decline",
  "end",
  "timeout",
  "busy",
])
const CALL_KINDS = new Set(["audio", "video"])

function getString(body: Record<string, unknown>, key: string) {
  const value = body[key]

  return typeof value === "string" ? value.trim() : undefined
}

function getRecord(value: unknown) {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null
}

export async function POST(request: Request) {
  const currentUser = await getSessionUser().catch(() => null)

  if (!currentUser) {
    return NextResponse.json(
      { message: "Sessao expirada. Faca login novamente." },
      { status: 401 }
    )
  }

  const body = ((await request.json().catch(() => ({}))) ?? {}) as Record<
    string,
    unknown
  >
  const signal = getRecord(body.signal)
  const clientId = getString(body, "clientId") ?? null

  if (!signal) {
    return NextResponse.json(
      { message: "Sinal de chamada invalido." },
      { status: 400 }
    )
  }

  const type = getString(signal, "type")
  const callId = getString(signal, "callId")
  const toUserId = getString(signal, "toUserId")
  const kind = getString(signal, "kind")

  if (
    !type ||
    !CALL_SIGNAL_TYPES.has(type) ||
    !callId ||
    !toUserId ||
    !kind ||
    !CALL_KINDS.has(kind)
  ) {
    return NextResponse.json(
      { message: "Sinal de chamada incompleto." },
      { status: 400 }
    )
  }

  const conversationId = getString(signal, "conversationId") ?? toUserId
  const callPayload: Prisma.InputJsonValue = {
    key: "call",
    call: {
      type,
      callId,
      kind,
      conversationId,
      fromUserId: currentUser.id,
      fromUserName: currentUser.name,
      fromUserEmail: currentUser.email,
      fromUserAvatar: getString(signal, "fromUserAvatar") ?? "",
      toUserId,
      reason: getString(signal, "reason") ?? null,
      createdAt: new Date().toISOString(),
    },
  }

  await prisma.realtimeEvent.create({
    data: {
      clientId,
      source: `call:${currentUser.id}`,
      payload: callPayload,
    },
  })

  return NextResponse.json({ ok: true })
}

export async function PUT(request: Request) {
  return POST(request)
}
