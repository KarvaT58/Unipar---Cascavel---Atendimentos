import { NextResponse, type NextRequest } from "next/server"

import {
  clearSessionCookie,
  destroySession,
  getSessionUser,
  SESSION_COOKIE,
} from "@/lib/session"
import { markUserOffline } from "@/lib/server/presence"

export async function POST(request: NextRequest) {
  const user = await getSessionUser().catch(() => null)
  const body = (await request.json().catch(() => null)) as {
    clientId?: string
  } | null

  if (user) {
    await markUserOffline(user.id, body?.clientId).catch(() => undefined)
  }

  await destroySession(request.cookies.get(SESSION_COOKIE)?.value)

  const response = NextResponse.json({ ok: true })

  clearSessionCookie(response)

  return response
}
