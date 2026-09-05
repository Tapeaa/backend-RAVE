/**
 * Production secrets: fail-fast if critical env vars missing.
 * Dev keeps hardcoded fallbacks in admin-auth.ts.
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

  if (missing.length > 0) {
    console.error(
      `[FATAL] Production secrets missing: ${missing.join(", ")}. ` +
        `Set them on Render before starting.`
    );
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
}
