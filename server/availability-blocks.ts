/**
 * Blocs d'indisponibilité manuels (résas hors app) sur loueur_vehicles.
 */
import { db } from "./db";
import { loueurVehicles, vehicleAvailabilityBlocks } from "@shared/schema";
import { and, desc, eq } from "drizzle-orm";

export type AvailabilityBlockRow = {
  id: string;
  loueurVehicleId: string;
  startDate: string;
  endDate: string;
  reason: string | null;
  createdBy: string;
  createdAt: string;
};

/** Dates UI inclusives (YYYY-MM-DD) → intervalle stocké [start, end) exclusif en fin. */
export function inclusiveYmdToExclusiveRange(startYmd: string, endYmd: string): {
  start: Date;
  end: Date;
} | { error: string } {
  const startRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!startRe.test(startYmd) || !startRe.test(endYmd)) {
    return { error: "Dates invalides (format AAAA-MM-JJ)" };
  }
  const start = new Date(`${startYmd}T00:00:00.000Z`);
  const endDay = new Date(`${endYmd}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(endDay.getTime())) {
    return { error: "Dates invalides" };
  }
  if (endDay.getTime() < start.getTime()) {
    return { error: "La date de fin doit être après ou égale au début" };
  }
  // Fin exclusive = lendemain de la dernière journée bloquée
  const end = new Date(endDay.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

function serializeBlock(row: typeof vehicleAvailabilityBlocks.$inferSelect): AvailabilityBlockRow {
  return {
    id: row.id,
    loueurVehicleId: row.loueurVehicleId,
    startDate: row.startDate.toISOString(),
    endDate: row.endDate.toISOString(),
    reason: row.reason,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listAvailabilityBlocks(loueurVehicleId: string): Promise<AvailabilityBlockRow[]> {
  const rows = await db
    .select()
    .from(vehicleAvailabilityBlocks)
    .where(eq(vehicleAvailabilityBlocks.loueurVehicleId, loueurVehicleId))
    .orderBy(desc(vehicleAvailabilityBlocks.startDate));
  return rows.map(serializeBlock);
}

export async function createAvailabilityBlock(input: {
  loueurVehicleId: string;
  startYmd: string;
  endYmd: string;
  reason?: string | null;
  createdBy: string;
}): Promise<{ ok: true; block: AvailabilityBlockRow } | { ok: false; error: string; status: number }> {
  const range = inclusiveYmdToExclusiveRange(input.startYmd, input.endYmd);
  if ("error" in range) {
    return { ok: false, error: range.error, status: 400 };
  }

  const reason =
    typeof input.reason === "string" && input.reason.trim()
      ? input.reason.trim().slice(0, 200)
      : "Réservation hors RAVE";

  const [created] = await db
    .insert(vehicleAvailabilityBlocks)
    .values({
      loueurVehicleId: input.loueurVehicleId,
      startDate: range.start,
      endDate: range.end,
      reason,
      createdBy: input.createdBy,
    })
    .returning();

  return { ok: true, block: serializeBlock(created) };
}

export async function deleteAvailabilityBlock(input: {
  blockId: string;
  loueurVehicleId: string;
}): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const [deleted] = await db
    .delete(vehicleAvailabilityBlocks)
    .where(
      and(
        eq(vehicleAvailabilityBlocks.id, input.blockId),
        eq(vehicleAvailabilityBlocks.loueurVehicleId, input.loueurVehicleId)
      )
    )
    .returning();
  if (!deleted) {
    return { ok: false, error: "Bloc introuvable", status: 404 };
  }
  return { ok: true };
}

export async function assertVehicleOwnedByPrestataire(
  loueurVehicleId: string,
  prestataireId: string
): Promise<boolean> {
  const [row] = await db
    .select({ id: loueurVehicles.id })
    .from(loueurVehicles)
    .where(
      and(eq(loueurVehicles.id, loueurVehicleId), eq(loueurVehicles.prestataireId, prestataireId))
    )
    .limit(1);
  return !!row;
}

export async function assertVehicleOwnedByDriver(
  loueurVehicleId: string,
  driverId: string,
  prestataireId?: string | null
): Promise<boolean> {
  const [row] = await db
    .select({
      id: loueurVehicles.id,
      driverId: loueurVehicles.driverId,
      prestataireId: loueurVehicles.prestataireId,
    })
    .from(loueurVehicles)
    .where(eq(loueurVehicles.id, loueurVehicleId))
    .limit(1);
  if (!row) return false;
  if (row.driverId && row.driverId === driverId) return true;
  if (prestataireId && row.prestataireId === prestataireId) return true;
  return false;
}

/** Pour affichage UI : convertir fin exclusive → dernier jour inclusif YYYY-MM-DD */
export function exclusiveEndToInclusiveYmd(endIso: string): string {
  const end = new Date(endIso);
  const inclusive = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  return inclusive.toISOString().slice(0, 10);
}
