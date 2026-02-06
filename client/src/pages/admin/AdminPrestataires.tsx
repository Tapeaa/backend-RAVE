/**
 * Tape'a Back Office - Page Gestion des Prestataires
 * Liste et gestion des sociétés de transport et patentés
 */

import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { Building2, Search, Eye, Plus, X, Copy, Check, Users, Car, Trash2, Power } from 'lucide-react';

interface Prestataire {
  id: string;
  nom: string;
  type: 'societe_taxi' | 'societe_tourisme' | 'patente_taxi' | 'patente_tourisme';
  numeroTahiti: string | null;
  email: string | null;
  phone: string | null;
  code: string;
  isActive: boolean;
  totalChauffeurs: number;
  createdAt: string;
}

const typeLabels: Record<string, string> = {
  societe_taxi: 'Société Taxi',
  societe_tourisme: 'Société Transport Touristique',
  patente_taxi: 'Taxi Patenté',
  patente_tourisme: 'Transport Touristique Patenté',
};

const typeColors: Record<string, string> = {
  societe_taxi: 'bg-blue-100 text-blue-800',
  societe_tourisme: 'bg-green-100 text-green-800',
  patente_taxi: 'bg-orange-100 text-orange-800',
  patente_tourisme: 'bg-purple-100 text-purple-800',
};

export function AdminPrestataires() {
  const [prestataires, setPrestataires] = useState<Prestataire[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createdPrestataire, setCreatedPrestataire] = useState<{ code: string; nom: string } | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  const [formData, setFormData] = useState({
    nom: '',
    type: 'societe_taxi' as Prestataire['type'],
    numeroTahiti: '',
    email: '',
    phone: '',
  });

  useEffect(() => {
    fetchPrestataires();
  }, []);

  async function fetchPrestataires() {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch('/api/admin/prestataires', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setPrestataires(data.prestataires || []);
      }
    } catch (error) {
      console.error('Error fetching prestataires:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDelete(prestataireId: string, prestataireName: string) {
    if (!confirm(`Voulez-vous vraiment supprimer le prestataire "${prestataireName}" ?\n\nNote: Si le prestataire a des chauffeurs, il sera désactivé au lieu d'être supprimé.`)) {
      return;
    }

    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch(`/api/admin/prestataires/${prestataireId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await response.json();

      if (response.ok && data.success) {
        alert(data.message || 'Prestataire supprimé avec succès');
        await fetchPrestataires();
      } else {
        alert(data.error || 'Erreur lors de la suppression');
      }
    } catch (error) {
      console.error('Error deleting prestataire:', error);
      alert('Erreur lors de la suppression du prestataire');
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setIsCreating(true);

    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch('/api/admin/prestataires', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setCreatedPrestataire({ code: data.code, nom: data.prestataire.nom });
        await fetchPrestataires();
        setFormData({
          nom: '',
          type: 'societe_taxi',
          numeroTahiti: '',
          email: '',
          phone: '',
        });
      } else {
        alert(data.error || 'Erreur lors de la création');
      }
    } catch (error) {
      console.error('Error creating prestataire:', error);
      alert('Erreur de connexion');
    } finally {
      setIsCreating(false);
    }
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  }

  const filteredPrestataires = prestataires.filter(p =>
    p.nom.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.code.includes(searchTerm)
  );

  const isSociete = (type: string) => type === 'societe_taxi' || type === 'societe_tourisme';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 shadow-lg shadow-blue-500/30">
            <Building2 className="h-7 w-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Prestataires</h1>
            <p className="text-slate-500">Gérez les sociétés de transport et patentés</p>
          </div>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-purple-700 px-5 py-2.5 text-white shadow-lg shadow-purple-500/30 hover:shadow-xl transition-all w-full sm:w-auto"
        >
          <Plus className="h-5 w-5" />
          Nouveau prestataire
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Rechercher par nom ou code..."
          className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-12 pr-4 text-slate-900 placeholder-slate-400 shadow-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20 transition-all"
        />
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl bg-white p-4 shadow-sm border border-slate-100">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-slate-100 p-2">
              <Building2 className="h-5 w-5 text-slate-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{prestataires.length}</p>
              <p className="text-xs text-slate-500">Total</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm border border-slate-100">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-100 p-2">
              <Users className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{prestataires.filter(p => isSociete(p.type)).length}</p>
              <p className="text-xs text-slate-500">Sociétés</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm border border-slate-100">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-orange-100 p-2">
              <Car className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{prestataires.filter(p => !isSociete(p.type)).length}</p>
              <p className="text-xs text-slate-500">Patentés</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm border border-slate-100">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-green-100 p-2">
              <Check className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{prestataires.filter(p => p.isActive).length}</p>
              <p className="text-xs text-slate-500">Actifs</p>
            </div>
          </div>
        </div>
      </div>

      {/* Vue Mobile - Cartes */}
      <div className="md:hidden space-y-3">
        {isLoading ? (
          <div className="rounded-2xl bg-white p-8 text-center shadow-sm border border-slate-100">
            <div className="inline-flex h-10 w-10 animate-spin items-center justify-center rounded-full border-4 border-blue-200 border-t-blue-600"></div>
            <p className="mt-3 text-sm text-slate-500">Chargement...</p>
          </div>
        ) : filteredPrestataires.length === 0 ? (
          <div className="rounded-2xl bg-white p-8 text-center shadow-sm border border-slate-100">
            <Building2 className="mx-auto h-12 w-12 text-slate-300" />
            <p className="mt-3 text-slate-500">Aucun prestataire trouvé</p>
          </div>
        ) : (
          filteredPrestataires.map((prestataire) => (
            <div key={prestataire.id} className="rounded-2xl bg-white p-4 shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 font-semibold text-white text-sm shadow-md">
                    {prestataire.nom.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">{prestataire.nom}</p>
                    {prestataire.numeroTahiti && (
                      <p className="text-sm text-slate-500">{prestataire.numeroTahiti}</p>
                    )}
                  </div>
                </div>
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium border ${
                  prestataire.isActive ? 'bg-green-100 text-green-700 border-green-200' : 'bg-red-100 text-red-700 border-red-200'
                }`}>
                  {prestataire.isActive ? 'Actif' : 'Inactif'}
                </span>
              </div>
              
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${typeColors[prestataire.type]}`}>
                  {isSociete(prestataire.type) ? <Users className="h-3 w-3" /> : <Car className="h-3 w-3" />}
                  {typeLabels[prestataire.type]}
                </span>
                <code className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-mono text-slate-700">
                  {prestataire.code}
                </code>
                {isSociete(prestataire.type) && (
                  <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded-full">{prestataire.totalChauffeurs} chauffeurs</span>
                )}
              </div>
              
              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                <button
                  onClick={() => handleDelete(prestataire.id, prestataire.nom)}
                  className="rounded-xl p-2.5 text-slate-500 hover:bg-red-100 hover:text-red-600 transition-colors"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
                <Link href={`/admin/prestataires/${prestataire.id}`}>
                  <button className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-purple-700 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:shadow-md transition-all">
                    <Eye className="h-4 w-4" />
                    Voir
                  </button>
                </Link>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Vue Desktop - Table */}
      <div className="hidden md:block overflow-hidden rounded-2xl bg-white shadow-sm border border-slate-100">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="inline-flex h-8 w-8 animate-spin items-center justify-center rounded-full border-4 border-blue-200 border-t-blue-600"></div>
          </div>
        ) : filteredPrestataires.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center">
            <Building2 className="h-12 w-12 text-slate-300" />
            <p className="mt-3 text-slate-500">Aucun prestataire trouvé</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50 text-left text-sm text-slate-600">
                <th className="px-5 py-4 font-semibold">Nom</th>
                <th className="px-5 py-4 font-semibold">Type</th>
                <th className="px-5 py-4 font-semibold">Code</th>
                <th className="px-5 py-4 font-semibold">Chauffeurs</th>
                <th className="px-5 py-4 font-semibold">Statut</th>
                <th className="px-5 py-4 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredPrestataires.map((prestataire) => (
                <tr key={prestataire.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 font-semibold text-white text-xs shadow-sm">
                        {prestataire.nom.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-900">{prestataire.nom}</div>
                        {prestataire.numeroTahiti && (
                          <div className="text-sm text-slate-500">{prestataire.numeroTahiti}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${typeColors[prestataire.type]}`}>
                      {isSociete(prestataire.type) ? <Users className="h-3 w-3" /> : <Car className="h-3 w-3" />}
                      {typeLabels[prestataire.type]}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <code className="rounded-lg bg-slate-100 px-2.5 py-1 text-sm font-mono text-slate-700">
                      {prestataire.code}
                    </code>
                  </td>
                  <td className="px-5 py-4">
                    {isSociete(prestataire.type) ? (
                      <span className="font-semibold text-slate-900">{prestataire.totalChauffeurs}</span>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium border ${
                      prestataire.isActive 
                        ? 'bg-green-100 text-green-700 border-green-200' 
                        : 'bg-red-100 text-red-700 border-red-200'
                    }`}>
                      {prestataire.isActive ? 'Actif' : 'Inactif'}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Link href={`/admin/prestataires/${prestataire.id}`}>
                        <button className="rounded-xl p-2 text-slate-500 hover:bg-purple-100 hover:text-purple-600 transition-colors">
                          <Eye className="h-5 w-5" />
                        </button>
                      </Link>
                      <button
                        onClick={() => handleDelete(prestataire.id, prestataire.nom)}
                        className="rounded-xl p-2 text-slate-500 hover:bg-red-100 hover:text-red-600 transition-colors"
                        title="Supprimer le prestataire"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            {createdPrestataire ? (
              <>
                <div className="mb-4 text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                    <Check className="h-8 w-8 text-green-600" />
                  </div>
                  <h2 className="text-xl font-bold text-gray-900">Prestataire créé !</h2>
                  <p className="text-gray-600">{createdPrestataire.nom}</p>
                </div>

                <div className="mb-6 rounded-lg bg-purple-50 p-4">
                  <p className="mb-2 text-center text-sm text-gray-600">
                    Code de connexion dashboard
                  </p>
                  <div className="flex items-center justify-center gap-2">
                    <code className="text-3xl font-bold tracking-widest text-purple-700">
                      {createdPrestataire.code}
                    </code>
                    <button
                      onClick={() => copyCode(createdPrestataire.code)}
                      className="rounded-lg p-2 text-purple-600 hover:bg-purple-100"
                    >
                      {copiedCode ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
                    </button>
                  </div>
                  <p className="mt-2 text-center text-xs text-gray-500">
                    Communiquez ce code au prestataire pour qu'il puisse se connecter
                  </p>
                </div>

                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    setCreatedPrestataire(null);
                  }}
                  className="w-full rounded-lg bg-purple-600 py-2 font-medium text-white hover:bg-purple-700"
                >
                  Fermer
                </button>
              </>
            ) : (
              <>
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-xl font-bold text-gray-900">Nouveau prestataire</h2>
                  <button
                    onClick={() => setShowCreateModal(false)}
                    className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <form onSubmit={handleCreate} className="space-y-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Nom de l'entreprise / Patenté *
                    </label>
                    <input
                      type="text"
                      value={formData.nom}
                      onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-purple-500 focus:outline-none"
                      required
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Type *
                    </label>
                    <select
                      value={formData.type}
                      onChange={(e) => setFormData({ ...formData, type: e.target.value as Prestataire['type'] })}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-purple-500 focus:outline-none"
                    >
                      <option value="societe_taxi">Société Taxi</option>
                      <option value="societe_tourisme">Société Transport Touristique</option>
                      <option value="patente_taxi">Taxi Patenté</option>
                      <option value="patente_tourisme">Transport Touristique Patenté</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Numéro Tahiti / K-BIS
                    </label>
                    <input
                      type="text"
                      value={formData.numeroTahiti}
                      onChange={(e) => setFormData({ ...formData, numeroTahiti: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-purple-500 focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Email
                      </label>
                      <input
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-purple-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Téléphone
                      </label>
                      <input
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-purple-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowCreateModal(false)}
                      className="flex-1 rounded-lg border border-gray-300 py-2 font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Annuler
                    </button>
                    <button
                      type="submit"
                      disabled={isCreating || !formData.nom}
                      className="flex-1 rounded-lg bg-purple-600 py-2 font-medium text-white hover:bg-purple-700 disabled:opacity-50"
                    >
                      {isCreating ? 'Création...' : 'Créer'}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
