import { NextResponse, type NextRequest } from "next/server"

import {
  clearSessionCookie,
  destroySession,
  getSessionUser,
  SESSION_COOKIE,
} from "@/lib/session"
import type { Sector as UniparSector } from "@/lib/admin-data"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const sectorMap: Record<string, UniparSector> = {
  ti: "TI",
  man: "Manutenção",
  mnt: "Monitoramento",
  ap: "Administrador Predial",
  pm: "Patrimônio",
  fin: "Financeiro",
  cia: "Secretaria",
  bb: "Biblioteca",
  csc: "Coordenação",
  dir: "Direção",
  cac: "Atendimento",
  cpa: "Centro de Psicologia Aplicada",
  sg: "Serviços Gerais",
  odt: "Odontologia",
  cse: "Centro de Saúde Escola",
  ls: "Laboratórios de Saúde",
  est: "Esterilização",
  sju: "Serviço de Assistência Jurídica",
  mt: "Motorista",
}

function toUniparSector(sector: string): UniparSector {
  const normalizedSector = sector.trim().toLowerCase()

  return sectorMap[normalizedSector] ?? "TI"
}

export async function GET() {
  const user = await getSessionUser().catch(() => null)

  if (!user) {
    return NextResponse.json({ user: null }, { status: 401 })
  }

  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      sector: toUniparSector(user.sector),
      isAdmin: user.role === "ADMIN",
      avatar: "",
      about: "Disponível",
      chatStatus: "online",
      workStatus: "available",
    },
  })
}

export async function DELETE(request: NextRequest) {
  await destroySession(request.cookies.get(SESSION_COOKIE)?.value)

  const response = NextResponse.json({ ok: true })

  clearSessionCookie(response)

  return response
}
