/**
 * RAVE Back Office - Page Tarifs
 * Gestion complète de tous les tarifs et suppléments
 */

import { useEffect, useState } from 'react';
import { DollarSign, Plus, Edit, Trash2, Sun, Moon, Clock, Save, X, Settings } from 'lucide-react';

interface Tarif {
  id: string;
  nom: string;
  typeTarif: string;
  prixXpf: number;
  heureDebut: string | null;
  heureFin: string | null;
  actif: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Supplement {
  id: string;
  nom: string;
  description: string | null;
  prixXpf: number;
  typeSupplement: string;
  actif: boolean;
}

interface TarifConfig {
  fraisPlateforme: number; // Pourcentage
  minimumCourseJour: number;
  minimumCourseNuit: number;
  majorationHauteurColline: number; // Pourcentage (20%)
  majorationHauteurMontagne: number; // Pourcentage (30%)
  majorationVehiculeSUV: number; // Pourcentage (15%)
  majorationVehiculeVan: number; // Pourcentage (25%)
  attenteGratuiteMinutes: number; // 5 minutes
  attenteCirculationDense: number; // 30 F/min
}

const typeLabels: Record<string, { label: string; icon: React.ReactNode; color: string; description: string }> = {
  prise_en_charge: { 
    label: 'Prise en charge', 
    icon: <Clock className="h-4 w-4" />, 
    color: 'bg-blue-100 text-blue-700',
    description: 'Frais de prise en charge de base'
  },
  kilometre_jour: { 
    label: 'Km jour', 
    icon: <Sun className="h-4 w-4" />, 
    color: 'bg-yellow-100 text-yellow-700',
    description: 'Prix au kilomètre de 6h à 20h'
  },
  kilometre_nuit: { 
    label: 'Km nuit', 
    icon: <Moon className="h-4 w-4" />, 
    color: 'bg-indigo-100 text-indigo-700',
    description: 'Prix au kilomètre de 20h à 6h'
  },
  minute_arret: { 
    label: 'Minute arrêt', 
    icon: <Clock className="h-4 w-4" />, 
    color: 'bg-gray-100 text-gray-700',
    description: 'Prix par minute d\'attente après les 5 premières minutes'
  },
  minimum_course_jour: {
    label: 'Minimum course jour',
    icon: <Sun className="h-4 w-4" />,
    color: 'bg-green-100 text-green-700',
    description: 'Montant minimum pour une course de jour'
  },
  minimum_course_nuit: {
    label: 'Minimum course nuit',
    icon: <Moon className="h-4 w-4" />,
    color: 'bg-purple-100 text-purple-700',
    description: 'Montant minimum pour une course de nuit'
  },
};

export function AdminTarifs() {
  const [tarifs, setTarifs] = useState<Tarif[]>([]);
  const [supplements, setSupplements] = useState<Supplement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingTarif, setEditingTarif] = useState<Tarif | null>(null);
  const [editingSupplement, setEditingSupplement] = useState<Supplement | null>(null);
  const [showTarifForm, setShowTarifForm] = useState(false);
  const [showSupplementForm, setShowSupplementForm] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [config, setConfig] = useState<TarifConfig>({
    fraisPlateforme: 10,
    minimumCourseJour: 1500,
    minimumCourseNuit: 2000,
    majorationHauteurColline: 20,
    majorationHauteurMontagne: 30,
    majorationVehiculeSUV: 15,
    majorationVehiculeVan: 25,
    attenteGratuiteMinutes: 5,
    attenteCirculationDense: 30,
  });
  const [formData, setFormData] = useState({
    nom: '',
    typeTarif: 'prise_en_charge',
    prixXpf: '',
    heureDebut: '',
    heureFin: '',
  });
  const [supplementFormData, setSupplementFormData] = useState({
    nom: '',
    description: '',
    prixXpf: '',
    typeSupplement: 'fixe',
  });

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('admin_token');
      const [tarifsRes, supplementsRes] = await Promise.all([
        fetch('/api/admin/tarifs', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/admin/supplements', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (tarifsRes.ok) {
        const data = await tarifsRes.json();
        setTarifs(data || []);
      }

      if (supplementsRes.ok) {
        const data = await supplementsRes.json();
        setSupplements(data || []);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsLoading(false);
    }
  }

  function openTarifForm(tarif?: Tarif) {
    if (tarif) {
      setEditingTarif(tarif);
      setFormData({
        nom: tarif.nom,
        typeTarif: tarif.typeTarif,
        prixXpf: tarif.prixXpf.toString(),
        heureDebut: tarif.heureDebut || '',
        heureFin: tarif.heureFin || '',
      });
    } else {
      setEditingTarif(null);
      setFormData({
        nom: '',
        typeTarif: 'prise_en_charge',
        prixXpf: '',
        heureDebut: '',
        heureFin: '',
      });
    }
    setShowTarifForm(true);
  }

  function openSupplementForm(supplement?: Supplement) {
    if (supplement) {
      setEditingSupplement(supplement);
      setSupplementFormData({
        nom: supplement.nom,
        description: supplement.description || '',
        prixXpf: supplement.prixXpf.toString(),
        typeSupplement: supplement.typeSupplement,
      });
    } else {
      setEditingSupplement(null);
      setSupplementFormData({
        nom: '',
        description: '',
        prixXpf: '',
        typeSupplement: 'fixe',
      });
    }
    setShowSupplementForm(true);
  }

  function closeForms() {
    setShowTarifForm(false);
    setShowSupplementForm(false);
    setShowConfig(false);
    setEditingTarif(null);
    setEditingSupplement(null);
  }

  async function handleSubmitTarif(e: React.FormEvent) {
    e.preventDefault();
    try {
      const token = localStorage.getItem('admin_token');
      const url = editingTarif 
        ? `/api/admin/tarifs/${editingTarif.id}`
        : '/api/admin/tarifs';
      
      const method = editingTarif ? 'PATCH' : 'POST';
      const body = {
        nom: formData.nom,
        typeTarif: formData.typeTarif,
        prixXpf: parseFloat(formData.prixXpf),
        heureDebut: formData.heureDebut || null,
        heureFin: formData.heureFin || null,
      };

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        await fetchData();
        closeForms();
      } else {
        const error = await response.json();
        alert(error.error || 'Erreur lors de la sauvegarde');
      }
    } catch (error) {
      console.error('Error saving tarif:', error);
      alert('Erreur lors de la sauvegarde');
    }
  }

  async function handleSubmitSupplement(e: React.FormEvent) {
    e.preventDefault();
    try {
      const token = localStorage.getItem('admin_token');
      const url = editingSupplement 
        ? `/api/admin/supplements/${editingSupplement.id}`
        : '/api/admin/supplements';
      
      const method = editingSupplement ? 'PATCH' : 'POST';
      const body = {
        nom: supplementFormData.nom,
        description: supplementFormData.description || null,
        prixXpf: parseFloat(supplementFormData.prixXpf),
        typeSupplement: supplementFormData.typeSupplement,
      };

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        await fetchData();
        closeForms();
      } else {
        const error = await response.json();
        alert(error.error || 'Erreur lors de la sauvegarde');
      }
    } catch (error) {
      console.error('Error saving supplement:', error);
      alert('Erreur lors de la sauvegarde');
    }
  }

  async function handleDeleteTarif(id: string) {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce tarif ?')) return;

    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch(`/api/admin/tarifs/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        await fetchData();
      }
    } catch (error) {
      console.error('Error deleting tarif:', error);
    }
  }

  async function handleToggleActive(id: string, currentActive: boolean, type: 'tarif' | 'supplement') {
    try {
      const token = localStorage.getItem('admin_token');
      const url = type === 'tarif' 
        ? `/api/admin/tarifs/${id}`
        : `/api/admin/supplements/${id}`;
      
      const response = await fetch(url, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ actif: !currentActive }),
      });
      if (response.ok) {
        await fetchData();
      }
    } catch (error) {
      console.error('Error toggling:', error);
    }
  }

  function formatCurrency(amount: number): string {
    return amount.toLocaleString('fr-FR') + ' XPF';
  }

  // Grouper les tarifs par type
  const tarifsByType = tarifs.reduce((acc, tarif) => {
    if (!acc[tarif.typeTarif]) {
      acc[tarif.typeTarif] = [];
    }
    acc[tarif.typeTarif].push(tarif);
    return acc;
  }, {} as Record<string, Tarif[]>);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-purple-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-yellow-500 shadow-lg shadow-amber-500/30">
            <DollarSign className="h-7 w-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Tarifs</h1>
            <p className="text-slate-500">Gestion complète de la grille tarifaire en temps réel</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowConfig(true)}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-700 shadow-sm hover:bg-slate-50 transition-colors"
          >
            <Settings className="h-5 w-5" />
            Configuration
          </button>
          <button
            onClick={() => openTarifForm()}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-purple-700 px-5 py-2.5 text-white shadow-lg shadow-purple-500/30 hover:shadow-xl transition-all"
          >
            <Plus className="h-5 w-5" />
            Nouveau tarif
          </button>
        </div>
      </div>

      {/* Tarifs principaux */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Tarifs de base</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(typeLabels).map(([type, info]) => {
            const tarifsOfType = tarifsByType[type] || [];
            return (
              <div key={type} className="rounded-xl bg-white p-6 shadow-sm border border-gray-200">
                <div className="mb-4 flex items-center gap-3">
                  <div className={`rounded-lg p-2 ${info.color}`}>
                    {info.icon}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900">{info.label}</h3>
                    <p className="text-xs text-gray-500">{info.description}</p>
                  </div>
                </div>
                
                {tarifsOfType.length === 0 ? (
                  <div className="text-center py-4">
                    <p className="text-sm text-gray-500 mb-2">Aucun tarif configuré</p>
                    <button
                      onClick={() => {
                        setFormData({
                          nom: info.label,
                          typeTarif: type,
                          prixXpf: '',
                          heureDebut: type === 'kilometre_jour' ? '06:00' : type === 'kilometre_nuit' ? '20:00' : '',
                          heureFin: type === 'kilometre_jour' ? '20:00' : type === 'kilometre_nuit' ? '06:00' : '',
                        });
                        openTarifForm();
                      }}
                      className="text-xs text-purple-600 hover:text-purple-700"
                    >
                      Créer
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {tarifsOfType.map((tarif) => (
                      <div key={tarif.id} className="flex items-center justify-between p-2 rounded bg-gray-50">
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">{tarif.nom}</p>
                          {tarif.heureDebut && tarif.heureFin && (
                            <p className="text-xs text-gray-500">
                              {tarif.heureDebut} - {tarif.heureFin}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-purple-600">
                            {formatCurrency(tarif.prixXpf)}
                          </span>
                          <button
                            onClick={() => openTarifForm(tarif)}
                            className="p-1 text-gray-400 hover:text-gray-600"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteTarif(tarif.id)}
                            className="p-1 text-gray-400 hover:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Suppléments */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Suppléments</h2>
          <button
            onClick={() => openSupplementForm()}
            className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm text-white hover:bg-purple-700"
          >
            <Plus className="h-4 w-4" />
            Nouveau supplément
          </button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {supplements.map((supplement) => (
            <div
              key={supplement.id}
              className={`rounded-xl bg-white p-6 shadow-sm border border-gray-200 ${
                !supplement.actif ? 'opacity-60' : ''
              }`}
            >
              <div className="mb-4 flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">{supplement.nom}</h3>
                  {supplement.description && (
                    <p className="text-sm text-gray-500 mt-1">{supplement.description}</p>
                  )}
                  <span className={`mt-2 inline-block rounded-full px-2 py-0.5 text-xs ${
                    supplement.typeSupplement === 'pourcentage' 
                      ? 'bg-purple-100 text-purple-700' 
                      : 'bg-green-100 text-green-700'
                  }`}>
                    {supplement.typeSupplement === 'pourcentage' ? 'Pourcentage' : 'Fixe'}
                  </span>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => openSupplementForm(supplement)}
                    className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  >
                    <Edit className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleToggleActive(supplement.id, supplement.actif, 'supplement')}
                    className={`rounded px-2 py-1 text-xs ${
                      supplement.actif 
                        ? 'bg-green-100 text-green-700 hover:bg-green-200' 
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {supplement.actif ? 'Actif' : 'Inactif'}
                  </button>
                </div>
              </div>
              <div className="text-2xl font-bold text-purple-600">
                {supplement.typeSupplement === 'pourcentage'
                  ? `+${supplement.prixXpf}%`
                  : formatCurrency(supplement.prixXpf)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal Form Tarif */}
      {showTarifForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">
                {editingTarif ? 'Modifier le tarif' : 'Nouveau tarif'}
              </h2>
              <button onClick={closeForms} className="rounded p-1 hover:bg-gray-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitTarif} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nom du tarif
                </label>
                <input
                  type="text"
                  value={formData.nom}
                  onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Type de tarif
                </label>
                <select
                  value={formData.typeTarif}
                  onChange={(e) => setFormData({ ...formData, typeTarif: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                  required
                >
                  <option value="prise_en_charge">Prise en charge</option>
                  <option value="kilometre_jour">Kilomètre jour (6h-20h)</option>
                  <option value="kilometre_nuit">Kilomètre nuit (20h-6h)</option>
                  <option value="minute_arret">Minute arrêt</option>
                  <option value="minimum_course_jour">Minimum course jour</option>
                  <option value="minimum_course_nuit">Minimum course nuit</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Prix (XPF)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.prixXpf}
                  onChange={(e) => setFormData({ ...formData, prixXpf: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Heure début (optionnel)
                  </label>
                  <input
                    type="time"
                    value={formData.heureDebut}
                    onChange={(e) => setFormData({ ...formData, heureDebut: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Heure fin (optionnel)
                  </label>
                  <input
                    type="time"
                    value={formData.heureFin}
                    onChange={(e) => setFormData({ ...formData, heureFin: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-4">
                <button
                  type="button"
                  onClick={closeForms}
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-2 hover:bg-gray-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-white hover:bg-purple-700"
                >
                  <Save className="h-4 w-4" />
                  {editingTarif ? 'Modifier' : 'Créer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Form Supplement */}
      {showSupplementForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">
                {editingSupplement ? 'Modifier le supplément' : 'Nouveau supplément'}
              </h2>
              <button onClick={closeForms} className="rounded p-1 hover:bg-gray-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitSupplement} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nom du supplément
                </label>
                <input
                  type="text"
                  value={supplementFormData.nom}
                  onChange={(e) => setSupplementFormData({ ...supplementFormData, nom: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description (optionnel)
                </label>
                <textarea
                  value={supplementFormData.description}
                  onChange={(e) => setSupplementFormData({ ...supplementFormData, description: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                  rows={2}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Type
                </label>
                <select
                  value={supplementFormData.typeSupplement}
                  onChange={(e) => setSupplementFormData({ ...supplementFormData, typeSupplement: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                  required
                >
                  <option value="fixe">Fixe (montant)</option>
                  <option value="pourcentage">Pourcentage (%)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {supplementFormData.typeSupplement === 'pourcentage' ? 'Pourcentage' : 'Prix'} (XPF)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={supplementFormData.prixXpf}
                  onChange={(e) => setSupplementFormData({ ...supplementFormData, prixXpf: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                  required
                />
              </div>

              <div className="flex gap-2 pt-4">
                <button
                  type="button"
                  onClick={closeForms}
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-2 hover:bg-gray-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-white hover:bg-purple-700"
                >
                  <Save className="h-4 w-4" />
                  {editingSupplement ? 'Modifier' : 'Créer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Configuration */}
      {showConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Configuration tarifaire</h2>
              <button onClick={closeForms} className="rounded p-1 hover:bg-gray-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Frais plateforme (%)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={config.fraisPlateforme}
                  onChange={(e) => setConfig({ ...config, fraisPlateforme: parseFloat(e.target.value) || 0 })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Minimum course jour (XPF)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={config.minimumCourseJour}
                    onChange={(e) => setConfig({ ...config, minimumCourseJour: parseFloat(e.target.value) || 0 })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Minimum course nuit (XPF)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={config.minimumCourseNuit}
                    onChange={(e) => setConfig({ ...config, minimumCourseNuit: parseFloat(e.target.value) || 0 })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Majoration colline (%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={config.majorationHauteurColline}
                    onChange={(e) => setConfig({ ...config, majorationHauteurColline: parseFloat(e.target.value) || 0 })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Majoration montagne (%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={config.majorationHauteurMontagne}
                    onChange={(e) => setConfig({ ...config, majorationHauteurMontagne: parseFloat(e.target.value) || 0 })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Majoration SUV (%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={config.majorationVehiculeSUV}
                    onChange={(e) => setConfig({ ...config, majorationVehiculeSUV: parseFloat(e.target.value) || 0 })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Majoration Van (%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={config.majorationVehiculeVan}
                    onChange={(e) => setConfig({ ...config, majorationVehiculeVan: parseFloat(e.target.value) || 0 })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Minutes d'attente gratuites
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={config.attenteGratuiteMinutes}
                    onChange={(e) => setConfig({ ...config, attenteGratuiteMinutes: parseInt(e.target.value) || 0 })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Attente circulation dense (XPF/min)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={config.attenteCirculationDense}
                    onChange={(e) => setConfig({ ...config, attenteCirculationDense: parseFloat(e.target.value) || 0 })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-4">
                <button
                  type="button"
                  onClick={closeForms}
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-2 hover:bg-gray-50"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={() => {
                    // TODO: Sauvegarder la config dans la base de données
                    alert('Configuration sauvegardée (à implémenter)');
                    closeForms();
                  }}
                  className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-white hover:bg-purple-700"
                >
                  <Save className="h-4 w-4" />
                  Sauvegarder
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminTarifs;
