"use client";

/* eslint-disable @typescript-eslint/no-unused-vars */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type Dispatch,
  type SetStateAction,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  AnnouncementsEventsPage,
  type AnnouncementEvent,
} from "@/components/announcements-events-page";
import { AdminPanel } from "@/components/admin-panel";
import { ConversationList } from "@/components/conversation-list";
import { ChatWindow, type ForwardTarget } from "@/components/chat-window";
import { ContactDetails } from "@/components/contact-details";
import {
  KanbanPage,
  type KanbanCard,
  type KanbanColumn,
  type KanbanLabel,
} from "@/components/kanban-page";
import { LoansPage } from "@/components/loans-page";
import { MessageSearchPanel } from "@/components/message-search-panel";
import { PagePagination } from "@/components/page-pagination";
import { ServiceTicketsPage } from "@/components/service-tickets-page";
import { Button } from "@/components/unipar-ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/unipar-ui/dialog";
import { Input } from "@/components/unipar-ui/input";
import { Textarea } from "@/components/unipar-ui/textarea";
import {
  ChevronLeft,
  ChevronRight,
  BellRing,
  CalendarDays,
  HandCoins,
  Headphones,
  Image as ImageIcon,
  Kanban as KanbanIcon,
  LayoutDashboard,
  MessageCircle,
  PhoneCall,
  Search,
  Users,
} from "lucide-react";
import {
  type AccessRequest,
  type AdminReport,
  type AdminReportMessageSnapshot,
  type AdminUser,
  type ExtensionContentItem,
  type HelpContentItem,
  type Sector,
  type UserChatStatus,
  type UserWorkStatus,
} from "@/lib/admin-data";
import {
  type Contact,
  type DirectoryUser,
  type Message,
  getChatPresenceStatus,
  hideMessageForUser,
  isGroupMessageReadByUser,
  isMessageHiddenForUser,
} from "@/lib/chat-data";
import {
  formatLoanDate,
  getLoanOperationalStatus,
  isLoanDueToday,
  type LoanRequest,
} from "@/lib/loan-data";
import {
  type ServiceTicket,
  type ServiceTicketUser,
} from "@/lib/service-ticket-data";
import {
  EMPTY_APP_STATE,
  mergeAppStates,
  serializeAppState,
  type AppState,
  type GroupMetadataState,
  type KanbanBoardState,
  type TypingIndicatorState,
} from "@/lib/app-state";
import {
  clearCurrentSession,
  createBackendClientId,
  fetchCurrentSession,
  fetchBackendState,
  isTransientBackendFetchError,
  publishTypingIndicator,
  saveBackendState,
  saveUserProfile,
} from "@/lib/backend-client";
import {
  getDisplayChatStatus,
  PRESENCE_HEARTBEAT_MS,
} from "@/lib/presence";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type SidePanel = "contact" | "search" | null;
type ConversationConfirmAction = {
  contact: Contact;
  type: "clear" | "delete";
  scope: "chat" | "group";
} | null;
type ReportConversationTarget = {
  contact: Contact;
  kind: "contact" | "group";
} | null;
type RealtimeEventPayload = {
  clientId?: string | null;
  payload?: {
    key?: string;
    typing?: {
      scope?: TypingIndicatorState["scope"];
      targetId?: string;
      userId?: string;
      userName?: string;
      isTyping?: boolean;
      updatedAt?: string;
    };
  };
};
type PriorityMessageAlert = {
  conversation: Contact;
  message: Message;
  scope: "chat" | "group";
  senderName: string;
} | null;

type AccessRequestInput = Omit<AccessRequest, "id" | "createdAt" | "status">;
type AdminUserInput = Omit<AdminUser, "id" | "createdAt" | "status">;
export type UniparWorkspaceInitialUser = {
  id: string;
  name: string;
  email: string;
  sector: Sector;
  isAdmin: boolean;
  avatar: string;
  about?: string;
  chatStatus?: UserChatStatus;
  workStatus?: UserWorkStatus;
  lastSeenAt?: Date;
};
type AuthenticatedUser = UniparWorkspaceInitialUser;
type ProfileUpdate = Partial<
  Pick<AuthenticatedUser, "avatar" | "about" | "chatStatus" | "workStatus">
>;
type CreateGroupInput = {
  name: string;
  avatar: string;
  description: string;
  participantIds: string[];
};
type GroupMetadata = GroupMetadataState;
type ForwardTargetKind = ForwardTarget["kind"];

const CURRENT_USER_AVATAR = "";
const DEFAULT_USER_ABOUT = "Disponível";
const NAV_PATHS = {
  dashboard: "/dashboard",
  atendimentos: "/atendimentos",
  chat: "/chat-interno",
  grupos: "/grupos",
  "anuncios-eventos": "/anuncios-eventos",
  emprestimos: "/emprestimos",
  kanban: "/kanban",
  ajuda: "/ajuda",
  ramais: "/ramais",
  admin: "/administracao",
} as const;
const REMINDER_DELIVERY_HOUR = 6;
const REMINDER_UNLOCK_SECONDS = 5;
const PRIORITY_MESSAGE_UNLOCK_SECONDS = 5;
const KANBAN_DUE_REMINDER_UNLOCK_SECONDS = 5;
const LOAN_REMINDER_UNLOCK_SECONDS = 5;
const ALERT_PREVIEW_MAX_LENGTH = 30;
const TYPING_INDICATOR_TTL_MS = 3000;
const DIRECT_CONVERSATION_PREFIX = "dm:";
const NOTIFICATION_SOUND_SRC = "/audio/notificacao.mp3";
const NOTIFICATION_SOUND_STORAGE_LIMIT = 300;

type AppNavId = keyof typeof NAV_PATHS;

function isAppNavId(value: string): value is AppNavId {
  return value in NAV_PATHS;
}

function getNavFromPathname(pathname: string | null) {
  const currentPath = pathname?.replace(/\/+$/, "") || "/";

  return (
    Object.entries(NAV_PATHS).find(([, path]) => path === currentPath)?.[0] ??
    "chat"
  );
}

function getPathFromNav(item: string) {
  return isAppNavId(item) ? NAV_PATHS[item] : NAV_PATHS.chat;
}

function getDateTimeValue(value?: Date | string | null) {
  if (!value) return undefined;

  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();

  return Number.isFinite(time) ? time : undefined;
}

function getDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(date.getDate()).padStart(2, "0")}`;
}

function getStartOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getDayDifference(fromDate: Date, toDate: Date) {
  return Math.round(
    (getStartOfDay(toDate).getTime() - getStartOfDay(fromDate).getTime()) /
      (24 * 60 * 60 * 1000),
  );
}

function canDeliverAnnouncementReminder(date: Date) {
  return date.getHours() >= REMINDER_DELIVERY_HOUR;
}

function isReminderDay(dayDifference: number) {
  return dayDifference === 0 || dayDifference === 1;
}

function getReminderDayLabel(dayDifference: number) {
  return dayDifference === 0 ? "Hoje terá um evento" : "Amanhã terá um evento";
}

function getAlertPreviewText(text: string) {
  const normalizedText = text.trim();

  if (normalizedText.length <= ALERT_PREVIEW_MAX_LENGTH) {
    return normalizedText;
  }

  return `${normalizedText.slice(0, ALERT_PREVIEW_MAX_LENGTH).trimEnd()}...`;
}

function getAnnouncementReminderKey(
  userId: string,
  event: AnnouncementEvent,
  reminderDate: Date,
) {
  return `${userId}:${event.id}:${getDateKey(reminderDate)}`;
}

function getReminderStorageKey(userId: string) {
  return `announcement-event-reminders:${userId}`;
}

function getKanbanDueReminderStorageKey(userId: string) {
  return `kanban-due-reminders:${userId}`;
}

function getKanbanDueReminderKey(
  userId: string,
  card: KanbanCard,
  reminderDate: Date,
) {
  return `${userId}:${card.id}:${getDateKey(reminderDate)}`;
}

function getLoanReminderStorageKey(userId: string) {
  return `loan-reminders:${userId}`;
}

function getPriorityMessageAlertStorageKey(userId: string) {
  return `priority-message-alerts:${userId}`;
}

function getPriorityMessageAlertKey(
  scope: NonNullable<PriorityMessageAlert>["scope"],
  conversationId: string,
  message: Message,
) {
  return `${scope}:${conversationId}:${message.id}:${message.senderId ?? "unknown"}`;
}

function getNotificationMessageKey(
  scope: "chat" | "group",
  conversationId: string,
  message: Message,
) {
  return `${scope}:${conversationId}:${message.id}:${message.senderId ?? "unknown"}`;
}

function getNotificationSoundStorageKey(userId: string) {
  return `notification-sound-seen:${userId}`;
}

function getTypingIndicatorKey(
  scope: TypingIndicatorState["scope"],
  targetId: string,
  userId: string,
) {
  return `${scope}:${targetId}:${userId}`;
}

function getDirectConversationKey(firstUserId: string, secondUserId: string) {
  return `${DIRECT_CONVERSATION_PREFIX}${[firstUserId, secondUserId]
    .sort()
    .join(":")}`;
}

function parseDirectConversationKey(key: string) {
  if (!key.startsWith(DIRECT_CONVERSATION_PREFIX)) return null;

  const [firstUserId, secondUserId] = key
    .slice(DIRECT_CONVERSATION_PREFIX.length)
    .split(":");

  if (!firstUserId || !secondUserId) return null;

  return [firstUserId, secondUserId] as const;
}

function shouldMarkDirectMessageAsRead(
  message: Message,
  contactId: string,
  currentUserId: string,
) {
  if (
    message.deletedForEveryone ||
    message.status === "read" ||
    isMessageHiddenForUser(message, currentUserId)
  ) {
    return false;
  }

  if (message.senderId) return message.senderId === contactId;

  return message.isOwn === false;
}

function markDirectConversationMessagesAsRead(
  messagesByContact: Record<string, Message[]>,
  currentUserId: string,
  contactId: string,
) {
  const conversationKey = getDirectConversationKey(currentUserId, contactId);
  const conversationKeys = new Set([conversationKey, currentUserId, contactId]);
  let hasReadReceiptUpdate = false;
  const nextMessagesByContact = { ...messagesByContact };

  conversationKeys.forEach((key) => {
    const messages = messagesByContact[key];

    if (!messages) return;

    let hasKeyUpdate = false;
    const nextMessages = messages.map((message) => {
      if (shouldMarkDirectMessageAsRead(message, contactId, currentUserId)) {
        hasReadReceiptUpdate = true;
        hasKeyUpdate = true;
        return { ...message, status: "read" as const };
      }

      return message;
    });

    if (hasKeyUpdate) {
      nextMessagesByContact[key] = nextMessages;
    }
  });

  return {
    hasReadReceiptUpdate,
    messagesByContact: hasReadReceiptUpdate
      ? nextMessagesByContact
      : messagesByContact,
  };
}

function shouldMarkGroupMessageAsRead(message: Message, currentUserId: string) {
  if (
    message.deletedForEveryone ||
    isGroupMessageReadByUser(message, currentUserId) ||
    isMessageHiddenForUser(message, currentUserId)
  ) {
    return false;
  }

  if (message.senderId) return message.senderId !== currentUserId;

  return message.isOwn === false;
}

function markGroupMessagesAsRead(messages: Message[], currentUserId: string) {
  let hasReadReceiptUpdate = false;
  const nextMessages = messages.map((message) => {
    if (shouldMarkGroupMessageAsRead(message, currentUserId)) {
      hasReadReceiptUpdate = true;
      return {
        ...message,
        readByUserIds: Array.from(
          new Set([...(message.readByUserIds ?? []), currentUserId]),
        ),
      };
    }

    return message;
  });

  return {
    hasReadReceiptUpdate,
    messages: hasReadReceiptUpdate ? nextMessages : messages,
  };
}

function getLoanReminderKey(
  userId: string,
  loan: LoanRequest,
  reminderDate: Date,
) {
  return `${userId}:${loan.id}:${getDateKey(reminderDate)}`;
}

function shouldShowLoanReminder(loan: LoanRequest, referenceDate: Date) {
  return (
    isLoanDueToday(loan, referenceDate) ||
    getLoanOperationalStatus(loan, referenceDate) === "overdue"
  );
}

function formatKanbanDueDate(dateKey: string) {
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function getProfileAbout(about?: string | null) {
  return about?.trim() || DEFAULT_USER_ABOUT;
}

function isConversationHiddenForUser(contact: Contact, userId?: string) {
  if (!userId) return false;

  return contact.hiddenForUserIds?.includes(userId) ?? false;
}

function hideConversationForUser(contact: Contact, userId: string): Contact {
  if (isConversationHiddenForUser(contact, userId)) return contact;

  return {
    ...contact,
    hiddenForUserIds: [...(contact.hiddenForUserIds ?? []), userId],
  };
}

function getConversationStateForUser(contact: Contact, userId: string) {
  const userPreference = userId
    ? contact.conversationPreferencesByUserId?.[userId]
    : undefined;

  return {
    isMuted: userPreference?.isMuted ?? contact.isMuted,
    isPinned: userPreference?.isPinned ?? contact.isPinned,
  };
}

function hydrateConversationStateForUser(contact: Contact, userId: string) {
  return {
    ...contact,
    ...getConversationStateForUser(contact, userId),
  };
}

function updateConversationPreferenceForUser(
  contact: Contact,
  userId: string,
  updates: Partial<Pick<Contact, "isMuted" | "isPinned">>,
): Contact {
  const currentPreference =
    contact.conversationPreferencesByUserId?.[userId];

  return {
    ...contact,
    conversationPreferencesByUserId: {
      ...(contact.conversationPreferencesByUserId ?? {}),
      [userId]: {
        ...currentPreference,
        ...updates,
        updatedAt: new Date(),
      },
    },
  };
}

function getGroupMemberIds(metadata: GroupMetadata) {
  return Array.from(
    new Set(
      [metadata.creatorId, ...metadata.adminIds, ...metadata.participantIds]
        .filter(Boolean),
    ),
  );
}

function normalizeGroupMetadata(metadata: GroupMetadata): GroupMetadata {
  const creatorId =
    metadata.creatorId ||
    metadata.adminIds[0] ||
    metadata.participantIds[0] ||
    "";
  const adminIds = Array.from(
    new Set([...metadata.adminIds, ...(creatorId ? [creatorId] : [])]),
  );
  const participantIds = Array.from(
    new Set([
      ...(creatorId ? [creatorId] : []),
      ...metadata.participantIds,
      ...adminIds,
    ]),
  );

  return {
    ...metadata,
    creatorId,
    participantIds,
    adminIds,
  };
}

function touchGroupMetadata(metadata: GroupMetadata): GroupMetadata {
  return normalizeGroupMetadata({
    ...metadata,
    updatedAt: new Date(),
  });
}

function createEmptyKanbanBoard(): KanbanBoardState {
  return {
    columns: [],
    cardsById: {},
    labels: [],
  };
}

function getKanbanBoardForUser(
  boardsByUserId: Record<string, KanbanBoardState>,
  userId: string,
) {
  if (!userId) return createEmptyKanbanBoard();

  return boardsByUserId[userId] ?? createEmptyKanbanBoard();
}

function touchKanbanBoard(board: KanbanBoardState): KanbanBoardState {
  return {
    columns: board.columns,
    cardsById: board.cardsById,
    labels: board.labels,
    updatedAt: new Date(),
  };
}

function canUserSeeGroup(
  groupId: string,
  userId: string,
  metadataById: Record<string, GroupMetadata>,
) {
  if (!userId) return false;

  const metadata = metadataById[groupId];

  if (!metadata) return false;

  return getGroupMemberIds(metadata).includes(userId);
}

function parseForwardTargetKey(targetKey: string): {
  id: string;
  kind: ForwardTargetKind;
} {
  const separatorIndex = targetKey.indexOf(":");

  if (separatorIndex === -1) {
    return { id: targetKey, kind: "contact" };
  }

  const kind = targetKey.slice(0, separatorIndex);
  const id = targetKey.slice(separatorIndex + 1);

  return {
    id,
    kind: kind === "group" ? "group" : "contact",
  };
}

function getGroupForwardTarget(group: Contact): ForwardTarget {
  return {
    id: group.id,
    name: group.name,
    avatar: group.avatar,
    email: group.email,
    isOnline: false,
    kind: "group",
  };
}
const CURRENT_USER_MESSAGE_NAME = "Você";

const HELP_PAGE_SIZE = 8;
const EXTENSIONS_PAGE_SIZE = 10;

const sectionPlaceholders: Record<
  string,
  {
    title: string;
    description: string;
    icon: ComponentType<{ className?: string }>;
  }
> = {
  dashboard: {
    title: "Dashboard",
    description: "Indicadores e visão geral do atendimento aparecerão aqui.",
    icon: LayoutDashboard,
  },
  atendimentos: {
    title: "Atendimentos",
    description: "Acompanhe atendimentos e filas operacionais nesta área.",
    icon: Headphones,
  },
};

function getForwardedMessagePreview(message: Message) {
  const content = message.content.trim();

  if (content) return `Encaminhada: ${content}`;

  switch (message.attachment?.type) {
    case "image":
      return "Foto encaminhada";
    case "video":
      return "Vídeo encaminhado";
    case "audio":
      return "Áudio encaminhado";
    case "document":
      return "Documento encaminhado";
    default:
      return "Mensagem encaminhada";
  }
}

function getConversationMessagePreview(message: Message) {
  if (message.deletedForEveryone) return "Mensagem apagada";

  const content = message.content.trim();

  if (message.isForwarded) {
    if (content) return `Encaminhada: ${content}`;

    switch (message.attachment?.type) {
      case "image":
        return "Encaminhada: Foto";
      case "video":
        return "Encaminhada: Vídeo";
      case "audio":
        return "Encaminhada: Áudio";
      case "document":
        return `Encaminhada: ${message.attachment.name}`;
      default:
        return "Encaminhada: Mensagem";
    }
  }

  if (content) return content;

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

function getLastVisibleConversationMessage(messages: Message[]) {
  return messages.at(-1);
}

function cloneMessageAttachment(
  attachment?: Message["attachment"],
): Message["attachment"] | undefined {
  if (!attachment) return undefined;

  if (attachment.type === "audio") {
    return {
      ...attachment,
      waveform: [...attachment.waveform],
    };
  }

  return { ...attachment };
}

function getReportMessageSenderName(
  message: Message,
  conversation: Contact,
  isGroup: boolean,
  groupParticipants: DirectoryUser[],
) {
  if (message.senderName) return message.senderName;
  if (message.isOwn) return CURRENT_USER_MESSAGE_NAME;

  if (isGroup && message.senderId) {
    return (
      groupParticipants.find(
        (participant) => participant.id === message.senderId,
      )?.name ?? "Participante"
    );
  }

  return isGroup ? "Participante" : conversation.name;
}

function buildReportMessageSnapshot(
  message: Message,
  conversation: Contact,
  isGroup: boolean,
  groupParticipants: DirectoryUser[],
): AdminReportMessageSnapshot {
  return {
    id: message.id,
    content: message.content,
    timestamp: new Date(message.timestamp),
    isOwn: message.isOwn,
    senderName: getReportMessageSenderName(
      message,
      conversation,
      isGroup,
      groupParticipants,
    ),
    status: message.status,
    isPriority: message.isPriority,
    isForwarded: message.isForwarded,
    isEdited: message.isEdited,
    deletedForEveryone: message.deletedForEveryone,
    attachment: cloneMessageAttachment(message.attachment),
    replyTo: message.replyTo
      ? {
          content: message.replyTo.content,
          senderName: message.replyTo.senderName,
        }
      : undefined,
  };
}

function WorkspacePlaceholder({ activeNav }: { activeNav: string }) {
  const placeholder =
    sectionPlaceholders[activeNav] ?? sectionPlaceholders.chat;
  const Icon = placeholder?.icon ?? MessageCircle;

  return (
    <div className="flex h-full min-w-0 flex-1 items-center justify-center bg-muted/30 p-8">
      <div className="flex max-w-md flex-col items-center text-center">
        <span className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon className="h-10 w-10" />
        </span>
        <h1 className="mt-5 text-2xl font-semibold text-foreground">
          {placeholder?.title ?? "Área do sistema"}
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {placeholder?.description ??
            "Selecione uma opção da barra lateral para começar."}
        </p>
      </div>
    </div>
  );
}

function HelpPage({
  items,
}: {
  items: HelpContentItem[];
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedItem, setSelectedItem] = useState<HelpContentItem | null>(
    null,
  );
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const filteredItems = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    if (!normalizedSearch) return items;

    return items.filter((item) =>
      item.title.toLowerCase().includes(normalizedSearch),
    );
  }, [items, search]);
  const totalPages = Math.max(
    1,
    Math.ceil(filteredItems.length / HELP_PAGE_SIZE),
  );
  const currentPage = Math.min(page, totalPages);
  const paginatedItems = filteredItems.slice(
    (currentPage - 1) * HELP_PAGE_SIZE,
    currentPage * HELP_PAGE_SIZE,
  );
  const selectedImage = selectedItem?.images[selectedImageIndex];

  const handleOpenHelpItem = (item: HelpContentItem) => {
    setSelectedItem(item);
    setSelectedImageIndex(0);
  };

  const handleNavigateHelpImage = (direction: -1 | 1) => {
    if (!selectedItem) return;

    setSelectedImageIndex(
      (currentIndex) =>
        (currentIndex + direction + selectedItem.images.length) %
        selectedItem.images.length,
    );
  };

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-background">
        <div className="contents">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
            <div className="flex flex-col gap-2 border-b px-3 py-2 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold">Conteúdo de ajuda</h2>
                <p className="text-xs text-muted-foreground">
                  {filteredItems.length}{" "}
                  {filteredItems.length === 1 ? "publicação" : "publicações"}
                </p>
              </div>

              <div className="relative w-full sm:min-w-72 lg:w-80">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                  placeholder="Buscar ajuda por título"
                  className="bg-muted pl-8"
                />
              </div>
            </div>

            <div className="thin-gray-scrollbar min-h-0 flex-1 overflow-auto p-3">
              {filteredItems.length === 0 ? (
                <div className="flex min-h-64 flex-col items-center justify-center px-4 text-center">
                  <ImageIcon className="h-10 w-10 text-muted-foreground" />
                  <h2 className="mt-4 text-base font-semibold">
                    Nenhuma imagem encontrada
                  </h2>
                  <p className="mt-1 max-w-md text-sm text-muted-foreground">
                    O conteúdo de ajuda aparece aqui depois de ser cadastrado na
                    administração.
                  </p>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {paginatedItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="group overflow-hidden rounded-md border bg-card text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      onClick={() => handleOpenHelpItem(item)}
                    >
                      <div
                        className="aspect-[4/3] bg-muted bg-cover bg-center"
                        style={{
                          backgroundImage: `url(${item.images[0]?.src ?? ""})`,
                        }}
                      />
                      <div className="px-3 py-2">
                        <h2 className="line-clamp-2 min-h-10 text-sm font-semibold leading-5 text-foreground">
                          {item.title}
                        </h2>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <PagePagination
              page={currentPage}
              totalPages={totalPages}
              onPageChange={setPage}
              className="bg-background"
            />
          </div>
        </div>
      </div>

      <Dialog
        open={Boolean(selectedItem)}
        onOpenChange={(open) => {
          if (open) return;

          setSelectedItem(null);
          setSelectedImageIndex(0);
        }}
      >
        <DialogContent className="h-[100dvh] max-h-[100dvh] w-screen max-w-none border-0 bg-black p-0 text-white sm:max-w-none">
          {selectedItem && selectedImage && (
            <div className="flex h-full min-h-0 flex-col">
              <DialogHeader className="shrink-0 border-b border-white/10 px-4 py-3">
                <DialogTitle className="truncate pr-8 text-white">
                  {selectedItem.title}
                </DialogTitle>
                <DialogDescription className="sr-only">
                  Visualização das imagens desta publicação de ajuda.
                </DialogDescription>
              </DialogHeader>
              <div className="relative flex min-h-0 flex-1 items-center justify-center p-4">
                {selectedItem.images.length > 1 && (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute left-4 top-1/2 z-10 h-11 w-11 -translate-y-1/2 rounded-full bg-black/45 text-white hover:bg-black/65 hover:text-white"
                      onClick={() => handleNavigateHelpImage(-1)}
                      aria-label="Imagem anterior"
                    >
                      <ChevronLeft className="h-6 w-6" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-4 top-1/2 z-10 h-11 w-11 -translate-y-1/2 rounded-full bg-black/45 text-white hover:bg-black/65 hover:text-white"
                      onClick={() => handleNavigateHelpImage(1)}
                      aria-label="Próxima imagem"
                    >
                      <ChevronRight className="h-6 w-6" />
                    </Button>
                  </>
                )}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={selectedImage.src}
                  alt={selectedImage.name}
                  className="max-h-full max-w-full object-contain"
                />
              </div>
              <div className="shrink-0 border-t border-white/10 px-4 py-3 text-center text-sm text-white/75">
                {selectedImageIndex + 1} de {selectedItem.images.length}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function ExtensionsPage({
  items,
}: {
  items: ExtensionContentItem[];
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const filteredItems = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    if (!normalizedSearch) return items;

    return items.filter((item) =>
      [item.name, item.sector, item.extension]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch),
    );
  }, [items, search]);
  const totalPages = Math.max(
    1,
    Math.ceil(filteredItems.length / EXTENSIONS_PAGE_SIZE),
  );
  const currentPage = Math.min(page, totalPages);
  const paginatedItems = filteredItems.slice(
    (currentPage - 1) * EXTENSIONS_PAGE_SIZE,
    currentPage * EXTENSIONS_PAGE_SIZE,
  );

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-background">
        <div className="contents">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
            <div className="flex flex-col gap-2 border-b px-3 py-2 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold">Ramais cadastrados</h2>
                <p className="text-xs text-muted-foreground">
                  {filteredItems.length} ramal
                  {filteredItems.length === 1 ? "" : "s"}
                </p>
              </div>

              <div className="relative w-full sm:min-w-72 lg:w-80">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                  placeholder="Buscar por nome, setor ou ramal"
                  className="bg-muted pl-8"
                />
              </div>
            </div>

            <div className="thin-gray-scrollbar min-h-0 flex-1 overflow-auto">
              {filteredItems.length === 0 ? (
                <div className="flex min-h-64 flex-col items-center justify-center px-4 text-center">
                  <PhoneCall className="h-10 w-10 text-muted-foreground" />
                  <h2 className="mt-4 text-base font-semibold">
                    Nenhum ramal encontrado
                  </h2>
                  <p className="mt-1 max-w-md text-sm text-muted-foreground">
                    Cadastre ramais na aba Conteúdo da administração para eles
                    aparecerem aqui.
                  </p>
                </div>
              ) : (
                <div className="min-w-[38rem] lg:min-w-0">
                  <div className="grid grid-cols-[minmax(12rem,1fr)_minmax(10rem,1fr)_8rem] border-b bg-muted/30 px-3 py-2 text-xs font-semibold uppercase text-muted-foreground lg:grid-cols-[minmax(14rem,1.2fr)_minmax(12rem,1fr)_10rem]">
                    <span>Nome</span>
                    <span>Setor</span>
                    <span>Ramal</span>
                  </div>
                  {paginatedItems.map((item) => (
                    <div
                      key={item.id}
                      className="grid grid-cols-[minmax(12rem,1fr)_minmax(10rem,1fr)_8rem] items-center border-b px-3 py-3 text-sm last:border-b-0 lg:grid-cols-[minmax(14rem,1.2fr)_minmax(12rem,1fr)_10rem]"
                    >
                      <span className="truncate font-medium">{item.name}</span>
                      <span className="truncate text-sm text-muted-foreground">
                        {item.sector}
                      </span>
                      <span className="font-semibold tabular-nums text-primary">
                        {item.extension}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <PagePagination
              page={currentPage}
              totalPages={totalPages}
              onPageChange={setPage}
              className="bg-background"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

export function UniparWorkspace({
  activeNav: forcedActiveNav,
  initialUser,
}: {
  activeNav?: AppNavId;
  initialUser?: UniparWorkspaceInitialUser | null;
}) {
  const initialSessionUser = initialUser
    ? {
        ...initialUser,
        avatar: initialUser.avatar ?? "",
      }
    : null;
  const hasInitialSessionUser = Boolean(initialSessionUser);
  const usedInitialSessionRef = useRef(hasInitialSessionUser);
  const router = useRouter();
  const pathname = usePathname();
  const [isAuthenticated, setIsAuthenticated] = useState(
    hasInitialSessionUser,
  );
  const [isCheckingSession, setIsCheckingSession] = useState(
    !hasInitialSessionUser,
  );
  const [currentSessionUser, setCurrentSessionUser] =
    useState<AuthenticatedUser | null>(initialSessionUser);
  const currentAnnouncementUser = useMemo<DirectoryUser>(() => {
    if (currentSessionUser) {
      const chatStatus = currentSessionUser.chatStatus ?? "online";

      return {
        id: currentSessionUser.id,
        name: currentSessionUser.name,
        avatar: currentSessionUser.avatar,
        email: currentSessionUser.email,
        sector: currentSessionUser.sector,
        about: getProfileAbout(currentSessionUser.about),
        isOnline: chatStatus === "online",
        chatStatus,
        workStatus: currentSessionUser.workStatus ?? "available",
        lastSeenAt: currentSessionUser.lastSeenAt ?? new Date(),
      };
    }

    return {
      id: "",
      name: "",
      avatar: CURRENT_USER_AVATAR,
      email: "",
      about: "",
      isOnline: false,
      chatStatus: "offline",
      workStatus: "available",
      lastSeenAt: undefined,
    };
  }, [currentSessionUser]);
  const [announcementEvents, setAnnouncementEvents] = useState<
    AnnouncementEvent[]
  >(EMPTY_APP_STATE.announcementEvents);
  const [deletedAnnouncementEventIds, setDeletedAnnouncementEventIds] =
    useState<string[]>(EMPTY_APP_STATE.deletedAnnouncementEventIds);
  const [focusedAnnouncementEventId, setFocusedAnnouncementEventId] = useState<
    string | null
  >(null);
  const [kanbanBoardsByUserId, setKanbanBoardsByUserId] = useState<
    Record<string, KanbanBoardState>
  >(EMPTY_APP_STATE.kanbanBoardsByUserId);
  const [focusedKanbanCardId, setFocusedKanbanCardId] = useState<string | null>(
    null,
  );
  const [
    dismissedAnnouncementReminderKeys,
    setDismissedAnnouncementReminderKeys,
  ] = useState<string[]>([]);
  const [activeReminderEvent, setActiveReminderEvent] =
    useState<AnnouncementEvent | null>(null);
  const [reminderCountdown, setReminderCountdown] = useState(0);
  const [dismissedKanbanDueReminderKeys, setDismissedKanbanDueReminderKeys] =
    useState<string[]>([]);
  const [activeKanbanDueReminderCardId, setActiveKanbanDueReminderCardId] =
    useState<string | null>(null);
  const [kanbanDueReminderCountdown, setKanbanDueReminderCountdown] =
    useState(0);
  const currentKanbanBoard = useMemo(
    () =>
      getKanbanBoardForUser(
        kanbanBoardsByUserId,
        currentAnnouncementUser.id,
      ),
    [currentAnnouncementUser.id, kanbanBoardsByUserId],
  );
  const kanbanColumns = currentKanbanBoard.columns;
  const kanbanCardsById = currentKanbanBoard.cardsById;
  const kanbanLabels = currentKanbanBoard.labels;
  const setCurrentKanbanBoard = useCallback(
    (nextBoard: SetStateAction<KanbanBoardState>) => {
      const userId = currentAnnouncementUser.id;
      if (!userId) return;

      setKanbanBoardsByUserId((currentBoardsByUserId) => {
        const currentBoard = getKanbanBoardForUser(
          currentBoardsByUserId,
          userId,
        );
        const resolvedBoard =
          typeof nextBoard === "function"
            ? nextBoard(currentBoard)
            : nextBoard;

        return {
          ...currentBoardsByUserId,
          [userId]: touchKanbanBoard(resolvedBoard),
        };
      });
    },
    [currentAnnouncementUser.id],
  );
  const setKanbanColumns = useCallback<
    Dispatch<SetStateAction<KanbanColumn[]>>
  >(
    (nextColumns) => {
      setCurrentKanbanBoard((currentBoard) => ({
        ...currentBoard,
        columns:
          typeof nextColumns === "function"
            ? nextColumns(currentBoard.columns)
            : nextColumns,
      }));
    },
    [setCurrentKanbanBoard],
  );
  const setKanbanCardsById = useCallback<
    Dispatch<SetStateAction<Record<string, KanbanCard>>>
  >(
    (nextCardsById) => {
      setCurrentKanbanBoard((currentBoard) => ({
        ...currentBoard,
        cardsById:
          typeof nextCardsById === "function"
            ? nextCardsById(currentBoard.cardsById)
            : nextCardsById,
      }));
    },
    [setCurrentKanbanBoard],
  );
  const setKanbanLabels = useCallback<
    Dispatch<SetStateAction<KanbanLabel[]>>
  >(
    (nextLabels) => {
      setCurrentKanbanBoard((currentBoard) => ({
        ...currentBoard,
        labels:
          typeof nextLabels === "function"
            ? nextLabels(currentBoard.labels)
            : nextLabels,
      }));
    },
    [setCurrentKanbanBoard],
  );
  const [reminderNow, setReminderNow] = useState(() => new Date());
  const [activePriorityMessageAlert, setActivePriorityMessageAlert] =
    useState<PriorityMessageAlert>(null);
  const [priorityMessageCountdown, setPriorityMessageCountdown] = useState(0);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [activeSidePanel, setActiveSidePanel] = useState<SidePanel>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<
    string | null
  >(null);
  const [messagesByContact, setMessagesByContact] = useState<
    Record<string, Message[]>
  >(EMPTY_APP_STATE.messagesByContact);
  const messagesByContactRef = useRef(messagesByContact);
  const [
    priorityMessageAlertSeenKeysByUserId,
    setPriorityMessageAlertSeenKeysByUserId,
  ] = useState<Record<string, string[]>>(
    EMPTY_APP_STATE.priorityMessageAlertSeenKeysByUserId,
  );
  const [groupMessagesByContact, setGroupMessagesByContact] = useState<
    Record<string, Message[]>
  >({});
  const groupMessagesByContactRef = useRef(groupMessagesByContact);
  const [contacts, setContacts] = useState<Contact[]>(EMPTY_APP_STATE.contacts);
  const [groups, setGroups] = useState<Contact[]>(EMPTY_APP_STATE.groups);
  const [groupMetadataById, setGroupMetadataById] = useState<
    Record<string, GroupMetadata>
  >({});
  const [archivedContacts, setArchivedContacts] = useState<Contact[]>(
    EMPTY_APP_STATE.archivedContacts,
  );
  const [archivedGroups, setArchivedGroups] = useState<Contact[]>(
    EMPTY_APP_STATE.archivedGroups,
  );
  const [showArchived, setShowArchived] = useState(false);
  const [showArchivedGroups, setShowArchivedGroups] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<Contact | null>(null);
  const activeNav = forcedActiveNav ?? getNavFromPathname(pathname);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [reportConversationTarget, setReportConversationTarget] =
    useState<ReportConversationTarget>(null);
  const [conversationReportText, setConversationReportText] = useState("");
  const [conversationConfirmAction, setConversationConfirmAction] =
    useState<ConversationConfirmAction>(null);
  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>(
    EMPTY_APP_STATE.adminUsers,
  );
  const [adminReports, setAdminReports] = useState<AdminReport[]>([]);
  const [presenceNow, setPresenceNow] = useState(() => Date.now());

  useEffect(() => {
    const intervalId = window.setInterval(
      () => setPresenceNow(Date.now()),
      PRESENCE_HEARTBEAT_MS,
    );

    return () => window.clearInterval(intervalId);
  }, []);

  const directoryUsers = useMemo<DirectoryUser[]>(() => {
    const usersByEmail = new Map<string, DirectoryUser>();

    if (currentAnnouncementUser.email) {
      usersByEmail.set(currentAnnouncementUser.email.toLowerCase(), {
        ...currentAnnouncementUser,
      });
    }

    adminUsers
      .filter((user) => user.status === "active")
      .forEach((user) => {
        const normalizedEmail = user.email.toLowerCase();
        const isCurrentUser =
          normalizedEmail === currentAnnouncementUser.email.toLowerCase();
        const lastSeenAt = isCurrentUser
          ? (currentAnnouncementUser.lastSeenAt ?? new Date())
          : user.lastSeenAt;
        const chatStatus = isCurrentUser
          ? getChatPresenceStatus(currentAnnouncementUser)
          : getDisplayChatStatus(user.chatStatus, lastSeenAt, presenceNow);

        usersByEmail.set(normalizedEmail, {
          id: user.id,
          name: user.name,
          avatar: isCurrentUser
            ? currentAnnouncementUser.avatar
            : user.avatar ||
              `https://ui-avatars.com/api/?name=${encodeURIComponent(
                user.name,
              )}&background=10b981&color=fff`,
          email: user.email,
          sector: isCurrentUser
            ? currentAnnouncementUser.sector
            : user.sector,
          about: isCurrentUser
            ? currentAnnouncementUser.about
            : getProfileAbout(user.about),
          isOnline: chatStatus === "online",
          chatStatus,
          workStatus: isCurrentUser
            ? currentAnnouncementUser.workStatus
            : user.workStatus,
          lastSeenAt,
        });
      });

    return Array.from(usersByEmail.values()).sort((firstUser, secondUser) =>
      firstUser.name.localeCompare(secondUser.name),
    );
  }, [adminUsers, currentAnnouncementUser, presenceNow]);
  const announcementRecipients = directoryUsers;
  const currentUserSector = useMemo<Sector>(() => {
    if (currentSessionUser) return currentSessionUser.sector;

    const normalizedEmail = currentAnnouncementUser.email.toLowerCase();

    return (
      adminUsers.find((user) => user.email.toLowerCase() === normalizedEmail)
        ?.sector ?? "TI"
    );
  }, [adminUsers, currentAnnouncementUser.email, currentSessionUser]);
  const currentServiceTicketUser = useMemo<ServiceTicketUser>(
    () => ({
      id: currentAnnouncementUser.id,
      name: currentAnnouncementUser.name,
      email: currentAnnouncementUser.email,
      avatar: currentAnnouncementUser.avatar,
      sector: currentUserSector,
    }),
    [currentAnnouncementUser, currentUserSector],
  );
  const serviceTicketUsers = useMemo<ServiceTicketUser[]>(() => {
    const usersByEmail = new Map<string, ServiceTicketUser>();

    const addUser = (user: ServiceTicketUser) => {
      usersByEmail.set(user.email.toLowerCase(), user);
    };

    adminUsers
      .filter((user) => user.status === "active")
      .forEach((user) => {
        addUser({
          id: user.id,
          name: user.name,
          email: user.email,
          avatar:
            user.email.toLowerCase() ===
            currentServiceTicketUser.email.toLowerCase()
              ? currentServiceTicketUser.avatar
              : user.avatar ||
                `https://ui-avatars.com/api/?name=${encodeURIComponent(
                  user.name,
                )}&background=10b981&color=fff`,
          sector: user.sector,
        });
      });

    addUser(currentServiceTicketUser);

    return Array.from(usersByEmail.values());
  }, [adminUsers, currentServiceTicketUser]);
  const [serviceTickets, setServiceTickets] = useState<ServiceTicket[]>(
    EMPTY_APP_STATE.serviceTickets,
  );
  const [loanRequests, setLoanRequests] = useState<LoanRequest[]>(
    EMPTY_APP_STATE.loanRequests,
  );
  const [focusedLoanId, setFocusedLoanId] = useState<string | null>(null);
  const [dismissedLoanReminderKeys, setDismissedLoanReminderKeys] = useState<
    string[]
  >([]);
  const [activeLoanReminderId, setActiveLoanReminderId] = useState<
    string | null
  >(null);
  const [loanReminderCountdown, setLoanReminderCountdown] = useState(0);
  const [helpItems, setHelpItems] = useState<HelpContentItem[]>([]);
  const [extensionItems, setExtensionItems] = useState<ExtensionContentItem[]>(
    [],
  );
  const [typingIndicators, setTypingIndicators] = useState<
    Record<string, TypingIndicatorState>
  >(EMPTY_APP_STATE.typingIndicators);
  const [isBackendReady, setIsBackendReady] = useState(false);
  const typingIndicatorsRef = useRef<Record<string, TypingIndicatorState>>(
    EMPTY_APP_STATE.typingIndicators,
  );
  const backendClientIdRef = useRef("");
  const backendReadyRef = useRef(false);
  const applyingBackendStateRef = useRef(false);
  const lastSavedStateRef = useRef("");
  const latestAppStateRef = useRef<AppState>(EMPTY_APP_STATE);
  const stateSaveInFlightRef = useRef(false);
  const stateSavePendingRef = useRef(false);
  const backendRefreshInFlightRef = useRef(false);
  const backendRefreshPendingRef = useRef(false);
  const flushBackendStateSaveRef = useRef<() => void>(() => undefined);
  const refreshBackendStateRef = useRef<() => void>(() => undefined);
  const seenPriorityMessageKeysRef = useRef<Set<string>>(new Set());
  const priorityMessageAlertBaselineUserIdRef = useRef("");
  const knownNotificationMessageKeysRef = useRef<Set<string>>(new Set());
  const notificationBaselineUserIdRef = useRef("");
  const messageNotificationAudioRef = useRef<HTMLAudioElement | null>(null);
  const pendingMessageNotificationSoundRef = useRef(false);
  const messageNotificationAudioUnlockedRef = useRef(false);

  const storeSeenPriorityMessageKeys = useCallback(
    (priorityMessageKeys: Set<string>) => {
      seenPriorityMessageKeysRef.current = priorityMessageKeys;

      if (!currentAnnouncementUser.id) return;

      const nextPriorityMessageKeys = Array.from(priorityMessageKeys).slice(
        -300,
      );

      setPriorityMessageAlertSeenKeysByUserId((currentKeysByUserId) => ({
        ...currentKeysByUserId,
        [currentAnnouncementUser.id]: nextPriorityMessageKeys,
      }));

      try {
        window.localStorage.setItem(
          getPriorityMessageAlertStorageKey(currentAnnouncementUser.id),
          JSON.stringify(nextPriorityMessageKeys),
        );
      } catch {
        // localStorage pode estar indisponível em alguns navegadores.
      }
    },
    [currentAnnouncementUser.id],
  );

  const addSeenPriorityMessageKeys = useCallback(
    (priorityMessageKeys: Iterable<string>) => {
      const nextPriorityMessageKeys = new Set(
        seenPriorityMessageKeysRef.current,
      );

      for (const priorityMessageKey of priorityMessageKeys) {
        nextPriorityMessageKeys.add(priorityMessageKey);
      }

      storeSeenPriorityMessageKeys(nextPriorityMessageKeys);
    },
    [storeSeenPriorityMessageKeys],
  );
  const markPriorityMessageAlertSeen = useCallback(
    (priorityAlert: PriorityMessageAlert) => {
      if (!priorityAlert) return;

      addSeenPriorityMessageKeys([
        getPriorityMessageAlertKey(
          priorityAlert.scope,
          priorityAlert.conversation.id,
          priorityAlert.message,
        ),
      ]);
    },
    [addSeenPriorityMessageKeys],
  );

  useEffect(() => {
    messageNotificationAudioRef.current = new Audio(NOTIFICATION_SOUND_SRC);
    messageNotificationAudioRef.current.preload = "auto";

    return () => {
      messageNotificationAudioRef.current = null;
    };
  }, []);

  const playMessageNotificationSound = useCallback(() => {
    const audio = messageNotificationAudioRef.current;

    if (!audio) {
      pendingMessageNotificationSoundRef.current = true;
      return;
    }

    audio.currentTime = 0;
    void audio.play().catch(() => {
      pendingMessageNotificationSoundRef.current = true;
    });
  }, []);

  const unlockMessageNotificationSound = useCallback(() => {
    const audio = messageNotificationAudioRef.current;

    if (!audio || messageNotificationAudioUnlockedRef.current) return;

    const previousMuted = audio.muted;
    audio.muted = true;
    audio.currentTime = 0;

    void audio
      .play()
      .then(() => {
        audio.pause();
        audio.currentTime = 0;
        audio.muted = previousMuted;
        messageNotificationAudioUnlockedRef.current = true;
      })
      .catch(() => {
        audio.muted = previousMuted;
      });
  }, []);

  const flushPendingMessageNotificationSound = useCallback(() => {
    if (!pendingMessageNotificationSoundRef.current) return;

    pendingMessageNotificationSoundRef.current = false;
    playMessageNotificationSound();
  }, [playMessageNotificationSound]);

  const handleMessageNotificationAudioGesture = useCallback(() => {
    if (pendingMessageNotificationSoundRef.current) {
      flushPendingMessageNotificationSound();
      return;
    }

    unlockMessageNotificationSound();
  }, [flushPendingMessageNotificationSound, unlockMessageNotificationSound]);

  useEffect(() => {
    window.addEventListener("pointerdown", handleMessageNotificationAudioGesture);
    window.addEventListener("keydown", handleMessageNotificationAudioGesture);

    return () => {
      window.removeEventListener(
        "pointerdown",
        handleMessageNotificationAudioGesture,
      );
      window.removeEventListener("keydown", handleMessageNotificationAudioGesture);
    };
  }, [handleMessageNotificationAudioGesture]);

  const navigateTo = useCallback(
    (item: string, mode: "push" | "replace" = "push") => {
      const nextPath = getPathFromNav(item);

      setIsMobileSidebarOpen(false);

      if (pathname === nextPath) return;

      if (mode === "replace") {
        router.replace(nextPath);
        return;
      }

      router.push(nextPath);
    },
    [pathname, router],
  );

  const currentAppState = useMemo<AppState>(
    () => ({
      contacts,
      archivedContacts,
      groups,
      archivedGroups,
      messagesByContact,
      groupMessagesByContact,
      groupMetadataById,
      accessRequests,
      adminUsers,
      adminReports,
      serviceTickets,
      loanRequests,
      announcementEvents,
      deletedAnnouncementEventIds,
      kanbanColumns: EMPTY_APP_STATE.kanbanColumns,
      kanbanCardsById: EMPTY_APP_STATE.kanbanCardsById,
      kanbanLabels: EMPTY_APP_STATE.kanbanLabels,
      kanbanBoardsByUserId,
      helpItems,
      extensionItems,
      typingIndicators: EMPTY_APP_STATE.typingIndicators,
      pageRecords: EMPTY_APP_STATE.pageRecords,
      priorityMessageAlertSeenKeysByUserId,
    }),
    [
      accessRequests,
      adminReports,
      adminUsers,
      announcementEvents,
      archivedContacts,
      archivedGroups,
      contacts,
      deletedAnnouncementEventIds,
      extensionItems,
      groupMessagesByContact,
      groupMetadataById,
      groups,
      helpItems,
      kanbanBoardsByUserId,
      loanRequests,
      messagesByContact,
      priorityMessageAlertSeenKeysByUserId,
      serviceTickets,
    ],
  );

  const applyBackendState = useCallback((state: AppState) => {
    const nextState = mergeAppStates(latestAppStateRef.current, state);

    applyingBackendStateRef.current = true;
    latestAppStateRef.current = nextState;
    messagesByContactRef.current = nextState.messagesByContact;
    groupMessagesByContactRef.current = nextState.groupMessagesByContact;

    setContacts(nextState.contacts);
    setArchivedContacts(nextState.archivedContacts);
    setGroups(nextState.groups);
    setArchivedGroups(nextState.archivedGroups);
    setMessagesByContact(nextState.messagesByContact);
    setGroupMessagesByContact(nextState.groupMessagesByContact);
    setGroupMetadataById(nextState.groupMetadataById);
    setAccessRequests(nextState.accessRequests);
    setAdminUsers(nextState.adminUsers);
    setCurrentSessionUser((currentUser) => {
      if (!currentUser) return currentUser;

      const currentEmail = currentUser.email.toLowerCase();
      const stateUser = nextState.adminUsers.find(
        (user) =>
          user.id === currentUser.id ||
          user.email.toLowerCase() === currentEmail,
      );

      if (!stateUser) return currentUser;

      const nextUser = {
        ...currentUser,
        name: stateUser.name,
        email: stateUser.email.toLowerCase(),
        sector: stateUser.sector,
        isAdmin: stateUser.isAdmin,
        avatar: stateUser.avatar ?? currentUser.avatar,
        about: stateUser.about ?? currentUser.about,
        chatStatus: stateUser.chatStatus ?? currentUser.chatStatus,
        workStatus: stateUser.workStatus ?? currentUser.workStatus,
        lastSeenAt: stateUser.lastSeenAt ?? currentUser.lastSeenAt,
      };

      if (
        nextUser.name === currentUser.name &&
        nextUser.email === currentUser.email &&
        nextUser.sector === currentUser.sector &&
        nextUser.isAdmin === currentUser.isAdmin &&
        nextUser.avatar === currentUser.avatar &&
        nextUser.about === currentUser.about &&
        nextUser.chatStatus === currentUser.chatStatus &&
        nextUser.workStatus === currentUser.workStatus &&
        getDateTimeValue(nextUser.lastSeenAt) ===
          getDateTimeValue(currentUser.lastSeenAt)
      ) {
        return currentUser;
      }

      return nextUser;
    });
    setAdminReports(nextState.adminReports);
    setServiceTickets(nextState.serviceTickets);
    setLoanRequests(nextState.loanRequests);
    setAnnouncementEvents(nextState.announcementEvents);
    setDeletedAnnouncementEventIds(nextState.deletedAnnouncementEventIds);
    setKanbanBoardsByUserId(nextState.kanbanBoardsByUserId);
    setPriorityMessageAlertSeenKeysByUserId(
      nextState.priorityMessageAlertSeenKeysByUserId,
    );
    setHelpItems(nextState.helpItems);
    setExtensionItems(nextState.extensionItems);
    setSelectedContact((currentContact) =>
      currentContact
        ? ([...nextState.contacts, ...nextState.archivedContacts].find(
            (contact) => contact.id === currentContact.id,
          ) ?? currentContact)
        : null,
    );
    setSelectedGroup((currentGroup) =>
      currentGroup
        ? ([...nextState.groups, ...nextState.archivedGroups].find(
            (group) => group.id === currentGroup.id,
          ) ?? null)
        : null,
    );
    setTimeout(() => {
      applyingBackendStateRef.current = false;

      if (
        serializeAppState(latestAppStateRef.current) !==
        lastSavedStateRef.current
      ) {
        window.setTimeout(() => flushBackendStateSaveRef.current(), 0);
      }
    }, 0);
  }, []);

  const refreshBackendState = useCallback(() => {
    if (backendRefreshInFlightRef.current) {
      backendRefreshPendingRef.current = true;
      return;
    }

    backendRefreshInFlightRef.current = true;

    fetchBackendState()
      .then((envelope) => {
        applyBackendState(envelope.state);
        lastSavedStateRef.current = serializeAppState(envelope.state);
      })
      .catch((error) => {
        if (!isTransientBackendFetchError(error)) {
          console.error(error);
        }
      })
      .finally(() => {
        backendRefreshInFlightRef.current = false;

        if (backendRefreshPendingRef.current) {
          backendRefreshPendingRef.current = false;
          window.setTimeout(() => refreshBackendStateRef.current(), 0);
        }
      });
  }, [applyBackendState]);

  useEffect(() => {
    typingIndicatorsRef.current = typingIndicators;
  }, [typingIndicators]);

  const applyTypingRealtimeEvent = useCallback(
    (payload: RealtimeEventPayload["payload"]) => {
      const typing = payload?.typing;
      const scope = typing?.scope;
      const targetId = typing?.targetId;
      const userId = typing?.userId;
      const userName = typing?.userName;

      if (!scope || !targetId || !userId || !userName) {
        return;
      }

      const indicatorKey = getTypingIndicatorKey(
        scope,
        targetId,
        userId,
      );

      setTypingIndicators((currentIndicators) => {
        const nextIndicators = { ...currentIndicators };

        if (!typing.isTyping) {
          if (!currentIndicators[indicatorKey]) return currentIndicators;

          delete nextIndicators[indicatorKey];
          typingIndicatorsRef.current = nextIndicators;
          return nextIndicators;
        }

        nextIndicators[indicatorKey] = {
          scope,
          userId,
          userName,
          ...(scope === "chat"
            ? { recipientId: targetId }
            : { groupId: targetId }),
          updatedAt: typing.updatedAt ? new Date(typing.updatedAt) : new Date(),
        };
        typingIndicatorsRef.current = nextIndicators;

        return nextIndicators;
      });
    },
    [],
  );

  useEffect(() => {
    refreshBackendStateRef.current = refreshBackendState;
  }, [refreshBackendState]);

  useEffect(() => {
    let cancelled = false;
    backendClientIdRef.current = createBackendClientId();

    fetchBackendState()
      .then((envelope) => {
        if (cancelled) return;

        applyBackendState(envelope.state);
        lastSavedStateRef.current = serializeAppState(envelope.state);
      })
      .catch((error) => {
        if (!isTransientBackendFetchError(error)) {
          console.error(error);
        }
        lastSavedStateRef.current = serializeAppState(EMPTY_APP_STATE);
      })
      .finally(() => {
        if (!cancelled) {
          backendReadyRef.current = true;
          setIsBackendReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [applyBackendState]);

  useEffect(() => {
    if (usedInitialSessionRef.current) return;

    let cancelled = false;

    fetchCurrentSession()
      .then((user) => {
        if (cancelled || !user) return;

        setCurrentSessionUser({
          ...user,
          avatar: user.avatar ?? "",
          lastSeenAt: user.lastSeenAt ?? new Date(),
        });
        setIsAuthenticated(true);
      })
      .catch((error) => console.error(error))
      .finally(() => {
        if (!cancelled) {
          setIsCheckingSession(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isCheckingSession && isAuthenticated && activeNav === "admin") {
      if (currentSessionUser?.isAdmin !== true) {
        const timeoutId = window.setTimeout(() => {
          router.replace(NAV_PATHS.chat);
        }, 0);

        return () => window.clearTimeout(timeoutId);
      }
    }
  }, [
    activeNav,
    currentSessionUser?.isAdmin,
    isAuthenticated,
    isCheckingSession,
    router,
  ]);

  useEffect(() => {
    if (!backendClientIdRef.current) return;

    const events = new EventSource("/api/realtime?lastEventId=latest");

    events.addEventListener("state", (event) => {
      const payload = JSON.parse(
        (event as MessageEvent).data,
      ) as RealtimeEventPayload;

      if (payload.payload?.key === "typing") {
        applyTypingRealtimeEvent(payload.payload);
        return;
      }

      if (payload.payload?.key === "presence") {
        refreshBackendStateRef.current();
        return;
      }

      if (payload.clientId === backendClientIdRef.current) return;

      refreshBackendStateRef.current();
    });

    return () => {
      events.close();
    };
  }, [applyBackendState, applyTypingRealtimeEvent]);

  const flushBackendStateSave = useCallback(() => {
    if (!backendReadyRef.current || applyingBackendStateRef.current) return;

    if (stateSaveInFlightRef.current) {
      stateSavePendingRef.current = true;
      return;
    }

    const stateToSave = latestAppStateRef.current;
    const serializedState = serializeAppState(stateToSave);

    if (serializedState === lastSavedStateRef.current) {
      stateSavePendingRef.current = false;
      return;
    }

    stateSaveInFlightRef.current = true;
    stateSavePendingRef.current = false;

    saveBackendState(
      stateToSave,
      backendClientIdRef.current || "unknown-client",
      "autosave",
    )
      .then((envelope) => {
        const savedState = serializeAppState(envelope.state);

        lastSavedStateRef.current = savedState;

        if (serializeAppState(latestAppStateRef.current) !== savedState) {
          applyBackendState(envelope.state);
        }
      })
      .catch((error) => console.error(error))
      .finally(() => {
        stateSaveInFlightRef.current = false;

        if (
          stateSavePendingRef.current ||
          serializeAppState(latestAppStateRef.current) !==
            lastSavedStateRef.current
        ) {
          window.setTimeout(() => flushBackendStateSaveRef.current(), 0);
        }
      });
  }, [applyBackendState]);

  useEffect(() => {
    flushBackendStateSaveRef.current = flushBackendStateSave;
  }, [flushBackendStateSave]);

  useEffect(() => {
    latestAppStateRef.current = currentAppState;

    if (!backendReadyRef.current || applyingBackendStateRef.current) return;

    const serializedState = serializeAppState(currentAppState);
    if (serializedState === lastSavedStateRef.current) return;

    const timeoutId = window.setTimeout(flushBackendStateSave, 350);

    return () => window.clearTimeout(timeoutId);
  }, [currentAppState, flushBackendStateSave]);

  const directoryUsersByIdentity = useMemo(() => {
    const usersByIdentity = new Map<string, DirectoryUser>();

    directoryUsers.forEach((user) => {
      usersByIdentity.set(`id:${user.id}`, user);
      usersByIdentity.set(`email:${user.email.toLowerCase()}`, user);
    });

    return usersByIdentity;
  }, [directoryUsers]);
  const directoryUsersById = useMemo(() => {
    const usersById = new Map<string, DirectoryUser>();

    directoryUsers.forEach((user) => {
      usersById.set(user.id, user);
    });

    return usersById;
  }, [directoryUsers]);
  const hydrateContactProfile = useCallback(
    (contact: Contact) => {
      const user =
        directoryUsersByIdentity.get(`id:${contact.id}`) ??
        directoryUsersByIdentity.get(`email:${contact.email.toLowerCase()}`);

      if (!user) return contact;

      return {
        ...contact,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        about: user.about,
        isOnline: user.isOnline,
        chatStatus: user.chatStatus,
        workStatus: user.workStatus,
        lastSeenAt: user.lastSeenAt,
      };
    },
    [directoryUsersByIdentity],
  );
  const isMessageFromCurrentUser = useCallback(
    (message: Message) =>
      message.senderId
        ? message.senderId === currentAnnouncementUser.id
        : message.isOwn,
    [currentAnnouncementUser.id],
  );
  const getDisplayedDirectMessagesFromStore = useCallback(
    (contactId: string, sourceMessagesByContact: Record<string, Message[]>) => {
      if (
        !currentAnnouncementUser.id ||
        contactId === currentAnnouncementUser.id
      ) {
        return [];
      }

      const conversationKey = getDirectConversationKey(
        currentAnnouncementUser.id,
        contactId,
      );
      const messagesById = new Map<string, Message>();
      const addMessage = (message: Message) => {
        if (isMessageHiddenForUser(message, currentAnnouncementUser.id)) {
          return;
        }

        messagesById.set(message.id, {
          ...message,
          isOwn: isMessageFromCurrentUser(message),
        });
      };

      (sourceMessagesByContact[contactId] ?? [])
        .filter(
          (message) =>
            !message.senderId ||
            message.senderId === currentAnnouncementUser.id,
        )
        .forEach(addMessage);
      (sourceMessagesByContact[currentAnnouncementUser.id] ?? [])
        .filter((message) => message.senderId === contactId)
        .forEach(addMessage);
      (sourceMessagesByContact[conversationKey] ?? []).forEach(addMessage);

      return Array.from(messagesById.values()).sort(
        (firstMessage, secondMessage) => {
          const timeDifference =
            firstMessage.timestamp.getTime() -
            secondMessage.timestamp.getTime();

          return (
            timeDifference || firstMessage.id.localeCompare(secondMessage.id)
          );
        },
      );
    },
    [currentAnnouncementUser.id, isMessageFromCurrentUser],
  );
  const getDisplayedDirectMessages = useCallback(
    (contactId: string) =>
      getDisplayedDirectMessagesFromStore(contactId, messagesByContact),
    [getDisplayedDirectMessagesFromStore, messagesByContact],
  );
  const getUnreadDirectCount = useCallback(
    (contactId: string) => {
      if (activeNav === "chat" && selectedContact?.id === contactId) return 0;

      return getDisplayedDirectMessages(contactId).filter(
        (message) =>
          !isMessageFromCurrentUser(message) &&
          !message.deletedForEveryone &&
          message.status !== "read",
      ).length;
    },
    [
      activeNav,
      getDisplayedDirectMessages,
      isMessageFromCurrentUser,
      selectedContact?.id,
    ],
  );
  const getUnreadGroupCount = useCallback(
    (groupId: string) => {
      if (activeNav === "grupos" && selectedGroup?.id === groupId) return 0;

      return (groupMessagesByContact[groupId] ?? []).filter(
        (message) =>
          !isMessageHiddenForUser(message, currentAnnouncementUser.id) &&
          !isMessageFromCurrentUser(message) &&
          !message.deletedForEveryone &&
          !isGroupMessageReadByUser(message, currentAnnouncementUser.id),
      ).length;
    },
    [
      activeNav,
      currentAnnouncementUser.id,
      groupMessagesByContact,
      isMessageFromCurrentUser,
      selectedGroup?.id,
    ],
  );
  const isUserTypingToCurrentUser = useCallback(
    (contactId: string) => {
      const indicator =
        typingIndicators[
          getTypingIndicatorKey("chat", currentAnnouncementUser.id, contactId)
        ];

      return Boolean(
        indicator &&
        Date.now() - new Date(indicator.updatedAt).getTime() <
          TYPING_INDICATOR_TTL_MS,
      );
    },
    [currentAnnouncementUser.id, typingIndicators],
  );
  const getGroupTypingText = useCallback(
    (groupId: string) => {
      const typingUsers = Object.values(typingIndicators)
        .filter(
          (indicator) =>
            indicator.scope === "group" &&
            indicator.groupId === groupId &&
            indicator.userId !== currentAnnouncementUser.id &&
            Date.now() - new Date(indicator.updatedAt).getTime() <
              TYPING_INDICATOR_TTL_MS,
        )
        .map((indicator) => indicator.userName);

      if (typingUsers.length === 0) return undefined;
      if (typingUsers.length === 1) {
        return `${typingUsers[0]} está digitando...`;
      }
      if (typingUsers.length === 2) {
        return `${typingUsers[0]} e ${typingUsers[1]} estão digitando...`;
      }

      return `${typingUsers[0]} e mais ${
        typingUsers.length - 1
      } estão digitando...`;
    },
    [currentAnnouncementUser.id, typingIndicators],
  );
  const buildContactSummary = useCallback(
    (contact: Contact, updatedMessages: Message[]): Contact => {
      const visibleMessages = updatedMessages.filter(
        (message) =>
          !isMessageHiddenForUser(message, currentAnnouncementUser.id),
      );
      const lastMessage = getLastVisibleConversationMessage(visibleMessages);

      if (!lastMessage) {
        return {
          ...contact,
          lastMessage:
            contact.lastMessage === "Conversa limpa"
              ? "Conversa limpa"
              : "Nova conversa",
          lastMessageIsOwn: undefined,
          lastMessageStatus: undefined,
          unreadCount: 0,
        };
      }

      const lastMessageIsOwn = isMessageFromCurrentUser(lastMessage);

      return {
        ...contact,
        lastMessage: getConversationMessagePreview(lastMessage),
        lastMessageTime: lastMessage.timestamp,
        lastMessageIsOwn,
        lastMessageStatus: lastMessageIsOwn ? lastMessage.status : undefined,
        unreadCount: lastMessageIsOwn ? 0 : contact.unreadCount,
      };
    },
    [currentAnnouncementUser.id, isMessageFromCurrentUser],
  );
  const displayContactBuckets = useMemo<{
    active: Contact[];
    archived: Contact[];
  }>(() => {
    const currentUserId = currentAnnouncementUser.id;
    const contactIds = new Set<string>();
    const storedContacts = [...contacts, ...archivedContacts];
    const addContactId = (contactId?: string) => {
      if (
        !contactId ||
        contactId === currentUserId ||
        !directoryUsersById.has(contactId)
      ) {
        return;
      }

      contactIds.add(contactId);
    };

    if (!currentUserId) {
      return {
        active: [],
        archived: [],
      };
    }

    storedContacts.forEach((contact) => {
      if (isConversationHiddenForUser(contact, currentUserId)) return;

      const user =
        directoryUsersByIdentity.get(`id:${contact.id}`) ??
        directoryUsersByIdentity.get(`email:${contact.email.toLowerCase()}`);
      const belongsToCurrentUser =
        contact.ownerId === currentUserId ||
        (!contact.ownerId && selectedContact?.id === user?.id);

      if (belongsToCurrentUser) {
        addContactId(user?.id);
      }
    });

    Object.entries(messagesByContact).forEach(([conversationId, messages]) => {
      const visibleMessagesForCurrentUser = messages.filter(
        (message) => !isMessageHiddenForUser(message, currentUserId),
      );

      if (visibleMessagesForCurrentUser.length === 0) return;

      const directParticipants = parseDirectConversationKey(conversationId);

      if (directParticipants) {
        const [firstUserId, secondUserId] = directParticipants;

        if (firstUserId === currentUserId) addContactId(secondUserId);
        if (secondUserId === currentUserId) addContactId(firstUserId);

        return;
      }

      if (conversationId === currentUserId) {
        visibleMessagesForCurrentUser.forEach((message) =>
          addContactId(message.senderId),
        );
        return;
      }

      if (
        visibleMessagesForCurrentUser.some(
          (message) => !message.senderId || message.senderId === currentUserId,
        )
      ) {
        addContactId(conversationId);
      }
    });

    const displayableContacts = Array.from(contactIds)
      .map((contactId): Contact | null => {
        const user = directoryUsersById.get(contactId);

        if (!user) return null;

        const storedContact =
          storedContacts.find(
            (contact) =>
              contact.ownerId === currentUserId &&
              (contact.id === user.id ||
                contact.email.toLowerCase() === user.email.toLowerCase()),
          ) ??
          storedContacts.find(
            (contact) =>
              !contact.ownerId &&
              (contact.id === user.id ||
                contact.email.toLowerCase() === user.email.toLowerCase()),
          ) ??
          storedContacts.find(
            (contact) =>
              contact.id === user.id ||
              contact.email.toLowerCase() === user.email.toLowerCase(),
          );
        const contact: Contact = {
          id: user.id,
          ownerId: currentUserId,
          name: user.name,
          avatar: user.avatar,
          email: user.email,
          about: user.about,
          lastMessage: storedContact?.lastMessage ?? "Nova conversa",
          lastMessageTime: storedContact?.lastMessageTime ?? new Date(0),
          unreadCount: storedContact?.unreadCount ?? 0,
          isOnline: user.isOnline,
          chatStatus: user.chatStatus,
          workStatus: user.workStatus,
          lastSeenAt: user.lastSeenAt,
          isTyping: false,
          isArchived: storedContact?.isArchived ?? false,
          isMuted: storedContact?.isMuted ?? false,
          isPinned: storedContact?.isPinned ?? false,
        };
        const conversationMessages = getDisplayedDirectMessages(contact.id);
        const latestSummary = buildContactSummary(
          contact,
          conversationMessages,
        );

        return {
          ...latestSummary,
          unreadCount: getUnreadDirectCount(contact.id),
          isTyping: isUserTypingToCurrentUser(contact.id),
        };
      })
      .filter((contact): contact is Contact => contact !== null)

    return {
      active: displayableContacts.filter((contact) => !contact.isArchived),
      archived: displayableContacts.filter((contact) => contact.isArchived),
    };
  }, [
    archivedContacts,
    buildContactSummary,
    contacts,
    currentAnnouncementUser.id,
    directoryUsersById,
    directoryUsersByIdentity,
    getDisplayedDirectMessages,
    getUnreadDirectCount,
    isUserTypingToCurrentUser,
    messagesByContact,
    selectedContact?.id,
  ]);
  const displayContacts = showArchived
    ? displayContactBuckets.archived
    : displayContactBuckets.active;
  const visibleArchivedContactCount = displayContactBuckets.archived.length;
  const displayGroups = useMemo(
    () =>
      (showArchivedGroups
        ? archivedGroups
        : groups.filter((group) => !group.isArchived)
      )
        .filter(
          (group) =>
            !isConversationHiddenForUser(group, currentAnnouncementUser.id) &&
            canUserSeeGroup(
              group.id,
              currentAnnouncementUser.id,
              groupMetadataById,
            ),
        )
        .map((group) => {
          const visibleGroupMessages = (
            groupMessagesByContact[group.id] ?? []
          ).filter(
            (message) =>
              !isMessageHiddenForUser(message, currentAnnouncementUser.id),
          );
          const typingText = getGroupTypingText(group.id);
          const groupWithUserState = hydrateConversationStateForUser(
            group,
            currentAnnouncementUser.id,
          );

          return {
            ...buildContactSummary(groupWithUserState, visibleGroupMessages),
            unreadCount: getUnreadGroupCount(group.id),
            isTyping: Boolean(typingText),
            typingText,
          };
        }),
    [
      archivedGroups,
      buildContactSummary,
      currentAnnouncementUser.id,
      getGroupTypingText,
      getUnreadGroupCount,
      groupMetadataById,
      groupMessagesByContact,
      groups,
      showArchivedGroups,
    ],
  );
  const visibleArchivedGroupCount = useMemo(
    () =>
      archivedGroups.filter(
        (group) =>
          !isConversationHiddenForUser(group, currentAnnouncementUser.id) &&
          canUserSeeGroup(
            group.id,
            currentAnnouncementUser.id,
            groupMetadataById,
          ),
      ).length,
    [archivedGroups, currentAnnouncementUser.id, groupMetadataById],
  );

  useEffect(() => {
    if (showArchived && visibleArchivedContactCount === 0) {
      const timeoutId = window.setTimeout(() => {
        setShowArchived(false);
      }, 0);

      return () => window.clearTimeout(timeoutId);
    }
  }, [showArchived, visibleArchivedContactCount]);

  useEffect(() => {
    if (showArchivedGroups && visibleArchivedGroupCount === 0) {
      const timeoutId = window.setTimeout(() => {
        setShowArchivedGroups(false);
      }, 0);

      return () => window.clearTimeout(timeoutId);
    }
  }, [showArchivedGroups, visibleArchivedGroupCount]);

  const forwardTargets = useMemo<ForwardTarget[]>(() => {
    const visibleForwardGroups = [...groups, ...archivedGroups].filter(
      (group) =>
        !isConversationHiddenForUser(group, currentAnnouncementUser.id) &&
        canUserSeeGroup(
          group.id,
          currentAnnouncementUser.id,
          groupMetadataById,
        ),
    );

    return [
      ...directoryUsers.map((user) => ({
        ...user,
        kind: "contact" as const,
      })),
      ...visibleForwardGroups.map(getGroupForwardTarget),
    ];
  }, [
    archivedGroups,
    currentAnnouncementUser.id,
    directoryUsers,
    groupMetadataById,
    groups,
  ]);
  const selectedGroupForwardTargets = useMemo(
    () =>
      forwardTargets.filter(
        (target) =>
          target.kind === "contact" || target.id !== selectedGroup?.id,
      ),
    [forwardTargets, selectedGroup?.id],
  );
  const isStoredDirectContactForCurrentUser = useCallback(
    (contact: Contact, contactId: string) =>
      contact.id === contactId &&
      (!contact.ownerId || contact.ownerId === currentAnnouncementUser.id),
    [currentAnnouncementUser.id],
  );
  const upsertDirectContactForCurrentUser = useCallback(
    (currentContacts: Contact[], contact: Contact) => [
      contact,
      ...currentContacts.filter(
        (currentContact) =>
          !isStoredDirectContactForCurrentUser(currentContact, contact.id),
      ),
    ],
    [isStoredDirectContactForCurrentUser],
  );
  const upsertConversationById = useCallback(
    (currentContacts: Contact[], contact: Contact) => [
      contact,
      ...currentContacts.filter(
        (currentContact) => currentContact.id !== contact.id,
      ),
    ],
    [],
  );
  const toOwnedDirectContact = useCallback(
    (contact: Contact, updates: Partial<Contact> = {}): Contact => ({
      ...contact,
      ...updates,
      ownerId: currentAnnouncementUser.id,
    }),
    [currentAnnouncementUser.id],
  );
  const notificationMessageSnapshot = useMemo(() => {
    if (!currentAnnouncementUser.id) {
      return {
        allKeys: new Set<string>(),
        audibleKeys: new Set<string>(),
      };
    }

    const allKeys = new Set<string>();
    const audibleKeys = new Set<string>();

    displayContacts.forEach((contact) => {
      const canPlaySoundForContact =
        !(activeNav === "chat" && contact.id === selectedContact?.id) &&
        !contact.isMuted;

      getDisplayedDirectMessages(contact.id).forEach((message) => {
        if (
          isMessageFromCurrentUser(message) ||
          message.deletedForEveryone ||
          message.status === "read" ||
          isMessageHiddenForUser(message, currentAnnouncementUser.id)
        ) {
          return;
        }

        const notificationKey = getNotificationMessageKey(
          "chat",
          contact.id,
          message,
        );

        allKeys.add(notificationKey);
        if (canPlaySoundForContact) {
          audibleKeys.add(notificationKey);
        }
      });
    });

    displayGroups.forEach((group) => {
      const canPlaySoundForGroup =
        !(activeNav === "grupos" && group.id === selectedGroup?.id) &&
        !group.isMuted;

      (groupMessagesByContact[group.id] ?? []).forEach((message) => {
        if (
          isMessageFromCurrentUser(message) ||
          message.deletedForEveryone ||
          isGroupMessageReadByUser(message, currentAnnouncementUser.id) ||
          isMessageHiddenForUser(message, currentAnnouncementUser.id)
        ) {
          return;
        }

        const notificationKey = getNotificationMessageKey(
          "group",
          group.id,
          message,
        );

        allKeys.add(notificationKey);
        if (canPlaySoundForGroup) {
          audibleKeys.add(notificationKey);
        }
      });
    });

    return { allKeys, audibleKeys };
  }, [
    activeNav,
    currentAnnouncementUser.id,
    displayContacts,
    displayGroups,
    getDisplayedDirectMessages,
    groupMessagesByContact,
    isMessageFromCurrentUser,
    selectedContact?.id,
    selectedGroup?.id,
  ]);
  useEffect(() => {
    if (!isAuthenticated || !currentAnnouncementUser.id) {
      knownNotificationMessageKeysRef.current = new Set();
      notificationBaselineUserIdRef.current = "";
      return;
    }

    if (!isBackendReady) return;

    const { allKeys, audibleKeys } = notificationMessageSnapshot;

    if (notificationBaselineUserIdRef.current !== currentAnnouncementUser.id) {
      let storedKeys: string[] = [];

      try {
        const storedValue = window.localStorage.getItem(
          getNotificationSoundStorageKey(currentAnnouncementUser.id),
        );
        storedKeys = storedValue ? JSON.parse(storedValue) : [];
      } catch {
        storedKeys = [];
      }

      knownNotificationMessageKeysRef.current = new Set([
        ...storedKeys,
        ...allKeys,
      ]);
      notificationBaselineUserIdRef.current = currentAnnouncementUser.id;

      try {
        window.localStorage.setItem(
          getNotificationSoundStorageKey(currentAnnouncementUser.id),
          JSON.stringify(
            Array.from(knownNotificationMessageKeysRef.current).slice(
              -NOTIFICATION_SOUND_STORAGE_LIMIT,
            ),
          ),
        );
      } catch {
        // O som continua funcionando mesmo se o navegador bloquear storage.
      }

      return;
    }

    const knownKeys = knownNotificationMessageKeysRef.current;
    const hasNewAudibleNotification = Array.from(audibleKeys).some(
      (notificationKey) => !knownKeys.has(notificationKey),
    );

    knownNotificationMessageKeysRef.current = new Set([
      ...knownKeys,
      ...allKeys,
    ]);

    try {
      window.localStorage.setItem(
        getNotificationSoundStorageKey(currentAnnouncementUser.id),
        JSON.stringify(
          Array.from(knownNotificationMessageKeysRef.current).slice(
            -NOTIFICATION_SOUND_STORAGE_LIMIT,
          ),
        ),
      );
    } catch {
      // O som continua funcionando mesmo se o navegador bloquear storage.
    }

    if (!hasNewAudibleNotification) return;

    playMessageNotificationSound();
  }, [
    currentAnnouncementUser.id,
    isBackendReady,
    isAuthenticated,
    notificationMessageSnapshot,
    playMessageNotificationSound,
  ]);
  const selectedMessages = selectedContact
    ? getDisplayedDirectMessages(selectedContact.id)
    : [];
  const selectedDisplayContact = selectedContact
    ? (displayContacts.find((contact) => contact.id === selectedContact.id) ??
      hydrateContactProfile(selectedContact))
    : null;
  const selectedDisplayGroup = selectedGroup
    ? (displayGroups.find((group) => group.id === selectedGroup.id) ??
      selectedGroup)
    : null;
  const selectedGroupMessages = selectedGroup
    ? (groupMessagesByContact[selectedGroup.id] ?? [])
        .filter(
          (message) =>
            !isMessageHiddenForUser(message, currentAnnouncementUser.id),
        )
        .map((message) => ({
          ...message,
          isOwn: isMessageFromCurrentUser(message),
        }))
    : [];
  const selectedGroupMetadata = selectedGroup
    ? groupMetadataById[selectedGroup.id]
    : undefined;
  const selectedGroupParticipants = selectedGroupMetadata
    ? getGroupMemberIds(selectedGroupMetadata)
        .map((participantId) =>
          directoryUsers.find((user) => user.id === participantId),
        )
        .filter((user): user is DirectoryUser => user !== undefined)
    : [];
  const selectedGroupAdminIds = selectedGroupMetadata
    ? Array.from(
        new Set(
          [selectedGroupMetadata.creatorId, ...selectedGroupMetadata.adminIds]
            .filter(Boolean),
        ),
      )
    : [];
  const canManageSelectedGroup =
    selectedGroup !== null &&
    selectedGroupMetadata !== undefined &&
    canUserSeeGroup(
      selectedGroup.id,
      currentAnnouncementUser.id,
      groupMetadataById,
    ) &&
    selectedGroupAdminIds.includes(currentAnnouncementUser.id);
  useEffect(() => {
    if (!selectedGroup || !currentAnnouncementUser.id) return;
    if (
      canUserSeeGroup(
        selectedGroup.id,
        currentAnnouncementUser.id,
        groupMetadataById,
      )
    ) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setSelectedGroup(null);
      setActiveSidePanel(null);
      setHighlightedMessageId(null);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [currentAnnouncementUser.id, groupMetadataById, selectedGroup]);
  useEffect(() => {
    if (selectedContact?.id !== currentAnnouncementUser.id) return;

    const timeoutId = window.setTimeout(() => {
      setSelectedContact(null);
      setActiveSidePanel(null);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [currentAnnouncementUser.id, selectedContact?.id]);
  const activeKanbanDueReminderCard = activeKanbanDueReminderCardId
    ? kanbanCardsById[activeKanbanDueReminderCardId]
    : null;
  const activeLoanReminder = activeLoanReminderId
    ? (loanRequests.find((loan) => loan.id === activeLoanReminderId) ?? null)
    : null;
  const findPriorityMessageAlert = useCallback((): PriorityMessageAlert => {
    if (!isAuthenticated || !currentAnnouncementUser.id) return null;

    const currentUserId = currentAnnouncementUser.id;
    const seenKeys = seenPriorityMessageKeysRef.current;
    const contactMap = new Map(
      [...displayContacts, ...contacts, ...archivedContacts].map((contact) => [
        contact.id,
        contact,
      ]),
    );
    const groupMap = new Map(
      [...groups, ...archivedGroups].map((group) => [group.id, group]),
    );

    for (const [conversationId, messages] of Object.entries(
      messagesByContact,
    )) {
      const directParticipants = parseDirectConversationKey(conversationId);
      const directContactId = directParticipants
        ? directParticipants[0] === currentUserId
          ? directParticipants[1]
          : directParticipants[1] === currentUserId
            ? directParticipants[0]
            : null
        : null;

      if (!directContactId && conversationId !== currentUserId) continue;

      const message = messages.find((currentMessage) => {
        if (
          !currentMessage.isPriority ||
          currentMessage.deletedForEveryone ||
          isMessageHiddenForUser(currentMessage, currentUserId)
        ) {
          return false;
        }

        if (
          !currentMessage.senderId ||
          currentMessage.senderId === currentUserId
        ) {
          return false;
        }

        const alertContactId =
          directContactId ?? currentMessage.senderId ?? conversationId;

        return !seenKeys.has(
          getPriorityMessageAlertKey("chat", alertContactId, currentMessage),
        );
      });

      if (!message) continue;

      const sender = directoryUsers.find(
        (user) => user.id === message.senderId,
      );
      const contactId = directContactId ?? message.senderId ?? conversationId;
      const baseContact = contactMap.get(contactId);
      const conversation: Contact = {
        ...(baseContact ?? {
          id: contactId,
          name: sender?.name ?? "Contato",
          avatar: sender?.avatar ?? "",
          email: sender?.email ?? "",
          about: sender?.about ?? "",
          lastMessage: getConversationMessagePreview(message),
          lastMessageTime: message.timestamp,
          unreadCount: 1,
          isOnline: sender?.isOnline ?? false,
          chatStatus: sender?.chatStatus ?? "offline",
          workStatus: sender?.workStatus,
          isTyping: false,
          isArchived: false,
          isMuted: false,
          isPinned: false,
        }),
        name: sender?.name ?? baseContact?.name ?? "Contato",
        avatar: sender?.avatar ?? baseContact?.avatar ?? "",
        email: sender?.email ?? baseContact?.email ?? "",
        about: sender?.about ?? baseContact?.about ?? "",
      };

      return {
        conversation,
        message,
        scope: "chat",
        senderName: sender?.name ?? message.senderName ?? "Contato",
      };
    }

    for (const [groupId, messages] of Object.entries(groupMessagesByContact)) {
      if (!canUserSeeGroup(groupId, currentUserId, groupMetadataById)) continue;

      const message = messages.find((currentMessage) => {
        if (
          !currentMessage.isPriority ||
          currentMessage.deletedForEveryone ||
          isMessageHiddenForUser(currentMessage, currentUserId)
        ) {
          return false;
        }

        if (
          !currentMessage.senderId ||
          currentMessage.senderId === currentUserId
        ) {
          return false;
        }

        return !seenKeys.has(
          getPriorityMessageAlertKey("group", groupId, currentMessage),
        );
      });

      if (!message) continue;

      const group = groupMap.get(groupId);

      if (!group) continue;

      return {
        conversation: group,
        message,
        scope: "group",
        senderName: message.senderName ?? "Participante",
      };
    }

    return null;
  }, [
    archivedContacts,
    archivedGroups,
    contacts,
    currentAnnouncementUser.id,
    displayContacts,
    directoryUsers,
    groupMessagesByContact,
    groupMetadataById,
    groups,
    isAuthenticated,
    messagesByContact,
  ]);
  const reminderCandidate = useMemo(() => {
    if (!isAuthenticated) return null;
    if (!canDeliverAnnouncementReminder(reminderNow)) return null;

    return (
      announcementEvents
        .filter((event) => event.creatorId !== currentAnnouncementUser.id)
        .filter((event) =>
          event.recipientIds.includes(currentAnnouncementUser.id),
        )
        .filter((event) =>
          isReminderDay(getDayDifference(reminderNow, event.scheduledAt)),
        )
        .sort(
          (firstEvent, secondEvent) =>
            getDayDifference(reminderNow, firstEvent.scheduledAt) -
              getDayDifference(reminderNow, secondEvent.scheduledAt) ||
            firstEvent.scheduledAt.getTime() -
              secondEvent.scheduledAt.getTime(),
        )
        .find(
          (event) =>
            !dismissedAnnouncementReminderKeys.includes(
              getAnnouncementReminderKey(
                currentAnnouncementUser.id,
                event,
                reminderNow,
              ),
            ),
        ) ?? null
    );
  }, [
    announcementEvents,
    currentAnnouncementUser.id,
    dismissedAnnouncementReminderKeys,
    isAuthenticated,
    reminderNow,
  ]);
  const kanbanDueReminderCandidate = useMemo(() => {
    if (!isAuthenticated) return null;
    if (!canDeliverAnnouncementReminder(reminderNow)) return null;

    const todayKey = getDateKey(reminderNow);

    return (
      Object.values(kanbanCardsById)
        .filter((card) => !card.archived)
        .filter((card) => card.dueDate === todayKey)
        .filter((card) => card.dueReminderEnabled !== false)
        .find(
          (card) =>
            !dismissedKanbanDueReminderKeys.includes(
              getKanbanDueReminderKey(
                currentAnnouncementUser.id,
                card,
                reminderNow,
              ),
            ),
        ) ?? null
    );
  }, [
    currentAnnouncementUser.id,
    dismissedKanbanDueReminderKeys,
    isAuthenticated,
    kanbanCardsById,
    reminderNow,
  ]);
  const loanReminderCandidate = useMemo(() => {
    if (!isAuthenticated) return null;
    if (!canDeliverAnnouncementReminder(reminderNow)) return null;

    return (
      loanRequests
        .filter((loan) => loan.requesterId === currentAnnouncementUser.id)
        .filter((loan) => shouldShowLoanReminder(loan, reminderNow))
        .sort(
          (firstLoan, secondLoan) =>
            firstLoan.requestedReturnDate.localeCompare(
              secondLoan.requestedReturnDate,
            ) || firstLoan.createdAt.getTime() - secondLoan.createdAt.getTime(),
        )
        .find(
          (loan) =>
            !dismissedLoanReminderKeys.includes(
              getLoanReminderKey(currentAnnouncementUser.id, loan, reminderNow),
            ),
        ) ?? null
    );
  }, [
    currentAnnouncementUser.id,
    dismissedLoanReminderKeys,
    isAuthenticated,
    loanRequests,
    reminderNow,
  ]);
  const getGroupParticipantsForReport = (groupId: string) => {
    const metadata = groupMetadataById[groupId];

    if (!metadata) return [];

    return getGroupMemberIds(metadata)
      .map((participantId) =>
        directoryUsers.find((user) => user.id === participantId),
      )
      .filter((user): user is DirectoryUser => user !== undefined);
  };
  const buildReportEvidenceMessages = (
    conversation: Contact,
    kind: "contact" | "group",
    messages: Message[],
    limit?: number,
  ) => {
    const groupParticipants =
      kind === "group" ? getGroupParticipantsForReport(conversation.id) : [];
    const visibleMessages = messages.filter((message) => !message.deletedForMe);
    const evidenceMessages =
      limit === undefined ? visibleMessages : visibleMessages.slice(-limit);

    return evidenceMessages.map((message) =>
      buildReportMessageSnapshot(
        message,
        conversation,
        kind === "group",
        groupParticipants,
      ),
    );
  };

  useEffect(() => {
    messagesByContactRef.current = messagesByContact;
  }, [messagesByContact]);
  useEffect(() => {
    groupMessagesByContactRef.current = groupMessagesByContact;
  }, [groupMessagesByContact]);
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setReminderNow(new Date());
    }, 60 * 1000);

    return () => window.clearInterval(intervalId);
  }, []);
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setTypingIndicators((currentIndicators) => {
        const now = Date.now();
        const activeEntries = Object.entries(currentIndicators).filter(
          ([, indicator]) =>
            now - new Date(indicator.updatedAt).getTime() <
            TYPING_INDICATOR_TTL_MS,
        );

        if (activeEntries.length === Object.keys(currentIndicators).length) {
          return currentIndicators;
        }

        const nextIndicators = Object.fromEntries(activeEntries);
        typingIndicatorsRef.current = nextIndicators;

        return nextIndicators;
      });
    }, 2000);

    return () => window.clearInterval(intervalId);
  }, []);
  useEffect(() => {
    if (!isAuthenticated) return;

    const timeoutId = window.setTimeout(() => {
      let nextReminderKeys: string[] = [];

      try {
        const storedReminderKeys = window.localStorage.getItem(
          getReminderStorageKey(currentAnnouncementUser.id),
        );

        nextReminderKeys = storedReminderKeys
          ? JSON.parse(storedReminderKeys)
          : [];
      } catch {
        nextReminderKeys = [];
      }

      setDismissedAnnouncementReminderKeys(nextReminderKeys);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [currentAnnouncementUser.id, isAuthenticated]);
  useEffect(() => {
    if (!isAuthenticated) return;

    const timeoutId = window.setTimeout(() => {
      let nextReminderKeys: string[] = [];

      try {
        const storedReminderKeys = window.localStorage.getItem(
          getKanbanDueReminderStorageKey(currentAnnouncementUser.id),
        );

        nextReminderKeys = storedReminderKeys
          ? JSON.parse(storedReminderKeys)
          : [];
      } catch {
        nextReminderKeys = [];
      }

      setDismissedKanbanDueReminderKeys(nextReminderKeys);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [currentAnnouncementUser.id, isAuthenticated]);
  useEffect(() => {
    if (!isAuthenticated) return;

    const timeoutId = window.setTimeout(() => {
      let nextReminderKeys: string[] = [];

      try {
        const storedReminderKeys = window.localStorage.getItem(
          getLoanReminderStorageKey(currentAnnouncementUser.id),
        );

        nextReminderKeys = storedReminderKeys
          ? JSON.parse(storedReminderKeys)
          : [];
      } catch {
        nextReminderKeys = [];
      }

      setDismissedLoanReminderKeys(nextReminderKeys);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [currentAnnouncementUser.id, isAuthenticated]);
  useEffect(() => {
    if (!isAuthenticated || !currentAnnouncementUser.id) {
      seenPriorityMessageKeysRef.current = new Set();
      priorityMessageAlertBaselineUserIdRef.current = "";
      return;
    }

    if (!isBackendReady) return;
    const storedPriorityKeys =
      priorityMessageAlertSeenKeysByUserId[currentAnnouncementUser.id] ?? [];

    seenPriorityMessageKeysRef.current = new Set(storedPriorityKeys);

    priorityMessageAlertBaselineUserIdRef.current = currentAnnouncementUser.id;
  }, [
    currentAnnouncementUser.id,
    isBackendReady,
    isAuthenticated,
    priorityMessageAlertSeenKeysByUserId,
  ]);
  useEffect(() => {
    if (
      !isAuthenticated ||
      !currentAnnouncementUser.id ||
      priorityMessageAlertBaselineUserIdRef.current !==
        currentAnnouncementUser.id ||
      activeReminderEvent ||
      activePriorityMessageAlert ||
      activeLoanReminder ||
      activeKanbanDueReminderCard
    ) {
      return;
    }

    const priorityAlert = findPriorityMessageAlert();

    if (!priorityAlert) return;

    const timeoutId = window.setTimeout(() => {
      setActivePriorityMessageAlert(priorityAlert);
      setPriorityMessageCountdown(PRIORITY_MESSAGE_UNLOCK_SECONDS);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [
    activeKanbanDueReminderCard,
    activeLoanReminder,
    activePriorityMessageAlert,
    activeReminderEvent,
    currentAnnouncementUser.id,
    findPriorityMessageAlert,
    isAuthenticated,
  ]);
  useEffect(() => {
    if (!reminderCandidate) return;
    if (
      activePriorityMessageAlert ||
      activeLoanReminder ||
      activeKanbanDueReminderCard
    ) {
      return;
    }
    if (activeReminderEvent?.id === reminderCandidate.id) return;

    const timeoutId = window.setTimeout(() => {
      setActiveReminderEvent(reminderCandidate);
      setReminderCountdown(REMINDER_UNLOCK_SECONDS);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [
    activeKanbanDueReminderCard,
    activeLoanReminder,
    activePriorityMessageAlert,
    activeReminderEvent?.id,
    reminderCandidate,
  ]);
  useEffect(() => {
    if (!kanbanDueReminderCandidate) return;
    if (
      reminderCandidate ||
      activeReminderEvent ||
      activePriorityMessageAlert ||
      activeLoanReminder
    ) {
      return;
    }
    if (activeKanbanDueReminderCardId === kanbanDueReminderCandidate.id) return;

    const timeoutId = window.setTimeout(() => {
      setActiveKanbanDueReminderCardId(kanbanDueReminderCandidate.id);
      setKanbanDueReminderCountdown(KANBAN_DUE_REMINDER_UNLOCK_SECONDS);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [
    activeKanbanDueReminderCardId,
    activeLoanReminder,
    activePriorityMessageAlert,
    activeReminderEvent,
    kanbanDueReminderCandidate,
    reminderCandidate,
  ]);
  useEffect(() => {
    if (!loanReminderCandidate) return;
    if (
      reminderCandidate ||
      activeReminderEvent ||
      kanbanDueReminderCandidate ||
      activeKanbanDueReminderCard ||
      activePriorityMessageAlert
    ) {
      return;
    }
    if (activeLoanReminderId === loanReminderCandidate.id) return;

    const timeoutId = window.setTimeout(() => {
      setActiveLoanReminderId(loanReminderCandidate.id);
      setLoanReminderCountdown(LOAN_REMINDER_UNLOCK_SECONDS);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [
    activeKanbanDueReminderCard,
    activeLoanReminderId,
    activePriorityMessageAlert,
    activeReminderEvent,
    kanbanDueReminderCandidate,
    loanReminderCandidate,
    reminderCandidate,
  ]);
  useEffect(() => {
    if (!activeReminderEvent || reminderCountdown <= 0) return;

    const timeoutId = window.setTimeout(() => {
      setReminderCountdown((currentCountdown) =>
        Math.max(0, currentCountdown - 1),
      );
    }, 1000);

    return () => window.clearTimeout(timeoutId);
  }, [activeReminderEvent, reminderCountdown]);
  useEffect(() => {
    if (!activeKanbanDueReminderCard || kanbanDueReminderCountdown <= 0) return;

    const timeoutId = window.setTimeout(() => {
      setKanbanDueReminderCountdown((currentCountdown) =>
        Math.max(0, currentCountdown - 1),
      );
    }, 1000);

    return () => window.clearTimeout(timeoutId);
  }, [activeKanbanDueReminderCard, kanbanDueReminderCountdown]);
  useEffect(() => {
    if (!activeLoanReminder || loanReminderCountdown <= 0) return;

    const timeoutId = window.setTimeout(() => {
      setLoanReminderCountdown((currentCountdown) =>
        Math.max(0, currentCountdown - 1),
      );
    }, 1000);

    return () => window.clearTimeout(timeoutId);
  }, [activeLoanReminder, loanReminderCountdown]);
  useEffect(() => {
    if (!activePriorityMessageAlert || priorityMessageCountdown <= 0) return;

    const timeoutId = window.setTimeout(() => {
      setPriorityMessageCountdown((currentCountdown) =>
        Math.max(0, currentCountdown - 1),
      );
    }, 1000);

    return () => window.clearTimeout(timeoutId);
  }, [activePriorityMessageAlert, priorityMessageCountdown]);
  const buildUpdatedContactSummary = (
    contact: Contact,
    updatedMessages: Message[],
  ) => buildContactSummary(contact, updatedMessages);

  const updateGroupDetails = (
    groupId: string,
    updates: Partial<Pick<Contact, "name" | "avatar" | "about">>,
  ) => {
    setGroups((currentGroups) =>
      currentGroups.map((group) =>
        group.id === groupId ? { ...group, ...updates } : group,
      ),
    );
    setArchivedGroups((currentGroups) =>
      currentGroups.map((group) =>
        group.id === groupId ? { ...group, ...updates } : group,
      ),
    );
    setSelectedGroup((currentGroup) =>
      currentGroup?.id === groupId
        ? { ...currentGroup, ...updates }
        : currentGroup,
    );
  };

  const setSelectedMessages: Dispatch<SetStateAction<Message[]>> = (
    nextMessages,
  ) => {
    if (
      !selectedContact ||
      !currentAnnouncementUser.id ||
      selectedContact.id === currentAnnouncementUser.id
    ) {
      return;
    }

    const contactId = selectedContact.id;
    const currentMessages = getDisplayedDirectMessagesFromStore(
      contactId,
      messagesByContactRef.current,
    );
    const updatedMessages =
      typeof nextMessages === "function"
        ? nextMessages(currentMessages)
        : nextMessages;
    const conversationKey = getDirectConversationKey(
      currentAnnouncementUser.id,
      contactId,
    );
    const existingConversationMessages =
      messagesByContactRef.current[conversationKey] ?? [];
    const updatedMessageIds = new Set(
      updatedMessages.map((message) => message.id),
    );
    const preservedHiddenMessages = existingConversationMessages.filter(
      (message) =>
        isMessageHiddenForUser(message, currentAnnouncementUser.id) &&
        !updatedMessageIds.has(message.id),
    );
    const sortedUpdatedMessages = [...updatedMessages].sort(
      (firstMessage, secondMessage) => {
        const timeDifference =
          firstMessage.timestamp.getTime() - secondMessage.timestamp.getTime();

        return (
          timeDifference || firstMessage.id.localeCompare(secondMessage.id)
        );
      },
    );
    const nextConversationMessages = [
      ...preservedHiddenMessages,
      ...sortedUpdatedMessages,
    ].sort((firstMessage, secondMessage) => {
      const timeDifference =
        firstMessage.timestamp.getTime() - secondMessage.timestamp.getTime();

      return timeDifference || firstMessage.id.localeCompare(secondMessage.id);
    });
    const existingContactMessages =
      messagesByContactRef.current[contactId] ?? [];
    const existingInboxMessages =
      messagesByContactRef.current[currentAnnouncementUser.id] ?? [];
    const nextContactMessages = existingContactMessages.filter(
      (message) =>
        message.senderId &&
        message.senderId !== currentAnnouncementUser.id &&
        message.senderId !== contactId,
    );
    const nextInboxMessages = existingInboxMessages.filter(
      (message) => message.senderId !== contactId,
    );
    const nextMessagesByContact = {
      ...messagesByContactRef.current,
      [conversationKey]: nextConversationMessages,
      [contactId]: nextContactMessages,
      [currentAnnouncementUser.id]: nextInboxMessages,
    };

    messagesByContactRef.current = nextMessagesByContact;
    setMessagesByContact(nextMessagesByContact);

    setContacts((currentContacts) =>
      currentContacts.map((contact) =>
        isStoredDirectContactForCurrentUser(contact, contactId)
          ? {
              ...buildUpdatedContactSummary(contact, updatedMessages),
              unreadCount: 0,
            }
          : contact,
      ),
    );
    setArchivedContacts((currentContacts) =>
      currentContacts.map((contact) =>
        isStoredDirectContactForCurrentUser(contact, contactId)
          ? {
              ...buildUpdatedContactSummary(contact, updatedMessages),
              unreadCount: 0,
            }
          : contact,
      ),
    );
    setSelectedContact((currentContact) =>
      currentContact?.id === contactId
        ? {
            ...buildUpdatedContactSummary(currentContact, updatedMessages),
            unreadCount: 0,
          }
        : currentContact,
    );
  };
  const setSelectedGroupMessages: Dispatch<SetStateAction<Message[]>> = (
    nextMessages,
  ) => {
    if (!selectedGroup) return;

    const groupId = selectedGroup.id;
    const storedMessages = groupMessagesByContactRef.current[groupId] ?? [];
    const currentMessages = storedMessages.filter(
      (message) => !isMessageHiddenForUser(message, currentAnnouncementUser.id),
    );
    const updatedMessages =
      typeof nextMessages === "function"
        ? nextMessages(currentMessages)
        : nextMessages;
    const updatedMessageIds = new Set(
      updatedMessages.map((message) => message.id),
    );
    const preservedHiddenMessages = storedMessages.filter(
      (message) =>
        isMessageHiddenForUser(message, currentAnnouncementUser.id) &&
        !updatedMessageIds.has(message.id),
    );
    const nextStoredMessages = [
      ...preservedHiddenMessages,
      ...updatedMessages,
    ].sort((firstMessage, secondMessage) => {
      const timeDifference =
        firstMessage.timestamp.getTime() - secondMessage.timestamp.getTime();

      return timeDifference || firstMessage.id.localeCompare(secondMessage.id);
    });

    groupMessagesByContactRef.current = {
      ...groupMessagesByContactRef.current,
      [groupId]: nextStoredMessages,
    };

    setGroupMessagesByContact((currentMessagesByContact) => ({
      ...currentMessagesByContact,
      [groupId]: nextStoredMessages,
    }));

    setGroups((currentGroups) =>
      currentGroups.map((group) =>
        group.id === groupId
          ? {
              ...buildUpdatedContactSummary(group, updatedMessages),
              unreadCount: 0,
            }
          : group,
      ),
    );
    setArchivedGroups((currentGroups) =>
      currentGroups.map((group) =>
        group.id === groupId
          ? {
              ...buildUpdatedContactSummary(group, updatedMessages),
              unreadCount: 0,
            }
          : group,
      ),
    );
    setSelectedGroup((currentGroup) =>
      currentGroup?.id === groupId
        ? {
            ...buildUpdatedContactSummary(currentGroup, updatedMessages),
            unreadCount: 0,
          }
        : currentGroup,
    );
  };

  const handleArchiveContact = (contactId: string) => {
    if (!currentAnnouncementUser.id) return;

    const contact = findConversationContact(contactId);

    if (!contact) return;

    const archivedAt = new Date();
    const archivedContact = toOwnedDirectContact(contact, {
      isArchived: true,
      conversationStateUpdatedAt: archivedAt,
    });

    setContacts((currentContacts) =>
      currentContacts.filter(
        (currentContact) =>
          !isStoredDirectContactForCurrentUser(currentContact, contactId),
      ),
    );
    setArchivedContacts((currentContacts) =>
      upsertDirectContactForCurrentUser(currentContacts, archivedContact),
    );
    if (selectedContact?.id === contactId) {
      setSelectedContact(null);
    }
    toast.success("Conversa arquivada.");
  };

  const handleUnarchiveContact = (contactId: string) => {
    if (!currentAnnouncementUser.id) return;

    const contact = findConversationContact(contactId);

    if (!contact) return;

    const unarchivedAt = new Date();
    const restoredContact = toOwnedDirectContact(contact, {
      isArchived: false,
      conversationStateUpdatedAt: unarchivedAt,
    });

    setContacts((currentContacts) =>
      upsertDirectContactForCurrentUser(currentContacts, restoredContact),
    );
    setArchivedContacts((currentContacts) =>
      currentContacts.filter(
        (currentContact) =>
          !isStoredDirectContactForCurrentUser(currentContact, contactId),
      ),
    );
    setShowArchived(false);
    toast.success("Conversa desarquivada.");
  };

  const handleMuteContact = (contactId: string) => {
    if (!currentAnnouncementUser.id) return;

    const contact = findConversationContact(contactId);

    if (!contact) return;

    const willMute = !(contact?.isMuted ?? false);
    const mutedContact = toOwnedDirectContact(contact, {
      isMuted: willMute,
      conversationStateUpdatedAt: new Date(),
    });

    setContacts((currentContacts) =>
      mutedContact.isArchived
        ? currentContacts.filter(
            (currentContact) =>
              !isStoredDirectContactForCurrentUser(currentContact, contactId),
          )
        : upsertDirectContactForCurrentUser(currentContacts, mutedContact),
    );
    setArchivedContacts((currentContacts) =>
      mutedContact.isArchived
        ? upsertDirectContactForCurrentUser(currentContacts, mutedContact)
        : currentContacts.filter(
            (currentContact) =>
              !isStoredDirectContactForCurrentUser(currentContact, contactId),
          ),
    );
    setSelectedContact((currentContact) =>
      currentContact?.id === contactId
        ? {
            ...currentContact,
            isMuted: willMute,
            conversationStateUpdatedAt: mutedContact.conversationStateUpdatedAt,
          }
        : currentContact,
    );
    toast.success(willMute ? "Conversa silenciada." : "Conversa reativada.");
  };

  const handlePinContact = (contactId: string) => {
    if (!currentAnnouncementUser.id) return;

    const contact = findConversationContact(contactId);

    if (!contact) return;

    const willPin = !(contact?.isPinned ?? false);
    const pinnedContact = toOwnedDirectContact(contact, {
      isPinned: willPin,
      conversationStateUpdatedAt: new Date(),
    });

    setContacts((currentContacts) =>
      pinnedContact.isArchived
        ? currentContacts.filter(
            (currentContact) =>
              !isStoredDirectContactForCurrentUser(currentContact, contactId),
          )
        : upsertDirectContactForCurrentUser(currentContacts, pinnedContact),
    );
    setArchivedContacts((currentContacts) =>
      pinnedContact.isArchived
        ? upsertDirectContactForCurrentUser(currentContacts, pinnedContact)
        : currentContacts.filter(
            (currentContact) =>
              !isStoredDirectContactForCurrentUser(currentContact, contactId),
          ),
    );
    setSelectedContact((currentContact) =>
      currentContact?.id === contactId
        ? {
            ...currentContact,
            isPinned: willPin,
            conversationStateUpdatedAt: pinnedContact.conversationStateUpdatedAt,
          }
        : currentContact,
    );
    toast.success(willPin ? "Conversa fixada." : "Conversa desfixada.");
  };

  const findConversationContact = (contactId: string) =>
    displayContacts.find((currentContact) => currentContact.id === contactId) ??
    contacts.find((currentContact) =>
      isStoredDirectContactForCurrentUser(currentContact, contactId),
    ) ??
    archivedContacts.find((currentContact) =>
      isStoredDirectContactForCurrentUser(currentContact, contactId),
    ) ??
    (selectedContact?.id === contactId ? selectedContact : null);
  const findGroupConversation = (groupId: string) =>
    groups.find((currentGroup) => currentGroup.id === groupId) ??
    archivedGroups.find((currentGroup) => currentGroup.id === groupId) ??
    (selectedGroup?.id === groupId ? selectedGroup : null);

  const requestConversationConfirmation = (
    type: "clear" | "delete",
    contactId: string,
    scope: "chat" | "group" = "chat",
  ) => {
    const contact =
      scope === "group"
        ? findGroupConversation(contactId)
        : findConversationContact(contactId);

    if (!contact) return;

    setConversationConfirmAction({ contact, type, scope });
  };

  const executeClearConversation = (contactId: string) => {
    const contact = findConversationContact(contactId);

    setMessagesByContact((currentMessagesByContact) => {
      if (
        !currentAnnouncementUser.id ||
        contactId === currentAnnouncementUser.id
      ) {
        return currentMessagesByContact;
      }

      const currentUserId = currentAnnouncementUser.id;
      const conversationKey = getDirectConversationKey(
        currentUserId,
        contactId,
      );
      const nextMessagesByContact = {
        ...currentMessagesByContact,
        [conversationKey]: (
          currentMessagesByContact[conversationKey] ?? []
        ).map((message) => hideMessageForUser(message, currentUserId)),
        [contactId]: (currentMessagesByContact[contactId] ?? []).map(
          (message) =>
            !message.senderId || message.senderId === currentUserId
              ? hideMessageForUser(message, currentUserId)
              : message,
        ),
        [currentUserId]: (currentMessagesByContact[currentUserId] ?? []).map(
          (message) =>
            message.senderId === contactId
              ? hideMessageForUser(message, currentUserId)
              : message,
        ),
      };

      messagesByContactRef.current = nextMessagesByContact;
      return nextMessagesByContact;
    });
    if (contact && currentAnnouncementUser.id) {
      const clearedContact = toOwnedDirectContact(contact, {
        lastMessage: "Conversa limpa",
        lastMessageIsOwn: undefined,
        lastMessageStatus: undefined,
        unreadCount: 0,
      });

      setContacts((currentContacts) =>
        upsertDirectContactForCurrentUser(currentContacts, clearedContact),
      );
      setArchivedContacts((currentContacts) =>
        currentContacts.some((currentContact) =>
          isStoredDirectContactForCurrentUser(currentContact, contactId),
        )
          ? upsertDirectContactForCurrentUser(currentContacts, clearedContact)
          : currentContacts,
      );
    }
    setContacts((currentContacts) =>
      currentContacts.map((contact) =>
        isStoredDirectContactForCurrentUser(contact, contactId)
          ? {
              ...contact,
              lastMessage: "Conversa limpa",
              lastMessageIsOwn: undefined,
              lastMessageStatus: undefined,
              unreadCount: 0,
            }
          : contact,
      ),
    );
    setArchivedContacts((currentContacts) =>
      currentContacts.map((contact) =>
        isStoredDirectContactForCurrentUser(contact, contactId)
          ? {
              ...contact,
              lastMessage: "Conversa limpa",
              lastMessageIsOwn: undefined,
              lastMessageStatus: undefined,
              unreadCount: 0,
            }
          : contact,
      ),
    );
    setSelectedContact((currentContact) =>
      currentContact?.id === contactId
        ? {
            ...currentContact,
            lastMessage: "Conversa limpa",
            lastMessageIsOwn: undefined,
            lastMessageStatus: undefined,
            unreadCount: 0,
          }
        : currentContact,
    );
  };

  const executeDeleteContact = (contactId: string) => {
    if (!currentAnnouncementUser.id) return;

    const currentUserId = currentAnnouncementUser.id;
    const contact = findConversationContact(contactId);
    const hiddenContact = contact
      ? hideConversationForUser(
          toOwnedDirectContact(contact, {
            isArchived: false,
            unreadCount: 0,
          }),
          currentUserId,
        )
      : null;

    setContacts((currentContacts) =>
      hiddenContact
        ? upsertDirectContactForCurrentUser(
            currentContacts.map((contact) =>
              isStoredDirectContactForCurrentUser(contact, contactId)
                ? hideConversationForUser(contact, currentUserId)
                : contact,
            ),
            hiddenContact,
          )
        : currentContacts.map((contact) =>
            isStoredDirectContactForCurrentUser(contact, contactId)
              ? hideConversationForUser(contact, currentUserId)
              : contact,
          ),
    );
    setArchivedContacts((currentContacts) =>
      currentContacts.some((contact) =>
        isStoredDirectContactForCurrentUser(contact, contactId),
      ) && hiddenContact
        ? upsertDirectContactForCurrentUser(
            currentContacts.map((contact) =>
              isStoredDirectContactForCurrentUser(contact, contactId)
                ? hideConversationForUser(contact, currentUserId)
                : contact,
            ),
            hiddenContact,
          )
        : currentContacts.map((contact) =>
            isStoredDirectContactForCurrentUser(contact, contactId)
              ? hideConversationForUser(contact, currentUserId)
              : contact,
          ),
    );
    setMessagesByContact((currentMessagesByContact) => {
      const nextMessagesByContact = { ...currentMessagesByContact };
      if (contactId !== currentUserId) {
        const conversationKey = getDirectConversationKey(
          currentUserId,
          contactId,
        );

        nextMessagesByContact[conversationKey] = (
          nextMessagesByContact[conversationKey] ?? []
        ).map((message) => hideMessageForUser(message, currentUserId));
        nextMessagesByContact[currentUserId] = (
          nextMessagesByContact[currentUserId] ?? []
        ).map((message) =>
          message.senderId === contactId
            ? hideMessageForUser(message, currentUserId)
            : message,
        );
        nextMessagesByContact[contactId] = (
          nextMessagesByContact[contactId] ?? []
        ).map((message) =>
          !message.senderId || message.senderId === currentUserId
            ? hideMessageForUser(message, currentUserId)
            : message,
        );
      }

      messagesByContactRef.current = nextMessagesByContact;

      return nextMessagesByContact;
    });
    setReportConversationTarget((currentTarget) =>
      currentTarget?.contact.id === contactId ? null : currentTarget,
    );
    if (selectedContact?.id === contactId) {
      setSelectedContact(null);
      setActiveSidePanel(null);
    }
  };
  const executeClearGroup = (groupId: string) => {
    if (!currentAnnouncementUser.id) return;

    const currentUserId = currentAnnouncementUser.id;

    setGroupMessagesByContact((currentMessagesByContact) => {
      const nextMessagesByContact = {
        ...currentMessagesByContact,
        [groupId]: (currentMessagesByContact[groupId] ?? []).map((message) =>
          hideMessageForUser(message, currentUserId),
        ),
      };

      groupMessagesByContactRef.current = nextMessagesByContact;

      return nextMessagesByContact;
    });
    setSelectedGroup((currentGroup) =>
      currentGroup?.id === groupId
        ? {
            ...currentGroup,
            lastMessage: "Conversa limpa",
            lastMessageIsOwn: undefined,
            lastMessageStatus: undefined,
            unreadCount: 0,
          }
        : currentGroup,
    );
  };

  const executeDeleteGroup = (groupId: string) => {
    if (!currentAnnouncementUser.id) return;

    const currentUserId = currentAnnouncementUser.id;

    setGroups((currentGroups) =>
      currentGroups.map((group) =>
        group.id === groupId
          ? hideConversationForUser(group, currentUserId)
          : group,
      ),
    );
    setArchivedGroups((currentGroups) =>
      currentGroups.map((group) =>
        group.id === groupId
          ? hideConversationForUser(group, currentUserId)
          : group,
      ),
    );
    setGroupMessagesByContact((currentMessagesByContact) => {
      const nextMessagesByContact = {
        ...currentMessagesByContact,
        [groupId]: (currentMessagesByContact[groupId] ?? []).map((message) =>
          hideMessageForUser(message, currentUserId),
        ),
      };

      groupMessagesByContactRef.current = nextMessagesByContact;

      return nextMessagesByContact;
    });
    setReportConversationTarget((currentTarget) =>
      currentTarget?.contact.id === groupId ? null : currentTarget,
    );
    if (selectedGroup?.id === groupId) {
      setSelectedGroup(null);
      setActiveSidePanel(null);
    }
  };

  const handleClearConversation = (contactId: string) => {
    requestConversationConfirmation("clear", contactId);
  };

  const handleDeleteContact = (contactId: string) => {
    requestConversationConfirmation("delete", contactId);
  };

  const handleArchiveGroup = (groupId: string) => {
    const group = groups.find((currentGroup) => currentGroup.id === groupId);
    if (group) {
      const archivedGroup = {
        ...group,
        isArchived: true,
        conversationStateUpdatedAt: new Date(),
      };

      setGroups((currentGroups) =>
        currentGroups.filter((currentGroup) => currentGroup.id !== groupId),
      );
      setArchivedGroups((currentGroups) =>
        upsertConversationById(currentGroups, archivedGroup),
      );
      if (selectedGroup?.id === groupId) {
        setSelectedGroup(null);
      }
      toast.success("Grupo arquivado.");
    }
  };

  const handleUnarchiveGroup = (groupId: string) => {
    const group = archivedGroups.find(
      (currentGroup) => currentGroup.id === groupId,
    );
    if (group) {
      const restoredGroup = {
        ...group,
        isArchived: false,
        conversationStateUpdatedAt: new Date(),
      };

      setArchivedGroups((currentGroups) =>
        currentGroups.filter((currentGroup) => currentGroup.id !== groupId),
      );
      setGroups((currentGroups) =>
        upsertConversationById(currentGroups, restoredGroup),
      );
      setShowArchivedGroups(false);
      toast.success("Grupo desarquivado.");
    }
  };

  const handleMuteGroup = (groupId: string) => {
    if (!currentAnnouncementUser.id) return;

    const group = findGroupConversation(groupId);
    if (!group) return;

    const currentUserId = currentAnnouncementUser.id;
    const willMute = !getConversationStateForUser(group, currentUserId).isMuted;

    setGroups((currentGroups) =>
      currentGroups.map((group) =>
        group.id === groupId
          ? updateConversationPreferenceForUser(group, currentUserId, {
              isMuted: willMute,
            })
          : group,
      ),
    );
    setArchivedGroups((currentGroups) =>
      currentGroups.map((group) =>
        group.id === groupId
          ? updateConversationPreferenceForUser(group, currentUserId, {
              isMuted: willMute,
            })
          : group,
      ),
    );
    setSelectedGroup((currentGroup) => {
      if (currentGroup?.id !== groupId) return currentGroup;

      return hydrateConversationStateForUser(
        updateConversationPreferenceForUser(currentGroup, currentUserId, {
          isMuted: willMute,
        }),
        currentUserId,
      );
    });
    toast.success(willMute ? "Grupo silenciado." : "Grupo reativado.");
  };

  const handlePinGroup = (groupId: string) => {
    if (!currentAnnouncementUser.id) return;

    const group = findGroupConversation(groupId);
    if (!group) return;

    const currentUserId = currentAnnouncementUser.id;
    const willPin = !getConversationStateForUser(group, currentUserId).isPinned;

    setGroups((currentGroups) =>
      currentGroups.map((group) =>
        group.id === groupId
          ? updateConversationPreferenceForUser(group, currentUserId, {
              isPinned: willPin,
            })
          : group,
      ),
    );
    setArchivedGroups((currentGroups) =>
      currentGroups.map((group) =>
        group.id === groupId
          ? updateConversationPreferenceForUser(group, currentUserId, {
              isPinned: willPin,
            })
          : group,
      ),
    );
    setSelectedGroup((currentGroup) => {
      if (currentGroup?.id !== groupId) return currentGroup;

      return hydrateConversationStateForUser(
        updateConversationPreferenceForUser(currentGroup, currentUserId, {
          isPinned: willPin,
        }),
        currentUserId,
      );
    });
    toast.success(willPin ? "Grupo fixado." : "Grupo desfixado.");
  };

  const handleClearGroupConversation = (groupId: string) => {
    requestConversationConfirmation("clear", groupId, "group");
  };

  const handleDeleteGroup = (groupId: string) => {
    requestConversationConfirmation("delete", groupId, "group");
  };

  const handleLeaveGroup = (groupId: string) => {
    executeDeleteGroup(groupId);
    toast.success("Você saiu do grupo.");
  };

  const handleConversationConfirmOpenChange = (open: boolean) => {
    if (open) return;

    setConversationConfirmAction(null);
  };

  const handleConfirmConversationAction = () => {
    if (!conversationConfirmAction) return;

    if (conversationConfirmAction.type === "clear") {
      if (conversationConfirmAction.scope === "group") {
        executeClearGroup(conversationConfirmAction.contact.id);
      } else {
        executeClearConversation(conversationConfirmAction.contact.id);
      }
      toast.success("Conversa limpa.");
    } else {
      if (conversationConfirmAction.scope === "group") {
        executeDeleteGroup(conversationConfirmAction.contact.id);
      } else {
        executeDeleteContact(conversationConfirmAction.contact.id);
      }
      toast.success(
        conversationConfirmAction.scope === "group"
          ? "Grupo removido da lista."
          : "Conversa removida da lista.",
      );
    }

    setConversationConfirmAction(null);
  };

  const handleReportConversation = (contactId: string) => {
    const contact = findConversationContact(contactId);

    if (!contact) return;

    setReportConversationTarget({ contact, kind: "contact" });
    setConversationReportText("");
  };

  const handleReportGroupConversation = (groupId: string) => {
    const group = findGroupConversation(groupId);

    if (!group) return;

    setReportConversationTarget({ contact: group, kind: "group" });
    setConversationReportText("");
  };

  const handleReportDialogOpenChange = (open: boolean) => {
    if (open) return;

    setReportConversationTarget(null);
    setConversationReportText("");
  };

  const handleSubmitConversationReport = () => {
    if (!reportConversationTarget) return;

    if (!conversationReportText.trim()) {
      toast.error("Informe o motivo da denúncia.");
      return;
    }

    const reportMessages =
      reportConversationTarget.kind === "group"
        ? (
            groupMessagesByContactRef.current[
              reportConversationTarget.contact.id
            ] ?? []
          ).filter(
            (message) =>
              !isMessageHiddenForUser(message, currentAnnouncementUser.id),
          )
        : getDisplayedDirectMessages(reportConversationTarget.contact.id);
    const evidenceMessages = buildReportEvidenceMessages(
      reportConversationTarget.contact,
      reportConversationTarget.kind,
      reportMessages,
    );

    setAdminReports((currentReports) => [
      {
        id: `conversation-report-${Date.now()}`,
        type: "conversation",
        sourceKind: reportConversationTarget.kind,
        sourceName: reportConversationTarget.contact.name,
        sourceEmail: reportConversationTarget.contact.email,
        sourceAvatar: reportConversationTarget.contact.avatar,
        description: conversationReportText.trim(),
        createdAt: new Date(),
        status: "new",
        messagePreview:
          evidenceMessages.length > 0
            ? `${evidenceMessages.length} mensagens anexadas`
            : undefined,
        evidenceMessages,
      },
      ...currentReports,
    ]);
    handleReportDialogOpenChange(false);
    toast.success("Denuncia enviada.");
  };

  const handleReportMessage = (message: Message, description: string) => {
    const sourceConversation = selectedContact ?? selectedGroup;

    if (!sourceConversation) return;

    const sourceKind = selectedGroup ? "group" : "contact";
    const evidenceMessages = buildReportEvidenceMessages(
      sourceConversation,
      sourceKind,
      [message],
    );

    setAdminReports((currentReports) => [
      {
        id: `message-report-${Date.now()}`,
        type: "message",
        sourceKind,
        sourceName: sourceConversation.name,
        sourceEmail: sourceConversation.email,
        sourceAvatar: sourceConversation.avatar,
        description,
        createdAt: new Date(),
        status: "new",
        messagePreview: getConversationMessagePreview(message),
        evidenceMessages,
      },
      ...currentReports,
    ]);
  };

  const handleSelectContact = (contact: Contact) => {
    if (
      !currentAnnouncementUser.id ||
      contact.id === currentAnnouncementUser.id
    ) {
      return;
    }

    const openedContact = { ...contact, unreadCount: 0 };
    const readReceiptUpdate = markDirectConversationMessagesAsRead(
      messagesByContactRef.current,
      currentAnnouncementUser.id,
      contact.id,
    );

    if (readReceiptUpdate.hasReadReceiptUpdate) {
      messagesByContactRef.current = readReceiptUpdate.messagesByContact;
      setMessagesByContact(readReceiptUpdate.messagesByContact);
    }

    setSelectedContact(openedContact);
    setContacts((currentContacts) =>
      currentContacts.map((currentContact) =>
        isStoredDirectContactForCurrentUser(currentContact, contact.id)
          ? { ...currentContact, unreadCount: 0 }
          : currentContact,
      ),
    );
    setArchivedContacts((currentContacts) =>
      currentContacts.map((currentContact) =>
        isStoredDirectContactForCurrentUser(currentContact, contact.id)
          ? { ...currentContact, unreadCount: 0 }
          : currentContact,
      ),
    );
    setActiveSidePanel(null);
    setHighlightedMessageId(null);
  };

  const handleSelectGroup = (group: Contact) => {
    if (
      !canUserSeeGroup(
        group.id,
        currentAnnouncementUser.id,
        groupMetadataById,
      )
    ) {
      setSelectedGroup(null);
      setActiveSidePanel(null);
      setHighlightedMessageId(null);
      toast.error("Grupo indisponível.", {
        description: "Você não participa deste grupo.",
      });
      return;
    }

    const openedGroup = { ...group, unreadCount: 0 };
    const groupMessages = groupMessagesByContactRef.current[group.id];

    if (groupMessages) {
      const readReceiptUpdate = markGroupMessagesAsRead(
        groupMessages,
        currentAnnouncementUser.id,
      );
      const nextGroupMessagesByContact = {
        ...groupMessagesByContactRef.current,
        [group.id]: readReceiptUpdate.messages,
      };

      if (readReceiptUpdate.hasReadReceiptUpdate) {
        groupMessagesByContactRef.current = nextGroupMessagesByContact;
        setGroupMessagesByContact(nextGroupMessagesByContact);
      }
    }

    setSelectedGroup(openedGroup);
    setGroups((currentGroups) =>
      currentGroups.map((currentGroup) =>
        currentGroup.id === group.id
          ? { ...currentGroup, unreadCount: 0 }
          : currentGroup,
      ),
    );
    setArchivedGroups((currentGroups) =>
      currentGroups.map((currentGroup) =>
        currentGroup.id === group.id
          ? { ...currentGroup, unreadCount: 0 }
          : currentGroup,
      ),
    );
    setActiveSidePanel(null);
    setHighlightedMessageId(null);
  };

  useEffect(() => {
    if (
      activeNav !== "chat" ||
      !selectedContact ||
      !currentAnnouncementUser.id ||
      selectedContact.id === currentAnnouncementUser.id
    ) {
      return;
    }

    const readReceiptUpdate = markDirectConversationMessagesAsRead(
      messagesByContact,
      currentAnnouncementUser.id,
      selectedContact.id,
    );

    if (!readReceiptUpdate.hasReadReceiptUpdate) return;

    messagesByContactRef.current = readReceiptUpdate.messagesByContact;
    const timeoutId = window.setTimeout(() => {
      setMessagesByContact(readReceiptUpdate.messagesByContact);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [
    activeNav,
    currentAnnouncementUser.id,
    messagesByContact,
    selectedContact,
  ]);

  useEffect(() => {
    if (
      activeNav !== "grupos" ||
      !selectedGroup ||
      !currentAnnouncementUser.id
    ) {
      return;
    }

    const groupMessages = groupMessagesByContact[selectedGroup.id];
    if (!groupMessages) return;

    const readReceiptUpdate = markGroupMessagesAsRead(
      groupMessages,
      currentAnnouncementUser.id,
    );

    if (!readReceiptUpdate.hasReadReceiptUpdate) return;

    const nextGroupMessagesByContact = {
      ...groupMessagesByContact,
      [selectedGroup.id]: readReceiptUpdate.messages,
    };

    groupMessagesByContactRef.current = nextGroupMessagesByContact;
    const timeoutId = window.setTimeout(() => {
      setGroupMessagesByContact(nextGroupMessagesByContact);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [
    activeNav,
    currentAnnouncementUser.id,
    groupMessagesByContact,
    isMessageFromCurrentUser,
    selectedGroup,
  ]);

  const handleDismissPriorityMessageAlert = () => {
    markPriorityMessageAlertSeen(activePriorityMessageAlert);
    setActivePriorityMessageAlert(null);
    setPriorityMessageCountdown(0);
  };

  const handleOpenPriorityMessageAlert = () => {
    if (!activePriorityMessageAlert) return;

    markPriorityMessageAlertSeen(activePriorityMessageAlert);

    if (activePriorityMessageAlert.scope === "group") {
      navigateTo("grupos");
      setSelectedContact(null);
      handleSelectGroup(activePriorityMessageAlert.conversation);
    } else {
      navigateTo("chat");
      setSelectedGroup(null);
      handleSelectContact(activePriorityMessageAlert.conversation);
    }

    setHighlightedMessageId(activePriorityMessageAlert.message.id);
    setActivePriorityMessageAlert(null);
    setPriorityMessageCountdown(0);
    setIsMobileSidebarOpen(false);
  };

  const handleCreateGroup = (groupInput: CreateGroupInput) => {
    const groupId = `group-${Date.now()}`;
    const participantNames = directoryUsers
      .filter((user) => groupInput.participantIds.includes(user.id))
      .map((user) => user.name);
    const newGroup: Contact = {
      id: groupId,
      name: groupInput.name,
      avatar: groupInput.avatar,
      email: `${groupInput.name.toLowerCase().replace(/\s+/g, ".")}@grupo.local`,
      about: groupInput.description,
      lastMessage: "Grupo criado",
      lastMessageTime: new Date(),
      unreadCount: 0,
      isOnline: false,
      isTyping: false,
      isArchived: false,
      isMuted: false,
      isPinned: false,
    };
    const firstMessage: Message = {
      id: `group-created-${Date.now()}`,
      content: `Grupo criado com ${participantNames.join(", ")}`,
      timestamp: new Date(),
      isOwn: true,
      senderName: "Você",
      status: "read",
    };

    setGroups((currentGroups) => [newGroup, ...currentGroups]);
    setGroupMessagesByContact((currentMessagesByContact) => ({
      ...currentMessagesByContact,
      [newGroup.id]: [firstMessage],
    }));
    setGroupMetadataById((currentMetadata) => ({
      ...currentMetadata,
      [newGroup.id]: touchGroupMetadata({
        participantIds: Array.from(
          new Set([currentAnnouncementUser.id, ...groupInput.participantIds]),
        ),
        adminIds: [currentAnnouncementUser.id],
        creatorId: currentAnnouncementUser.id,
      }),
    }));
    setShowArchivedGroups(false);
    setSelectedGroup(newGroup);
    setActiveSidePanel(null);
    setHighlightedMessageId(null);
  };

  const handleUpdateSelectedGroupDetails = (
    updates: Partial<Pick<Contact, "name" | "avatar" | "about">>,
  ) => {
    if (!selectedGroup || !canManageSelectedGroup) return;

    updateGroupDetails(selectedGroup.id, updates);
    toast.success("Grupo atualizado.");
  };

  const handleAddGroupParticipants = (participantIds: string[]) => {
    if (!selectedGroup || !canManageSelectedGroup) return;

    const currentMemberIds = new Set(
      selectedGroupMetadata ? getGroupMemberIds(selectedGroupMetadata) : [],
    );
    const nextParticipantIds = participantIds.filter((participantId) =>
      directoryUsers.some((user) => user.id === participantId) &&
      !currentMemberIds.has(participantId),
    );

    if (nextParticipantIds.length === 0) {
      toast.error("Selecione ao menos um novo participante.");
      return;
    }

    setGroupMetadataById((currentMetadata) => {
      const currentGroupMetadata = currentMetadata[selectedGroup.id] ?? {
        participantIds: [],
        adminIds: [currentAnnouncementUser.id],
        creatorId: currentAnnouncementUser.id,
      };

      const currentMemberIds = new Set(getGroupMemberIds(currentGroupMetadata));
      const participantIdsToAdd = nextParticipantIds.filter(
        (participantId) => !currentMemberIds.has(participantId),
      );

      if (participantIdsToAdd.length === 0) return currentMetadata;

      return {
        ...currentMetadata,
        [selectedGroup.id]: touchGroupMetadata({
          ...currentGroupMetadata,
          participantIds: Array.from(
            new Set([
              ...currentGroupMetadata.participantIds,
              ...participantIdsToAdd,
            ]),
          ),
        }),
      };
    });
    toast.success(
      nextParticipantIds.length === 1
        ? "Participante adicionado."
        : "Participantes adicionados.",
    );
  };

  const handleRemoveGroupParticipant = (participantId: string) => {
    if (!selectedGroup || !canManageSelectedGroup) return;

    if (selectedGroupMetadata?.creatorId === participantId) {
      toast.error("O criador do grupo não pode ser removido.");
      return;
    }

    if (participantId === currentAnnouncementUser.id) {
      toast.error("Use a ação de sair do grupo para remover sua própria conta.");
      return;
    }

    setGroupMetadataById((currentMetadata) => {
      const currentGroupMetadata = currentMetadata[selectedGroup.id];

      if (!currentGroupMetadata) return currentMetadata;
      if (currentGroupMetadata.creatorId === participantId) {
        return currentMetadata;
      }

      return {
        ...currentMetadata,
        [selectedGroup.id]: touchGroupMetadata({
          ...currentGroupMetadata,
          participantIds: currentGroupMetadata.participantIds.filter(
            (currentParticipantId) => currentParticipantId !== participantId,
          ),
          adminIds: currentGroupMetadata.adminIds.filter(
            (currentAdminId) => currentAdminId !== participantId,
          ),
        }),
      };
    });
    toast.success("Participante removido.");
  };

  const handleToggleGroupParticipantAdmin = (participantId: string) => {
    if (!selectedGroup || !canManageSelectedGroup) return;

    const wasAdmin =
      selectedGroupMetadata?.adminIds.includes(participantId) ?? false;
    const selectedGroupMemberIds = selectedGroupMetadata
      ? getGroupMemberIds(selectedGroupMetadata)
      : [];

    if (!selectedGroupMemberIds.includes(participantId)) {
      toast.error("Esse usuário não faz parte do grupo.");
      return;
    }

    if (selectedGroupMetadata?.creatorId === participantId && wasAdmin) {
      toast.error("O criador do grupo precisa continuar como admin.");
      return;
    }

    if (wasAdmin && (selectedGroupMetadata?.adminIds.length ?? 0) <= 1) {
      toast.error("O grupo precisa ter ao menos um admin.");
      return;
    }

    setGroupMetadataById((currentMetadata) => {
      const currentGroupMetadata = currentMetadata[selectedGroup.id];

      if (!currentGroupMetadata) return currentMetadata;

      const isAdmin = currentGroupMetadata.adminIds.includes(participantId);
      if (isAdmin && currentGroupMetadata.creatorId === participantId) {
        return currentMetadata;
      }
      if (isAdmin && currentGroupMetadata.adminIds.length <= 1) {
        return currentMetadata;
      }

      return {
        ...currentMetadata,
        [selectedGroup.id]: touchGroupMetadata({
          ...currentGroupMetadata,
          adminIds: isAdmin
            ? currentGroupMetadata.adminIds.filter(
                (currentAdminId) => currentAdminId !== participantId,
              )
            : Array.from(
                new Set([...currentGroupMetadata.adminIds, participantId]),
              ),
          participantIds: Array.from(
            new Set([...currentGroupMetadata.participantIds, participantId]),
          ),
        }),
      };
    });
    toast.success(
      wasAdmin
        ? "Permissão de administrador removida."
        : "Participante promovido a administrador.",
    );
  };

  const handleStartConversation = (user: DirectoryUser) => {
    if (user.id === currentAnnouncementUser.id) return;

    const existingDisplayedContact = displayContacts.find(
      (contact) => contact.id === user.id || contact.email === user.email,
    );
    const existingContact = contacts.find(
      (contact) =>
        contact.ownerId === currentAnnouncementUser.id &&
        (contact.id === user.id || contact.email === user.email),
    );
    const archivedContact = archivedContacts.find(
      (contact) =>
        contact.ownerId === currentAnnouncementUser.id &&
        (contact.id === user.id || contact.email === user.email),
    );

    if (existingDisplayedContact) {
      handleSelectContact(existingDisplayedContact);
      setActiveSidePanel(null);
      setHighlightedMessageId(null);
      return;
    }

    if (existingContact) {
      handleSelectContact(existingContact);
      setActiveSidePanel(null);
      setHighlightedMessageId(null);
      return;
    }

    if (archivedContact) {
      const restoredContact = {
        ...archivedContact,
        isArchived: false,
        unreadCount: 0,
      };
      setArchivedContacts(
        archivedContacts.filter(
          (contact) =>
            !isStoredDirectContactForCurrentUser(contact, archivedContact.id),
        ),
      );
      setContacts([
        restoredContact,
        ...contacts.filter(
          (contact) =>
            !isStoredDirectContactForCurrentUser(contact, archivedContact.id),
        ),
      ]);
      setSelectedContact(restoredContact);
      setShowArchived(false);
      setActiveSidePanel(null);
      setHighlightedMessageId(null);
      return;
    }

    const newContact: Contact = {
      id: user.id,
      ownerId: currentAnnouncementUser.id,
      name: user.name,
      avatar: user.avatar,
      email: user.email,
      about: user.about,
      lastMessage: "Nova conversa",
      lastMessageTime: new Date(),
      unreadCount: 0,
      isOnline: user.isOnline,
      chatStatus: user.chatStatus,
      workStatus: user.workStatus,
      lastSeenAt: user.lastSeenAt,
      isTyping: false,
      isArchived: false,
      isMuted: false,
      isPinned: false,
    };

    setContacts([newContact, ...contacts]);
    setSelectedContact(newContact);
    setShowArchived(false);
    setActiveSidePanel(null);
    setHighlightedMessageId(null);
  };

  const handleForwardMessage = (targetIds: string[], message: Message) => {
    if (targetIds.length === 0) return;

    const contactTargetIds = new Set<string>();
    const groupTargetIds = new Set<string>();

    targetIds.forEach((targetId) => {
      const target = parseForwardTargetKey(targetId);

      if (target.kind === "group") {
        groupTargetIds.add(target.id);
      } else {
        contactTargetIds.add(target.id);
      }
    });

    const targetUsers = directoryUsers.filter((user) =>
      contactTargetIds.has(user.id),
    );
    const targetGroupsById = new Map(
      [...archivedGroups, ...groups].map((group) => [group.id, group]),
    );
    const targetGroups = Array.from(groupTargetIds)
      .map((groupId) => targetGroupsById.get(groupId))
      .filter((group): group is Contact => group !== undefined);
    const sentAt = new Date();
    const preview = getForwardedMessagePreview(message);

    setMessagesByContact((currentMessagesByContact) => {
      const nextMessagesByContact = { ...currentMessagesByContact };

      targetUsers.forEach((user, index) => {
        const forwardedMessage: Message = {
          id: `fwd-${Date.now()}-${user.id}-${index}`,
          content: message.content,
          timestamp: new Date(sentAt.getTime() + index),
          isOwn: true,
          senderId: currentAnnouncementUser.id,
          senderName: currentAnnouncementUser.name,
          status: "sent",
          isPriority: message.isPriority,
          isForwarded: true,
          attachment: message.attachment,
        };

        nextMessagesByContact[user.id] = [
          ...(nextMessagesByContact[user.id] ?? []),
          forwardedMessage,
        ];
      });

      return nextMessagesByContact;
    });

    setGroupMessagesByContact((currentMessagesByContact) => {
      const nextMessagesByContact = { ...currentMessagesByContact };

      targetGroups.forEach((group, index) => {
        const forwardedMessage: Message = {
          id: `fwd-${Date.now()}-${group.id}-${index}`,
          content: message.content,
          timestamp: new Date(sentAt.getTime() + targetUsers.length + index),
          isOwn: true,
          senderId: currentAnnouncementUser.id,
          senderName: currentAnnouncementUser.name,
          status: "sent",
          isPriority: message.isPriority,
          isForwarded: true,
          attachment: message.attachment,
        };

        nextMessagesByContact[group.id] = [
          ...(nextMessagesByContact[group.id] ?? []),
          forwardedMessage,
        ];
      });

      return nextMessagesByContact;
    });

    setContacts((currentContacts) => {
      const currentContactIds = new Set(
        currentContacts
          .filter((contact) =>
            isStoredDirectContactForCurrentUser(contact, contact.id),
          )
          .map((contact) => contact.id),
      );
      const archivedContactIds = new Set(
        archivedContacts
          .filter((contact) =>
            isStoredDirectContactForCurrentUser(contact, contact.id),
          )
          .map((contact) => contact.id),
      );
      const restoredContacts = archivedContacts
        .filter(
          (contact) =>
            contactTargetIds.has(contact.id) &&
            isStoredDirectContactForCurrentUser(contact, contact.id),
        )
        .map((contact) => ({
          ...contact,
          isArchived: false,
          lastMessage: preview,
          lastMessageTime: sentAt,
          lastMessageIsOwn: true,
          lastMessageStatus: "sent" as const,
          unreadCount: 0,
        }));
      const newContacts = targetUsers
        .filter(
          (user) =>
            !currentContactIds.has(user.id) && !archivedContactIds.has(user.id),
        )
        .map<Contact>((user) => ({
          id: user.id,
          ownerId: currentAnnouncementUser.id,
          name: user.name,
          avatar: user.avatar,
          email: user.email,
          about: user.about,
          lastMessage: preview,
          lastMessageTime: sentAt,
          lastMessageIsOwn: true,
          lastMessageStatus: "sent",
          unreadCount: 0,
          isOnline: user.isOnline,
          chatStatus: user.chatStatus,
          workStatus: user.workStatus,
          lastSeenAt: user.lastSeenAt,
          isTyping: false,
          isArchived: false,
          isMuted: false,
          isPinned: false,
        }));
      const updatedContacts = currentContacts.map((contact) =>
        contactTargetIds.has(contact.id) &&
        isStoredDirectContactForCurrentUser(contact, contact.id)
          ? {
              ...contact,
              isArchived: false,
              lastMessage: preview,
              lastMessageTime: sentAt,
              lastMessageIsOwn: true,
              lastMessageStatus: "sent" as const,
              unreadCount: 0,
            }
          : contact,
      );

      return [...newContacts, ...restoredContacts, ...updatedContacts];
    });

    setGroups((currentGroups) => {
      const restoredGroups = archivedGroups
        .filter((group) => groupTargetIds.has(group.id))
        .map((group) => ({
          ...group,
          isArchived: false,
          lastMessage: preview,
          lastMessageTime: sentAt,
          lastMessageIsOwn: true,
          lastMessageStatus: "sent" as const,
          unreadCount: 0,
        }));
      const updatedGroups = currentGroups.map((group) =>
        groupTargetIds.has(group.id)
          ? {
              ...group,
              isArchived: false,
              lastMessage: preview,
              lastMessageTime: sentAt,
              lastMessageIsOwn: true,
              lastMessageStatus: "sent" as const,
              unreadCount: 0,
            }
          : group,
      );

      return [...restoredGroups, ...updatedGroups];
    });

    setArchivedContacts((currentContacts) =>
      currentContacts.filter(
        (contact) =>
          !contactTargetIds.has(contact.id) ||
          !isStoredDirectContactForCurrentUser(contact, contact.id),
      ),
    );
    setArchivedGroups((currentGroups) =>
      currentGroups.filter((group) => !groupTargetIds.has(group.id)),
    );

    setSelectedContact((currentContact) =>
      currentContact && contactTargetIds.has(currentContact.id)
        ? {
            ...currentContact,
            lastMessage: preview,
            lastMessageTime: sentAt,
            lastMessageIsOwn: true,
            lastMessageStatus: "sent",
            unreadCount: 0,
            isArchived: false,
          }
        : currentContact,
    );
    setSelectedGroup((currentGroup) =>
      currentGroup && groupTargetIds.has(currentGroup.id)
        ? {
            ...currentGroup,
            lastMessage: preview,
            lastMessageTime: sentAt,
            lastMessageIsOwn: true,
            lastMessageStatus: "sent",
            unreadCount: 0,
            isArchived: false,
          }
        : currentGroup,
    );
  };

  const handleShowContactDetails = () => {
    setActiveSidePanel("contact");
  };

  const handleShowMessageSearch = () => {
    setActiveSidePanel("search");
  };

  const handleCloseSidePanel = () => {
    setActiveSidePanel(null);
  };

  const handleSelectSearchResult = (messageId: string) => {
    setHighlightedMessageId(messageId);
  };

  const handleNavigate = (item: string) => {
    if (item === "admin" && currentSessionUser?.isAdmin !== true) return;

    navigateTo(item);
  };

  const handleTypingChange = useCallback(
    (
      scope: TypingIndicatorState["scope"],
      targetId: string,
      isTyping: boolean,
    ) => {
      if (!currentAnnouncementUser.id) return;

      const indicatorKey = getTypingIndicatorKey(
        scope,
        targetId,
        currentAnnouncementUser.id,
      );
      const currentIndicator = typingIndicatorsRef.current[indicatorKey];

      if (!isTyping && !currentIndicator) return;

      if (
        isTyping &&
        currentIndicator &&
        Date.now() - new Date(currentIndicator.updatedAt).getTime() < 1200
      ) {
        return;
      }

      setTypingIndicators((currentIndicators) => {
        const nextIndicators = { ...currentIndicators };

        if (!isTyping) {
          delete nextIndicators[indicatorKey];
          typingIndicatorsRef.current = nextIndicators;
          return nextIndicators;
        }

        nextIndicators[indicatorKey] = {
          scope,
          userId: currentAnnouncementUser.id,
          userName: currentAnnouncementUser.name,
          ...(scope === "chat"
            ? { recipientId: targetId }
            : { groupId: targetId }),
          updatedAt: new Date(),
        };
        typingIndicatorsRef.current = nextIndicators;

        return nextIndicators;
      });

      publishTypingIndicator({
        clientId: backendClientIdRef.current || "unknown-client",
        scope,
        targetId,
        isTyping,
      }).catch(() => undefined);
    },
    [currentAnnouncementUser.id, currentAnnouncementUser.name],
  );

  const handleCreateAnnouncementEvent = (event: AnnouncementEvent) => {
    setDeletedAnnouncementEventIds((currentIds) =>
      currentIds.filter((currentId) => currentId !== event.id),
    );
    setAnnouncementEvents((currentEvents) => [
      ...currentEvents.filter((currentEvent) => currentEvent.id !== event.id),
      event,
    ]);
  };

  const handleUpdateAnnouncementEvent = (event: AnnouncementEvent) => {
    setAnnouncementEvents((currentEvents) =>
      currentEvents.map((currentEvent) =>
        currentEvent.id === event.id ? event : currentEvent,
      ),
    );
    setActiveReminderEvent((currentEvent) =>
      currentEvent?.id === event.id ? event : currentEvent,
    );
  };

  const handleDeleteAnnouncementEvent = (eventId: string) => {
    setDeletedAnnouncementEventIds((currentIds) =>
      currentIds.includes(eventId) ? currentIds : [...currentIds, eventId],
    );
    setAnnouncementEvents((currentEvents) =>
      currentEvents.filter((event) => event.id !== eventId),
    );
    setFocusedAnnouncementEventId((currentEventId) =>
      currentEventId === eventId ? null : currentEventId,
    );
    setActiveReminderEvent((currentEvent) =>
      currentEvent?.id === eventId ? null : currentEvent,
    );
    setReminderCountdown((currentCountdown) =>
      activeReminderEvent?.id === eventId ? 0 : currentCountdown,
    );
  };

  const handleAnnouncementFocusHandled = () => {
    setFocusedAnnouncementEventId(null);
  };

  const handleKanbanFocusHandled = () => {
    setFocusedKanbanCardId(null);
  };

  const handleCreateServiceTicket = (ticket: ServiceTicket) => {
    setServiceTickets((currentTickets) => {
      const nextTickets = [
        ticket,
        ...currentTickets.filter((currentTicket) => currentTicket.id !== ticket.id),
      ];

      latestAppStateRef.current = {
        ...latestAppStateRef.current,
        serviceTickets: nextTickets,
      };

      return nextTickets;
    });
  };

  const handleUpdateServiceTicket = (ticket: ServiceTicket) => {
    setServiceTickets((currentTickets) => {
      const hasTicket = currentTickets.some(
        (currentTicket) => currentTicket.id === ticket.id,
      );
      const nextTickets = hasTicket
        ? currentTickets.map((currentTicket) =>
            currentTicket.id === ticket.id ? ticket : currentTicket,
          )
        : [ticket, ...currentTickets];

      latestAppStateRef.current = {
        ...latestAppStateRef.current,
        serviceTickets: nextTickets,
      };

      return nextTickets;
    });
  };

  const handleCreateLoanRequest = (loan: LoanRequest) => {
    setLoanRequests((currentLoans) => [loan, ...currentLoans]);
  };

  const handleUpdateLoanRequest = (loan: LoanRequest) => {
    const shouldKeepReminder = shouldShowLoanReminder(loan, reminderNow);

    setLoanRequests((currentLoans) =>
      currentLoans.map((currentLoan) =>
        currentLoan.id === loan.id ? loan : currentLoan,
      ),
    );
    setActiveLoanReminderId((currentLoanId) =>
      currentLoanId === loan.id && !shouldKeepReminder ? null : currentLoanId,
    );
    setLoanReminderCountdown((currentCountdown) =>
      activeLoanReminderId === loan.id && !shouldKeepReminder
        ? 0
        : currentCountdown,
    );
  };

  const handleLoanFocusHandled = () => {
    setFocusedLoanId(null);
  };

  const handleResolveLoanRequest = (loanId: string) => {
    const loan = loanRequests.find((currentLoan) => currentLoan.id === loanId);

    if (!loan) return;

    handleUpdateLoanRequest({
      ...loan,
      status: "resolved",
      resolvedAt: new Date(),
      resolvedById: currentAnnouncementUser.id,
      resolvedByName: currentAnnouncementUser.name,
      resolvedBySector: currentUserSector,
    });
  };

  const markAnnouncementReminderSeen = (event: AnnouncementEvent) => {
    const reminderKey = getAnnouncementReminderKey(
      currentAnnouncementUser.id,
      event,
      reminderNow,
    );

    setDismissedAnnouncementReminderKeys((currentKeys) => {
      const nextKeys = currentKeys.includes(reminderKey)
        ? currentKeys
        : [...currentKeys, reminderKey];

      try {
        window.localStorage.setItem(
          getReminderStorageKey(currentAnnouncementUser.id),
          JSON.stringify(nextKeys),
        );
      } catch {
        // O aviso continua funcionando mesmo se o navegador bloquear storage.
      }

      return nextKeys;
    });
  };

  const markKanbanDueReminderSeen = (card: KanbanCard) => {
    const reminderKey = getKanbanDueReminderKey(
      currentAnnouncementUser.id,
      card,
      reminderNow,
    );

    setDismissedKanbanDueReminderKeys((currentKeys) => {
      const nextKeys = currentKeys.includes(reminderKey)
        ? currentKeys
        : [...currentKeys, reminderKey];

      try {
        window.localStorage.setItem(
          getKanbanDueReminderStorageKey(currentAnnouncementUser.id),
          JSON.stringify(nextKeys),
        );
      } catch {
        // O aviso continua funcionando mesmo se o navegador bloquear storage.
      }

      return nextKeys;
    });
  };

  const markLoanReminderSeen = (loan: LoanRequest) => {
    const reminderKey = getLoanReminderKey(
      currentAnnouncementUser.id,
      loan,
      reminderNow,
    );

    setDismissedLoanReminderKeys((currentKeys) => {
      const nextKeys = currentKeys.includes(reminderKey)
        ? currentKeys
        : [...currentKeys, reminderKey];

      try {
        window.localStorage.setItem(
          getLoanReminderStorageKey(currentAnnouncementUser.id),
          JSON.stringify(nextKeys),
        );
      } catch {
        // O aviso continua funcionando mesmo se o navegador bloquear storage.
      }

      return nextKeys;
    });
  };

  const handleDismissAnnouncementReminder = () => {
    if (activeReminderEvent) {
      markAnnouncementReminderSeen(activeReminderEvent);
    }

    setActiveReminderEvent(null);
    setReminderCountdown(0);
    setActivePriorityMessageAlert(null);
    setPriorityMessageCountdown(0);
  };

  const handleDismissKanbanDueReminder = () => {
    if (activeKanbanDueReminderCard) {
      markKanbanDueReminderSeen(activeKanbanDueReminderCard);
    }

    setActiveKanbanDueReminderCardId(null);
    setKanbanDueReminderCountdown(0);
  };

  const handleDismissLoanReminder = () => {
    if (activeLoanReminder) {
      markLoanReminderSeen(activeLoanReminder);
    }

    setActiveLoanReminderId(null);
    setLoanReminderCountdown(0);
  };

  const handleViewAnnouncementReminder = () => {
    if (!activeReminderEvent) return;

    markAnnouncementReminderSeen(activeReminderEvent);
    setFocusedAnnouncementEventId(activeReminderEvent.id);
    setActiveReminderEvent(null);
    setReminderCountdown(0);
    navigateTo("anuncios-eventos");
  };

  const handleViewKanbanDueReminder = () => {
    if (!activeKanbanDueReminderCard) return;

    markKanbanDueReminderSeen(activeKanbanDueReminderCard);
    setFocusedKanbanCardId(activeKanbanDueReminderCard.id);
    setActiveKanbanDueReminderCardId(null);
    setKanbanDueReminderCountdown(0);
    navigateTo("kanban");
  };

  const handleViewLoanReminder = () => {
    if (!activeLoanReminder) return;

    markLoanReminderSeen(activeLoanReminder);
    setFocusedLoanId(activeLoanReminder.id);
    setActiveLoanReminderId(null);
    setLoanReminderCountdown(0);
    navigateTo("emprestimos");
  };

  const handleProfileChange = useCallback(
    (profile: ProfileUpdate) => {
      if (!currentSessionUser) return;

      const updatedUser: AuthenticatedUser = {
        ...currentSessionUser,
        ...profile,
        avatar: profile.avatar ?? currentSessionUser.avatar,
        lastSeenAt: new Date(),
      };

      setCurrentSessionUser(updatedUser);
      setAdminUsers((currentUsers) => {
        let foundUser = false;
        const updatedUsers = currentUsers.map((user) => {
          const sameUser =
            user.id === updatedUser.id ||
            user.email.toLowerCase() === updatedUser.email.toLowerCase();

          if (!sameUser) return user;

          foundUser = true;

          return {
            ...user,
            name: updatedUser.name,
            email: updatedUser.email,
            sector: updatedUser.sector,
            isAdmin: user.isAdmin || updatedUser.isAdmin,
            avatar: updatedUser.avatar,
            about: updatedUser.about,
            chatStatus: updatedUser.chatStatus,
            workStatus: updatedUser.workStatus,
            lastSeenAt: updatedUser.lastSeenAt,
          };
        });

        if (foundUser) return updatedUsers;

        return [
          {
            id: updatedUser.id,
            name: updatedUser.name,
            email: updatedUser.email,
            sector: updatedUser.sector,
            password: "",
            isAdmin: updatedUser.isAdmin,
            status: "active",
            createdAt: new Date(),
            avatar: updatedUser.avatar,
            about: updatedUser.about,
            chatStatus: updatedUser.chatStatus,
            workStatus: updatedUser.workStatus,
            lastSeenAt: updatedUser.lastSeenAt,
          },
          ...updatedUsers,
        ];
      });
      const syncProfileContact = (contact: Contact) => {
        const sameUser =
          contact.id === updatedUser.id ||
          contact.email.toLowerCase() === updatedUser.email.toLowerCase();

        if (!sameUser) return contact;

        const chatStatus = updatedUser.chatStatus ?? "online";

        return {
          ...contact,
          name: updatedUser.name,
          avatar: updatedUser.avatar,
          about: updatedUser.about ?? contact.about,
          isOnline: chatStatus === "online",
          chatStatus,
          workStatus: updatedUser.workStatus,
          lastSeenAt: updatedUser.lastSeenAt,
        };
      };

      setContacts((currentContacts) => currentContacts.map(syncProfileContact));
      setArchivedContacts((currentContacts) =>
        currentContacts.map(syncProfileContact),
      );
      setSelectedContact((currentContact) =>
        currentContact ? syncProfileContact(currentContact) : currentContact,
      );
      setAdminReports((currentReports) =>
        currentReports.map((report) =>
          report.sourceEmail.toLowerCase() === updatedUser.email.toLowerCase()
            ? {
                ...report,
                sourceAvatar: updatedUser.avatar,
              }
            : report,
        ),
      );

      saveUserProfile({
        ...updatedUser,
        clientId: backendClientIdRef.current || "profile-client",
      }).catch((error) => console.error(error));
    },
    [currentSessionUser],
  );

  const handleLogin = (user: AuthenticatedUser) => {
    setCurrentSessionUser({
      ...user,
      avatar: user.avatar ?? "",
      lastSeenAt: user.lastSeenAt ?? new Date(),
    });
    setIsAuthenticated(true);
    setIsCheckingSession(false);
    navigateTo(activeNav, "replace");
  };

  const handleLogout = () => {
    if (currentSessionUser) {
      const seenAt = new Date();

      setAdminUsers((currentUsers) =>
        currentUsers.map((user) =>
          user.id === currentSessionUser.id ||
          user.email.toLowerCase() === currentSessionUser.email.toLowerCase()
            ? { ...user, chatStatus: "offline", lastSeenAt: seenAt }
            : user,
        ),
      );
    }

    clearCurrentSession(backendClientIdRef.current).catch((error) =>
      console.error(error),
    );
    setIsAuthenticated(false);
    setIsCheckingSession(false);
    setCurrentSessionUser(null);
    setSelectedContact(null);
    setSelectedGroup(null);
    setActiveSidePanel(null);
    setIsMobileSidebarOpen(false);
    setActiveReminderEvent(null);
    setReminderCountdown(0);
    setActiveKanbanDueReminderCardId(null);
    setKanbanDueReminderCountdown(0);
    setActiveLoanReminderId(null);
    setLoanReminderCountdown(0);
  };

  const handleSubmitAccessRequest = (request: AccessRequestInput) => {
    setAccessRequests((currentRequests) => [
      {
        ...request,
        id: `access-request-${Date.now()}`,
        createdAt: new Date(),
        status: "pending",
      },
      ...currentRequests,
    ]);
  };

  const handleCreateAdminUser = (user: AdminUserInput, requestId?: string) => {
    setAdminUsers((currentUsers) => [
      {
        ...user,
        id: `admin-user-${Date.now()}`,
        status: "active",
        createdAt: new Date(),
      },
      ...currentUsers,
    ]);

    if (!requestId) return;

    setAccessRequests((currentRequests) =>
      currentRequests.map((request) =>
        request.id === requestId ? { ...request, status: "created" } : request,
      ),
    );
  };

  const handleUpdateAdminUser = (userId: string, user: AdminUserInput) => {
    setAdminUsers((currentUsers) =>
      currentUsers.map((currentUser) =>
        currentUser.id === userId ? { ...currentUser, ...user } : currentUser,
      ),
    );
  };

  const handleToggleAdminUserBlocked = (userId: string) => {
    setAdminUsers((currentUsers) =>
      currentUsers.map((currentUser) =>
        currentUser.id === userId
          ? {
              ...currentUser,
              status: currentUser.status === "blocked" ? "active" : "blocked",
            }
          : currentUser,
      ),
    );
  };

  const handleDeleteAdminUser = (userId: string) => {
    setAdminUsers((currentUsers) =>
      currentUsers.filter((currentUser) => currentUser.id !== userId),
    );
  };

  const handleRejectAccessRequest = (requestId: string) => {
    setAccessRequests((currentRequests) =>
      currentRequests.map((request) =>
        request.id === requestId ? { ...request, status: "rejected" } : request,
      ),
    );
  };

  const handleMarkReportReviewed = (reportId: string) => {
    setAdminReports((currentReports) =>
      currentReports.map((report) =>
        report.id === reportId && report.status !== "deleted"
          ? { ...report, status: "reviewed" }
          : report,
      ),
    );
  };

  const handleDeleteAdminReport = (reportId: string) => {
    setAdminReports((currentReports) =>
      currentReports.map((report) =>
        report.id === reportId ? { ...report, status: "deleted" } : report,
      ),
    );
  };

  const handleReopenAdminReport = (reportId: string) => {
    setAdminReports((currentReports) =>
      currentReports.map((report) =>
        report.id === reportId ? { ...report, status: "new" } : report,
      ),
    );
  };

  const handleCreateHelpItem = (item: Omit<HelpContentItem, "id">) => {
    setHelpItems((currentItems) => [
      ...currentItems,
      {
        ...item,
        id: `help-${Date.now()}`,
      },
    ]);
  };

  const handleDeleteHelpItem = (itemId: string) => {
    setHelpItems((currentItems) =>
      currentItems.filter((item) => item.id !== itemId),
    );
  };

  const handleUpdateHelpItem = (
    itemId: string,
    item: Omit<HelpContentItem, "id">,
  ) => {
    setHelpItems((currentItems) =>
      currentItems.map((currentItem) =>
        currentItem.id === itemId ? { ...currentItem, ...item } : currentItem,
      ),
    );
  };

  const handleMoveHelpItem = (itemId: string, direction: -1 | 1) => {
    setHelpItems((currentItems) => {
      const itemIndex = currentItems.findIndex((item) => item.id === itemId);
      const nextIndex = itemIndex + direction;

      if (
        itemIndex === -1 ||
        nextIndex < 0 ||
        nextIndex >= currentItems.length
      ) {
        return currentItems;
      }

      const nextItems = [...currentItems];
      const [movedItem] = nextItems.splice(itemIndex, 1);

      nextItems.splice(nextIndex, 0, movedItem);

      return nextItems;
    });
  };

  const handleMoveHelpItemImage = (
    itemId: string,
    imageId: string,
    direction: -1 | 1,
  ) => {
    setHelpItems((currentItems) =>
      currentItems.map((item) => {
        if (item.id !== itemId) return item;

        const imageIndex = item.images.findIndex(
          (image) => image.id === imageId,
        );
        const nextIndex = imageIndex + direction;

        if (
          imageIndex === -1 ||
          nextIndex < 0 ||
          nextIndex >= item.images.length
        ) {
          return item;
        }

        const nextImages = [...item.images];
        const [movedImage] = nextImages.splice(imageIndex, 1);

        nextImages.splice(nextIndex, 0, movedImage);

        return {
          ...item,
          images: nextImages,
        };
      }),
    );
  };

  const handleCreateExtensionItem = (
    item: Omit<ExtensionContentItem, "id">,
  ) => {
    setExtensionItems((currentItems) => [
      ...currentItems,
      {
        ...item,
        id: `extension-${Date.now()}`,
      },
    ]);
  };

  const handleDeleteExtensionItem = (itemId: string) => {
    setExtensionItems((currentItems) =>
      currentItems.filter((item) => item.id !== itemId),
    );
  };

  const handleUpdateExtensionItem = (
    itemId: string,
    item: Omit<ExtensionContentItem, "id">,
  ) => {
    setExtensionItems((currentItems) =>
      currentItems.map((currentItem) =>
        currentItem.id === itemId ? { ...currentItem, ...item } : currentItem,
      ),
    );
  };

  const handleBack = () => {
    if (activeSidePanel) {
      setActiveSidePanel(null);
    } else if (activeNav === "grupos") {
      setSelectedGroup(null);
    } else {
      setSelectedContact(null);
    }
  };

  if (isCheckingSession) {
    return (
      <div className="flex h-full min-h-96 w-full items-center justify-center bg-background text-sm text-muted-foreground">
        Carregando sessão...
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex h-full min-h-96 w-full items-center justify-center bg-background p-6 text-center text-sm text-muted-foreground">
        Entre novamente pelo login do sistema para acessar esta aba.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden bg-background">
      <Dialog
        open={Boolean(reportConversationTarget)}
        onOpenChange={handleReportDialogOpenChange}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Denunciar conversa</DialogTitle>
            <DialogDescription className="sr-only">
              Descreva o motivo da denúncia desta conversa.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
            <p className="font-medium text-foreground">
              {reportConversationTarget?.contact.name}
            </p>
            <p className="text-muted-foreground">
              {reportConversationTarget?.contact.email}
            </p>
          </div>

          <Textarea
            value={conversationReportText}
            onChange={(event) => setConversationReportText(event.target.value)}
            placeholder="Descreva a denúncia para a administração"
            className="thin-gray-scrollbar min-h-32 resize-none bg-muted"
          />

          <div className="-mx-4 -mb-4 flex justify-end gap-2 border-t bg-muted/50 p-4">
            <Button
              variant="ghost"
              onClick={() => handleReportDialogOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSubmitConversationReport}
              disabled={!conversationReportText.trim()}
            >
              Enviar denúncia
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(conversationConfirmAction)}
        onOpenChange={handleConversationConfirmOpenChange}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {conversationConfirmAction?.type === "clear"
                ? "Limpar conversa?"
                : "Apagar conversa?"}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Confirme a ação que será aplicada apenas ao seu usuário.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
              <p className="font-medium text-foreground">
                {conversationConfirmAction?.contact.name}
              </p>
              <p className="text-muted-foreground">
                {conversationConfirmAction?.contact.email}
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              {conversationConfirmAction?.type === "clear"
                ? "Todas as mensagens desta conversa serão apagadas para você, mas a conversa continua na lista."
                : "Esta conversa será removida da sua lista e as mensagens dela serão apagadas para você."}
            </p>
          </div>

          <div className="-mx-4 -mb-4 flex justify-end gap-2 border-t bg-muted/50 p-4">
            <Button
              variant="ghost"
              onClick={() => handleConversationConfirmOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              className="text-destructive hover:text-destructive"
              variant="ghost"
              onClick={handleConfirmConversationAction}
            >
              {conversationConfirmAction?.type === "clear"
                ? "Limpar conversa"
                : "Apagar conversa"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(activeReminderEvent)}>
        <DialogContent
          showCloseButton={false}
          className="sm:max-w-md"
          onEscapeKeyDown={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
        >
          {activeReminderEvent && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 pr-2">
                  <BellRing className="h-5 w-5 text-primary" />
                  Aviso de evento
                </DialogTitle>
                <DialogDescription className="sr-only">
                  Lembrete de evento enviado para o seu usuário.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4">
                <div className="rounded-lg border bg-muted/45 p-4">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <CalendarDays className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm text-muted-foreground">
                        {getReminderDayLabel(
                          getDayDifference(
                            reminderNow,
                            activeReminderEvent.scheduledAt,
                          ),
                        )}
                      </p>
                      <h2 className="mt-1 break-words text-lg font-semibold leading-6">
                        {getAlertPreviewText(activeReminderEvent.title)}
                      </h2>
                      <p className="mt-2 text-sm font-medium">
                        {activeReminderEvent.scheduledAt.toLocaleString(
                          "pt-BR",
                          {
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                            month: "long",
                            year: "numeric",
                          },
                        )}
                      </p>
                    </div>
                  </div>
                </div>

                <p className="text-sm leading-6 text-muted-foreground">
                  Este lembrete é enviado às 06:00. Recomendamos que você dê uma
                  olhada na página de anúncios para ver todas as informações do
                  evento.
                </p>

                {reminderCountdown > 0 && (
                  <div className="rounded-md bg-primary/10 px-3 py-2 text-sm font-medium text-primary">
                    Aguarde {reminderCountdown}s para liberar as ações.
                  </div>
                )}
              </div>

              <div className="-mx-4 -mb-4 flex justify-end gap-2 border-t bg-muted/50 p-4">
                <Button
                  variant="ghost"
                  disabled={reminderCountdown > 0}
                  onClick={handleDismissAnnouncementReminder}
                >
                  Fechar anúncio
                </Button>
                <Button
                  disabled={reminderCountdown > 0}
                  onClick={handleViewAnnouncementReminder}
                >
                  Ver anúncio
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(activeKanbanDueReminderCard)}>
        <DialogContent
          showCloseButton={false}
          className="sm:max-w-md"
          onEscapeKeyDown={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
        >
          {activeKanbanDueReminderCard && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 pr-2">
                  <BellRing className="h-5 w-5 text-primary" />
                  Aviso de vencimento
                </DialogTitle>
                <DialogDescription className="sr-only">
                  Lembrete de cartão do Kanban vencendo hoje.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4">
                <div className="rounded-lg border bg-muted/45 p-4">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <KanbanIcon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm text-muted-foreground">
                        Você tem um cartão vencendo hoje
                      </p>
                      <h2 className="mt-1 break-words text-lg font-semibold leading-6">
                        {getAlertPreviewText(activeKanbanDueReminderCard.title)}
                      </h2>
                      {activeKanbanDueReminderCard.dueDate && (
                        <p className="mt-2 text-sm font-medium">
                          {formatKanbanDueDate(
                            activeKanbanDueReminderCard.dueDate,
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <p className="text-sm leading-6 text-muted-foreground">
                  <span className="block">
                    Você recebeu este aviso porque este cartão vence hoje no seu
                    Kanban particular.
                  </span>
                  <span className="block">
                    Abra o cartão para revisar checklist, anexos e próximos
                    passos.
                  </span>
                </p>

                {kanbanDueReminderCountdown > 0 && (
                  <div className="rounded-md bg-primary/10 px-3 py-2 text-sm font-medium text-primary">
                    Aguarde {kanbanDueReminderCountdown}s para liberar as ações.
                  </div>
                )}
              </div>

              <div className="-mx-4 -mb-4 flex justify-end gap-2 border-t bg-muted/50 p-4">
                <Button
                  variant="ghost"
                  disabled={kanbanDueReminderCountdown > 0}
                  onClick={handleDismissKanbanDueReminder}
                >
                  Fechar aviso
                </Button>
                <Button
                  disabled={kanbanDueReminderCountdown > 0}
                  onClick={handleViewKanbanDueReminder}
                >
                  Abrir cartão
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(activeLoanReminder)}>
        <DialogContent
          showCloseButton={false}
          className="sm:max-w-md"
          onEscapeKeyDown={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
        >
          {activeLoanReminder && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 pr-2">
                  <BellRing className="h-5 w-5 text-primary" />
                  Aviso de empréstimo
                </DialogTitle>
                <DialogDescription className="sr-only">
                  Lembrete de empréstimo atribuído ao seu usuário.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4">
                <div className="rounded-lg border bg-muted/45 p-4">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <HandCoins className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm text-muted-foreground">
                        {isLoanDueToday(activeLoanReminder, reminderNow)
                          ? "Seu empréstimo vence hoje"
                          : "Seu empréstimo está atrasado"}
                      </p>
                      <h2 className="mt-1 break-words text-lg font-semibold leading-6">
                        {getAlertPreviewText(activeLoanReminder.title)}
                      </h2>
                      <p className="mt-2 text-sm font-medium">
                        {formatLoanDate(activeLoanReminder.requestedReturnDate)}
                      </p>
                    </div>
                  </div>
                </div>

                <p className="text-sm leading-6 text-muted-foreground">
                  <span className="block">
                    Você recebeu este aviso porque este material está em seu
                    nome.
                  </span>
                  <span className="block">
                    Abra a página de empréstimos para revisar a devolução ou
                    pedir adiamento.
                  </span>
                </p>

                {loanReminderCountdown > 0 && (
                  <div className="rounded-md bg-primary/10 px-3 py-2 text-sm font-medium text-primary">
                    Aguarde {loanReminderCountdown}s para liberar as ações.
                  </div>
                )}
              </div>

              <div className="-mx-4 -mb-4 flex justify-end gap-2 border-t bg-muted/50 p-4">
                <Button
                  variant="ghost"
                  disabled={loanReminderCountdown > 0}
                  onClick={handleDismissLoanReminder}
                >
                  Fechar aviso
                </Button>
                <Button
                  disabled={loanReminderCountdown > 0}
                  onClick={handleViewLoanReminder}
                >
                  Ver empréstimo
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(activePriorityMessageAlert)}>
        <DialogContent
          showCloseButton={false}
          className="sm:max-w-md"
          onEscapeKeyDown={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
        >
          {activePriorityMessageAlert && (
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
                      {activePriorityMessageAlert.scope === "group" ? (
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
                          getConversationMessagePreview(
                            activePriorityMessageAlert.message,
                          ),
                        )}
                      </h2>
                      <p className="mt-2 text-sm font-medium">
                        {activePriorityMessageAlert.message.timestamp.toLocaleString(
                          "pt-BR",
                          {
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                            month: "long",
                            year: "numeric",
                          },
                        )}
                      </p>
                    </div>
                  </div>
                </div>

                <p className="text-sm leading-6 text-muted-foreground">
                  <span className="block">
                    Você recebeu este aviso porque a mensagem foi marcada como
                    prioritária.
                  </span>
                  <span className="block">
                    Ela pode exigir atenção imediata no chat interno ou no
                    grupo.
                  </span>
                  <span className="block">
                    Abra a conversa para ler tudo e responder quando necessário.
                  </span>
                </p>

                {priorityMessageCountdown > 0 && (
                  <div className="rounded-md bg-primary/10 px-3 py-2 text-sm font-medium text-primary">
                    Aguarde {priorityMessageCountdown}s para liberar as ações.
                  </div>
                )}
              </div>

              <div className="-mx-4 -mb-4 flex justify-end gap-2 border-t bg-muted/50 p-4">
                <Button
                  variant="ghost"
                  disabled={priorityMessageCountdown > 0}
                  onClick={handleDismissPriorityMessageAlert}
                >
                  Fechar mensagem
                </Button>
                <Button
                  disabled={priorityMessageCountdown > 0}
                  onClick={handleOpenPriorityMessageAlert}
                >
                  Abrir mensagem
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <div
        key={activeNav}
        className={cn(
          "flex h-full min-w-0 flex-1 overflow-hidden",
          (activeNav === "chat" || activeNav === "grupos") &&
            "rounded-lg border border-border/80 bg-background shadow-sm",
        )}
      >
        {activeNav === "admin" && currentSessionUser?.isAdmin === true ? (
          <AdminPanel
            accessRequests={accessRequests}
            users={adminUsers}
            reports={adminReports}
            loans={loanRequests}
            serviceTickets={serviceTickets}
            helpItems={helpItems}
            extensionItems={extensionItems}
            onCreateUser={handleCreateAdminUser}
            onUpdateUser={handleUpdateAdminUser}
            onToggleUserBlocked={handleToggleAdminUserBlocked}
            onDeleteUser={handleDeleteAdminUser}
            onRejectAccessRequest={handleRejectAccessRequest}
            onMarkReportReviewed={handleMarkReportReviewed}
            onDeleteReport={handleDeleteAdminReport}
            onReopenReport={handleReopenAdminReport}
            onResolveLoan={handleResolveLoanRequest}
            onCreateHelpItem={handleCreateHelpItem}
            onUpdateHelpItem={handleUpdateHelpItem}
            onDeleteHelpItem={handleDeleteHelpItem}
            onMoveHelpItem={handleMoveHelpItem}
            onMoveHelpItemImage={handleMoveHelpItemImage}
            onCreateExtensionItem={handleCreateExtensionItem}
            onUpdateExtensionItem={handleUpdateExtensionItem}
            onDeleteExtensionItem={handleDeleteExtensionItem}
          />
        ) : activeNav === "chat" ? (
          <>
            {/* Conversation List */}
            <div
              className={cn(
                "h-full w-full border-r bg-background md:w-[340px] md:min-w-[300px] lg:w-[380px]",
                selectedContact ? "hidden md:block" : "block",
              )}
            >
              <ConversationList
                contacts={displayContacts}
                directoryUsers={directoryUsers}
                selectedContact={selectedDisplayContact}
                onSelectContact={handleSelectContact}
                onStartConversation={handleStartConversation}
                onArchiveContact={
                  showArchived ? handleUnarchiveContact : handleArchiveContact
                }
                onMuteContact={handleMuteContact}
                onPinContact={handlePinContact}
                onReportContact={handleReportConversation}
                onClearContact={handleClearConversation}
                onDeleteContact={handleDeleteContact}
                showArchived={showArchived}
                onToggleArchived={() => setShowArchived(!showArchived)}
                archivedCount={visibleArchivedContactCount}
              />
            </div>

            {/* Main Chat Area */}
            <div
              className={cn(
                "h-full min-w-0 flex-1",
                selectedContact
                  ? "mobile-chat-open fixed inset-0 z-40 flex bg-background md:static md:z-auto md:bg-transparent"
                  : "hidden md:flex",
              )}
            >
              {selectedContact ? (
                <>
                  {/* Chat Window */}
                  <div
                    className={cn(
                      "h-full min-w-0 transition-all duration-300",
                      activeSidePanel
                        ? "hidden md:flex md:flex-1"
                        : "flex flex-1",
                    )}
                  >
                    <ChatWindow
                      contact={selectedDisplayContact ?? selectedContact}
                      currentUser={currentAnnouncementUser}
                      forwardTargets={forwardTargets}
                      messages={selectedMessages}
                      setMessages={setSelectedMessages}
                      highlightedMessageId={highlightedMessageId}
                      onForwardMessage={handleForwardMessage}
                      onBack={handleBack}
                      onShowContactDetails={handleShowContactDetails}
                      onShowMessageSearch={handleShowMessageSearch}
                      onMuteConversation={() =>
                        handleMuteContact(selectedContact.id)
                      }
                      onPinConversation={() =>
                        handlePinContact(selectedContact.id)
                      }
                      onReportConversation={() =>
                        handleReportConversation(selectedContact.id)
                      }
                      onReportMessage={handleReportMessage}
                      onClearConversation={() =>
                        handleClearConversation(selectedContact.id)
                      }
                      onDeleteConversation={() =>
                        handleDeleteContact(selectedContact.id)
                      }
                      onTypingChange={(isTyping) =>
                        handleTypingChange("chat", selectedContact.id, isTyping)
                      }
                    />
                  </div>

                  {/* Side Panel */}
                  {activeSidePanel && (
                    <div className="h-full w-full shrink-0 md:w-[340px] md:min-w-[300px] lg:w-[380px]">
                      {activeSidePanel === "contact" ? (
                        <ContactDetails
                          contact={selectedDisplayContact ?? selectedContact}
                          currentUser={currentAnnouncementUser}
                          messages={selectedMessages}
                          onClose={handleCloseSidePanel}
                          onMute={() => handleMuteContact(selectedContact.id)}
                          onPin={() => handlePinContact(selectedContact.id)}
                          onReport={() =>
                            handleReportConversation(selectedContact.id)
                          }
                          onClear={() =>
                            handleClearConversation(selectedContact.id)
                          }
                          onDelete={() =>
                            handleDeleteContact(selectedContact.id)
                          }
                        />
                      ) : (
                        <MessageSearchPanel
                          messages={selectedMessages}
                          onClose={handleCloseSidePanel}
                          onSelectMessage={handleSelectSearchResult}
                        />
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="relative flex h-full w-full flex-col items-center justify-center gap-4 overflow-hidden bg-background p-8">
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-5 rounded-xl border border-dashed border-border/55 md:inset-8"
                  />
                  <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 shadow-lg shadow-primary/5">
                    <MessageCircle className="h-12 w-12 text-primary" />
                  </div>
                  <div className="relative text-center">
                    <h2 className="text-2xl font-semibold text-foreground">
                      Bem-vindo ao Chat
                    </h2>
                    <p className="mt-2 max-w-md text-muted-foreground">
                      Selecione uma conversa ao lado para começar a trocar
                      mensagens com seus contatos.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : activeNav === "ajuda" ? (
          <HelpPage items={helpItems} />
        ) : activeNav === "ramais" ? (
          <ExtensionsPage items={extensionItems} />
        ) : activeNav === "dashboard" ? (
          <WorkspacePlaceholder activeNav={activeNav} />
        ) : activeNav === "atendimentos" ? (
          <ServiceTicketsPage
            currentUser={currentServiceTicketUser}
            users={serviceTicketUsers}
            tickets={serviceTickets}
            onCreateTicket={handleCreateServiceTicket}
            onUpdateTicket={handleUpdateServiceTicket}
          />
        ) : activeNav === "anuncios-eventos" ? (
          <AnnouncementsEventsPage
            events={announcementEvents}
            focusEventId={focusedAnnouncementEventId}
            currentUserId={currentAnnouncementUser.id}
            currentUserName={currentAnnouncementUser.name}
            onCreateEvent={handleCreateAnnouncementEvent}
            onUpdateEvent={handleUpdateAnnouncementEvent}
            onDeleteEvent={handleDeleteAnnouncementEvent}
            onFocusEventHandled={handleAnnouncementFocusHandled}
            recipients={announcementRecipients}
          />
        ) : activeNav === "emprestimos" ? (
          <LoansPage
            currentUser={currentAnnouncementUser}
            currentUserSector={currentUserSector}
            loans={loanRequests}
            focusLoanId={focusedLoanId}
            onCreateLoan={handleCreateLoanRequest}
            onUpdateLoan={handleUpdateLoanRequest}
            onFocusLoanHandled={handleLoanFocusHandled}
          />
        ) : activeNav === "kanban" ? (
          <KanbanPage
            columns={kanbanColumns}
            cardsById={kanbanCardsById}
            labels={kanbanLabels}
            focusCardId={focusedKanbanCardId}
            onColumnsChange={setKanbanColumns}
            onCardsChange={setKanbanCardsById}
            onLabelsChange={setKanbanLabels}
            onFocusCardHandled={handleKanbanFocusHandled}
          />
        ) : activeNav === "grupos" ? (
          <>
            <div
              className={cn(
                "h-full w-full border-r bg-background md:w-[340px] md:min-w-[300px] lg:w-[380px]",
                selectedGroup ? "hidden md:block" : "block",
              )}
            >
              <ConversationList
                title="Grupos"
                searchPlaceholder="Pesquisar grupos"
                createMode="group"
                contacts={displayGroups}
                directoryUsers={directoryUsers}
                selectedContact={selectedDisplayGroup}
                onSelectContact={handleSelectGroup}
                onStartConversation={() => undefined}
                onCreateGroup={handleCreateGroup}
                onArchiveContact={
                  showArchivedGroups ? handleUnarchiveGroup : handleArchiveGroup
                }
                onMuteContact={handleMuteGroup}
                onPinContact={handlePinGroup}
                onReportContact={handleReportGroupConversation}
                onClearContact={handleClearGroupConversation}
                onLeaveGroup={handleLeaveGroup}
                onDeleteContact={handleDeleteGroup}
                showArchived={showArchivedGroups}
                onToggleArchived={() =>
                  setShowArchivedGroups((currentValue) => !currentValue)
                }
                archivedCount={visibleArchivedGroupCount}
              />
            </div>

            <div
              className={cn(
                "h-full min-w-0 flex-1",
                selectedGroup
                  ? "mobile-chat-open fixed inset-0 z-40 flex bg-background md:static md:z-auto md:bg-transparent"
                  : "hidden md:flex",
              )}
            >
              {selectedGroup ? (
                <>
                  <div
                    className={cn(
                      "h-full min-w-0 transition-all duration-300",
                      activeSidePanel
                        ? "hidden md:flex md:flex-1"
                        : "flex flex-1",
                    )}
                  >
                    <ChatWindow
                      contact={selectedDisplayGroup ?? selectedGroup}
                      currentUser={currentAnnouncementUser}
                      forwardTargets={selectedGroupForwardTargets}
                      messages={selectedGroupMessages}
                      setMessages={setSelectedGroupMessages}
                      isGroup
                      groupParticipants={selectedGroupParticipants}
                      highlightedMessageId={highlightedMessageId}
                      onForwardMessage={handleForwardMessage}
                      onBack={handleBack}
                      onShowContactDetails={handleShowContactDetails}
                      onShowMessageSearch={handleShowMessageSearch}
                      onMuteConversation={() =>
                        handleMuteGroup(selectedGroup.id)
                      }
                      onPinConversation={() => handlePinGroup(selectedGroup.id)}
                      onReportConversation={() =>
                        handleReportGroupConversation(selectedGroup.id)
                      }
                      onReportMessage={handleReportMessage}
                      onClearConversation={() =>
                        handleClearGroupConversation(selectedGroup.id)
                      }
                      onDeleteConversation={() =>
                        handleDeleteGroup(selectedGroup.id)
                      }
                      onTypingChange={(isTyping) =>
                        handleTypingChange("group", selectedGroup.id, isTyping)
                      }
                    />
                  </div>

                  {activeSidePanel && (
                    <div className="h-full w-full shrink-0 md:w-[340px] md:min-w-[300px] lg:w-[380px]">
                      {activeSidePanel === "contact" ? (
                        <ContactDetails
                          contact={selectedDisplayGroup ?? selectedGroup}
                          currentUser={currentAnnouncementUser}
                          messages={selectedGroupMessages}
                          isGroup
                          groupParticipants={selectedGroupParticipants}
                          groupAdminIds={selectedGroupAdminIds}
                          groupCreatorId={selectedGroupMetadata?.creatorId}
                          availableParticipants={directoryUsers}
                          canEditGroup={canManageSelectedGroup}
                          onClose={handleCloseSidePanel}
                          onUpdateGroup={handleUpdateSelectedGroupDetails}
                          onAddGroupParticipants={handleAddGroupParticipants}
                          onRemoveGroupParticipant={
                            handleRemoveGroupParticipant
                          }
                          onToggleGroupParticipantAdmin={
                            handleToggleGroupParticipantAdmin
                          }
                          onMute={() => handleMuteGroup(selectedGroup.id)}
                          onPin={() => handlePinGroup(selectedGroup.id)}
                          onReport={() =>
                            handleReportGroupConversation(selectedGroup.id)
                          }
                          onClear={() =>
                            handleClearGroupConversation(selectedGroup.id)
                          }
                          onLeaveGroup={() =>
                            handleLeaveGroup(selectedGroup.id)
                          }
                          onDelete={() => handleDeleteGroup(selectedGroup.id)}
                        />
                      ) : (
                        <MessageSearchPanel
                          messages={selectedGroupMessages}
                          onClose={handleCloseSidePanel}
                          onSelectMessage={handleSelectSearchResult}
                        />
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="relative flex h-full w-full flex-col items-center justify-center gap-4 overflow-hidden bg-background p-8">
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-5 rounded-xl border border-dashed border-border/55 md:inset-8"
                  />
                  <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 shadow-lg shadow-primary/5">
                    <Users className="h-12 w-12 text-primary" />
                  </div>
                  <div className="relative text-center">
                    <h2 className="text-2xl font-semibold text-foreground">
                      Grupos
                    </h2>
                    <p className="mt-2 max-w-md text-muted-foreground">
                      Crie ou selecione um grupo ao lado para conversar com sua
                      equipe.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <WorkspacePlaceholder activeNav={activeNav} />
        )}
      </div>
    </div>
  );
}
