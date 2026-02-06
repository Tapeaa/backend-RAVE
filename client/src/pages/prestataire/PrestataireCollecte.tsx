/**
 * Tape'a Back Office - Collecte de Frais (Prestataire)
 * Vue des commissions dues à TAPEA
 */

import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Wallet, Clock, Check, AlertTriangle, Eye, Info, CreditCard, Building2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface Collecte {
  id: string;
  periode: string;
  montantDu: number;
  montantPaye: number;
  isPaid: boolean;
  paidAt: string | null;
  createdAt: string;
}

interface FraisConfig {
  fraisServicePrestataire: number;
  commissionPrestataire: number;
  commissionSalarieTapea: number;
}

// Infos virement (à modifier plus tard)
const VIREMENT_INFO = {
  iban: 'FR76 1234 5678 9012 3456 7890 123',
  bic: 'BDFEPF2P',
  bankName: 'Banque de Polynésie Française',
  reference: 'TAPEA-COMMISSION-[Votre code prestataire]',
};

function StripePaymentForm({
  clientSecret,
  amount,
  paymentIntentId,
  onSuccess,
  onCancel,
}: {
  clientSecret: string;
  amount: number;
  paymentIntentId: string;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setLoading(true);
    setError(null);
    try {
      const { error: confirmError } = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: window.location.href },
        redirect: 'if_required',
      });
      if (confirmError) {
        setError(confirmError.message || 'Erreur de paiement');
        setLoading(false);
        return;
      }
      const token = localStorage.getItem('admin_token');
      const res = await fetch('/api/prestataire/collecte/confirm-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ paymentIntentId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Erreur lors de la confirmation');
      }
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 gap-3">
      <div className="flex-1 min-h-0 overflow-y-auto py-2 pr-1">
        <PaymentElement />
      </div>
      {error && <p className="text-sm text-red-600 shrink-0">{error}</p>}
      <div className="flex gap-2 justify-end shrink-0 pt-4 pb-1 border-t bg-white">
        <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
          Annuler
        </Button>
        <Button type="submit" disabled={!stripe || loading}>
          {loading ? 'Traitement...' : `Payer ${amount.toLocaleString()} XPF`}
        </Button>
      </div>
    </form>
  );
}

export function PrestataireCollecte() {
  const [collectes, setCollectes] = useState<Collecte[]>([]);
  const [fraisConfig, setFraisConfig] = useState<FraisConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [stripeModalOpen, setStripeModalOpen] = useState(false);
  const [virementOpen, setVirementOpen] = useState(false);
  const [stripeStep, setStripeStep] = useState<'choice' | 'form'>('choice');
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [stripeAmount, setStripeAmount] = useState(0);
  const [stripeLoading, setStripeLoading] = useState(false);
  const [publishableKey, setPublishableKey] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/stripe/publishable-key')
      .then((r) => r.json())
      .then((data) => setPublishableKey(data.publishableKey || null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchCollecte();
    fetchFraisConfig();
  }, []);

  // Gérer le retour Stripe après 3DS (redirection)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentIntentId = params.get('payment_intent');
    const redirectStatus = params.get('redirect_status');
    if (paymentIntentId && redirectStatus === 'succeeded') {
      const token = localStorage.getItem('admin_token');
      fetch('/api/prestataire/collecte/confirm-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ paymentIntentId }),
      })
        .then(() => fetchCollecte())
        .finally(() => {
          window.history.replaceState({}, '', window.location.pathname);
        });
    }
  }, []);

  async function fetchCollecte() {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch('/api/prestataire/collecte', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setCollectes(data.collectes || []);
      }
    } catch (error) {
      console.error('Error fetching collecte:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function fetchFraisConfig() {
    try {
      const response = await fetch('/api/frais-service-config');
      if (response.ok) {
        const data = await response.json();
        setFraisConfig(data.config);
      }
    } catch (error) {
      console.error('Error fetching frais config:', error);
    }
  }

  const formatPeriode = (periode: string) => {
    const [year, month] = periode.split('-');
    const months = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
      'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
    return `${months[parseInt(month) - 1]} ${year}`;
  };

  // Montant restant à payer = pour chaque collecte non soldée : (montantDu - montantPaye)
  const totalRestantApayer = collectes
    .filter(c => !c.isPaid)
    .reduce((sum, c) => sum + Math.max(0, (c.montantDu || 0) - (c.montantPaye || 0)), 0);
  const totalPaye = collectes.filter(c => c.isPaid).reduce((sum, c) => sum + (c.montantPaye || 0), 0);

  const handleStripeChoice = async (option: 'full' | 'half') => {
    const token = localStorage.getItem('admin_token');
    setStripeLoading(true);
    try {
      const res = await fetch('/api/prestataire/collecte/payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ option }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setClientSecret(data.clientSecret);
      setPaymentIntentId(data.paymentIntentId);
      setStripeAmount(data.amount);
      setStripeStep('form');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setStripeLoading(false);
    }
  };

  const closeStripeModal = () => {
    setStripeModalOpen(false);
    setStripeStep('choice');
    setClientSecret(null);
    setPaymentIntentId(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mes frais de commission</h1>
        <p className="text-gray-600">Commissions dues à TAPEA pour l'utilisation de la plateforme</p>
      </div>

      {/* Explication des frais */}
      {fraisConfig && (
        <div className="rounded-lg border-2 border-purple-200 bg-purple-50 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Info className="h-5 w-5 text-purple-600" />
            <h3 className="font-semibold text-purple-900">Comment sont calculés vos frais ?</h3>
          </div>
          
          <div className="space-y-2 text-sm">
            <div className="flex items-start gap-3 rounded-lg bg-white p-3">
              <div className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-purple-100 text-xs font-bold text-purple-700">
                1
              </div>
              <div className="flex-1">
                <p className="font-medium text-gray-900">
                  Frais de service : <span className="text-purple-600">{fraisConfig.fraisServicePrestataire}%</span>
                </p>
                <p className="mt-1 text-gray-600">
                  Pourcentage ajouté au prix de chaque course et payé par le client. 
                  Ce montant est collecté par TAPEA.
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  Exemple : Course 10 000 XPF → Client paie {Math.round(10000 * (1 + fraisConfig.fraisServicePrestataire / 100)).toLocaleString()} XPF → 
                  TAPEA collecte {Math.round(10000 * fraisConfig.fraisServicePrestataire / 100).toLocaleString()} XPF
                </p>
              </div>
            </div>

            {fraisConfig.commissionPrestataire > 0 && (
              <div className="flex items-start gap-3 rounded-lg bg-white p-3">
                <div className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-orange-700">
                  2
                </div>
                <div className="flex-1">
                  <p className="font-medium text-gray-900">
                    Commission supplémentaire : <span className="text-orange-600">{fraisConfig.commissionPrestataire}%</span>
                  </p>
                  <p className="mt-1 text-gray-600">
                    Pourcentage prélevé sur le prix de base de chaque course (hors frais de service).
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    Exemple : Course 10 000 XPF → TAPEA prélève {Math.round(10000 * fraisConfig.commissionPrestataire / 100).toLocaleString()} XPF supplémentaires
                  </p>
                </div>
              </div>
            )}

            <div className="mt-3 rounded-lg bg-purple-100 p-3">
              <p className="text-center font-semibold text-purple-900">
                Total dû à TAPEA par course = 
                {fraisConfig.commissionPrestataire > 0 
                  ? ` ${fraisConfig.fraisServicePrestataire}% (frais service) + ${fraisConfig.commissionPrestataire}% (commission)`
                  : ` ${fraisConfig.fraisServicePrestataire}% (frais service uniquement)`
                }
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Paiement en attente - choix Stripe ou Virement */}
      {totalRestantApayer > 0 && (
        <div className="rounded-lg border-2 border-orange-200 bg-orange-50 p-4">
          <div className="mb-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 flex-shrink-0 text-orange-600" />
            <div>
              <p className="font-medium text-orange-900">Vous avez {totalRestantApayer.toLocaleString()} XPF de commissions en attente</p>
              <p className="text-sm text-orange-800">Choisissez votre mode de paiement :</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => setStripeModalOpen(true)}
              disabled={!publishableKey || stripeLoading}
              className="flex items-center gap-2"
            >
              <CreditCard className="h-4 w-4" />
              Payer par Stripe
            </Button>
            <Button
              variant="outline"
              onClick={() => setVirementOpen(true)}
              className="flex items-center gap-2"
            >
              <Building2 className="h-4 w-4" />
              Payer par virement
            </Button>
          </div>
        </div>
      )}

      {/* Modal Stripe */}
      <Dialog open={stripeModalOpen} onOpenChange={(open) => !open && closeStripeModal()}>
        <DialogContent className="w-[95vw] max-w-[520px] min-h-[80vh] max-h-[95vh] flex flex-col p-6 overflow-hidden">
          <DialogHeader>
            <DialogTitle>
              {stripeStep === 'choice' ? 'Payer par carte (Stripe)' : 'Saisissez vos informations de paiement'}
            </DialogTitle>
          </DialogHeader>
          {stripeStep === 'choice' && (
            <div className="space-y-6 py-4">
              <div className="flex items-center gap-3 rounded-xl bg-purple-50 p-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-purple-100">
                  <CreditCard className="h-6 w-6 text-purple-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">Paiement sécurisé par carte</p>
                  <p className="text-sm text-gray-600">Montant restant à régler : <span className="font-semibold text-purple-600">{totalRestantApayer.toLocaleString()} XPF</span></p>
                </div>
              </div>
              <div>
                <p className="mb-3 text-sm font-medium text-gray-700">Choisissez le montant à régler :</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => handleStripeChoice('full')}
                    disabled={stripeLoading}
                    className="group flex flex-col items-center gap-2 rounded-xl border-2 border-purple-200 bg-white p-6 transition-all hover:border-purple-500 hover:bg-purple-50 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="text-2xl font-bold text-purple-600">{totalRestantApayer.toLocaleString()} XPF</span>
                    <span className="text-sm font-medium text-gray-700">Totalité</span>
                    <span className="text-xs text-gray-500">Régler l'intégralité</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStripeChoice('half')}
                    disabled={stripeLoading}
                    className="group flex flex-col items-center gap-2 rounded-xl border-2 border-gray-200 bg-white p-6 transition-all hover:border-purple-400 hover:bg-purple-50/50 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="text-2xl font-bold text-orange-600">{Math.round(totalRestantApayer / 2).toLocaleString()} XPF</span>
                    <span className="text-sm font-medium text-gray-700">Moitié</span>
                    <span className="text-xs text-gray-500">Paiement partiel</span>
                  </button>
                </div>
              </div>
              {stripeLoading && (
                <div className="flex items-center justify-center gap-2 py-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-purple-600 border-t-transparent" />
                  <span className="text-sm text-gray-600">Chargement...</span>
                </div>
              )}
            </div>
          )}
          {stripeStep === 'form' && clientSecret && paymentIntentId && publishableKey && (
            <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
            <Elements stripe={loadStripe(publishableKey)} options={{ clientSecret }}>
              <StripePaymentForm
                clientSecret={clientSecret}
                amount={stripeAmount}
                paymentIntentId={paymentIntentId}
                onSuccess={() => {
                  closeStripeModal();
                  fetchCollecte();
                }}
                onCancel={closeStripeModal}
              />
            </Elements>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal Virement */}
      <Dialog open={virementOpen} onOpenChange={setVirementOpen}>
        <DialogContent className="max-w-md w-[90vw] max-w-[480px] p-6">
          <DialogHeader>
            <DialogTitle>Paiement par virement bancaire</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <p className="text-gray-600">
              Effectuez un virement vers le compte TAPEA avec les informations ci-dessous. Indiquez la référence indiquée dans l'objet du virement.
            </p>
            <div className="rounded-lg border bg-gray-50 p-4 space-y-2 font-mono text-sm">
              <p><span className="font-semibold text-gray-700">IBAN :</span> {VIREMENT_INFO.iban}</p>
              <p><span className="font-semibold text-gray-700">BIC :</span> {VIREMENT_INFO.bic}</p>
              <p><span className="font-semibold text-gray-700">Banque :</span> {VIREMENT_INFO.bankName}</p>
              <p className="mt-3 pt-3 border-t">
                <span className="font-semibold text-gray-700">Référence à indiquer :</span><br />
                <span className="text-purple-700">{VIREMENT_INFO.reference}</span>
              </p>
            </div>
            <p className="text-xs text-gray-500">
              Montant à virer : <strong>{totalRestantApayer.toLocaleString()} XPF</strong> (ou le montant convenu avec TAPEA)
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-orange-100 p-2">
              <Clock className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-orange-600">
                {totalRestantApayer.toLocaleString()} XPF
              </div>
              <div className="text-sm text-gray-600">En attente de paiement</div>
            </div>
          </div>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-green-100 p-2">
              <Check className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-green-600">
                {totalPaye.toLocaleString()} XPF
              </div>
              <div className="text-sm text-gray-600">Déjà payé</div>
            </div>
          </div>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-purple-100 p-2">
              <Wallet className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-purple-600">
                {collectes.length}
              </div>
              <div className="text-sm text-gray-600">Périodes</div>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg bg-white shadow">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-purple-600 border-t-transparent" />
          </div>
        ) : collectes.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center text-gray-500">
            <Wallet className="mb-2 h-12 w-12" />
            <p>Aucune commission enregistrée</p>
            <p className="mt-1 text-sm">Les commissions apparaîtront ici après vos premières courses.</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Période</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">Montant dû</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">Montant payé</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">Statut</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {collectes.map((collecte) => {
                const isPartiallyPaid = !collecte.isPaid && (collecte.montantPaye || 0) > 0;
                return (
                <tr
                  key={collecte.id}
                  className={`hover:bg-gray-50 ${isPartiallyPaid ? 'border-l-4 border-l-green-500 bg-green-50/50' : ''}`}
                >
                  <td className="px-4 py-3">
                    <span className="font-medium text-gray-900">
                      {formatPeriode(collecte.periode)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-bold text-gray-900">
                      {collecte.montantDu.toLocaleString()} XPF
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-gray-600">
                      {collecte.montantPaye.toLocaleString()} XPF
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {collecte.isPaid ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                        <Check className="h-3 w-3" />
                        Payé
                      </span>
                    ) : isPartiallyPaid ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                        <Check className="h-3 w-3" />
                        Une partie déjà réglée
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-1 text-xs font-medium text-orange-800">
                        <Clock className="h-3 w-3" />
                        En attente
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/prestataire/collecte/${collecte.id}`}>
                      <button className="flex items-center gap-1 rounded-lg bg-purple-100 px-3 py-1 text-sm font-medium text-purple-700 hover:bg-purple-200">
                        <Eye className="h-4 w-4" />
                        Détail
                      </button>
                    </Link>
                  </td>
                </tr>
              );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Contact Info */}
      <div className="rounded-lg bg-gray-50 p-4">
        <h3 className="font-medium text-gray-900">Comment payer ?</h3>
        <p className="mt-1 text-sm text-gray-600">
          Pour régler vos commissions, contactez TAPEA par email à{' '}
          <a href="mailto:Tapea.pf@gmail.com" className="text-purple-600 hover:underline">
            Tapea.pf@gmail.com
          </a>
          {' '}ou par téléphone au +689 87 75 98 97.
        </p>
      </div>
    </div>
  );
}
