/**
 * Statut d'une réservation affiché dans le back-office (loueur et admin).
 * Même règles que les apps mobiles : une seule source pour la liste, le tableau de bord et le détail.
 */

export type StatusTone = 'green' | 'blue' | 'amber' | 'red' | 'gray';

export type RentalStatusDisplay = {
  label: string;
  /** Titre plus explicite pour la page de détail */
  title: string;
  tone: StatusTone;
  closed: boolean;
};

type OrderLike = { status: string; paymentMethod?: string | null; rideOption?: any };

export const CLOSED_ORDER_STATUSES = [
  'completed',
  'payment_confirmed',
  'cancelled',
  'declined',
  'expired',
  'payment_failed',
];

export function isClosedOrderStatus(status: string | null | undefined): boolean {
  return !!status && CLOSED_ORDER_STATUSES.includes(status);
}

export function isCompletedOrderStatus(status: string | null | undefined): boolean {
  return status === 'completed' || status === 'payment_confirmed';
}

export const TONE_BADGE_CLASSES: Record<StatusTone, string> = {
  green: 'bg-emerald-50 text-emerald-700',
  blue: 'bg-blue-50 text-blue-700',
  amber: 'bg-amber-50 text-amber-700',
  red: 'bg-red-50 text-red-700',
  gray: 'bg-gray-100 text-gray-700',
};

const BASE: Record<string, { label: string; tone: StatusTone }> = {
  pending: { label: 'À valider', tone: 'amber' },
  accepted: { label: 'Validée', tone: 'blue' },
  booked: { label: 'Réservée', tone: 'blue' },
  in_progress: { label: 'En cours', tone: 'blue' },
  completed: { label: 'Terminée', tone: 'green' },
  payment_confirmed: { label: 'Terminée', tone: 'green' },
  cancelled: { label: 'Annulée', tone: 'red' },
  declined: { label: 'Refusée', tone: 'red' },
  expired: { label: 'Expirée', tone: 'gray' },
  payment_failed: { label: 'Paiement refusé', tone: 'red' },
  awaiting_payment: { label: 'Paiement en cours', tone: 'amber' },
  payment_pending: { label: 'Paiement en attente', tone: 'amber' },
};

export function getRentalStatusDisplay(order: OrderLike): RentalStatusDisplay {
  const ro = order.rideOption || {};
  const s = order.status;
  const closed = isClosedOrderStatus(s);
  const make = (label: string, tone: StatusTone, title = label): RentalStatusDisplay => ({ label, title, tone, closed });

  if (ro.cancelRequest?.status === 'pending' && !closed) {
    return make('Annulation demandée', 'amber', "Le client demande l'annulation");
  }
  if (s === 'expired') return make('Expirée', 'gray', 'Demande expirée (sans réponse du loueur)');
  if (s === 'declined') return make('Refusée', 'red', 'Demande refusée');
  if (s === 'cancelled') {
    const by = ro.cancellation?.by;
    if (by === 'client') {
      return ro.cancellation?.approvedByDriver
        ? make('Annulée', 'red', 'Annulée à la demande du client')
        : make('Annulée par le client', 'red');
    }
    if (by === 'driver') return make('Annulée par le loueur', 'red');
    if (by === 'system') return make('Expirée', 'gray', 'Demande expirée (sans réponse du loueur)');
    return make('Annulée', 'red', 'Réservation annulée');
  }
  if (s === 'payment_failed') return make('Paiement refusé', 'red', 'Paiement par carte refusé');
  if (isCompletedOrderStatus(s)) return make('Terminée', 'green', 'Location terminée');
  if (s === 'pending') return make('À valider', 'amber', 'Demande à valider');
  if (s === 'accepted' || s === 'booked') {
    const phase = ro.rentalLifecyclePhase;
    if (phase === 'with_client') return make('Chez le client', 'blue', 'Véhicule chez le client');
    if (phase === 'returned') return make('Véhicule rendu', 'green');
    return make('À remettre au client', 'blue', 'Réservation confirmée — véhicule à remettre');
  }
  const base = BASE[s] || { label: s, tone: 'gray' as StatusTone };
  return make(base.label, base.tone);
}

export type RefundState = 'pending' | 'done' | null;

export function getRefundState(order: OrderLike): RefundState {
  const st = order.rideOption?.refund?.status;
  return st === 'pending' || st === 'done' ? st : null;
}
