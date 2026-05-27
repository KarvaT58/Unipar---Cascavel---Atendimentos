"use client"

import * as React from "react"
import { ClockIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"

export function ComingSoonPage({ title }: { title: string }) {
  React.useEffect(() => {
    toast.info("Em breve", {
      description: `${title} será liberado futuramente.`,
    })
  }, [title])

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border bg-background">
      <div className="flex min-h-80 flex-1 items-center justify-center p-6 text-center">
        <div className="flex max-w-sm flex-col items-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ClockIcon className="size-6" />
          </span>
          <h1 className="mt-4 text-xl font-semibold">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Esta página será liberada futuramente.
          </p>
          <Button
            type="button"
            className="mt-5"
            onClick={() =>
              toast.info("Em breve", {
                description: `${title} ainda não está disponível.`,
              })
            }
          >
            Em breve
          </Button>
        </div>
      </div>
    </section>
  )
}
