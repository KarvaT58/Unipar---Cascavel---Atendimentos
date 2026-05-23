"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  EllipsisVerticalIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  PencilIcon,
  SearchIcon,
  ShieldCheckIcon,
  Trash2Icon,
  UnlockIcon,
  UserCheckIcon,
  UserPlusIcon,
  XIcon,
} from "lucide-react"
import { toast } from "sonner"

import {
  deleteUser,
  getAccessRequestDetails,
  getUserDetails,
  rejectAccessRequest,
  saveUser,
  setUserBlocked,
  type SaveUserInput,
  type UserRowPayload,
} from "@/app/(app)/criacao-usuarios/actions"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SectorCombobox } from "@/components/option-combobox"
import { getSectorLabel } from "@/lib/sectors"
import { cn } from "@/lib/utils"
import { formatDateBR, formatPhoneBR } from "@/lib/validators"

type AccessRequestRow = {
  id: string
  name: string
  email: string
  sector: string
  sectorLabel: string
  phone: string
  rawPhone: string
  cpf: string
  createdAt: string
}

type UserRow = {
  id: string
  name: string
  email: string
  sector: string
  sectorLabel: string
  phone: string
  rawPhone: string
  role: "USER" | "ADMIN"
  status: "ACTIVE" | "DISABLED"
  createdAt: string
  updatedAt: string
}

type FormState = SaveUserInput

type UserModal =
  | { mode: "create"; title: string }
  | { mode: "edit"; title: string }
  | { mode: "request"; title: string }

type ConfirmDialogState =
  | {
      type: "reject"
      title: string
      description: string
      actionLabel: string
      request: AccessRequestRow
    }
  | {
      type: "block"
      title: string
      description: string
      actionLabel: string
      user: UserRow
      blocked: boolean
    }
  | {
      type: "delete"
      title: string
      description: string
      actionLabel: string
      user: UserRow
    }

const emptyForm: FormState = {
  id: undefined,
  requestId: undefined,
  name: "",
  email: "",
  sector: "",
  phone: "",
  password: "",
  confirmPassword: "",
  isAdmin: false,
}

const userPageSize = 8
const accessRequestSoundPath = "/sound/notifica%C3%A7%C3%A3o.mp3"

export function UserCreationAdmin({
  currentUserId,
  requests,
  users,
}: {
  databaseError?: string
  currentUserId: string
  requests: AccessRequestRow[]
  users: UserRow[]
}) {
  const router = useRouter()
  const [visibleRequests, setVisibleRequests] = React.useState(requests)
  const [visibleUsers, setVisibleUsers] = React.useState(users)
  const [search, setSearch] = React.useState("")
  const [page, setPage] = React.useState(1)
  const [modal, setModal] = React.useState<UserModal | null>(null)
  const [form, setForm] = React.useState<FormState>(emptyForm)
  const [confirmDialog, setConfirmDialog] =
    React.useState<ConfirmDialogState | null>(null)
  const [deleteConfirmation, setDeleteConfirmation] = React.useState("")
  const [pendingAction, setPendingAction] = React.useState<string | null>(null)
  const knownRequestIdsRef = React.useRef(
    new Set(requests.map((request) => request.id))
  )
  const notificationAudioRef = React.useRef<HTMLAudioElement | null>(null)

  React.useEffect(() => {
    notificationAudioRef.current = new Audio(accessRequestSoundPath)
    notificationAudioRef.current.preload = "auto"

    return () => {
      notificationAudioRef.current = null
    }
  }, [])

  React.useEffect(() => {
    const eventSource = new EventSource("/api/access-requests/stream")

    eventSource.addEventListener("requests", (event) => {
      const payload = parseAccessRequestStreamPayload(event.data)

      if (!payload) {
        return
      }

      const nextRequests = payload.requests
      const nextIds = new Set(nextRequests.map((request) => request.id))
      const newRequests = nextRequests.filter(
        (request) => !knownRequestIdsRef.current.has(request.id)
      )

      knownRequestIdsRef.current = nextIds
      setVisibleRequests(nextRequests)

      if (newRequests.length) {
        const audio = notificationAudioRef.current

        if (audio) {
          audio.currentTime = 0
          void audio.play().catch(() => undefined)
        }

        const firstRequest = newRequests[0]

        toast.info(
          newRequests.length === 1
            ? "Nova solicitação de acesso recebida."
            : `${newRequests.length} novas solicitações de acesso recebidas.`,
          {
            description: firstRequest
              ? `${firstRequest.name} enviou um novo pedido.`
              : "A lista de pedidos foi atualizada.",
          }
        )
      }
    })

    return () => {
      eventSource.close()
    }
  }, [])

  const filteredUsers = React.useMemo(() => {
    const query = search.trim().toLowerCase()

    if (!query) {
      return visibleUsers
    }

    return visibleUsers.filter((user) =>
      [user.name, user.email, user.sectorLabel, user.role, user.status].some(
        (value) => value.toLowerCase().includes(query)
      )
    )
  }, [search, visibleUsers])

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / userPageSize))
  const safePage = Math.min(page, totalPages)
  const paginatedUsers = filteredUsers.slice(
    (safePage - 1) * userPageSize,
    safePage * userPageSize
  )

  function openCreateModal() {
    setForm(emptyForm)
    setModal({ mode: "create", title: "Criar usuário" })
  }

  async function openRequestModal(request: AccessRequestRow) {
    setPendingAction(`request:${request.id}`)
    const result = await getAccessRequestDetails(request.id)
    setPendingAction(null)

    if (!result.ok || !result.data) {
      toast.error("Não foi possível carregar a solicitação.", {
        description: result.message,
      })
      return
    }

    setForm({
      ...emptyForm,
      requestId: result.data.id,
      name: result.data.name,
      email: result.data.email,
      sector: result.data.sector,
      phone: result.data.phone,
      password: result.data.cpf,
      confirmPassword: result.data.cpf,
    })
    setModal({ mode: "request", title: "Usar dados da solicitação" })
  }

  async function openEditModal(user: UserRow) {
    setPendingAction(`edit:${user.id}`)
    const result = await getUserDetails(user.id)
    setPendingAction(null)

    if (!result.ok || !result.data) {
      toast.error("Não foi possível carregar o usuário.", {
        description: result.message,
      })
      return
    }

    setForm({
      id: result.data.id,
      requestId: undefined,
      name: result.data.name,
      email: result.data.email,
      sector: result.data.sector,
      phone: result.data.phone ?? "",
      password: result.data.password,
      confirmPassword: result.data.password,
      isAdmin: result.data.role === "ADMIN",
    })
    setModal({ mode: "edit", title: "Editar usuário" })
  }

  async function handleSaveUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPendingAction("save-user")

    const result = await saveUser(form)

    setPendingAction(null)

    if (!result.ok || !result.user) {
      toast.error("Não foi possível salvar o usuário.", {
        description: result.message,
      })
      return
    }

    const nextUser = toUserRow(result.user)

    setVisibleUsers((currentUsers) =>
      sortUsers([
        nextUser,
        ...currentUsers.filter((currentUser) => currentUser.id !== nextUser.id),
      ])
    )

    if (form.requestId) {
      knownRequestIdsRef.current.delete(form.requestId)
      setVisibleRequests((currentRequests) =>
        currentRequests.filter((request) => request.id !== form.requestId)
      )
    }

    toast.success(result.message)
    setModal(null)
    router.refresh()
  }

  async function handleConfirmAction() {
    if (!confirmDialog) {
      return
    }

    if (confirmDialog.type === "delete" && deleteConfirmation !== "DELETAR") {
      toast.warning("Digite DELETAR para confirmar.")
      return
    }

    setPendingAction(`confirm:${confirmDialog.type}`)

    if (confirmDialog.type === "reject") {
      const result = await rejectAccessRequest(confirmDialog.request.id)

      setPendingAction(null)

      if (!result.ok) {
        toast.error("Não foi possível rejeitar.", {
          description: result.message,
        })
        return
      }

      setVisibleRequests((currentRequests) =>
        currentRequests.filter(
          (request) => request.id !== confirmDialog.request.id
        )
      )
      knownRequestIdsRef.current.delete(confirmDialog.request.id)
      toast.success(result.message)
      closeConfirmDialog()
      router.refresh()
      return
    }

    if (confirmDialog.type === "block") {
      const result = await setUserBlocked(
        confirmDialog.user.id,
        confirmDialog.blocked
      )

      setPendingAction(null)

      if (!result.ok || !result.user) {
        toast.error("Não foi possível alterar o status.", {
          description: result.message,
        })
        return
      }

      const nextUser = toUserRow(result.user)

      setVisibleUsers((currentUsers) =>
        sortUsers(
          currentUsers.map((user) =>
            user.id === nextUser.id ? nextUser : user
          )
        )
      )
      toast.success(result.message)
      closeConfirmDialog()
      router.refresh()
      return
    }

    const result = await deleteUser(confirmDialog.user.id)

    setPendingAction(null)

    if (!result.ok) {
      toast.error("Não foi possível apagar.", {
        description: result.message,
      })
      return
    }

    setVisibleUsers((currentUsers) =>
      currentUsers.filter((user) => user.id !== confirmDialog.user.id)
    )
    toast.success(result.message)
    closeConfirmDialog()
    router.refresh()
  }

  function closeConfirmDialog() {
    setConfirmDialog(null)
    setDeleteConfirmation("")
  }

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 xl:grid-cols-[minmax(280px,360px)_minmax(720px,1fr)]">
        <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-background">
          <div className="flex items-center justify-between gap-3 border-b px-3 py-2">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold">Pedidos de acesso</h2>
              <p className="text-xs text-muted-foreground">
                {visibleRequests.length} pendente
                {visibleRequests.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-2">
            {visibleRequests.length ? (
              <div className="grid gap-2">
                {visibleRequests.map((request) => (
                  <AccessRequestItem
                    key={request.id}
                    request={request}
                    pendingAction={pendingAction}
                    onReject={() =>
                      setConfirmDialog({
                        type: "reject",
                        title: "Rejeitar solicitação?",
                        description:
                          "Essa solicitação sairá da lista de pedidos pendentes.",
                        actionLabel: "Rejeitar",
                        request,
                      })
                    }
                    onUseData={() => openRequestModal(request)}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={UserPlusIcon}
                title="Nenhum pedido pendente"
                description="Novas solicitações de acesso aparecerão aqui."
              />
            )}
          </div>
        </section>

        <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-background">
          <div className="flex flex-col gap-2 border-b px-3 py-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold">Usuários criados</h2>
              <p className="text-xs text-muted-foreground">
                {filteredUsers.length} usuário
                {filteredUsers.length === 1 ? "" : "s"}
              </p>
            </div>
            <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
              <div className="relative w-full sm:min-w-72 lg:w-80">
                <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value)
                    setPage(1)
                  }}
                  placeholder="Buscar usuário"
                  className="pl-8"
                />
              </div>
              <Button type="button" onClick={openCreateModal}>
                <UserPlusIcon />
                Criar usuário
              </Button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            {paginatedUsers.length ? (
              <div className="min-w-[900px]">
                <div className="grid grid-cols-[1.05fr_1.3fr_0.9fr_0.75fr_0.7fr_0.85fr_42px] gap-2 border-b bg-muted/30 px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
                  <span>Nome</span>
                  <span>E-mail</span>
                  <span>Setor</span>
                  <span>Perfil</span>
                  <span>Status</span>
                  <span>Criado em</span>
                  <span />
                </div>
                {paginatedUsers.map((user) => (
                  <UserListItem
                    key={user.id}
                    user={user}
                    isCurrentUser={user.id === currentUserId}
                    pendingAction={pendingAction}
                    onEdit={() => openEditModal(user)}
                    onToggleBlock={() =>
                      setConfirmDialog({
                        type: "block",
                        title:
                          user.status === "ACTIVE"
                            ? "Bloquear usuário?"
                            : "Desbloquear usuário?",
                        description:
                          user.status === "ACTIVE"
                            ? "O usuário não conseguirá acessar o sistema até ser desbloqueado."
                            : "O usuário voltará a conseguir acessar o sistema.",
                        actionLabel:
                          user.status === "ACTIVE"
                            ? "Bloquear"
                            : "Desbloquear",
                        user,
                        blocked: user.status === "ACTIVE",
                      })
                    }
                    onDelete={() =>
                      setConfirmDialog({
                        type: "delete",
                        title: "Apagar usuário?",
                        description:
                          "Essa ação remove o usuário. Para confirmar, digite DELETAR.",
                        actionLabel: "Apagar",
                        user,
                      })
                    }
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={UserCheckIcon}
                title="Nenhum usuário encontrado"
                description="Crie um usuário ou ajuste a busca."
              />
            )}
          </div>

          <div className="flex items-center justify-between gap-3 border-t px-3 py-2 text-sm">
            <span className="text-xs text-muted-foreground">
              Página
            </span>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                aria-label="Página anterior"
                disabled={safePage <= 1}
                onClick={() => setPage((currentPage) => currentPage - 1)}
              >
                <ChevronLeftIcon />
              </Button>
              <span className="flex h-7 min-w-10 items-center justify-center rounded-md border bg-muted/30 px-2 text-sm font-semibold tabular-nums">
                {safePage}
              </span>
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                aria-label="Próxima página"
                disabled={safePage >= totalPages}
                onClick={() => setPage((currentPage) => currentPage + 1)}
              >
                <ChevronRightIcon />
              </Button>
              <span className="ml-1 text-xs text-muted-foreground">
                de {totalPages}
              </span>
            </div>
          </div>
        </section>
      </div>

      {modal ? (
        <UserFormModal
          form={form}
          modal={modal}
          isCurrentUser={form.id === currentUserId}
          pending={pendingAction === "save-user"}
          onChange={setForm}
          onClose={() => setModal(null)}
          onSubmit={handleSaveUser}
        />
      ) : null}

      {confirmDialog ? (
        <ConfirmDialog
          state={confirmDialog}
          pending={pendingAction === `confirm:${confirmDialog.type}`}
          deleteConfirmation={deleteConfirmation}
          onDeleteConfirmationChange={setDeleteConfirmation}
          onClose={closeConfirmDialog}
          onConfirm={handleConfirmAction}
        />
      ) : null}
    </section>
  )
}

function AccessRequestItem({
  request,
  pendingAction,
  onReject,
  onUseData,
}: {
  request: AccessRequestRow
  pendingAction: string | null
  onReject: () => void
  onUseData: () => void
}) {
  const loading = pendingAction === `request:${request.id}`

  return (
    <article className="rounded-md border bg-card p-2.5">
      <div className="grid gap-2 text-sm">
        <div className="grid gap-1">
          <p className="break-words font-semibold leading-snug">
            {request.name}
          </p>
          <p className="break-all text-xs leading-snug text-muted-foreground">
            {request.email}
          </p>
        </div>
        <dl className="grid gap-1 text-xs text-muted-foreground">
          <div className="grid gap-0.5">
            <dt className="font-medium text-foreground">Setor</dt>
            <dd className="break-words">{request.sectorLabel}</dd>
          </div>
          <div className="grid gap-0.5">
            <dt className="font-medium text-foreground">Telefone</dt>
            <dd>{request.phone}</dd>
          </div>
          <div className="grid gap-0.5">
            <dt className="font-medium text-foreground">CPF</dt>
            <dd className="font-mono text-foreground">{request.cpf}</dd>
          </div>
          <div className="grid gap-0.5">
            <dt className="font-medium text-foreground">Solicitado em</dt>
            <dd>{request.createdAt}</dd>
          </div>
        </dl>
        <div className="flex justify-end gap-2 pt-1">
          <Button
            type="button"
            size="sm"
            className="px-3"
            disabled={Boolean(pendingAction)}
            onClick={onUseData}
          >
            {loading ? "Carregando..." : "Usar dados"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={Boolean(pendingAction)}
            onClick={onReject}
          >
            Rejeitar
          </Button>
        </div>
      </div>
    </article>
  )
}

function UserListItem({
  user,
  pendingAction,
  isCurrentUser,
  onEdit,
  onToggleBlock,
  onDelete,
}: {
  user: UserRow
  pendingAction: string | null
  isCurrentUser: boolean
  onEdit: () => void
  onToggleBlock: () => void
  onDelete: () => void
}) {
  const editLoading = pendingAction === `edit:${user.id}`

  return (
    <div className="grid grid-cols-[1.05fr_1.3fr_0.9fr_0.75fr_0.7fr_0.85fr_42px] items-center gap-2 border-b px-3 py-3 text-sm last:border-b-0">
      <div className="min-w-0">
        <p className="break-words font-medium leading-snug">{user.name}</p>
        <p className="text-xs text-muted-foreground">{user.phone}</p>
      </div>
      <span className="break-all leading-snug">{user.email}</span>
      <span className="break-words leading-snug text-muted-foreground">
        {user.sectorLabel}
      </span>
      <div className="flex min-w-0">
        <RolePill role={user.role} />
      </div>
      <div className="flex min-w-0">
        <StatusPill status={user.status} />
      </div>
      <span className="text-xs text-muted-foreground">{user.createdAt}</span>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Ações do usuário"
              disabled={Boolean(pendingAction)}
            />
          }
        >
          <EllipsisVerticalIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={onEdit}>
            <PencilIcon />
            {editLoading ? "Abrindo..." : "Editar"}
          </DropdownMenuItem>
          {!isCurrentUser ? (
            <>
              <DropdownMenuItem onClick={onToggleBlock}>
                {user.status === "ACTIVE" ? <LockIcon /> : <UnlockIcon />}
                {user.status === "ACTIVE" ? "Bloquear" : "Desbloquear"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={onDelete}>
                <Trash2Icon />
                Apagar
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function UserFormModal({
  modal,
  form,
  isCurrentUser,
  pending,
  onChange,
  onClose,
  onSubmit,
}: {
  modal: UserModal
  form: FormState
  isCurrentUser: boolean
  pending: boolean
  onChange: React.Dispatch<React.SetStateAction<FormState>>
  onClose: () => void
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
}) {
  const [showPassword, setShowPassword] = React.useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false)

  function updateField<Key extends keyof FormState>(
    key: Key,
    value: FormState[Key]
  ) {
    onChange((currentForm) => ({ ...currentForm, [key]: value }))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
      <form
        onSubmit={onSubmit}
        className="flex max-h-[92svh] w-full max-w-lg flex-col overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-xl"
      >
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">{modal.title}</h2>
            <p className="text-xs text-muted-foreground">
              {modal.mode === "edit"
                ? "Edite os dados, senha e permissões do usuário."
                : "Preencha os dados para liberar o acesso."}
            </p>
          </div>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            onClick={onClose}
            aria-label="Fechar"
          >
            <XIcon />
          </Button>
        </div>

        <div className="grid gap-4 overflow-auto p-4">
          <FormField label="Nome completo" htmlFor="admin-user-name">
            <Input
              id="admin-user-name"
              value={form.name}
              onChange={(event) => updateField("name", event.target.value)}
              placeholder="Nome"
              required
            />
          </FormField>

          <FormField label="E-mail" htmlFor="admin-user-email">
            <Input
              id="admin-user-email"
              type="email"
              value={form.email}
              onChange={(event) => updateField("email", event.target.value)}
              placeholder="usuario@unipar.br"
              required
            />
          </FormField>

          <FormField label="Setor" htmlFor="admin-user-sector">
            <SectorCombobox
              id="admin-user-sector"
              value={form.sector}
              onValueChange={(value) => updateField("sector", value ?? "")}
            />
          </FormField>

          <FormField label="Número de telefone" htmlFor="admin-user-phone">
            <Input
              id="admin-user-phone"
              value={form.phone}
              onChange={(event) => updateField("phone", event.target.value)}
              placeholder="45 99999-9999"
              inputMode="tel"
              required
            />
          </FormField>

          <FormField label="Senha" htmlFor="admin-user-password">
            <PasswordField
              id="admin-user-password"
              value={form.password}
              onChange={(event) => updateField("password", event.target.value)}
              placeholder="Senha"
              visible={showPassword}
              onToggleVisible={() =>
                setShowPassword((currentValue) => !currentValue)
              }
              required={modal.mode !== "edit"}
            />
          </FormField>

          <FormField
            label="Confirmar senha"
            htmlFor="admin-user-confirm-password"
          >
            <PasswordField
              id="admin-user-confirm-password"
              value={form.confirmPassword}
              onChange={(event) =>
                updateField("confirmPassword", event.target.value)
              }
              placeholder="Confirmar senha"
              visible={showConfirmPassword}
              onToggleVisible={() =>
                setShowConfirmPassword((currentValue) => !currentValue)
              }
              required={modal.mode !== "edit"}
            />
          </FormField>

          <div className="flex items-end">
            <label className="flex h-8 w-full cursor-pointer items-center gap-2 rounded-lg border border-input bg-background px-2.5 text-sm">
              <Checkbox
                checked={form.isAdmin}
                disabled={isCurrentUser}
                onCheckedChange={(checked) =>
                  updateField("isAdmin", checked)
                }
              />
              <span className="font-medium">
                {isCurrentUser
                  ? "Seu usuário permanece administrador"
                  : "Usuário administrador"}
              </span>
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t px-4 py-3">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Salvando..." : "Salvar usuário"}
          </Button>
        </div>
      </form>
    </div>
  )
}

function ConfirmDialog({
  state,
  pending,
  deleteConfirmation,
  onDeleteConfirmationChange,
  onClose,
  onConfirm,
}: {
  state: ConfirmDialogState
  pending: boolean
  deleteConfirmation: string
  onDeleteConfirmationChange: (value: string) => void
  onClose: () => void
  onConfirm: () => void
}) {
  const destructive = state.type === "delete" || state.type === "reject"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        className="w-full max-w-md rounded-lg border bg-popover p-4 text-popover-foreground shadow-xl"
      >
        <div className="grid gap-2">
          <h2 className="text-base font-semibold">{state.title}</h2>
          <p className="text-sm text-muted-foreground">{state.description}</p>
        </div>

        {state.type === "delete" ? (
          <div className="mt-4 grid gap-2">
            <Label htmlFor="delete-confirmation">Confirmação</Label>
            <Input
              id="delete-confirmation"
              value={deleteConfirmation}
              onChange={(event) =>
                onDeleteConfirmationChange(event.target.value)
              }
              placeholder="DELETAR"
            />
          </div>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
            disabled={
              pending ||
              (state.type === "delete" && deleteConfirmation !== "DELETAR")
            }
            onClick={onConfirm}
          >
            {pending ? "Processando..." : state.actionLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

function FormField({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor: string
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  )
}

function PasswordField({
  visible,
  onToggleVisible,
  className,
  ...props
}: React.ComponentProps<typeof Input> & {
  visible: boolean
  onToggleVisible: () => void
}) {
  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? "text" : "password"}
        className={cn("pr-9", className)}
      />
      <button
        type="button"
        className="absolute right-1 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4"
        aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
        onClick={onToggleVisible}
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  )
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
}) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="flex size-11 items-center justify-center rounded-full bg-primary/12 text-primary">
        <Icon className="size-5" />
      </div>
      <div className="grid gap-1">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}

function StatusPill({ status }: { status: UserRow["status"] }) {
  const active = status === "ACTIVE"

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold",
        active
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
          : "border-destructive/30 bg-destructive/10 text-destructive"
      )}
    >
      {active ? "Ativo" : "Bloqueado"}
    </span>
  )
}

function RolePill({ role }: { role: UserRow["role"] }) {
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
      {admin ? <ShieldCheckIcon className="size-3" /> : null}
      {admin ? "Admin" : "Usuário"}
    </span>
  )
}

function parseAccessRequestStreamPayload(value: string) {
  try {
    const payload = JSON.parse(value) as { requests?: AccessRequestRow[] }

    if (!Array.isArray(payload.requests)) {
      return null
    }

    return { requests: payload.requests }
  } catch {
    return null
  }
}

function toUserRow(user: UserRowPayload): UserRow {
  const sector = getSectorLabel(user.sector)

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    sector: user.sector,
    sectorLabel: `${sector.code} - ${sector.name}`,
    phone: user.phone ? formatPhoneBR(user.phone) : "",
    rawPhone: user.phone ?? "",
    role: user.role,
    status: user.status,
    createdAt: formatDateBR(new Date(user.createdAt)),
    updatedAt: formatDateBR(new Date(user.updatedAt)),
  }
}

function sortUsers(users: UserRow[]) {
  return [...users].sort((first, second) =>
    first.name.localeCompare(second.name)
  )
}
