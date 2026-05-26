"use client"

import * as React from "react"
import dynamic from "next/dynamic"
import { usePathname } from "next/navigation"

import type { UniparWorkspaceInitialUser } from "@/components/unipar-workspace"

const Workspace = dynamic<{
  initialUser?: UniparWorkspaceInitialUser | null
}>(() =>
  import("@/components/unipar-workspace").then(
    (module) => module.UniparWorkspace
  )
)

const workspacePaths = new Set([
  "/ajuda",
  "/anuncios-eventos",
  "/atendimentos",
  "/chat-interno",
  "/emprestimos",
  "/grupos",
  "/kanban",
  "/ramais",
])

function normalizePathname(pathname: string | null) {
  return pathname?.replace(/\/+$/, "") || "/"
}

export function WorkspaceRouteSlot({
  children,
  initialUser,
}: {
  children: React.ReactNode
  initialUser: UniparWorkspaceInitialUser | null
}) {
  const pathname = usePathname()

  if (workspacePaths.has(normalizePathname(pathname))) {
    return <Workspace initialUser={initialUser} />
  }

  return <>{children}</>
}
