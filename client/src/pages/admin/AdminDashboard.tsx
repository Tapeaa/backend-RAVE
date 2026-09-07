/**
 * RAVE Back Office — Tableau de bord location
 */

import { useEffect, useState } from 'react';
import {
  Users, Car, ClipboardList,
  TrendingUp, Clock, CheckCircle, XCircle,
  CreditCard, Activity, LayoutDashboard, CarFront,
} from 'lucide-react';
import { StatsCard } from '@/components/admin/StatsCard';
import { ActivityFeed } from '@/components/admin/ActivityFeed';
import { PaymentTable } from '@/components/admin/PaymentTable';
import { CourseDetailsModal } from '@/components/admin/CourseDetailsModal';

interface DashboardStats {
  totalClients: number;
  totalChauffeurs: number;
  totalCommandes: number;
  chauffeursActifs: number;
  chauffeursEnLigne: number;
  clientsActifs: number;
  commandesTerminees: number;
  commandesEnCours: number;
  commandesEnAttente: number;
  commandesAnnulees: number;
  revenusTotaux: number;
  commandesAujourdhui: number;
  revenusAujourdhui: number;
}

interface StripeActivity {
  id: string;
  eventType: string;
  customerName: string;
  amount?: number | null;
  currency?: string;
  created?: number | null;
  isNew?: boolean;
  description?: string;
}

interface StripePayment {
  id: string;
  customerName: string;
  customerEmail?: string;
  amount: number;
  currency: string;
  status: string;
  created?: number | null;
  description?: string;
  receiptUrl?: string;
  isNew?: boolean;
}

function isRentalActivity(activity: StripeActivity): boolean {
  const desc = (activity.description || '').toLowerCase();
  const type = (activity.eventType || '').toLowerCase();
  return (
    desc.includes('location') ||
    desc.includes('rental') ||
    desc.includes('réservation') ||
    desc.includes('reservation') ||
    type.includes('rental') ||
    type === 'order_in_progress' ||
    type === 'advance_booking' ||
    type === 'order_pending' ||
    type === 'order_accepted' ||
    type === 'order_completed'
  );
}

export function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activities, setActivities] = useState<StripeActivity[]>([]);
  const [payments, setPayments] = useState<StripePayment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handlePaymentClick = (paymentId: string) => {
    window.location.href = `/admin/commandes/${paymentId}`;
  };

  const handleActivityClick = (activity: StripeActivity) => {
    if (
      activity.eventType === 'order_in_progress' ||
      activity.eventType === 'advance_booking' ||
      activity.eventType === 'order_pending' ||
      activity.eventType === 'order_accepted'
    ) {
      setSelectedOrderId(activity.id);
      setIsModalOpen(true);
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedOrderId(null);
  };

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchRealTimeData, 15000);
    return () => clearInterval(interval);
  }, []);

  async function fetchDashboardData() {
    try {
      const token = localStorage.getItem('admin_token');
      const [statsRes, paymentsRes, activitiesRes] = await Promise.all([
        fetch('/api/admin/dashboard/stats', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/admin/stripe/payments', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/admin/dashboard/activities', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data);
      }

      if (paymentsRes.ok) {
        const data = await paymentsRes.json();
        setPayments((data.payments || []).slice(0, 5).map((p: any) => ({
          id: p.id,
          customerName: p.clientName || 'Client',
          amount: p.amount,
          currency: p.currency,
          status: p.status,
          created: new Date(p.createdAt).getTime() / 1000,
          description: p.paymentMethod === 'card' ? 'Paiement carte' : 'Paiement au loueur',
          receiptUrl: p.pdfUrl || undefined,
        })));
      }

      if (activitiesRes.ok) {
        const data = await activitiesRes.json();
        const list = (data.activities || []) as StripeActivity[];
        const rentalOnly = list.filter(isRentalActivity);
        setActivities(rentalOnly.length > 0 ? rentalOnly : list.slice(0, 20));
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function fetchRealTimeData() {
    try {
      const token = localStorage.getItem('admin_token');
      const [paymentsRes, activitiesRes] = await Promise.all([
        fetch('/api/admin/stripe/payments', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/admin/dashboard/activities', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (paymentsRes.ok) {
        const data = await paymentsRes.json();
        setPayments((data.payments || []).slice(0, 5).map((p: any) => ({
          id: p.id,
          customerName: p.clientName || 'Client',
          amount: p.amount,
          currency: p.currency,
          status: p.status,
          created: new Date(p.createdAt).getTime() / 1000,
          description: p.paymentMethod === 'card' ? 'Paiement carte' : 'Paiement au loueur',
          receiptUrl: p.pdfUrl || undefined,
        })));
      }

      if (activitiesRes.ok) {
        const data = await activitiesRes.json();
        const list = (data.activities || []) as StripeActivity[];
        const rentalOnly = list.filter(isRentalActivity);
        setActivities(rentalOnly.length > 0 ? rentalOnly : list.slice(0, 20));
      }
    } catch (error) {
      console.error('Error fetching real-time data:', error);
    }
  }

  function formatCurrency(amount: number): string {
    return amount.toLocaleString('fr-FR') + ' XPF';
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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-yellow-500 shadow-lg shadow-amber-500/30">
          <LayoutDashboard className="h-7 w-7 text-slate-900" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tableau de Bord</h1>
          <p className="text-slate-500">Vue d&apos;ensemble de la plateforme de location RAVE</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Volume locations"
          value={formatCurrency(stats.revenusTotaux)}
          icon={<TrendingUp className="h-6 w-6" />}
          gradient="purple"
        />
        <StatsCard
          title="Réservations"
          value={stats.totalCommandes}
          icon={<ClipboardList className="h-6 w-6" />}
          gradient="green"
        />
        <StatsCard
          title="Clients"
          value={stats.totalClients}
          icon={<Users className="h-6 w-6" />}
          gradient="blue"
        />
        <StatsCard
          title="Loueurs"
          value={stats.totalChauffeurs}
          icon={<CarFront className="h-6 w-6" />}
          gradient="orange"
          subtitle={`${stats.chauffeursActifs || 0} actifs`}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Terminées"
          value={stats.commandesTerminees}
          icon={<CheckCircle className="h-6 w-6" />}
          gradient="green"
        />
        <StatsCard
          title="En cours"
          value={stats.commandesEnCours}
          icon={<Clock className="h-6 w-6" />}
          gradient="blue"
        />
        <StatsCard
          title="En attente"
          value={stats.commandesEnAttente}
          icon={<Clock className="h-6 w-6" />}
          gradient="orange"
        />
        <StatsCard
          title="Annulées"
          value={stats.commandesAnnulees}
          icon={<XCircle className="h-6 w-6" />}
          gradient="pink"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <div className="rounded-lg bg-gradient-to-r from-amber-400 to-yellow-500 p-2">
              <CreditCard className="h-5 w-5 text-slate-900" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Dernières réservations payées</h2>
          </div>
          <PaymentTable payments={payments} onRowClick={handlePaymentClick} />
        </div>

        <div className="rounded-xl bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-gradient-to-r from-slate-600 to-slate-800 p-2">
                <Activity className="h-5 w-5 text-white" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900">Activité récente</h2>
            </div>
            <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">
              {activities.length} événement(s)
            </span>
          </div>
          <ActivityFeed activities={activities} onActivityClick={handleActivityClick} />
        </div>
      </div>

      <div className="rounded-xl bg-white p-6 shadow-sm border border-amber-100">
        <div className="flex items-center gap-3">
          <Car className="h-5 w-5 text-amber-600" />
          <p className="text-sm text-slate-600">
            Plateforme location RAVE — paiement en ligne PayZen/OSB si le loueur l&apos;a configuré, sinon paiement chez le loueur.
          </p>
        </div>
      </div>

      <CourseDetailsModal
        orderId={selectedOrderId}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
      />
    </div>
  );
}

export default AdminDashboard;
