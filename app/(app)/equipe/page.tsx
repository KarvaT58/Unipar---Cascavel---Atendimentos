import { TeamDirectory, type TeamUser } from "@/components/team-directory"
import { listOfflineUsers } from "@/lib/offline-auth-store"
import { prisma } from "@/lib/prisma"
import { getSectorLabel } from "@/lib/sectors"
import { formatPhoneBR } from "@/lib/validators"

export const dynamic = "force-dynamic"

export default async function EquipePage() {
  const users = await getTeamUsers()

  return <TeamDirectory users={users} />
}

async function getTeamUsers(): Promise<TeamUser[]> {
  const users = await prisma.user
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
    .catch(() => listOfflineUsers())

  return users.map((user) => {
    const sector = getSectorLabel(user.sector)

    const role: TeamUser["role"] = user.role === "ADMIN" ? "ADMIN" : "USER"

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone ? formatPhoneBR(user.phone) : "",
      role,
      sector: user.sector,
      sectorLabel: `${sector.code} - ${sector.name}`,
    }
  })
}
