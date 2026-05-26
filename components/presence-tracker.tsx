"use client"

import * as React from "react"

import {
  createBackendClientId,
  sendCurrentPresenceBeacon,
  updateCurrentPresence,
} from "@/lib/backend-client"
import { PRESENCE_HEARTBEAT_MS } from "@/lib/presence"

export function PresenceTracker() {
  const clientIdRef = React.useRef("")

  React.useEffect(() => {
    clientIdRef.current = createBackendClientId()

    const markActive = () => {
      if (!clientIdRef.current) return

      updateCurrentPresence({
        clientId: clientIdRef.current,
        state: "active",
        source: "presence:heartbeat",
      }).catch(() => undefined)
    }
    const markInactive = () => {
      if (!clientIdRef.current) return

      sendCurrentPresenceBeacon({
        clientId: clientIdRef.current,
        state: "inactive",
        source: "presence:disconnect",
      })
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        markActive()
      }
    }

    markActive()

    const intervalId = window.setInterval(markActive, PRESENCE_HEARTBEAT_MS)

    window.addEventListener("focus", markActive)
    window.addEventListener("pagehide", markInactive)
    window.addEventListener("beforeunload", markInactive)
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener("focus", markActive)
      window.removeEventListener("pagehide", markInactive)
      window.removeEventListener("beforeunload", markInactive)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      markInactive()
    }
  }, [])

  return null
}
