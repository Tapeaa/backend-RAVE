/**
 * RAVE Back Office - Profil Prestataire
 * Affiche et permet de modifier les infos du compte prestataire
 */

import { useEffect, useRef, useState } from 'react';
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
  FileText,
  ChevronDown,
  ChevronRight,
  Upload,
  CreditCard,
  PlugZap,
  Loader2,
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
import { useLoueurNotice } from '@/components/loueur/LoueurNotice';

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
  address?: string | null;
  tvaRegime?: string | null;
  tvaRate?: number | null;
  tvaMode?: 'included' | 'extra' | string | null;
  billingComplete?: boolean;
  billingMissing?: string[];
  isActive: boolean;
  isSociete: boolean;
  totalChauffeurs?: number;
  createdAt: string;
  documents?: PrestataireDocuments;
  osbShopId?: string | null;
  osbPublicKey?: string | null;
  osbProvider?: 'payzen' | 'systempay';
  osbConfigured?: boolean;
}

type SubPlan = { id: string; label: string; amountXpf: number; days: number };
type SubscriptionInfo = {
  plan: string | null;
  status: string;
  endsAt: string | null;
  amount: number | null;
  daysRemaining: number | null;
  waitingFirstVehicle?: boolean;
  paymentUrl?: string | null;
  plans?: { monthly?: SubPlan; semiannual?: SubPlan };
};

const DOC_FIELDS = [
  { key: 'docNumeroTahiti', label: 'Extrait N° Tahiti / avis ISPF' },
  { key: 'docAttestationQualification', label: 'Attestation de qualification professionnelle' },
  { key: 'docLicenceTransport', label: 'Licence / autorisation de location sans chauffeur' },
  { key: 'docAssurancePro', label: 'Attestation d’assurance professionnelle (location sans chauffeur)' },
] as const;

const typeLabels: Record<string, string> = {
  agence_location: 'Agence de location',
  loueur_individuel: 'Loueur individuel',
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
    address: '',
    tvaRegime: 'franchise' as 'franchise' | 'assujetti',
    tvaRate: 16,
    tvaMode: 'included' as 'included' | 'extra',
  });
  const [codeForm, setCodeForm] = useState({ currentCode: '', newCode: '', confirmCode: '' });
  const [isChangingCode, setIsChangingCode] = useState(false);
  const [codeSuccess, setCodeSuccess] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteCode, setDeleteCode] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [docsExpanded, setDocsExpanded] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);
  const notice = useLoueurNotice();
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [subscribing, setSubscribing] = useState<string | null>(null);
  const aboPollRef = useRef<number | null>(null);
  const [osbForm, setOsbForm] = useState<{ shopId: string; publicKey: string; certificate: string; provider: 'payzen' | 'systempay' }>({
    shopId: '',
    publicKey: '',
    certificate: '',
    provider: 'payzen',
  });
  const [savingOsb, setSavingOsb] = useState(false);
  const [testingOsb, setTestingOsb] = useState(false);
  const [osbTestResult, setOsbTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  function stopAboPoll() {
    if (aboPollRef.current) {
      window.clearInterval(aboPollRef.current);
      aboPollRef.current = null;
    }
  }

  function startAboPoll() {
    stopAboPoll();
    let ticks = 0;
    aboPollRef.current = window.setInterval(async () => {
      ticks += 1;
      const sub = await fetchSubscription();
      if (sub?.status === 'active') {
        stopAboPoll();
        void notice.alert(
          'Merci pour votre abonnement',
          'Votre paiement a été validé. L’abonnement est payé et en cours. Vous avez accès à toute l’application.'
        );
      }
      if (ticks >= 40) stopAboPoll();
    }, 2500);
  }

  useEffect(() => {
    fetchProfil();
    fetchSubscription().then(async (sub) => {
      const params = new URLSearchParams(window.location.search);
      const stripeSession = params.get('session_id');
      if (params.get('abonnement') === 'ok' || stripeSession) {
        window.history.replaceState({}, '', window.location.pathname);
        if (stripeSession) {
          try {
            const token = localStorage.getItem('admin_token');
            await fetch('/api/prestataire/subscription/confirm', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ sessionId: stripeSession }),
            });
          } catch (e) {
            console.error(e);
          }
          sub = await fetchSubscription();
        }
        if (sub?.status === 'active') {
          void notice.alert(
            'Merci pour votre abonnement',
            'Votre paiement a été validé. L’abonnement est payé et en cours. Vous avez accès à toute l’application.'
          );
        } else startAboPoll();
      }
    });
    return () => stopAboPoll();
  }, []);

  async function fetchSubscription(): Promise<SubscriptionInfo | null> {
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch('/api/prestataire/subscription', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        const sub = data.subscription || null;
        setSubscription(sub);
        return sub;
      }
    } catch (e) {
      console.error(e);
    }
    return null;
  }

  async function handleSubscribe(plan: 'monthly' | 'semiannual') {
    const def = subscription?.plans?.[plan];
    const label = def?.label || (plan === 'monthly' ? 'Mensuel' : '6 mois');
    const amount = def?.amountXpf ?? (plan === 'monthly' ? 5000 : 30000);
    const ok = await notice.confirm(
      'Payer l’abonnement Tape’ā',
      `Formule ${label} — ${amount.toLocaleString('fr-FR')} XPF via Stripe.\n\nL’accès s’active dès confirmation du paiement.`,
      { confirmLabel: 'Continuer vers Stripe' }
    );
    if (!ok) return;
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
        const payUrl = data.subscription?.paymentUrl as string | undefined;
        setSuccessMessage(data.subscription?.message || 'Redirection vers Stripe…');
        setTimeout(() => setSuccessMessage(null), 8000);
        if (payUrl) window.open(payUrl, '_blank', 'noopener,noreferrer');
        await fetchSubscription();
        startAboPoll();
      } else {
        await notice.alert('Paiement Stripe', data.error || 'Impossible de lancer le paiement pour le moment.');
      }
    } catch {
      await notice.alert('Paiement Stripe', 'Impossible de lancer le paiement pour le moment.');
    } finally {
      setSubscribing(null);
    }
  }

  async function handleSaveOsb() {
    if (!osbForm.shopId.trim()) {
      await notice.alert('Paiement en ligne', 'L’identifiant boutique (Shop ID) est requis.');
      return;
    }
    setSavingOsb(true);
    setSuccessMessage(null);
    try {
      const token = localStorage.getItem('admin_token');
      const body: Record<string, string> = {
        shopId: osbForm.shopId.trim(),
        publicKey: osbForm.publicKey.trim(),
        provider: osbForm.provider,
      };
      if (osbForm.certificate.trim()) {
        body.certificate = osbForm.certificate.trim();
      } else if (!prestataire?.osbConfigured) {
        await notice.alert('Paiement en ligne', 'Le certificat (clé API) est requis pour la première configuration.');
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
                osbProvider: data.osbProvider,
                osbConfigured: data.osbConfigured,
              }
            : prev
        );
        setOsbForm((f) => ({ ...f, certificate: '' }));
        setSuccessMessage(data.message || 'Paiement en ligne enregistré');
        setTimeout(() => setSuccessMessage(null), 4000);
      } else {
        await notice.alert('Paiement en ligne', data.error || 'Impossible d’enregistrer la configuration du paiement en ligne.');
      }
    } catch {
      await notice.alert('Paiement en ligne', 'Impossible d’enregistrer la configuration du paiement en ligne.');
    } finally {
      setSavingOsb(false);
    }
  }

  async function handleClearOsb() {
    const ok = await notice.confirm(
      'Supprimer le paiement en ligne',
      'Les clients paieront alors directement chez le loueur.',
      { confirmLabel: 'Supprimer', tone: 'danger' }
    );
    if (!ok) return;
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
        setOsbForm({ shopId: '', publicKey: '', certificate: '', provider: 'payzen' });
        setSuccessMessage(data.message || 'Configuration du paiement en ligne supprimée');
        setTimeout(() => setSuccessMessage(null), 4000);
      } else {
        await notice.alert('Paiement en ligne', data.error || 'Impossible de supprimer la configuration.');
      }
    } catch {
      await notice.alert('Paiement en ligne', 'Impossible de supprimer la configuration.');
    } finally {
      setSavingOsb(false);
    }
  }

  async function handleTestOsb() {
    setTestingOsb(true);
    setOsbTestResult(null);
    try {
      const token = localStorage.getItem('admin_token');
      const body: Record<string, string> = {
        shopId: osbForm.shopId.trim(),
        publicKey: osbForm.publicKey.trim(),
        provider: osbForm.provider,
      };
      if (osbForm.certificate.trim()) {
        body.certificate = osbForm.certificate.trim();
      }
      const response = await fetch('/api/prestataire/me/osb-credentials/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      setOsbTestResult({
        ok: !!data.ok,
        message: data.message || data.error || (data.ok ? 'Connexion OK' : 'Échec du test'),
      });
    } catch {
      setOsbTestResult({ ok: false, message: 'Erreur réseau lors du test de connexion' });
    } finally {
      setTestingOsb(false);
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
          address: data.prestataire.address || '',
          tvaRegime: data.prestataire.tvaRegime === 'assujetti' ? 'assujetti' : 'franchise',
          tvaRate: Number(data.prestataire.tvaRate) || 16,
          tvaMode: data.prestataire.tvaMode === 'extra' ? 'extra' : 'included',
        });
        setOsbForm({
          shopId: data.prestataire.osbShopId || '',
          publicKey: data.prestataire.osbPublicKey || '',
          certificate: '',
          provider: data.prestataire.osbProvider === 'systempay' ? 'systempay' : 'payzen',
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
    if (!form.nom.trim()) {
      await notice.alert('Profil incomplet', 'Le nom / raison sociale est obligatoire.');
      return;
    }
    if (!form.phone.trim()) {
      await notice.alert('Profil incomplet', 'Le téléphone est obligatoire.');
      return;
    }
    if (!form.numeroTahiti.trim()) {
      await notice.alert('Profil incomplet', 'Le N° Tahiti est obligatoire.');
      return;
    }
    if (!form.address.trim() || form.address.trim().length < 8) {
      await notice.alert('Profil incomplet', 'L’adresse de facturation est obligatoire (min. 8 caractères).');
      return;
    }
    if (form.tvaRegime === 'assujetti' && (!form.tvaMode || (form.tvaMode !== 'included' && form.tvaMode !== 'extra'))) {
      await notice.alert('Profil incomplet', 'Choisissez si la TVA est incluse dans le prix ou facturée en plus.');
      return;
    }
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
        await notice.alert('Mise à jour du profil', err.error || 'Impossible d’enregistrer les modifications.');
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      await notice.alert('Mise à jour du profil', 'Impossible d’enregistrer les modifications.');
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
        address: prestataire.address || '',
        tvaRegime: prestataire.tvaRegime === 'assujetti' ? 'assujetti' : 'franchise',
        tvaRate: Number(prestataire.tvaRate) || 16,
        tvaMode: prestataire.tvaMode === 'extra' ? 'extra' : 'included',
      });
      setIsEditing(false);
    }
  }

  async function handleChangeCode() {
    if (!/^\d{6}$/.test(codeForm.currentCode) || !/^\d{6}$/.test(codeForm.newCode)) {
      await notice.alert('Changement de code', 'Les codes doivent faire exactement 6 chiffres.');
      return;
    }
    if (codeForm.newCode !== codeForm.confirmCode) {
      await notice.alert('Changement de code', 'Le nouveau code et la confirmation ne correspondent pas.');
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
        await notice.alert('Changement de code', data.error || 'Impossible de changer le code.');
      }
    } catch (error) {
      console.error(error);
      await notice.alert('Changement de code', 'Impossible de changer le code.');
    } finally {
      setIsChangingCode(false);
    }
  }

  async function handleDocUpload(field: keyof PrestataireDocuments, file: File) {
    if (!prestataire) return;
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      await notice.alert('Document', 'Format accepté : PDF, JPEG, PNG, WebP.');
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
      await notice.alert('Document', (e as Error).message || 'Impossible d’enregistrer le document.');
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
      await notice.alert('Document', 'Impossible de supprimer le document.');
    }
  }

  async function handleDeleteAccount() {
    if (!/^\d{6}$/.test(deleteCode)) {
      await notice.alert('Suppression du compte', 'Entrez votre code à 6 chiffres pour confirmer.');
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
      } else {
        await notice.alert('Suppression du compte', data.error || 'Impossible de supprimer le compte.');
      }
    } catch (error) {
      console.error(error);
      await notice.alert('Suppression du compte', 'Impossible de supprimer le compte.');
    } finally {
      setIsDeleting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-900 border-t-transparent" />
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

  const subDays = subscription?.daysRemaining ?? null;
  const subDaysLabel =
    subDays != null ? `${subDays} jour${subDays > 1 ? 's' : ''} restant${subDays > 1 ? 's' : ''}` : '';
  const subEndLabel = subscription?.endsAt
    ? `jusqu’au ${new Date(subscription.endsAt).toLocaleDateString('fr-FR')}`
    : '';
  const subHeadline = subscription?.waitingFirstVehicle
    ? { title: 'Essai non activé', tone: 'amber' as const }
    : subscription?.status === 'active'
      ? { title: 'Abonnement payé et en cours', tone: 'green' as const }
      : subscription?.status === 'trial'
        ? { title: 'Période d’essai lancée', tone: 'neutral' as const }
        : subscription?.status === 'pending'
          ? { title: 'Paiement en cours', tone: 'amber' as const }
          : subscription?.status === 'grace'
            ? { title: 'Délai de grâce', tone: 'amber' as const }
            : subscription?.status === 'expired'
              ? { title: 'Abonnement expiré', tone: 'red' as const }
              : { title: 'Aucun abonnement', tone: 'neutral' as const };
  const subToneClass = {
    green: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    amber: 'bg-amber-50 text-amber-800 ring-amber-200',
    red: 'bg-red-50 text-red-700 ring-red-200',
    neutral: 'bg-gray-50 text-gray-800 ring-gray-200',
  }[subHeadline.tone];

  const cardClass = 'rounded-xl border border-gray-200 bg-white';
  const inputClass =
    'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900';
  const labelClass = 'mb-1 block text-xs font-medium text-gray-500';
  const readClass = 'text-sm text-gray-900';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Profil & abonnement</h1>
          <p className="mt-1 text-sm text-gray-500">
            {typeLabels[prestataire.type] || 'Loueur'} · compte créé le{' '}
            {new Date(prestataire.createdAt).toLocaleDateString('fr-FR', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </p>
        </div>
        <span
          className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
            prestataire.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${prestataire.isActive ? 'bg-emerald-500' : 'bg-gray-400'}`} />
          {prestataire.isActive ? 'Compte actif' : 'Compte inactif'}
        </span>
      </div>

      {successMessage && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle className="h-4 w-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {prestataire.billingComplete === false && (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-amber-900">Profil de facturation incomplet</p>
            <p className="mt-0.5 text-sm text-amber-900/80">
              Requis pour publier des véhicules et accepter des locations.
              {Array.isArray(prestataire.billingMissing) && prestataire.billingMissing.length > 0
                ? ` Manquant : ${prestataire.billingMissing.join(', ')}.`
                : ''}
            </p>
          </div>
          {!isEditing && (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="shrink-0 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-50"
            >
              Compléter
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-5 [&>*]:min-w-0">
      <div className="space-y-6 lg:order-2 lg:col-span-2">
      {/* Abonnement plateforme */}
      <section className={cardClass}>
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-gray-500" />
            <h2 className="text-sm font-semibold text-gray-900">Abonnement Tape’ā</h2>
          </div>
        </div>
        <div className="space-y-4 p-5">
          <div className={`rounded-lg px-4 py-3 ring-1 ring-inset ${subToneClass}`}>
            <p className="text-base font-semibold">{subHeadline.title}</p>
            <p className="mt-0.5 text-sm opacity-80">
              {subscription?.waitingFirstVehicle
                ? "Veuillez créer votre premier véhicule pour activer votre période d'essai, ou payer l'abonnement Tape'ā."
                : subscription?.status === 'active' || subscription?.status === 'trial'
                  ? [subDaysLabel, subEndLabel].filter(Boolean).join(' · ')
                  : subscription?.status === 'pending'
                    ? 'Activation automatique dès confirmation Stripe.'
                    : subscription?.status === 'grace'
                      ? `${(subscription as any).graceDaysRemaining ?? 0} jour(s) avant masquage du catalogue.`
                      : subscription?.status === 'expired'
                        ? 'Vos véhicules sont masqués du catalogue client.'
                        : 'Choisissez une formule ci-dessous.'}
            </p>
          </div>

          {subscription?.status !== 'active' && subscription?.plans ? (
            <div className="space-y-2">
              {(['monthly', 'semiannual'] as const).map((key) => {
                const plan = subscription?.plans?.[key];
                if (!plan) return null;
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={!!subscribing}
                    onClick={() => handleSubscribe(key)}
                    className="flex w-full items-center justify-between rounded-lg border border-gray-200 px-4 py-3 text-left transition-colors hover:border-gray-900 disabled:opacity-60"
                  >
                    <div>
                      <div className="text-sm font-medium text-gray-900">{plan.label}</div>
                      <div className="text-xs text-gray-500">{plan.days} jours d’accès</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold text-gray-900">
                        {plan.amountXpf.toLocaleString('fr-FR')} XPF
                      </div>
                      <div className="text-xs font-medium text-[#635BFF]">
                        {subscribing === key ? 'Ouverture…' : 'Payer avec Stripe'}
                      </div>
                    </div>
                  </button>
                );
              })}
              <p className="text-xs text-gray-500">
                Paiement sécurisé Stripe. L’accès est activé automatiquement après confirmation.
              </p>
            </div>
          ) : null}
        </div>
      </section>

      {/* Configuration de Paiement (OSB) */}
      <section className={cardClass}>
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-gray-500" />
            <h2 className="text-sm font-semibold text-gray-900">Paiement en ligne par carte</h2>
          </div>
          {prestataire.osbConfigured ? (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
              Configuré
            </span>
          ) : (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
              Non configuré
            </span>
          )}
        </div>

        <div className="space-y-4 p-5">
          <p className="text-sm text-gray-500">
            {prestataire.osbConfigured
              ? 'Vos clients peuvent payer par carte au moment de la réservation.'
              : 'Sans configuration, vos clients paient directement chez vous (espèces ou autre moyen convenu).'}
          </p>
          <div>
            <span className={labelClass}>Votre banque</span>
            <div className="mt-1 grid gap-2 sm:grid-cols-2">
              {([
                { id: 'payzen', title: 'Socredo / Banque de Polynésie', sub: 'PayZen (OSB)' },
                { id: 'systempay', title: 'Banque de Tahiti', sub: 'Systempay (SP+ Pro)' },
              ] as const).map((opt) => {
                const active = osbForm.provider === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setOsbForm({ ...osbForm, provider: opt.id });
                      setOsbTestResult(null);
                    }}
                    className={`rounded-xl border p-3 text-left transition ${
                      active
                        ? 'border-emerald-500 bg-emerald-50/60 ring-1 ring-emerald-200'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={`flex h-4 w-4 items-center justify-center rounded-full border ${
                          active ? 'border-emerald-600 bg-emerald-600' : 'border-gray-300'
                        }`}
                      >
                        {active ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
                      </span>
                      <span className="text-sm font-semibold text-gray-900">{opt.title}</span>
                    </span>
                    <span className="mt-0.5 block pl-6 text-xs text-gray-500">{opt.sub}</span>
                  </button>
                );
              })}
            </div>
            <span className="mt-1.5 block text-xs text-gray-400">
              {osbForm.provider === 'systempay'
                ? 'Clés dans votre back-office Systempay : Paramétrage → Boutique → Clés d’API REST.'
                : 'Clés dans votre back-office PayZen / OSB : Paramétrage → Boutique → Clés d’API REST.'}
            </span>
          </div>
          <label className="block">
            <span className={labelClass}>Shop ID</span>
            <input
              type="text"
              className={inputClass}
              value={osbForm.shopId}
              onChange={(e) => setOsbForm({ ...osbForm, shopId: e.target.value })}
              placeholder={osbForm.provider === 'systempay' ? 'Identifiant boutique Systempay' : 'Identifiant boutique PayZen / OSB'}
              autoComplete="off"
            />
          </label>
          <label className="block">
            <span className={labelClass}>Clé publique</span>
            <input
              type="text"
              className={`${inputClass} font-mono`}
              value={osbForm.publicKey}
              onChange={(e) => setOsbForm({ ...osbForm, publicKey: e.target.value })}
              placeholder="Ex. 12345678:publickey_…"
              autoComplete="off"
            />
          </label>
          <label className="block">
            <span className={labelClass}>Certificat (clé API)</span>
            <input
              type="password"
              className={`${inputClass} font-mono`}
              value={osbForm.certificate}
              onChange={(e) => setOsbForm({ ...osbForm, certificate: e.target.value })}
              placeholder={
                prestataire.osbConfigured
                  ? '•••••••• (laisser vide pour conserver)'
                  : 'Mot de passe API (testpassword_… ou prodpassword_…)'
              }
              autoComplete="new-password"
            />
            <span className="mt-1 block text-xs text-gray-400">
              Chiffré côté serveur, jamais réaffiché après enregistrement.
            </span>
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={savingOsb || testingOsb}
              onClick={handleSaveOsb}
              className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              {savingOsb ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            <button
              type="button"
              disabled={savingOsb || testingOsb || (!osbForm.shopId.trim() && !prestataire.osbConfigured)}
              onClick={handleTestOsb}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-60"
            >
              {testingOsb ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <PlugZap className="h-4 w-4" />
              )}
              {testingOsb ? 'Test…' : 'Tester'}
            </button>
            {prestataire.osbConfigured ? (
              <button
                type="button"
                disabled={savingOsb || testingOsb}
                onClick={handleClearOsb}
                className="rounded-lg px-3.5 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
              >
                Supprimer
              </button>
            ) : null}
          </div>
          {osbTestResult ? (
            <p
              className={`rounded-lg px-3 py-2 text-sm ${
                osbTestResult.ok
                  ? 'bg-emerald-50 text-emerald-800'
                  : 'bg-red-50 text-red-700'
              }`}
            >
              {osbTestResult.message}
            </p>
          ) : null}
        </div>
      </section>
      </div>

      <div className="space-y-6 lg:order-1 lg:col-span-3">
      {/* Carte principale */}
      <section className={cardClass}>
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-gray-500" />
            <h2 className="text-sm font-semibold text-gray-900">Informations du compte</h2>
          </div>
          {!isEditing ? (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50"
            >
              <Edit className="h-3.5 w-3.5" />
              Modifier
            </button>
          ) : null}
        </div>

        {/* Formulaire / lecture */}
        <div className="grid grid-cols-1 gap-5 p-5 sm:grid-cols-2 [&>*]:min-w-0">
          <div>
            <label className={labelClass}>
              Nom / Raison sociale
            </label>
            {isEditing ? (
              <input
                type="text"
                value={form.nom}
                onChange={(e) => setForm((f) => ({ ...f, nom: e.target.value }))}
                className={inputClass}
                placeholder="Nom de l'entreprise ou patenté"
              />
            ) : (
              <div className="flex items-center gap-2 py-1.5 text-sm">
                <User className="h-4 w-4 text-gray-400" />
                <span className="font-medium text-gray-900">{prestataire.nom || '—'}</span>
              </div>
            )}
          </div>

          <div>
            <label className={labelClass}>
              N° Tahiti / K-BIS
            </label>
            {isEditing ? (
              <input
                type="text"
                value={form.numeroTahiti}
                onChange={(e) => setForm((f) => ({ ...f, numeroTahiti: e.target.value }))}
                className={inputClass}
                placeholder="Numéro Tahiti ou K-BIS"
              />
            ) : (
              <div className="flex items-center gap-2 py-1.5 text-sm">
                <Hash className="h-4 w-4 text-gray-400" />
                <span className="text-gray-900">{prestataire.numeroTahiti || '—'}</span>
              </div>
            )}
          </div>

          <div>
            <label className={labelClass}>
              Email
            </label>
            {isEditing ? (
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className={inputClass}
                placeholder="contact@exemple.pf"
              />
            ) : (
              <div className="flex items-center gap-2 py-1.5 text-sm">
                <Mail className="h-4 w-4 text-gray-400" />
                <span className="text-gray-900">{prestataire.email || '—'}</span>
              </div>
            )}
          </div>

          <div>
            <label className={labelClass}>
              Téléphone
            </label>
            {isEditing ? (
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                className={inputClass}
                placeholder="+689 XX XX XX XX"
              />
            ) : (
              <div className="flex items-center gap-2 py-1.5 text-sm">
                <Phone className="h-4 w-4 text-gray-400" />
                <span className="text-gray-900">{prestataire.phone || '—'}</span>
              </div>
            )}
          </div>

          <div className="sm:col-span-2">
            <label className={labelClass}>
              Adresse du siège / facturation *
            </label>
            {isEditing ? (
              <textarea
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                rows={2}
                className={inputClass}
                placeholder="Adresse complète (obligatoire sur les factures)"
              />
            ) : (
              <div className={`py-1.5 whitespace-pre-wrap ${prestataire.address ? readClass : 'text-sm text-amber-700'}`}>
                {prestataire.address || 'Non renseignée — à compléter'}
              </div>
            )}
          </div>

          <div className="sm:col-span-2">
            <label className={labelClass}>
              Régime TVA
            </label>
            {isEditing ? (
              <div className="space-y-2">
                <select
                  value={form.tvaRegime}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      tvaRegime: e.target.value as 'franchise' | 'assujetti',
                    }))
                  }
                  className={inputClass}
                >
                  <option value="franchise">Franchise en base (TVA non applicable)</option>
                  <option value="assujetti">Assujetti à la TVA</option>
                </select>
                {form.tvaRegime === 'assujetti' && (
                  <>
                    <div>
                      <label className="mb-1 block text-xs text-gray-600">Taux TVA (%)</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.1}
                        value={form.tvaRate}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, tvaRate: Number(e.target.value) || 0 }))
                        }
                        className="w-full rounded-lg border border-gray-300 px-3 py-2"
                      />
                    </div>
                    <div className="space-y-2 rounded-lg border border-gray-200 p-3">
                      <p className="text-xs font-medium text-gray-700">
                        Application de la TVA sur vos tarifs *
                      </p>
                      <label className="flex cursor-pointer items-start gap-2 text-sm text-gray-800">
                        <input
                          type="radio"
                          name="tvaMode"
                          className="mt-1"
                          checked={form.tvaMode === 'included'}
                          onChange={() => setForm((f) => ({ ...f, tvaMode: 'included' }))}
                        />
                        <span>
                          <span className="font-medium">Inclure la TVA dans le prix</span>
                          <span className="block text-xs text-gray-500">
                            Le tarif journalier saisi est TTC (payé tel quel par le client).
                          </span>
                        </span>
                      </label>
                      <label className="flex cursor-pointer items-start gap-2 text-sm text-gray-800">
                        <input
                          type="radio"
                          name="tvaMode"
                          className="mt-1"
                          checked={form.tvaMode === 'extra'}
                          onChange={() => setForm((f) => ({ ...f, tvaMode: 'extra' }))}
                        />
                        <span>
                          <span className="font-medium">Facturer la TVA en plus</span>
                          <span className="block text-xs text-gray-500">
                            Le tarif journalier saisi est HT ; la TVA est ajoutée sur l’app client,
                            contrats et factures.
                          </span>
                        </span>
                      </label>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className={`py-1.5 ${readClass}`}>
                {prestataire.tvaRegime === 'assujetti'
                  ? `Assujetti — ${prestataire.tvaRate ?? 16} % — ${
                      prestataire.tvaMode === 'extra'
                        ? 'TVA en plus du tarif'
                        : 'TVA incluse dans le tarif'
                    }`
                  : 'Franchise en base (TVA non applicable)'}
              </div>
            )}
          </div>

          {isEditing ? (
            <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-4 sm:col-span-2">
              <button
                onClick={handleCancel}
                disabled={isSaving}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <X className="h-4 w-4" />
                Annuler
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-70"
              >
                {isSaving ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Enregistrer
              </button>
            </div>
          ) : null}
        </div>
      </section>

      {/* Documentation */}
      <Collapsible open={docsExpanded} onOpenChange={setDocsExpanded}>
        <div className={`${cardClass} overflow-hidden`}>
          <CollapsibleTrigger className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-gray-50">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-gray-500" />
              <h3 className="text-sm font-semibold text-gray-900">Documents professionnels</h3>
              <span className="text-xs text-gray-400">recommandé</span>
            </div>
            {docsExpanded ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="border-t border-gray-100 px-5 py-4 space-y-4">
              <p className="text-sm text-gray-500">
                Déposez vos justificatifs professionnels (N° Tahiti et assurance « location de véhicules sans chauffeur »). RAVE peut les demander à tout moment et suspendre un compte non conforme.
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
                          ? 'border-gray-300 bg-gray-50 text-gray-500'
                          : 'border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {uploadingDoc === key ? (
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-700 border-t-transparent" />
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
                          className="text-sm font-medium text-gray-900 underline-offset-2 hover:underline"
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

      {/* Changer le code à 6 chiffres */}
      <section className={cardClass}>
        <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-4">
          <KeyRound className="h-4 w-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900">Code d’accès à 6 chiffres</h3>
        </div>
        <div className="p-5">
        <p className="mb-4 text-sm text-gray-500">
          Utilisé pour le dashboard et l&apos;application loueur.
        </p>
        {codeSuccess && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
            <CheckCircle className="h-4 w-4 shrink-0" />
            {codeSuccess}
          </div>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 [&>*]:min-w-0">
          <div>
            <label className={labelClass}>Code actuel</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={codeForm.currentCode}
              onChange={(e) => setCodeForm((f) => ({ ...f, currentCode: e.target.value.replace(/\D/g, '') }))}
              placeholder="••••••"
              className={`${inputClass} font-mono tracking-widest`}
            />
          </div>
          <div>
            <label className={labelClass}>Nouveau code</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={codeForm.newCode}
              onChange={(e) => setCodeForm((f) => ({ ...f, newCode: e.target.value.replace(/\D/g, '') }))}
              placeholder="••••••"
              className={`${inputClass} font-mono tracking-widest`}
            />
          </div>
          <div>
            <label className={labelClass}>Confirmer le nouveau code</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={codeForm.confirmCode}
              onChange={(e) => setCodeForm((f) => ({ ...f, confirmCode: e.target.value.replace(/\D/g, '') }))}
              placeholder="••••••"
              className={`${inputClass} font-mono tracking-widest`}
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            onClick={handleChangeCode}
            disabled={isChangingCode || !codeForm.currentCode || !codeForm.newCode || !codeForm.confirmCode}
            className="rounded-lg bg-gray-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-40"
          >
            {isChangingCode ? 'Changement…' : 'Changer le code'}
          </button>
        </div>
        </div>
      </section>

      {/* Supprimer mon compte */}
      <section className="flex flex-col gap-3 rounded-xl border border-red-100 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-red-500" />
            <h3 className="text-sm font-semibold text-gray-900">Supprimer mon compte</h3>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            Action irréversible : vos données seront supprimées ou désactivées.
          </p>
        </div>
        <button
          onClick={() => setDeleteDialogOpen(true)}
          className="shrink-0 rounded-lg border border-red-200 px-3.5 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
        >
          Supprimer
        </button>
      </section>
      </div>
      </div>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md border-gray-100 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.12)]">
          <DialogHeader>
            <DialogTitle className="text-[17px] font-semibold text-gray-900">
              Supprimer le compte
            </DialogTitle>
            <DialogDescription className="text-[15px] leading-relaxed text-gray-600">
              Entrez votre code à 6 chiffres pour confirmer. Cette action est irréversible.
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
