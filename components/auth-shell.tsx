import Image from "next/image"
import Link from "next/link"

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex justify-center gap-2 md:justify-start">
          <Link href="/login" className="flex items-center gap-3">
            <Image
              src="/logo.png"
              alt="Logo Unipar"
              width={44}
              height={44}
              priority
              className="size-11 object-contain"
            />
            <span className="grid text-left leading-tight">
              <span className="text-sm font-medium">Unipar - Cascavel</span>
              <span className="text-xs text-muted-foreground">
                Atendimentos
              </span>
            </span>
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center py-3">
          <div className="w-full max-w-md">{children}</div>
        </div>
      </div>
      <div className="relative hidden overflow-hidden bg-muted lg:block">
        <Image
          src="/login.png"
          alt="Atendente usando o sistema"
          fill
          priority
          sizes="50vw"
          className="scale-110 object-cover"
        />
      </div>
    </div>
  )
}
