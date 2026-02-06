/**
 * Tape'ā Back Office - Gestion des images du carrousel (PUB)
 */

import { useEffect, useState, useRef } from 'react';
import { Plus, Trash2, Edit2, ArrowUp, ArrowDown, Eye, EyeOff, Image, Upload, X, Loader2 } from 'lucide-react';

interface CarouselImage {
  id: string;
  title: string;
  imageUrl: string;
  linkUrl: string | null;
  position: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export function AdminCarousel() {
  const [images, setImages] = useState<CarouselImage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Form state
  const [formTitle, setFormTitle] = useState('');
  const [formLinkUrl, setFormLinkUrl] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchImages();
  }, []);

  async function fetchImages() {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch('/api/admin/carousel', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setImages(data.images || []);
      }
    } catch (error) {
      console.error('Error fetching carousel images:', error);
    } finally {
      setIsLoading(false);
    }
  }

  function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    // Vérifier le type
    if (!file.type.startsWith('image/')) {
      alert('Veuillez sélectionner une image');
      return;
    }

    // Vérifier la taille (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('L\'image est trop grande (max 5 Mo)');
      return;
    }

    setSelectedFile(file);

    // Créer un aperçu
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreviewUrl(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  }

  async function uploadImage(): Promise<string | null> {
    if (!selectedFile) return null;

    const formData = new FormData();
    formData.append('image', selectedFile);

    const response = await fetch('/api/upload/carousel', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error('Erreur lors de l\'upload');
    }

    const { url } = await response.json();
    return url;
  }

  async function handleAddImage() {
    if (!formTitle.trim()) {
      alert('Le titre est requis');
      return;
    }

    if (!selectedFile && !previewUrl) {
      alert('Veuillez sélectionner une image');
      return;
    }

    setIsSaving(true);
    try {
      let imageUrl = previewUrl;
      
      // Si c'est un nouveau fichier, l'uploader
      if (selectedFile) {
        imageUrl = await uploadImage();
        if (!imageUrl) throw new Error('Upload failed');
      }

      const token = localStorage.getItem('admin_token');
      const response = await fetch('/api/admin/carousel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: formTitle,
          imageUrl,
          linkUrl: formLinkUrl || null,
          position: images.length,
        }),
      });

      if (response.ok) {
        await fetchImages();
        resetForm();
        setIsAdding(false);
      } else {
        const error = await response.json();
        alert(error.error || 'Erreur lors de l\'ajout');
      }
    } catch (error) {
      console.error('Error adding image:', error);
      alert('Erreur lors de l\'ajout de l\'image');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleUpdateImage(id: string) {
    if (!formTitle.trim()) {
      alert('Le titre est requis');
      return;
    }

    setIsSaving(true);
    try {
      let imageUrl = previewUrl;
      
      // Si c'est un nouveau fichier, l'uploader
      if (selectedFile) {
        imageUrl = await uploadImage();
        if (!imageUrl) throw new Error('Upload failed');
      }

      const token = localStorage.getItem('admin_token');
      const body: any = {
        title: formTitle,
        linkUrl: formLinkUrl || null,
      };
      
      if (imageUrl) {
        body.imageUrl = imageUrl;
      }

      const response = await fetch(`/api/admin/carousel/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        await fetchImages();
        resetForm();
        setEditingId(null);
      } else {
        const error = await response.json();
        alert(error.error || 'Erreur lors de la mise à jour');
      }
    } catch (error) {
      console.error('Error updating image:', error);
      alert('Erreur lors de la mise à jour');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteImage(id: string) {
    if (!confirm('Supprimer cette image du carrousel ?')) return;

    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch(`/api/admin/carousel/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        await fetchImages();
      } else {
        alert('Erreur lors de la suppression');
      }
    } catch (error) {
      console.error('Error deleting image:', error);
      alert('Erreur de connexion');
    }
  }

  async function handleToggleActive(image: CarouselImage) {
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch(`/api/admin/carousel/${image.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isActive: !image.isActive }),
      });

      if (response.ok) {
        await fetchImages();
      }
    } catch (error) {
      console.error('Error toggling active:', error);
    }
  }

  async function handleMoveImage(id: string, direction: 'up' | 'down') {
    const currentIndex = images.findIndex(img => img.id === id);
    if (currentIndex === -1) return;
    
    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= images.length) return;

    try {
      const token = localStorage.getItem('admin_token');
      
      // Update both positions
      await fetch(`/api/admin/carousel/${images[currentIndex].id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ position: newIndex }),
      });
      
      await fetch(`/api/admin/carousel/${images[newIndex].id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ position: currentIndex }),
      });

      await fetchImages();
    } catch (error) {
      console.error('Error moving image:', error);
    }
  }

  function startEditing(image: CarouselImage) {
    setFormTitle(image.title);
    setFormLinkUrl(image.linkUrl || '');
    setPreviewUrl(image.imageUrl);
    setSelectedFile(null);
    setEditingId(image.id);
    setIsAdding(false);
  }

  function resetForm() {
    setFormTitle('');
    setFormLinkUrl('');
    setPreviewUrl(null);
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  function cancelEditing() {
    setEditingId(null);
    setIsAdding(false);
    resetForm();
  }

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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-500 to-rose-600 shadow-lg shadow-pink-500/30">
            <Image className="h-7 w-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Carrousel PUB</h1>
            <p className="text-slate-500">Gérez les images du carrousel de l'app client</p>
          </div>
        </div>
        <button
          onClick={() => {
            setIsAdding(true);
            setEditingId(null);
            resetForm();
          }}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-purple-700 px-5 py-2.5 text-white shadow-lg shadow-purple-500/30 hover:shadow-xl transition-all"
        >
          <Plus className="h-5 w-5" />
          Ajouter une image
        </button>
      </div>

      {/* Add/Edit Form */}
      {(isAdding || editingId) && (
        <div className="rounded-xl bg-white p-6 shadow-sm border-2 border-purple-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            {isAdding ? '➕ Nouvelle image' : '✏️ Modifier l\'image'}
          </h3>
          
          <div className="grid gap-4 md:grid-cols-2">
            {/* Colonne gauche - Infos */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Titre *
                </label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Ex: Promotion été 2024"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Lien (optionnel)
                </label>
                <input
                  type="url"
                  value={formLinkUrl}
                  onChange={(e) => setFormLinkUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                />
              </div>
            </div>
            
            {/* Colonne droite - Image */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Image *
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
              />
              
              {previewUrl ? (
                <div className="relative">
                  <img
                    src={previewUrl}
                    alt="Aperçu"
                    className="w-full h-40 object-cover rounded-lg border"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute bottom-2 right-2 rounded-lg bg-white/90 px-3 py-1.5 text-sm font-medium text-purple-600 hover:bg-white shadow"
                  >
                    Changer
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-purple-300 bg-purple-50 px-4 py-8 text-purple-600 hover:bg-purple-100 hover:border-purple-400 transition-colors"
                >
                  <Upload className="h-8 w-8" />
                  <span className="font-medium">Cliquez pour choisir une image</span>
                  <span className="text-xs text-gray-500">JPG, PNG, GIF (max 5 Mo)</span>
                </button>
              )}
            </div>
          </div>
          
          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={cancelEditing}
              className="rounded-lg bg-gray-200 px-4 py-2 text-gray-700 hover:bg-gray-300"
            >
              Annuler
            </button>
            <button
              onClick={() => isAdding ? handleAddImage() : handleUpdateImage(editingId!)}
              disabled={isSaving}
              className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-white hover:bg-purple-700 disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {isAdding ? 'Upload en cours...' : 'Enregistrement...'}
                </>
              ) : (
                isAdding ? 'Ajouter' : 'Enregistrer'
              )}
            </button>
          </div>
        </div>
      )}

      {/* Images List */}
      <div className="rounded-xl bg-white shadow-sm">
        {images.length === 0 ? (
          <div className="p-12 text-center">
            <Image className="mx-auto h-12 w-12 text-gray-400" />
            <p className="mt-4 text-gray-600">Aucune image dans le carrousel</p>
            <p className="text-sm text-gray-500">
              Cliquez sur "Ajouter une image" pour commencer
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {images.map((image, index) => (
              <div
                key={image.id}
                className={`p-4 flex items-center gap-4 ${!image.isActive ? 'opacity-50' : ''}`}
              >
                {/* Position controls */}
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => handleMoveImage(image.id, 'up')}
                    disabled={index === 0}
                    className="rounded p-1 hover:bg-gray-100 disabled:opacity-30"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <span className="text-center text-sm font-medium text-gray-500">
                    {index + 1}
                  </span>
                  <button
                    onClick={() => handleMoveImage(image.id, 'down')}
                    disabled={index === images.length - 1}
                    className="rounded p-1 hover:bg-gray-100 disabled:opacity-30"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                </div>

                {/* Image preview */}
                <img
                  src={image.imageUrl}
                  alt={image.title}
                  className="h-20 w-32 object-cover rounded-lg border"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = 'https://via.placeholder.com/128x80?text=Error';
                  }}
                />

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-gray-900 truncate">{image.title}</h3>
                  {image.linkUrl && (
                    <p className="text-xs text-blue-600 truncate">
                      🔗 {image.linkUrl}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggleActive(image)}
                    className={`rounded-lg p-2 ${
                      image.isActive 
                        ? 'text-green-600 hover:bg-green-50' 
                        : 'text-gray-400 hover:bg-gray-100'
                    }`}
                    title={image.isActive ? 'Désactiver' : 'Activer'}
                  >
                    {image.isActive ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
                  </button>
                  <button
                    onClick={() => startEditing(image)}
                    className="rounded-lg p-2 text-blue-600 hover:bg-blue-50"
                    title="Modifier"
                  >
                    <Edit2 className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => handleDeleteImage(image.id)}
                    className="rounded-lg p-2 text-red-600 hover:bg-red-50"
                    title="Supprimer"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Info box */}
      <div className="rounded-xl bg-blue-50 p-4">
        <h4 className="font-medium text-blue-900 mb-2">💡 Comment ça marche ?</h4>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• Les images s'affichent sur l'écran d'accueil de l'app client</li>
          <li>• Utilisez les flèches pour changer l'ordre d'affichage</li>
          <li>• Désactivez une image pour la masquer temporairement</li>
          <li>• Les images sont automatiquement optimisées lors de l'upload</li>
        </ul>
      </div>
    </div>
  );
}
