import { db } from "./db";
import { vehicleModels } from "@shared/schema";
import { TAHITI_VEHICLE_CATALOG } from "./tahiti-vehicle-catalog";
import { sql } from "drizzle-orm";

/**
 * Insère en base tous les modèles du catalogue Loueur manquants
 * (ids b-*), sans écraser photo / champs déjà renseignés.
 */
export async function syncTahitiVehicleCatalog(): Promise<{ inserted: number; total: number }> {
  const catalog = TAHITI_VEHICLE_CATALOG;
  if (!catalog.length) return { inserted: 0, total: 0 };

  // Tous les ids déjà en base (évite un gros IN (...))
  const existing = await db.select({ id: vehicleModels.id }).from(vehicleModels);
  const existingIds = new Set(existing.map((e) => e.id));

  const toInsert = catalog.filter((m) => m?.id && !existingIds.has(m.id));
  if (toInsert.length === 0) {
    return { inserted: 0, total: catalog.length };
  }

  let inserted = 0;
  const chunkSize = 25;
  for (let i = 0; i < toInsert.length; i += chunkSize) {
    const chunk = toInsert.slice(i, i + chunkSize);
    try {
      await db
        .insert(vehicleModels)
        .values(
          chunk.map((m) => ({
            id: m.id,
            name: m.name,
            category: m.category || "autre",
            seats: typeof m.seats === "number" ? m.seats : 5,
            transmission: m.transmission || "auto",
            fuel: m.fuel || "essence",
            imageUrl: null,
            description: null,
            isActive: true,
          })),
        )
        .onConflictDoNothing();
      inserted += chunk.length;
    } catch (err) {
      // Fallback ligne par ligne si un lot échoue
      console.warn(`[Catalog] Chunk insert failed at ${i}, falling back row-by-row:`, err);
      for (const m of chunk) {
        try {
          await db
            .insert(vehicleModels)
            .values({
              id: m.id,
              name: m.name,
              category: m.category || "autre",
              seats: typeof m.seats === "number" ? m.seats : 5,
              transmission: m.transmission || "auto",
              fuel: m.fuel || "essence",
              imageUrl: null,
              description: null,
              isActive: true,
            })
            .onConflictDoNothing();
          inserted += 1;
        } catch (rowErr) {
          console.warn(`[Catalog] Skip model ${m.id}:`, rowErr);
        }
      }
    }
  }

  // Recompte réel des ids catalogue présents
  const after = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(vehicleModels)
    .where(sql`${vehicleModels.id} like 'b-%'`);
  const catalogInDb = Number(after[0]?.n || 0);

  console.log(
    `[Catalog] Synced ~${inserted} insert attempt(s); catalog ids in DB=${catalogInDb}/${catalog.length}`,
  );
  return { inserted, total: catalog.length };
}
