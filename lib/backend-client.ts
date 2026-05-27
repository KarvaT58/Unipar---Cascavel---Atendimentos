"use client";

import {
  normalizeAppState,
  serializeAppState,
  type AppState,
  type AppStateEnvelope,
  type TypingIndicatorState,
} from "@/lib/app-state";
import type { Sector, UserChatStatus, UserWorkStatus } from "@/lib/admin-data";

export interface UserProfilePayload {
  id: string;
  name: string;
  email: string;
  sector: Sector;
  isAdmin: boolean;
  avatar?: string;
  about?: string;
  chatStatus?: UserChatStatus;
  workStatus?: UserWorkStatus;
  lastSeenAt?: Date;
  clientId?: string;
}

export type BackendAuthenticatedUser = Omit<UserProfilePayload, "clientId">;
export type PresenceConnectionState = "active" | "inactive";
export interface PresenceUpdatePayload {
  clientId: string;
  state?: PresenceConnectionState;
  chatStatus?: UserChatStatus;
  workStatus?: UserWorkStatus;
  source?: string;
}
export interface TypingIndicatorPayload {
  clientId: string;
  scope: TypingIndicatorState["scope"];
  targetId: string;
  isTyping: boolean;
}

const BOOTSTRAP_RETRY_DELAYS_MS = [250, 1000];

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function parseOptionalDate(value: unknown) {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : undefined;
  }

  if (typeof value !== "string" && typeof value !== "number") {
    return undefined;
  }

  const date = new Date(value);

  return Number.isFinite(date.getTime()) ? date : undefined;
}

function normalizeAuthenticatedUser(
  user: BackendAuthenticatedUser | null | undefined,
) {
  if (!user) return null;

  return {
    ...user,
    lastSeenAt: parseOptionalDate(user.lastSeenAt),
  };
}

export function isTransientBackendFetchError(error: unknown) {
  return error instanceof TypeError && error.message.toLowerCase().includes("fetch");
}

export function createBackendClientId() {
  if (typeof window === "undefined") return "server-client";

  const storedClientId = window.sessionStorage.getItem("unipar-client-id");
  if (storedClientId) return storedClientId;

  const nextClientId =
    typeof window.crypto?.randomUUID === "function"
      ? window.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  window.sessionStorage.setItem("unipar-client-id", nextClientId);

  return nextClientId;
}

export async function fetchBackendState(): Promise<AppStateEnvelope> {
  let response: Response | null = null;

  for (let attempt = 0; attempt <= BOOTSTRAP_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      response = await fetch("/api/bootstrap", {
        cache: "no-store",
      });
      break;
    } catch (error) {
      const retryDelay = BOOTSTRAP_RETRY_DELAYS_MS[attempt];

      if (!isTransientBackendFetchError(error) || retryDelay === undefined) {
        throw error;
      }

      await delay(retryDelay);
    }
  }

  if (!response) {
    throw new Error("Não foi possível carregar os dados do backend.");
  }

  if (!response.ok) {
    throw new Error("Não foi possível carregar os dados do backend.");
  }

  const envelope = (await response.json()) as AppStateEnvelope;

  return {
    ...envelope,
    state: normalizeAppState(envelope.state),
  };
}

export async function saveBackendState(
  state: AppState,
  clientId: string,
  source = "state",
) {
  const response = await fetch("/api/state", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      clientId,
      source,
      state: JSON.parse(serializeAppState(state)),
    }),
  });

  if (!response.ok) {
    throw new Error("Não foi possível salvar os dados no backend.");
  }

  const envelope = (await response.json()) as AppStateEnvelope;

  return {
    ...envelope,
    state: normalizeAppState(envelope.state),
  };
}

export async function saveUserProfile(profile: UserProfilePayload) {
  const response = await fetch("/api/users/profile", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(profile),
  });

  if (!response.ok) {
    throw new Error("Não foi possível salvar o perfil no backend.");
  }

  return response.json() as Promise<{
    ok: boolean;
    databaseConnected: boolean;
  }>;
}

export async function updateCurrentPresence(payload: PresenceUpdatePayload) {
  const response = await fetch("/api/presence", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Não foi possível atualizar sua presença.");
  }

  return response.json() as Promise<{ ok: boolean }>;
}

export async function publishTypingIndicator(payload: TypingIndicatorPayload) {
  const response = await fetch("/api/typing", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Não foi possível atualizar o indicador de digitação.");
  }

  return response.json() as Promise<{ ok: boolean }>;
}

export function sendCurrentPresenceBeacon(payload: PresenceUpdatePayload) {
  if (typeof navigator === "undefined") return false;

  const body = JSON.stringify(payload);

  if (typeof navigator.sendBeacon === "function") {
    return navigator.sendBeacon(
      "/api/presence",
      new Blob([body], { type: "application/json" }),
    );
  }

  fetch("/api/presence", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body,
    keepalive: true,
  }).catch(() => undefined);

  return true;
}

export async function fetchCurrentSession() {
  const response = await fetch("/api/auth/session", {
    cache: "no-store",
  });

  if (!response.ok) return null;

  const result = (await response.json()) as {
    user?: BackendAuthenticatedUser | null;
  };

  return normalizeAuthenticatedUser(result.user);
}

export async function clearCurrentSession(clientId?: string) {
  await fetch("/api/auth/session", {
    method: "DELETE",
    headers: clientId
      ? {
          "Content-Type": "application/json",
        }
      : undefined,
    body: clientId ? JSON.stringify({ clientId }) : undefined,
  });
}
