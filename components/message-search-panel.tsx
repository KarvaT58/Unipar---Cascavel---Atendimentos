"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/unipar-ui/button";
import { Input } from "@/components/unipar-ui/input";
import { ScrollArea } from "@/components/unipar-ui/scroll-area";
import { CheckCheck, Search, X } from "lucide-react";
import type { Message } from "@/lib/chat-data";
import { cn } from "@/lib/utils";

interface MessageSearchPanelProps {
  messages: Message[];
  onClose: () => void;
  onSelectMessage: (messageId: string) => void;
}

function getMessageDayLabel(date: Date) {
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const startOfMessageDay = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
  const diffDays = Math.floor(
    (startOfToday.getTime() - startOfMessageDay.getTime()) /
      (1000 * 60 * 60 * 24),
  );

  if (diffDays === 0) return "Hoje";
  if (diffDays === 1) return "Ontem";

  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function HighlightedMessage({
  content,
  query,
}: {
  content: string;
  query: string;
}) {
  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    return <>{content}</>;
  }

  const matchIndex = content
    .toLowerCase()
    .indexOf(normalizedQuery.toLowerCase());

  if (matchIndex === -1) {
    return <>{content}</>;
  }

  const before = content.slice(0, matchIndex);
  const match = content.slice(matchIndex, matchIndex + normalizedQuery.length);
  const after = content.slice(matchIndex + normalizedQuery.length);

  return (
    <>
      {before}
      <mark className="bg-transparent p-0 text-primary">{match}</mark>
      {after}
    </>
  );
}

export function MessageSearchPanel({
  messages,
  onClose,
  onSelectMessage,
}: MessageSearchPanelProps) {
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return [];
    }

    return messages.filter((message) =>
      message.content.toLowerCase().includes(normalizedQuery),
    );
  }, [messages, query]);

  return (
    <div className="flex h-full w-full min-w-0 flex-col border-l bg-card">
      <div className="flex h-14 items-center gap-2 border-b px-3">
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-5 w-5" />
          <span className="sr-only">Fechar pesquisa</span>
        </Button>
        <h2 className="font-semibold text-foreground">Pesquisar mensagens</h2>
      </div>

      <div className="flex items-center gap-3 border-b px-4 py-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar mensagens"
            className="h-10 rounded-full border-primary bg-muted pl-10 pr-10 focus-visible:ring-primary/30"
          />
          {query && (
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => setQuery("")}
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Limpar busca</span>
            </button>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-2 p-3">
          {query.trim() && results.length === 0 && (
            <div className="flex min-h-32 items-center justify-center px-4 text-center text-sm text-muted-foreground">
              Nenhuma mensagem encontrada
            </div>
          )}

          {!query.trim() && (
            <div className="flex min-h-32 items-center justify-center px-4 text-center text-sm text-muted-foreground">
              Digite algo para pesquisar nesta conversa
            </div>
          )}

          {results.map((message, index) => (
            <button
              key={`${message.id}-${index}`}
              className="w-full rounded-lg bg-muted/50 px-4 py-3 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
              onClick={() => onSelectMessage(message.id)}
            >
              <div className="mb-2 text-xs text-muted-foreground">
                {getMessageDayLabel(message.timestamp)}
              </div>
              <div
                className={cn(
                  "flex items-start gap-1.5 text-sm text-foreground",
                  message.isOwn && "text-muted-foreground",
                )}
              >
                {message.isOwn && (
                  <CheckCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                )}
                <span className="line-clamp-2">
                  <HighlightedMessage content={message.content} query={query} />
                </span>
              </div>
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
