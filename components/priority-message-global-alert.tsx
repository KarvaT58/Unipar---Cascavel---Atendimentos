"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { BellRing, MessageCircle, Users } from "lucide-react";

import { Button } from "@/components/unipar-ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/unipar-ui/dialog";
import {
  createBackendClientId,
  fetchBackendState,
  isTransientBackendFetchError,
  saveBackendState,
} from "@/lib/backend-client";
import type { AppState } from "@/lib/app-state";
import {
  findPendingPriorityMessageAlert,
  getPriorityMessageAlertKey,
  getPriorityMessageAlertStorageKey,
  getPriorityMessagePreview,
  PRIORITY_MESSAGE_OPEN_REQUEST_STORAGE_KEY,
  type PendingPriorityMessageAlert,
  type PriorityMessageOpenRequest,
} from "@/lib/priority-message-alerts";

const PRIORITY_MESSAGE_UNLOCK_SECONDS = 5;
const ALERT_PREVIEW_MAX_LENGTH = 30;
const PRIORITY_ALERT_FALLBACK_REFRESH_MS = 60000;
const priorityAlertWorkspacePaths = new Set([
  "/administracao",
  "/ajuda",
  "/anuncios-eventos",
  "/atendimentos",
  "/chat-interno",
  "/emprestimos",
  "/grupos",
  "/kanban",
  "/ramais",
]);

function normalizePathname(pathname: string | null) {
  const normalizedPathname = pathname?.replace(/\/+$/, "") || "/";

  return normalizedPathname || "/";
}

function getAlertPreviewText(text: string) {
  const normalizedText = text.trim();

  if (normalizedText.length <= ALERT_PREVIEW_MAX_LENGTH) {
    return normalizedText;
  }

  return `${normalizedText.slice(0, ALERT_PREVIEW_MAX_LENGTH).trimEnd()}...`;
}

function getAlertRoute(alert: PendingPriorityMessageAlert) {
  return alert.scope === "group" ? "/grupos" : "/chat-interno";
}

function getRealtimePayloadKey(event: Event) {
  try {
    const realtimeEvent = JSON.parse((event as MessageEvent).data) as {
      payload?: { key?: unknown };
    };
    const key = realtimeEvent.payload?.key;

    return typeof key === "string" ? key : undefined;
  } catch {
    return undefined;
  }
}

export function PriorityMessageGlobalAlert({
  userId,
}: {
  userId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const normalizedPathname = normalizePathname(pathname);
  const isWorkspacePath = priorityAlertWorkspacePaths.has(normalizedPathname);
  const [appState, setAppState] = React.useState<AppState | null>(null);
  const [activeAlert, setActiveAlert] =
    React.useState<PendingPriorityMessageAlert | null>(null);
  const [countdown, setCountdown] = React.useState(0);
  const [isSaving, setIsSaving] = React.useState(false);
  const clientIdRef = React.useRef("");
  const refreshInFlightRef = React.useRef(false);

  const refreshState = React.useCallback(() => {
    if (!userId || isWorkspacePath || refreshInFlightRef.current) return;

    refreshInFlightRef.current = true;

    fetchBackendState()
      .then((envelope) => {
        setAppState(envelope.state);
      })
      .catch((error) => {
        if (!isTransientBackendFetchError(error)) {
          console.error(error);
        }
      })
      .finally(() => {
        refreshInFlightRef.current = false;
      });
  }, [isWorkspacePath, userId]);

  React.useEffect(() => {
    if (!userId || isWorkspacePath) {
      setActiveAlert(null);
      return;
    }

    clientIdRef.current = createBackendClientId();
    refreshState();

    const refreshInterval = window.setInterval(
      refreshState,
      PRIORITY_ALERT_FALLBACK_REFRESH_MS,
    );
    const eventSource = new EventSource("/api/realtime?lastEventId=latest");

    eventSource.addEventListener("state", (event) => {
      if (getRealtimePayloadKey(event) === "typing") return;

      refreshState();
    });

    return () => {
      window.clearInterval(refreshInterval);
      eventSource.close();
    };
  }, [isWorkspacePath, refreshState, userId]);

  React.useEffect(() => {
    if (!appState || !userId || activeAlert || isWorkspacePath) return;

    const nextAlert = findPendingPriorityMessageAlert(appState, userId);

    if (!nextAlert) return;

    setActiveAlert(nextAlert);
    setCountdown(PRIORITY_MESSAGE_UNLOCK_SECONDS);
  }, [activeAlert, appState, isWorkspacePath, userId]);

  React.useEffect(() => {
    if (!activeAlert || countdown <= 0) return;

    const timeoutId = window.setTimeout(() => {
      setCountdown((currentCountdown) => Math.max(0, currentCountdown - 1));
    }, 1000);

    return () => window.clearTimeout(timeoutId);
  }, [activeAlert, countdown]);

  const markActiveAlertAsSeen = React.useCallback(async () => {
    if (!activeAlert || !appState || !userId) return appState;

    const alertKey = getPriorityMessageAlertKey(
      activeAlert.scope,
      activeAlert.conversationId,
      activeAlert.message,
    );
    const currentSeenKeys =
      appState.priorityMessageAlertSeenKeysByUserId[userId] ?? [];

    if (currentSeenKeys.includes(alertKey)) return appState;

    const nextSeenKeys = [...currentSeenKeys, alertKey].slice(-500);
    const nextState: AppState = {
      ...appState,
      priorityMessageAlertSeenKeysByUserId: {
        ...appState.priorityMessageAlertSeenKeysByUserId,
        [userId]: nextSeenKeys,
      },
    };

    setAppState(nextState);

    try {
      window.localStorage.setItem(
        getPriorityMessageAlertStorageKey(userId),
        JSON.stringify(nextSeenKeys),
      );
    } catch {
      // Se o storage estiver bloqueado, o backend continua sendo a fonte real.
    }

    await saveBackendState(
      nextState,
      clientIdRef.current || createBackendClientId(),
      "priority-message-alert",
    );

    return nextState;
  }, [activeAlert, appState, userId]);

  const showNextAlertFromState = React.useCallback(
    (state: AppState | null) => {
      if (!state || !userId) {
        setActiveAlert(null);
        setCountdown(0);
        return;
      }

      const nextAlert = findPendingPriorityMessageAlert(state, userId);

      setActiveAlert(nextAlert);
      setCountdown(nextAlert ? PRIORITY_MESSAGE_UNLOCK_SECONDS : 0);
    },
    [userId],
  );

  const handleDismiss = async () => {
    if (!activeAlert || isSaving) return;

    setIsSaving(true);

    try {
      const nextState = await markActiveAlertAsSeen();
      showNextAlertFromState(nextState);
    } catch (error) {
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpen = async () => {
    if (!activeAlert || isSaving || !userId) return;

    setIsSaving(true);

    try {
      const openRequest: PriorityMessageOpenRequest = {
        scope: activeAlert.scope,
        conversationId: activeAlert.conversationId,
        messageId: activeAlert.message.id,
        userId,
        createdAt: Date.now(),
      };

      window.sessionStorage.setItem(
        PRIORITY_MESSAGE_OPEN_REQUEST_STORAGE_KEY,
        JSON.stringify(openRequest),
      );

      await markActiveAlertAsSeen();
      setActiveAlert(null);
      setCountdown(0);
      router.push(getAlertRoute(activeAlert));
    } catch (error) {
      console.error(error);
      router.push(getAlertRoute(activeAlert));
    } finally {
      setIsSaving(false);
    }
  };

  if (!userId || isWorkspacePath) return null;

  return (
    <Dialog open={Boolean(activeAlert)}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-md"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        {activeAlert && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 pr-2">
                <BellRing className="h-5 w-5 text-primary" />
                Aviso de mensagem prioritária
              </DialogTitle>
              <DialogDescription className="sr-only">
                Aviso de mensagem prioritária recebida em conversa ou grupo.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4">
              <div className="rounded-lg border bg-muted/45 p-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    {activeAlert.scope === "group" ? (
                      <Users className="h-5 w-5" />
                    ) : (
                      <MessageCircle className="h-5 w-5" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm text-muted-foreground">
                      Você recebeu uma mensagem prioritária
                    </p>
                    <h2 className="mt-1 break-words text-lg font-semibold leading-6">
                      {getAlertPreviewText(
                        getPriorityMessagePreview(activeAlert.message),
                      )}
                    </h2>
                    <p className="mt-2 text-sm font-medium">
                      {activeAlert.conversationName} • {activeAlert.senderName}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {activeAlert.message.timestamp.toLocaleString("pt-BR", {
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                        month: "long",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                </div>
              </div>

              <p className="text-sm leading-6 text-muted-foreground">
                Esta mensagem foi marcada como prioritária e ficou pendente
                enquanto você não estava com essa área aberta. Abra a conversa
                para ler tudo e responder quando necessário.
              </p>

              {countdown > 0 && (
                <div className="rounded-md bg-primary/10 px-3 py-2 text-sm font-medium text-primary">
                  Aguarde {countdown}s para liberar as ações.
                </div>
              )}
            </div>

            <div className="-mx-4 -mb-4 flex justify-end gap-2 border-t bg-muted/50 p-4">
              <Button
                variant="ghost"
                disabled={countdown > 0 || isSaving}
                onClick={handleDismiss}
              >
                Fechar mensagem
              </Button>
              <Button
                disabled={countdown > 0 || isSaving}
                onClick={handleOpen}
              >
                Abrir mensagem
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
