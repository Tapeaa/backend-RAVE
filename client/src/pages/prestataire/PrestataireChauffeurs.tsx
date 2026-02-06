/**
 * Tape'a Back Office - Gestion des Chauffeurs (Prestataire)
 * Pour les sociétés uniquement
 */

import { useEffect, useState } from 'react';
import { Users, Plus, X, Copy, Check, Car, Phone, Power, Edit, Percent } from 'lucide-react';

interface Chauffeur {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  code: string;
  typeChauffeur: 'salarie' | 'patente';
  vehicleModel: string | null;
  vehicleColor: string | null;
  vehiclePlate: string | null;
  isActive: boolean;
  averageRating: number | null;
  totalRides: number;
  commissionChauffeur?: number; // % que le chauffeur garde
  createdAt: string;
}

export function PrestataireChauffeurs() {
  const [chauffeurs, setChauffeurs] = useState<Chauffeur[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createdChauffeur, setCreatedChauffeur] = useState<{ code: string; nom: string } | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [editingCommission, setEditingCommission] = useState<Chauffeur | null>(null);
  const [commissionValue, setCommissionValue] = useState(95);

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    typeChauffeur: 'salarie' as 'salarie' | 'patente',
    vehicleModel: '',
    vehicleColor: '',
    vehiclePlate: '',
    commissionChauffeur: 95, // Par défaut 95%
  });

  useEffect(() => {
    fetchChauffeurs();
  }, []);

  async function fetchChauffeurs() {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch('/api/prestataire/chauffeurs', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setChauffeurs(data.chauffeurs || []);
      }
    } catch (error) {
      console.error('Error fetching chauffeurs:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setIsCreating(true);

    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch('/api/prestataire/chauffeurs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setCreatedChauffeur({ 
          code: data.code, 
          nom: `${data.chauffeur.firstName} ${data.chauffeur.lastName}` 
        });
        await fetchChauffeurs();
        setFormData({
          firstName: '',
          lastName: '',
          phone: '',
          typeChauffeur: 'salarie',
          vehicleModel: '',
          vehicleColor: '',
          vehiclePlate: '',
          commissionChauffeur: 95,
        });
      } else {
        alert(data.error || 'Erreur lors de la création');
      }
    } catch (error) {
      console.error('Error creating chauffeur:', error);
      alert('Erreur de connexion');
    } finally {
      setIsCreating(false);
    }
  }

  async function toggleStatus(id: string, currentStatus: boolean) {
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch(`/api/prestataire/chauffeurs/${id}`, {
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
      console.error('Error toggling status:', error);
    }
  }

  function openCommissionModal(chauffeur: Chauffeur) {
    setEditingCommission(chauffeur);
    setCommissionValue(chauffeur.commissionChauffeur || 95);
  }

  async function handleUpdateCommission(e: React.FormEvent) {
    e.preventDefault();
    if (!editingCommission) return;

    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch(`/api/prestataire/chauffeurs/${editingCommission.id}/commission`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ commissionChauffeur: commissionValue }),
      });

      if (response.ok) {
        await fetchChauffeurs();
        setEditingCommission(null);
      } else {
        const data = await response.json();
        alert(data.error || 'Erreur lors de la mise à jour');
      }
    } catch (error) {
      console.error('Error updating commission:', error);
      alert('Erreur lors de la mise à jour');
    }
  }

  async function deleteChauffeur(id: string) {
    if (!confirm('Supprimer ce chauffeur ?')) return;

    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch(`/api/prestataire/chauffeurs/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        await fetchChauffeurs();
      } else {
        alert('Erreur lors de la suppression');
      }
    } catch (error) {
      console.error('Error deleting chauffeur:', error);
    }
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mes chauffeurs</h1>
          <p className="text-gray-600">Gérez les chauffeurs de votre société</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-white hover:bg-purple-700"
        >
          <Plus className="h-5 w-5" />
          Nouveau chauffeur
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-2xl font-bold text-gray-900">{chauffeurs.length}</div>
          <div className="text-sm text-gray-600">Total</div>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-2xl font-bold text-green-600">
            {chauffeurs.filter(c => c.isActive).length}
          </div>
          <div className="text-sm text-gray-600">Actifs</div>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-2xl font-bold text-blue-600">
            {chauffeurs.filter(c => c.typeChauffeur === 'salarie').length}
          </div>
          <div className="text-sm text-gray-600">Salariés</div>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-2xl font-bold text-orange-600">
            {chauffeurs.filter(c => c.typeChauffeur === 'patente').length}
          </div>
          <div className="text-sm text-gray-600">Patentés</div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg bg-white shadow">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-purple-600 border-t-transparent" />
          </div>
        ) : chauffeurs.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center text-gray-500">
            <Users className="mb-2 h-12 w-12" />
            <p>Aucun chauffeur</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="mt-4 rounded-lg bg-purple-600 px-4 py-2 text-white hover:bg-purple-700"
            >
              Créer un chauffeur
            </button>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Chauffeur</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Contact</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Véhicule</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Type</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">Courses</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">Statut</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {chauffeurs.map((chauffeur) => (
                <tr key={chauffeur.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">
                      {chauffeur.firstName} {chauffeur.lastName}
                    </div>
                    <code className="text-xs text-gray-500">Code: {chauffeur.code}</code>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 text-sm text-gray-600">
                      <Phone className="h-3 w-3" />
                      {chauffeur.phone}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {chauffeur.vehicleModel ? (
                      <div className="text-sm">
                        <div className="text-gray-900">{chauffeur.vehicleModel}</div>
                        <div className="text-gray-500">{chauffeur.vehiclePlate}</div>
                      </div>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                      chauffeur.typeChauffeur === 'salarie'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-orange-100 text-orange-800'
                    }`}>
                      {chauffeur.typeChauffeur === 'salarie' ? 'Salarié' : 'Patenté'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="font-medium">{chauffeur.totalRides}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => toggleStatus(chauffeur.id, chauffeur.isActive)}
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${
                        chauffeur.isActive
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      <Power className="h-3 w-3" />
                      {chauffeur.isActive ? 'Actif' : 'Inactif'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openCommissionModal(chauffeur)}
                        className="rounded-lg p-2 text-purple-600 hover:bg-purple-50"
                        title="Modifier la commission"
                      >
                        <Percent className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => deleteChauffeur(chauffeur.id)}
                        className="rounded-lg p-2 text-red-600 hover:bg-red-50"
                      >
                        <X className="h-4 w-4" />
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
            {createdChauffeur ? (
              <>
                <div className="mb-4 text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                    <Check className="h-8 w-8 text-green-600" />
                  </div>
                  <h2 className="text-xl font-bold text-gray-900">Chauffeur créé !</h2>
                  <p className="text-gray-600">{createdChauffeur.nom}</p>
                </div>

                <div className="mb-6 rounded-lg bg-purple-50 p-4">
                  <p className="mb-2 text-center text-sm text-gray-600">
                    Code de connexion app chauffeur
                  </p>
                  <div className="flex items-center justify-center gap-2">
                    <code className="text-3xl font-bold tracking-widest text-purple-700">
                      {createdChauffeur.code}
                    </code>
                    <button
                      onClick={() => copyCode(createdChauffeur.code)}
                      className="rounded-lg p-2 text-purple-600 hover:bg-purple-100"
                    >
                      {copiedCode ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
                    </button>
                  </div>
                  <p className="mt-2 text-center text-xs text-gray-500">
                    Communiquez ce code au chauffeur pour qu'il puisse se connecter à l'app
                  </p>
                </div>

                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    setCreatedChauffeur(null);
                  }}
                  className="w-full rounded-lg bg-purple-600 py-2 font-medium text-white hover:bg-purple-700"
                >
                  Fermer
                </button>
              </>
            ) : (
              <>
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-xl font-bold text-gray-900">Nouveau chauffeur</h2>
                  <button
                    onClick={() => setShowCreateModal(false)}
                    className="rounded-lg p-2 text-gray-400 hover:bg-gray-100"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <form onSubmit={handleCreate} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Prénom *</label>
                      <input
                        type="text"
                        value={formData.firstName}
                        onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-purple-500 focus:outline-none"
                        required
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Nom *</label>
                      <input
                        type="text"
                        value={formData.lastName}
                        onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-purple-500 focus:outline-none"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Téléphone *</label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-purple-500 focus:outline-none"
                      placeholder="+68987123456"
                      required
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Type</label>
                    <select
                      value={formData.typeChauffeur}
                      onChange={(e) => setFormData({ ...formData, typeChauffeur: e.target.value as 'salarie' | 'patente' })}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-purple-500 focus:outline-none"
                    >
                      <option value="salarie">Salarié</option>
                      <option value="patente">Patenté</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Commission chauffeur : <span className="text-purple-600 font-bold">{formData.commissionChauffeur}%</span>
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={formData.commissionChauffeur}
                      onChange={(e) => setFormData({ ...formData, commissionChauffeur: Number(e.target.value) })}
                      className="w-full"
                    />
                    <div className="mt-1 flex justify-between text-xs text-gray-500">
                      <span>0% (Tout pour vous)</span>
                      <span>100% (Tout pour le chauffeur)</span>
                    </div>
                    <p className="mt-2 text-xs text-gray-600 bg-purple-50 rounded p-2">
                      Le chauffeur recevra {formData.commissionChauffeur}% du prix de chaque course (hors frais TAPEA)
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Véhicule</label>
                      <input
                        type="text"
                        value={formData.vehicleModel}
                        onChange={(e) => setFormData({ ...formData, vehicleModel: e.target.value })}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-purple-500 focus:outline-none"
                        placeholder="Toyota"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Couleur</label>
                      <input
                        type="text"
                        value={formData.vehicleColor}
                        onChange={(e) => setFormData({ ...formData, vehicleColor: e.target.value })}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-purple-500 focus:outline-none"
                        placeholder="Blanc"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Plaque</label>
                      <input
                        type="text"
                        value={formData.vehiclePlate}
                        onChange={(e) => setFormData({ ...formData, vehiclePlate: e.target.value })}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-purple-500 focus:outline-none"
                        placeholder="12345 PPT"
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
                      disabled={isCreating || !formData.firstName || !formData.lastName || !formData.phone}
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

      {/* Modal Modification Commission */}
      {editingCommission && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">
                Modifier la commission
              </h2>
              <button
                onClick={() => setEditingCommission(null)}
                className="rounded p-1 hover:bg-gray-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mb-4 rounded-lg bg-purple-50 p-3">
              <p className="font-semibold text-purple-900">
                {editingCommission.firstName} {editingCommission.lastName}
              </p>
              <p className="text-sm text-purple-700">
                Le chauffeur garde {commissionValue}% de chaque course (hors frais de service TAPEA)
              </p>
            </div>

            <form onSubmit={handleUpdateCommission} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Commission du chauffeur : <span className="text-purple-600 font-bold">{commissionValue}%</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={commissionValue}
                  onChange={(e) => setCommissionValue(Number(e.target.value))}
                  className="w-full"
                />
                <div className="mt-2 flex justify-between text-xs text-gray-500">
                  <span>0% (Tout pour vous)</span>
                  <span>50%</span>
                  <span>100% (Tout pour le chauffeur)</span>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-600">
                  <span className="font-semibold">Exemple :</span> Pour une course de 10 000 XPF (hors frais TAPEA),{' '}
                  le chauffeur reçoit{' '}
                  <span className="font-bold text-purple-600">
                    {Math.round(10000 * commissionValue / 100).toLocaleString('fr-FR')} XPF
                  </span>
                  {' '}et vous gardez{' '}
                  <span className="font-bold text-orange-600">
                    {Math.round(10000 * (100 - commissionValue) / 100).toLocaleString('fr-FR')} XPF
                  </span>
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setEditingCommission(null)}
                  className="flex-1 rounded-lg border border-gray-300 py-2 font-medium text-gray-700 hover:bg-gray-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-lg bg-purple-600 py-2 font-medium text-white hover:bg-purple-700"
                >
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
