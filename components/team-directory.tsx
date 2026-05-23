"use client"

import * as React from "react"
import Link from "next/link"
import {
  EllipsisVerticalIcon,
  MessageCircleIcon,
  SearchIcon,
  ShieldCheckIcon,
  UserIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  OptionCombobox,
  accessSectorComboboxOptions,
} from "@/components/option-combobox"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

export type TeamUser = {
  id: string
  name: string
  email: string
  phone: string
  role: "USER" | "ADMIN"
  sector: string
  sectorLabel: string
}

type TeamDirectoryProps = {
  users: TeamUser[]
}

const allFilterValue = "all"
const sectorFilterOptions = [
  {
    value: allFilterValue,
    label: "Todos os setores",
    description: "Mostrar equipe completa",
  },
  ...accessSectorComboboxOptions,
]

export function TeamDirectory({ users }: TeamDirectoryProps) {
  const [search, setSearch] = React.useState("")
  const [sectorFilter, setSectorFilter] = React.useState(allFilterValue)
  const [roleFilter, setRoleFilter] = React.useState(allFilterValue)

  const filteredUsers = React.useMemo(() => {
    const query = search.trim().toLowerCase()

    return users.filter((user) => {
      const matchesName = !query || user.name.toLowerCase().includes(query)
      const matchesSector =
        sectorFilter === allFilterValue || user.sector === sectorFilter
      const matchesRole =
        roleFilter === allFilterValue || user.role === roleFilter

      return matchesName && matchesSector && matchesRole
    })
  }, [roleFilter, search, sectorFilter, users])

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg bg-background">
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden border-border/80 bg-background">
        <CardHeader className="border-b px-3 py-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <CardTitle className="text-base">Usuários da equipe</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {filteredUsers.length} de {users.length} usuário
                {users.length === 1 ? "" : "s"}
              </p>
            </div>

            <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-[minmax(220px,1fr)_180px_150px] lg:max-w-3xl">
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar por nome"
                  className="pl-8"
                />
              </div>

              <OptionCombobox
                value={sectorFilter}
                onValueChange={(value) =>
                  setSectorFilter(value ?? allFilterValue)
                }
                options={sectorFilterOptions}
                placeholder="Todos os setores"
                showClear={false}
              />

              <Select
                value={roleFilter}
                onValueChange={(value) =>
                  setRoleFilter(value ?? allFilterValue)
                }
              >
                <SelectTrigger aria-label="Filtrar por perfil">
                  <SelectValue placeholder="Todos os perfis" />
                </SelectTrigger>
                <SelectContent className="rounded-lg">
                  <SelectItem value={allFilterValue} className="rounded-md">
                    Todos os perfis
                  </SelectItem>
                  <SelectItem value="ADMIN" className="rounded-md">
                    Admin
                  </SelectItem>
                  <SelectItem value="USER" className="rounded-md">
                    Usuário
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>

        <CardContent className="min-h-0 flex-1 overflow-auto p-0">
          {filteredUsers.length ? (
            <div className="min-w-[980px]">
              <div className="grid grid-cols-[1.1fr_0.7fr_1.35fr_0.7fr_1fr_42px] gap-3 border-b bg-muted/30 px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
                <span>Nome</span>
                <span>Telefone</span>
                <span>E-mail</span>
                <span>Perfil</span>
                <span>Setor</span>
                <span />
              </div>
              {filteredUsers.map((user) => (
                <TeamUserRow key={user.id} user={user} />
              ))}
            </div>
          ) : (
            <div className="flex min-h-64 items-center justify-center p-6 text-center">
              <div className="grid gap-1">
                <h2 className="text-base font-semibold">
                  Nenhum usuário encontrado
                </h2>
                <p className="text-sm text-muted-foreground">
                  Ajuste a busca ou os filtros para ver outros usuários.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  )
}

function TeamUserRow({ user }: { user: TeamUser }) {
  return (
    <div className="grid grid-cols-[1.1fr_0.7fr_1.35fr_0.7fr_1fr_42px] items-center gap-3 border-b px-3 py-3 text-sm last:border-b-0">
      <span className="break-words font-medium leading-snug">{user.name}</span>
      <span className="text-muted-foreground">{user.phone || "-"}</span>
      <span className="break-all leading-snug">{user.email}</span>
      <div className="flex min-w-0">
        <RolePill role={user.role} />
      </div>
      <span className="break-words text-muted-foreground">
        {user.sectorLabel}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Ações do usuário"
            />
          }
        >
          <EllipsisVerticalIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem render={<Link href={`/chat-interno?userId=${user.id}`} />}>
            <MessageCircleIcon />
            Iniciar conversa
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function RolePill({ role }: { role: TeamUser["role"] }) {
  const admin = role === "ADMIN"

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold",
        admin
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-border bg-muted/40 text-muted-foreground"
      )}
    >
      {admin ? <ShieldCheckIcon className="size-3" /> : <UserIcon className="size-3" />}
      {admin ? "Admin" : "Usuário"}
    </span>
  )
}
