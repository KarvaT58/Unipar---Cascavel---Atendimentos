"use client";

import {
  FormEvent,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import {
  AccessRequest,
  AdminReport,
  AdminReportMessageSnapshot,
  AdminUser,
  ExtensionContentItem,
  HelpContentImage,
  HelpContentItem,
  Sector,
  isUniparEmail,
} from "@/lib/admin-data";
import { Badge } from "@/components/unipar-ui/badge";
import { Button } from "@/components/unipar-ui/button";
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
  SectorCombobox,
  legacySectorComboboxOptions,
} from "@/components/option-combobox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/unipar-ui/tabs";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Ban,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Download,
  Edit3,
  Eye,
  EyeOff,
  ExternalLink,
  FileText,
  HandCoins,
  Headphones,
  Image as ImageIcon,
  Mail,
  Mic,
  MoreVertical,
  PhoneCall,
  Play,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  UserCog,
  UserPlus,
  Video,
} from "lucide-react";
import {
  formatLoanDate,
  getLoanOverdueDays,
  getLoanStatusLabel,
  isLoanCriticalOverdue,
  type LoanRequest,
} from "@/lib/loan-data";
import {
  getServiceTicketPriorityLabel,
  getServiceTicketStatusLabel,
  type ServiceTicket,
} from "@/lib/service-ticket-data";
import {
  getUploadSizeLimitMessage,
  splitFilesByUploadSize,
} from "@/lib/upload-limits";
import { toast } from "sonner";

type AdminUserFormValues = {
  name: string;
  email: string;
  sector: Sector | "";
  password: string;
  confirmPassword: string;
  isAdmin: boolean;
};

type ExtensionFormValues = {
  name: string;
  sector: string;
  extension: string;
};

type HelpDraftImage = HelpContentImage;

type ContentDeleteTarget =
  | { type: "help-draft-image"; image: HelpDraftImage }
  | { type: "help-item"; item: HelpContentItem }
  | { type: "extension-item"; item: ExtensionContentItem }
  | { type: "report"; report: AdminReport };

interface AdminPanelProps {
  accessRequests: AccessRequest[];
  users: AdminUser[];
  reports: AdminReport[];
  loans: LoanRequest[];
  serviceTickets: ServiceTicket[];
  helpItems: HelpContentItem[];
  extensionItems: ExtensionContentItem[];
  onCreateUser: (
    user: Omit<AdminUser, "id" | "createdAt" | "status">,
    requestId?: string,
  ) => void;
  onUpdateUser: (
    userId: string,
    user: Omit<AdminUser, "id" | "createdAt" | "status">,
  ) => void;
  onToggleUserBlocked: (userId: string) => void;
  onDeleteUser: (userId: string) => void;
  onRejectAccessRequest: (requestId: string) => void;
  onMarkReportReviewed: (reportId: string) => void;
  onDeleteReport: (reportId: string) => void;
  onReopenReport: (reportId: string) => void;
  onResolveLoan: (loanId: string) => void;
  onCreateHelpItem: (item: Omit<HelpContentItem, "id">) => void;
  onUpdateHelpItem: (itemId: string, item: Omit<HelpContentItem, "id">) => void;
  onDeleteHelpItem: (itemId: string) => void;
  onMoveHelpItem: (itemId: string, direction: -1 | 1) => void;
  onMoveHelpItemImage: (
    itemId: string,
    imageId: string,
    direction: -1 | 1,
  ) => void;
  onCreateExtensionItem: (item: Omit<ExtensionContentItem, "id">) => void;
  onUpdateExtensionItem: (
    itemId: string,
    item: Omit<ExtensionContentItem, "id">,
  ) => void;
  onDeleteExtensionItem: (itemId: string) => void;
}

const emptyUserForm: AdminUserFormValues = {
  name: "",
  email: "",
  sector: "",
  password: "",
  confirmPassword: "",
  isAdmin: false,
};

const emptyExtensionForm: ExtensionFormValues = {
  name: "",
  sector: "",
  extension: "",
};

const USERS_PAGE_SIZE = 6;
const REPORTS_PAGE_SIZE = 8;
const STALE_SERVICE_TICKET_DAYS = 3;
type ReportView = "open" | "progress" | "history";
type LoanAdminView = "open" | "history";
type ServiceTicketAdminView = "open" | "history";

const reportViewOptions: Array<{ label: string; value: ReportView }> = [
  { label: "Em aberto", value: "open" },
  { label: "Em andamento", value: "progress" },
  { label: "Histórico", value: "history" },
];

const reportViewEmptyState: Record<
  ReportView,
  { description: string; title: string }
> = {
  open: {
    title: "Nenhuma denúncia em aberto",
    description: "Denúncias novas aparecerão aqui.",
  },
  progress: {
    title: "Nenhuma denúncia em andamento",
    description: "Denúncias movidas para análise aparecerão aqui.",
  },
  history: {
    title: "Nenhuma denúncia no histórico",
    description: "Denúncias finalizadas aparecerão aqui.",
  },
};

function formatCpf(cpf: string) {
  const cleanCpf = cpf.replace(/\D/g, "").padEnd(11, "0").slice(0, 11);
  return cleanCpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

function formatDateTime(date: Date) {
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateOnly(date: Date) {
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function getDaysSince(date: Date, referenceDate = new Date()) {
  return Math.max(
    0,
    Math.ceil(
      (referenceDate.getTime() - date.getTime()) / (24 * 60 * 60 * 1000),
    ),
  );
}

function isServiceTicketWithoutInteraction(
  ticket: ServiceTicket,
  referenceDate = new Date(),
) {
  return (
    ticket.status !== "completed" &&
    referenceDate.getTime() - ticket.lastInteractionAt.getTime() >
      STALE_SERVICE_TICKET_DAYS * 24 * 60 * 60 * 1000
  );
}

function getRequestStatusLabel(status: AccessRequest["status"]) {
  switch (status) {
    case "created":
      return "Usuário criado";
    case "rejected":
      return "Rejeitada";
    default:
      return "Aguardando criação";
  }
}

function getRequestStatusVariant(status: AccessRequest["status"]) {
  if (status === "created") return "default";
  if (status === "rejected") return "destructive";
  return "secondary";
}

function getReportStatusLabel(status: AdminReport["status"]) {
  if (status === "reviewed") return "Em andamento";
  if (status === "deleted") return "Histórico";
  return "Em aberto";
}

function getReportStatusVariant(status: AdminReport["status"]) {
  if (status === "reviewed") return "secondary";
  if (status === "deleted") return "outline";
  return "destructive";
}

function getReportTypeLabel(report: AdminReport) {
  if (report.type === "message") return "Mensagem";
  if (report.sourceKind === "group") return "Grupo";
  if (report.sourceKind === "contact") return "Contato";
  return "Conversa";
}

function getEvidenceAttachmentSearchText(
  attachment?: AdminReportMessageSnapshot["attachment"],
) {
  if (!attachment) return "";

  switch (attachment.type) {
    case "image":
      return `foto imagem ${attachment.alt}`;
    case "video":
      return `vídeo video ${attachment.title ?? ""} ${attachment.duration}`;
    case "audio":
      return `áudio ${attachment.duration}`;
    case "document":
      return `documento ${attachment.name} ${attachment.meta} ${attachment.extension}`;
    default:
      return "";
  }
}

function getReportEvidenceSearchText(report: AdminReport) {
  return (report.evidenceMessages ?? [])
    .map((message) =>
      [
        message.senderName,
        message.content,
        message.replyTo?.content ?? "",
        formatDateTime(message.timestamp),
        getEvidenceAttachmentSearchText(message.attachment),
      ].join(" "),
    )
    .join(" ");
}

function getReportSearchText(report: AdminReport) {
  return [
    report.sourceName,
    report.sourceEmail,
    report.description,
    report.messagePreview ?? "",
    getReportEvidenceSearchText(report),
    formatDateTime(report.createdAt),
    formatDateOnly(report.createdAt),
  ]
    .join(" ")
    .toLowerCase();
}

function getLoanAdminSearchText(loan: LoanRequest) {
  return [
    loan.title,
    loan.description ?? "",
    loan.requesterName,
    loan.requesterSector,
    loan.lenderSector,
    loan.approvedByName ?? "",
    loan.approvedBySector ?? "",
    loan.resolvedByName ?? "",
    loan.resolvedBySector ?? "",
    loan.patrimonyNumber ?? "",
    getLoanStatusLabel(loan),
    formatLoanDate(loan.requestedReturnDate),
    formatDateTime(loan.createdAt),
    loan.approvedAt ? formatDateTime(loan.approvedAt) : "",
    loan.resolvedAt ? formatDateTime(loan.resolvedAt) : "",
  ]
    .join(" ")
    .toLowerCase();
}

function getServiceTicketAdminSearchText(ticket: ServiceTicket) {
  return [
    ticket.title,
    ticket.description,
    ticket.requesterName,
    ticket.requesterSector,
    ticket.targetSector,
    ticket.assignedToName ?? "",
    ticket.assignedToSector ?? "",
    ticket.closedByName ?? "",
    getServiceTicketStatusLabel(ticket.status),
    getServiceTicketPriorityLabel(ticket.priority),
    formatDateTime(ticket.createdAt),
    formatDateTime(ticket.lastInteractionAt),
    ticket.closedAt ? formatDateTime(ticket.closedAt) : "",
  ]
    .join(" ")
    .toLowerCase();
}

function createDocumentFallbackUrl(
  attachment: Extract<
    NonNullable<AdminReportMessageSnapshot["attachment"]>,
    { type: "document" }
  >,
) {
  const fileBlob = new Blob(
    [`Arquivo: ${attachment.name}\n${attachment.meta}`],
    {
      type: "text/plain;charset=utf-8",
    },
  );

  return URL.createObjectURL(fileBlob);
}

function openReportDocument(
  attachment: Extract<
    NonNullable<AdminReportMessageSnapshot["attachment"]>,
    { type: "document" }
  >,
) {
  let temporaryUrl: string | null = null;
  const source = attachment.src ?? createDocumentFallbackUrl(attachment);

  if (!attachment.src) temporaryUrl = source;

  window.open(source, "_blank", "noopener,noreferrer");

  if (temporaryUrl) {
    window.setTimeout(() => URL.revokeObjectURL(temporaryUrl), 1000);
  }
}

function downloadReportDocument(
  attachment: Extract<
    NonNullable<AdminReportMessageSnapshot["attachment"]>,
    { type: "document" }
  >,
) {
  const downloadLink = document.createElement("a");
  let temporaryUrl: string | null = null;

  if (attachment.src) {
    downloadLink.href = attachment.src;
  } else {
    temporaryUrl = createDocumentFallbackUrl(attachment);
    downloadLink.href = temporaryUrl;
  }

  downloadLink.download = attachment.name;
  document.body.appendChild(downloadLink);
  downloadLink.click();
  downloadLink.remove();

  if (temporaryUrl) {
    URL.revokeObjectURL(temporaryUrl);
  }
}

function ReportAttachmentEvidence({
  attachment,
}: {
  attachment: AdminReportMessageSnapshot["attachment"];
}) {
  if (!attachment) return null;

  if (attachment.type === "image") {
    return (
      <div className="mt-2 overflow-hidden rounded-md border bg-black/5">
        {attachment.src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={attachment.src}
            alt={attachment.alt}
            className="max-h-80 w-full object-contain"
          />
        ) : (
          <div className="flex h-36 items-center justify-center gap-2 text-sm text-muted-foreground">
            <ImageIcon className="h-4 w-4" />
            Foto indisponível
          </div>
        )}
      </div>
    );
  }

  if (attachment.type === "video") {
    return (
      <div className="mt-2 overflow-hidden rounded-md border bg-black">
        {attachment.src ? (
          <video
            controls
            className="max-h-80 w-full bg-black"
            poster={attachment.thumbnail}
            src={attachment.src}
          />
        ) : (
          <div
            className="relative flex h-56 items-center justify-center bg-cover bg-center text-white"
            style={{ backgroundImage: `url(${attachment.thumbnail})` }}
          >
            <div className="absolute inset-0 bg-black/35" />
            <span className="relative flex h-12 w-12 items-center justify-center rounded-full bg-black/60">
              <Play className="h-6 w-6 fill-white" />
            </span>
            <span className="absolute bottom-3 left-3 flex items-center gap-1 rounded bg-black/70 px-2 py-1 text-xs font-medium">
              <Video className="h-3.5 w-3.5" />
              {attachment.duration}
            </span>
          </div>
        )}
      </div>
    );
  }

  if (attachment.type === "audio") {
    return (
      <div className="mt-2 rounded-md border bg-background/60 p-3">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-sm font-medium">
            <Mic className="h-4 w-4 text-primary" />
            Áudio
          </span>
          <span className="text-xs text-muted-foreground">
            {attachment.duration}
          </span>
        </div>
        {attachment.src ? (
          <audio
            controls
            controlsList="nodownload noplaybackrate"
            preload="metadata"
            className="mt-3 w-full min-w-0"
            src={attachment.src}
          />
        ) : (
          <div className="mt-3 flex h-10 items-center gap-0.5 overflow-hidden rounded bg-muted/60 px-3">
            {attachment.waveform.map((height, index) => (
              <span
                key={`report-audio-wave-${index}`}
                className="w-1 shrink-0 rounded-full bg-muted-foreground/60"
                style={{ height: `${Math.max(height * 0.7, 10)}%` }}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mt-2 flex items-center gap-3 rounded-md border bg-background/70 p-3">
      <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded bg-destructive text-[10px] font-bold text-destructive-foreground">
        <FileText className="h-4 w-4" />
        <span>{attachment.extension}</span>
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{attachment.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {attachment.meta}
        </p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => openReportDocument(attachment)}
        aria-label="Abrir documento"
      >
        <ExternalLink className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => downloadReportDocument(attachment)}
        aria-label="Baixar documento"
      >
        <Download className="h-4 w-4" />
      </Button>
    </div>
  );
}

function ReportMessageBubble({
  message,
}: {
  message: AdminReportMessageSnapshot;
}) {
  return (
    <div className={`flex ${message.isOwn ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[min(92%,34rem)] rounded-lg px-3 py-2 shadow-sm ${
          message.isOwn
            ? "rounded-br-sm bg-chat-outgoing"
            : "rounded-bl-sm bg-chat-incoming"
        }`}
      >
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold text-primary">
            {message.senderName}
          </span>
          {message.isPriority && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
              Prioritaria
            </span>
          )}
        </div>

        {message.replyTo && (
          <div className="mb-2 rounded border-l-2 border-primary/60 bg-background/55 px-2 py-1 text-xs">
            <span className="font-medium text-primary">
              {message.replyTo.senderName}
            </span>
            <p className="truncate text-muted-foreground">
              {message.replyTo.content}
            </p>
          </div>
        )}

        {message.deletedForEveryone ? (
          <p className="text-sm italic text-muted-foreground">
            Mensagem apagada
          </p>
        ) : (
          <>
            <ReportAttachmentEvidence attachment={message.attachment} />
            {message.content.trim() && (
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">
                {message.content}
              </p>
            )}
          </>
        )}

        <div className="mt-2 flex flex-wrap items-center justify-end gap-2 text-[10px] text-muted-foreground">
          {message.isEdited && !message.deletedForEveryone && (
            <span>Editada</span>
          )}
          <span>Enviada em {formatDateTime(message.timestamp)}</span>
        </div>
      </div>
    </div>
  );
}

function ReportEvidencePanel({ report }: { report: AdminReport }) {
  const evidenceMessages = report.evidenceMessages ?? [];

  return (
    <div className="overflow-hidden rounded-lg border bg-background">
      <div className="flex items-center justify-between gap-3 border-b bg-muted/45 px-3 py-2">
        <div className="min-w-0">
          <h4 className="truncate text-xs font-medium uppercase text-muted-foreground">
            {report.type === "message"
              ? "Mensagem denunciada"
              : "Print da conversa"}
          </h4>
          <p className="truncate text-sm font-semibold">{report.sourceName}</p>
        </div>
        <Badge variant="outline" className="shrink-0">
          {getReportTypeLabel(report)}
        </Badge>
      </div>

      {evidenceMessages.length === 0 ? (
        <div className="flex min-h-32 items-center justify-center px-4 py-8 text-center text-sm text-muted-foreground">
          Nenhuma mensagem foi encontrada para anexar nesta denúncia.
        </div>
      ) : (
        <div className="thin-gray-scrollbar max-h-[52dvh] space-y-2 overflow-y-auto bg-muted/25 p-3">
          {evidenceMessages.map((message) => (
            <ReportMessageBubble key={message.id} message={message} />
          ))}
        </div>
      )}
    </div>
  );
}

export function AdminPanel({
  accessRequests,
  users,
  reports,
  loans,
  serviceTickets,
  helpItems,
  extensionItems,
  onCreateUser,
  onUpdateUser,
  onToggleUserBlocked,
  onDeleteUser,
  onRejectAccessRequest,
  onMarkReportReviewed,
  onDeleteReport,
  onReopenReport,
  onResolveLoan,
  onCreateHelpItem,
  onUpdateHelpItem,
  onDeleteHelpItem,
  onMoveHelpItem,
  onMoveHelpItemImage,
  onCreateExtensionItem,
  onUpdateExtensionItem,
  onDeleteExtensionItem,
}: AdminPanelProps) {
  const [userSearch, setUserSearch] = useState("");
  const [userFormValues, setUserFormValues] =
    useState<AdminUserFormValues>(emptyUserForm);
  const [isUserFormDialogOpen, setIsUserFormDialogOpen] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] =
    useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [sourceRequest, setSourceRequest] = useState<AccessRequest | null>(
    null,
  );
  const [rejectRequest, setRejectRequest] = useState<AccessRequest | null>(
    null,
  );
  const [statusUser, setStatusUser] = useState<AdminUser | null>(null);
  const [deleteUser, setDeleteUser] = useState<AdminUser | null>(null);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState("");
  const [userPage, setUserPage] = useState(1);
  const [reportView, setReportView] = useState<ReportView>("open");
  const [loanAdminView, setLoanAdminView] = useState<LoanAdminView>("open");
  const [serviceTicketAdminView, setServiceTicketAdminView] =
    useState<ServiceTicketAdminView>("open");
  const [loanSearch, setLoanSearch] = useState("");
  const [serviceTicketSearch, setServiceTicketSearch] = useState("");
  const [reportSearch, setReportSearch] = useState("");
  const [reportPage, setReportPage] = useState(1);
  const [progressReportPage, setProgressReportPage] = useState(1);
  const [historyReportPage, setHistoryReportPage] = useState(1);
  const [selectedReport, setSelectedReport] = useState<AdminReport | null>(
    null,
  );
  const [helpTitle, setHelpTitle] = useState("");
  const [helpDraftImages, setHelpDraftImages] = useState<HelpDraftImage[]>([]);
  const [editingHelpItem, setEditingHelpItem] =
    useState<HelpContentItem | null>(null);
  const [extensionFormValues, setExtensionFormValues] =
    useState<ExtensionFormValues>(emptyExtensionForm);
  const [editingExtensionItem, setEditingExtensionItem] =
    useState<ExtensionContentItem | null>(null);
  const [contentDeleteTarget, setContentDeleteTarget] =
    useState<ContentDeleteTarget | null>(null);
  const helpImageInputRef = useRef<HTMLInputElement>(null);

  const filteredUsers = useMemo(() => {
    const normalizedSearch = userSearch.trim().toLowerCase();

    if (!normalizedSearch) return users;

    return users.filter(
      (user) =>
        user.name.toLowerCase().includes(normalizedSearch) ||
        user.email.toLowerCase().includes(normalizedSearch) ||
        user.sector.toLowerCase().includes(normalizedSearch),
    );
  }, [userSearch, users]);
  const totalUserPages = Math.max(
    1,
    Math.ceil(filteredUsers.length / USERS_PAGE_SIZE),
  );
  const currentUserPage = Math.min(userPage, totalUserPages);
  const paginatedUsers = filteredUsers.slice(
    (currentUserPage - 1) * USERS_PAGE_SIZE,
    currentUserPage * USERS_PAGE_SIZE,
  );
  const openReports = useMemo(
    () => reports.filter((report) => report.status === "new"),
    [reports],
  );
  const progressReports = useMemo(
    () => reports.filter((report) => report.status === "reviewed"),
    [reports],
  );
  const historyReports = useMemo(
    () => reports.filter((report) => report.status === "deleted"),
    [reports],
  );
  const filterReportsBySearch = useCallback(
    (reportList: AdminReport[]) => {
      const normalizedSearch = reportSearch.trim().toLowerCase();

      if (!normalizedSearch) return reportList;

      return reportList.filter((report) =>
        getReportSearchText(report).includes(normalizedSearch),
      );
    },
    [reportSearch],
  );
  const filteredOpenReports = useMemo(
    () => filterReportsBySearch(openReports),
    [filterReportsBySearch, openReports],
  );
  const filteredProgressReports = useMemo(
    () => filterReportsBySearch(progressReports),
    [filterReportsBySearch, progressReports],
  );
  const filteredHistoryReports = useMemo(
    () => filterReportsBySearch(historyReports),
    [filterReportsBySearch, historyReports],
  );
  const filteredReports =
    reportView === "open"
      ? filteredOpenReports
      : reportView === "progress"
        ? filteredProgressReports
        : filteredHistoryReports;
  const activeReportPage =
    reportView === "open"
      ? reportPage
      : reportView === "progress"
        ? progressReportPage
        : historyReportPage;
  const totalReportPages = Math.max(
    1,
    Math.ceil(filteredReports.length / REPORTS_PAGE_SIZE),
  );
  const currentReportPage = Math.min(activeReportPage, totalReportPages);
  const paginatedReports = filteredReports.slice(
    (currentReportPage - 1) * REPORTS_PAGE_SIZE,
    currentReportPage * REPORTS_PAGE_SIZE,
  );
  const currentReportEmptyState = reportViewEmptyState[reportView];
  const overdueLoans = useMemo(
    () =>
      loans
        .filter((loan) => isLoanCriticalOverdue(loan))
        .sort((firstLoan, secondLoan) =>
          firstLoan.requestedReturnDate.localeCompare(
            secondLoan.requestedReturnDate,
          ),
        ),
    [loans],
  );
  const resolvedLoanHistory = useMemo(
    () =>
      loans
        .filter((loan) => loan.status === "resolved")
        .sort(
          (firstLoan, secondLoan) =>
            (secondLoan.resolvedAt?.getTime() ?? 0) -
            (firstLoan.resolvedAt?.getTime() ?? 0),
        ),
    [loans],
  );
  const filterLoansBySearch = useCallback(
    (loanList: LoanRequest[]) => {
      const normalizedSearch = loanSearch.trim().toLowerCase();

      if (!normalizedSearch) return loanList;

      return loanList.filter((loan) =>
        getLoanAdminSearchText(loan).includes(normalizedSearch),
      );
    },
    [loanSearch],
  );
  const filteredOverdueLoans = useMemo(
    () => filterLoansBySearch(overdueLoans),
    [filterLoansBySearch, overdueLoans],
  );
  const filteredResolvedLoanHistory = useMemo(
    () => filterLoansBySearch(resolvedLoanHistory),
    [filterLoansBySearch, resolvedLoanHistory],
  );
  const staleServiceTickets = useMemo(
    () =>
      serviceTickets
        .filter((ticket) => isServiceTicketWithoutInteraction(ticket))
        .sort(
          (firstTicket, secondTicket) =>
            firstTicket.lastInteractionAt.getTime() -
            secondTicket.lastInteractionAt.getTime(),
        ),
    [serviceTickets],
  );
  const completedServiceTicketHistory = useMemo(
    () =>
      serviceTickets
        .filter((ticket) => ticket.status === "completed")
        .sort(
          (firstTicket, secondTicket) =>
            (secondTicket.closedAt?.getTime() ??
              secondTicket.lastInteractionAt.getTime()) -
            (firstTicket.closedAt?.getTime() ??
              firstTicket.lastInteractionAt.getTime()),
        ),
    [serviceTickets],
  );
  const filterServiceTicketsBySearch = useCallback(
    (ticketList: ServiceTicket[]) => {
      const normalizedSearch = serviceTicketSearch.trim().toLowerCase();

      if (!normalizedSearch) return ticketList;

      return ticketList.filter((ticket) =>
        getServiceTicketAdminSearchText(ticket).includes(normalizedSearch),
      );
    },
    [serviceTicketSearch],
  );
  const filteredStaleServiceTickets = useMemo(
    () => filterServiceTicketsBySearch(staleServiceTickets),
    [filterServiceTicketsBySearch, staleServiceTickets],
  );
  const filteredCompletedServiceTicketHistory = useMemo(
    () => filterServiceTicketsBySearch(completedServiceTicketHistory),
    [filterServiceTicketsBySearch, completedServiceTicketHistory],
  );
  const setActiveReportPage = (nextPage: (currentPage: number) => number) => {
    if (reportView === "open") {
      setReportPage(nextPage);
    } else if (reportView === "progress") {
      setProgressReportPage(nextPage);
    } else {
      setHistoryReportPage(nextPage);
    }
  };

  const openBlankUserForm = () => {
    setEditingUser(null);
    setSourceRequest(null);
    setIsPasswordVisible(false);
    setIsConfirmPasswordVisible(false);
    setUserFormValues(emptyUserForm);
    setIsUserFormDialogOpen(true);
  };

  const openRequestUserForm = (request: AccessRequest) => {
    setEditingUser(null);
    setSourceRequest(request);
    setIsPasswordVisible(false);
    setIsConfirmPasswordVisible(false);
    setUserFormValues({
      name: request.name,
      email: request.email,
      sector: request.sector,
      password: request.cpf,
      confirmPassword: request.cpf,
      isAdmin: false,
    });
    setIsUserFormDialogOpen(true);
  };

  const openEditUserForm = (user: AdminUser) => {
    setSourceRequest(null);
    setEditingUser(user);
    setIsPasswordVisible(false);
    setIsConfirmPasswordVisible(false);
    setUserFormValues({
      name: user.name,
      email: user.email,
      sector: user.sector,
      password: user.password,
      confirmPassword: user.password,
      isAdmin: user.isAdmin,
    });
    setIsUserFormDialogOpen(true);
  };

  const closeUserForm = () => {
    setIsUserFormDialogOpen(false);
    setEditingUser(null);
    setSourceRequest(null);
    setIsPasswordVisible(false);
    setIsConfirmPasswordVisible(false);
    setUserFormValues(emptyUserForm);
  };

  const resetHelpContentForm = () => {
    setEditingHelpItem(null);
    setHelpTitle("");
    setHelpDraftImages([]);

    if (helpImageInputRef.current) {
      helpImageInputRef.current.value = "";
    }
  };

  const openEditHelpItemForm = (item: HelpContentItem) => {
    setEditingHelpItem(item);
    setHelpTitle(item.title);
    setHelpDraftImages(item.images.map((image) => ({ ...image })));

    if (helpImageInputRef.current) {
      helpImageInputRef.current.value = "";
    }
  };

  const resetExtensionContentForm = () => {
    setEditingExtensionItem(null);
    setExtensionFormValues(emptyExtensionForm);
  };

  const openEditExtensionItemForm = (item: ExtensionContentItem) => {
    setEditingExtensionItem(item);
    setExtensionFormValues({
      name: item.name,
      sector: item.sector,
      extension: item.extension,
    });
  };

  const moveHelpDraftImage = (imageId: string, direction: -1 | 1) => {
    setHelpDraftImages((currentImages) => {
      const imageIndex = currentImages.findIndex(
        (image) => image.id === imageId,
      );
      const nextIndex = imageIndex + direction;

      if (
        imageIndex === -1 ||
        nextIndex < 0 ||
        nextIndex >= currentImages.length
      ) {
        return currentImages;
      }

      const nextImages = [...currentImages];
      const [movedImage] = nextImages.splice(imageIndex, 1);

      nextImages.splice(nextIndex, 0, movedImage);

      return nextImages;
    });
  };

  const removeHelpDraftImage = (imageId: string) => {
    setHelpDraftImages((currentImages) =>
      currentImages.filter((image) => image.id !== imageId),
    );
  };

  const handleHelpImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);

    if (files.length === 0) return;

    const imageFiles = files.filter((file) => file.type.startsWith("image/"));

    if (imageFiles.length !== files.length) {
      toast.error("Selecione apenas arquivos de imagem.");
      event.target.value = "";
      return;
    }

    const { acceptedFiles, rejectedFiles } = splitFilesByUploadSize(imageFiles);

    if (rejectedFiles.length > 0) {
      toast.error("Arquivo acima de 16 MB.", {
        description: getUploadSizeLimitMessage(rejectedFiles.length),
      });
    }

    if (acceptedFiles.length === 0) {
      event.target.value = "";
      return;
    }

    Promise.all(
      acceptedFiles.map(
        (file) =>
          new Promise<HelpDraftImage>((resolve) => {
            const reader = new FileReader();

            reader.onload = () =>
              resolve({
                id: `draft-help-image-${file.name}-${file.lastModified}-${crypto.randomUUID()}`,
                name: file.name,
                src: String(reader.result ?? ""),
              });
            reader.readAsDataURL(file);
          }),
      ),
    ).then((images) => {
      setHelpDraftImages((currentImages) => [...currentImages, ...images]);
    });

    event.target.value = "";
  };

  const handleHelpContentSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const title = helpTitle.trim();

    if (!title) {
      toast.error("Digite o título da publicação.");
      return;
    }

    if (helpDraftImages.length === 0) {
      toast.error("Selecione pelo menos uma imagem.");
      return;
    }

    if (editingHelpItem) {
      onUpdateHelpItem(editingHelpItem.id, { title, images: helpDraftImages });
      toast.success("Publicação atualizada.");
    } else {
      onCreateHelpItem({ title, images: helpDraftImages });
      toast.success("Publicação adicionada.");
    }

    resetHelpContentForm();
  };

  const handleExtensionContentSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const name = extensionFormValues.name.trim();
    const sector = extensionFormValues.sector.trim();
    const extension = extensionFormValues.extension.trim();

    if (!name || !sector || !extension) {
      toast.error("Preencha nome, setor e ramal.");
      return;
    }

    if (editingExtensionItem) {
      onUpdateExtensionItem(editingExtensionItem.id, {
        name,
        sector,
        extension,
      });
      toast.success("Ramal atualizado.");
    } else {
      onCreateExtensionItem({ name, sector, extension });
      toast.success("Ramal adicionado.");
    }

    resetExtensionContentForm();
  };

  const handleUserFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedEmail = userFormValues.email.trim().toLowerCase();

    if (!userFormValues.name.trim()) {
      toast.error("Digite o nome do usuário.");
      return;
    }

    if (!isUniparEmail(normalizedEmail)) {
      toast.error("Use um e-mail institucional @unipar.br.");
      return;
    }

    if (!userFormValues.sector) {
      toast.error("Selecione o setor.");
      return;
    }

    if (!userFormValues.password.trim()) {
      toast.error("Digite a senha.");
      return;
    }

    if (userFormValues.password !== userFormValues.confirmPassword) {
      toast.error("A confirmação de senha precisa ser igual à senha.");
      return;
    }

    const emailAlreadyExists = users.some(
      (user) =>
        user.email.toLowerCase() === normalizedEmail &&
        user.id !== editingUser?.id,
    );

    if (emailAlreadyExists) {
      toast.error("Já existe um usuário com esse e-mail.");
      return;
    }

    const payload = {
      name: userFormValues.name.trim(),
      email: normalizedEmail,
      sector: userFormValues.sector,
      password: userFormValues.password,
      isAdmin: userFormValues.isAdmin,
    };

    if (editingUser) {
      onUpdateUser(editingUser.id, payload);
      toast.success("Usuário atualizado.");
    } else {
      onCreateUser(payload, sourceRequest?.id);
      toast.success("Usuário criado.");
    }

    closeUserForm();
  };

  const confirmRejectRequest = () => {
    if (!rejectRequest) return;

    onRejectAccessRequest(rejectRequest.id);
    setRejectRequest(null);
    toast.success("Solicitação rejeitada.");
  };

  const confirmToggleStatus = () => {
    if (!statusUser) return;

    onToggleUserBlocked(statusUser.id);
    toast.success(
      statusUser.status === "blocked"
        ? "Usuário desbloqueado."
        : "Usuário bloqueado.",
    );
    setStatusUser(null);
  };

  const confirmDeleteUser = () => {
    if (!deleteUser) return;

    if (deleteConfirmationText !== "DELETAR") {
      toast.error("Digite DELETAR para confirmar.");
      return;
    }

    onDeleteUser(deleteUser.id);
    setDeleteUser(null);
    setDeleteConfirmationText("");
    toast.success("Usuário apagado.");
  };

  const confirmContentDelete = () => {
    if (!contentDeleteTarget) return;

    if (contentDeleteTarget.type === "help-draft-image") {
      removeHelpDraftImage(contentDeleteTarget.image.id);
      toast.success("Foto removida.");
    } else if (contentDeleteTarget.type === "help-item") {
      onDeleteHelpItem(contentDeleteTarget.item.id);

      if (editingHelpItem?.id === contentDeleteTarget.item.id) {
        resetHelpContentForm();
      }
      toast.success("Publicação removida.");
    } else if (contentDeleteTarget.type === "extension-item") {
      onDeleteExtensionItem(contentDeleteTarget.item.id);

      if (editingExtensionItem?.id === contentDeleteTarget.item.id) {
        resetExtensionContentForm();
      }
      toast.success("Ramal removido.");
    } else {
      onDeleteReport(contentDeleteTarget.report.id);
      setSelectedReport(null);
      setHistoryReportPage(1);
      toast.success("Denúncia movida para o histórico.");
    }

    setContentDeleteTarget(null);
  };

  const handleMarkReportReviewed = (report: AdminReport) => {
    if (report.status === "reviewed" || report.status === "deleted") return;

    onMarkReportReviewed(report.id);
    toast.success("Denuncia movida para andamento.");
    setProgressReportPage(1);
    setSelectedReport((currentReport) =>
      currentReport?.id === report.id
        ? { ...currentReport, status: "reviewed" }
        : currentReport,
    );
  };

  const handleDeleteReport = (report: AdminReport) => {
    setContentDeleteTarget({ type: "report", report });
  };

  const handleReopenReport = (report: AdminReport) => {
    onReopenReport(report.id);
    setSelectedReport(null);
    setReportView("open");
    setReportPage(1);
    toast.success("Denuncia reaberta.");
  };

  const contentDeleteDialog =
    contentDeleteTarget?.type === "help-draft-image"
      ? {
          title: "Remover foto?",
          description: `A foto "${contentDeleteTarget.image.name}" será removida desta publicação.`,
          confirmLabel: "Remover foto",
        }
      : contentDeleteTarget?.type === "help-item"
        ? {
            title: "Apagar publicação?",
            description: `A publicação "${contentDeleteTarget.item.title}" será apagada da página de Ajuda.`,
            confirmLabel: "Apagar publicação",
          }
        : contentDeleteTarget?.type === "extension-item"
          ? {
              title: "Apagar ramal?",
              description: `O ramal de ${contentDeleteTarget.item.name} será apagado da página de Ramais.`,
              confirmLabel: "Apagar ramal",
            }
          : contentDeleteTarget?.type === "report"
            ? {
                title: "Mover denúncia para histórico?",
                description:
                  "A denúncia sairá da lista atual e ficará no histórico.",
                confirmLabel: "Mover para histórico",
              }
            : null;

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
      <Dialog
        open={isUserFormDialogOpen}
        onOpenChange={(open) => !open && closeUserForm()}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingUser ? "Editar usuário" : "Criar usuário"}
            </DialogTitle>
          </DialogHeader>

          <form className="space-y-4" onSubmit={handleUserFormSubmit}>
            <div className="grid gap-2">
              <Label htmlFor="admin-user-name">Nome</Label>
              <Input
                id="admin-user-name"
                value={userFormValues.name}
                onChange={(event) =>
                  setUserFormValues((currentValues) => ({
                    ...currentValues,
                    name: event.target.value,
                  }))
                }
                className="h-10 bg-muted"
                placeholder="Nome completo"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="admin-user-email">E-mail</Label>
              <Input
                id="admin-user-email"
                type="email"
                value={userFormValues.email}
                onChange={(event) =>
                  setUserFormValues((currentValues) => ({
                    ...currentValues,
                    email: event.target.value,
                  }))
                }
                className="h-10 bg-muted"
                placeholder="nome@unipar.br"
              />
            </div>

            <div className="grid gap-2">
              <Label>Setor</Label>
              <SectorCombobox
                value={userFormValues.sector}
                onValueChange={(value) =>
                  setUserFormValues((currentValues) => ({
                    ...currentValues,
                    sector: value as Sector,
                  }))
                }
                options={legacySectorComboboxOptions}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="admin-user-password">Senha</Label>
                <div className="relative">
                  <Input
                    id="admin-user-password"
                    type={isPasswordVisible ? "text" : "password"}
                    value={userFormValues.password}
                    onChange={(event) =>
                      setUserFormValues((currentValues) => ({
                        ...currentValues,
                        password: event.target.value,
                      }))
                    }
                    className="h-10 bg-muted pr-10"
                    placeholder="Senha"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() =>
                      setIsPasswordVisible((isVisible) => !isVisible)
                    }
                    aria-label={
                      isPasswordVisible ? "Ocultar senha" : "Mostrar senha"
                    }
                  >
                    {isPasswordVisible ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="admin-user-confirm-password">
                  Confirmação de senha
                </Label>
                <div className="relative">
                  <Input
                    id="admin-user-confirm-password"
                    type={isConfirmPasswordVisible ? "text" : "password"}
                    value={userFormValues.confirmPassword}
                    onChange={(event) =>
                      setUserFormValues((currentValues) => ({
                        ...currentValues,
                        confirmPassword: event.target.value,
                      }))
                    }
                    className="h-10 bg-muted pr-10"
                    placeholder="Repita a senha"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() =>
                      setIsConfirmPasswordVisible((isVisible) => !isVisible)
                    }
                    aria-label={
                      isConfirmPasswordVisible
                        ? "Ocultar confirmação de senha"
                        : "Mostrar confirmação de senha"
                    }
                  >
                    {isConfirmPasswordVisible ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>

            <label className="flex items-center gap-3 rounded-lg border bg-muted/40 px-3 py-3">
              <Checkbox
                checked={userFormValues.isAdmin}
                onCheckedChange={(checked) =>
                  setUserFormValues((currentValues) => ({
                    ...currentValues,
                    isAdmin: checked === true,
                  }))
                }
              />
              <span className="text-sm font-medium">Usuário administrador</span>
            </label>

            <div className="-mx-4 -mb-4 flex justify-end gap-2 border-t bg-muted/50 p-4">
              <Button type="button" variant="ghost" onClick={closeUserForm}>
                Cancelar
              </Button>
              <Button type="submit">
                {editingUser ? "Salvar alterações" : "Criar usuário"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(rejectRequest)}
        onOpenChange={(open) => !open && setRejectRequest(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rejeitar solicitação?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            A solicitação de {rejectRequest?.name} será marcada como rejeitada.
          </p>
          <div className="-mx-4 -mb-4 flex justify-end gap-2 border-t bg-muted/50 p-4">
            <Button variant="ghost" onClick={() => setRejectRequest(null)}>
              Cancelar
            </Button>
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={confirmRejectRequest}
            >
              Rejeitar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(statusUser)}
        onOpenChange={(open) => !open && setStatusUser(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {statusUser?.status === "blocked"
                ? "Desbloquear usuário?"
                : "Bloquear usuário?"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {statusUser?.status === "blocked"
              ? "O usuário voltará a ficar ativo no sistema."
              : "O usuário ficará bloqueado até ser desbloqueado novamente."}
          </p>
          <div className="-mx-4 -mb-4 flex justify-end gap-2 border-t bg-muted/50 p-4">
            <Button variant="ghost" onClick={() => setStatusUser(null)}>
              Cancelar
            </Button>
            <Button onClick={confirmToggleStatus}>
              {statusUser?.status === "blocked" ? "Desbloquear" : "Bloquear"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteUser)}
        onOpenChange={(open) => {
          if (open) return;
          setDeleteUser(null);
          setDeleteConfirmationText("");
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Apagar usuário?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Essa ação remove {deleteUser?.name} da lista de usuários. Para
              confirmar, digite DELETAR.
            </p>
            <Input
              value={deleteConfirmationText}
              onChange={(event) =>
                setDeleteConfirmationText(event.target.value)
              }
              placeholder="DELETAR"
              className="h-10 bg-muted"
            />
          </div>
          <div className="-mx-4 -mb-4 flex justify-end gap-2 border-t bg-muted/50 p-4">
            <Button
              variant="ghost"
              onClick={() => {
                setDeleteUser(null);
                setDeleteConfirmationText("");
              }}
            >
              Cancelar
            </Button>
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              disabled={deleteConfirmationText !== "DELETAR"}
              onClick={confirmDeleteUser}
            >
              Apagar usuário
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(contentDeleteTarget)}
        onOpenChange={(open) => !open && setContentDeleteTarget(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{contentDeleteDialog?.title}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {contentDeleteDialog?.description}
          </p>
          <div className="-mx-4 -mb-4 flex justify-end gap-2 border-t bg-muted/50 p-4">
            <Button
              variant="ghost"
              onClick={() => setContentDeleteTarget(null)}
            >
              Cancelar
            </Button>
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={confirmContentDelete}
            >
              {contentDeleteDialog?.confirmLabel}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(selectedReport)}
        onOpenChange={(open) => !open && setSelectedReport(null)}
      >
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Detalhes da denúncia</DialogTitle>
          </DialogHeader>
          {selectedReport && (
            <div className="space-y-4">
              <div className="grid gap-3 rounded-lg border bg-muted/35 p-3 md:grid-cols-[1fr_auto] md:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate font-semibold">
                      {selectedReport.sourceName}
                    </h3>
                    <Badge variant="outline">
                      {getReportTypeLabel(selectedReport)}
                    </Badge>
                    <Badge
                      variant={getReportStatusVariant(selectedReport.status)}
                    >
                      {getReportStatusLabel(selectedReport.status)}
                    </Badge>
                  </div>
                  <p className="mt-1 truncate text-sm text-muted-foreground">
                    {selectedReport.sourceEmail}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <CalendarClock className="h-4 w-4" />
                  {formatDateTime(selectedReport.createdAt)}
                </div>
              </div>

              {selectedReport.evidenceMessages ? (
                <ReportEvidencePanel report={selectedReport} />
              ) : selectedReport.messagePreview ? (
                <div className="rounded-lg border bg-background p-3">
                  <h4 className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                    Mensagem denunciada
                  </h4>
                  <p className="whitespace-pre-wrap break-words text-sm">
                    {selectedReport.messagePreview}
                  </p>
                </div>
              ) : null}

              <div className="rounded-lg border bg-background p-3">
                <h4 className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                  Informação da denúncia
                </h4>
                <p className="whitespace-pre-wrap break-words text-sm leading-6">
                  {selectedReport.description}
                </p>
              </div>

              <div className="-mx-4 -mb-4 flex flex-col gap-2 border-t bg-muted/50 p-4 sm:flex-row sm:justify-end">
                {selectedReport.status === "deleted" ? (
                  <Button onClick={() => handleReopenReport(selectedReport)}>
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Reabrir denúncia
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      disabled={selectedReport.status === "reviewed"}
                      onClick={() => handleMarkReportReviewed(selectedReport)}
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      {selectedReport.status === "reviewed"
                        ? "Em andamento"
                        : "Mover para andamento"}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => handleDeleteReport(selectedReport)}
                    >
                      <ClipboardList className="mr-2 h-4 w-4" />
                      Mover para histórico
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Tabs
        defaultValue="loans"
        className="min-h-0 flex-1 gap-0 overflow-hidden rounded-lg border bg-background"
      >
        <TabsList
          variant="line"
          className="thin-gray-scrollbar flex h-11 min-h-11 w-full max-w-full justify-start gap-1 overflow-x-auto overflow-y-hidden rounded-none border-b bg-background px-3 py-1"
        >
              <TabsTrigger
                value="loans"
                className="h-8 min-w-max flex-none justify-center gap-1.5 px-3 text-xs !border-transparent !bg-transparent !shadow-none after:!hidden hover:!bg-transparent focus-visible:!border-transparent focus-visible:!ring-0 focus-visible:!outline-none data-active:!border-transparent data-active:!bg-transparent data-active:!text-foreground data-active:!shadow-none data-[state=active]:!border-transparent data-[state=active]:!bg-transparent data-[state=active]:!text-foreground data-[state=active]:!shadow-none sm:text-sm dark:data-active:!border-transparent dark:data-active:!bg-transparent dark:data-active:!text-foreground dark:data-[state=active]:!border-transparent dark:data-[state=active]:!bg-transparent dark:data-[state=active]:!text-foreground"
              >
                <HandCoins className="h-4 w-4" />
                <span className="truncate">Empréstimos</span>
              </TabsTrigger>
              <TabsTrigger
                value="service-tickets"
                className="h-8 min-w-max flex-none justify-center gap-1.5 px-3 text-xs !border-transparent !bg-transparent !shadow-none after:!hidden hover:!bg-transparent focus-visible:!border-transparent focus-visible:!ring-0 focus-visible:!outline-none data-active:!border-transparent data-active:!bg-transparent data-active:!text-foreground data-active:!shadow-none data-[state=active]:!border-transparent data-[state=active]:!bg-transparent data-[state=active]:!text-foreground data-[state=active]:!shadow-none sm:text-sm dark:data-active:!border-transparent dark:data-active:!bg-transparent dark:data-active:!text-foreground dark:data-[state=active]:!border-transparent dark:data-[state=active]:!bg-transparent dark:data-[state=active]:!text-foreground"
              >
                <Headphones className="h-4 w-4" />
                <span className="truncate">Atendimentos</span>
              </TabsTrigger>
              <TabsTrigger
                value="reports"
                className="h-8 min-w-max flex-none justify-center gap-1.5 px-3 text-xs !border-transparent !bg-transparent !shadow-none after:!hidden hover:!bg-transparent focus-visible:!border-transparent focus-visible:!ring-0 focus-visible:!outline-none data-active:!border-transparent data-active:!bg-transparent data-active:!text-foreground data-active:!shadow-none data-[state=active]:!border-transparent data-[state=active]:!bg-transparent data-[state=active]:!text-foreground data-[state=active]:!shadow-none sm:text-sm dark:data-active:!border-transparent dark:data-active:!bg-transparent dark:data-active:!text-foreground dark:data-[state=active]:!border-transparent dark:data-[state=active]:!bg-transparent dark:data-[state=active]:!text-foreground"
              >
                <AlertTriangle className="h-4 w-4" />
                <span className="truncate">Denúncias</span>
              </TabsTrigger>
              <TabsTrigger
                value="content"
                className="h-8 min-w-max flex-none justify-center gap-1.5 px-3 text-xs !border-transparent !bg-transparent !shadow-none after:!hidden hover:!bg-transparent focus-visible:!border-transparent focus-visible:!ring-0 focus-visible:!outline-none data-active:!border-transparent data-active:!bg-transparent data-active:!text-foreground data-active:!shadow-none data-[state=active]:!border-transparent data-[state=active]:!bg-transparent data-[state=active]:!text-foreground data-[state=active]:!shadow-none sm:text-sm dark:data-active:!border-transparent dark:data-active:!bg-transparent dark:data-active:!text-foreground dark:data-[state=active]:!border-transparent dark:data-[state=active]:!bg-transparent dark:data-[state=active]:!text-foreground"
              >
                <ImageIcon className="h-4 w-4" />
                <span className="truncate">Conteúdo</span>
              </TabsTrigger>
        </TabsList>

            <TabsContent
              value="users"
              className="m-0 min-h-0 min-w-0 overflow-y-auto p-3"
            >
              <div className="grid min-w-0 gap-3 sm:gap-4 xl:h-full xl:grid-cols-[minmax(18rem,26rem)_1fr]">
                <section className="flex max-h-[30rem] min-h-0 min-w-0 flex-col rounded-lg border bg-card xl:max-h-none">
                  <div className="flex flex-col justify-center border-b px-4 py-3 xl:h-20">
                    <h2 className="font-semibold text-foreground">
                      Solicitações de acesso
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Pedidos recebidos pelo formulário de login.
                    </p>
                  </div>

                  <div className="thin-gray-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
                    {accessRequests.length === 0 ? (
                      <div className="flex min-h-64 flex-col items-center justify-center px-4 text-center">
                        <ClipboardList className="h-10 w-10 text-muted-foreground" />
                        <h3 className="mt-4 text-base font-semibold">
                          Nenhuma solicitação
                        </h3>
                        <p className="mt-1 max-w-md text-sm text-muted-foreground">
                          Quando alguém solicitar acesso, o pedido aparecerá
                          aqui.
                        </p>
                      </div>
                    ) : (
                      <div className="grid gap-3">
                        {accessRequests.map((request) => (
                          <article
                            key={request.id}
                            className="rounded-lg border bg-background p-3"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="min-w-0 flex-1 break-words font-semibold">
                                {request.name}
                              </h3>
                              <Badge
                                variant={getRequestStatusVariant(
                                  request.status,
                                )}
                              >
                                {getRequestStatusLabel(request.status)}
                              </Badge>
                            </div>

                            <div className="mt-3 grid gap-1 text-sm text-muted-foreground">
                              <span className="flex min-w-0 items-center gap-2">
                                <Mail className="h-4 w-4 shrink-0" />
                                <span className="truncate">
                                  {request.email}
                                </span>
                              </span>
                              <span>Setor: {request.sector}</span>
                              <span>CPF: {formatCpf(request.cpf)}</span>
                              <span>
                                Recebida em {formatDateTime(request.createdAt)}
                              </span>
                            </div>

                            {request.status === "pending" && (
                              <div className="mt-3 grid grid-cols-2 gap-2">
                                <Button
                                  variant="outline"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => setRejectRequest(request)}
                                >
                                  Rejeitar
                                </Button>
                                <Button
                                  onClick={() => openRequestUserForm(request)}
                                >
                                  Criar usuário
                                </Button>
                              </div>
                            )}
                          </article>
                        ))}
                      </div>
                    )}
                  </div>
                </section>

                <section className="flex min-h-0 min-w-0 flex-col rounded-lg border bg-card">
                  <div className="flex flex-col gap-3 border-b px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <h2 className="font-semibold text-foreground">
                        Usuários criados
                      </h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Busque, edite, bloqueie ou remova usuários.
                      </p>
                    </div>
                    <Button
                      className="w-full lg:w-auto"
                      onClick={openBlankUserForm}
                    >
                      <UserPlus className="mr-2 h-4 w-4" />
                      Criar usuário
                    </Button>
                  </div>

                  <div className="border-b p-3">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={userSearch}
                        onChange={(event) => {
                          setUserSearch(event.target.value);
                          setUserPage(1);
                        }}
                        placeholder="Buscar usuário por nome, e-mail ou setor"
                        className="h-10 bg-muted pl-10"
                      />
                    </div>
                  </div>

                  <div className="thin-gray-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
                    {filteredUsers.length === 0 ? (
                      <div className="flex min-h-64 flex-col items-center justify-center px-4 text-center">
                        <UserCog className="h-10 w-10 text-muted-foreground" />
                        <h3 className="mt-4 text-base font-semibold">
                          Nenhum usuário encontrado
                        </h3>
                        <p className="mt-1 max-w-md text-sm text-muted-foreground">
                          Crie um usuário manualmente ou aprove uma solicitação
                          de acesso.
                        </p>
                      </div>
                    ) : (
                      <div className="grid gap-3">
                        {paginatedUsers.map((user) => (
                          <article
                            key={user.id}
                            className="thin-gray-scrollbar overflow-x-auto rounded-lg border bg-background p-3"
                          >
                            <div className="grid min-w-[62rem] grid-cols-[minmax(10rem,1.2fr)_minmax(15rem,1.5fr)_minmax(6rem,.7fr)_minmax(8rem,.8fr)_5rem_6.5rem_2.25rem] items-center gap-3">
                              <h3 className="truncate font-semibold">
                                {user.name}
                              </h3>
                              <span className="truncate text-sm text-muted-foreground">
                                {user.email}
                              </span>
                              <span className="truncate text-sm text-muted-foreground">
                                {user.sector}
                              </span>
                              <span className="truncate text-sm text-muted-foreground">
                                {formatDateOnly(user.createdAt)}
                              </span>
                              <Badge
                                variant={user.isAdmin ? "default" : "secondary"}
                                className="w-20 justify-center"
                              >
                                {user.isAdmin ? "Admin" : "User"}
                              </Badge>
                              <Badge
                                variant={
                                  user.status === "blocked"
                                    ? "destructive"
                                    : "outline"
                                }
                                className="w-[6.5rem] justify-center"
                              >
                                {user.status === "blocked"
                                  ? "Bloqueado"
                                  : "Ativo"}
                              </Badge>

                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="ml-auto h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground"
                                    aria-label={`Abrir ações de ${user.name}`}
                                  >
                                    <MoreVertical className="h-5 w-5" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                  align="end"
                                  className="min-w-44"
                                >
                                  <DropdownMenuItem
                                    onClick={() => openEditUserForm(user)}
                                  >
                                    <Edit3 className="h-4 w-4" />
                                    Editar
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => setStatusUser(user)}
                                  >
                                    <Ban className="h-4 w-4" />
                                    {user.status === "blocked"
                                      ? "Desbloquear"
                                      : "Bloquear"}
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    variant="destructive"
                                    onClick={() => setDeleteUser(user)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                    Apagar
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </article>
                        ))}
                      </div>
                    )}
                  </div>
                  {filteredUsers.length > 0 && (
                    <div className="flex flex-col gap-2 border-t px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-sm text-muted-foreground">
                        Página {currentUserPage} de {totalUserPages} •{" "}
                        {filteredUsers.length} usuário
                        {filteredUsers.length === 1 ? "" : "s"}
                      </span>
                      <div className="grid grid-cols-2 gap-2 sm:flex">
                        <Button
                          variant="outline"
                          disabled={currentUserPage === 1}
                          onClick={() =>
                            setUserPage((currentPage) =>
                              Math.max(1, currentPage - 1),
                            )
                          }
                        >
                          Anterior
                        </Button>
                        <Button
                          variant="outline"
                          disabled={currentUserPage === totalUserPages}
                          onClick={() =>
                            setUserPage((currentPage) =>
                              Math.min(totalUserPages, currentPage + 1),
                            )
                          }
                        >
                          Próxima
                        </Button>
                      </div>
                    </div>
                  )}
                </section>
              </div>
            </TabsContent>

            <TabsContent
              value="loans"
              className="m-0 min-h-0 min-w-0 overflow-hidden p-3"
            >
              <section className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-card">
                <div className="flex flex-col gap-3 border-b px-3 py-3 sm:px-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h2 className="font-semibold text-foreground">
                      {loanAdminView === "open"
                        ? "Empréstimos críticos"
                        : "Histórico de resolvidos"}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {loanAdminView === "open"
                        ? "Aparece aqui apenas depois de 3 dias de atraso na data de devolução atual."
                        : "Empréstimos críticos marcados como resolvidos."}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-5 text-sm font-medium">
                    <button
                      type="button"
                      className={`bg-transparent p-0 transition-colors hover:text-foreground ${
                        loanAdminView === "open"
                          ? "font-semibold text-foreground"
                          : "text-muted-foreground"
                      }`}
                      onClick={() => setLoanAdminView("open")}
                    >
                      Em aberto
                    </button>
                    <button
                      type="button"
                      className={`bg-transparent p-0 transition-colors hover:text-foreground ${
                        loanAdminView === "history"
                          ? "font-semibold text-foreground"
                          : "text-muted-foreground"
                      }`}
                      onClick={() => setLoanAdminView("history")}
                    >
                      Histórico
                    </button>
                  </div>
                </div>

                <div className="border-b p-3">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={loanSearch}
                      onChange={(event) => setLoanSearch(event.target.value)}
                      placeholder="Buscar empréstimo por título, setor ou responsável"
                      className="h-10 bg-muted pl-10"
                    />
                  </div>
                </div>

                <div className="thin-gray-scrollbar min-h-0 flex-1 overflow-y-auto p-2 sm:p-3">
                  {loanAdminView === "open" ? (
                    filteredOverdueLoans.length === 0 ? (
                      <div className="flex min-h-44 flex-col items-center justify-center rounded-lg border bg-background px-4 py-8 text-center sm:min-h-56">
                        <HandCoins className="h-10 w-10 text-muted-foreground" />
                        <h3 className="mt-4 text-base font-semibold">
                          {loanSearch.trim()
                            ? "Nenhum empréstimo encontrado"
                            : "Nenhum empréstimo crítico"}
                        </h3>
                        <p className="mt-1 max-w-md text-sm text-muted-foreground">
                          {loanSearch.trim()
                            ? "Tente buscar por título, pessoa, setor, patrimônio ou data."
                            : "Empréstimos devolvidos somem daqui. Se a devolução for adiada, o prazo passa a contar pela nova data."}
                        </p>
                      </div>
                    ) : (
                      <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
                        {filteredOverdueLoans.map((loan) => (
                          <article
                            key={loan.id}
                            className="flex min-w-0 flex-col rounded-lg border bg-background p-3"
                          >
                            <div className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between">
                              <div className="min-w-0">
                                <h3 className="break-words font-semibold">
                                  {loan.title}
                                </h3>
                                <p className="mt-1 break-words text-sm text-muted-foreground">
                                  {loan.description || "Sem descrição."}
                                </p>
                              </div>
                              <Badge
                                variant="destructive"
                                className="w-fit shrink-0"
                              >
                                {getLoanOverdueDays(loan)} dias em atraso
                              </Badge>
                            </div>

                            <div className="mt-4 grid gap-2 text-sm">
                              <p>
                                <strong>Com o material:</strong>{" "}
                                {loan.requesterName} • {loan.requesterSector}
                              </p>
                              <p>
                                <strong>Setor que emprestou:</strong>{" "}
                                {loan.lenderSector}
                              </p>
                              {loan.approvedByName && (
                                <p>
                                  <strong>Liberado por:</strong>{" "}
                                  {loan.approvedByName} •{" "}
                                  {loan.approvedBySector}
                                </p>
                              )}
                              {loan.patrimonyNumber && (
                                <p>
                                  <strong>Patrimônio:</strong>{" "}
                                  {loan.patrimonyNumber}
                                </p>
                              )}
                              <p>
                                <strong>Devolução prevista:</strong>{" "}
                                {formatLoanDate(loan.requestedReturnDate)}
                              </p>
                              <p className="text-muted-foreground">
                                Solicitado em {formatDateTime(loan.createdAt)}
                              </p>
                              {loan.approvedAt && (
                                <p className="text-muted-foreground">
                                  Liberado em {formatDateTime(loan.approvedAt)}
                                </p>
                              )}
                            </div>

                            <div className="mt-4 flex border-t pt-3 sm:justify-end">
                              <Button
                                type="button"
                                size="sm"
                                className="w-full sm:w-auto"
                                onClick={() => onResolveLoan(loan.id)}
                              >
                                <CheckCircle2 className="mr-1 h-4 w-4" />
                                Marcar resolvido
                              </Button>
                            </div>
                          </article>
                        ))}
                      </div>
                    )
                  ) : filteredResolvedLoanHistory.length === 0 ? (
                    <div className="flex min-h-44 items-center justify-center rounded-lg border bg-background px-4 py-8 text-center text-sm text-muted-foreground sm:min-h-56">
                      {loanSearch.trim()
                        ? "Nenhum empréstimo encontrado para essa busca."
                        : "Nenhum empréstimo resolvido ainda."}
                    </div>
                  ) : (
                    <div className="grid gap-2">
                      {filteredResolvedLoanHistory.map((loan) => (
                        <article
                          key={loan.id}
                          className="grid min-w-0 gap-3 rounded-lg border bg-background p-3 text-sm md:grid-cols-[minmax(12rem,1fr)_minmax(10rem,.8fr)_minmax(10rem,.8fr)_auto]"
                        >
                          <div className="min-w-0">
                            <p className="break-words font-semibold">
                              {loan.title}
                            </p>
                            <p className="mt-1 text-muted-foreground">
                              {loan.requesterName} • {loan.requesterSector}
                            </p>
                          </div>
                          <p>
                            <strong>Devolução:</strong>{" "}
                            {formatLoanDate(loan.requestedReturnDate)}
                          </p>
                          <p>
                            <strong>Resolvido por:</strong>{" "}
                            {loan.resolvedByName ?? "Administração"}
                          </p>
                          <Badge variant="secondary" className="w-fit">
                            {getLoanStatusLabel(loan)}
                          </Badge>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </TabsContent>

            <TabsContent
              value="service-tickets"
              className="m-0 min-h-0 min-w-0 overflow-hidden p-3"
            >
              <section className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-card">
                <div className="flex flex-col gap-3 border-b px-3 py-3 sm:px-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h2 className="font-semibold text-foreground">
                      {serviceTicketAdminView === "open"
                        ? "Atendimentos sem interação"
                        : "Histórico de concluídos"}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {serviceTicketAdminView === "open"
                        ? "Mostra chamados em aberto ou em andamento sem nova interação há mais de 3 dias."
                        : "Atendimentos concluídos aparecem aqui como histórico administrativo."}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-5 text-sm font-medium">
                    <button
                      type="button"
                      className={`bg-transparent p-0 transition-colors hover:text-foreground ${
                        serviceTicketAdminView === "open"
                          ? "font-semibold text-foreground"
                          : "text-muted-foreground"
                      }`}
                      onClick={() => setServiceTicketAdminView("open")}
                    >
                      Em aberto
                    </button>
                    <button
                      type="button"
                      className={`bg-transparent p-0 transition-colors hover:text-foreground ${
                        serviceTicketAdminView === "history"
                          ? "font-semibold text-foreground"
                          : "text-muted-foreground"
                      }`}
                      onClick={() => setServiceTicketAdminView("history")}
                    >
                      Histórico
                    </button>
                  </div>
                </div>

                <div className="border-b p-3">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={serviceTicketSearch}
                      onChange={(event) =>
                        setServiceTicketSearch(event.target.value)
                      }
                      placeholder="Buscar atendimento por título, setor ou responsável"
                      className="h-10 bg-muted pl-10"
                    />
                  </div>
                </div>

                <div className="thin-gray-scrollbar min-h-0 flex-1 overflow-y-auto p-2 sm:p-3">
                  {serviceTicketAdminView === "open" ? (
                    filteredStaleServiceTickets.length === 0 ? (
                      <div className="flex min-h-44 flex-col items-center justify-center rounded-lg border bg-background px-4 py-8 text-center sm:min-h-56">
                        <Headphones className="h-10 w-10 text-muted-foreground" />
                        <h3 className="mt-4 text-base font-semibold">
                          {serviceTicketSearch.trim()
                            ? "Nenhum atendimento encontrado"
                            : "Nenhum atendimento parado"}
                        </h3>
                        <p className="mt-1 max-w-md text-sm text-muted-foreground">
                          {serviceTicketSearch.trim()
                            ? "Tente buscar por título, pessoa, setor, prioridade, status ou data."
                            : "Chamados com interação recente ou já concluídos não aparecem nesta lista."}
                        </p>
                      </div>
                    ) : (
                      <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
                        {filteredStaleServiceTickets.map((ticket) => (
                          <article
                            key={ticket.id}
                            className="flex min-w-0 flex-col gap-3 rounded-lg border bg-background p-3"
                          >
                            <div className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between">
                              <div className="min-w-0">
                                <h3 className="break-words font-semibold">
                                  {ticket.title}
                                </h3>
                                <p className="mt-1 line-clamp-2 break-words text-sm text-muted-foreground">
                                  {ticket.description}
                                </p>
                              </div>
                              <Badge
                                variant="destructive"
                                className="w-fit shrink-0"
                              >
                                {getDaysSince(ticket.lastInteractionAt)} dias
                              </Badge>
                            </div>

                            <div className="grid gap-2 rounded-lg border bg-card p-3 text-sm">
                              <p>
                                <strong>Status:</strong>{" "}
                                {getServiceTicketStatusLabel(ticket.status)}
                              </p>
                              <p>
                                <strong>Prioridade:</strong>{" "}
                                {getServiceTicketPriorityLabel(ticket.priority)}
                              </p>
                              <p>
                                <strong>Aberto por:</strong> {ticket.requesterName} •{" "}
                                {ticket.requesterSector}
                              </p>
                              <p>
                                <strong>Setor responsável:</strong>{" "}
                                {ticket.targetSector}
                              </p>
                              {ticket.assignedToName && (
                                <p>
                                  <strong>Atendendo:</strong>{" "}
                                  {ticket.assignedToName}
                                </p>
                              )}
                              <p className="text-muted-foreground">
                                Aberto em {formatDateTime(ticket.createdAt)}
                              </p>
                              <p className="text-muted-foreground">
                                Última interação em{" "}
                                {formatDateTime(ticket.lastInteractionAt)}
                              </p>
                            </div>
                          </article>
                        ))}
                      </div>
                    )
                  ) : filteredCompletedServiceTicketHistory.length === 0 ? (
                    <div className="flex min-h-44 items-center justify-center rounded-lg border bg-background px-4 py-8 text-center text-sm text-muted-foreground sm:min-h-56">
                      {serviceTicketSearch.trim()
                        ? "Nenhum atendimento encontrado para essa busca."
                        : "Nenhum atendimento concluído ainda."}
                    </div>
                  ) : (
                    <div className="grid gap-2">
                      {filteredCompletedServiceTicketHistory.map((ticket) => (
                        <article
                          key={ticket.id}
                          className="grid min-w-0 gap-3 rounded-lg border bg-background p-3 text-sm md:grid-cols-[minmax(12rem,1fr)_minmax(10rem,.8fr)_minmax(10rem,.8fr)_auto]"
                        >
                          <div className="min-w-0">
                            <p className="break-words font-semibold">
                              {ticket.title}
                            </p>
                            <p className="mt-1 text-muted-foreground">
                              {ticket.requesterName} • {ticket.requesterSector}
                            </p>
                          </div>
                          <p>
                            <strong>Setor:</strong> {ticket.targetSector}
                          </p>
                          <p>
                            <strong>Concluído por:</strong>{" "}
                            {ticket.closedByName ??
                              ticket.assignedToName ??
                              "Sistema"}
                          </p>
                          <Badge variant="secondary" className="w-fit">
                            {getServiceTicketStatusLabel(ticket.status)}
                          </Badge>
                          <p className="text-muted-foreground md:col-span-4">
                            Aberto em {formatDateTime(ticket.createdAt)}
                            {ticket.closedAt
                              ? ` • Concluído em ${formatDateTime(ticket.closedAt)}`
                              : ` • Última interação em ${formatDateTime(ticket.lastInteractionAt)}`}
                          </p>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </TabsContent>

            <TabsContent
              value="content"
              className="m-0 min-h-0 min-w-0 overflow-y-auto p-3"
            >
              <div className="grid min-w-0 items-stretch gap-3 sm:gap-4 xl:h-full xl:grid-cols-2">
                <section className="flex min-h-0 min-w-0 flex-col rounded-lg border bg-card md:min-h-[28rem] xl:h-full xl:min-h-0">
                  <div className="flex flex-col justify-center border-b px-4 py-3 xl:h-20">
                    <h2 className="font-semibold text-foreground">
                      Conteúdo da página de Ajuda
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Cadastre publicações com imagens e defina a ordem de
                      exibição.
                    </p>
                  </div>

                  <form
                    className="flex flex-col gap-3 border-b p-3 xl:h-56 xl:overflow-y-auto"
                    onSubmit={handleHelpContentSubmit}
                  >
                    {editingHelpItem && (
                      <div className="rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary">
                        Editando publicação: {editingHelpItem.title}
                      </div>
                    )}
                    <div className="grid gap-3 md:grid-cols-[minmax(10rem,0.8fr)_minmax(14rem,1.2fr)]">
                      <div className="grid gap-2">
                        <Label htmlFor="help-content-title">Título</Label>
                        <Input
                          id="help-content-title"
                          value={helpTitle}
                          onChange={(event) => setHelpTitle(event.target.value)}
                          className="h-10 bg-muted"
                          placeholder="Título da publicação"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="help-content-image">Imagens</Label>
                        <Input
                          ref={helpImageInputRef}
                          id="help-content-image"
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={handleHelpImageChange}
                          className="h-10 bg-muted file:text-foreground"
                        />
                      </div>
                    </div>
                    {helpDraftImages.length > 0 && (
                      <>
                        <div className="flex items-center gap-3 rounded-lg border bg-background p-2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={helpDraftImages[0]?.src ?? ""}
                            alt={helpDraftImages[0]?.name || helpTitle}
                            className="h-14 w-20 rounded object-cover"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {helpDraftImages.length} foto
                              {helpDraftImages.length === 1 ? "" : "s"}{" "}
                              selecionada
                              {helpDraftImages.length === 1 ? "" : "s"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Prévia da primeira imagem selecionada
                            </p>
                          </div>
                        </div>
                        <div className="thin-gray-scrollbar mt-2 grid max-h-32 gap-2 overflow-y-auto rounded-lg border bg-background p-2">
                          {helpDraftImages.map((image, index) => (
                            <div
                              key={image.id}
                              className="flex items-center gap-3 rounded-md bg-muted/35 p-2"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={image.src}
                                alt={image.name}
                                className="h-12 w-16 shrink-0 rounded object-cover"
                              />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium">
                                  {index + 1}. {image.name}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Ordem da foto na publicação
                                </p>
                              </div>
                              <div className="flex shrink-0 items-center gap-1">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  disabled={index === 0}
                                  onClick={() =>
                                    moveHelpDraftImage(image.id, -1)
                                  }
                                  aria-label="Mover foto para cima"
                                >
                                  <ArrowUp className="h-4 w-4" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  disabled={
                                    index === helpDraftImages.length - 1
                                  }
                                  onClick={() =>
                                    moveHelpDraftImage(image.id, 1)
                                  }
                                  aria-label="Mover foto para baixo"
                                >
                                  <ArrowDown className="h-4 w-4" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() =>
                                    setContentDeleteTarget({
                                      type: "help-draft-image",
                                      image,
                                    })
                                  }
                                  aria-label="Remover foto"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                    <div className="flex flex-col gap-2 sm:flex-row">
                      {editingHelpItem && (
                        <Button
                          type="button"
                          variant="ghost"
                          className="w-full sm:w-fit"
                          onClick={resetHelpContentForm}
                        >
                          Cancelar edição
                        </Button>
                      )}
                      <Button type="submit" className="w-full sm:w-fit">
                        {editingHelpItem ? (
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                        ) : (
                          <Plus className="mr-2 h-4 w-4" />
                        )}
                        {editingHelpItem ? "Salvar" : "Adicionar"}
                      </Button>
                    </div>
                  </form>

                  <div className="thin-gray-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
                    {helpItems.length === 0 ? (
                      <div className="flex min-h-64 flex-col items-center justify-center rounded-lg border bg-background px-4 text-center">
                        <ImageIcon className="h-10 w-10 text-muted-foreground" />
                        <h3 className="mt-4 text-base font-semibold">
                          Nenhuma publicação cadastrada
                        </h3>
                        <p className="mt-1 max-w-md text-sm text-muted-foreground">
                          As publicações cadastradas aqui aparecem na página de
                          Ajuda.
                        </p>
                      </div>
                    ) : (
                      <div className="grid gap-3">
                        {helpItems.map((item, index) => (
                          <article
                            key={item.id}
                            className="rounded-lg border bg-background p-2"
                          >
                            <div className="flex items-center gap-3">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={item.images[0]?.src ?? ""}
                                alt={item.title}
                                className="h-16 w-24 shrink-0 rounded object-cover"
                              />
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-semibold">
                                  {index + 1}. {item.title}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {item.images.length} foto
                                  {item.images.length === 1 ? "" : "s"} na
                                  publicação
                                </p>
                              </div>
                              <div className="flex shrink-0 items-center gap-1">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  disabled={index === 0}
                                  onClick={() => onMoveHelpItem(item.id, -1)}
                                  aria-label="Mover publicação para cima"
                                >
                                  <ArrowUp className="h-4 w-4" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  disabled={index === helpItems.length - 1}
                                  onClick={() => onMoveHelpItem(item.id, 1)}
                                  aria-label="Mover publicação para baixo"
                                >
                                  <ArrowDown className="h-4 w-4" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() => openEditHelpItemForm(item)}
                                  aria-label="Editar publicação"
                                >
                                  <Edit3 className="h-4 w-4" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() =>
                                    setContentDeleteTarget({
                                      type: "help-item",
                                      item,
                                    })
                                  }
                                  aria-label="Apagar publicação"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                            <div className="mt-2 grid gap-2 border-t pt-2">
                              {item.images.map((image, imageIndex) => (
                                <div
                                  key={image.id}
                                  className="flex items-center gap-3 rounded-md bg-muted/35 p-2"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={image.src}
                                    alt={image.name}
                                    className="h-12 w-16 shrink-0 rounded object-cover"
                                  />
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium">
                                      {imageIndex + 1}. {image.name}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      Ordem da foto na publicação
                                    </p>
                                  </div>
                                  <div className="flex shrink-0 items-center gap-1">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon-sm"
                                      disabled={imageIndex === 0}
                                      onClick={() =>
                                        onMoveHelpItemImage(
                                          item.id,
                                          image.id,
                                          -1,
                                        )
                                      }
                                      aria-label="Mover foto para cima"
                                    >
                                      <ArrowUp className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon-sm"
                                      disabled={
                                        imageIndex === item.images.length - 1
                                      }
                                      onClick={() =>
                                        onMoveHelpItemImage(
                                          item.id,
                                          image.id,
                                          1,
                                        )
                                      }
                                      aria-label="Mover foto para baixo"
                                    >
                                      <ArrowDown className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </article>
                        ))}
                      </div>
                    )}
                  </div>
                </section>

                <section className="flex min-h-0 min-w-0 flex-col rounded-lg border bg-card md:min-h-[28rem] xl:h-full xl:min-h-0">
                  <div className="flex flex-col justify-center border-b px-4 py-3 xl:h-20">
                    <h2 className="font-semibold text-foreground">
                      Conteúdo da página de Ramais
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Cadastre nome, setor e ramal para consulta interna.
                    </p>
                  </div>

                  <form
                    className="flex flex-col gap-3 border-b p-3 xl:h-56"
                    onSubmit={handleExtensionContentSubmit}
                  >
                    {editingExtensionItem && (
                      <div className="rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary">
                        Editando ramal: {editingExtensionItem.name}
                      </div>
                    )}
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="grid gap-2">
                        <Label htmlFor="extension-content-name">Nome</Label>
                        <Input
                          id="extension-content-name"
                          value={extensionFormValues.name}
                          onChange={(event) =>
                            setExtensionFormValues((currentValues) => ({
                              ...currentValues,
                              name: event.target.value,
                            }))
                          }
                          className="h-10 bg-muted"
                          placeholder="Nome"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="extension-content-sector">Setor</Label>
                        <SectorCombobox
                          id="extension-content-sector"
                          value={extensionFormValues.sector}
                          onValueChange={(value) =>
                            setExtensionFormValues((currentValues) => ({
                              ...currentValues,
                              sector: value,
                            }))
                          }
                          options={legacySectorComboboxOptions}
                          placeholder="Selecione"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="extension-content-number">Ramal</Label>
                        <Input
                          id="extension-content-number"
                          value={extensionFormValues.extension}
                          onChange={(event) =>
                            setExtensionFormValues((currentValues) => ({
                              ...currentValues,
                              extension: event.target.value,
                            }))
                          }
                          className="h-10 bg-muted"
                          placeholder="Ramal"
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      {editingExtensionItem && (
                        <Button
                          type="button"
                          variant="ghost"
                          className="w-full sm:w-fit"
                          onClick={resetExtensionContentForm}
                        >
                          Cancelar edição
                        </Button>
                      )}
                      <Button type="submit" className="w-full sm:w-fit">
                        {editingExtensionItem ? (
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                        ) : (
                          <Plus className="mr-2 h-4 w-4" />
                        )}
                        {editingExtensionItem ? "Salvar" : "Adicionar"}
                      </Button>
                    </div>
                  </form>

                  <div className="thin-gray-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
                    {extensionItems.length === 0 ? (
                      <div className="flex min-h-64 flex-col items-center justify-center rounded-lg border bg-background px-4 text-center">
                        <PhoneCall className="h-10 w-10 text-muted-foreground" />
                        <h3 className="mt-4 text-base font-semibold">
                          Nenhum ramal cadastrado
                        </h3>
                        <p className="mt-1 max-w-md text-sm text-muted-foreground">
                          Os ramais cadastrados aqui aparecem na página de
                          Ramais.
                        </p>
                      </div>
                    ) : (
                      <div className="grid gap-2">
                        {extensionItems.map((item) => (
                          <article
                            key={item.id}
                            className="grid min-w-0 grid-cols-[1fr_auto] items-center gap-3 rounded-lg border bg-background p-3"
                          >
                            <div className="min-w-0">
                              <p className="truncate font-semibold">
                                {item.name}
                              </p>
                              <p className="truncate text-sm text-muted-foreground">
                                {item.sector} • Ramal {item.extension}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => openEditExtensionItemForm(item)}
                                aria-label="Editar ramal"
                              >
                                <Edit3 className="h-4 w-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() =>
                                  setContentDeleteTarget({
                                    type: "extension-item",
                                    item,
                                  })
                                }
                                aria-label="Apagar ramal"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </article>
                        ))}
                      </div>
                    )}
                  </div>
                </section>
              </div>
            </TabsContent>

            <TabsContent
              value="reports"
              className="m-0 min-h-0 min-w-0 overflow-hidden p-3"
            >
              <section className="flex h-full min-h-0 min-w-0 flex-col rounded-lg border bg-card">
                <div className="flex flex-col gap-3 border-b px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h2 className="font-semibold text-foreground">Denúncias</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Clique em uma linha para ler a denúncia completa.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-5 text-sm font-medium">
                    {reportViewOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={`bg-transparent p-0 transition-colors hover:text-foreground ${
                          reportView === option.value
                            ? "font-semibold text-foreground"
                            : "text-muted-foreground"
                        }`}
                        onClick={() => {
                          setReportView(option.value);
                          setSelectedReport(null);
                        }}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="border-b p-3">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={reportSearch}
                      onChange={(event) => {
                        setReportSearch(event.target.value);
                        setReportPage(1);
                        setProgressReportPage(1);
                        setHistoryReportPage(1);
                      }}
                      placeholder="Buscar por nome ou data"
                      className="h-10 bg-muted pl-10"
                    />
                  </div>
                </div>

                <div className="thin-gray-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
                  {filteredReports.length === 0 ? (
                    <div className="flex min-h-64 flex-col items-center justify-center rounded-lg border bg-background px-4 text-center">
                      <AlertTriangle className="h-10 w-10 text-muted-foreground" />
                      <h3 className="mt-4 text-base font-semibold">
                        {currentReportEmptyState.title}
                      </h3>
                      <p className="mt-1 max-w-md text-sm text-muted-foreground">
                        {currentReportEmptyState.description}
                      </p>
                    </div>
                  ) : (
                    <div className="grid gap-2">
                      {paginatedReports.map((report) => (
                        <article
                          key={report.id}
                          className="thin-gray-scrollbar overflow-x-auto rounded-lg border bg-background transition-colors hover:bg-muted/40"
                        >
                          <div
                            role="button"
                            tabIndex={0}
                            className="grid min-w-[76rem] w-full grid-cols-[minmax(12rem,1.1fr)_7rem_8rem_10rem_minmax(18rem,1.6fr)_11rem] items-center gap-3 px-4 py-3 text-left"
                            onClick={() => setSelectedReport(report)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                setSelectedReport(report);
                              }
                            }}
                          >
                            <div className="min-w-0">
                              <p className="truncate font-semibold">
                                {report.sourceName}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                {report.sourceEmail}
                              </p>
                            </div>
                            <Badge variant="outline" className="w-fit">
                              {getReportTypeLabel(report)}
                            </Badge>
                            <Badge
                              variant={getReportStatusVariant(report.status)}
                              className="w-fit"
                            >
                              {getReportStatusLabel(report.status)}
                            </Badge>
                            <span className="whitespace-nowrap text-sm text-muted-foreground">
                              {formatDateTime(report.createdAt)}
                            </span>
                            <span className="truncate text-sm text-muted-foreground">
                              {report.messagePreview
                                ? `${report.messagePreview} • ${report.description}`
                                : report.description}
                            </span>
                            <span className="flex items-center justify-end gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                className="text-muted-foreground"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setSelectedReport(report);
                                }}
                                aria-label="Ler denúncia"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              {reportView === "history" ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleReopenReport(report);
                                  }}
                                  aria-label="Reabrir denúncia"
                                >
                                  <RotateCcw className="h-4 w-4" />
                                </Button>
                              ) : (
                                <>
                                  {report.status === "new" && (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon-sm"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        handleMarkReportReviewed(report);
                                      }}
                                      aria-label="Mover denúncia para andamento"
                                    >
                                      <CheckCircle2 className="h-4 w-4" />
                                    </Button>
                                  )}
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-sm"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      handleDeleteReport(report);
                                    }}
                                    aria-label="Mover denúncia para histórico"
                                  >
                                    <ClipboardList className="h-4 w-4" />
                                  </Button>
                                </>
                              )}
                            </span>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </div>

                {filteredReports.length > 0 && (
                  <div className="flex flex-col gap-2 border-t px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-sm text-muted-foreground">
                      Página {currentReportPage} de {totalReportPages} •{" "}
                      {filteredReports.length} denúncia
                      {filteredReports.length === 1 ? "" : "s"}
                    </span>
                    <div className="grid grid-cols-2 gap-2 sm:flex">
                      <Button
                        variant="outline"
                        disabled={currentReportPage === 1}
                        onClick={() =>
                          setActiveReportPage((currentPage) =>
                            Math.max(1, currentPage - 1),
                          )
                        }
                      >
                        Anterior
                      </Button>
                      <Button
                        variant="outline"
                        disabled={currentReportPage === totalReportPages}
                        onClick={() =>
                          setActiveReportPage((currentPage) =>
                            Math.min(totalReportPages, currentPage + 1),
                          )
                        }
                      >
                        Próxima
                      </Button>
                    </div>
                  </div>
                )}
              </section>
            </TabsContent>
      </Tabs>
    </section>
  );
}
