/**
 * Reconciliation Stripe vs ledger commandes
 */

import { useEffect, useState } from "react";
import { CreditCard } from "lucide-react";
import { adminAuthHeaders } from "@/lib/adminApi";

export function AdminReconciliation() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/admin/stripe/reconciliation", { headers: adminAuthHeaders() });
        if (res.ok) setData(await res.json());
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return <div className="flex h-40 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" /></div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
        <CreditCard className="h-7 w-7 text-amber-500" /> Reconciliation
      </h1>
      <p className="text-sm text-slate-500">
        Outil héritage Stripe (pas le paiement location actuel). Les locations se règlent via PayZen / OSB si le loueur l’a configuré, sinon chez le loueur.
        Stripe configuré : {data?.stripeConfigured ? "oui" : "non"}
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border bg-white p-4">
          <h2 className="font-semibold mb-3">Ledger commandes (100 dernières)</h2>
          <div className="max-h-96 overflow-auto text-sm space-y-2">
            {(data?.ordersLedger || []).map((o: any) => (
              <div key={o.id} className="flex justify-between border-b border-slate-100 py-2">
                <div>
                  <div className="font-mono text-xs text-slate-500">{o.id.slice(0, 8)}…</div>
                  <div>{o.status} · {o.paymentMethod}</div>
                  {o.refund && <div className="text-xs text-red-600">Remboursé: {o.refund.amount} XPF</div>}
                </div>
                <div className="font-semibold">{Number(o.totalPrice).toLocaleString("fr-FR")} XPF</div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border bg-white p-4">
          <h2 className="font-semibold mb-3">Stripe PaymentIntents</h2>
          {!data?.stripeConfigured ? (
            <p className="text-sm text-slate-500">STRIPE_SECRET_KEY non configurée</p>
          ) : (
            <div className="max-h-96 overflow-auto text-sm space-y-2">
              {(data?.stripePayments || []).map((p: any) => (
                <div key={p.id} className="flex justify-between border-b border-slate-100 py-2">
                  <div>
                    <div className="font-mono text-xs">{p.id}</div>
                    <div>{p.status} · {p.currency}</div>
                  </div>
                  <div className="font-semibold">{p.amount} {String(p.currency || "").toUpperCase()}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
