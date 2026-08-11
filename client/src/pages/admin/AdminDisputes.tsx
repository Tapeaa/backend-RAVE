/**
 * Litiges / disputes
 */

import { useEffect, useState } from "react";
import { Scale } from "lucide-react";
import { adminAuthHeaders } from "@/lib/adminApi";

export function AdminDisputes() {
  const [disputes, setDisputes] = useState<any[]>([]);
  const [form, setForm] = useState({ orderId: "", reason: "" });
  const [loading, setLoading] = useState(true);

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

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/admin/disputes", {
      method: "POST",
      headers: adminAuthHeaders(),
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setForm({ orderId: "", reason: "" });
      load();
    } else {
      alert("Erreur (vérifiez l'ID commande)");
    }
  }

  async function resolve(id: string, status: string) {
    const resolution = prompt("Résolution / commentaire") || "";
    await fetch(`/api/admin/disputes/${id}`, {
      method: "PATCH",
      headers: adminAuthHeaders(),
      body: JSON.stringify({ status, resolution }),
    });
    load();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
        <Scale className="h-7 w-7 text-amber-500" /> Litiges
      </h1>

      <form onSubmit={create} className="rounded-xl border bg-white p-4 flex flex-col sm:flex-row gap-3">
        <input required placeholder="ID commande" className="flex-1 rounded-lg border px-3 py-2 text-sm" value={form.orderId} onChange={(e) => setForm({ ...form, orderId: e.target.value })} />
        <input required placeholder="Motif" className="flex-[2] rounded-lg border px-3 py-2 text-sm" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
        <button type="submit" className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium">Ouvrir</button>
      </form>

      {loading ? (
        <div className="h-24 flex items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" /></div>
      ) : (
        <div className="space-y-3">
          {disputes.map((d) => (
            <div key={d.id} className="rounded-xl border bg-white p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="font-medium text-slate-900">{d.reason}</div>
                <div className="text-xs text-slate-500">Commande {String(d.orderId).slice(0, 8)}… · {d.openedBy} · <span className="uppercase">{d.status}</span></div>
                {d.resolution && <div className="text-sm text-slate-600 mt-1">{d.resolution}</div>}
              </div>
              {d.status === "open" || d.status === "in_review" ? (
                <div className="flex gap-2">
                  <button onClick={() => resolve(d.id, "resolved")} className="rounded-lg bg-green-600 px-3 py-1.5 text-xs text-white">Résoudre</button>
                  <button onClick={() => resolve(d.id, "rejected")} className="rounded-lg bg-slate-200 px-3 py-1.5 text-xs">Rejeter</button>
                </div>
              ) : null}
            </div>
          ))}
          {disputes.length === 0 && <p className="text-slate-500">Aucun litige</p>}
        </div>
      )}
    </div>
  );
}
