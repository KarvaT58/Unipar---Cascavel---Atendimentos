import { AuthFormTransition } from "@/components/auth-form-transition"
import { AuthShell } from "@/components/auth-shell"

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AuthShell>
      <AuthFormTransition>{children}</AuthFormTransition>
    </AuthShell>
  )
}
