"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  BellIcon,
  ChartNoAxesCombinedIcon,
  ChartNoAxesColumnIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  LogOutIcon,
  UserRoundIcon,
} from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { createBackendClientId } from "@/lib/backend-client"

export function NavUser({
  user,
}: {
  user: {
    name: string
    email: string
    avatar: string
    sectorCode: string
    sectorName: string
  }
}) {
  const { isMobile } = useSidebar()
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [showLogoutConfirmation, setShowLogoutConfirmation] =
    React.useState(false)
  const initials = getInitials(user.name)

  React.useEffect(() => {
    if (!showLogoutConfirmation) {
      return
    }

    const focusTimer = window.setTimeout(() => {
      document.getElementById("logout-confirm-button")?.focus()
    }, 0)

    return () => window.clearTimeout(focusTimer)
  }, [showLogoutConfirmation])

  function closeLogoutConfirmation() {
    setShowLogoutConfirmation(false)
  }

  function handleComingSoon(feature: string) {
    setOpen(false)
    toast.info("Em breve", {
      description: `${feature} sera liberado futuramente.`,
    })
  }

  async function handleLogout() {
    const clientId = createBackendClientId()

    await fetch("/api/auth/logout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ clientId }),
    }).catch(() => null)
    window.localStorage.removeItem("auth_token")
    window.sessionStorage.clear()
    document.cookie =
      "auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT"

    setShowLogoutConfirmation(false)
    toast.success("Você saiu da conta.", {
      description: "Sua sessão foi encerrada com segurança.",
    })
    router.replace("/login")
    router.refresh()
  }

  function handleLogoutDialogKeyDown(
    event: React.KeyboardEvent<HTMLDivElement>
  ) {
    if (event.key === "Escape") {
      event.preventDefault()
      closeLogoutConfirmation()
      return
    }

    if (event.key === "Enter") {
      event.preventDefault()
      handleLogout()
      return
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault()
      document.getElementById("logout-cancel-button")?.focus()
      return
    }

    if (event.key === "ArrowRight") {
      event.preventDefault()
      document.getElementById("logout-confirm-button")?.focus()
    }
  }

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu open={open} onOpenChange={setOpen}>
            <DropdownMenuTrigger
              render={
                <SidebarMenuButton
                  size="lg"
                  className="aria-expanded:bg-muted"
                />
              }
            >
              <Avatar>
                {user.avatar ? (
                  <AvatarImage src={user.avatar} alt={user.name} />
                ) : null}
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <span className="min-w-0 truncate font-medium">
                    {user.name}
                  </span>
                  <SectorBadge
                    sectorCode={user.sectorCode}
                    sectorName={user.sectorName}
                  />
                </div>
                <span className="truncate text-xs">{user.email}</span>
              </div>
              {open ? (
                <ChevronUpIcon className="ml-auto size-4" />
              ) : (
                <ChevronDownIcon className="ml-auto size-4" />
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="min-w-56 rounded-lg"
              side={isMobile ? "bottom" : "right"}
              align="end"
              sideOffset={4}
            >
              <DropdownMenuGroup>
                <DropdownMenuLabel className="p-0 font-normal">
                  <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                    <Avatar>
                      {user.avatar ? (
                        <AvatarImage src={user.avatar} alt={user.name} />
                      ) : null}
                      <AvatarFallback>{initials}</AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <div className="flex min-w-0 items-center justify-between gap-2">
                        <span className="min-w-0 truncate font-medium">
                          {user.name}
                        </span>
                        <SectorBadge
                          sectorCode={user.sectorCode}
                          sectorName={user.sectorName}
                        />
                      </div>
                      <span className="truncate text-xs">{user.email}</span>
                    </div>
                  </div>
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem
                  className="[&_svg]:!text-primary [&_svg_*]:!text-primary"
                  onClick={() => handleComingSoon("Estatistica da conta")}
                >
                  <ChartNoAxesCombinedIcon className="!text-primary" />
                  Estatística da conta
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem
                  render={<Link href="/perfil" />}
                  onClick={() => setOpen(false)}
                >
                  <UserRoundIcon />
                  Perfil
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleComingSoon("Relatorios")}
                >
                  <ChartNoAxesColumnIcon />
                  Relatórios
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleComingSoon("Notificacoes")}
                >
                  <BellIcon />
                  Notificações
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="!bg-primary !text-white hover:!bg-primary focus:!bg-primary focus:!text-white active:!bg-primary [&_svg]:!text-white"
                onClick={() => setShowLogoutConfirmation(true)}
              >
                <LogOutIcon className="text-white" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>

      {showLogoutConfirmation && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeLogoutConfirmation()
            }
          }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="logout-title"
            aria-describedby="logout-description"
            className="w-full max-w-sm rounded-xl border bg-popover p-5 text-popover-foreground shadow-xl"
            onKeyDown={handleLogoutDialogKeyDown}
          >
            <div className="flex flex-col gap-2">
              <h2 id="logout-title" className="text-lg font-semibold">
                Deseja sair?
              </h2>
              <p
                id="logout-description"
                className="text-sm text-muted-foreground"
              >
                Você será desconectado e voltará para a tela de login.
              </p>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                id="logout-cancel-button"
                type="button"
                variant="outline"
                onClick={closeLogoutConfirmation}
              >
                Cancelar
              </Button>
              <Button
                id="logout-confirm-button"
                type="button"
                className="!bg-primary px-4 font-semibold !text-white hover:!bg-primary focus-visible:ring-primary/40 dark:!text-white"
                onClick={handleLogout}
              >
                Sair
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function SectorBadge({
  sectorCode,
  sectorName,
}: {
  sectorCode: string
  sectorName: string
}) {
  return (
    <span
      className="shrink-0 text-xs font-semibold leading-none text-primary"
      title={`${sectorCode} - ${sectorName}`}
    >
      {sectorCode}
    </span>
  )
}

function getInitials(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  if (!parts.length) {
    return "U"
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
}
