/**
 * Persiste une image (data URI / https) sur Cloudinary.
 * Refuse les file:// locaux (volatils) — retourne null.
 */
import { uploadToCloudinary } from "./cloudinary";

export function isEphemeralLocalUri(uri: string | null | undefined): boolean {
  if (!uri || typeof uri !== "string") return false;
  const u = uri.trim();
  return (
    u.startsWith("file:") ||
    u.startsWith("content:") ||
    u.startsWith("ph://") ||
    u.includes("/Caches/ImagePicker/") ||
    u.includes("/ImagePicker/")
  );
}

export function isDurableHttps(uri: string | null | undefined): boolean {
  if (!uri || typeof uri !== "string") return false;
  return /^https:\/\//i.test(uri.trim());
}

export function isDataImageUri(uri: string | null | undefined): boolean {
  if (!uri || typeof uri !== "string") return false;
  return /^data:image\//i.test(uri.trim());
}

/**
 * Convertit data URI → Buffer
 */
export function dataUriToBuffer(dataUri: string): { buffer: Buffer; mime: string } {
  const match = dataUri.match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) {
    throw new Error("Data URI invalide");
  }
  return {
    mime: match[1],
    buffer: Buffer.from(match[2], "base64"),
  };
}

/**
 * Garantit une URL https durable pour un permis / doc image.
 * - https → inchangé
 * - data:image → upload Cloudinary
 * - file:// / ImagePicker → null (non persistable)
 */
export async function persistImageUri(
  uri: string | null | undefined,
  folder = "rave/licenses"
): Promise<string | null> {
  if (!uri || typeof uri !== "string" || !uri.trim()) return null;
  const value = uri.trim();

  if (isDurableHttps(value)) return value;

  if (isEphemeralLocalUri(value)) {
    console.warn("[persistImageUri] Refus URI locale volatile:", value.slice(0, 80));
    return null;
  }

  if (isDataImageUri(value)) {
    try {
      const { buffer } = dataUriToBuffer(value);
      const result = await uploadToCloudinary(buffer, folder);
      return result.url;
    } catch (e) {
      console.error("[persistImageUri] Cloudinary upload failed:", e);
      return null;
    }
  }

  // Autre format inconnu — ne pas stocker tel quel si trop risqué
  console.warn("[persistImageUri] Format non géré, ignoré:", value.slice(0, 40));
  return null;
}

/**
 * Upload un HTML de contrat (snapshot) sur Cloudinary en resource_type raw.
 */
export async function persistContractHtml(
  html: string,
  orderId: string
): Promise<string | null> {
  try {
    const { v2: cloudinary } = await import("cloudinary");
    const buffer = Buffer.from(html, "utf-8");
    return await new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            folder: `rave/contracts`,
            public_id: `contrat-${orderId.slice(0, 8)}-${Date.now()}`,
            resource_type: "raw",
            format: "html",
          },
          (error, result) => {
            if (error || !result) {
              reject(error || new Error("Upload contrat vide"));
            } else {
              resolve(result.secure_url);
            }
          }
        )
        .end(buffer);
    });
  } catch (e) {
    console.error("[persistContractHtml] failed:", e);
    return null;
  }
}
