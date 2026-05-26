import { NextResponse } from "next/server"

import { prisma } from "@/lib/prisma"
import { getSessionUser } from "@/lib/session"
import {
  deleteStoredUpload,
  getUploadExtension,
  getUploadUrl,
  type StoredUploadFile,
  storeUploadFile,
} from "@/lib/server/uploads"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(request: Request) {
  const currentUser = await getSessionUser().catch(() => null)

  if (!currentUser) {
    return NextResponse.json(
      { message: "Sessao expirada. Faca login novamente." },
      { status: 401 }
    )
  }

  let storedFile: StoredUploadFile | null = null

  try {
    const formData = await request.formData()
    const file = formData.get("file")

    if (!(file instanceof File)) {
      return NextResponse.json(
        { message: "Envie um arquivo valido." },
        { status: 400 }
      )
    }

    storedFile = await storeUploadFile(file)
    const upload = await prisma.uploadFile.create({
      data: {
        ownerId: currentUser.id,
        originalName: storedFile.originalName,
        storedName: storedFile.storedName,
        mimeType: storedFile.mimeType,
        kind: storedFile.kind,
        size: storedFile.size,
      },
    })

    return NextResponse.json({
      id: upload.id,
      name: upload.originalName,
      url: getUploadUrl(upload.id),
      mimeType: upload.mimeType,
      kind: upload.kind,
      size: upload.size,
      extension: getUploadExtension(upload.originalName, upload.mimeType)
        .replace(/^\./, "")
        .toUpperCase(),
    })
  } catch (error) {
    if (storedFile) {
      await deleteStoredUpload(storedFile.storedName)
    }

    const message =
      error instanceof Error ? error.message : "Nao foi possivel enviar o arquivo."

    return NextResponse.json({ message }, { status: 400 })
  }
}
