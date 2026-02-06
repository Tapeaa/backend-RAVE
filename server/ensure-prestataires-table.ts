/**
 * Script pour créer les tables prestataires et collecte_frais si elles n'existent pas
 * Ajoute également la colonne prestataire_id à la table drivers
 * S'exécute au démarrage du serveur
 */

import { db } from "./db";
import { sql } from "drizzle-orm";

export async function ensurePrestatairesTable() {
  try {
    console.log("[DB] Vérification des tables prestataires...");

    // Vérifier si la table prestataires existe
    const prestataireTableExists = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'prestataires'
      );
    `);

    // Neon DB retourne le résultat dans rows ou directement
    const rows = (prestataireTableExists as any).rows || prestataireTableExists;
    const prestataireExists = rows[0]?.exists === true || rows[0]?.exists === 't';

    if (!prestataireExists) {
      console.log("[DB] Création de la table prestataires...");
      
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS prestataires (
          id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid(),
          nom TEXT NOT NULL,
          type TEXT NOT NULL,
          numero_tahiti TEXT,
          email TEXT,
          phone TEXT,
          code TEXT NOT NULL,
          is_active BOOLEAN DEFAULT TRUE NOT NULL,
          created_at TIMESTAMP DEFAULT NOW() NOT NULL
        );
      `);

      // Créer index sur le code pour la recherche rapide
      await db.execute(sql`
        CREATE INDEX idx_prestataires_code ON prestataires(code);
      `);

      console.log("[DB] ✅ Table prestataires créée avec succès");
    } else {
      console.log("[DB] ✅ Table prestataires existe déjà");

      // Ajouter les colonnes documents si elles n'existent pas
      const addDocCol = async (col: string) => {
        const colCheck = await db.execute(sql`
          SELECT EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'prestataires' AND column_name = ${col}
          );
        `);
        const cRows = (colCheck as any).rows || colCheck;
        if (!(cRows[0]?.exists === true || cRows[0]?.exists === 't')) {
          await db.execute(sql.raw(`ALTER TABLE prestataires ADD COLUMN IF NOT EXISTS ${col} TEXT`));
          console.log(`[DB] ✅ Colonne ${col} ajoutée à prestataires`);
        }
      };
      await addDocCol('doc_numero_tahiti');
      await addDocCol('doc_attestation_qualification');
      await addDocCol('doc_licence_transport');
      await addDocCol('doc_assurance_pro');
    }

    // Vérifier si la colonne prestataire_id existe dans drivers
    const prestataireIdExists = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'drivers'
        AND column_name = 'prestataire_id'
      );
    `);

    const colRows = (prestataireIdExists as any).rows || prestataireIdExists;
    const colExists = colRows[0]?.exists === true || colRows[0]?.exists === 't';

    if (!colExists) {
      console.log("[DB] Ajout de la colonne prestataire_id à la table drivers...");
      
      await db.execute(sql`
        ALTER TABLE drivers ADD COLUMN IF NOT EXISTS prestataire_id VARCHAR(255) REFERENCES prestataires(id);
      `);

      console.log("[DB] ✅ Colonne prestataire_id ajoutée à drivers");
    } else {
      console.log("[DB] ✅ Colonne prestataire_id existe déjà dans drivers");
    }

    // Vérifier si la table collecte_frais existe
    const collecteTableExists = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'collecte_frais'
      );
    `);

    const collecteRows = (collecteTableExists as any).rows || collecteTableExists;
    const collecteExists = collecteRows[0]?.exists === true || collecteRows[0]?.exists === 't';

    if (!collecteExists) {
      console.log("[DB] Création de la table collecte_frais...");
      
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS collecte_frais (
          id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid(),
          prestataire_id VARCHAR(255) REFERENCES prestataires(id),
          driver_id VARCHAR(255) REFERENCES drivers(id),
          periode TEXT NOT NULL,
          montant_du REAL NOT NULL,
          montant_paye REAL DEFAULT 0,
          is_paid BOOLEAN DEFAULT FALSE,
          paid_at TIMESTAMP,
          marked_by_admin_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT NOW() NOT NULL
        );
      `);

      // Créer index pour les requêtes fréquentes
      await db.execute(sql`
        CREATE INDEX idx_collecte_frais_prestataire ON collecte_frais(prestataire_id);
      `);
      
      await db.execute(sql`
        CREATE INDEX idx_collecte_frais_driver ON collecte_frais(driver_id);
      `);
      
      await db.execute(sql`
        CREATE INDEX idx_collecte_frais_periode ON collecte_frais(periode);
      `);

      console.log("[DB] ✅ Table collecte_frais créée avec succès");
    } else {
      console.log("[DB] ✅ Table collecte_frais existe déjà");
      
      // Vérifier si la colonne order_ids existe, sinon l'ajouter
      const orderIdsColumnExists = await db.execute(sql`
        SELECT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_name = 'collecte_frais' 
          AND column_name = 'order_ids'
        );
      `);
      
      const orderIdsRows = (orderIdsColumnExists as any).rows || orderIdsColumnExists;
      const orderIdsExists = orderIdsRows[0]?.exists === true || orderIdsRows[0]?.exists === 't';
      
      if (!orderIdsExists) {
        console.log("[DB] Ajout de la colonne order_ids à collecte_frais...");
        await db.execute(sql`
          ALTER TABLE collecte_frais ADD COLUMN IF NOT EXISTS order_ids JSONB DEFAULT '[]'::jsonb;
        `);
        console.log("[DB] ✅ Colonne order_ids ajoutée");
      }
    }

  } catch (error) {
    console.error("[DB] ❌ Erreur lors de la création des tables prestataires:", error);
    // Ne pas bloquer le démarrage du serveur
  }
}
