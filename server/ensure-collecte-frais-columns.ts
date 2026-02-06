/**
 * Migration: Ajouter les colonnes frais_service et commission_supplementaire à collecte_frais
 */

import { db } from "./db";
import { sql } from "drizzle-orm";

export async function ensureCollecteFraisColumns() {
  try {
    console.log("[Migration] Vérification des colonnes collecte_frais...");

    // Vérifier si les colonnes existent
    const checkColumns = await db.execute(sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'collecte_frais' 
      AND column_name IN ('frais_service', 'commission_supplementaire')
    `);

    const existingColumns = (checkColumns.rows || []).map((row: any) => row.column_name);
    const hasFraisService = existingColumns.includes('frais_service');
    const hasCommissionSupplementaire = existingColumns.includes('commission_supplementaire');

    // Ajouter frais_service si elle n'existe pas
    if (!hasFraisService) {
      console.log("[Migration] Ajout de la colonne frais_service...");
      await db.execute(sql`
        ALTER TABLE collecte_frais 
        ADD COLUMN IF NOT EXISTS frais_service REAL DEFAULT 0
      `);
      console.log("[Migration] ✅ Colonne frais_service ajoutée");
    } else {
      console.log("[Migration] ✅ Colonne frais_service existe déjà");
    }

    // Ajouter commission_supplementaire si elle n'existe pas
    if (!hasCommissionSupplementaire) {
      console.log("[Migration] Ajout de la colonne commission_supplementaire...");
      await db.execute(sql`
        ALTER TABLE collecte_frais 
        ADD COLUMN IF NOT EXISTS commission_supplementaire REAL DEFAULT 0
      `);
      console.log("[Migration] ✅ Colonne commission_supplementaire ajoutée");
    } else {
      console.log("[Migration] ✅ Colonne commission_supplementaire existe déjà");
    }

    console.log("[Migration] ✅ Colonnes collecte_frais vérifiées avec succès");
  } catch (error) {
    console.error("[Migration] ❌ Erreur lors de la migration collecte_frais:", error);
    throw error;
  }
}
