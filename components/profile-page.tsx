"use client"

import * as React from "react"
import {
  Building2Icon,
  CameraIcon,
  CheckCircle2Icon,
  MailIcon,
  RotateCcwIcon,
  SaveIcon,
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
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  USER_CHAT_STATUS_OPTIONS,
  USER_WORK_STATUS_OPTIONS,
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

const DEFAULT_ABOUT = "Disponivel"
const AVATAR_SIZE = 512
const MAX_AVATAR_FILE_SIZE = 8 * 1024 * 1024

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
          about:
            stateUser?.about ??
            sessionUser.about ??
            DEFAULT_ABOUT,
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
        toast.error("Nao foi possivel carregar seu perfil.")
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
      toast.error("A imagem precisa ter ate 8 MB.")
      return
    }

    setIsUploadingAvatar(true)

    try {
      const avatar = await resizeAvatarImage(file)

      updateProfile({ avatar })
      toast.success("Foto carregada.")
    } catch (error) {
      console.error(error)
      toast.error("Nao foi possivel carregar a foto.")
    } finally {
      setIsUploadingAvatar(false)

      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  async function handleSave() {
    if (!profile || !latestStateRef.current) return

    setIsSaving(true)

    try {
      const nextState = upsertProfileAdminUser(latestStateRef.current, profile)
      const envelope = await saveBackendState(
        nextState,
        clientIdRef.current || "profile-page",
        "profile",
      )

      latestStateRef.current = envelope.state
      setSavedProfile(profile)

      await saveUserProfile({
        ...profile,
        clientId: clientIdRef.current || "profile-page",
      }).catch(() => undefined)

      toast.success("Perfil atualizado.")
    } catch (error) {
      console.error(error)
      toast.error("Nao foi possivel salvar o perfil.")
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
    <section className="flex h-full min-h-0 flex-col overflow-auto bg-background">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 pb-6">
        <Card className="overflow-hidden border-border/80 bg-card">
          <CardHeader className="border-b p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle className="text-xl">Perfil</CardTitle>
                <CardDescription>
                  Seus dados de exibicao, presenca e recado no sistema.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
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
            </div>
          </CardHeader>

          <CardContent className="grid gap-5 p-4 lg:grid-cols-[320px_1fr]">
            <div className="rounded-md border bg-background p-4">
              <div className="flex flex-col items-center text-center">
                <div className="relative">
                  <Avatar className="size-28">
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

                <h1 className="mt-3 max-w-full truncate text-lg font-semibold">
                  {profile.name}
                </h1>
                <p className="max-w-full truncate text-sm text-muted-foreground">
                  {profile.email}
                </p>
                <p className="mt-1 text-xs font-medium text-primary">
                  {sectorLabel.code} - {sectorLabel.name}
                </p>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarChange}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="mt-4 w-full"
                  disabled={isUploadingAvatar}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <CameraIcon />
                  {profile.avatar ? "Alterar foto" : "Enviar foto"}
                </Button>
              </div>
            </div>

            <div className="grid gap-4">
              <div className="grid gap-3 md:grid-cols-3">
                <ProfileInfoItem
                  icon={UserRoundIcon}
                  label="Nome"
                  value={profile.name}
                />
                <ProfileInfoItem
                  icon={MailIcon}
                  label="E-mail"
                  value={profile.email}
                />
                <ProfileInfoItem
                  icon={Building2Icon}
                  label="Setor"
                  value={`${sectorLabel.code} - ${sectorLabel.name}`}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="profile-chat-status">
                    Status de presenca
                  </Label>
                  <Select
                    value={profile.chatStatus}
                    onValueChange={(value) =>
                      updateProfile({
                        chatStatus: value as UserChatStatus,
                      })
                    }
                  >
                    <SelectTrigger id="profile-chat-status" className="h-10">
                      <SelectValue />
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
                  <p className="text-xs text-muted-foreground">
                    Controla o online/offline no Chat Interno, Grupos e Equipe.
                  </p>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="profile-work-status">
                    Status de trabalho
                  </Label>
                  <Select
                    value={profile.workStatus}
                    onValueChange={(value) =>
                      updateProfile({
                        workStatus: value as UserWorkStatus,
                      })
                    }
                  >
                    <SelectTrigger id="profile-work-status" className="h-10">
                      <SelectValue />
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
                  <p className="text-xs text-muted-foreground">
                    Aparece como recado/status nas paginas de equipe e contato.
                  </p>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="profile-about">Recado do perfil</Label>
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
                <p className="text-xs text-muted-foreground">
                  {profile.about.length}/140 caracteres
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  )
}

function ProfileInfoItem({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
}) {
  return (
    <div className="min-w-0 rounded-md border bg-background p-3">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="size-4" />
        {label}
      </div>
      <p className="mt-2 truncate text-sm font-semibold text-foreground">
        {value}
      </p>
    </div>
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
    id: profile.id,
    name: profile.name,
    email: profile.email,
    sector: profile.sector,
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
      throw new Error("Canvas indisponivel.")
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
    image.onerror = () => reject(new Error("Imagem invalida."))
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
