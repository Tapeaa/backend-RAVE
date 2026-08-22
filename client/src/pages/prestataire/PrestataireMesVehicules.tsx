/**
 * RAVE - Dashboard Prestataire Loueur - Mes Véhicules
 * Flotte + tarifs dégressifs (paliers cumulatifs jusqu'à 90 jours)
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

interface PricingTier {
  fromDay: number;
  toDay: number;
  pricePerDay: number;
}

interface LoueurVehicle {
  id: string;
  vehicleModelId: string;
  plate: string | null;
  pricePerDay: number;
  pricePerDayLongTerm: number | null;
  pricingTiers?: PricingTier[] | null;
  maxRentalDays?: number | null;
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

function defaultTiers(price = 5000, maxDays = 90): PricingTier[] {
  return [{ fromDay: 1, toDay: maxDays, pricePerDay: price }];
}

function syncTierEdges(tiers: PricingTier[], maxRentalDays: number): PricingTier[] {
  if (tiers.length === 0) return defaultTiers(5000, maxRentalDays);
  const next = tiers.map((t) => ({ ...t }));
  next[0].fromDay = 1;
  for (let i = 1; i < next.length; i++) {
    next[i].fromDay = next[i - 1].toDay + 1;
    if (next[i].toDay < next[i].fromDay) next[i].toDay = next[i].fromDay;
  }
  const last = next[next.length - 1];
  if (last.toDay > maxRentalDays) last.toDay = maxRentalDays;
  if (last.toDay < last.fromDay) last.toDay = last.fromDay;
  return next;
}

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
    maxRentalDays: 90,
    pricingTiers: defaultTiers() as PricingTier[],
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
      maxRentalDays: 90,
      pricingTiers: defaultTiers(5000, 90),
      availableForRental: true,
      availableForDelivery: false,
      availableForLongTerm: false,
    });
    setShowModal(true);
  }

  function openEditModal(vehicle: LoueurVehicle) {
    setEditingVehicle(vehicle);
    const maxDays = vehicle.maxRentalDays || 90;
    const tiers =
      vehicle.pricingTiers && vehicle.pricingTiers.length > 0
        ? syncTierEdges(vehicle.pricingTiers, maxDays)
        : defaultTiers(vehicle.pricePerDay, maxDays);
    setFormData({
      vehicleModelId: vehicle.vehicleModelId,
      plate: vehicle.plate || '',
      maxRentalDays: maxDays,
      pricingTiers: tiers,
      availableForRental: vehicle.availableForRental,
      availableForDelivery: vehicle.availableForDelivery,
      availableForLongTerm: vehicle.availableForLongTerm,
    });
    setShowModal(true);
  }

  function updateMaxRentalDays(value: number) {
    const maxRentalDays = Math.min(90, Math.max(1, value || 1));
    setFormData((prev) => ({
      ...prev,
      maxRentalDays,
      pricingTiers: syncTierEdges(prev.pricingTiers, maxRentalDays),
    }));
  }

  function updateTierToDay(index: number, toDay: number) {
    setFormData((prev) => {
      const tiers = prev.pricingTiers.map((t) => ({ ...t }));
      const minTo = tiers[index].fromDay;
      const maxTo =
        index < tiers.length - 1
          ? Math.min(prev.maxRentalDays - (tiers.length - 1 - index), prev.maxRentalDays)
          : prev.maxRentalDays;
      tiers[index].toDay = Math.min(maxTo, Math.max(minTo, toDay || minTo));
      return { ...prev, pricingTiers: syncTierEdges(tiers, prev.maxRentalDays) };
    });
  }

  function updateTierPrice(index: number, pricePerDay: number) {
    setFormData((prev) => {
      const tiers = prev.pricingTiers.map((t, i) =>
        i === index ? { ...t, pricePerDay: Math.max(0, pricePerDay || 0) } : t
      );
      return { ...prev, pricingTiers: tiers };
    });
  }

  function addTier() {
    setFormData((prev) => {
      const tiers = prev.pricingTiers.map((t) => ({ ...t }));
      const last = tiers[tiers.length - 1];
      // Toujours laisser au moins 1 jour pour le nouveau palier (réduit le dernier si besoin)
      if (last.toDay <= last.fromDay && last.toDay >= prev.maxRentalDays) {
        alert('Allongez ou réduisez la durée max avant d’ajouter un palier');
        return prev;
      }
      if (last.toDay >= prev.maxRentalDays) {
        last.toDay = Math.max(last.fromDay, last.toDay - 1);
      }
      if (last.toDay < last.fromDay) {
        alert('Allongez le palier précédent avant d’en ajouter un');
        return prev;
      }
      const fromDay = last.toDay + 1;
      if (fromDay > prev.maxRentalDays) {
        alert(`Impossible d'ajouter un palier : durée max déjà couverte (${prev.maxRentalDays} j)`);
        return prev;
      }
      tiers.push({
        fromDay,
        toDay: prev.maxRentalDays,
        pricePerDay: Math.max(1000, Math.round(last.pricePerDay * 0.9)),
      });
      return { ...prev, pricingTiers: syncTierEdges(tiers, prev.maxRentalDays) };
    });
  }

  function removeTier(index: number) {
    setFormData((prev) => {
      if (prev.pricingTiers.length <= 1) return prev;
      const tiers = prev.pricingTiers.filter((_, i) => i !== index);
      // Extend last tier to max
      tiers[tiers.length - 1].toDay = prev.maxRentalDays;
      return { ...prev, pricingTiers: syncTierEdges(tiers, prev.maxRentalDays) };
    });
  }

  async function handleSave() {
    if (!formData.vehicleModelId) {
      alert('Veuillez sélectionner un modèle');
      return;
    }
    if (formData.pricingTiers.some((t) => t.pricePerDay < 1)) {
      alert('Chaque palier doit avoir un prix > 0');
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
        pricePerDay: formData.pricingTiers[0].pricePerDay,
        pricingTiers: formData.pricingTiers,
        maxRentalDays: formData.maxRentalDays,
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

  const filteredVehicles = vehicles.filter(
    (v) =>
      v.modelName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (v.plate && v.plate.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const selectedModel = models.find((m) => m.id === formData.vehicleModelId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center">
            <CarFront className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Mes Véhicules</h1>
            <p className="text-sm text-gray-500">
              {vehicles.length} véhicule{vehicles.length > 1 ? 's' : ''} — tarifs dégressifs jusqu’à 90 jours
            </p>
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-3 rounded-xl border bg-white">
          <p className="text-xs text-gray-500">Total</p>
          <p className="text-xl font-bold">{vehicles.length}</p>
        </div>
        <div className="p-3 rounded-xl border bg-green-50 border-green-200">
          <p className="text-xs text-gray-500">Actifs</p>
          <p className="text-xl font-bold text-green-700">{vehicles.filter((v) => v.isActive).length}</p>
        </div>
        <div className="p-3 rounded-xl border bg-blue-50 border-blue-200">
          <p className="text-xs text-gray-500">Location</p>
          <p className="text-xl font-bold text-blue-700">{vehicles.filter((v) => v.availableForRental).length}</p>
        </div>
        <div className="p-3 rounded-xl border bg-amber-50 border-amber-200">
          <p className="text-xs text-gray-500">Livraison</p>
          <p className="text-xl font-bold text-amber-700">{vehicles.filter((v) => v.availableForDelivery).length}</p>
        </div>
      </div>

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
          {filteredVehicles.map((vehicle) => {
            const tierCount = vehicle.pricingTiers?.length || 0;
            return (
              <div
                key={vehicle.id}
                className={`bg-white rounded-xl border p-4 flex items-center gap-4 transition-all hover:shadow-sm ${
                  !vehicle.isActive ? 'opacity-60' : ''
                }`}
              >
                <div className="w-20 h-16 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center">
                  {vehicle.customImageUrl || vehicle.modelImageUrl ? (
                    <img
                      src={vehicle.customImageUrl || vehicle.modelImageUrl!}
                      alt={vehicle.modelName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <CarFront className="w-8 h-8 text-gray-300" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900 truncate">{vehicle.modelName}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${categoryColors[vehicle.modelCategory]}`}>
                      {categoryLabels[vehicle.modelCategory]}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-gray-500">
                    {vehicle.plate && <span>Plaque: {vehicle.plate}</span>}
                    <span className="font-medium text-gray-900">
                      dès {vehicle.pricePerDay.toLocaleString()} XPF/jour
                    </span>
                    {tierCount > 1 && (
                      <span className="text-xs bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded">
                        {tierCount} paliers
                      </span>
                    )}
                    <span className="text-xs text-gray-400">max {vehicle.maxRentalDays || 90} j</span>
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

                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => handleToggle(vehicle)}
                    className="p-2 rounded-lg hover:bg-gray-100"
                    title={vehicle.isActive ? 'Désactiver' : 'Activer'}
                  >
                    {vehicle.isActive ? (
                      <Eye className="w-4 h-4 text-green-600" />
                    ) : (
                      <EyeOff className="w-4 h-4 text-gray-400" />
                    )}
                  </button>
                  <button onClick={() => openEditModal(vehicle)} className="p-2 rounded-lg hover:bg-gray-100" title="Modifier">
                    <Edit className="w-4 h-4 text-gray-500" />
                  </button>
                  <button onClick={() => handleDelete(vehicle)} className="p-2 rounded-lg hover:bg-red-50" title="Supprimer">
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

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
              {!editingVehicle && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Modèle de véhicule *</label>
                  <select
                    value={formData.vehicleModelId}
                    onChange={(e) => setFormData((prev) => ({ ...prev, vehicleModelId: e.target.value }))}
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

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Immatriculation</label>
                <input
                  type="text"
                  value={formData.plate}
                  onChange={(e) => setFormData((prev) => ({ ...prev, plate: e.target.value }))}
                  placeholder="Ex: 12345 P"
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-black/20"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Durée max de location (jours) *
                </label>
                <input
                  type="number"
                  min={1}
                  max={90}
                  value={formData.maxRentalDays}
                  onChange={(e) => updateMaxRentalDays(parseInt(e.target.value))}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-black/20"
                />
                <p className="text-xs text-gray-500 mt-1">Entre 1 et 90 jours. Le client ne pourra pas réserver plus long.</p>
              </div>

              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Tarif dégressif</h3>
                    <p className="text-xs text-gray-600">
                      Chaque tranche est facturée à son prix. Sans trou. Au-delà du dernier palier → dernier prix jusqu’à la durée max.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addTier}
                    className="shrink-0 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-black text-white hover:bg-gray-800"
                  >
                    + Palier
                  </button>
                </div>

                {formData.pricingTiers.map((tier, index) => (
                  <div key={index} className="grid grid-cols-12 gap-2 items-end bg-white rounded-lg border p-3">
                    <div className="col-span-3">
                      <label className="text-[10px] uppercase text-gray-500">Du jour</label>
                      <input
                        type="number"
                        value={tier.fromDay}
                        disabled
                        className="w-full px-2 py-1.5 border rounded-lg bg-gray-50 text-sm"
                      />
                    </div>
                    <div className="col-span-3">
                      <label className="text-[10px] uppercase text-gray-500">Au jour</label>
                      <input
                        type="number"
                        min={tier.fromDay}
                        max={formData.maxRentalDays}
                        value={tier.toDay}
                        onChange={(e) => updateTierToDay(index, parseInt(e.target.value))}
                        className="w-full px-2 py-1.5 border rounded-lg text-sm"
                      />
                    </div>
                    <div className="col-span-4">
                      <label className="text-[10px] uppercase text-gray-500">Prix / jour (XPF)</label>
                      <input
                        type="number"
                        min={1}
                        value={tier.pricePerDay}
                        onChange={(e) => updateTierPrice(index, parseInt(e.target.value))}
                        className="w-full px-2 py-1.5 border rounded-lg text-sm"
                      />
                    </div>
                    <div className="col-span-2 flex justify-end">
                      {formData.pricingTiers.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeTier(index)}
                          className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                          title="Supprimer le palier"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Services disponibles</label>
                <div className="space-y-2">
                  {[
                    { key: 'availableForRental', label: 'Location classique' },
                    { key: 'availableForDelivery', label: 'Livraison' },
                    { key: 'availableForLongTerm', label: 'Location longue durée' },
                  ].map(({ key, label }) => (
                    <label key={key} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={(formData as any)[key]}
                        onChange={(e) => setFormData((prev) => ({ ...prev, [key]: e.target.checked }))}
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
