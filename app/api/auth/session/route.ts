import { NextResponse, type NextRequest } from "next/server"

import {
  SECTOR_OPTIONS,
  type Sector as UniparSector,
} from "@/lib/admin-data"
import {
  getUserPresenceSnapshot,
  markUserOffline,
} from "@/lib/server/presence"
import {
  clearSessionCookie,
  destroySession,
  getSessionUser,
  SESSION_COOKIE,
} from "@/lib/session"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const sectorMap: Record<string, UniparSector> = {
  ti: SECTOR_OPTIONS[0],
  man: SECTOR_OPTIONS[1],
  csc: SECTOR_OPTIONS[2],
  cpa: SECTOR_OPTIONS[3],
  cac: SECTOR_OPTIONS[4],
  cia: SECTOR_OPTIONS[5],
  sg: SECTOR_OPTIONS[6],
  dir: SECTOR_OPTIONS[7],
  odt: SECTOR_OPTIONS[8],
  cse: SECTOR_OPTIONS[9],
  ls: SECTOR_OPTIONS[10],
  est: SECTOR_OPTIONS[11],
  ap: SECTOR_OPTIONS[12],
  pm: SECTOR_OPTIONS[13],
  mnt: SECTOR_OPTIONS[14],
  bb: SECTOR_OPTIONS[15],
  sju: SECTOR_OPTIONS[16],
  mt: SECTOR_OPTIONS[17],
  fin: SECTOR_OPTIONS[18],
}

function toUniparSector(sector: string): UniparSector {
  const normalizedSector = sector.trim().toLowerCase()

  return sectorMap[normalizedSector] ?? SECTOR_OPTIONS[0]
}

export async function GET() {
  const user = await getSessionUser().catch(() => null)

  if (!user) {
    return NextResponse.json({ user: null }, { status: 401 })
  }

  const presence = await getUserPresenceSnapshot(user.id).catch(() => ({
    chatStatus: "online" as const,
    workStatus: "available" as const,
    lastSeenAt: new Date(),
  }))

  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      sector: toUniparSector(user.sector),
      isAdmin: user.role === "ADMIN",
      avatar: "",
      about: "Disponível",
      chatStatus: presence.chatStatus,
      workStatus: presence.workStatus,
      lastSeenAt: presence.lastSeenAt,
    },
  })
}

export async function DELETE(request: NextRequest) {
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
