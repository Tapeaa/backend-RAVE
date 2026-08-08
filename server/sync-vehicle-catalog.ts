import { db } from "./db";
import { vehicleModels } from "@shared/schema";
import { TAHITI_VEHICLE_CATALOG } from "./tahiti-vehicle-catalog";
import { inArray } from "drizzle-orm";

/**
 * Insère en base tous les modèles du catalogue Loueur manquants
 * (ids b-*), sans écraser photo / champs déjà renseignés.
 */
export async function syncTahitiVehicleCatalog(): Promise<{ inserted: number; total: number }> {
  const catalog = TAHITI_VEHICLE_CATALOG;
  if (!catalog.length) return { inserted: 0, total: 0 };

  const ids = catalog.map((m) => m.id);
  const existing = await db
    .select({ id: vehicleModels.id })
    .from(vehicleModels)
    .where(inArray(vehicleModels.id, ids));
  const existingIds = new Set(existing.map((e) => e.id));

  const toInsert = catalog.filter((m) => !existingIds.has(m.id));
  if (toInsert.length === 0) {
    return { inserted: 0, total: catalog.length };
  }

  // Insert par lots pour éviter des requêtes trop grosses
  const chunkSize = 50;
  for (let i = 0; i < toInsert.length; i += chunkSize) {
    const chunk = toInsert.slice(i, i + chunkSize);
    await db.insert(vehicleModels).values(
      chunk.map((m) => ({
        id: m.id,
        name: m.name,
        category: m.category,
        seats: m.seats ?? 5,
        transmission: m.transmission ?? "auto",
        fuel: m.fuel ?? "essence",
        imageUrl: null,
        description: null,
        isActive: true,
      })),
    );
  }

  console.log(`[Catalog] Synced ${toInsert.length} model(s) from Tahiti catalogue (${catalog.length} total)`);
  return { inserted: toInsert.length, total: catalog.length };
}
