/**
 * Codes promo
 */

import { useEffect, useState } from "react";
import { Percent, Plus, Trash2 } from "lucide-react";
import { adminAuthHeaders } from "@/lib/adminApi";

interface Promo {
  id: string;
  code: string;
  description: string | null;
  discountType: string;
  discountValue: number;
  maxUses: number | null;
  usedCount: number;
  isActive: boolean;
}

export function AdminPromos() {
  const [promos, setPromos] = useState<Promo[]>([]);
  const [form, setForm] = useState({ code: "", description: "", discountType: "percent", discountValue: 10, maxUses: "" });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/promos", { headers: adminAuthHeaders() });
      if (res.ok) setPromos(await res.json());
    } finally {
      setLoading(false);
    }
  }

  async function createPromo(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/admin/promos", {
      method: "POST",
      headers: adminAuthHeaders(),
      body: JSON.stringify({
        ...form,
        discountValue: Number(form.discountValue),
        maxUses: form.maxUses ? Number(form.maxUses) : null,
      }),
    });
    if (res.ok) {
      setForm({ code: "", description: "", discountType: "percent", discountValue: 10, maxUses: "" });
      load();
    } else {
      const err = await res.json();
      alert(err.error || "Erreur");
    }
  }

  async function toggle(p: Promo) {
    await fetch(`/api/admin/promos/${p.id}`, {
      method: "PATCH",
      headers: adminAuthHeaders(),
      body: JSON.stringify({ isActive: !p.isActive }),
    });
    load();
  }

  async function remove(id: string) {
    if (!confirm("Supprimer ce code ?")) return;
    await fetch(`/api/admin/promos/${id}`, { method: "DELETE", headers: adminAuthHeaders() });
    load();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
        <Percent className="h-7 w-7 text-amber-500" /> Codes promo
      </h1>

      <form onSubmit={createPromo} className="rounded-xl border border-slate-200 bg-white p-4 grid gap-3 sm:grid-cols-5">
        <input required placeholder="CODE" className="rounded-lg border px-3 py-2 text-sm uppercase" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
        <input placeholder="Description" className="rounded-lg border px-3 py-2 text-sm" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <select className="rounded-lg border px-3 py-2 text-sm" value={form.discountType} onChange={(e) => setForm({ ...form, discountType: e.target.value })}>
          <option value="percent">%</option>
          <option value="fixed">XPF fixe</option>
        </select>
        <input type="number" required className="rounded-lg border px-3 py-2 text-sm" value={form.discountValue} onChange={(e) => setForm({ ...form, discountValue: Number(e.target.value) })} />
        <button type="submit" className="inline-flex items-center justify-center gap-1 rounded-lg bg-amber-500 px-3 py-2 text-sm font-medium text-slate-900">
          <Plus className="h-4 w-4" /> Créer
        </button>
      </form>

      {loading ? (
        <div className="h-24 flex items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" /></div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Code</th>
                <th className="px-4 py-3 text-left">Remise</th>
                <th className="px-4 py-3 text-left">Usages</th>
                <th className="px-4 py-3 text-left">Actif</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {promos.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="px-4 py-3 font-mono font-semibold">{p.code}</td>
                  <td className="px-4 py-3">{p.discountType === "percent" ? `${p.discountValue}%` : `${p.discountValue} XPF`}</td>
                  <td className="px-4 py-3">{p.usedCount}{p.maxUses != null ? ` / ${p.maxUses}` : ""}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => toggle(p)} className={`rounded-full px-2 py-0.5 text-xs ${p.isActive ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                      {p.isActive ? "Actif" : "Off"}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => remove(p.id)} className="text-red-500"><Trash2 className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
