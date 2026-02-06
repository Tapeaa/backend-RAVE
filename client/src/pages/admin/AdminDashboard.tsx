/**
 * Tape'ā Back Office - Page Dashboard Admin
 * Vue d'ensemble avec statistiques et activités en temps réel
 */

import { useEffect, useState } from 'react';
import { 
  Users, Car, ClipboardList, DollarSign, 
  TrendingUp, Clock, CheckCircle, XCircle,
  CreditCard, Activity, LayoutDashboard
} from 'lucide-react';
import { StatsCard } from '@/components/admin/StatsCard';
import { ActivityFeed } from '@/components/admin/ActivityFeed';
import { PaymentTable } from '@/components/admin/PaymentTable';
import { MapTracker } from '@/components/admin/MapTracker';
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

interface OnlineChauffeur {
  id: string;
  firstName: string;
  lastName: string;
  latitude: number | null;
  longitude: number | null;
  vehicleModel?: string | null;
  vehiclePlate?: string | null;
}

export function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activities, setActivities] = useState<StripeActivity[]>([]);
  const [payments, setPayments] = useState<StripePayment[]>([]);
  const [onlineChauffeurs, setOnlineChauffeurs] = useState<OnlineChauffeur[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

  const handlePaymentClick = (paymentId: string) => {
    window.location.href = `/admin/commandes/${paymentId}`;
  };

  const handleActivityClick = (activity: StripeActivity) => {
    if (activity.eventType === 'order_in_progress' || activity.eventType === 'advance_booking') {
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
    const interval = setInterval(fetchRealTimeData, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, []);

  async function fetchDashboardData() {
    try {
      const token = localStorage.getItem('admin_token');
      const [statsRes, paymentsRes, activitiesRes, chauffeursRes] = await Promise.all([
        fetch('/api/admin/dashboard/stats', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/admin/stripe/payments', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/admin/dashboard/activities', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/admin/chauffeurs/locations', {
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
          description: p.paymentMethod === 'card' ? 'Paiement carte' : 'Paiement espèces',
          receiptUrl: p.pdfUrl || undefined,
        })));
      }

      if (activitiesRes.ok) {
        const data = await activitiesRes.json();
        setActivities(data.activities || []);
      }

      if (chauffeursRes.ok) {
        const data = await chauffeursRes.json();
        setOnlineChauffeurs(data.chauffeurs || []);
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
      const [paymentsRes, activitiesRes, chauffeursRes] = await Promise.all([
        fetch('/api/admin/stripe/payments', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/admin/dashboard/activities', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/admin/chauffeurs/locations', {
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
          description: p.paymentMethod === 'card' ? 'Paiement carte' : 'Paiement espèces',
          receiptUrl: p.pdfUrl || undefined,
        })));
      }

      if (activitiesRes.ok) {
        const data = await activitiesRes.json();
        setActivities(data.activities || []);
      }

      if (chauffeursRes.ok) {
        const data = await chauffeursRes.json();
        setOnlineChauffeurs(data.chauffeurs || []);
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
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-purple-600 border-t-transparent" />
      </div>
    );
  }

  if (!stats) {
    return <div className="text-red-600">Erreur lors du chargement des statistiques</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-600 to-pink-600 shadow-lg shadow-purple-500/30">
          <LayoutDashboard className="h-7 w-7 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tableau de Bord</h1>
          <p className="text-slate-500">Vue d'ensemble et supervision du système Tape'ā</p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Revenus totaux"
          value={formatCurrency(stats.revenusTotaux)}
          icon={<TrendingUp className="h-6 w-6" />}
          gradient="purple"
        />
        <StatsCard
          title="Total commandes"
          value={stats.totalCommandes}
          icon={<ClipboardList className="h-6 w-6" />}
          gradient="green"
        />
        <StatsCard
          title="Clients inscrits"
          value={stats.totalClients}
          icon={<Users className="h-6 w-6" />}
          gradient="blue"
        />
        <StatsCard
          title="Chauffeurs actifs"
          value={stats.chauffeursActifs}
          icon={<Car className="h-6 w-6" />}
          gradient="orange"
          subtitle={`${stats.chauffeursEnLigne || 0} en ligne`}
        />
      </div>

      {/* Second Row Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Commandes terminées"
          value={stats.commandesTerminees}
          icon={<CheckCircle className="h-6 w-6" />}
          gradient="green"
        />
        <StatsCard
          title="Commandes en cours"
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

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Commandes terminées */}
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <div className="rounded-lg bg-gradient-to-r from-purple-500 to-purple-700 p-2">
              <CreditCard className="h-5 w-5 text-white" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Commandes terminées</h2>
          </div>
          <PaymentTable payments={payments} onRowClick={handlePaymentClick} />
        </div>

        {/* Client Activities */}
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-gradient-to-r from-blue-500 to-blue-700 p-2">
                <Activity className="h-5 w-5 text-white" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900">Activités en direct</h2>
            </div>
            <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700">
              {activities.length} activité(s)
            </span>
          </div>
          <ActivityFeed activities={activities} onActivityClick={handleActivityClick} />
        </div>
      </div>

      {/* Map */}
      {googleMapsApiKey && (
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <div className="rounded-lg bg-gradient-to-r from-green-500 to-green-700 p-2">
              <Car className="h-5 w-5 text-white" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Chauffeurs en ligne</h2>
          </div>
          <MapTracker
            chauffeurs={onlineChauffeurs}
            apiKey={googleMapsApiKey}
            heightClass="h-[420px]"
          />
        </div>
      )}

      {/* Modal de détails de course */}
      <CourseDetailsModal
        orderId={selectedOrderId}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
      />
    </div>
  );
}

export default AdminDashboard;
