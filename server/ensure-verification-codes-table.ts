/**
 * Script pour créer la table verification_codes si elle n'existe pas
 * S'exécute au démarrage du serveur
 */

import { db } from "./db";
import { sql } from "drizzle-orm";

export async function ensureVerificationCodesTable() {
  try {
    // Vérifier si la table existe
    const tableExists = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'verification_codes'
      );
    `);

    // Neon DB retourne le résultat dans rows ou directement
    const rows = (tableExists as any).rows || tableExists;
    const exists = rows[0]?.exists === true || rows[0]?.exists === 't';

    if (!exists) {
      console.log("[DB] Création de la table verification_codes...");
      
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS verification_codes (
          id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid(),
          phone TEXT NOT NULL,
          code TEXT NOT NULL,
          type TEXT NOT NULL,
          expires_at TIMESTAMP NOT NULL,
          used_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT NOW() NOT NULL
        );
      `);

      // Créer les index
      await db.execute(sql`
        CREATE INDEX idx_verification_codes_phone ON verification_codes(phone);
      `);
      
      await db.execute(sql`
        CREATE INDEX idx_verification_codes_phone_type ON verification_codes(phone, type);
      `);
      
      await db.execute(sql`
        CREATE INDEX idx_verification_codes_expires_at ON verification_codes(expires_at);
      `);

      console.log("[DB] ✅ Table verification_codes créée avec succès");
    } else {
      console.log("[DB] ✅ Table verification_codes existe déjà");
    }
  } catch (error) {
    console.error("[DB] ❌ Erreur lors de la création de la table verification_codes:", error);
    // Ne pas bloquer le démarrage du serveur si la table existe déjà
    if (error instanceof Error && !error.message.includes("already exists")) {
      throw error;
    }
  }
}
