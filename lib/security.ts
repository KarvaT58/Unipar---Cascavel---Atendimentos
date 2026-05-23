import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto"

function getSecret() {
  const secret = process.env.SESSION_SECRET

  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET precisa ter pelo menos 32 caracteres.")
  }

  return secret
}

function getEncryptionKey() {
  return createHash("sha256").update(getSecret()).digest()
}

export function createRandomToken() {
  return randomBytes(32).toString("base64url")
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex")
}

export function hashSensitiveValue(value: string) {
  return createHmac("sha256", getSecret()).update(value).digest("hex")
}

export function encryptString(value: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv)
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()

  return [iv, tag, encrypted]
    .map((part) => part.toString("base64url"))
    .join(".")
}

export function decryptString(value: string) {
  const [ivValue, tagValue, encryptedValue] = value.split(".")

  if (!ivValue || !tagValue || !encryptedValue) {
    throw new Error("Valor criptografado inválido.")
  }

  const iv = Buffer.from(ivValue, "base64url")
  const tag = Buffer.from(tagValue, "base64url")
  const encrypted = Buffer.from(encryptedValue, "base64url")
  const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), iv)

  decipher.setAuthTag(tag)

  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]).toString("utf8")
}

export function secureCompare(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)

  if (leftBuffer.length !== rightBuffer.length) {
    return false
  }

  return timingSafeEqual(leftBuffer, rightBuffer)
}
