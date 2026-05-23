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
