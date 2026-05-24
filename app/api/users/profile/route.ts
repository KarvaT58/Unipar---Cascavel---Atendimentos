import { NextResponse } from "next/server"

import { isLocalDataOnlyEnabled } from "@/lib/local-mode"
import { getSessionUser } from "@/lib/session"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function PUT() {
  const user = await getSessionUser().catch(() => null)

  if (!user) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  return NextResponse.json({
    ok: true,
    databaseConnected: !isLocalDataOnlyEnabled(),
  })
}
