import { cookies } from "next/headers"
import type { NextRequest, NextResponse } from "next/server"

import {
  destroyOfflineSession,
  getOfflineSessionUser,
} from "@/lib/offline-auth-store"
import {
  canUseOfflineFallback,
  isLocalDataOnlyEnabled,
} from "@/lib/local-mode"
import { prisma } from "@/lib/prisma"
import { createRandomToken, hashToken } from "@/lib/security"

export const SESSION_COOKIE = "auth_token"
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7

export function getSessionCookieOptions(expiresAt?: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
    expires: expiresAt,
  }
}

export async function createSession(
  userId: string,
  request?: NextRequest | Request
) {
  const token = createRandomToken()
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000)
  const headers = request?.headers

  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      userAgent: headers?.get("user-agent"),
      ipAddress:
        headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        headers?.get("x-real-ip"),
    },
  })

  return { token, expiresAt }
}

export async function getSessionUser() {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value

  if (!token) {
    return null
  }

  if (isLocalDataOnlyEnabled()) {
    return getOfflineSessionUser(token)
  }

  try {
    const tokenHash = hashToken(token)
    const session = await prisma.session.findUnique({
      where: { tokenHash },
      include: { user: true },
    })

    if (!session || session.expiresAt <= new Date()) {
      if (session) {
        await prisma.session.delete({ where: { id: session.id } })
      }

      return null
    }

    if (session.user.status !== "ACTIVE") {
      return null
    }

    return session.user
  } catch {
    return canUseOfflineFallback() ? getOfflineSessionUser(token) : null
  }
}

export async function destroySession(token?: string) {
  if (!token) {
    return
  }

  if (isLocalDataOnlyEnabled()) {
    await destroyOfflineSession(token)
    return
  }

  await prisma.session
    .delete({ where: { tokenHash: hashToken(token) } })
    .catch(() => undefined)
  await destroyOfflineSession(token)
}

export function setSessionCookie(
  response: NextResponse,
  token: string,
  expiresAt: Date
) {
  response.cookies.set(SESSION_COOKIE, token, getSessionCookieOptions(expiresAt))
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  })
}
