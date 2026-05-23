"use client"

import * as React from "react"
import { usePathname } from "next/navigation"

const EXIT_DURATION = 150

export function AuthFormTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [displayChildren, setDisplayChildren] = React.useState(children)
  const [sweepKey, setSweepKey] = React.useState(0)
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

    timers.current.push(
      window.setTimeout(() => {
        setDisplayChildren(nextChildren.current)
        setSweepKey((currentKey) => currentKey + 1)
      }, EXIT_DURATION)
    )
  }, [clearTimers, pathname])

  return (
    <div className="auth-transition-stage">
      <div className="auth-form-transition">
        {displayChildren}
        {sweepKey > 0 ? (
          <span
            key={sweepKey}
            aria-hidden="true"
            className="auth-form-sweep"
          />
        ) : null}
      </div>
    </div>
  )
}
