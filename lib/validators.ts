export function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

export function isInstitutionalEmail(email: string) {
  return normalizeEmail(email).endsWith("@unipar.br")
}

export function onlyDigits(value: string) {
  return value.replace(/\D/g, "")
}

export function normalizeCpf(value: string) {
  const digits = onlyDigits(value)

  if (digits.length !== 11) {
    return null
  }

  return digits
}

export function normalizeAccessPhone(value: string) {
  const digits = onlyDigits(value)

  if (
    digits.startsWith("55") &&
    (digits.length === 12 || digits.length === 13)
  ) {
    return null
  }

  if (digits.length !== 10 && digits.length !== 11) {
    return null
  }

  return digits
}

export function normalizeWhatsapp(value: string) {
  const digits = onlyDigits(value)

  if (digits.length < 10 || digits.length > 11) {
    return null
  }

  return digits
}

export function formatPhoneBR(value: string) {
  const digits = onlyDigits(value)

  if (digits.length === 11) {
    return `${digits.slice(0, 2)} ${digits.slice(2, 7)}-${digits.slice(7)}`
  }

  if (digits.length === 10) {
    return `${digits.slice(0, 2)} ${digits.slice(2, 6)}-${digits.slice(6)}`
  }

  return value
}

export function formatDateTimeBR(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date)
}

export function formatDateBR(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
  }).format(date)
}
