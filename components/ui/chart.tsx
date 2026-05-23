"use client"

import * as React from "react"
import * as RechartsPrimitive from "recharts"

import { cn } from "@/lib/utils"

export type ChartConfig = {
  [key: string]: {
    label?: React.ReactNode
    color?: string
  }
}

type ChartContextProps = {
  config: ChartConfig
}

const ChartContext = React.createContext<ChartContextProps | null>(null)

function useChart() {
  const context = React.useContext(ChartContext)

  if (!context) {
    throw new Error("useChart must be used within a <ChartContainer />")
  }

  return context
}

function ChartContainer({
  id,
  className,
  children,
  config,
  ...props
}: React.ComponentProps<"div"> & {
  config: ChartConfig
  children: React.ComponentProps<
    typeof RechartsPrimitive.ResponsiveContainer
  >["children"]
}) {
  const uniqueId = React.useId()
  const chartId = `chart-${id ?? uniqueId.replace(/:/g, "")}`
  const containerRef = React.useRef<HTMLDivElement>(null)
  const [containerSize, setContainerSize] = React.useState({
    width: 0,
    height: 0,
  })

  React.useLayoutEffect(() => {
    const element = containerRef.current

    if (!element) {
      return
    }

    const updateContainerSize = () => {
      const width = Math.max(0, Math.floor(element.clientWidth))
      const height = Math.max(0, Math.floor(element.clientHeight))

      setContainerSize((currentSize) => {
        if (currentSize.width === width && currentSize.height === height) {
          return currentSize
        }

        return { width, height }
      })
    }

    updateContainerSize()

    const observer = new ResizeObserver(updateContainerSize)
    observer.observe(element)

    return () => observer.disconnect()
  }, [])

  const canRenderChart = containerSize.width > 0 && containerSize.height > 0

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        ref={containerRef}
        data-slot="chart"
        data-chart={chartId}
        className={cn(
          "flex min-h-[1px] min-w-0 aspect-video justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line]:stroke-border/60 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-none [&_.recharts-polar-grid_[stroke='#ccc']]:stroke-border [&_.recharts-radial-bar-background-sector]:fill-muted [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted [&_.recharts-reference-line_[stroke='#ccc']]:stroke-border [&_.recharts-sector[stroke='#fff']]:stroke-transparent [&_.recharts-sector]:outline-none [&_.recharts-surface]:outline-none",
          className
        )}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        {canRenderChart ? (
          <RechartsPrimitive.ResponsiveContainer
            width={containerSize.width}
            height={containerSize.height}
            debounce={50}
          >
            {children}
          </RechartsPrimitive.ResponsiveContainer>
        ) : null}
      </div>
    </ChartContext.Provider>
  )
}

function ChartStyle({ id, config }: { id: string; config: ChartConfig }) {
  const colorConfig = Object.entries(config).filter(([, itemConfig]) =>
    Boolean(itemConfig.color)
  )

  if (!colorConfig.length) {
    return null
  }

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `
[data-chart=${id}] {
${colorConfig
  .map(([key, itemConfig]) => `  --color-${key}: ${itemConfig.color};`)
  .join("\n")}
}
`,
      }}
    />
  )
}

const ChartTooltip = RechartsPrimitive.Tooltip
const ChartLegend = RechartsPrimitive.Legend

type ChartPayloadItem = {
  color?: string
  dataKey?: string | number
  name?: string | number
  value?: React.ReactNode
}

function ChartTooltipContent({
  active,
  payload,
  className,
  indicator = "dot",
  label,
  labelFormatter,
}: {
  active?: boolean
  payload?: ChartPayloadItem[]
  className?: string
  indicator?: "dot" | "line"
  label?: string | number
  labelFormatter?: (value: string | number) => React.ReactNode
}) {
  const { config } = useChart()

  if (!active || !payload?.length) {
    return null
  }

  return (
    <div
      className={cn(
        "grid min-w-36 gap-2 rounded-md border bg-popover px-2.5 py-2 text-xs text-popover-foreground shadow-md",
        className
      )}
    >
      {label ? (
        <div className="font-medium">
          {labelFormatter ? labelFormatter(label) : label}
        </div>
      ) : null}
      <div className="grid gap-1.5">
        {payload.map((item) => {
          const key = String(item.dataKey ?? item.name ?? "")
          const itemConfig = config[key]

          return (
            <div
              key={key}
              className="flex min-w-0 items-center justify-between gap-4"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className={cn(
                    "shrink-0 rounded-full",
                    indicator === "line" ? "h-2.5 w-1" : "size-2"
                  )}
                  style={{
                    backgroundColor:
                      itemConfig?.color ?? item.color ?? "var(--primary)",
                  }}
                />
                <span className="truncate text-muted-foreground">
                  {itemConfig?.label ?? item.name ?? key}
                </span>
              </div>
              <span className="font-mono font-medium tabular-nums">
                {item.value}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ChartLegendContent({
  payload,
  className,
}: {
  payload?: ChartPayloadItem[]
  className?: string
}) {
  const { config } = useChart()

  if (!payload?.length) {
    return null
  }

  return (
    <div className={cn("flex flex-wrap justify-center gap-4", className)}>
      {payload.map((item) => {
        const key = String(item.dataKey ?? item.name ?? "")
        const itemConfig = config[key]

        return (
          <div key={key} className="flex items-center gap-2 text-xs">
            <span
              className="size-2 rounded-full"
              style={{
                backgroundColor:
                  itemConfig?.color ?? item.color ?? "var(--primary)",
              }}
            />
            <span className="text-muted-foreground">
              {itemConfig?.label ?? item.name ?? key}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
}
