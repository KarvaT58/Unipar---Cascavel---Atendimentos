"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { AuthLegalLinks } from "@/components/auth-legal-links"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { sectors, type Sector } from "@/lib/sectors"
import { cn } from "@/lib/utils"
import { normalizeAccessPhone } from "@/lib/validators"

export function SignupForm({
  className,
  ...props
}: React.ComponentProps<"form">) {
  const router = useRouter()
  const [selectedSector, setSelectedSector] = React.useState<Sector | null>(
    null
  )
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const formData = new FormData(event.currentTarget)
    const name = String(formData.get("name") ?? "").trim()
    const email = String(formData.get("email") ?? "").trim()
    const sector = String(formData.get("sector") ?? "").trim()
    const phone = String(formData.get("phone") ?? "").trim()
    const cpf = String(formData.get("cpf") ?? "").trim()
    const confirmCpf = String(formData.get("confirmCpf") ?? "").trim()
    const acceptedTerms = formData.get("acceptTerms") === "on"
    const phoneDigits = normalizeAccessPhone(phone)
    const cpfDigits = cpf.replace(/\D/g, "")
    const confirmCpfDigits = confirmCpf.replace(/\D/g, "")

    if (!name) {
      toast.warning("Preencha todos os campos.", {
        description: "Informe seu nome completo para solicitar acesso.",
      })
      return
    }

    if (!email) {
      toast.warning("Informe seu e-mail institucional.", {
        description: "Use apenas endereços com final @unipar.br.",
      })
      return
    }

    if (!sector) {
      toast.warning("Selecione seu setor.", {
        description: "Escolha um setor da lista para continuar.",
      })
      return
    }

    if (!phone) {
      toast.warning("Informe seu telefone.", {
        description: "Use um número com DDD para nossa equipe retornar.",
      })
      return
    }

    if (!cpf || !confirmCpf) {
      toast.warning("Informe e confirme seu CPF.", {
        description: "Os dois campos de CPF são obrigatórios.",
      })
      return
    }

    if (!email.toLowerCase().endsWith("@unipar.br")) {
      toast.error("E-mail inválido.", {
        description: "A solicitação aceita somente e-mails com final @unipar.br.",
      })
      return
    }

    if (!phoneDigits) {
      toast.error("Telefone inválido.", {
        description: "Informe o telefone com DDD, sem o código +55.",
      })
      return
    }

    if (cpfDigits.length !== 11) {
      toast.error("CPF inválido.", {
        description: "O CPF precisa ter exatamente 11 dígitos numéricos.",
      })
      return
    }

    if (cpfDigits !== confirmCpfDigits) {
      toast.error("Os CPFs não conferem.", {
        description: "O campo CPF e Confirmar CPF precisam ter os mesmos 11 dígitos.",
      })
      return
    }

    if (!acceptedTerms) {
      toast.warning("Aceite os termos para continuar.", {
        description:
          "É necessário aceitar os Termos e a Política de Privacidade para solicitar acesso.",
      })
      return
    }

    setIsSubmitting(true)
    const response = await fetch("/api/access-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        email,
        sector,
        phone,
        cpf,
        confirmCpf,
        acceptedTerms,
      }),
    }).catch(() => null)
    setIsSubmitting(false)

    if (!response?.ok) {
      const result = await response?.json().catch(() => null)

      toast.error("Não foi possível enviar a solicitação.", {
        description:
          result?.message ?? "Verifique os dados informados e tente novamente.",
      })
      return
    }

    const result = await response.json().catch(() => null)

    window.sessionStorage.setItem("request_sector", sector)
    window.sessionStorage.setItem("request_phone", result?.phone ?? phone)

    toast.success("Solicitação recebida.", {
      description: "Confira na próxima tela os detalhes da liberação.",
    })
    router.push("/signup/success")
  }

  return (
    <form
      noValidate
      onSubmit={handleSubmit}
      className={cn("flex flex-col gap-6", className)}
      {...props}
    >
      <FieldGroup>
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-2xl font-bold">Solicitar seu acesso</h1>
          <p className="text-sm whitespace-nowrap text-muted-foreground">
            Preencha o formulário para solicitar seu acesso
          </p>
        </div>
        <Field>
          <FieldLabel htmlFor="name">Nome completo</FieldLabel>
          <Input
            id="name"
            name="name"
            type="text"
            placeholder="Nome"
            required
            className="bg-background"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="email">E-mail</FieldLabel>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="E-mail"
            required
            className="bg-background"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="sector">Setor</FieldLabel>
          <input
            type="hidden"
            name="sector"
            value={selectedSector?.value ?? ""}
          />
          <Combobox
            items={sectors}
            value={selectedSector}
            onValueChange={setSelectedSector}
            itemToStringValue={(sector: Sector) => sector.label}
            isItemEqualToValue={(item: Sector, value: Sector) =>
              item.value === value.value
            }
          >
            <ComboboxInput
              id="sector"
              placeholder="Selecione o setor"
              className="w-full"
              showClear
            />
            <ComboboxContent>
              <ComboboxEmpty>Nenhum setor encontrado.</ComboboxEmpty>
              <ComboboxList>
                {(sector: Sector) => (
                  <ComboboxItem key={sector.code} value={sector}>
                    <Item size="xs" className="p-0">
                      <ItemContent>
                        <ItemTitle className="whitespace-normal leading-snug">
                          {sector.label}
                        </ItemTitle>
                        <ItemDescription>
                          {sector.description} ({sector.code})
                        </ItemDescription>
                      </ItemContent>
                    </Item>
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        </Field>
        <Field>
          <FieldLabel htmlFor="phone">Número de telefone</FieldLabel>
          <Input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="DDD 99999-9999"
            maxLength={18}
            required
            className="bg-background"
          />
          <FieldDescription className="whitespace-nowrap">
            Informe com DDD mas sem o código +55
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="cpf">CPF</FieldLabel>
          <Input
            id="cpf"
            name="cpf"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="CPF"
            required
            className="bg-background"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="confirm-cpf">Confirmar CPF</FieldLabel>
          <Input
            id="confirm-cpf"
            name="confirmCpf"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="CPF"
            required
            className="bg-background"
          />
        </Field>
        <Field orientation="horizontal" className="items-start gap-3">
          <input
            id="accept-terms"
            name="acceptTerms"
            type="checkbox"
            required
            className="mt-0.5 size-4 shrink-0 rounded border border-input bg-background accent-primary"
          />
          <FieldLabel
            htmlFor="accept-terms"
            className="block whitespace-nowrap text-sm leading-5 text-muted-foreground"
          >
            Aceito{" "}
            <Link
              href="/terms"
              className="underline underline-offset-4 hover:text-primary"
            >
              Termos
            </Link>{" "}
            e a{" "}
            <Link
              href="/privacy"
              className="underline underline-offset-4 hover:text-primary"
            >
              Política de Privacidade
            </Link>
            .
          </FieldLabel>
        </Field>
        <Field>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Enviando..." : "Solicitar acesso"}
          </Button>
        </Field>
        <Field>
          <FieldDescription className="px-6 text-center">
            Já tem seu acesso? <Link href="/login">Entrar</Link>
          </FieldDescription>
        </Field>
        <AuthLegalLinks />
      </FieldGroup>
    </form>
  )
}
