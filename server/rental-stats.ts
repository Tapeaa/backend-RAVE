/**
 * Agrégats stats location — partagés app Loueur + dashboard prestataire.
 * Les locations se terminent en `completed` (pas `payment_confirmed` taxi).
 */

export const RENTAL_PIPELINE_STATUSES = [
  "accepted",
  "booked",
  "completed",
  "payment_confirmed",
] as const;

export const RENTAL_DONE_STATUSES = ["completed", "payment_confirmed"] as const;

export function isRentalOrderLike(
  order: { rideOption?: unknown } | null | undefined
): boolean {
  const ro = order?.rideOption as { type?: string; isRentalOrder?: boolean } | undefined;
  return ro?.type === "rental" || ro?.isRentalOrder === true;
}

export function getDayStart(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Début de semaine calendaire (lundi 00:00). */
export function getWeekStartMonday(now = new Date()): Date {
  const todayStart = getDayStart(now);
  const dayOfWeek = now.getDay();
  const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - diffToMonday);
  return weekStart;
}

export function getMonthStart(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export type StatOrder = {
  status: string;
  totalPrice: number | null;
  createdAt: Date | string;
  rideOption?: unknown;
};

export type RentalEarningsAgg = {
  today: number;
  week: number;
  month: number;
  total: number;
  countToday: number;
  countWeek: number;
  countMonth: number;
  totalCount: number;
  completedCount: number;
  pipelineOrders: StatOrder[];
};

/**
 * Agrège le CA location sur totalPrice (driverEarnings taxi = 0 en location).
 * Pipeline = acceptées / réservées / terminées (aligné app Loueur).
 */
export function aggregateRentalEarnings(
  orders: StatOrder[],
  now = new Date()
): RentalEarningsAgg {
  const todayStart = getDayStart(now);
  const weekStart = getWeekStartMonday(now);
  const monthStart = getMonthStart(now);

  const pipelineOrders = orders.filter(
    (o) =>
      isRentalOrderLike(o) &&
      (RENTAL_PIPELINE_STATUSES as readonly string[]).includes(o.status)
  );

  let today = 0;
  let week = 0;
  let month = 0;
  let total = 0;
  let countToday = 0;
  let countWeek = 0;
  let countMonth = 0;

  for (const order of pipelineOrders) {
    const orderDate = new Date(order.createdAt);
    const amount = Number(order.totalPrice) || 0;
    total += amount;

    if (orderDate >= todayStart) {
      today += amount;
      countToday++;
    }
    if (orderDate >= weekStart) {
      week += amount;
      countWeek++;
    }
    if (orderDate >= monthStart) {
      month += amount;
      countMonth++;
    }
  }

  const completedCount = pipelineOrders.filter((o) =>
    (RENTAL_DONE_STATUSES as readonly string[]).includes(o.status)
  ).length;

  return {
    today: Math.round(today),
    week: Math.round(week),
    month: Math.round(month),
    total: Math.round(total),
    countToday,
    countWeek,
    countMonth,
    totalCount: pipelineOrders.length,
    completedCount,
    pipelineOrders,
  };
}
