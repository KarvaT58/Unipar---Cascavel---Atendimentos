import {
  readLatestRealtimeEventId,
  readRealtimeEvents,
} from "@/lib/server/state-store"
import { getSessionUser } from "@/lib/session"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const encoder = new TextEncoder()
const REALTIME_POLL_INTERVAL_MS = 1000

function encodeSse(event: string, data: unknown) {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
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

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encodeSse("ready", { ok: true }))

      while (!request.signal.aborted) {
        try {
          const events = await readRealtimeEvents(lastEventId)

          for (const event of events) {
            lastEventId = event.id
            controller.enqueue(encodeSse("state", event))
          }

          controller.enqueue(
            encodeSse("heartbeat", {
              lastEventId,
              now: new Date().toISOString(),
            })
          )
          await delay(REALTIME_POLL_INTERVAL_MS)
        } catch (error) {
          controller.enqueue(
            encodeSse("error", {
              message:
                error instanceof Error
                  ? error.message
                  : "Realtime stream failed.",
            })
          )
          await delay(5000)
        }
      }

      controller.close()
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
