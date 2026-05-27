import { NextResponse } from "next/server"

import { prisma } from "@/lib/prisma"
import { getSessionUser } from "@/lib/session"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: Request) {
  const currentUser = await getSessionUser().catch(() => null)

  if (!currentUser) {
    return NextResponse.json(
      { message: "Sessao expirada. Faca login novamente." },
      { status: 401 }
    )
  }

  if (currentUser.role !== "ADMIN") {
    return NextResponse.json({ message: "Acesso negado." }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const limit = Math.min(
    100,
    Math.max(1, Number(searchParams.get("limit") ?? 50) || 50)
  )
  const entityType = searchParams.get("entityType")?.trim()

  const logs = await prisma.auditLog.findMany({
    where: entityType ? { entityType } : undefined,
    orderBy: { createdAt: "desc" },
    take: limit,
  })

  return NextResponse.json({
    logs: logs.map((log) => ({
      id: log.id,
      actorId: log.actorId,
      actorName: log.actorName,
      actorEmail: log.actorEmail,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      summary: log.summary,
      metadata: log.metadata,
      createdAt: log.createdAt.toISOString(),
    })),
  })
}
