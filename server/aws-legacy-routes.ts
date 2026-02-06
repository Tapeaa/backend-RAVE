/**
 * Tape'ā Back Office - Routes API Données AWS 2023
 * Sert les données archivées de l'ancien serveur AWS
 */

import type { Express } from "express";
import { requireAdminAuth } from "./admin-auth";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

// Pour ESM: obtenir __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cache des données pour éviter de relire le fichier à chaque requête
let cachedData: {
  metadata: any;
  clients: any[];
  courses: any[];
} | null = null;

// Fonction pour détecter si un compte est un spam/test
function isSpamAccount(user: any): boolean {
  const spamPatterns = ['xxxxxx', 'xxxxx', 'xxxx', 'test', 'client.test', 'chauffeur.test'];
  const fieldsToCheck = [user.first_name, user.last_name, user.email, user.mobile, user.user_code];
  
  for (const field of fieldsToCheck) {
    if (!field) continue;
    const lowerField = String(field).toLowerCase();
    for (const pattern of spamPatterns) {
      if (lowerField.includes(pattern)) return true;
    }
  }
  return false;
}

// Obtenir le numéro de semaine
function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

// Fonction pour vérifier si un email semble légitime
function isLegitEmail(email: string): boolean {
  if (!email || email === 'NULL') return false;
  // Doit contenir @ et un domaine
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) return false;
  // Ne doit pas contenir de patterns de test
  const testPatterns = ['test', 'xxxxxx', 'xxxxx'];
  const lowerEmail = email.toLowerCase();
  for (const pattern of testPatterns) {
    if (lowerEmail.includes(pattern)) return false;
  }
  return true;
}

function loadAWSData() {
  if (cachedData) return cachedData;
  
  const possiblePaths = [
    path.join(process.cwd(), "server", "data", "TAPEA_DATA_COMPLET.json"),
    path.join(__dirname, "data", "TAPEA_DATA_COMPLET.json"),
    path.join(__dirname, "..", "server", "data", "TAPEA_DATA_COMPLET.json"),
    path.join(process.cwd(), "dist", "data", "TAPEA_DATA_COMPLET.json"),
  ];
  
  for (const dataPath of possiblePaths) {
    try {
      console.log(`[AWS Legacy] Trying path: ${dataPath}`);
      if (fs.existsSync(dataPath)) {
        const rawData = fs.readFileSync(dataPath, "utf-8");
        cachedData = JSON.parse(rawData);
        console.log(`[AWS Legacy] Données chargées depuis ${dataPath}: ${cachedData?.clients?.length || 0} clients, ${cachedData?.courses?.length || 0} courses`);
        return cachedData;
      }
    } catch (error) {
      console.log(`[AWS Legacy] Path ${dataPath} failed:`, error);
    }
  }
  
  console.error("[AWS Legacy] Aucun chemin valide trouvé pour les données AWS");
  return null;
}

export function registerAWSLegacyRoutes(app: Express) {
  // Route pour récupérer les statistiques détaillées
  app.get("/api/admin/aws-2023/stats", requireAdminAuth, async (req, res) => {
    try {
      const data = loadAWSData();
      if (!data) {
        return res.status(500).json({ error: "Données non disponibles" });
      }

      // Filtrer les comptes légitimes (pas de spam)
      const allClients = data.clients.filter((c: any) => c.user_type === "1");
      const allChauffeurs = data.clients.filter((c: any) => c.user_type === "2");
      
      const legitClients = allClients.filter((c: any) => !isSpamAccount(c));
      const legitChauffeurs = allChauffeurs.filter((c: any) => !isSpamAccount(c) && isLegitEmail(c.email));
      
      // Helper pour savoir si une course est terminée
      const isCourseTerminee = (c: any) => {
        const status = parseInt(c.statut) || 0;
        return status === 2101050 || status === 2101042 || (status >= 5900 && status <= 6000);
      };

      // Total des demandes (toutes les courses)
      const totalDemandes = data.courses.reduce((sum: number, c: any) => {
        const montant = parseInt(c.montant_total) || 0;
        return sum + montant;
      }, 0);

      // CA réel (seulement les courses terminées)
      const totalCA = data.courses.reduce((sum: number, c: any) => {
        if (isCourseTerminee(c)) {
          return sum + (parseInt(c.montant_total) || 0);
        }
        return sum;
      }, 0);

      // Commission chauffeurs (sur courses terminées)
      const totalCommission = data.courses.reduce((sum: number, c: any) => {
        if (isCourseTerminee(c)) {
          return sum + (parseInt(c.montant_commission) || 0);
        }
        return sum;
      }, 0);

      // Gains chauffeurs (sur courses terminées)
      const totalGainsChauffeurs = data.courses.reduce((sum: number, c: any) => {
        if (isCourseTerminee(c)) {
          return sum + (parseInt(c.montant_chauffeur) || 0);
        }
        return sum;
      }, 0);

      // Trouver les dates min/max
      const dates = data.courses
        .map((c: any) => c.date_creation)
        .filter((d: string) => d && d !== "NULL")
        .sort();

      // Statistiques par statut
      const coursesByStatus: Record<string, number> = {};
      data.courses.forEach((c: any) => {
        const status = c.statut || 'unknown';
        coursesByStatus[status] = (coursesByStatus[status] || 0) + 1;
      });

      // Statistiques par type de paiement
      const coursesByPayment: Record<string, number> = {};
      data.courses.forEach((c: any) => {
        const payment = c.type_paiement_id || 'unknown';
        coursesByPayment[payment] = (coursesByPayment[payment] || 0) + 1;
      });

      // Top destinations
      const destinations: Record<string, number> = {};
      data.courses.forEach((c: any) => {
        if (c.adresse_arrivee && c.adresse_arrivee !== 'NULL') {
          // Extraire le code postal ou la ville
          const match = c.adresse_arrivee.match(/(\d{5})/);
          const key = match ? match[1] : c.adresse_arrivee.split(',')[0];
          destinations[key] = (destinations[key] || 0) + 1;
        }
      });
      const topDestinations = Object.entries(destinations)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }));

      // Statistiques par mois
      const coursesByMonth: Record<string, { count: number; ca: number; ticketMoyen: number }> = {};
      data.courses.forEach((c: any) => {
        if (c.date_creation && c.date_creation !== 'NULL') {
          const month = c.date_creation.substring(0, 7); // "2023-06"
          if (!coursesByMonth[month]) {
            coursesByMonth[month] = { count: 0, ca: 0, ticketMoyen: 0 };
          }
          coursesByMonth[month].count++;
          coursesByMonth[month].ca += parseInt(c.montant_total) || 0;
        }
      });
      // Calculer ticket moyen par mois
      Object.keys(coursesByMonth).forEach(month => {
        const m = coursesByMonth[month];
        m.ticketMoyen = m.count > 0 ? Math.round(m.ca / m.count) : 0;
      });

      // Statistiques par semaine
      const coursesByWeek: Record<string, { count: number; ca: number; ticketMoyen: number }> = {};
      data.courses.forEach((c: any) => {
        if (c.date_creation && c.date_creation !== 'NULL') {
          const date = new Date(c.date_creation);
          const year = date.getFullYear();
          const weekNum = getWeekNumber(date);
          const weekKey = `${year}-S${weekNum.toString().padStart(2, '0')}`;
          if (!coursesByWeek[weekKey]) {
            coursesByWeek[weekKey] = { count: 0, ca: 0, ticketMoyen: 0 };
          }
          coursesByWeek[weekKey].count++;
          coursesByWeek[weekKey].ca += parseInt(c.montant_total) || 0;
        }
      });
      Object.keys(coursesByWeek).forEach(week => {
        const w = coursesByWeek[week];
        w.ticketMoyen = w.count > 0 ? Math.round(w.ca / w.count) : 0;
      });

      // Statistiques par jour
      const coursesByDay: Record<string, { count: number; ca: number; ticketMoyen: number }> = {};
      data.courses.forEach((c: any) => {
        if (c.date_creation && c.date_creation !== 'NULL') {
          const day = c.date_creation.substring(0, 10); // "2023-06-01"
          if (!coursesByDay[day]) {
            coursesByDay[day] = { count: 0, ca: 0, ticketMoyen: 0 };
          }
          coursesByDay[day].count++;
          coursesByDay[day].ca += parseInt(c.montant_total) || 0;
        }
      });
      Object.keys(coursesByDay).forEach(day => {
        const d = coursesByDay[day];
        d.ticketMoyen = d.count > 0 ? Math.round(d.ca / d.count) : 0;
      });

      // Statistiques par heure de la journée
      const coursesByHour: Record<string, { count: number; ca: number; ticketMoyen: number }> = {};
      for (let h = 0; h < 24; h++) {
        coursesByHour[h.toString().padStart(2, '0')] = { count: 0, ca: 0, ticketMoyen: 0 };
      }
      data.courses.forEach((c: any) => {
        if (c.date_creation && c.date_creation !== 'NULL') {
          const hour = c.date_creation.substring(11, 13); // "17" from "2023-06-01 17:07:56"
          if (coursesByHour[hour]) {
            coursesByHour[hour].count++;
            coursesByHour[hour].ca += parseInt(c.montant_total) || 0;
          }
        }
      });
      Object.keys(coursesByHour).forEach(hour => {
        const h = coursesByHour[hour];
        h.ticketMoyen = h.count > 0 ? Math.round(h.ca / h.count) : 0;
      });

      // Statistiques par jour de la semaine
      const coursesByDayOfWeek: Record<string, { count: number; ca: number; ticketMoyen: number }> = {
        '0': { count: 0, ca: 0, ticketMoyen: 0 }, // Dimanche
        '1': { count: 0, ca: 0, ticketMoyen: 0 }, // Lundi
        '2': { count: 0, ca: 0, ticketMoyen: 0 },
        '3': { count: 0, ca: 0, ticketMoyen: 0 },
        '4': { count: 0, ca: 0, ticketMoyen: 0 },
        '5': { count: 0, ca: 0, ticketMoyen: 0 },
        '6': { count: 0, ca: 0, ticketMoyen: 0 }, // Samedi
      };
      data.courses.forEach((c: any) => {
        if (c.date_creation && c.date_creation !== 'NULL') {
          const dayOfWeek = new Date(c.date_creation).getDay().toString();
          if (coursesByDayOfWeek[dayOfWeek]) {
            coursesByDayOfWeek[dayOfWeek].count++;
            coursesByDayOfWeek[dayOfWeek].ca += parseInt(c.montant_total) || 0;
          }
        }
      });
      Object.keys(coursesByDayOfWeek).forEach(dow => {
        const d = coursesByDayOfWeek[dow];
        d.ticketMoyen = d.count > 0 ? Math.round(d.ca / d.count) : 0;
      });

      // Courses terminées vs annulées + temps d'attente avant annulation
      let coursesTerminees = 0;
      let coursesAnnulees = 0;
      let coursesSansReponse = 0;
      const tempsAnnulations: number[] = [];
      
      data.courses.forEach((c: any) => {
        const status = parseInt(c.statut) || 0;
        if (status === 2101050 || status === 2101042 || (status >= 5900 && status <= 6000)) {
          coursesTerminees++;
        } else if (status >= 4096 || status === 4) {
          coursesAnnulees++;
          // Calculer le temps d'attente avant annulation
          if (c.date_creation && c.heure_annulation && c.date_creation !== 'NULL' && c.heure_annulation !== 'NULL') {
            const dateCreation = new Date(c.date_creation);
            const dateAnnulation = new Date(c.heure_annulation);
            if (!isNaN(dateCreation.getTime()) && !isNaN(dateAnnulation.getTime())) {
              const tempsAttenteMinutes = (dateAnnulation.getTime() - dateCreation.getTime()) / (1000 * 60);
              // Filtrer les annulations réalistes :
              // - >= 2 min (exclure les erreurs/clics accidentels)
              // - <= 60 min (exclure les réservations annulées tardivement)
              if (tempsAttenteMinutes >= 2 && tempsAttenteMinutes <= 60) {
                tempsAnnulations.push(tempsAttenteMinutes);
              }
            }
          }
        } else if (status === 2 || status === 0) {
          coursesSansReponse++;
        }
      });
      
      // Calculer la moyenne du temps d'attente (annulations réalistes uniquement)
      const tempsAttenteAnnulationMoyen = tempsAnnulations.length > 0 
        ? Math.round(tempsAnnulations.reduce((a, b) => a + b, 0) / tempsAnnulations.length) 
        : 0;

      // Top chauffeurs par CA
      const chauffeurStats: Record<string, { nom: string; count: number; ca: number }> = {};
      data.courses.forEach((c: any) => {
        if (c.chauffeur_id && c.chauffeur_prenom) {
          const key = c.chauffeur_id;
          if (!chauffeurStats[key]) {
            chauffeurStats[key] = { nom: `${c.chauffeur_prenom} ${c.chauffeur_nom}`, count: 0, ca: 0 };
          }
          chauffeurStats[key].count++;
          chauffeurStats[key].ca += parseInt(c.montant_total) || 0;
        }
      });
      const topChauffeurs = Object.values(chauffeurStats)
        .sort((a, b) => b.ca - a.ca)
        .slice(0, 10);

      // Top clients par dépenses
      const clientStats: Record<string, { nom: string; count: number; ca: number }> = {};
      data.courses.forEach((c: any) => {
        if (c.client_id && c.client_prenom) {
          const key = c.client_id;
          if (!clientStats[key]) {
            clientStats[key] = { nom: `${c.client_prenom} ${c.client_nom}`, count: 0, ca: 0 };
          }
          clientStats[key].count++;
          clientStats[key].ca += parseInt(c.montant_total) || 0;
        }
      });
      const topClients = Object.values(clientStats)
        .sort((a, b) => b.ca - a.ca)
        .slice(0, 10);

      // Calcul des sessions 2h (courses réelles vs demandes multiples)
      // Si un client commande plusieurs fois en moins de 2h, ça compte comme 1 seule course réelle
      const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
      const coursesByClient: Record<string, any[]> = {};
      data.courses.forEach((c: any) => {
        const clientId = c.client_id;
        if (!coursesByClient[clientId]) coursesByClient[clientId] = [];
        coursesByClient[clientId].push(c);
      });
      
      let coursesReelles = 0;
      let coursesDoublons = 0;
      let totalDemandesReelles = 0; // CA des sessions uniques seulement
      let totalDemandesDoublons = 0; // CA des doublons
      
      Object.values(coursesByClient).forEach((clientCourses) => {
        // Trier par date de création
        clientCourses.sort((a, b) => new Date(a.date_creation).getTime() - new Date(b.date_creation).getTime());
        
        let sessions = 1;
        let lastDate = new Date(clientCourses[0].date_creation);
        // La première course de la session compte toujours
        totalDemandesReelles += parseInt(clientCourses[0].montant_total) || 0;
        
        for (let i = 1; i < clientCourses.length; i++) {
          const currentDate = new Date(clientCourses[i].date_creation);
          const diff = currentDate.getTime() - lastDate.getTime();
          const montant = parseInt(clientCourses[i].montant_total) || 0;
          
          if (diff > TWO_HOURS_MS) {
            sessions++; // Nouvelle session car >2h depuis la dernière
            totalDemandesReelles += montant; // Compte dans le CA réel
          } else {
            // C'est un doublon (même session)
            totalDemandesDoublons += montant;
          }
          lastDate = currentDate;
        }
        
        coursesReelles += sessions;
        coursesDoublons += (clientCourses.length - sessions);
      });

      res.json({
        // Comptes
        nbClientsTotal: allClients.length,
        nbClientsLegit: legitClients.length,
        nbChauffeursTotal: allChauffeurs.length,
        nbChauffeursLegit: legitChauffeurs.length,
        // Courses
        nbCourses: data.courses.length, // Demandes brutes
        coursesReelles, // Sessions uniques (2h)
        coursesDoublons, // Demandes multiples en 2h
        // CA des demandes (sessions 2h)
        totalDemandesReelles, // CA des sessions uniques
        totalDemandesDoublons, // CA des doublons (relances)
        coursesTerminees,
        coursesAnnulees,
        coursesSansReponse,
        tempsAttenteAnnulationMoyen, // en minutes
        // Financier
        totalCA, // CA réel = courses terminées seulement
        totalDemandes, // Total toutes les courses
        totalCommission,
        totalGainsChauffeurs,
        ticketMoyen: coursesTerminees > 0 ? Math.round(totalCA / coursesTerminees) : 0,
        // Période
        periode: {
          debut: dates[0] || "N/A",
          fin: dates[dates.length - 1] || "N/A"
        },
        // Répartitions temporelles
        coursesByStatus,
        coursesByPayment,
        coursesByMonth,
        coursesByWeek,
        coursesByDay,
        coursesByHour,
        coursesByDayOfWeek,
        // Tops
        topDestinations,
        topChauffeurs,
        topClients
      });
    } catch (error) {
      console.error("Error fetching AWS stats:", error);
      res.status(500).json({ error: "Erreur serveur" });
    }
  });

  // Route pour récupérer les clients (avec filtrage spam optionnel)
  app.get("/api/admin/aws-2023/clients", requireAdminAuth, async (req, res) => {
    try {
      const data = loadAWSData();
      if (!data) {
        return res.status(500).json({ error: "Données non disponibles" });
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const search = (req.query.search as string || "").toLowerCase();
      const type = req.query.type as string; // "1" = clients, "2" = chauffeurs
      const hideSpam = req.query.hideSpam !== "false"; // Par défaut: cacher les spams

      let filtered = data.clients;
      
      // Filtrer par type si spécifié
      if (type) {
        filtered = filtered.filter((c: any) => c.user_type === type);
      }

      // Filtrer les spams si demandé
      if (hideSpam) {
        filtered = filtered.filter((c: any) => {
          // Pour les chauffeurs, on vérifie aussi l'email légitime
          if (c.user_type === "2") {
            return !isSpamAccount(c) && isLegitEmail(c.email);
          }
          return !isSpamAccount(c);
        });
      }

      // Filtrer par recherche
      if (search) {
        filtered = filtered.filter((c: any) =>
          (c.first_name || "").toLowerCase().includes(search) ||
          (c.last_name || "").toLowerCase().includes(search) ||
          (c.email || "").toLowerCase().includes(search) ||
          (c.mobile || "").includes(search)
        );
      }

      const total = filtered.length;
      const start = (page - 1) * limit;
      const paginated = filtered.slice(start, start + limit);

      res.json({
        clients: paginated,
        total,
        page,
        totalPages: Math.ceil(total / limit)
      });
    } catch (error) {
      console.error("Error fetching AWS clients:", error);
      res.status(500).json({ error: "Erreur serveur" });
    }
  });

  // Route pour récupérer les courses (avec pagination et filtres)
  app.get("/api/admin/aws-2023/courses", requireAdminAuth, async (req, res) => {
    try {
      const data = loadAWSData();
      if (!data) {
        return res.status(500).json({ error: "Données non disponibles" });
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const search = (req.query.search as string || "").toLowerCase();
      const status = req.query.status as string;
      const minAmount = parseInt(req.query.minAmount as string) || 0;

      let filtered = data.courses;

      // Filtrer par statut
      if (status) {
        filtered = filtered.filter((c: any) => c.statut === status);
      }

      // Filtrer par montant minimum
      if (minAmount > 0) {
        filtered = filtered.filter((c: any) => (parseInt(c.montant_total) || 0) >= minAmount);
      }

      // Filtrer par recherche
      if (search) {
        filtered = filtered.filter((c: any) =>
          (c.order_number || "").includes(search) ||
          (c.adresse_depart || "").toLowerCase().includes(search) ||
          (c.adresse_arrivee || "").toLowerCase().includes(search) ||
          (c.client_prenom || "").toLowerCase().includes(search) ||
          (c.client_nom || "").toLowerCase().includes(search) ||
          (c.chauffeur_prenom || "").toLowerCase().includes(search) ||
          (c.chauffeur_nom || "").toLowerCase().includes(search)
        );
      }

      // Trier par date décroissante
      filtered.sort((a: any, b: any) => {
        const dateA = new Date(a.date_creation || 0).getTime();
        const dateB = new Date(b.date_creation || 0).getTime();
        return dateB - dateA;
      });

      const total = filtered.length;
      const start = (page - 1) * limit;
      const paginated = filtered.slice(start, start + limit);

      res.json({
        courses: paginated,
        total,
        page,
        totalPages: Math.ceil(total / limit)
      });
    } catch (error) {
      console.error("Error fetching AWS courses:", error);
      res.status(500).json({ error: "Erreur serveur" });
    }
  });

  // Route pour récupérer une course spécifique avec détails complets
  app.get("/api/admin/aws-2023/courses/:id", requireAdminAuth, async (req, res) => {
    try {
      const data = loadAWSData();
      if (!data) {
        return res.status(500).json({ error: "Données non disponibles" });
      }

      const course = data.courses.find((c: any) => c.order_id === req.params.id);
      if (!course) {
        return res.status(404).json({ error: "Course non trouvée" });
      }

      res.json(course);
    } catch (error) {
      console.error("Error fetching AWS course:", error);
      res.status(500).json({ error: "Erreur serveur" });
    }
  });

  // Route pour récupérer un client/chauffeur spécifique avec ses courses
  app.get("/api/admin/aws-2023/users/:id", requireAdminAuth, async (req, res) => {
    try {
      const data = loadAWSData();
      if (!data) {
        return res.status(500).json({ error: "Données non disponibles" });
      }

      const user = data.clients.find((c: any) => c.id === req.params.id);
      if (!user) {
        return res.status(404).json({ error: "Utilisateur non trouvé" });
      }

      // Trouver les courses associées
      const userCourses = data.courses.filter((c: any) => 
        c.client_id === req.params.id || c.chauffeur_id === req.params.id
      );

      // Calculer les stats de l'utilisateur
      const totalDepense = userCourses.reduce((sum: number, c: any) => 
        sum + (parseInt(c.montant_total) || 0), 0
      );

      res.json({
        ...user,
        nbCourses: userCourses.length,
        totalDepense,
        courses: userCourses.slice(0, 10) // Les 10 dernières courses
      });
    } catch (error) {
      console.error("Error fetching AWS user:", error);
      res.status(500).json({ error: "Erreur serveur" });
    }
  });

  console.log("[AWS Legacy] Routes enregistrées");
}
