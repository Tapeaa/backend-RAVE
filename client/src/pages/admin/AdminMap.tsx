/**
 * Carte live loueurs
 */

import { useEffect, useState } from "react";
import { Map } from "lucide-react";
import { MapTracker } from "@/components/admin/MapTracker";
import { adminAuthHeaders } from "@/lib/adminApi";

export function AdminMap() {
  const [chauffeurs, setChauffeurs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const apiKey = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY || "";

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  async function load() {
    try {
      const res = await fetch("/api/admin/chauffeurs/locations", { headers: adminAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setChauffeurs(data.chauffeurs || data || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  const withCoords = chauffeurs.filter((c) => c.latitude != null && c.longitude != null);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
        <Map className="h-7 w-7 text-amber-500" /> Carte live
      </h1>
      <p className="text-sm text-slate-500">{withCoords.length} loueur(s) avec position — rafraîchi toutes les 15s</p>
      {!apiKey ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Définissez <code>VITE_GOOGLE_MAPS_API_KEY</code> pour afficher la carte. Liste des positions :
          <ul className="mt-2 space-y-1">
            {withCoords.map((c) => (
              <li key={c.id}>{c.firstName} {c.lastName} — {c.latitude}, {c.longitude}</li>
            ))}
          </ul>
        </div>
      ) : (
        <MapTracker chauffeurs={withCoords} apiKey={apiKey} isLoading={loading} heightClass="h-[480px]" />
      )}
    </div>
  );
}
