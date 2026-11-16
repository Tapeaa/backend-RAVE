/**
 * RAVE — Dashboard prestataire / loueur
 */

import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import {
  Car,
  Wallet,
  TrendingUp,
  ArrowRight,
  Calendar,
  ClipboardList,
  Plus,
  Sparkles,
} from 'lucide-react';
import { PaymentStatusBadge } from '@/components/rental/PaymentStatusBadge';

interface PrestataireInfo {
  id: string;
  nom: string;
  type: string;
  isSociete: boolean;
  totalChauffeurs: number;
}

interface Stats {
  totalChauffeurs: number;
  revenusGlobal: number;
  revenusSemaine: number;
  revenusMois: number;
  coursesAujourdhui: number;
  coursesSemaine: number;
  coursesMois: number;
  totalCourses: number;
}

interface Course {
  id: string;
  date: string;
  clientName: string;
  pickupAddress: string;
  dropoffAddress: string;
  stops?: string[];
  totalPrice: number;
  driverEarnings: number;
  paymentMethod: string;
  status: string;
  driverName?: string;
  rideOption?: any;
}

interface SubscriptionSummary {
  status: string;
  daysRemaining: number | null;
  graceDaysRemaining?: number | null;
  waitingFirstVehicle?: boolean;
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  payment_confirmed: { label: 'Payée', className: 'bg-emerald-50 text-emerald-700' },
  completed: { label: 'Terminée', className: 'bg-emerald-50 text-emerald-700' },
  cancelled: { label: 'Annulée', className: 'bg-red-50 text-red-700' },
  pending: { label: 'En attente', className: 'bg-amber-50 text-amber-700' },
  accepted: { label: 'Acceptée', className: 'bg-blue-50 text-blue-700' },
};

function formatXpf(n: number | null | undefined): string {
  return `${Math.round(Number(n) || 0).toLocaleString('fr-FR')} XPF`;
}

function subscriptionBanner(sub: SubscriptionSummary | null) {
  if (!sub) return null;
  const days = sub.daysRemaining ?? 0;
  const plural = days > 1 ? 's' : '';
  if (sub.waitingFirstVehicle) {
    return {
      tone: 'amber' as const,
      title: 'Activez votre période d’essai',
      text: "Créez votre premier véhicule pour lancer vos 30 jours d'essai, ou payez l'abonnement Tape'ā.",
      cta: { href: '/prestataire/vehicles', label: 'Ajouter un véhicule' },
    };
  }
  if (sub.status === 'trial') {
    return {
      tone: 'neutral' as const,
      title: `Période d’essai · ${days} jour${plural} restant${plural}`,
      text: 'Vous pouvez payer l’abonnement à tout moment depuis votre profil.',
      cta: { href: '/prestataire/profil', label: 'Voir l’abonnement' },
    };
  }
  if (sub.status === 'active') {
    return {
      tone: 'green' as const,
      title: `Abonnement actif · ${days} jour${plural} restant${plural}`,
      text: 'Vos véhicules sont visibles sur l’app client.',
      cta: null,
    };
  }
  if (sub.status === 'pending') {
    return {
      tone: 'amber' as const,
      title: 'Paiement en cours de confirmation',
      text: 'L’abonnement s’active automatiquement dès que Stripe confirme le paiement.',
      cta: null,
    };
  }
  if (sub.status === 'grace') {
    return {
      tone: 'amber' as const,
      title: `Abonnement expiré · ${sub.graceDaysRemaining ?? 0} jour(s) de grâce`,
      text: 'Renouvelez pour garder vos véhicules visibles dans le catalogue.',
      cta: { href: '/prestataire/profil', label: 'Renouveler' },
    };
  }
  if (sub.status === 'expired') {
    return {
      tone: 'red' as const,
      title: 'Abonnement expiré',
      text: 'Vos véhicules sont masqués du catalogue client.',
      cta: { href: '/prestataire/profil', label: 'Renouveler' },
    };
  }
  return null;
}

const toneClasses = {
  neutral: 'border-gray-200 bg-white',
  green: 'border-emerald-200 bg-emerald-50/60',
  amber: 'border-amber-200 bg-amber-50/70',
  red: 'border-red-200 bg-red-50/70',
};

export function PrestataireDashboard() {
  const [prestataire, setPrestataire] = useState<PrestataireInfo | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentCourses, setRecentCourses] = useState<Course[]>([]);
  const [vehicleCount, setVehicleCount] = useState<number | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('admin_token');
      const headers = { Authorization: `Bearer ${token}` };

      const [infoRes, statsRes, coursesRes, vehiclesRes, subRes] = await Promise.all([
        fetch('/api/prestataire/me', { headers }),
        fetch('/api/prestataire/stats', { headers }),
        fetch('/api/prestataire/courses?limit=8', { headers }),
        fetch('/api/prestataire/vehicles', { headers }),
        fetch('/api/prestataire/subscription', { headers }),
      ]);

      if (infoRes.ok) setPrestataire((await infoRes.json()).prestataire);
      if (statsRes.ok) setStats((await statsRes.json()).stats);
      if (coursesRes.ok) setRecentCourses((await coursesRes.json()).courses || []);
      if (vehiclesRes.ok) {
        const list = await vehiclesRes.json();
        setVehicleCount(Array.isArray(list) ? list.length : 0);
      }
      if (subRes.ok) setSubscription((await subRes.json()).subscription || null);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsLoading(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-900 border-t-transparent" />
      </div>
    );
  }

  const banner = subscriptionBanner(subscription);
  const firstName = (prestataire?.nom || '').split(' ')[0];

  const kpis = [
    { label: 'Revenus ce mois', value: formatXpf(stats?.revenusMois), icon: Wallet },
    { label: 'Revenus cette semaine', value: formatXpf(stats?.revenusSemaine), icon: TrendingUp },
    { label: 'Locations ce mois', value: String(stats?.coursesMois || 0), icon: ClipboardList },
    { label: 'Véhicules', value: vehicleCount == null ? '—' : String(vehicleCount), icon: Car },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
            Bonjour{firstName ? ` ${firstName}` : ''}
          </h1>
          <p className="mt-1 text-sm text-gray-500">Voici l’activité de votre location.</p>
        </div>
        <Link href="/prestataire/vehicles">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            <Plus className="h-4 w-4" />
            Ajouter un véhicule
          </button>
        </Link>
      </div>

      {banner ? (
        <div className={`flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between ${toneClasses[banner.tone]}`}>
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm ring-1 ring-gray-200">
              <Sparkles className="h-4 w-4 text-amber-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">{banner.title}</p>
              <p className="mt-0.5 text-sm text-gray-600">{banner.text}</p>
            </div>
          </div>
          {banner.cta ? (
            <Link href={banner.cta.href}>
              <button
                type="button"
                className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-900 hover:bg-gray-50"
              >
                {banner.cta.label}
              </button>
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500">{kpi.label}</span>
              <kpi.icon className="h-4 w-4 text-gray-400" />
            </div>
            <div className="mt-2 text-xl font-semibold tracking-tight text-gray-900 sm:text-2xl">
              {kpi.value}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white lg:col-span-2">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Dernières réservations</h2>
              <p className="text-xs text-gray-500">{stats?.totalCourses || 0} au total</p>
            </div>
            <Link href="/prestataire/courses">
              <button type="button" className="text-sm font-medium text-gray-600 hover:text-gray-900">
                Tout voir
              </button>
            </Link>
          </div>

          {recentCourses.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-100">
                <ClipboardList className="h-5 w-5 text-gray-400" />
              </div>
              <p className="mt-3 text-sm font-medium text-gray-900">Aucune réservation pour l’instant</p>
              <p className="mt-1 text-sm text-gray-500">Les locations de vos clients apparaîtront ici.</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {recentCourses.map((course) => {
                const status = STATUS_LABELS[course.status] || {
                  label: course.status,
                  className: 'bg-gray-100 text-gray-600',
                };
                return (
                  <li key={course.id}>
                    <Link href={`/prestataire/courses/${course.id}`}>
                      <div className="flex cursor-pointer items-center gap-4 px-5 py-3.5 transition-colors hover:bg-gray-50">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium text-gray-900">
                              {course.clientName || 'Client'}
                            </span>
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${status.className}`}>
                              {status.label}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
                            <span className="inline-flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {new Date(course.date).toLocaleDateString('fr-FR', {
                                day: '2-digit',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                            {course.pickupAddress ? (
                              <span className="hidden truncate sm:inline">{course.pickupAddress}</span>
                            ) : null}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-sm font-semibold text-gray-900">
                            {formatXpf(course.totalPrice || course.driverEarnings)}
                          </div>
                          <div className="mt-0.5">
                            <PaymentStatusBadge course={course} />
                          </div>
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="space-y-3">
          {[
            { href: '/prestataire/vehicles', icon: Car, title: 'Mes véhicules', text: 'Tarifs, photos, disponibilités' },
            { href: '/prestataire/courses', icon: ClipboardList, title: 'Réservations', text: 'Contrats et suivi des locations' },
            { href: '/prestataire/profil', icon: Wallet, title: 'Profil & abonnement', text: 'Facturation, PayZen, abonnement' },
          ].map((item) => (
            <Link key={item.href} href={item.href}>
              <div className="group flex cursor-pointer items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 transition-colors hover:border-gray-300">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100">
                  <item.icon className="h-4 w-4 text-gray-700" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-gray-900">{item.title}</div>
                  <div className="truncate text-xs text-gray-500">{item.text}</div>
                </div>
                <ArrowRight className="h-4 w-4 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-gray-500" />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
