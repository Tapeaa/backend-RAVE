/**
 * Colonnes tarif dégressif sur loueur_vehicles
 */

import { db } from "./db";
import { sql } from "drizzle-orm";

export async function ensurePricingTiersColumns() {
  try {
    console.log("[MIGRATION] Ensuring pricing tiers columns on loueur_vehicles...");

    await db.execute(sql`
      ALTER TABLE loueur_vehicles
      ADD COLUMN IF NOT EXISTS pricing_tiers JSONB DEFAULT '[]'::jsonb;
    `);

    await db.execute(sql`
      ALTER TABLE loueur_vehicles
      ADD COLUMN IF NOT EXISTS max_rental_days INTEGER NOT NULL DEFAULT 90;
    `);

    // Backfill : un palier unique 1→max à partir du prix/jour legacy
    await db.execute(sql`
      UPDATE loueur_vehicles
      SET pricing_tiers = jsonb_build_array(
        jsonb_build_object(
          'fromDay', 1,
          'toDay', COALESCE(max_rental_days, 90),
          'pricePerDay', ROUND(price_per_day::numeric)::int
        )
      )
      WHERE (pricing_tiers IS NULL OR pricing_tiers = '[]'::jsonb)
        AND price_per_day IS NOT NULL
        AND price_per_day > 0;
    `);

    console.log("[MIGRATION] pricing_tiers / max_rental_days ready");
    return true;
  } catch (error) {
    console.error("[MIGRATION] Error ensuring pricing tiers columns:", error);
    return false;
  }
}
