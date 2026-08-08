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

function Router() {
  return (
    <Switch>
      <Route path="/">
        {() => <Redirect to="/admin" />}
      </Route>

      <Route path="/admin/login" component={AdminLogin} />
      <Route path="/admin">
        {() => (
          <AdminProtectedRoute>
            <AdminLayout>
              <AdminDashboard />
            </AdminLayout>
          </AdminProtectedRoute>
        )}
      </Route>
      <Route path="/admin/clients">
        {() => (
          <AdminProtectedRoute>
            <AdminLayout>
              <AdminClients />
            </AdminLayout>
          </AdminProtectedRoute>
        )}
      </Route>
      <Route path="/admin/chauffeurs">
        {() => (
          <AdminProtectedRoute>
            <AdminLayout>
              <AdminChauffeurs />
            </AdminLayout>
          </AdminProtectedRoute>
        )}
      </Route>
      <Route path="/admin/paiements">
        {() => (
          <AdminProtectedRoute>
            <AdminLayout>
              <AdminPaiements />
            </AdminLayout>
          </AdminProtectedRoute>
        )}
      </Route>
      <Route path="/admin/carousel">
        {() => (
          <AdminProtectedRoute>
            <AdminLayout>
              <AdminCarousel />
            </AdminLayout>
          </AdminProtectedRoute>
        )}
      </Route>
      <Route path="/admin/home-categories">
        {() => (
          <AdminProtectedRoute>
            <AdminLayout>
              <AdminHomeCategories />
            </AdminLayout>
          </AdminProtectedRoute>
        )}
      </Route>
      <Route path="/admin/messages">
        {() => (
          <AdminProtectedRoute>
            <AdminLayout>
              <AdminMessages />
            </AdminLayout>
          </AdminProtectedRoute>
        )}
      </Route>
      <Route path="/admin/commandes">
        {() => (
          <AdminProtectedRoute>
            <AdminLayout>
              <AdminCommandes />
            </AdminLayout>
          </AdminProtectedRoute>
        )}
      </Route>
      <Route path="/admin/commandes/:id">
        {() => (
          <AdminProtectedRoute>
            <AdminLayout>
              <AdminCommandeDetails />
            </AdminLayout>
          </AdminProtectedRoute>
        )}
      </Route>
      <Route path="/admin/clients/:id">
        {() => (
          <AdminProtectedRoute>
            <AdminLayout>
              <AdminClientDetails />
            </AdminLayout>
          </AdminProtectedRoute>
        )}
      </Route>
      <Route path="/admin/chauffeurs/:id">
        {() => (
          <AdminProtectedRoute>
            <AdminLayout>
              <AdminChauffeurDetails />
            </AdminLayout>
          </AdminProtectedRoute>
        )}
      </Route>
      <Route path="/admin/vehicles">
        {() => (
          <AdminProtectedRoute>
            <AdminLayout>
              <AdminVehicles />
            </AdminLayout>
          </AdminProtectedRoute>
        )}
      </Route>

      {/* Anciennes routes → redirect (taxi / doublon prestataire) */}
      <Route path="/admin/prestataires">{() => <Redirect to="/admin/chauffeurs" />}</Route>
      <Route path="/admin/prestataires/:id">{() => <Redirect to="/admin/chauffeurs" />}</Route>
      <Route path="/admin/tarifs">{() => <Redirect to="/admin" />}</Route>
      <Route path="/admin/collecte">{() => <Redirect to="/admin" />}</Route>
      <Route path="/admin/collecte/:id">{() => <Redirect to="/admin" />}</Route>
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
