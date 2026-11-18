/**
 * Litiges (signalements) sur une location : catégories, délai et éligibilité.
 * Copie côté apps : Rave_client/lib/disputes.ts et Rave_Loueur/lib/disputes.ts.
 */

export const DISPUTE_WINDOW_DAYS = 14;

export const DISPUTE_CATEGORIES = [
  { id: "damage", label: "Dégâts sur le véhicule" },
  { id: "deposit", label: "Caution non rendue ou retenue" },
  { id: "vehicle_not_compliant", label: "Véhicule non conforme" },
  { id: "no_show", label: "Absence au rendez-vous" },
  { id: "extra_fees", label: "Frais contestés" },
  { id: "other", label: "Autre" },
] as const;

export type DisputeCategory = (typeof DISPUTE_CATEGORIES)[number]["id"];

export const DISPUTE_REASON_MIN = 10;
export const DISPUTE_REASON_MAX = 2000;

export function isDisputeCategory(value: unknown): value is DisputeCategory {
  return DISPUTE_CATEGORIES.some((c) => c.id === value);
}

export function disputeCategoryLabel(value: string | null | undefined): string {
  return DISPUTE_CATEGORIES.find((c) => c.id === value)?.label || "Autre";
}

/** Statuts de commande pour lesquels un litige a du sens (location acceptée au moins une fois). */
const DISPUTABLE_STATUSES = new Set(["accepted", "booked", "in_progress", "completed", "payment_confirmed", "cancelled"]);

export const OPEN_DISPUTE_STATUSES = ["open", "in_review"] as const;

export function disputeDeadline(order: { rideOption?: unknown; createdAt?: Date | string | null }): Date | null {
  const ro = (order.rideOption || {}) as { endDate?: string };
  const base = ro.endDate ? new Date(ro.endDate) : order.createdAt ? new Date(order.createdAt) : null;
  if (!base || Number.isNaN(base.getTime())) return null;
  return new Date(base.getTime() + DISPUTE_WINDOW_DAYS * 24 * 3600 * 1000);
}

export function canOpenDispute(
  order: { status: string; rideOption?: unknown; createdAt?: Date | string | null },
  now: Date = new Date(),
): { ok: true } | { ok: false; reason: string } {
  if (!DISPUTABLE_STATUSES.has(order.status)) {
    return { ok: false, reason: "Un litige n'est possible que sur une location acceptée par le loueur." };
  }
  const deadline = disputeDeadline(order);
  if (deadline && now > deadline) {
    return {
      ok: false,
      reason: `Le délai pour signaler un problème est dépassé (${DISPUTE_WINDOW_DAYS} jours après la fin de la location).`,
    };
  }
  return { ok: true };
}
