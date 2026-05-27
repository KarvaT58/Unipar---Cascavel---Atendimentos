export type UploadedFilePayload = {
  id: string
  name: string
  url: string
  mimeType: string
  kind: "image" | "video" | "audio" | "document"
  size: number
  extension: string
}

function getResponseMessage(payload: unknown) {
  if (!payload || typeof payload !== "object" || !("message" in payload)) {
    return "Não foi possível enviar o arquivo."
  }

  const message = (payload as { message?: unknown }).message

  return typeof message === "string" ? message : "Não foi possível enviar o arquivo."
}

function isUploadedFilePayload(payload: unknown): payload is UploadedFilePayload {
  if (!payload || typeof payload !== "object") return false

  const record = payload as Record<string, unknown>

  return (
    typeof record.id === "string" &&
    typeof record.name === "string" &&
    typeof record.url === "string" &&
    typeof record.mimeType === "string" &&
    typeof record.kind === "string" &&
    ["image", "video", "audio", "document"].includes(record.kind) &&
    typeof record.size === "number" &&
    typeof record.extension === "string"
  )
}

export async function uploadFileAttachment(
  file: Blob,
  fileName?: string
): Promise<UploadedFilePayload> {
  const formData = new FormData()
  if (fileName) {
    formData.append("file", file, fileName)
  } else {
    formData.append("file", file)
  }

  const response = await fetch("/api/uploads", {
    method: "POST",
    body: formData,
  })
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(getResponseMessage(payload))
  }

  if (!isUploadedFilePayload(payload)) {
    throw new Error("Resposta inválida do servidor de uploads.")
  }

  return payload
}
