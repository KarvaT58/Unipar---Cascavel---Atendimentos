import { TeamDirectory, type TeamUser } from "@/components/team-directory"
import type { AdminUser } from "@/lib/admin-data"
import { listOfflineUsers } from "@/lib/offline-auth-store"
import { prisma } from "@/lib/prisma"
import { readAppState } from "@/lib/server/state-store"
import { getSectorLabel } from "@/lib/sectors"
import { formatPhoneBR } from "@/lib/validators"

export const dynamic = "force-dynamic"

export default async function EquipePage() {
  const users = await getTeamUsers()

  return <TeamDirectory users={users} />
}

async function getTeamUsers(): Promise<TeamUser[]> {
  const [users, appStateEnvelope] = await Promise.all([
    prisma.user
      .findMany({
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          sector: true,
        },
      })
      .catch(() => listOfflineUsers()),
    readAppState().catch(() => null),
  ])
  const profileUsersByEmail = new Map<string, AdminUser>()

  appStateEnvelope?.state.adminUsers.forEach((user) => {
    profileUsersByEmail.set(user.email.toLowerCase(), user)
  })

  return users.map((user) => {
    const profileUser = profileUsersByEmail.get(user.email.toLowerCase())
    const sector = getSectorLabel(user.sector)

    const role: TeamUser["role"] = user.role === "ADMIN" ? "ADMIN" : "USER"

    return {
      id: user.id,
      name: profileUser?.name ?? user.name,
      email: user.email,
      phone: user.phone ? formatPhoneBR(user.phone) : "",
      role,
      sector: user.sector,
      sectorLabel: `${sector.code} - ${sector.name}`,
      avatar: profileUser?.avatar ?? "",
      about: profileUser?.about ?? "",
      chatStatus: profileUser?.chatStatus ?? "offline",
      workStatus: profileUser?.workStatus ?? "available",
      lastSeenAt: profileUser?.lastSeenAt,
    }
  })
}
