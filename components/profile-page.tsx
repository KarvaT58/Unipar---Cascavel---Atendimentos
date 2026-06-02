"use client"

import * as React from "react"
import {
  Building2Icon,
  CameraIcon,
  CheckCircle2Icon,
  CircleAlertIcon,
  ImageOffIcon,
  RotateCcwIcon,
  SaveIcon,
  ShieldCheckIcon,
  UserRoundIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  USER_CHAT_STATUS_OPTIONS,
  USER_WORK_STATUS_OPTIONS,
  getUserChatStatusLabel,
  getUserWorkStatusLabel,
  type AdminUser,
  type Sector,
  type UserChatStatus,
  type UserWorkStatus,
} from "@/lib/admin-data"
import type { AppState } from "@/lib/app-state"
import {
  createBackendClientId,
  fetchBackendState,
  fetchCurrentSession,
  saveBackendState,
  saveUserProfile,
} from "@/lib/backend-client"
import { getChatPresenceMeta } from "@/lib/chat-data"
import { getSectorLabel } from "@/lib/sectors"
import { cn } from "@/lib/utils"

type ProfileState = {
  id: string
  name: string
  email: string
  sector: Sector
  isAdmin: boolean
  avatar: string
  about: string
  chatStatus: UserChatStatus
  workStatus: UserWorkStatus
}

const DEFAULT_ABOUT = "Disponível"
const AVATAR_SIZE = 512
const MAX_AVATAR_FILE_SIZE = 8 * 1024 * 1024
const WORK_STATUS_STYLES: Record<UserWorkStatus, string> = {
  available: "border-emerald-500/35 bg-emerald-500/10 text-emerald-300",
  "home-office": "border-sky-500/35 bg-sky-500/10 text-sky-300",
  meeting: "border-amber-500/35 bg-amber-500/10 text-amber-300",
  lunch: "border-yellow-500/35 bg-yellow-500/10 text-yellow-300",
  support: "border-cyan-500/35 bg-cyan-500/10 text-cyan-300",
  training: "border-violet-500/35 bg-violet-500/10 text-violet-300",
  external: "border-orange-500/35 bg-orange-500/10 text-orange-300",
  focus: "border-rose-500/35 bg-rose-500/10 text-rose-300",
  vacation: "border-fuchsia-500/35 bg-fuchsia-500/10 text-fuchsia-300",
}

export function ProfilePage() {
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const clientIdRef = React.useRef("")
  const latestStateRef = React.useRef<AppState | null>(null)
  const [profile, setProfile] = React.useState<ProfileState | null>(null)
  const [savedProfile, setSavedProfile] = React.useState<ProfileState | null>(
    null,
  )
  const [isLoading, setIsLoading] = React.useState(true)
  const [isSaving, setIsSaving] = React.useState(false)
  const [isUploadingAvatar, setIsUploadingAvatar] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false

    clientIdRef.current = createBackendClientId()

    Promise.all([fetchCurrentSession(), fetchBackendState()])
      .then(([sessionUser, envelope]) => {
        if (cancelled) return

        latestStateRef.current = envelope.state

        if (!sessionUser) {
          setProfile(null)
          setSavedProfile(null)
          return
        }

        const stateUser = findProfileAdminUser(envelope.state, sessionUser)
        const nextProfile: ProfileState = {
          id: sessionUser.id,
          name: stateUser?.name ?? sessionUser.name,
          email: (stateUser?.email ?? sessionUser.email).toLowerCase(),
          sector: stateUser?.sector ?? sessionUser.sector,
          isAdmin: stateUser?.isAdmin ?? sessionUser.isAdmin,
          avatar: stateUser?.avatar ?? sessionUser.avatar ?? "",
          about: stateUser?.about ?? sessionUser.about ?? DEFAULT_ABOUT,
          chatStatus:
            stateUser?.chatStatus ?? sessionUser.chatStatus ?? "online",
          workStatus:
            stateUser?.workStatus ?? sessionUser.workStatus ?? "available",
        }

        setProfile(nextProfile)
        setSavedProfile(nextProfile)
      })
      .catch((error) => {
        console.error(error)
        toast.error("Não foi possível carregar seu perfil.")
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const hasChanges =
    profile !== null &&
    savedProfile !== null &&
    JSON.stringify(profile) !== JSON.stringify(savedProfile)
  const sectorLabel = profile ? getSectorLabel(profile.sector) : null
  const presenceMeta = profile
    ? getChatPresenceMeta({
        chatStatus: profile.chatStatus,
        isOnline: profile.chatStatus === "online",
      })
    : null
  const chatStatusOption = profile
    ? USER_CHAT_STATUS_OPTIONS.find(
        (option) => option.value === profile.chatStatus,
      )
    : null
  const workStatusOption = profile
    ? USER_WORK_STATUS_OPTIONS.find(
        (option) => option.value === profile.workStatus,
      )
    : null
  const roleLabel = profile?.isAdmin ? "Administrador" : "Usuário"

  function updateProfile(patch: Partial<ProfileState>) {
    setProfile((currentProfile) =>
      currentProfile ? { ...currentProfile, ...patch } : currentProfile,
    )
  }

  async function handleAvatarChange(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0]

    if (!file) return

    if (!file.type.startsWith("image/")) {
      toast.error("Selecione uma imagem para o avatar.")
      return
    }

    if (file.size > MAX_AVATAR_FILE_SIZE) {
      toast.error("A imagem precisa ter até 8 MB.")
      return
    }

    setIsUploadingAvatar(true)

    try {
      const avatar = await resizeAvatarImage(file)

      updateProfile({ avatar })
      toast.success("Foto carregada.")
    } catch (error) {
      console.error(error)
      toast.error("Não foi possível carregar a foto.")
    } finally {
      setIsUploadingAvatar(false)

      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  function handleRemoveAvatar() {
    updateProfile({ avatar: "" })
    toast.success("Foto removida.")
  }

  async function handleSave() {
    if (!profile || !latestStateRef.current) return

    setIsSaving(true)

    try {
      const nextState = upsertProfileAdminUser(latestStateRef.current, profile)

      await saveUserProfile({
        ...profile,
        clientId: clientIdRef.current || "profile-page",
      }).catch(() => undefined)

      const envelope = await saveBackendState(
        nextState,
        clientIdRef.current || "profile-page",
        "profile",
      )

      latestStateRef.current = envelope.state
      setSavedProfile(profile)

      toast.success("Perfil atualizado.")
    } catch (error) {
      console.error(error)
      toast.error("Não foi possível salvar o perfil.")
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-full min-h-80 items-center justify-center text-sm text-muted-foreground">
        Carregando perfil...
      </div>
    )
  }

  if (!profile || !sectorLabel || !presenceMeta) {
    return (
      <div className="flex h-full min-h-80 items-center justify-center text-sm text-muted-foreground">
        Entre novamente para editar seu perfil.
      </div>
    )
  }

  return (
    <section className="flex h-full min-h-0 items-center justify-center overflow-auto bg-background px-3 py-6">
      <Card className="w-full max-w-[36rem] overflow-hidden border-border/80 bg-background shadow-2xl shadow-black/20">
        <CardHeader className="border-b px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-xl">Perfil</CardTitle>
                <span
                  className={cn(
                    "inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs font-semibold",
                    hasChanges
                      ? "border-amber-500/35 bg-amber-500/10 text-amber-300"
                      : "border-emerald-500/35 bg-emerald-500/10 text-emerald-300",
                  )}
                >
                  {hasChanges ? (
                    <CircleAlertIcon className="size-3" />
                  ) : (
                    <CheckCircle2Icon className="size-3" />
                  )}
                  {hasChanges ? "Pendente" : "Sincronizado"}
                </span>
              </div>
              <CardDescription>
                Ajuste sua foto, presença, trabalho e recado.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-5">
          <div className="flex flex-col items-center text-center">
            <div className="relative">
              <Avatar className="size-28 border border-border bg-background">
                {profile.avatar ? (
                  <AvatarImage src={profile.avatar} alt={profile.name} />
                ) : null}
                <AvatarFallback className="text-2xl">
                  {getInitials(profile.name)}
                </AvatarFallback>
              </Avatar>
              <span
                className={cn(
                  "absolute bottom-2 right-1 size-4 rounded-full border-2 border-background",
                  presenceMeta.dotClassName,
                )}
              />
            </div>

            <h1 className="mt-4 max-w-full truncate text-xl font-semibold">
              {profile.name}
            </h1>
            <p className="max-w-full truncate text-sm text-muted-foreground">
              {profile.email}
            </p>

            <div className="mt-3 flex max-w-full flex-wrap justify-center gap-2">
              <StatusPill
                className="border-primary/25 bg-primary/10 text-primary"
                icon={Building2Icon}
                label={`${sectorLabel.code} - ${sectorLabel.name}`}
              />
              <StatusPill
                className="border-border bg-muted/35 text-foreground"
                icon={profile.isAdmin ? ShieldCheckIcon : UserRoundIcon}
                label={roleLabel}
              />
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />

            <div className="mt-5 grid w-full grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={isUploadingAvatar}
                onClick={() => fileInputRef.current?.click()}
              >
                <CameraIcon />
                {profile.avatar ? "Alterar foto" : "Enviar foto"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={!profile.avatar || isUploadingAvatar}
                onClick={handleRemoveAvatar}
              >
                <ImageOffIcon />
                Remover
              </Button>
            </div>
          </div>

          <div className="mt-6 grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="profile-chat-status">Status de presença</Label>
              <Select
                value={profile.chatStatus}
                onValueChange={(value) =>
                  updateProfile({
                    chatStatus: value as UserChatStatus,
                  })
                }
              >
                <SelectTrigger id="profile-chat-status" className="h-11">
                  <span className="truncate">
                    {chatStatusOption?.label ??
                      getUserChatStatusLabel(profile.chatStatus)}
                  </span>
                </SelectTrigger>
                <SelectContent className="rounded-lg">
                  {USER_CHAT_STATUS_OPTIONS.map((option) => (
                    <SelectItem
                      key={option.value}
                      value={option.value}
                      className="rounded-md"
                    >
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="profile-work-status">Status de trabalho</Label>
              <Select
                value={profile.workStatus}
                onValueChange={(value) =>
                  updateProfile({
                    workStatus: value as UserWorkStatus,
                  })
                }
              >
                <SelectTrigger
                  id="profile-work-status"
                  className={cn("h-11", WORK_STATUS_STYLES[profile.workStatus])}
                >
                  <span className="truncate">
                    {workStatusOption?.label ??
                      getUserWorkStatusLabel(profile.workStatus)}
                  </span>
                </SelectTrigger>
                <SelectContent className="rounded-lg">
                  {USER_WORK_STATUS_OPTIONS.map((option) => (
                    <SelectItem
                      key={option.value}
                      value={option.value}
                      className="rounded-md"
                    >
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="profile-about">Recado</Label>
              <Textarea
                id="profile-about"
                value={profile.about}
                maxLength={140}
                onChange={(event) =>
                  updateProfile({ about: event.target.value })
                }
                placeholder="Ex.: Atendendo demandas do setor"
                className="min-h-24 resize-none"
              />
              <div className="flex items-center justify-end text-xs text-muted-foreground">
                <span className="tabular-nums">{profile.about.length}/140</span>
              </div>
            </div>
          </div>
        </CardContent>

        <div className="grid grid-cols-2 gap-2 border-t bg-muted/35 p-4">
          <Button
            type="button"
            variant="outline"
            disabled={!hasChanges || isSaving}
            onClick={() => savedProfile && setProfile(savedProfile)}
          >
            <RotateCcwIcon />
            Restaurar
          </Button>
          <Button
            type="button"
            disabled={!hasChanges || isSaving}
            onClick={handleSave}
          >
            {isSaving ? <CheckCircle2Icon /> : <SaveIcon />}
            {isSaving ? "Salvando" : "Salvar"}
          </Button>
        </div>
      </Card>
    </section>
  )
}

function StatusPill({
  className,
  icon: Icon,
  label,
}: {
  className?: string
  icon?: React.ComponentType<{ className?: string }>
  label: string
}) {
  return (
    <span
      className={cn(
        "inline-flex min-h-6 max-w-full items-center gap-1 rounded-full border px-2 text-xs font-semibold",
        className,
      )}
    >
      {Icon ? <Icon className="size-3" /> : null}
      <span className="truncate">{label}</span>
    </span>
  )
}

function findProfileAdminUser(
  state: AppState,
  sessionUser: { id: string; email: string },
) {
  const normalizedEmail = sessionUser.email.toLowerCase()

  return state.adminUsers.find(
    (user) =>
      user.id === sessionUser.id ||
      user.email.toLowerCase() === normalizedEmail,
  )
}

function upsertProfileAdminUser(
  state: AppState,
  profile: ProfileState,
): AppState {
  const now = new Date()
  let foundUser = false
  const nextAdminUsers = state.adminUsers.map((user) => {
    const sameUser =
      user.id === profile.id ||
      user.email.toLowerCase() === profile.email.toLowerCase()

    if (!sameUser) return user

    foundUser = true

    return toAdminUser(user, profile, now)
  })

  if (!foundUser) {
    nextAdminUsers.unshift(toAdminUser(undefined, profile, now))
  }

  return {
    ...state,
    adminUsers: nextAdminUsers,
  }
}

function toAdminUser(
  currentUser: AdminUser | undefined,
  profile: ProfileState,
  now: Date,
): AdminUser {
  return {
    id: currentUser?.id ?? profile.id,
    name: currentUser?.name ?? profile.name,
    email: currentUser?.email ?? profile.email,
    sector: currentUser?.sector ?? profile.sector,
    password: currentUser?.password ?? "",
    isAdmin: currentUser?.isAdmin ?? profile.isAdmin,
    status: currentUser?.status ?? "active",
    createdAt: currentUser?.createdAt ?? now,
    avatar: profile.avatar,
    about: profile.about.trim() || DEFAULT_ABOUT,
    chatStatus: profile.chatStatus,
    workStatus: profile.workStatus,
    lastSeenAt: now,
  }
}

async function resizeAvatarImage(file: File) {
  const objectUrl = URL.createObjectURL(file)

  try {
    const image = await loadImage(objectUrl)
    const canvas = document.createElement("canvas")
    const scale = Math.min(
      1,
      AVATAR_SIZE / Math.max(image.naturalWidth, image.naturalHeight),
    )
    const width = Math.max(1, Math.round(image.naturalWidth * scale))
    const height = Math.max(1, Math.round(image.naturalHeight * scale))

    canvas.width = width
    canvas.height = height

    const context = canvas.getContext("2d")

    if (!context) {
      throw new Error("Canvas indisponível.")
    }

    context.fillStyle = "#111111"
    context.fillRect(0, 0, width, height)
    context.drawImage(image, 0, 0, width, height)

    return canvas.toDataURL("image/jpeg", 0.86)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()

    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error("Imagem inválida."))
    image.src = src
  })
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)

  if (!parts.length) return "U"

  return parts
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
}
