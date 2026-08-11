/**
 * Paramètres BO : frais, commissions, version app
 */

import { useEffect, useState } from "react";
import { Settings, Save } from "lucide-react";
import { adminAuthHeaders } from "@/lib/adminApi";

export function AdminSettings() {
  const [frais, setFrais] = useState({ fraisServicePrestataire: 15, commissionPrestataire: 0, commissionSalarieTapea: 0 });
  const [clientVersion, setClientVersion] = useState({ minVersion: "1.0.0", forceUpdate: false, message: "" });
  const [chauffeurVersion, setChauffeurVersion] = useState({ minVersion: "1.0.0", forceUpdate: false, message: "" });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const [f, v] = await Promise.all([
        fetch("/api/frais-service-config"),
        fetch("/api/admin/app-version"),
      ]);
      if (f.ok) {
        const data = await f.json();
        if (data.config) setFrais(data.config);
      }
      if (v.ok) {
        const data = await v.json();
        if (data.client) setClientVersion({ minVersion: data.client.minVersion || "1.0.0", forceUpdate: !!data.client.forceUpdate, message: data.client.message || "" });
        if (data.chauffeur) setChauffeurVersion({ minVersion: data.chauffeur.minVersion || "1.0.0", forceUpdate: !!data.chauffeur.forceUpdate, message: data.chauffeur.message || "" });
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function saveFrais() {
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/frais-service-config", {
        method: "POST",
        headers: adminAuthHeaders(),
        body: JSON.stringify(frais),
      });
      setMsg(res.ok ? "Frais enregistrés" : "Erreur frais");
    } finally {
      setSaving(false);
    }
  }

  async function saveVersion(appType: "client" | "chauffeur") {
    setSaving(true);
    setMsg("");
    const body = appType === "client" ? { appType, ...clientVersion } : { appType, ...chauffeurVersion };
    try {
      const res = await fetch("/api/admin/app-version", {
        method: "POST",
        headers: adminAuthHeaders(),
        body: JSON.stringify(body),
      });
      setMsg(res.ok ? `Version ${appType} enregistrée` : "Erreur version");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Settings className="h-7 w-7 text-amber-500" /> Paramètres
        </h1>
        <p className="text-sm text-slate-500">Frais de service, commissions et versions app</p>
      </div>

      {msg && <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-2 text-sm text-amber-800">{msg}</div>}

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <h2 className="font-semibold text-slate-900">Frais & commissions (%)</h2>
        {([
          ["fraisServicePrestataire", "Frais service client"],
          ["commissionPrestataire", "Commission prestataire"],
          ["commissionSalarieTapea", "Commission salarié"],
        ] as const).map(([key, label]) => (
          <label key={key} className="block text-sm">
            <span className="text-slate-600">{label}</span>
            <input
              type="number"
              min={0}
              max={100}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              value={(frais as any)[key]}
              onChange={(e) => setFrais({ ...frais, [key]: Number(e.target.value) })}
            />
          </label>
        ))}
        <button
          onClick={saveFrais}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-amber-400"
        >
          <Save className="h-4 w-4" /> Enregistrer frais
        </button>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <h2 className="font-semibold text-slate-900">Version app client</h2>
        <label className="block text-sm">
          <span className="text-slate-600">Version min</span>
          <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" value={clientVersion.minVersion} onChange={(e) => setClientVersion({ ...clientVersion, minVersion: e.target.value })} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={clientVersion.forceUpdate} onChange={(e) => setClientVersion({ ...clientVersion, forceUpdate: e.target.checked })} />
          Forcer la mise à jour
        </label>
        <label className="block text-sm">
          <span className="text-slate-600">Message</span>
          <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" value={clientVersion.message} onChange={(e) => setClientVersion({ ...clientVersion, message: e.target.value })} />
        </label>
        <button onClick={() => saveVersion("client")} disabled={saving} className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-white">Enregistrer client</button>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <h2 className="font-semibold text-slate-900">Version app loueur</h2>
        <label className="block text-sm">
          <span className="text-slate-600">Version min</span>
          <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" value={chauffeurVersion.minVersion} onChange={(e) => setChauffeurVersion({ ...chauffeurVersion, minVersion: e.target.value })} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={chauffeurVersion.forceUpdate} onChange={(e) => setChauffeurVersion({ ...chauffeurVersion, forceUpdate: e.target.checked })} />
          Forcer la mise à jour
        </label>
        <label className="block text-sm">
          <span className="text-slate-600">Message</span>
          <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" value={chauffeurVersion.message} onChange={(e) => setChauffeurVersion({ ...chauffeurVersion, message: e.target.value })} />
        </label>
        <button onClick={() => saveVersion("chauffeur")} disabled={saving} className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-white">Enregistrer loueur</button>
      </section>
    </div>
  );
}
