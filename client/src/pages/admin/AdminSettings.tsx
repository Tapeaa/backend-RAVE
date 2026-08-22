/**
 * Paramètres BO : abonnement loueur, version app
 */

import { useEffect, useState } from "react";
import { Settings, Save } from "lucide-react";
import { adminAuthHeaders } from "@/lib/adminApi";

type LoueurPlanForm = {
  monthlyAmountXpf: number;
  monthlyLabel: string;
  monthlyDays: number;
  semiannualAmountXpf: number;
  semiannualLabel: string;
  semiannualDays: number;
};

export function AdminSettings() {
  const [subPlans, setSubPlans] = useState<LoueurPlanForm>({
    monthlyAmountXpf: 5000,
    monthlyLabel: "Mensuel",
    monthlyDays: 30,
    semiannualAmountXpf: 30000,
    semiannualLabel: "6 mois",
    semiannualDays: 180,
  });
  const [clientVersion, setClientVersion] = useState({ minVersion: "1.0.0", forceUpdate: false, message: "" });
  const [chauffeurVersion, setChauffeurVersion] = useState({ minVersion: "1.0.0", forceUpdate: false, message: "" });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const [v, s] = await Promise.all([
        fetch("/api/admin/app-version"),
        fetch("/api/admin/loueur-subscription-config", { headers: adminAuthHeaders() }),
      ]);
      if (v.ok) {
        const data = await v.json();
        if (data.client) setClientVersion({ minVersion: data.client.minVersion || "1.0.0", forceUpdate: !!data.client.forceUpdate, message: data.client.message || "" });
        if (data.chauffeur) setChauffeurVersion({ minVersion: data.chauffeur.minVersion || "1.0.0", forceUpdate: !!data.chauffeur.forceUpdate, message: data.chauffeur.message || "" });
      }
      if (s.ok) {
        const data = await s.json();
        const p = data.plans;
        if (p?.monthly && p?.semiannual) {
          setSubPlans({
            monthlyAmountXpf: p.monthly.amountXpf,
            monthlyLabel: p.monthly.label,
            monthlyDays: p.monthly.days,
            semiannualAmountXpf: p.semiannual.amountXpf,
            semiannualLabel: p.semiannual.label,
            semiannualDays: p.semiannual.days,
          });
        }
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function saveSubscriptionPlans() {
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/loueur-subscription-config", {
        method: "POST",
        headers: adminAuthHeaders(),
        body: JSON.stringify(subPlans),
      });
      if (res.ok) {
        const data = await res.json();
        const p = data.plans;
        if (p?.monthly && p?.semiannual) {
          setSubPlans({
            monthlyAmountXpf: p.monthly.amountXpf,
            monthlyLabel: p.monthly.label,
            monthlyDays: p.monthly.days,
            semiannualAmountXpf: p.semiannual.amountXpf,
            semiannualLabel: p.semiannual.label,
            semiannualDays: p.semiannual.days,
          });
        }
        setMsg("Abonnement loueur enregistré — visible immédiatement sur app et dashboard");
      } else {
        setMsg("Erreur abonnement");
      }
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
        <p className="text-sm text-slate-500">Abonnement loueur et versions app</p>
      </div>

      {msg && <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-2 text-sm text-amber-800">{msg}</div>}

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-5">
        <div>
          <h2 className="font-semibold text-slate-900">Abonnement plateforme loueur</h2>
          <p className="text-sm text-slate-500 mt-1">
            Les prix et durées s’appliquent tout de suite sur l’app Loueur et le dashboard prestataire.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-800">Formule mensuelle</h3>
            <label className="block text-sm">
              <span className="text-slate-600">Libellé</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 bg-white"
                value={subPlans.monthlyLabel}
                onChange={(e) => setSubPlans({ ...subPlans, monthlyLabel: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Prix (XPF)</span>
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 bg-white"
                value={subPlans.monthlyAmountXpf}
                onChange={(e) => setSubPlans({ ...subPlans, monthlyAmountXpf: Number(e.target.value) })}
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Durée (jours)</span>
              <input
                type="number"
                min={1}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 bg-white"
                value={subPlans.monthlyDays}
                onChange={(e) => setSubPlans({ ...subPlans, monthlyDays: Number(e.target.value) })}
              />
            </label>
          </div>

          <div className="rounded-lg border border-slate-100 bg-slate-50 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-800">Formule 6 mois / longue</h3>
            <label className="block text-sm">
              <span className="text-slate-600">Libellé</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 bg-white"
                value={subPlans.semiannualLabel}
                onChange={(e) => setSubPlans({ ...subPlans, semiannualLabel: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Prix (XPF)</span>
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 bg-white"
                value={subPlans.semiannualAmountXpf}
                onChange={(e) => setSubPlans({ ...subPlans, semiannualAmountXpf: Number(e.target.value) })}
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Durée (jours)</span>
              <input
                type="number"
                min={1}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 bg-white"
                value={subPlans.semiannualDays}
                onChange={(e) => setSubPlans({ ...subPlans, semiannualDays: Number(e.target.value) })}
              />
            </label>
          </div>
        </div>

        <button
          onClick={saveSubscriptionPlans}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-amber-400"
        >
          <Save className="h-4 w-4" /> Enregistrer abonnement
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
