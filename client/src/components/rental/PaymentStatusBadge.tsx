import { AlertCircle, Banknote, CheckCircle2, Hourglass, MinusCircle, RotateCcw } from 'lucide-react';
import { getRefundState, isClosedOrderStatus, isCompletedOrderStatus } from '@/lib/rental-status';

export type RentalPaymentState =
  | 'paid'
  | 'refund_pending'
  | 'refunded'
  | 'card_unpaid'
  | 'on_site'
  | 'none';

export function getRentalPaymentState(course: {
  status?: string | null;
  paymentMethod?: string | null;
  rideOption?: any;
}): RentalPaymentState {
  const refund = getRefundState({ status: course.status || '', rideOption: course.rideOption });
  if (refund === 'pending') return 'refund_pending';
  if (refund === 'done') return 'refunded';
  if (course.rideOption?.payzenStatus === 'paid') return 'paid';
  // Réservation arrêtée sans paiement : rien à encaisser
  if (isClosedOrderStatus(course.status) && !isCompletedOrderStatus(course.status)) return 'none';
  if (course.paymentMethod === 'card') return 'card_unpaid';
  return 'on_site';
}

const BADGES: Record<RentalPaymentState, { className: string; icon: typeof CheckCircle2; label: string }> = {
  paid: { className: 'bg-emerald-50 text-emerald-700', icon: CheckCircle2, label: 'Payée par carte' },
  refund_pending: { className: 'bg-amber-50 text-amber-800', icon: Hourglass, label: 'Remboursement à faire' },
  refunded: { className: 'bg-emerald-50 text-emerald-700', icon: RotateCcw, label: 'Remboursée' },
  card_unpaid: { className: 'bg-red-50 text-red-700', icon: AlertCircle, label: 'Paiement carte non abouti' },
  on_site: { className: 'bg-amber-50 text-amber-700', icon: Banknote, label: 'À encaisser' },
  none: { className: 'bg-gray-100 text-gray-600', icon: MinusCircle, label: 'Aucun paiement' },
};

export function PaymentStatusBadge({
  course,
}: {
  course: { status?: string | null; paymentMethod?: string | null; rideOption?: any };
}) {
  const badge = BADGES[getRentalPaymentState(course)];
  const Icon = badge.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}>
      <Icon className="h-3 w-3" /> {badge.label}
    </span>
  );
}
