/**
 * RAVE Back Office — Icônes des 3 options de l'écran d'accueil client
 */

import { useEffect, useRef, useState } from 'react';
import { Home, Upload, Loader2, Check, ImageOff } from 'lucide-react';

interface HomeCategory {
  id: string;
  label: string;
  imageUrl: string | null;
  priceRange: string | null;
  model: string | null;
  position: number;
  isActive: boolean;
}

export function AdminHomeCategories() {
  const [categories, setCategories] = useState<HomeCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    fetchCategories();
  }, []);

  async function fetchCategories() {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch('/api/admin/home-categories', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setCategories(data.categories || []);
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

  async function uploadImage(id: string, file: File): Promise<string | null> {
    if (!file.type.startsWith('image/')) {
      alert('Veuillez sélectionner une image');
      return null;
    }
    if (file.size > 8 * 1024 * 1024) {
      alert('Image trop lourde (max 8 Mo)');
      return null;
    }
    const token = localStorage.getItem('admin_token');
    const fd = new FormData();
    fd.append('image', file);
    fd.append('folder', 'rave/home');
    const response = await fetch('/api/upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });
    if (!response.ok) {
      alert("Erreur lors de l'upload");
      return null;
    }
    const data = await response.json();
    return data.url || null;
  }

  async function handleFileChange(id: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (fileRefs.current[id]) fileRefs.current[id]!.value = '';
    if (!file) return;

    setUploadingId(id);
    try {
      const url = await uploadImage(id, file);
      if (!url) return;
      updateLocal(id, { imageUrl: url });
      await saveCategory(id, { imageUrl: url });
    } finally {
      setUploadingId(null);
    }
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
        model: override?.model ?? cat?.model,
        imageUrl: override?.imageUrl !== undefined ? override.imageUrl : cat?.imageUrl,
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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center">
          <Home className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Accueil — 3 options</h1>
          <p className="text-sm text-gray-500">
            Images affichées en bas de l&apos;écran d&apos;accueil de l&apos;app RAVE Client
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Ces 3 icônes correspondent à <strong>Classique</strong>, <strong>Modèle XL</strong> et{' '}
        <strong>Service +</strong>. Uploadez une image PNG/JPG transparente de préférence.
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {categories.map((cat) => (
            <div key={cat.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
              <div
                className="relative h-48 bg-slate-50 flex items-center justify-center cursor-pointer hover:bg-slate-100 transition-colors"
                onClick={() => fileRefs.current[cat.id]?.click()}
              >
                {cat.imageUrl ? (
                  <img src={cat.imageUrl} alt={cat.label} className="max-h-full max-w-full object-contain p-4" />
                ) : (
                  <div className="text-center px-4">
                    <ImageOff className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                    <p className="text-xs text-gray-400">Image par défaut app</p>
                  </div>
                )}
                <div className="absolute bottom-2 right-2">
                  <span className="inline-flex items-center gap-1 rounded-lg bg-black/80 px-2.5 py-1.5 text-xs font-medium text-white">
                    {uploadingId === cat.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Upload className="w-3.5 h-3.5" />
                    )}
                    {cat.imageUrl ? 'Changer' : 'Ajouter'}
                  </span>
                </div>
                <input
                  ref={(el) => {
                    fileRefs.current[cat.id] = el;
                  }}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleFileChange(cat.id, e)}
                />
              </div>

              <div className="p-4 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Titre</label>
                  <input
                    type="text"
                    value={cat.label}
                    onChange={(e) => updateLocal(cat.id, { label: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Prix affiché</label>
                  <input
                    type="text"
                    value={cat.priceRange || ''}
                    onChange={(e) => updateLocal(cat.id, { priceRange: e.target.value })}
                    placeholder="5 000 – 8 000 XPF / jour"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Modèle (détail)</label>
                  <input
                    type="text"
                    value={cat.model || ''}
                    onChange={(e) => updateLocal(cat.id, { model: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/20"
                  />
                </div>
                {cat.imageUrl && (
                  <button
                    type="button"
                    className="text-xs text-red-600 hover:underline"
                    onClick={() => {
                      updateLocal(cat.id, { imageUrl: null });
                      saveCategory(cat.id, { imageUrl: null });
                    }}
                  >
                    Retirer l&apos;image (revenir au défaut app)
                  </button>
                )}
                <button
                  type="button"
                  disabled={savingId === cat.id}
                  onClick={() => saveCategory(cat.id)}
                  className="w-full flex items-center justify-center gap-2 rounded-lg bg-black px-3 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
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
          ))}
        </div>
      )}
    </div>
  );
}
