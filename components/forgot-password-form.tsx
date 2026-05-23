"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { AuthLegalLinks } from "@/components/auth-legal-links"
import { Button } from "@/components/ui/button"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item"
import { sectors, type Sector } from "@/lib/sectors"
import { cn } from "@/lib/utils"

export function ForgotPasswordForm({
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
    const username = String(formData.get("username") ?? "").trim()
    const email = String(formData.get("email") ?? "").trim()
    const sector = String(formData.get("sector") ?? "").trim()
    const whatsapp = String(formData.get("whatsapp") ?? "").trim()
    const whatsappDigits = whatsapp.replace(/\D/g, "")

    if (!username) {
      toast.warning("Informe o nome do usuário.", {
        description: "Precisamos do nome para localizar seu acesso.",
      })
      return
    }

    if (!email) {
      toast.warning("Informe seu e-mail institucional.", {
        description: "Use apenas endereços com final @unipar.br.",
      })
      return
    }

    if (!email.toLowerCase().endsWith("@unipar.br")) {
      toast.error("E-mail inválido.", {
        description: "A recuperação aceita somente e-mails com final @unipar.br.",
      })
      return
    }

    if (!sector) {
      toast.warning("Selecione seu setor.", {
        description: "Escolha um setor da lista para continuar.",
      })
      return
    }

    if (!whatsapp) {
      toast.warning("Informe seu WhatsApp.", {
        description: "Use um número com DDD para nossa equipe retornar.",
      })
      return
    }

    if (whatsappDigits.length < 10 || whatsappDigits.length > 11) {
      toast.error("WhatsApp inválido.", {
        description: "Informe o número com DDD, usando 10 ou 11 dígitos.",
      })
      return
    }

    setIsSubmitting(true)
    const response = await fetch("/api/password-recovery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, sector, whatsapp }),
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

    window.sessionStorage.setItem("recovery_email", email)
    window.sessionStorage.setItem(
      "recovery_whatsapp",
      result?.whatsapp ?? whatsapp
    )

    toast.success("Solicitação de recuperação enviada.", {
      description: "Confira na próxima tela os detalhes da recuperação.",
    })
    router.push("/forgot-password/success")
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
          <h1 className="text-2xl font-bold">Esqueceu sua senha?</h1>
          <p className="text-sm whitespace-nowrap text-muted-foreground">
            Preencha os dados para recuperar seu acesso
          </p>
        </div>
        <Field>
          <FieldLabel htmlFor="username">Nome do usuário</FieldLabel>
          <Input
            id="username"
            name="username"
            type="text"
            placeholder="Nome do usuário"
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
          <FieldDescription className="whitespace-nowrap">
            Use apenas seu e-mail institucional @unipar.br
          </FieldDescription>
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
          <FieldLabel htmlFor="whatsapp">Número de telefone do WhatsApp</FieldLabel>
          <Input
            id="whatsapp"
            name="whatsapp"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="(45) 99999-9999"
            required
            className="bg-background"
          />
        </Field>
        <Field>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Enviando..." : "Enviar solicitação"}
          </Button>
        </Field>
        <Field>
          <FieldDescription className="px-6 text-center">
            Lembrou sua senha? <Link href="/login">Entrar</Link>
          </FieldDescription>
        </Field>
        <AuthLegalLinks />
      </FieldGroup>
    </form>
  )
}
