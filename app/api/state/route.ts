import { NextResponse } from "next/server"

import { normalizeAppState } from "@/lib/app-state"
import { saveAppState } from "@/lib/server/state-store"
import { getSessionUser } from "@/lib/session"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function PUT(request: Request) {
  const currentUser = await getSessionUser().catch(() => null)

  if (!currentUser) {
    return NextResponse.json(
      { message: "Sessão expirada. Faça login novamente." },
      { status: 401 }
    )
  }

  try {
    const body = (await request.json()) as {
      clientId?: string
      source?: string
      state?: unknown
    }
    const clientId = body.clientId?.trim() || "unknown-client"
    const state = normalizeAppState(body.state)
    const source = body.source
      ? `${body.source}:${currentUser.id}`
      : `state:${currentUser.id}`

    return NextResponse.json(await saveAppState(state, clientId, source))
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save application data."

    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  return PUT(request)
}
