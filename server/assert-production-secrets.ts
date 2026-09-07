/**
 * Production secrets: fail-fast if critical env vars missing.
 * Dev may use local .env ; never ship hardcoded secrets in source.
 */

export function assertProductionSecrets(): void {
  if (process.env.NODE_ENV !== "production") return;

  const missing: string[] = [];

  if (!process.env.JWT_SECRET && !process.env.SESSION_SECRET) {
    missing.push("JWT_SECRET (or SESSION_SECRET)");
  }
  if (!process.env.ADMIN_PASSWORD && !process.env.ADMIN_PASSWORD_HASH) {
    missing.push("ADMIN_PASSWORD (or ADMIN_PASSWORD_HASH)");
  }
  if (!process.env.ADMIN_SECRET) {
    missing.push("ADMIN_SECRET");
  }
  if (!process.env.ONESIGNAL_CLIENT_APP_ID) {
    missing.push("ONESIGNAL_CLIENT_APP_ID");
  }
  if (!process.env.ONESIGNAL_DRIVER_APP_ID) {
    missing.push("ONESIGNAL_DRIVER_APP_ID");
  }
  if (!process.env.ONESIGNAL_REST_API_KEY_CLIENT) {
    missing.push("ONESIGNAL_REST_API_KEY_CLIENT");
  }
  if (!process.env.ONESIGNAL_REST_API_KEY_DRIVER) {
    missing.push("ONESIGNAL_REST_API_KEY_DRIVER");
  }
  if (!process.env.CLOUDINARY_CLOUD_NAME) {
    missing.push("CLOUDINARY_CLOUD_NAME");
  }
  if (!process.env.CLOUDINARY_API_KEY) {
    missing.push("CLOUDINARY_API_KEY");
  }
  if (!process.env.CLOUDINARY_API_SECRET) {
    missing.push("CLOUDINARY_API_SECRET");
  }

  if (missing.length > 0) {
    console.error("============================================================");
    console.error("[FATAL] Production secrets missing — server will not start.");
    console.error(`Missing: ${missing.join(", ")}`);
    console.error("Add them in Render → Environment, then redeploy.");
    console.error("Required OneSignal names (not ONESIGNAL_APP_ID / ONESIGNAL_API_KEY):");
    console.error("  ONESIGNAL_CLIENT_APP_ID, ONESIGNAL_DRIVER_APP_ID,");
    console.error("  ONESIGNAL_REST_API_KEY_CLIENT, ONESIGNAL_REST_API_KEY_DRIVER");
    console.error("Required Cloudinary:");
    console.error("  CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET");
    console.error("============================================================");
    process.exit(1);
  }

  if (!process.env.OSB_CREDENTIALS_ENCRYPTION_KEY) {
    console.warn(
      "[WARN] OSB_CREDENTIALS_ENCRYPTION_KEY unset — les loueurs ne pourront pas enregistrer de certificat PayZen."
    );
  } else if (process.env.OSB_AWS_KMS_KEY_ID || process.env.AWS_KMS_KEY_ID) {
    console.log("[OSB] Envelope encryption + AWS KMS wrap activé");
  } else {
    console.log("[OSB] Envelope encryption locale (KEK env) — optionnel: OSB_AWS_KMS_KEY_ID pour KMS");
  }

  if (!process.env.YOUSIGN_API_KEY) {
    console.warn(
      "[WARN] YOUSIGN_API_KEY unset — la signature électronique Yousign sera indisponible."
    );
  }
}
