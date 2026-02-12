/**
 * Tape'a Back Office - Layout Prestataire
 * Navigation et structure pour les prestataires
 */

import { useEffect, useState } from 'react';
import { Link, useLocation, useRoute } from 'wouter';
import {
  Car,
  CarFront,
  LayoutDashboard,
  Users,
  Wallet,
  LogOut,
  Menu,
  X,
  Building2,
  User,
} from 'lucide-react';

interface PrestataireInfo {
  id: string;
  nom: string;
  type: string;
  isSociete: boolean;
}

interface Props {
  children: React.ReactNode;
}

export function PrestataireLayout({ children }: Props) {
  const [location, setLocation] = useLocation();
  const [prestataire, setPrestataire] = useState<PrestataireInfo | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const storedInfo = localStorage.getItem('prestataire_info');
    if (storedInfo) {
      setPrestataire(JSON.parse(storedInfo));
    } else {
      fetchPrestataireInfo();
    }
    const onUpdated = (e: CustomEvent) => setPrestataire(e.detail);
    window.addEventListener('prestataire-updated', onUpdated as EventListener);
    return () => window.removeEventListener('prestataire-updated', onUpdated as EventListener);
  }, []);

  async function fetchPrestataireInfo() {
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch('/api/prestataire/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setPrestataire(data.prestataire);
        localStorage.setItem('prestataire_info', JSON.stringify(data.prestataire));
      }
    } catch (error) {
      console.error('Error fetching prestataire info:', error);
    }
  }

  function handleLogout() {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('user_type');
    localStorage.removeItem('prestataire_info');
    setLocation('/admin/login');
  }

  const isLoueurType = prestataire?.type === 'agence_location' || prestataire?.type === 'loueur_individuel';

  const navItems = [
    { href: '/prestataire', icon: LayoutDashboard, label: 'Dashboard', exact: true },
    { href: '/prestataire/profil', icon: User, label: 'Profil', exact: false },
    ...(prestataire?.isSociete
      ? [{ href: '/prestataire/chauffeurs', icon: Users, label: 'Chauffeurs', exact: false }]
      : []),
    ...(isLoueurType
      ? [{ href: '/prestataire/vehicles', icon: CarFront, label: 'Mes Véhicules', exact: false }]
      : []),
    { href: '/prestataire/courses', icon: Car, label: isLoueurType ? 'Réservations' : 'Courses', exact: false },
    { href: '/prestataire/collecte', icon: Wallet, label: 'Frais', exact: false },
  ];

  const isActive = (href: string, exact: boolean) => {
    if (exact) return location === href;
    return location.startsWith(href);
  };

  return (
    <div className="flex min-h-screen bg-gray-100">
      {/* Sidebar Desktop */}
      <aside className="hidden w-64 flex-shrink-0 bg-white shadow-lg lg:block">
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center justify-center border-b px-4">
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-purple-600 to-purple-800">
                <Building2 className="h-5 w-5 text-white" />
              </div>
              <div>
                <span className="text-lg font-bold text-gray-900">Tape'a</span>
                <span className="ml-1 text-xs text-purple-600">PRO</span>
              </div>
            </div>
          </div>

          {/* Prestataire Info */}
          <div className="border-b p-4">
            <div className="text-sm font-medium text-gray-900 truncate">
              {prestataire?.nom || 'Chargement...'}
            </div>
            <div className="text-xs text-gray-500">
              {prestataire?.isSociete ? 'Société' : 'Indépendant'}
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-1">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href}>
                <div
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-colors cursor-pointer ${
                    isActive(item.href, item.exact)
                      ? 'bg-purple-100 text-purple-700'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <item.icon className="h-5 w-5" />
                  <span className="font-medium">{item.label}</span>
                </div>
              </Link>
            ))}
          </nav>

          {/* Logout */}
          <div className="border-t p-4">
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-gray-600 hover:bg-gray-100"
            >
              <LogOut className="h-5 w-5" />
              <span className="font-medium">Déconnexion</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex flex-1 flex-col">
        {/* Mobile Header */}
        <header className="flex h-16 items-center justify-between bg-white px-4 shadow-sm lg:hidden">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-purple-600 to-purple-800">
              <Building2 className="h-4 w-4 text-white" />
            </div>
            <span className="font-bold text-gray-900">Tape'a PRO</span>
          </div>
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="rounded-lg p-2 text-gray-600 hover:bg-gray-100"
          >
            {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </header>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="absolute inset-x-0 top-16 z-50 bg-white shadow-lg lg:hidden">
            <div className="p-4 border-b">
              <div className="text-sm font-medium text-gray-900">
                {prestataire?.nom}
              </div>
              <div className="text-xs text-gray-500">
                {prestataire?.isSociete ? 'Société' : 'Indépendant'}
              </div>
            </div>
            <nav className="p-4 space-y-1">
              {navItems.map((item) => (
                <Link key={item.href} href={item.href}>
                  <div
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 cursor-pointer ${
                      isActive(item.href, item.exact)
                        ? 'bg-purple-100 text-purple-700'
                        : 'text-gray-600'
                    }`}
                  >
                    <item.icon className="h-5 w-5" />
                    <span className="font-medium">{item.label}</span>
                  </div>
                </Link>
              ))}
            </nav>
            <div className="border-t p-4">
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-gray-600"
              >
                <LogOut className="h-5 w-5" />
                <span className="font-medium">Déconnexion</span>
              </button>
            </div>
          </div>
        )}

        {/* Page Content */}
        <main className="flex-1 overflow-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
