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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/unipar-ui/dialog";
import { Input } from "@/components/unipar-ui/input";
import { Label } from "@/components/unipar-ui/label";
import {
  SectorCombobox,
  workspaceSectorComboboxOptions,
} from "@/components/option-combobox";
import { PagePagination } from "@/components/page-pagination";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/unipar-ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/unipar-ui/select";
import { Textarea } from "@/components/unipar-ui/textarea";
import { ptBR } from "date-fns/locale";
import {
  BellRing,
  CalendarDays,
  CheckCircle2,
  HandCoins,
  Paperclip,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import type { Sector } from "@/lib/admin-data";
import type { DirectoryUser } from "@/lib/chat-data";
import {
  formatLoanDate,
  getLoanDateKey,
  getLoanOperationalStatus,
  getLoanStatusLabel,
  parseLoanDate,
  type LoanAttachment,
  type LoanFilter,
  type LoanRequest,
} from "@/lib/loan-data";
import {
  LOAN_NOTIFICATION_EVENT,
  getLoanNotificationReadStorageKey,
  getLoanNotificationSnapshot,
  markLoanNotificationKeysRead,
  readLoanNotificationReadKeys,
} from "@/lib/loan-notifications";
import {
  getUploadSizeLimitMessage,
  splitFilesByUploadSize,
} from "@/lib/upload-limits";
import { uploadFileAttachment } from "@/lib/upload-client";

interface LoansPageProps {
  currentUser: DirectoryUser;
  currentUserSector: Sector;
  loans: LoanRequest[];
  focusLoanId: string | null;
  onCreateLoan: (loan: LoanRequest) => void;
  onUpdateLoan: (loan: LoanRequest) => void;
  onFocusLoanHandled: () => void;
}

type LoanFormValues = {
  title: string;
  description: string;
  lenderSector: Sector;
  requestedReturnDate: string;
};

type LoanListFilter = LoanFilter | "all";

const loanFilterOptions: Array<{ value: LoanListFilter; label: string }> = [
  { value: "all", label: "Ver tudo" },
  { value: "analysis", label: "Solicitação em análise" },
  { value: "approved", label: "Empréstimo liberado" },
  { value: "postponed", label: "Empréstimo adiado" },
  { value: "overdue", label: "Empréstimo atrasado" },
  { value: "history", label: "Histórico" },
];

const MAX_LOAN_ATTACHMENTS = 3;
const LOANS_PAGE_SIZE = 6;
const forceComboboxBelow = {
  side: "none",
  align: "shift",
  fallbackAxisSide: "none",
} as const;

function getStartOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isPastDate(date: Date, referenceDate: Date) {
  return getStartOfDay(date).getTime() < getStartOfDay(referenceDate).getTime();
}

function getFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getLoanStatusVariant(status: LoanFilter) {
  if (status === "overdue") return "destructive";
  if (status === "approved") return "default";
  if (status === "history") return "secondary";

  return "outline";
}

function LoanNotificationBadge({ count }: { count: number }) {
  if (count <= 0) {
    return null;
  }

  const displayCount = count > 99 ? "99+" : String(count);
  const notificationLabel = count === 1 ? "notificação" : "notificações";

  return (
    <span
      aria-label={`${count} ${notificationLabel} neste empréstimo`}
      className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full bg-primary px-2 text-[11px] font-bold leading-none text-primary-foreground shadow-sm"
      title={`${count} ${notificationLabel} neste empréstimo`}
    >
      <BellRing className="h-3.5 w-3.5" />
      {displayCount}
    </span>
  );
}

function revokeTemporaryAttachmentUrl(url: string) {
  if (url.startsWith("blob:")) URL.revokeObjectURL(url);
}

function toLoanAttachmentKind(
  kind: Awaited<ReturnType<typeof uploadFileAttachment>>["kind"],
): LoanAttachment["kind"] {
  return kind === "video" ? "video" : "image";
}

function getClientErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Não foi possível concluir a operação.";
}

function AttachmentTile({
  attachment,
  onRemove,
}: {
  attachment: LoanAttachment;
  onRemove?: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border bg-background">
      <div className="relative aspect-video bg-muted">
        {attachment.kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={attachment.url}
            alt={attachment.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <video
            src={attachment.url}
            className="h-full w-full bg-black object-cover"
            muted
            preload="metadata"
          />
        )}
        {onRemove && (
          <Button
            type="button"
            variant="secondary"
            size="icon-sm"
            className="absolute right-2 top-2"
            onClick={onRemove}
            aria-label="Remover anexo"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      <div className="p-2">
        <p className="truncate text-sm font-semibold">{attachment.name}</p>
        <p className="text-xs text-muted-foreground">
          {attachment.kind === "video" ? "Vídeo" : "Foto"} •{" "}
          {getFileSize(attachment.size)}
        </p>
      </div>
    </div>
  );
}

export function LoansPage({
  currentUser,
  currentUserSector,
  loans,
  focusLoanId,
  onCreateLoan,
  onUpdateLoan,
  onFocusLoanHandled,
}: LoansPageProps) {
  const today = useMemo(() => new Date(), []);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeFilter, setActiveFilter] = useState<LoanListFilter>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedLoanId, setSelectedLoanId] = useState<string | null>(null);
  const [isRequestDialogOpen, setIsRequestDialogOpen] = useState(false);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [isPostponeDatePickerOpen, setIsPostponeDatePickerOpen] =
    useState(false);
  const [loanFormValues, setLoanFormValues] = useState<LoanFormValues>({
    title: "",
    description: "",
    lenderSector: "TI",
    requestedReturnDate: getLoanDateKey(today),
  });
  const [approvalLoanId, setApprovalLoanId] = useState<string | null>(null);
  const [patrimonyNumber, setPatrimonyNumber] = useState("");
  const [approvalAttachments, setApprovalAttachments] = useState<
    LoanAttachment[]
  >([]);
  const [isUploadingApprovalAttachment, setIsUploadingApprovalAttachment] =
    useState(false);
  const [rejectLoan, setRejectLoan] = useState<LoanRequest | null>(null);
  const [postponeLoanId, setPostponeLoanId] = useState<string | null>(null);
  const [postponeDate, setPostponeDate] = useState("");
  const [postponeReason, setPostponeReason] = useState("");
  const [returnLoan, setReturnLoan] = useState<LoanRequest | null>(null);
  const [notificationReadVersion, setNotificationReadVersion] = useState(0);

  const selectedLoan = selectedLoanId
    ? loans.find((loan) => loan.id === selectedLoanId) ?? null
    : null;
  const approvalLoan = approvalLoanId
    ? loans.find((loan) => loan.id === approvalLoanId) ?? null
    : null;
  const postponeLoan = postponeLoanId
    ? loans.find((loan) => loan.id === postponeLoanId) ?? null
    : null;

  const filteredLoans = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return loans
      .filter((loan) =>
        activeFilter === "all"
          ? true
          : getLoanOperationalStatus(loan) === activeFilter,
      )
      .filter((loan) =>
        normalizedSearch
          ? [
              loan.title,
              loan.description,
              loan.requesterName,
              loan.requesterSector,
              loan.lenderSector,
              loan.patrimonyNumber ?? "",
              loan.approvedByName ?? "",
            ]
              .join(" ")
              .toLowerCase()
              .includes(normalizedSearch)
          : true,
      )
      .sort((firstLoan, secondLoan) => {
        if (activeFilter === "overdue") {
          return (
            parseLoanDate(firstLoan.requestedReturnDate).getTime() -
            parseLoanDate(secondLoan.requestedReturnDate).getTime()
          );
        }

        return secondLoan.createdAt.getTime() - firstLoan.createdAt.getTime();
      });
  }, [activeFilter, loans, search]);
  const totalPages = Math.max(
    1,
    Math.ceil(filteredLoans.length / LOANS_PAGE_SIZE),
  );
  const currentPage = Math.min(page, totalPages);
  const paginatedLoans = filteredLoans.slice(
    (currentPage - 1) * LOANS_PAGE_SIZE,
    currentPage * LOANS_PAGE_SIZE,
  );

  useEffect(() => {
    if (!focusLoanId) return;

    const loanToFocus = loans.find((loan) => loan.id === focusLoanId);
    if (!loanToFocus) return;

    const timeoutId = window.setTimeout(() => {
      setActiveFilter(getLoanOperationalStatus(loanToFocus));
      setSelectedLoanId(loanToFocus.id);
      onFocusLoanHandled();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [focusLoanId, loans, onFocusLoanHandled]);

  const resetRequestForm = () => {
    setLoanFormValues({
      title: "",
      description: "",
      lenderSector: "TI",
      requestedReturnDate: getLoanDateKey(today),
    });
    setIsDatePickerOpen(false);
  };

  const createId = (prefix: string) => {
    if (window.crypto.randomUUID) {
      return `${prefix}-${window.crypto.randomUUID()}`;
    }

    return `${prefix}-${Date.now()}`;
  };

  const handleCreateLoan = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const title = loanFormValues.title.trim();
    const description = loanFormValues.description.trim();

    if (!title) {
      toast.error("Informe o título do empréstimo.");
      return;
    }

    if (!loanFormValues.requestedReturnDate) {
      toast.error("Informe a data de devolução.");
      return;
    }

    const returnDate = parseLoanDate(loanFormValues.requestedReturnDate);

    if (isPastDate(returnDate, today)) {
      toast.error("A data de devolução não pode estar no passado.");
      return;
    }

    onCreateLoan({
      id: createId("loan"),
      title,
      description,
      requesterId: currentUser.id,
      requesterName: currentUser.name,
      requesterSector: currentUserSector,
      lenderSector: loanFormValues.lenderSector,
      requestedReturnDate: loanFormValues.requestedReturnDate,
      status: "analysis",
      createdAt: new Date(),
      releaseAttachments: [],
      postponements: [],
    });
    setActiveFilter("analysis");
    setIsRequestDialogOpen(false);
    resetRequestForm();
    toast.success("Empréstimo solicitado.");
  };

  const handleAttachmentChange = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const input = event.currentTarget;
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
      input.value = "";
      return;
    }

    const availableSlots = MAX_LOAN_ATTACHMENTS - approvalAttachments.length;
    const acceptedFiles = filesWithinLimit.slice(0, availableSlots);

    if (acceptedFiles.length < filesWithinLimit.length) {
      toast.warning("Alguns anexos não foram adicionados.", {
        description: "É possível adicionar até 3 fotos ou vídeos.",
      });
    }

    setIsUploadingApprovalAttachment(true);

    try {
      const uploadResults = await Promise.allSettled(
        acceptedFiles.map((file) => uploadFileAttachment(file)),
      );
      const uploadedAttachments = uploadResults.flatMap((result) =>
        result.status === "fulfilled"
          ? [
              {
                id: result.value.id,
                name: result.value.name,
                size: result.value.size,
                kind: toLoanAttachmentKind(result.value.kind),
                url: result.value.url,
              } satisfies LoanAttachment,
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

      if (uploadedAttachments.length > 0) {
        setApprovalAttachments((currentAttachments) => [
          ...currentAttachments,
          ...uploadedAttachments,
        ]);
      }
    } finally {
      setIsUploadingApprovalAttachment(false);
      input.value = "";
    }
  };

  const removeApprovalAttachment = (attachmentId: string) => {
    setApprovalAttachments((currentAttachments) => {
      const removedAttachment = currentAttachments.find(
        (attachment) => attachment.id === attachmentId,
      );

      if (removedAttachment) {
        revokeTemporaryAttachmentUrl(removedAttachment.url);
      }

      return currentAttachments.filter(
        (attachment) => attachment.id !== attachmentId,
      );
    });
  };

  const openApprovalDialog = (loan: LoanRequest) => {
    setApprovalLoanId(loan.id);
    setPatrimonyNumber("");
    setApprovalAttachments([]);
  };

  const closeApprovalDialog = () => {
    approvalAttachments.forEach((attachment) =>
      revokeTemporaryAttachmentUrl(attachment.url),
    );
    setApprovalLoanId(null);
    setPatrimonyNumber("");
    setApprovalAttachments([]);
  };

  const approveLoan = () => {
    if (!approvalLoan) return;

    if (isUploadingApprovalAttachment) {
      toast.info("Aguarde o envio dos anexos terminar.");
      return;
    }

    const cleanPatrimonyNumber = patrimonyNumber.trim();

    if (!cleanPatrimonyNumber) {
      toast.error("Informe o número de patrimônio.");
      return;
    }

    onUpdateLoan({
      ...approvalLoan,
      status: "approved",
      approvedAt: new Date(),
      approvedById: currentUser.id,
      approvedByName: currentUser.name,
      approvedBySector: currentUserSector,
      patrimonyNumber: cleanPatrimonyNumber,
      releaseAttachments: approvalAttachments,
    });
    setActiveFilter("approved");
    setSelectedLoanId(approvalLoan.id);
    setApprovalLoanId(null);
    setPatrimonyNumber("");
    setApprovalAttachments([]);
    toast.success("Empréstimo aprovado.");
  };

  const rejectSelectedLoan = () => {
    if (!rejectLoan) return;

    onUpdateLoan({
      ...rejectLoan,
      status: "rejected",
      rejectedAt: new Date(),
      rejectedById: currentUser.id,
      rejectedByName: currentUser.name,
      rejectedBySector: currentUserSector,
    });
    setActiveFilter("history");
    setRejectLoan(null);
    setSelectedLoanId(null);
    toast.success("Empréstimo rejeitado.");
  };

  const openPostponeDialog = (loan: LoanRequest) => {
    const currentReturnDate = parseLoanDate(loan.requestedReturnDate);
    const nextDate = new Date(
      currentReturnDate.getFullYear(),
      currentReturnDate.getMonth(),
      currentReturnDate.getDate() + 1,
    );

    setPostponeLoanId(loan.id);
    setPostponeDate(getLoanDateKey(nextDate));
    setIsPostponeDatePickerOpen(false);
    setPostponeReason("");
  };

  const postponeSelectedLoan = () => {
    if (!postponeLoan) return;

    const reason = postponeReason.trim();
    const currentReturnDate = parseLoanDate(postponeLoan.requestedReturnDate);
    const nextReturnDate = parseLoanDate(postponeDate);

    if (!postponeDate || nextReturnDate <= currentReturnDate) {
      toast.error("Escolha uma data posterior à devolução atual.");
      return;
    }

    if (!reason) {
      toast.error("Informe o motivo do adiamento.");
      return;
    }

    onUpdateLoan({
      ...postponeLoan,
      status: "postponed",
      requestedReturnDate: postponeDate,
      postponements: [
        ...postponeLoan.postponements,
        {
          id: createId("loan-postpone"),
          previousReturnDate: postponeLoan.requestedReturnDate,
          newReturnDate: postponeDate,
          reason,
          requestedAt: new Date(),
        },
      ],
    });
    setActiveFilter("postponed");
    setPostponeLoanId(null);
    setPostponeDate("");
    setIsPostponeDatePickerOpen(false);
    setPostponeReason("");
    toast.success("Devolução adiada.");
  };

  const markLoanAsReturned = () => {
    if (!returnLoan) return;

    onUpdateLoan({
      ...returnLoan,
      status: "returned",
      returnedAt: new Date(),
      returnedById: currentUser.id,
      returnedByName: currentUser.name,
    });
    setActiveFilter("history");
    setReturnLoan(null);
    setSelectedLoanId(null);
    toast.success("Emprestimo marcado como devolvido.");
  };

  const canApproveOrReject = (loan: LoanRequest) =>
    loan.status === "analysis" && loan.lenderSector === currentUserSector;
  const canPostpone = (loan: LoanRequest) =>
    (loan.status === "approved" || loan.status === "postponed") &&
    loan.requesterId === currentUser.id;
  const canReturn = (loan: LoanRequest) =>
    (loan.status === "approved" || loan.status === "postponed") &&
    loan.approvedById === currentUser.id;

  const selectedDate = loanFormValues.requestedReturnDate
    ? parseLoanDate(loanFormValues.requestedReturnDate)
    : undefined;
  const selectedPostponeDate = postponeDate
    ? parseLoanDate(postponeDate)
    : undefined;
  const loanNotificationSnapshot = useMemo(() => {
    void notificationReadVersion;

    const readKeys = readLoanNotificationReadKeys(currentUser.id);

    return getLoanNotificationSnapshot(
      loans,
      {
        id: currentUser.id,
        sector: currentUserSector,
      },
      readKeys,
    );
  }, [currentUser.id, currentUserSector, loans, notificationReadVersion]);

  const markLoanNotificationsAsSeen = (loanId: string) => {
    const unreadKeys =
      loanNotificationSnapshot.keysByLoan[loanId]?.filter((key) =>
        loanNotificationSnapshot.unreadKeys.has(key),
      ) ?? [];

    const didChange = markLoanNotificationKeysRead(currentUser.id, unreadKeys);

    if (didChange) {
      setNotificationReadVersion((version) => version + 1);
    }
  };

  const openLoanDetails = (loanId: string) => {
    setSelectedLoanId(loanId);
    markLoanNotificationsAsSeen(loanId);
  };

  useEffect(() => {
    if (!selectedLoan) return;

    const timeoutId = window.setTimeout(() => {
      markLoanNotificationsAsSeen(selectedLoan.id);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loanNotificationSnapshot, selectedLoan]);

  useEffect(() => {
    const readStorageKey = getLoanNotificationReadStorageKey(currentUser.id);
    const handleNotificationsChanged = () => {
      setNotificationReadVersion((version) => version + 1);
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === readStorageKey) {
        handleNotificationsChanged();
      }
    };

    window.addEventListener(LOAN_NOTIFICATION_EVENT, handleNotificationsChanged);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(
        LOAN_NOTIFICATION_EVENT,
        handleNotificationsChanged,
      );
      window.removeEventListener("storage", handleStorage);
    };
  }, [currentUser.id]);

  return (
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
            placeholder="Buscar empréstimos"
            className="h-9 bg-muted pl-10"
          />
        </div>
        <Select
          value={activeFilter}
          onValueChange={(value) => {
            setActiveFilter(value as LoanListFilter);
            setPage(1);
          }}
        >
          <SelectTrigger className="h-9 w-full bg-muted md:w-64">
            <SelectValue placeholder="Filtrar por status" />
          </SelectTrigger>
          <SelectContent
            align="start"
            avoidCollisions={false}
            position="popper"
            side="bottom"
          >
            {loanFilterOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          className="w-full md:ml-auto md:w-auto"
          onClick={() => setIsRequestDialogOpen(true)}
        >
          <Plus className="mr-1 h-4 w-4" />
          Solicitar empréstimo
        </Button>
      </div>

      <div className="thin-gray-scrollbar min-h-0 flex-1 overflow-y-auto p-3 md:p-4">
        {filteredLoans.length === 0 ? (
          <div className="flex min-h-96 flex-col items-center justify-center rounded-lg border bg-card p-6 text-center">
            <HandCoins className="h-12 w-12 text-muted-foreground" />
            <h2 className="mt-4 text-lg font-semibold">Nenhum empréstimo</h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              As solicitações aparecem aqui conforme o filtro selecionado.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
            {paginatedLoans.map((loan) => {
              const status = getLoanOperationalStatus(loan);
              const notificationCount =
                loanNotificationSnapshot.unreadByLoan[loan.id] ?? 0;

              return (
                <article
                  key={loan.id}
                  className="flex min-w-0 flex-col gap-3 rounded-lg border bg-card p-3"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <HandCoins className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="min-w-0 flex-1 break-words font-semibold">
                          {loan.title}
                        </h2>
                        <LoanNotificationBadge count={notificationCount} />
                        <Badge variant={getLoanStatusVariant(status)}>
                          {getLoanStatusLabel(loan)}
                        </Badge>
                      </div>
                      <p className="mt-1 line-clamp-2 break-words text-sm text-muted-foreground">
                        {loan.description || "Sem descrição."}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-2 rounded-lg border bg-background p-3 text-sm">
                    <div className="grid gap-1 sm:grid-cols-2">
                      <span>
                        <strong>Solicitante:</strong> {loan.requesterName}
                      </span>
                      <span>
                        <strong>Setor:</strong> {loan.requesterSector}
                      </span>
                      <span>
                        <strong>Emprestando:</strong> {loan.lenderSector}
                      </span>
                      <span>
                        <strong>Devolução:</strong>{" "}
                        {formatLoanDate(loan.requestedReturnDate)}
                      </span>
                    </div>
                    {loan.approvedByName && (
                      <span>
                        <strong>Liberado por:</strong> {loan.approvedByName} •{" "}
                        {loan.approvedBySector}
                      </span>
                    )}
                    {loan.patrimonyNumber && (
                      <span>
                        <strong>Patrimônio:</strong> {loan.patrimonyNumber}
                      </span>
                    )}
                  </div>

                  <div className="mt-auto flex flex-wrap justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => openLoanDetails(loan.id)}
                    >
                      Detalhes
                    </Button>
                    {canApproveOrReject(loan) && (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setRejectLoan(loan)}
                        >
                          Rejeitar
                        </Button>
                        <Button
                          type="button"
                          onClick={() => openApprovalDialog(loan)}
                        >
                          Liberar
                        </Button>
                      </>
                    )}
                    {canPostpone(loan) && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => openPostponeDialog(loan)}
                      >
                        <RotateCcw className="mr-1 h-4 w-4" />
                        Adiar devolução
                      </Button>
                    )}
                    {canReturn(loan) && (
                      <Button type="button" onClick={() => setReturnLoan(loan)}>
                        <CheckCircle2 className="mr-1 h-4 w-4" />
                        Marcar devolvido
                      </Button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <PagePagination
        page={currentPage}
        totalPages={totalPages}
        onPageChange={setPage}
        className="shrink-0 bg-background"
      />

      <Dialog
        modal={false}
        open={isRequestDialogOpen}
        onOpenChange={(open) => {
          setIsRequestDialogOpen(open);
          if (!open) resetRequestForm();
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Solicitar empréstimo</DialogTitle>
          </DialogHeader>

          <form className="grid gap-4" onSubmit={handleCreateLoan}>
            <div className="grid gap-2">
              <Label htmlFor="loan-title">Título</Label>
              <Input
                id="loan-title"
                value={loanFormValues.title}
                onChange={(event) =>
                  setLoanFormValues((currentValues) => ({
                    ...currentValues,
                    title: event.target.value,
                  }))
                }
                placeholder="Ex: Notebook para treinamento"
                className="h-10 bg-muted"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="loan-description">
                Descrição
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  opcional
                </span>
              </Label>
              <Textarea
                id="loan-description"
                value={loanFormValues.description}
                onChange={(event) =>
                  setLoanFormValues((currentValues) => ({
                    ...currentValues,
                    description: event.target.value,
                  }))
                }
                placeholder="Detalhe o motivo do empréstimo"
                className="min-h-24 resize-none bg-muted"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Data de devolução</Label>
                <Popover
                  open={isDatePickerOpen}
                  onOpenChange={setIsDatePickerOpen}
                >
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 justify-start bg-muted text-left font-normal"
                    >
                      <CalendarDays className="mr-2 h-4 w-4 text-muted-foreground" />
                      {selectedDate
                        ? selectedDate.toLocaleDateString("pt-BR")
                        : "Selecione a data"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      disabled={(date) => isPastDate(date, today)}
                      locale={ptBR}
                      onSelect={(date) => {
                        if (!date) return;

                        setLoanFormValues((currentValues) => ({
                          ...currentValues,
                          requestedReturnDate: getLoanDateKey(date),
                        }));
                        setIsDatePickerOpen(false);
                      }}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="grid gap-2">
                <Label>Setor que vai emprestar</Label>
                <SectorCombobox
                  value={loanFormValues.lenderSector}
                  onValueChange={(value) =>
                    setLoanFormValues((currentValues) => ({
                      ...currentValues,
                      lenderSector: value as Sector,
                    }))
                  }
                  options={workspaceSectorComboboxOptions}
                  contentCollisionAvoidance={forceComboboxBelow}
                />
              </div>
            </div>

            <div className="-mx-4 -mb-4 flex justify-end gap-2 border-t bg-muted/50 p-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsRequestDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit">
                <HandCoins className="mr-1 h-4 w-4" />
                Iniciar solicitação
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(approvalLoan)}
        onOpenChange={(open) => {
          if (!open) closeApprovalDialog();
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
          {approvalLoan && (
            <>
              <DialogHeader>
                <DialogTitle>Liberar empréstimo</DialogTitle>
              </DialogHeader>

              <div className="grid gap-4">
                <div className="rounded-lg border bg-muted/35 p-3">
                  <p className="font-semibold">{approvalLoan.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Solicitado por {approvalLoan.requesterName} •{" "}
                    {approvalLoan.requesterSector}
                  </p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="loan-patrimony">Número de patrimônio</Label>
                  <Input
                    id="loan-patrimony"
                    value={patrimonyNumber}
                    onChange={(event) => setPatrimonyNumber(event.target.value)}
                    placeholder="Ex: PAT-2026-0001"
                    className="h-10 bg-muted"
                  />
                </div>
                <div className="grid gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label>Fotos ou vídeos do material</Label>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={
                        isUploadingApprovalAttachment ||
                        approvalAttachments.length >= MAX_LOAN_ATTACHMENTS
                      }
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Paperclip className="mr-1 h-4 w-4" />
                      {isUploadingApprovalAttachment ? "Enviando..." : "Adicionar"}
                    </Button>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*,video/*"
                    className="hidden"
                    disabled={isUploadingApprovalAttachment}
                    onChange={handleAttachmentChange}
                  />
                  {approvalAttachments.length === 0 ? (
                    <div className="flex h-24 items-center justify-center rounded-lg border border-dashed bg-muted/35 px-4 text-center text-sm text-muted-foreground">
                      Opcional: adicione até 3 fotos ou vídeos.
                    </div>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-3">
                      {approvalAttachments.map((attachment) => (
                        <AttachmentTile
                          key={attachment.id}
                          attachment={attachment}
                          onRemove={() => removeApprovalAttachment(attachment.id)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="-mx-4 -mb-4 mt-4 flex justify-end gap-2 border-t bg-muted/50 p-4">
                <Button type="button" variant="ghost" onClick={closeApprovalDialog}>
                  Cancelar
                </Button>
                <Button
                  type="button"
                  disabled={isUploadingApprovalAttachment}
                  onClick={approveLoan}
                >
                  <ShieldCheck className="mr-1 h-4 w-4" />
                  Liberar empréstimo
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(rejectLoan)}
        onOpenChange={(open) => {
          if (!open) setRejectLoan(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          {rejectLoan && (
            <>
              <DialogHeader>
                <DialogTitle>Rejeitar solicitação?</DialogTitle>
              </DialogHeader>
              <p className="text-sm leading-6 text-muted-foreground">
                Tem certeza que deseja rejeitar esta solicitação de empréstimo?
              </p>
              <div className="rounded-lg border bg-muted/35 p-3">
                <p className="font-semibold">{rejectLoan.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {rejectLoan.requesterName} • {rejectLoan.requesterSector}
                </p>
              </div>
              <div className="-mx-4 -mb-4 flex justify-end gap-2 border-t bg-muted/50 p-4">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setRejectLoan(null)}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={rejectSelectedLoan}
                >
                  <Trash2 className="mr-1 h-4 w-4" />
                  Rejeitar
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(postponeLoan)}
        onOpenChange={(open) => {
          if (!open) {
            setPostponeLoanId(null);
            setIsPostponeDatePickerOpen(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          {postponeLoan && (
            <>
              <DialogHeader>
                <DialogTitle>Adiar devolução</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="loan-postpone-date">Nova data</Label>
                  <Popover
                    open={isPostponeDatePickerOpen}
                    onOpenChange={setIsPostponeDatePickerOpen}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        id="loan-postpone-date"
                        type="button"
                        variant="outline"
                        className="h-10 justify-start bg-muted text-left font-normal"
                      >
                        <CalendarDays className="mr-2 h-4 w-4 text-muted-foreground" />
                        {selectedPostponeDate
                          ? selectedPostponeDate.toLocaleDateString("pt-BR")
                          : "Selecione a nova data"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={selectedPostponeDate}
                        disabled={(date) =>
                          getStartOfDay(date).getTime() <=
                          getStartOfDay(
                            parseLoanDate(postponeLoan.requestedReturnDate),
                          ).getTime()
                        }
                        locale={ptBR}
                        onSelect={(date) => {
                          if (!date) return;

                          setPostponeDate(getLoanDateKey(date));
                          setIsPostponeDatePickerOpen(false);
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="loan-postpone-reason">Motivo</Label>
                  <Textarea
                    id="loan-postpone-reason"
                    value={postponeReason}
                    onChange={(event) => setPostponeReason(event.target.value)}
                    placeholder="Explique por que precisa adiar a devolução"
                    className="min-h-24 resize-none bg-muted"
                  />
                </div>
              </div>
              <div className="-mx-4 -mb-4 mt-4 flex justify-end gap-2 border-t bg-muted/50 p-4">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setPostponeLoanId(null)}
                >
                  Cancelar
                </Button>
                <Button type="button" onClick={postponeSelectedLoan}>
                  Salvar adiamento
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(returnLoan)}
        onOpenChange={(open) => {
          if (!open) setReturnLoan(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          {returnLoan && (
            <>
              <DialogHeader>
                <DialogTitle>Marcar como devolvido?</DialogTitle>
              </DialogHeader>
              <p className="text-sm leading-6 text-muted-foreground">
                O empréstimo será enviado para o histórico. Essa ação só pode ser
                feita por quem liberou o empréstimo.
              </p>
              <div className="rounded-lg border bg-muted/35 p-3">
                <p className="font-semibold">{returnLoan.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Patrimônio {returnLoan.patrimonyNumber}
                </p>
              </div>
              <div className="-mx-4 -mb-4 flex justify-end gap-2 border-t bg-muted/50 p-4">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setReturnLoan(null)}
                >
                  Cancelar
                </Button>
                <Button type="button" onClick={markLoanAsReturned}>
                  <CheckCircle2 className="mr-1 h-4 w-4" />
                  Confirmar devolução
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(selectedLoan)}
        onOpenChange={(open) => {
          if (!open) setSelectedLoanId(null);
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
          {selectedLoan && (
            <>
              <DialogHeader>
                <DialogTitle className="break-words pr-8">
                  {selectedLoan.title}
                </DialogTitle>
              </DialogHeader>
              <div className="grid gap-4">
                <div className="grid gap-2 rounded-lg border bg-muted/35 p-3 text-sm">
                  <Badge
                    variant={getLoanStatusVariant(
                      getLoanOperationalStatus(selectedLoan),
                    )}
                    className="w-fit"
                  >
                    {getLoanStatusLabel(selectedLoan)}
                  </Badge>
                  <p>
                    <strong>Solicitante:</strong> {selectedLoan.requesterName} •{" "}
                    {selectedLoan.requesterSector}
                  </p>
                  <p>
                    <strong>Setor que empresta:</strong>{" "}
                    {selectedLoan.lenderSector}
                  </p>
                  <p>
                    <strong>Data de devolução:</strong>{" "}
                    {formatLoanDate(selectedLoan.requestedReturnDate)}
                  </p>
                  {selectedLoan.approvedByName && (
                    <p>
                      <strong>Liberado por:</strong> {selectedLoan.approvedByName}{" "}
                      • {selectedLoan.approvedBySector}
                    </p>
                  )}
                  {selectedLoan.patrimonyNumber && (
                    <p>
                      <strong>Patrimônio:</strong> {selectedLoan.patrimonyNumber}
                    </p>
                  )}
                </div>
                {selectedLoan.description && (
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">Descrição</h3>
                    <p className="whitespace-pre-wrap break-words rounded-lg border bg-background p-3 text-sm leading-6">
                      {selectedLoan.description}
                    </p>
                  </div>
                )}
                <div>
                  <h3 className="mb-2 text-sm font-semibold">Anexos da liberação</h3>
                  {selectedLoan.releaseAttachments.length === 0 ? (
                    <div className="rounded-lg border bg-muted/35 p-3 text-sm text-muted-foreground">
                      Nenhum arquivo anexado.
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-3">
                      {selectedLoan.releaseAttachments.map((attachment) => (
                        <AttachmentTile key={attachment.id} attachment={attachment} />
                      ))}
                    </div>
                  )}
                </div>
                {selectedLoan.postponements.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">Adiamentos</h3>
                    <div className="grid gap-2">
                      {selectedLoan.postponements.map((postponement) => (
                        <div
                          key={postponement.id}
                          className="rounded-lg border bg-background p-3 text-sm"
                        >
                          <p className="font-medium">
                            {formatLoanDate(postponement.previousReturnDate)} →{" "}
                            {formatLoanDate(postponement.newReturnDate)}
                          </p>
                          <p className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">
                            {postponement.reason}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
