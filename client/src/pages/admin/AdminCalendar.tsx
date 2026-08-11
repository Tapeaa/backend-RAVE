/**
 * Calendrier disponibilité / réservations location
 */

import { useEffect, useState } from "react";
import { CalendarDays, Plus, Trash2 } from "lucide-react";
import { adminAuthHeaders } from "@/lib/adminApi";

export function AdminCalendar() {
  const [blocks, setBlocks] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [fleet, setFleet] = useState<any[]>([]);
  const [form, setForm] = useState({ loueurVehicleId: "", startDate: "", endDate: "", reason: "" });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const from = new Date();
      from.setDate(1);
      const to = new Date(from);
      to.setMonth(to.getMonth() + 2);
      const [cal, fl] = await Promise.all([
        fetch(`/api/admin/calendar?from=${from.toISOString()}&to=${to.toISOString()}`, { headers: adminAuthHeaders() }),
        fetch("/api/admin/fleet?limit=200", { headers: adminAuthHeaders() }),
      ]);
      if (cal.ok) {
        const d = await cal.json();
        setBlocks(d.blocks || []);
        setBookings(d.bookings || []);
      }
      if (fl.ok) {
        const d = await fl.json();
        setFleet(d.vehicles || []);
      }
    } finally {
      setLoading(false);
    }
  }

  async function addBlock(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/admin/calendar/blocks", {
      method: "POST",
      headers: adminAuthHeaders(),
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setForm({ loueurVehicleId: "", startDate: "", endDate: "", reason: "" });
      load();
    } else {
      alert("Erreur création bloc");
    }
  }

  async function removeBlock(id: string) {
    await fetch(`/api/admin/calendar/blocks/${id}`, { method: "DELETE", headers: adminAuthHeaders() });
    load();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
        <CalendarDays className="h-7 w-7 text-amber-500" /> Calendrier
      </h1>

      <form onSubmit={addBlock} className="rounded-xl border bg-white p-4 grid gap-3 sm:grid-cols-5">
        <select required className="rounded-lg border px-3 py-2 text-sm" value={form.loueurVehicleId} onChange={(e) => setForm({ ...form, loueurVehicleId: e.target.value })}>
          <option value="">Véhicule…</option>
          {fleet.map((v) => (
            <option key={v.id} value={v.id}>{v.modelName} — {v.plate || "sans plaque"}</option>
          ))}
        </select>
        <input required type="date" className="rounded-lg border px-3 py-2 text-sm" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
        <input required type="date" className="rounded-lg border px-3 py-2 text-sm" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
        <input placeholder="Raison" className="rounded-lg border px-3 py-2 text-sm" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
        <button type="submit" className="inline-flex items-center justify-center gap-1 rounded-lg bg-amber-500 px-3 py-2 text-sm font-medium"><Plus className="h-4 w-4" /> Bloquer</button>
      </form>

      {loading ? (
        <div className="h-24 flex items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" /></div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-xl border bg-white p-4">
            <h2 className="font-semibold mb-3">Réservations (période)</h2>
            <div className="max-h-96 overflow-auto space-y-2 text-sm">
              {bookings.map((b) => (
                <div key={b.orderId} className="border-b border-slate-100 py-2">
                  <div className="font-medium">{b.title} — {b.clientName}</div>
                  <div className="text-xs text-slate-500">{b.startDate?.slice?.(0, 10)} → {b.endDate?.slice?.(0, 10)} · {b.status}</div>
                </div>
              ))}
              {bookings.length === 0 && <p className="text-slate-500">Aucune réservation</p>}
            </div>
          </section>
          <section className="rounded-xl border bg-white p-4">
            <h2 className="font-semibold mb-3">Blocs indisponibilité</h2>
            <div className="max-h-96 overflow-auto space-y-2 text-sm">
              {blocks.map((b) => (
                <div key={b.id} className="flex justify-between border-b border-slate-100 py-2">
                  <div>
                    <div className="font-medium">{b.modelName} {b.plate}</div>
                    <div className="text-xs text-slate-500">{String(b.startDate).slice(0, 10)} → {String(b.endDate).slice(0, 10)} · {b.reason || "—"}</div>
                  </div>
                  <button onClick={() => removeBlock(b.id)} className="text-red-500"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
              {blocks.length === 0 && <p className="text-slate-500">Aucun bloc</p>}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
