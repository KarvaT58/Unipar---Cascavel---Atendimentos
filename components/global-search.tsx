"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  ArrowUpRightIcon,
  Loader2Icon,
  SearchIcon,
} from "lucide-react"

import { Badge } from "@/components/unipar-ui/badge"
import { Button } from "@/components/unipar-ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/unipar-ui/dialog"
import { Input } from "@/components/unipar-ui/input"

type GlobalSearchResult = {
  id: string
  title: string
  description: string
  href: string
  type: string
}

export function GlobalSearch() {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [results, setResults] = React.useState<GlobalSearchResult[]>([])
  const [isLoading, setIsLoading] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (!open) return

    const timeoutId = window.setTimeout(() => {
      inputRef.current?.focus()
    }, 80)

    return () => window.clearTimeout(timeoutId)
  }, [open])

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setOpen(true)
      }
    }

    window.addEventListener("keydown", handleKeyDown)

    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  React.useEffect(() => {
    if (!open) return

    const cleanQuery = query.trim()

    if (cleanQuery.length < 2) {
      setResults([])
      setIsLoading(false)
      return
    }

    const controller = new AbortController()
    const timeoutId = window.setTimeout(async () => {
      setIsLoading(true)

      try {
        const response = await fetch(
          `/api/search?q=${encodeURIComponent(cleanQuery)}`,
          {
            cache: "no-store",
            signal: controller.signal,
          }
        )

        if (!response.ok) {
          setResults([])
          return
        }

        const payload = (await response.json()) as {
          results?: GlobalSearchResult[]
        }

        setResults(payload.results ?? [])
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setResults([])
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      }
    }, 250)

    return () => {
      controller.abort()
      window.clearTimeout(timeoutId)
    }
  }, [open, query])

  const openResult = (result: GlobalSearchResult) => {
    setOpen(false)
    setQuery("")
    setResults([])
    router.push(result.href)
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 w-8 justify-center gap-2 border-border/70 bg-background/60 px-0 sm:w-44 sm:justify-start sm:px-3"
        onClick={() => setOpen(true)}
        aria-label="Buscar no sistema"
      >
        <SearchIcon className="h-4 w-4 text-muted-foreground" />
        <span className="hidden min-w-0 truncate text-muted-foreground sm:inline">
          Buscar
        </span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[min(680px,calc(100svh-2rem))] gap-3 overflow-hidden sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Busca global</DialogTitle>
          </DialogHeader>

          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar chamados, pessoas, grupos..."
              className="h-11 bg-muted pl-9 pr-9"
            />
            {isLoading ? (
              <Loader2Icon className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            ) : null}
          </div>

          <div className="min-h-48 overflow-y-auto rounded-lg border bg-background/60">
            {results.length > 0 ? (
              <div className="divide-y">
                {results.map((result) => (
                  <button
                    key={result.id}
                    type="button"
                    className="flex w-full items-start gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/70 focus-visible:bg-muted/70 focus-visible:outline-none"
                    onClick={() => openResult(result)}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <p className="truncate text-sm font-semibold">
                          {result.title}
                        </p>
                        <Badge variant="outline" className="shrink-0 text-[11px]">
                          {result.type}
                        </Badge>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {result.description}
                      </p>
                    </div>
                    <ArrowUpRightIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex h-48 items-center justify-center px-4 text-center text-sm text-muted-foreground">
                {query.trim().length >= 2 && !isLoading
                  ? "Nenhum resultado encontrado."
                  : "Nenhum resultado."}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
