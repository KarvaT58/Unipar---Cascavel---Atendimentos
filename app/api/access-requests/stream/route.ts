import { NextResponse } from "next/server"

import { canUseOfflineFallback } from "@/lib/local-mode"
import { listPendingOfflineAccessRequests } from "@/lib/offline-auth-store"
import { prisma } from "@/lib/prisma"
import { getSectorLabel } from "@/lib/sectors"
import { decryptString } from "@/lib/security"
import { getSessionUser } from "@/lib/session"
import { formatDateTimeBR, formatPhoneBR } from "@/lib/validators"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: Request) {
  const currentUser = await getSessionUser().catch(() => null)

  if (!currentUser || currentUser.role !== "ADMIN") {
    return NextResponse.json(
      { message: "Apenas administradores podem ver solicitações." },
      { status: 403 }
    )
  }

  const encoder = new TextEncoder()
  let interval: ReturnType<typeof setInterval> | undefined
  let heartbeat: ReturnType<typeof setInterval> | undefined
  let lastPayload = ""
  let closed = false
  let running = false

  const stream = new ReadableStream({
    async start(controller) {
      async function sendRequests(force = false) {
        if (closed || running) {
          return
        }

        running = true

        try {
          const requests = await getPendingRequestRows()
          const payload = JSON.stringify({ requests })

          if (force || payload !== lastPayload) {
            lastPayload = payload
            controller.enqueue(
              encoder.encode(`event: requests\ndata: ${payload}\n\n`)
            )
          }
        } finally {
          running = false
        }
      }

      await sendRequests(true)

      interval = setInterval(() => {
        void sendRequests()
      }, 2500)

      heartbeat = setInterval(() => {
        if (!closed) {
          controller.enqueue(encoder.encode(": keep-alive\n\n"))
        }
      }, 15000)

      request.signal.addEventListener("abort", () => {
        closed = true
        clearStreamTimers(interval, heartbeat)

        try {
          controller.close()
        } catch {
          // The stream can already be closed when the browser navigates away.
        }
      })
    },
    cancel() {
      closed = true
      clearStreamTimers(interval, heartbeat)
    },
  })

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  })
}

async function getPendingRequestRows() {
  const requests = await prisma.accessRequest
    .findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "desc" },
    })
    .catch((error) => {
      if (!canUseOfflineFallback()) {
        throw error
      }

      return listPendingOfflineAccessRequests()
    })

  return requests.map((request) => {
    const sector = getSectorLabel(request.sector)

    return {
      id: request.id,
      name: request.name,
      email: request.email,
      sector: request.sector,
      sectorLabel: `${sector.code} - ${sector.name}`,
      phone: formatPhoneBR(request.phone),
      rawPhone: request.phone,
      cpf: safelyDecrypt(request.cpfCiphertext),
      createdAt: formatDateTimeBR(new Date(request.createdAt)),
    }
  })
}

function safelyDecrypt(value: string) {
  try {
    return decryptString(value)
  } catch {
    return ""
  }
}

function clearStreamTimers(
  interval?: ReturnType<typeof setInterval>,
  heartbeat?: ReturnType<typeof setInterval>
) {
  if (interval) {
    clearInterval(interval)
  }

  if (heartbeat) {
    clearInterval(heartbeat)
  }
}
