import { PrismaPg } from "@prisma/adapter-pg"

import { PrismaClient } from "@/lib/generated/prisma/client"

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient
}

export class DatabaseUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "DatabaseUnavailableError"
  }
}

export function isDatabaseUnavailableError(error: unknown) {
  return error instanceof DatabaseUnavailableError
}

export function isDatabaseConnectionError(error: unknown) {
  if (isDatabaseUnavailableError(error)) {
    return true
  }

  let currentError: unknown = error

  while (currentError && typeof currentError === "object") {
    const errorRecord = currentError as Record<string, unknown>
    const code = String(errorRecord.code ?? errorRecord.originalCode ?? "")
    const message = String(
      errorRecord.message ?? errorRecord.originalMessage ?? ""
    ).toLowerCase()

    if (
      code === "58030" ||
      code === "57P01" ||
      code === "57P02" ||
      code === "57P03" ||
      code === "08000" ||
      code === "08003" ||
      code === "08006" ||
      code === "53300" ||
      code === "53400" ||
      code.startsWith("P10") ||
      message.includes("could not open file") ||
      message.includes("input/output error") ||
      message.includes("connection refused") ||
      message.includes("server closed the connection")
    ) {
      return true
    }

    currentError = errorRecord.cause
  }

  return false
}

function createUnavailablePrismaClient(message: string) {
  const error = new DatabaseUnavailableError(message)
  const unavailableClient: unknown = new Proxy(function unavailablePrismaCall() {}, {
    get(_target, property) {
      if (property === "then") {
        return undefined
      }

      return unavailableClient
    },
    apply() {
      return Promise.reject(error)
    },
  })

  return unavailableClient as PrismaClient
}

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL?.trim()

  if (!connectionString) {
    return createUnavailablePrismaClient("DATABASE_URL não foi configurada.")
  }

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma
}
