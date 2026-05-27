import { NextResponse } from "next/server"

import { readAppState } from "@/lib/server/state-store"
import { getSessionUser } from "@/lib/session"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET() {
  const currentUser = await getSessionUser().catch(() => null)

  if (!currentUser) {
    return NextResponse.json(
      { message: "Sessão expirada. Faça login novamente." },
      { status: 401 }
    )
  }

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
