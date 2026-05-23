import { redirect } from "next/navigation"

import { UniparWorkspace } from "@/components/unipar-workspace"
import { getSessionUser } from "@/lib/session"

export default async function AdministracaoPage() {
  const currentUser = await getSessionUser().catch(() => null)

  if (!currentUser) {
    redirect("/login")
  }

  if (currentUser.role !== "ADMIN") {
    redirect("/dashboard")
  }

  return <UniparWorkspace activeNav="admin" />
}