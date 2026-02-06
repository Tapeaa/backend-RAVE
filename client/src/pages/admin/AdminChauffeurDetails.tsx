/**
 * Tape'ā Back Office - Détails d'un chauffeur
 */

import { useEffect, useState, useRef } from 'react';
import { useLocation } from 'wouter';
import { ArrowLeft, User, Phone, Car, Calendar, MapPin, Edit2, Upload, X, Loader2, Check, Save, Trash2, ChevronRight } from 'lucide-react';

interface ChauffeurDetails {
  chauffeur: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    vehicleModel: string | null;
    vehicleColor: string | null;
    vehiclePlate: string | null;
    photoUrl: string | null;
    isActive: boolean;
    averageRating: number | null;
    totalRides: number;
    createdAt: string;
  };
  commandes: Array<{
    id: string;
    clientName: string;
    addresses: any;
    totalPrice: number;
    driverEarnings: number;
    status: string;
    paymentMethod: string;
    createdAt: string;
  }>;
}

export function AdminChauffeurDetails() {
  const [, setLocation] = useLocation();
  const [details, setDetails] = useState<ChauffeurDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Photo editing
  const [isEditingPhoto, setIsEditingPhoto] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Profile editing
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  
  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editForm, setEditForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    vehicleModel: '',
    vehicleColor: '',
    vehiclePlate: '',
  });
  
  const pathParts = window.location.pathname.split('/');
  const chauffeurId = pathParts[pathParts.length - 1];

  useEffect(() => {
    fetchDetails();
  }, [chauffeurId]);

  async function fetchDetails() {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch(`/api/admin/chauffeurs/${chauffeurId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setDetails(data);
        // Initialize edit form with current values
        if (data.chauffeur) {
          setEditForm({
            firstName: data.chauffeur.firstName || '',
            lastName: data.chauffeur.lastName || '',
            phone: data.chauffeur.phone || '',
            vehicleModel: data.chauffeur.vehicleModel || '',
            vehicleColor: data.chauffeur.vehicleColor || '',
            vehiclePlate: data.chauffeur.vehiclePlate || '',
          });
        }
      } else {
        setLocation('/admin/chauffeurs');
      }
    } catch (error) {
      console.error('Error fetching chauffeur details:', error);
    } finally {
      setIsLoading(false);
    }
  }

  // Photo handling
  function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Veuillez sélectionner une image');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('L\'image est trop grande (max 5 Mo)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      setPreviewUrl(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  }

  async function handleUploadPhoto() {
    if (!fileInputRef.current?.files?.[0] || !details) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', fileInputRef.current.files[0]);

      const uploadResponse = await fetch('/api/upload/driver-photo', {
        method: 'POST',
        body: formData,
      });

      if (!uploadResponse.ok) {
        throw new Error('Erreur lors de l\'upload');
      }

      const { url } = await uploadResponse.json();

      const token = localStorage.getItem('admin_token');
      const saveResponse = await fetch(`/api/admin/chauffeurs/${chauffeurId}/photo`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ photoUrl: url }),
      });

      if (saveResponse.ok) {
        const data = await saveResponse.json();
        setDetails({
          ...details,
          chauffeur: data.chauffeur,
        });
        setIsEditingPhoto(false);
        setPreviewUrl(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      } else {
        const error = await saveResponse.json();
        alert(error.error || 'Erreur lors de la sauvegarde');
      }
    } catch (error) {
      console.error('Error uploading photo:', error);
      alert('Erreur lors de l\'upload de la photo');
    } finally {
      setIsUploading(false);
    }
  }

  function cancelEditingPhoto() {
    setIsEditingPhoto(false);
    setPreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  // Profile editing
  function startEditingProfile() {
    if (details?.chauffeur) {
      setEditForm({
        firstName: details.chauffeur.firstName || '',
        lastName: details.chauffeur.lastName || '',
        phone: details.chauffeur.phone || '',
        vehicleModel: details.chauffeur.vehicleModel || '',
        vehicleColor: details.chauffeur.vehicleColor || '',
        vehiclePlate: details.chauffeur.vehiclePlate || '',
      });
    }
    setIsEditingProfile(true);
  }

  function cancelEditingProfile() {
    setIsEditingProfile(false);
    if (details?.chauffeur) {
      setEditForm({
        firstName: details.chauffeur.firstName || '',
        lastName: details.chauffeur.lastName || '',
        phone: details.chauffeur.phone || '',
        vehicleModel: details.chauffeur.vehicleModel || '',
        vehicleColor: details.chauffeur.vehicleColor || '',
        vehiclePlate: details.chauffeur.vehiclePlate || '',
      });
    }
  }

  async function handleSaveProfile() {
    if (!details) return;

    setIsSavingProfile(true);
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch(`/api/admin/chauffeurs/${chauffeurId}/profile`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(editForm),
      });

      if (response.ok) {
        const data = await response.json();
        setDetails({
          ...details,
          chauffeur: data.chauffeur,
        });
        setIsEditingProfile(false);
      } else {
        const error = await response.json();
        alert(error.error || 'Erreur lors de la sauvegarde');
      }
    } catch (error) {
      console.error('Error saving profile:', error);
      alert('Erreur de connexion');
    } finally {
      setIsSavingProfile(false);
    }
  }

  function formatCurrency(amount: number): string {
    return amount.toLocaleString('fr-FR') + ' XPF';
  }

  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  async function handleDeleteChauffeur() {
    if (!showDeleteConfirm) {
      setShowDeleteConfirm(true);
      return;
    }

    setIsDeleting(true);
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch(`/api/admin/chauffeurs/${chauffeurId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        // Rediriger vers la liste des chauffeurs après suppression
        setLocation('/admin/chauffeurs');
      } else {
        const data = await response.json();
        alert(data.error || 'Erreur lors de la suppression');
        setShowDeleteConfirm(false);
      }
    } catch (error) {
      console.error('Error deleting chauffeur:', error);
      alert('Erreur lors de la suppression du chauffeur');
      setShowDeleteConfirm(false);
    } finally {
      setIsDeleting(false);
    }
  }

  function getAddressFromOrder(commande: { addresses: any }, type: 'pickup' | 'destination'): string {
    const addrs = commande.addresses;
    if (!addrs) return 'Non spécifié';
    const arr = Array.isArray(addrs) ? addrs : [];
    const addr = arr.find((a: any) => a.type === type);
    return (addr?.value ?? addr?.address) || 'Non spécifié';
  }

  function getStatusBadge(status: string) {
    const statusConfig: Record<string, { label: string; color: string }> = {
      pending: { label: 'En attente', color: 'bg-yellow-100 text-yellow-700' },
      accepted: { label: 'Acceptée', color: 'bg-blue-100 text-blue-700' },
      in_progress: { label: 'En cours', color: 'bg-orange-100 text-orange-700' },
      completed: { label: 'Terminée', color: 'bg-green-100 text-green-700' },
      payment_confirmed: { label: 'Paiement confirmé', color: 'bg-green-100 text-green-700' },
      cancelled: { label: 'Annulée', color: 'bg-red-100 text-red-700' },
    };
    const config = statusConfig[status] || { label: status, color: 'bg-gray-100 text-gray-700' };
    return (
      <span className={`rounded-full px-2 py-1 text-xs font-medium ${config.color}`}>
        {config.label}
      </span>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-purple-600 border-t-transparent" />
      </div>
    );
  }

  if (!details || !details.chauffeur) {
    return (
      <div className="text-center text-red-600">
        Chauffeur non trouvé
      </div>
    );
  }

  const { chauffeur, commandes } = details;
  const totalEarnings = commandes
    .filter(c => c.status === 'completed' || c.status === 'payment_confirmed')
    .reduce((sum, c) => sum + c.driverEarnings, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <button
            onClick={() => setLocation('/admin/chauffeurs')}
            className="rounded-lg p-2 hover:bg-gray-100 shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
                {chauffeur.firstName} {chauffeur.lastName}
              </h1>
              {chauffeur.isActive ? (
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                  Actif
                </span>
              ) : (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                  Inactif
                </span>
              )}
            </div>
            <p className="text-sm text-gray-600 truncate">ID: {chauffeur.id}</p>
          </div>
        </div>
        <button
          onClick={handleDeleteChauffeur}
          disabled={isDeleting}
          className={`w-full sm:w-auto flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
            showDeleteConfirm
              ? 'bg-red-600 text-white hover:bg-red-700'
              : 'bg-red-100 text-red-700 hover:bg-red-200'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          <Trash2 className="h-4 w-4" />
          {showDeleteConfirm ? (isDeleting ? 'Suppression...' : 'Confirmer') : 'Supprimer'}
        </button>
      </div>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-3">
        {/* Informations chauffeur */}
        <div className="lg:col-span-1">
          <div className="rounded-xl bg-white p-4 sm:p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Informations</h2>
              {!isEditingProfile && (
                <button
                  onClick={startEditingProfile}
                  className="flex items-center gap-1 rounded-lg bg-purple-100 px-3 py-1.5 text-sm font-medium text-purple-700 hover:bg-purple-200"
                >
                  <Edit2 className="h-4 w-4" />
                  Modifier
                </button>
              )}
            </div>
            
            {/* Photo de profil */}
            <div className="mb-6 flex flex-col items-center">
              <div className="relative">
                {(previewUrl || chauffeur.photoUrl) ? (
                  <img 
                    src={previewUrl || chauffeur.photoUrl || ''} 
                    alt={`${chauffeur.firstName} ${chauffeur.lastName}`}
                    className="h-32 w-32 rounded-xl object-cover border-4 border-purple-100"
                  />
                ) : (
                  <div className="h-32 w-32 rounded-xl bg-gray-200 flex items-center justify-center border-4 border-gray-100">
                    <User className="h-16 w-16 text-gray-400" />
                  </div>
                )}
                {!isEditingPhoto && (
                  <button
                    onClick={() => setIsEditingPhoto(true)}
                    className="absolute bottom-0 right-0 rounded-full bg-purple-600 p-2 text-white hover:bg-purple-700 shadow-lg"
                    title="Modifier la photo"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              
              {/* Éditeur de photo */}
              {isEditingPhoto && (
                <div className="mt-4 w-full space-y-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  
                  {!previewUrl ? (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-purple-300 bg-purple-50 px-4 py-6 text-purple-600 hover:bg-purple-100 hover:border-purple-400 transition-colors"
                    >
                      <Upload className="h-6 w-6" />
                      <span className="font-medium">Choisir une photo</span>
                    </button>
                  ) : (
                    <div className="text-center text-sm text-green-600 font-medium">
                      ✓ Photo sélectionnée
                    </div>
                  )}
                  
                  <div className="flex gap-2">
                    <button
                      onClick={handleUploadPhoto}
                      disabled={isUploading || !previewUrl}
                      className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isUploading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Upload...
                        </>
                      ) : (
                        'Enregistrer'
                      )}
                    </button>
                    <button
                      onClick={cancelEditingPhoto}
                      disabled={isUploading}
                      className="rounded-lg bg-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-300"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Mode édition du profil */}
            {isEditingProfile ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Prénom</label>
                    <input
                      type="text"
                      value={editForm.firstName}
                      onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Nom</label>
                    <input
                      type="text"
                      value={editForm.lastName}
                      onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Téléphone</label>
                  <input
                    type="tel"
                    value={editForm.phone}
                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                  />
                </div>
                
                <div className="border-t pt-4">
                  <p className="text-xs font-medium text-gray-500 mb-3 flex items-center gap-1">
                    <Car className="h-4 w-4" /> Véhicule
                  </p>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Modèle</label>
                      <input
                        type="text"
                        value={editForm.vehicleModel}
                        onChange={(e) => setEditForm({ ...editForm, vehicleModel: e.target.value })}
                        placeholder="Ex: Toyota Prius"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Couleur</label>
                      <input
                        type="text"
                        value={editForm.vehicleColor}
                        onChange={(e) => setEditForm({ ...editForm, vehicleColor: e.target.value })}
                        placeholder="Ex: Blanc"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Plaque d'immatriculation</label>
                      <input
                        type="text"
                        value={editForm.vehiclePlate}
                        onChange={(e) => setEditForm({ ...editForm, vehiclePlate: e.target.value })}
                        placeholder="Ex: AB-123-CD"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                      />
                    </div>
                  </div>
                </div>
                
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={handleSaveProfile}
                    disabled={isSavingProfile}
                    className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
                  >
                    {isSavingProfile ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Enregistrement...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4" />
                        Enregistrer
                      </>
                    )}
                  </button>
                  <button
                    onClick={cancelEditingProfile}
                    disabled={isSavingProfile}
                    className="rounded-lg bg-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-300"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            ) : (
              /* Mode affichage */
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <User className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="text-sm text-gray-500">Nom complet</p>
                    <p className="font-medium text-gray-900">
                      {chauffeur.firstName} {chauffeur.lastName}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Phone className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="text-sm text-gray-500">Téléphone</p>
                    <p className="font-medium text-gray-900">{chauffeur.phone}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Car className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="text-sm text-gray-500">Véhicule</p>
                    <p className="font-medium text-gray-900">
                      {chauffeur.vehicleModel || 'Non renseigné'}
                      {chauffeur.vehicleColor && ` - ${chauffeur.vehicleColor}`}
                    </p>
                    {chauffeur.vehiclePlate && (
                      <p className="text-sm text-gray-600">{chauffeur.vehiclePlate}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Calendar className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="text-sm text-gray-500">Inscription</p>
                    <p className="font-medium text-gray-900">
                      {new Date(chauffeur.createdAt).toLocaleDateString('fr-FR')}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Statistiques */}
          <div className="mt-6 rounded-xl bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Statistiques</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg bg-purple-50 p-4 text-center">
                <p className="text-2xl font-bold text-purple-600">{chauffeur.totalRides}</p>
                <p className="text-sm text-gray-600">Courses</p>
              </div>
              <div className="rounded-lg bg-green-50 p-4 text-center">
                <p className="text-2xl font-bold text-green-600">
                  {formatCurrency(totalEarnings)}
                </p>
                <p className="text-sm text-gray-600">Gains totaux</p>
              </div>
            </div>
          </div>
        </div>

        {/* Historique des commandes */}
        <div className="lg:col-span-2">
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">
              Historique des courses ({commandes.length})
            </h2>
            {commandes.length === 0 ? (
              <p className="text-center text-gray-500 py-8">
                Aucune course pour le moment
              </p>
            ) : (
              <div className="space-y-3">
                {commandes.map((commande) => (
                  <button
                    key={commande.id}
                    type="button"
                    onClick={() => setLocation(`/admin/commandes/${commande.id}`)}
                    className="w-full rounded-lg border border-gray-100 p-4 text-left hover:bg-gray-50 hover:border-purple-200 transition-colors cursor-pointer group"
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-1 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-gray-900">
                            {commande.clientName || 'Client inconnu'}
                          </span>
                          {getStatusBadge(commande.status)}
                        </div>
                        <div className="text-sm text-gray-600">
                          <div className="flex items-center gap-1">
                            <MapPin className="h-3 w-3 shrink-0" />
                            <span className="truncate">{getAddressFromOrder(commande, 'pickup')}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <MapPin className="h-3 w-3 shrink-0 text-green-500" />
                            <span className="truncate">{getAddressFromOrder(commande, 'destination')}</span>
                          </div>
                        </div>
                        <p className="text-xs text-gray-500">
                          {formatDate(commande.createdAt)}
                        </p>
                      </div>
                      <div className="text-right shrink-0 flex items-center gap-2">
                        <div>
                          <p className="font-semibold text-gray-900">
                            {formatCurrency(commande.totalPrice)}
                          </p>
                          <p className="text-sm text-green-600">
                            Gains: {formatCurrency(commande.driverEarnings)}
                          </p>
                          <p className="text-xs text-gray-500">
                            {commande.paymentMethod === 'card' ? '💳 Carte' : '💵 Espèces'}
                          </p>
                        </div>
                        <ChevronRight className="h-5 w-5 text-gray-400 group-hover:text-purple-600 transition-colors" />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
