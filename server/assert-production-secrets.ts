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
}
