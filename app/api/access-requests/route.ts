import { NextResponse } from "next/server"

import { canUseOfflineFallback } from "@/lib/local-mode"
import { createOfflineAccessRequest } from "@/lib/offline-auth-store"
import { prisma } from "@/lib/prisma"
import { encryptString, hashSensitiveValue } from "@/lib/security"
import {
  isInstitutionalEmail,
  normalizeAccessPhone,
  normalizeCpf,
  normalizeEmail,
} from "@/lib/validators"

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const name = getString(body, "name")
  const email = normalizeEmail(getString(body, "email"))
  const sector = getString(body, "sector")
  const phone = getString(body, "phone")
  const cpf = getString(body, "cpf")
  const confirmCpf = getString(body, "confirmCpf")
  const acceptedTerms = getBoolean(body, "acceptedTerms")
  const phoneDigits = normalizeAccessPhone(phone)
  const cpfDigits = normalizeCpf(cpf)
  const confirmCpfDigits = normalizeCpf(confirmCpf)

  if (!name || !email || !sector || !phone || !cpf || !confirmCpf) {
    return NextResponse.json(
      { message: "Preencha todos os campos obrigatórios." },
      { status: 400 }
    )
  }

  if (!isInstitutionalEmail(email)) {
    return NextResponse.json(
      { message: "A solicitação aceita somente e-mails com final @unipar.br." },
      { status: 400 }
    )
  }

  if (!phoneDigits) {
    return NextResponse.json(
      { message: "Informe o telefone com DDD, sem o código +55." },
      { status: 400 }
    )
  }

  if (!cpfDigits || !confirmCpfDigits) {
    return NextResponse.json(
      { message: "O CPF precisa ter exatamente 11 dígitos numéricos." },
      { status: 400 }
    )
  }

  if (cpfDigits !== confirmCpfDigits) {
    return NextResponse.json(
      { message: "O campo CPF e Confirmar CPF precisam ser iguais." },
      { status: 400 }
    )
  }

  if (!acceptedTerms) {
    return NextResponse.json(
      { message: "É necessário aceitar os Termos e a Política de Privacidade." },
      { status: 400 }
    )
  }

  const cpfHash = hashSensitiveValue(cpfDigits)
  const cpfCiphertext = encryptString(cpfDigits)

  try {
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email }, { phone: phoneDigits }, { cpfHash }],
      },
      select: {
        email: true,
        phone: true,
        cpfHash: true,
      },
    })

    if (existingUser) {
      const duplicateMessage = getDuplicateUserMessage(existingUser, {
        email,
        phone: phoneDigits,
        cpfHash,
        cpf: cpfDigits,
      })

      return NextResponse.json(
        { message: duplicateMessage },
        { status: 409 }
      )
    }

    const existingRequest = await prisma.accessRequest.findFirst({
      where: {
        status: "PENDING",
        OR: [{ email }, { phone: phoneDigits }, { cpfHash }],
      },
      select: {
        email: true,
        phone: true,
        cpfHash: true,
      },
    })

    if (existingRequest) {
      const duplicateMessage = getDuplicateRequestMessage(existingRequest, {
        email,
        phone: phoneDigits,
        cpfHash,
        cpf: cpfDigits,
      })

      return NextResponse.json(
        { message: duplicateMessage },
        { status: 409 }
      )
    }

    await prisma.accessRequest.create({
      data: {
        name,
        email,
        sector,
        phone: phoneDigits,
        cpfHash,
        cpfCiphertext,
        cpfLast4: cpfDigits.slice(-4),
        acceptedTerms: true,
      },
    })

    return NextResponse.json({ ok: true, phone: phoneDigits })
  } catch {
    if (!canUseOfflineFallback()) {
      return NextResponse.json(
        { message: "Banco de dados indisponível no momento." },
        { status: 503 }
      )
    }

    const offlineResult = await createOfflineAccessRequest({
      name,
      email,
      sector,
      phone: phoneDigits,
      cpfHash,
      cpfCiphertext,
      cpfLast4: cpfDigits.slice(-4),
    }).catch(() => null)

    if (offlineResult?.ok) {
      return NextResponse.json({ ok: true, phone: phoneDigits, offline: true })
    }

    if (offlineResult && !offlineResult.ok) {
      return NextResponse.json(
        { message: offlineResult.message },
        { status: offlineResult.status }
      )
    }

    return NextResponse.json(
      { message: "Banco de dados indisponível no momento." },
      { status: 503 }
    )
  }
}

function getString(body: unknown, key: string) {
  if (!body || typeof body !== "object" || !(key in body)) {
    return ""
  }

  const value = (body as Record<string, unknown>)[key]

  return typeof value === "string" ? value.trim() : ""
}

function getBoolean(body: unknown, key: string) {
  if (!body || typeof body !== "object" || !(key in body)) {
    return false
  }

  return Boolean((body as Record<string, unknown>)[key])
}

function getDuplicateUserMessage(
  existingUser: { email: string; phone: string | null; cpfHash: string },
  input: { email: string; phone: string; cpfHash: string; cpf: string }
) {
  if (existingUser.email === input.email) {
    return `O e-mail ${input.email} já está vinculado a um usuário.`
  }

  if (existingUser.phone === input.phone) {
    return `O telefone ${formatPhoneForMessage(input.phone)} já está vinculado a um usuário.`
  }

  if (existingUser.cpfHash === input.cpfHash) {
    return `O CPF ${formatCpfForMessage(input.cpf)} já está vinculado a um usuário.`
  }

  return "Esses dados já estão vinculados a um usuário."
}

function getDuplicateRequestMessage(
  existingRequest: { email: string; phone: string; cpfHash: string },
  input: { email: string; phone: string; cpfHash: string; cpf: string }
) {
  if (existingRequest.email === input.email) {
    return `Já existe uma solicitação pendente para o e-mail ${input.email}.`
  }

  if (existingRequest.phone === input.phone) {
    return `Já existe uma solicitação pendente para o telefone ${formatPhoneForMessage(input.phone)}.`
  }

  if (existingRequest.cpfHash === input.cpfHash) {
    return `Já existe uma solicitação pendente para o CPF ${formatCpfForMessage(input.cpf)}.`
  }

  return "Já existe uma solicitação pendente para esses dados."
}

function formatPhoneForMessage(phone: string) {
  if (phone.length === 10) {
    return `${phone.slice(0, 2)} ${phone.slice(2, 6)}-${phone.slice(6)}`
  }

  return `${phone.slice(0, 2)} ${phone.slice(2, 7)}-${phone.slice(7)}`
}

function formatCpfForMessage(cpf: string) {
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`
}
