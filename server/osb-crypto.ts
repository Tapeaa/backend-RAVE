/**
 * Chiffrement AES-256-GCM pour le certificat OSB/PayZen des loueurs.
 * Clé : OSB_CREDENTIALS_ENCRYPTION_KEY (32 bytes en hex 64 chars, ou base64).
 */
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

function resolveEncryptionKey(): Buffer | null {
  const raw = (process.env.OSB_CREDENTIALS_ENCRYPTION_KEY || "").trim();
  if (!raw) return null;

  // Hex 64 chars = 32 bytes
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }

  // Base64 → 32 bytes
  try {
    const b = Buffer.from(raw, "base64");
    if (b.length === 32) return b;
  } catch {
    /* fallthrough */
  }

  // Derive 32 bytes from any passphrase (dev convenience)
  return createHash("sha256").update(raw, "utf8").digest();
}

export function isOsbEncryptionConfigured(): boolean {
  return !!resolveEncryptionKey();
}

/**
 * Format stocké : base64(iv || tag || ciphertext)
 */
export function encryptOsbCertificate(plain: string): string {
  const key = resolveEncryptionKey();
  if (!key) {
    throw new Error(
      "OSB_CREDENTIALS_ENCRYPTION_KEY manquante — impossible de chiffrer le certificat OSB"
    );
  }
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptOsbCertificate(encrypted: string): string {
  const key = resolveEncryptionKey();
  if (!key) {
    throw new Error(
      "OSB_CREDENTIALS_ENCRYPTION_KEY manquante — impossible de déchiffrer le certificat OSB"
    );
  }
  const buf = Buffer.from(encrypted, "base64");
  if (buf.length < IV_LEN + TAG_LEN + 1) {
    throw new Error("Certificat OSB chiffré invalide");
  }
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const data = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export function prestataireHasOsbCredentials(row: {
  osbShopId?: string | null;
  osbCertificateEncrypted?: string | null;
}): boolean {
  return !!(
    row.osbShopId &&
    String(row.osbShopId).trim() &&
    row.osbCertificateEncrypted &&
    String(row.osbCertificateEncrypted).trim()
  );
}
