import type { Sector } from "@/lib/admin-data";

export type LoanAttachmentKind = "image" | "video";

export interface LoanAttachment {
  id: string;
  name: string;
  size: number;
  kind: LoanAttachmentKind;
  url: string;
}

export type LoanRequestStatus =
  | "analysis"
  | "approved"
  | "postponed"
  | "rejected"
  | "returned"
  | "resolved";
export type LoanFilter =
  | "analysis"
  | "approved"
  | "postponed"
  | "overdue"
  | "history";

export interface LoanPostponement {
  id: string;
  previousReturnDate: string;
  newReturnDate: string;
  reason: string;
  requestedAt: Date;
}

export interface LoanRequest {
  id: string;
  title: string;
  description: string;
  requesterId: string;
  requesterName: string;
  requesterSector: Sector;
  lenderSector: Sector;
  requestedReturnDate: string;
  status: LoanRequestStatus;
  createdAt: Date;
  rejectedAt?: Date;
  rejectedById?: string;
  rejectedByName?: string;
  rejectedBySector?: Sector;
  approvedAt?: Date;
  approvedById?: string;
  approvedByName?: string;
  approvedBySector?: Sector;
  patrimonyNumber?: string;
  releaseAttachments: LoanAttachment[];
  postponements: LoanPostponement[];
  returnedAt?: Date;
  returnedById?: string;
  returnedByName?: string;
  resolvedAt?: Date;
  resolvedById?: string;
  resolvedByName?: string;
  resolvedBySector?: Sector;
}

export function getLoanDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(date.getDate()).padStart(2, "0")}`;
}

export function parseLoanDate(dateKey: string) {
  return new Date(`${dateKey}T00:00:00`);
}

export function formatLoanDate(dateKey: string) {
  return parseLoanDate(dateKey).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function getStartOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isLoanActive(loan: LoanRequest) {
  return loan.status === "approved" || loan.status === "postponed";
}

export function isLoanOverdue(loan: LoanRequest, referenceDate = new Date()) {
  if (!isLoanActive(loan)) return false;

  return (
    getStartOfDay(parseLoanDate(loan.requestedReturnDate)).getTime() <
    getStartOfDay(referenceDate).getTime()
  );
}

export function isLoanDueToday(loan: LoanRequest, referenceDate = new Date()) {
  if (!isLoanActive(loan)) return false;

  return loan.requestedReturnDate === getLoanDateKey(referenceDate);
}

export function getLoanOverdueDays(
  loan: LoanRequest,
  referenceDate = new Date(),
) {
  if (!isLoanActive(loan)) return 0;

  return Math.max(
    0,
    Math.floor(
      (getStartOfDay(referenceDate).getTime() -
        getStartOfDay(parseLoanDate(loan.requestedReturnDate)).getTime()) /
        (24 * 60 * 60 * 1000),
    ),
  );
}

export function isLoanCriticalOverdue(
  loan: LoanRequest,
  referenceDate = new Date(),
) {
  return getLoanOverdueDays(loan, referenceDate) >= 3;
}

export function getLoanOperationalStatus(
  loan: LoanRequest,
  referenceDate = new Date(),
): LoanFilter {
  if (loan.status === "analysis") return "analysis";
  if (
    loan.status === "rejected" ||
    loan.status === "returned" ||
    loan.status === "resolved"
  ) {
    return "history";
  }
  if (isLoanOverdue(loan, referenceDate)) return "overdue";
  if (loan.status === "postponed") return "postponed";

  return "approved";
}

export function getLoanStatusLabel(
  loan: LoanRequest,
  referenceDate = new Date(),
) {
  if (loan.status === "resolved") return "Resolvido";

  switch (getLoanOperationalStatus(loan, referenceDate)) {
    case "analysis":
      return "Solicita\u00e7\u00e3o em an\u00e1lise";
    case "approved":
      return "Empr\u00e9stimo liberado";
    case "postponed":
      return "Empr\u00e9stimo adiado";
    case "overdue":
      return "Empr\u00e9stimo atrasado";
    case "history":
      return "Hist\u00f3rico";
  }
}

export function createInitialLoanRequests(
  currentUserId: string,
  currentUserName: string,
  currentUserSector: Sector,
): LoanRequest[] {
  void currentUserId;
  void currentUserName;
  void currentUserSector;

  return [];
}
