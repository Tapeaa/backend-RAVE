/**
 * RAVE Back Office - Modèles de véhicules + photo par défaut
 * Ces photos s'affichent dans l'app Loueur et le catalogue Client
 * quand le loueur n'a pas uploadé sa propre photo.
 */

import { useEffect, useState, useRef } from 'react';
import { CarFront, Search, Plus, X, Edit, Trash2, Upload, Check, Filter, Eye, EyeOff, ImageOff } from 'lucide-react';

interface VehicleModel {
  id: string;
  name: string;
  category: string;
  imageUrl: string | null;
  description: string | null;
  seats: number;
  transmission: 'auto' | 'manual';
  fuel: 'essence' | 'diesel' | 'electrique' | 'hybride';
  isActive: boolean;
  createdAt: string;
  loueurCount: number;
}

const CATEGORIES = [
  'citadine',
  'berline',
  'suv',
  'pickup',
  'utilitaire',
  'premium',
  'autre',
] as const;

const categoryLabels: Record<string, string> = {
  citadine: 'Citadine',
  berline: 'Berline',
  suv: 'SUV',
  pickup: 'Pickup',
  utilitaire: 'Utilitaire',
  premium: 'Premium',
  autre: 'Autre',
};

const categoryColors: Record<string, string> = {
  citadine: 'bg-blue-100 text-blue-800',
  berline: 'bg-purple-100 text-purple-800',
  suv: 'bg-amber-100 text-amber-800',
  pickup: 'bg-orange-100 text-orange-800',
  utilitaire: 'bg-slate-100 text-slate-800',
  premium: 'bg-yellow-100 text-yellow-800',
  autre: 'bg-gray-100 text-gray-700',
};

const fuelLabels: Record<string, string> = {
  essence: 'Essence',
  diesel: 'Diesel',
  electrique: 'Électrique',
  hybride: 'Hybride',
};

const transmissionLabels: Record<string, string> = {
  auto: 'Automatique',
  manual: 'Manuelle',
};

const defaultForm = {
  name: '',
  category: 'citadine' as string,
  imageUrl: '',
  description: '',
  seats: 5,
  transmission: 'auto' as VehicleModel['transmission'],
  fuel: 'essence' as VehicleModel['fuel'],
};

export function AdminVehicles() {
  const [vehicles, setVehicles] = useState<VehicleModel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterNoPhoto, setFilterNoPhoto] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<VehicleModel | null>(null);
  const [formData, setFormData] = useState(defaultForm);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchVehicles();
  }, []);

  async function fetchVehicles() {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch('/api/admin/vehicles', {
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

  function openCreateModal() {
    setEditingVehicle(null);
    setFormData(defaultForm);
    setShowModal(true);
  }

  function openEditModal(vehicle: VehicleModel) {
    setEditingVehicle(vehicle);
    setFormData({
      name: vehicle.name,
      category: vehicle.category,
      imageUrl: vehicle.imageUrl || '',
      description: vehicle.description || '',
      seats: vehicle.seats,
      transmission: vehicle.transmission,
      fuel: vehicle.fuel,
    });
    setShowModal(true);
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Veuillez sélectionner une image (JPG, PNG, WebP…)');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      alert('Image trop lourde (max 8 Mo)');
      return;
    }

    setIsUploading(true);
    try {
      const token = localStorage.getItem('admin_token');
      const fd = new FormData();
      fd.append('image', file);
      fd.append('folder', 'rave/vehicles');

      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });

      if (response.ok) {
        const data = await response.json();
        setFormData((prev) => ({ ...prev, imageUrl: data.url }));
      } else {
        alert("Erreur lors de l'upload de l'image");
      }
    } catch (error) {
      console.error('Error uploading image:', error);
      alert("Erreur lors de l'upload");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleSave() {
    if (!formData.name.trim()) {
      alert('Le nom du véhicule est requis');
      return;
    }

    setIsSaving(true);
    try {
      const token = localStorage.getItem('admin_token');
      const url = editingVehicle
        ? `/api/admin/vehicles/${editingVehicle.id}`
        : '/api/admin/vehicles';
      const method = editingVehicle ? 'PATCH' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: formData.name.trim(),
          category: formData.category,
          imageUrl: formData.imageUrl || null,
          description: formData.description || null,
          seats: formData.seats,
          transmission: formData.transmission,
          fuel: formData.fuel,
        }),
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
      alert('Erreur lors de la sauvegarde');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleActive(vehicle: VehicleModel) {
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch(`/api/admin/vehicles/${vehicle.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isActive: !vehicle.isActive }),
      });

      if (response.ok) {
        fetchVehicles();
      }
    } catch (error) {
      console.error('Error toggling vehicle:', error);
    }
  }

  async function handleDelete(vehicle: VehicleModel) {
    if (!confirm(`Supprimer le modèle "${vehicle.name}" ?\n\nCette action est irréversible.`)) {
      return;
    }

    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch(`/api/admin/vehicles/${vehicle.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        fetchVehicles();
      } else {
        const err = await response.json();
        alert(err.error || 'Erreur');
      }
    } catch (error) {
      console.error('Error deleting vehicle:', error);
    }
  }

  const filteredVehicles = vehicles.filter((v) => {
    const matchSearch = v.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchCategory = filterCategory === 'all' || v.category === filterCategory;
    const matchPhoto = !filterNoPhoto || !v.imageUrl;
    return matchSearch && matchCategory && matchPhoto;
  });

  const stats = {
    total: vehicles.length,
    active: vehicles.filter((v) => v.isActive).length,
    withoutPhoto: vehicles.filter((v) => !v.imageUrl).length,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center">
            <CarFront className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Modèles de véhicules</h1>
            <p className="text-sm text-gray-500">
              Catalogue proposé aux loueurs — ajoutez une photo par défaut pour chaque modèle
            </p>
          </div>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors"
          type="button"
        >
          <Plus className="w-4 h-4" />
          Ajouter un modèle
        </button>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        La photo du modèle s’affiche dans l’app <strong>RAVE Loueur</strong> et le catalogue{' '}
        <strong>RAVE Client</strong> si le loueur ne met pas sa propre photo sur l’annonce.
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 rounded-xl border bg-gray-50 border-gray-200">
          <p className="text-xs text-gray-500">Total</p>
          <p className="text-xl font-bold text-gray-900">{stats.total}</p>
        </div>
        <div className="p-3 rounded-xl border bg-green-50 border-green-200">
          <p className="text-xs text-gray-500">Actifs (visibles app)</p>
          <p className="text-xl font-bold text-gray-900">{stats.active}</p>
        </div>
        <button
          type="button"
          onClick={() => setFilterNoPhoto((v) => !v)}
          className={`p-3 rounded-xl border text-left transition-colors ${
            filterNoPhoto
              ? 'bg-red-100 border-red-300 ring-2 ring-red-200'
              : 'bg-red-50 border-red-200 hover:bg-red-100'
          }`}
        >
          <p className="text-xs text-gray-500">Sans photo défaut</p>
          <p className="text-xl font-bold text-gray-900">{stats.withoutPhoto}</p>
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Rechercher un modèle..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/20"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/20"
          >
            <option value="all">Toutes catégories</option>
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {categoryLabels[cat]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin h-8 w-8 border-4 border-black border-t-transparent rounded-full" />
        </div>
      ) : filteredVehicles.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 rounded-xl">
          <CarFront className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">
            {searchTerm || filterCategory !== 'all' || filterNoPhoto
              ? 'Aucun modèle trouvé avec ces filtres'
              : 'Aucun modèle de véhicule créé'}
          </p>
          {!searchTerm && filterCategory === 'all' && !filterNoPhoto && (
            <button
              onClick={openCreateModal}
              className="mt-3 text-sm text-black underline hover:no-underline"
              type="button"
            >
              Créer le premier modèle
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredVehicles.map((vehicle) => (
            <div
              key={vehicle.id}
              className={`bg-white rounded-xl border overflow-hidden transition-all hover:shadow-md ${
                !vehicle.isActive ? 'opacity-60' : ''
              }`}
            >
              <div className="relative h-44 bg-gray-100 flex items-center justify-center overflow-hidden">
                {vehicle.imageUrl ? (
                  <img
                    src={vehicle.imageUrl}
                    alt={vehicle.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="text-center px-4">
                    <ImageOff className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                    <p className="text-xs text-gray-400">Aucune photo par défaut</p>
                  </div>
                )}
                <span
                  className={`absolute top-2 left-2 px-2 py-0.5 text-xs font-medium rounded-full ${
                    categoryColors[vehicle.category] || categoryColors.autre
                  }`}
                >
                  {categoryLabels[vehicle.category] || vehicle.category}
                </span>
                {!vehicle.imageUrl && (
                  <span className="absolute bottom-2 left-2 px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-700">
                    Sans photo
                  </span>
                )}
                {!vehicle.isActive && (
                  <span className="absolute top-2 right-2 px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-800">
                    Inactif
                  </span>
                )}
              </div>

              <div className="p-4">
                <h3 className="font-semibold text-gray-900 text-lg">{vehicle.name}</h3>
                {vehicle.description && (
                  <p className="text-sm text-gray-500 mt-1 line-clamp-2">{vehicle.description}</p>
                )}
                <div className="flex flex-wrap gap-2 mt-3">
                  <span className="text-xs px-2 py-1 bg-gray-100 rounded-md text-gray-600">
                    {vehicle.seats} places
                  </span>
                  <span className="text-xs px-2 py-1 bg-gray-100 rounded-md text-gray-600">
                    {transmissionLabels[vehicle.transmission] || vehicle.transmission}
                  </span>
                  <span className="text-xs px-2 py-1 bg-gray-100 rounded-md text-gray-600">
                    {fuelLabels[vehicle.fuel] || vehicle.fuel}
                  </span>
                </div>
                <div className="mt-3 pt-3 border-t flex items-center justify-between">
                  <span className="text-xs text-gray-500">
                    {vehicle.loueurCount} loueur{vehicle.loueurCount > 1 ? 's' : ''} actif
                    {vehicle.loueurCount > 1 ? 's' : ''}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleToggleActive(vehicle)}
                      className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                      title={vehicle.isActive ? 'Désactiver' : 'Activer'}
                      type="button"
                    >
                      {vehicle.isActive ? (
                        <Eye className="w-4 h-4 text-green-600" />
                      ) : (
                        <EyeOff className="w-4 h-4 text-gray-400" />
                      )}
                    </button>
                    <button
                      onClick={() => openEditModal(vehicle)}
                      className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                      title="Modifier / photo"
                      type="button"
                    >
                      <Edit className="w-4 h-4 text-gray-500" />
                    </button>
                    <button
                      onClick={() => handleDelete(vehicle)}
                      className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                      title="Supprimer"
                      type="button"
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-bold text-gray-900">
                {editingVehicle ? 'Modifier le modèle' : 'Nouveau modèle de véhicule'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 hover:bg-gray-100 rounded-lg"
                type="button"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Photo par défaut
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  Utilisée dans le catalogue client et l’app loueur si le loueur n’ajoute pas de photo.
                </p>
                <div
                  className="relative h-44 bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl flex items-center justify-center cursor-pointer hover:border-gray-400 transition-colors overflow-hidden"
                  onClick={() => !isUploading && fileInputRef.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
                  }}
                  role="button"
                  tabIndex={0}
                >
                  {formData.imageUrl ? (
                    <>
                      <img
                        src={formData.imageUrl}
                        alt="Preview"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                        <div className="text-center text-white">
                          <Upload className="w-6 h-6 mx-auto mb-1" />
                          <p className="text-xs font-medium">Changer la photo</p>
                        </div>
                      </div>
                    </>
                  ) : isUploading ? (
                    <div className="animate-spin h-6 w-6 border-2 border-black border-t-transparent rounded-full" />
                  ) : (
                    <div className="text-center px-4">
                      <Upload className="w-8 h-8 text-gray-300 mx-auto mb-1" />
                      <p className="text-sm text-gray-600 font-medium">Cliquez pour uploader</p>
                      <p className="text-xs text-gray-400 mt-1">JPG, PNG ou WebP — max 8 Mo</p>
                    </div>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageUpload}
                />
                {formData.imageUrl && (
                  <button
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, imageUrl: '' }))}
                    className="mt-2 text-xs text-red-600 hover:underline"
                  >
                    Retirer la photo
                  </button>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nom du modèle *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Ex: Renault Clio, Toyota RAV4..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/20"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Catégorie *</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, category: cat }))}
                      className={`py-2 px-3 rounded-lg border text-sm font-medium transition-all ${
                        formData.category === cat
                          ? 'bg-black text-white border-black'
                          : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'
                      }`}
                    >
                      {categoryLabels[cat]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, description: e.target.value }))
                  }
                  placeholder="Description optionnelle..."
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/20 resize-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Places</label>
                  <select
                    value={formData.seats}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, seats: parseInt(e.target.value, 10) }))
                    }
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/20"
                  >
                    {[2, 4, 5, 7, 8, 9].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Transmission</label>
                  <select
                    value={formData.transmission}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        transmission: e.target.value as VehicleModel['transmission'],
                      }))
                    }
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/20"
                  >
                    <option value="auto">Auto</option>
                    <option value="manual">Manuel</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Carburant</label>
                  <select
                    value={formData.fuel}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        fuel: e.target.value as VehicleModel['fuel'],
                      }))
                    }
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/20"
                  >
                    <option value="essence">Essence</option>
                    <option value="diesel">Diesel</option>
                    <option value="electrique">Électrique</option>
                    <option value="hybride">Hybride</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-5 border-t">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                type="button"
              >
                Annuler
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving || isUploading || !formData.name.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
                type="button"
              >
                {isSaving ? (
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                {editingVehicle ? 'Enregistrer' : 'Créer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
