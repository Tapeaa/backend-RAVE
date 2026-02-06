/**
 * Tape'ā Back Office - Modal de détails de course en direct
 * Affiche les informations détaillées d'une course en cours
 */

import React, { useEffect, useState } from 'react';
import { X, MapPin, Clock, User, Car, Phone, DollarSign, Navigation, Loader } from 'lucide-react';

interface CourseDetailsModalProps {
  orderId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

interface AddressItem {
  type: 'pickup' | 'stop' | 'destination';
  value: string;
  latitude?: number;
  longitude?: number;
}

interface OrderDetails {
  id: string;
  clientName: string;
  clientPhone: string;
  addresses: AddressItem[];
  status: string;
  totalPrice: number;
  paymentMethod: string;
  passengers: number;
  supplements: Array<{ 
    id?: string;
    nom?: string;
    name?: string;
    prixXpf?: number | null;
    price?: number | null;
    quantity?: number;
    description?: string;
    typeSupplement?: string;
  }>;
  routeInfo?: {
    distance?: number | string;
    duration?: string;
  };
  driverComment?: string;
  scheduledTime?: string;
  isAdvanceBooking: boolean;
  createdAt: string;
  assignedDriverId?: string;
  driverEarnings?: number;
  chauffeur?: {
    firstName: string;
    lastName: string;
    phone: string;
    vehicleModel?: string;
    vehiclePlate?: string;
    lastLatitude?: number;
    lastLongitude?: number;
  };
  client?: {
    firstName: string;
    lastName: string;
    phone: string;
  };
}

function formatStatus(status: string): string {
  const statusMap: Record<string, string> = {
    pending: 'En attente',
    accepted: 'Acceptée',
    driver_enroute: 'Chauffeur en route',
    driver_arrived: 'Chauffeur arrivé',
    in_progress: 'En cours',
    completed: 'Terminée',
    payment_pending: 'Paiement en attente',
    payment_confirmed: 'Paiement confirmé',
    cancelled: 'Annulée',
  };
  return statusMap[status] || status;
}

function getStatusColor(status: string): string {
  const colorMap: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    accepted: 'bg-blue-100 text-blue-800',
    driver_enroute: 'bg-purple-100 text-purple-800',
    driver_arrived: 'bg-indigo-100 text-indigo-800',
    in_progress: 'bg-green-100 text-green-800',
    completed: 'bg-gray-100 text-gray-800',
    payment_pending: 'bg-orange-100 text-orange-800',
    payment_confirmed: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800',
  };
  return colorMap[status] || 'bg-gray-100 text-gray-800';
}

export function CourseDetailsModal({ orderId, isOpen, onClose }: CourseDetailsModalProps) {
  const [orderDetails, setOrderDetails] = useState<OrderDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !orderId) {
      setOrderDetails(null);
      setError(null);
      return;
    }

    const fetchOrderDetails = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const token = localStorage.getItem('admin_token');
        const response = await fetch(`/api/admin/commandes/${orderId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          throw new Error('Erreur lors du chargement des détails');
        }

        const data = await response.json();
        const addressesArray = Array.isArray(data.commande.addresses) ? data.commande.addresses : [];
        setOrderDetails({
          id: data.commande.id,
          clientName: data.commande.clientName,
          clientPhone: data.commande.clientPhone,
          addresses: addressesArray,
          status: data.commande.status,
          totalPrice: data.commande.totalPrice != null ? Number(data.commande.totalPrice) : 0,
          paymentMethod: data.commande.paymentMethod,
          passengers: data.commande.passengers,
          supplements: data.commande.supplements || [],
          routeInfo: data.commande.routeInfo || {},
          driverEarnings: data.commande.driverEarnings != null ? Number(data.commande.driverEarnings) : undefined,
          driverComment: data.commande.driverComment,
          scheduledTime: data.commande.scheduledTime,
          isAdvanceBooking: data.commande.isAdvanceBooking,
          createdAt: data.commande.createdAt,
          assignedDriverId: data.commande.assignedDriverId,
          chauffeur: data.chauffeur
            ? {
                firstName: data.chauffeur.firstName,
                lastName: data.chauffeur.lastName,
                phone: data.chauffeur.phone,
                vehicleModel: data.chauffeur.vehicleModel,
                vehiclePlate: data.chauffeur.vehiclePlate,
                lastLatitude: data.chauffeur.lastLatitude,
                lastLongitude: data.chauffeur.lastLongitude,
              }
            : undefined,
          client: data.client
            ? {
                firstName: data.client.firstName,
                lastName: data.client.lastName,
                phone: data.client.phone,
              }
            : undefined,
        });
      } catch (err) {
        console.error('Error fetching order details:', err);
        setError(err instanceof Error ? err.message : 'Erreur inconnue');
      } finally {
        setIsLoading(false);
      }
    };

    fetchOrderDetails();

    // Rafraîchir les détails toutes les 5 secondes si la course est en cours
    const interval = setInterval(() => {
      if (orderId) {
        fetchOrderDetails();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [isOpen, orderId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white p-6">
          <h2 className="text-xl font-bold text-gray-900">Détails de la course</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {isLoading && !orderDetails ? (
            <div className="flex items-center justify-center py-12">
              <Loader className="h-8 w-8 animate-spin text-purple-600" />
            </div>
          ) : error ? (
            <div className="rounded-lg bg-red-50 p-4 text-red-800">{error}</div>
          ) : orderDetails ? (
            <div className="space-y-6">
              {/* Statut */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-500">Statut</span>
                <span
                  className={`rounded-full px-3 py-1 text-sm font-semibold ${getStatusColor(
                    orderDetails.status
                  )}`}
                >
                  {formatStatus(orderDetails.status)}
                </span>
              </div>

              {/* Informations client */}
              <div className="rounded-lg border bg-gray-50 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <User className="h-5 w-5 text-purple-600" />
                  <h3 className="font-semibold text-gray-900">Client</h3>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-700">Nom:</span>
                    <span className="text-gray-900">{orderDetails.clientName}</span>
                  </div>
                  {orderDetails.client && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-gray-400" />
                      <span className="text-gray-700">{orderDetails.clientPhone}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Informations chauffeur */}
              {orderDetails.chauffeur && (
                <div className="rounded-lg border bg-blue-50 p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Car className="h-5 w-5 text-blue-600" />
                    <h3 className="font-semibold text-gray-900">Chauffeur</h3>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-700">Nom:</span>
                      <span className="text-gray-900">
                        {orderDetails.chauffeur.firstName} {orderDetails.chauffeur.lastName}
                      </span>
                    </div>
                    {orderDetails.chauffeur.vehicleModel && (
                      <div className="flex items-center gap-2">
                        <Car className="h-4 w-4 text-gray-400" />
                        <span className="text-gray-700">
                          {orderDetails.chauffeur.vehicleModel}
                          {orderDetails.chauffeur.vehiclePlate && ` - ${orderDetails.chauffeur.vehiclePlate}`}
                        </span>
                      </div>
                    )}
                    {orderDetails.chauffeur.lastLatitude && orderDetails.chauffeur.lastLongitude && (
                      <div className="flex items-center gap-2">
                        <Navigation className="h-4 w-4 text-gray-400" />
                        <span className="text-gray-700">
                          Position: {orderDetails.chauffeur.lastLatitude.toFixed(4)},{' '}
                          {orderDetails.chauffeur.lastLongitude.toFixed(4)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Adresses */}
              <div className="space-y-4">
                {(() => {
                  const addressesArray = Array.isArray(orderDetails.addresses) ? orderDetails.addresses : [];
                  const pickup = addressesArray.find((a) => a.type === 'pickup');
                  const destination = addressesArray.find((a) => a.type === 'destination') || addressesArray[addressesArray.length - 1];
                  const stops = addressesArray.filter((a) => a.type === 'stop');

                  return (
                    <>
                      {pickup && (
                        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                          <div className="mb-2 flex items-center gap-2">
                            <MapPin className="h-5 w-5 text-green-600" />
                            <h3 className="font-semibold text-gray-900">Point de départ</h3>
                          </div>
                          <p className="text-sm text-gray-700">{pickup.value}</p>
                        </div>
                      )}

                      {stops.length > 0 && (
                        <div className="space-y-2">
                          {stops.map((stop, index) => (
                            <div key={index} className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                              <div className="mb-2 flex items-center gap-2">
                                <MapPin className="h-5 w-5 text-blue-600" />
                                <h3 className="font-semibold text-gray-900">Arrêt {index + 1}</h3>
                              </div>
                              <p className="text-sm text-gray-700">{stop.value}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      {destination && (
                        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                          <div className="mb-2 flex items-center gap-2">
                            <MapPin className="h-5 w-5 text-red-600" />
                            <h3 className="font-semibold text-gray-900">Destination</h3>
                          </div>
                          <p className="text-sm text-gray-700">{destination.value}</p>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>

              {/* Détails de tarification */}
              <div className="rounded-lg border bg-white p-4">
                <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
                  <DollarSign className="h-5 w-5" />
                  Détails de tarification
                </h3>
                <div className="space-y-4">
                  {/* Distance */}
                  {orderDetails.routeInfo?.distance && (
                    <div className="rounded-lg border border-gray-200 p-4 bg-blue-50">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-sm font-medium text-gray-700">Distance parcourue</p>
                          <p className="text-xs text-gray-500 mt-1">Distance totale du trajet</p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-semibold text-gray-900">
                            {typeof orderDetails.routeInfo.distance === 'number' 
                              ? orderDetails.routeInfo.distance >= 1000 
                                ? `${(orderDetails.routeInfo.distance / 1000).toFixed(2)} km`
                                : `${orderDetails.routeInfo.distance.toFixed(0)} m`
                              : String(orderDetails.routeInfo.distance)}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Durée */}
                  {orderDetails.routeInfo?.duration && (
                    <div className="rounded-lg border border-gray-200 p-4 bg-gray-50">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-sm font-medium text-gray-700">Durée estimée</p>
                          <p className="text-xs text-gray-500 mt-1">Temps de trajet</p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-semibold text-gray-900">
                            {orderDetails.routeInfo.duration}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Nombre de passagers */}
                  <div className="rounded-lg border border-gray-200 p-4 bg-gray-50">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm font-medium text-gray-700">Nombre de passagers</p>
                        <p className="text-xs text-gray-500 mt-1">Incluant le client</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-semibold text-gray-900">
                          {orderDetails.passengers} personne{orderDetails.passengers > 1 ? 's' : ''}
                        </p>
                        {orderDetails.passengers > 5 && (
                          <p className="text-xs text-orange-600 font-medium mt-1">
                            Majoration +5 personnes appliquée
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Suppléments */}
                  {orderDetails.supplements && orderDetails.supplements.length > 0 && (
                    <div className="rounded-lg border border-gray-200 p-4 bg-purple-50">
                      <p className="text-sm font-medium text-gray-700 mb-3">Suppléments</p>
                      <div className="space-y-2">
                        {orderDetails.supplements.map((supplement: any, index: number) => {
                          const isAuto = supplement.typeSupplement === 'auto';
                          const isHeightSurcharge = supplement.name?.includes('hauteur') || supplement.id === 'height_surcharge';
                          const supplementName = supplement.name || supplement.nom || 'Supplément';
                          const supplementPrice = supplement.price != null ? supplement.price : (supplement.prixXpf != null ? supplement.prixXpf : 0);
                          const quantity = supplement.quantity || 1;
                          const totalPrice = Number(supplementPrice) * quantity;
                          
                          return (
                            <div 
                              key={supplement.id || index} 
                              className={`flex justify-between items-center p-2 rounded ${
                                isAuto ? 'bg-yellow-50 border border-yellow-200' : 'bg-white'
                              }`}
                            >
                              <div className="flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-medium text-gray-900">
                                    {supplementName}
                                  </span>
                                  {quantity > 1 && (
                                    <span className="text-xs text-gray-500">(x{quantity})</span>
                                  )}
                                  {isAuto && (
                                    <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">
                                      Auto
                                    </span>
                                  )}
                                  {isHeightSurcharge && (
                                    <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded">
                                      Majoration hauteur aller
                                    </span>
                                  )}
                                </div>
                                {supplement.description && (
                                  <p className="text-xs text-gray-500 mt-1">{supplement.description}</p>
                                )}
                              </div>
                              <div className="text-right ml-4">
                                <p className="text-sm font-semibold text-gray-900">
                                  {totalPrice.toLocaleString('fr-FR')} XPF
                                </p>
                                {quantity > 1 && (
                                  <p className="text-xs text-gray-500">
                                    {Number(supplementPrice).toLocaleString('fr-FR')} × {quantity}
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Résumé des majorations */}
                  {(orderDetails.passengers > 5 || (orderDetails.supplements && orderDetails.supplements.some((s: any) => s?.typeSupplement === 'auto' && (s.name?.includes('hauteur') || s.id === 'height_surcharge')))) && (
                    <div className="rounded-lg border-2 border-orange-200 p-4 bg-orange-50">
                      <p className="text-sm font-semibold text-orange-800 mb-3">📋 Majorations appliquées</p>
                      <div className="space-y-2 text-sm">
                        {orderDetails.passengers > 5 && (
                          <div className="flex justify-between items-center p-2 bg-white rounded border border-orange-200">
                            <div className="flex items-center gap-2">
                              <span className="text-orange-700 font-medium">Majoration +5 personnes</span>
                              <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded">
                                {orderDetails.passengers} passagers
                              </span>
                            </div>
                            <span className="text-orange-900 font-semibold">
                              {(() => {
                                const passengerSurcharge = orderDetails.supplements?.find((s: any) => 
                                  s.name?.toLowerCase().includes('personne') || 
                                  s.name?.toLowerCase().includes('passager') ||
                                  s.id === 'passenger_surcharge'
                                );
                                return passengerSurcharge 
                                  ? `${((passengerSurcharge.price || passengerSurcharge.prixXpf || 0) * (passengerSurcharge.quantity || 1)).toLocaleString('fr-FR')} XPF`
                                  : 'Incluse dans le total';
                              })()}
                            </span>
                          </div>
                        )}
                        {orderDetails.supplements && orderDetails.supplements.some((s: any) => s?.typeSupplement === 'auto' && (s.name?.includes('hauteur') || s.id === 'height_surcharge')) && (
                          <div className="flex justify-between items-center p-2 bg-white rounded border border-orange-200">
                            <div className="flex items-center gap-2">
                              <span className="text-orange-700 font-medium">Majoration hauteur aller</span>
                              <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">
                                Auto
                              </span>
                            </div>
                            <span className="text-orange-900 font-semibold">
                              {(() => {
                                const heightSupplements = orderDetails.supplements?.filter((s: any) => 
                                  s?.typeSupplement === 'auto' && (s.name?.includes('hauteur') || s.id === 'height_surcharge')
                                ) || [];
                                const total = heightSupplements.reduce((sum: number, s: any) => 
                                  sum + ((s.price || s.prixXpf || 0) * (s.quantity || 1)), 0
                                );
                                return `${total.toLocaleString('fr-FR')} XPF`;
                              })()}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Prix total et gains chauffeur */}
              <div className="rounded-lg border bg-white p-4">
                <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
                  <DollarSign className="h-5 w-5" />
                  Paiement
                </h3>
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-gray-500">Méthode</p>
                    <p className="font-medium text-gray-900">
                      {orderDetails.paymentMethod === 'card' ? '💳 Carte bancaire' : '💵 Espèces'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Prix total</p>
                    <p className="text-2xl font-bold text-purple-600">
                      {orderDetails.totalPrice != null 
                        ? `${Number(orderDetails.totalPrice).toLocaleString('fr-FR')} XPF`
                        : 'N/A'}
                    </p>
                  </div>
                  {orderDetails.driverEarnings != null && (
                    <div>
                      <p className="text-sm text-gray-500">Gains chauffeur</p>
                      <p className="font-medium text-gray-900">
                        {Number(orderDetails.driverEarnings).toLocaleString('fr-FR')} XPF
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Commentaire */}
              {orderDetails.driverComment && (
                <div className="rounded-lg border bg-yellow-50 p-4">
                  <h3 className="mb-2 text-sm font-semibold text-gray-900">Message du client</h3>
                  <p className="text-sm text-gray-700">{orderDetails.driverComment}</p>
                </div>
              )}

              {/* Informations temporelles */}
              <div className="rounded-lg border bg-gray-50 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <Clock className="h-4 w-4 text-gray-400" />
                  <span className="text-sm font-medium text-gray-500">Créée le</span>
                </div>
                <p className="text-sm text-gray-700">
                  {new Date(orderDetails.createdAt).toLocaleString('fr-FR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
                {orderDetails.isAdvanceBooking && orderDetails.scheduledTime && (
                  <>
                    <div className="mt-3 mb-2 flex items-center gap-2">
                      <Clock className="h-4 w-4 text-blue-400" />
                      <span className="text-sm font-medium text-gray-500">Réservation pour</span>
                    </div>
                    <p className="text-sm text-blue-700">
                      {new Date(orderDetails.scheduledTime).toLocaleString('fr-FR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </>
                )}
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 border-t bg-white p-6">
          <button
            onClick={onClose}
            className="w-full rounded-lg bg-purple-600 px-4 py-2 font-semibold text-white hover:bg-purple-700"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

export default CourseDetailsModal;
