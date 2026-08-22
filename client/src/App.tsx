import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AuthProvider } from "@/lib/AuthContext";

// Admin pages (back office location RAVE)
import { AdminLogin } from "@/pages/admin/AdminLogin";
import { AdminDashboard } from "@/pages/admin/AdminDashboard";
import { AdminClients } from "@/pages/admin/AdminClients";
import { AdminClientDetails } from "@/pages/admin/AdminClientDetails";
import { AdminChauffeurs } from "@/pages/admin/AdminChauffeurs";
import { AdminChauffeurDetails } from "@/pages/admin/AdminChauffeurDetails";
import { AdminCommandes } from "@/pages/admin/AdminCommandes";
import { AdminCommandeDetails } from "@/pages/admin/AdminCommandeDetails";
import { AdminPaiements } from "@/pages/admin/AdminPaiements";
import { AdminCarousel } from "@/pages/admin/AdminCarousel";
import { AdminHomeCategories } from "@/pages/admin/AdminHomeCategories";
import { AdminMessages } from "@/pages/admin/AdminMessages";
import { AdminVehicles } from "@/pages/admin/AdminVehicles";
import { AdminFleet } from "@/pages/admin/AdminFleet";
import { AdminSettings } from "@/pages/admin/AdminSettings";
import { AdminPromos } from "@/pages/admin/AdminPromos";
import { AdminReconciliation } from "@/pages/admin/AdminReconciliation";
import { AdminCalendar } from "@/pages/admin/AdminCalendar";
import { AdminMap } from "@/pages/admin/AdminMap";
import { AdminRatings } from "@/pages/admin/AdminRatings";
import { AdminDisputes } from "@/pages/admin/AdminDisputes";
import { AdminUsers } from "@/pages/admin/AdminUsers";
import { AdminProtectedRoute } from "@/components/AdminProtectedRoute";
import { AdminLayout } from "@/components/admin/AdminLayout";

// Prestataire pages
import {
  PrestataireDashboard,
  PrestataireProfil,
  PrestataireCourses,
  PrestataireCourseDetails,
  PrestataireMesVehicules,
} from "@/pages/prestataire";
import { PrestataireLayout } from "@/pages/prestataire/PrestataireLayout";
import { PrestataireProtectedRoute } from "@/components/PrestataireProtectedRoute";

function AdminPage({ children }: { children: React.ReactNode }) {
  return (
    <AdminProtectedRoute>
      <AdminLayout>{children}</AdminLayout>
    </AdminProtectedRoute>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/">
        {() => <Redirect to="/admin" />}
      </Route>

      <Route path="/admin/login" component={AdminLogin} />
      <Route path="/admin">{() => <AdminPage><AdminDashboard /></AdminPage>}</Route>
      <Route path="/admin/clients">{() => <AdminPage><AdminClients /></AdminPage>}</Route>
      <Route path="/admin/clients/:id">{() => <AdminPage><AdminClientDetails /></AdminPage>}</Route>
      <Route path="/admin/chauffeurs">{() => <AdminPage><AdminChauffeurs /></AdminPage>}</Route>
      <Route path="/admin/chauffeurs/:id">{() => <AdminPage><AdminChauffeurDetails /></AdminPage>}</Route>
      {/* Prestataires = même entité que Loueurs (compte org lié au loueur) */}
      <Route path="/admin/prestataires">{() => <Redirect to="/admin/chauffeurs" />}</Route>
      <Route path="/admin/prestataires/:id">{() => <Redirect to="/admin/chauffeurs" />}</Route>
      <Route path="/admin/paiements">{() => <AdminPage><AdminPaiements /></AdminPage>}</Route>
      <Route path="/admin/collecte">{() => <Redirect to="/admin" />}</Route>
      <Route path="/admin/collecte/:id">{() => <Redirect to="/admin" />}</Route>
      <Route path="/admin/tarifs">{() => <Redirect to="/admin/settings" />}</Route>
      <Route path="/admin/carousel">{() => <AdminPage><AdminCarousel /></AdminPage>}</Route>
      <Route path="/admin/home-categories">{() => <AdminPage><AdminHomeCategories /></AdminPage>}</Route>
      <Route path="/admin/messages">{() => <AdminPage><AdminMessages /></AdminPage>}</Route>
      <Route path="/admin/commandes">{() => <AdminPage><AdminCommandes /></AdminPage>}</Route>
      <Route path="/admin/commandes/:id">{() => <AdminPage><AdminCommandeDetails /></AdminPage>}</Route>
      <Route path="/admin/vehicles">{() => <AdminPage><AdminVehicles /></AdminPage>}</Route>
      <Route path="/admin/fleet">{() => <AdminPage><AdminFleet /></AdminPage>}</Route>
      <Route path="/admin/calendar">{() => <AdminPage><AdminCalendar /></AdminPage>}</Route>
      <Route path="/admin/map">{() => <AdminPage><AdminMap /></AdminPage>}</Route>
      <Route path="/admin/ratings">{() => <AdminPage><AdminRatings /></AdminPage>}</Route>
      <Route path="/admin/disputes">{() => <AdminPage><AdminDisputes /></AdminPage>}</Route>
      <Route path="/admin/promos">{() => <AdminPage><AdminPromos /></AdminPage>}</Route>
      <Route path="/admin/reconciliation">{() => <AdminPage><AdminReconciliation /></AdminPage>}</Route>
      <Route path="/admin/settings">{() => <AdminPage><AdminSettings /></AdminPage>}</Route>
      <Route path="/admin/users">{() => <AdminPage><AdminUsers /></AdminPage>}</Route>
      <Route path="/admin/aws-2023">{() => <Redirect to="/admin" />}</Route>

      {/* Prestataire (loueur) */}
      <Route path="/prestataire">
        {() => (
          <PrestataireProtectedRoute>
            <PrestataireLayout>
              <PrestataireDashboard />
            </PrestataireLayout>
          </PrestataireProtectedRoute>
        )}
      </Route>
      <Route path="/prestataire/profil">
        {() => (
          <PrestataireProtectedRoute>
            <PrestataireLayout>
              <PrestataireProfil />
            </PrestataireLayout>
          </PrestataireProtectedRoute>
        )}
      </Route>
      <Route path="/prestataire/vehicles">
        {() => (
          <PrestataireProtectedRoute>
            <PrestataireLayout>
              <PrestataireMesVehicules />
            </PrestataireLayout>
          </PrestataireProtectedRoute>
        )}
      </Route>
      <Route path="/prestataire/courses">
        {() => (
          <PrestataireProtectedRoute>
            <PrestataireLayout>
              <PrestataireCourses />
            </PrestataireLayout>
          </PrestataireProtectedRoute>
        )}
      </Route>
      <Route path="/prestataire/courses/:id">
        {() => (
          <PrestataireProtectedRoute>
            <PrestataireLayout>
              <PrestataireCourseDetails />
            </PrestataireLayout>
          </PrestataireProtectedRoute>
        )}
      </Route>
      <Route path="/prestataire/chauffeurs">{() => <Redirect to="/prestataire" />}</Route>
      <Route path="/prestataire/collecte">{() => <Redirect to="/prestataire" />}</Route>
      <Route path="/prestataire/collecte/:id">{() => <Redirect to="/prestataire" />}</Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <Toaster />
          <Router />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
