import { db } from "./db";
import { sql } from "drizzle-orm";

export async function ensureCustomContractTextColumn() {
  try {
    console.log("[Migration] Vérification de la colonne custom_contract_text...");

    const checkColumn = await db.execute(sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'loueur_vehicles' 
      AND column_name = 'custom_contract_text'
    `);

    const hasColumn = (checkColumn.rows || []).length > 0;

    if (!hasColumn) {
      console.log("[Migration] Ajout de la colonne custom_contract_text...");
      await db.execute(sql`
        ALTER TABLE loueur_vehicles 
        ADD COLUMN IF NOT EXISTS custom_contract_text TEXT
      `);
      console.log("[Migration] Colonne custom_contract_text ajoutée");
    } else {
      console.log("[Migration] Colonne custom_contract_text existe déjà");
    }
  } catch (error) {
    console.error("[Migration] Erreur migration custom_contract_text:", error);
  }
}
