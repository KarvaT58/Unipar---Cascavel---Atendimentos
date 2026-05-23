"use client";

import {
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { toast } from "sonner";
import { Badge } from "@/components/unipar-ui/badge";
import { Button } from "@/components/unipar-ui/button";
import { Checkbox } from "@/components/unipar-ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/unipar-ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/unipar-ui/dropdown-menu";
import { Input } from "@/components/unipar-ui/input";
import { Label } from "@/components/unipar-ui/label";
import {
  OptionCombobox,
  SectorCombobox,
  workspaceSectorComboboxOptions,
  type ComboboxOption,
} from "@/components/option-combobox";
import { PagePagination } from "@/components/page-pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/unipar-ui/select";
import { Textarea } from "@/components/unipar-ui/textarea";
import {
  ArrowRightLeft,
  ArrowLeft,
  BellRing,
  Building2,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Headphones,
  Lock,
  Maximize2,
  MessageCircle,
  MoreVertical,
  Paperclip,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Plus,
  RotateCcw,
  Search,
  Send,
  UserCheck,
  X,
} from "lucide-react";
import { SECTOR_OPTIONS, type Sector } from "@/lib/admin-data";
import {
  createSystemTicketMessage,
  formatServiceTicketDateTime,
  getServiceTicketPriorityLabel,
  getServiceTicketStatusLabel,
  type ServiceTicket,
  type ServiceTicketAttachment,
  type ServiceTicketAttachmentKind,
  type ServiceTicketMessage,
  type ServiceTicketPriority,
  type ServiceTicketUser,
} from "@/lib/service-ticket-data";
import {
  SERVICE_TICKET_NOTIFICATION_EVENT,
  getServiceTicketNotificationReadStorageKey,
  getServiceTicketNotificationKey,
  getServiceTicketNotificationSnapshot,
  markServiceTicketNotificationKeysRead,
  readServiceTicketNotificationReadKeys,
} from "@/lib/service-ticket-notifications";
import {
  getUploadSizeLimitMessage,
  splitFilesByUploadSize,
} from "@/lib/upload-limits";

interface ServiceTicketsPageProps {
  currentUser: ServiceTicketUser;
  users: ServiceTicketUser[];
  tickets: ServiceTicket[];
  onCreateTicket: (ticket: ServiceTicket) => void;
  onUpdateTicket: (ticket: ServiceTicket) => void;
}

type TicketListFilter =
  | "all"
  | "open"
  | "in_progress"
  | "assigned_to_me"
  | "opened_by_me"
  | "history";
type TransferMode = "sector" | "user";

const MAX_TICKET_ATTACHMENTS = 3;
const MAX_TICKET_MESSAGE_ATTACHMENTS = 3;
const TICKETS_FALLBACK_PAGE_SIZE = 12;
const TICKETS_DESKTOP_ROW_HEIGHT = 53;
const TICKETS_DESKTOP_HEADER_HEIGHT = 35;
const TICKETS_MOBILE_CARD_HEIGHT = 176;
const CHAT_TEXTAREA_MAX_ROWS = 5;
const CLOSE_DESCRIPTION_MAX_ROWS = 10;

const ticketFilterOptions: Array<{ value: TicketListFilter; label: string }> = [
  { value: "all", label: "Ver tudo" },
  { value: "open", label: "Em aberto" },
  { value: "in_progress", label: "Em andamento" },
  { value: "assigned_to_me", label: "Estou atendendo" },
  { value: "opened_by_me", label: "Abertos por mim" },
  { value: "history", label: "Histórico" },
];

const priorityOptions: Array<{
  value: ServiceTicketPriority;
  label: string;
  description: string;
}> = [
  { value: "low", label: "Baixa", description: "Pode aguardar atendimento" },
  { value: "normal", label: "Normal", description: "Fluxo padrao do setor" },
  { value: "high", label: "Alta", description: "Precisa de atencao rapida" },
  { value: "urgent", label: "Urgente", description: "Impacto imediato" },
];
const priorityComboboxOptions: ComboboxOption[] = priorityOptions;
const transferModeComboboxOptions: ComboboxOption[] = [
  {
    value: "sector",
    label: "Para outro setor",
    description: "Enviar o chamado para uma fila de outro setor",
  },
  {
    value: "user",
    label: "Para colega do meu setor",
    description: "Enviar o chamado para alguem do seu setor",
  },
];
const forceComboboxBelow = {
  side: "none",
  align: "shift",
  fallbackAxisSide: "none",
} as const;

function createId(prefix: string) {
  if (typeof window !== "undefined" && window.crypto.randomUUID) {
    return `${prefix}-${window.crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}`;
}

function getDefaultTargetSector(currentSector: Sector) {
  return SECTOR_OPTIONS.find((sector) => sector !== currentSector) ?? currentSector;
}

function getFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getAttachmentKind(file: File): ServiceTicketAttachmentKind {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";

  return "document";
}

function getFileExtension(fileName: string) {
  const extension = fileName.split(".").pop();

  return extension ? extension.toUpperCase() : "DOC";
}

function getStatusVariant(status: ServiceTicket["status"]) {
  if (status === "completed") return "secondary";
  if (status === "in_progress") return "default";

  return "outline";
}

function getPriorityVariant(priority: ServiceTicketPriority) {
  if (priority === "urgent") return "destructive";
  if (priority === "high") return "default";
  if (priority === "low") return "secondary";

  return "outline";
}

function resizeTextareaToMaxRows(
  textarea: HTMLTextAreaElement,
  maxRows: number,
) {
  const styles = window.getComputedStyle(textarea);
  const lineHeight = Number.parseFloat(styles.lineHeight) || 20;
  const verticalPadding =
    Number.parseFloat(styles.paddingTop) + Number.parseFloat(styles.paddingBottom);
  const verticalBorder =
    Number.parseFloat(styles.borderTopWidth) +
    Number.parseFloat(styles.borderBottomWidth);
  const maxHeight =
    lineHeight * maxRows + verticalPadding + verticalBorder;
  const minHeight = lineHeight + verticalPadding + verticalBorder;

  textarea.style.height = "auto";

  const nextHeight = Math.min(textarea.scrollHeight, maxHeight);

  textarea.style.height = `${Math.max(minHeight, nextHeight)}px`;
  textarea.style.overflowY =
    textarea.scrollHeight > maxHeight + 1 ? "auto" : "hidden";
}

function resizeChatMessageTextarea(textarea: HTMLTextAreaElement) {
  resizeTextareaToMaxRows(textarea, CHAT_TEXTAREA_MAX_ROWS);
}

function resizeCloseDescriptionTextarea(textarea: HTMLTextAreaElement) {
  resizeTextareaToMaxRows(textarea, CLOSE_DESCRIPTION_MAX_ROWS);
}

function getAttachmentLabel(kind: ServiceTicketAttachmentKind) {
  if (kind === "image") return "Imagem";
  if (kind === "video") return "Vídeo";

  return "Documento";
}

function formatServiceTicketOpenedDate(date: Date) {
  return {
    date: date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }),
    time: date.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}

function downloadTicketAttachment(attachment: ServiceTicketAttachment) {
  const downloadLink = document.createElement("a");

  downloadLink.href = attachment.url;
  downloadLink.download = attachment.name;
  downloadLink.rel = "noopener";
  document.body.appendChild(downloadLink);
  downloadLink.click();
  downloadLink.remove();
}

function AttachmentPreview({
  attachment,
  onOpen,
  onRemove,
  allowDownload = true,
  variant = "compact",
}: {
  attachment: ServiceTicketAttachment;
  onOpen?: () => void;
  onRemove?: () => void;
  allowDownload?: boolean;
  variant?: "compact" | "message";
}) {
  const label = getAttachmentLabel(attachment.kind);
  const isMessageVariant = variant === "message";
  const shouldShowKindLabel =
    !isMessageVariant || attachment.kind === "document";

  return (
    <div
      className={`group relative max-w-full overflow-hidden ${
        isMessageVariant
          ? "w-fit rounded-md bg-transparent"
          : "rounded-lg border bg-background"
      }`}
    >
      <button
        type="button"
        className={`relative flex max-w-full items-center justify-center overflow-hidden bg-muted text-left transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
          isMessageVariant ? "h-56 w-64 rounded-md" : "aspect-video w-full"
        }`}
        onClick={onOpen}
        aria-label={`Abrir ${label.toLowerCase()}`}
      >
        {attachment.kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={attachment.url}
            alt={label}
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
          />
        ) : attachment.kind === "video" ? (
          <>
            <video
              src={attachment.url}
              className="h-full w-full bg-black object-cover"
              muted
              preload="metadata"
            />
            <span className="absolute inset-0 flex items-center justify-center bg-black/20 text-white">
              <Play className="h-9 w-9 fill-current" />
            </span>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <FileText className="h-9 w-9" />
            <span className="text-xs font-semibold uppercase tracking-wide">
              {label}
            </span>
          </div>
        )}
        {shouldShowKindLabel && (
          <span className="absolute bottom-2 left-2 rounded bg-black/55 px-2 py-1 text-[0.6875rem] font-medium text-white">
            {label}
          </span>
        )}
        <span className="absolute bottom-2 right-2 rounded-full bg-black/45 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <Maximize2 className="h-4 w-4" />
        </span>
      </button>
      <div className="absolute right-2 top-2 flex gap-1">
        {allowDownload && (
          <Button
            type="button"
            variant="secondary"
            size="icon-sm"
            onClick={(event) => {
              event.stopPropagation();
              downloadTicketAttachment(attachment);
            }}
            aria-label="Baixar anexo"
          >
            <Download className="h-4 w-4" />
          </Button>
        )}
        {onRemove && (
          <Button
            type="button"
            variant="secondary"
            size="icon-sm"
            onClick={(event) => {
              event.stopPropagation();
              onRemove();
            }}
            aria-label="Remover anexo"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      {false && (
      <div className="p-2">
        <p className="truncate text-sm font-semibold">{attachment.name}</p>
        <p className="text-xs text-muted-foreground">
          {attachment.kind === "image"
            ? "Imagem"
            : attachment.kind === "video"
              ? "Vídeo"
              : "Documento"}{" "}
          • {getFileSize(attachment.size)}
        </p>
      </div>
      )}
    </div>
  );
}

function AttachmentFullscreenDialog({
  attachment,
  onOpenChange,
}: {
  attachment: ServiceTicketAttachment | null;
  onOpenChange: (open: boolean) => void;
}) {
  const label = attachment ? getAttachmentLabel(attachment.kind) : "Anexo";

  return (
    <Dialog open={Boolean(attachment)} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] max-w-[calc(100vw-1rem)] overflow-hidden p-0 sm:max-w-[calc(100vw-1rem)]"
      >
        {attachment && (
          <div className="flex min-h-0 w-full flex-col bg-background">
            <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b px-3">
              <DialogTitle className="text-sm font-semibold">
                {label}
              </DialogTitle>
              <DialogDescription className="sr-only">
                Visualização do anexo do atendimento em tela cheia.
              </DialogDescription>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  onClick={() => downloadTicketAttachment(attachment)}
                  aria-label="Baixar anexo"
                >
                  <Download className="h-4 w-4" />
                </Button>
                <DialogClose asChild>
                  <Button type="button" variant="ghost" size="icon-sm">
                    <X className="h-4 w-4" />
                    <span className="sr-only">Fechar</span>
                  </Button>
                </DialogClose>
              </div>
            </div>
            <div className="min-h-0 flex-1 bg-black">
              {attachment.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={attachment.url}
                  alt={label}
                  className="h-full w-full object-contain"
                />
              ) : attachment.kind === "video" ? (
                <video
                  src={attachment.url}
                  className="h-full w-full bg-black"
                  controls
                  autoPlay
                />
              ) : (
                <iframe
                  src={attachment.url}
                  title={label}
                  className="h-full w-full border-0 bg-background"
                />
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TicketNotificationBadge({ count }: { count: number }) {
  if (count <= 0) {
    return null;
  }

  const displayCount = count > 99 ? "99+" : String(count);
  const notificationLabel = count === 1 ? "notificação" : "notificações";

  return (
    <span
      aria-label={`${count} ${notificationLabel} neste chamado`}
      className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full bg-primary px-2 text-[11px] font-bold leading-none text-primary-foreground shadow-sm"
      title={`${count} ${notificationLabel} neste chamado`}
    >
      <BellRing className="h-3.5 w-3.5" />
      {displayCount}
    </span>
  );
}

function getTicketSearchText(ticket: ServiceTicket) {
  return [
    ticket.title,
    ticket.description,
    ticket.requesterName,
    ticket.requesterSector,
    ticket.targetSector,
    ticket.assignedToName ?? "",
    getServiceTicketPriorityLabel(ticket.priority),
    getServiceTicketStatusLabel(ticket.status),
  ]
    .join(" ")
    .toLowerCase();
}

function getTicketDisplayNumber(ticket: ServiceTicket) {
  let hash = 0;

  for (const character of ticket.id) {
    hash = (hash * 31 + character.charCodeAt(0)) % 1000000;
  }

  return `#${hash.toString().padStart(6, "0")}`;
}

function canSeeTicket(ticket: ServiceTicket, user: ServiceTicketUser) {
  return (
    ticket.requesterSector === user.sector || ticket.targetSector === user.sector
  );
}

function canSeeMessage(message: ServiceTicketMessage, user: ServiceTicketUser) {
  return !message.isInternal || message.authorSector === user.sector;
}

function isHighlightedTicketSystemMessage(message: ServiceTicketMessage) {
  if (!message.isSystem) return false;

  const content = message.content.toLowerCase();

  return (
    content.includes("chamado aberto") ||
    content.includes("assumiu o atendimento") ||
    content.includes("chamado transferido") ||
    content.includes("chamado encerrado") ||
    content.includes("chamado reaberto")
  );
}

function isTicketOpeningSystemMessage(message: ServiceTicketMessage) {
  return Boolean(
    message.isSystem && message.content.toLowerCase().includes("chamado aberto"),
  );
}

function isTicketOpeningDescriptionMessage(
  ticket: ServiceTicket,
  message: ServiceTicketMessage,
) {
  if (message.isSystem) return false;
  if (message.authorId !== ticket.requesterId) return false;
  if (message.content.trim() !== ticket.description.trim()) return false;

  return (
    Math.abs(message.createdAt.getTime() - ticket.createdAt.getTime()) < 5000
  );
}

export function ServiceTicketsPage({
  currentUser,
  users,
  tickets,
  onCreateTicket,
  onUpdateTicket,
}: ServiceTicketsPageProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatFileInputRef = useRef<HTMLInputElement>(null);
  const chatTextareaRef = useRef<HTMLTextAreaElement>(null);
  const chatMessagesViewportRef = useRef<HTMLDivElement>(null);
  const ticketListViewportRef = useRef<HTMLDivElement>(null);
  const desktopTicketHeaderRef = useRef<HTMLDivElement>(null);
  const desktopTicketRowRef = useRef<HTMLElement | null>(null);
  const mobileTicketCardRef = useRef<HTMLElement | null>(null);
  const messageElementRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const closeFileInputRef = useRef<HTMLInputElement>(null);
  const closeDescriptionTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [activeFilter, setActiveFilter] = useState<TicketListFilter>("all");
  const [coworkerFilter, setCoworkerFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createTargetSector, setCreateTargetSector] = useState<Sector>(() =>
    getDefaultTargetSector(currentUser.sector),
  );
  const [createPriority, setCreatePriority] =
    useState<ServiceTicketPriority>("normal");
  const [createAttachments, setCreateAttachments] = useState<
    ServiceTicketAttachment[]
  >([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [openActionMenuTicketId, setOpenActionMenuTicketId] = useState<
    string | null
  >(null);
  const [chatMessage, setChatMessage] = useState("");
  const [chatAttachments, setChatAttachments] = useState<
    ServiceTicketAttachment[]
  >([]);
  const [isInternalMessage, setIsInternalMessage] = useState(false);
  const [closeTicketId, setCloseTicketId] = useState<string | null>(null);
  const [closeDescription, setCloseDescription] = useState("");
  const [closeAttachments, setCloseAttachments] = useState<
    ServiceTicketAttachment[]
  >([]);
  const [reopenTicketId, setReopenTicketId] = useState<string | null>(null);
  const [reopenReason, setReopenReason] = useState("");
  const [transferTicketId, setTransferTicketId] = useState<string | null>(null);
  const [transferMode, setTransferMode] = useState<TransferMode>("sector");
  const [transferSector, setTransferSector] = useState<Sector>(() =>
    getDefaultTargetSector(currentUser.sector),
  );
  const [transferUserId, setTransferUserId] = useState("");
  const [fullscreenAttachment, setFullscreenAttachment] =
    useState<ServiceTicketAttachment | null>(null);
  const [isTicketDetailsOpen, setIsTicketDetailsOpen] = useState(true);
  const [notificationReadVersion, setNotificationReadVersion] = useState(0);
  const [ticketsPageSize, setTicketsPageSize] = useState(
    TICKETS_FALLBACK_PAGE_SIZE,
  );
  const actionMenuDialogTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (actionMenuDialogTimeoutRef.current !== null) {
        window.clearTimeout(actionMenuDialogTimeoutRef.current);
      }
    };
  }, []);

  const selectedTicketCandidate = selectedTicketId
    ? tickets.find((ticket) => ticket.id === selectedTicketId) ?? null
    : null;
  const selectedTicket =
    selectedTicketCandidate && canSeeTicket(selectedTicketCandidate, currentUser)
      ? selectedTicketCandidate
      : null;
  const closeTicket = closeTicketId
    ? tickets.find((ticket) => ticket.id === closeTicketId) ?? null
    : null;
  const reopenTicket = reopenTicketId
    ? tickets.find((ticket) => ticket.id === reopenTicketId) ?? null
    : null;
  const transferTicket = transferTicketId
    ? tickets.find((ticket) => ticket.id === transferTicketId) ?? null
    : null;

  const sameSectorUsers = useMemo(
    () =>
      users
        .filter((user) => user.sector === currentUser.sector)
        .sort((firstUser, secondUser) =>
          firstUser.name.localeCompare(secondUser.name),
        ),
    [currentUser.sector, users],
  );

  const transferUsers = useMemo(
    () => sameSectorUsers.filter((user) => user.id !== currentUser.id),
    [currentUser.id, sameSectorUsers],
  );
  const transferUserOptions = useMemo<ComboboxOption[]>(
    () =>
      transferUsers.map((user) => ({
        value: user.id,
        label: user.name,
        description: user.sector,
      })),
    [transferUsers],
  );
  const selectedTransferUserId = transferUsers.some(
    (user) => user.id === transferUserId,
  )
    ? transferUserId
    : (transferUsers[0]?.id ?? "");
  const ticketNotificationSnapshot = useMemo(() => {
    void notificationReadVersion;

    const readKeys = readServiceTicketNotificationReadKeys(currentUser.id);

    return getServiceTicketNotificationSnapshot(tickets, currentUser, readKeys);
  }, [currentUser, notificationReadVersion, tickets]);
  const markNotificationKeysAsSeen = useCallback(
    (keys: string[]) => {
      const didChange = markServiceTicketNotificationKeysRead(
        currentUser.id,
        keys,
      );

      if (didChange) {
        setNotificationReadVersion((version) => version + 1);
      }
    },
    [currentUser.id],
  );
  const markTicketMessagesAsSeen = useCallback(
    (ticket: ServiceTicket, messageIds: string[]) => {
      const visibleMessageIds = new Set(messageIds);
      const keys = ticket.messages
        .filter((message) => visibleMessageIds.has(message.id))
        .map((message) => getServiceTicketNotificationKey(ticket, message))
        .filter((key) => ticketNotificationSnapshot.unreadKeys.has(key));

      markNotificationKeysAsSeen(keys);
    },
    [markNotificationKeysAsSeen, ticketNotificationSnapshot.unreadKeys],
  );
  const markTicketNotificationsAsSeen = useCallback(
    (ticketId: string) => {
      const unreadKeys = ticketNotificationSnapshot.keysByTicket[ticketId]
        ?.filter((key) => ticketNotificationSnapshot.unreadKeys.has(key)) ?? [];

      markNotificationKeysAsSeen(unreadKeys);
    },
    [
      markNotificationKeysAsSeen,
      ticketNotificationSnapshot.keysByTicket,
      ticketNotificationSnapshot.unreadKeys,
    ],
  );

  const openTicketChat = useCallback(
    (ticketId: string) => {
      setSelectedTicketId(ticketId);
      markTicketNotificationsAsSeen(ticketId);
    },
    [markTicketNotificationsAsSeen],
  );

  useEffect(() => {
    if (!selectedTicket) return;

    const timeoutId = window.setTimeout(() => {
      markTicketNotificationsAsSeen(selectedTicket.id);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [markTicketNotificationsAsSeen, selectedTicket]);

  useEffect(() => {
    if (chatTextareaRef.current) {
      resizeChatMessageTextarea(chatTextareaRef.current);
    }
  }, [chatMessage, selectedTicketId]);

  useEffect(() => {
    if (closeDescriptionTextareaRef.current) {
      resizeCloseDescriptionTextarea(closeDescriptionTextareaRef.current);
    }
  }, [closeDescription, closeTicketId]);

  useEffect(() => {
    const readStorageKey = getServiceTicketNotificationReadStorageKey(
      currentUser.id,
    );
    const handleNotificationsChanged = () => {
      setNotificationReadVersion((version) => version + 1);
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === readStorageKey) {
        handleNotificationsChanged();
      }
    };

    window.addEventListener(
      SERVICE_TICKET_NOTIFICATION_EVENT,
      handleNotificationsChanged,
    );
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(
        SERVICE_TICKET_NOTIFICATION_EVENT,
        handleNotificationsChanged,
      );
      window.removeEventListener("storage", handleStorage);
    };
  }, [currentUser.id]);

  const filteredTickets = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return tickets
      .filter((ticket) => canSeeTicket(ticket, currentUser))
      .filter((ticket) => {
        if (activeFilter === "open") {
          return ticket.status === "open" && ticket.targetSector === currentUser.sector;
        }
        if (activeFilter === "in_progress") {
          return (
            ticket.status === "in_progress" &&
            ticket.targetSector === currentUser.sector
          );
        }
        if (activeFilter === "assigned_to_me") {
          return (
            ticket.status !== "completed" &&
            ticket.assignedToId === currentUser.id
          );
        }
        if (activeFilter === "opened_by_me") {
          return ticket.requesterId === currentUser.id;
        }
        if (activeFilter === "history") {
          return ticket.status === "completed";
        }

        return true;
      })
      .filter((ticket) => {
        if (coworkerFilter === "all") return true;
        if (coworkerFilter === "me") return ticket.assignedToId === currentUser.id;

        return ticket.assignedToId === coworkerFilter;
      })
      .filter((ticket) =>
        normalizedSearch ? getTicketSearchText(ticket).includes(normalizedSearch) : true,
      )
      .sort(
        (firstTicket, secondTicket) =>
          secondTicket.lastInteractionAt.getTime() -
          firstTicket.lastInteractionAt.getTime(),
      );
  }, [activeFilter, coworkerFilter, currentUser, search, tickets]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredTickets.length / ticketsPageSize),
  );
  const currentPage = Math.min(page, totalPages);
  const paginatedTickets = filteredTickets.slice(
    (currentPage - 1) * ticketsPageSize,
    currentPage * ticketsPageSize,
  );

  useEffect(() => {
    const viewport = ticketListViewportRef.current;
    if (!viewport) return;

    let frameId = 0;
    const calculatePageSize = () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }

      frameId = window.requestAnimationFrame(() => {
        const isDesktopTable = window.matchMedia("(min-width: 1280px)").matches;
        const viewportStyles = window.getComputedStyle(viewport);
        const verticalPadding =
          parseFloat(viewportStyles.paddingTop) +
          parseFloat(viewportStyles.paddingBottom);
        const availableHeight = viewport.clientHeight - verticalPadding;

        if (availableHeight <= 0) return;

        const headerHeight = isDesktopTable
          ? (desktopTicketHeaderRef.current?.getBoundingClientRect().height ??
            TICKETS_DESKTOP_HEADER_HEIGHT)
          : 0;
        const rowElement = isDesktopTable
          ? desktopTicketRowRef.current
          : mobileTicketCardRef.current;
        const rowGap =
          !isDesktopTable && rowElement?.parentElement
            ? parseFloat(
                window.getComputedStyle(rowElement.parentElement).rowGap,
              ) || 0
            : 0;
        const fallbackItemHeight = isDesktopTable
          ? TICKETS_DESKTOP_ROW_HEIGHT
          : TICKETS_MOBILE_CARD_HEIGHT;
        const itemHeight = Math.max(
          1,
          (rowElement?.getBoundingClientRect().height ?? fallbackItemHeight) +
            rowGap,
        );
        const nextPageSize = Math.max(
          1,
          Math.floor((availableHeight - headerHeight) / itemHeight),
        );

        setTicketsPageSize((currentPageSize) =>
          currentPageSize === nextPageSize ? currentPageSize : nextPageSize,
        );
      });
    };

    calculatePageSize();
    window.addEventListener("resize", calculatePageSize);

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(calculatePageSize);

    resizeObserver?.observe(viewport);

    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }

      window.removeEventListener("resize", calculatePageSize);
      resizeObserver?.disconnect();
    };
  }, [filteredTickets.length]);

  const visibleMessages = useMemo(
    () =>
      selectedTicket
        ? selectedTicket.messages.filter((message) =>
            canSeeMessage(message, currentUser),
          ).filter(
            (message) =>
              !isTicketOpeningDescriptionMessage(selectedTicket, message),
          )
        : [],
    [currentUser, selectedTicket],
  );

  const registerMessageElement = useCallback(
    (messageId: string) => (node: HTMLDivElement | null) => {
      if (node) {
        messageElementRefs.current.set(messageId, node);
        return;
      }

      messageElementRefs.current.delete(messageId);
    },
    [],
  );

  useEffect(() => {
    if (!selectedTicket || visibleMessages.length === 0) return;

    const viewport = chatMessagesViewportRef.current;
    const messageIds = visibleMessages.map((message) => message.id);

    if (!viewport || typeof IntersectionObserver === "undefined") {
      markTicketMessagesAsSeen(selectedTicket, messageIds);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const viewedMessageIds = entries
          .filter((entry) => entry.isIntersecting)
          .map((entry) => entry.target.getAttribute("data-ticket-message-id"))
          .filter((messageId): messageId is string => Boolean(messageId));

        if (viewedMessageIds.length > 0) {
          markTicketMessagesAsSeen(selectedTicket, viewedMessageIds);
        }
      },
      {
        root: viewport,
        threshold: 0.35,
      },
    );

    messageIds.forEach((messageId) => {
      const element = messageElementRefs.current.get(messageId);

      if (element) {
        observer.observe(element);
      }
    });

    return () => observer.disconnect();
  }, [markTicketMessagesAsSeen, selectedTicket, visibleMessages]);

  const canCloseTicketAction = (ticket: ServiceTicket) =>
    ticket.status !== "completed" &&
    (ticket.assignedToId === currentUser.id || ticket.requesterId === currentUser.id);

  const canTransferTicketAction = (ticket: ServiceTicket) =>
    ticket.status !== "completed" &&
    (ticket.assignedToId === currentUser.id ||
      ticket.targetSector === currentUser.sector ||
      ticket.requesterId === currentUser.id);

  const canTakeTicketAction = (ticket: ServiceTicket) =>
    ticket.status !== "completed" &&
    ticket.targetSector === currentUser.sector &&
    ticket.assignedToId !== currentUser.id;

  const canReopenTicketAction = (ticket: ServiceTicket) =>
    ticket.status === "completed" && ticket.requesterId === currentUser.id;

  const canTakeSelectedTicket =
    selectedTicket !== null && canTakeTicketAction(selectedTicket);
  const canCloseSelectedTicket =
    selectedTicket !== null && canCloseTicketAction(selectedTicket);
  const canTransferSelectedTicket =
    selectedTicket !== null && canTransferTicketAction(selectedTicket);
  const canReopenSelectedTicket =
    selectedTicket !== null && canReopenTicketAction(selectedTicket);
  const canChatInSelectedTicket = selectedTicket?.status !== "completed";
  const canSendInternalMessage =
    selectedTicket !== null &&
    selectedTicket.status !== "completed" &&
    (selectedTicket.targetSector === currentUser.sector ||
      selectedTicket.assignedToId === currentUser.id);

  const clearChatDraft = (revokeAttachments = true) => {
    if (revokeAttachments) {
      chatAttachments.forEach((attachment) => URL.revokeObjectURL(attachment.url));
    }

    setChatMessage("");
    setChatAttachments([]);
    setIsInternalMessage(false);

    if (chatFileInputRef.current) {
      chatFileInputRef.current.value = "";
    }
  };

  const closeTicketChat = () => {
    setSelectedTicketId(null);
    clearChatDraft();
  };

  const resetCreateForm = () => {
    createAttachments.forEach((attachment) => URL.revokeObjectURL(attachment.url));
    setCreateTitle("");
    setCreateDescription("");
    setCreateTargetSector(getDefaultTargetSector(currentUser.sector));
    setCreatePriority("normal");
    setCreateAttachments([]);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const createAttachmentFromFile = (file: File): ServiceTicketAttachment => ({
    id: createId("ticket-attachment"),
    name: file.name,
    size: file.size,
    kind: getAttachmentKind(file),
    url: URL.createObjectURL(file),
    extension: getFileExtension(file.name),
  });

  const handleAttachmentChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;

    const { acceptedFiles: filesWithinLimit, rejectedFiles } =
      splitFilesByUploadSize(files);

    if (rejectedFiles.length > 0) {
      toast.error("Arquivo acima de 16 MB.", {
        description: getUploadSizeLimitMessage(rejectedFiles.length),
      });
    }

    if (filesWithinLimit.length === 0) {
      event.target.value = "";
      return;
    }

    const availableSlots = MAX_TICKET_ATTACHMENTS - createAttachments.length;
    const acceptedFiles = filesWithinLimit.slice(0, availableSlots);

    if (acceptedFiles.length < filesWithinLimit.length) {
      toast.warning("Alguns anexos não foram adicionados.", {
        description: "É possível adicionar até 3 anexos por atendimento.",
      });
    }

    setCreateAttachments((currentAttachments) => [
      ...currentAttachments,
      ...acceptedFiles.map(createAttachmentFromFile),
    ]);
    event.target.value = "";
  };

  const removeCreateAttachment = (attachmentId: string) => {
    setCreateAttachments((currentAttachments) => {
      const removedAttachment = currentAttachments.find(
        (attachment) => attachment.id === attachmentId,
      );

      if (removedAttachment) URL.revokeObjectURL(removedAttachment.url);

      return currentAttachments.filter(
        (attachment) => attachment.id !== attachmentId,
      );
    });
  };

  const handleChatAttachmentChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;

    const { acceptedFiles: filesWithinLimit, rejectedFiles } =
      splitFilesByUploadSize(files);

    if (rejectedFiles.length > 0) {
      toast.error("Arquivo acima de 16 MB.", {
        description: getUploadSizeLimitMessage(rejectedFiles.length),
      });
    }

    if (filesWithinLimit.length === 0) {
      event.target.value = "";
      return;
    }

    const availableSlots =
      MAX_TICKET_MESSAGE_ATTACHMENTS - chatAttachments.length;
    const acceptedFiles = filesWithinLimit.slice(0, Math.max(availableSlots, 0));

    if (availableSlots <= 0 || acceptedFiles.length < filesWithinLimit.length) {
      toast.warning("Alguns anexos não foram adicionados.", {
        description: "É possível adicionar até 3 anexos por mensagem.",
      });
    }

    if (acceptedFiles.length > 0) {
      setChatAttachments((currentAttachments) => [
        ...currentAttachments,
        ...acceptedFiles.map(createAttachmentFromFile),
      ]);
    }

    event.target.value = "";
  };

  const removeChatAttachment = (attachmentId: string) => {
    setChatAttachments((currentAttachments) => {
      const removedAttachment = currentAttachments.find(
        (attachment) => attachment.id === attachmentId,
      );

      if (removedAttachment) URL.revokeObjectURL(removedAttachment.url);

      return currentAttachments.filter(
        (attachment) => attachment.id !== attachmentId,
      );
    });
  };

  const handleCloseAttachmentChange = (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;

    const { acceptedFiles: filesWithinLimit, rejectedFiles } =
      splitFilesByUploadSize(files);

    if (rejectedFiles.length > 0) {
      toast.error("Arquivo acima de 16 MB.", {
        description: getUploadSizeLimitMessage(rejectedFiles.length),
      });
    }

    if (filesWithinLimit.length === 0) {
      event.target.value = "";
      return;
    }

    const availableSlots = MAX_TICKET_ATTACHMENTS - closeAttachments.length;
    const acceptedFiles = filesWithinLimit.slice(0, Math.max(availableSlots, 0));

    if (availableSlots <= 0 || acceptedFiles.length < filesWithinLimit.length) {
      toast.warning("Alguns anexos não foram adicionados.", {
        description: "É possível adicionar até 3 anexos no encerramento.",
      });
    }

    if (acceptedFiles.length > 0) {
      setCloseAttachments((currentAttachments) => [
        ...currentAttachments,
        ...acceptedFiles.map(createAttachmentFromFile),
      ]);
    }

    event.target.value = "";
  };

  const removeCloseAttachment = (attachmentId: string) => {
    setCloseAttachments((currentAttachments) => {
      const removedAttachment = currentAttachments.find(
        (attachment) => attachment.id === attachmentId,
      );

      if (removedAttachment) URL.revokeObjectURL(removedAttachment.url);

      return currentAttachments.filter(
        (attachment) => attachment.id !== attachmentId,
      );
    });
  };

  const clearCloseDraft = (revokeAttachments = true) => {
    if (revokeAttachments) {
      closeAttachments.forEach((attachment) => URL.revokeObjectURL(attachment.url));
    }

    setCloseDescription("");
    setCloseAttachments([]);

    if (closeFileInputRef.current) {
      closeFileInputRef.current.value = "";
    }
  };

  const handleCreateTicket = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const title = createTitle.trim();
    const description = createDescription.trim();

    if (!title) {
      toast.error("Informe o título do atendimento.");
      return;
    }

    if (!description) {
      toast.error("Informe a descrição do atendimento.");
      return;
    }

    const now = new Date();
    const ticketId = createId("ticket");
    const systemMessage = createSystemTicketMessage(
      createId("ticket-message"),
      `Chamado aberto para a fila do setor ${createTargetSector}.`,
      currentUser,
      now,
    );
    systemMessage.attachments =
      createAttachments.length > 0 ? [...createAttachments] : undefined;

    const newTicket: ServiceTicket = {
      id: ticketId,
      title,
      description,
      requesterId: currentUser.id,
      requesterName: currentUser.name,
      requesterSector: currentUser.sector,
      targetSector: createTargetSector,
      priority: createPriority,
      status: "open",
      createdAt: now,
      updatedAt: now,
      lastInteractionAt: now,
      attachments: createAttachments,
      messages: [systemMessage],
      transfers: [],
    };

    onCreateTicket(newTicket);
    openTicketChat(ticketId);
    setIsCreateDialogOpen(false);
    setCreateTitle("");
    setCreateDescription("");
    setCreateTargetSector(getDefaultTargetSector(currentUser.sector));
    setCreatePriority("normal");
    setCreateAttachments([]);
    toast.success("Atendimento aberto.");
  };

  const updateTicketWithMessage = (
    ticket: ServiceTicket,
    message: ServiceTicketMessage,
    patch: Partial<ServiceTicket> = {},
  ) => {
    const now = message.createdAt;

    onUpdateTicket({
      ...ticket,
      ...patch,
      messages: [...ticket.messages, message],
      updatedAt: now,
      lastInteractionAt: now,
    });
  };

  const handleTakeTicket = (ticketToTake = selectedTicket) => {
    if (!ticketToTake) return;

    const now = new Date();
    const previousAssignedToName = ticketToTake.assignedToName;
    const message = createSystemTicketMessage(
      createId("ticket-message"),
      previousAssignedToName
        ? `Chamado transferido de ${previousAssignedToName} para ${currentUser.name}.`
        : `${currentUser.name} assumiu o atendimento.`,
      currentUser,
      now,
    );

    updateTicketWithMessage(ticketToTake, message, {
      status: "in_progress",
      assignedToId: currentUser.id,
      assignedToName: currentUser.name,
      assignedToSector: currentUser.sector,
      transfers: previousAssignedToName
        ? [
            ...ticketToTake.transfers,
            {
              id: createId("ticket-transfer"),
              createdAt: now,
              fromSector: ticketToTake.targetSector,
              toSector: currentUser.sector,
              transferredById: currentUser.id,
              transferredByName: currentUser.name,
              assignedToId: currentUser.id,
              assignedToName: currentUser.name,
            },
          ]
        : ticketToTake.transfers,
    });
    toast.success("Atendimento assumido.");
  };

  const handleSendChatMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedTicket || selectedTicket.status === "completed") return;

    const content = chatMessage.trim();
    if (!content && chatAttachments.length === 0) return;

    const now = new Date();
    const message: ServiceTicketMessage = {
      id: createId("ticket-message"),
      authorId: currentUser.id,
      authorName: currentUser.name,
      authorSector: currentUser.sector,
      content,
      createdAt: now,
      attachments:
        chatAttachments.length > 0 ? [...chatAttachments] : undefined,
      isInternal: isInternalMessage && canSendInternalMessage,
    };

    updateTicketWithMessage(selectedTicket, message);
    clearChatDraft(false);
  };

  const openCloseDialog = (ticket: ServiceTicket) => {
    setCloseTicketId(ticket.id);
    clearCloseDraft();
  };

  const handleCloseTicket = () => {
    if (!closeTicket) return;

    const description = closeDescription.trim();

    if (!description) {
      toast.error("Informe a descrição do encerramento.");
      return;
    }

    const now = new Date();
    const message = createSystemTicketMessage(
      createId("ticket-message"),
      `Chamado encerrado por ${currentUser.name}. ${description}`,
      currentUser,
      now,
    );
    message.attachments =
      closeAttachments.length > 0 ? [...closeAttachments] : undefined;

    updateTicketWithMessage(closeTicket, message, {
      status: "completed",
      closedAt: now,
      closedById: currentUser.id,
      closedByName: currentUser.name,
      closeDescription: description,
    });
    setCloseTicketId(null);
    clearCloseDraft(false);
    toast.success("Atendimento encerrado.");
  };

  const openReopenDialog = (ticket: ServiceTicket) => {
    setReopenTicketId(ticket.id);
    setReopenReason("");
  };

  const handleReopenTicket = () => {
    if (!reopenTicket) return;

    const reason = reopenReason.trim();

    if (!reason) {
      toast.error("Informe o motivo da reabertura.");
      return;
    }

    const now = new Date();
    const message = createSystemTicketMessage(
      createId("ticket-message"),
      `Chamado reaberto por ${currentUser.name}. Motivo: ${reason}`,
      currentUser,
      now,
    );

    updateTicketWithMessage(reopenTicket, message, {
      status: "open",
      assignedToId: undefined,
      assignedToName: undefined,
      assignedToSector: undefined,
      reopenedAt: now,
      reopenedById: currentUser.id,
      reopenedByName: currentUser.name,
      reopenReason: reason,
    });
    setReopenTicketId(null);
    setReopenReason("");
    toast.success("Atendimento reaberto.");
  };

  const openTransferDialog = (ticket: ServiceTicket) => {
    setTransferTicketId(ticket.id);
    setTransferMode("sector");
    setTransferSector(getDefaultTargetSector(ticket.targetSector));
    setTransferUserId(transferUsers[0]?.id ?? "");
  };

  const runTicketActionAfterMenuClose = (action: () => void) => {
    setOpenActionMenuTicketId(null);

    if (actionMenuDialogTimeoutRef.current !== null) {
      window.clearTimeout(actionMenuDialogTimeoutRef.current);
    }

    actionMenuDialogTimeoutRef.current = window.setTimeout(() => {
      actionMenuDialogTimeoutRef.current = null;
      window.requestAnimationFrame(action);
    }, 120);
  };

  const openTransferDialogFromMenu = (ticket: ServiceTicket) => {
    runTicketActionAfterMenuClose(() => openTransferDialog(ticket));
  };

  const openCloseDialogFromMenu = (ticket: ServiceTicket) => {
    runTicketActionAfterMenuClose(() => openCloseDialog(ticket));
  };

  const openReopenDialogFromMenu = (ticket: ServiceTicket) => {
    runTicketActionAfterMenuClose(() => openReopenDialog(ticket));
  };

  const takeTicketFromMenu = (ticket: ServiceTicket) => {
    runTicketActionAfterMenuClose(() => handleTakeTicket(ticket));
  };

  const handleTransferTicket = () => {
    if (!transferTicket) return;

    const now = new Date();

    if (transferMode === "sector") {
      if (!transferSector) {
        toast.error("Selecione o setor de destino.");
        return;
      }

      const message = createSystemTicketMessage(
        createId("ticket-message"),
        `Chamado transferido de ${transferTicket.targetSector} para ${transferSector} por ${currentUser.name}.`,
        currentUser,
        now,
      );

      updateTicketWithMessage(transferTicket, message, {
        status: "open",
        targetSector: transferSector,
        assignedToId: undefined,
        assignedToName: undefined,
        assignedToSector: undefined,
        transfers: [
          ...transferTicket.transfers,
          {
            id: createId("ticket-transfer"),
            createdAt: now,
            fromSector: transferTicket.targetSector,
            toSector: transferSector,
            transferredById: currentUser.id,
            transferredByName: currentUser.name,
          },
        ],
      });
    } else {
      const targetUser = users.find(
        (user) => user.id === selectedTransferUserId,
      );

      if (!targetUser) {
        toast.error("Selecione o colega que vai receber o atendimento.");
        return;
      }

      if (targetUser.sector !== currentUser.sector) {
        toast.error("Selecione um colega do seu setor.");
        return;
      }

      const message = createSystemTicketMessage(
        createId("ticket-message"),
        `Chamado transferido para ${targetUser.name} por ${currentUser.name}.`,
        currentUser,
        now,
      );

      updateTicketWithMessage(transferTicket, message, {
        status: "in_progress",
        targetSector: targetUser.sector,
        assignedToId: targetUser.id,
        assignedToName: targetUser.name,
        assignedToSector: targetUser.sector,
        transfers: [
          ...transferTicket.transfers,
          {
            id: createId("ticket-transfer"),
            createdAt: now,
            fromSector: transferTicket.targetSector,
            toSector: targetUser.sector,
            transferredById: currentUser.id,
            transferredByName: currentUser.name,
            assignedToId: targetUser.id,
            assignedToName: targetUser.name,
          },
        ],
      });
    }

    setTransferTicketId(null);
    toast.success("Atendimento transferido.");
  };

  const chatView = selectedTicket ? (
    <section className="flex h-full min-w-0 flex-1 flex-col overflow-hidden rounded-lg border bg-background">
      <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b bg-background px-4">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-muted-foreground"
            onClick={closeTicketChat}
            aria-label="Voltar para atendimentos"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold">
              {selectedTicket.title}
            </h1>
            <p className="truncate text-xs text-muted-foreground">
              Chamado #{selectedTicket.id.slice(-8)}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden flex-wrap justify-end gap-2 sm:flex">
            <Badge variant={getStatusVariant(selectedTicket.status)}>
              {getServiceTicketStatusLabel(selectedTicket.status)}
            </Badge>
            <Badge variant={getPriorityVariant(selectedTicket.priority)}>
              {getServiceTicketPriorityLabel(selectedTicket.priority)}
            </Badge>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={() => setIsTicketDetailsOpen((open) => !open)}
            aria-label={
              isTicketDetailsOpen ? "Fechar informações" : "Abrir informações"
            }
            title={
              isTicketDetailsOpen ? "Fechar informações" : "Abrir informações"
            }
          >
            {isTicketDetailsOpen ? (
              <PanelRightClose className="h-4 w-4" />
            ) : (
              <PanelRightOpen className="h-4 w-4" />
            )}
          </Button>
        </div>
      </header>

      <div
        className={`grid min-h-0 flex-1 gap-3 p-3 md:p-4 ${
          isTicketDetailsOpen
            ? "lg:grid-cols-[minmax(0,1fr)_22rem]"
            : "lg:grid-cols-[minmax(0,1fr)]"
        }`}
      >
        <div className="flex min-h-[28rem] min-w-0 flex-col overflow-hidden rounded-lg border bg-card">
          <div className="flex items-center justify-between gap-3 border-b bg-background px-3 py-2">
            <div>
              <h2 className="font-semibold">Chat do chamado</h2>
              <p className="text-xs text-muted-foreground">
                Mensagens internas aparecem só para o setor que escreveu.
              </p>
            </div>
            <MessageCircle className="h-5 w-5 text-muted-foreground" />
          </div>

          <div
            ref={chatMessagesViewportRef}
            className="thin-gray-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto p-3"
          >
            {visibleMessages.map((message) => {
              const isOwnMessage =
                message.authorId === currentUser.id && !message.isSystem;
              const isHighlightedSystemMessage =
                isHighlightedTicketSystemMessage(message);
              const isOpeningSystemMessage =
                isTicketOpeningSystemMessage(message);
              const messageDateTime = formatServiceTicketDateTime(
                message.createdAt,
              );
              const messageBubbleClass = isHighlightedSystemMessage
                ? "mx-auto w-full max-w-[min(92%,42rem)] border-primary/45 bg-primary/10 shadow-sm shadow-primary/10"
                : message.isSystem
                  ? "mx-auto w-fit max-w-[min(92%,34rem)] bg-muted/45"
                  : isOwnMessage
                    ? "ml-auto w-fit max-w-[min(84%,28rem)] bg-primary/10 md:max-w-[min(46%,30rem)]"
                    : "mr-auto w-fit max-w-[min(84%,28rem)] bg-card md:max-w-[min(46%,30rem)]";
              const messageAttachments = isOpeningSystemMessage
                ? message.attachments && message.attachments.length > 0
                  ? message.attachments
                  : selectedTicket.attachments
                : message.attachments ?? [];

              return (
                <div
                  key={message.id}
                  ref={registerMessageElement(message.id)}
                  data-ticket-message-id={message.id}
                  className={`min-w-0 break-words rounded-lg border px-3 py-2 [overflow-wrap:anywhere] [word-break:break-word] ${messageBubbleClass}`}
                >
                  {isHighlightedSystemMessage && (
                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-primary">
                      <CheckCircle2 className="h-4 w-4" />
                      Atualização do chamado
                    </div>
                  )}
                  <div
                    className={`mb-1 flex flex-wrap items-center gap-2 text-xs ${
                      isHighlightedSystemMessage
                        ? "text-primary/85"
                        : "text-muted-foreground"
                    } ${message.isSystem ? "justify-center text-center" : ""}`}
                  >
                    <span className="font-medium text-foreground">
                      {message.authorName}
                    </span>
                    <span>{message.authorSector}</span>
                    {message.isSystem && <span>{messageDateTime}</span>}
                    {message.isInternal && (
                      <Badge variant="secondary">
                        <Lock className="mr-1 h-3 w-3" />
                        Interna
                      </Badge>
                    )}
                  </div>
                  {message.content.trim() && (
                    <p
                      className={`max-w-full whitespace-pre-wrap break-words text-sm leading-6 [overflow-wrap:anywhere] [word-break:break-word] ${
                        isHighlightedSystemMessage ? "font-semibold" : ""
                      }`}
                    >
                      {message.content}
                    </p>
                  )}
                  {isOpeningSystemMessage && (
                    <div className="mt-3 grid min-w-0 max-w-full gap-2 overflow-hidden rounded-md border border-primary/20 bg-background/80 p-3">
                      <p className="max-w-full whitespace-pre-wrap break-words text-sm font-semibold leading-6 text-foreground [overflow-wrap:anywhere] [word-break:break-word]">
                        {selectedTicket.title}
                      </p>
                      <p className="max-w-full whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere] [word-break:break-word]">
                        {selectedTicket.description}
                      </p>
                    </div>
                  )}
                  {messageAttachments.length > 0 && (
                    <div
                      className={
                        message.isSystem
                          ? "mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3"
                          : "mt-2 flex max-w-full flex-col gap-2"
                      }
                    >
                      {messageAttachments.map((attachment) => (
                        <AttachmentPreview
                          key={attachment.id}
                          attachment={attachment}
                          onOpen={() => setFullscreenAttachment(attachment)}
                          variant={message.isSystem ? "compact" : "message"}
                        />
                      ))}
                    </div>
                  )}
                  {!message.isSystem && (
                    <div className="mt-1 flex justify-end text-[0.6875rem] leading-none text-muted-foreground">
                      {messageDateTime}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {canChatInSelectedTicket ? (
            <form
              className="grid gap-2 border-t bg-card p-3"
              onSubmit={handleSendChatMessage}
            >
              {canSendInternalMessage && (
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Checkbox
                    checked={isInternalMessage}
                    onCheckedChange={(checked) =>
                      setIsInternalMessage(Boolean(checked))
                    }
                  />
                  Mensagem interna do meu setor
                </label>
              )}
              <input
                ref={chatFileInputRef}
                type="file"
                multiple
                accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
                className="hidden"
                onChange={handleChatAttachmentChange}
              />
              {chatAttachments.length > 0 && (
                <div className="grid gap-2 sm:grid-cols-3">
                  {chatAttachments.map((attachment) => (
                    <AttachmentPreview
                      key={attachment.id}
                      attachment={attachment}
                      onOpen={() => setFullscreenAttachment(attachment)}
                      onRemove={() => removeChatAttachment(attachment.id)}
                    />
                  ))}
                </div>
              )}
              <div className="flex items-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon-lg"
                  className="mb-0.5 h-10 w-10 shrink-0"
                  disabled={
                    chatAttachments.length >= MAX_TICKET_MESSAGE_ATTACHMENTS
                  }
                  onClick={() => chatFileInputRef.current?.click()}
                  aria-label="Adicionar anexo ao chat"
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
                <Textarea
                  ref={chatTextareaRef}
                  value={chatMessage}
                  onChange={(event) => {
                    setChatMessage(event.target.value);
                    resizeChatMessageTextarea(event.currentTarget);
                  }}
                  wrap="soft"
                  rows={1}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                  className="thin-gray-scrollbar h-10 min-h-10 flex-1 resize-none overflow-hidden whitespace-pre-wrap break-words bg-muted py-2 leading-5 [field-sizing:fixed] [overflow-wrap:anywhere] [word-break:break-word]"
                  placeholder="Digite uma mensagem no chamado"
                />
                <Button
                  type="submit"
                  size="icon-lg"
                  className="mb-0.5 h-10 w-10 shrink-0"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </form>
          ) : (
            <div className="border-t bg-muted/50 px-3 py-3 text-sm text-muted-foreground">
              Este chamado está concluído. O chat está bloqueado para novas
              mensagens.
            </div>
          )}
        </div>

        {isTicketDetailsOpen && (
        <aside className="thin-gray-scrollbar min-h-0 overflow-y-auto rounded-lg border bg-card p-3">
          <div className="grid gap-3 text-sm">
            <div className="flex flex-wrap gap-2 sm:hidden">
              <Badge variant={getStatusVariant(selectedTicket.status)}>
                {getServiceTicketStatusLabel(selectedTicket.status)}
              </Badge>
              <Badge variant={getPriorityVariant(selectedTicket.priority)}>
                {getServiceTicketPriorityLabel(selectedTicket.priority)}
              </Badge>
            </div>
            <div>
              <h3 className="font-semibold">Informações</h3>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="justify-start text-muted-foreground"
              onClick={() => setIsTicketDetailsOpen(false)}
            >
              <PanelRightClose className="mr-1 h-4 w-4" />
              Fechar informações
            </Button>
            <div className="grid gap-2 rounded-lg border bg-background p-3">
              <span className="flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-muted-foreground" />
                Aberto por {selectedTicket.requesterName}
              </span>
              <span className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                {selectedTicket.requesterSector} → {selectedTicket.targetSector}
              </span>
              <span className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                {formatServiceTicketDateTime(selectedTicket.createdAt)}
              </span>
              {selectedTicket.assignedToName && (
                <span className="flex items-center gap-2">
                  <Headphones className="h-4 w-4 text-muted-foreground" />
                  Atendendo: {selectedTicket.assignedToName}
                </span>
              )}
            </div>

            <div className="grid gap-2">
              {canTakeSelectedTicket && (
                <Button type="button" onClick={() => handleTakeTicket()}>
                  <Headphones className="mr-1 h-4 w-4" />
                  Pegar atendimento
                </Button>
              )}
              {canTransferSelectedTicket && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => openTransferDialog(selectedTicket)}
                >
                  <ArrowRightLeft className="mr-1 h-4 w-4" />
                  Transferir
                </Button>
              )}
              {canCloseSelectedTicket && (
                <Button type="button" onClick={() => openCloseDialog(selectedTicket)}>
                  <CheckCircle2 className="mr-1 h-4 w-4" />
                  Encerrar chamado
                </Button>
              )}
              {canReopenSelectedTicket && (
                <Button type="button" onClick={() => openReopenDialog(selectedTicket)}>
                  <RotateCcw className="mr-1 h-4 w-4" />
                  Reabrir chamado
                </Button>
              )}
            </div>
          </div>
        </aside>
        )}
      </div>
    </section>
  ) : null;

  return (
    <>
      <AttachmentFullscreenDialog
        attachment={fullscreenAttachment}
        onOpenChange={(open) => {
          if (!open) setFullscreenAttachment(null);
        }}
      />
      {chatView ?? (
        <section className="flex h-full min-w-0 flex-1 flex-col overflow-hidden rounded-lg border bg-background">
      <div className="flex shrink-0 flex-col gap-3 border-b bg-background p-3 md:flex-row md:items-center">
        <div className="relative w-full md:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Buscar por título, setor, solicitante ou responsável"
            className="h-9 bg-muted pl-10"
          />
        </div>
        <Select
          value={activeFilter}
          onValueChange={(value) => {
            setActiveFilter(value as TicketListFilter);
            setPage(1);
          }}
        >
          <SelectTrigger className="h-9 w-full bg-muted md:w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent
            align="start"
            avoidCollisions={false}
            position="popper"
            side="bottom"
          >
            {ticketFilterOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={coworkerFilter}
          onValueChange={(value) => {
            setCoworkerFilter(value);
            setPage(1);
          }}
        >
          <SelectTrigger className="h-9 w-full bg-muted md:w-64">
            <SelectValue placeholder="Filtrar responsável" />
          </SelectTrigger>
          <SelectContent
            align="start"
            avoidCollisions={false}
            position="popper"
            side="bottom"
          >
            <SelectItem value="all">Todos os responsáveis</SelectItem>
            <SelectItem value="me">Estou atendendo</SelectItem>
            {sameSectorUsers
              .filter((user) => user.id !== currentUser.id)
              .map((user) => (
                <SelectItem key={user.id} value={user.id}>
                  {user.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <Button
          className="w-full md:ml-auto md:w-auto"
          onClick={() => setIsCreateDialogOpen(true)}
        >
          <Plus className="mr-1 h-4 w-4" />
          Abrir chamado
        </Button>
      </div>

      <div
        ref={ticketListViewportRef}
        className="thin-gray-scrollbar min-h-0 flex-1 overflow-y-auto p-3 md:p-4"
      >
        {paginatedTickets.length === 0 ? (
          <div className="flex min-h-96 flex-col items-center justify-center rounded-lg border bg-card p-6 text-center">
            <Headphones className="h-12 w-12 text-muted-foreground" />
            <h2 className="mt-4 text-lg font-semibold">
              Nenhum atendimento encontrado
            </h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              Ajuste os filtros ou abra um novo chamado para outro setor.
            </p>
          </div>
        ) : (
          <>
          <div className="grid gap-3 xl:hidden">
            {paginatedTickets.map((ticket, ticketIndex) => {
              const notificationCount =
                ticketNotificationSnapshot.unreadByTicket[ticket.id] ?? 0;

              return (
              <article
                key={ticket.id}
                ref={ticketIndex === 0 ? mobileTicketCardRef : undefined}
                className="flex min-w-0 flex-col gap-3 rounded-lg border bg-card p-3"
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Headphones className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="min-w-0 flex-1 break-words font-semibold">
                        {ticket.title}
                      </h2>
                      <TicketNotificationBadge count={notificationCount} />
                      <Badge variant={getStatusVariant(ticket.status)}>
                        {getServiceTicketStatusLabel(ticket.status)}
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="grid gap-2 rounded-lg border bg-background p-3 text-sm">
                  <div className="grid gap-1 sm:grid-cols-2">
                    <span>
                      <strong>Aberto por:</strong> {ticket.requesterName}
                    </span>
                    <span>
                      <strong>Setor:</strong> {ticket.requesterSector}
                    </span>
                    <span>
                      <strong>Recebeu:</strong> {ticket.targetSector}
                    </span>
                    <span>
                      <strong>Aberto em:</strong>{" "}
                      {formatServiceTicketDateTime(ticket.createdAt)}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={getPriorityVariant(ticket.priority)}>
                      {getServiceTicketPriorityLabel(ticket.priority)}
                    </Badge>
                    {ticket.assignedToName && (
                      <Badge variant="outline">
                        Atendendo: {ticket.assignedToName}
                      </Badge>
                    )}
                    <Badge variant="secondary">
                      Última interação{" "}
                      {formatServiceTicketDateTime(ticket.lastInteractionAt)}
                    </Badge>
                  </div>
                </div>

                <Button
                  type="button"
                  className="mt-auto"
                  onClick={() => openTicketChat(ticket.id)}
                >
                  <MessageCircle className="mr-1 h-4 w-4" />
                  Abrir chat do chamado
                </Button>
              </article>
              );
            })}
          </div>
          <div className="hidden overflow-hidden rounded-lg border bg-card xl:block">
            <div
              ref={desktopTicketHeaderRef}
              className="grid grid-cols-[minmax(7rem,.6fr)_minmax(9rem,.75fr)_minmax(16rem,1.4fr)_minmax(6rem,.55fr)_minmax(6rem,.55fr)_minmax(7rem,.6fr)_minmax(7rem,.6fr)_minmax(9rem,.75fr)_minmax(10rem,.8fr)_4rem] gap-3 border-b bg-muted/35 px-3 py-2 text-xs font-semibold text-muted-foreground"
            >
              <span>Atendimento</span>
              <span>Solicitante</span>
              <span>Título</span>
              <span>Setor</span>
              <span>Recebeu</span>
              <span>Status</span>
              <span>Prioridade</span>
              <span>Responsável</span>
              <span>Datas</span>
              <span>Ações</span>
            </div>
            <div className="divide-y">
              {paginatedTickets.map((ticket, ticketIndex) => {
                const canTake = canTakeTicketAction(ticket);
                const canTransfer = canTransferTicketAction(ticket);
                const canClose = canCloseTicketAction(ticket);
                const canReopen = canReopenTicketAction(ticket);
                const notificationCount =
                  ticketNotificationSnapshot.unreadByTicket[ticket.id] ?? 0;
                const openedDate = formatServiceTicketOpenedDate(ticket.createdAt);

                return (
                  <article
                    key={ticket.id}
                    ref={ticketIndex === 0 ? desktopTicketRowRef : undefined}
                    role="button"
                    tabIndex={0}
                    className="grid cursor-pointer grid-cols-[minmax(7rem,.6fr)_minmax(9rem,.75fr)_minmax(16rem,1.4fr)_minmax(6rem,.55fr)_minmax(6rem,.55fr)_minmax(7rem,.6fr)_minmax(7rem,.6fr)_minmax(9rem,.75fr)_minmax(10rem,.8fr)_4rem] items-center gap-3 px-3 py-3 transition-colors hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => openTicketChat(ticket.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openTicketChat(ticket.id);
                      }
                    }}
                  >
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <p className="truncate text-sm font-semibold">
                          {getTicketDisplayNumber(ticket)}
                        </p>
                        <TicketNotificationBadge count={notificationCount} />
                      </div>
                    </div>

                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {ticket.requesterName}
                      </p>
                    </div>

                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{ticket.title}</p>
                    </div>

                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {ticket.requesterSector}
                      </p>
                    </div>

                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {ticket.targetSector}
                      </p>
                    </div>

                    <div className="min-w-0">
                      <Badge variant={getStatusVariant(ticket.status)}>
                        {getServiceTicketStatusLabel(ticket.status)}
                      </Badge>
                    </div>

                    <div className="min-w-0">
                      <Badge variant={getPriorityVariant(ticket.priority)}>
                        {getServiceTicketPriorityLabel(ticket.priority)}
                      </Badge>
                    </div>

                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {ticket.assignedToName ?? "Fila do setor"}
                      </p>
                    </div>

                    <div className="min-w-0">
                      <div className="grid gap-0.5 text-xs font-semibold tabular-nums">
                        <span>{openedDate.date}</span>
                        <span>{openedDate.time}</span>
                      </div>
                      <p className="hidden">
                        Última {formatServiceTicketDateTime(ticket.lastInteractionAt)}
                      </p>
                    </div>

                    <div className="min-w-0">
                      <DropdownMenu
                        open={openActionMenuTicketId === ticket.id}
                        onOpenChange={(open) =>
                          setOpenActionMenuTicketId(open ? ticket.id : null)
                        }
                      >
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="outline"
                            onClick={(event) => event.stopPropagation()}
                            aria-label="Abrir ações do chamado"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="w-44"
                          onClick={(event) => event.stopPropagation()}
                          onCloseAutoFocus={(event) => event.preventDefault()}
                          onKeyDown={(event) => event.stopPropagation()}
                        >
                          {canTake && (
                            <DropdownMenuItem
                              onSelect={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                takeTicketFromMenu(ticket);
                              }}
                            >
                              <Headphones className="h-4 w-4" />
                              Pegar para mim
                            </DropdownMenuItem>
                          )}
                          {canTransfer && (
                            <DropdownMenuItem
                              onSelect={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                openTransferDialogFromMenu(ticket);
                              }}
                            >
                              <ArrowRightLeft className="h-4 w-4" />
                              Transferir
                            </DropdownMenuItem>
                          )}
                          {canClose && (
                            <DropdownMenuItem
                              onSelect={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                openCloseDialogFromMenu(ticket);
                              }}
                            >
                              <CheckCircle2 className="h-4 w-4" />
                              Encerrar
                            </DropdownMenuItem>
                          )}
                          {canReopen && (
                            <DropdownMenuItem
                              onSelect={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                openReopenDialogFromMenu(ticket);
                              }}
                            >
                              <RotateCcw className="h-4 w-4" />
                              Reabrir
                            </DropdownMenuItem>
                          )}
                          {!canTake && !canTransfer && !canClose && !canReopen && (
                            <DropdownMenuItem disabled>
                              Sem ações disponíveis
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
          </>
        )}
      </div>

      {totalPages > 1 && (
        <PagePagination
          page={currentPage}
          totalPages={totalPages}
          onPageChange={setPage}
          className="shrink-0 bg-card"
        />
      )}

        </section>
      )}

      <Dialog
        modal={false}
        open={isCreateDialogOpen}
        onOpenChange={(open) => {
          setIsCreateDialogOpen(open);
          if (!open) resetCreateForm();
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Abrir atendimento</DialogTitle>
            <DialogDescription className="sr-only">
              Informe título, descrição, setor, prioridade e anexos para abrir
              um novo atendimento.
            </DialogDescription>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={handleCreateTicket}>
            <div className="grid gap-2">
              <Label htmlFor="ticket-title">Título</Label>
              <Input
                id="ticket-title"
                value={createTitle}
                onChange={(event) => setCreateTitle(event.target.value)}
                className="h-10 bg-muted"
                placeholder="Ex: Problema no notebook"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ticket-description">Descrição</Label>
              <Textarea
                id="ticket-description"
                value={createDescription}
                onChange={(event) => setCreateDescription(event.target.value)}
                wrap="soft"
                rows={5}
                className="thin-gray-scrollbar h-28 max-h-28 resize-none overflow-y-auto whitespace-pre-wrap break-words bg-muted leading-6 [field-sizing:fixed] [overflow-wrap:anywhere]"
                placeholder="Explique o problema ou necessidade"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Setor responsável</Label>
                <SectorCombobox
                  value={createTargetSector}
                  onValueChange={(value) => setCreateTargetSector(value as Sector)}
                  options={workspaceSectorComboboxOptions}
                  contentCollisionAvoidance={forceComboboxBelow}
                />
              </div>
              <div className="grid gap-2">
                <Label>Prioridade</Label>
                <OptionCombobox
                  value={createPriority}
                  onValueChange={(value) =>
                    setCreatePriority(value as ServiceTicketPriority)
                  }
                  options={priorityComboboxOptions}
                  placeholder="Selecione a prioridade"
                  emptyText="Nenhuma prioridade encontrada."
                  showClear={false}
                  contentCollisionAvoidance={forceComboboxBelow}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-3">
                <Label>Anexos</Label>
                <Button
                  type="button"
                  variant="outline"
                  disabled={createAttachments.length >= MAX_TICKET_ATTACHMENTS}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Paperclip className="mr-1 h-4 w-4" />
                  Adicionar
                </Button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
                className="hidden"
                onChange={handleAttachmentChange}
              />
              {createAttachments.length === 0 ? (
                <div className="flex h-24 items-center justify-center rounded-lg border border-dashed bg-muted/35 px-4 text-center text-sm text-muted-foreground">
                  Adicione até 3 fotos, vídeos ou documentos.
                </div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-3">
                  {createAttachments.map((attachment) => (
                    <AttachmentPreview
                      key={attachment.id}
                      attachment={attachment}
                      onOpen={() => setFullscreenAttachment(attachment)}
                      onRemove={() => removeCreateAttachment(attachment.id)}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="-mx-4 -mb-4 flex justify-end gap-2 border-t bg-muted/50 p-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsCreateDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit">
                <Headphones className="mr-1 h-4 w-4" />
                Abrir chamado
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(closeTicket)}
        onOpenChange={(open) => {
          if (!open) {
            setCloseTicketId(null);
            clearCloseDraft();
          }
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Encerrar chamado</DialogTitle>
            <DialogDescription className="sr-only">
              Informe a descrição de encerramento e anexos opcionais.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <p className="text-sm text-muted-foreground">
              A descrição será enviada ao chat e o chamado irá para o histórico.
            </p>
            <Textarea
              ref={closeDescriptionTextareaRef}
              value={closeDescription}
              onChange={(event) => {
                setCloseDescription(event.target.value);
                resizeCloseDescriptionTextarea(event.currentTarget);
              }}
              wrap="soft"
              rows={4}
              className="thin-gray-scrollbar min-h-28 resize-none overflow-hidden whitespace-pre-wrap break-words bg-muted leading-6 [field-sizing:fixed] [overflow-wrap:anywhere] [word-break:break-word]"
              placeholder="Descreva o que foi resolvido"
            />
            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-3">
                <Label>Anexos</Label>
                <Button
                  type="button"
                  variant="outline"
                  disabled={closeAttachments.length >= MAX_TICKET_ATTACHMENTS}
                  onClick={() => closeFileInputRef.current?.click()}
                >
                  <Paperclip className="mr-1 h-4 w-4" />
                  Adicionar
                </Button>
              </div>
              <input
                ref={closeFileInputRef}
                type="file"
                multiple
                accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
                className="hidden"
                onChange={handleCloseAttachmentChange}
              />
              {closeAttachments.length === 0 ? (
                <div className="flex h-24 items-center justify-center rounded-lg border border-dashed bg-muted/35 px-4 text-center text-sm text-muted-foreground">
                  Adicione até 3 fotos, vídeos ou documentos.
                </div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-3">
                  {closeAttachments.map((attachment) => (
                    <AttachmentPreview
                      key={attachment.id}
                      attachment={attachment}
                      onOpen={() => setFullscreenAttachment(attachment)}
                      onRemove={() => removeCloseAttachment(attachment.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="-mx-4 -mb-4 mt-4 flex justify-end gap-2 border-t bg-muted/50 p-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setCloseTicketId(null);
                clearCloseDraft();
              }}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={handleCloseTicket}>
              Encerrar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(reopenTicket)}
        onOpenChange={(open) => {
          if (!open) setReopenTicketId(null);
        }}
      >
        <DialogContent
          className="sm:max-w-md"
          onFocusOutside={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Reabrir chamado</DialogTitle>
            <DialogDescription className="sr-only">
              Informe o motivo para reabrir o atendimento.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <p className="text-sm text-muted-foreground">
              O motivo será enviado ao chat e o chamado voltará para a fila do
              setor.
            </p>
            <Textarea
              value={reopenReason}
              onChange={(event) => setReopenReason(event.target.value)}
              className="min-h-28 resize-none bg-muted"
              placeholder="Informe o motivo da reabertura"
            />
          </div>
          <div className="-mx-4 -mb-4 mt-4 flex justify-end gap-2 border-t bg-muted/50 p-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setReopenTicketId(null)}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={handleReopenTicket}>
              Reabrir
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        modal={false}
        open={Boolean(transferTicket)}
        onOpenChange={(open) => {
          if (!open) setTransferTicketId(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Transferir chamado</DialogTitle>
            <DialogDescription className="sr-only">
              Escolha se o atendimento será transferido para outro setor ou para
              um colega do seu setor.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Tipo de transferência</Label>
              <OptionCombobox
                value={transferMode}
                onValueChange={(value) => setTransferMode(value as TransferMode)}
                options={transferModeComboboxOptions}
                placeholder="Selecione o tipo"
                emptyText="Nenhum tipo encontrado."
                showClear={false}
                contentCollisionAvoidance={forceComboboxBelow}
              />
            </div>

            {transferMode === "sector" ? (
              <div className="grid gap-2">
                <Label>Setor de destino</Label>
                <SectorCombobox
                  value={transferSector}
                  onValueChange={(value) => setTransferSector(value as Sector)}
                  options={workspaceSectorComboboxOptions}
                  contentCollisionAvoidance={forceComboboxBelow}
                />
              </div>
            ) : (
              <div className="grid gap-2">
                <Label>Colega responsável</Label>
                <OptionCombobox
                  value={selectedTransferUserId}
                  onValueChange={setTransferUserId}
                  options={transferUserOptions}
                  placeholder="Selecione o colega"
                  emptyText="Nenhum colega do seu setor encontrado."
                  showClear={false}
                  contentCollisionAvoidance={forceComboboxBelow}
                />
              </div>
            )}

          </div>
          <div className="-mx-4 -mb-4 mt-4 flex justify-end gap-2 border-t bg-muted/50 p-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setTransferTicketId(null)}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={handleTransferTicket}>
              Transferir
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
