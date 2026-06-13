import * as React from "react"
import { redirect } from "next/navigation"

import { AppHeader } from "@/components/app-header"
import { AppSidebar } from "@/components/app-sidebar"
import { PageTransition } from "@/components/page-transition"
import { PresenceTracker } from "@/components/presence-tracker"
import { PriorityMessageGlobalAlert } from "@/components/priority-message-global-alert"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { WorkspaceRouteSlot } from "@/components/workspace-route-slot"
import type { Sector as WorkspaceSector } from "@/lib/admin-data"
import { getSectorLabel } from "@/lib/sectors"
import { getSessionUser } from "@/lib/session"

const serviceTicketSectorMap: Record<string, WorkspaceSector> = {
  ap: "Administrador Predial",
  bb: "Biblioteca",
  cac: "Atendimento",
  cia: "Secretaria",
  cpa: "Centro de Psicologia Aplicada",
  csc: "Coordenação",
  cse: "Centro de Saúde Escola",
  dir: "Direção",
  fin: "Financeiro",
  est: "Esterilização",
  ls: "Laboratórios de Saúde",
  man: "Manutenção",
  mnt: "Monitoramento",
  mt: "Motorista",
  odt: "Odontologia",
  pm: "Patrimônio",
  sg: "Serviços Gerais",
  sju: "Serviço de Assistência Jurídica",
  ti: "TI",
}

function toServiceTicketSector(sector?: string | null): WorkspaceSector {
  return serviceTicketSectorMap[sector?.trim().toLowerCase() ?? ""] ?? "TI"
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const currentUser = await getSessionUser().catch(() => null)

  if (!currentUser) {
    redirect("/login")
  }

  const currentSector = getSectorLabel(currentUser?.sector)
  const workspaceUser = currentUser
    ? {
        id: currentUser.id,
        name: currentUser.name,
        email: currentUser.email,
        sector: toServiceTicketSector(currentUser.sector),
        isAdmin: currentUser.role === "ADMIN",
        avatar: "",
      }
    : null

  return (
    <SidebarProvider>
      <PresenceTracker />
      <PriorityMessageGlobalAlert userId={currentUser?.id ?? ""} />
      <AppSidebar
        user={{
          name: currentUser?.name ?? "Usuário",
          email: currentUser?.email ?? "usuario@example.com",
          id: currentUser?.id ?? "",
          avatar: "",
          notificationSector: toServiceTicketSector(currentUser?.sector),
          sectorCode: currentSector.code,
          sectorName: currentSector.name,
          isAdmin: currentUser?.role === "ADMIN",
        }}
      />
      <SidebarInset className="h-svh overflow-hidden bg-sidebar p-2 md:pl-0">
        <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-sidebar">
          <AppHeader />
          <div className="relative flex min-h-0 flex-1 flex-col gap-4 overflow-hidden rounded-xl bg-background px-4 pb-6 pt-5">
            <PageTransition>
              <WorkspaceRouteSlot initialUser={workspaceUser}>
                {children}
              </WorkspaceRouteSlot>
            </PageTransition>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
