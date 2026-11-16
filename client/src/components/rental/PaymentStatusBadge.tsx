import { AlertCircle, Banknote, CheckCircle2 } from 'lucide-react';

export function getRentalPaymentState(course: {
  paymentMethod?: string | null;
  rideOption?: any;
}): 'paid' | 'card_unpaid' | 'on_site' {
  if (course.rideOption?.payzenStatus === 'paid') return 'paid';
  if (course.paymentMethod === 'card') return 'card_unpaid';
  return 'on_site';
}

export function PaymentStatusBadge({
  course,
}: {
  course: { paymentMethod?: string | null; rideOption?: any };
}) {
  const state = getRentalPaymentState(course);
  if (state === 'paid') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
        <CheckCircle2 className="h-3 w-3" /> Payée par carte
      </span>
    );
  }
  if (state === 'card_unpaid') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
        <AlertCircle className="h-3 w-3" /> Paiement carte non abouti
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
      <Banknote className="h-3 w-3" /> À encaisser
    </span>
  );
}
