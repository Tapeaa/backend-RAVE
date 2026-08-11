/**
 * Inventaire flotte loueur (unités)
 */

import { useEffect, useState } from "react";
import { Car, Search, ToggleLeft, ToggleRight } from "lucide-react";
import { adminAuthHeaders } from "@/lib/adminApi";

interface FleetVehicle {
  id: string;
  plate: string | null;
  pricePerDay: number;
  pricePerDayLongTerm: number | null;
  availableForRental: boolean;
  availableForDelivery: boolean;
  availableForLongTerm: boolean;
  isActive: boolean;
  modelName: string | null;
  category: string | null;
  prestataireNom: string | null;
  rentalContractMode: string;
}

export function AdminFleet() {
  const [vehicles, setVehicles] = useState<FleetVehicle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);

  useEffect(() => {
    fetchFleet();
  }, [activeOnly]);

  async function fetchFleet() {
    setIsLoading(true);
    try {
      const url = `/api/admin/fleet?limit=200${activeOnly ? "&active=true" : ""}`;
      const res = await fetch(url, { headers: adminAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setVehicles(data.vehicles || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }

  async function toggleActive(v: FleetVehicle) {
    const res = await fetch(`/api/admin/fleet/${v.id}`, {
      method: "PATCH",
      headers: adminAuthHeaders(),
      body: JSON.stringify({ isActive: !v.isActive }),
    });
    if (res.ok) fetchFleet();
  }

  async function toggleRental(v: FleetVehicle) {
    const res = await fetch(`/api/admin/fleet/${v.id}`, {
      method: "PATCH",
      headers: adminAuthHeaders(),
      body: JSON.stringify({ availableForRental: !v.availableForRental }),
    });
    if (res.ok) fetchFleet();
  }

  const filtered = vehicles.filter((v) => {
    const q = search.toLowerCase();
    return (
      !q ||
      (v.plate || "").toLowerCase().includes(q) ||
      (v.modelName || "").toLowerCase().includes(q) ||
      (v.prestataireNom || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Car className="h-7 w-7 text-amber-500" /> Flotte loueurs
          </h1>
          <p className="text-sm text-slate-500">Inventaire global des véhicules unitaires</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} />
          Actifs seulement
        </label>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm"
          placeholder="Plaque, modèle, prestataire…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Modèle</th>
                <th className="px-4 py-3">Plaque</th>
                <th className="px-4 py-3">Prestataire</th>
                <th className="px-4 py-3">Prix/j</th>
                <th className="px-4 py-3">Contrat</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3">Actif</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((v) => (
                <tr key={v.id} className="border-t border-slate-100 hover:bg-slate-50/80">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{v.modelName || "—"}</div>
                    <div className="text-xs text-slate-500">{v.category}</div>
                  </td>
                  <td className="px-4 py-3 font-mono">{v.plate || "—"}</td>
                  <td className="px-4 py-3">{v.prestataireNom || "—"}</td>
                  <td className="px-4 py-3">{v.pricePerDay?.toLocaleString("fr-FR")} XPF</td>
                  <td className="px-4 py-3 text-xs">{v.rentalContractMode}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => toggleRental(v)} className="text-amber-600 hover:text-amber-800">
                      {v.availableForRental ? <ToggleRight className="h-6 w-6" /> : <ToggleLeft className="h-6 w-6 text-slate-400" />}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => toggleActive(v)} className="text-amber-600 hover:text-amber-800">
                      {v.isActive ? <ToggleRight className="h-6 w-6" /> : <ToggleLeft className="h-6 w-6 text-slate-400" />}
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    Aucun véhicule
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
