import { NextResponse } from "next/server"

import { normalizeAppState } from "@/lib/app-state"
import { saveAppState } from "@/lib/server/state-store"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as {
      clientId?: string
      source?: string
      state?: unknown
    }
    const clientId = body.clientId?.trim() || "unknown-client"
    const state = normalizeAppState(body.state)

    return NextResponse.json(await saveAppState(state, clientId, body.source))
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save application data."

    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  return PUT(request)
}
