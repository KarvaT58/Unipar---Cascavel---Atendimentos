import { NextResponse, type NextRequest } from "next/server"

import {
  clearSessionCookie,
  destroySession,
  SESSION_COOKIE,
} from "@/lib/session"

export async function POST(request: NextRequest) {
  await destroySession(request.cookies.get(SESSION_COOKIE)?.value)

  const response = NextResponse.json({ ok: true })

  clearSessionCookie(response)

  return response
}
