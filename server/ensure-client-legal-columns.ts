/**
 * Script pour ajouter les colonnes CGU à la table clients si elles n'existent pas
 * S'exécute au démarrage du serveur
 */

import { db } from "./db";
import { sql } from "drizzle-orm";

export async function ensureClientLegalColumns() {
  try {
    console.log("[DB] Vérification des colonnes CGU dans la table clients...");

    // Vérifier si la colonne cgu_accepted existe
    const columnExists = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'clients'
        AND column_name = 'cgu_accepted'
      );
    `);

    const exists = (columnExists as any)[0]?.exists;

    if (!exists) {
      console.log("[DB] Ajout des colonnes CGU à la table clients...");
      
      // Ajouter les colonnes une par une pour éviter les erreurs si certaines existent déjà
      const columns = [
        { name: 'cgu_accepted', type: 'BOOLEAN DEFAULT FALSE' },
        { name: 'cgu_accepted_at', type: 'TIMESTAMP' },
        { name: 'cgu_version', type: 'TEXT' },
        { name: 'privacy_policy_read', type: 'BOOLEAN DEFAULT FALSE' },
        { name: 'privacy_policy_read_at', type: 'TIMESTAMP' },
        { name: 'privacy_policy_version', type: 'TEXT' },
      ];

      for (const col of columns) {
        try {
          await db.execute(sql.raw(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS ${col.name} ${col.type};`));
          console.log(`[DB] ✅ Colonne ${col.name} ajoutée ou existe déjà`);
        } catch (colError: any) {
          // Ignorer si la colonne existe déjà
          if (!colError.message?.includes('already exists')) {
            console.error(`[DB] ⚠️ Erreur pour la colonne ${col.name}:`, colError.message);
          }
        }
      }

      console.log("[DB] ✅ Colonnes CGU ajoutées à la table clients");
    } else {
      console.log("[DB] ✅ Colonnes CGU existent déjà dans la table clients");
    }
  } catch (error) {
    console.error("[DB] ❌ Erreur lors de l'ajout des colonnes CGU clients:", error);
    // Ne pas bloquer le démarrage du serveur
  }
}
