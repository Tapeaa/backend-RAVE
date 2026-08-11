/**
 * Ensure back-office extension tables exist (promos, wallet ledger, calendar blocks, admin users, disputes, audit).
 * Also adds clients.is_active for soft suspend.
 */

import { db } from "./db";
import { sql } from "drizzle-orm";

export async function ensureBackofficeTables() {
  try {
    console.log("[MIGRATION] Ensuring back-office extension tables...");

    await db.execute(sql`
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS promo_codes (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        code TEXT NOT NULL UNIQUE,
        description TEXT,
        discount_type TEXT NOT NULL,
        discount_value REAL NOT NULL,
        max_uses INTEGER,
        used_count INTEGER NOT NULL DEFAULT 0,
        min_order_amount REAL DEFAULT 0,
        starts_at TIMESTAMP,
        ends_at TIMESTAMP,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS wallet_transactions (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id VARCHAR NOT NULL REFERENCES clients(id),
        type TEXT NOT NULL,
        amount REAL NOT NULL,
        balance_after REAL NOT NULL,
        description TEXT NOT NULL,
        order_id VARCHAR,
        created_by_admin BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS vehicle_availability_blocks (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        loueur_vehicle_id VARCHAR NOT NULL REFERENCES loueur_vehicles(id),
        start_date TIMESTAMP NOT NULL,
        end_date TIMESTAMP NOT NULL,
        reason TEXT,
        created_by TEXT NOT NULL DEFAULT 'admin',
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS admin_users (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        hashed_password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'ops',
        is_active BOOLEAN NOT NULL DEFAULT true,
        last_login_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS disputes (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id VARCHAR NOT NULL REFERENCES orders(id),
        opened_by TEXT NOT NULL,
        reason TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        resolution TEXT,
        refund_amount REAL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        resolved_at TIMESTAMP
      );
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS admin_audit_logs (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        admin_id VARCHAR,
        admin_email TEXT,
        action TEXT NOT NULL,
        entity_type TEXT,
        entity_id TEXT,
        details JSONB,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);

    console.log("[MIGRATION] Back-office extension tables ready");
    return true;
  } catch (error) {
    console.error("[MIGRATION] Error ensuring back-office tables:", error);
    return false;
  }
}
