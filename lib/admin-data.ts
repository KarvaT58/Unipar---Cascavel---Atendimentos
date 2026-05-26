import type { MessageAttachment } from "@/lib/chat-data";

export const SECTOR_OPTIONS = [
  "TI",
  "Manutenção",
  "Coordenação",
  "Centro de Psicologia Aplicada",
  "Atendimento",
  "Secretaria",
  "Serviços Gerais",
  "Direção",
  "Odontologia",
  "Centro de Saúde Escola",
  "Laboratórios de Saúde",
  "Esterilização",
  "Administrador Predial",
  "Patrimônio",
  "Monitoramento",
  "Biblioteca",
  "Serviço de Assistência Jurídica",
  "Motorista",
  "Financeiro",
  "Recursos Humanos",
  "Comercial",
  "Marketing",
] as const;

export type Sector = (typeof SECTOR_OPTIONS)[number];

export type UserChatStatus = "online" | "offline" | "busy" | "away";

export type UserWorkStatus =
  | "available"
  | "home-office"
  | "meeting"
  | "lunch"
  | "support"
  | "training"
  | "external"
  | "focus"
  | "vacation";

export const USER_CHAT_STATUS_OPTIONS: Array<{
  value: UserChatStatus;
  label: string;
  description: string;
}> = [
  {
    value: "online",
    label: "Online",
    description: "Disponivel para conversas",
  },
  {
    value: "busy",
    label: "Ocupado",
    description: "Evitar interromper sem necessidade",
  },
  {
    value: "away",
    label: "Ausente",
    description: "Pode demorar para responder",
  },
  {
    value: "offline",
    label: "Offline",
    description: "Aparecer fora do sistema",
  },
];

export const USER_WORK_STATUS_OPTIONS: Array<{
  value: UserWorkStatus;
  label: string;
  description: string;
}> = [
  {
    value: "available",
    label: "Disponivel",
    description: "Atendimento normal",
  },
  {
    value: "meeting",
    label: "Em reuniao",
    description: "Em compromisso interno",
  },
  {
    value: "home-office",
    label: "Home office",
    description: "Trabalhando remoto",
  },
  {
    value: "focus",
    label: "Ocupado",
    description: "Foco em uma demanda",
  },
  {
    value: "lunch",
    label: "Intervalo",
    description: "Pausa ou almoco",
  },
  {
    value: "vacation",
    label: "Ferias",
    description: "Fora por periodo planejado",
  },
  {
    value: "support",
    label: "Em suporte",
    description: "Atendendo chamado ou usuario",
  },
  {
    value: "training",
    label: "Treinamento",
    description: "Em capacitacao",
  },
  {
    value: "external",
    label: "Externo",
    description: "Fora do campus ou em deslocamento",
  },
];

export function getUserChatStatusLabel(status?: UserChatStatus) {
  return (
    USER_CHAT_STATUS_OPTIONS.find((option) => option.value === status)?.label ??
    "Offline"
  );
}

export function getUserWorkStatusLabel(status?: UserWorkStatus) {
  return (
    USER_WORK_STATUS_OPTIONS.find((option) => option.value === status)?.label ??
    "Disponivel"
  );
}

export interface AccessRequest {
  id: string;
  name: string;
  email: string;
  sector: Sector;
  cpf: string;
  createdAt: Date;
  status: "pending" | "created" | "rejected";
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  sector: Sector;
  password: string;
  isAdmin: boolean;
  status: "active" | "blocked";
  createdAt: Date;
  avatar?: string;
  about?: string;
  chatStatus?: UserChatStatus;
  workStatus?: UserWorkStatus;
  lastSeenAt?: Date;
}

export interface AdminReportMessageSnapshot {
  id: string;
  content: string;
  timestamp: Date;
  isOwn: boolean;
  senderName: string;
  status: "sent" | "delivered" | "read";
  isPriority?: boolean;
  isForwarded?: boolean;
  isEdited?: boolean;
  deletedForEveryone?: boolean;
  attachment?: MessageAttachment;
  replyTo?: {
    content: string;
    senderName: string;
  };
}

export interface AdminReport {
  id: string;
  type: "conversation" | "message";
  sourceKind?: "contact" | "group";
  sourceName: string;
  sourceEmail: string;
  sourceAvatar?: string;
  description: string;
  createdAt: Date;
  status: "new" | "reviewed" | "deleted";
  messagePreview?: string;
  evidenceMessages?: AdminReportMessageSnapshot[];
}

export interface HelpContentImage {
  id: string;
  name: string;
  src: string;
}

export interface HelpContentItem {
  id: string;
  title: string;
  images: HelpContentImage[];
}

export interface ExtensionContentItem {
  id: string;
  name: string;
  sector: string;
  extension: string;
}

export function isUniparEmail(email: string) {
  return email.trim().toLowerCase().endsWith("@unipar.br");
}
