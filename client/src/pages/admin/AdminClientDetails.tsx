/**
 * Tape'ā Back Office - Détails d'un client
 */

import { useEffect, useState } from 'react';
import { useLocation, Link } from 'wouter';
import { ArrowLeft, User, Mail, Phone, Wallet, Calendar, Eye, CreditCard, Trash2 } from 'lucide-react';

interface ClientDetails {
  client: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string;
    isVerified: boolean;
    walletBalance: number;
    averageRating: number | null;
    totalRides: number;
    createdAt: string;
  };
  commandes: Array<{
    id: string;
    clientName: string;
    addresses: any;
    totalPrice: number;
    status: string;
    paymentMethod: string;
    createdAt: string;
  }>;
}

export function AdminClientDetails() {
  const [, setLocation] = useLocation();
  const [details, setDetails] = useState<ClientDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  const pathParts = window.location.pathname.split('/');
  const clientId = pathParts[pathParts.length - 1];

  useEffect(() => {
    fetchDetails();
  }, [clientId]);

  async function fetchDetails() {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch(`/api/admin/clients/${clientId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setDetails(data);
      } else {
        setLocation('/admin/clients');
      }
    } catch (error) {
      console.error('Error fetching client details:', error);
    } finally {
      setIsLoading(false);
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

  async function handleDeleteClient() {
    if (!showDeleteConfirm) {
      setShowDeleteConfirm(true);
      return;
    }

    setIsDeleting(true);
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch(`/api/admin/clients/${clientId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        // Rediriger vers la liste des clients après suppression
        setLocation('/admin/clients');
      } else {
        const data = await response.json();
        alert(data.error || 'Erreur lors de la suppression');
        setShowDeleteConfirm(false);
      }
    } catch (error) {
      console.error('Error deleting client:', error);
      alert('Erreur lors de la suppression du client');
      setShowDeleteConfirm(false);
    } finally {
      setIsDeleting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-purple-600 border-t-transparent" />
      </div>
    );
  }

  if (!details || !details.client) {
    return (
      <div className="text-center text-red-600">
        Client non trouvé
      </div>
    );
  }

  const { client, commandes } = details;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setLocation('/admin/clients')}
            className="rounded-lg p-2 hover:bg-gray-100"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {client.firstName} {client.lastName}
            </h1>
            <p className="text-gray-600">ID: {client.id}</p>
          </div>
        </div>
        <button
          onClick={handleDeleteClient}
          disabled={isDeleting}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            showDeleteConfirm
              ? 'bg-red-600 text-white hover:bg-red-700'
              : 'bg-red-100 text-red-700 hover:bg-red-200'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          <Trash2 className="h-4 w-4" />
          {showDeleteConfirm ? (isDeleting ? 'Suppression...' : 'Confirmer la suppression') : 'Supprimer le client'}
        </button>
      </div>

      {showDeleteConfirm && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4">
          <p className="text-sm text-red-800">
            ⚠️ <strong>Attention !</strong> Cette action est irréversible. Toutes les données du client seront supprimées définitivement :
          </p>
          <ul className="mt-2 ml-6 text-sm text-red-700 list-disc space-y-1">
            <li>Le compte client</li>
            <li>Toutes les sessions</li>
            <li>Toutes les commandes</li>
            <li>Toutes les notes et commentaires</li>
            <li>Les méthodes de paiement</li>
            <li>Toutes les autres données associées</li>
          </ul>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="rounded-lg bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300"
            >
              Annuler
            </button>
            <button
              onClick={handleDeleteClient}
              disabled={isDeleting}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {isDeleting ? 'Suppression...' : 'Oui, supprimer définitivement'}
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Informations client */}
        <div className="lg:col-span-1">
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Informations</h2>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <User className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Nom complet</p>
                  <p className="font-medium text-gray-900">
                    {client.firstName} {client.lastName}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Phone className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Téléphone</p>
                  <p className="font-medium text-gray-900">{client.phone}</p>
                </div>
              </div>
              {client.email && (
                <div className="flex items-center gap-3">
                  <Mail className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="text-sm text-gray-500">Email</p>
                    <p className="font-medium text-gray-900">{client.email}</p>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-3">
                <Wallet className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Portefeuille</p>
                  <p className="font-medium text-gray-900">
                    {formatCurrency(client.walletBalance)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Inscription</p>
                  <p className="font-medium text-gray-900">
                    {new Date(client.createdAt).toLocaleDateString('fr-FR')}
                  </p>
                </div>
              </div>
              <div className="pt-2 border-t">
                <p className="text-sm text-gray-500">Statut</p>
                {client.isVerified ? (
                  <span className="inline-block mt-1 rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700">
                    Vérifié
                  </span>
                ) : (
                  <span className="inline-block mt-1 rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
                    Non vérifié
                  </span>
                )}
              </div>
              {client.averageRating && (
                <div className="pt-2 border-t">
                  <p className="text-sm text-gray-500">Note moyenne</p>
                  <p className="font-medium text-gray-900">
                    {client.averageRating.toFixed(1)} / 5
                  </p>
                </div>
              )}
              <div className="pt-2 border-t">
                <p className="text-sm text-gray-500">Total courses</p>
                <p className="font-medium text-gray-900">{client.totalRides}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Historique des commandes */}
        <div className="lg:col-span-2">
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">
              Historique des commandes ({commandes.length})
            </h2>
            {commandes.length === 0 ? (
              <p className="text-center text-gray-500 py-8">Aucune commande</p>
            ) : (
              <div className="space-y-4">
                {commandes.map((commande) => {
                  const addresses = commande.addresses || {};
                  const pickup = addresses.pickup || {};
                  const dropoff = addresses.dropoff || {};
                  
                  return (
                    <div
                      key={commande.id}
                      className="rounded-lg border border-gray-200 p-4 hover:bg-gray-50"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <p className="font-medium text-gray-900">
                              {pickup.address || 'Départ'} → {dropoff.address || 'Destination'}
                            </p>
                            {getStatusBadge(commande.status)}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-gray-600">
                            <span>{formatDate(commande.createdAt)}</span>
                            <span className="flex items-center gap-1">
                              {commande.paymentMethod === 'card' ? (
                                <CreditCard className="h-4 w-4" />
                              ) : (
                                <Wallet className="h-4 w-4" />
                              )}
                              {commande.paymentMethod === 'card' ? 'Carte' : 'Espèces'}
                            </span>
                            <span className="font-semibold text-gray-900">
                              {formatCurrency(commande.totalPrice)}
                            </span>
                          </div>
                        </div>
                        <Link
                          href={`/admin/commandes/${commande.id}`}
                          className="ml-4 rounded-lg bg-purple-600 px-3 py-1.5 text-sm text-white hover:bg-purple-700"
                        >
                          <Eye className="h-4 w-4" />
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminClientDetails;
