/**
 * RAVE — Layout Prestataire / Loueur
 */

import { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import {
  CarFront,
  LayoutDashboard,
  ClipboardList,
  LogOut,
  Menu,
  X,
  User,
} from 'lucide-react';
import { LoueurNoticeProvider } from '@/components/loueur/LoueurNotice';

interface PrestataireInfo {
  id: string;
  nom: string;
  type: string;
  isSociete: boolean;
}

interface Props {
  children: React.ReactNode;
}

const navItems = [
  { href: '/prestataire', icon: LayoutDashboard, label: 'Tableau de bord', exact: true },
  { href: '/prestataire/vehicles', icon: CarFront, label: 'Mes véhicules', exact: false },
  { href: '/prestataire/courses', icon: ClipboardList, label: 'Réservations', exact: false },
  { href: '/prestataire/profil', icon: User, label: 'Profil & abonnement', exact: false },
];

function initials(name?: string | null): string {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'R';
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
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

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location]);

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

  const isActive = (href: string, exact: boolean) => {
    if (exact) return location === href;
    return location.startsWith(href);
  };

  const typeLabel =
    prestataire?.type === 'agence_location'
      ? 'Agence de location'
      : prestataire?.type === 'loueur_individuel'
        ? 'Loueur individuel'
        : prestataire?.isSociete
          ? 'Société'
          : 'Indépendant';

  const nav = (
    <nav className="space-y-0.5">
      {navItems.map((item) => {
        const active = isActive(item.href, item.exact);
        return (
          <Link key={item.href} href={item.href}>
            <div
              className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                active
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              <item.icon className="h-[18px] w-[18px]" />
              <span className="font-medium">{item.label}</span>
            </div>
          </Link>
        );
      })}
    </nav>
  );

  const account = (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-sm font-semibold text-amber-800">
        {initials(prestataire?.nom)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-gray-900">
          {prestataire?.nom || 'Chargement…'}
        </div>
        <div className="truncate text-xs text-gray-500">{typeLabel}</div>
      </div>
      <button
        type="button"
        onClick={handleLogout}
        title="Déconnexion"
        className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );

  const brand = (
    <div className="flex items-center gap-2.5">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-400 text-sm font-black text-gray-900">
        R
      </div>
      <div className="leading-tight">
        <div className="text-[15px] font-bold tracking-tight text-gray-900">RAVE</div>
        <div className="text-[11px] font-medium uppercase tracking-wider text-gray-400">Espace loueur</div>
      </div>
    </div>
  );

  return (
    <LoueurNoticeProvider>
      <div className="flex min-h-screen bg-[#f6f7f9]">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-gray-200 bg-white lg:flex">
          <div className="flex h-16 items-center px-5">{brand}</div>
          <div className="flex-1 overflow-y-auto px-3 py-4">{nav}</div>
          <div className="border-t border-gray-100 p-3">{account}</div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-gray-200 bg-white px-4 lg:hidden">
            {brand}
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen((v) => !v)}
              className="rounded-lg p-2 text-gray-600 hover:bg-gray-100"
              aria-label="Menu"
            >
              {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </header>

          {isMobileMenuOpen && (
            <div className="fixed inset-x-0 top-14 z-40 border-b border-gray-200 bg-white p-3 shadow-lg lg:hidden">
              {nav}
              <div className="mt-3 border-t border-gray-100 pt-3">{account}</div>
            </div>
          )}

          <main className="flex-1">
            <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
          </main>
        </div>
      </div>
    </LoueurNoticeProvider>
  );
}
