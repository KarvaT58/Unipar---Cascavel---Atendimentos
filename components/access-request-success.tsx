"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowLeftIcon, CheckCircleIcon, PhoneIcon } from "lucide-react"

import { AuthLegalLinks } from "@/components/auth-legal-links"
import { Button } from "@/components/ui/button"

export function AccessRequestSuccess() {
  const requestPhone = React.useSyncExternalStore(
    () => () => {},
    () => window.sessionStorage.getItem("request_phone") ?? "",
    () => ""
  )

  const whatsappLabel = requestPhone || "o WhatsApp informado"

  return (
    <div className="flex flex-col gap-6 text-center">
      <div className="flex flex-col items-center gap-3">
        <div className="flex size-12 items-center justify-center rounded-full bg-primary/12 text-primary">
          <CheckCircleIcon className="size-6" />
        </div>
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold">Solicitação recebida</h1>
          <p className="text-sm leading-6 text-muted-foreground">
            Recebemos sua solicitação de acesso e nossa equipe irá verificar os
            dados informados. Se estiver tudo certo, seu acesso será liberado em
            até 24 horas.
          </p>
        </div>
      </div>

      <p className="text-sm leading-6 text-muted-foreground">
        Enviaremos as informações de acesso pelo WhatsApp informado assim que a
        verificação for concluída.
      </p>

      <div className="flex flex-col items-center gap-2">
        <div className="flex items-center justify-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
          <PhoneIcon className="size-4 text-primary" />
          WhatsApp informado
        </div>
        <p className="break-all text-center text-sm font-semibold text-foreground">
          {whatsappLabel}
        </p>
      </div>

      <Button render={<Link href="/login" />}>
        <ArrowLeftIcon />
        Voltar para o login
      </Button>

      <AuthLegalLinks className="mt-2" />
    </div>
  )
}
