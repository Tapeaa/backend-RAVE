/**
 * Colonnes loueur : abonnement RAVE + lieu de RDV par défaut.
 */
import { db } from "./db";
import { sql } from "drizzle-orm";

export async function ensureLoueurSubscriptionColumns(): Promise<void> {
  try {
    await db.execute(sql`
      ALTER TABLE drivers
      ADD COLUMN IF NOT EXISTS default_meeting_point TEXT
    `);
    await db.execute(sql`
      ALTER TABLE drivers
      ADD COLUMN IF NOT EXISTS subscription_plan TEXT
    `);
    await db.execute(sql`
      ALTER TABLE drivers
      ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'none'
    `);
    await db.execute(sql`
      ALTER TABLE drivers
      ADD COLUMN IF NOT EXISTS subscription_starts_at TIMESTAMP
    `);
    await db.execute(sql`
      ALTER TABLE drivers
      ADD COLUMN IF NOT EXISTS subscription_ends_at TIMESTAMP
    `);
    await db.execute(sql`
      ALTER TABLE drivers
      ADD COLUMN IF NOT EXISTS subscription_amount REAL
    `);
    await db.execute(sql`
      ALTER TABLE loueur_vehicles
      ADD COLUMN IF NOT EXISTS default_meeting_point TEXT
    `);
    console.log("[DB] ✅ Colonnes abonnement / RDV loueur OK");
  } catch (e) {
    console.warn("[DB] ensureLoueurSubscriptionColumns:", e);
  }
}

export const LOUEUR_SUBSCRIPTION_PLANS = {
  monthly: { id: "monthly" as const, label: "Mensuel", amountXpf: 5000, days: 30 },
  semiannual: { id: "semiannual" as const, label: "6 mois", amountXpf: 30000, days: 180 },
};
