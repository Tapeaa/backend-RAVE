/**
 * RAVE Back Office - Profil Prestataire
 * Affiche et permet de modifier les infos du compte prestataire
 */

import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import {
  User,
  Building2,
  Phone,
  Mail,
  Hash,
  Save,
  Edit,
  X,
  CheckCircle,
  KeyRound,
  Trash2,
  ShieldAlert,
  FileText,
  ChevronDown,
  ChevronRight,
  Upload,
  CreditCard,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface PrestataireDocuments {
  docNumeroTahiti: string | null;
  docAttestationQualification: string | null;
  docLicenceTransport: string | null;
  docAssurancePro: string | null;
}

interface PrestataireInfo {
  id: string;
  nom: string;
  type: string;
  numeroTahiti: string | null;
  email: string | null;
  phone: string | null;
  isActive: boolean;
  isSociete: boolean;
  totalChauffeurs?: number;
  createdAt: string;
  documents?: PrestataireDocuments;
  osbShopId?: string | null;
  osbPublicKey?: string | null;
  osbConfigured?: boolean;
}

type SubPlan = { id: string; label: string; amountXpf: number; days: number };
type SubscriptionInfo = {
  plan: string | null;
  status: string;
  endsAt: string | null;
  amount: number | null;
  daysRemaining: number | null;
  plans?: { monthly: SubPlan; semiannual: SubPlan };
};

const DOC_FIELDS = [
  { key: 'docNumeroTahiti', label: 'Numéro Tahiti ou K-BIS' },
  { key: 'docAttestationQualification', label: 'Attestation de qualification professionnelle' },
  { key: 'docLicenceTransport', label: 'Licence de transport ou Autorisation d\'exercer' },
  { key: 'docAssurancePro', label: 'Assurances professionnelles' },
] as const;

const typeLabels: Record<string, string> = {
  societe_taxi: 'Société Taxi',
  societe_tourisme: 'Société Transport Touristique',
  patente_taxi: 'Taxi Patenté',
  patente_tourisme: 'Transport Touristique Patenté',
};

export function PrestataireProfil() {
  const [prestataire, setPrestataire] = useState<PrestataireInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [, setLocation] = useLocation();
  const [form, setForm] = useState({
    nom: '',
    numeroTahiti: '',
    email: '',
    phone: '',
  });
  const [codeForm, setCodeForm] = useState({ currentCode: '', newCode: '', confirmCode: '' });
  const [isChangingCode, setIsChangingCode] = useState(false);
  const [codeSuccess, setCodeSuccess] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteCode, setDeleteCode] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [docsExpanded, setDocsExpanded] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [subscribing, setSubscribing] = useState<string | null>(null);
  const [osbForm, setOsbForm] = useState({ shopId: '', publicKey: '', certificate: '' });
  const [savingOsb, setSavingOsb] = useState(false);

  useEffect(() => {
    fetchProfil();
    fetchSubscription();
  }, []);

  async function fetchSubscription() {
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch('/api/prestataire/subscription', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setSubscription(data.subscription || null);
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function handleSubscribe(plan: 'monthly' | 'semiannual') {
    const def = subscription?.plans?.[plan];
    const label = def?.label || (plan === 'monthly' ? 'Mensuel' : '6 mois');
    const amount = def?.amountXpf ?? (plan === 'monthly' ? 5000 : 30000);
    if (!confirm(`Confirmer l’abonnement ${label} — ${amount.toLocaleString('fr-FR')} XPF ?`)) return;
    setSubscribing(plan);
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch('/api/prestataire/subscription/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ plan }),
      });
      const data = await response.json();
      if (response.ok) {
        setSuccessMessage(data.subscription?.message || 'Abonnement activé');
        setTimeout(() => setSuccessMessage(null), 5000);
        await fetchSubscription();
      } else {
        alert(data.error || 'Erreur abonnement');
      }
    } catch {
      alert('Erreur abonnement');
    } finally {
      setSubscribing(null);
    }
  }

  async function handleSaveOsb() {
    if (!osbForm.shopId.trim()) {
      alert('Shop ID requis');
      return;
    }
    setSavingOsb(true);
    setSuccessMessage(null);
    try {
      const token = localStorage.getItem('admin_token');
      const body: Record<string, string> = {
        shopId: osbForm.shopId.trim(),
        publicKey: osbForm.publicKey.trim(),
      };
      if (osbForm.certificate.trim()) {
        body.certificate = osbForm.certificate.trim();
      } else if (!prestataire?.osbConfigured) {
        alert('Certificat (clé API) requis pour la première configuration');
        setSavingOsb(false);
        return;
      }
      const response = await fetch('/api/prestataire/me/osb-credentials', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (response.ok) {
        setPrestataire((prev) =>
          prev
            ? {
                ...prev,
                osbShopId: data.osbShopId,
                osbPublicKey: data.osbPublicKey,
                osbConfigured: data.osbConfigured,
              }
            : prev
        );
        setOsbForm((f) => ({ ...f, certificate: '' }));
        setSuccessMessage(data.message || 'Paiement OSB enregistré');
        setTimeout(() => setSuccessMessage(null), 4000);
      } else {
        alert(data.error || 'Erreur enregistrement OSB');
      }
    } catch {
      alert('Erreur enregistrement OSB');
    } finally {
      setSavingOsb(false);
    }
  }

  async function handleClearOsb() {
    if (!confirm('Supprimer la configuration de paiement OSB ? Les clients repasseront en paiement hors app.')) {
      return;
    }
    setSavingOsb(true);
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch('/api/prestataire/me/osb-credentials', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ clear: true }),
      });
      const data = await response.json();
      if (response.ok) {
        setPrestataire((prev) =>
          prev
            ? { ...prev, osbShopId: null, osbPublicKey: null, osbConfigured: false }
            : prev
        );
        setOsbForm({ shopId: '', publicKey: '', certificate: '' });
        setSuccessMessage(data.message || 'Configuration OSB supprimée');
        setTimeout(() => setSuccessMessage(null), 4000);
      } else {
        alert(data.error || 'Erreur');
      }
    } catch {
      alert('Erreur');
    } finally {
      setSavingOsb(false);
    }
  }

  async function fetchProfil() {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch('/api/prestataire/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setPrestataire(data.prestataire);
        setForm({
          nom: data.prestataire.nom || '',
          numeroTahiti: data.prestataire.numeroTahiti || '',
          email: data.prestataire.email || '',
          phone: data.prestataire.phone || '',
        });
        setOsbForm({
          shopId: data.prestataire.osbShopId || '',
          publicKey: data.prestataire.osbPublicKey || '',
          certificate: '',
        });
        localStorage.setItem('prestataire_info', JSON.stringify(data.prestataire));
      }
    } catch (error) {
      console.error('Error fetching prestataire profile:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSave() {
    if (!prestataire) return;
    setIsSaving(true);
    setSuccessMessage(null);
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch('/api/prestataire/me', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      });

      if (response.ok) {
        const data = await response.json();
        setPrestataire({ ...prestataire, ...data.prestataire });
        setIsEditing(false);
        setSuccessMessage('Profil mis à jour avec succès');
        localStorage.setItem('prestataire_info', JSON.stringify(data.prestataire));
        window.dispatchEvent(new CustomEvent('prestataire-updated', { detail: data.prestataire }));
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        const err = await response.json();
        alert(err.error || 'Erreur lors de la mise à jour');
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      alert('Erreur lors de la mise à jour');
    } finally {
      setIsSaving(false);
    }
  }

  function handleCancel() {
    if (prestataire) {
      setForm({
        nom: prestataire.nom || '',
        numeroTahiti: prestataire.numeroTahiti || '',
        email: prestataire.email || '',
        phone: prestataire.phone || '',
      });
      setIsEditing(false);
    }
  }

  async function handleChangeCode() {
    if (!/^\d{6}$/.test(codeForm.currentCode) || !/^\d{6}$/.test(codeForm.newCode)) {
      alert('Les codes doivent faire exactement 6 chiffres');
      return;
    }
    if (codeForm.newCode !== codeForm.confirmCode) {
      alert('Le nouveau code et la confirmation ne correspondent pas');
      return;
    }
    setIsChangingCode(true);
    setCodeSuccess(null);
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch('/api/prestataire/me/code', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          currentCode: codeForm.currentCode,
          newCode: codeForm.newCode,
        }),
      });
      const data = await response.json();
      if (response.ok) {
        setCodeSuccess(data.message || 'Code mis à jour');
        setCodeForm({ currentCode: '', newCode: '', confirmCode: '' });
        setTimeout(() => setCodeSuccess(null), 5000);
      } else {
        alert(data.error || 'Erreur lors du changement de code');
      }
    } catch (error) {
      console.error(error);
      alert('Erreur lors du changement de code');
    } finally {
      setIsChangingCode(false);
    }
  }

  async function handleDocUpload(field: keyof PrestataireDocuments, file: File) {
    if (!prestataire) return;
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      alert('Format accepté : PDF, JPEG, PNG, WebP');
      return;
    }
    setUploadingDoc(field);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const token = localStorage.getItem('admin_token');
      const uploadRes = await fetch('/api/prestataire/upload-document', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!uploadRes.ok) {
        const err = await uploadRes.json();
        throw new Error(err.error || 'Erreur upload');
      }
      const { url } = await uploadRes.json();
      const patchRes = await fetch('/api/prestataire/me/documents', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ [field]: url }),
      });
      if (!patchRes.ok) throw new Error('Erreur mise à jour');
      const data = await patchRes.json();
      setPrestataire({
        ...prestataire,
        documents: { ...(prestataire.documents || {}), ...data.documents },
      });
      setSuccessMessage('Document enregistré');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (e) {
      alert((e as Error).message || 'Erreur');
    } finally {
      setUploadingDoc(null);
    }
  }

  async function removeDoc(field: keyof PrestataireDocuments) {
    if (!prestataire) return;
    try {
      const token = localStorage.getItem('admin_token');
      const res = await fetch('/api/prestataire/me/documents', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ [field]: null }),
      });
      if (!res.ok) throw new Error('Erreur');
      const data = await res.json();
      setPrestataire({
        ...prestataire,
        documents: { ...(prestataire.documents || {}), ...data.documents },
      });
      setSuccessMessage('Document supprimé');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch {
      alert('Erreur lors de la suppression');
    }
  }

  async function handleDeleteAccount() {
    if (!/^\d{6}$/.test(deleteCode)) {
      alert('Entrez votre code à 6 chiffres pour confirmer');
      return;
    }
    setIsDeleting(true);
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch('/api/prestataire/me', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ code: deleteCode }),
      });
      const data = await response.json();
      if (response.ok) {
        localStorage.removeItem('admin_token');
        localStorage.removeItem('user_type');
        localStorage.removeItem('prestataire_info');
        setDeleteDialogOpen(false);
        setDeleteCode('');
        setLocation('/admin/login');
        alert(data.message || 'Compte supprimé');
      } else {
        alert(data.error || 'Erreur lors de la suppression');
      }
    } catch (error) {
      console.error(error);
      alert('Erreur lors de la suppression');
    } finally {
      setIsDeleting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-purple-600 border-t-transparent" />
      </div>
    );
  }

  if (!prestataire) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Impossible de charger le profil</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Mon profil</h1>
        <p className="mt-1 text-sm text-gray-500">
          Gérez les informations de votre compte prestataire
        </p>
      </div>

      {successMessage && (
        <div className="mb-6 flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-3 text-emerald-700">
          <CheckCircle className="h-5 w-5 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Abonnement plateforme */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100">
            <CreditCard className="h-5 w-5 text-amber-700" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Abonnement RAVE</h2>
            <p className="text-sm text-gray-500">
              {subscription?.status === 'active'
                ? `En cours${subscription.daysRemaining != null ? ` · ${subscription.daysRemaining} j restants` : ''}`
                : subscription?.status === 'expired'
                  ? 'Expiré — renouvelez pour continuer'
                  : 'Aucun abonnement actif'}
            </p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {(['monthly', 'semiannual'] as const).map((key) => {
            const plan = subscription?.plans?.[key];
            const label = plan?.label || (key === 'monthly' ? 'Mensuel' : '6 mois');
            const amount = plan?.amountXpf ?? (key === 'monthly' ? 5000 : 30000);
            const days = plan?.days ?? (key === 'monthly' ? 30 : 180);
            return (
              <button
                key={key}
                type="button"
                disabled={!!subscribing}
                onClick={() => handleSubscribe(key)}
                className="rounded-xl border border-gray-200 p-4 text-left hover:border-amber-400 hover:bg-amber-50/50 transition disabled:opacity-60"
              >
                <div className="flex justify-between items-baseline">
                  <span className="font-semibold text-gray-900">{label}</span>
                  <span className="font-bold text-gray-900">{amount.toLocaleString('fr-FR')} XPF</span>
                </div>
                <p className="mt-1 text-xs text-gray-500">{days} jours d’accès</p>
                {subscribing === key ? (
                  <p className="mt-2 text-xs text-amber-700">Activation…</p>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* Configuration de Paiement (OSB) */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100">
            <KeyRound className="h-5 w-5 text-emerald-700" />
          </div>
          <div className="flex-1">
            <h2 className="font-semibold text-gray-900">Configuration de Paiement (OSB)</h2>
            <p className="text-sm text-gray-500">
              {prestataire.osbConfigured
                ? 'Paiement en ligne actif — les clients peuvent payer par carte sur vos comptes.'
                : 'Sans credentials, les réservations restent en paiement hors app (cash).'}
            </p>
          </div>
          {prestataire.osbConfigured ? (
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
              Configuré
            </span>
          ) : (
            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
              Non configuré
            </span>
          )}
        </div>

        <div className="space-y-4">
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Shop ID</span>
            <input
              type="text"
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2"
              value={osbForm.shopId}
              onChange={(e) => setOsbForm({ ...osbForm, shopId: e.target.value })}
              placeholder="Identifiant boutique PayZen / OSB"
              autoComplete="off"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Clé publique</span>
            <input
              type="text"
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm"
              value={osbForm.publicKey}
              onChange={(e) => setOsbForm({ ...osbForm, publicKey: e.target.value })}
              placeholder="Clé publique KR (front)"
              autoComplete="off"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Certificat (Clé API)</span>
            <input
              type="password"
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm"
              value={osbForm.certificate}
              onChange={(e) => setOsbForm({ ...osbForm, certificate: e.target.value })}
              placeholder={
                prestataire.osbConfigured
                  ? '•••••••• (laisser vide pour conserver)'
                  : 'Certificat API (chiffré côté serveur)'
              }
              autoComplete="new-password"
            />
            <p className="mt-1 text-xs text-gray-500">
              Jamais affiché après enregistrement. Chiffrement enveloppe AES-256-GCM côté serveur
              (clé data unique + wrap KMS ou clé maître).
            </p>
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={savingOsb}
              onClick={handleSaveOsb}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              {savingOsb ? 'Enregistrement…' : 'Enregistrer le paiement'}
            </button>
            {prestataire.osbConfigured ? (
              <button
                type="button"
                disabled={savingOsb}
                onClick={handleClearOsb}
                className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
              >
                Supprimer
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* Carte principale */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        {/* Bandeau type */}
        <div className="bg-gradient-to-r from-purple-600 to-purple-700 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-white/20">
              <Building2 className="h-7 w-7 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">
                {typeLabels[prestataire.type] || prestataire.type}
              </h2>
              <p className="text-sm text-purple-100">
                Compte créé le {new Date(prestataire.createdAt).toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </p>
            </div>
          </div>
        </div>

        {/* Formulaire / lecture */}
        <div className="p-6 space-y-6">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Nom / Raison sociale
            </label>
            {isEditing ? (
              <input
                type="text"
                value={form.nom}
                onChange={(e) => setForm((f) => ({ ...f, nom: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                placeholder="Nom de l'entreprise ou patenté"
              />
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                <User className="h-4 w-4 text-gray-400" />
                <span className="font-medium text-gray-900">{prestataire.nom || '—'}</span>
              </div>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              N° Tahiti / K-BIS
            </label>
            {isEditing ? (
              <input
                type="text"
                value={form.numeroTahiti}
                onChange={(e) => setForm((f) => ({ ...f, numeroTahiti: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                placeholder="Numéro Tahiti ou K-BIS"
              />
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                <Hash className="h-4 w-4 text-gray-400" />
                <span className="text-gray-900">{prestataire.numeroTahiti || '—'}</span>
              </div>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Email
            </label>
            {isEditing ? (
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                placeholder="contact@exemple.pf"
              />
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                <Mail className="h-4 w-4 text-gray-400" />
                <span className="text-gray-900">{prestataire.email || '—'}</span>
              </div>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Téléphone
            </label>
            {isEditing ? (
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                placeholder="+689 XX XX XX XX"
              />
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                <Phone className="h-4 w-4 text-gray-400" />
                <span className="text-gray-900">{prestataire.phone || '—'}</span>
              </div>
            )}
          </div>

          {/* Boutons */}
          <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
            {isEditing ? (
              <>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-white hover:bg-purple-700 disabled:opacity-70"
                >
                  {isSaving ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Enregistrer
                </button>
                <button
                  onClick={handleCancel}
                  disabled={isSaving}
                  className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
                >
                  <X className="h-4 w-4" />
                  Annuler
                </button>
              </>
            ) : (
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-white hover:bg-purple-700"
              >
                <Edit className="h-4 w-4" />
                Modifier
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Documentation */}
      <Collapsible open={docsExpanded} onOpenChange={setDocsExpanded} className="mt-6">
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <CollapsibleTrigger className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-purple-600" />
              <h3 className="text-sm font-semibold text-gray-900">Documentation</h3>
              <span className="text-xs text-gray-500">(optionnel)</span>
            </div>
            {docsExpanded ? <ChevronDown className="h-5 w-5 text-gray-500" /> : <ChevronRight className="h-5 w-5 text-gray-500" />}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="border-t border-gray-100 px-5 py-4 space-y-4">
              <p className="text-sm text-gray-500">
                Ces documents ne sont pas obligatoires pour utiliser la plateforme. S'ils sont renseignés, ils seront visibles sur votre fiche dans le back office admin.
              </p>
              {DOC_FIELDS.map(({ key, label }) => (
                <div key={key} className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">{label}</label>
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      type="file"
                      accept=".pdf,image/jpeg,image/png,image/webp"
                      className="hidden"
                      id={`doc-${key}`}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleDocUpload(key as keyof PrestataireDocuments, f);
                        e.target.value = '';
                      }}
                    />
                    <label
                      htmlFor={`doc-${key}`}
                      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer ${
                        uploadingDoc === key
                          ? 'border-purple-300 bg-purple-50 text-purple-700'
                          : 'border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {uploadingDoc === key ? (
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-purple-600 border-t-transparent" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      {prestataire.documents?.[key as keyof PrestataireDocuments]
                        ? 'Remplacer'
                        : 'Importer (PDF ou image)'}
                    </label>
                    {prestataire.documents?.[key as keyof PrestataireDocuments] && (
                      <>
                        <a
                          href={prestataire.documents[key as keyof PrestataireDocuments]!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-purple-600 hover:underline"
                        >
                          Voir
                        </a>
                        <button
                          type="button"
                          onClick={() => removeDoc(key as keyof PrestataireDocuments)}
                          className="text-sm text-red-600 hover:underline"
                        >
                          Supprimer
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>

      {/* Infos non modifiables */}
      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-gray-700">Informations système</h3>
        <div className="space-y-2 text-sm text-gray-500">
          <p>Statut : {prestataire.isActive ? 'Actif' : 'Inactif'}</p>
          {prestataire.isSociete && prestataire.totalChauffeurs !== undefined && (
            <p>Nombre de chauffeurs : {prestataire.totalChauffeurs}</p>
          )}
        </div>
      </div>

      {/* Changer le code à 6 chiffres */}
      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <KeyRound className="h-5 w-5 text-purple-600" />
          <h3 className="text-sm font-semibold text-gray-900">Changer mon code à 6 chiffres</h3>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Ce code sert à la fois pour le dashboard et l&apos;application. Une fois modifié, utilisez le nouveau code des deux côtés.
        </p>
        {codeSuccess && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
            <CheckCircle className="h-4 w-4 shrink-0" />
            {codeSuccess}
          </div>
        )}
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Code actuel</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={codeForm.currentCode}
              onChange={(e) => setCodeForm((f) => ({ ...f, currentCode: e.target.value.replace(/\D/g, '') }))}
              placeholder="••••••"
              className="w-full max-w-xs rounded-lg border border-gray-300 px-3 py-2 font-mono text-lg tracking-widest focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Nouveau code</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={codeForm.newCode}
              onChange={(e) => setCodeForm((f) => ({ ...f, newCode: e.target.value.replace(/\D/g, '') }))}
              placeholder="••••••"
              className="w-full max-w-xs rounded-lg border border-gray-300 px-3 py-2 font-mono text-lg tracking-widest focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Confirmer le nouveau code</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={codeForm.confirmCode}
              onChange={(e) => setCodeForm((f) => ({ ...f, confirmCode: e.target.value.replace(/\D/g, '') }))}
              placeholder="••••••"
              className="w-full max-w-xs rounded-lg border border-gray-300 px-3 py-2 font-mono text-lg tracking-widest focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
            />
          </div>
          <button
            onClick={handleChangeCode}
            disabled={isChangingCode || !codeForm.currentCode || !codeForm.newCode || !codeForm.confirmCode}
            className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
          >
            {isChangingCode ? 'Changement…' : 'Changer le code'}
          </button>
        </div>
      </div>

      {/* Supprimer mon compte */}
      <div className="mt-6 rounded-xl border border-red-200 bg-red-50/50 p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <Trash2 className="h-5 w-5 text-red-600" />
          <h3 className="text-sm font-semibold text-red-900">Supprimer mon compte</h3>
        </div>
        <p className="text-sm text-red-800/90 mb-4">
          Cette action est irréversible. Toutes les données associées à votre compte seront supprimées ou désactivées.
        </p>
        <button
          onClick={() => setDeleteDialogOpen(true)}
          className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
        >
          Supprimer mon compte
        </button>
      </div>

      {/* Dialog suppression */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <ShieldAlert className="h-5 w-5" />
              Confirmer la suppression
            </DialogTitle>
            <DialogDescription>
              Entrez votre code à 6 chiffres pour confirmer la suppression définitive de votre compte. Cette action est irréversible.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={deleteCode}
              onChange={(e) => setDeleteCode(e.target.value.replace(/\D/g, ''))}
              placeholder="Code à 6 chiffres"
              className="w-full rounded-lg border border-gray-300 px-4 py-3 font-mono text-lg tracking-widest focus:border-red-500 focus:ring-1 focus:ring-red-500"
            />
          </div>
          <DialogFooter>
            <button
              onClick={() => { setDeleteDialogOpen(false); setDeleteCode(''); }}
              className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
            >
              Annuler
            </button>
            <button
              onClick={handleDeleteAccount}
              disabled={isDeleting || deleteCode.length !== 6}
              className="rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700 disabled:opacity-50"
            >
              {isDeleting ? 'Suppression…' : 'Supprimer définitivement'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
