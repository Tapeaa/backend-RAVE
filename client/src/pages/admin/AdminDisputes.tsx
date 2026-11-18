/**
 * Litiges : signalements ouverts par un client, un loueur ou l'admin sur une location
 * (jusqu'à 14 jours après la fin). L'admin les prend en charge puis tranche.
 */

import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Scale, Car, User, Store, CalendarDays, ExternalLink } from "lucide-react";
import { DISPUTE_WINDOW_DAYS, disputeCategoryLabel } from "@shared/disputes";
import { adminAuthHeaders } from "@/lib/adminApi";
import { DecideDisputeDialog, DISPUTE_ROLE_LABELS, DISPUTE_STATUS_LABELS } from "@/components/admin/DisputeDialogs";

type DisputeRow = {
  id: string;
  orderId: string;
  openedBy: string;
  category: string;
  reason: string;
  status: string;
  resolution: string | null;
  createdAt: string;
  resolvedAt: string | null;
  order: {
    id: string;
    status: string;
    totalPrice: number;
    clientName: string;
    clientPhone: string;
    vehicleTitle: string;
    startDate: string | null;
    endDate: string | null;
    loueurName: string | null;
    loueurPhone: string | null;
  } | null;
};

const FILTERS = [
  { id: "active", label: "À traiter" },
  { id: "closed", label: "Clos" },
  { id: "all", label: "Tous" },
] as const;

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

export function AdminDisputes() {
  const [disputes, setDisputes] = useState<DisputeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("active");
  const [deciding, setDeciding] = useState<{ id: string; decision: "resolved" | "rejected" } | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/disputes", { headers: adminAuthHeaders() });
      if (res.ok) setDisputes(await res.json());
    } finally {
      setLoading(false);
    }
  }

  async function takeOver(id: string) {
    await fetch(`/api/admin/disputes/${id}`, {
      method: "PATCH",
      headers: adminAuthHeaders(),
      body: JSON.stringify({ status: "in_review" }),
    });
    load();
  }

  const isActive = (d: DisputeRow) => d.status === "open" || d.status === "in_review";
  const visible = useMemo(
    () => disputes.filter((d) => (filter === "all" ? true : filter === "active" ? isActive(d) : !isActive(d))),
    [disputes, filter],
  );
  const activeCount = disputes.filter(isActive).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Scale className="h-7 w-7 text-amber-500" /> Litiges
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Un client ou un loueur peut signaler un problème depuis son app sur une location acceptée, jusqu'à{" "}
          {DISPUTE_WINDOW_DAYS} jours après la fin (dégâts, caution, véhicule non conforme…). Vous pouvez aussi en ouvrir un
          depuis la fiche d'une commande. Prenez-le en charge, contactez les deux parties, puis clôturez avec votre décision :
          elle s'affiche dans les deux apps.
        </p>
      </div>

      <div className="flex gap-2 overflow-x-auto">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium ${
              filter === f.id ? "bg-slate-900 text-white" : "bg-white border text-slate-600"
            }`}
          >
            {f.label}
            {f.id === "active" && activeCount > 0 ? ` (${activeCount})` : ""}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="h-24 flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" />
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-white p-8 text-center text-slate-500">
          {filter === "active" ? "Aucun litige à traiter." : "Aucun litige."}
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((d) => {
            const st = DISPUTE_STATUS_LABELS[d.status] || { label: d.status, className: "bg-slate-100 text-slate-700" };
            return (
              <div key={d.id} className="rounded-xl border bg-white p-4 shadow-sm space-y-3 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.className}`}>{st.label}</span>
                  <span className="rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700">
                    {disputeCategoryLabel(d.category)}
                  </span>
                  <span className="text-xs text-slate-500">
                    Ouvert par {DISPUTE_ROLE_LABELS[d.openedBy] || d.openedBy} le {fmtDate(d.createdAt)}
                  </span>
                </div>

                <p className="text-sm text-slate-800 whitespace-pre-wrap break-words">{d.reason}</p>

                {d.order && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600 [&>*]:min-w-0">
                    <div className="flex items-center gap-1.5 truncate">
                      <Car className="h-3.5 w-3.5 shrink-0" /> {d.order.vehicleTitle} · {Math.round(d.order.totalPrice).toLocaleString("fr-FR")} XPF
                    </div>
                    <div className="flex items-center gap-1.5">
                      <CalendarDays className="h-3.5 w-3.5 shrink-0" /> {fmtDate(d.order.startDate)} → {fmtDate(d.order.endDate)}
                    </div>
                    <div className="flex items-center gap-1.5 truncate">
                      <User className="h-3.5 w-3.5 shrink-0" /> {d.order.clientName}
                      {d.order.clientPhone ? (
                        <a href={`tel:${d.order.clientPhone}`} className="text-amber-700 underline">
                          {d.order.clientPhone}
                        </a>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-1.5 truncate">
                      <Store className="h-3.5 w-3.5 shrink-0" /> {d.order.loueurName || "Loueur inconnu"}
                      {d.order.loueurPhone ? (
                        <a href={`tel:${d.order.loueurPhone}`} className="text-amber-700 underline">
                          {d.order.loueurPhone}
                        </a>
                      ) : null}
                    </div>
                  </div>
                )}

                {d.resolution && (
                  <div className="rounded-lg border-l-4 border-emerald-400 bg-emerald-50/50 px-3 py-2 text-sm text-slate-700">
                    <span className="font-medium">Décision{d.resolvedAt ? ` du ${fmtDate(d.resolvedAt)}` : ""} : </span>
                    {d.resolution}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/admin/commandes/${d.orderId}`}
                    className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs text-slate-700"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Voir la commande
                  </Link>
                  {d.status === "open" && (
                    <button onClick={() => takeOver(d.id)} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white">
                      Prendre en charge
                    </button>
                  )}
                  {isActive(d) && (
                    <>
                      <button
                        onClick={() => setDeciding({ id: d.id, decision: "resolved" })}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white"
                      >
                        Résoudre
                      </button>
                      <button
                        onClick={() => setDeciding({ id: d.id, decision: "rejected" })}
                        className="rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700"
                      >
                        Rejeter
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {deciding && (
        <DecideDisputeDialog
          disputeId={deciding.id}
          decision={deciding.decision}
          onClose={() => setDeciding(null)}
          onDone={() => {
            setDeciding(null);
            load();
          }}
        />
      )}
    </div>
  );
}
