/**
 * Anti-double-booking pour la location RAVE.
 * Vérifie chevauchement avec blocs admin + commandes rental actives.
 */

import { db } from "./db";
import { orders, vehicleAvailabilityBlocks } from "@shared/schema";
import { and, eq, ne, sql } from "drizzle-orm";

const INACTIVE_STATUSES = new Set(["cancelled"]);

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Inclusive overlap: [aStart, aEnd] overlaps [bStart, bEnd] */
export function datesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() <= bEnd.getTime() && bStart.getTime() <= aEnd.getTime();
}

export async function assertVehicleAvailableForRental(params: {
  loueurVehicleId: string;
  startDate: string | Date;
  endDate: string | Date;
  excludeOrderId?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const start = parseDate(params.startDate);
  const end = parseDate(params.endDate);
  if (!start || !end) {
    return { ok: false, error: "Dates de location invalides" };
  }
  if (end.getTime() < start.getTime()) {
    return { ok: false, error: "La date de fin doit être après la date de début" };
  }

  const blocks = await db
    .select({
      id: vehicleAvailabilityBlocks.id,
      startDate: vehicleAvailabilityBlocks.startDate,
      endDate: vehicleAvailabilityBlocks.endDate,
      reason: vehicleAvailabilityBlocks.reason,
    })
    .from(vehicleAvailabilityBlocks)
    .where(eq(vehicleAvailabilityBlocks.loueurVehicleId, params.loueurVehicleId));

  for (const block of blocks) {
    const bStart = parseDate(block.startDate);
    const bEnd = parseDate(block.endDate);
    if (!bStart || !bEnd) continue;
    if (datesOverlap(start, end, bStart, bEnd)) {
      return {
        ok: false,
        error: block.reason
          ? `Véhicule indisponible sur ces dates (${block.reason})`
          : "Véhicule bloqué sur ces dates",
      };
    }
  }

  // Scan recent/active orders — ride_option JSONB holds loueurVehicleId + dates
  const candidates = await db
    .select({
      id: orders.id,
      status: orders.status,
      rideOption: orders.rideOption,
    })
    .from(orders)
    .where(
      params.excludeOrderId
        ? and(ne(orders.status, "cancelled"), ne(orders.id, params.excludeOrderId))
        : ne(orders.status, "cancelled")
    )
    .orderBy(sql`${orders.createdAt} DESC`)
    .limit(800);

  for (const order of candidates) {
    if (INACTIVE_STATUSES.has(order.status)) continue;
    const ro = (order.rideOption || {}) as Record<string, unknown>;
    const isRental =
      ro.type === "rental" ||
      ro.isRentalOrder === true ||
      String(ro.id || "").startsWith("rental-");
    if (!isRental) continue;

    const orderVehicleId =
      (ro.loueurVehicleId as string | undefined) ||
      ((ro.rentalData as any)?.loueurVehicleId as string | undefined) ||
      ((ro.rentalDispatch as any)?.loueurVehicleId as string | undefined);
    if (!orderVehicleId || orderVehicleId !== params.loueurVehicleId) continue;

    const oStart = parseDate(ro.startDate);
    const oEnd = parseDate(ro.endDate);
    if (!oStart || !oEnd) continue;

    if (datesOverlap(start, end, oStart, oEnd)) {
      return {
        ok: false,
        error: "Ce véhicule est déjà réservé sur ces dates",
      };
    }
  }

  return { ok: true };
}
