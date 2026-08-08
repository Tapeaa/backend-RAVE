import { db } from "./db";
import { homeCategories } from "@shared/schema";
import { sql } from "drizzle-orm";

const DEFAULTS = [
  {
    id: "classique",
    label: "Classique",
    priceRange: "5 000 – 8 000 XPF / jour",
    model: "Renault Captur",
    position: 0,
  },
  {
    id: "xl",
    label: "Modèle XL",
    priceRange: "10 000 – 15 000 XPF / jour",
    model: "Mercedes Classe V",
    position: 1,
  },
  {
    id: "service-plus",
    label: "Service +",
    priceRange: "18 000 – 25 000 XPF / jour",
    model: "BMW X5 xDrive40i",
    position: 2,
  },
] as const;

export async function ensureHomeCategoriesTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS home_categories (
      id VARCHAR PRIMARY KEY,
      label TEXT NOT NULL,
      image_url TEXT,
      price_range TEXT,
      model TEXT,
      position INTEGER NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT true,
      updated_at TIMESTAMP NOT NULL DEFAULT now()
    )
  `);

  for (const row of DEFAULTS) {
    await db
      .insert(homeCategories)
      .values({
        id: row.id,
        label: row.label,
        priceRange: row.priceRange,
        model: row.model,
        position: row.position,
        imageUrl: null,
        isActive: true,
      })
      .onConflictDoNothing();
  }

  console.log("[DB] home_categories ready (3 accueil options)");
}
