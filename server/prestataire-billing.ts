/**
 * Profil facturation prestataire (adresse + TVA) requis pour opérer.
 */
import { db } from "./db";
import { prestataires, drivers, loueurVehicles } from "@shared/schema";
import { eq } from "drizzle-orm";
import { isBillingProfileComplete } from "@shared/tva";

export async function getPrestataireBillingById(prestataireId: string) {
  const [p] = await db.select().from(prestataires).where(eq(prestataires.id, prestataireId)).limit(1);
  return p || null;
}

export async function resolvePrestataireIdForDriver(driverId: string): Promise<string | null> {
  const [d] = await db
    .select({ prestataireId: drivers.prestataireId })
    .from(drivers)
    .where(eq(drivers.id, driverId))
    .limit(1);
  return d?.prestataireId || null;
}

export async function resolvePrestataireIdForVehicle(loueurVehicleId: string): Promise<string | null> {
  const [v] = await db
    .select({ prestataireId: loueurVehicles.prestataireId, driverId: loueurVehicles.driverId })
    .from(loueurVehicles)
    .where(eq(loueurVehicles.id, loueurVehicleId))
    .limit(1);
  if (!v) return null;
  if (v.prestataireId) return v.prestataireId;
  if (v.driverId) return resolvePrestataireIdForDriver(v.driverId);
  return null;
}

export async function assertPrestataireBillingComplete(prestataireId: string): Promise<
  | { ok: true; prestataire: any }
  | { ok: false; status: number; error: string; code: string; missing: string[] }
> {
  const p = await getPrestataireBillingById(prestataireId);
  if (!p) {
    return {
      ok: false,
      status: 404,
      error: "Compte loueur introuvable",
      code: "PRESTATAIRE_NOT_FOUND",
      missing: [],
    };
  }
  const check = isBillingProfileComplete({
    nom: p.nom,
    phone: p.phone,
    numeroTahiti: p.numeroTahiti,
    address: (p as any).address,
    tvaRegime: (p as any).tvaRegime,
    tvaRate: (p as any).tvaRate,
    tvaMode: (p as any).tvaMode,
  });
  if (!check.ok) {
    return {
      ok: false,
      status: 403,
      error: `Profil facturation incomplet : ${check.missing.join(", ")}. Complétez-le dans Profil pour utiliser RAVE.`,
      code: "BILLING_PROFILE_INCOMPLETE",
      missing: check.missing,
    };
  }
  return { ok: true, prestataire: p };
}
