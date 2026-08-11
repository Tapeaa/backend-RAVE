/**
 * Modération des avis
 */

import { useEffect, useState } from "react";
import { Star, Trash2 } from "lucide-react";
import { adminAuthHeaders } from "@/lib/adminApi";

export function AdminRatings() {
  const [ratings, setRatings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/ratings", { headers: adminAuthHeaders() });
      if (res.ok) {
        const d = await res.json();
        setRatings(d.ratings || []);
      }
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Supprimer cet avis ?")) return;
    await fetch(`/api/admin/ratings/${id}`, { method: "DELETE", headers: adminAuthHeaders() });
    load();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
        <Star className="h-7 w-7 text-amber-500" /> Avis
      </h1>
      {loading ? (
        <div className="h-24 flex items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" /></div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Score</th>
                <th className="px-4 py-3 text-left">De → Vers</th>
                <th className="px-4 py-3 text-left">Commentaire</th>
                <th className="px-4 py-3 text-left">Commande</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {ratings.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-4 py-3 font-semibold">{r.score}/5</td>
                  <td className="px-4 py-3 text-xs">{r.raterType} → {r.ratedType}</td>
                  <td className="px-4 py-3 max-w-xs truncate">{r.comment || "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{String(r.orderId).slice(0, 8)}…</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => remove(r.id)} className="text-red-500"><Trash2 className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
              {ratings.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">Aucun avis</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
