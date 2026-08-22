/**
 * Anti-double-booking pour la location RAVE.
 * Vérifie chevauchement avec blocs admin + commandes rental actives.
 */

import { db } from "./db";
import { orders, vehicleAvailabilityBlocks } from "@shared/schema";
import { eq, ne, sql } from "drizzle-orm";

const INACTIVE_STATUSES = new Set(["cancelled"]);

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Chevauchement semi-ouvert [start, end) :
 * la fin d'une location libère le véhicule → une nouvelle résa peut commencer
 * exactement à l'heure de restitution (ex. fin 10h → début OK à 10h).
 */
export function datesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

export type BusyRange = {
  startDate: string;
  endDate: string;
  reason?: string | null;
  orderId?: string;
};

/** Plages occupées (commandes actives + blocs admin) pour un véhicule. */
export async function getVehicleBusyRanges(loueurVehicleId: string): Promise<BusyRange[]> {
  const ranges: BusyRange[] = [];

  const blocks = await db
    .select({
      startDate: vehicleAvailabilityBlocks.startDate,
      endDate: vehicleAvailabilityBlocks.endDate,
      reason: vehicleAvailabilityBlocks.reason,
    })
    .from(vehicleAvailabilityBlocks)
    .where(eq(vehicleAvailabilityBlocks.loueurVehicleId, loueurVehicleId));

  for (const block of blocks) {
    const bStart = parseDate(block.startDate);
    const bEnd = parseDate(block.endDate);
    if (!bStart || !bEnd) continue;
    ranges.push({
      startDate: bStart.toISOString(),
      endDate: bEnd.toISOString(),
      reason: block.reason || "Indisponible",
    });
  }

  const candidates = await db
    .select({
      id: orders.id,
      status: orders.status,
      rideOption: orders.rideOption,
    })
    .from(orders)
    .where(ne(orders.status, "cancelled"))
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
    if (!orderVehicleId || orderVehicleId !== loueurVehicleId) continue;

    const oStart =
      parseDate(ro.startDate) ||
      parseDate((ro.rental as any)?.startDate) ||
      parseDate((ro.rentalData as any)?.startDate);
    const oEnd =
      parseDate(ro.endDate) ||
      parseDate((ro.rental as any)?.endDate) ||
      parseDate((ro.rentalData as any)?.endDate);
    if (!oStart || !oEnd) continue;

    ranges.push({
      startDate: oStart.toISOString(),
      endDate: oEnd.toISOString(),
      reason: "Réservé",
      orderId: order.id,
    });
  }

  return ranges;
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
  if (end.getTime() <= start.getTime()) {
    return { ok: false, error: "La date de fin doit être après la date de début" };
  }

  const ranges = await getVehicleBusyRanges(params.loueurVehicleId);

  for (const range of ranges) {
    if (params.excludeOrderId && range.orderId === params.excludeOrderId) continue;
    const bStart = parseDate(range.startDate);
    const bEnd = parseDate(range.endDate);
    if (!bStart || !bEnd) continue;
    if (datesOverlap(start, end, bStart, bEnd)) {
      return {
        ok: false,
        error:
          range.reason && range.reason !== "Réservé"
            ? `Véhicule indisponible sur ces dates (${range.reason})`
            : "Désolé, ce véhicule est déjà réservé pour ces dates",
      };
    }
  }

  return { ok: true };
}
