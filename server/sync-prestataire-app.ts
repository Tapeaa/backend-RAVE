/**
 * Synchronise le compte portail loueur (prestataires) vers le(s) compte(s) app (drivers).
 * Même logique que le sync du code 6 chiffres : 1 driver lié, ou même téléphone / code.
 */
import { eq, inArray } from "drizzle-orm";
import { db } from "./db";
import { drivers, prestataires } from "@shared/schema";
import { dbStorage } from "./db-storage";

export type LinkedDriverRow = {
  id: string;
  code: string;
  phone: string;
  firstName: string;
  lastName: string;
};

export function splitRaisonSociale(nom: string): { firstName: string; lastName: string } {
  const parts = nom.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "Loueur", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

export async function getLinkedAppDrivers(
  prestataireId: string,
  opts?: { matchCode?: string | null; matchPhone?: string | null }
): Promise<LinkedDriverRow[]> {
  const linked = await db
    .select({
      id: drivers.id,
      code: drivers.code,
      phone: drivers.phone,
      firstName: drivers.firstName,
      lastName: drivers.lastName,
    })
    .from(drivers)
    .where(eq(drivers.prestataireId, prestataireId));

  if (linked.length <= 1) return linked;

  const matchCode = opts?.matchCode?.trim() || null;
  const matchPhone = opts?.matchPhone?.trim() || null;

  return linked.filter(
    (d) =>
      (matchCode && d.code === matchCode) ||
      (matchPhone && d.phone === matchPhone)
  );
}

export type PrestataireAppSyncInput = {
  prestataireId: string;
  nom?: string | null;
  phone?: string | null;
  isActive?: boolean;
  /** Ancien code portail — pour cibler le driver principal en multi-chauffeurs */
  matchCode?: string | null;
};

/**
 * Pousse nom / téléphone / statut vers les comptes app liés.
 * Retourne le nombre de drivers mis à jour.
 */
export async function syncPrestataireToAppAccounts(
  input: PrestataireAppSyncInput
): Promise<{ synced: number; driverIds: string[] }> {
  const [prestataire] = await db
    .select()
    .from(prestataires)
    .where(eq(prestataires.id, input.prestataireId));

  if (!prestataire) return { synced: 0, driverIds: [] };

  const targets = await getLinkedAppDrivers(input.prestataireId, {
    matchCode: input.matchCode ?? prestataire.code,
    matchPhone: input.phone ?? prestataire.phone,
  });

  if (targets.length === 0) return { synced: 0, driverIds: [] };

  const driverPatch: Record<string, string | boolean> = {};
  let nameChanged = false;

  if (typeof input.nom === "string" && input.nom.trim()) {
    const { firstName, lastName } = splitRaisonSociale(input.nom);
    driverPatch.firstName = firstName;
    driverPatch.lastName = lastName;
    nameChanged = true;
  }

  if (typeof input.phone === "string" && input.phone.trim()) {
    const phone = input.phone.trim();
    const targetIds = targets.map((t) => t.id);
    const phoneOwners = await db
      .select({ id: drivers.id })
      .from(drivers)
      .where(eq(drivers.phone, phone));
    const conflictOutside = phoneOwners.find((o) => !targetIds.includes(o.id));
    if (!conflictOutside) {
      driverPatch.phone = phone;
    } else {
      console.warn(
        `[Sync] Skip phone sync for prestataire ${input.prestataireId}: phone already used by driver ${conflictOutside.id}`
      );
    }
  }

  if (typeof input.isActive === "boolean") {
    driverPatch.isActive = input.isActive;
  }

  if (Object.keys(driverPatch).length === 0) {
    return { synced: 0, driverIds: [] };
  }

  const ids = targets.map((t) => t.id);
  await db.update(drivers).set(driverPatch).where(inArray(drivers.id, ids));

  if (nameChanged && typeof driverPatch.firstName === "string") {
    const newName = `${driverPatch.firstName} ${driverPatch.lastName || ""}`.trim();
    const { storage } = await import("./storage");
    for (const id of ids) {
      await dbStorage.updateDriverNameInDbSessions(id, newName);
      await storage.updateDriverNameInSessions(id, newName);
    }
  }

  console.log(
    `[Sync] prestataire ${input.prestataireId} → ${ids.length} driver(s): ${Object.keys(driverPatch).join(", ")}`
  );

  return { synced: ids.length, driverIds: ids };
}

/**
 * Répare un écart déjà en base (dashboard à jour, app encore sur l'ancien nom).
 */
export async function healPrestataireAppNameIfNeeded(prestataireId: string): Promise<boolean> {
  const [prestataire] = await db
    .select({ nom: prestataires.nom, phone: prestataires.phone, code: prestataires.code })
    .from(prestataires)
    .where(eq(prestataires.id, prestataireId));

  if (!prestataire?.nom) return false;

  const targets = await getLinkedAppDrivers(prestataireId, {
    matchCode: prestataire.code,
    matchPhone: prestataire.phone,
  });

  if (targets.length === 0) return false;

  const expected = splitRaisonSociale(prestataire.nom);
  const needsHeal = targets.some(
    (d) => d.firstName !== expected.firstName || d.lastName !== expected.lastName
  );

  if (!needsHeal) return false;

  await syncPrestataireToAppAccounts({
    prestataireId,
    nom: prestataire.nom,
    phone: prestataire.phone,
    matchCode: prestataire.code,
  });
  return true;
}
