import type { Sector } from "@/lib/admin-data";
import type { LoanRequest } from "@/lib/loan-data";

export const LOAN_NOTIFICATION_EVENT = "loan-notifications-updated";

const LOAN_NOTIFICATION_STORAGE_LIMIT = 500;

type LoanNotificationUser = {
  id: string;
  sector: Sector;
};

type LoanNotificationEvent = {
  key: string;
  loanId: string;
};

export type LoanNotificationSnapshot = {
  allKeys: Set<string>;
  unreadKeys: Set<string>;
  unreadByLoan: Record<string, number>;
  keysByLoan: Record<string, string[]>;
};

export function getLoanNotificationSnapshot(
  loans: LoanRequest[],
  currentUser: LoanNotificationUser,
  readKeys: Set<string>,
): LoanNotificationSnapshot {
  const allKeys = new Set<string>();
  const unreadKeys = new Set<string>();
  const unreadByLoan: Record<string, number> = {};
  const keysByLoan: Record<string, string[]> = {};

  loans.forEach((loan) => {
    getLoanNotificationEvents(loan, currentUser).forEach((event) => {
      allKeys.add(event.key);
      keysByLoan[event.loanId] = [...(keysByLoan[event.loanId] ?? []), event.key];

      if (!readKeys.has(event.key)) {
        unreadKeys.add(event.key);
        unreadByLoan[event.loanId] = (unreadByLoan[event.loanId] ?? 0) + 1;
      }
    });
  });

  return {
    allKeys,
    unreadKeys,
    unreadByLoan,
    keysByLoan,
  };
}

function getLoanNotificationEvents(
  loan: LoanRequest,
  user: LoanNotificationUser,
): LoanNotificationEvent[] {
  const events: LoanNotificationEvent[] = [];

  if (
    loan.status === "analysis" &&
    loan.lenderSector === user.sector &&
    loan.requesterId !== user.id
  ) {
    events.push({
      key: getLoanNotificationKey(loan, "requested"),
      loanId: loan.id,
    });
  }

  if (
    loan.approvedAt &&
    (loan.status === "approved" || loan.status === "postponed") &&
    loan.requesterId === user.id &&
    loan.approvedById !== user.id
  ) {
    events.push({
      key: getLoanNotificationKey(loan, "approved"),
      loanId: loan.id,
    });
  }

  return events;
}

function getLoanNotificationKey(
  loan: LoanRequest,
  kind: "requested" | "approved",
) {
  const date =
    kind === "requested"
      ? loan.createdAt
      : (loan.approvedAt ?? loan.createdAt);

  return `loan:${loan.id}:${kind}:${date.getTime()}`;
}

export function getLoanNotificationReadStorageKey(userId: string) {
  return `loan-notifications-read:${userId}`;
}

export function getLoanNotificationSoundStorageKey(userId: string) {
  return `loan-notifications-sounded:${userId}`;
}

export function getLoanNotificationPendingStorageKey(userId: string) {
  return `loan-notifications-pending:${userId}`;
}

export function readLoanNotificationReadKeys(userId: string) {
  return readLoanNotificationStoredKeys(
    getLoanNotificationReadStorageKey(userId),
    userId,
  );
}

export function readLoanNotificationSoundKeys(userId: string) {
  return readLoanNotificationStoredKeys(
    getLoanNotificationSoundStorageKey(userId),
    userId,
  );
}

export function readLoanNotificationPendingKeys(userId: string) {
  return readLoanNotificationStoredKeys(
    getLoanNotificationPendingStorageKey(userId),
    userId,
  );
}

export function writeLoanNotificationReadKeys(
  userId: string,
  readKeys: Set<string>,
) {
  writeLoanNotificationStoredKeys(
    getLoanNotificationReadStorageKey(userId),
    userId,
    readKeys,
  );
}

export function writeLoanNotificationSoundKeys(
  userId: string,
  soundKeys: Set<string>,
) {
  writeLoanNotificationStoredKeys(
    getLoanNotificationSoundStorageKey(userId),
    userId,
    soundKeys,
  );
}

export function writeLoanNotificationPendingKeys(
  userId: string,
  pendingKeys: Set<string>,
) {
  writeLoanNotificationStoredKeys(
    getLoanNotificationPendingStorageKey(userId),
    userId,
    pendingKeys,
  );
}

function readLoanNotificationStoredKeys(storageKey: string, userId: string) {
  if (typeof window === "undefined" || !userId) {
    return new Set<string>();
  }

  try {
    const storedValue = window.localStorage.getItem(storageKey);
    const parsedValue = storedValue ? JSON.parse(storedValue) : [];

    return new Set(Array.isArray(parsedValue) ? parsedValue : []);
  } catch {
    return new Set<string>();
  }
}

function writeLoanNotificationStoredKeys(
  storageKey: string,
  userId: string,
  keys: Set<string>,
) {
  if (typeof window === "undefined" || !userId) {
    return;
  }

  try {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify(
        Array.from(keys).slice(-LOAN_NOTIFICATION_STORAGE_LIMIT),
      ),
    );
  } catch {
    // A notificação visual continua funcionando mesmo se o storage for bloqueado.
  }
}

export function markLoanNotificationKeysRead(
  userId: string,
  notificationKeys: Iterable<string>,
) {
  const keys = Array.from(notificationKeys);

  if (keys.length === 0) {
    return false;
  }

  const readKeys = readLoanNotificationReadKeys(userId);
  const previousSize = readKeys.size;

  keys.forEach((key) => readKeys.add(key));

  const addedReadKey = readKeys.size !== previousSize;

  if (addedReadKey) {
    writeLoanNotificationReadKeys(userId, readKeys);
  }

  const pendingKeys = readLoanNotificationPendingKeys(userId);
  let removedPendingKey = false;

  keys.forEach((key) => {
    if (pendingKeys.delete(key)) {
      removedPendingKey = true;
    }
  });

  if (removedPendingKey) {
    writeLoanNotificationPendingKeys(userId, pendingKeys);
  }

  if (addedReadKey || removedPendingKey) {
    notifyLoanNotificationsChanged();
  }

  return addedReadKey || removedPendingKey;
}

export function notifyLoanNotificationsChanged() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(LOAN_NOTIFICATION_EVENT));
}
