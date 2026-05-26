import { randomUUID } from "node:crypto"
import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import {
  MAX_UPLOAD_FILE_SIZE_BYTES,
  MAX_UPLOAD_FILE_SIZE_MB,
} from "@/lib/upload-limits"

export const UPLOAD_ROUTE_PREFIX = "/api/uploads"

const DEFAULT_UPLOAD_DIR =
  process.env.NODE_ENV === "production"
    ? "/var/lib/unipar-atendimentos/uploads"
    : path.join(tmpdir(), "unipar-atendimentos", "uploads")

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/aac",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
])

const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/avif": ".avif",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
  "audio/mpeg": ".mp3",
  "audio/mp3": ".mp3",
  "audio/mp4": ".m4a",
  "audio/aac": ".aac",
  "audio/ogg": ".ogg",
  "audio/wav": ".wav",
  "audio/webm": ".webm",
  "application/pdf": ".pdf",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    ".docx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/vnd.ms-powerpoint": ".ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    ".pptx",
  "text/plain": ".txt",
}

export type UploadKind = "image" | "video" | "audio" | "document"

export type StoredUploadFile = {
  buffer: Buffer
  mimeType: string
  originalName: string
  size: number
  storedName: string
  kind: UploadKind
}

export function getUploadDirectory() {
  return process.env.UPLOAD_DIR?.trim() || DEFAULT_UPLOAD_DIR
}

export function getUploadKind(mimeType: string): UploadKind {
  if (mimeType.startsWith("image/")) return "image"
  if (mimeType.startsWith("video/")) return "video"
  if (mimeType.startsWith("audio/")) return "audio"

  return "document"
}

export function getUploadExtension(fileName: string, mimeType: string) {
  const extension = path.extname(fileName).toLowerCase()

  return extension || EXTENSION_BY_MIME_TYPE[mimeType] || ".bin"
}

export function validateUploadFile(file: File) {
  if (file.size <= 0) {
    throw new Error("Arquivo vazio.")
  }

  if (file.size > MAX_UPLOAD_FILE_SIZE_BYTES) {
    throw new Error(`Arquivo acima de ${MAX_UPLOAD_FILE_SIZE_MB} MB.`)
  }

  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    throw new Error("Tipo de arquivo nao permitido.")
  }
}

export async function storeUploadFile(file: File): Promise<StoredUploadFile> {
  validateUploadFile(file)

  const uploadDirectory = getUploadDirectory()
  const extension = getUploadExtension(file.name, file.type)
  const storedName = `${randomUUID()}${extension}`
  const buffer = Buffer.from(await file.arrayBuffer())

  await mkdir(/*turbopackIgnore: true*/ uploadDirectory, { recursive: true })
  await writeFile(
    /*turbopackIgnore: true*/ path.join(uploadDirectory, storedName),
    buffer,
    {
      flag: "wx",
    }
  )

  return {
    buffer,
    mimeType: file.type,
    originalName: file.name,
    size: file.size,
    storedName,
    kind: getUploadKind(file.type),
  }
}

export function getUploadUrl(uploadId: string) {
  return `${UPLOAD_ROUTE_PREFIX}/${encodeURIComponent(uploadId)}`
}

export async function readStoredUpload(storedName: string) {
  const uploadDirectory = getUploadDirectory()
  const filePath = path.join(uploadDirectory, path.basename(storedName))
  const [fileStat, buffer] = await Promise.all([
    stat(/*turbopackIgnore: true*/ filePath),
    readFile(/*turbopackIgnore: true*/ filePath),
  ])

  return {
    buffer,
    size: fileStat.size,
  }
}

export async function deleteStoredUpload(storedName: string) {
  const uploadDirectory = getUploadDirectory()
  const filePath = path.join(uploadDirectory, path.basename(storedName))

  await unlink(/*turbopackIgnore: true*/ filePath).catch(() => undefined)
}
