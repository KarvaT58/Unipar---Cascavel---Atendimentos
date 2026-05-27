import { NextResponse } from "next/server"

import { prisma } from "@/lib/prisma"
import { readStoredUpload } from "@/lib/server/uploads"
import { getSessionUser } from "@/lib/session"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

type UploadRouteContext = {
  params: Promise<{ id: string }> | { id: string }
}

function getInlineContentDisposition(fileName: string) {
  const fallbackName = fileName
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/["\\]/g, "_")

  return `inline; filename="${fallbackName}"; filename*=UTF-8''${encodeURIComponent(
    fileName
  )}`
}

export async function GET(_request: Request, context: UploadRouteContext) {
  const currentUser = await getSessionUser().catch(() => null)

  if (!currentUser) {
    return NextResponse.json(
      { message: "Sessão expirada. Faça login novamente." },
      { status: 401 }
    )
  }

  const { id } = await context.params
  const upload = await prisma.uploadFile.findUnique({
    where: { id },
  })

  if (!upload) {
    return NextResponse.json(
      { message: "Arquivo não encontrado." },
      { status: 404 }
    )
  }

  try {
    const storedFile = await readStoredUpload(upload.storedName)

    return new Response(new Uint8Array(storedFile.buffer), {
      headers: {
        "Cache-Control": "private, max-age=3600",
        "Content-Disposition": getInlineContentDisposition(upload.originalName),
        "Content-Length": String(storedFile.size),
        "Content-Type": upload.mimeType,
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch {
    return NextResponse.json(
      { message: "Arquivo não encontrado no armazenamento." },
      { status: 404 }
    )
  }
}
