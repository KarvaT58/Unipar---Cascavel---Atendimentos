import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

import {
  EMPTY_APP_STATE,
  mergeAppStates,
  normalizeAppState,
  serializeAppState,
  type AppState,
  type AppStateEnvelope,
} from "@/lib/app-state"
import type { RealtimeEvent } from "@/lib/server/state-store"

type OfflineRealtimeEvent = RealtimeEvent

type OfflineStateStore = {
  version: 1
  state: unknown
  revision: number
  nextEventId: number
  events: OfflineRealtimeEvent[]
}

const offlineStatePath = path.join(
  process.cwd(),
  ".local-data",
  "app-state-fallback.json"
)
const maxStoredEvents = 500

let updateChain: Promise<void> = Promise.resolve()

export async function readOfflineAppState(): Promise<AppStateEnvelope> {
  const store = await readOfflineStateStore()

  return {
    state: normalizeAppState(store.state),
    revision: store.revision,
    databaseConnected: false,
  }
}

export async function saveOfflineAppState(
  state: AppState,
  clientId: string,
  source = "state"
): Promise<AppStateEnvelope> {
  return updateOfflineStateStore((store) => {
    const storedState = normalizeAppState(store.state)
    const stateToSave = mergeAppStates(storedState, state)
    const revision = store.revision + 1
    const eventId = Math.max(store.nextEventId, getLatestEventId(store) + 1)

    store.state = JSON.parse(serializeAppState(stateToSave))
    store.revision = revision
    store.nextEventId = eventId + 1
    store.events = [
      ...store.events,
      {
        id: eventId,
        clientId,
        source,
        payload: {
          revision,
          key: "main",
        },
        createdAt: new Date().toISOString(),
      },
    ].slice(-maxStoredEvents)

    return {
      state: stateToSave,
      revision,
      databaseConnected: false,
    }
  })
}

export async function readOfflineRealtimeEvents(afterId: number) {
  const store = await readOfflineStateStore()
  const minimumId = Math.max(0, Math.floor(afterId))

  return store.events
    .filter((event) => event.id > minimumId)
    .sort((first, second) => first.id - second.id)
    .slice(0, 100)
}

export async function readLatestOfflineRealtimeEventId() {
  const store = await readOfflineStateStore()

  return getLatestEventId(store)
}

async function updateOfflineStateStore<T>(
  update: (store: OfflineStateStore) => T | Promise<T>
) {
  const run = updateChain.then(async () => {
    const store = await readOfflineStateStore()
    const result = await update(store)

    await writeOfflineStateStore(store)

    return result
  })

  updateChain = run.then(
    () => undefined,
    () => undefined
  )

  return run
}

async function readOfflineStateStore(): Promise<OfflineStateStore> {
  try {
    const file = await readFile(offlineStatePath, "utf8")
    const parsed = JSON.parse(file) as Partial<OfflineStateStore>
    const events = Array.isArray(parsed.events) ? parsed.events : []
    const latestEventId = events.reduce(
      (latestId, event) =>
        typeof event.id === "number" ? Math.max(latestId, event.id) : latestId,
      0
    )

    return {
      version: 1,
      state: parsed.state ?? EMPTY_APP_STATE,
      revision:
        typeof parsed.revision === "number" && parsed.revision >= 0
          ? parsed.revision
          : 0,
      nextEventId:
        typeof parsed.nextEventId === "number" && parsed.nextEventId > 0
          ? parsed.nextEventId
          : latestEventId + 1,
      events,
    }
  } catch {
    return createEmptyStore()
  }
}

async function writeOfflineStateStore(store: OfflineStateStore) {
  await mkdir(path.dirname(offlineStatePath), { recursive: true })
  await writeFile(offlineStatePath, JSON.stringify(store, null, 2), "utf8")
}

function createEmptyStore(): OfflineStateStore {
  return {
    version: 1,
    state: EMPTY_APP_STATE,
    revision: 0,
    nextEventId: 1,
    events: [],
  }
}

function getLatestEventId(store: OfflineStateStore) {
  return store.events.reduce(
    (latestId, event) =>
      typeof event.id === "number" ? Math.max(latestId, event.id) : latestId,
    0
  )
}
