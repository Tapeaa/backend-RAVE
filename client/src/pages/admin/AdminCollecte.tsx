/**
 * Tape'a Back Office - Page Collecte de Frais
 * Gestion des commissions dues à TAPEA
 */

import { useEffect, useState } from 'react';
import { Wallet, Check, Clock, Building2, User, Search, Filter, RefreshCw, Eye } from 'lucide-react';
import { Link } from 'wouter';

interface Collecte {
  id: string;
  periode: string;
  montantDu: number;
  montantPaye: number;
  isPaid: boolean;
  paidAt: string | null;
  markedByAdminAt: string | null;
  createdAt: string;
  prestataire: {
    id: string;
    nom: string;
    type: string;
  } | null;
  driver: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
}

export function AdminCollecte() {
  const [collectes, setCollectes] = useState<Collecte[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'paid' | 'partial'>('all');

  useEffect(() => {
    fetchCollectes();
  }, []);

  async function recalculateCollectes() {
    if (!confirm('Recalculer les commissions à partir de toutes les courses terminées ?')) return;
    
    setIsRecalculating(true);
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch('/api/admin/collecte/recalculate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (response.ok) {
        const data = await response.json();
        alert(data.message);
        await fetchCollectes();
      } else {
        alert('Erreur lors du recalcul');
      }
    } catch (error) {
      console.error('Error recalculating:', error);
      alert('Erreur de connexion');
    } finally {
      setIsRecalculating(false);
    }
  }

  async function fetchCollectes() {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch('/api/admin/collecte', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setCollectes(data.collectes || []);
      }
    } catch (error) {
      console.error('Error fetching collectes:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function markAsPaid(id: string, montantDu: number) {
    if (!confirm('Marquer cette collecte comme payée ?')) return;

    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch(`/api/admin/collecte/${id}/paid`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ montantPaye: montantDu }),
      });

      if (response.ok) {
        await fetchCollectes();
      } else {
        alert('Erreur lors de la mise à jour');
      }
    } catch (error) {
      console.error('Error marking as paid:', error);
      alert('Erreur de connexion');
    }
  }

  const filteredCollectes = collectes.filter(c => {
    const matchesSearch = 
      c.prestataire?.nom.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.driver?.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.driver?.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.periode.includes(searchTerm);
    
    const matchesFilter = 
      filterStatus === 'all' ||
      (filterStatus === 'pending' && !c.isPaid && (c.montantPaye || 0) === 0) ||
      (filterStatus === 'partial' && !c.isPaid && (c.montantPaye || 0) > 0) ||
      (filterStatus === 'paid' && c.isPaid);

    return matchesSearch && matchesFilter;
  });

  const totalRestantApayer = collectes
    .filter(c => !c.isPaid)
    .reduce((sum, c) => sum + Math.max(0, (c.montantDu || 0) - (c.montantPaye || 0)), 0);
  const totalPaye = collectes.reduce((sum, c) => sum + (c.montantPaye || 0), 0);
  const totalPartiel = collectes.filter(c => !c.isPaid && (c.montantPaye || 0) > 0).length;

  const formatPeriode = (periode: string) => {
    const [year, month] = periode.split('-');
    const months = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 
                    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
    return `${months[parseInt(month) - 1]} ${year}`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg shadow-violet-500/30">
            <Wallet className="h-7 w-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Collecte de frais</h1>
            <p className="text-slate-500">Gestion des commissions dues à TAPEA</p>
          </div>
        </div>
        <button
          onClick={recalculateCollectes}
          disabled={isRecalculating}
          className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-purple-700 px-5 py-2.5 text-white shadow-lg shadow-purple-500/30 hover:shadow-xl transition-all disabled:opacity-50 w-full sm:w-auto"
        >
          <RefreshCw className={`h-5 w-5 ${isRecalculating ? 'animate-spin' : ''}`} />
          {isRecalculating ? 'Recalcul...' : 'Recalculer'}
        </button>
      </div>

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
              <div className="text-sm text-gray-600">Restant à percevoir</div>
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
              <div className="text-sm text-gray-600">Collecté</div>
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
              <div className="text-sm text-gray-600">Total entrées</div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Rechercher par nom ou période..."
            className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 focus:border-purple-500 focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-5 w-5 text-gray-400" />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as 'all' | 'pending' | 'paid')}
            className="rounded-lg border border-gray-300 px-3 py-2 focus:border-purple-500 focus:outline-none"
          >
            <option value="all">Tous</option>
            <option value="pending">En attente</option>
            <option value="partial">Partiels ({totalPartiel})</option>
            <option value="paid">Payés</option>
          </select>
        </div>
      </div>

      {/* Vue Mobile - Cartes */}
      <div className="md:hidden space-y-3">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center rounded-xl bg-white shadow">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-purple-600 border-t-transparent" />
          </div>
        ) : filteredCollectes.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center rounded-xl bg-white text-gray-500 shadow">
            <Wallet className="mb-2 h-12 w-12" />
            <p>Aucune collecte trouvée</p>
          </div>
        ) : (
          filteredCollectes.map((collecte) => (
            <div key={collecte.id} className="rounded-xl bg-white p-4 shadow">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div>
                  {collecte.prestataire ? (
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-gray-400" />
                      <span className="font-semibold text-gray-900">{collecte.prestataire.nom}</span>
                    </div>
                  ) : collecte.driver ? (
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-gray-400" />
                      <span className="font-semibold text-gray-900">{collecte.driver.firstName} {collecte.driver.lastName}</span>
                    </div>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                  <p className="text-sm text-gray-500">{formatPeriode(collecte.periode)}</p>
                </div>
                {collecte.isPaid ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                    <Check className="h-3 w-3" />
                    Payé
                  </span>
                ) : (collecte.montantPaye || 0) > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-800">
                    Partiel
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-1 text-xs font-medium text-orange-800">
                    <Clock className="h-3 w-3" />
                    En attente
                  </span>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2 mb-3 p-2 bg-gray-50 rounded-lg text-center">
                <div>
                  <p className="text-xs text-gray-500">Total dû</p>
                  <p className="font-bold text-gray-900">{collecte.montantDu.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Payé</p>
                  <p className="font-medium text-green-600">{(collecte.montantPaye || 0).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Restant</p>
                  <p className="font-medium text-orange-600">{Math.max(0, (collecte.montantDu || 0) - (collecte.montantPaye || 0)).toLocaleString()}</p>
                </div>
              </div>

              <div className="flex items-center justify-between border-t pt-3">
                <Link href={`/admin/collecte/${collecte.id}`}>
                  <button className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">
                    <Eye className="h-4 w-4" />
                    Détails
                  </button>
                </Link>
                {!collecte.isPaid && (
                  <button
                    onClick={() => markAsPaid(collecte.id, collecte.montantDu)}
                    className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
                  >
                    {(collecte.montantPaye || 0) > 0 ? 'Soldé' : 'Payé'}
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Vue Desktop - Table */}
      <div className="hidden md:block overflow-hidden rounded-lg bg-white shadow">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-purple-600 border-t-transparent" />
          </div>
        ) : filteredCollectes.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center text-gray-500">
            <Wallet className="mb-2 h-12 w-12" />
            <p>Aucune collecte trouvée</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Prestataire / Chauffeur</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Période</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">Total dû</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">Déjà payé</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">Restant</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">Statut</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredCollectes.map((collecte) => (
                <tr key={collecte.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    {collecte.prestataire ? (
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-gray-400" />
                        <span className="font-medium">{collecte.prestataire.nom}</span>
                      </div>
                    ) : collecte.driver ? (
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-gray-400" />
                        <span>{collecte.driver.firstName} {collecte.driver.lastName}</span>
                      </div>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-gray-900">{formatPeriode(collecte.periode)}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-bold text-gray-900">
                      {collecte.montantDu.toLocaleString()} XPF
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-green-600">
                      {(collecte.montantPaye || 0).toLocaleString()} XPF
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-medium text-orange-600">
                      {Math.max(0, (collecte.montantDu || 0) - (collecte.montantPaye || 0)).toLocaleString()} XPF
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {collecte.isPaid ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                        <Check className="h-3 w-3" />
                        Payé
                      </span>
                    ) : (collecte.montantPaye || 0) > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                        <Check className="h-3 w-3" />
                        Partiel
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-1 text-xs font-medium text-orange-800">
                        <Clock className="h-3 w-3" />
                        En attente
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link href={`/admin/collecte/${collecte.id}`}>
                        <button className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 hover:text-purple-600">
                          <Eye className="h-4 w-4" />
                        </button>
                      </Link>
                      {!collecte.isPaid && (
                        <button
                          onClick={() => markAsPaid(collecte.id, collecte.montantDu)}
                          className="rounded-lg bg-green-600 px-3 py-1 text-sm font-medium text-white hover:bg-green-700"
                        >
                          {(collecte.montantPaye || 0) > 0 ? 'Soldé (virement)' : 'Marquer payé'}
                        </button>
                      )}
                      {collecte.isPaid && collecte.paidAt && (
                        <span className="text-xs text-gray-500">
                          {new Date(collecte.paidAt).toLocaleDateString('fr-FR')}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
