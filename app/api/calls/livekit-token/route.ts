import { AccessToken } from "livekit-server-sdk"
import { NextResponse } from "next/server"

import { getSessionUser } from "@/lib/session"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const API_KEY = process.env.LIVEKIT_API_KEY
const API_SECRET = process.env.LIVEKIT_API_SECRET
const LIVEKIT_URL = process.env.LIVEKIT_URL

function getCallParticipantIds(roomName: string) {
  const [prefix, callerId, calleeId] = roomName.split("-")

  if (prefix !== "call" || !callerId || !calleeId) return null

  return { callerId, calleeId }
}

export async function GET(request: Request) {
  const currentUser = await getSessionUser().catch(() => null)

  if (!currentUser) {
    return NextResponse.json(
      { message: "Sessao expirada. Faca login novamente." },
      { status: 401 }
    )
  }

  if (!API_KEY || !API_SECRET || !LIVEKIT_URL) {
    return NextResponse.json(
      { message: "Servico de chamadas nao configurado." },
      { status: 503 }
    )
  }

  const { searchParams } = new URL(request.url)
  const roomName = searchParams.get("roomName")

  if (!roomName) {
    return NextResponse.json(
      { message: "Parametro roomName obrigatorio." },
      { status: 400 }
    )
  }

  const participants = getCallParticipantIds(roomName)

  if (
    !participants ||
    (participants.callerId !== currentUser.id &&
      participants.calleeId !== currentUser.id)
  ) {
    return NextResponse.json(
      { message: "Voce nao tem acesso a esta chamada." },
      { status: 403 }
    )
  }

  const accessToken = new AccessToken(API_KEY, API_SECRET, {
    identity: currentUser.id,
    name: currentUser.name,
    ttl: "4h",
  })

  accessToken.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: false,
  })

  const token = await accessToken.toJwt()

  return NextResponse.json({
    token,
    url: LIVEKIT_URL,
    roomName,
  })
}
