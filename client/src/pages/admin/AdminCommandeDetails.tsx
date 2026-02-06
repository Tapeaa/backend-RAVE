/**
 * Tape'ā Back Office - Détails d'une commande
 */

import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { 
  ArrowLeft, MapPin, User, Car, DollarSign, 
  CreditCard, Wallet, Calendar, Clock, Package, Star, Building2, FileText
} from 'lucide-react';

interface CommandeDetails {
  commande: {
    id: string;
    clientId: string | null;
    clientName: string;
    clientPhone: string;
    addresses: any;
    rideOption: any;
    routeInfo: any;
    passengers: number;
    supplements: any;
    totalPrice: number;
    driverEarnings: number;
    paymentMethod: string;
    status: string;
    assignedDriverId: string | null;
    createdAt: string;
    scheduledTime: string | null;
    isAdvanceBooking: boolean;
    waitingTimeMinutes?: number | null;
  };
  client: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string;
  } | null;
  chauffeur: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    vehicleModel: string | null;
    vehiclePlate: string | null;
    typeChauffeur?: 'salarie' | 'patente';
    prestataireId?: string | null;
    commissionChauffeur?: number;
  } | null;
  prestataire?: { id: string; nom: string; type: string } | null;
  waitingRatePerMin?: number;
  freeMinutes?: number;
  fraisServicePercent?: number;
  fraisConfig?: { fraisServicePrestataire: number; commissionPrestataire: number } | null;
  ratings?: {
    client: {
      id: string;
      order_id: string;
      rater_type: string;
      rater_id: string;
      rated_type: string;
      rated_id: string;
      score: number;
      comment: string | null;
      created_at: string;
    } | null;
    chauffeur: {
      id: string;
      order_id: string;
      rater_type: string;
      rater_id: string;
      rated_type: string;
      rated_id: string;
      score: number;
      comment: string | null;
      created_at: string;
    } | null;
  };
}

interface FraisConfigState {
  fraisServicePrestataire: number;
  commissionPrestataire: number;
}

export function AdminCommandeDetails() {
  const [, setLocation] = useLocation();
  const [details, setDetails] = useState<CommandeDetails | null>(null);
  const [fraisConfig, setFraisConfig] = useState<FraisConfigState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Récupérer l'ID depuis l'URL
  const pathParts = window.location.pathname.split('/');
  const commandeId = pathParts[pathParts.length - 1];

  useEffect(() => {
    fetchDetails();
    fetchFraisConfig();
  }, [commandeId]);

  async function fetchFraisConfig() {
    try {
      const response = await fetch('/api/frais-service-config');
      if (response.ok) {
        const result = await response.json();
        if (result.success && result.config) {
          setFraisConfig({
            fraisServicePrestataire: result.config.fraisServicePrestataire ?? 15,
            commissionPrestataire: result.config.commissionPrestataire ?? 0,
          });
        }
      }
    } catch (error) {
      console.error('Error fetching frais config:', error);
    }
  }

  async function fetchDetails() {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch(`/api/admin/commandes/${commandeId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setDetails(data);
      } else {
        setLocation('/admin/commandes');
      }
    } catch (error) {
      console.error('Error fetching commande details:', error);
    } finally {
      setIsLoading(false);
    }
  }

  function formatCurrency(amount: number): string {
    return amount.toLocaleString('fr-FR') + ' XPF';
  }

  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function getStatusBadge(status: string) {
    const statusConfig: Record<string, { label: string; color: string }> = {
      pending: { label: 'En attente', color: 'bg-yellow-100 text-yellow-700' },
      accepted: { label: 'Acceptée', color: 'bg-blue-100 text-blue-700' },
      driver_enroute: { label: 'Chauffeur en route', color: 'bg-purple-100 text-purple-700' },
      driver_arrived: { label: 'Chauffeur arrivé', color: 'bg-indigo-100 text-indigo-700' },
      in_progress: { label: 'En cours', color: 'bg-orange-100 text-orange-700' },
      completed: { label: 'Terminée', color: 'bg-green-100 text-green-700' },
      payment_pending: { label: 'Paiement en attente', color: 'bg-yellow-100 text-yellow-700' },
      payment_confirmed: { label: 'Paiement confirmé', color: 'bg-green-100 text-green-700' },
      cancelled: { label: 'Annulée', color: 'bg-red-100 text-red-700' },
    };
    const config = statusConfig[status] || { label: status, color: 'bg-gray-100 text-gray-700' };
    return (
      <span className={`rounded-full px-3 py-1 text-sm font-medium ${config.color}`}>
        {config.label}
      </span>
    );
  }

  function renderStars(score: number) {
    return (
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`h-5 w-5 ${
              star <= score
                ? 'fill-yellow-400 text-yellow-400'
                : 'fill-gray-200 text-gray-200'
            }`}
          />
        ))}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-purple-600 border-t-transparent" />
      </div>
    );
  }

  if (!details || !details.commande) {
    return (
      <div className="text-center text-red-600">
        Commande non trouvée
      </div>
    );
  }

  const { commande, client, chauffeur, ratings = { client: null, chauffeur: null }, prestataire, waitingRatePerMin = 42, freeMinutes = 0 } = details;
  // Utiliser fraisConfig de /api/frais-service-config (même source que prestataire) pour cohérence des calculs
  const fsPctFromConfig = fraisConfig?.fraisServicePrestataire ?? details.fraisConfig?.fraisServicePrestataire ?? details.fraisServicePercent ?? 15;
  const commissionPctFromConfig = fraisConfig?.commissionPrestataire ?? details.fraisConfig?.commissionPrestataire ?? 0;
  const isSalarieTapea = chauffeur?.typeChauffeur === 'salarie' && !chauffeur?.prestataireId;
  const isPrestataire = !!chauffeur?.prestataireId;
  
  // Les adresses sont un tableau avec type: 'pickup' | 'stop' | 'destination'
  const addressesArray = Array.isArray(commande.addresses) ? commande.addresses : [];
  const pickup = addressesArray.find((a: any) => a.type === 'pickup') || {};
  const destinationAddr = addressesArray.find((a: any) => a.type === 'destination');
  // S'il n'y a pas de destination explicite, prendre le dernier élément
  const dropoff = destinationAddr || addressesArray[addressesArray.length - 1] || {};
  // Récupérer tous les arrêts intermédiaires
  const stops = addressesArray.filter((a: any) => a.type === 'stop');
  
  const routeInfo = commande.routeInfo || {};
  const supplements = Array.isArray(commande.supplements) ? commande.supplements : [];

  return (
    <div className="space-y-6">
      {/* Header avec breadcrumb */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setLocation('/admin/commandes')}
            className="rounded-lg p-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <nav className="flex items-center gap-2 text-sm text-gray-500">
              <button onClick={() => setLocation('/admin/commandes')} className="hover:text-purple-600">Commandes</button>
              <span>/</span>
              <span className="font-medium text-gray-900 truncate max-w-[180px]" title={commande.id}>
                {commande.id.slice(0, 8).toUpperCase()}…
              </span>
            </nav>
            <h1 className="text-xl font-bold text-gray-900 mt-0.5">Détails de la commande</h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {getStatusBadge(commande.status)}
        </div>
      </div>

      {/* Bandeau récapitulatif */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <div className="col-span-2 sm:col-span-1 rounded-xl border border-gray-200/80 bg-gradient-to-br from-purple-50 to-white p-3 sm:p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Total</p>
          <p className="mt-1 text-xl sm:text-lg font-bold text-purple-600">{formatCurrency(commande.totalPrice)}</p>
        </div>
        <div className="rounded-xl border border-gray-200/80 bg-white p-3 sm:p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Date</p>
          <p className="mt-1 text-xs sm:text-sm font-semibold text-gray-900">{formatDate(commande.createdAt)}</p>
        </div>
        <div className="rounded-xl border border-gray-200/80 bg-white p-3 sm:p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Paiement</p>
          <p className="mt-1 text-sm font-semibold text-gray-900 flex items-center gap-1">
            {commande.paymentMethod === 'card' ? <CreditCard className="h-4 w-4 text-purple-600" /> : <Wallet className="h-4 w-4 text-green-600" />}
            {commande.paymentMethod === 'card' ? 'Carte' : 'Espèces'}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200/80 bg-white p-3 sm:p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Client</p>
          <p className="mt-1 text-xs sm:text-sm font-semibold text-gray-900 truncate" title={client ? `${client.firstName} ${client.lastName}` : commande.clientName}>
            {client ? `${client.firstName} ${client.lastName}` : commande.clientName}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200/80 bg-white p-3 sm:p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Chauffeur</p>
          <p className="mt-1 text-xs sm:text-sm font-semibold text-gray-900 truncate" title={chauffeur ? `${chauffeur.firstName} ${chauffeur.lastName}` : '—'}>
            {chauffeur ? `${chauffeur.firstName} ${chauffeur.lastName}` : '—'}
          </p>
        </div>
      </div>

      {/* Contenu principal */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Colonne gauche : Trajet, Acteurs, Notations */}
        <div className="space-y-6 lg:col-span-2">
          {/* Trajet - Timeline moderne */}
          <div className="rounded-xl border border-gray-200/80 bg-white p-4 sm:p-6 shadow-sm">
            <h2 className="mb-4 sm:mb-5 flex items-center gap-2 text-base font-semibold text-gray-900">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-100">
                <MapPin className="h-4 w-4 text-purple-600" />
              </div>
              Parcours
            </h2>
            <div className="relative space-y-0">
              {/* Ligne verticale */}
              <div className="absolute left-4 top-2 bottom-2 w-0.5 bg-gradient-to-b from-emerald-400 via-amber-400 to-rose-400" />
              {/* Départ */}
              <div className="relative flex gap-4 pb-5">
                <div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white ring-4 ring-white shadow">
                  <span className="text-xs font-bold">A</span>
                </div>
                <div className="flex-1 rounded-lg border border-emerald-200/80 bg-emerald-50/50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Départ</p>
                  <p className="mt-1 font-medium text-gray-900">{pickup.value || 'Non spécifié'}</p>
                </div>
              </div>
              {/* Arrêts */}
              {stops.map((stop: any, index: number) => (
                <div key={stop.id || index} className="relative flex gap-4 pb-5">
                  <div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white ring-4 ring-white shadow">
                    <span className="text-xs font-bold">{index + 1}</span>
                  </div>
                  <div className="flex-1 rounded-lg border border-amber-200/80 bg-amber-50/50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">Arrêt {index + 1}</p>
                    <p className="mt-1 font-medium text-gray-900">{stop.value || 'Non spécifié'}</p>
                  </div>
                </div>
              ))}
              {/* Destination */}
              <div className="relative flex gap-4">
                <div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-500 text-white ring-4 ring-white shadow">
                  <span className="text-xs font-bold">B</span>
                </div>
                <div className="flex-1 rounded-lg border border-rose-200/80 bg-rose-50/50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-rose-700">Arrivée</p>
                  <p className="mt-1 font-medium text-gray-900">{dropoff.value || 'Non spécifié'}</p>
                </div>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-3 text-sm">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 font-medium text-gray-700">
                <Package className="h-4 w-4" />
                {commande.passengers} passager{commande.passengers > 1 ? 's' : ''}
              </span>
              {commande.scheduledTime && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-3 py-1 font-medium text-violet-700">
                  <Clock className="h-4 w-4" />
                  Résa {formatDate(commande.scheduledTime)}
                </span>
              )}
            </div>
            <div className="mt-4 sm:mt-5 grid grid-cols-2 gap-3 rounded-lg bg-gray-50 p-3 sm:p-4">
              <div>
                <p className="text-xs font-medium text-gray-500">Distance</p>
                <p className="font-semibold text-gray-900">
                  {typeof routeInfo?.distance === 'number' && routeInfo.distance > 0
                    ? (routeInfo.distance >= 1000 
                        ? (routeInfo.distance / 1000).toFixed(1) + ' km'
                        : routeInfo.distance.toFixed(1) + ' km')
                    : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500">Durée estimée</p>
                <p className="font-semibold text-gray-900">
                  {routeInfo?.duration != null
                    ? (typeof routeInfo.duration === 'number'
                        ? `${Math.round(routeInfo.duration / 60)} min`
                        : String(routeInfo.duration))
                    : '—'}
                </p>
              </div>
            </div>
          </div>

          {/* Acteurs : Client & Chauffeur */}
          <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2">
            <div className="rounded-xl border border-gray-200/80 bg-white p-4 sm:p-5 shadow-sm">
              <h2 className="mb-3 sm:mb-4 flex items-center gap-2 text-base font-semibold text-gray-900">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100">
                  <User className="h-4 w-4 text-blue-600" />
                </div>
                Client
              </h2>
              {client ? (
                <div className="space-y-1.5 sm:space-y-2">
                  <p className="font-medium text-gray-900">{client.firstName} {client.lastName}</p>
                  <a href={`tel:${client.phone}`} className="block text-sm text-blue-600 hover:underline">{client.phone}</a>
                  {client.email && <p className="text-sm text-gray-600 truncate">{client.email}</p>}
                </div>
              ) : (
                <div className="space-y-1.5 sm:space-y-2">
                  <p className="font-medium text-gray-900">{commande.clientName}</p>
                  <a href={`tel:${commande.clientPhone}`} className="block text-sm text-blue-600 hover:underline">{commande.clientPhone}</a>
                </div>
              )}
            </div>
            <div className="rounded-xl border border-gray-200/80 bg-white p-4 sm:p-5 shadow-sm">
              <h2 className="mb-3 sm:mb-4 flex items-center gap-2 text-base font-semibold text-gray-900">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100">
                  <Car className="h-4 w-4 text-violet-600" />
                </div>
                Chauffeur
              </h2>
              {chauffeur ? (
                <div className="space-y-1.5 sm:space-y-2">
                  <p className="font-medium text-gray-900">{chauffeur.firstName} {chauffeur.lastName}</p>
                  <a href={`tel:${chauffeur.phone}`} className="block text-sm text-blue-600 hover:underline">{chauffeur.phone}</a>
                  {chauffeur.vehicleModel && (
                    <p className="text-sm text-gray-600">{chauffeur.vehicleModel} — {chauffeur.vehiclePlate}</p>
                  )}
                  {prestataire && (
                    <p className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                      <Building2 className="h-3 w-3" />
                      {prestataire.nom}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-500">Non assigné</p>
              )}
            </div>
          </div>

          {/* Notations */}
          <div className="rounded-xl border border-gray-200/80 bg-white p-4 sm:p-5 shadow-sm">
            <h2 className="mb-3 sm:mb-4 flex items-center gap-2 text-base font-semibold text-gray-900">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100">
                <Star className="h-4 w-4 text-amber-600" />
              </div>
              Notations
            </h2>
            <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2">
              <div className="rounded-lg border border-gray-100 p-3 sm:p-4">
                <h3 className="text-xs font-medium text-gray-500 mb-2">Client → Chauffeur</h3>
                {ratings?.client ? (
                  <>
                    <div className="flex items-center gap-2">
                      {renderStars(ratings.client.score)}
                      <span className="font-semibold text-gray-900">{ratings.client.score}/5</span>
                    </div>
                    {ratings.client.comment && (
                      <p className="mt-2 text-sm text-gray-600 italic">"{ratings.client.comment}"</p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-gray-400">Aucune notation</p>
                )}
              </div>
              <div className="rounded-lg border border-gray-100 p-3 sm:p-4">
                <h3 className="text-xs font-medium text-gray-500 mb-2">Chauffeur → Client</h3>
                {ratings?.chauffeur ? (
                  <>
                    <div className="flex items-center gap-2">
                      {renderStars(ratings.chauffeur.score)}
                      <span className="font-semibold text-gray-900">{ratings.chauffeur.score}/5</span>
                    </div>
                    {ratings.chauffeur.comment && (
                      <p className="mt-2 text-sm text-gray-600 italic">"{ratings.chauffeur.comment}"</p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-gray-400">Aucune notation</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar droite : Récap financier (sticky) */}
        <div className="lg:col-span-1">
          <div className="lg:sticky lg:top-20 rounded-xl border border-gray-200/80 bg-white p-4 sm:p-6 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-900">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-100">
                {commande.paymentMethod === 'card' ? (
                  <CreditCard className="h-4 w-4 text-purple-600" />
                ) : (
                  <Wallet className="h-4 w-4 text-purple-600" />
                )}
              </div>
              Tarification & Paiement
            </h2>
            <div className="space-y-4">
              <p className="text-xs font-medium text-gray-500">
                {commande.paymentMethod === 'card' ? 'Carte bancaire' : 'Espèces'}
              </p>
              {isPrestataire ? (
              /* Détail complet comme dashboard prestataire */
              <div className="space-y-4">
                <div className="border-t border-gray-200 pt-4">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800">
                    <FileText className="h-4 w-4 text-purple-600" />
                    Tarification
                  </h3>
                  <div className="space-y-2 text-sm">
                    {(() => {
                      const rideOption = commande.rideOption || {};
                      const baseFare = rideOption.baseFare || rideOption.basePrice || rideOption.price || 0;
                      const pricePerKm = rideOption.pricePerKm || rideOption.pricePerKilometer || 0;
                      let distanceKm = 0;
                      if (typeof routeInfo?.distance === 'number') {
                        distanceKm = routeInfo.distance >= 1000 ? routeInfo.distance / 1000 : routeInfo.distance;
                      }
                      const distancePrice = Math.round(distanceKm * pricePerKm);
                      const waitingMins = commande.waitingTimeMinutes || 0;
                      const billable = Math.max(0, waitingMins - freeMinutes);
                      const waitingPrice = Math.round(billable * waitingRatePerMin);
                      const supplementsTotal = (supplements as any[]).reduce((sum: number, s: any) => sum + ((s.price || 0) * (s.quantity || 1)), 0);
                      const prixConfirmation = rideOption.initialTotalPrice ?? commande.totalPrice;
                      const fsPct = fsPctFromConfig;
                      const prixHorsFrais = Math.round(prixConfirmation / (1 + fsPct / 100));
                      const fraisService = prixConfirmation - prixHorsFrais;
                      const knownTotal = baseFare + distancePrice + waitingPrice + supplementsTotal;
                      const subtotalAvantFrais = Math.round(commande.totalPrice / (1 + fsPct / 100));
                      const majorations = subtotalAvantFrais - knownTotal;
                      const commissionPct = commissionPctFromConfig;
                      const commissionSupp = Math.round(prixConfirmation * commissionPct / 100);
                      const commissionChauffeur = chauffeur?.commissionChauffeur ?? 95;
                      const subtotal = commande.totalPrice - fraisService - commissionSupp;
                      const revenusChauffeur = Math.round(subtotal * (commissionChauffeur / 100));
                      const revenusPrestataire = subtotal - revenusChauffeur;

                      return (
                        <>
                          <div className="bg-purple-50 p-3 rounded-lg mb-3">
                            <span className="text-sm font-medium text-purple-700">{rideOption.label || rideOption.title || 'Course standard'}</span>
                          </div>
                          <div className="flex flex-wrap justify-between gap-x-2"><span className="text-gray-600">Prise en charge</span><span className="font-medium">{baseFare.toLocaleString()} XPF</span></div>
                          {distanceKm > 0 && (
                            <div className="flex flex-wrap justify-between gap-x-2">
                              <span className="text-gray-600 text-xs sm:text-sm">Distance ({distanceKm.toFixed(1)} km)</span>
                              <span className="font-medium">{distancePrice.toLocaleString()} XPF</span>
                            </div>
                          )}
                          {billable > 0 && (
                            <div className="flex flex-wrap justify-between gap-x-2">
                              <span className="text-gray-600 text-xs sm:text-sm">Attente ({billable} min)</span>
                              <span className="font-medium">{waitingPrice.toLocaleString()} XPF</span>
                            </div>
                          )}
                          {supplements.map((supp: any, i: number) => (
                            <div key={i} className="flex flex-wrap justify-between gap-x-2">
                              <span className="text-gray-600 text-xs sm:text-sm">{supp.name || supp.id}{supp.quantity > 1 ? ` (×${supp.quantity})` : ''}</span>
                              <span className="font-medium">{((supp.price || 0) * (supp.quantity || 1)).toLocaleString()} XPF</span>
                            </div>
                          ))}
                          {majorations > 0 && (
                            <div className="flex flex-wrap justify-between gap-x-2"><span className="text-gray-600 text-xs sm:text-sm">Majorations</span><span className="font-medium">{majorations.toLocaleString()} XPF</span></div>
                          )}
                          {fraisService > 0 && (
                            <div className="flex flex-wrap justify-between gap-x-2"><span className="text-purple-600 text-xs sm:text-sm">Frais service ({fsPct}%)</span><span className="font-medium text-purple-600">{fraisService.toLocaleString()} XPF</span></div>
                          )}
                          <div className="border-t border-gray-200 pt-3 flex flex-wrap justify-between gap-x-2 font-semibold">
                            <span>Total course</span><span className="text-lg">{commande.totalPrice.toLocaleString()} XPF</span>
                          </div>

                          <div className="border-t border-gray-200 pt-3 mt-3 space-y-2">
                            <div className="flex flex-wrap justify-between gap-x-2 text-sm bg-gray-50 p-2 rounded"><span className="font-medium text-xs sm:text-sm">Subtotal (hors frais)</span><span className="font-medium">{subtotal.toLocaleString()} XPF</span></div>
                            <div className="flex flex-wrap justify-between gap-x-2 text-sm"><span className="text-green-600 text-xs sm:text-sm">Chauffeur ({commissionChauffeur}%)</span><span className="font-medium text-green-600">{revenusChauffeur.toLocaleString()} XPF</span></div>
                            <div className="flex flex-wrap justify-between gap-x-2 text-sm"><span className="text-blue-600 text-xs sm:text-sm">Prestataire ({100 - commissionChauffeur}%)</span><span className="font-medium text-blue-600">{revenusPrestataire.toLocaleString()} XPF</span></div>

                            <div className="relative overflow-hidden rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-teal-50/30 to-emerald-50 p-4 shadow-sm ring-1 ring-emerald-500/20 mt-3">
                              <div className="absolute top-0 right-0 w-24 h-24 -translate-y-1/2 translate-x-1/2 rounded-full bg-emerald-400/10" />
                              <div className="relative flex items-center gap-2 mb-3">
                                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-md">
                                  <Building2 className="h-4 w-4" />
                                </div>
                                <span className="text-sm font-semibold uppercase tracking-wider text-emerald-800/90">Frais TAPEA</span>
                              </div>
                              <div className="relative space-y-2.5">
                                <div className="flex justify-between items-center rounded-md bg-white/60 px-3 py-2">
                                  <span className="text-sm text-slate-600">Frais de service</span>
                                  <span className="text-sm font-semibold text-slate-800">{fsPct}% · {fraisService.toLocaleString()} XPF</span>
                                </div>
                                <div className="flex justify-between items-center rounded-md bg-white/60 px-3 py-2">
                                  <span className="text-sm text-slate-600">Commission supp.</span>
                                  <span className="text-sm font-semibold text-slate-800">{commissionPct}% · {commissionSupp.toLocaleString()} XPF</span>
                                </div>
                                <div className="flex justify-between items-center rounded-lg bg-emerald-600/15 px-3 py-3 mt-2 border border-emerald-500/30">
                                  <span className="text-sm font-bold text-emerald-800">Total TAPEA</span>
                                  <span className="text-base font-bold text-emerald-700">{(fraisService + commissionSupp).toLocaleString()} XPF</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
            ) : (
              /* Salarié TAPEA ou sans prestataire : détail tarification sans frais TAPEA */
              <div className="space-y-4">
                <div className="border-t border-gray-200 pt-4">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800">
                    <FileText className="h-4 w-4 text-purple-600" />
                    Tarification
                  </h3>
                  {(() => {
                    const rideOption = commande.rideOption || {};
                    const baseFare = rideOption.baseFare || rideOption.basePrice || rideOption.price || 0;
                    const pricePerKm = rideOption.pricePerKm || rideOption.pricePerKilometer || 0;
                    let distanceKm = 0;
                    if (typeof routeInfo?.distance === 'number') {
                      distanceKm = routeInfo.distance >= 1000 ? routeInfo.distance / 1000 : routeInfo.distance;
                    }
                    const distancePrice = Math.round(distanceKm * pricePerKm);
                    const waitingMins = commande.waitingTimeMinutes || 0;
                    const billable = Math.max(0, waitingMins - freeMinutes);
                    const waitingPrice = Math.round(billable * waitingRatePerMin);
                    const supplementsTotal = (supplements as any[]).reduce((sum: number, s: any) => sum + ((s.price ?? s.prixXpf ?? 0) * (s.quantity ?? 1)), 0);
                    const paidStopsCost = (rideOption as any)?.paidStopsCost || 0;
                    const knownTotal = baseFare + distancePrice + waitingPrice + supplementsTotal + paidStopsCost;
                    const majorations = Math.max(0, commande.totalPrice - knownTotal);
                    const hasDetails = baseFare > 0 || distanceKm > 0 || billable > 0 || supplements.length > 0 || paidStopsCost > 0 || majorations > 0;

                    return (
                      <div className="space-y-2 text-sm">
                        {hasDetails ? (
                          <>
                            <div className="bg-purple-50 p-3 rounded-lg mb-3">
                              <span className="text-sm font-medium text-purple-700">{rideOption.label || rideOption.title || 'Course standard'}</span>
                            </div>
                            <div className="flex flex-wrap justify-between gap-x-2"><span className="text-gray-600">Prise en charge</span><span className="font-medium">{baseFare.toLocaleString()} XPF</span></div>
                            {distanceKm > 0 && (
                              <div className="flex flex-wrap justify-between gap-x-2">
                                <span className="text-gray-600 text-xs sm:text-sm">Distance ({distanceKm.toFixed(1)} km)</span>
                                <span className="font-medium">{distancePrice.toLocaleString()} XPF</span>
                              </div>
                            )}
                            {billable > 0 && (
                              <div className="flex flex-wrap justify-between gap-x-2">
                                <span className="text-gray-600 text-xs sm:text-sm">Attente ({billable} min)</span>
                                <span className="font-medium">{waitingPrice.toLocaleString()} XPF</span>
                              </div>
                            )}
                            {supplements.map((supp: any, i: number) => {
                              const qty = supp.quantity ?? 1;
                              const prix = supp.price ?? supp.prixXpf ?? 0;
                              return (
                                <div key={i} className="flex flex-wrap justify-between gap-x-2">
                                  <span className="text-gray-600 text-xs sm:text-sm">{supp.name || supp.nom || supp.id}{qty > 1 ? ` (×${qty})` : ''}</span>
                                  <span className="font-medium">{(prix * qty).toLocaleString()} XPF</span>
                                </div>
                              );
                            })}
                            {paidStopsCost > 0 && (
                              <div className="flex flex-wrap justify-between gap-x-2">
                                <span className="text-gray-600">Arrêts payants</span>
                                <span className="font-medium">{paidStopsCost.toLocaleString()} XPF</span>
                              </div>
                            )}
                            {majorations > 0 && (
                              <div className="flex flex-wrap justify-between gap-x-2"><span className="text-gray-600 text-xs sm:text-sm">Majorations</span><span className="font-medium">{majorations.toLocaleString()} XPF</span></div>
                            )}
                          </>
                        ) : null}
                        <div className="border-t border-gray-200 pt-3 flex flex-wrap justify-between gap-x-2 font-semibold">
                          <span>Prix total</span><span className="text-lg text-purple-600">{commande.totalPrice.toLocaleString()} XPF</span>
                        </div>
                        <div className="flex flex-wrap justify-between gap-x-2">
                          <span className="text-gray-600">Gains chauffeur</span>
                          <span className="font-medium text-green-600">{commande.driverEarnings.toLocaleString()} XPF</span>
                        </div>
                        {isSalarieTapea && (
                          <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600 mt-3">
                            Chauffeur salarié TAPEA — Pas de frais de service ni commission prestataire appliqués.
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminCommandeDetails;
