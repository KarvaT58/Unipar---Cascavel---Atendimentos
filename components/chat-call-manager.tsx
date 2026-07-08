"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  Mic,
  MicOff,
  Phone,
  PhoneIncoming,
  PhoneOff,
  Video,
  VideoOff,
} from "lucide-react"
import {
  LocalVideoTrack,
  RemoteAudioTrack,
  RemoteVideoTrack,
  Room,
  RoomEvent,
} from "livekit-client"
import { toast } from "sonner"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/unipar-ui/avatar"
import { Button } from "@/components/unipar-ui/button"
import type { Contact, DirectoryUser } from "@/lib/chat-data"
import { cn } from "@/lib/utils"

export type ChatCallKind = "audio" | "video"

type ChatCallSignalType =
  | "offer"
  | "answer"
  | "decline"
  | "end"
  | "timeout"
  | "busy"

type CallUser = {
  id: string
  name: string
  email: string
  avatar: string
}

type ChatCallSignal = {
  type: ChatCallSignalType
  callId: string
  kind: ChatCallKind
  conversationId: string
  fromUserId: string
  fromUserName: string
  fromUserEmail: string
  fromUserAvatar: string
  toUserId: string
  reason?: string
  createdAt: string
}

type RealtimeCallEnvelope = {
  id?: number
  payload?: {
    key?: string
    call?: ChatCallSignal
  }
}

type ActiveCallState = {
  callId: string
  kind: ChatCallKind
  role: "caller" | "callee"
  status: "preparing" | "calling" | "incoming" | "connecting" | "active"
  remoteUser: CallUser
  initiator: CallUser
  startedAt: number
  connectedAt?: number
  expiresAt?: number
}

export type ChatCallStartRequest = {
  id: string
  contact: Contact
  kind: ChatCallKind
}

export type ChatCallLogInput = {
  id: string
  callId: string
  kind: ChatCallKind
  status: "missed" | "declined" | "ended"
  content: string
  timestamp: Date
  initiator: CallUser
  remoteUser: CallUser
  durationSeconds?: number
}

interface ChatCallManagerProps {
  currentUser: DirectoryUser
  clientId: string
  outgoingRequest: ChatCallStartRequest | null
  onOutgoingRequestHandled: (requestId: string) => void
  onCallLogMessage: (message: ChatCallLogInput) => void
}

const CALL_RING_TIMEOUT_MS = 30_000
const CALL_SOUND_FILES = {
  ligando: "Ligando.mp3",
  chamando: "Chamando.mp3",
  recebendo: "Recebendo ligação.mp3",
  naoAtendida: "Ligação não atendida.mp3",
  recusada: "Ligação recusada.mp3",
  desligando: "Desligando ligação,video.mp3",
} as const
const CHAMANDO_DELAY_MS = 1_000

function getSoundUrl(filename: string) {
  return encodeURI(`/sound/${filename}`)
}

function getCallId(userId: string, contactId: string) {
  const randomValue =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`

  return `call-${userId}-${contactId}-${randomValue}`
}

function getUserInitials(name: string) {
  return name.slice(0, 2).toUpperCase()
}

function getCallKindLabel(kind: ChatCallKind) {
  return kind === "video" ? "video" : "audio"
}

function formatCallDuration(seconds: number) {
  const safeSeconds = Math.max(0, seconds)
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const remainingSeconds = safeSeconds % 60

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${remainingSeconds
      .toString()
      .padStart(2, "0")}`
  }

  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`
}

function getMediaErrorMessage(error: unknown, kind: ChatCallKind) {
  const mediaLabel = kind === "video" ? "camera e microfone" : "microfone"

  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") {
      return `Permita o acesso ao ${mediaLabel} para atender ou iniciar.`
    }

    if (error.name === "NotFoundError") {
      return `Nao encontrei ${mediaLabel} neste dispositivo.`
    }
  }

  return `Nao foi possivel acessar ${mediaLabel}.`
}

function signalToUser(signal: ChatCallSignal): CallUser {
  return {
    id: signal.fromUserId,
    name: signal.fromUserName,
    email: signal.fromUserEmail,
    avatar: signal.fromUserAvatar,
  }
}

function contactToUser(contact: Contact): CallUser {
  return {
    id: contact.id,
    name: contact.name,
    email: contact.email,
    avatar: contact.avatar,
  }
}

function directoryUserToCallUser(user: DirectoryUser): CallUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatar: user.avatar,
  }
}

export function ChatCallManager({
  currentUser,
  clientId,
  outgoingRequest,
  onOutgoingRequestHandled,
  onCallLogMessage,
}: ChatCallManagerProps) {
  const [callState, setCallState] = useState<ActiveCallState | null>(null)
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false)
  const [remoteMediaVersion, setRemoteMediaVersion] = useState(0)
  const [localTrackVersion, setLocalTrackVersion] = useState(0)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [ringCountdown, setRingCountdown] = useState(CALL_RING_TIMEOUT_MS / 1000)
  const [isMuted, setIsMuted] = useState(false)
  const [isCameraEnabled, setIsCameraEnabled] = useState(true)
  const callStateRef = useRef<ActiveCallState | null>(null)
  const roomRef = useRef<Room | null>(null)
  const intentionalDisconnectRef = useRef(false)
  const remoteVideoTrackRef = useRef<RemoteVideoTrack | null>(null)
  const remoteAudioTrackRef = useRef<RemoteAudioTrack | null>(null)
  const localVideoTrackRef = useRef<LocalVideoTrack | null>(null)
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null)
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null)
  const localVideoRef = useRef<HTMLVideoElement | null>(null)
  const processedEventIdsRef = useRef<Set<number>>(new Set())
  const processedRequestIdsRef = useRef<Set<string>>(new Set())
  const loggedCallMessageIdsRef = useRef<Set<string>>(new Set())
  const ringingAudioRef = useRef<HTMLAudioElement | null>(null)
  const incomingAudioRef = useRef<HTMLAudioElement | null>(null)
  const ringingForCallIdRef = useRef<string | null>(null)
  const incomingForCallIdRef = useRef<string | null>(null)
  const chamandoDelayTimeoutRef = useRef<number | null>(null)

  const currentUserInfo = useMemo(
    () => directoryUserToCallUser(currentUser),
    [currentUser],
  )
  const isVideoCall = callState?.kind === "video"
  const showActiveCallSurface =
    callState &&
    callState.status !== "incoming" &&
    callState.status !== "preparing"
  const callStatusLabel =
    callState?.status === "calling"
      ? "Chamando"
      : callState?.status === "connecting"
        ? "Conectando"
        : callState?.status === "active"
          ? "Em chamada"
          : "Preparando"

  const getActiveCall = useCallback(() => callStateRef.current, [])

  const setActiveCall = useCallback(
    (
      next:
        | ActiveCallState
        | null
        | ((prev: ActiveCallState | null) => ActiveCallState | null),
    ) => {
      setCallState((prev) => {
        const resolved =
          typeof next === "function"
            ? (next as (prev: ActiveCallState | null) => ActiveCallState | null)(
                prev,
              )
            : next

        callStateRef.current = resolved
        return resolved
      })
    },
    [],
  )

  const clearRingingAudioElement = useCallback(() => {
    if (chamandoDelayTimeoutRef.current !== null) {
      window.clearTimeout(chamandoDelayTimeoutRef.current)
      chamandoDelayTimeoutRef.current = null
    }

    if (ringingAudioRef.current) {
      ringingAudioRef.current.onended = null
      ringingAudioRef.current.pause()
      ringingAudioRef.current.currentTime = 0
      ringingAudioRef.current = null
    }
  }, [])

  const stopRingingAudio = useCallback(() => {
    ringingForCallIdRef.current = null
    clearRingingAudioElement()
  }, [clearRingingAudioElement])

  const clearIncomingAudioElement = useCallback(() => {
    if (incomingAudioRef.current) {
      incomingAudioRef.current.pause()
      incomingAudioRef.current.currentTime = 0
      incomingAudioRef.current = null
    }
  }, [])

  const stopIncomingAudio = useCallback(() => {
    incomingForCallIdRef.current = null
    clearIncomingAudioElement()
  }, [clearIncomingAudioElement])

  const stopAllCallSounds = useCallback(() => {
    stopRingingAudio()
    stopIncomingAudio()
  }, [stopIncomingAudio, stopRingingAudio])

  const playCallerRingingSequence = useCallback(() => {
    clearRingingAudioElement()

    const ligando = new Audio(getSoundUrl(CALL_SOUND_FILES.ligando))

    ringingAudioRef.current = ligando
    ligando.onended = () => {
      chamandoDelayTimeoutRef.current = window.setTimeout(() => {
        const chamando = new Audio(getSoundUrl(CALL_SOUND_FILES.chamando))

        chamando.loop = true
        ringingAudioRef.current = chamando
        void chamando.play().catch(() => undefined)
      }, CHAMANDO_DELAY_MS)
    }
    void ligando.play().catch(() => undefined)
  }, [clearRingingAudioElement])

  const playIncomingRingtone = useCallback(() => {
    clearIncomingAudioElement()

    const audio = new Audio(getSoundUrl(CALL_SOUND_FILES.recebendo))

    audio.loop = true
    incomingAudioRef.current = audio
    void audio.play().catch(() => undefined)
  }, [clearIncomingAudioElement])

  const playOneShotSound = useCallback((filename: string) => {
    const audio = new Audio(getSoundUrl(filename))

    void audio.play().catch(() => undefined)
  }, [])

  useEffect(() => {
    if (
      callState?.role === "caller" &&
      (callState.status === "preparing" || callState.status === "calling")
    ) {
      if (ringingForCallIdRef.current !== callState.callId) {
        ringingForCallIdRef.current = callState.callId
        playCallerRingingSequence()
      }
    } else if (ringingForCallIdRef.current !== null) {
      stopRingingAudio()
    }

    if (callState?.role === "callee" && callState.status === "incoming") {
      if (incomingForCallIdRef.current !== callState.callId) {
        incomingForCallIdRef.current = callState.callId
        playIncomingRingtone()
      }
    } else if (incomingForCallIdRef.current !== null) {
      stopIncomingAudio()
    }
  }, [
    callState?.callId,
    callState?.role,
    callState?.status,
    playCallerRingingSequence,
    playIncomingRingtone,
    stopIncomingAudio,
    stopRingingAudio,
  ])

  useEffect(() => {
    return () => {
      stopAllCallSounds()
    }
  }, [stopAllCallSounds])

  const publishSignal = useCallback(
    async (
      signal: Pick<
        ChatCallSignal,
        "type" | "callId" | "kind" | "conversationId" | "toUserId"
      > &
        Partial<ChatCallSignal>,
    ) => {
      const response = await fetch("/api/calls", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clientId,
          signal: {
            ...signal,
            fromUserAvatar: currentUser.avatar,
          },
        }),
      })

      if (!response.ok) {
        throw new Error("Nao foi possivel enviar o sinal da chamada.")
      }
    },
    [clientId, currentUser.avatar],
  )

  const clearPeer = useCallback(() => {
    const room = roomRef.current

    stopAllCallSounds()
    roomRef.current = null
    remoteVideoTrackRef.current?.detach()
    remoteVideoTrackRef.current = null
    remoteAudioTrackRef.current?.detach()
    remoteAudioTrackRef.current = null
    localVideoTrackRef.current = null
    setHasRemoteVideo(false)
    setRemoteMediaVersion((version) => version + 1)
    setLocalTrackVersion((version) => version + 1)
    setElapsedSeconds(0)
    setRingCountdown(CALL_RING_TIMEOUT_MS / 1000)
    setIsMuted(false)
    setIsCameraEnabled(true)

    if (room) {
      intentionalDisconnectRef.current = true
      void room.disconnect()
    }
  }, [stopAllCallSounds])

  const resetCall = useCallback(() => {
    clearPeer()
    setActiveCall(null)
  }, [clearPeer, setActiveCall])

  const addCallLog = useCallback(
    (
      state: ActiveCallState,
      status: ChatCallLogInput["status"],
      content: string,
      durationSeconds?: number,
    ) => {
      const id = `${state.callId}-${status}`

      if (loggedCallMessageIdsRef.current.has(id)) return

      loggedCallMessageIdsRef.current.add(id)
      onCallLogMessage({
        id,
        callId: state.callId,
        kind: state.kind,
        status,
        content,
        timestamp: new Date(),
        initiator: state.initiator,
        remoteUser: state.remoteUser,
        durationSeconds,
      })
    },
    [onCallLogMessage],
  )

  const addMissedCallLog = useCallback(
    (state: ActiveCallState) => {
      addCallLog(
        state,
        "missed",
        `Ligacao perdida de ${getCallKindLabel(state.kind)}`,
      )
    },
    [addCallLog],
  )

  const connectToCallRoom = useCallback(
    async (callId: string, kind: ChatCallKind) => {
      const params = new URLSearchParams({ roomName: callId })
      const response = await fetch(`/api/calls/livekit-token?${params.toString()}`)

      if (!response.ok) {
        throw new Error("Nao foi possivel obter acesso a chamada.")
      }

      const { token, url } = (await response.json()) as {
        token: string
        url: string
      }

      const room = new Room({ adaptiveStream: true, dynacast: true })

      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (track instanceof RemoteVideoTrack) {
          remoteVideoTrackRef.current = track
          setHasRemoteVideo(true)
        } else if (track instanceof RemoteAudioTrack) {
          remoteAudioTrackRef.current = track
        }

        setRemoteMediaVersion((version) => version + 1)
      })

      room.on(RoomEvent.TrackUnsubscribed, (track) => {
        track.detach()

        if (track instanceof RemoteVideoTrack) {
          remoteVideoTrackRef.current = null
          setHasRemoteVideo(false)
        } else if (track instanceof RemoteAudioTrack) {
          remoteAudioTrackRef.current = null
        }
      })

      room.on(RoomEvent.Disconnected, () => {
        if (intentionalDisconnectRef.current) {
          intentionalDisconnectRef.current = false
          return
        }

        toast.error("A conexao da chamada foi perdida.")
        resetCall()
      })

      roomRef.current = room

      try {
        await room.connect(url, token)
        await room.localParticipant.setMicrophoneEnabled(true)

        if (kind === "video") {
          const publication = await room.localParticipant.setCameraEnabled(true)

          if (publication?.track instanceof LocalVideoTrack) {
            localVideoTrackRef.current = publication.track
            setLocalTrackVersion((version) => version + 1)
          }
        }
      } catch (error) {
        roomRef.current = null
        intentionalDisconnectRef.current = true
        void room.disconnect()
        throw error
      }

      return room
    },
    [resetCall],
  )

  const startOutgoingCall = useCallback(
    async (request: ChatCallStartRequest) => {
      if (getActiveCall()) {
        toast.info("Finalize a chamada atual antes de iniciar outra.")
        return
      }

      const remoteUser = contactToUser(request.contact)
      const callId = getCallId(currentUser.id, remoteUser.id)
      const startedAt = Date.now()
      const nextCallState: ActiveCallState = {
        callId,
        kind: request.kind,
        role: "caller",
        status: "preparing",
        remoteUser,
        initiator: currentUserInfo,
        startedAt,
        expiresAt: startedAt + CALL_RING_TIMEOUT_MS,
      }

      setActiveCall(nextCallState)

      try {
        await connectToCallRoom(callId, request.kind)
        setActiveCall((currentCall) =>
          currentCall?.callId === callId
            ? { ...currentCall, status: "calling" }
            : currentCall,
        )
        await publishSignal({
          type: "offer",
          callId,
          kind: request.kind,
          conversationId: remoteUser.id,
          toUserId: remoteUser.id,
        })
      } catch (error) {
        if (getActiveCall()?.callId !== callId) return

        toast.error(getMediaErrorMessage(error, request.kind))
        resetCall()
      }
    },
    [
      connectToCallRoom,
      currentUser.id,
      currentUserInfo,
      getActiveCall,
      publishSignal,
      resetCall,
      setActiveCall,
    ],
  )

  const acceptIncomingCall = useCallback(async () => {
    const currentCall = callStateRef.current

    if (!currentCall || currentCall.status !== "incoming") {
      return
    }

    stopIncomingAudio()
    setActiveCall({ ...currentCall, status: "connecting" })

    try {
      await connectToCallRoom(currentCall.callId, currentCall.kind)
      await publishSignal({
        type: "answer",
        callId: currentCall.callId,
        kind: currentCall.kind,
        conversationId: currentCall.remoteUser.id,
        toUserId: currentCall.remoteUser.id,
      })
      setActiveCall((activeCall) =>
        activeCall?.callId === currentCall.callId
          ? { ...activeCall, status: "active", connectedAt: Date.now() }
          : activeCall,
      )
    } catch (error) {
      if (callStateRef.current?.callId !== currentCall.callId) return

      toast.error(getMediaErrorMessage(error, currentCall.kind))
      await publishSignal({
        type: "decline",
        callId: currentCall.callId,
        kind: currentCall.kind,
        conversationId: currentCall.remoteUser.id,
        toUserId: currentCall.remoteUser.id,
        reason: "media-error",
      }).catch(() => undefined)
      resetCall()
    }
  }, [
    connectToCallRoom,
    publishSignal,
    resetCall,
    setActiveCall,
    stopIncomingAudio,
  ])

  const declineIncomingCall = useCallback(async () => {
    const currentCall = callStateRef.current

    if (!currentCall) return

    await publishSignal({
      type: "decline",
      callId: currentCall.callId,
      kind: currentCall.kind,
      conversationId: currentCall.remoteUser.id,
      toUserId: currentCall.remoteUser.id,
    }).catch(() => undefined)
    addCallLog(
      currentCall,
      "declined",
      `Ligacao recusada de ${getCallKindLabel(currentCall.kind)}`,
    )
    resetCall()
  }, [addCallLog, publishSignal, resetCall])

  const endCurrentCall = useCallback(async () => {
    const currentCall = callStateRef.current

    if (!currentCall) return

    if (currentCall.status === "incoming") {
      await declineIncomingCall()
      return
    }

    const durationSeconds = currentCall.connectedAt
      ? Math.max(0, Math.floor((Date.now() - currentCall.connectedAt) / 1000))
      : 0

    await publishSignal({
      type: "end",
      callId: currentCall.callId,
      kind: currentCall.kind,
      conversationId: currentCall.remoteUser.id,
      toUserId: currentCall.remoteUser.id,
    }).catch(() => undefined)

    if (currentCall.status === "active") {
      playOneShotSound(CALL_SOUND_FILES.desligando)
      addCallLog(
        currentCall,
        "ended",
        `Chamada de ${getCallKindLabel(currentCall.kind)} encerrada - ${formatCallDuration(
          durationSeconds,
        )}`,
        durationSeconds,
      )
    }

    resetCall()
  }, [
    addCallLog,
    declineIncomingCall,
    playOneShotSound,
    publishSignal,
    resetCall,
  ])

  const handleCallSignal = useCallback(
    async (signal: ChatCallSignal) => {
      if (signal.toUserId !== currentUser.id) return

      const currentCall = callStateRef.current

      if (signal.type === "offer") {
        if (currentCall && currentCall.callId !== signal.callId) {
          await publishSignal({
            type: "busy",
            callId: signal.callId,
            kind: signal.kind,
            conversationId: signal.fromUserId,
            toUserId: signal.fromUserId,
            reason: "busy",
          }).catch(() => undefined)
          return
        }

        const remoteUser = signalToUser(signal)
        const createdAt = Date.parse(signal.createdAt)
        const startedAt = Number.isFinite(createdAt) ? createdAt : Date.now()

        setActiveCall({
          callId: signal.callId,
          kind: signal.kind,
          role: "callee",
          status: "incoming",
          remoteUser,
          initiator: remoteUser,
          startedAt,
          expiresAt: startedAt + CALL_RING_TIMEOUT_MS,
        })
        setRingCountdown(Math.ceil(CALL_RING_TIMEOUT_MS / 1000))
        return
      }

      if (!currentCall || currentCall.callId !== signal.callId) return

      if (signal.type === "answer") {
        if (currentCall.role !== "caller") return

        stopRingingAudio()
        setActiveCall((activeCall) =>
          activeCall?.callId === signal.callId
            ? { ...activeCall, status: "active", connectedAt: Date.now() }
            : activeCall,
        )
        return
      }

      if (signal.type === "decline") {
        playOneShotSound(CALL_SOUND_FILES.recusada)
        addCallLog(
          currentCall,
          "declined",
          `Ligacao recusada de ${getCallKindLabel(currentCall.kind)}`,
        )
        toast.info(`${currentCall.remoteUser.name} recusou a chamada.`)
        resetCall()
        return
      }

      if (signal.type === "busy") {
        toast.info(`${currentCall.remoteUser.name} esta em outra chamada.`)
        resetCall()
        return
      }

      if (signal.type === "timeout") {
        playOneShotSound(CALL_SOUND_FILES.naoAtendida)
        addMissedCallLog(currentCall)
        resetCall()
        return
      }

      if (signal.type === "end") {
        if (currentCall.status === "active") {
          playOneShotSound(CALL_SOUND_FILES.desligando)

          const durationSeconds = currentCall.connectedAt
            ? Math.max(0, Math.floor((Date.now() - currentCall.connectedAt) / 1000))
            : 0

          addCallLog(
            currentCall,
            "ended",
            `Chamada de ${getCallKindLabel(currentCall.kind)} encerrada - ${formatCallDuration(
              durationSeconds,
            )}`,
            durationSeconds,
          )
        }

        resetCall()
      }
    },
    [
      addCallLog,
      addMissedCallLog,
      currentUser.id,
      playOneShotSound,
      publishSignal,
      resetCall,
      setActiveCall,
      stopRingingAudio,
    ],
  )

  const handleCallSignalRef = useRef(handleCallSignal)

  useEffect(() => {
    handleCallSignalRef.current = handleCallSignal
  }, [handleCallSignal])

  useEffect(() => {
    if (!currentUser.id) return

    const events = new EventSource("/api/realtime?lastEventId=latest")

    events.addEventListener("state", (event) => {
      const envelope = JSON.parse(
        (event as MessageEvent).data,
      ) as RealtimeCallEnvelope

      if (typeof envelope.id === "number") {
        if (processedEventIdsRef.current.has(envelope.id)) return
        processedEventIdsRef.current.add(envelope.id)
      }

      if (envelope.payload?.key !== "call" || !envelope.payload.call) return

      void handleCallSignalRef.current(envelope.payload.call)
    })

    return () => {
      events.close()
    }
  }, [currentUser.id])

  useEffect(() => {
    if (!outgoingRequest) return
    if (processedRequestIdsRef.current.has(outgoingRequest.id)) return

    processedRequestIdsRef.current.add(outgoingRequest.id)
    onOutgoingRequestHandled(outgoingRequest.id)

    const timeoutId = window.setTimeout(() => {
      void startOutgoingCall(outgoingRequest)
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [onOutgoingRequestHandled, outgoingRequest, startOutgoingCall])

  useEffect(() => {
    const currentCall = callState

    if (!currentCall?.expiresAt) return
    if (currentCall.status !== "calling" && currentCall.status !== "incoming") {
      return
    }

    const updateCountdown = () => {
      setRingCountdown(
        Math.max(0, Math.ceil((currentCall.expiresAt! - Date.now()) / 1000)),
      )
    }
    const intervalId = window.setInterval(updateCountdown, 1000)
    const timeoutId = window.setTimeout(() => {
      const activeCall = callStateRef.current

      if (
        !activeCall ||
        activeCall.callId !== currentCall.callId ||
        (activeCall.status !== "calling" && activeCall.status !== "incoming")
      ) {
        return
      }

      playOneShotSound(CALL_SOUND_FILES.naoAtendida)
      addMissedCallLog(activeCall)

      if (activeCall.role === "caller") {
        void publishSignal({
          type: "timeout",
          callId: activeCall.callId,
          kind: activeCall.kind,
          conversationId: activeCall.remoteUser.id,
          toUserId: activeCall.remoteUser.id,
        }).catch(() => undefined)
      }

      resetCall()
    }, Math.max(0, currentCall.expiresAt - Date.now()))

    updateCountdown()

    return () => {
      window.clearInterval(intervalId)
      window.clearTimeout(timeoutId)
    }
  }, [addMissedCallLog, callState, playOneShotSound, publishSignal, resetCall])

  useEffect(() => {
    if (callState?.status !== "active" || !callState.connectedAt) return

    const intervalId = window.setInterval(() => {
      setElapsedSeconds(
        Math.max(0, Math.floor((Date.now() - callState.connectedAt!) / 1000)),
      )
    }, 1000)

    return () => window.clearInterval(intervalId)
  }, [callState?.connectedAt, callState?.status])

  useEffect(() => {
    const audioElement = remoteAudioRef.current
    const audioTrack = remoteAudioTrackRef.current

    if (audioElement && audioTrack) {
      audioTrack.attach(audioElement)
    }

    const videoElement = hasRemoteVideo ? remoteVideoRef.current : null
    const videoTrack = remoteVideoTrackRef.current

    if (videoElement && videoTrack) {
      videoTrack.attach(videoElement)
    }

    return () => {
      audioTrack?.detach()
      videoTrack?.detach()
    }
  }, [remoteMediaVersion, hasRemoteVideo])

  useEffect(() => {
    const videoElement = isCameraEnabled ? localVideoRef.current : null
    const videoTrack = localVideoTrackRef.current

    if (videoElement && videoTrack) {
      videoTrack.attach(videoElement)
    }

    return () => {
      videoTrack?.detach()
    }
  }, [localTrackVersion, isCameraEnabled])

  useEffect(() => {
    return () => {
      clearPeer()
    }
  }, [clearPeer])

  const toggleMute = async () => {
    const nextMuted = !isMuted

    await roomRef.current?.localParticipant.setMicrophoneEnabled(!nextMuted)
    setIsMuted(nextMuted)
  }

  const toggleCamera = async () => {
    if (callState?.kind !== "video") return

    const nextEnabled = !isCameraEnabled
    const publication =
      await roomRef.current?.localParticipant.setCameraEnabled(nextEnabled)

    if (nextEnabled && publication?.track instanceof LocalVideoTrack) {
      localVideoTrackRef.current = publication.track
    } else if (!nextEnabled) {
      localVideoTrackRef.current = null
    }

    setLocalTrackVersion((version) => version + 1)
    setIsCameraEnabled(nextEnabled)
  }

  if (!callState) return null

  if (callState.status === "incoming") {
    return (
      <div className="fixed inset-0 z-[95] flex items-center justify-center bg-background/85 p-4 backdrop-blur-sm">
        <div className="w-full max-w-sm rounded-lg border bg-card p-6 text-center shadow-2xl">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            {callState.kind === "video" ? (
              <Video className="h-7 w-7" />
            ) : (
              <PhoneIncoming className="h-7 w-7" />
            )}
          </div>
          <Avatar className="mx-auto mt-5 h-24 w-24 ring-4 ring-primary/10">
            <AvatarImage
              src={callState.remoteUser.avatar}
              alt={callState.remoteUser.name}
            />
            <AvatarFallback>
              {getUserInitials(callState.remoteUser.name)}
            </AvatarFallback>
          </Avatar>
          <h2 className="mt-4 text-xl font-semibold">
            {callState.remoteUser.name}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Chamada de {getCallKindLabel(callState.kind)} recebida
          </p>
          <p className="mt-3 text-sm font-medium tabular-nums text-primary">
            {ringCountdown}s
          </p>
          <div className="mt-6 flex items-center justify-center gap-4">
            <Button
              size="icon-lg"
              className="h-14 w-14 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void declineIncomingCall()}
              aria-label="Recusar chamada"
              title="Recusar"
            >
              <PhoneOff className="h-6 w-6" />
            </Button>
            <Button
              size="icon-lg"
              className="h-14 w-14 rounded-full bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() => void acceptIncomingCall()}
              aria-label="Atender chamada"
              title="Atender"
            >
              <Phone className="h-6 w-6" />
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-background/95 p-3 backdrop-blur-sm sm:p-4">
      <div className="flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-lg border bg-card shadow-2xl md:h-[min(44rem,calc(100vh-2rem))]">
        <div className="flex h-16 shrink-0 items-center justify-between gap-3 border-b bg-background px-4">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar className="h-10 w-10 ring-1 ring-border">
              <AvatarImage
                src={callState.remoteUser.avatar}
                alt={callState.remoteUser.name}
              />
              <AvatarFallback>
                {getUserInitials(callState.remoteUser.name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="truncate font-semibold">
                {callState.remoteUser.name}
              </div>
              <div className="truncate text-sm text-muted-foreground">
                {callStatusLabel} •{" "}
                {callState.status === "active"
                  ? formatCallDuration(elapsedSeconds)
                  : `${ringCountdown}s`}
              </div>
            </div>
          </div>
        </div>

        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[#111312] text-white">
          {isVideoCall && hasRemoteVideo ? (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex flex-col items-center gap-4 px-6 text-center">
              <Avatar className="h-28 w-28 ring-4 ring-white/10 sm:h-36 sm:w-36">
                <AvatarImage
                  src={callState.remoteUser.avatar}
                  alt={callState.remoteUser.name}
                />
                <AvatarFallback className="text-3xl">
                  {getUserInitials(callState.remoteUser.name)}
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="text-xl font-semibold sm:text-2xl">
                  {callState.remoteUser.name}
                </div>
                <div className="mt-1 text-sm text-white/70">
                  {callStatusLabel}
                </div>
              </div>
            </div>
          )}

          <audio ref={remoteAudioRef} autoPlay className="sr-only" />

          {isVideoCall && (
            <div className="absolute bottom-4 right-4 h-32 w-24 overflow-hidden rounded-md border border-white/20 bg-black shadow-xl sm:h-40 sm:w-28">
              {isCameraEnabled ? (
                <video
                  ref={localVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-black text-white/70">
                  <VideoOff className="h-6 w-6" />
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-center gap-3 border-t bg-[#111312] px-4 py-4 text-white">
          {showActiveCallSurface && (
            <>
              <Button
                variant="ghost"
                size="icon-lg"
                className={cn(
                  "h-12 w-12 rounded-full text-white hover:bg-white/15 hover:text-white",
                  isMuted ? "bg-white text-[#111312]" : "bg-white/10",
                )}
                onClick={() => void toggleMute()}
                aria-label={isMuted ? "Ativar microfone" : "Silenciar microfone"}
                title={isMuted ? "Ativar microfone" : "Silenciar microfone"}
              >
                {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              </Button>

              {isVideoCall && (
                <Button
                  variant="ghost"
                  size="icon-lg"
                  className={cn(
                    "h-12 w-12 rounded-full text-white hover:bg-white/15 hover:text-white",
                    isCameraEnabled
                      ? "bg-white/10"
                      : "bg-white text-[#111312]",
                  )}
                  onClick={() => void toggleCamera()}
                  aria-label={
                    isCameraEnabled ? "Desligar camera" : "Ligar camera"
                  }
                  title={isCameraEnabled ? "Desligar camera" : "Ligar camera"}
                >
                  {isCameraEnabled ? (
                    <Video className="h-5 w-5" />
                  ) : (
                    <VideoOff className="h-5 w-5" />
                  )}
                </Button>
              )}
            </>
          )}

          <Button
            size="icon-lg"
            className="h-14 w-14 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => void endCurrentCall()}
            aria-label="Encerrar chamada"
            title="Encerrar chamada"
          >
            <PhoneOff className="h-6 w-6" />
          </Button>
        </div>
      </div>
    </div>
  )
}
