/**
 * Migration script to ensure frais_service_config table exists
 * This table stores configurable service fees and commissions
 */

import { db } from "./db";
import { sql } from "drizzle-orm";

export async function ensureFraisServiceConfigTable() {
  try {
    console.log("[MIGRATION] Checking frais_service_config table...");

    // Check if table exists
    const tableExists = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'frais_service_config'
      );
    `);

    const exists = tableExists.rows?.[0]?.exists === true || tableExists.rows?.[0]?.exists === 't';

    if (!exists) {
      console.log("[MIGRATION] Creating frais_service_config table...");

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS frais_service_config (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          frais_service_prestataire REAL NOT NULL DEFAULT 15,
          commission_prestataire REAL NOT NULL DEFAULT 0,
          commission_salarie_tapea REAL NOT NULL DEFAULT 0,
          updated_at TIMESTAMP DEFAULT NOW() NOT NULL
        );
      `);

      // Insert default configuration
      await db.execute(sql`
        INSERT INTO frais_service_config (
          id, 
          frais_service_prestataire, 
          commission_prestataire, 
          commission_salarie_tapea
        ) VALUES (
          'default',
          15,
          0,
          0
        ) ON CONFLICT (id) DO NOTHING;
      `);

      console.log("[MIGRATION] frais_service_config table created with default values");
    } else {
      console.log("[MIGRATION] frais_service_config table already exists");
      
      // Ensure default row exists
      const defaultRow = await db.execute(sql`
        SELECT id FROM frais_service_config WHERE id = 'default';
      `);

      if (!defaultRow.rows || defaultRow.rows.length === 0) {
        await db.execute(sql`
          INSERT INTO frais_service_config (
            id, 
            frais_service_prestataire, 
            commission_prestataire, 
            commission_salarie_tapea
          ) VALUES (
            'default',
            15,
            0,
            0
          ) ON CONFLICT (id) DO NOTHING;
        `);
        console.log("[MIGRATION] Default frais_service_config row created");
      }
    }

    return true;
  } catch (error) {
    console.error("[MIGRATION] Error ensuring frais_service_config table:", error);
    return false;
  }
}
