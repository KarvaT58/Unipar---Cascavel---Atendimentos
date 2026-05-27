import { NextResponse } from "next/server"

import { SECTOR_OPTIONS, type Sector } from "@/lib/admin-data"
import type { AppState, GroupMetadataState } from "@/lib/app-state"
import { readAppState } from "@/lib/server/state-store"
import { getSessionUser } from "@/lib/session"
import { getSectorLabel } from "@/lib/sectors"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

type SearchResult = {
  id: string
  title: string
  description: string
  href: string
  type: string
}

export async function GET(request: Request) {
  const currentUser = await getSessionUser().catch(() => null)

  if (!currentUser) {
    return NextResponse.json(
      { message: "Sessao expirada. Faca login novamente." },
      { status: 401 }
    )
  }

  const { searchParams } = new URL(request.url)
  const query = searchParams.get("q")?.trim() ?? ""

  if (query.length < 2) {
    return NextResponse.json({ results: [] satisfies SearchResult[] })
  }

  const { state } = await readAppState()
  const currentSector = toWorkspaceSector(currentUser.sector)
  const results = searchAppState({
    currentSector,
    isAdmin: currentUser.role === "ADMIN",
    query,
    state,
    userId: currentUser.id,
  })

  return NextResponse.json({ results })
}

function searchAppState({
  currentSector,
  isAdmin,
  query,
  state,
  userId,
}: {
  currentSector: Sector
  isAdmin: boolean
  query: string
  state: AppState
  userId: string
}) {
  const results: SearchResult[] = []
  const addResult = (result: SearchResult, haystack: Array<unknown>) => {
    if (results.length >= 20) return
    if (!matchesQuery(query, haystack)) return

    results.push(result)
  }

  state.serviceTickets.forEach((ticket) => {
    if (!canSeeTicket(ticket, userId, currentSector, isAdmin)) return

    addResult(
      {
        id: `ticket:${ticket.id}`,
        title: ticket.title,
        description: `${ticket.requesterName} - ${ticket.targetSector}`,
        href: `/atendimentos?focus=${encodeURIComponent(ticket.id)}`,
        type: "Atendimento",
      },
      [
        ticket.title,
        ticket.description,
        ticket.requesterName,
        ticket.targetSector,
        ticket.assignedToName,
      ]
    )
  })

  state.loanRequests.forEach((loan) => {
    if (!canSeeLoan(loan, userId, currentSector, isAdmin)) return

    addResult(
      {
        id: `loan:${loan.id}`,
        title: loan.title,
        description: `${loan.requesterName} - devolucao ${loan.requestedReturnDate}`,
        href: `/emprestimos?focus=${encodeURIComponent(loan.id)}`,
        type: "Emprestimo",
      },
      [
        loan.title,
        loan.description,
        loan.requesterName,
        loan.requesterSector,
        loan.lenderSector,
        loan.patrimonyNumber,
      ]
    )
  })

  state.announcementEvents.forEach((event) => {
    if (!isAdmin && event.creatorId !== userId && !event.recipientIds.includes(userId)) {
      return
    }

    addResult(
      {
        id: `announcement:${event.id}`,
        title: event.title,
        description: `${event.creatorName} - ${event.scheduledAt.toLocaleDateString("pt-BR")}`,
        href: `/anuncios-eventos?focus=${encodeURIComponent(event.id)}`,
        type: "Anuncio/Eventos",
      },
      [event.title, event.description, event.creatorName, event.responsibleName]
    )
  })

  state.contacts.forEach((contact) => {
    if (contact.ownerId && contact.ownerId !== userId) return
    if (contact.hiddenForUserIds?.includes(userId)) return

    addResult(
      {
        id: `conversation:${contact.id}`,
        title: contact.name,
        description: contact.email || "Conversa interna",
        href: `/chat-interno?conversation=${encodeURIComponent(contact.id)}`,
        type: "Chat Interno",
      },
      [contact.name, contact.email, contact.about, contact.lastMessage]
    )
  })

  state.groups.forEach((group) => {
    if (!canSeeGroup(group.id, userId, state.groupMetadataById)) return

    addResult(
      {
        id: `group:${group.id}`,
        title: group.name,
        description: "Grupo interno",
        href: `/grupos?group=${encodeURIComponent(group.id)}`,
        type: "Grupos",
      },
      [group.name, group.about, group.lastMessage]
    )
  })

  state.adminUsers.forEach((user) => {
    addResult(
      {
        id: `user:${user.id}`,
        title: user.name,
        description: `${user.email} - ${user.sector}`,
        href: "/equipe",
        type: "Equipe",
      },
      [user.name, user.email, user.sector]
    )
  })

  state.extensionItems.forEach((extension) => {
    addResult(
      {
        id: `extension:${extension.id}`,
        title: extension.name,
        description: `${extension.sector} - Ramal ${extension.extension}`,
        href: "/ramais",
        type: "Ramais",
      },
      [extension.name, extension.sector, extension.extension]
    )
  })

  state.helpItems.forEach((item) => {
    addResult(
      {
        id: `help:${item.id}`,
        title: item.title,
        description: `${item.images.length} imagem(ns) no guia`,
        href: "/ajuda",
        type: "Ajuda",
      },
      [item.title]
    )
  })

  return results
}

function canSeeTicket(
  ticket: AppState["serviceTickets"][number],
  userId: string,
  sector: Sector,
  isAdmin: boolean
) {
  return (
    isAdmin ||
    ticket.requesterId === userId ||
    ticket.assignedToId === userId ||
    ticket.requesterSector === sector ||
    ticket.targetSector === sector ||
    ticket.assignedToSector === sector
  )
}

function canSeeLoan(
  loan: AppState["loanRequests"][number],
  userId: string,
  sector: Sector,
  isAdmin: boolean
) {
  return (
    isAdmin ||
    loan.requesterId === userId ||
    loan.approvedById === userId ||
    loan.returnedById === userId ||
    loan.resolvedById === userId ||
    loan.requesterSector === sector ||
    loan.lenderSector === sector
  )
}

function canSeeGroup(
  groupId: string,
  userId: string,
  metadataById: Record<string, GroupMetadataState>
) {
  const metadata = metadataById[groupId]

  if (!metadata) return false

  return new Set([
    metadata.creatorId,
    ...metadata.adminIds,
    ...metadata.participantIds,
  ]).has(userId)
}

function matchesQuery(query: string, values: Array<unknown>) {
  const normalizedQuery = normalizeSearchText(query)

  return values.some((value) =>
    normalizeSearchText(String(value ?? "")).includes(normalizedQuery)
  )
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

function toWorkspaceSector(sector: string): Sector {
  const sectorLabel = getSectorLabel(sector).name
  const normalizedSector = normalizeSearchText(sector)
  const normalizedLabel = normalizeSearchText(sectorLabel)

  return (
    SECTOR_OPTIONS.find(
      (option) =>
        normalizeSearchText(option) === normalizedSector ||
        normalizeSearchText(option) === normalizedLabel
    ) ?? "TI"
  )
}
