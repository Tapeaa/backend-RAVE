/**
 * Tape'ā Back Office - Page Clients
 * Liste et gestion des clients
 */

import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { Users, Search, Eye, CreditCard, ChevronLeft, ChevronRight, UserCheck, UserX, Wallet } from 'lucide-react';

interface Client {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string;
  isVerified: boolean;
  walletBalance: number;
  createdAt: string;
}

export function AdminClients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalClients, setTotalClients] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchClients();
  }, [page]);

  async function fetchClients() {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch(`/api/admin/clients?page=${page}&limit=20`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setClients(data.clients || []);
        setTotalPages(data.totalPages || 1);
        setTotalClients(data.total || data.clients?.length || 0);
      }
    } catch (error) {
      console.error('Error fetching clients:', error);
    } finally {
      setIsLoading(false);
    }
  }

  const filteredClients = clients.filter(
    (c) =>
      c.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.email && c.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
      c.phone.includes(searchTerm)
  );

  const verifiedCount = clients.filter(c => c.isVerified).length;
  const totalWalletBalance = clients.reduce((sum, c) => sum + (c.walletBalance || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 shadow-lg shadow-purple-500/30">
            <Users className="h-7 w-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Clients</h1>
            <p className="text-slate-500">Gestion des clients inscrits</p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl bg-white p-4 shadow-sm border border-slate-100">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-purple-100 p-2">
              <Users className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{totalClients}</p>
              <p className="text-xs text-slate-500">Total clients</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm border border-slate-100">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-green-100 p-2">
              <UserCheck className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{verifiedCount}</p>
              <p className="text-xs text-slate-500">Vérifiés</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm border border-slate-100">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-orange-100 p-2">
              <UserX className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{clients.length - verifiedCount}</p>
              <p className="text-xs text-slate-500">Non vérifiés</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm border border-slate-100">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-100 p-2">
              <Wallet className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-lg font-bold text-slate-900">{totalWalletBalance.toLocaleString()}</p>
              <p className="text-xs text-slate-500">Solde total XPF</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Rechercher un client..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-12 pr-4 text-slate-900 placeholder-slate-400 shadow-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20 transition-all"
        />
      </div>

      {/* Vue Mobile - Cartes */}
      <div className="md:hidden space-y-3">
        {isLoading ? (
          <div className="rounded-2xl bg-white p-8 text-center shadow-sm border border-slate-100">
            <div className="inline-flex h-10 w-10 animate-spin items-center justify-center rounded-full border-4 border-purple-200 border-t-purple-600"></div>
            <p className="mt-3 text-sm text-slate-500">Chargement...</p>
          </div>
        ) : filteredClients.length === 0 ? (
          <div className="rounded-2xl bg-white p-8 text-center shadow-sm border border-slate-100">
            <Users className="mx-auto h-12 w-12 text-slate-300" />
            <p className="mt-3 text-slate-500">Aucun client trouvé</p>
          </div>
        ) : (
          filteredClients.map((client) => (
            <div key={client.id} className="rounded-2xl bg-white p-4 shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 font-semibold text-white text-lg shadow-md">
                    {client.firstName[0]}
                    {client.lastName[0]}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">
                      {client.firstName} {client.lastName}
                    </p>
                    <p className="text-sm text-slate-500">{client.phone}</p>
                  </div>
                </div>
                {client.isVerified ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700 border border-green-200">
                    <UserCheck className="h-3 w-3" />
                    Vérifié
                  </span>
                ) : (
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 border border-slate-200">
                    Non vérifié
                  </span>
                )}
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                <div className="space-y-0.5">
                  <p className="text-xs text-slate-500">Portefeuille</p>
                  <p className="font-bold text-slate-900">{client.walletBalance.toLocaleString('fr-FR')} XPF</p>
                </div>
                <Link
                  href={`/admin/clients/${client.id}`}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-purple-700 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:shadow-md transition-all"
                >
                  <Eye className="h-4 w-4" />
                  Voir
                </Link>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Vue Desktop - Table */}
      <div className="hidden md:block rounded-2xl bg-white shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50 text-left text-sm text-slate-600">
                <th className="px-6 py-4 font-semibold">Client</th>
                <th className="px-6 py-4 font-semibold">Contact</th>
                <th className="px-6 py-4 font-semibold">Statut</th>
                <th className="px-6 py-4 font-semibold">Portefeuille</th>
                <th className="px-6 py-4 font-semibold">Inscription</th>
                <th className="px-6 py-4 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <div className="inline-flex h-8 w-8 animate-spin items-center justify-center rounded-full border-4 border-purple-200 border-t-purple-600"></div>
                    <p className="mt-2 text-sm text-slate-500">Chargement...</p>
                  </td>
                </tr>
              ) : filteredClients.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <Users className="mx-auto h-10 w-10 text-slate-300" />
                    <p className="mt-2 text-slate-500">Aucun client trouvé</p>
                  </td>
                </tr>
              ) : (
                filteredClients.map((client) => (
                  <tr key={client.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 font-semibold text-white text-sm shadow-sm">
                          {client.firstName[0]}
                          {client.lastName[0]}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900">
                            {client.firstName} {client.lastName}
                          </p>
                          <p className="text-sm text-slate-500">{client.email || '-'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-600">{client.phone}</td>
                    <td className="px-6 py-4">
                      {client.isVerified ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700 border border-green-200">
                          <UserCheck className="h-3 w-3" />
                          Vérifié
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 border border-slate-200">
                          Non vérifié
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-semibold text-slate-900">
                        {client.walletBalance.toLocaleString('fr-FR')} XPF
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {new Date(client.createdAt).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="px-6 py-4">
                      <Link
                        href={`/admin/clients/${client.id}`}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-purple-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:shadow-md transition-all"
                      >
                        <Eye className="h-4 w-4" />
                        Voir
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4 bg-slate-50/30">
            <p className="text-sm text-slate-500">
              Page <span className="font-semibold text-slate-700">{page}</span> sur <span className="font-semibold text-slate-700">{totalPages}</span>
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
                Précédent
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
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
        <div className="md:hidden flex items-center justify-between rounded-2xl bg-white p-4 shadow-sm border border-slate-100">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="flex items-center gap-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <ChevronLeft className="h-4 w-4" />
            Préc.
          </button>
          <span className="text-sm font-medium text-slate-700">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="flex items-center gap-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Suiv.
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

export default AdminClients;
