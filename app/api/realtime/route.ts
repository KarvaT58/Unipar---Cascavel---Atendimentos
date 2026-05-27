import {
  readLatestRealtimeEventId,
  readRealtimeEvents,
} from "@/lib/server/state-store"
import { getSessionUser } from "@/lib/session"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const encoder = new TextEncoder()
const REALTIME_POLL_INTERVAL_MS = 1000
type RealtimeSubscriber = {
  controller: ReadableStreamDefaultController<Uint8Array>
  lastEventId: number
  closed: boolean
}

const realtimeSubscribers = new Set<RealtimeSubscriber>()
let realtimePoller: ReturnType<typeof setInterval> | null = null
let realtimePollInFlight = false

function encodeSse(event: string, data: unknown) {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

function startRealtimePoller() {
  if (realtimePoller) return

  realtimePoller = setInterval(() => {
    void pollRealtimeSubscribers()
  }, REALTIME_POLL_INTERVAL_MS)
}

function stopRealtimePollerIfIdle() {
  if (realtimeSubscribers.size > 0 || !realtimePoller) return

  clearInterval(realtimePoller)
  realtimePoller = null
}

function closeRealtimeSubscriber(subscriber: RealtimeSubscriber) {
  if (subscriber.closed) return

  subscriber.closed = true
  realtimeSubscribers.delete(subscriber)

  try {
    subscriber.controller.close()
  } catch {
    // O navegador pode ter encerrado a conexao antes do servidor fechar.
  }

  stopRealtimePollerIfIdle()
}

function enqueueRealtimeEvent(
  subscriber: RealtimeSubscriber,
  event: string,
  data: unknown
) {
  if (subscriber.closed) return false

  try {
    subscriber.controller.enqueue(encodeSse(event, data))
    return true
  } catch {
    closeRealtimeSubscriber(subscriber)
    return false
  }
}

async function pollRealtimeSubscribers() {
  if (realtimePollInFlight || realtimeSubscribers.size === 0) return

  realtimePollInFlight = true

  try {
    const subscribers = Array.from(realtimeSubscribers).filter(
      (subscriber) => !subscriber.closed
    )

    if (subscribers.length === 0) {
      stopRealtimePollerIfIdle()
      return
    }

    const lastKnownEventId = Math.min(
      ...subscribers.map((subscriber) => subscriber.lastEventId)
    )
    const events = await readRealtimeEvents(lastKnownEventId)
    const heartbeatPayload = {
      now: new Date().toISOString(),
    }

    for (const subscriber of subscribers) {
      let deliveredLastEventId = subscriber.lastEventId

      for (const event of events) {
        if (event.id <= subscriber.lastEventId) continue

        deliveredLastEventId = event.id
        enqueueRealtimeEvent(subscriber, "state", event)
      }

      subscriber.lastEventId = deliveredLastEventId
      enqueueRealtimeEvent(subscriber, "heartbeat", {
        ...heartbeatPayload,
        lastEventId: subscriber.lastEventId,
      })
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Realtime stream failed."

    for (const subscriber of Array.from(realtimeSubscribers)) {
      enqueueRealtimeEvent(subscriber, "error", { message })
    }
  } finally {
    realtimePollInFlight = false
  }
}

export async function GET(request: Request) {
  const currentUser = await getSessionUser().catch(() => null)

  if (!currentUser) {
    return Response.json(
      { message: "Sessão expirada. Faça login novamente." },
      { status: 401 }
    )
  }

  const { searchParams } = new URL(request.url)
  const initialLastEventId = searchParams.get("lastEventId")
  let lastEventId =
    initialLastEventId === "latest"
      ? await readLatestRealtimeEventId()
      : Number(initialLastEventId ?? 0)

  if (!Number.isFinite(lastEventId)) {
    lastEventId = 0
  }

  let subscriber: RealtimeSubscriber | null = null
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      subscriber = {
        controller,
        lastEventId,
        closed: false,
      }

      realtimeSubscribers.add(subscriber)
      enqueueRealtimeEvent(subscriber, "ready", { ok: true })
      startRealtimePoller()
      void pollRealtimeSubscribers()

      request.signal.addEventListener(
        "abort",
        () => {
          if (subscriber) {
            closeRealtimeSubscriber(subscriber)
          }
        },
        { once: true }
      )
    },
    cancel() {
      if (subscriber) {
        closeRealtimeSubscriber(subscriber)
      }
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
