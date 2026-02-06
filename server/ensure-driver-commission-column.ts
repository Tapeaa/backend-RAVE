/**
 * Migration: Ajouter la colonne commission_chauffeur à la table drivers
 */

import { db } from "./db";
import { sql } from "drizzle-orm";

export async function ensureDriverCommissionColumn() {
  try {
    console.log("[Migration] Vérification de la colonne commission_chauffeur...");

    // Vérifier si la colonne existe
    const checkColumn = await db.execute(sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'drivers' 
      AND column_name = 'commission_chauffeur'
    `);

    const hasColumn = (checkColumn.rows || []).length > 0;

    if (!hasColumn) {
      console.log("[Migration] Ajout de la colonne commission_chauffeur...");
      await db.execute(sql`
        ALTER TABLE drivers 
        ADD COLUMN IF NOT EXISTS commission_chauffeur REAL DEFAULT 95
      `);
      console.log("[Migration] ✅ Colonne commission_chauffeur ajoutée (défaut: 95%)");
    } else {
      console.log("[Migration] ✅ Colonne commission_chauffeur existe déjà");
    }

    console.log("[Migration] ✅ Migration commission_chauffeur terminée");
  } catch (error) {
    console.error("[Migration] ❌ Erreur lors de la migration commission_chauffeur:", error);
    throw error;
  }
}
