/**
 * RAVE — Réservations du prestataire / loueur
 */

import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { Car, Eye, Calendar } from 'lucide-react';
import { PaymentStatusBadge } from '@/components/rental/PaymentStatusBadge';
import {
  getRefundState,
  getRentalStatusDisplay,
  isCompletedOrderStatus,
  TONE_BADGE_CLASSES,
  type StatusTone,
} from '@/lib/rental-status';

interface Course {
  rideOption?: any;
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

const ICON_TONE_CLASSES: Record<StatusTone, { bg: string; fg: string }> = {
  green: { bg: 'bg-green-100', fg: 'text-green-600' },
  blue: { bg: 'bg-blue-100', fg: 'text-blue-600' },
  amber: { bg: 'bg-amber-100', fg: 'text-amber-600' },
  red: { bg: 'bg-red-100', fg: 'text-red-600' },
  gray: { bg: 'bg-gray-100', fg: 'text-gray-600' },
};

function formatShortDate(value?: string) {
  if (!value) return '';
  return new Date(value).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'Pacific/Tahiti' });
}

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

  const isCourseDone = (c: Course) =>
    (isCompletedOrderStatus(c.status) || c.rideOption?.rentalLifecyclePhase === 'returned') &&
    !getRefundState(c);
  const completedCourses = courses.filter(isCourseDone);
  const activeCourses = courses.filter(
    (c) => (c.status === 'accepted' || c.status === 'booked') && !isCourseDone(c) && !getRefundState(c)
  );
  const totalRevenu = completedCourses.reduce((sum, c) => sum + (c.totalPrice || 0), 0);
  const upcomingRevenu = activeCourses.reduce((sum, c) => sum + (c.totalPrice || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Réservations</h1>
        <p className="text-gray-600">Réservations de location liées à votre compte</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <div className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
          <div className="text-2xl font-bold text-gray-900 sm:text-3xl">{courses.length}</div>
          <div className="text-sm text-gray-500">
            Demandes &amp; réservations{activeCourses.length > 0 ? ` · ${activeCourses.length} en cours` : ''}
          </div>
        </div>
        <div className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
          <div className="text-2xl font-bold text-green-600 sm:text-3xl">{completedCourses.length}</div>
          <div className="text-sm text-gray-500">Terminées</div>
        </div>
        <div className="col-span-2 rounded-2xl bg-white p-4 shadow-sm sm:p-5 lg:col-span-1">
          <div className="text-2xl font-bold text-gray-900 sm:text-3xl">
            {totalRevenu.toLocaleString('fr-FR')} XPF
          </div>
          <div className="text-sm text-gray-500">
            Revenus acquis
            {upcomingRevenu > 0 ? ` · +${upcomingRevenu.toLocaleString('fr-FR')} XPF à venir` : ''}
          </div>
        </div>
      </div>

      {/* Reservations List */}
      <div className="rounded-2xl bg-white shadow-sm">
        <div className="border-b border-gray-100 px-4 py-4 sm:px-6">
          <h2 className="font-semibold text-gray-900">Toutes les réservations</h2>
        </div>

        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-900 border-t-transparent" />
          </div>
        ) : courses.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center text-gray-500">
            <Car className="mb-2 h-12 w-12 text-gray-300" />
            <p className="font-medium">Aucune réservation</p>
            <p className="text-sm">Les réservations apparaîtront ici</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {courses.map((course) => {
              const status = getRentalStatusDisplay(course);
              const iconTone = ICON_TONE_CLASSES[status.tone];
              const ro = course.rideOption || {};
              return (
              <Link key={course.id} href={`/prestataire/courses/${course.id}`}>
                <div className="flex items-start gap-3 px-4 py-4 transition-colors hover:bg-gray-50 cursor-pointer sm:gap-4 sm:px-6">
                  {/* Status Icon */}
                  <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl sm:h-12 sm:w-12 ${iconTone.bg}`}>
                    <Car className={`h-5 w-5 sm:h-6 sm:w-6 ${iconTone.fg}`} />
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
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TONE_BADGE_CLASSES[status.tone]}`}>
                        {status.label}
                      </span>
                    </div>
                    
                    <div className="mt-2 space-y-1 text-sm text-gray-600">
                      <div className="truncate font-medium text-gray-800">{ro.title || 'Véhicule'}</div>
                      {(ro.startDate || ro.endDate) && (
                        <div className="truncate">
                          {formatShortDate(ro.startDate)} → {formatShortDate(ro.endDate)}
                          {ro.days ? ` · ${ro.days} jour${ro.days > 1 ? 's' : ''}` : ''}
                        </div>
                      )}
                      {course.pickupAddress && (
                        <div className="truncate text-gray-500">{course.pickupAddress}</div>
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

                    <div className="mt-3 flex items-center justify-between gap-2 border-t border-gray-100 pt-3 sm:hidden">
                      <div className="text-base font-bold text-gray-900">
                        {course.totalPrice?.toLocaleString()} XPF
                      </div>
                      <PaymentStatusBadge course={course} />
                    </div>
                  </div>

                  {/* Price & Payment */}
                    <div className="hidden text-right flex-shrink-0 sm:block">
                    <div className="text-lg font-bold text-gray-900">
                      {course.totalPrice?.toLocaleString()} XPF
                    </div>
                    <div className="mt-1 flex justify-end">
                      <PaymentStatusBadge course={course} />
                    </div>
                  </div>

                  {/* Action */}
                  <div className="hidden flex-shrink-0 sm:block">
                    <div className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-900">
                      <Eye className="h-5 w-5" />
                    </div>
                  </div>
                </div>
              </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
