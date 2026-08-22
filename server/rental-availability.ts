/**
 * Anti-double-booking pour la location RAVE.
 * Vérifie chevauchement avec blocs admin + commandes rental actives.
 */

import { db } from "./db";
import { orders, vehicleAvailabilityBlocks } from "@shared/schema";
import { eq, inArray, ne, sql } from "drizzle-orm";

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

function extractRentalVehicleId(ro: Record<string, unknown>): string | null {
  return (
    (ro.loueurVehicleId as string | undefined) ||
    ((ro.rentalData as any)?.loueurVehicleId as string | undefined) ||
    ((ro.rentalDispatch as any)?.loueurVehicleId as string | undefined) ||
    null
  );
}

function extractRentalDates(ro: Record<string, unknown>): { start: Date; end: Date } | null {
  const oStart =
    parseDate(ro.startDate) ||
    parseDate((ro.rental as any)?.startDate) ||
    parseDate((ro.rentalData as any)?.startDate);
  const oEnd =
    parseDate(ro.endDate) ||
    parseDate((ro.rental as any)?.endDate) ||
    parseDate((ro.rentalData as any)?.endDate);
  if (!oStart || !oEnd) return null;
  return { start: oStart, end: oEnd };
}

/** Charge les plages occupées pour un ensemble de véhicules (1 passe commandes). */
export async function getBusyRangesMapForVehicles(
  loueurVehicleIds: string[]
): Promise<Map<string, BusyRange[]>> {
  const map = new Map<string, BusyRange[]>();
  const ids = Array.from(new Set(loueurVehicleIds.filter(Boolean)));
  for (const id of ids) map.set(id, []);
  if (ids.length === 0) return map;

  const idSet = new Set(ids);

  const blocks = await db
    .select({
      loueurVehicleId: vehicleAvailabilityBlocks.loueurVehicleId,
      startDate: vehicleAvailabilityBlocks.startDate,
      endDate: vehicleAvailabilityBlocks.endDate,
      reason: vehicleAvailabilityBlocks.reason,
    })
    .from(vehicleAvailabilityBlocks)
    .where(inArray(vehicleAvailabilityBlocks.loueurVehicleId, ids));

  for (const block of blocks) {
    const bStart = parseDate(block.startDate);
    const bEnd = parseDate(block.endDate);
    if (!bStart || !bEnd) continue;
    const list = map.get(block.loueurVehicleId);
    if (!list) continue;
    list.push({
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

    const orderVehicleId = extractRentalVehicleId(ro);
    if (!orderVehicleId || !idSet.has(orderVehicleId)) continue;

    const dates = extractRentalDates(ro);
    if (!dates) continue;

    const list = map.get(orderVehicleId);
    if (!list) continue;
    list.push({
      startDate: dates.start.toISOString(),
      endDate: dates.end.toISOString(),
      reason: "Réservé",
      orderId: order.id,
    });
  }

  return map;
}

/** Plages occupées (commandes actives + blocs admin) pour un véhicule. */
export async function getVehicleBusyRanges(loueurVehicleId: string): Promise<BusyRange[]> {
  const map = await getBusyRangesMapForVehicles([loueurVehicleId]);
  return map.get(loueurVehicleId) || [];
}

function rangesOverlapWindow(
  ranges: BusyRange[],
  start: Date,
  end: Date,
  excludeOrderId?: string
): BusyRange | null {
  for (const range of ranges) {
    if (excludeOrderId && range.orderId === excludeOrderId) continue;
    const bStart = parseDate(range.startDate);
    const bEnd = parseDate(range.endDate);
    if (!bStart || !bEnd) continue;
    if (datesOverlap(start, end, bStart, bEnd)) return range;
  }
  return null;
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
  const hit = rangesOverlapWindow(ranges, start, end, params.excludeOrderId);
  if (hit) {
    return {
      ok: false,
      error:
        hit.reason && hit.reason !== "Réservé"
          ? `Véhicule indisponible sur ces dates (${hit.reason})`
          : "Désolé, ce véhicule est déjà réservé pour ces dates",
    };
  }

  return { ok: true };
}

/** Filtre une liste d'ids libres sur [start, end). */
export async function filterVehicleIdsAvailableForRange(params: {
  loueurVehicleIds: string[];
  startDate: string | Date;
  endDate: string | Date;
}): Promise<Set<string>> {
  const start = parseDate(params.startDate);
  const end = parseDate(params.endDate);
  const free = new Set<string>();
  if (!start || !end || end.getTime() <= start.getTime()) return free;

  const map = await getBusyRangesMapForVehicles(params.loueurVehicleIds);
  for (const id of params.loueurVehicleIds) {
    const ranges = map.get(id) || [];
    if (!rangesOverlapWindow(ranges, start, end)) free.add(id);
  }
  return free;
}
