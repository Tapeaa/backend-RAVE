/**
 * RAVE Back Office - Layout Admin
 */

import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Users,
  Car,
  ClipboardList,
  CreditCard,
  Image,
  MessageCircle,
  LogOut,
  Menu,
  X,
  CarFront,
  Home,
  Building2,
  Tag,
  Wallet,
  Settings,
  Map,
  Star,
  CalendarDays,
  Percent,
  Scale,
  UserCog,
} from "lucide-react";

interface AdminLayoutProps {
  children: React.ReactNode;
}

const navigationSections = [
  {
    title: null as string | null,
    items: [
      { name: "Tableau de bord", href: "/admin", icon: LayoutDashboard },
    ],
  },
  {
    title: "Utilisateurs",
    items: [
      { name: "Clients", href: "/admin/clients", icon: Users },
      { name: "Loueurs", href: "/admin/chauffeurs", icon: Car },
      { name: "Prestataires", href: "/admin/prestataires", icon: Building2 },
    ],
  },
  {
    title: "Location",
    items: [
      { name: "Modèles", href: "/admin/vehicles", icon: CarFront },
      { name: "Flotte", href: "/admin/fleet", icon: Car },
      { name: "Réservations", href: "/admin/commandes", icon: ClipboardList },
      { name: "Calendrier", href: "/admin/calendar", icon: CalendarDays },
      { name: "Carte live", href: "/admin/map", icon: Map },
    ],
  },
  {
    title: "App",
    items: [
      { name: "Accueil (icônes)", href: "/admin/home-categories", icon: Home },
      { name: "Carrousel PUB", href: "/admin/carousel", icon: Image },
      { name: "Messages", href: "/admin/messages", icon: MessageCircle },
      { name: "Avis", href: "/admin/ratings", icon: Star },
      { name: "Litiges", href: "/admin/disputes", icon: Scale },
    ],
  },
  {
    title: "Fonds",
    items: [
      { name: "Paiements", href: "/admin/paiements", icon: CreditCard },
      { name: "Collecte", href: "/admin/collecte", icon: Wallet },
      { name: "Tarifs", href: "/admin/tarifs", icon: Tag },
      { name: "Promos", href: "/admin/promos", icon: Percent },
      { name: "Reconciliation", href: "/admin/reconciliation", icon: CreditCard },
    ],
  },
  {
    title: "Système",
    items: [
      { name: "Paramètres", href: "/admin/settings", icon: Settings },
      { name: "Admins", href: "/admin/users", icon: UserCog },
    ],
  },
];

export function AdminLayout({ children }: AdminLayoutProps) {
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  function handleLogout() {
    localStorage.removeItem("admin_token");
    window.location.href = "/admin/login";
  }

  const isItemActive = (href: string) => {
    return location === href || (href !== "/admin" && location.startsWith(href));
  };

  return (
    <div className="flex min-h-screen bg-slate-100">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-72 transform bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900
          transition-transform duration-300 ease-in-out lg:static lg:translate-x-0 shadow-2xl
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        <div className="flex h-full flex-col">
          <div className="flex h-20 items-center justify-between px-5 border-b border-white/10">
            <Link href="/admin" className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-yellow-500 shadow-lg shadow-amber-500/30">
                <CarFront className="h-7 w-7 text-slate-900" />
              </div>
              <div>
                <span className="text-xl font-bold text-white tracking-tight">RAVE</span>
                <p className="text-xs text-amber-300">Back Office</p>
              </div>
            </Link>
            <button
              onClick={() => setSidebarOpen(false)}
              className="text-white/80 hover:text-white lg:hidden p-1 rounded-lg hover:bg-white/10 transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {navigationSections.map((section, sectionIndex) => (
              <div key={sectionIndex}>
                {section.title && (
                  <div className="flex items-center gap-2 px-3 mb-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400/80">
                      {section.title}
                    </span>
                    <div className="flex-1 h-px bg-gradient-to-r from-amber-500/30 to-transparent"></div>
                  </div>
                )}
                <div className="space-y-1">
                  {section.items.map((item) => {
                    const isActive = isItemActive(item.href);
                    return (
                      <Link
                        key={item.name}
                        href={item.href}
                        onClick={() => setSidebarOpen(false)}
                        className={`
                          flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200
                          ${
                            isActive
                              ? "bg-gradient-to-r from-amber-500/25 to-yellow-500/10 text-white shadow-lg border border-amber-500/30"
                              : "text-slate-300 hover:bg-white/5 hover:text-white"
                          }
                        `}
                      >
                        <div className={`p-1.5 rounded-lg ${isActive ? "bg-amber-500/30" : "bg-white/5"}`}>
                          <item.icon className="h-4 w-4" />
                        </div>
                        {item.name}
                        {isActive && (
                          <div className="ml-auto w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></div>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className="border-t border-white/10 p-4">
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-slate-300 transition-all duration-200 hover:bg-red-500/10 hover:text-red-300 group"
            >
              <div className="p-1.5 rounded-lg bg-white/5 group-hover:bg-red-500/20 transition-colors">
                <LogOut className="h-4 w-4" />
              </div>
              Déconnexion
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 min-w-0 overflow-hidden">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-slate-200 bg-white/80 backdrop-blur-md px-4 shadow-sm lg:px-6">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-slate-600 hover:text-slate-900 lg:hidden p-2 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <Menu className="h-6 w-6" />
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 text-sm text-slate-500">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
              <span>Connecté</span>
            </div>
            <div className="h-8 w-px bg-slate-200 hidden sm:block"></div>
            <span className="text-sm font-medium text-slate-700">Administration RAVE</span>
          </div>
        </header>

        <main className="p-3 sm:p-4 lg:p-6 overflow-hidden w-full">{children}</main>
      </div>
    </div>
  );
}
