"use client"

import * as React from "react"
import { usePathname } from "next/navigation"

const FLIP_OUT_DURATION = 220
const FLIP_IN_DURATION = 340

type FlipPhase = "idle" | "exit" | "enter"

export function AuthFormTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [displayChildren, setDisplayChildren] = React.useState(children)
  const [flipPhase, setFlipPhase] = React.useState<FlipPhase>("idle")
  const previousPathname = React.useRef(pathname)
  const lastAnimatedPathname = React.useRef(pathname)
  const nextChildren = React.useRef(children)
  const timers = React.useRef<number[]>([])

  const clearTimers = React.useCallback(() => {
    timers.current.forEach(window.clearTimeout)
    timers.current = []
  }, [])

  React.useEffect(() => {
    nextChildren.current = children

    if (previousPathname.current === pathname) {
      setDisplayChildren(children)
    }
  }, [children, pathname])

  React.useEffect(() => {
    return () => clearTimers()
  }, [clearTimers])

  React.useEffect(() => {
    if (previousPathname.current === pathname) {
      return
    }

    previousPathname.current = pathname
    if (lastAnimatedPathname.current === pathname) {
      return
    }

    lastAnimatedPathname.current = pathname
    clearTimers()
    setFlipPhase("exit")

    timers.current.push(
      window.setTimeout(() => {
        setDisplayChildren(nextChildren.current)
        setFlipPhase("enter")
      }, FLIP_OUT_DURATION)
    )
    timers.current.push(
      window.setTimeout(() => {
        setFlipPhase("idle")
      }, FLIP_OUT_DURATION + FLIP_IN_DURATION)
    )
  }, [clearTimers, pathname])

  return (
    <div className="auth-transition-stage">
      <div className={`auth-form-card auth-form-card-${flipPhase}`}>
        {displayChildren}
      </div>
    </div>
  )
}
