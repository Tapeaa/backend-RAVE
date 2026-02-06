/**
 * Tape'a Back Office - Page Détails Collecte
 * Affiche le détail des courses d'une collecte
 */

import { useEffect, useState } from 'react';
import { Link, useParams, useLocation } from 'wouter';
import { ArrowLeft, Building2, User, Calendar, CreditCard, Banknote, Check, Clock } from 'lucide-react';

interface Course {
  id: string;
  date: string;
  clientName: string;
  totalPrice: number;
  driverEarnings: number;
  commission: number;
  fraisService?: number;
  commissionSupplementaire?: number;
  paymentMethod: string;
  status: string;
}

interface CollecteDetails {
  collecte: {
    id: string;
    periode: string;
    montantDu: number;
    fraisService?: number;
    commissionSupplementaire?: number;
    montantPaye: number;
    isPaid: boolean;
    paidAt: string | null;
  };
  prestataire: {
    id: string;
    nom: string;
    type: string;
  } | null;
  driver: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
  courses: Course[];
}

interface FraisConfig {
  fraisServicePrestataire: number;
  commissionPrestataire: number;
  commissionSalarieTapea: number;
}

export function AdminCollecteDetails() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const [data, setData] = useState<CollecteDetails | null>(null);
  const [fraisConfig, setFraisConfig] = useState<FraisConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchDetails();
    fetchFraisConfig();
  }, [params.id]);

  async function fetchDetails() {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch(`/api/admin/collecte/${params.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const result = await response.json();
        setData(result);
      }
    } catch (error) {
      console.error('Error fetching collecte details:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function fetchFraisConfig() {
    try {
      const response = await fetch('/api/frais-service-config');
      if (response.ok) {
        const result = await response.json();
        setFraisConfig(result.config);
      }
    } catch (error) {
      console.error('Error fetching frais config:', error);
    }
  }

  const formatPeriode = (periode: string) => {
    const [year, month] = periode.split('-');
    const months = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 
                    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
    return `${months[parseInt(month) - 1]} ${year}`;
  };

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-purple-600 border-t-transparent" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Collecte non trouvée</p>
        <Link href="/admin/collecte">
          <button className="mt-4 text-purple-600 hover:underline">Retour</button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/admin/collecte">
          <button className="rounded-lg p-2 text-gray-600 hover:bg-gray-100">
            <ArrowLeft className="h-5 w-5" />
          </button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Détail collecte - {formatPeriode(data.collecte.periode)}
          </h1>
          {data.prestataire && (
            <div className="flex items-center gap-2 text-gray-600">
              <Building2 className="h-4 w-4" />
              <span>{data.prestataire.nom}</span>
            </div>
          )}
          {data.driver && (
            <div className="flex items-center gap-2 text-gray-600">
              <User className="h-4 w-4" />
              <span>{data.driver.firstName} {data.driver.lastName}</span>
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-2xl font-bold text-purple-600">
            {data.courses.length}
          </div>
          <div className="text-sm text-gray-600">Courses</div>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-2xl font-bold text-gray-900">
            {data.courses.reduce((sum, c) => sum + c.totalPrice, 0).toLocaleString()} XPF
          </div>
          <div className="text-sm text-gray-600">Total courses</div>
        </div>
        <div className="rounded-lg bg-white p-4 shadow border-2 border-purple-200">
          <div className="text-2xl font-bold text-purple-600">
            {(data.collecte.fraisService || 0).toLocaleString()} XPF
          </div>
          <div className="text-sm text-gray-600">
            Frais service ({fraisConfig?.fraisServicePrestataire || 15}%)
          </div>
        </div>
        <div className="rounded-lg bg-white p-4 shadow border-2 border-orange-200">
          <div className="text-2xl font-bold text-orange-600">
            {(data.collecte.commissionSupplementaire || 0).toLocaleString()} XPF
          </div>
          <div className="text-sm text-gray-600">
            Commission supp. ({fraisConfig?.commissionPrestataire || 0}%)
          </div>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <div className={`text-2xl font-bold ${data.collecte.isPaid ? 'text-green-600' : 'text-red-600'}`}>
            {data.collecte.isPaid ? 'Payé' : (data.collecte.montantPaye || 0) > 0 ? 'Partiel' : 'En attente'}
          </div>
          <div className="text-sm text-gray-600">Statut</div>
        </div>
      </div>

      {/* Détail paiement : montant dû, déjà payé, restant */}
      <div className="rounded-lg border-2 border-green-200 bg-green-50 p-4">
        <h3 className="font-semibold text-gray-900 mb-3">Récapitulatif paiement</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <div className="text-sm text-gray-600">Total dû TAPEA</div>
            <div className="text-xl font-bold text-gray-900">
              {(data.collecte.montantDu || 0).toLocaleString()} XPF
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Déjà payé (Stripe)</div>
            <div className="text-xl font-bold text-green-600">
              {(data.collecte.montantPaye || 0).toLocaleString()} XPF
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Restant à percevoir</div>
            <div className="text-xl font-bold text-orange-600">
              {Math.max(0, (data.collecte.montantDu || 0) - (data.collecte.montantPaye || 0)).toLocaleString()} XPF
            </div>
          </div>
        </div>
      </div>

      {/* Courses table */}
      <div className="overflow-hidden rounded-lg bg-white shadow">
        <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
          <h2 className="font-semibold text-gray-900">Détail des courses</h2>
        </div>
        {data.courses.length === 0 ? (
          <div className="py-12 text-center text-gray-500">
            Aucune course enregistrée
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Date</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Client</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">Prix course</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-purple-700">
                  Frais service ({fraisConfig?.fraisServicePrestataire || 15}%)
                </th>
                {fraisConfig && fraisConfig.commissionPrestataire > 0 && (
                  <th className="px-4 py-3 text-right text-sm font-medium text-orange-700">
                    Commission ({fraisConfig.commissionPrestataire}%)
                  </th>
                )}
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">Total TAPEA</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">Paiement</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {data.courses.map((course) => (
                <tr
                  key={course.id}
                  onClick={() => setLocation(`/admin/commandes/${course.id}`)}
                  className="hover:bg-purple-50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 text-sm text-gray-900">
                      <Calendar className="h-4 w-4 text-gray-400" />
                      {new Date(course.date).toLocaleDateString('fr-FR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-gray-900">{course.clientName}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-medium text-gray-900">
                      {course.totalPrice.toLocaleString()} XPF
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-bold text-purple-600">
                      {(course.fraisService || 0).toLocaleString()} XPF
                    </span>
                  </td>
                  {fraisConfig && fraisConfig.commissionPrestataire > 0 && (
                    <td className="px-4 py-3 text-right">
                      <span className="font-bold text-orange-600">
                        {(course.commissionSupplementaire || 0).toLocaleString()} XPF
                      </span>
                    </td>
                  )}
                  <td className="px-4 py-3 text-right">
                    <span className="font-bold text-red-600">
                      {course.commission.toLocaleString()} XPF
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {course.paymentMethod === 'card' ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800">
                        <CreditCard className="h-3 w-3" />
                        Carte
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                        <Banknote className="h-3 w-3" />
                        Espèces
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {course.status === 'payment_confirmed' ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                        <Check className="h-3 w-3" />
                        Confirmé
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-1 text-xs font-medium text-orange-800">
                        <Clock className="h-3 w-3" />
                        {course.status}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50">
              <tr>
                <td colSpan={2} className="px-4 py-3 font-semibold text-gray-900">Total</td>
                <td className="px-4 py-3 text-right font-bold text-gray-900">
                  {data.courses.reduce((sum, c) => sum + c.totalPrice, 0).toLocaleString()} XPF
                </td>
                <td className="px-4 py-3 text-right font-bold text-purple-600">
                  {data.courses.reduce((sum, c) => sum + (c.fraisService || 0), 0).toLocaleString()} XPF
                </td>
                {fraisConfig && fraisConfig.commissionPrestataire > 0 && (
                  <td className="px-4 py-3 text-right font-bold text-orange-600">
                    {data.courses.reduce((sum, c) => sum + (c.commissionSupplementaire || 0), 0).toLocaleString()} XPF
                  </td>
                )}
                <td className="px-4 py-3 text-right font-bold text-red-600">
                  {data.courses.reduce((sum, c) => sum + c.commission, 0).toLocaleString()} XPF
                </td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}
