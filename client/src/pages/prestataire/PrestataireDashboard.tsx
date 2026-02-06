/**
 * Tape'a Back Office - Dashboard Prestataire
 * Vue d'ensemble pour les prestataires (sociétés et patentés)
 */

import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { 
  Car, Users, Wallet, TrendingUp, 
  ArrowRight, Clock, Calendar, MapPin,
  CreditCard, Banknote, ChevronDown, ChevronUp
} from 'lucide-react';

interface PrestataireInfo {
  id: string;
  nom: string;
  type: string;
  isSociete: boolean;
  totalChauffeurs: number;
}

interface Stats {
  totalChauffeurs: number;
  revenusGlobal: number;
  revenusSemaine: number;
  revenusMois: number;
  coursesAujourdhui: number;
  coursesSemaine: number;
  coursesMois: number;
  totalCourses: number;
  commissionsDues: number;
}

interface Course {
  id: string;
  date: string;
  clientName: string;
  pickupAddress: string;
  dropoffAddress: string;
  stops?: string[];
  totalPrice: number;
  driverEarnings: number;
  paymentMethod: string;
  status: string;
  driverName?: string;
}

export function PrestataireDashboard() {
  const [prestataire, setPrestataire] = useState<PrestataireInfo | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentCourses, setRecentCourses] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAllCourses, setShowAllCourses] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('admin_token');
      const headers = { Authorization: `Bearer ${token}` };

      const [infoRes, statsRes, coursesRes] = await Promise.all([
        fetch('/api/prestataire/me', { headers }),
        fetch('/api/prestataire/stats', { headers }),
        fetch('/api/prestataire/courses?limit=10', { headers }),
      ]);

      if (infoRes.ok) {
        const infoData = await infoRes.json();
        setPrestataire(infoData.prestataire);
      }

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData.stats);
      }

      if (coursesRes.ok) {
        const coursesData = await coursesRes.json();
        setRecentCourses(coursesData.courses || []);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsLoading(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-purple-600 border-t-transparent" />
      </div>
    );
  }

  const displayedCourses = showAllCourses ? recentCourses : recentCourses.slice(0, 5);

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-purple-600 via-purple-700 to-indigo-800 p-8">
        <div className="absolute right-0 top-0 h-64 w-64 translate-x-1/3 -translate-y-1/3 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-48 w-48 -translate-x-1/3 translate-y-1/3 rounded-full bg-purple-400/20 blur-2xl" />
        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
              {prestataire?.isSociete ? (
                <Users className="h-6 w-6 text-white" />
              ) : (
                <Car className="h-6 w-6 text-white" />
              )}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">{prestataire?.nom}</h1>
              <p className="text-purple-200">
                {prestataire?.isSociete 
                  ? `Société de transport`
                  : 'Chauffeur indépendant'
                }
              </p>
            </div>
          </div>
          
          {/* Mini stats in hero */}
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-xl bg-white/10 p-4 backdrop-blur-sm">
              <div className="text-2xl font-bold text-white">{stats?.totalCourses || 0}</div>
              <div className="text-sm text-purple-200">Total courses</div>
            </div>
            <div className="rounded-xl bg-white/10 p-4 backdrop-blur-sm">
              <div className="text-2xl font-bold text-white">{stats?.revenusGlobal?.toLocaleString() || 0}</div>
              <div className="text-sm text-purple-200">XPF gagnés</div>
            </div>
            {prestataire?.isSociete && (
              <div className="rounded-xl bg-white/10 p-4 backdrop-blur-sm">
                <div className="text-2xl font-bold text-white">{stats?.totalChauffeurs || 0}</div>
                <div className="text-sm text-purple-200">Chauffeurs</div>
              </div>
            )}
            <div className="rounded-xl bg-white/10 p-4 backdrop-blur-sm">
              <div className="text-2xl font-bold text-yellow-300">{stats?.commissionsDues?.toLocaleString() || 0}</div>
              <div className="text-sm text-purple-200">XPF à payer</div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="group relative overflow-hidden rounded-2xl bg-white p-6 shadow-sm transition-all hover:shadow-lg">
          <div className="absolute right-0 top-0 h-24 w-24 translate-x-8 -translate-y-8 rounded-full bg-green-100 transition-transform group-hover:scale-150" />
          <div className="relative">
            <div className="mb-4 inline-flex rounded-xl bg-green-100 p-3">
              <Wallet className="h-6 w-6 text-green-600" />
            </div>
            <div className="text-3xl font-bold text-gray-900">
              {stats?.revenusMois?.toLocaleString() || 0}
            </div>
            <div className="text-sm font-medium text-gray-500">XPF ce mois</div>
          </div>
        </div>

        <div className="group relative overflow-hidden rounded-2xl bg-white p-6 shadow-sm transition-all hover:shadow-lg">
          <div className="absolute right-0 top-0 h-24 w-24 translate-x-8 -translate-y-8 rounded-full bg-blue-100 transition-transform group-hover:scale-150" />
          <div className="relative">
            <div className="mb-4 inline-flex rounded-xl bg-blue-100 p-3">
              <TrendingUp className="h-6 w-6 text-blue-600" />
            </div>
            <div className="text-3xl font-bold text-gray-900">
              {stats?.revenusSemaine?.toLocaleString() || 0}
            </div>
            <div className="text-sm font-medium text-gray-500">XPF cette semaine</div>
          </div>
        </div>

        <div className="group relative overflow-hidden rounded-2xl bg-white p-6 shadow-sm transition-all hover:shadow-lg">
          <div className="absolute right-0 top-0 h-24 w-24 translate-x-8 -translate-y-8 rounded-full bg-purple-100 transition-transform group-hover:scale-150" />
          <div className="relative">
            <div className="mb-4 inline-flex rounded-xl bg-purple-100 p-3">
              <Car className="h-6 w-6 text-purple-600" />
            </div>
            <div className="text-3xl font-bold text-gray-900">
              {stats?.coursesMois || 0}
            </div>
            <div className="text-sm font-medium text-gray-500">Courses ce mois</div>
          </div>
        </div>

        <div className="group relative overflow-hidden rounded-2xl bg-white p-6 shadow-sm transition-all hover:shadow-lg">
          <div className="absolute right-0 top-0 h-24 w-24 translate-x-8 -translate-y-8 rounded-full bg-orange-100 transition-transform group-hover:scale-150" />
          <div className="relative">
            <div className="mb-4 inline-flex rounded-xl bg-orange-100 p-3">
              <Clock className="h-6 w-6 text-orange-600" />
            </div>
            <div className="text-3xl font-bold text-orange-600">
              {stats?.commissionsDues?.toLocaleString() || 0}
            </div>
            <div className="text-sm font-medium text-gray-500">XPF commissions dues</div>
          </div>
        </div>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {prestataire?.isSociete && (
          <Link href="/prestataire/chauffeurs">
            <div className="group flex cursor-pointer items-center gap-4 rounded-2xl bg-white p-5 shadow-sm transition-all hover:shadow-lg hover:ring-2 hover:ring-purple-500/20">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg shadow-blue-500/30">
                <Users className="h-7 w-7 text-white" />
              </div>
              <div className="flex-1">
                <div className="font-semibold text-gray-900">Mes chauffeurs</div>
                <div className="text-sm text-gray-500">{stats?.totalChauffeurs || 0} chauffeurs actifs</div>
              </div>
              <ArrowRight className="h-5 w-5 text-gray-400 transition-transform group-hover:translate-x-1" />
            </div>
          </Link>
        )}

        <Link href="/prestataire/collecte">
          <div className="group flex cursor-pointer items-center gap-4 rounded-2xl bg-white p-5 shadow-sm transition-all hover:shadow-lg hover:ring-2 hover:ring-purple-500/20">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 shadow-lg shadow-orange-500/30">
              <Wallet className="h-7 w-7 text-white" />
            </div>
            <div className="flex-1">
              <div className="font-semibold text-gray-900">Frais de commission</div>
              <div className="text-sm text-gray-500">{stats?.commissionsDues?.toLocaleString() || 0} XPF à payer</div>
            </div>
            <ArrowRight className="h-5 w-5 text-gray-400 transition-transform group-hover:translate-x-1" />
          </div>
        </Link>

        <Link href="/prestataire/courses">
          <div className="group flex cursor-pointer items-center gap-4 rounded-2xl bg-white p-5 shadow-sm transition-all hover:shadow-lg hover:ring-2 hover:ring-purple-500/20">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-green-500 to-green-600 shadow-lg shadow-green-500/30">
              <Car className="h-7 w-7 text-white" />
            </div>
            <div className="flex-1">
              <div className="font-semibold text-gray-900">Historique complet</div>
              <div className="text-sm text-gray-500">Voir toutes les courses</div>
            </div>
            <ArrowRight className="h-5 w-5 text-gray-400 transition-transform group-hover:translate-x-1" />
          </div>
        </Link>
      </div>

      {/* Recent Courses */}
      <div className="rounded-2xl bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Dernières courses</h2>
            <p className="text-sm text-gray-500">Historique des courses récentes</p>
          </div>
          <Link href="/prestataire/courses">
            <button className="text-sm font-medium text-purple-600 hover:text-purple-700">
              Voir tout
            </button>
          </Link>
        </div>

        {recentCourses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <Car className="mb-3 h-12 w-12 text-gray-300" />
            <p className="font-medium">Aucune course</p>
            <p className="text-sm">Les courses apparaîtront ici</p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-gray-50">
              {displayedCourses.map((course) => (
                <Link key={course.id} href={`/prestataire/courses/${course.id}`}>
                  <div className="flex items-start gap-4 px-6 py-4 transition-colors hover:bg-gray-50 cursor-pointer">
                    <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${
                      course.status === 'payment_confirmed' 
                        ? 'bg-green-100' 
                        : course.status === 'cancelled' 
                          ? 'bg-red-100' 
                          : 'bg-gray-100'
                    }`}>
                      <Car className={`h-5 w-5 ${
                        course.status === 'payment_confirmed' 
                          ? 'text-green-600' 
                          : course.status === 'cancelled' 
                            ? 'text-red-600' 
                            : 'text-gray-600'
                      }`} />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 truncate">
                          {course.clientName}
                        </span>
                        {course.driverName && (
                          <span className="text-xs text-gray-400">
                            • {course.driverName}
                          </span>
                        )}
                      </div>
                      
                      {/* Adresses */}
                      <div className="mt-1 space-y-0.5">
                        {course.pickupAddress && (
                          <div className="flex items-center gap-1.5 text-xs text-gray-500">
                            <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                            <span className="truncate">{course.pickupAddress}</span>
                          </div>
                        )}
                        {course.dropoffAddress && (
                          <div className="flex items-center gap-1.5 text-xs text-gray-500">
                            <div className="h-1.5 w-1.5 rounded-full bg-red-500" />
                            <span className="truncate">{course.dropoffAddress}</span>
                          </div>
                        )}
                      </div>

                      <div className="mt-1 flex items-center gap-1 text-xs text-gray-400">
                        <Calendar className="h-3 w-3" />
                        <span>
                          {new Date(course.date).toLocaleDateString('fr-FR', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    </div>

                    <div className="text-right flex-shrink-0">
                      <div className="font-semibold text-gray-900">
                        {course.driverEarnings?.toLocaleString()} XPF
                      </div>
                      <div className="flex items-center justify-end gap-1 text-xs text-gray-500">
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
                  </div>
                </Link>
              ))}
            </div>

            {recentCourses.length > 5 && (
              <div className="border-t border-gray-100 px-6 py-3">
                <button
                  onClick={() => setShowAllCourses(!showAllCourses)}
                  className="flex w-full items-center justify-center gap-2 text-sm font-medium text-gray-600 hover:text-purple-600"
                >
                  {showAllCourses ? (
                    <>
                      <ChevronUp className="h-4 w-4" />
                      Voir moins
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-4 w-4" />
                      Voir plus ({recentCourses.length - 5} autres)
                    </>
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
