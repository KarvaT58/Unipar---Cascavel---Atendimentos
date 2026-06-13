"use client"

import * as React from "react"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"

export function PageTransition({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const pathname = usePathname()
  const containerRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const container = containerRef.current

    if (!container) return

    container.classList.remove("page-route-enter")
    void container.offsetWidth
    container.classList.add("page-route-enter")
  }, [pathname])

  return (
    <div
      ref={containerRef}
      className={cn(
        "page-route-enter flex min-h-0 flex-1 flex-col overflow-hidden",
        className
      )}
    >
      {children}
    </div>
  )
}
