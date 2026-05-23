"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { toast } from "sonner";
import { Badge } from "@/components/unipar-ui/badge";
import { Button } from "@/components/unipar-ui/button";
import { Calendar } from "@/components/unipar-ui/calendar";
import { Checkbox } from "@/components/unipar-ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/unipar-ui/dialog";
import { Input } from "@/components/unipar-ui/input";
import { Label } from "@/components/unipar-ui/label";
import {
  OptionCombobox,
  workspaceSectorComboboxOptions,
  type ComboboxOption,
} from "@/components/option-combobox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/unipar-ui/popover";
import { Textarea } from "@/components/unipar-ui/textarea";
import {
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  Paperclip,
  Pencil,
  Plus,
  Search,
  Send,
  Trash2,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { ptBR } from "date-fns/locale";
import { SECTOR_OPTIONS, type Sector } from "@/lib/admin-data";
import type { DirectoryUser } from "@/lib/chat-data";
import { cn } from "@/lib/utils";
import {
  getUploadSizeLimitMessage,
  splitFilesByUploadSize,
} from "@/lib/upload-limits";

type AudienceMode = "manual" | "all" | Sector;
type AnnouncementAttachmentKind = "image" | "video" | "document";

export interface AnnouncementAttachment {
  id: string;
  name: string;
  size: number;
  extension: string;
  kind: AnnouncementAttachmentKind;
  url: string;
}

export interface AnnouncementEvent {
  id: string;
  title: string;
  description: string;
  scheduledAt: Date;
  responsibleName?: string;
  creatorId: string;
  creatorName: string;
  recipientIds: string[];
  attachments: AnnouncementAttachment[];
  colorIndex: number;
}

interface RecipientOption extends DirectoryUser {
  sector: Sector;
}

interface EventFormValues {
  title: string;
  description: string;
  responsibleName: string;
  date: string;
  time: string;
}

interface AnnouncementsEventsPageProps {
  events: AnnouncementEvent[];
  focusEventId?: string | null;
  currentUserId: string;
  currentUserName: string;
  onCreateEvent: (event: AnnouncementEvent) => void;
  onUpdateEvent: (event: AnnouncementEvent) => void;
  onDeleteEvent: (eventId: string) => void;
  onFocusEventHandled?: () => void;
  recipients: DirectoryUser[];
}

const WEEK_DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
const MAX_VISIBLE_EVENTS_PER_DAY = 2;
const MAX_EVENT_ATTACHMENTS = 3;
const TIME_HOURS = Array.from({ length: 24 }, (_, hour) =>
  String(hour).padStart(2, "0"),
);
const TIME_MINUTES = Array.from({ length: 60 }, (_, minute) =>
  String(minute).padStart(2, "0"),
);
const forceComboboxBelow = {
  side: "none",
  align: "shift",
  fallbackAxisSide: "none",
} as const;
const audienceModeOptions: ComboboxOption[] = [
  {
    value: "all",
    label: "Todos os usuários",
    description: "Enviar para todos os usuários ativos",
  },
  {
    value: "manual",
    label: "Seleção manual",
    description: "Escolher destinatários um a um",
  },
  ...workspaceSectorComboboxOptions,
];
const EVENT_COLORS = [
  "border-l-[#ea0016] bg-[#ea0016]/10 text-[#7a000b] dark:bg-[#ea0016]/20 dark:text-[#ffb3bc]",
  "border-l-sky-500 bg-sky-50 text-sky-950 dark:bg-sky-950/30 dark:text-sky-100",
  "border-l-amber-500 bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100",
  "border-l-rose-500 bg-rose-50 text-rose-950 dark:bg-rose-950/30 dark:text-rose-100",
];

function getDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatInputDate(date: Date) {
  return getDateKey(date);
}

function getStartOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isPastDate(date: Date, referenceDate = new Date()) {
  return getStartOfDay(date).getTime() < getStartOfDay(referenceDate).getTime();
}

function formatMonthTitle(date: Date) {
  return date.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
}

function formatLongDate(date: Date) {
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    weekday: "long",
    year: "numeric",
  });
}

function formatEventTime(date: Date) {
  return date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getTimeParts(value: string) {
  const [rawHour = "08", rawMinute = "00"] = value.split(":");
  const hour = Number(rawHour);
  const minute = Number(rawMinute);

  return {
    hour:
      Number.isInteger(hour) && hour >= 0 && hour <= 23
        ? String(hour).padStart(2, "0")
        : "08",
    minute:
      Number.isInteger(minute) && minute >= 0 && minute <= 59
        ? String(minute).padStart(2, "0")
        : "00",
  };
}

function createTimeValue(hour: string, minute: string) {
  return `${hour}:${minute}`;
}

function formatEventDateTime(date: Date) {
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileExtension(fileName: string) {
  return fileName.split(".").pop()?.toUpperCase() ?? "ARQ";
}

function getAttachmentKind(file: File): AnnouncementAttachmentKind {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";

  return "document";
}

function getCalendarDays(viewDate: Date) {
  const firstDay = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const startDate = new Date(firstDay);

  startDate.setDate(firstDay.getDate() - firstDay.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(startDate);

    date.setDate(startDate.getDate() + index);

    return date;
  });
}

function TimePickerPanel({
  value,
  onValueChange,
  onClose,
}: {
  value: string;
  onValueChange: (value: string) => void;
  onClose: () => void;
}) {
  const selectedTime = getTimeParts(value);

  const setHour = (hour: string) => {
    onValueChange(createTimeValue(hour, selectedTime.minute));
  };

  const setMinute = (minute: string) => {
    onValueChange(createTimeValue(selectedTime.hour, minute));
    onClose();
  };

  const setCurrentTime = () => {
    const now = new Date();
    onValueChange(
      createTimeValue(
        String(now.getHours()).padStart(2, "0"),
        String(now.getMinutes()).padStart(2, "0"),
      ),
    );
    onClose();
  };

  return (
    <div className="bg-popover p-2 [--cell-radius:var(--radius-md)]">
      <div className="mb-2 flex h-9 items-center justify-between rounded-(--cell-radius) px-2">
        <span className="text-sm font-medium">Horário</span>
        <span className="rounded-md bg-muted/70 px-2 py-1 text-sm font-semibold tabular-nums">
          {createTimeValue(selectedTime.hour, selectedTime.minute)}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="grid gap-1.5">
          <span className="px-1 text-xs font-medium text-muted-foreground">
            Hora
          </span>
          <div className="thin-gray-scrollbar grid max-h-56 grid-cols-2 gap-1 overflow-y-auto pr-1">
            {TIME_HOURS.map((hour) => {
              const isSelected = hour === selectedTime.hour;

              return (
                <button
                  key={hour}
                  type="button"
                  aria-pressed={isSelected}
                  className={cn(
                    "flex h-8 items-center justify-center rounded-(--cell-radius) text-sm font-medium tabular-nums text-foreground/85 outline-none transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                    isSelected &&
                      "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                  )}
                  onClick={() => setHour(hour)}
                >
                  {hour}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-1.5">
          <span className="px-1 text-xs font-medium text-muted-foreground">
            Min
          </span>
          <div className="thin-gray-scrollbar grid max-h-56 grid-cols-2 gap-1 overflow-y-auto pr-1">
            {TIME_MINUTES.map((minute) => {
              const isSelected = minute === selectedTime.minute;

              return (
                <button
                  key={minute}
                  type="button"
                  aria-pressed={isSelected}
                  className={cn(
                    "flex h-8 items-center justify-center rounded-(--cell-radius) text-sm font-medium tabular-nums text-foreground/85 outline-none transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                    isSelected &&
                      "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                  )}
                  onClick={() => setMinute(minute)}
                >
                  {minute}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 border-t pt-2">
        <Button type="button" variant="ghost" size="sm" onClick={setCurrentTime}>
          Agora
        </Button>
        <Button type="button" size="sm" onClick={onClose}>
          Concluir
        </Button>
      </div>
    </div>
  );
}

export function createInitialAnnouncementEvents(
  recipients: DirectoryUser[],
): AnnouncementEvent[] {
  void recipients;

  return [];
}

function AttachmentPreviewCard({
  attachment,
  onOpen,
  onRemove,
}: {
  attachment: AnnouncementAttachment;
  onOpen?: () => void;
  onRemove?: () => void;
}) {
  const shouldShowDetails = attachment.kind === "document";
  const previewContent =
    attachment.kind === "image" ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={attachment.url}
        alt={attachment.name}
        className="h-full w-full object-cover"
      />
    ) : attachment.kind === "video" ? (
      <video
        src={attachment.url}
        className="h-full w-full bg-black object-cover"
        muted
        preload="metadata"
      />
    ) : (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-3 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <FileText className="h-6 w-6" />
        </span>
        <span className="rounded bg-destructive px-2 py-0.5 text-[10px] font-bold text-destructive-foreground">
          {attachment.extension}
        </span>
      </div>
    );

  return (
    <div className="group relative min-w-0 overflow-hidden rounded-lg border bg-background">
      {onOpen ? (
        <button
          type="button"
          className="flex aspect-[4/3] w-full items-center justify-center bg-muted/45"
          onClick={onOpen}
          aria-label={`Abrir ${attachment.name}`}
        >
          {previewContent}
        </button>
      ) : (
        <div className="flex aspect-[4/3] items-center justify-center bg-muted/45">
          {previewContent}
        </div>
      )}
      {shouldShowDetails ? (
        <div className="min-w-0 p-2">
        {onOpen ? (
          <button
            type="button"
            className="block w-full text-left"
            onClick={onOpen}
          >
            <p className="truncate text-xs font-semibold">{attachment.name}</p>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {attachment.extension} • {formatFileSize(attachment.size)}
            </p>
          </button>
        ) : (
          <>
            <p className="truncate text-xs font-semibold">{attachment.name}</p>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {attachment.extension} • {formatFileSize(attachment.size)}
            </p>
          </>
        )}
        </div>
      ) : null}
      {onRemove && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="absolute right-1.5 top-1.5 bg-background/85 shadow-sm hover:bg-background"
          onClick={onRemove}
          aria-label="Remover anexo"
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

export function AnnouncementsEventsPage({
  events,
  focusEventId,
  currentUserId,
  currentUserName,
  onCreateEvent,
  onUpdateEvent,
  onDeleteEvent,
  onFocusEventHandled,
  recipients,
}: AnnouncementsEventsPageProps) {
  const today = useMemo(() => new Date(), []);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recipientOptions = useMemo<RecipientOption[]>(
    () =>
      recipients.map((recipient, index) => ({
        ...recipient,
        sector: SECTOR_OPTIONS[index % SECTOR_OPTIONS.length],
      })),
    [recipients],
  );
  const recipientIds = useMemo(
    () => recipientOptions.map((recipient) => recipient.id),
    [recipientOptions],
  );
  const [viewDate, setViewDate] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<AnnouncementEvent | null>(
    null,
  );
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [deleteCandidateEvent, setDeleteCandidateEvent] =
    useState<AnnouncementEvent | null>(null);
  const [fullScreenAttachment, setFullScreenAttachment] =
    useState<AnnouncementAttachment | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [formValues, setFormValues] = useState<EventFormValues>(() => ({
    title: "",
    description: "",
    responsibleName: "",
    date: formatInputDate(today),
    time: "08:00",
  }));
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [isTimePickerOpen, setIsTimePickerOpen] = useState(false);
  const [audienceMode, setAudienceMode] = useState<AudienceMode>("all");
  const [selectedRecipientIds, setSelectedRecipientIds] =
    useState<string[]>(recipientIds);
  const [recipientSearch, setRecipientSearch] = useState("");
  const [draftAttachments, setDraftAttachments] = useState<
    AnnouncementAttachment[]
  >([]);
  const [editingOriginalAttachmentIds, setEditingOriginalAttachmentIds] =
    useState<string[]>([]);

  const calendarDays = useMemo(() => getCalendarDays(viewDate), [viewDate]);
  const eventsByDate = useMemo(() => {
    return events.reduce<Record<string, AnnouncementEvent[]>>(
      (groups, event) => {
        const key = getDateKey(event.scheduledAt);

        groups[key] = [...(groups[key] ?? []), event].sort(
          (firstEvent, secondEvent) =>
            firstEvent.scheduledAt.getTime() -
            secondEvent.scheduledAt.getTime(),
        );

        return groups;
      },
      {},
    );
  }, [events]);
  const selectedDateEvents = selectedDate
    ? (eventsByDate[getDateKey(selectedDate)] ?? [])
    : [];
  const selectedDateIsPast = selectedDate
    ? isPastDate(selectedDate, today)
    : false;
  const todayInputValue = formatInputDate(today);
  const selectedFormDate = formValues.date
    ? new Date(`${formValues.date}T00:00:00`)
    : undefined;
  const filteredRecipients = useMemo(() => {
    const normalizedSearch = recipientSearch.trim().toLowerCase();

    if (!normalizedSearch) return recipientOptions;

    return recipientOptions.filter((recipient) =>
      [recipient.name, recipient.email, recipient.sector]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch),
    );
  }, [recipientOptions, recipientSearch]);
  const allRecipientsSelected =
    recipientOptions.length > 0 &&
    selectedRecipientIds.length === recipientOptions.length;
  const editingEvent = editingEventId
    ? events.find((event) => event.id === editingEventId)
    : null;
  const canManageSelectedEvent =
    Boolean(selectedEvent) && selectedEvent?.creatorId === currentUserId;

  useEffect(() => {
    if (!focusEventId) return;

    const eventToFocus = events.find((event) => event.id === focusEventId);

    if (!eventToFocus) return;

    const timeoutId = window.setTimeout(() => {
      setSelectedEvent(eventToFocus);
      onFocusEventHandled?.();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [events, focusEventId, onFocusEventHandled]);

  const getRecipientSummary = (event: AnnouncementEvent) => {
    if (event.recipientIds.length === recipientOptions.length) {
      return "Todos os usuários";
    }

    const eventRecipients = event.recipientIds
      .map((recipientId) =>
        recipientOptions.find((recipient) => recipient.id === recipientId),
      )
      .filter((recipient): recipient is RecipientOption => Boolean(recipient));

    if (eventRecipients.length === 0) return "Nenhum destinatário";

    return eventRecipients
      .slice(0, 3)
      .map((recipient) => recipient.name)
      .join(", ")
      .concat(
        eventRecipients.length > 3 ? ` +${eventRecipients.length - 3}` : "",
      );
  };

  const selectRecipientsByMode = (nextMode: AudienceMode) => {
    setAudienceMode(nextMode);

    if (nextMode === "manual") return;

    if (nextMode === "all") {
      setSelectedRecipientIds(recipientIds);
      return;
    }

    setSelectedRecipientIds(
      recipientOptions
        .filter((recipient) => recipient.sector === nextMode)
        .map((recipient) => recipient.id),
    );
  };

  const toggleRecipient = (recipientId: string) => {
    setAudienceMode("manual");
    setSelectedRecipientIds((currentRecipientIds) =>
      currentRecipientIds.includes(recipientId)
        ? currentRecipientIds.filter((currentId) => currentId !== recipientId)
        : [...currentRecipientIds, recipientId],
    );
  };

  const resetForm = () => {
    setFormValues({
      title: "",
      description: "",
      responsibleName: "",
      date: formatInputDate(today),
      time: "08:00",
    });
    setIsDatePickerOpen(false);
    setIsTimePickerOpen(false);
    setAudienceMode("all");
    setSelectedRecipientIds(recipientIds);
    setRecipientSearch("");
    setDraftAttachments([]);
    setEditingEventId(null);
    setEditingOriginalAttachmentIds([]);
  };

  const openCreateDialog = (date = today) => {
    if (isPastDate(date, today)) return;

    setEditingEventId(null);
    setEditingOriginalAttachmentIds([]);
    setDraftAttachments([]);
    setSelectedRecipientIds(recipientIds);
    setAudienceMode("all");
    setRecipientSearch("");
    setFormValues({
      title: "",
      description: "",
      responsibleName: "",
      date: formatInputDate(date),
      time: "08:00",
    });
    setIsDatePickerOpen(false);
    setIsTimePickerOpen(false);
    setIsCreateDialogOpen(true);
  };

  const openEditDialog = (event: AnnouncementEvent) => {
    if (event.creatorId !== currentUserId) return;

    setSelectedEvent(null);
    setEditingEventId(event.id);
    setEditingOriginalAttachmentIds(
      event.attachments.map((attachment) => attachment.id),
    );
    setFormValues({
      title: event.title,
      description: event.description,
      responsibleName: event.responsibleName ?? "",
      date: formatInputDate(event.scheduledAt),
      time: event.scheduledAt.toTimeString().slice(0, 5),
    });
    setAudienceMode(
      event.recipientIds.length === recipientIds.length ? "all" : "manual",
    );
    setSelectedRecipientIds(event.recipientIds);
    setRecipientSearch("");
    setDraftAttachments(event.attachments);
    setIsDatePickerOpen(false);
    setIsTimePickerOpen(false);
    setIsCreateDialogOpen(true);
  };

  const handleCreateDialogOpenChange = (open: boolean) => {
    setIsCreateDialogOpen(open);

    if (!open) {
      draftAttachments
        .filter(
          (attachment) => !editingOriginalAttachmentIds.includes(attachment.id),
        )
        .forEach((attachment) => URL.revokeObjectURL(attachment.url));
      resetForm();
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
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

    const availableSlots = MAX_EVENT_ATTACHMENTS - draftAttachments.length;

    if (availableSlots <= 0) {
      toast.warning("Limite de anexos atingido.", {
        description: "Cada evento pode ter no máximo 3 anexos.",
      });
      event.target.value = "";
      return;
    }

    const acceptedFiles = filesWithinLimit.slice(0, availableSlots);

    if (filesWithinLimit.length > availableSlots) {
      toast.warning("Alguns anexos não foram adicionados.", {
        description: "Cada evento pode ter no máximo 3 anexos.",
      });
    }

    setDraftAttachments((currentAttachments) => [
      ...currentAttachments,
      ...acceptedFiles.map((file, index) => ({
        id: `attachment-${Date.now()}-${index}-${file.name}`,
        name: file.name,
        size: file.size,
        extension: getFileExtension(file.name),
        kind: getAttachmentKind(file),
        url: URL.createObjectURL(file),
      })),
    ]);
    event.target.value = "";
  };

  const removeDraftAttachment = (attachmentId: string) => {
    setDraftAttachments((currentAttachments) => {
      const removedAttachment = currentAttachments.find(
        (attachment) => attachment.id === attachmentId,
      );

      if (
        removedAttachment &&
        !editingOriginalAttachmentIds.includes(removedAttachment.id)
      ) {
        URL.revokeObjectURL(removedAttachment.url);
      }

      return currentAttachments.filter(
        (attachment) => attachment.id !== attachmentId,
      );
    });
  };

  const handleCreateEvent = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const title = formValues.title.trim();
    const description = formValues.description.trim();
    const responsibleName = formValues.responsibleName.trim();

    if (!title) {
      toast.error("Informe um título para o evento.");
      return;
    }

    if (!formValues.date) {
      toast.error("Escolha a data do evento.");
      return;
    }

    if (!formValues.time) {
      toast.error("Escolha o horário do evento.");
      return;
    }

    const scheduledAt = new Date(`${formValues.date}T${formValues.time}:00`);

    if (isPastDate(scheduledAt, today)) {
      toast.error("Não é possível criar evento em data passada.");
      return;
    }

    if (selectedRecipientIds.length === 0) {
      toast.error("Selecione pelo menos um destinatário.");
      return;
    }

    if (editingEvent) {
      const updatedEvent: AnnouncementEvent = {
        ...editingEvent,
        title,
        description,
        responsibleName: responsibleName || undefined,
        scheduledAt,
        recipientIds: selectedRecipientIds,
        attachments: draftAttachments,
      };

      onUpdateEvent(updatedEvent);
      setSelectedEvent(updatedEvent);
      toast.success("Evento atualizado.");
    } else {
      onCreateEvent({
        id: `event-${Date.now()}`,
        title,
        description,
        responsibleName: responsibleName || undefined,
        scheduledAt,
        creatorId: currentUserId,
        creatorName: currentUserName,
        recipientIds: selectedRecipientIds,
        attachments: draftAttachments,
        colorIndex: events.length % EVENT_COLORS.length,
      });
      setSelectedDate(scheduledAt);
      toast.success("Evento criado.");
    }

    setViewDate(new Date(scheduledAt.getFullYear(), scheduledAt.getMonth(), 1));
    setDraftAttachments([]);
    setEditingOriginalAttachmentIds([]);
    setEditingEventId(null);
    setIsCreateDialogOpen(false);
    resetForm();
  };

  const confirmDeleteEvent = () => {
    if (!deleteCandidateEvent) return;
    if (deleteCandidateEvent.creatorId !== currentUserId) return;

    onDeleteEvent(deleteCandidateEvent.id);
    setSelectedEvent(null);
    setDeleteCandidateEvent(null);
    toast.success("Evento apagado.");
  };

  const moveMonth = (direction: -1 | 1) => {
    setViewDate(
      (currentDate) =>
        new Date(
          currentDate.getFullYear(),
          currentDate.getMonth() + direction,
          1,
        ),
    );
  };

  const showToday = () => {
    const nextToday = new Date();

    setViewDate(new Date(nextToday.getFullYear(), nextToday.getMonth(), 1));
    setSelectedDate(nextToday);
  };

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col overflow-hidden rounded-lg border bg-background">
      <div className="flex min-h-0 flex-1 overflow-hidden bg-background">
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center gap-2 border-b bg-background px-3 py-2 lg:px-4">
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2 sm:px-2.5"
              onClick={showToday}
            >
              Hoje
            </Button>
            <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => moveMonth(-1)}
                aria-label="Mês anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => moveMonth(1)}
                aria-label="Próximo mês"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <h2 className="min-w-0 flex-1 truncate text-base font-medium capitalize sm:text-xl">
              {formatMonthTitle(viewDate)}
            </h2>
            <div className="flex shrink-0 items-center gap-1 sm:gap-2">
              <Badge
                variant="outline"
                className="hidden h-7 rounded-md px-2 sm:inline-flex sm:px-3"
              >
                Mês
              </Badge>
              <Badge
                variant="secondary"
                className="h-7 rounded-md px-2 text-[11px] sm:px-3 sm:text-xs"
              >
                {events.length} eventos
              </Badge>
              <Button onClick={() => openCreateDialog()} className="shrink-0">
                <Plus className="mr-1 h-4 w-4" />
                Criar evento
              </Button>
            </div>
          </div>

          <div className="thin-gray-scrollbar min-h-0 flex-1 overflow-x-auto overflow-y-hidden bg-card">
            <div className="flex h-full min-w-[52rem] flex-col">
              <div className="grid shrink-0 grid-cols-7 border-b bg-background">
                {WEEK_DAYS.map((weekday) => (
                  <div
                    key={weekday}
                    className="border-r px-3 py-2 text-xs font-medium uppercase text-muted-foreground last:border-r-0"
                  >
                    {weekday}
                  </div>
                ))}
              </div>
              <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6">
                {calendarDays.map((date) => {
                  const key = getDateKey(date);
                  const dayEvents = eventsByDate[key] ?? [];
                  const visibleEvents = dayEvents.slice(
                    0,
                    MAX_VISIBLE_EVENTS_PER_DAY,
                  );
                  const hiddenEventCount =
                    dayEvents.length - visibleEvents.length;
                  const isCurrentMonth =
                    date.getMonth() === viewDate.getMonth();
                  const isToday = key === getDateKey(new Date());
                  const isPast = isPastDate(date, today);

                  return (
                    <div
                      key={key}
                      role="button"
                      tabIndex={0}
                      aria-disabled={isPast}
                      className={cn(
                        "min-h-0 overflow-hidden border-r border-b bg-background p-2 text-left outline-none transition-colors hover:bg-muted/35 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
                        !isCurrentMonth && "bg-muted/20 text-muted-foreground",
                        isPast &&
                          "bg-muted/30 text-muted-foreground/70 hover:bg-muted/30",
                      )}
                      onClick={() => setSelectedDate(date)}
                      onKeyDown={(keyboardEvent) => {
                        if (
                          keyboardEvent.key === "Enter" ||
                          keyboardEvent.key === " "
                        ) {
                          keyboardEvent.preventDefault();
                          setSelectedDate(date);
                        }
                      }}
                    >
                      <div className="mb-1 flex items-center justify-between">
                        <span
                          className={cn(
                            "flex h-7 w-7 items-center justify-center rounded-full text-sm tabular-nums",
                            isToday &&
                              "bg-primary font-semibold text-primary-foreground",
                          )}
                        >
                          {date.getDate()}
                        </span>
                        {dayEvents.length > 0 && (
                          <span className="text-xs font-medium text-muted-foreground">
                            {dayEvents.length}
                          </span>
                        )}
                      </div>
                      <div className="grid min-h-0 gap-1 overflow-hidden">
                        {visibleEvents.map((event) => (
                          <button
                            key={event.id}
                            type="button"
                            className={cn(
                              "min-w-0 rounded-md border-l-4 px-2 py-1 text-left text-xs font-medium transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                              EVENT_COLORS[
                                event.colorIndex % EVENT_COLORS.length
                              ],
                            )}
                            onClick={(clickEvent) => {
                              clickEvent.stopPropagation();
                              setSelectedEvent(event);
                            }}
                          >
                            <span className="block truncate">
                              {event.title}
                            </span>
                            <span className="mt-0.5 block truncate text-[11px] opacity-75">
                              {formatEventTime(event.scheduledAt)}
                            </span>
                          </button>
                        ))}
                        {hiddenEventCount > 0 && (
                          <span className="px-2 text-xs font-medium text-muted-foreground">
                            +{hiddenEventCount} mais
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </main>
      </div>

      <Dialog
        modal={false}
        open={isCreateDialogOpen}
        onOpenChange={handleCreateDialogOpenChange}
      >
        <DialogContent className="flex h-[min(42rem,calc(100dvh-2rem))] max-h-[calc(100dvh-2rem)] overflow-hidden p-0 sm:max-w-5xl">
          <div className="flex min-h-0 w-full flex-col">
            <DialogHeader className="shrink-0 px-4 pb-2 pt-4 pr-12">
              <DialogTitle>
                {editingEventId
                  ? "Editar anúncio/evento"
                  : "Novo anúncio/evento"}
              </DialogTitle>
            </DialogHeader>

            <form
              className="flex min-h-0 flex-1 flex-col"
              onSubmit={handleCreateEvent}
            >
              <div className="grid min-h-0 flex-1 gap-4 px-4 pb-3 lg:grid-cols-[minmax(0,1fr)_21rem]">
                <div className="grid min-h-0 content-start gap-3">
                  <div className="grid gap-2">
                    <Label htmlFor="announcement-title">Título</Label>
                    <Input
                      id="announcement-title"
                      value={formValues.title}
                      onChange={(event) =>
                        setFormValues((currentValues) => ({
                          ...currentValues,
                          title: event.target.value,
                        }))
                      }
                      placeholder="Ex: Reunião geral"
                      className="h-10 bg-muted"
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="announcement-description">Descrição</Label>
                    <Textarea
                      id="announcement-description"
                      value={formValues.description}
                      onChange={(event) =>
                        setFormValues((currentValues) => ({
                          ...currentValues,
                          description: event.target.value,
                        }))
                      }
                      placeholder="Digite os detalhes do evento"
                      wrap="soft"
                      className="thin-gray-scrollbar h-24 resize-none overflow-x-hidden whitespace-pre-wrap break-all bg-muted leading-6"
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="announcement-responsible">
                      Responsável pelo evento
                      <span className="ml-1 text-xs font-normal text-muted-foreground">
                        opcional
                      </span>
                    </Label>
                    <Input
                      id="announcement-responsible"
                      value={formValues.responsibleName}
                      onChange={(event) =>
                        setFormValues((currentValues) => ({
                          ...currentValues,
                          responsibleName: event.target.value,
                        }))
                      }
                      placeholder="Ex: Ana Costa"
                      className="h-10 bg-muted"
                    />
                  </div>

                  <div className="grid gap-2">
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
                      <div className="grid gap-2">
                        <Label htmlFor="announcement-date">
                          Data do evento
                        </Label>
                        <Popover
                          open={isDatePickerOpen}
                          onOpenChange={setIsDatePickerOpen}
                        >
                          <PopoverTrigger asChild>
                            <Button
                              id="announcement-date"
                              type="button"
                              variant="outline"
                              className="h-10 w-full justify-start bg-muted text-left font-normal"
                            >
                              <CalendarDays className="mr-2 h-4 w-4 text-muted-foreground" />
                              {selectedFormDate
                                ? selectedFormDate.toLocaleDateString("pt-BR")
                                : "Selecione a data"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent align="start" className="w-auto p-0">
                            <Calendar
                              mode="single"
                              selected={selectedFormDate}
                              disabled={(date) => isPastDate(date, today)}
                              locale={ptBR}
                              onSelect={(date) => {
                                if (!date) return;

                                setFormValues((currentValues) => ({
                                  ...currentValues,
                                  date: formatInputDate(date),
                                }));
                                setIsDatePickerOpen(false);
                              }}
                            />
                          </PopoverContent>
                        </Popover>
                        <input
                          type="date"
                          min={todayInputValue}
                          value={formValues.date}
                          onChange={(event) =>
                            setFormValues((currentValues) => ({
                              ...currentValues,
                              date: event.target.value,
                            }))
                          }
                          className="sr-only"
                          tabIndex={-1}
                          aria-hidden="true"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="announcement-time">Horário</Label>
                        <Popover
                          open={isTimePickerOpen}
                          onOpenChange={setIsTimePickerOpen}
                        >
                          <PopoverTrigger asChild>
                            <Button
                              id="announcement-time"
                              type="button"
                              variant="outline"
                              className="h-10 w-full justify-start bg-muted text-left font-normal"
                              aria-label={`Selecionar horário ${formValues.time}`}
                            >
                              <Clock className="mr-2 h-4 w-4 text-muted-foreground" />
                              <span className="font-medium tabular-nums">
                                {formValues.time}
                              </span>
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent
                            align="end"
                            sideOffset={6}
                            className="w-[18rem] p-0"
                          >
                            <TimePickerPanel
                              value={formValues.time}
                              onValueChange={(time) =>
                                setFormValues((currentValues) => ({
                                  ...currentValues,
                                  time,
                                }))
                              }
                              onClose={() => setIsTimePickerOpen(false)}
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="grid gap-1">
                        <Label>Anexos</Label>
                        <span className="text-xs text-muted-foreground">
                          {draftAttachments.length}/{MAX_EVENT_ATTACHMENTS}{" "}
                          arquivos
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={
                          draftAttachments.length >= MAX_EVENT_ATTACHMENTS
                        }
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
                      onChange={handleFileChange}
                    />
                    {draftAttachments.length === 0 ? (
                      <button
                        type="button"
                        className="flex h-24 items-center justify-center rounded-lg border border-dashed bg-muted/35 px-4 text-center text-sm text-muted-foreground transition-colors hover:bg-muted/55"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        Adicione até 3 fotos, vídeos ou documentos.
                      </button>
                    ) : (
                      <div className="grid gap-2 sm:grid-cols-3">
                        {draftAttachments.map((attachment) => (
                          <AttachmentPreviewCard
                            key={attachment.id}
                            attachment={attachment}
                            onRemove={() =>
                              removeDraftAttachment(attachment.id)
                            }
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid min-h-0 grid-rows-[auto_auto_auto_auto_minmax(0,1fr)] gap-2 rounded-lg border bg-background p-3">
                  <div>
                    <h2 className="flex items-center gap-2 text-sm font-semibold">
                      <Users className="h-4 w-4 text-primary" />
                      Destinatários
                    </h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {selectedRecipientIds.length} selecionado
                      {selectedRecipientIds.length === 1 ? "" : "s"}
                    </p>
                  </div>

                  <OptionCombobox
                    value={audienceMode}
                    onValueChange={(value) =>
                      selectRecipientsByMode(value as AudienceMode)
                    }
                    options={audienceModeOptions}
                    placeholder="Selecionar destinatários"
                    emptyText="Nenhum destinatário encontrado."
                    showClear={false}
                    contentCollisionAvoidance={forceComboboxBelow}
                  />

                  <label className="flex items-center gap-2 rounded-md border bg-muted/35 px-3 py-2 text-sm font-medium">
                    <Checkbox
                      checked={allRecipientsSelected}
                      onCheckedChange={(checked) => {
                        setAudienceMode(checked ? "all" : "manual");
                        setSelectedRecipientIds(checked ? recipientIds : []);
                      }}
                    />
                    Selecionar todos
                  </label>

                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={recipientSearch}
                      onChange={(event) =>
                        setRecipientSearch(event.target.value)
                      }
                      placeholder="Buscar destinatário"
                      className="h-10 bg-muted pl-10"
                    />
                  </div>

                  <div className="thin-gray-scrollbar min-h-0 overflow-y-auto rounded-lg border">
                    {filteredRecipients.map((recipient) => (
                      <label
                        key={recipient.id}
                        className="flex items-start gap-3 border-b px-3 py-2 last:border-b-0 hover:bg-muted/35"
                      >
                        <Checkbox
                          checked={selectedRecipientIds.includes(recipient.id)}
                          onCheckedChange={() => toggleRecipient(recipient.id)}
                          className="mt-1"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {recipient.name}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {recipient.email} • {recipient.sector}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 justify-end gap-2 border-t bg-muted/50 px-4 py-3">
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => handleCreateDialogOpenChange(false)}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit">
                    {editingEventId ? (
                      <Pencil className="mr-1 h-4 w-4" />
                    ) : (
                      <Send className="mr-1 h-4 w-4" />
                    )}
                    {editingEventId ? "Salvar alterações" : "Criar evento"}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(selectedDate)}
        onOpenChange={(open) => {
          if (!open) setSelectedDate(null);
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-x-hidden overflow-y-auto sm:max-w-xl">
          {selectedDate && (
            <>
              <DialogHeader>
                <DialogTitle className="break-words pr-8 capitalize [overflow-wrap:anywhere]">
                  {formatLongDate(selectedDate)}
                </DialogTitle>
              </DialogHeader>

              <div className="grid min-w-0 gap-2">
                {selectedDateEvents.length === 0 ? (
                  <div className="rounded-lg border bg-muted/35 px-4 py-8 text-center">
                    <CalendarDays className="mx-auto h-10 w-10 text-muted-foreground" />
                    <h2 className="mt-3 text-base font-semibold">
                      Nenhum evento nesse dia
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {selectedDateIsPast
                        ? "Datas passadas ficam bloqueadas para novos eventos."
                        : "Crie um anúncio e ele aparecerá como card dentro do calendário."}
                    </p>
                  </div>
                ) : (
                  selectedDateEvents.map((event) => (
                    <button
                      key={event.id}
                      type="button"
                      className={cn(
                        "min-w-0 overflow-hidden rounded-lg border-l-4 px-4 py-3 text-left transition-opacity hover:opacity-85",
                        EVENT_COLORS[event.colorIndex % EVENT_COLORS.length],
                      )}
                      onClick={() => {
                        setSelectedDate(null);
                        setSelectedEvent(event);
                      }}
                    >
                      <p className="break-words font-semibold [overflow-wrap:anywhere]">
                        {event.title}
                      </p>
                      <p className="mt-1 text-sm opacity-80">
                        {formatEventDateTime(event.scheduledAt)}
                      </p>
                      {event.description && (
                        <p className="mt-2 line-clamp-2 break-all text-sm leading-5 opacity-80">
                          {event.description}
                        </p>
                      )}
                    </button>
                  ))
                )}
              </div>

              <div className="-mx-4 -mb-4 flex justify-end gap-2 border-t bg-muted/50 p-4">
                <Button
                  variant="outline"
                  disabled={selectedDateIsPast}
                  onClick={() => {
                    const createDate = selectedDate;

                    setSelectedDate(null);
                    openCreateDialog(createDate);
                  }}
                >
                  <CalendarPlus className="mr-1 h-4 w-4" />
                  {selectedDateIsPast ? "Data bloqueada" : "Criar nesse dia"}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(selectedEvent)}
        onOpenChange={(open) => {
          if (!open) setSelectedEvent(null);
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-x-hidden overflow-y-auto sm:max-w-2xl">
          {selectedEvent && (
            <>
              <DialogHeader>
                <DialogTitle className="break-words pr-8 [overflow-wrap:anywhere]">
                  {selectedEvent.title}
                </DialogTitle>
              </DialogHeader>

              <div className="grid gap-4">
                <div className="grid gap-3 rounded-lg border bg-muted/35 p-3">
                  <div className="flex items-center gap-3">
                    <CalendarDays className="h-5 w-5 text-primary" />
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Data e horário do evento
                      </p>
                      <p className="font-medium">
                        {selectedEvent.scheduledAt.toLocaleString("pt-BR", {
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                          month: "long",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                  </div>
                  {selectedEvent.responsibleName && (
                    <div className="flex items-center gap-3">
                      <UserRound className="h-5 w-5 text-primary" />
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">
                          Responsável
                        </p>
                        <p className="truncate font-medium">
                          {selectedEvent.responsibleName}
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <Users className="h-5 w-5 text-primary" />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">
                        Destinatários
                      </p>
                      <p className="truncate font-medium">
                        {getRecipientSummary(selectedEvent)}
                      </p>
                    </div>
                  </div>
                </div>

                {selectedEvent.description && (
                  <div>
                    <h2 className="mb-2 text-sm font-semibold">Descrição</h2>
                    <p className="whitespace-pre-wrap break-all rounded-lg border bg-background p-3 text-sm leading-6">
                      {selectedEvent.description}
                    </p>
                  </div>
                )}

                <div>
                  <h2 className="mb-2 text-sm font-semibold">Anexos</h2>
                  {selectedEvent.attachments.length === 0 ? (
                    <div className="rounded-lg border bg-muted/35 p-3 text-sm text-muted-foreground">
                      Nenhum arquivo anexado.
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-3">
                      {selectedEvent.attachments.map((attachment) => (
                        <AttachmentPreviewCard
                          key={attachment.id}
                          attachment={attachment}
                          onOpen={() => setFullScreenAttachment(attachment)}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {canManageSelectedEvent && (
                  <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => openEditDialog(selectedEvent)}
                    >
                      <Pencil className="mr-1 h-4 w-4" />
                      Editar anúncio
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => setDeleteCandidateEvent(selectedEvent)}
                    >
                      <Trash2 className="mr-1 h-4 w-4" />
                      Apagar anúncio
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteCandidateEvent)}
        onOpenChange={(open) => {
          if (!open) setDeleteCandidateEvent(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          {deleteCandidateEvent && (
            <>
              <DialogHeader>
                <DialogTitle>Apagar anúncio/evento?</DialogTitle>
              </DialogHeader>

              <div className="grid gap-3">
                <p className="text-sm leading-6 text-muted-foreground">
                  Tem certeza que deseja apagar este anúncio/evento? Essa ação
                  remove o item do calendário para todos os destinatários.
                </p>
                <div className="rounded-lg border bg-muted/35 p-3">
                  <p className="break-words font-semibold">
                    {deleteCandidateEvent.title}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {formatEventDateTime(deleteCandidateEvent.scheduledAt)}
                  </p>
                </div>
              </div>

              <div className="-mx-4 -mb-4 flex justify-end gap-2 border-t bg-muted/50 p-4">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setDeleteCandidateEvent(null)}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={confirmDeleteEvent}
                >
                  <Trash2 className="mr-1 h-4 w-4" />
                  Apagar
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(fullScreenAttachment)}
        onOpenChange={(open) => {
          if (!open) setFullScreenAttachment(null);
        }}
      >
        <DialogContent className="h-[100dvh] max-h-[100dvh] w-screen max-w-none overflow-hidden border-0 bg-black p-0 text-white sm:max-w-none">
          {fullScreenAttachment && (
            <div className="flex h-full min-h-0 flex-col">
              <DialogHeader className="shrink-0 border-b border-white/10 px-4 py-3">
                <DialogTitle className="break-all pr-8 text-white">
                  {fullScreenAttachment.kind === "image"
                    ? "Imagem"
                    : fullScreenAttachment.kind === "video"
                      ? "Vídeo"
                      : fullScreenAttachment.name}
                </DialogTitle>
              </DialogHeader>
              <div className="flex min-h-0 flex-1 items-center justify-center bg-black p-4">
                {fullScreenAttachment.kind === "image" && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={fullScreenAttachment.url}
                    alt={fullScreenAttachment.name}
                    className="max-h-full max-w-full object-contain"
                  />
                )}
                {fullScreenAttachment.kind === "video" && (
                  <video
                    controls
                    autoPlay
                    src={fullScreenAttachment.url}
                    className="max-h-full max-w-full"
                  />
                )}
                {fullScreenAttachment.kind === "document" && (
                  <div className="flex w-full max-w-md flex-col items-center justify-center rounded-lg border border-white/15 bg-white/5 p-8 text-center">
                    <FileText className="h-16 w-16 text-white/80" />
                    <p className="mt-5 break-all text-lg font-semibold">
                      {fullScreenAttachment.name}
                    </p>
                    <p className="mt-2 text-sm text-white/65">
                      {fullScreenAttachment.extension} •{" "}
                      {formatFileSize(fullScreenAttachment.size)}
                    </p>
                    <Button
                      className="mt-6"
                      onClick={() =>
                        window.open(
                          fullScreenAttachment.url,
                          "_blank",
                          "noopener,noreferrer",
                        )
                      }
                    >
                      Abrir documento
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
