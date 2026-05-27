import { NextResponse } from "next/server"

import {
  isUserChatStatus,
  isUserWorkStatus,
} from "@/lib/presence"
import { updateUserPresence } from "@/lib/server/presence"
import { getSessionUser } from "@/lib/session"
import type { UserChatStatus, UserWorkStatus } from "@/lib/admin-data"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

type PresenceState = "active" | "inactive"

function getString(body: Record<string, unknown>, key: string) {
  const value = body[key]

  return typeof value === "string" ? value.trim() : undefined
}

function getPresenceState(value: unknown): PresenceState {
  return value === "inactive" ? "inactive" : "active"
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
  const chatStatus = isUserChatStatus(body.chatStatus)
    ? (body.chatStatus as UserChatStatus)
    : undefined
  const workStatus = isUserWorkStatus(body.workStatus)
    ? (body.workStatus as UserWorkStatus)
    : undefined
  const presence = await updateUserPresence({
    userId: currentUser.id,
    clientId: getString(body, "clientId"),
    chatStatus,
    workStatus,
    state: getPresenceState(body.state),
    source: getString(body, "source") ?? "presence:api",
  })

  return NextResponse.json({ ok: true, presence })
}

export async function PUT(request: Request) {
  return POST(request)
}
