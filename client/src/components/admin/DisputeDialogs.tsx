import { useState } from "react";
import { X } from "lucide-react";
import { DISPUTE_CATEGORIES, DISPUTE_REASON_MIN, type DisputeCategory } from "@shared/disputes";
import { adminAuthHeaders } from "@/lib/adminApi";

export const DISPUTE_STATUS_LABELS: Record<string, { label: string; className: string }> = {
  open: { label: "Nouveau", className: "bg-amber-100 text-amber-800" },
  in_review: { label: "En cours d'examen", className: "bg-blue-100 text-blue-800" },
  resolved: { label: "Résolu", className: "bg-emerald-100 text-emerald-800" },
  rejected: { label: "Rejeté", className: "bg-slate-100 text-slate-700" },
};

export const DISPUTE_ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  client: "Client",
  driver: "Loueur",
  loueur: "Loueur",
  prestataire: "Loueur",
};

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]"
      onClick={onClose}
    >
      <div className="w-full max-w-md max-h-full overflow-y-auto rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100" aria-label="Fermer">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function OpenDisputeDialog({ orderId, onClose, onCreated }: { orderId: string; onClose: () => void; onCreated: () => void }) {
  const [category, setCategory] = useState<DisputeCategory>("damage");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/disputes", {
        method: "POST",
        headers: adminAuthHeaders(),
        body: JSON.stringify({ orderId, category, reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Impossible d'ouvrir le litige");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title="Ouvrir un litige" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Catégorie</label>
          <select
            className="w-full rounded-lg border px-3 py-2 text-sm"
            value={category}
            onChange={(e) => setCategory(e.target.value as DisputeCategory)}
          >
            {DISPUTE_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Description</label>
          <textarea
            required
            minLength={DISPUTE_REASON_MIN}
            rows={4}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            placeholder="Que s'est-il passé ? Qui est concerné ?"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">
            Annuler
          </button>
          <button type="submit" disabled={saving} className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {saving ? "Envoi…" : "Ouvrir le litige"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

export function DecideDisputeDialog({
  disputeId,
  decision,
  onClose,
  onDone,
}: {
  disputeId: string;
  decision: "resolved" | "rejected";
  onClose: () => void;
  onDone: () => void;
}) {
  const [resolution, setResolution] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/disputes/${disputeId}`, {
        method: "PATCH",
        headers: adminAuthHeaders(),
        body: JSON.stringify({ status: decision, resolution }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Erreur");
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  const resolved = decision === "resolved";
  return (
    <ModalShell title={resolved ? "Clore le litige (résolu)" : "Rejeter le litige"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-slate-600">
          {resolved
            ? "Décrivez la solution retenue (ex. caution rendue, geste commercial, frais annulés). Le client et le loueur verront ce message dans leur app."
            : "Expliquez pourquoi le signalement n'est pas retenu. Le client et le loueur verront ce message dans leur app."}
        </p>
        <textarea
          required
          rows={4}
          className="w-full rounded-lg border px-3 py-2 text-sm"
          value={resolution}
          onChange={(e) => setResolution(e.target.value)}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">
            Annuler
          </button>
          <button
            type="submit"
            disabled={saving}
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${resolved ? "bg-emerald-600" : "bg-slate-700"}`}
          >
            {saving ? "Envoi…" : resolved ? "Marquer résolu" : "Rejeter"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
