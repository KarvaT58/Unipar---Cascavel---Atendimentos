import type { Sector } from "@/lib/admin-data";

export type ServiceTicketPriority = "low" | "normal" | "high" | "urgent";
export type ServiceTicketStatus = "open" | "in_progress" | "completed";
export type ServiceTicketAttachmentKind = "image" | "video" | "document";

export interface ServiceTicketUser {
  id: string;
  name: string;
  email: string;
  avatar: string;
  sector: Sector;
}

export interface ServiceTicketAttachment {
  id: string;
  name: string;
  size: number;
  kind: ServiceTicketAttachmentKind;
  url: string;
  extension?: string;
}

export interface ServiceTicketMessage {
  id: string;
  authorId: string;
  authorName: string;
  authorSector: Sector;
  content: string;
  createdAt: Date;
  attachments?: ServiceTicketAttachment[];
  isSystem?: boolean;
  isInternal?: boolean;
}

export interface ServiceTicketTransfer {
  id: string;
  createdAt: Date;
  fromSector: Sector;
  toSector: Sector;
  transferredById: string;
  transferredByName: string;
  assignedToId?: string;
  assignedToName?: string;
}

export interface ServiceTicket {
  id: string;
  title: string;
  description: string;
  requesterId: string;
  requesterName: string;
  requesterSector: Sector;
  targetSector: Sector;
  priority: ServiceTicketPriority;
  status: ServiceTicketStatus;
  createdAt: Date;
  updatedAt: Date;
  lastInteractionAt: Date;
  assignedToId?: string;
  assignedToName?: string;
  assignedToSector?: Sector;
  attachments: ServiceTicketAttachment[];
  messages: ServiceTicketMessage[];
  transfers: ServiceTicketTransfer[];
  closedAt?: Date;
  closedById?: string;
  closedByName?: string;
  closeDescription?: string;
  reopenedAt?: Date;
  reopenedById?: string;
  reopenedByName?: string;
  reopenReason?: string;
}

export function formatServiceTicketDateTime(date: Date) {
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function getServiceTicketStatusLabel(status: ServiceTicketStatus) {
  switch (status) {
    case "open":
      return "Em aberto";
    case "in_progress":
      return "Em andamento";
    case "completed":
      return "Conclu\u00eddo";
  }
}

export function getServiceTicketPriorityLabel(priority: ServiceTicketPriority) {
  switch (priority) {
    case "low":
      return "Baixa";
    case "normal":
      return "Normal";
    case "high":
      return "Alta";
    case "urgent":
      return "Urgente";
  }
}

export function createSystemTicketMessage(
  id: string,
  content: string,
  author: ServiceTicketUser,
  createdAt = new Date(),
): ServiceTicketMessage {
  return {
    id,
    authorId: author.id,
    authorName: author.name,
    authorSector: author.sector,
    content,
    createdAt,
    isSystem: true,
  };
}

export function createInitialServiceTickets(
  currentUser: ServiceTicketUser,
): ServiceTicket[] {
  void currentUser;

  return [];
}
