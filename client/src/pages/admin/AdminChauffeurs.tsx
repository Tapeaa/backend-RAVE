/**
 * Tape'ā Back Office - Liste des chauffeurs
 */

import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { Car, Search, Eye, MapPin, ChevronLeft, ChevronRight, Power, Users, Plus, X, Briefcase, Building2 } from 'lucide-react';

interface Chauffeur {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  typeChauffeur: 'salarie' | 'patente';
  prestataireId: string | null;
  prestataireName: string | null;
  vehicleModel: string | null;
  vehiclePlate: string | null;
  isActive: boolean;
  createdAt: string;
}

// Fonction pour déterminer le type d'affichage du chauffeur
function getDriverTypeDisplay(chauffeur: Chauffeur) {
  // Si c'est un patenté, afficher "Patenté"
  if (chauffeur.typeChauffeur === 'patente') {
    return {
      label: 'Patenté',
      icon: Briefcase,
      className: 'bg-amber-100 text-amber-700 border border-amber-300'
    };
  }
  
  // Si c'est un salarié avec un prestataire, afficher "Salarié prestataire" ou le nom
  if (chauffeur.prestataireId) {
    return {
      label: chauffeur.prestataireName ? `Salarié ${chauffeur.prestataireName}` : 'Salarié prestataire',
      icon: Building2,
      className: 'bg-blue-100 text-blue-700 border border-blue-300'
    };
  }
  
  // Sinon c'est un salarié TAPEA (créé par l'admin, sans prestataire)
  return {
    label: 'Salarié TAPEA',
    icon: Users,
    className: 'bg-purple-100 text-purple-700 border border-purple-300'
  };
}

export function AdminChauffeurs() {
  const [chauffeurs, setChauffeurs] = useState<Chauffeur[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createdDriver, setCreatedDriver] = useState<{ code: string; password: string; name: string } | null>(null);
  
  // Formulaire de création - Seuls les salariés TAPEA peuvent être créés par l'admin
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    typeChauffeur: 'salarie' as 'salarie' | 'patente', // Toujours salarié TAPEA
    vehicleModel: '',
    vehicleColor: '',
    vehiclePlate: '',
  });

  useEffect(() => {
    fetchChauffeurs();
  }, [page]);

  async function fetchChauffeurs() {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch(`/api/admin/chauffeurs?page=${page}&limit=20`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setChauffeurs(data.chauffeurs || []);
        setTotalPages(data.totalPages || 1);
      }
    } catch (error) {
      console.error('Error fetching chauffeurs:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleToggleStatus(id: string, currentStatus: boolean) {
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch(`/api/admin/chauffeurs/${id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isActive: !currentStatus }),
      });
      if (response.ok) {
        await fetchChauffeurs();
      }
    } catch (error) {
      console.error('Error updating chauffeur status:', error);
    }
  }

  // Note: La fonction handleToggleType a été supprimée car seuls les salariés TAPEA sont créés par l'admin

  async function handleCreateChauffeur() {
    if (!formData.firstName || !formData.lastName || !formData.phone) {
      alert('Veuillez remplir tous les champs obligatoires (Prénom, Nom, Téléphone)');
      return;
    }

    setIsCreating(true);
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch('/api/admin/chauffeurs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        const data = await response.json();
        setCreatedDriver({
          code: data.code,
          password: data.password,
          name: `${formData.firstName} ${formData.lastName}`,
        });
        // Réinitialiser le formulaire
        setFormData({
          firstName: '',
          lastName: '',
          phone: '',
          typeChauffeur: 'salarie', // Toujours salarié TAPEA
          vehicleModel: '',
          vehicleColor: '',
          vehiclePlate: '',
        });
        // Rafraîchir la liste
        await fetchChauffeurs();
      } else {
        const error = await response.json();
        alert(error.error || 'Erreur lors de la création du chauffeur');
      }
    } catch (error) {
      console.error('Error creating chauffeur:', error);
      alert('Erreur lors de la création du chauffeur');
    } finally {
      setIsCreating(false);
    }
  }

  const filteredChauffeurs = chauffeurs.filter(
    (c) =>
      c.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.phone.includes(searchTerm) ||
      (c.vehiclePlate && c.vehiclePlate.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const activeCount = chauffeurs.filter(c => c.isActive).length;
  const patentesCount = chauffeurs.filter(c => c.typeChauffeur === 'patente').length;
  const salariesCount = chauffeurs.filter(c => c.typeChauffeur === 'salarie').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-red-500 shadow-lg shadow-orange-500/30">
            <Car className="h-7 w-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Chauffeurs</h1>
            <p className="text-slate-500">Gestion de la flotte de chauffeurs</p>
          </div>
        </div>
        <button
          onClick={() => {
            console.log('Bouton créer chauffeur cliqué');
            setShowCreateModal(true);
          }}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-purple-700 px-5 py-2.5 text-white shadow-lg shadow-purple-500/30 hover:shadow-xl transition-all"
          type="button"
        >
          <Plus className="h-5 w-5" />
          Créer un chauffeur
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl bg-white p-4 shadow-sm border border-slate-100">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-orange-100 p-2">
              <Car className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{chauffeurs.length}</p>
              <p className="text-xs text-slate-500">Total</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm border border-slate-100">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-green-100 p-2">
              <Power className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{activeCount}</p>
              <p className="text-xs text-slate-500">Actifs</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm border border-slate-100">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-amber-100 p-2">
              <Briefcase className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{patentesCount}</p>
              <p className="text-xs text-slate-500">Patentés</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm border border-slate-100">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-purple-100 p-2">
              <Users className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{salariesCount}</p>
              <p className="text-xs text-slate-500">Salariés</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Rechercher un chauffeur..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-12 pr-4 text-slate-900 placeholder-slate-400 shadow-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20 transition-all"
        />
      </div>

      {/* Vue Mobile - Cartes */}
      <div className="md:hidden space-y-3">
        {isLoading ? (
          <div className="rounded-2xl bg-white p-8 text-center shadow-sm border border-slate-100">
            <div className="inline-flex h-10 w-10 animate-spin items-center justify-center rounded-full border-4 border-orange-200 border-t-orange-600"></div>
            <p className="mt-3 text-sm text-slate-500">Chargement...</p>
          </div>
        ) : filteredChauffeurs.length === 0 ? (
          <div className="rounded-2xl bg-white p-8 text-center shadow-sm border border-slate-100">
            <Car className="mx-auto h-12 w-12 text-slate-300" />
            <p className="mt-3 text-slate-500">Aucun chauffeur trouvé</p>
          </div>
        ) : (
          filteredChauffeurs.map((chauffeur) => {
            const typeDisplay = getDriverTypeDisplay(chauffeur);
            const IconComponent = typeDisplay.icon;
            return (
              <div key={chauffeur.id} className="rounded-2xl bg-white p-4 shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-red-500 font-semibold text-white text-lg shadow-md">
                      {chauffeur.firstName[0]}
                      {chauffeur.lastName[0]}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">
                        {chauffeur.firstName} {chauffeur.lastName}
                      </p>
                      <p className="text-sm text-slate-500">{chauffeur.phone}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleToggleStatus(chauffeur.id, chauffeur.isActive)}
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors border ${
                      chauffeur.isActive
                        ? 'bg-green-100 text-green-700 border-green-200'
                        : 'bg-slate-100 text-slate-600 border-slate-200'
                    }`}
                  >
                    <Power className={`h-3 w-3 ${chauffeur.isActive ? 'text-green-600' : 'text-slate-500'}`} />
                    {chauffeur.isActive ? 'Actif' : 'Inactif'}
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${typeDisplay.className}`}
                  >
                    <IconComponent className="h-3 w-3" />
                    {typeDisplay.label}
                  </span>
                  {chauffeur.vehicleModel && (
                    <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded-full">
                      {chauffeur.vehicleModel} • {chauffeur.vehiclePlate}
                    </span>
                  )}
                </div>
                <div className="mt-3 flex items-center justify-end border-t border-slate-100 pt-3">
                  <Link
                    href={`/admin/chauffeurs/${chauffeur.id}`}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-purple-700 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:shadow-md transition-all"
                  >
                    <Eye className="h-4 w-4" />
                    Voir détails
                  </Link>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Vue Desktop - Table */}
      <div className="hidden md:block rounded-2xl bg-white shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50 text-left text-sm text-slate-600">
                <th className="px-6 py-4 font-semibold">Chauffeur</th>
                <th className="px-6 py-4 font-semibold">Type</th>
                <th className="px-6 py-4 font-semibold">Véhicule</th>
                <th className="px-6 py-4 font-semibold">Contact</th>
                <th className="px-6 py-4 font-semibold">Statut</th>
                <th className="px-6 py-4 font-semibold">Inscription</th>
                <th className="px-6 py-4 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center">
                    <div className="inline-flex h-8 w-8 animate-spin items-center justify-center rounded-full border-4 border-orange-200 border-t-orange-600"></div>
                    <p className="mt-2 text-sm text-slate-500">Chargement...</p>
                  </td>
                </tr>
              ) : filteredChauffeurs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center">
                    <Car className="mx-auto h-10 w-10 text-slate-300" />
                    <p className="mt-2 text-slate-500">Aucun chauffeur trouvé</p>
                  </td>
                </tr>
              ) : (
                filteredChauffeurs.map((chauffeur) => (
                  <tr key={chauffeur.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-red-500 font-semibold text-white text-sm shadow-sm">
                          {chauffeur.firstName[0]}
                          {chauffeur.lastName[0]}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900">
                            {chauffeur.firstName} {chauffeur.lastName}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {(() => {
                        const typeDisplay = getDriverTypeDisplay(chauffeur);
                        const IconComponent = typeDisplay.icon;
                        return (
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${typeDisplay.className}`}
                            title={typeDisplay.label}
                          >
                            <IconComponent className="h-3.5 w-3.5" />
                            <span className="max-w-[120px] truncate">{typeDisplay.label}</span>
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-medium text-slate-900">
                        {chauffeur.vehicleModel || '-'}
                      </p>
                      <p className="text-sm text-slate-500">{chauffeur.vehiclePlate || '-'}</p>
                    </td>
                    <td className="px-6 py-4 text-slate-600">{chauffeur.phone}</td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => handleToggleStatus(chauffeur.id, chauffeur.isActive)}
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors border ${
                          chauffeur.isActive
                            ? 'bg-green-100 text-green-700 border-green-200 hover:bg-green-200'
                            : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                        }`}
                      >
                        <Power className={`h-3 w-3 ${chauffeur.isActive ? 'text-green-600' : 'text-slate-500'}`} />
                        {chauffeur.isActive ? 'Actif' : 'Inactif'}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {new Date(chauffeur.createdAt).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="px-6 py-4">
                      <Link
                        href={`/admin/chauffeurs/${chauffeur.id}`}
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

      {/* Modal de création */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Créer un nouveau chauffeur</h2>
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    setCreatedDriver(null);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              {createdDriver ? (
                <div className="space-y-4">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <h3 className="font-semibold text-green-900 mb-2">✅ Chauffeur créé avec succès !</h3>
                    <p className="text-green-800 mb-4">
                      <strong>{createdDriver.name}</strong> a été créé avec les identifiants suivants :
                    </p>
                    <div className="bg-white rounded p-4 space-y-2">
                      <div>
                        <span className="font-medium text-gray-700">Code à 6 chiffres :</span>
                        <div className="mt-1 text-2xl font-bold text-purple-600">{createdDriver.code}</div>
                      </div>
                      <div>
                        <span className="font-medium text-gray-700">Mot de passe :</span>
                        <div className="mt-1 text-xl font-mono font-bold text-purple-600">{createdDriver.password}</div>
                      </div>
                    </div>
                    <p className="text-sm text-green-700 mt-4">
                      ⚠️ Notez ces identifiants, ils seront nécessaires pour la première connexion du chauffeur.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setShowCreateModal(false);
                      setCreatedDriver(null);
                    }}
                    className="w-full rounded-lg bg-purple-600 px-4 py-2 text-white hover:bg-purple-700"
                  >
                    Fermer
                  </button>
                </div>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleCreateChauffeur();
                  }}
                  className="space-y-4"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Prénom <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.firstName}
                        onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Nom <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.lastName}
                        onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Téléphone <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="tel"
                      required
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="+68912345678"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Type de chauffeur</label>
                    <div className="w-full rounded-lg border border-purple-300 bg-purple-50 px-3 py-2.5 text-purple-700 font-medium">
                      Salarié TAPEA
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Les chauffeurs créés par l'admin sont automatiquement des salariés TAPEA
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Modèle véhicule</label>
                      <input
                        type="text"
                        value={formData.vehicleModel}
                        onChange={(e) => setFormData({ ...formData, vehicleModel: e.target.value })}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Couleur</label>
                      <input
                        type="text"
                        value={formData.vehicleColor}
                        onChange={(e) => setFormData({ ...formData, vehicleColor: e.target.value })}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Plaque</label>
                      <input
                        type="text"
                        value={formData.vehiclePlate}
                        onChange={(e) => setFormData({ ...formData, vehiclePlate: e.target.value })}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col-reverse sm:flex-row gap-3 pt-4">
                    <button
                      type="button"
                      onClick={() => {
                        setShowCreateModal(false);
                        setCreatedDriver(null);
                      }}
                      className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-gray-700 hover:bg-gray-50 font-medium"
                    >
                      Annuler
                    </button>
                    <button
                      type="submit"
                      disabled={isCreating}
                      className="flex-1 rounded-lg bg-purple-600 px-4 py-2.5 text-white hover:bg-purple-700 disabled:opacity-50 font-medium"
                    >
                      {isCreating ? 'Création...' : 'Créer le chauffeur'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminChauffeurs;
