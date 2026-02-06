/**
 * Tape'a Back Office - Détails Course Prestataire
 * Affiche tous les détails d'une course avec facture PDF
 */

import { useEffect, useState, useRef } from 'react';
import { Link, useParams } from 'wouter';
import html2pdf from 'html2pdf.js';
import { 
  ArrowLeft, MapPin, User, Car, Clock, 
  CreditCard, Banknote, FileText, Download,
  Building2, CheckCircle, XCircle, Navigation, Star, DollarSign
} from 'lucide-react';

interface CourseDetails {
  course: {
    id: string;
    date: string;
    clientName: string;
    clientPhone: string;
    pickupAddress: string;
    dropoffAddress: string;
    stops: string[];
    totalPrice: number;
    driverEarnings: number;
    commission: number;
    status: string;
    paymentMethod: string;
    waitingTimeMinutes: number | null;
    scheduledTime: string | null;
    isAdvanceBooking: boolean;
    rideOption: {
      type: string;
      label: string;
      baseFare: number;
      pricePerKm: number;
      initialTotalPrice?: number; // Prix à la confirmation (avant attente/arrêts)
    };
    supplements: any[];
    routeInfo: {
      distance: number;
      duration: number;
    };
  };
  driver: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    vehicleModel: string | null;
    vehiclePlate: string | null;
    commissionChauffeur?: number;
  } | null;
  prestataire: {
    id: string;
    nom: string;
    type: string;
    numeroTahiti: string | null;
    email: string | null;
    phone: string | null;
  } | null;
  waitingRatePerMin?: number;
  freeMinutes?: number;
  fraisServicePercent?: number;
  ratings?: {
    client: { id: string; score: number; comment: string | null } | null;
    chauffeur: { id: string; score: number; comment: string | null } | null;
  };
}

interface FraisConfig {
  fraisServicePrestataire: number;
  commissionPrestataire: number;
}

export function PrestataireCourseDetails() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<CourseDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [fraisConfig, setFraisConfig] = useState<FraisConfig>({
    fraisServicePrestataire: 15,
    commissionPrestataire: 0,
  });
  const invoiceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchDetails();
    fetchFraisConfig();
  }, [params.id]);

  async function fetchFraisConfig() {
    try {
      const response = await fetch('/api/frais-service-config');
      if (response.ok) {
        const result = await response.json();
        if (result.success && result.config) {
          setFraisConfig({
            fraisServicePrestataire: result.config.fraisServicePrestataire || 15,
            commissionPrestataire: result.config.commissionPrestataire || 0,
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
      const response = await fetch(`/api/prestataire/courses/${params.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const result = await response.json();
        setData(result);
      }
    } catch (error) {
      console.error('Error fetching course details:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function downloadInvoice() {
    const printContent = invoiceRef.current;
    if (!printContent || !data) return;

    setIsDownloadingPdf(true);
    const container = document.createElement('div');
    container.style.cssText = 'position:absolute;left:-9999px;top:0;width:210mm;background:#fff;padding:15mm;';
    container.innerHTML = `
      <style>
        #invoice-pdf-source { font-family: 'Segoe UI', system-ui, sans-serif; color: #1f2937; font-size: 10pt; line-height: 1.4; max-width: 180mm; }
        #invoice-pdf-source .header { display: flex; justify-content: space-between; padding-bottom: 16px; border-bottom: 1px solid #e5e7eb; margin-bottom: 16px; }
        #invoice-pdf-source .prestataire-name { font-size: 14pt; font-weight: 600; }
        #invoice-pdf-source .prestataire-details { font-size: 9pt; color: #6b7280; margin-top: 4px; }
        #invoice-pdf-source .invoice-info { text-align: right; }
        #invoice-pdf-source .invoice-label { font-size: 11pt; font-weight: 600; }
        #invoice-pdf-source .invoice-meta { font-size: 9pt; color: #6b7280; margin-top: 4px; }
        #invoice-pdf-source .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 12px; }
        #invoice-pdf-source .block { padding: 10px 12px; background: #f9fafb; border-radius: 4px; border: 1px solid #f3f4f6; }
        #invoice-pdf-source .block-title { font-size: 8pt; font-weight: 600; color: #6b7280; text-transform: uppercase; margin-bottom: 6px; }
        #invoice-pdf-source .block-content { font-size: 9pt; }
        #invoice-pdf-source .trajet-row { display: flex; gap: 8px; margin-bottom: 6px; font-size: 9pt; }
        #invoice-pdf-source .trajet-dot { width: 6px; height: 6px; border-radius: 50%; margin-top: 5px; flex-shrink: 0; }
        #invoice-pdf-source .trajet-dot.start { background: #22c55e; }
        #invoice-pdf-source .trajet-dot.end { background: #ef4444; }
        #invoice-pdf-source .pricing-table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 9pt; }
        #invoice-pdf-source .pricing-table th, #invoice-pdf-source .pricing-table td { padding: 8px 10px; border-bottom: 1px solid #e5e7eb; }
        #invoice-pdf-source .pricing-table td:last-child { text-align: right; }
        #invoice-pdf-source .pricing-table .total td { font-weight: 700; background: #f9fafb; padding: 10px; }
        #invoice-pdf-source .payment-line { margin-top: 12px; padding: 10px 12px; background: #f9fafb; border-radius: 4px; font-size: 9pt; display: flex; justify-content: space-between; }
      </style>
      <div id="invoice-pdf-source">${printContent.innerHTML}</div>
    `;
    document.body.appendChild(container);

    const invEl = container.querySelector('#invoice-pdf-source');
    const sourceEl = (invEl as HTMLElement) || container;

    try {
      await html2pdf()
        .set({
          margin: 10,
          filename: `facture-${data.course.id.slice(0, 8)}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2 },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        })
        .from(sourceEl)
        .save();
    } catch (err) {
      console.error('Erreur génération PDF:', err);
    } finally {
      container.remove();
      setIsDownloadingPdf(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-purple-600 border-t-transparent" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Course non trouvée</p>
        <Link href="/prestataire/courses">
          <button className="mt-4 text-purple-600 hover:underline">Retour</button>
        </Link>
      </div>
    );
  }

  const { course, driver, prestataire, ratings = { client: null, chauffeur: null } } = data;
  const isCompleted = course.status === 'payment_confirmed';
  const isCancelled = course.status === 'cancelled';

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

  // Distance en km (API renvoie mètres; valeurs < 100 = déjà en km)
  const rawDist = course.routeInfo?.distance;
  const distNum = typeof rawDist === 'number' ? rawDist : parseFloat(String(rawDist || 0)) || 0;
  const distanceKm = distNum >= 1000 ? distNum / 1000 : (distNum > 0 && distNum < 100 ? distNum : distNum / 1000);
  // Durée : string ("15 min") ou number (secondes)
  const durationDisplay = course.routeInfo?.duration != null
    ? (typeof course.routeInfo.duration === 'number'
        ? `${Math.round(course.routeInfo.duration / 60)} min`
        : String(course.routeInfo.duration))
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link href="/prestataire/courses">
            <button className="rounded-xl p-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900">
              <ArrowLeft className="h-5 w-5" />
            </button>
          </Link>
          <div>
            <nav className="flex items-center gap-2 text-sm text-gray-500">
              <Link href="/prestataire/courses" className="hover:text-purple-600">Courses</Link>
              <span>/</span>
              <span className="font-medium text-gray-900 truncate max-w-[180px]">{course.id.slice(0, 8).toUpperCase()}…</span>
            </nav>
            <h1 className="text-xl font-bold text-gray-900 mt-0.5">Détails de la course</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {new Date(course.date).toLocaleDateString('fr-FR', {
                weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })}
            </p>
          </div>
        </div>
        <button
          onClick={downloadInvoice}
          disabled={isDownloadingPdf}
          className="flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-2 text-white hover:bg-purple-700 shrink-0 disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {isDownloadingPdf ? (
            <>
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Génération…
            </>
          ) : (
            <>
              <Download className="h-5 w-5" />
              Télécharger facture
            </>
          )}
        </button>
      </div>

      {/* Bandeau récap */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-gray-200/80 bg-white p-4 shadow-sm flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-purple-100">
            <DollarSign className="h-4 w-4 text-purple-600" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Total</p>
            <p className="mt-1 text-lg font-bold text-purple-600">{course.totalPrice?.toLocaleString()} XPF</p>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200/80 bg-white p-4 shadow-sm flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-100">
            <User className="h-4 w-4 text-blue-600" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Client</p>
            <p className="mt-1 text-sm font-semibold text-gray-900 truncate">{course.clientName}</p>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200/80 bg-white p-4 shadow-sm flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-100">
            <Car className="h-4 w-4 text-violet-600" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Chauffeur</p>
            <p className="mt-1 text-sm font-semibold text-gray-900 truncate">
              {driver ? `${driver.firstName} ${driver.lastName}` : '—'}
            </p>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200/80 bg-white p-4 shadow-sm flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100">
            {course.paymentMethod === 'card' ? (
              <CreditCard className="h-4 w-4 text-emerald-600" />
            ) : (
              <Banknote className="h-4 w-4 text-emerald-600" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Paiement</p>
            <p className="mt-1 text-sm font-semibold text-gray-900">
              {course.paymentMethod === 'card' ? 'Carte' : 'Espèces'}
            </p>
          </div>
        </div>
      </div>

      {/* Status Banner */}
      <div className={`flex items-center gap-3 rounded-2xl p-4 ${
        isCompleted ? 'bg-green-50' : isCancelled ? 'bg-red-50' : 'bg-yellow-50'
      }`}>
        {isCompleted ? (
          <CheckCircle className="h-6 w-6 text-green-600" />
        ) : isCancelled ? (
          <XCircle className="h-6 w-6 text-red-600" />
        ) : (
          <Clock className="h-6 w-6 text-yellow-600" />
        )}
        <div>
          <div className={`font-semibold ${
            isCompleted ? 'text-green-800' : isCancelled ? 'text-red-800' : 'text-yellow-800'
          }`}>
            {isCompleted ? 'Course terminée et payée' : isCancelled ? 'Course annulée' : 'Course en cours'}
          </div>
          <div className={`text-sm ${
            isCompleted ? 'text-green-600' : isCancelled ? 'text-red-600' : 'text-yellow-600'
          }`}>
            Paiement par {course.paymentMethod === 'card' ? 'carte bancaire' : 'espèces'}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Colonne gauche */}
        <div className="lg:col-span-2 space-y-6">
          {/* Trajet - Timeline moderne */}
          <div className="rounded-xl border border-gray-200/80 bg-white p-6 shadow-sm">
            <h2 className="mb-5 flex items-center gap-2 text-base font-semibold text-gray-900">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-100">
                <Navigation className="h-4 w-4 text-purple-600" />
              </div>
              Parcours
            </h2>
            <div className="relative space-y-0">
              <div className="absolute left-4 top-2 bottom-2 w-0.5 bg-gradient-to-b from-emerald-400 via-amber-400 to-rose-400" />
              <div className="relative flex gap-4 pb-5">
                <div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white ring-4 ring-white shadow">
                  <span className="text-xs font-bold">A</span>
                </div>
                <div className="flex-1 rounded-lg border border-emerald-200/80 bg-emerald-50/50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Départ</p>
                  <p className="mt-1 font-medium text-gray-900">{course.pickupAddress || 'Non spécifié'}</p>
                </div>
              </div>
              {course.stops?.map((stop, i) => (
                <div key={i} className="relative flex gap-4 pb-5">
                  <div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white ring-4 ring-white shadow">
                    <span className="text-xs font-bold">{i + 1}</span>
                  </div>
                  <div className="flex-1 rounded-lg border border-amber-200/80 bg-amber-50/50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">Arrêt {i + 1}</p>
                    <p className="mt-1 font-medium text-gray-900">{stop}</p>
                  </div>
                </div>
              ))}
              <div className="relative flex gap-4">
                <div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-500 text-white ring-4 ring-white shadow">
                  <span className="text-xs font-bold">B</span>
                </div>
                <div className="flex-1 rounded-lg border border-rose-200/80 bg-rose-50/50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-rose-700">Arrivée</p>
                  <p className="mt-1 font-medium text-gray-900">{course.dropoffAddress || 'Non spécifié'}</p>
                </div>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-3 text-sm">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 font-medium text-gray-700">
                <MapPin className="h-4 w-4" />
                {distanceKm > 0 ? `${distanceKm.toFixed(1)} km` : '—'}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 font-medium text-gray-700">
                <Clock className="h-4 w-4" />
                {durationDisplay || '—'}
              </span>
            </div>
          </div>

          {/* Acteurs : Client & Chauffeur */}
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="rounded-xl border border-gray-200/80 bg-white p-5 shadow-sm">
              <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-900">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100">
                  <User className="h-4 w-4 text-blue-600" />
                </div>
                Client
              </h2>
              <div className="space-y-2">
                <p className="font-medium text-gray-900">{course.clientName}</p>
                <a href={`tel:${course.clientPhone}`} className="block text-sm text-blue-600 hover:underline">{course.clientPhone}</a>
              </div>
            </div>
            <div className="rounded-xl border border-gray-200/80 bg-white p-5 shadow-sm">
              <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-900">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100">
                  <Car className="h-4 w-4 text-violet-600" />
                </div>
                Chauffeur
              </h2>
              {driver ? (
                <div className="space-y-2">
                  <p className="font-medium text-gray-900">{driver.firstName} {driver.lastName}</p>
                  <a href={`tel:${driver.phone}`} className="block text-sm text-blue-600 hover:underline">{driver.phone}</a>
                  {driver.vehicleModel && (
                    <p className="text-sm text-gray-600">{driver.vehicleModel} — {driver.vehiclePlate}</p>
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
          <div className="rounded-xl border border-gray-200/80 bg-white p-5 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-900">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100">
                <Star className="h-4 w-4 text-amber-600" />
              </div>
              Notations
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-gray-100 p-4">
                <h3 className="text-xs font-medium text-gray-500 mb-2">Client → Chauffeur</h3>
                {ratings?.client ? (
                  <>
                    <div className="flex items-center gap-2">
                      {renderStars(ratings.client.score)}
                      <span className="font-semibold text-gray-900">{ratings.client.score}/5</span>
                    </div>
                    {ratings.client.comment && (
                      <p className="mt-2 text-sm text-gray-600 italic">&quot;{ratings.client.comment}&quot;</p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-gray-400">Aucune notation</p>
                )}
              </div>
              <div className="rounded-lg border border-gray-100 p-4">
                <h3 className="text-xs font-medium text-gray-500 mb-2">Chauffeur → Client</h3>
                {ratings?.chauffeur ? (
                  <>
                    <div className="flex items-center gap-2">
                      {renderStars(ratings.chauffeur.score)}
                      <span className="font-semibold text-gray-900">{ratings.chauffeur.score}/5</span>
                    </div>
                    {ratings.chauffeur.comment && (
                      <p className="mt-2 text-sm text-gray-600 italic">&quot;{ratings.chauffeur.comment}&quot;</p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-gray-400">Aucune notation</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar Tarification (sticky) */}
        <div className="lg:col-span-1">
          <div className="sticky top-20 space-y-6">
            <div className="rounded-xl border border-gray-200/80 bg-white p-6 shadow-sm">
              <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-900">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-100">
                  <FileText className="h-4 w-4 text-purple-600" />
                </div>
                Tarification
              </h2>
            
            <div className="space-y-3">
              {/* En-tête avec type de course */}
              <div className="bg-purple-50 p-3 rounded-lg mb-3">
                <div className="text-sm font-medium text-purple-700">
                  {course.rideOption?.label || 'Course standard'}
                </div>
              </div>

              {/* Prise en charge */}
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Prise en charge</span>
                <span className="font-medium">{(course.rideOption?.baseFare || 0).toLocaleString()} XPF</span>
              </div>

              {/* Distance avec détail du tarif au km */}
              {distanceKm > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">
                    Distance ({distanceKm.toFixed(1)} km × {(course.rideOption?.pricePerKm || 0)} XPF/km)
                  </span>
                  <span className="font-medium">
                    {Math.round(distanceKm * (course.rideOption?.pricePerKm || 0)).toLocaleString()} XPF
                  </span>
                </div>
              )}

              {/* Temps d'attente - affiché quand il y a des minutes d'attente */}
              {course.waitingTimeMinutes && course.waitingTimeMinutes > 0 && (() => {
                const rate = data?.waitingRatePerMin ?? 42;
                const free = data?.freeMinutes ?? 0;
                const billable = Math.max(0, (course.waitingTimeMinutes || 0) - free);
                const fee = Math.round(billable * rate);
                return (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Attente ({billable} min × {rate} XPF)</span>
                    <span className="font-medium">{fee.toLocaleString()} XPF</span>
                  </div>
                );
              })()}

              {/* Suppléments */}
              {course.supplements && course.supplements.length > 0 && (
                <>
                  {course.supplements.map((supp: any, i: number) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-gray-600">
                        {supp.name || supp.label}
                        {supp.quantity && supp.quantity > 1 ? ` (×${supp.quantity})` : ''}
                      </span>
                      <span className="font-medium">
                        {((supp.price || supp.amount) * (supp.quantity || 1)).toLocaleString()} XPF
                      </span>
                    </div>
                  ))}
                </>
              )}

              {/* Calcul des majorations et frais de service */}
              {(() => {
                // Éléments de base
                const baseFare = course.rideOption?.baseFare || 0;
                const distancePrice = Math.round(distanceKm * (course.rideOption?.pricePerKm || 0));
                const rate = data?.waitingRatePerMin ?? 42;
                const free = data?.freeMinutes ?? 0;
                const billable = Math.max(0, (course.waitingTimeMinutes || 0) - free);
                const waitingPrice = Math.round(billable * rate);
                const supplementsTotal = (course.supplements || []).reduce((sum: number, s: any) => 
                  sum + ((s.price || s.amount || 0) * (s.quantity || 1)), 0
                );
                
                // Calculer le subtotal AVANT frais de service
                const fraisPercent = fraisConfig.fraisServicePrestataire || 8;
                const subtotalAvantFrais = Math.round(course.totalPrice / (1 + fraisPercent / 100));
                const fraisService = course.totalPrice - subtotalAvantFrais;
                
                // Majorations = reste après base + distance + attente + suppléments (passagers, altitude, etc.)
                const knownTotal = baseFare + distancePrice + waitingPrice + supplementsTotal;
                const majorations = subtotalAvantFrais - knownTotal;
                
                return (
                  <>
                    {/* Majorations uniquement si > 0 (passagers, altitude, etc. - pas l'attente) */}
                    {majorations > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Majorations (passagers/altitude)</span>
                        <span className="font-medium">{majorations.toLocaleString()} XPF</span>
                      </div>
                    )}

                    {/* Frais de service - calculés sur le prix à la confirmation (PAS sur attente/arrêts) */}
                    {(() => {
                      const fsPercent = data?.fraisServicePercent ?? fraisConfig.fraisServicePrestataire ?? 8;
                      const prixConfirmation = course.rideOption?.initialTotalPrice ?? course.totalPrice!;
                      const prixHorsFrais = Math.round(prixConfirmation / (1 + fsPercent / 100));
                      const fraisService = prixConfirmation - prixHorsFrais;
                      if (fraisService <= 0) return null;
                      return (
                        <div className="flex justify-between text-sm">
                          <span className="text-purple-600">Frais de service ({fsPercent}%)</span>
                          <span className="font-medium text-purple-600">{fraisService.toLocaleString()} XPF</span>
                        </div>
                      );
                    })()}

                    <div className="border-t border-gray-200 pt-3 mt-3">
                      <div className="flex justify-between font-semibold">
                        <span>Total course</span>
                        <span className="text-lg">{course.totalPrice?.toLocaleString()} XPF</span>
                      </div>
                    </div>
                  </>
                );
              })()}

              <div className="border-t border-gray-200 pt-3 space-y-2">
                {/* Calcul du subtotal (prix hors frais TAPEA) */}
                {(() => {
                  const fsPercent = data?.fraisServicePercent ?? fraisConfig.fraisServicePrestataire ?? 8;
                  const prixConfirmation = course.rideOption?.initialTotalPrice ?? course.totalPrice;
                  const prixHorsFrais = Math.round(prixConfirmation / (1 + fsPercent / 100));
                  const fraisService = prixConfirmation - prixHorsFrais;
                  const commissionSupp = Math.round(prixConfirmation * (fraisConfig.commissionPrestataire || 0) / 100);
                  const subtotal = (course.totalPrice || 0) - fraisService - commissionSupp;
                  const commissionChauffeur = driver?.commissionChauffeur || 95;
                  const revenusRéelsChauffeur = Math.round(subtotal * (commissionChauffeur / 100));
                  const revenusPrestataire = subtotal - revenusRéelsChauffeur;
                  
                  return (
                    <>
                      <div className="flex justify-between text-sm bg-gray-50 p-2 rounded">
                        <span className="font-medium">Subtotal (hors frais TAPEA)</span>
                        <span className="font-medium">{subtotal.toLocaleString()} XPF</span>
                      </div>
                      
                      <div className="flex justify-between text-sm">
                        <span className="text-green-600">
                          Revenus chauffeur ({commissionChauffeur}%)
                        </span>
                        <span className="font-medium text-green-600">{revenusRéelsChauffeur.toLocaleString()} XPF</span>
                      </div>
                      
                      <div className="flex justify-between text-sm">
                        <span className="text-blue-600">
                          Revenus prestataire ({100 - commissionChauffeur}%)
                        </span>
                        <span className="font-medium text-blue-600">{revenusPrestataire.toLocaleString()} XPF</span>
                      </div>
                      
                      <div className="border-t border-gray-200 my-2"></div>
                      
                      {/* Frais TAPEA - bloc design moderne */}
                      <div className="relative overflow-hidden rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-teal-50/30 to-emerald-50 p-4 shadow-sm shadow-emerald-900/5 ring-1 ring-emerald-500/20">
                        <div className="absolute top-0 right-0 w-24 h-24 -translate-y-1/2 translate-x-1/2 rounded-full bg-emerald-400/10" />
                        <div className="relative flex items-center gap-2 mb-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-md shadow-emerald-600/30">
                            <Building2 className="h-4 w-4" />
                          </div>
                          <span className="text-sm font-semibold uppercase tracking-wider text-emerald-800/90">Frais TAPEA</span>
                        </div>
                        <div className="relative space-y-2.5">
                          <div className="flex justify-between items-center rounded-md bg-white/60 px-3 py-2 backdrop-blur-sm">
                            <span className="text-sm text-slate-600">Frais de service</span>
                            <span className="text-sm font-semibold text-slate-800">{fsPercent}% · {fraisService.toLocaleString()} XPF</span>
                          </div>
                          <div className="flex justify-between items-center rounded-md bg-white/60 px-3 py-2 backdrop-blur-sm">
                            <span className="text-sm text-slate-600">Commission supp.</span>
                            <span className="text-sm font-semibold text-slate-800">{fraisConfig.commissionPrestataire}% · {commissionSupp.toLocaleString()} XPF</span>
                          </div>
                          <div className="flex justify-between items-center rounded-lg bg-emerald-600/15 px-3 py-3 mt-2 border border-emerald-500/30">
                            <span className="text-sm font-bold text-emerald-800">Total TAPEA</span>
                            <span className="text-base font-bold text-emerald-700">
                              {(fraisService + commissionSupp).toLocaleString()} XPF
                            </span>
                          </div>
                        </div>
                      </div>
                    </>
                  );
                })()}
            </div>
          </div>
        </div>
        </div>
      </div>

      {/* Hidden Invoice for Print - Facture client/prestataire (sans TAPEA) */}
      <div className="hidden">
        <div ref={invoiceRef}>
          <div className="header">
            <div>
              <div className="prestataire-name">{prestataire?.nom ?? 'Prestataire'}</div>
              <div className="prestataire-details">
                {[prestataire?.numeroTahiti && `N° Tahiti : ${prestataire.numeroTahiti}`, prestataire?.email, prestataire?.phone].filter(Boolean).join(' · ')}
              </div>
            </div>
            <div className="invoice-info">
              <div className="invoice-label">FACTURE</div>
              <div className="invoice-meta">N° {course.id.slice(0, 8).toUpperCase()}</div>
              <div className="invoice-meta">
                {new Date(course.date).toLocaleDateString('fr-FR', {
                  day: 'numeric', month: 'long', year: 'numeric',
                })}
              </div>
            </div>
          </div>

          <div className="grid-2">
            <div className="block">
              <div className="block-title">Client</div>
              <div className="block-content">
                <div>{course.clientName}</div>
                <div style={{ color: '#6b7280', marginTop: '2px' }}>{course.clientPhone}</div>
              </div>
            </div>
            {driver && (
              <div className="block">
                <div className="block-title">Chauffeur</div>
                <div className="block-content">
                  <div>{driver.firstName} {driver.lastName}</div>
                  {driver.vehicleModel && (
                    <div style={{ color: '#6b7280', marginTop: '2px' }}>{driver.vehicleModel} — {driver.vehiclePlate}</div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="block" style={{ marginBottom: '12px' }}>
            <div className="block-title">Trajet</div>
            <div className="block-content">
              <div className="trajet-row">
                <div className="trajet-dot start" />
                <div><strong>Départ</strong> — {course.pickupAddress}</div>
              </div>
              <div className="trajet-row">
                <div className="trajet-dot end" />
                <div><strong>Arrivée</strong> — {course.dropoffAddress}</div>
              </div>
            </div>
          </div>

          <table className="pricing-table">
            <thead>
              <tr>
                <th>Description</th>
                <th>Montant</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{course.rideOption?.label || 'Course standard'}</td>
                <td>{(course.rideOption?.baseFare || 0).toLocaleString()} XPF</td>
              </tr>
              {distanceKm > 0 && (
                <tr>
                  <td>Distance ({distanceKm.toFixed(1)} km)</td>
                  <td>{Math.round(distanceKm * (course.rideOption?.pricePerKm || 0)).toLocaleString()} XPF</td>
                </tr>
              )}
              {course.waitingTimeMinutes && course.waitingTimeMinutes > 0 && (() => {
                const rate = data?.waitingRatePerMin ?? 42;
                const free = data?.freeMinutes ?? 0;
                const billable = Math.max(0, (course.waitingTimeMinutes || 0) - free);
                const fee = Math.round(billable * rate);
                return (
                  <tr>
                    <td>Attente ({billable} min × {rate} XPF)</td>
                    <td>{fee.toLocaleString()} XPF</td>
                  </tr>
                );
              })()}
              {(() => {
                const fsPercent = data?.fraisServicePercent ?? fraisConfig.fraisServicePrestataire ?? 8;
                const prixConfirmation = course.rideOption?.initialTotalPrice ?? course.totalPrice;
                const prixHorsFrais = Math.round((prixConfirmation || 0) / (1 + fsPercent / 100));
                const fraisService = (prixConfirmation || 0) - prixHorsFrais;
                if (fraisService <= 0) return null;
                return (
                  <tr>
                    <td>Frais de service plateforme ({fsPercent}%)</td>
                    <td>{fraisService.toLocaleString()} XPF</td>
                  </tr>
                );
              })()}
              <tr className="total">
                <td>TOTAL TTC</td>
                <td>{course.totalPrice?.toLocaleString()} XPF TTC</td>
              </tr>
            </tbody>
          </table>

          <div className="payment-line">
            <span>Méthode de paiement</span>
            <span style={{ fontWeight: 600 }}>{course.paymentMethod === 'card' ? 'Carte bancaire' : 'Espèces'}</span>
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}
