/**
 * RAVE - Dashboard Prestataire Loueur - Mes Véhicules
 * Permet au loueur de gérer sa flotte de véhicules
 */

import { useEffect, useState } from 'react';
import { CarFront, Plus, X, Check, Edit, Trash2, Eye, EyeOff, Search } from 'lucide-react';

interface VehicleModel {
  id: string;
  name: string;
  category: string;
  imageUrl: string | null;
  seats: number;
  transmission: string;
  fuel: string;
}

interface LoueurVehicle {
  id: string;
  vehicleModelId: string;
  plate: string | null;
  pricePerDay: number;
  pricePerDayLongTerm: number | null;
  availableForRental: boolean;
  availableForDelivery: boolean;
  availableForLongTerm: boolean;
  customImageUrl: string | null;
  isActive: boolean;
  createdAt: string;
  modelName: string;
  modelCategory: string;
  modelImageUrl: string | null;
  modelSeats: number;
  modelTransmission: string;
  modelFuel: string;
}

const categoryLabels: Record<string, string> = {
  citadine: 'Citadine',
  berline: 'Berline',
  suv: 'SUV',
};

const categoryColors: Record<string, string> = {
  citadine: 'bg-blue-100 text-blue-800',
  berline: 'bg-purple-100 text-purple-800',
  suv: 'bg-amber-100 text-amber-800',
};

export function PrestataireMesVehicules() {
  const [vehicles, setVehicles] = useState<LoueurVehicle[]>([]);
  const [models, setModels] = useState<VehicleModel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<LoueurVehicle | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const [formData, setFormData] = useState({
    vehicleModelId: '',
    plate: '',
    pricePerDay: 5000,
    pricePerDayLongTerm: 0,
    availableForRental: true,
    availableForDelivery: false,
    availableForLongTerm: false,
  });

  useEffect(() => {
    fetchVehicles();
    fetchModels();
  }, []);

  async function fetchVehicles() {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch('/api/prestataire/vehicles', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setVehicles(data);
      }
    } catch (error) {
      console.error('Error fetching vehicles:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function fetchModels() {
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch('/api/prestataire/vehicle-models', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setModels(data);
      }
    } catch (error) {
      console.error('Error fetching models:', error);
    }
  }

  function openCreateModal() {
    setEditingVehicle(null);
    setFormData({
      vehicleModelId: models[0]?.id || '',
      plate: '',
      pricePerDay: 5000,
      pricePerDayLongTerm: 0,
      availableForRental: true,
      availableForDelivery: false,
      availableForLongTerm: false,
    });
    setShowModal(true);
  }

  function openEditModal(vehicle: LoueurVehicle) {
    setEditingVehicle(vehicle);
    setFormData({
      vehicleModelId: vehicle.vehicleModelId,
      plate: vehicle.plate || '',
      pricePerDay: vehicle.pricePerDay,
      pricePerDayLongTerm: vehicle.pricePerDayLongTerm || 0,
      availableForRental: vehicle.availableForRental,
      availableForDelivery: vehicle.availableForDelivery,
      availableForLongTerm: vehicle.availableForLongTerm,
    });
    setShowModal(true);
  }

  async function handleSave() {
    if (!formData.vehicleModelId) {
      alert('Veuillez sélectionner un modèle');
      return;
    }
    if (formData.pricePerDay < 1) {
      alert('Le prix par jour doit être supérieur à 0');
      return;
    }

    setIsSaving(true);
    try {
      const token = localStorage.getItem('admin_token');
      const url = editingVehicle
        ? `/api/prestataire/vehicles/${editingVehicle.id}`
        : '/api/prestataire/vehicles';
      const method = editingVehicle ? 'PATCH' : 'POST';

      const body: any = {
        pricePerDay: formData.pricePerDay,
        pricePerDayLongTerm: formData.pricePerDayLongTerm > 0 ? formData.pricePerDayLongTerm : null,
        plate: formData.plate || null,
        availableForRental: formData.availableForRental,
        availableForDelivery: formData.availableForDelivery,
        availableForLongTerm: formData.availableForLongTerm,
      };

      if (!editingVehicle) {
        body.vehicleModelId = formData.vehicleModelId;
      }

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        setShowModal(false);
        fetchVehicles();
      } else {
        const err = await response.json();
        alert(err.error || 'Erreur');
      }
    } catch (error) {
      console.error('Error saving vehicle:', error);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggle(vehicle: LoueurVehicle) {
    try {
      const token = localStorage.getItem('admin_token');
      await fetch(`/api/prestataire/vehicles/${vehicle.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ isActive: !vehicle.isActive }),
      });
      fetchVehicles();
    } catch (error) {
      console.error('Error toggling vehicle:', error);
    }
  }

  async function handleDelete(vehicle: LoueurVehicle) {
    if (!confirm(`Supprimer ce véhicule (${vehicle.modelName}) ?`)) return;
    try {
      const token = localStorage.getItem('admin_token');
      await fetch(`/api/prestataire/vehicles/${vehicle.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchVehicles();
    } catch (error) {
      console.error('Error deleting vehicle:', error);
    }
  }

  const filteredVehicles = vehicles.filter(v =>
    v.modelName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (v.plate && v.plate.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const selectedModel = models.find(m => m.id === formData.vehicleModelId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center">
            <CarFront className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Mes Véhicules</h1>
            <p className="text-sm text-gray-500">{vehicles.length} véhicule{vehicles.length > 1 ? 's' : ''} dans votre flotte</p>
          </div>
        </div>
        <button
          onClick={openCreateModal}
          disabled={models.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
        >
          <Plus className="w-4 h-4" />
          Ajouter
        </button>
      </div>

      {/* Stats rapides */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-3 rounded-xl border bg-white">
          <p className="text-xs text-gray-500">Total</p>
          <p className="text-xl font-bold">{vehicles.length}</p>
        </div>
        <div className="p-3 rounded-xl border bg-green-50 border-green-200">
          <p className="text-xs text-gray-500">Actifs</p>
          <p className="text-xl font-bold text-green-700">{vehicles.filter(v => v.isActive).length}</p>
        </div>
        <div className="p-3 rounded-xl border bg-blue-50 border-blue-200">
          <p className="text-xs text-gray-500">Location</p>
          <p className="text-xl font-bold text-blue-700">{vehicles.filter(v => v.availableForRental).length}</p>
        </div>
        <div className="p-3 rounded-xl border bg-amber-50 border-amber-200">
          <p className="text-xs text-gray-500">Livraison</p>
          <p className="text-xl font-bold text-amber-700">{vehicles.filter(v => v.availableForDelivery).length}</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Rechercher un véhicule..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-black/20"
        />
      </div>

      {/* Liste */}
      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin h-8 w-8 border-4 border-black border-t-transparent rounded-full" />
        </div>
      ) : filteredVehicles.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 rounded-xl">
          <CarFront className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">
            {models.length === 0
              ? "Aucun modèle de véhicule disponible. Contactez l'administrateur."
              : 'Aucun véhicule dans votre flotte'}
          </p>
          {models.length > 0 && (
            <button onClick={openCreateModal} className="mt-3 text-sm text-black underline">
              Ajouter votre premier véhicule
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredVehicles.map((vehicle) => (
            <div
              key={vehicle.id}
              className={`bg-white rounded-xl border p-4 flex items-center gap-4 transition-all hover:shadow-sm ${
                !vehicle.isActive ? 'opacity-60' : ''
              }`}
            >
              {/* Image */}
              <div className="w-20 h-16 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center">
                {(vehicle.customImageUrl || vehicle.modelImageUrl) ? (
                  <img
                    src={vehicle.customImageUrl || vehicle.modelImageUrl!}
                    alt={vehicle.modelName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <CarFront className="w-8 h-8 text-gray-300" />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-900 truncate">{vehicle.modelName}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${categoryColors[vehicle.modelCategory]}`}>
                    {categoryLabels[vehicle.modelCategory]}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                  {vehicle.plate && <span>Plaque: {vehicle.plate}</span>}
                  <span className="font-medium text-gray-900">{vehicle.pricePerDay.toLocaleString()} XPF/jour</span>
                  {vehicle.pricePerDayLongTerm && (
                    <span className="text-xs bg-green-50 text-green-700 px-1.5 py-0.5 rounded">
                      Long terme: {vehicle.pricePerDayLongTerm.toLocaleString()} XPF/j
                    </span>
                  )}
                </div>
                <div className="flex gap-1.5 mt-1.5">
                  {vehicle.availableForRental && (
                    <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">Louer</span>
                  )}
                  {vehicle.availableForDelivery && (
                    <span className="text-xs bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full">Livraison</span>
                  )}
                  {vehicle.availableForLongTerm && (
                    <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">Long terme</span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => handleToggle(vehicle)} className="p-2 rounded-lg hover:bg-gray-100" title={vehicle.isActive ? 'Désactiver' : 'Activer'}>
                  {vehicle.isActive ? <Eye className="w-4 h-4 text-green-600" /> : <EyeOff className="w-4 h-4 text-gray-400" />}
                </button>
                <button onClick={() => openEditModal(vehicle)} className="p-2 rounded-lg hover:bg-gray-100" title="Modifier">
                  <Edit className="w-4 h-4 text-gray-500" />
                </button>
                <button onClick={() => handleDelete(vehicle)} className="p-2 rounded-lg hover:bg-red-50" title="Supprimer">
                  <Trash2 className="w-4 h-4 text-red-500" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-bold">{editingVehicle ? 'Modifier le véhicule' : 'Ajouter un véhicule'}</h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Sélection du modèle */}
              {!editingVehicle && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Modèle de véhicule *</label>
                  <select
                    value={formData.vehicleModelId}
                    onChange={(e) => setFormData(prev => ({ ...prev, vehicleModelId: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-black/20"
                  >
                    {models.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name} ({categoryLabels[model.category]})
                      </option>
                    ))}
                  </select>
                  {selectedModel?.imageUrl && (
                    <div className="mt-2 h-24 bg-gray-50 rounded-lg overflow-hidden flex items-center justify-center">
                      <img src={selectedModel.imageUrl} alt={selectedModel.name} className="h-full object-contain" />
                    </div>
                  )}
                </div>
              )}

              {/* Plaque */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Immatriculation</label>
                <input
                  type="text"
                  value={formData.plate}
                  onChange={(e) => setFormData(prev => ({ ...prev, plate: e.target.value }))}
                  placeholder="Ex: 12345 P"
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-black/20"
                />
              </div>

              {/* Prix */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Prix/jour (XPF) *</label>
                  <input
                    type="number"
                    value={formData.pricePerDay}
                    onChange={(e) => setFormData(prev => ({ ...prev, pricePerDay: parseInt(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-black/20"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Prix/jour long terme</label>
                  <input
                    type="number"
                    value={formData.pricePerDayLongTerm}
                    onChange={(e) => setFormData(prev => ({ ...prev, pricePerDayLongTerm: parseInt(e.target.value) || 0 }))}
                    placeholder="Optionnel"
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-black/20"
                  />
                </div>
              </div>

              {/* Services */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Services disponibles</label>
                <div className="space-y-2">
                  {[
                    { key: 'availableForRental', label: 'Location classique', color: 'blue' },
                    { key: 'availableForDelivery', label: 'Livraison', color: 'teal' },
                    { key: 'availableForLongTerm', label: 'Location longue durée', color: 'amber' },
                  ].map(({ key, label, color }) => (
                    <label key={key} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={(formData as any)[key]}
                        onChange={(e) => setFormData(prev => ({ ...prev, [key]: e.target.checked }))}
                        className="w-4 h-4 rounded border-gray-300"
                      />
                      <span className="text-sm text-gray-700">{label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-5 border-t">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">
                Annuler
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-2 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
              >
                {isSaving ? (
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                {editingVehicle ? 'Enregistrer' : 'Ajouter'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
