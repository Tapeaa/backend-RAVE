/**
 * Tape'ā Back Office - Page Commandes
 * Liste de toutes les commandes avec tri et filtres
 */

import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { 
  ClipboardList, Search, Eye, Filter, 
  ChevronLeft, ChevronRight, ArrowUpDown,
  Calendar, DollarSign, CreditCard, Wallet
} from 'lucide-react';

interface Commande {
  id: string;
  clientId: string | null;
  clientName: string;
  clientPhone: string;
  addresses: any;
  rideOption: any;
  totalPrice: number;
  driverEarnings: number;
  paymentMethod: string;
  status: string;
  assignedDriverId: string | null;
  createdAt: string;
  scheduledTime: string | null;
  isAdvanceBooking: boolean;
}

type SortField = 'date' | 'prix' | 'statut' | 'paiement';
type SortOrder = 'asc' | 'desc';

export function AdminCommandes() {
  const [commandes, setCommandes] = useState<Commande[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  useEffect(() => {
    fetchCommandes();
  }, [page, statusFilter]);

  async function fetchCommandes() {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('admin_token');
      let url = `/api/admin/commandes?page=${page}&limit=20`;
      if (statusFilter) url += `&status=${statusFilter}`;
      
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setCommandes(data.commandes || []);
        setTotalPages(data.totalPages || 1);
      }
    } catch (error) {
      console.error('Error fetching commandes:', error);
    } finally {
      setIsLoading(false);
    }
  }

  function getStatusBadge(status: string) {
    const statusConfig: Record<string, { label: string; color: string }> = {
      pending: { label: 'En attente', color: 'bg-amber-100 text-amber-700 border-amber-200' },
      accepted: { label: 'Acceptée', color: 'bg-blue-100 text-blue-700 border-blue-200' },
      driver_enroute: { label: 'Chauffeur en route', color: 'bg-purple-100 text-purple-700 border-purple-200' },
      driver_arrived: { label: 'Chauffeur arrivé', color: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
      in_progress: { label: 'En cours', color: 'bg-orange-100 text-orange-700 border-orange-200' },
      completed: { label: 'Terminée', color: 'bg-green-100 text-green-700 border-green-200' },
      payment_pending: { label: 'Paiement en attente', color: 'bg-amber-100 text-amber-700 border-amber-200' },
      payment_confirmed: { label: 'Paiement confirmé', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
      cancelled: { label: 'Annulée', color: 'bg-red-100 text-red-700 border-red-200' },
    };
    const config = statusConfig[status] || { label: status, color: 'bg-slate-100 text-slate-700 border-slate-200' };
    return (
      <span className={`rounded-full px-2.5 py-1 text-xs font-medium border ${config.color}`}>
        {config.label}
      </span>
    );
  }

  function formatCurrency(amount: number): string {
    return amount.toLocaleString('fr-FR') + ' XPF';
  }

  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  // Filtrage et tri
  let filteredCommandes = commandes.filter((c) => {
    const matchesSearch = 
      c.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.clientPhone.includes(searchTerm) ||
      c.id.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesPayment = !paymentFilter || c.paymentMethod === paymentFilter;
    
    return matchesSearch && matchesPayment;
  });

  // Tri
  filteredCommandes.sort((a, b) => {
    let aValue: any;
    let bValue: any;

    switch (sortField) {
      case 'date':
        aValue = new Date(a.createdAt).getTime();
        bValue = new Date(b.createdAt).getTime();
        break;
      case 'prix':
        aValue = a.totalPrice;
        bValue = b.totalPrice;
        break;
      case 'statut':
        aValue = a.status;
        bValue = b.status;
        break;
      case 'paiement':
        aValue = a.paymentMethod;
        bValue = b.paymentMethod;
        break;
      default:
        return 0;
    }

    if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6 w-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 shadow-lg shadow-green-500/30">
          <ClipboardList className="h-6 w-6 sm:h-7 sm:w-7 text-white" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Commandes</h1>
          <p className="text-sm sm:text-base text-slate-500">Gestion de toutes les courses</p>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Rechercher par client, téléphone, ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-12 pr-4 text-slate-900 placeholder-slate-400 shadow-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20 transition-all"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="flex-1 min-w-[140px] rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
          >
            <option value="">Tous les statuts</option>
            <option value="pending">En attente</option>
            <option value="accepted">Acceptée</option>
            <option value="in_progress">En cours</option>
            <option value="completed">Terminée</option>
            <option value="payment_confirmed">Paiement confirmé</option>
            <option value="cancelled">Annulée</option>
          </select>
          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
            className="flex-1 min-w-[140px] rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
          >
            <option value="">Tous les paiements</option>
            <option value="cash">Espèces</option>
            <option value="card">Carte</option>
          </select>
        </div>
      </div>

      {/* Vue Mobile - Cartes */}
      <div className="md:hidden space-y-3 w-full overflow-hidden">
        {isLoading ? (
          <div className="rounded-2xl bg-white p-8 text-center shadow-sm border border-slate-100">
            <div className="inline-flex h-10 w-10 animate-spin items-center justify-center rounded-full border-4 border-green-200 border-t-green-600"></div>
            <p className="mt-3 text-sm text-slate-500">Chargement des commandes...</p>
          </div>
        ) : filteredCommandes.length === 0 ? (
          <div className="rounded-2xl bg-white p-8 text-center shadow-sm border border-slate-100">
            <ClipboardList className="mx-auto h-12 w-12 text-slate-300" />
            <p className="mt-3 text-slate-500">Aucune commande trouvée</p>
          </div>
        ) : (
          filteredCommandes.map((commande) => {
            const addressesArray = Array.isArray(commande.addresses) ? commande.addresses : [];
            const pickupAddr = addressesArray.find((a: any) => a.type === 'pickup');
            const destinationAddr = addressesArray.find((a: any) => a.type === 'destination');
            const dropoffAddr = destinationAddr || addressesArray[addressesArray.length - 1];
            const shortDate = new Date(commande.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
            
            return (
              <Link
                key={commande.id}
                href={`/admin/commandes/${commande.id}`}
                className="block rounded-2xl bg-white p-4 shadow-sm border border-slate-100 hover:shadow-md transition-all overflow-hidden"
              >
                {/* Ligne 1: Client + Prix */}
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="font-semibold text-slate-900 truncate flex-1">{commande.clientName}</p>
                  <p className="font-bold text-green-600 whitespace-nowrap">{commande.totalPrice.toLocaleString()} XPF</p>
                </div>
                
                {/* Ligne 2: Téléphone + Paiement */}
                <div className="flex items-center justify-between text-xs text-slate-500 mb-3">
                  <span>{commande.clientPhone}</span>
                  <span className="flex items-center gap-1 bg-slate-100 px-2 py-1 rounded-full">
                    {commande.paymentMethod === 'card' ? <CreditCard className="h-3 w-3" /> : <Wallet className="h-3 w-3" />}
                    {commande.paymentMethod === 'card' ? 'Carte' : 'Espèces'}
                  </span>
                </div>
                
                {/* Adresses */}
                <div className="bg-slate-50 rounded-xl p-3 mb-3 text-xs overflow-hidden border border-slate-100">
                  <p className="text-slate-700 truncate mb-1">
                    <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-2"></span> {pickupAddr?.value || 'Non spécifié'}
                  </p>
                  <p className="text-slate-700 truncate">
                    <span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-2"></span> {dropoffAddr?.value || 'Non spécifié'}
                  </p>
                </div>
                
                {/* Statut + Date */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                    {getStatusBadge(commande.status)}
                    {commande.isAdvanceBooking && (
                      <span className="rounded-full bg-blue-100 border border-blue-200 px-2 py-0.5 text-xs font-medium text-blue-700">Résa</span>
                    )}
                  </div>
                  <span className="text-xs text-slate-400 whitespace-nowrap">{shortDate}</span>
                </div>
              </Link>
            );
          })
        )}
      </div>

      {/* Vue Desktop - Table */}
      <div className="hidden md:block rounded-2xl bg-white shadow-sm border border-slate-100">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50 text-left text-sm text-slate-600">
                <th className="px-5 py-4 font-semibold">
                  <button
                    onClick={() => handleSort('date')}
                    className="flex items-center gap-1.5 hover:text-slate-900 transition-colors"
                  >
                    <Calendar className="h-4 w-4" />
                    Date
                    {sortField === 'date' && (
                      <ArrowUpDown className={`h-3 w-3 ${sortOrder === 'asc' ? 'rotate-180' : ''}`} />
                    )}
                  </button>
                </th>
                <th className="px-5 py-4 font-semibold">Client</th>
                <th className="px-5 py-4 font-semibold">Trajet</th>
                <th className="px-5 py-4 font-semibold">
                  <button
                    onClick={() => handleSort('prix')}
                    className="flex items-center gap-1.5 hover:text-slate-900 transition-colors"
                  >
                    <DollarSign className="h-4 w-4" />
                    Prix
                    {sortField === 'prix' && (
                      <ArrowUpDown className={`h-3 w-3 ${sortOrder === 'asc' ? 'rotate-180' : ''}`} />
                    )}
                  </button>
                </th>
                <th className="px-5 py-4 font-semibold">
                  <button
                    onClick={() => handleSort('statut')}
                    className="flex items-center gap-1.5 hover:text-slate-900 transition-colors"
                  >
                    Statut
                    {sortField === 'statut' && (
                      <ArrowUpDown className={`h-3 w-3 ${sortOrder === 'asc' ? 'rotate-180' : ''}`} />
                    )}
                  </button>
                </th>
                <th className="px-5 py-4 font-semibold">
                  <button
                    onClick={() => handleSort('paiement')}
                    className="flex items-center gap-1.5 hover:text-slate-900 transition-colors"
                  >
                    <CreditCard className="h-4 w-4" />
                    Paiement
                    {sortField === 'paiement' && (
                      <ArrowUpDown className={`h-3 w-3 ${sortOrder === 'asc' ? 'rotate-180' : ''}`} />
                    )}
                  </button>
                </th>
                <th className="px-5 py-4 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center">
                    <div className="inline-flex h-8 w-8 animate-spin items-center justify-center rounded-full border-4 border-green-200 border-t-green-600"></div>
                  </td>
                </tr>
              ) : filteredCommandes.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-slate-500">
                    <ClipboardList className="mx-auto h-10 w-10 text-slate-300 mb-2" />
                    Aucune commande trouvée
                  </td>
                </tr>
              ) : (
                filteredCommandes.map((commande) => {
                  // Les adresses sont un tableau avec type: 'pickup' | 'stop' | 'destination'
                  const addressesArray = Array.isArray(commande.addresses) ? commande.addresses : [];
                  const pickupAddr = addressesArray.find((a: any) => a.type === 'pickup');
                  const destinationAddr = addressesArray.find((a: any) => a.type === 'destination');
                  // S'il n'y a pas de destination explicite, prendre le dernier élément (stop ou autre)
                  const dropoffAddr = destinationAddr || addressesArray[addressesArray.length - 1];
                  
                  return (
                    <tr key={commande.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="text-sm">
                          <p className="font-medium text-gray-900">
                            {formatDate(commande.createdAt)}
                          </p>
                          {commande.isAdvanceBooking && (
                            <p className="text-xs text-blue-600">Réservation</p>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-medium text-gray-900">{commande.clientName}</p>
                          <p className="text-sm text-gray-500">{commande.clientPhone}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm">
                          <p className="text-gray-900">
                            {pickupAddr?.value || 'Non spécifié'}
                          </p>
                          <p className="text-gray-500">→ {dropoffAddr?.value || 'Non spécifié'}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-semibold text-gray-900">
                          {formatCurrency(commande.totalPrice)}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        {getStatusBadge(commande.status)}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {commande.paymentMethod === 'card' ? (
                            <CreditCard className="h-4 w-4 text-purple-600" />
                          ) : (
                            <Wallet className="h-4 w-4 text-green-600" />
                          )}
                          <span className="text-sm text-gray-600">
                            {commande.paymentMethod === 'card' ? 'Carte' : 'Espèces'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <Link
                          href={`/admin/commandes/${commande.id}`}
                          className="inline-flex items-center gap-1 rounded-lg bg-purple-600 px-3 py-1.5 text-sm text-white hover:bg-purple-700"
                        >
                          <Eye className="h-4 w-4" />
                          Voir
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Desktop */}
        {totalPages > 1 && (
          <div className="hidden md:flex items-center justify-between border-t px-6 py-4">
            <p className="text-sm text-gray-500">
              Page {page} sur {totalPages}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="flex items-center gap-1 rounded-lg border px-3 py-1 text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                <ChevronLeft className="h-4 w-4" />
                Précédent
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="flex items-center gap-1 rounded-lg border px-3 py-1 text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                Suivant
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Pagination Mobile */}
      {totalPages > 1 && (
        <div className="md:hidden flex items-center justify-between rounded-xl bg-white p-4 shadow-sm">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="flex items-center gap-1 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
          >
            <ChevronLeft className="h-4 w-4" />
            Préc.
          </button>
          <span className="text-sm font-medium text-gray-700">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="flex items-center gap-1 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
          >
            Suiv.
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

export default AdminCommandes;
