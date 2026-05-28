"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/unipar-ui/dropdown-menu";
import { Input } from "@/components/unipar-ui/input";
import { Label } from "@/components/unipar-ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/unipar-ui/popover";
import { Progress } from "@/components/unipar-ui/progress";
import { Textarea } from "@/components/unipar-ui/textarea";
import {
  OptionCombobox,
  type ComboboxOption,
} from "@/components/option-combobox";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  getUploadSizeLimitMessage,
  splitFilesByUploadSize,
} from "@/lib/upload-limits";
import { uploadFileAttachment } from "@/lib/upload-client";
import {
  CalendarDays,
  Check,
  CheckSquare,
  Clock,
  Copy,
  FileText,
  Image as ImageIcon,
  MoreHorizontal,
  Paperclip,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

type LabelColor =
  | "green"
  | "sky"
  | "amber"
  | "rose"
  | "violet"
  | "red"
  | "orange"
  | "yellow"
  | "lime"
  | "teal"
  | "cyan"
  | "blue"
  | "indigo"
  | "purple"
  | "pink"
  | "slate";
type AttachmentKind = "image" | "video" | "document";

export interface KanbanLabel {
  id: string;
  name: string;
  color: LabelColor;
}

interface KanbanAttachment {
  id: string;
  name: string;
  size: number;
  extension: string;
  kind: AttachmentKind;
  url: string;
}

interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface KanbanCard {
  id: string;
  title: string;
  description: string;
  columnId: string;
  labels: string[];
  checklist: ChecklistItem[];
  attachments: KanbanAttachment[];
  dueDate: string;
  dueReminderEnabled?: boolean;
  coverColor?: LabelColor;
  archived?: boolean;
}

export interface KanbanColumn {
  id: string;
  title: string;
  cardIds: string[];
}

interface KanbanPageProps {
  columns: KanbanColumn[];
  cardsById: Record<string, KanbanCard>;
  labels: KanbanLabel[];
  focusCardId: string | null;
  onColumnsChange: Dispatch<SetStateAction<KanbanColumn[]>>;
  onCardsChange: Dispatch<SetStateAction<Record<string, KanbanCard>>>;
  onLabelsChange: Dispatch<SetStateAction<KanbanLabel[]>>;
  onFocusCardHandled: () => void;
}

const labelClassNames: Record<LabelColor, string> = {
  green: "bg-[#ea0016]",
  sky: "bg-sky-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  violet: "bg-violet-500",
  red: "bg-red-500",
  orange: "bg-orange-500",
  yellow: "bg-yellow-400",
  lime: "bg-rose-700",
  teal: "bg-red-700",
  cyan: "bg-cyan-500",
  blue: "bg-blue-500",
  indigo: "bg-indigo-500",
  purple: "bg-purple-500",
  pink: "bg-pink-500",
  slate: "bg-slate-500",
};

const labelColorOptions = Object.keys(labelClassNames) as LabelColor[];

const labelColorNames: Record<LabelColor, string> = {
  green: "Vermelho Unipar",
  sky: "Azul claro",
  amber: "Âmbar",
  rose: "Rosa forte",
  violet: "Violeta",
  red: "Vermelho",
  orange: "Laranja",
  yellow: "Amarelo",
  lime: "Vermelho escuro",
  teal: "Vermelho fechado",
  cyan: "Ciano",
  blue: "Azul",
  indigo: "Índigo",
  purple: "Roxo",
  pink: "Pink",
  slate: "Cinza",
};

const labelBadgeClassNames: Record<LabelColor, string> = {
  green:
    "border-[#ea0016]/30 bg-[#ea0016]/15 text-[#9f0010] dark:text-[#ffb3bc]",
  sky: "border-sky-500/30 bg-sky-500/15 text-sky-700 dark:text-sky-200",
  amber:
    "border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-200",
  rose: "border-rose-500/30 bg-rose-500/15 text-rose-700 dark:text-rose-200",
  violet:
    "border-violet-500/30 bg-violet-500/15 text-violet-700 dark:text-violet-200",
  red: "border-red-500/30 bg-red-500/15 text-red-700 dark:text-red-200",
  orange:
    "border-orange-500/30 bg-orange-500/15 text-orange-700 dark:text-orange-200",
  yellow:
    "border-yellow-500/30 bg-yellow-500/15 text-yellow-800 dark:text-yellow-200",
  lime: "border-rose-700/30 bg-rose-700/15 text-rose-800 dark:text-rose-200",
  teal: "border-red-700/30 bg-red-700/15 text-red-800 dark:text-red-200",
  cyan: "border-cyan-500/30 bg-cyan-500/15 text-cyan-700 dark:text-cyan-200",
  blue: "border-blue-500/30 bg-blue-500/15 text-blue-700 dark:text-blue-200",
  indigo:
    "border-indigo-500/30 bg-indigo-500/15 text-indigo-700 dark:text-indigo-200",
  purple:
    "border-purple-500/30 bg-purple-500/15 text-purple-700 dark:text-purple-200",
  pink: "border-pink-500/30 bg-pink-500/15 text-pink-700 dark:text-pink-200",
  slate:
    "border-slate-500/30 bg-slate-500/15 text-slate-700 dark:text-slate-200",
};

function ColorSwatchButton({
  color,
  selected,
  onClick,
  ariaLabel,
}: {
  color: LabelColor;
  selected: boolean;
  onClick: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      title={labelColorNames[color]}
      className={cn(
        "relative aspect-square w-full rounded-md border border-white/15 shadow-sm transition hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        labelClassNames[color],
        selected && "ring-2 ring-primary ring-offset-2 ring-offset-background",
      )}
      onClick={onClick}
      aria-label={ariaLabel}
    >
      {selected && (
        <span className="absolute inset-0 flex items-center justify-center rounded-md bg-black/10">
          <Check className="h-3.5 w-3.5 text-white drop-shadow" />
        </span>
      )}
    </button>
  );
}

export const initialKanbanLabels: KanbanLabel[] = [];

export const initialKanbanColumns: KanbanColumn[] = [];

export function createInitialKanbanCards(): Record<string, KanbanCard> {
  return {};
}

function formatInputDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(date.getDate()).padStart(2, "0")}`;
}

function getStartOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isPastDate(date: Date, referenceDate: Date) {
  return getStartOfDay(date).getTime() < getStartOfDay(referenceDate).getTime();
}

function formatShortDueDate(dateKey: string) {
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
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

function revokeTemporaryAttachmentUrl(url: string) {
  if (url.startsWith("blob:")) URL.revokeObjectURL(url);
}

function toKanbanAttachmentKind(
  kind: Awaited<ReturnType<typeof uploadFileAttachment>>["kind"],
): AttachmentKind {
  if (kind === "image" || kind === "video") return kind;

  return "document";
}

function getClientErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Não foi possível concluir a operação.";
}

function getChecklistProgress(card: KanbanCard) {
  if (card.checklist.length === 0) return 0;

  const doneCount = card.checklist.filter((item) => item.done).length;

  return Math.round((doneCount / card.checklist.length) * 100);
}

function getCardSearchText(card: KanbanCard) {
  return [
    card.title,
    card.description,
    ...card.labels,
    ...card.checklist.map((item) => item.text),
  ]
    .join(" ")
    .toLowerCase();
}

export function KanbanPage({
  columns,
  cardsById,
  labels,
  focusCardId,
  onColumnsChange: setColumns,
  onCardsChange: setCardsById,
  onLabelsChange: setLabels,
  onFocusCardHandled,
}: KanbanPageProps) {
  const today = useMemo(() => new Date(), []);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null);
  const [newColumnTitle, setNewColumnTitle] = useState("");
  const [activeAddCardColumnId, setActiveAddCardColumnId] = useState<
    string | null
  >(null);
  const [newCardTitle, setNewCardTitle] = useState("");
  const [search, setSearch] = useState("");
  const [labelFilter, setLabelFilter] = useState("all");
  const [newChecklistText, setNewChecklistText] = useState("");
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState<LabelColor>("green");
  const [isDueDatePickerOpen, setIsDueDatePickerOpen] = useState(false);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const idCounterRef = useRef(0);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const selectedCard = selectedCardId ? cardsById[selectedCardId] : null;
  const selectedCardDueDate = useMemo(
    () =>
      selectedCard?.dueDate
        ? new Date(`${selectedCard.dueDate}T00:00:00`)
        : undefined,
    [selectedCard],
  );
  const labelFilterOptions = useMemo<ComboboxOption[]>(
    () => [
      {
        value: "all",
        label: "Todas etiquetas",
        description: "Mostrar todos os cartoes",
      },
      ...labels.map((label) => ({
        value: label.id,
        label: label.name,
        description: labelColorNames[label.color],
        swatchClassName: labelClassNames[label.color],
      })),
    ],
    [labels],
  );
  const visibleCardsByColumn = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return columns.reduce<Record<string, KanbanCard[]>>((map, column) => {
      map[column.id] = column.cardIds
        .map((cardId) => cardsById[cardId])
        .filter((card): card is KanbanCard => Boolean(card) && !card.archived)
        .filter((card) =>
          normalizedSearch
            ? getCardSearchText(card).includes(normalizedSearch)
            : true,
        )
        .filter((card) =>
          labelFilter === "all" ? true : card.labels.includes(labelFilter),
        );

      return map;
    }, {});
  }, [cardsById, columns, labelFilter, search]);
  const visibleCardCount = useMemo(
    () =>
      Object.values(visibleCardsByColumn).reduce(
        (total, cards) => total + cards.length,
        0,
      ),
    [visibleCardsByColumn],
  );
  useEffect(() => {
    if (!focusCardId || !cardsById[focusCardId]) return;

    const timeoutId = window.setTimeout(() => {
      setSelectedCardId(focusCardId);
      onFocusCardHandled();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [cardsById, focusCardId, onFocusCardHandled]);

  const updateCard = (cardId: string, updates: Partial<KanbanCard>) => {
    setCardsById((currentCards) => ({
      ...currentCards,
      [cardId]: {
        ...currentCards[cardId],
        ...updates,
      },
    }));
  };

  const createId = (prefix: string) => {
    idCounterRef.current += 1;

    if (window.crypto.randomUUID) {
      return `${prefix}-${window.crypto.randomUUID()}`;
    }

    return `${prefix}-${idCounterRef.current}`;
  };

  const createCard = (columnId: string, title: string) => {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      toast.error("Informe o título do cartão.");
      return;
    }

    const cardId = createId("card");

    setCardsById((currentCards) => ({
      ...currentCards,
      [cardId]: {
        id: cardId,
        title: cleanTitle,
        description: "",
        columnId,
        labels: [],
        checklist: [],
        attachments: [],
        dueDate: "",
        dueReminderEnabled: true,
      },
    }));
    setColumns((currentColumns) =>
      currentColumns.map((column) =>
        column.id === columnId
          ? { ...column, cardIds: [...column.cardIds, cardId] }
          : column,
      ),
    );
    setNewCardTitle("");
    setActiveAddCardColumnId(null);
    toast.success("Cartão criado.");
  };

  const createColumn = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanTitle = newColumnTitle.trim();
    if (!cleanTitle) {
      toast.error("Informe o nome da lista.");
      return;
    }

    setColumns((currentColumns) => [
      ...currentColumns,
      { id: createId("column"), title: cleanTitle, cardIds: [] },
    ]);
    setNewColumnTitle("");
    toast.success("Lista criada.");
  };

  const deleteColumn = (columnId: string) => {
    const column = columns.find(
      (currentColumn) => currentColumn.id === columnId,
    );
    if (!column) return;

    setCardsById((currentCards) => {
      const nextCards = { ...currentCards };
      column.cardIds.forEach((cardId) => delete nextCards[cardId]);
      return nextCards;
    });
    setColumns((currentColumns) =>
      currentColumns.filter((currentColumn) => currentColumn.id !== columnId),
    );
    toast.success("Lista apagada.");
  };

  const moveCard = (
    cardId: string,
    targetColumnId: string,
    targetIndex?: number,
  ) => {
    const card = cardsById[cardId];
    if (!card) return;

    setColumns((currentColumns) =>
      currentColumns.map((column) => {
        const withoutCardIds = column.cardIds.filter((id) => id !== cardId);

        if (column.id !== targetColumnId) {
          return { ...column, cardIds: withoutCardIds };
        }

        const nextCardIds = [...withoutCardIds];
        const insertIndex =
          targetIndex === undefined
            ? nextCardIds.length
            : Math.min(Math.max(targetIndex, 0), nextCardIds.length);

        nextCardIds.splice(insertIndex, 0, cardId);

        return { ...column, cardIds: nextCardIds };
      }),
    );
    updateCard(cardId, { columnId: targetColumnId });
  };

  const handleColumnDrop = (columnId: string) => {
    if (!draggedCardId) return;

    moveCard(draggedCardId, columnId);
    setDraggedCardId(null);
  };

  const handleCardDrop = (columnId: string, beforeCardId: string) => {
    if (!draggedCardId || draggedCardId === beforeCardId) return;

    const column = columns.find(
      (currentColumn) => currentColumn.id === columnId,
    );
    const targetIndex = column?.cardIds
      .filter((id) => id !== draggedCardId)
      .indexOf(beforeCardId);

    moveCard(
      draggedCardId,
      columnId,
      targetIndex === undefined ? 0 : targetIndex,
    );
    setDraggedCardId(null);
  };

  const duplicateCard = (card: KanbanCard) => {
    const nextCardId = createId("card");

    setCardsById((currentCards) => ({
      ...currentCards,
      [nextCardId]: {
        ...card,
        id: nextCardId,
        title: `${card.title} cópia`,
        checklist: card.checklist.map((item) => ({
          ...item,
          id: createId("check"),
        })),
      },
    }));
    setColumns((currentColumns) =>
      currentColumns.map((column) =>
        column.id === card.columnId
          ? { ...column, cardIds: [...column.cardIds, nextCardId] }
          : column,
      ),
    );
    toast.success("Cartão duplicado.");
  };

  const deleteCard = (cardId: string) => {
    setColumns((currentColumns) =>
      currentColumns.map((column) => ({
        ...column,
        cardIds: column.cardIds.filter((id) => id !== cardId),
      })),
    );
    setCardsById((currentCards) => {
      const nextCards = { ...currentCards };
      delete nextCards[cardId];
      return nextCards;
    });
    if (selectedCardId === cardId) setSelectedCardId(null);
    toast.success("Cartão apagado.");
  };

  const toggleCardLabel = (labelId: string) => {
    if (!selectedCard) return;

    updateCard(selectedCard.id, {
      labels: selectedCard.labels.includes(labelId)
        ? selectedCard.labels.filter((id) => id !== labelId)
        : [...selectedCard.labels, labelId],
    });
  };

  const addChecklistItem = () => {
    if (!selectedCard) return;

    if (!newChecklistText.trim()) {
      toast.error("Informe o item do checklist.");
      return;
    }

    updateCard(selectedCard.id, {
      checklist: [
        ...selectedCard.checklist,
        {
          id: createId("check"),
          text: newChecklistText.trim(),
          done: false,
        },
      ],
    });
    setNewChecklistText("");
    toast.success("Item adicionado.");
  };

  const createLabel = () => {
    const cleanName = newLabelName.trim();
    if (!cleanName) {
      toast.error("Informe o nome da etiqueta.");
      return;
    }

    setLabels((currentLabels) => [
      ...currentLabels,
      {
        id: createId("label"),
        name: cleanName,
        color: newLabelColor,
      },
    ]);
    setNewLabelName("");
    setNewLabelColor("green");
    toast.success("Etiqueta criada.");
  };

  const updateLabel = (labelId: string, updates: Partial<KanbanLabel>) => {
    setLabels((currentLabels) =>
      currentLabels.map((label) =>
        label.id === labelId ? { ...label, ...updates } : label,
      ),
    );
  };

  const deleteLabel = (labelId: string) => {
    setLabels((currentLabels) =>
      currentLabels.filter((label) => label.id !== labelId),
    );
    setCardsById((currentCards) =>
      Object.fromEntries(
        Object.entries(currentCards).map(([cardId, card]) => [
          cardId,
          {
            ...card,
            labels: card.labels.filter(
              (currentLabelId) => currentLabelId !== labelId,
            ),
          },
        ]),
      ),
    );

    if (labelFilter === labelId) {
      setLabelFilter("all");
    }
    toast.success("Etiqueta apagada.");
  };

  const toggleChecklistItem = (itemId: string) => {
    if (!selectedCard) return;

    updateCard(selectedCard.id, {
      checklist: selectedCard.checklist.map((item) =>
        item.id === itemId ? { ...item, done: !item.done } : item,
      ),
    });
  };

  const updateChecklistItemText = (itemId: string, text: string) => {
    if (!selectedCard) return;

    updateCard(selectedCard.id, {
      checklist: selectedCard.checklist.map((item) =>
        item.id === itemId ? { ...item, text } : item,
      ),
    });
  };

  const removeChecklistItem = (itemId: string) => {
    if (!selectedCard) return;

    updateCard(selectedCard.id, {
      checklist: selectedCard.checklist.filter((item) => item.id !== itemId),
    });
    toast.success("Item removido.");
  };

  const handleAttachmentChange = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    if (!selectedCard) return;

    const input = event.currentTarget;
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;

    const { acceptedFiles, rejectedFiles } = splitFilesByUploadSize(files);

    if (rejectedFiles.length > 0) {
      toast.error("Arquivo acima de 16 MB.", {
        description: getUploadSizeLimitMessage(rejectedFiles.length),
      });
    }

    if (acceptedFiles.length === 0) {
      input.value = "";
      return;
    }

    setIsUploadingAttachment(true);

    try {
      const uploadResults = await Promise.allSettled(
        acceptedFiles.map((file) => uploadFileAttachment(file)),
      );
      const attachments = uploadResults.flatMap((result) =>
        result.status === "fulfilled"
          ? [
              {
                id: result.value.id,
                name: result.value.name,
                size: result.value.size,
                extension:
                  result.value.extension || getFileExtension(result.value.name),
                kind: toKanbanAttachmentKind(result.value.kind),
                url: result.value.url,
              } satisfies KanbanAttachment,
            ]
          : [],
      );
      const rejectedUploads = uploadResults.filter(
        (result) => result.status === "rejected",
      );

      if (rejectedUploads.length > 0) {
        toast.error(
          rejectedUploads.length === 1
            ? "Não foi possível enviar 1 anexo."
            : `Não foi possível enviar ${rejectedUploads.length} anexos.`,
          {
            description: getClientErrorMessage(
              rejectedUploads[0].status === "rejected"
                ? rejectedUploads[0].reason
                : undefined,
            ),
          },
        );
      }

      if (attachments.length > 0) {
        updateCard(selectedCard.id, {
          attachments: [...selectedCard.attachments, ...attachments],
        });
        toast.success(
          attachments.length === 1
            ? "Anexo adicionado."
            : "Anexos adicionados.",
        );
      }
    } finally {
      setIsUploadingAttachment(false);
      input.value = "";
    }
  };

  const removeAttachment = (attachmentId: string) => {
    if (!selectedCard) return;

    const removedAttachment = selectedCard.attachments.find(
      (attachment) => attachment.id === attachmentId,
    );

    if (removedAttachment) {
      revokeTemporaryAttachmentUrl(removedAttachment.url);
    }

    updateCard(selectedCard.id, {
      attachments: selectedCard.attachments.filter(
        (attachment) => attachment.id !== attachmentId,
      ),
    });
    toast.success("Anexo removido.");
  };

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col overflow-hidden rounded-lg border bg-background">
      <div className="flex shrink-0 flex-col gap-2 border-b bg-background px-3 py-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Quadro Kanban</h2>
          <p className="text-xs text-muted-foreground">
            {visibleCardCount} cartão{visibleCardCount === 1 ? "" : "s"}
          </p>
        </div>

        <form
          className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap lg:justify-end"
          onSubmit={(event) => event.preventDefault()}
        >
          <div className="relative w-full min-w-0 sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar cartões"
              className="h-9 bg-muted pl-10"
            />
          </div>
          <OptionCombobox
            value={labelFilter}
            onValueChange={(value) => setLabelFilter(value || "all")}
            options={labelFilterOptions}
            placeholder="Todas etiquetas"
            emptyText="Nenhuma etiqueta encontrada."
            className="h-9 w-full min-w-[11.5rem] bg-muted sm:w-52 sm:shrink-0"
            showClear={false}
          />
        </form>
      </div>

      <div className="thin-gray-scrollbar min-h-0 flex-1 overflow-x-auto overflow-y-hidden bg-muted/30 p-3">
        <div className="flex h-full min-w-max items-start gap-3">
          {columns.map((column) => {
            const columnCards = visibleCardsByColumn[column.id] ?? [];

            return (
              <section
                key={column.id}
                className="flex max-h-full w-[18rem] shrink-0 flex-col rounded-lg border bg-card shadow-sm sm:w-[20rem]"
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => handleColumnDrop(column.id)}
              >
                <div className="flex items-center gap-2 border-b px-3 py-2">
                  <Input
                    value={column.title}
                    onChange={(event) =>
                      setColumns((currentColumns) =>
                        currentColumns.map((currentColumn) =>
                          currentColumn.id === column.id
                            ? { ...currentColumn, title: event.target.value }
                            : currentColumn,
                        ),
                      )
                    }
                    className="h-8 border-0 bg-transparent px-0 text-sm font-semibold shadow-none focus-visible:ring-0"
                  />
                  <Badge variant="secondary" className="rounded-md">
                    {columnCards.length}
                  </Badge>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Opções da lista"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem
                        onClick={() => setActiveAddCardColumnId(column.id)}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Adicionar cartão
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => deleteColumn(column.id)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Apagar lista
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="thin-gray-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
                  {columnCards.map((card) => {
                    const cardLabels = card.labels
                      .map((labelId) =>
                        labels.find((label) => label.id === labelId),
                      )
                      .filter((label): label is KanbanLabel => Boolean(label));
                    const checklistProgress = getChecklistProgress(card);

                    return (
                      <article
                        key={card.id}
                        draggable
                        onDragStart={() => setDraggedCardId(card.id)}
                        onDragEnd={() => setDraggedCardId(null)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                          event.stopPropagation();
                          handleCardDrop(column.id, card.id);
                        }}
                        className="group rounded-lg border bg-background shadow-sm transition-colors hover:bg-muted/35"
                      >
                        {card.coverColor && (
                          <div
                            className={cn(
                              "h-2 rounded-t-lg",
                              labelClassNames[card.coverColor],
                            )}
                          />
                        )}
                        <button
                          type="button"
                          className="w-full p-3 text-left"
                          onClick={() => setSelectedCardId(card.id)}
                        >
                          {cardLabels.length > 0 && (
                            <div className="mb-2 flex flex-wrap gap-1">
                              {cardLabels.map((label) => (
                                <span
                                  key={label.id}
                                  className={cn(
                                    "h-2 w-10 rounded-full",
                                    labelClassNames[label.color],
                                  )}
                                />
                              ))}
                            </div>
                          )}
                          <h3 className="break-words text-sm font-semibold leading-5">
                            {card.title}
                          </h3>
                          {checklistProgress > 0 && (
                            <div className="mt-3">
                              <Progress value={checklistProgress} />
                            </div>
                          )}
                          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            {card.dueDate && (
                              <span className="flex items-center gap-1">
                                <Clock className="h-3.5 w-3.5" />
                                {formatShortDueDate(card.dueDate)}
                              </span>
                            )}
                            {card.attachments.length > 0 && (
                              <span className="flex items-center gap-1">
                                <Paperclip className="h-3.5 w-3.5" />
                                {card.attachments.length}
                              </span>
                            )}
                          </div>
                        </button>
                        <div className="flex justify-end border-t px-2 py-1 opacity-0 transition-opacity group-hover:opacity-100">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => duplicateCard(card)}
                            aria-label="Duplicar cartão"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => deleteCard(card.id)}
                            aria-label="Apagar cartão"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </article>
                    );
                  })}
                </div>

                <div className="border-t p-2">
                  {activeAddCardColumnId === column.id ? (
                    <form
                      className="grid gap-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        createCard(column.id, newCardTitle);
                      }}
                    >
                      <Textarea
                        value={newCardTitle}
                        onChange={(event) =>
                          setNewCardTitle(event.target.value)
                        }
                        placeholder="Título do cartão"
                        className="min-h-20 resize-none bg-muted"
                      />
                      <div className="flex gap-2">
                        <Button type="submit">
                          <Plus className="mr-1 h-4 w-4" />
                          Adicionar
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => {
                            setActiveAddCardColumnId(null);
                            setNewCardTitle("");
                          }}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full justify-start text-muted-foreground"
                      onClick={() => setActiveAddCardColumnId(column.id)}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Adicionar cartão
                    </Button>
                  )}
                </div>
              </section>
            );
          })}

          <form
            className="w-[18rem] shrink-0 rounded-lg border bg-card p-2 sm:w-[20rem]"
            onSubmit={createColumn}
          >
            <div className="flex gap-2">
              <Input
                value={newColumnTitle}
                onChange={(event) => setNewColumnTitle(event.target.value)}
                placeholder="Nova lista"
                className="h-9 bg-muted"
              />
              <Button type="submit" size="icon" aria-label="Adicionar lista">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </form>
        </div>
      </div>

      <Dialog
        open={Boolean(selectedCard)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedCardId(null);
            setNewChecklistText("");
            setIsDueDatePickerOpen(false);
          }
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-4xl">
          {selectedCard && (
            <>
              <DialogHeader>
                <DialogTitle className="pr-8">
                  <Input
                    value={selectedCard.title}
                    onChange={(event) =>
                      updateCard(selectedCard.id, { title: event.target.value })
                    }
                    className="h-10 border-0 bg-transparent px-0 text-lg font-semibold shadow-none focus-visible:ring-0"
                  />
                </DialogTitle>
              </DialogHeader>

              <div className="grid gap-5 lg:grid-cols-[1fr_17rem]">
                <div className="grid gap-5">
                  <div className="grid gap-2">
                    <Label>Descrição</Label>
                    <Textarea
                      value={selectedCard.description}
                      onChange={(event) =>
                        updateCard(selectedCard.id, {
                          description: event.target.value,
                        })
                      }
                      placeholder="Adicione uma descrição"
                      className="thin-gray-scrollbar min-h-32 resize-none bg-muted"
                    />
                  </div>

                  <div className="grid gap-2">
                    <div className="flex items-center justify-between gap-3">
                      <Label className="flex items-center gap-2">
                        <CheckSquare className="h-4 w-4" />
                        Checklist
                      </Label>
                      <span className="text-sm text-muted-foreground">
                        {getChecklistProgress(selectedCard)}%
                      </span>
                    </div>
                    <Progress value={getChecklistProgress(selectedCard)} />
                    <div
                      className={cn(
                        "grid gap-2",
                        selectedCard.checklist.length > 5 &&
                          "thin-gray-scrollbar max-h-56 overflow-y-auto pr-1",
                      )}
                    >
                      {selectedCard.checklist.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center gap-2 rounded-md border bg-background p-2"
                        >
                          <Checkbox
                            checked={item.done}
                            onCheckedChange={() => toggleChecklistItem(item.id)}
                          />
                          <Input
                            value={item.text}
                            onChange={(event) =>
                              updateChecklistItemText(
                                item.id,
                                event.target.value,
                              )
                            }
                            aria-label="Editar item do checklist"
                            className={cn(
                              "h-8 min-w-0 flex-1 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0",
                              item.done && "text-muted-foreground line-through",
                            )}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => removeChecklistItem(item.id)}
                            aria-label="Remover item"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                    <form
                      className="flex gap-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        addChecklistItem();
                      }}
                    >
                      <Input
                        value={newChecklistText}
                        onChange={(event) =>
                          setNewChecklistText(event.target.value)
                        }
                        placeholder="Novo item"
                        className="h-9 bg-muted"
                      />
                      <Button type="submit">Adicionar</Button>
                    </form>
                  </div>

                  <div className="grid gap-2">
                    <Label className="flex items-center gap-2">
                      <Paperclip className="h-4 w-4" />
                      Anexos
                    </Label>
                    <input
                      ref={attachmentInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      disabled={isUploadingAttachment}
                      onChange={handleAttachmentChange}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="w-fit"
                      disabled={isUploadingAttachment}
                      onClick={() => attachmentInputRef.current?.click()}
                    >
                      <Paperclip className="mr-2 h-4 w-4" />
                      {isUploadingAttachment ? "Enviando..." : "Adicionar anexo"}
                    </Button>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {selectedCard.attachments.map((attachment) => (
                        <div
                          key={attachment.id}
                          className="flex min-w-0 items-center gap-3 rounded-lg border bg-background p-2"
                        >
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                            {attachment.kind === "image" ? (
                              <ImageIcon className="h-4 w-4" />
                            ) : (
                              <FileText className="h-4 w-4" />
                            )}
                          </span>
                          <button
                            type="button"
                            className="min-w-0 flex-1 text-left"
                            onClick={() =>
                              window.open(
                                attachment.url,
                                "_blank",
                                "noopener,noreferrer",
                              )
                            }
                          >
                            <p className="truncate text-sm font-semibold">
                              {attachment.name}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {attachment.extension} •{" "}
                              {formatFileSize(attachment.size)}
                            </p>
                          </button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => removeAttachment(attachment.id)}
                            aria-label="Remover anexo"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <aside className="grid content-start gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="kanban-due-date">Vencimento</Label>
                    <Popover
                      open={isDueDatePickerOpen}
                      onOpenChange={setIsDueDatePickerOpen}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          id="kanban-due-date"
                          type="button"
                          variant="outline"
                          className="h-10 w-full justify-start bg-muted text-left font-normal"
                        >
                          <CalendarDays className="mr-2 h-4 w-4 text-muted-foreground" />
                          {selectedCardDueDate
                            ? selectedCardDueDate.toLocaleDateString("pt-BR")
                            : "Selecione a data"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={selectedCardDueDate}
                          disabled={(date) => isPastDate(date, today)}
                          locale={ptBR}
                          onSelect={(date) => {
                            if (!date) return;

                            updateCard(selectedCard.id, {
                              dueDate: formatInputDate(date),
                            });
                            setIsDueDatePickerOpen(false);
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                    <label className="flex items-start gap-2 rounded-lg border bg-muted/35 p-3 text-sm">
                      <Checkbox
                        checked={selectedCard.dueReminderEnabled !== false}
                        onCheckedChange={(checked) =>
                          updateCard(selectedCard.id, {
                            dueReminderEnabled: checked === true,
                          })
                        }
                        className="mt-0.5"
                      />
                      <span className="min-w-0">
                        <span className="block font-medium">
                          Receber aviso no centro da tela
                        </span>
                        <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                          Quando ativado, o sistema mostra o lembrete no dia do
                          vencimento.
                        </span>
                      </span>
                    </label>
                  </div>

                  <div className="grid gap-2">
                    <div className="flex items-center justify-between gap-3">
                      <Label>Etiquetas</Label>
                      <Badge variant="secondary" className="rounded-md">
                        {labels.length}
                      </Badge>
                    </div>
                    <div className="grid gap-2">
                      <div className="thin-gray-scrollbar grid max-h-80 gap-2 overflow-y-auto pr-1">
                        {labels.map((label) => (
                          <div
                            key={label.id}
                            className={cn(
                              "grid gap-2 rounded-md border p-2 text-sm",
                              labelBadgeClassNames[label.color],
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <Checkbox
                                checked={selectedCard.labels.includes(label.id)}
                                onCheckedChange={() =>
                                  toggleCardLabel(label.id)
                                }
                                aria-label={`Usar etiqueta ${label.name}`}
                              />
                              <span
                                className={cn(
                                  "h-3 w-8 shrink-0 rounded-full",
                                  labelClassNames[label.color],
                                )}
                              />
                              <Input
                                value={label.name}
                                onChange={(event) =>
                                  updateLabel(label.id, {
                                    name: event.target.value,
                                  })
                                }
                                placeholder="Nome da etiqueta"
                                className="h-8 min-w-0 bg-background/80"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                className="shrink-0 text-destructive hover:text-destructive"
                                onClick={() => deleteLabel(label.id)}
                                aria-label={`Apagar etiqueta ${label.name}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                            <div className="grid grid-cols-8 gap-1.5 rounded-md bg-background/55 p-1.5">
                              {labelColorOptions.map((color) => (
                                <ColorSwatchButton
                                  key={color}
                                  color={color}
                                  selected={label.color === color}
                                  onClick={() =>
                                    updateLabel(label.id, { color })
                                  }
                                  ariaLabel={`Aplicar cor ${labelColorNames[color]}`}
                                />
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                      <form
                        className="grid gap-3 rounded-lg border bg-muted/35 p-3"
                        onSubmit={(event) => {
                          event.preventDefault();
                          createLabel();
                        }}
                      >
                        <Input
                          value={newLabelName}
                          onChange={(event) =>
                            setNewLabelName(event.target.value)
                          }
                          placeholder="Nova etiqueta"
                          className="h-9 bg-background"
                        />
                        <div className="grid gap-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium text-muted-foreground">
                              Cor da etiqueta
                            </span>
                            <span className="truncate text-xs font-medium">
                              {labelColorNames[newLabelColor]}
                            </span>
                          </div>
                          <div className="grid grid-cols-8 gap-1.5 rounded-lg bg-background/60 p-2">
                            {labelColorOptions.map((color) => (
                              <ColorSwatchButton
                                key={color}
                                color={color}
                                selected={newLabelColor === color}
                                onClick={() => setNewLabelColor(color)}
                                ariaLabel={`Selecionar cor ${labelColorNames[color]}`}
                              />
                            ))}
                          </div>
                        </div>
                        <Button type="submit" size="sm" className="w-full">
                          <Plus className="mr-1 h-4 w-4" />
                          Criar
                        </Button>
                      </form>
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label>Capa</Label>
                    <div className="grid grid-cols-8 gap-1.5 rounded-lg bg-muted/35 p-2">
                      {labelColorOptions.map((color) => (
                        <ColorSwatchButton
                          key={color}
                          color={color}
                          selected={selectedCard.coverColor === color}
                          onClick={() =>
                            updateCard(selectedCard.id, {
                              coverColor:
                                selectedCard.coverColor === color
                                  ? undefined
                                  : color,
                            })
                          }
                          ariaLabel={`Selecionar capa ${labelColorNames[color]}`}
                        />
                      ))}
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    onClick={() => duplicateCard(selectedCard)}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Duplicar cartão
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => deleteCard(selectedCard.id)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Apagar cartão
                  </Button>
                </aside>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
