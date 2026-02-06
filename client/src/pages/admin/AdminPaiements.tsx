/**
 * Tape'ā Back Office - Page Paiements
 * Historique des paiements Stripe
 */

import { useEffect, useState } from 'react';
import { CreditCard, Download, TrendingUp, CheckCircle } from 'lucide-react';
import { PaymentTable } from '@/components/admin/PaymentTable';
import { StatsCard } from '@/components/admin/StatsCard';

interface StripePayment {
  id: string;
  clientName?: string | null;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
  pdfUrl?: string | null;
  paymentMethod?: string;
}

export function AdminPaiements() {
  const [payments, setPayments] = useState<StripePayment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [successfulCount, setSuccessfulCount] = useState(0);

  useEffect(() => {
    fetchPayments();
    const interval = setInterval(fetchPayments, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, []);

  async function fetchPayments() {
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch('/api/admin/stripe/payments', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setPayments(data.payments || []);
        setTotalRevenue(data.totalRevenue || 0);
        setSuccessfulCount(data.successfulPayments || 0);
      }
    } catch (error) {
      console.error('Error fetching payments:', error);
    } finally {
      setIsLoading(false);
    }
  }

  function formatCurrency(amount: number): string {
    return amount.toLocaleString('fr-FR') + ' XPF';
  }

  function handleExportCSV() {
    const headers = ['ID', 'Montant', 'Devise', 'Statut', 'Date'];
    const rows = payments.map((p) => [
      p.id,
      p.amount,
      p.currency,
      p.status,
      new Date(p.createdAt).toISOString(),
    ]);

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `paiements-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 shadow-lg shadow-emerald-500/30">
            <CreditCard className="h-7 w-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Paiements</h1>
            <p className="text-slate-500">Historique des courses finalisées</p>
          </div>
        </div>
        <button
          onClick={handleExportCSV}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-purple-700 px-5 py-2.5 text-white shadow-lg shadow-purple-500/30 hover:shadow-xl transition-all"
        >
          <Download className="h-5 w-5" />
          Exporter CSV
        </button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatsCard
          title="Revenus totaux"
          value={formatCurrency(totalRevenue)}
          icon={<TrendingUp className="h-6 w-6" />}
          gradient="purple"
        />
        <StatsCard
          title="Paiements réussis"
          value={successfulCount}
          icon={<CheckCircle className="h-6 w-6" />}
          gradient="green"
        />
        <StatsCard
          title="Transactions"
          value={payments.length}
          icon={<CreditCard className="h-6 w-6" />}
          gradient="blue"
        />
      </div>

      {/* Payments Table */}
      <div className="rounded-xl bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <div className="rounded-lg bg-gradient-to-r from-purple-500 to-purple-700 p-2">
            <CreditCard className="h-5 w-5 text-white" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">Historique des commandes terminées</h2>
        </div>
        <PaymentTable 
          payments={payments.map(p => ({
            id: p.id,
            customerName: p.clientName || 'Client',
            amount: p.amount,
            currency: p.currency,
            status: p.status,
            created: new Date(p.createdAt).getTime() / 1000,
            description: p.paymentMethod === 'card' ? 'Paiement carte' : 'Paiement espèces',
            receiptUrl: p.pdfUrl || undefined,
          }))} 
          isLoading={isLoading} 
        />
      </div>
    </div>
  );
}

export default AdminPaiements;
