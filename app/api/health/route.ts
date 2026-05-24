import { NextResponse } from "next/server"

import {
  isLocalDataBlockedInProduction,
  isLocalDataOnlyEnabled,
  isLocalDataOnlyRequested,
  isProductionRuntime,
} from "@/lib/local-mode"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET() {
  const databaseUrlConfigured = Boolean(process.env.DATABASE_URL?.trim())
  const localDataOnlyEnabled = isLocalDataOnlyEnabled()
  const localDataOnlyBlocked = isLocalDataBlockedInProduction()
  let databaseReachable = false
  let databaseStatus = "not-configured"

  if (localDataOnlyEnabled) {
    databaseStatus = "skipped-local-data-only"
  } else if (databaseUrlConfigured) {
    try {
      await prisma.$queryRawUnsafe("SELECT 1")
      databaseReachable = true
      databaseStatus = "reachable"
    } catch {
      databaseStatus = "unreachable"
    }
  }

  const ok =
    !localDataOnlyBlocked &&
    (localDataOnlyEnabled
      ? !isProductionRuntime()
      : databaseUrlConfigured && databaseReachable)

  return NextResponse.json(
    {
      ok,
      service: "unipar-atendimentos",
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV ?? "development",
      localDataOnly: {
        requested: isLocalDataOnlyRequested(),
        enabled: localDataOnlyEnabled,
        blockedInProduction: localDataOnlyBlocked,
      },
      database: {
        configured: databaseUrlConfigured,
        reachable: databaseReachable,
        status: databaseStatus,
      },
    },
    { status: ok ? 200 : 503 }
  )
}
