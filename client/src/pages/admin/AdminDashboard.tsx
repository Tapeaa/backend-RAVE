/**
 * RAVE Back Office — Tableau de bord location
 */

import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  CarFront,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  CreditCard,
  MessageCircle,
  RotateCcw,
  Scale,
  Trophy,
  Users,
} from 'lucide-react';
import { ActivityFeed } from '@/components/admin/ActivityFeed';

interface DashboardStats {
  totalClients: number;
  totalChauffeurs: number;
  totalCommandes: number;
  chauffeursActifs: number;
  commandesEnAttente: number;
  revenusTotaux: number;
  commandesAujourdhui: number;
  revenusAujourdhui: number;
  revenusMois?: number;
  revenusMoisPrecedent?: number;
  commandesMois?: number;
  commandesMoisPrecedent?: number;
  partCarteMois?: number;
  nouveauxClientsMois?: number;
  daily?: Array<{ date: string; count: number; revenue: number }>;
  topLoueurs?: Array<{ id: string; name: string; count: number; revenue: number }>;
  topVehicles?: Array<{ title: string; count: number }>;
  pendingOrders?: Array<{ id: string; clientName: string; title: string; totalPrice: number; createdAt: string }>;
  upcomingStarts?: number;
  remboursementsEnAttente?: number;
  supportNonLus?: number;
  litigesOuverts?: number;
  loueursAbonnementExpire?: number;
  loueursEssai?: number;
  loueursAbonnes?: number;
}

interface ActivityItem {
  id: string;
  eventType: string;
  customerName: string;
  amount?: number | null;
  currency?: string;
  created?: number | null;
  isNew?: boolean;
  description?: string;
}

const ORDER_ACTIVITY_EVENTS = new Set([
  'order_in_progress',
  'advance_booking',
  'order_pending',
  'order_accepted',
  'order_completed',
  'order_cancelled',
  'order_declined',
  'order_expired',
]);

function isRentalActivity(activity: ActivityItem): boolean {
  const desc = (activity.description || '').toLowerCase();
  const type = (activity.eventType || '').toLowerCase();
  return (
    ORDER_ACTIVITY_EVENTS.has(type) ||
    desc.includes('location') ||
    desc.includes('rental') ||
    desc.includes('réservation') ||
    desc.includes('reservation') ||
    type.includes('rental')
  );
}

function xpf(amount: number | undefined | null): string {
  return `${Math.round(amount || 0).toLocaleString('fr-FR')} XPF`;
}

function delta(current = 0, previous = 0): { label: string; up: boolean } | null {
  if (!previous) return current > 0 ? { label: 'nouveau', up: true } : null;
  const pct = Math.round(((current - previous) / previous) * 100);
  return { label: `${pct > 0 ? '+' : ''}${pct} %`, up: pct >= 0 };
}

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `il y a ${mins} min`;
  const h = Math.round(mins / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.round(h / 24)} j`;
}

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('admin_token')}` };
}

export function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchStats();
    fetchActivities();
    const interval = setInterval(() => {
      fetchStats();
      fetchActivities();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  async function fetchStats() {
    try {
      const res = await fetch('/api/admin/dashboard/stats', { headers: authHeaders() });
      if (res.ok) setStats(await res.json());
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function fetchActivities() {
    try {
      const res = await fetch('/api/admin/dashboard/activities', { headers: authHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      const list = (data.activities || []) as ActivityItem[];
      const rentalOnly = list.filter(isRentalActivity);
      setActivities((rentalOnly.length > 0 ? rentalOnly : list).slice(0, 8));
    } catch (error) {
      console.error('Error fetching activities:', error);
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" />
      </div>
    );
  }

  if (!stats) {
    return <div className="text-red-600">Erreur lors du chargement des statistiques</div>;
  }

  const todos = [
    {
      key: 'pending',
      count: stats.commandesEnAttente,
      label: 'Réservations en attente',
      hint: 'Pas encore acceptées par le loueur',
      href: '/admin/commandes',
      icon: ClipboardList,
      tone: 'amber',
    },
    {
      key: 'refunds',
      count: stats.remboursementsEnAttente || 0,
      label: 'Remboursements à suivre',
      hint: 'Payées par carte puis annulées',
      href: '/admin/commandes',
      icon: RotateCcw,
      tone: 'red',
    },
    {
      key: 'support',
      count: stats.supportNonLus || 0,
      label: 'Messages support non lus',
      hint: 'Clients et loueurs',
      href: '/admin/messages',
      icon: MessageCircle,
      tone: 'blue',
    },
    {
      key: 'disputes',
      count: stats.litigesOuverts || 0,
      label: 'Litiges ouverts',
      hint: 'À examiner',
      href: '/admin/disputes',
      icon: Scale,
      tone: 'red',
    },
    {
      key: 'subs',
      count: stats.loueursAbonnementExpire || 0,
      label: 'Abonnements loueurs expirés',
      hint: 'Véhicules masqués du catalogue',
      href: '/admin/chauffeurs',
      icon: AlertTriangle,
      tone: 'amber',
    },
  ];
  const activeTodos = todos.filter((t) => t.count > 0);

  const toneClasses: Record<string, string> = {
    amber: 'bg-amber-50 text-amber-700 ring-amber-200',
    red: 'bg-red-50 text-red-700 ring-red-200',
    blue: 'bg-blue-50 text-blue-700 ring-blue-200',
  };

  const revDelta = delta(stats.revenusMois, stats.revenusMoisPrecedent);
  const ordDelta = delta(stats.commandesMois, stats.commandesMoisPrecedent);
  const daily = stats.daily || [];
  const maxDaily = Math.max(1, ...daily.map((d) => d.count));
  const total14 = daily.reduce((s, d) => s + d.count, 0);
  const maxLoueurRevenue = Math.max(1, ...(stats.topLoueurs || []).map((l) => l.revenue));
  const maxVehicleCount = Math.max(1, ...(stats.topVehicles || []).map((v) => v.count));

  const todayRaw = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const todayLabel = todayRaw.charAt(0).toUpperCase() + todayRaw.slice(1);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* En-tête */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{todayLabel}</p>
          <h1 className="text-2xl font-bold text-slate-900">Tableau de bord</h1>
        </div>
        <p className="text-sm text-slate-600">
          Aujourd&apos;hui : <span className="font-semibold text-slate-900">{stats.commandesAujourdhui}</span> réservation
          {stats.commandesAujourdhui > 1 ? 's' : ''} · <span className="font-semibold text-slate-900">{xpf(stats.revenusAujourdhui)}</span>
        </p>
      </div>

      {/* À traiter */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">À traiter</h2>
          {activeTodos.length > 0 && (
            <span className="rounded-full bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white">
              {activeTodos.reduce((s, t) => s + t.count, 0)}
            </span>
          )}
        </div>
        {activeTodos.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl bg-emerald-50 p-4 text-emerald-800">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            <p className="text-sm font-medium">Tout est à jour : aucune réservation, message ou litige en attente.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {activeTodos.map((t) => (
              <Link key={t.key} href={t.href}>
                <div className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-100 p-3 transition-colors hover:bg-slate-50">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${toneClasses[t.tone]}`}>
                    <t.icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">
                      <span className="mr-1 text-lg">{t.count}</span>
                      {t.label}
                    </p>
                    <p className="truncate text-xs text-slate-500">{t.hint}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                </div>
              </Link>
            ))}
          </div>
        )}
        {(stats.upcomingStarts || 0) > 0 && (
          <div className="mt-3 flex items-center gap-2 text-sm text-slate-600">
            <CalendarClock className="h-4 w-4 text-slate-400" />
            <span>
              <span className="font-semibold text-slate-900">{stats.upcomingStarts}</span> location
              {(stats.upcomingStarts || 0) > 1 ? 's démarrent' : ' démarre'} dans les 7 prochains jours
            </span>
          </div>
        )}
      </section>

      {/* Ce mois-ci */}
      <section>
        <h2 className="mb-3 text-base font-semibold text-slate-900">Ce mois-ci</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard
            label="Volume payé"
            value={xpf(stats.revenusMois)}
            delta={revDelta}
            footnote={`vs ${xpf(stats.revenusMoisPrecedent)} le mois dernier`}
          />
          <KpiCard
            label="Réservations"
            value={String(stats.commandesMois ?? 0)}
            delta={ordDelta}
            footnote={`vs ${stats.commandesMoisPrecedent ?? 0} le mois dernier`}
          />
          <KpiCard
            label="Nouveaux clients"
            value={String(stats.nouveauxClientsMois ?? 0)}
            footnote={`${stats.totalClients} clients au total`}
          />
          <KpiCard
            label="Payées par carte"
            value={`${stats.partCarteMois ?? 0} %`}
            footnote="des réservations du mois"
          />
        </div>
      </section>

      {/* Tendance 14 jours */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900">Réservations sur 14 jours</h2>
          <span className="text-sm text-slate-500">{total14} au total</span>
        </div>
        <div className="flex h-36 items-end gap-1 sm:gap-2">
          {daily.map((d, i) => {
            const date = new Date(d.date);
            const isToday = i === daily.length - 1;
            return (
              <div key={d.date} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
                <div className="relative mt-4 w-full flex-1">
                  <div
                    title={`${date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} : ${d.count} réservation(s), ${xpf(d.revenue)}`}
                    className={`absolute inset-x-0 bottom-0 rounded-t-md ${isToday ? 'bg-amber-500' : d.count > 0 ? 'bg-slate-800' : 'bg-slate-100'}`}
                    style={{ height: `${d.count > 0 ? Math.max(8, (d.count / maxDaily) * 100) : 4}%` }}
                  >
                    {d.count > 0 && (
                      <span className="absolute inset-x-0 -top-4 text-center text-[10px] font-medium text-slate-500">
                        {d.count}
                      </span>
                    )}
                  </div>
                </div>
                <span className={`text-[10px] ${isToday ? 'font-bold text-amber-600' : 'text-slate-400'}`}>
                  {date.getDate()}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Classements */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-3 flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-500" />
            <h2 className="text-base font-semibold text-slate-900">Meilleurs loueurs du mois</h2>
          </div>
          {(stats.topLoueurs || []).length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">Aucune réservation ce mois-ci</p>
          ) : (
            <ul className="space-y-3">
              {(stats.topLoueurs || []).map((l, i) => (
                <li key={l.id}>
                  <Link href={`/admin/chauffeurs/${l.id}`}>
                    <div className="cursor-pointer">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="min-w-0 truncate font-medium text-slate-800">
                          <span className="mr-2 text-slate-400">{i + 1}.</span>
                          {l.name}
                        </span>
                        <span className="shrink-0 font-semibold text-slate-900">{xpf(l.revenue)}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-amber-400" style={{ width: `${(l.revenue / maxLoueurRevenue) * 100}%` }} />
                        </div>
                        <span className="shrink-0 text-xs text-slate-500">{l.count} résa.</span>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-3 flex items-center gap-2">
            <CarFront className="h-4 w-4 text-slate-500" />
            <h2 className="text-base font-semibold text-slate-900">Véhicules les plus demandés</h2>
          </div>
          {(stats.topVehicles || []).length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">Aucune réservation ce mois-ci</p>
          ) : (
            <ul className="space-y-3">
              {(stats.topVehicles || []).map((v) => (
                <li key={v.title}>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate font-medium text-slate-800">{v.title}</span>
                    <span className="shrink-0 text-slate-600">{v.count}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-slate-700" style={{ width: `${(v.count / maxVehicleCount) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Réservations en attente + activité */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">En attente du loueur</h2>
            <Link href="/admin/commandes">
              <span className="cursor-pointer text-sm font-medium text-amber-600 hover:text-amber-700">Tout voir</span>
            </Link>
          </div>
          {(stats.pendingOrders || []).length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">Aucune réservation en attente</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {(stats.pendingOrders || []).map((o) => (
                <li key={o.id}>
                  <Link href={`/admin/commandes/${o.id}`}>
                    <div className="flex cursor-pointer items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">{o.clientName}</p>
                        <p className="truncate text-xs text-slate-500">
                          {o.title} · {timeAgo(o.createdAt)}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-semibold text-slate-900">{xpf(o.totalPrice)}</span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-3 flex items-center gap-2">
            <Activity className="h-4 w-4 text-slate-500" />
            <h2 className="text-base font-semibold text-slate-900">Activité récente</h2>
          </div>
          <ActivityFeed
            activities={activities}
            onActivityClick={(a) => {
              if (ORDER_ACTIVITY_EVENTS.has(a.eventType)) window.location.href = `/admin/commandes/${a.id}`;
            }}
          />
        </section>
      </div>

      {/* Plateforme */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="mb-3 text-base font-semibold text-slate-900">Plateforme</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <PlatformStat icon={Users} label="Clients" value={stats.totalClients} />
          <PlatformStat
            icon={CarFront}
            label="Loueurs"
            value={stats.totalChauffeurs}
            sub={`${stats.loueursAbonnes ?? 0} abonnés · ${stats.loueursEssai ?? 0} en essai`}
          />
          <PlatformStat icon={ClipboardList} label="Réservations" value={stats.totalCommandes} sub="depuis le lancement" />
          <PlatformStat icon={CreditCard} label="Volume total" value={xpf(stats.revenusTotaux)} sub="locations payées" />
        </div>
      </section>
    </div>
  );
}

function KpiCard({
  label,
  value,
  delta: d,
  footnote,
}: {
  label: string;
  value: string;
  delta?: { label: string; up: boolean } | null;
  footnote?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 truncate text-xl font-bold text-slate-900 sm:text-2xl">{value}</p>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
        {d && (
          <span
            className={`inline-flex items-center gap-0.5 text-xs font-semibold ${d.up ? 'text-emerald-600' : 'text-red-600'}`}
          >
            {d.up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {d.label}
          </span>
        )}
        {footnote && <span className="text-[11px] text-slate-400">{footnote}</span>}
      </div>
    </div>
  );
}

function PlatformStat({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  sub?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="mt-1 truncate text-lg font-bold text-slate-900">{value}</p>
      {sub && <p className="truncate text-[11px] text-slate-400">{sub}</p>}
    </div>
  );
}

export default AdminDashboard;
