/**
 * Paramètres BO : abonnement loueur, notifications push OneSignal, versions app
 */

import { useEffect, useState } from "react";
import { Settings, RefreshCw, Bell, Send } from "lucide-react";
import { adminAuthHeaders } from "@/lib/adminApi";

type StripePlan = { id: string; label: string; amountXpf: number; days: number };
type StripePlans = { monthly?: StripePlan; semiannual?: StripePlan };
type PushChannelStatus = { configured: boolean; appId: string | null; hasRestApiKey: boolean };
type PushStatus = { client: PushChannelStatus; driver: PushChannelStatus };

export function AdminSettings() {
  const [subPlans, setSubPlans] = useState<StripePlans>({});
  const [stripeProductId, setStripeProductId] = useState("prod_V6LPtnFYwO9E");
  const [stripeError, setStripeError] = useState<string | null>(null);
  const [stripeSource, setStripeSource] = useState<string>("");
  const [pushStatus, setPushStatus] = useState<PushStatus | null>(null);
  const [testTarget, setTestTarget] = useState<"driver" | "client">("driver");
  const [testExternalId, setTestExternalId] = useState("");
  const [testingPush, setTestingPush] = useState(false);
  const [clientVersion, setClientVersion] = useState({ minVersion: "1.0.0", forceUpdate: false, message: "" });
  const [chauffeurVersion, setChauffeurVersion] = useState({ minVersion: "1.0.0", forceUpdate: false, message: "" });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const [v, s, p] = await Promise.all([
        fetch("/api/admin/app-version"),
        fetch("/api/admin/loueur-subscription-config", { headers: adminAuthHeaders() }),
        fetch("/api/admin/push-status", { headers: adminAuthHeaders() }),
      ]);
      if (v.ok) {
        const data = await v.json();
        if (data.client) setClientVersion({ minVersion: data.client.minVersion || "1.0.0", forceUpdate: !!data.client.forceUpdate, message: data.client.message || "" });
        if (data.chauffeur) setChauffeurVersion({ minVersion: data.chauffeur.minVersion || "1.0.0", forceUpdate: !!data.chauffeur.forceUpdate, message: data.chauffeur.message || "" });
      }
      if (s.ok) {
        const data = await s.json();
        setSubPlans(data.plans || {});
        if (data.stripeProductId) setStripeProductId(data.stripeProductId);
        setStripeError(data.stripeError || null);
        setStripeSource(data.source || "");
      }
      if (p.ok) {
        setPushStatus(await p.json());
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function sendTestPush(e: React.FormEvent) {
    e.preventDefault();
    setTestingPush(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/push-test", {
        method: "POST",
        headers: adminAuthHeaders(),
        body: JSON.stringify({ target: testTarget, externalId: testExternalId.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      setMsg(data.ok ? "Notification de test envoyée avec succès !" : data.error || "Échec de l'envoi");
    } finally {
      setTestingPush(false);
    }
  }

  async function refreshSubscriptionPlans() {
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/loueur-subscription-config", {
        method: "POST",
        headers: adminAuthHeaders(),
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const data = await res.json();
        setSubPlans(data.plans || {});
        if (data.stripeProductId) setStripeProductId(data.stripeProductId);
        setStripeError(data.stripeError || null);
        setStripeSource(data.source || "");
        setMsg(
          data.stripeError
            ? `Stripe : ${data.stripeError}`
            : "Prix rechargés depuis Stripe — visibles sur l’app et le dashboard"
        );
      } else {
        setMsg("Impossible de lire les tarifs Stripe");
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
        <p className="text-sm text-slate-500">Abonnement loueur, notifications push et versions app</p>
      </div>

      {msg && <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-2 text-sm text-amber-800">{msg}</div>}

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-amber-500" />
          <h2 className="font-semibold text-slate-900">Notifications Push (OneSignal)</h2>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              { key: "client" as const, label: "App RAVE Client", envKey: "ONESIGNAL_REST_API_KEY_CLIENT" },
              { key: "driver" as const, label: "App RAVE Loueur", envKey: "ONESIGNAL_REST_API_KEY_DRIVER" },
            ]
          ).map(({ key, label, envKey }) => {
            const st = pushStatus?.[key];
            return (
              <div key={key} className="rounded-lg border border-slate-100 bg-slate-50 p-3.5 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-800">{label}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      st?.configured ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {st?.configured ? "Actif" : "Clé API manquante"}
                  </span>
                </div>
                <p className="font-mono text-[11px] text-slate-500 truncate">
                  App ID : {st?.appId || "—"}
                </p>
                {!st?.configured && (
                  <p className="text-xs text-amber-800">
                    Ajoutez <code className="font-mono">{envKey}</code> dans Render → Environment.
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <form onSubmit={sendTestPush} className="flex flex-col sm:flex-row gap-2 pt-1">
          <select
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
            value={testTarget}
            onChange={(e) => setTestTarget(e.target.value as "driver" | "client")}
          >
            <option value="driver">Loueur</option>
            <option value="client">Client</option>
          </select>
          <input
            required
            placeholder={testTarget === "driver" ? "ID du loueur (ex: UUID fiche loueur)" : "ID du client"}
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={testExternalId}
            onChange={(e) => setTestExternalId(e.target.value)}
          />
          <button
            type="submit"
            disabled={testingPush}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-800 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            <Send className="h-4 w-4" /> {testingPush ? "Envoi…" : "Tester push"}
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-5">
        <div>
          <h2 className="font-semibold text-slate-900">Abonnement plateforme loueur</h2>
          <p className="text-sm text-slate-500 mt-1">
            Prix lus automatiquement depuis Stripe (produit {stripeProductId}
            {stripeSource ? ` · source ${stripeSource}` : ""}). Pour changer le tarif, modifie le produit dans Stripe — RAVE suit.
          </p>
          {stripeError ? (
            <p className="text-sm text-red-600 mt-2">Stripe : {stripeError}</p>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {(["monthly", "semiannual"] as const).map((key) => {
            const plan = subPlans[key];
            if (!plan) return null;
            return (
              <div key={key} className="rounded-lg border border-slate-100 bg-slate-50 p-4 space-y-1">
                <h3 className="text-sm font-semibold text-slate-800">{plan.label}</h3>
                <p className="text-2xl font-bold text-slate-900">
                  {plan.amountXpf.toLocaleString("fr-FR")} XPF
                </p>
                <p className="text-sm text-slate-500">{plan.days} jours · renouvelable Stripe</p>
              </div>
            );
          })}
        </div>
        {!subPlans.monthly ? (
          <p className="text-sm text-amber-700">
            Aucun tarif Stripe lu. Vérifie STRIPE_SECRET_KEY puis actualise.
          </p>
        ) : null}

        <button
          onClick={refreshSubscriptionPlans}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-amber-400"
        >
          <RefreshCw className="h-4 w-4" /> Actualiser depuis Stripe
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
