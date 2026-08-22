/**
 * Colonne listing_extras (termes fiche véhicule) sur loueur_vehicles
 */

import { db } from "./db";
import { sql } from "drizzle-orm";

export async function ensureListingExtrasColumn() {
  try {
    console.log("[MIGRATION] Ensuring listing_extras on loueur_vehicles...");

    await db.execute(sql`
      ALTER TABLE loueur_vehicles
      ADD COLUMN IF NOT EXISTS listing_extras JSONB DEFAULT '{}'::jsonb;
    `);

    console.log("[MIGRATION] listing_extras ready");
    return true;
  } catch (error) {
    console.error("[MIGRATION] Error ensuring listing_extras:", error);
    return false;
  }
}
