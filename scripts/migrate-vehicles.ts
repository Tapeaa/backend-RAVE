import { neon } from "@neondatabase/serverless";
import "dotenv/config";

const sql = neon(process.env.DATABASE_URL!);

async function migrate() {
  console.log("Creating vehicle_models table...");
  await sql`
    CREATE TABLE IF NOT EXISTS vehicle_models (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      image_url TEXT,
      description TEXT,
      seats INTEGER NOT NULL DEFAULT 5,
      transmission TEXT NOT NULL DEFAULT 'auto',
      fuel TEXT NOT NULL DEFAULT 'essence',
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    )
  `;
  console.log("✅ vehicle_models created");

  console.log("Creating loueur_vehicles table...");
  await sql`
    CREATE TABLE IF NOT EXISTS loueur_vehicles (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      vehicle_model_id VARCHAR NOT NULL REFERENCES vehicle_models(id),
      prestataire_id VARCHAR NOT NULL REFERENCES prestataires(id),
      driver_id VARCHAR REFERENCES drivers(id),
      plate TEXT,
      price_per_day REAL NOT NULL,
      price_per_day_long_term REAL,
      available_for_rental BOOLEAN NOT NULL DEFAULT true,
      available_for_delivery BOOLEAN NOT NULL DEFAULT false,
      available_for_long_term BOOLEAN NOT NULL DEFAULT false,
      custom_image_url TEXT,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    )
  `;
  console.log("✅ loueur_vehicles created");

  console.log("Migration complete!");
}

migrate().catch(console.error);
