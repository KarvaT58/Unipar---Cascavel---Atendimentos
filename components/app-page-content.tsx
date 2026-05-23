"use client"

import * as React from "react"
import Link from "next/link"
import {
  ArrowRightIcon,
  CheckCircle2Icon,
  CircleDashedIcon,
  DatabaseIcon,
  ListChecksIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  Trash2Icon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  EMPTY_APP_STATE,
  type AppPageRecord,
  type AppState,
} from "@/lib/app-state"
import {
  createBackendClientId,
  fetchBackendState,
  saveBackendState,
} from "@/lib/backend-client"
import { cn } from "@/lib/utils"

type PageAction = {
  title: string
  href: string
  description: string
}

type AppPageContentProps = {
  title: string
  description: string
  actions?: PageAction[]
  moduleKey?: string
}

type DraftRecord = {
  title: string
  description: string
  owner: string
  status: AppPageRecord["status"]
  priority: AppPageRecord["priority"]
}

const statusOptions: Array<{
  value: AppPageRecord["status"]
  label: string
  className: string
}> = [
  {
    value: "todo",
    label: "Aberto",
    className: "border-border bg-muted/40 text-muted-foreground",
  },
  {
    value: "in_progress",
    label: "Em andamento",
    className: "border-primary/30 bg-primary/10 text-primary",
  },
  {
    value: "done",
    label: "Concluído",
    className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  },
  {
    value: "blocked",
    label: "Bloqueado",
    className: "border-destructive/30 bg-destructive/10 text-destructive",
  },
]

const priorityOptions: Array<{
  value: AppPageRecord["priority"]
  label: string
}> = [
  { value: "normal", label: "Normal" },
  { value: "high", label: "Alta" },
  { value: "low", label: "Baixa" },
]

const emptyDraft: DraftRecord = {
  title: "",
  description: "",
  owner: "",
  status: "todo",
  priority: "normal",
}

const pageSize = 8

export function AppPageContent({
  title,
  description,
  actions,
  moduleKey,
}: AppPageContentProps) {
  const resolvedModuleKey = React.useMemo(
    () => moduleKey ?? slugify(title),
    [moduleKey, title]
  )
  const defaultRecords = React.useMemo(
    () => createDefaultRecords(title, description, actions, resolvedModuleKey),
    [actions, description, resolvedModuleKey, title]
  )
  const [records, setRecords] = React.useState<AppPageRecord[]>(defaultRecords)
  const [search, setSearch] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState<
    AppPageRecord["status"] | "all"
  >("all")
  const [page, setPage] = React.useState(1)
  const [draft, setDraft] = React.useState<DraftRecord>(emptyDraft)
  const [editingRecordId, setEditingRecordId] = React.useState<string | null>(
    null
  )
  const [syncStatus, setSyncStatus] = React.useState<
    "loading" | "saved" | "saving" | "local"
  >("loading")
  const baseStateRef = React.useRef<AppState>(EMPTY_APP_STATE)
  const readyRef = React.useRef(false)
  const clientIdRef = React.useRef("")

  React.useEffect(() => {
    let cancelled = false
    readyRef.current = false
    clientIdRef.current = createBackendClientId()

    fetchBackendState()
      .then((envelope) => {
        if (cancelled) return

        baseStateRef.current = envelope.state
        const storedRecords = envelope.state.pageRecords[resolvedModuleKey]

        setRecords(storedRecords?.length ? storedRecords : defaultRecords)
        setSyncStatus(envelope.databaseConnected ? "saved" : "local")
      })
      .catch(() => {
        if (cancelled) return

        baseStateRef.current = EMPTY_APP_STATE
        setRecords(defaultRecords)
        setSyncStatus("local")
      })
      .finally(() => {
        if (!cancelled) {
          readyRef.current = true
        }
      })

    return () => {
      cancelled = true
    }
  }, [defaultRecords, resolvedModuleKey])

  React.useEffect(() => {
    if (!readyRef.current) return

    const timeoutId = window.setTimeout(() => {
      const nextState: AppState = {
        ...baseStateRef.current,
        pageRecords: {
          ...baseStateRef.current.pageRecords,
          [resolvedModuleKey]: records,
        },
      }

      setSyncStatus("saving")

      fetchBackendState()
        .catch(() => ({
          state: nextState,
          revision: 0,
          databaseConnected: false,
        }))
        .then((envelope) =>
          saveBackendState(
            {
              ...envelope.state,
              pageRecords: {
                ...envelope.state.pageRecords,
                [resolvedModuleKey]: records,
              },
            },
            clientIdRef.current || "page-content-client",
            `page:${resolvedModuleKey}`
          )
        )
        .then((envelope) => {
          baseStateRef.current = envelope.state
          setSyncStatus(envelope.databaseConnected ? "saved" : "local")
        })
        .catch(() => setSyncStatus("local"))
    }, 500)

    return () => window.clearTimeout(timeoutId)
  }, [records, resolvedModuleKey])

  const filteredRecords = React.useMemo(() => {
    const query = search.trim().toLowerCase()

    return records.filter((record) => {
      const matchesStatus =
        statusFilter === "all" || record.status === statusFilter
      const matchesSearch =
        !query ||
        [
          record.title,
          record.description,
          record.owner ?? "",
          getStatusLabel(record.status),
          getPriorityLabel(record.priority),
        ]
          .join(" ")
          .toLowerCase()
          .includes(query)

      return matchesStatus && matchesSearch
    })
  }, [records, search, statusFilter])

  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paginatedRecords = filteredRecords.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize
  )
  const completedCount = records.filter(
    (record) => record.status === "done"
  ).length
  const activeCount = records.filter(
    (record) => record.status === "todo" || record.status === "in_progress"
  ).length

  function updateDraft<Key extends keyof DraftRecord>(
    key: Key,
    value: DraftRecord[Key]
  ) {
    setDraft((currentDraft) => ({ ...currentDraft, [key]: value }))
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const titleValue = draft.title.trim()
    const descriptionValue = draft.description.trim()

    if (!titleValue || !descriptionValue) return

    const now = new Date()

    if (editingRecordId) {
      setRecords((currentRecords) =>
        currentRecords.map((record) =>
          record.id === editingRecordId
            ? {
                ...record,
                ...draft,
                title: titleValue,
                description: descriptionValue,
                owner: draft.owner.trim(),
                completedAt:
                  draft.status === "done"
                    ? (record.completedAt ?? now)
                    : undefined,
                updatedAt: now,
              }
            : record
        )
      )
    } else {
      setRecords((currentRecords) => [
        {
          id: createRecordId(resolvedModuleKey),
          title: titleValue,
          description: descriptionValue,
          owner: draft.owner.trim(),
          status: draft.status,
          priority: draft.priority,
          createdAt: now,
          updatedAt: now,
          completedAt: draft.status === "done" ? now : undefined,
        },
        ...currentRecords,
      ])
    }

    setDraft(emptyDraft)
    setEditingRecordId(null)
    setPage(1)
  }

  function handleEdit(record: AppPageRecord) {
    setDraft({
      title: record.title,
      description: record.description,
      owner: record.owner ?? "",
      status: record.status,
      priority: record.priority,
    })
    setEditingRecordId(record.id)
  }

  function handleDelete(recordId: string) {
    setRecords((currentRecords) =>
      currentRecords.filter((record) => record.id !== recordId)
    )
    setEditingRecordId((currentRecordId) =>
      currentRecordId === recordId ? null : currentRecordId
    )
  }

  function handleComplete(record: AppPageRecord) {
    const nextStatus: AppPageRecord["status"] =
      record.status === "done" ? "todo" : "done"
    const now = new Date()

    setRecords((currentRecords) =>
      currentRecords.map((currentRecord) =>
        currentRecord.id === record.id
          ? {
              ...currentRecord,
              status: nextStatus,
              completedAt: nextStatus === "done" ? now : undefined,
              updatedAt: now,
            }
          : currentRecord
      )
    )
  }

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 xl:grid-cols-[minmax(300px,380px)_minmax(720px,1fr)]">
        <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-background">
          <div className="border-b px-3 py-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold">{title}</h2>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {description}
                </p>
              </div>
              <SyncPill status={syncStatus} />
            </div>
          </div>

          <div className="grid gap-3 border-b p-3">
            <div className="grid grid-cols-3 gap-2">
              <Metric label="Ativos" value={activeCount} />
              <Metric label="Concluídos" value={completedCount} />
              <Metric label="Total" value={records.length} />
            </div>

            <form className="grid gap-3" onSubmit={handleSubmit}>
              <div className="grid gap-2">
                <Label htmlFor={`${resolvedModuleKey}-title`}>Título</Label>
                <Input
                  id={`${resolvedModuleKey}-title`}
                  value={draft.title}
                  onChange={(event) => updateDraft("title", event.target.value)}
                  placeholder="Novo registro"
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor={`${resolvedModuleKey}-description`}>
                  Descrição
                </Label>
                <Textarea
                  id={`${resolvedModuleKey}-description`}
                  value={draft.description}
                  onChange={(event) =>
                    updateDraft("description", event.target.value)
                  }
                  placeholder="Detalhe o que precisa ser acompanhado"
                  className="min-h-24 resize-none"
                  required
                />
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1">
                <div className="grid gap-2">
                  <Label htmlFor={`${resolvedModuleKey}-status`}>Status</Label>
                  <Select
                    value={draft.status}
                    onValueChange={(value) =>
                      updateDraft(
                        "status",
                        (value ?? "todo") as AppPageRecord["status"]
                      )
                    }
                  >
                    <SelectTrigger id={`${resolvedModuleKey}-status`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {statusOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor={`${resolvedModuleKey}-priority`}>
                    Prioridade
                  </Label>
                  <Select
                    value={draft.priority}
                    onValueChange={(value) =>
                      updateDraft(
                        "priority",
                        (value ?? "normal") as AppPageRecord["priority"]
                      )
                    }
                  >
                    <SelectTrigger id={`${resolvedModuleKey}-priority`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {priorityOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor={`${resolvedModuleKey}-owner`}>Responsável</Label>
                <Input
                  id={`${resolvedModuleKey}-owner`}
                  value={draft.owner}
                  onChange={(event) => updateDraft("owner", event.target.value)}
                  placeholder="Nome ou setor"
                />
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                {editingRecordId ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setDraft(emptyDraft)
                      setEditingRecordId(null)
                    }}
                  >
                    Cancelar
                  </Button>
                ) : null}
                <Button type="submit" className="w-full">
                  {editingRecordId ? <CheckCircle2Icon /> : <PlusIcon />}
                  {editingRecordId ? "Salvar" : "Adicionar"}
                </Button>
              </div>
            </form>
          </div>

          {actions?.length ? (
            <div className="thin-gray-scrollbar min-h-0 flex-1 overflow-auto p-3">
              <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                Atalhos
              </h3>
              <div className="grid gap-2">
                {actions.map((action) => (
                  <Button
                    key={`${action.title}-${action.href}`}
                    render={<Link href={action.href} />}
                    variant="outline"
                    className="h-auto justify-between gap-3 px-3 py-2 text-left"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">
                        {action.title}
                      </span>
                      <span className="mt-0.5 block truncate text-xs font-normal text-muted-foreground">
                        {action.description}
                      </span>
                    </span>
                    <ArrowRightIcon className="shrink-0" />
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-background">
          <div className="flex flex-col gap-2 border-b px-3 py-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold">Registros da página</h2>
              <p className="text-xs text-muted-foreground">
                {filteredRecords.length} item
                {filteredRecords.length === 1 ? "" : "s"}
              </p>
            </div>

            <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-[minmax(220px,1fr)_180px] lg:max-w-xl">
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value)
                    setPage(1)
                  }}
                  placeholder="Buscar registro"
                  className="pl-8"
                />
              </div>

              <Select
                value={statusFilter}
                onValueChange={(value) => {
                  setStatusFilter(
                    (value ?? "all") as AppPageRecord["status"] | "all"
                  )
                  setPage(1)
                }}
              >
                <SelectTrigger aria-label="Filtrar por status">
                  <SlidersHorizontalIcon className="size-4" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {statusOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            {paginatedRecords.length ? (
              <div className="min-w-[900px]">
                <div className="grid grid-cols-[1.15fr_1.4fr_0.8fr_0.75fr_0.9fr_108px] gap-3 border-b bg-muted/30 px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
                  <span>Nome</span>
                  <span>Descrição</span>
                  <span>Status</span>
                  <span>Prioridade</span>
                  <span>Atualizado</span>
                  <span />
                </div>
                {paginatedRecords.map((record) => (
                  <div
                    key={record.id}
                    className="grid grid-cols-[1.15fr_1.4fr_0.8fr_0.75fr_0.9fr_108px] items-center gap-3 border-b px-3 py-3 text-sm last:border-b-0"
                  >
                    <div className="min-w-0">
                      <p className="break-words font-medium leading-snug">
                        {record.title}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {record.owner || "Sem responsável"}
                      </p>
                    </div>
                    <span className="line-clamp-2 leading-snug text-muted-foreground">
                      {record.description}
                    </span>
                    <StatusPill status={record.status} />
                    <span className="text-sm text-muted-foreground">
                      {getPriorityLabel(record.priority)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(record.updatedAt)}
                    </span>
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={
                          record.status === "done"
                            ? "Reabrir registro"
                            : "Concluir registro"
                        }
                        onClick={() => handleComplete(record)}
                      >
                        <CheckCircle2Icon />
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label="Editar registro"
                        onClick={() => handleEdit(record)}
                      >
                        <PencilIcon />
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        aria-label="Apagar registro"
                        onClick={() => handleDelete(record.id)}
                      >
                        <Trash2Icon />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex min-h-64 flex-col items-center justify-center gap-3 p-6 text-center">
                <div className="flex size-11 items-center justify-center rounded-full bg-primary/12 text-primary">
                  <ListChecksIcon className="size-5" />
                </div>
                <div className="grid gap-1">
                  <h2 className="text-base font-semibold">
                    Nenhum registro encontrado
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Cadastre um item ou ajuste a busca e o filtro.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 border-t px-3 py-2 text-sm">
            <span className="text-xs text-muted-foreground">Página</span>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                aria-label="Página anterior"
                disabled={safePage <= 1}
                onClick={() => setPage((currentPage) => currentPage - 1)}
              >
                <ArrowRightIcon className="rotate-180" />
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
                <ArrowRightIcon />
              </Button>
              <span className="ml-1 text-xs text-muted-foreground">
                de {totalPages}
              </span>
            </div>
          </div>
        </section>
      </div>
    </section>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-muted/30 px-2.5 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
    </div>
  )
}

function SyncPill({
  status,
}: {
  status: "loading" | "saved" | "saving" | "local"
}) {
  const label =
    status === "loading"
      ? "Carregando"
      : status === "saving"
        ? "Salvando"
        : status === "saved"
          ? "Banco"
          : "Local"

  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs font-semibold text-muted-foreground">
      <DatabaseIcon className="size-3" />
      {label}
    </span>
  )
}

function StatusPill({ status }: { status: AppPageRecord["status"] }) {
  const meta = statusOptions.find((option) => option.value === status)

  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold",
        meta?.className
      )}
    >
      {status === "done" ? (
        <CheckCircle2Icon className="size-3" />
      ) : (
        <CircleDashedIcon className="size-3" />
      )}
      {meta?.label ?? status}
    </span>
  )
}

function getStatusLabel(status: AppPageRecord["status"]) {
  return statusOptions.find((option) => option.value === status)?.label ?? status
}

function getPriorityLabel(priority: AppPageRecord["priority"]) {
  return (
    priorityOptions.find((option) => option.value === priority)?.label ??
    priority
  )
}

function createDefaultRecords(
  title: string,
  description: string,
  actions: PageAction[] | undefined,
  moduleKey: string
): AppPageRecord[] {
  const now = new Date()
  const rows = actions?.length ? actions : [{ title, description, href: "" }]

  return rows.map((row, index) => ({
    id: `${moduleKey}-seed-${index}`,
    title: row.title,
    description: row.description,
    href: row.href,
    status: "todo",
    priority: "normal",
    owner: "",
    createdAt: now,
    updatedAt: now,
  }))
}

function createRecordId(moduleKey: string) {
  if (typeof window.crypto?.randomUUID === "function") {
    return `${moduleKey}-${window.crypto.randomUUID()}`
  }

  return `${moduleKey}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
}

function formatDateTime(date: Date) {
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}
