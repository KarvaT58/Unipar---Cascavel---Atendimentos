"use client";

import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/unipar-ui/avatar";
import { Button } from "@/components/unipar-ui/button";
import { Checkbox } from "@/components/unipar-ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/unipar-ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/unipar-ui/dropdown-menu";
import { Input } from "@/components/unipar-ui/input";
import { Label } from "@/components/unipar-ui/label";
import { ScrollArea } from "@/components/unipar-ui/scroll-area";
import { Separator } from "@/components/unipar-ui/separator";
import { Textarea } from "@/components/unipar-ui/textarea";
import {
  ArrowLeft,
  X,
  Search,
  Mail,
  Bell,
  BellOff,
  Star,
  Trash2,
  Image as ImageIcon,
  FileText,
  Link as LinkIcon,
  Pin,
  Eraser,
  Copy,
  Flag,
  Download,
  Play,
  Video,
  ChevronRight,
  ExternalLink,
  Camera,
  Edit,
  MoreHorizontal,
  ShieldCheck,
  ShieldMinus,
  UserMinus,
  UserPlus,
  LogOut,
} from "lucide-react";
import {
  getChatPresenceMeta,
  getChatPresenceStatus,
  type Contact,
  type DirectoryUser,
  type Message,
} from "@/lib/chat-data";
import { cn } from "@/lib/utils";
import {
  getUploadSizeLimitMessage,
  splitFilesByUploadSize,
} from "@/lib/upload-limits";
import { toast } from "sonner";

type MediaTab = "media" | "documents" | "links";

interface ContactDetailsProps {
  contact: Contact;
  currentUser: DirectoryUser;
  messages: Message[];
  isGroup?: boolean;
  groupParticipants?: DirectoryUser[];
  groupAdminIds?: string[];
  availableParticipants?: DirectoryUser[];
  canEditGroup?: boolean;
  onClose: () => void;
  onUpdateGroup?: (
    updates: Partial<Pick<Contact, "name" | "avatar" | "about">>,
  ) => void;
  onAddGroupParticipants?: (participantIds: string[]) => void;
  onRemoveGroupParticipant?: (participantId: string) => void;
  onToggleGroupParticipantAdmin?: (participantId: string) => void;
  onMute: () => void;
  onPin: () => void;
  onReport: () => void;
  onClear: () => void;
  onLeaveGroup?: () => void;
  onDelete: () => void;
}

const mediaTabs: { id: MediaTab; label: string }[] = [
  { id: "media", label: "Mídia" },
  { id: "documents", label: "Documentos" },
  { id: "links", label: "Links" },
];

type MediaGroup = {
  label: string;
  items: Array<{
    id: string;
    src?: string;
    href?: string;
    duration?: string;
    title: string;
  }>;
};

type DocumentItem = {
  id: string;
  title: string;
  meta: string;
  caption: string;
  date: string;
  extension: string;
  src?: string;
};

type LinkItem = {
  id: string;
  direction: string;
  date: string;
  title: string;
  description: string;
  url: string;
  action: string | null;
  avatar: string;
  kind: string;
};

const URL_PATTERN = /(https?:\/\/[^\s<>"')]+|www\.[^\s<>"')]+)/gi;

function isVisibleMessage(message: Message) {
  return !message.deletedForMe && !message.deletedForEveryone;
}

function formatPanelDate(date: Date) {
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatPanelTime(date: Date) {
  return date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMediaGroupLabel(date: Date) {
  const today = new Date();
  const startOfToday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const startOfMessageDate = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
  const diffDays = Math.floor(
    (startOfToday.getTime() - startOfMessageDate.getTime()) /
      (24 * 60 * 60 * 1000),
  );

  if (diffDays === 0) return "Hoje";
  if (diffDays === 1) return "Ontem";

  return formatPanelDate(date);
}

function normalizeUrl(url: string) {
  const cleanedUrl = url.replace(/[.,;:!?]+$/, "");

  return cleanedUrl.startsWith("www.") ? `https://${cleanedUrl}` : cleanedUrl;
}

function extractUrls(content: string) {
  return Array.from(content.matchAll(URL_PATTERN), (match) =>
    normalizeUrl(match[0]),
  );
}

function getUrlTitle(url: string) {
  try {
    const parsedUrl = new URL(url);

    return parsedUrl.hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "").replace(/^www\./, "");
  }
}

function getSenderName(
  message: Message,
  contact: Contact,
  currentUser: DirectoryUser,
  groupParticipants: DirectoryUser[],
  isGroup: boolean,
) {
  if (message.isOwn || message.senderId === currentUser.id) return "Você";
  if (message.senderName) return message.senderName;
  if (isGroup && message.senderId) {
    return (
      groupParticipants.find(
        (participant) => participant.id === message.senderId,
      )?.name ?? "Participante"
    );
  }

  return contact.name;
}

function getSenderAvatar(
  message: Message,
  contact: Contact,
  currentUser: DirectoryUser,
  groupParticipants: DirectoryUser[],
) {
  if (message.isOwn || message.senderId === currentUser.id) {
    return currentUser.avatar;
  }

  if (message.senderId) {
    return (
      groupParticipants.find(
        (participant) => participant.id === message.senderId,
      )?.avatar ?? contact.avatar
    );
  }

  return contact.avatar;
}

function buildMediaGroups(messages: Message[]): MediaGroup[] {
  const groups = new Map<string, MediaGroup>();

  messages.filter(isVisibleMessage).forEach((message) => {
    const attachment = message.attachment;

    if (attachment?.type !== "image" && attachment?.type !== "video") return;

    const label = formatMediaGroupLabel(message.timestamp);
    const group = groups.get(label) ?? { label, items: [] };

    group.items.push({
      id: message.id,
      src:
        attachment.type === "image"
          ? attachment.src
          : attachment.thumbnail || attachment.src,
      href:
        attachment.type === "image"
          ? attachment.src
          : attachment.src || attachment.thumbnail,
      duration: attachment.type === "video" ? attachment.duration : undefined,
      title:
        attachment.type === "image"
          ? attachment.alt
          : attachment.title || "Vídeo",
    });
    groups.set(label, group);
  });

  return Array.from(groups.values());
}

function buildDocumentItems(messages: Message[]): DocumentItem[] {
  return messages.filter(isVisibleMessage).flatMap((message) => {
    const attachment = message.attachment;

    if (attachment?.type !== "document") return [];

    return [
      {
        id: message.id,
        title: attachment.name,
        meta: attachment.meta,
        caption: message.content.trim(),
        date: `${formatPanelDate(message.timestamp)} ${formatPanelTime(
          message.timestamp,
        )}`,
        extension: attachment.extension || "DOC",
        src: attachment.src,
      },
    ];
  });
}

function buildLinkItems(
  messages: Message[],
  contact: Contact,
  currentUser: DirectoryUser,
  groupParticipants: DirectoryUser[],
  isGroup: boolean,
): LinkItem[] {
  return messages.filter(isVisibleMessage).flatMap((message) => {
    const urls = extractUrls(message.content);
    const senderName = getSenderName(
      message,
      contact,
      currentUser,
      groupParticipants,
      isGroup,
    );
    const senderAvatar = getSenderAvatar(
      message,
      contact,
      currentUser,
      groupParticipants,
    );

    return urls.map((url, index) => ({
      id: `${message.id}-${index}`,
      direction: senderName,
      date: formatPanelDate(message.timestamp),
      title: getUrlTitle(url),
      description:
        message.content.replace(URL_PATTERN, "").trim() || "Link enviado",
      url,
      action: null,
      avatar: senderAvatar,
      kind: /youtube|youtu\.be|vimeo|tiktok/i.test(url) ? "video" : "link",
    }));
  });
}

function getMessageSearchText(message: Message) {
  const attachment = message.attachment;

  return [
    message.content,
    attachment?.type === "document" ? attachment.name : "",
    attachment?.type === "image" ? attachment.alt : "",
    attachment?.type === "video" ? attachment.title : "",
    extractUrls(message.content).join(" "),
  ]
    .join(" ")
    .toLowerCase();
}

function getFavoritePreview(message: Message) {
  if (message.content.trim()) return message.content.trim();

  switch (message.attachment?.type) {
    case "image":
      return "Foto";
    case "video":
      return "Vídeo";
    case "audio":
      return "Áudio";
    case "document":
      return message.attachment.name;
    default:
      return "Mensagem";
  }
}

function FavoriteMessagesPanel({
  contact,
  currentUser,
  groupParticipants,
  isGroup,
  messages,
  onBack,
}: {
  contact: Contact;
  currentUser: DirectoryUser;
  groupParticipants: DirectoryUser[];
  isGroup: boolean;
  messages: Message[];
  onBack: () => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const favoriteMessages = messages
    .filter((message) => isVisibleMessage(message) && message.isFavorite)
    .filter((message) =>
      normalizedSearchQuery
        ? getMessageSearchText(message).includes(normalizedSearchQuery)
        : true,
    );

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col border-l bg-background">
      <div className="flex h-14 shrink-0 items-center gap-2 px-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
          <span className="sr-only">Voltar</span>
        </Button>
        <h2 className="min-w-0 flex-1 truncate text-base font-semibold">
          Mensagens favoritas
        </h2>
        <div className="w-8" />
      </div>

      <div className="shrink-0 border-b px-5 pb-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Pesquisar"
            className="h-10 rounded-full bg-muted pl-11"
          />
        </div>
      </div>

      <div className="thin-gray-scrollbar min-h-0 flex-1 overflow-y-auto bg-card">
        {favoriteMessages.length === 0 ? (
          <p className="px-7 py-10 text-center text-sm font-medium text-muted-foreground">
            Nenhuma mensagem favorita encontrada.
          </p>
        ) : (
          <div className="space-y-3 p-4">
            {favoriteMessages.map((message) => {
              const senderName = getSenderName(
                message,
                contact,
                currentUser,
                groupParticipants,
                isGroup,
              );
              const senderAvatar = getSenderAvatar(
                message,
                contact,
                currentUser,
                groupParticipants,
              );
              const attachment = message.attachment;

              return (
                <article
                  key={message.id}
                  className="rounded-lg border bg-background p-3"
                >
                  <div className="mb-3 flex min-w-0 items-center gap-2">
                    <Avatar className="h-7 w-7">
                      <AvatarImage src={senderAvatar} alt={senderName} />
                      <AvatarFallback>
                        {senderName.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                      {senderName}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatPanelDate(message.timestamp)}
                    </span>
                  </div>

                  {attachment?.type === "image" && (
                    <div
                      className="mb-3 aspect-video rounded bg-cover bg-center"
                      style={{ backgroundImage: `url(${attachment.src})` }}
                    />
                  )}

                  {attachment?.type === "video" && (
                    <div
                      className="mb-3 flex aspect-video items-center justify-center rounded bg-cover bg-center"
                      style={{
                        backgroundImage: `url(${
                          attachment.thumbnail || attachment.src
                        })`,
                      }}
                    >
                      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-white">
                        <Play className="h-5 w-5 fill-white" />
                      </span>
                    </div>
                  )}

                  {attachment?.type === "document" && (
                    <div className="mb-3 flex items-center gap-3 rounded-md bg-muted p-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-destructive text-[10px] font-bold uppercase text-destructive-foreground">
                        {attachment.extension || "DOC"}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">
                          {attachment.name}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {attachment.meta}
                        </div>
                      </div>
                    </div>
                  )}

                  <p className="whitespace-pre-wrap break-words text-sm text-foreground">
                    {getFavoritePreview(message)}
                  </p>

                  {extractUrls(message.content).map((url) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 block break-all text-sm font-medium text-primary underline underline-offset-2"
                    >
                      {url}
                    </a>
                  ))}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ContactMediaPanel({
  contact,
  activeTab,
  documentItems,
  linkItems,
  mediaGroups,
  onTabChange,
  onBack,
}: {
  contact: Contact;
  activeTab: MediaTab;
  documentItems: DocumentItem[];
  linkItems: LinkItem[];
  mediaGroups: MediaGroup[];
  onTabChange: (tab: MediaTab) => void;
  onBack: () => void;
}) {
  const footerLabel =
    activeTab === "media"
      ? "Mostrar mídias de todas as conversas"
      : activeTab === "documents"
        ? "Mostrar documentos de todas as conversas"
        : "Mostrar links de todas as conversas";

  return (
    <div className="flex h-full w-full min-w-0 flex-col border-l bg-background">
      <div className="flex h-14 shrink-0 items-center px-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
          <span className="sr-only">Voltar</span>
        </Button>
      </div>

      <div className="grid h-14 shrink-0 grid-cols-3 border-b">
        {mediaTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={cn(
              "border-b-2 border-transparent text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
              activeTab === tab.id && "border-primary text-foreground",
            )}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <ScrollArea className="min-h-0 flex-1 thin-gray-scrollbar">
        <div className="min-w-0 overflow-x-hidden px-6 py-5">
          {activeTab === "media" && <MediaContent groups={mediaGroups} />}
          {activeTab === "documents" && (
            <DocumentsContent documents={documentItems} />
          )}
          {activeTab === "links" && (
            <LinksContent contact={contact} links={linkItems} />
          )}
        </div>
      </ScrollArea>

      <div className="shrink-0 border-t bg-background px-4 py-4">
        <button
          type="button"
          className="mx-auto flex items-center justify-center gap-2 text-sm font-medium text-primary transition-colors hover:text-primary/80"
        >
          <ImageIcon className="h-4 w-4" />
          {footerLabel}
        </button>
      </div>
    </div>
  );
}

function MediaTile({ item }: { item: MediaGroup["items"][number] }) {
  const content = (
    <>
      {"src" in item && item.src ? (
        <div
          aria-hidden="true"
          className="h-full w-full bg-cover bg-center"
          style={{ backgroundImage: `url(${item.src})` }}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-b from-muted to-background">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-background/80">
            <Download className="h-5 w-5 text-foreground" />
          </span>
        </div>
      )}

      {"duration" in item && item.duration && (
        <span className="absolute bottom-1 left-1 flex items-center gap-0.5 text-[11px] font-medium text-white drop-shadow">
          <Video className="h-3 w-3 fill-white" />
          {item.duration}
        </span>
      )}
    </>
  );

  if (item.href) {
    return (
      <a
        href={item.href}
        target="_blank"
        rel="noreferrer"
        title={item.title}
        className="relative aspect-square overflow-hidden rounded bg-muted"
      >
        {content}
      </a>
    );
  }

  return (
    <div
      title={item.title}
      className="relative aspect-square overflow-hidden rounded bg-muted"
    >
      {content}
    </div>
  );
}

function MediaContent({ groups }: { groups: MediaGroup[] }) {
  if (groups.length === 0) {
    return (
      <p className="px-2 py-10 text-center text-sm font-medium text-muted-foreground">
        Nenhuma mídia encontrada.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <section key={group.label}>
          <h3 className="mb-2 text-xs font-semibold uppercase text-foreground">
            {group.label}
          </h3>
          <div className="grid grid-cols-3 gap-1.5">
            {group.items.map((item) => (
              <MediaTile key={item.id} item={item} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function DocumentsContent({ documents }: { documents: DocumentItem[] }) {
  if (documents.length === 0) {
    return (
      <p className="px-2 py-10 text-center text-sm font-medium text-muted-foreground">
        Nenhum documento encontrado.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {documents.map((document) => (
        <article
          key={document.id}
          className="max-w-[22rem] rounded-lg bg-muted p-2"
        >
          <div className="flex items-center gap-3 rounded-md bg-background/55 p-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-destructive text-[10px] font-bold uppercase text-destructive-foreground">
              {document.extension}
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">
                {document.title}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {document.meta}
              </div>
            </div>
          </div>

          <div className="mt-2 text-sm font-semibold leading-snug">
            {document.caption || document.title}
          </div>
          {document.src && (
            <a
              href={document.src}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex text-sm font-semibold text-primary underline underline-offset-2"
            >
              Abrir documento
            </a>
          )}
          <div className="mt-1 text-right text-xs text-muted-foreground">
            {document.date}
          </div>
        </article>
      ))}
    </div>
  );
}

function LinksContent({
  contact,
  links,
}: {
  contact: Contact;
  links: LinkItem[];
}) {
  if (links.length === 0) {
    return (
      <p className="px-2 py-10 text-center text-sm font-medium text-muted-foreground">
        Nenhum link encontrado.
      </p>
    );
  }

  return (
    <div className="min-w-0 space-y-5 overflow-hidden">
      {links.map((link) => (
        <article
          key={link.id}
          className="min-w-0 overflow-hidden border-b pb-5 last:border-b-0"
        >
          <div className="mb-2 flex min-w-0 items-center gap-2 text-sm font-semibold">
            <Avatar className="h-6 w-6">
              <AvatarImage src={link.avatar} alt={contact.name} />
              <AvatarFallback>
                {contact.name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="min-w-0 flex-1 truncate">{link.direction}</span>
            <span className="shrink-0 text-xs font-medium text-muted-foreground">
              {link.date}
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </div>

          <div className="min-w-0 pl-8">
            <div
              className={cn(
                "min-w-0 overflow-hidden rounded-lg p-2",
                link.direction.startsWith("Você")
                  ? "bg-chat-outgoing"
                  : "bg-muted",
              )}
            >
              <div className="min-w-0 rounded-md bg-background/55 p-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
                    {link.kind === "video" ? (
                      <Play className="h-7 w-7 fill-foreground text-foreground" />
                    ) : link.kind === "group" ? (
                      <Avatar className="h-11 w-11">
                        <AvatarImage src={contact.avatar} alt={contact.name} />
                        <AvatarFallback>
                          {contact.name.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    ) : (
                      <ExternalLink className="h-6 w-6 text-muted-foreground" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1 overflow-hidden">
                    <div className="line-clamp-2 break-words text-sm font-semibold">
                      {link.title}
                    </div>
                    <p className="mt-1 line-clamp-2 break-words text-xs text-muted-foreground">
                      {link.description}
                    </p>
                  </div>
                </div>
              </div>

              <a
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className="mt-2 block max-w-full break-all text-sm font-medium text-primary underline underline-offset-2"
              >
                {link.url}
              </a>

              {link.action && (
                <button
                  type="button"
                  className="mt-3 w-full rounded-md py-2 text-sm font-semibold text-primary transition-colors hover:bg-background/35"
                >
                  {link.action}
                </button>
              )}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function GroupParticipantsSection({
  participants,
  adminIds,
  availableParticipants,
  canEdit,
  onAddParticipants,
  onRemoveParticipant,
  onToggleParticipantAdmin,
}: {
  participants: DirectoryUser[];
  adminIds: string[];
  availableParticipants: DirectoryUser[];
  canEdit: boolean;
  onAddParticipants?: (participantIds: string[]) => void;
  onRemoveParticipant?: (participantId: string) => void;
  onToggleParticipantAdmin?: (participantId: string) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [showAllParticipants, setShowAllParticipants] = useState(false);
  const [isAddParticipantsOpen, setIsAddParticipantsOpen] = useState(false);
  const [addSearchQuery, setAddSearchQuery] = useState("");
  const [selectedAddParticipantIds, setSelectedAddParticipantIds] = useState<
    string[]
  >([]);
  const [removeParticipant, setRemoveParticipant] =
    useState<DirectoryUser | null>(null);
  const participantIds = new Set(
    participants.map((participant) => participant.id),
  );
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const normalizedAddSearchQuery = addSearchQuery.trim().toLowerCase();
  const filteredParticipants = participants.filter((participant) => {
    if (!normalizedSearchQuery) return true;

    return (
      participant.name.toLowerCase().includes(normalizedSearchQuery) ||
      participant.email.toLowerCase().includes(normalizedSearchQuery)
    );
  });
  const visibleParticipants = showAllParticipants
    ? filteredParticipants
    : filteredParticipants.slice(0, 5);
  const addParticipantOptions = availableParticipants.filter((participant) => {
    if (participantIds.has(participant.id)) return false;
    if (!normalizedAddSearchQuery) return true;

    return (
      participant.name.toLowerCase().includes(normalizedAddSearchQuery) ||
      participant.email.toLowerCase().includes(normalizedAddSearchQuery)
    );
  });

  const handleAddParticipantsOpenChange = (open: boolean) => {
    setIsAddParticipantsOpen(open);

    if (!open) {
      setAddSearchQuery("");
      setSelectedAddParticipantIds([]);
    }
  };

  const toggleAddParticipant = (participantId: string) => {
    setSelectedAddParticipantIds((currentIds) =>
      currentIds.includes(participantId)
        ? currentIds.filter((currentId) => currentId !== participantId)
        : [...currentIds, participantId],
    );
  };

  const handleConfirmAddParticipants = () => {
    if (selectedAddParticipantIds.length === 0) return;

    onAddParticipants?.(selectedAddParticipantIds);
    handleAddParticipantsOpenChange(false);
  };

  const handleConfirmRemoveParticipant = () => {
    if (!removeParticipant) return;

    onRemoveParticipant?.(removeParticipant.id);
    setRemoveParticipant(null);
  };

  const handleOpenAddParticipants = () => {
    setAddSearchQuery("");
    setSelectedAddParticipantIds([]);
    setIsAddParticipantsOpen(true);
  };

  return (
    <>
      <div className="px-6 py-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h4 className="text-xs font-medium uppercase text-muted-foreground">
            Participantes
          </h4>
          {canEdit && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
              onClick={handleOpenAddParticipants}
              aria-label="Adicionar participantes"
            >
              <UserPlus className="h-4 w-4" />
            </Button>
          )}
        </div>

        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Buscar participantes"
            className="h-9 bg-muted pl-10"
          />
        </div>

        <div className="space-y-1">
          {visibleParticipants.map((participant) => {
            const isAdmin = adminIds.includes(participant.id);
            const participantPresence = getChatPresenceMeta(participant);

            return (
              <div
                key={participant.id}
                className="flex min-w-0 items-center gap-3 rounded-lg px-2 py-2"
              >
                <div className="relative shrink-0">
                  <Avatar className="h-10 w-10">
                    <AvatarImage
                      src={participant.avatar}
                      alt={participant.name}
                    />
                    <AvatarFallback>
                      {participant.name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span
                    className={cn(
                      "absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card",
                      participantPresence.dotClassName,
                    )}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {participant.name}
                    </span>
                    {isAdmin && (
                      <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">
                        Admin
                      </span>
                    )}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {participant.email}
                  </p>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        participantPresence.dotClassName,
                      )}
                    />
                    {participantPresence.label}
                  </p>
                </div>
                {canEdit && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className="text-muted-foreground"
                        aria-label={`Abrir opções de ${participant.name}`}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem
                        onClick={() =>
                          onToggleParticipantAdmin?.(participant.id)
                        }
                      >
                        {isAdmin ? (
                          <ShieldMinus className="mr-2 h-4 w-4" />
                        ) : (
                          <ShieldCheck className="mr-2 h-4 w-4" />
                        )}
                        {isAdmin ? "Revogar admin" : "Promover a admin"}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => setRemoveParticipant(participant)}
                      >
                        <UserMinus className="mr-2 h-4 w-4" />
                        Remover do grupo
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            );
          })}

          {filteredParticipants.length === 0 && (
            <p className="px-2 py-4 text-center text-sm text-muted-foreground">
              Nenhum participante encontrado
            </p>
          )}
        </div>

        {filteredParticipants.length > 5 && (
          <Button
            type="button"
            variant="ghost"
            className="mt-2 w-full"
            onClick={() =>
              setShowAllParticipants((currentValue) => !currentValue)
            }
          >
            {showAllParticipants ? "Ver menos" : "Ver mais"}
          </Button>
        )}
      </div>

      <Dialog
        open={isAddParticipantsOpen}
        onOpenChange={handleAddParticipantsOpenChange}
      >
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
          <div className="border-b px-4 py-3">
            <DialogTitle>Adicionar participantes</DialogTitle>
            <DialogDescription className="sr-only">
              Selecione usuários para adicionar ao grupo.
            </DialogDescription>
          </div>
          <div className="border-b p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={addSearchQuery}
                onChange={(event) => setAddSearchQuery(event.target.value)}
                placeholder="Buscar participantes"
                className="bg-muted pl-10"
              />
            </div>
          </div>
          <div className="thin-gray-scrollbar max-h-[min(28rem,calc(100vh-14rem))] overflow-y-auto">
            <div className="divide-y">
              {addParticipantOptions.map((participant) => (
                <div
                  key={participant.id}
                  role="button"
                  tabIndex={0}
                  className="flex min-h-16 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/50"
                  onClick={() => toggleAddParticipant(participant.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      toggleAddParticipant(participant.id);
                    }
                  }}
                >
                  <Checkbox
                    checked={selectedAddParticipantIds.includes(participant.id)}
                    onCheckedChange={() => toggleAddParticipant(participant.id)}
                    onClick={(event) => event.stopPropagation()}
                    aria-label={`Selecionar ${participant.name}`}
                  />
                  <Avatar className="h-11 w-11">
                    <AvatarImage
                      src={participant.avatar}
                      alt={participant.name}
                    />
                    <AvatarFallback>
                      {participant.name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">
                      {participant.name}
                    </div>
                    <div className="truncate text-sm text-muted-foreground">
                      {participant.email}
                    </div>
                  </div>
                </div>
              ))}

              {addParticipantOptions.length === 0 && (
                <div className="flex min-h-28 items-center justify-center px-4 text-center text-sm text-muted-foreground">
                  Nenhum participante disponível
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 border-t bg-card px-4 py-3">
            <p className="text-sm text-muted-foreground">
              {selectedAddParticipantIds.length} selecionado
              {selectedAddParticipantIds.length === 1 ? "" : "s"}
            </p>
            <Button
              onClick={handleConfirmAddParticipants}
              disabled={selectedAddParticipantIds.length === 0}
            >
              Concluir
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(removeParticipant)}
        onOpenChange={(open) => !open && setRemoveParticipant(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogTitle>Remover participante?</DialogTitle>
          <DialogDescription className="sr-only">
            Confirme a remoção do participante selecionado deste grupo.
          </DialogDescription>
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja remover {removeParticipant?.name} deste
            grupo?
          </p>
          <div className="-mx-4 -mb-4 flex justify-end gap-2 border-t bg-muted/50 p-4">
            <Button variant="ghost" onClick={() => setRemoveParticipant(null)}>
              Cancelar
            </Button>
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={handleConfirmRemoveParticipant}
            >
              Remover
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ContactDetails({
  contact,
  currentUser,
  messages,
  isGroup = false,
  groupParticipants = [],
  groupAdminIds = [],
  availableParticipants = [],
  canEditGroup = false,
  onClose,
  onUpdateGroup,
  onAddGroupParticipants,
  onRemoveGroupParticipant,
  onToggleGroupParticipantAdmin,
  onMute,
  onPin,
  onReport,
  onClear,
  onLeaveGroup,
  onDelete,
}: ContactDetailsProps) {
  const [activeMediaTab, setActiveMediaTab] = useState<MediaTab | null>(null);
  const [isFavoritesOpen, setIsFavoritesOpen] = useState(false);
  const [isAvatarViewerOpen, setIsAvatarViewerOpen] = useState(false);
  const [isGroupEditOpen, setIsGroupEditOpen] = useState(false);
  const [isLeaveGroupConfirmOpen, setIsLeaveGroupConfirmOpen] = useState(false);
  const [groupNameDraft, setGroupNameDraft] = useState(contact.name);
  const [groupDescriptionDraft, setGroupDescriptionDraft] = useState(
    contact.about,
  );
  const [groupAvatarDraft, setGroupAvatarDraft] = useState(contact.avatar);
  const groupPhotoInputRef = useRef<HTMLInputElement>(null);
  const mediaGroups = useMemo(() => buildMediaGroups(messages), [messages]);
  const documentItems = useMemo(() => buildDocumentItems(messages), [messages]);
  const linkItems = useMemo(
    () =>
      buildLinkItems(
        messages,
        contact,
        currentUser,
        groupParticipants,
        isGroup,
      ),
    [contact, currentUser, groupParticipants, isGroup, messages],
  );

  const handleGroupPhotoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) return;

    const { acceptedFiles, rejectedFiles } = splitFilesByUploadSize([file]);

    if (rejectedFiles.length > 0) {
      toast.error("Arquivo acima de 16 MB.", {
        description: getUploadSizeLimitMessage(rejectedFiles.length),
      });
      event.target.value = "";
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        setGroupAvatarDraft(reader.result);
      }
    };
    reader.readAsDataURL(acceptedFiles[0]);
    event.target.value = "";
  };

  const handleOpenGroupEdit = () => {
    setGroupNameDraft(contact.name);
    setGroupDescriptionDraft(contact.about);
    setGroupAvatarDraft(contact.avatar);
    setIsGroupEditOpen(true);
  };

  const handleSaveGroupEdit = () => {
    const nextName = groupNameDraft.trim();

    if (!nextName) return;

    onUpdateGroup?.({
      name: nextName,
      about: groupDescriptionDraft.trim() || "Grupo sem descrição",
      avatar: groupAvatarDraft,
    });
    setIsGroupEditOpen(false);
  };

  const handleConfirmLeaveGroup = () => {
    onLeaveGroup?.();
    setIsLeaveGroupConfirmOpen(false);
  };

  if (activeMediaTab) {
    return (
      <ContactMediaPanel
        contact={contact}
        activeTab={activeMediaTab}
        documentItems={documentItems}
        linkItems={linkItems}
        mediaGroups={mediaGroups}
        onTabChange={setActiveMediaTab}
        onBack={() => setActiveMediaTab(null)}
      />
    );
  }

  if (isFavoritesOpen) {
    return (
      <FavoriteMessagesPanel
        contact={contact}
        currentUser={currentUser}
        groupParticipants={groupParticipants}
        isGroup={isGroup}
        messages={messages}
        onBack={() => setIsFavoritesOpen(false)}
      />
    );
  }

  const contactPresence = getChatPresenceMeta(contact);
  const groupOnlineParticipants = groupParticipants.filter(
    (participant) => getChatPresenceStatus(participant) === "online",
  );
  const groupPresenceSummary = `${groupParticipants.length} participante${
    groupParticipants.length === 1 ? "" : "s"
  } • ${groupOnlineParticipants.length} online`;

  return (
    <>
      <div className="flex h-full min-h-0 w-full min-w-0 flex-col border-l bg-card">
        {/* Header */}
        <div className="flex shrink-0 items-center gap-3 border-b px-4 py-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="md:hidden"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h2 className="flex-1 text-lg font-semibold">
            {isGroup ? "Dados do grupo" : "Dados do contato"}
          </h2>
          {isGroup && canEditGroup && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleOpenGroupEdit}
              aria-label="Editar dados do grupo"
            >
              <Edit className="h-5 w-5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="hidden md:flex"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="thin-gray-scrollbar min-h-0 flex-1 overflow-y-auto pb-8">
          {/* Profile Section */}
          <div className="flex flex-col items-center px-6 py-8">
            <button
              type="button"
              className="relative rounded-full transition-transform hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card"
              onClick={() => setIsAvatarViewerOpen(true)}
              aria-label={`Abrir foto de ${contact.name} em tela cheia`}
            >
              <Avatar className="h-32 w-32">
                <AvatarImage src={contact.avatar} alt={contact.name} />
                <AvatarFallback className="text-3xl">
                  {contact.name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              {!isGroup && (
                <span
                  className={cn(
                    "absolute bottom-2 right-2 h-5 w-5 rounded-full border-4 border-card",
                    contactPresence.dotClassName,
                  )}
                />
              )}
            </button>
            <h3 className="mt-4 text-xl font-semibold text-foreground">
              {contact.name}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {isGroup ? groupPresenceSummary : contactPresence.label}
            </p>
          </div>

          <Separator />

          {/* About Section */}
          <div className="px-6 py-4">
            <h4 className="mb-2 text-xs font-medium uppercase text-muted-foreground">
              {isGroup ? "Descrição" : "Recado"}
            </h4>
            <p className="text-sm text-foreground">{contact.about}</p>
          </div>

          {!isGroup && (
            <>
              <Separator />

              {/* Email Section */}
              <div className="px-6 py-4">
                <h4 className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                  E-mail
                </h4>
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-sm text-primary">
                    {contact.email}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="text-muted-foreground"
                    onClick={() => navigator.clipboard.writeText(contact.email)}
                    aria-label="Copiar e-mail"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}

          {isGroup && (
            <>
              <Separator />

              {/* Media Section */}
              <div className="px-6 py-4">
                <h4 className="mb-3 text-xs font-medium uppercase text-muted-foreground">
                  Mídia, links e docs
                </h4>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg bg-muted p-3 transition-colors hover:bg-muted/80"
                    onClick={() => setActiveMediaTab("media")}
                  >
                    <ImageIcon className="h-5 w-5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Fotos</span>
                  </button>
                  <button
                    type="button"
                    className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg bg-muted p-3 transition-colors hover:bg-muted/80"
                    onClick={() => setActiveMediaTab("documents")}
                  >
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Docs</span>
                  </button>
                  <button
                    type="button"
                    className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg bg-muted p-3 transition-colors hover:bg-muted/80"
                    onClick={() => setActiveMediaTab("links")}
                  >
                    <LinkIcon className="h-5 w-5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Links</span>
                  </button>
                </div>
              </div>
            </>
          )}

          {!isGroup && (
            <>
              <Separator />

              {/* Media Section */}
              <div className="px-6 py-4">
                <h4 className="mb-3 text-xs font-medium uppercase text-muted-foreground">
                  Mídia, links e docs
                </h4>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg bg-muted p-3 transition-colors hover:bg-muted/80"
                    onClick={() => setActiveMediaTab("media")}
                  >
                    <ImageIcon className="h-5 w-5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Fotos</span>
                  </button>
                  <button
                    type="button"
                    className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg bg-muted p-3 transition-colors hover:bg-muted/80"
                    onClick={() => setActiveMediaTab("documents")}
                  >
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Docs</span>
                  </button>
                  <button
                    type="button"
                    className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg bg-muted p-3 transition-colors hover:bg-muted/80"
                    onClick={() => setActiveMediaTab("links")}
                  >
                    <LinkIcon className="h-5 w-5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Links</span>
                  </button>
                </div>
              </div>
            </>
          )}

          {isGroup && (
            <>
              <Separator />
              <GroupParticipantsSection
                participants={groupParticipants}
                adminIds={groupAdminIds}
                availableParticipants={availableParticipants}
                canEdit={canEditGroup}
                onAddParticipants={onAddGroupParticipants}
                onRemoveParticipant={onRemoveGroupParticipant}
                onToggleParticipantAdmin={onToggleGroupParticipantAdmin}
              />
            </>
          )}

          <Separator />

          {/* Actions */}
          <div className="px-6 py-4">
            <h4 className="mb-3 text-xs font-medium uppercase text-muted-foreground">
              Ações
            </h4>
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={onMute}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted"
              >
                {contact.isMuted ? (
                  <Bell className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <BellOff className="h-5 w-5 text-muted-foreground" />
                )}
                <span className="text-sm">
                  {contact.isMuted
                    ? isGroup
                      ? "Reativar grupo"
                      : "Reativar notificação"
                    : isGroup
                      ? "Silenciar grupo"
                      : "Silenciar notificações"}
                </span>
              </button>
              <button
                type="button"
                onClick={onPin}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted"
              >
                <Pin
                  className={cn(
                    "h-5 w-5 text-muted-foreground",
                    contact.isPinned && "text-muted-foreground",
                  )}
                />
                <span className="text-sm">
                  {contact.isPinned
                    ? isGroup
                      ? "Desfixar grupo"
                      : "Desfixar conversa"
                    : isGroup
                      ? "Fixar grupo"
                      : "Fixar conversa"}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setIsFavoritesOpen(true)}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted"
              >
                <Star className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm">Mensagens favoritas</span>
              </button>
            </div>
          </div>

          <Separator />

          {/* Danger Zone */}
          <div className="px-6 py-4">
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={onReport}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-destructive transition-colors hover:bg-destructive/10"
              >
                <Flag className="h-5 w-5" />
                <span className="text-sm">
                  {isGroup ? "Denunciar grupo" : "Denunciar contato"}
                </span>
              </button>
              <button
                type="button"
                onClick={onClear}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-destructive transition-colors hover:bg-destructive/10"
              >
                <Eraser className="h-5 w-5" />
                <span className="text-sm">
                  {isGroup ? "Limpar grupo" : "Limpar conversa"}
                </span>
              </button>
              {isGroup && (
                <button
                  type="button"
                  onClick={() => setIsLeaveGroupConfirmOpen(true)}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-destructive transition-colors hover:bg-destructive/10"
                >
                  <LogOut className="h-5 w-5" />
                  <span className="text-sm">Sair do grupo</span>
                </button>
              )}
              <button
                type="button"
                onClick={onDelete}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-destructive transition-colors hover:bg-destructive/10"
              >
                <Trash2 className="h-5 w-5" />
                <span className="text-sm">
                  {isGroup ? "Apagar grupo" : "Apagar conversa"}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {isGroup && canEditGroup && (
        <Dialog open={isGroupEditOpen} onOpenChange={setIsGroupEditOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogTitle>Editar grupo</DialogTitle>
            <DialogDescription className="sr-only">
              Altere o nome, a descrição e a foto deste grupo.
            </DialogDescription>
            <input
              ref={groupPhotoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleGroupPhotoChange}
            />
            <div className="flex flex-col items-center gap-3">
              <button
                type="button"
                className="group relative rounded-full"
                onClick={() => groupPhotoInputRef.current?.click()}
                aria-label="Alterar foto do grupo"
              >
                <Avatar className="h-24 w-24">
                  <AvatarImage src={groupAvatarDraft} alt={groupNameDraft} />
                  <AvatarFallback className="text-2xl">
                    {(groupNameDraft || contact.name).slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100">
                  <Camera className="h-6 w-6" />
                </span>
              </button>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="group-detail-name">Nome do grupo</Label>
              <Input
                id="group-detail-name"
                value={groupNameDraft}
                onChange={(event) => setGroupNameDraft(event.target.value)}
                className="bg-muted"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="group-detail-description">Descrição</Label>
              <Textarea
                id="group-detail-description"
                value={groupDescriptionDraft}
                onChange={(event) =>
                  setGroupDescriptionDraft(event.target.value)
                }
                className="min-h-24 resize-none bg-muted"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsGroupEditOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="button" onClick={handleSaveGroupEdit}>
                Salvar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {isGroup && (
        <Dialog
          open={isLeaveGroupConfirmOpen}
          onOpenChange={setIsLeaveGroupConfirmOpen}
        >
          <DialogContent className="sm:max-w-md">
            <DialogTitle>Sair do grupo?</DialogTitle>
            <DialogDescription className="sr-only">
              Confirme se você deseja sair deste grupo.
            </DialogDescription>
            <p className="text-sm text-muted-foreground">
              Tem certeza que deseja sair de {contact.name}? O grupo será
              removido da sua lista.
            </p>
            <div className="-mx-4 -mb-4 flex justify-end gap-2 border-t bg-muted/50 p-4">
              <Button
                variant="ghost"
                onClick={() => setIsLeaveGroupConfirmOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={handleConfirmLeaveGroup}
              >
                Sair do grupo
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={isAvatarViewerOpen} onOpenChange={setIsAvatarViewerOpen}>
        <DialogContent
          showCloseButton={false}
          className="fixed inset-0 left-0 top-0 z-50 flex h-dvh w-dvw max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 bg-black p-0 text-white ring-0 sm:max-w-none"
        >
          <DialogTitle className="sr-only">Foto de {contact.name}</DialogTitle>
          <DialogDescription className="sr-only">
            Visualização da foto em tela cheia.
          </DialogDescription>
          <div className="absolute left-4 top-4 z-10 flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={contact.avatar} alt={contact.name} />
              <AvatarFallback>
                {contact.name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{contact.name}</p>
              <p className="text-xs text-white/65">
                {isGroup ? "Foto do grupo" : "Foto do contato"}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-4 top-4 z-10 text-white hover:bg-white/10 hover:text-white"
            onClick={() => setIsAvatarViewerOpen(false)}
            aria-label="Fechar foto"
          >
            <X className="h-5 w-5" />
          </Button>
          <div className="flex min-h-0 flex-1 items-center justify-center p-6">
            <div
              role="img"
              aria-label={`Foto de ${contact.name}`}
              className="h-full max-h-[min(82dvh,44rem)] w-full max-w-[min(82dvw,44rem)] bg-contain bg-center bg-no-repeat"
              style={{ backgroundImage: `url(${contact.avatar})` }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
