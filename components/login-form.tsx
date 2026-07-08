"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { PasswordInput } from "@/components/password-input"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"form">) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const formData = new FormData(event.currentTarget)
    const email = String(formData.get("email") ?? "").trim()
    const password = String(formData.get("password") ?? "")

    if (!email || !password) {
      toast.warning("Preencha e-mail e senha.", {
        description: "Use seu e-mail @unipar.br e informe sua senha.",
      })
      return
    }

    if (!email.toLowerCase().endsWith("@unipar.br")) {
      toast.error("E-mail inválido.", {
        description: "Acesse usando seu e-mail institucional @unipar.br.",
      })
      return
    }

    if (password.length < 8) {
      toast.error("Senha incorreta.", {
        description: "A senha deve ter pelo menos 8 caracteres.",
      })
      return
    }

    setIsSubmitting(true)
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }).catch(() => null)
    setIsSubmitting(false)

    if (!response?.ok) {
      const result = await response?.json().catch(() => null)

      toast.error("Não foi possível entrar.", {
        description:
          result?.message ?? "Verifique os dados informados e tente novamente.",
      })
      return
    }

    toast.success("Conectado com sucesso.", {
      description: "Você está entrando no sistema.",
    })
    router.push("/dashboard")
    router.refresh()
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
          <h1 className="text-2xl font-bold">Entrar na sua conta</h1>
          <p className="text-sm text-muted-foreground">
            Preencha os campos para acessar sua conta
          </p>
        </div>
        <Field>
          <FieldLabel htmlFor="email">E-mail</FieldLabel>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="E-mail"
            required
          />
        </Field>
        <Field>
          <div className="flex items-center justify-between gap-3">
            <FieldLabel htmlFor="password">Senha</FieldLabel>
            <Link
              href="/forgot-password"
              className="text-sm font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
            >
              Esqueceu sua senha?
            </Link>
          </div>
          <PasswordInput id="password" name="password" required />
        </Field>
        <Field>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Entrando..." : "Entrar"}
          </Button>
        </Field>
        <Field>
          <FieldDescription className="text-center">
            Ainda não tem uma conta?{" "}
            <Link href="/signup" className="underline underline-offset-4">
              Solicite acesso
            </Link>
          </FieldDescription>
        </Field>
      </FieldGroup>
    </form>
  )
}
