/**
 * RAVE Back Office — 3 options accueil = modèles du catalogue
 */

import { useEffect, useMemo, useState } from 'react';
import { Home, Loader2, Check, ImageOff, Search } from 'lucide-react';

interface VehicleModel {
  id: string;
  name: string;
  category: string;
  imageUrl: string | null;
  isActive: boolean;
}

interface HomeCategory {
  id: string;
  label: string;
  imageUrl: string | null;
  priceRange: string | null;
  model: string | null;
  vehicleModelId: string | null;
  position: number;
  isActive: boolean;
  vehicleModel?: {
    id: string;
    name: string | null;
    category: string | null;
    imageUrl: string | null;
  } | null;
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

const slotTitles: Record<string, string> = {
  classique: 'Option 1 — Classique',
  xl: 'Option 2 — Modèle XL',
  'service-plus': 'Option 3 — Service +',
};

export function AdminHomeCategories() {
  const [categories, setCategories] = useState<HomeCategory[]>([]);
  const [models, setModels] = useState<VehicleModel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [filterBySlot, setFilterBySlot] = useState<Record<string, string>>({});
  const [searchBySlot, setSearchBySlot] = useState<Record<string, string>>({});

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('admin_token');
      const headers = { Authorization: `Bearer ${token}` };
      const [catRes, modelsRes] = await Promise.all([
        fetch('/api/admin/home-categories', { headers }),
        fetch('/api/admin/vehicles', { headers }),
      ]);
      if (catRes.ok) {
        const data = await catRes.json();
        const cats: HomeCategory[] = data.categories || [];
        setCategories(cats);
        const filters: Record<string, string> = {};
        for (const c of cats) {
          filters[c.id] = c.vehicleModel?.category || 'all';
        }
        setFilterBySlot(filters);
      }
      if (modelsRes.ok) {
        const data = await modelsRes.json();
        setModels(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }

  function updateLocal(id: string, patch: Partial<HomeCategory>) {
    setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  function modelsForSlot(slotId: string) {
    const catFilter = filterBySlot[slotId] || 'all';
    const q = (searchBySlot[slotId] || '').trim().toLowerCase();
    return models
      .filter((m) => m.isActive !== false)
      .filter((m) => (catFilter === 'all' ? true : m.category === catFilter))
      .filter((m) => (!q ? true : m.name.toLowerCase().includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }

  async function saveCategory(id: string, override?: Partial<HomeCategory>) {
    const cat = categories.find((c) => c.id === id);
    if (!cat && !override) return;
    setSavingId(id);
    try {
      const token = localStorage.getItem('admin_token');
      const body = {
        label: override?.label ?? cat?.label,
        priceRange: override?.priceRange ?? cat?.priceRange,
        vehicleModelId:
          override && 'vehicleModelId' in override
            ? override.vehicleModelId
            : cat?.vehicleModelId,
      };
      const response = await fetch(`/api/admin/home-categories/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        alert(err.error || 'Erreur lors de la sauvegarde');
        return;
      }
      const updated = await response.json();
      updateLocal(id, updated);
    } catch (e) {
      console.error(e);
      alert('Erreur réseau');
    } finally {
      setSavingId(null);
    }
  }

  function selectModel(slotId: string, modelId: string) {
    const vm = models.find((m) => m.id === modelId);
    if (!vm) return;
    updateLocal(slotId, {
      vehicleModelId: vm.id,
      model: vm.name,
      imageUrl: vm.imageUrl,
      vehicleModel: {
        id: vm.id,
        name: vm.name,
        category: vm.category,
        imageUrl: vm.imageUrl,
      },
    });
    if (vm.category) {
      setFilterBySlot((prev) => ({ ...prev, [slotId]: vm.category }));
    }
  }

  const activeModelsCount = useMemo(
    () => models.filter((m) => m.isActive !== false).length,
    [models]
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center">
          <Home className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Accueil — 3 options</h1>
          <p className="text-sm text-gray-500">
            Choisissez un modèle du catalogue pour chaque option. L&apos;image affichée est celle du
            modèle (page Véhicules).
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Filtrez par type (Citadine, SUV, Pickup…), sélectionnez le modèle, puis enregistrez.
        Pour changer la photo : allez dans <strong>Véhicules</strong> et uploadez l&apos;image du
        modèle ({activeModelsCount} modèles catalogue).
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {categories.map((cat) => {
            const previewUrl = cat.vehicleModel?.imageUrl || cat.imageUrl;
            const list = modelsForSlot(cat.id);
            return (
              <div
                key={cat.id}
                className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm flex flex-col"
              >
                <div className="relative h-44 bg-slate-50 flex items-center justify-center">
                  {previewUrl ? (
                    <img
                      src={previewUrl}
                      alt={cat.model || cat.label}
                      className="max-h-full max-w-full object-contain p-4"
                    />
                  ) : (
                    <div className="text-center px-4">
                      <ImageOff className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                      <p className="text-xs text-gray-400">
                        {cat.vehicleModelId
                          ? 'Pas encore d’image sur ce modèle'
                          : 'Sélectionnez un modèle'}
                      </p>
                    </div>
                  )}
                </div>

                <div className="p-4 space-y-3 flex-1 flex flex-col">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                      {slotTitles[cat.id] || cat.id}
                    </p>
                    <p className="text-sm font-medium text-gray-900 mt-0.5">
                      {cat.model || 'Aucun modèle lié'}
                      {cat.vehicleModel?.category ? (
                        <span className="ml-2 text-xs font-normal text-gray-500">
                          ({categoryLabels[cat.vehicleModel.category] || cat.vehicleModel.category})
                        </span>
                      ) : null}
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Titre affiché
                    </label>
                    <input
                      type="text"
                      value={cat.label}
                      onChange={(e) => updateLocal(cat.id, { label: e.target.value })}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/20"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Prix affiché
                    </label>
                    <input
                      type="text"
                      value={cat.priceRange || ''}
                      onChange={(e) => updateLocal(cat.id, { priceRange: e.target.value })}
                      placeholder="5 000 – 8 000 XPF / jour"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/20"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Type de véhicule
                    </label>
                    <select
                      value={filterBySlot[cat.id] || 'all'}
                      onChange={(e) =>
                        setFilterBySlot((prev) => ({ ...prev, [cat.id]: e.target.value }))
                      }
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-black/20"
                    >
                      <option value="all">Tous les types</option>
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {categoryLabels[c]}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Rechercher un modèle
                    </label>
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={searchBySlot[cat.id] || ''}
                        onChange={(e) =>
                          setSearchBySlot((prev) => ({ ...prev, [cat.id]: e.target.value }))
                        }
                        placeholder="Ex. Clio, RAV4…"
                        className="w-full rounded-lg border border-gray-200 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/20"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Modèle catalogue ({list.length})
                    </label>
                    <select
                      value={cat.vehicleModelId || ''}
                      onChange={(e) => {
                        if (!e.target.value) {
                          updateLocal(cat.id, {
                            vehicleModelId: null,
                            vehicleModel: null,
                            imageUrl: null,
                          });
                          return;
                        }
                        selectModel(cat.id, e.target.value);
                      }}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-black/20"
                    >
                      <option value="">— Choisir un modèle —</option>
                      {list.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                          {m.imageUrl ? ' ●' : ''}
                        </option>
                      ))}
                    </select>
                    <p className="text-[11px] text-gray-400 mt-1">● = image déjà définie</p>
                  </div>

                  <button
                    type="button"
                    disabled={savingId === cat.id || !cat.vehicleModelId}
                    onClick={() => saveCategory(cat.id)}
                    className="mt-auto w-full flex items-center justify-center gap-2 rounded-lg bg-black px-3 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                  >
                    {savingId === cat.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                    Enregistrer
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
