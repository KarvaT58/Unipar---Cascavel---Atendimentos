import { NextResponse } from "next/server"

import { readAppState } from "@/lib/server/state-store"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET() {
  try {
    return NextResponse.json(await readAppState())
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to load application data."

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
