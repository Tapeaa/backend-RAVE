/**
 * RAVE — Réservations du prestataire / loueur
 */

import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { Car, CreditCard, Banknote, Eye, Calendar } from 'lucide-react';

interface Course {
  id: string;
  date: string;
  clientName: string;
  pickupAddress: string;
  dropoffAddress: string;
  stops?: string[];
  totalPrice: number;
  driverEarnings: number;
  status: string;
  paymentMethod: string;
  driverName?: string;
}

const statusLabels: Record<string, string> = {
  pending: 'En attente',
  accepted: 'Acceptée',
  booked: 'Réservée',
  driver_enroute: 'En route',
  driver_arrived: 'Arrivé',
  in_progress: 'En cours',
  completed: 'Terminée',
  payment_pending: 'Paiement en attente',
  payment_confirmed: 'Payée',
  cancelled: 'Annulée',
};

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  accepted: 'bg-blue-100 text-blue-800',
  booked: 'bg-blue-100 text-blue-800',
  driver_enroute: 'bg-purple-100 text-purple-800',
  driver_arrived: 'bg-indigo-100 text-indigo-800',
  in_progress: 'bg-indigo-100 text-indigo-800',
  completed: 'bg-green-100 text-green-800',
  payment_pending: 'bg-orange-100 text-orange-800',
  payment_confirmed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
};

export function PrestataireCourses() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchCourses();
  }, []);

  async function fetchCourses() {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch('/api/prestataire/courses', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setCourses(data.courses || []);
      }
    } catch (error) {
      console.error('Error fetching courses:', error);
    } finally {
      setIsLoading(false);
    }
  }

  const completedCourses = courses.filter(
    (c) => c.status === 'completed' || c.status === 'payment_confirmed'
  );
  const pipelineCourses = courses.filter(
    (c) =>
      c.status === 'accepted' ||
      c.status === 'booked' ||
      c.status === 'completed' ||
      c.status === 'payment_confirmed'
  );
  const totalRevenu = pipelineCourses.reduce((sum, c) => sum + (c.totalPrice || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Réservations</h1>
        <p className="text-gray-600">Réservations de location liées à votre compte</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="text-3xl font-bold text-gray-900">{courses.length}</div>
          <div className="text-sm text-gray-500">Total réservations</div>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="text-3xl font-bold text-green-600">{completedCourses.length}</div>
          <div className="text-sm text-gray-500">Terminées</div>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="text-3xl font-bold text-purple-600">
            {totalRevenu.toLocaleString()} XPF
          </div>
          <div className="text-sm text-gray-500">Revenus locations</div>
        </div>
      </div>

      {/* Reservations List */}
      <div className="rounded-2xl bg-white shadow-sm">
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="font-semibold text-gray-900">Toutes les réservations</h2>
        </div>

        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-purple-600 border-t-transparent" />
          </div>
        ) : courses.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center text-gray-500">
            <Car className="mb-2 h-12 w-12 text-gray-300" />
            <p className="font-medium">Aucune réservation</p>
            <p className="text-sm">Les réservations apparaîtront ici</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {courses.map((course) => (
              <Link key={course.id} href={`/prestataire/courses/${course.id}`}>
                <div className="flex items-start gap-4 px-6 py-4 transition-colors hover:bg-gray-50 cursor-pointer">
                  {/* Status Icon */}
                  <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl ${
                    course.status === 'payment_confirmed' || course.status === 'completed'
                      ? 'bg-green-100' 
                      : course.status === 'cancelled' 
                        ? 'bg-red-100' 
                        : 'bg-gray-100'
                  }`}>
                    <Car className={`h-6 w-6 ${
                      course.status === 'payment_confirmed' || course.status === 'completed'
                        ? 'text-green-600' 
                        : course.status === 'cancelled' 
                          ? 'text-red-600' 
                          : 'text-gray-600'
                    }`} />
                  </div>
                  
                  {/* Main Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900">
                        {course.clientName}
                      </span>
                      {course.driverName && (
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                          {course.driverName}
                        </span>
                      )}
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[course.status] || 'bg-gray-100 text-gray-800'}`}>
                        {statusLabels[course.status] || course.status}
                      </span>
                    </div>
                    
                    {/* Addresses */}
                    <div className="mt-2 space-y-1">
                      {course.pickupAddress && (
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <div className="h-2 w-2 rounded-full bg-green-500 flex-shrink-0" />
                          <span className="truncate">{course.pickupAddress}</span>
                        </div>
                      )}
                      {course.stops?.map((stop, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm text-gray-500">
                          <div className="h-2 w-2 rounded-full bg-yellow-500 flex-shrink-0" />
                          <span className="truncate">{stop}</span>
                        </div>
                      ))}
                      {course.dropoffAddress && (
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <div className="h-2 w-2 rounded-full bg-red-500 flex-shrink-0" />
                          <span className="truncate">{course.dropoffAddress}</span>
                        </div>
                      )}
                    </div>

                    {/* Date */}
                    <div className="mt-2 flex items-center gap-1 text-xs text-gray-400">
                      <Calendar className="h-3 w-3" />
                      <span>
                        {new Date(course.date).toLocaleDateString('fr-FR', {
                          weekday: 'short',
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>

                  {/* Price & Payment */}
                    <div className="text-right flex-shrink-0">
                    <div className="text-lg font-bold text-gray-900">
                      {course.totalPrice?.toLocaleString()} XPF
                    </div>
                    <div className="mt-1 flex items-center justify-end gap-1 text-xs text-gray-500">
                      {course.paymentMethod === 'card' ? (
                        <>
                          <CreditCard className="h-3 w-3" />
                          <span>Carte</span>
                        </>
                      ) : (
                        <>
                          <Banknote className="h-3 w-3" />
                          <span>Espèces</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Action */}
                  <div className="flex-shrink-0">
                    <div className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-purple-600">
                      <Eye className="h-5 w-5" />
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
