/**
 * Colonnes OSB / PayZen sur prestataires (credentials multi-tenant).
 */
import { db } from "./db";
import { sql } from "drizzle-orm";

export async function ensureOsbCredentialsColumns(): Promise<void> {
  try {
    await db.execute(sql`
      ALTER TABLE prestataires
      ADD COLUMN IF NOT EXISTS osb_shop_id TEXT
    `);
    await db.execute(sql`
      ALTER TABLE prestataires
      ADD COLUMN IF NOT EXISTS osb_certificate_encrypted TEXT
    `);
    await db.execute(sql`
      ALTER TABLE prestataires
      ADD COLUMN IF NOT EXISTS osb_public_key TEXT
    `);
    console.log("[DB] ✅ Colonnes OSB / PayZen prestataires OK");
  } catch (e) {
    console.warn("[DB] ensureOsbCredentialsColumns:", e);
  }
}
