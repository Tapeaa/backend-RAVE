/**
 * Tape'ā Back Office - Données AWS 2023
 * Archive des données de l'ancien serveur AWS (2023)
 * Vue analytique complète
 */

import { useEffect, useState } from 'react';
import {
  Database, Users, Car, MapPin, Calendar,
  Search, ChevronLeft, ChevronRight, Mail, Phone,
  DollarSign, TrendingUp, User, Truck, ExternalLink,
  BarChart3, PieChart, Clock, CreditCard, Banknote,
  CheckCircle, XCircle, AlertCircle, Eye, Download, Filter, FileText
} from 'lucide-react';
// @ts-ignore
import html2pdf from 'html2pdf.js';

interface TimeStats {
  count: number;
  ca: number;
  ticketMoyen: number;
}

interface Stats {
  nbClientsTotal: number;
  nbClientsLegit: number;
  nbChauffeursTotal: number;
  nbChauffeursLegit: number;
  nbCourses: number; // Demandes brutes
  coursesReelles: number; // Sessions uniques (2h)
  coursesDoublons: number; // Demandes multiples en 2h
  totalDemandesReelles: number; // CA des sessions uniques
  totalDemandesDoublons: number; // CA des doublons
  coursesTerminees: number;
  coursesAnnulees: number;
  coursesSansReponse: number;
  tempsAttenteAnnulationMoyen: number; // en minutes
  totalCA: number; // CA réel (courses terminées)
  totalDemandes: number; // Total toutes les courses
  totalCommission: number;
  totalGainsChauffeurs: number;
  ticketMoyen: number;
  periode: { debut: string; fin: string };
  coursesByStatus: Record<string, number>;
  coursesByPayment: Record<string, number>;
  coursesByMonth: Record<string, TimeStats>;
  coursesByWeek: Record<string, TimeStats>;
  coursesByDay: Record<string, TimeStats>;
  coursesByHour: Record<string, TimeStats>;
  coursesByDayOfWeek: Record<string, TimeStats>;
  topDestinations: Array<{ name: string; count: number }>;
  topChauffeurs: Array<{ nom: string; count: number; ca: number }>;
  topClients: Array<{ nom: string; count: number; ca: number }>;
}

interface Client {
  id: string;
  user_number: string;
  user_code: string;
  first_name: string;
  last_name: string;
  mobile: string;
  email: string;
  user_type: string;
}

interface Course {
  order_id: string;
  order_number: string;
  date_creation: string;
  statut: string;
  client_id: string;
  client_prenom: string;
  client_nom: string;
  client_email: string;
  client_mobile: string;
  chauffeur_id: string;
  chauffeur_prenom: string;
  chauffeur_nom: string;
  chauffeur_email: string;
  chauffeur_mobile: string;
  adresse_depart: string;
  code_postal_depart: string;
  adresse_arrivee: string;
  code_postal_arrivee: string;
  depart_lat: string;
  depart_lng: string;
  arrivee_lat: string;
  arrivee_lng: string;
  distance_km: string;
  duree_min: string;
  montant_total: string;
  montant_chauffeur: string;
  montant_commission: string;
  nb_passagers: string;
  nb_bagages: string;
  note_client: string;
  note_chauffeur: string;
  type_paiement_id: string;
  heure_prise_en_charge: string;
  heure_debut: string;
  heure_fin_course: string;
  heure_annulation: string;
  type_annulation: string;
  heure_assignation: string;
  heure_acceptation: string;
}

type TabType = 'dashboard' | 'clients' | 'chauffeurs' | 'courses';

type TimeView = 'day' | 'week' | 'month';

export function AdminAWS2023() {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  
  // Profils sélectionnés
  const [selectedClientProfile, setSelectedClientProfile] = useState<Client | null>(null);
  const [selectedChauffeurProfile, setSelectedChauffeurProfile] = useState<Client | null>(null);
  
  // Filtres du dashboard
  const [timeView, setTimeView] = useState<TimeView>('day');
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' });
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);
  const [allCourses, setAllCourses] = useState<Course[]>([]);
  const [periodPage, setPeriodPage] = useState(0); // Pagination pour les périodes
  const periodsPerPage = 15; // Nombre de périodes visibles
  
  // Filtres pour la liste des courses
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [coursesPage, setCoursesPage] = useState(1); // Pagination séparée pour les courses filtrées
  
  // Navigation vers courses avec filtre
  const goToCoursesWithFilter = (filter: string, paymentType?: string) => {
    setStatusFilter(filter);
    if (paymentType) setPaymentFilter(paymentType);
    setCoursesPage(1); // Reset page
    setActiveTab('courses');
  };
  
  // Données
  const [stats, setStats] = useState<Stats | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [chauffeurs, setChauffeurs] = useState<Client[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  const itemsPerPage = 15;

  // Charger les statistiques au montage
  useEffect(() => {
    fetchStats();
  }, []);

  // Charger les données selon l'onglet actif
  useEffect(() => {
    if (activeTab !== 'dashboard') {
      setCurrentPage(1);
      fetchData();
    }
  }, [activeTab]);

  // Recharger quand page ou recherche change
  useEffect(() => {
    if (activeTab !== 'dashboard') {
      fetchData();
    }
  }, [currentPage, searchTerm]);

  // Reset page courses quand filtres changent
  useEffect(() => {
    setCoursesPage(1);
  }, [statusFilter, paymentFilter, searchTerm]);

  async function fetchStats() {
    try {
      const token = localStorage.getItem('admin_token');
      const [statsRes, coursesRes] = await Promise.all([
        fetch('/api/admin/aws-2023/stats', {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch('/api/admin/aws-2023/courses?limit=5000', {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);
      
      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data);
      }
      
      if (coursesRes.ok) {
        const coursesData = await coursesRes.json();
        setAllCourses(coursesData.courses || []);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setIsLoading(false);
    }
  }

  // Filtrer les courses par période sélectionnée
  function getCoursesForPeriod(period: string): Course[] {
    if (!period || !allCourses.length) return [];
    
    return allCourses.filter(course => {
      if (!course.date_creation) return false;
      
      if (timeView === 'day') {
        return course.date_creation.substring(0, 10) === period;
      } else if (timeView === 'week') {
        const date = new Date(course.date_creation);
        const year = date.getFullYear();
        const weekNum = getWeekNumber(date);
        const weekKey = `${year}-S${weekNum.toString().padStart(2, '0')}`;
        return weekKey === period;
      } else {
        return course.date_creation.substring(0, 7) === period;
      }
    });
  }

  // Calculer les stats pour une période
  function getPeriodStats(period: string) {
    const periodCourses = getCoursesForPeriod(period);
    
    // Helper pour vérifier si course terminée
    const isCourseTerminee = (c: Course) => {
      const status = parseInt(c.statut) || 0;
      return status === 2101050 || status === 2101042 || (status >= 5900 && status <= 6000);
    };
    
    // Total des demandes (toutes les courses)
    const totalDemandes = periodCourses.reduce((sum, c) => sum + (parseInt(c.montant_total as string) || 0), 0);
    
    // CA réel (seulement courses terminées)
    const totalCA = periodCourses.reduce((sum, c) => {
      if (isCourseTerminee(c)) {
        return sum + (parseInt(c.montant_total as string) || 0);
      }
      return sum;
    }, 0);
    
    const totalCommission = periodCourses.reduce((sum, c) => {
      if (isCourseTerminee(c)) {
        return sum + (parseInt(c.montant_commission as string) || 0);
      }
      return sum;
    }, 0);
    
    const totalChauffeur = periodCourses.reduce((sum, c) => {
      if (isCourseTerminee(c)) {
        return sum + (parseInt(c.montant_chauffeur as string) || 0);
      }
      return sum;
    }, 0);
    
    // Répartition par statut
    const byStatus: Record<string, number> = {};
    periodCourses.forEach(c => {
      const status = getStatutLabel(c.statut).label;
      byStatus[status] = (byStatus[status] || 0) + 1;
    });
    
    // Répartition par heure
    const byHour: Record<string, number> = {};
    for (let h = 0; h < 24; h++) {
      byHour[h.toString().padStart(2, '0')] = 0;
    }
    periodCourses.forEach(c => {
      if (c.date_creation) {
        const hour = c.date_creation.substring(11, 13);
        if (byHour[hour] !== undefined) byHour[hour]++;
      }
    });
    
    // Top chauffeurs
    const chauffeurStats: Record<string, { nom: string; count: number; ca: number }> = {};
    periodCourses.forEach(c => {
      if (c.chauffeur_prenom) {
        const key = c.chauffeur_id || c.chauffeur_prenom;
        if (!chauffeurStats[key]) {
          chauffeurStats[key] = { nom: `${c.chauffeur_prenom} ${c.chauffeur_nom}`, count: 0, ca: 0 };
        }
        chauffeurStats[key].count++;
        chauffeurStats[key].ca += parseInt(c.montant_total as string) || 0;
      }
    });
    const topChauffeurs = Object.values(chauffeurStats).sort((a, b) => b.ca - a.ca).slice(0, 5);
    
    // Top clients
    const clientStats: Record<string, { nom: string; count: number; ca: number }> = {};
    periodCourses.forEach(c => {
      if (c.client_prenom) {
        const key = c.client_id || c.client_prenom;
        if (!clientStats[key]) {
          clientStats[key] = { nom: `${c.client_prenom} ${c.client_nom}`, count: 0, ca: 0 };
        }
        clientStats[key].count++;
        clientStats[key].ca += parseInt(c.montant_total as string) || 0;
      }
    });
    const topClients = Object.values(clientStats).sort((a, b) => b.ca - a.ca).slice(0, 5);
    
    // Répartition par jour de la semaine
    const joursSemaine = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    const byDayOfWeek: Record<string, number> = {};
    joursSemaine.forEach(jour => { byDayOfWeek[jour] = 0; });
    periodCourses.forEach(c => {
      if (c.date_creation) {
        const date = new Date(c.date_creation);
        const dayIndex = date.getDay();
        byDayOfWeek[joursSemaine[dayIndex]]++;
      }
    });
    
    // Courses terminées vs annulées + temps d'attente
    let terminees = 0, annulees = 0;
    let annuleesClient = 0, annuleesChauffeur = 0, expirees = 0;
    let montantAnnuleesClient = 0, montantAnnuleesChauffeur = 0, montantExpirees = 0;
    const tempsAnnulations: number[] = [];
    
    periodCourses.forEach(c => {
      const status = parseInt(c.statut) || 0;
      const montant = parseInt(c.montant_total as string) || 0;
      
      if (status === 2101050 || status === 2101042 || (status >= 5900 && status <= 6000)) {
        terminees++;
      } else if (status === 4106 || status === 4122 || (status >= 4900 && status <= 5000)) {
        // Annulées par chauffeur
        annulees++;
        annuleesChauffeur++;
        montantAnnuleesChauffeur += montant;
      } else if (status >= 3800 && status < 4000) {
        // Expirées (pas de chauffeur disponible)
        annulees++;
        expirees++;
        montantExpirees += montant;
      } else if (status >= 4096 || status === 4) {
        // Annulées par client
        annulees++;
        annuleesClient++;
        montantAnnuleesClient += montant;
        // Calculer temps d'attente avant annulation
        if (c.date_creation && c.heure_annulation) {
          const dateCreation = new Date(c.date_creation);
          const dateAnnulation = new Date(c.heure_annulation);
          if (!isNaN(dateCreation.getTime()) && !isNaN(dateAnnulation.getTime())) {
            const tempsMinutes = (dateAnnulation.getTime() - dateCreation.getTime()) / (1000 * 60);
            // Filtrer les annulations réalistes (2-60 min)
            if (tempsMinutes >= 2 && tempsMinutes <= 60) {
              tempsAnnulations.push(tempsMinutes);
            }
          }
        }
      }
    });
    
    // Moyenne du temps d'attente (annulations réalistes)
    const tempsAttenteAnnulationMoyen = tempsAnnulations.length > 0 
      ? Math.round(tempsAnnulations.reduce((a, b) => a + b, 0) / tempsAnnulations.length) 
      : 0;
    
    // Total perdu (annulations chauffeur + expirations)
    const totalPerdu = montantAnnuleesChauffeur + montantExpirees;
    
    // Calcul des sessions 2h pour cette période
    const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
    const coursesByClient: Record<string, Course[]> = {};
    periodCourses.forEach(c => {
      const clientId = c.client_id;
      if (!coursesByClient[clientId]) coursesByClient[clientId] = [];
      coursesByClient[clientId].push(c);
    });
    
    let coursesReelles = 0;
    let coursesDoublons = 0;
    let totalDemandesReelles = 0;
    let totalDemandesDoublons = 0;
    
    Object.values(coursesByClient).forEach((clientCourses) => {
      clientCourses.sort((a, b) => new Date(a.date_creation).getTime() - new Date(b.date_creation).getTime());
      
      let sessions = 1;
      let lastDate = new Date(clientCourses[0].date_creation);
      totalDemandesReelles += parseInt(clientCourses[0].montant_total as string) || 0;
      
      for (let i = 1; i < clientCourses.length; i++) {
        const currentDate = new Date(clientCourses[i].date_creation);
        const diff = currentDate.getTime() - lastDate.getTime();
        const montant = parseInt(clientCourses[i].montant_total as string) || 0;
        
        if (diff > TWO_HOURS_MS) {
          sessions++;
          totalDemandesReelles += montant;
        } else {
          totalDemandesDoublons += montant;
        }
        lastDate = currentDate;
      }
      
      coursesReelles += sessions;
      coursesDoublons += (clientCourses.length - sessions);
    });
    
    return {
      nbCourses: periodCourses.length,
      coursesReelles,
      coursesDoublons,
      totalCA, // CA réel (courses terminées)
      totalDemandes, // Total toutes les courses (brut)
      totalDemandesReelles, // CA sans doublons
      totalDemandesDoublons, // CA des doublons
      totalCommission,
      totalChauffeur,
      ticketMoyen: terminees > 0 ? Math.round(totalCA / terminees) : 0,
      terminees,
      annulees,
      annuleesClient,
      annuleesChauffeur,
      expirees,
      montantAnnuleesClient,
      montantAnnuleesChauffeur,
      montantExpirees,
      totalPerdu,
      tempsAttenteAnnulationMoyen,
      tauxConversion: periodCourses.length > 0 ? ((terminees / periodCourses.length) * 100).toFixed(1) : '0',
      byStatus,
      byHour,
      byDayOfWeek,
      topChauffeurs,
      topClients,
      courses: periodCourses
    };
  }

  // Helper pour calculer le numéro de semaine
  function getWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  }

  async function fetchData() {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('admin_token');
      let url = '';
      
      if (activeTab === 'clients') {
        url = `/api/admin/aws-2023/clients?page=${currentPage}&limit=${itemsPerPage}&type=1&hideSpam=true&search=${searchTerm}`;
      } else if (activeTab === 'chauffeurs') {
        url = `/api/admin/aws-2023/clients?page=${currentPage}&limit=${itemsPerPage}&type=2&hideSpam=true&search=${searchTerm}`;
      } else if (activeTab === 'courses') {
        url = `/api/admin/aws-2023/courses?page=${currentPage}&limit=${itemsPerPage}&search=${searchTerm}`;
      }

      if (!url) return;

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        
        if (activeTab === 'clients') {
          setClients(data.clients);
          setTotalPages(data.totalPages);
          setTotalItems(data.total);
        } else if (activeTab === 'chauffeurs') {
          setChauffeurs(data.clients);
          setTotalPages(data.totalPages);
          setTotalItems(data.total);
        } else if (activeTab === 'courses') {
          setCourses(data.courses);
          setTotalPages(data.totalPages);
          setTotalItems(data.total);
        }
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsLoading(false);
    }
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr || dateStr === 'NULL') return '-';
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatShortDate = (dateStr: string) => {
    if (!dateStr || dateStr === 'NULL') return '-';
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short'
    });
  };

  const formatCurrency = (amount: string | number) => {
    const num = typeof amount === 'string' ? parseInt(amount) || 0 : amount;
    return num.toLocaleString('fr-FR') + ' XPF';
  };

  const getStatutLabel = (statut: string) => {
    const statusNum = parseInt(statut) || 0;
    
    // Statuts BookPro - codes exacts ou plages
    // Courses terminées et payées (succès)
    if (statusNum === 2101050 || statusNum === 2101042) {
      return { label: 'Terminée & Payée', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle };
    }
    // Courses terminées avec paiement espèces
    if (statusNum >= 5900 && statusNum <= 6000) {
      return { label: 'Terminée (espèces)', color: 'bg-green-100 text-green-700', icon: CheckCircle };
    }
    // Courses abandonnées par chauffeur
    if (statusNum >= 4900 && statusNum <= 5000) {
      return { label: 'Abandonnée', color: 'bg-orange-100 text-orange-700', icon: XCircle };
    }
    // Courses annulées - réservation
    if (statusNum === 4098) {
      return { label: 'Annulée (résa)', color: 'bg-red-100 text-red-700', icon: XCircle };
    }
    // Courses annulées - chauffeur assigné puis annulé
    if (statusNum === 4106 || statusNum === 4122) {
      return { label: 'Annulée (chauffeur)', color: 'bg-red-100 text-red-700', icon: XCircle };
    }
    // Courses annulées - autres cas (4096-4200)
    if (statusNum >= 4096 && statusNum < 4200) {
      return { label: 'Annulée', color: 'bg-red-100 text-red-700', icon: XCircle };
    }
    // Code 3898 - Course expirée/timeout (pas de chauffeur disponible)
    if (statusNum === 3898) {
      return { label: 'Expirée', color: 'bg-orange-100 text-orange-600', icon: Clock };
    }
    // Plage 3800-3999 - Courses expirées ou timeout
    if (statusNum >= 3800 && statusNum < 4000) {
      return { label: 'Expirée', color: 'bg-orange-100 text-orange-600', icon: Clock };
    }
    // Annulation simple
    if (statusNum === 4) {
      return { label: 'Sans réponse', color: 'bg-gray-100 text-gray-500', icon: AlertCircle };
    }
    // En attente de chauffeur
    if (statusNum === 2) {
      return { label: 'En attente', color: 'bg-yellow-100 text-yellow-700', icon: Clock };
    }
    // En attente initiale
    if (statusNum === 0) {
      return { label: 'Nouvelle', color: 'bg-blue-100 text-blue-700', icon: Clock };
    }
    // Chauffeur accepté
    if (statusNum === 10 || statusNum === 26) {
      return { label: 'Acceptée', color: 'bg-blue-100 text-blue-700', icon: CheckCircle };
    }
    // En route vers client
    if (statusNum === 26 || statusNum === 58) {
      return { label: 'En route', color: 'bg-purple-100 text-purple-700', icon: Car };
    }
    
    // Fallback - afficher le code
    return { label: `Code ${statut}`, color: 'bg-gray-100 text-gray-500', icon: AlertCircle };
  };

  const getPaiementLabel = (typeId: string) => {
    const types: Record<string, { label: string; icon: any }> = {
      '1': { label: 'Espèces', icon: Banknote },
      '2': { label: 'Carte', icon: CreditCard },
      '3': { label: 'Virement', icon: DollarSign },
    };
    return types[typeId] || { label: 'N/A', icon: DollarSign };
  };

  const openGoogleMaps = (fromLat: string, fromLng: string, toLat: string, toLng: string) => {
    if (!fromLat || !toLat || fromLat === 'NULL' || toLat === 'NULL') return;
    const url = `https://www.google.com/maps/dir/${fromLat},${fromLng}/${toLat},${toLng}`;
    window.open(url, '_blank');
  };

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  // Fonction pour générer et télécharger une facture PDF
  const generateInvoice = async (course: Course) => {
    const statusNum = parseInt(course.statut) || 0;
    const isCompleted = statusNum === 2101050 || statusNum === 2101042 || (statusNum >= 5900 && statusNum <= 6000);
    
    if (!isCompleted) {
      alert('Facture disponible uniquement pour les courses terminées et payées.');
      return;
    }
    
    // Déterminer le mode de paiement
    const paymentId = course.type_paiement_id || '';
    const paymentLabel = paymentId === '1' ? 'Espèces' : paymentId === '2' ? 'Carte bancaire' : paymentId === '3' ? 'Virement' : 'Non spécifié';
    
    // Calculer le pourcentage de commission
    const montantTotal = parseInt(course.montant_total || '0');
    const montantCommission = parseInt(course.montant_commission || '0');
    const montantChauffeur = parseInt(course.montant_chauffeur || '0');
    const commissionPercent = montantTotal > 0 ? ((montantCommission / montantTotal) * 100).toFixed(1) : '0';
    
    // Calcul TVA 5% sur la rémunération chauffeur uniquement (pas sur la commission)
    const chauffeurHT = Math.round(montantChauffeur / 1.05);
    const chauffeurTVA = montantChauffeur - chauffeurHT;
    
    // Calcul TVA 13% sur la commission Tape'a
    const commissionHT = Math.round(montantCommission / 1.13);
    const commissionTVA = montantCommission - commissionHT;
    
    // Créer un élément temporaire pour le PDF
    const container = document.createElement('div');
    container.innerHTML = `
      <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; font-size: 12px; color: #333;">
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #7c3aed; padding-bottom: 15px; margin-bottom: 20px;">
          <div>
            <div style="font-size: 28px; font-weight: bold; color: #7c3aed;">TAPE'A</div>
            <div style="font-size: 12px; color: #666;">Facture de course</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 16px; font-weight: bold; color: #333;">N° ${course.order_number}</div>
            <div style="font-size: 11px; color: #666;">${new Date(course.date_creation).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
          </div>
        </div>
        
        <!-- Infos Client/Chauffeur/Paiement -->
        <div style="display: flex; gap: 15px; margin-bottom: 20px;">
          <div style="flex: 1; background: #f8f9fa; padding: 12px; border-radius: 8px;">
            <div style="color: #7c3aed; font-size: 10px; font-weight: bold; text-transform: uppercase; margin-bottom: 8px;">Client</div>
            <div style="font-weight: bold; font-size: 13px;">${course.client_prenom} ${course.client_nom}</div>
            <div style="font-size: 11px; color: #666;">${course.client_mobile || '-'}</div>
            <div style="font-size: 10px; color: #999;">${course.client_email || ''}</div>
          </div>
          <div style="flex: 1; background: #f8f9fa; padding: 12px; border-radius: 8px;">
            <div style="color: #7c3aed; font-size: 10px; font-weight: bold; text-transform: uppercase; margin-bottom: 8px;">Chauffeur</div>
            <div style="font-weight: bold; font-size: 13px;">${course.chauffeur_prenom || 'N/A'} ${course.chauffeur_nom || ''}</div>
            <div style="font-size: 11px; color: #666;">${course.chauffeur_mobile || '-'}</div>
          </div>
          <div style="flex: 1; background: #f8f9fa; padding: 12px; border-radius: 8px;">
            <div style="color: #7c3aed; font-size: 10px; font-weight: bold; text-transform: uppercase; margin-bottom: 8px;">Paiement</div>
            <div style="font-weight: bold; font-size: 13px;">${paymentLabel}</div>
            <div style="font-size: 11px; color: #22c55e; font-weight: bold;">✓ Payée</div>
          </div>
        </div>
        
        <!-- Trajet -->
        <div style="background: linear-gradient(135deg, #f3e8ff 0%, #e9d5ff 100%); padding: 15px; border-radius: 8px; margin-bottom: 20px;">
          <div style="color: #7c3aed; font-size: 11px; font-weight: bold; text-transform: uppercase; margin-bottom: 12px;">Trajet</div>
          <div style="display: flex; gap: 20px; margin-bottom: 10px;">
            <div style="flex: 1;">
              <div style="display: flex; align-items: flex-start; gap: 8px;">
                <div style="width: 10px; height: 10px; border-radius: 50%; background: #22c55e; margin-top: 4px;"></div>
                <div>
                  <div style="font-size: 9px; color: #666; text-transform: uppercase;">Départ</div>
                  <div style="font-size: 12px;">${course.adresse_depart || 'Non renseignée'}</div>
                </div>
              </div>
            </div>
            <div style="flex: 1;">
              <div style="display: flex; align-items: flex-start; gap: 8px;">
                <div style="width: 10px; height: 10px; border-radius: 50%; background: #ef4444; margin-top: 4px;"></div>
                <div>
                  <div style="font-size: 9px; color: #666; text-transform: uppercase;">Arrivée</div>
                  <div style="font-size: 12px;">${course.adresse_arrivee || 'Non renseignée'}</div>
                </div>
              </div>
            </div>
          </div>
          <div style="display: flex; gap: 20px; padding-top: 10px; border-top: 1px solid rgba(124,58,237,0.2); font-size: 11px; color: #666;">
            <span>Distance: ${course.distance_km ? (parseInt(course.distance_km) / 1000).toFixed(1) : '?'} km</span>
            <span>Durée: ${course.duree_min ? Math.round(parseInt(course.duree_min) / 60) : '?'} min</span>
            <span>Passagers: ${course.nb_passagers || '?'}</span>
            <span>Bagages: ${course.nb_bagages || '0'}</span>
          </div>
        </div>
        
        <!-- Montants -->
        <div style="background: #1e1b4b; color: white; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
          <div style="font-size: 10px; opacity: 0.7; margin-bottom: 8px; text-transform: uppercase;">Rémunération chauffeur (TVA 5%)</div>
          <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.1); font-size: 12px;">
            <span>Montant HT</span>
            <span>${chauffeurHT.toLocaleString('fr-FR')} XPF</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.1); font-size: 12px;">
            <span>TVA 5%</span>
            <span>${chauffeurTVA.toLocaleString('fr-FR')} XPF</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.15); font-size: 12px; font-weight: bold;">
            <span>Sous-total chauffeur TTC</span>
            <span>${montantChauffeur.toLocaleString('fr-FR')} XPF</span>
          </div>
          
          <div style="font-size: 10px; opacity: 0.7; margin: 12px 0 8px 0; text-transform: uppercase;">Commission Tape'a (TVA 13%)</div>
          <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.1); font-size: 12px;">
            <span>Montant HT (${commissionPercent}%)</span>
            <span>${commissionHT.toLocaleString('fr-FR')} XPF</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.1); font-size: 12px;">
            <span>TVA 13%</span>
            <span>${commissionTVA.toLocaleString('fr-FR')} XPF</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.15); font-size: 12px; font-weight: bold;">
            <span>Sous-total commission TTC</span>
            <span>${montantCommission.toLocaleString('fr-FR')} XPF</span>
          </div>
          
          <div style="display: flex; justify-content: space-between; padding: 12px 0 0 0; margin-top: 8px; font-size: 16px; font-weight: bold; color: #a78bfa; border-top: 2px solid rgba(255,255,255,0.3);">
            <span>TOTAL TTC (${paymentLabel})</span>
            <span>${montantTotal.toLocaleString('fr-FR')} XPF</span>
          </div>
        </div>
        
        <!-- Mention TVA -->
        <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 6px; padding: 10px; margin-bottom: 15px; font-size: 10px; color: #92400e;">
          <strong>Information fiscale :</strong><br/>
          • TVA taxi 5% sur rémunération chauffeur : ${chauffeurTVA.toLocaleString('fr-FR')} XPF (tarif réglementé)<br/>
          • TVA 13% sur commission Tape'a : ${commissionTVA.toLocaleString('fr-FR')} XPF<br/>
          Tarification conforme à la réglementation en vigueur en Polynésie française.
        </div>
        
        <!-- Footer -->
        <div style="text-align: center; color: #999; font-size: 9px; padding-top: 15px; border-top: 1px solid #eee;">
          <p><strong>Tape'a</strong> - Service de transport en Polynésie française</p>
          <p>Facture émise le ${new Date(course.date_creation).toLocaleDateString('fr-FR')} | Document à conserver | Archive 2023</p>
        </div>
      </div>
    `;
    
    // Options pour html2pdf
    const options = {
      margin: 10,
      filename: `Facture_Tapea_${course.order_number}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    
    // Générer et télécharger le PDF
    try {
      await html2pdf().set(options).from(container).save();
    } catch (error) {
      console.error('Erreur génération PDF:', error);
      alert('Erreur lors de la génération du PDF. Veuillez réessayer.');
    }
  };

  // Fonction pour générer la facture de commission Tape'a → Chauffeur
  const generateCommissionInvoice = async (course: Course) => {
    const statusNum = parseInt(course.statut) || 0;
    const isCompleted = statusNum === 2101050 || statusNum === 2101042 || (statusNum >= 5900 && statusNum <= 6000);
    
    if (!isCompleted) {
      alert('Facture de commission disponible uniquement pour les courses terminées.');
      return;
    }
    
    // Calculer les montants et pourcentages
    const montantTotal = parseInt(course.montant_total || '0');
    const montantCommission = parseInt(course.montant_commission || '0');
    const montantChauffeur = parseInt(course.montant_chauffeur || '0');
    const commissionPercent = montantTotal > 0 ? ((montantCommission / montantTotal) * 100).toFixed(1) : '0';
    
    // Calcul TVA 13% sur la commission (TVA incluse dans le TTC)
    const commissionHT = Math.round(montantCommission / 1.13);
    const commissionTVA = montantCommission - commissionHT;
    
    // Numéro de facture commission (préfixe COM-)
    const invoiceNumber = `COM-${course.order_number}`;
    
    // Créer un élément temporaire pour le PDF
    const container = document.createElement('div');
    container.innerHTML = `
      <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; font-size: 12px; color: #333;">
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #7c3aed; padding-bottom: 15px; margin-bottom: 20px;">
          <div>
            <div style="font-size: 28px; font-weight: bold; color: #7c3aed;">TAPE'A</div>
            <div style="font-size: 12px; color: #666;">Facture de commission</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 16px; font-weight: bold; color: #333;">N° ${invoiceNumber}</div>
            <div style="font-size: 11px; color: #666;">${new Date(course.date_creation).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
          </div>
        </div>
        
        <!-- Émetteur et Destinataire -->
        <div style="display: flex; gap: 20px; margin-bottom: 25px;">
          <div style="flex: 1; background: #7c3aed; color: white; padding: 15px; border-radius: 8px;">
            <div style="font-size: 10px; font-weight: bold; text-transform: uppercase; margin-bottom: 10px; opacity: 0.8;">Émetteur</div>
            <div style="font-weight: bold; font-size: 16px; margin-bottom: 5px;">TAPE'A</div>
            <div style="font-size: 11px; opacity: 0.9;">Service de transport</div>
            <div style="font-size: 11px; opacity: 0.9;">Polynésie française</div>
          </div>
          <div style="flex: 1; background: #f8f9fa; padding: 15px; border-radius: 8px; border: 2px solid #e5e7eb;">
            <div style="color: #7c3aed; font-size: 10px; font-weight: bold; text-transform: uppercase; margin-bottom: 10px;">Destinataire (Chauffeur)</div>
            <div style="font-weight: bold; font-size: 16px; margin-bottom: 5px;">${course.chauffeur_prenom || 'N/A'} ${course.chauffeur_nom || ''}</div>
            <div style="font-size: 11px; color: #666;">${course.chauffeur_mobile || '-'}</div>
            <div style="font-size: 11px; color: #666;">ID: ${course.chauffeur_id || 'N/A'}</div>
          </div>
        </div>
        
        <!-- Référence course -->
        <div style="background: #f3f4f6; padding: 12px; border-radius: 6px; margin-bottom: 20px; border-left: 4px solid #7c3aed;">
          <div style="font-size: 10px; color: #666; text-transform: uppercase; margin-bottom: 5px;">Course de référence</div>
          <div style="display: flex; gap: 20px; flex-wrap: wrap;">
            <div><strong>N° Course:</strong> ${course.order_number}</div>
            <div><strong>Client:</strong> ${course.client_prenom} ${course.client_nom}</div>
            <div><strong>Date:</strong> ${new Date(course.date_creation).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
          </div>
          <div style="margin-top: 8px; font-size: 11px; color: #666;">
            <strong>Trajet:</strong> ${course.adresse_depart || 'N/A'} → ${course.adresse_arrivee || 'N/A'}
          </div>
        </div>
        
        <!-- Détail de la prestation -->
        <div style="margin-bottom: 20px;">
          <div style="font-size: 12px; font-weight: bold; color: #333; margin-bottom: 10px; text-transform: uppercase;">Détail de la prestation</div>
          <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
            <thead>
              <tr style="background: #f3f4f6;">
                <th style="padding: 10px; text-align: left; border-bottom: 2px solid #e5e7eb;">Désignation</th>
                <th style="padding: 10px; text-align: right; border-bottom: 2px solid #e5e7eb;">Base course</th>
                <th style="padding: 10px; text-align: right; border-bottom: 2px solid #e5e7eb;">Taux com.</th>
                <th style="padding: 10px; text-align: right; border-bottom: 2px solid #e5e7eb;">Montant HT</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">Commission de mise en relation<br/><span style="font-size: 10px; color: #666;">Service Tape'a - Course ${course.order_number}</span></td>
                <td style="padding: 10px; text-align: right; border-bottom: 1px solid #e5e7eb;">${montantTotal.toLocaleString('fr-FR')} XPF</td>
                <td style="padding: 10px; text-align: right; border-bottom: 1px solid #e5e7eb;">${commissionPercent}%</td>
                <td style="padding: 10px; text-align: right; border-bottom: 1px solid #e5e7eb; font-weight: bold;">${commissionHT.toLocaleString('fr-FR')} XPF</td>
              </tr>
            </tbody>
          </table>
        </div>
        
        <!-- Récapitulatif TVA et Total -->
        <div style="display: flex; gap: 20px; margin-bottom: 20px;">
          <div style="flex: 1;">
            <div style="background: #e0f2fe; padding: 12px; border-radius: 6px; margin-bottom: 10px;">
              <div style="font-size: 10px; color: #0369a1; text-transform: uppercase; margin-bottom: 5px;">Montant course client</div>
              <div style="font-size: 18px; font-weight: bold; color: #0369a1;">${montantTotal.toLocaleString('fr-FR')} XPF</div>
            </div>
            <div style="background: #dcfce7; padding: 12px; border-radius: 6px;">
              <div style="font-size: 10px; color: #15803d; text-transform: uppercase; margin-bottom: 5px;">Rémunération chauffeur</div>
              <div style="font-size: 18px; font-weight: bold; color: #15803d;">${montantChauffeur.toLocaleString('fr-FR')} XPF</div>
            </div>
          </div>
          <div style="flex: 1; background: #1e1b4b; color: white; padding: 15px; border-radius: 8px;">
            <div style="font-size: 10px; text-transform: uppercase; opacity: 0.8; margin-bottom: 8px;">Commission Tape'a</div>
            <div style="display: flex; justify-content: space-between; padding: 4px 0; font-size: 12px; opacity: 0.9;">
              <span>Total HT</span>
              <span>${commissionHT.toLocaleString('fr-FR')} XPF</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 4px 0; font-size: 12px; opacity: 0.9;">
              <span>TVA 13%</span>
              <span>${commissionTVA.toLocaleString('fr-FR')} XPF</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 8px 0 0 0; margin-top: 6px; border-top: 1px solid rgba(255,255,255,0.3); font-size: 16px; font-weight: bold; color: #a78bfa;">
              <span>TOTAL TTC</span>
              <span>${montantCommission.toLocaleString('fr-FR')} XPF</span>
            </div>
          </div>
        </div>
        
        <!-- Mention TVA -->
        <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 6px; padding: 10px; margin-bottom: 15px; font-size: 10px; color: #92400e;">
          <strong>Information fiscale :</strong> TVA à 13% incluse dans le montant de la commission (${commissionTVA.toLocaleString('fr-FR')} XPF). 
          Tarification conforme à la réglementation en vigueur en Polynésie française.
        </div>
        
        <!-- Footer -->
        <div style="text-align: center; color: #999; font-size: 9px; padding-top: 15px; border-top: 1px solid #eee;">
          <p><strong>Tape'a</strong> - Service de transport en Polynésie française</p>
          <p>Facture de commission émise le ${new Date(course.date_creation).toLocaleDateString('fr-FR')} | Document à conserver | Archive 2023</p>
        </div>
      </div>
    `;
    
    // Options pour html2pdf
    const options = {
      margin: 10,
      filename: `Facture_Commission_${invoiceNumber}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    
    // Générer et télécharger le PDF
    try {
      await html2pdf().set(options).from(container).save();
    } catch (error) {
      console.error('Erreur génération PDF commission:', error);
      alert('Erreur lors de la génération du PDF. Veuillez réessayer.');
    }
  };

  // Obtenir les courses d'un client spécifique
  const getClientCourses = (clientId: string) => {
    return allCourses.filter(course => course.client_id === clientId)
      .sort((a, b) => new Date(b.date_creation).getTime() - new Date(a.date_creation).getTime());
  };

  // Obtenir les courses d'un chauffeur spécifique
  const getChauffeurCourses = (chauffeurId: string) => {
    return allCourses.filter(course => course.chauffeur_id === chauffeurId)
      .sort((a, b) => new Date(b.date_creation).getTime() - new Date(a.date_creation).getTime());
  };

  // Calculer les stats d'un profil
  const getProfileStats = (courses: Course[]) => {
    const terminees = courses.filter(c => {
      const s = parseInt(c.statut) || 0;
      return s === 2101050 || s === 2101042 || (s >= 5900 && s <= 6000);
    });
    const annulees = courses.filter(c => {
      const s = parseInt(c.statut) || 0;
      return s >= 4096 || s === 4;
    });
    const totalCA = terminees.reduce((sum, c) => sum + (parseInt(c.montant_total as string) || 0), 0);
    const totalCommission = terminees.reduce((sum, c) => sum + (parseInt(c.montant_commission as string) || 0), 0);
    const totalChauffeur = terminees.reduce((sum, c) => sum + (parseInt(c.montant_chauffeur as string) || 0), 0);
    
    return {
      total: courses.length,
      terminees: terminees.length,
      annulees: annulees.length,
      enCours: courses.length - terminees.length - annulees.length,
      totalCA,
      totalCommission,
      totalChauffeur,
      ticketMoyen: terminees.length > 0 ? Math.round(totalCA / terminees.length) : 0
    };
  };

  // Ouvrir le profil d'un client depuis une course
  const openClientProfile = (course: Course) => {
    const client: Client = {
      id: course.client_id,
      user_number: '',
      user_code: '',
      first_name: course.client_prenom,
      last_name: course.client_nom,
      mobile: course.client_mobile,
      email: course.client_email,
      user_type: 'client'
    };
    setSelectedChauffeurProfile(null);
    setSelectedClientProfile(client);
  };

  // Ouvrir le profil d'un chauffeur depuis une course
  const openChauffeurProfile = (course: Course) => {
    const chauffeur: Client = {
      id: course.chauffeur_id,
      user_number: '',
      user_code: '',
      first_name: course.chauffeur_prenom,
      last_name: course.chauffeur_nom,
      mobile: course.chauffeur_mobile,
      email: course.chauffeur_email,
      user_type: 'chauffeur'
    };
    setSelectedClientProfile(null);
    setSelectedChauffeurProfile(chauffeur);
  };

  // Filtrer les courses par statut, paiement et recherche (sur TOUTES les courses)
  const getFilteredCourses = () => {
    let filtered = allCourses; // Utiliser toutes les courses, pas la pagination
    
    // Filtre par recherche textuelle
    if (searchTerm.trim()) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(course => 
        course.order_number?.toLowerCase().includes(search) ||
        course.client_prenom?.toLowerCase().includes(search) ||
        course.client_nom?.toLowerCase().includes(search) ||
        course.chauffeur_prenom?.toLowerCase().includes(search) ||
        course.chauffeur_nom?.toLowerCase().includes(search) ||
        course.adresse_depart?.toLowerCase().includes(search) ||
        course.adresse_arrivee?.toLowerCase().includes(search)
      );
    }
    
    // Filtre par statut
    if (statusFilter !== 'all') {
      filtered = filtered.filter(course => {
        const statusNum = parseInt(course.statut) || 0;
        
        switch (statusFilter) {
          case 'completed':
            return statusNum === 2101050 || statusNum === 2101042 || (statusNum >= 5900 && statusNum <= 6000);
          case 'cancelled':
            return statusNum >= 4096 || statusNum === 4;
          case 'pending':
            return statusNum === 2 || statusNum === 0;
          case 'abandoned':
            return statusNum >= 4900 && statusNum <= 5000;
          default:
            return true;
        }
      });
    }
    
    // Filtre par mode de paiement
    if (paymentFilter !== 'all') {
      filtered = filtered.filter(course => {
        const paymentId = course.type_paiement_id || '';
        switch (paymentFilter) {
          case 'cash':
            return paymentId === '1';
          case 'card':
            return paymentId === '2';
          case 'transfer':
            return paymentId === '3';
          default:
            return true;
        }
      });
    }
    
    return filtered;
  };

  // Pagination côté frontend des courses filtrées
  const getPagedFilteredCourses = () => {
    const filtered = getFilteredCourses();
    const startIndex = (coursesPage - 1) * itemsPerPage;
    return filtered.slice(startIndex, startIndex + itemsPerPage);
  };

  // Nombre total de pages pour les courses filtrées
  const getFilteredTotalPages = () => {
    return Math.ceil(getFilteredCourses().length / itemsPerPage);
  };

  // Reset page quand on change de filtre
  const handleStatusFilterChange = (filter: string) => {
    setStatusFilter(filter);
    setCoursesPage(1);
  };

  const handlePaymentFilterChange = (filter: string) => {
    setPaymentFilter(filter);
    setCoursesPage(1);
  };

  const handleCoursesSearch = (value: string) => {
    setSearchTerm(value);
    setCoursesPage(1);
  };

  // Compter les courses par statut (sur TOUTES les courses)
  const getStatusCounts = () => {
    const counts = { all: allCourses.length, completed: 0, cancelled: 0, pending: 0, abandoned: 0 };
    
    allCourses.forEach(course => {
      const statusNum = parseInt(course.statut) || 0;
      
      if (statusNum === 2101050 || statusNum === 2101042 || (statusNum >= 5900 && statusNum <= 6000)) {
        counts.completed++;
      } else if (statusNum >= 4096 || statusNum === 4) {
        counts.cancelled++;
      } else if (statusNum === 2 || statusNum === 0) {
        counts.pending++;
      } else if (statusNum >= 4900 && statusNum <= 5000) {
        counts.abandoned++;
      }
    });
    
    return counts;
  };

  // Compter les courses par mode de paiement (sur TOUTES les courses)
  const getPaymentCounts = () => {
    const counts = { all: allCourses.length, cash: 0, card: 0, transfer: 0 };
    
    allCourses.forEach(course => {
      const paymentId = course.type_paiement_id || '';
      if (paymentId === '1') counts.cash++;
      else if (paymentId === '2') counts.card++;
      else if (paymentId === '3') counts.transfer++;
    });
    
    return counts;
  };

  // Composant Modal pour détails course
  const CourseDetailModal = ({ course, onClose }: { course: Course; onClose: () => void }) => {
    const statutInfo = getStatutLabel(course.statut);
    const isConfirmed = course.chauffeur_prenom && course.chauffeur_prenom.length > 0;
    const isCompleted = parseInt(course.statut) === 2101050 || parseInt(course.statut) === 2101042 || (parseInt(course.statut) >= 5900 && parseInt(course.statut) <= 6000);
    
    return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="text-xl font-bold text-gray-900">Course #{course.order_number}</h3>
              <p className="text-sm text-gray-500">{formatDate(course.date_creation)}</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
          </div>

          {/* Statut de confirmation */}
          <div className={`rounded-xl p-4 mb-6 ${statutInfo.color}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <statutInfo.icon className="h-6 w-6" />
                <div>
                  <p className="font-bold text-lg">{statutInfo.label}</p>
                  <p className="text-sm opacity-75">
                    {isConfirmed ? '✓ Chauffeur assigné' : '✗ Aucun chauffeur assigné'}
                  </p>
                </div>
              </div>
              {isCompleted && (
                <span className="bg-white/30 rounded-full px-3 py-1 text-sm font-medium">
                  Course réussie
                </span>
              )}
            </div>
          </div>

          {/* Timeline / Horaires */}
          <div className="bg-gray-50 rounded-xl p-4 mb-6">
            <p className="text-sm font-medium text-gray-600 mb-3">Chronologie</p>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${course.date_creation ? 'bg-blue-500' : 'bg-gray-300'}`}></div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Demande créée</p>
                  <p className="text-xs text-gray-500">{course.date_creation ? formatDate(course.date_creation) : '-'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${isConfirmed ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Chauffeur assigné</p>
                  <p className="text-xs text-gray-500">
                    {isConfirmed 
                      ? `${course.chauffeur_prenom} ${course.chauffeur_nom}${course.heure_acceptation && course.heure_acceptation !== 'NULL' ? ` • ${formatDate(course.heure_acceptation)}` : ''}`
                      : 'Non confirmé'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${course.heure_debut && course.heure_debut !== 'NULL' ? 'bg-purple-500' : 'bg-gray-300'}`}></div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Prise en charge</p>
                  <p className="text-xs text-gray-500">{course.heure_prise_en_charge && course.heure_prise_en_charge !== 'NULL' ? formatDate(course.heure_prise_en_charge) : 'Non effectuée'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${course.heure_fin_course && course.heure_fin_course !== 'NULL' ? 'bg-emerald-500' : 'bg-gray-300'}`}></div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Course terminée</p>
                  <p className="text-xs text-gray-500">{course.heure_fin_course && course.heure_fin_course !== 'NULL' ? formatDate(course.heure_fin_course) : 'Non terminée'}</p>
                </div>
              </div>
              
              {/* Afficher l'annulation si elle existe */}
              {course.heure_annulation && course.heure_annulation !== 'NULL' && (
                <div className="flex items-center gap-3 pt-2 border-t border-red-200">
                  <div className="w-3 h-3 rounded-full bg-red-500"></div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-red-600">Course annulée</p>
                    <p className="text-xs text-red-500">{formatDate(course.heure_annulation)}</p>
                    {course.type_annulation && course.type_annulation !== 'NULL' && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        {course.type_annulation === '10' ? 'Annulée par client' : 
                         course.type_annulation === '11' ? 'Annulée par client (résa)' :
                         course.type_annulation === '20' ? 'Annulée par chauffeur' :
                         course.type_annulation === '21' ? 'Annulée par chauffeur (résa)' :
                         course.type_annulation === '24' ? 'Chauffeur non arrivé' :
                         course.type_annulation === '25' ? 'Client non présent' :
                         `Type: ${course.type_annulation}`}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Montants */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-purple-50 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-purple-600">{formatCurrency(course.montant_total)}</p>
              <p className="text-xs text-gray-500">Total</p>
            </div>
            <div className="bg-green-50 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-green-600">{formatCurrency(course.montant_chauffeur)}</p>
              <p className="text-xs text-gray-500">Chauffeur</p>
            </div>
            <div className="bg-orange-50 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-orange-600">{formatCurrency(course.montant_commission)}</p>
              <p className="text-xs text-gray-500">Commission</p>
            </div>
          </div>

          {/* Client & Chauffeur */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-blue-50 rounded-xl p-4">
              <p className="text-sm font-medium text-blue-600 mb-2">Client</p>
              <p className="font-semibold">{course.client_prenom} {course.client_nom}</p>
              <p className="text-sm text-gray-600">{course.client_email}</p>
              <p className="text-sm text-gray-600">{course.client_mobile}</p>
            </div>
            <div className={`rounded-xl p-4 ${isConfirmed ? 'bg-green-50' : 'bg-red-50'}`}>
              <p className={`text-sm font-medium mb-2 ${isConfirmed ? 'text-green-600' : 'text-red-600'}`}>
                Chauffeur {isConfirmed ? '✓' : '✗'}
              </p>
              {course.chauffeur_prenom ? (
                <>
                  <p className="font-semibold">{course.chauffeur_prenom} {course.chauffeur_nom}</p>
                  <p className="text-sm text-gray-600">{course.chauffeur_email}</p>
                  <p className="text-sm text-gray-600">{course.chauffeur_mobile}</p>
                </>
              ) : (
                <p className="text-red-400 font-medium">Aucun chauffeur n'a accepté cette course</p>
              )}
            </div>
          </div>

          {/* Trajet */}
          <div className="bg-gray-50 rounded-xl p-4 mb-6">
            <p className="text-sm font-medium text-gray-600 mb-3">Trajet</p>
            <div className="space-y-2">
              <div className="flex items-start gap-3">
                <span className="text-green-600 text-lg">●</span>
                <div>
                  <p className="font-medium">{course.adresse_depart}</p>
                  <p className="text-xs text-gray-500">{course.code_postal_depart}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-red-600 text-lg">●</span>
                <div>
                  <p className="font-medium">{course.adresse_arrivee}</p>
                  <p className="text-xs text-gray-500">{course.code_postal_arrivee}</p>
                </div>
              </div>
            </div>
            <button
              onClick={() => openGoogleMaps(course.depart_lat, course.depart_lng, course.arrivee_lat, course.arrivee_lng)}
              className="mt-4 w-full rounded-lg bg-blue-600 px-4 py-2 text-white font-medium hover:bg-blue-700 flex items-center justify-center gap-2"
            >
              <MapPin className="h-4 w-4" />
              Voir sur Google Maps
            </button>
          </div>

          {/* Infos supplémentaires */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="text-center">
              <p className="text-lg font-bold text-gray-900">{course.nb_passagers || '0'}</p>
              <p className="text-xs text-gray-500">Passagers</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-gray-900">{course.nb_bagages || '0'}</p>
              <p className="text-xs text-gray-500">Bagages</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-gray-900">{course.distance_km ? (parseInt(course.distance_km) / 1000).toFixed(1) : '0'} km</p>
              <p className="text-xs text-gray-500">Distance</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-gray-900">{course.duree_min ? Math.round(parseInt(course.duree_min) / 60) : '0'} min</p>
              <p className="text-xs text-gray-500">Durée</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
  };

  return (
    <div className="space-y-4 sm:space-y-6 w-full overflow-hidden px-1 sm:px-0">
      {/* Header compact sur mobile */}
      <div className="relative overflow-hidden rounded-xl sm:rounded-2xl bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4 sm:p-6 shadow-xl">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMtNi42MjcgMC0xMiA1LjM3My0xMiAxMnM1LjM3MyAxMiAxMiAxMiAxMi01LjM3MyAxMi0xMi01LjM3My0xMi0xMi0xMnptMCAxOGMtMy4zMTQgMC02LTIuNjg2LTYtNnMyLjY4Ni02IDYtNiA2IDIuNjg2IDYgNi0yLjY4NiA2LTYgNnoiIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iLjAyIi8+PC9nPjwvc3ZnPg==')] opacity-40"></div>
        <div className="relative">
          {/* Titre et icône */}
          <div className="flex items-center gap-2 sm:gap-3 mb-2">
            <div className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 shadow-lg">
              <Database className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
            </div>
            <h1 className="text-xl sm:text-3xl font-bold text-white tracking-tight">
              AWS 2023
            </h1>
          </div>
          {/* Infos période sur mobile */}
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <div className="flex items-center gap-1.5 bg-white/10 backdrop-blur-sm rounded-lg px-2.5 py-1.5 text-xs sm:text-sm">
              <Clock className="h-3 w-3 sm:h-4 sm:w-4 text-purple-300" />
              <span className="text-white font-medium">
                {stats?.periode?.debut && stats?.periode?.fin ? 
                  `${formatShortDate(stats.periode.debut)} → ${formatShortDate(stats.periode.fin)}` : 
                  'Archives'
                }
              </span>
            </div>
            {stats && (
              <div className="flex items-center gap-2 text-white/70 text-xs sm:text-sm">
                <span>{stats.nbCourses} courses</span>
                <span className="hidden sm:inline">•</span>
                <span className="hidden sm:inline">{stats.nbClientsLegit} clients</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Onglets - scrollable sur mobile */}
      <div className="flex gap-1 sm:gap-2 bg-slate-100 p-1 sm:p-1.5 rounded-lg sm:rounded-xl w-full overflow-x-auto scrollbar-hide">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`flex-shrink-0 px-3 sm:px-5 py-2 sm:py-2.5 rounded-md sm:rounded-lg text-xs sm:text-sm font-semibold transition-all flex items-center gap-1.5 sm:gap-2 ${
            activeTab === 'dashboard'
              ? 'bg-white text-purple-700 shadow-md'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <BarChart3 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          <span className="hidden xs:inline">Dashboard</span>
          <span className="xs:hidden">Stats</span>
        </button>
        <button
          onClick={() => setActiveTab('courses')}
          className={`flex-shrink-0 px-3 sm:px-5 py-2 sm:py-2.5 rounded-md sm:rounded-lg text-xs sm:text-sm font-semibold transition-all flex items-center gap-1.5 sm:gap-2 ${
            activeTab === 'courses'
              ? 'bg-white text-purple-700 shadow-md'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <MapPin className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          Courses
        </button>
        <button
          onClick={() => setActiveTab('clients')}
          className={`flex-shrink-0 px-3 sm:px-5 py-2 sm:py-2.5 rounded-md sm:rounded-lg text-xs sm:text-sm font-semibold transition-all flex items-center gap-1.5 sm:gap-2 ${
            activeTab === 'clients'
              ? 'bg-white text-purple-700 shadow-md'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <User className="h-4 w-4" />
          Clients
        </button>
        <button
          onClick={() => setActiveTab('chauffeurs')}
          className={`flex-shrink-0 px-3 sm:px-5 py-2 sm:py-2.5 rounded-md sm:rounded-lg text-xs sm:text-sm font-semibold transition-all flex items-center gap-1.5 sm:gap-2 ${
            activeTab === 'chauffeurs'
              ? 'bg-white text-purple-700 shadow-md'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <Truck className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          <span className="hidden sm:inline">Chauffeurs</span>
          <span className="sm:hidden">Chauff.</span>
        </button>
      </div>

      {/* === DASHBOARD === */}
      {activeTab === 'dashboard' && stats && (
        <div className="space-y-4 sm:space-y-6">
          {/* Contrôles - responsive */}
          <div className="bg-gradient-to-r from-slate-50 to-purple-50 rounded-xl sm:rounded-2xl p-3 sm:p-5 border border-slate-200/50 shadow-sm">
            {/* Sélecteur de granularité - pleine largeur sur mobile */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-4 sm:mb-5">
              <div className="flex items-center justify-between sm:justify-start gap-2 sm:gap-3">
                <span className="text-xs sm:text-sm font-semibold text-slate-600">Vue:</span>
                <div className="flex rounded-lg sm:rounded-xl overflow-hidden border border-slate-200 bg-white shadow-sm">
                  {(['day', 'week', 'month'] as TimeView[]).map((view) => (
                    <button
                      key={view}
                      onClick={() => {
                        setTimeView(view);
                        setSelectedPeriod(null);
                        setPeriodPage(0);
                      }}
                      className={`px-3 sm:px-5 py-2 sm:py-2.5 text-xs sm:text-sm font-semibold transition-all ${
                        timeView === view
                          ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-inner'
                          : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {view === 'day' ? 'Jour' : view === 'week' ? 'Sem.' : 'Mois'}
                    </button>
                  ))}
                </div>
              </div>
              
              {selectedPeriod && (
                <button 
                  onClick={() => setSelectedPeriod(null)}
                  className="px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium bg-white hover:bg-red-50 border border-red-200 text-red-600 rounded-lg sm:rounded-xl transition-all flex items-center justify-center gap-1.5 sm:gap-2"
                >
                  <XCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  <span className="hidden sm:inline">Effacer sélection</span>
                  <span className="sm:hidden">Effacer</span>
                </button>
              )}
            </div>

            {/* Slider de sélection de période */}
            {(() => {
              const dataToShow = timeView === 'day' 
                ? stats.coursesByDay 
                : timeView === 'week' 
                  ? stats.coursesByWeek 
                  : stats.coursesByMonth;
              
              const allEntries = Object.entries(dataToShow || {})
                .sort((a, b) => a[0].localeCompare(b[0])); // Du plus ancien au plus récent
              
              const totalPeriods = allEntries.length;
              const selectedIndex = selectedPeriod 
                ? allEntries.findIndex(([p]) => p === selectedPeriod)
                : -1;
              
              // Fonction pour formater les labels
              const formatLabel = (period: string) => {
                const moisNoms = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
                const moisComplets = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
                
                if (timeView === 'day') {
                  const parts = period.split('-');
                  if (parts.length === 3) {
                    const monthIdx = parseInt(parts[1]) - 1;
                    return { short: `${parts[2]}/${parts[1]}`, long: `${parts[2]} ${moisComplets[monthIdx]} ${parts[0]}` };
                  }
                } else if (timeView === 'week') {
                  const match = period.match(/(\d{4})-S(\d+)/);
                  if (match) {
                    const year = parseInt(match[1]);
                    const weekNum = parseInt(match[2]);
                    const firstDayOfYear = new Date(year, 0, 1);
                    const daysOffset = (weekNum - 1) * 7;
                    const firstDayOfWeek = new Date(firstDayOfYear);
                    firstDayOfWeek.setDate(firstDayOfYear.getDate() + daysOffset - firstDayOfYear.getDay() + 1);
                    const lastDayOfWeek = new Date(firstDayOfWeek);
                    lastDayOfWeek.setDate(firstDayOfWeek.getDate() + 6);
                    return { 
                      short: `S${weekNum}`, 
                      long: `Semaine ${weekNum} (${firstDayOfWeek.getDate()}-${lastDayOfWeek.getDate()} ${moisNoms[firstDayOfWeek.getMonth()]} ${year})` 
                    };
                  }
                } else {
                  const parts = period.split('-');
                  if (parts.length === 2) {
                    const monthIdx = parseInt(parts[1]) - 1;
                    return { short: moisNoms[monthIdx], long: `${moisComplets[monthIdx]} ${parts[0]}` };
                  }
                }
                return { short: period, long: period };
              };
              
              // Données de la période sélectionnée
              const selectedData = selectedIndex >= 0 ? allEntries[selectedIndex][1] : null;
              const firstPeriod = allEntries[0]?.[0];
              const lastPeriod = allEntries[allEntries.length - 1]?.[0];
              
              return (
                <div className="space-y-3 sm:space-y-4">
                  {/* Label et infos - empilé sur mobile */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                      <Calendar className="h-4 w-4 sm:h-5 sm:w-5 text-purple-600" />
                      <span className="text-xs sm:text-sm font-semibold text-slate-700">
                        Période :
                      </span>
                      {selectedPeriod ? (
                        <span className="px-2.5 py-1 sm:px-4 sm:py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-full text-xs sm:text-sm font-bold shadow-md">
                          {formatLabel(selectedPeriod).long}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs sm:text-sm">Glissez pour sélectionner</span>
                      )}
                    </div>
                    {selectedData && (
                      <div className="flex items-center gap-3 sm:gap-4 text-xs sm:text-sm bg-white/50 rounded-lg px-2 py-1 sm:bg-transparent sm:p-0">
                        <span className="text-slate-600"><strong className="text-purple-600">{selectedData.count}</strong> courses</span>
                        <span className="text-slate-600"><strong className="text-emerald-600">{formatCurrency(selectedData.ca)}</strong></span>
                      </div>
                    )}
                  </div>
                  
                  {/* Slider container - plus grand sur mobile pour faciliter le touch */}
                  <div className="relative pt-2 pb-6 sm:pb-8">
                    {/* Barre de fond avec gradient */}
                    <div className="absolute left-0 right-0 top-5 sm:top-6 h-2.5 sm:h-2 bg-gradient-to-r from-slate-200 via-purple-200 to-slate-200 rounded-full"></div>
                    
                    {/* Barre de progression */}
                    {selectedIndex >= 0 && (
                      <div 
                        className="absolute top-5 sm:top-6 left-0 h-2.5 sm:h-2 bg-gradient-to-r from-purple-500 to-indigo-600 rounded-full transition-all duration-200"
                        style={{ width: `${((selectedIndex + 1) / totalPeriods) * 100}%` }}
                      ></div>
                    )}
                    
                    {/* Input range - plus gros thumb sur mobile */}
                    <input
                      type="range"
                      min="0"
                      max={totalPeriods - 1}
                      value={selectedIndex >= 0 ? selectedIndex : 0}
                      onChange={(e) => {
                        const idx = parseInt(e.target.value);
                        const period = allEntries[idx]?.[0];
                        if (period) setSelectedPeriod(period);
                      }}
                      className="relative w-full h-8 sm:h-2 appearance-none bg-transparent cursor-pointer z-10 touch-pan-x
                        [&::-webkit-slider-thumb]:appearance-none
                        [&::-webkit-slider-thumb]:w-8
                        [&::-webkit-slider-thumb]:h-8
                        [&::-webkit-slider-thumb]:sm:w-6
                        [&::-webkit-slider-thumb]:sm:h-6
                        [&::-webkit-slider-thumb]:rounded-full
                        [&::-webkit-slider-thumb]:bg-gradient-to-br
                        [&::-webkit-slider-thumb]:from-purple-500
                        [&::-webkit-slider-thumb]:to-indigo-600
                        [&::-webkit-slider-thumb]:shadow-lg
                        [&::-webkit-slider-thumb]:border-4
                        [&::-webkit-slider-thumb]:border-white
                        [&::-webkit-slider-thumb]:cursor-grab
                        [&::-webkit-slider-thumb]:active:cursor-grabbing
                        [&::-webkit-slider-thumb]:active:scale-110
                        [&::-webkit-slider-thumb]:transition-transform
                        [&::-webkit-slider-thumb]:hover:scale-110
                        [&::-moz-range-thumb]:w-6
                        [&::-moz-range-thumb]:h-6
                        [&::-moz-range-thumb]:rounded-full
                        [&::-moz-range-thumb]:bg-gradient-to-br
                        [&::-moz-range-thumb]:from-purple-500
                        [&::-moz-range-thumb]:to-indigo-600
                        [&::-moz-range-thumb]:shadow-lg
                        [&::-moz-range-thumb]:border-4
                        [&::-moz-range-thumb]:border-white
                        [&::-moz-range-thumb]:cursor-grab"
                      style={{ marginTop: '14px' }}
                    />
                    
                    {/* Marqueurs de début et fin */}
                    <div className="flex justify-between mt-2 text-xs text-slate-500">
                      <span className="font-medium">{firstPeriod ? formatLabel(firstPeriod).short : ''}</span>
                      <span className="font-medium">{lastPeriod ? formatLabel(lastPeriod).short : ''}</span>
                    </div>
                  </div>
                  
                  {/* Mini graphique d'activité sous le slider */}
                  <div className="flex items-end gap-[2px] h-12 px-1">
                    {allEntries.map(([period, data], idx) => {
                      const maxCount = Math.max(...allEntries.map(([, d]) => d.count), 1);
                      const heightPercent = (data.count / maxCount) * 100;
                      const isSelected = period === selectedPeriod;
                      
                      return (
                        <div 
                          key={period}
                          className={`flex-1 rounded-t cursor-pointer transition-all ${
                            isSelected 
                              ? 'bg-gradient-to-t from-purple-600 to-indigo-500' 
                              : 'bg-gradient-to-t from-slate-300 to-slate-200 hover:from-purple-300 hover:to-purple-200'
                          }`}
                          style={{ height: `${Math.max(heightPercent, 4)}%` }}
                          onClick={() => setSelectedPeriod(period)}
                          title={`${formatLabel(period).short}: ${data.count} courses`}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Titre de la section stats */}
          {selectedPeriod && (
            <div className="relative overflow-hidden bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 rounded-2xl p-5 text-white shadow-xl">
              <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0wIDBoNDB2NDBIMHoiLz48cGF0aCBkPSJNMjAgMjBMNDAgMHY0MEgwVjBsMjAgMjB6IiBmaWxsPSIjZmZmIiBmaWxsLW9wYWNpdHk9Ii4wMiIvPjwvZz48L3N2Zz4=')] opacity-50"></div>
              <div className="relative flex items-center justify-between">
                <div>
                  <p className="text-purple-200 text-sm font-medium">Analyse détaillée</p>
                  <p className="text-2xl font-bold mt-1">{timeView === 'day' ? 'Journée du' : timeView === 'week' ? 'Semaine' : 'Mois de'} {selectedPeriod}</p>
                </div>
                <button 
                  onClick={() => setSelectedPeriod(null)}
                  className="px-5 py-2.5 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-xl text-sm font-semibold transition-all border border-white/20"
                >
                  ← Retour aux stats globales
                </button>
              </div>
            </div>
          )}

          {/* KPIs principaux - design moderne */}
          {(() => {
            const periodStats = selectedPeriod ? getPeriodStats(selectedPeriod) : null;
            const displayCA = periodStats ? periodStats.totalCA : stats.totalCA;
            const displayDemandes = periodStats ? periodStats.totalDemandes : stats.totalDemandes;
            const displayDemandesReelles = periodStats ? periodStats.totalDemandesReelles : stats.totalDemandesReelles;
            const displayDemandesDoublons = periodStats ? periodStats.totalDemandesDoublons : stats.totalDemandesDoublons;
            const displayChauffeur = periodStats ? periodStats.totalChauffeur : stats.totalGainsChauffeurs;
            const displayCommission = periodStats ? periodStats.totalCommission : stats.totalCommission;
            const displayTicket = periodStats ? periodStats.ticketMoyen : stats.ticketMoyen;
            const displayCourses = periodStats ? periodStats.nbCourses : stats.nbCourses;
            const displayCoursesReelles = periodStats ? periodStats.coursesReelles : stats.coursesReelles;
            const displayCoursesDoublons = periodStats ? periodStats.coursesDoublons : stats.coursesDoublons;
            const displayTerminees = periodStats ? periodStats.terminees : stats.coursesTerminees;
            const displayAnnulees = periodStats ? periodStats.annulees : stats.coursesAnnulees;
            
            // Calculer les annulations globales si pas de période sélectionnée
            const globalAnnulations = (() => {
              let client = 0, chauffeur = 0, expire = 0;
              let mClient = 0, mChauffeur = 0, mExpire = 0;
              allCourses.forEach(c => {
                const s = parseInt(c.statut) || 0;
                const m = parseInt(c.montant_total as string) || 0;
                if (s === 4106 || s === 4122 || (s >= 4900 && s <= 5000)) {
                  chauffeur++; mChauffeur += m;
                } else if (s >= 3800 && s < 4000) {
                  expire++; mExpire += m;
                } else if (s >= 4096 || s === 4) {
                  client++; mClient += m;
                }
              });
              return { client, chauffeur, expire, mClient, mChauffeur, mExpire, total: mChauffeur + mExpire };
            })();
            
            const displayAnnuleesClient = periodStats?.annuleesClient ?? globalAnnulations.client;
            const displayAnnuleesChauffeur = periodStats?.annuleesChauffeur ?? globalAnnulations.chauffeur;
            const displayExpirees = periodStats?.expirees ?? globalAnnulations.expire;
            const displayMontantAnnuleesClient = periodStats?.montantAnnuleesClient ?? globalAnnulations.mClient;
            const displayMontantAnnuleesChauffeur = periodStats?.montantAnnuleesChauffeur ?? globalAnnulations.mChauffeur;
            const displayMontantExpirees = periodStats?.montantExpirees ?? globalAnnulations.mExpire;
            const displayTotalPerdu = periodStats?.totalPerdu ?? globalAnnulations.total;

            return (
              <>
                {/* KPIs financiers - responsive grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-4">
                  {/* CA Réel - courses terminées */}
                  <div className="relative overflow-hidden rounded-xl sm:rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 p-3 sm:p-5 text-white shadow-lg">
                    <div className="absolute -right-4 -top-4 h-16 sm:h-24 w-16 sm:w-24 rounded-full bg-white/10 blur-2xl"></div>
                    <div className="relative">
                      <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
                        <div className="p-1.5 sm:p-2 rounded-md sm:rounded-lg bg-white/20">
                          <CheckCircle className="h-3.5 w-3.5 sm:h-5 sm:w-5" />
                        </div>
                        <div>
                          <p className="text-emerald-100 text-[10px] sm:text-sm font-medium">CA Réel</p>
                          <p className="text-emerald-200/70 text-[8px] sm:text-[10px] hidden sm:block">Courses terminées</p>
                        </div>
                      </div>
                      <p className="text-lg sm:text-3xl font-black tracking-tight">{formatCurrency(displayCA)}</p>
                    </div>
                  </div>
                  
                  {/* Total Demandes - avec distinction brut/réel */}
                  <div className="relative overflow-hidden rounded-xl sm:rounded-2xl bg-gradient-to-br from-violet-600 to-purple-700 p-3 sm:p-5 text-white shadow-lg">
                    <div className="absolute -right-4 -top-4 h-16 sm:h-24 w-16 sm:w-24 rounded-full bg-white/10 blur-2xl"></div>
                    <div className="relative">
                      <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
                        <div className="p-1.5 sm:p-2 rounded-md sm:rounded-lg bg-white/20">
                          <TrendingUp className="h-3.5 w-3.5 sm:h-5 sm:w-5" />
                        </div>
                        <div>
                          <p className="text-violet-200 text-[10px] sm:text-sm font-medium">Demandes réelles</p>
                          <p className="text-violet-200/70 text-[8px] sm:text-[10px] hidden sm:block">Sans doublons (2h)</p>
                        </div>
                      </div>
                      <p className="text-lg sm:text-3xl font-black tracking-tight">{formatCurrency(displayDemandesReelles)}</p>
                      <div className="mt-1 sm:mt-2 flex items-center gap-2 text-[9px] sm:text-xs">
                        <span className="text-violet-300 line-through opacity-70">{formatCurrency(displayDemandes)}</span>
                        <span className="bg-red-500/30 text-red-200 px-1.5 py-0.5 rounded text-[8px] sm:text-[10px]">
                          -{formatCurrency(displayDemandesDoublons)}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Gains Chauffeurs */}
                  <div className="relative overflow-hidden rounded-xl sm:rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-600 p-3 sm:p-5 text-white shadow-lg">
                    <div className="absolute -right-4 -top-4 h-16 sm:h-24 w-16 sm:w-24 rounded-full bg-white/10 blur-2xl"></div>
                    <div className="relative">
                      <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
                        <div className="p-1.5 sm:p-2 rounded-md sm:rounded-lg bg-white/20">
                          <Car className="h-3.5 w-3.5 sm:h-5 sm:w-5" />
                        </div>
                        <p className="text-teal-100 text-[10px] sm:text-sm font-medium">Chauffeurs</p>
                      </div>
                      <p className="text-lg sm:text-3xl font-black tracking-tight">{formatCurrency(displayChauffeur)}</p>
                    </div>
                  </div>
                  
                  {/* Commissions */}
                  <div className="relative overflow-hidden rounded-xl sm:rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 p-3 sm:p-5 text-white shadow-lg">
                    <div className="absolute -right-4 -top-4 h-16 sm:h-24 w-16 sm:w-24 rounded-full bg-white/10 blur-2xl"></div>
                    <div className="relative">
                      <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
                        <div className="p-1.5 sm:p-2 rounded-md sm:rounded-lg bg-white/20">
                          <DollarSign className="h-3.5 w-3.5 sm:h-5 sm:w-5" />
                        </div>
                        <p className="text-amber-100 text-[10px] sm:text-sm font-medium">Commissions</p>
                      </div>
                      <p className="text-lg sm:text-3xl font-black tracking-tight">{formatCurrency(displayCommission)}</p>
                    </div>
                  </div>
                  
                  {/* Ticket moyen */}
                  <div className="relative overflow-hidden rounded-xl sm:rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 p-3 sm:p-5 text-white shadow-lg col-span-2 sm:col-span-1">
                    <div className="absolute -right-4 -top-4 h-16 sm:h-24 w-16 sm:w-24 rounded-full bg-white/10 blur-2xl"></div>
                    <div className="relative">
                      <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
                        <div className="p-1.5 sm:p-2 rounded-md sm:rounded-lg bg-white/20">
                          <PieChart className="h-3.5 w-3.5 sm:h-5 sm:w-5" />
                        </div>
                        <div>
                          <p className="text-blue-100 text-[10px] sm:text-sm font-medium">Ticket moyen</p>
                          <p className="text-blue-200/70 text-[8px] sm:text-[10px] hidden sm:block">Par course terminée</p>
                        </div>
                      </div>
                      <p className="text-lg sm:text-3xl font-black tracking-tight">{formatCurrency(displayTicket)}</p>
                    </div>
                  </div>
                </div>

                {/* Stats secondaires - responsive */}
                {(() => {
                  const displayTempsAttente = periodStats 
                    ? periodStats.tempsAttenteAnnulationMoyen 
                    : stats.tempsAttenteAnnulationMoyen;
                  
                  const formatTempsAttente = (minutes: number) => {
                    if (minutes < 60) return `${minutes} min`;
                    const heures = Math.floor(minutes / 60);
                    const mins = minutes % 60;
                    return mins > 0 ? `${heures}h ${mins}min` : `${heures}h`;
                  };
                  
                  return (
                    <>
                    {/* Bloc explicatif Courses brutes vs réelles */}
                    <div className="rounded-xl sm:rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 p-3 sm:p-5 shadow-lg mb-3 sm:mb-4">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div className="flex-1">
                          <h4 className="text-white font-bold text-sm sm:text-base mb-1">Analyse des demandes</h4>
                          <p className="text-slate-400 text-[10px] sm:text-xs leading-relaxed">
                            <span className="text-purple-400 font-semibold">Demandes brutes</span> = toutes les commandes enregistrées | 
                            <span className="text-cyan-400 font-semibold ml-1">Courses réelles</span> = sessions uniques (si un client commande plusieurs fois en moins de 2h, ça compte comme 1 seule course)
                          </p>
                        </div>
                        <div className="flex items-center gap-3 sm:gap-4">
                          <button 
                            onClick={() => goToCoursesWithFilter('all')}
                            className="text-center hover:bg-white/10 rounded-lg p-2 transition-all cursor-pointer"
                          >
                            <p className="text-[9px] sm:text-xs text-purple-400 font-medium uppercase tracking-wide">Brutes</p>
                            <p className="text-xl sm:text-3xl font-black text-white">{displayCourses}</p>
                          </button>
                          <div className="text-slate-500 text-lg sm:text-2xl">→</div>
                          <div className="text-center">
                            <p className="text-[9px] sm:text-xs text-cyan-400 font-medium uppercase tracking-wide">Réelles</p>
                            <p className="text-xl sm:text-3xl font-black text-cyan-400">{displayCoursesReelles}</p>
                          </div>
                          <div className="text-center bg-red-500/20 rounded-lg px-2 py-1 sm:px-3 sm:py-2">
                            <p className="text-[9px] sm:text-xs text-red-300 font-medium uppercase tracking-wide">Doublons</p>
                            <p className="text-lg sm:text-2xl font-black text-red-400">-{displayCoursesDoublons}</p>
                            <p className="text-[8px] sm:text-[10px] text-red-300">({displayCourses > 0 ? ((displayCoursesDoublons / displayCourses) * 100).toFixed(0) : 0}%)</p>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Stats en une ligne */}
                    <div className="grid grid-cols-5 gap-2 sm:gap-4">
                      <button 
                        onClick={() => goToCoursesWithFilter('completed')}
                        className="rounded-xl bg-white p-3 sm:p-4 shadow-sm border border-slate-100 hover:shadow-md hover:border-emerald-200 transition-all"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                          <span className="text-xs sm:text-sm text-slate-500 font-medium">Terminées</span>
                        </div>
                        <div className="flex items-baseline gap-2">
                          <span className="text-2xl sm:text-3xl font-black text-emerald-600">{displayTerminees}</span>
                          <span className="text-xs sm:text-sm text-emerald-500 font-semibold">{displayCourses > 0 ? ((displayTerminees / displayCourses) * 100).toFixed(0) : 0}%</span>
                        </div>
                      </button>
                      <button 
                        onClick={() => goToCoursesWithFilter('cancelled')}
                        className="rounded-xl bg-white p-3 sm:p-4 shadow-sm border border-slate-100 hover:shadow-md hover:border-red-200 transition-all"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <div className="w-2 h-2 rounded-full bg-red-500"></div>
                          <span className="text-xs sm:text-sm text-slate-500 font-medium">Annulées</span>
                        </div>
                        <div className="flex items-baseline gap-2">
                          <span className="text-2xl sm:text-3xl font-black text-red-600">{displayAnnulees}</span>
                          <span className="text-xs sm:text-sm text-red-500 font-semibold">{displayCourses > 0 ? ((displayAnnulees / displayCourses) * 100).toFixed(0) : 0}%</span>
                        </div>
                      </button>
                      <div className="rounded-xl bg-white p-3 sm:p-4 shadow-sm border border-slate-100 border-l-4 border-l-orange-400">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                          <span className="text-xs sm:text-sm text-slate-500 font-medium">Attente</span>
                        </div>
                        <span className="text-2xl sm:text-3xl font-black text-orange-600">{formatTempsAttente(displayTempsAttente)}</span>
                      </div>
                      <div className="rounded-xl bg-white p-3 sm:p-4 shadow-sm border border-slate-100">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                          <span className="text-xs sm:text-sm text-slate-500 font-medium">Clients</span>
                        </div>
                        <span className="text-2xl sm:text-3xl font-black text-slate-900">{stats.nbClientsLegit}</span>
                      </div>
                      <div className="rounded-xl bg-white p-3 sm:p-4 shadow-sm border border-slate-100">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="w-2 h-2 rounded-full bg-green-500"></div>
                          <span className="text-xs sm:text-sm text-slate-500 font-medium">Chauff.</span>
                        </div>
                        <span className="text-2xl sm:text-3xl font-black text-slate-900">{stats.nbChauffeursLegit}</span>
                      </div>
                    </div>
                    
                    {/* Détail des annulations */}
                    <div className="rounded-xl bg-slate-800 p-3 sm:p-4 text-white shadow-sm">
                      <div className="flex flex-wrap items-center gap-3 sm:gap-5">
                        <div className="flex items-center gap-2">
                          <XCircle className="h-4 w-4 sm:h-5 sm:w-5 text-red-400" />
                          <span className="text-xs sm:text-sm font-semibold text-slate-300">Annulations:</span>
                        </div>
                        <div className="flex items-center gap-2 bg-blue-500/20 rounded-lg px-3 py-2">
                          <span className="text-xs sm:text-sm text-blue-300">Client</span>
                          <span className="text-lg sm:text-xl font-bold text-blue-400">{displayAnnuleesClient}</span>
                          <span className="text-xs sm:text-sm text-blue-300/70">({(displayMontantAnnuleesClient/1000).toFixed(0)}k)</span>
                        </div>
                        <div className="flex items-center gap-2 bg-orange-500/20 rounded-lg px-3 py-2">
                          <span className="text-xs sm:text-sm text-orange-300">Chauffeur</span>
                          <span className="text-lg sm:text-xl font-bold text-orange-400">{displayAnnuleesChauffeur}</span>
                          <span className="text-xs sm:text-sm text-orange-300/70">({(displayMontantAnnuleesChauffeur/1000).toFixed(0)}k)</span>
                        </div>
                        <div className="flex items-center gap-2 bg-gray-500/20 rounded-lg px-3 py-2">
                          <span className="text-xs sm:text-sm text-gray-300">Expirées</span>
                          <span className="text-lg sm:text-xl font-bold text-gray-400">{displayExpirees}</span>
                          <span className="text-xs sm:text-sm text-gray-300/70">({(displayMontantExpirees/1000).toFixed(0)}k)</span>
                        </div>
                        <div className="ml-auto flex items-center gap-2 bg-red-500/20 rounded-lg px-3 py-2">
                          <span className="text-xs sm:text-sm text-red-300">CA perdu</span>
                          <span className="text-lg sm:text-xl font-bold text-red-400">-{(displayTotalPerdu/1000).toFixed(0)}k XPF</span>
                        </div>
                      </div>
                    </div>
                    </>
                  );
                })()}
              </>
            );
          })()}

          {/* Détails de la période sélectionnée */}
          {selectedPeriod && (() => {
            const periodStats = getPeriodStats(selectedPeriod);
            return (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-6">
                {/* Activité par heure */}
                <div className="rounded-xl bg-white p-3 sm:p-6 shadow-sm">
                  <h3 className="font-semibold text-gray-900 mb-3 sm:mb-4 flex items-center gap-2 text-sm sm:text-base">
                    <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-purple-600" />
                    Par heure
                  </h3>
                  {(() => {
                    const hourEntries = Object.entries(periodStats.byHour).sort((a, b) => parseInt(a[0]) - parseInt(b[0]));
                    const maxCount = Math.max(...hourEntries.map(([, c]) => c), 1);
                    
                    return (
                      <div className="space-y-2">
                        <div className="flex items-end gap-[1px] sm:gap-[2px] h-20 sm:h-[120px]">
                          {hourEntries.map(([hour, count]) => {
                            const heightPercent = maxCount > 0 ? (count / maxCount) * 100 : 0;
                            const hourNum = parseInt(hour);
                            const isNight = hourNum < 6 || hourNum >= 22;
                            const isPeak = (hourNum >= 7 && hourNum <= 9) || (hourNum >= 17 && hourNum <= 19);
                            
                            return (
                              <div key={hour} className="flex-1 flex items-end justify-center group relative h-full">
                                <div 
                                  className={`w-full rounded-t transition-all ${
                                    count === 0 
                                      ? 'bg-gray-200' 
                                      : isPeak 
                                        ? 'bg-gradient-to-t from-green-600 to-green-400' 
                                        : isNight 
                                          ? 'bg-gradient-to-t from-purple-800 to-purple-600'
                                          : 'bg-gradient-to-t from-purple-500 to-purple-400'
                                  }`}
                                  style={{ height: count > 0 ? `${Math.max(heightPercent, 4)}%` : '2px' }}
                                />
                                {/* Tooltip - visible sur desktop */}
                                <div className="absolute -top-8 left-1/2 -translate-x-1/2 hidden sm:group-hover:block bg-gray-900 text-white text-xs rounded px-2 py-1 z-10 whitespace-nowrap">
                                  {hour}h: {count}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        {/* Labels des heures - moins sur mobile */}
                        <div className="flex gap-[1px] sm:gap-[2px]">
                          {hourEntries.map(([hour]) => (
                            <div key={`label-${hour}`} className="flex-1 text-center">
                              <span className={`text-[6px] sm:text-[8px] ${parseInt(hour) % 6 === 0 ? 'text-gray-500' : 'sm:block hidden'} ${parseInt(hour) % 3 === 0 && parseInt(hour) % 6 !== 0 ? 'hidden sm:block text-gray-400' : ''}`}>
                                {parseInt(hour) % 6 === 0 ? `${hour}h` : (parseInt(hour) % 3 === 0 ? `${hour}` : '')}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                  <div className="flex items-center gap-2 sm:gap-4 mt-2 sm:mt-3 text-[10px] sm:text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 sm:w-3 sm:h-3 rounded bg-green-500"></span> Pointe
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 sm:w-3 sm:h-3 rounded bg-purple-500"></span> Jour
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 sm:w-3 sm:h-3 rounded bg-purple-800"></span> Nuit
                    </span>
                  </div>
                </div>

                {/* Répartition par jour de la semaine */}
                <div className="rounded-xl bg-white p-3 sm:p-6 shadow-sm">
                  <h3 className="font-semibold text-gray-900 mb-3 sm:mb-4 flex items-center gap-2 text-sm sm:text-base">
                    <Calendar className="h-4 w-4 sm:h-5 sm:w-5 text-indigo-600" />
                    Par jour
                  </h3>
                  {(() => {
                    const jours = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
                    const joursShort = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
                    const counts = jours.map(j => periodStats.byDayOfWeek[j] || 0);
                    const maxCount = Math.max(...counts, 1);
                    
                    return (
                      <div className="space-y-2">
                        <div className="flex items-end justify-between gap-1 sm:gap-3 h-16 sm:h-[100px]">
                          {jours.map((jour, idx) => {
                            const count = counts[idx];
                            const heightPercent = maxCount > 0 ? (count / maxCount) * 100 : 0;
                            const isWeekend = jour === 'Samedi' || jour === 'Dimanche';
                            
                            return (
                              <div key={jour} className="flex-1 flex items-end justify-center h-full">
                                <div 
                                  className={`w-full rounded-t transition-all ${
                                    isWeekend 
                                      ? 'bg-gradient-to-t from-orange-500 to-orange-400' 
                                      : 'bg-gradient-to-t from-indigo-500 to-indigo-400'
                                  }`}
                                  style={{ height: count > 0 ? `${Math.max(heightPercent, 8)}%` : '4px' }}
                                />
                              </div>
                            );
                          })}
                        </div>
                        {/* Labels - raccourcis sur mobile */}
                        <div className="flex justify-between gap-1 sm:gap-3">
                          {jours.map((jour, idx) => {
                            const isWeekend = jour === 'Samedi' || jour === 'Dimanche';
                            return (
                              <div key={`label-${jour}`} className="flex-1 text-center">
                                <p className={`text-[10px] sm:text-xs font-medium ${isWeekend ? 'text-orange-600' : 'text-gray-500'}`}>
                                  <span className="sm:hidden">{joursShort[idx].charAt(0)}</span>
                                  <span className="hidden sm:inline">{joursShort[idx]}</span>
                                </p>
                                <p className="text-xs sm:text-sm font-bold text-gray-800">{counts[idx]}</p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Répartition par statut */}
                <div className="rounded-xl bg-white p-3 sm:p-6 shadow-sm">
                  <h3 className="font-semibold text-gray-900 mb-3 sm:mb-4 flex items-center gap-2 text-sm sm:text-base">
                    <PieChart className="h-4 w-4 sm:h-5 sm:w-5 text-indigo-600" />
                    Par statut
                  </h3>
                  <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
                    {Object.entries(periodStats.byStatus).map(([status, count]) => (
                      <div key={status} className="rounded-lg bg-gray-50 p-2 sm:p-3">
                        <p className="text-base sm:text-lg font-bold text-gray-900">{count}</p>
                        <p className="text-[10px] sm:text-xs text-gray-500 truncate">{status}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Top Chauffeurs */}
                <div className="rounded-xl bg-white p-3 sm:p-6 shadow-sm">
                  <h3 className="font-semibold text-gray-900 mb-3 sm:mb-4 flex items-center gap-2 text-sm sm:text-base">
                    <Truck className="h-4 w-4 sm:h-5 sm:w-5 text-green-600" />
                    Top Chauffeurs
                  </h3>
                  {periodStats.topChauffeurs.length > 0 ? (
                    <div className="space-y-1.5 sm:space-y-2">
                      {periodStats.topChauffeurs.map((c, idx) => (
                        <div key={idx} className="flex justify-between items-center p-1.5 sm:p-2 rounded-lg bg-gray-50">
                          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                            <span className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-white text-[10px] sm:text-xs font-bold flex-shrink-0 ${
                              idx === 0 ? 'bg-yellow-500' : idx === 1 ? 'bg-gray-400' : 'bg-gray-300'
                            }`}>{idx + 1}</span>
                            <span className="font-medium text-xs sm:text-sm truncate">{c.nom}</span>
                          </div>
                          <div className="text-right flex-shrink-0 ml-2">
                            <p className="font-semibold text-green-600 text-xs sm:text-sm">{formatCurrency(c.ca)}</p>
                            <p className="text-[10px] sm:text-xs text-gray-500">{c.count} courses</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-sm">Aucun chauffeur</p>
                  )}
                </div>

                {/* Top Clients */}
                <div className="rounded-xl bg-white p-3 sm:p-6 shadow-sm">
                  <h3 className="font-semibold text-gray-900 mb-3 sm:mb-4 flex items-center gap-2 text-sm sm:text-base">
                    <User className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
                    Top Clients
                  </h3>
                  {periodStats.topClients.length > 0 ? (
                    <div className="space-y-1.5 sm:space-y-2">
                      {periodStats.topClients.map((c, idx) => (
                        <div key={idx} className="flex justify-between items-center p-1.5 sm:p-2 rounded-lg bg-gray-50">
                          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                            <span className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-white text-[10px] sm:text-xs font-bold flex-shrink-0 ${
                              idx === 0 ? 'bg-yellow-500' : idx === 1 ? 'bg-gray-400' : 'bg-gray-300'
                            }`}>{idx + 1}</span>
                            <span className="font-medium text-xs sm:text-sm truncate">{c.nom}</span>
                          </div>
                          <div className="text-right flex-shrink-0 ml-2">
                            <p className="font-semibold text-blue-600 text-xs sm:text-sm">{formatCurrency(c.ca)}</p>
                            <p className="text-[10px] sm:text-xs text-gray-500">{c.count} courses</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-sm">Aucun client</p>
                  )}
                </div>

                {/* Liste des courses */}
                <div className="rounded-xl bg-white p-3 sm:p-6 shadow-sm lg:col-span-2">
                  <h3 className="font-semibold text-gray-900 mb-3 sm:mb-4 flex items-center gap-2 text-sm sm:text-base">
                    <Car className="h-4 w-4 sm:h-5 sm:w-5 text-purple-600" />
                    Courses ({periodStats.courses.length})
                  </h3>
                  <div className="max-h-48 sm:max-h-60 overflow-y-auto space-y-1.5 sm:space-y-2">
                    {periodStats.courses.map((course) => (
                      <div key={course.order_id} className="flex justify-between items-center p-2 sm:p-3 rounded-lg bg-gray-50 text-xs sm:text-sm">
                        <div className="min-w-0">
                          <p className="font-medium truncate">#{course.order_number}</p>
                          <p className="text-[10px] sm:text-xs text-gray-500 truncate">{course.date_creation?.substring(11, 16)} • {course.client_prenom}</p>
                        </div>
                        <div className="text-right flex-shrink-0 ml-2">
                          <p className="font-semibold text-purple-600">{formatCurrency(parseInt(course.montant_total as string) || 0)}</p>
                          <p className="text-[10px] sm:text-xs text-gray-500">{getStatutLabel(course.statut).label}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Graphiques globaux - visibles seulement sans sélection */}
          {!selectedPeriod && (
            <>
          {/* Graphique temporel interactif */}
          <div className="rounded-xl bg-white p-3 sm:p-6 shadow-sm">
            <h3 className="text-sm sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-purple-600" />
              <span className="hidden sm:inline">Évolution du CA ({timeView === 'day' ? 'journalière' : timeView === 'week' ? 'hebdomadaire' : 'mensuelle'})</span>
              <span className="sm:hidden">CA {timeView === 'day' ? '/ Jour' : timeView === 'week' ? '/ Sem.' : '/ Mois'}</span>
            </h3>
            <div className="h-40 sm:h-60 flex items-end gap-[2px] sm:gap-1">
              {(() => {
                const dataToShow = timeView === 'day' 
                  ? stats.coursesByDay 
                  : timeView === 'week' 
                    ? stats.coursesByWeek 
                    : stats.coursesByMonth;
                
                const entries = Object.entries(dataToShow || {})
                  .sort((a, b) => a[0].localeCompare(b[0]))
                  .slice(timeView === 'day' ? -15 : timeView === 'week' ? -12 : -12);
                
                const maxCA = Math.max(...entries.map(([, d]) => d.ca), 1);
                
                return entries.map(([period, data], idx) => {
                  const heightPercent = (data.ca / maxCA) * 100;
                  const shortLabel = timeView === 'day' 
                    ? period.substring(8) // "15" from "2023-06-15"
                    : timeView === 'week'
                      ? `S${period.split('-S')[1]}` // "S25" from "2023-S25"
                      : period.substring(5); // "06" from "2023-06"
                  
                  return (
                    <div key={period} className="flex-1 flex flex-col items-center group relative min-w-0">
                      <div 
                        className="w-full bg-gradient-to-t from-purple-500 to-purple-400 rounded-t transition-all sm:hover:from-purple-600 sm:hover:to-purple-500 cursor-pointer"
                        style={{ height: `${heightPercent}%`, minHeight: data.ca > 0 ? '4px' : '0' }}
                      />
                      <span className="text-[8px] sm:text-xs text-gray-400 mt-1 truncate w-full text-center">{shortLabel}</span>
                      <div className="absolute bottom-full mb-2 hidden sm:group-hover:block bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10">
                        <div className="font-semibold">{period}</div>
                        <div>{data.count} courses</div>
                        <div>CA: {formatCurrency(data.ca)}</div>
                        <div>Ticket moy: {formatCurrency(data.ticketMoyen)}</div>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>

          {/* Analyse par heure de la journée */}
          <div className="rounded-xl bg-white p-3 sm:p-6 shadow-sm">
            <h3 className="text-sm sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4 flex items-center gap-2">
              <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-purple-600" />
              <span className="hidden sm:inline">Activité par heure de la journée</span>
              <span className="sm:hidden">Par heure</span>
            </h3>
            <div className="flex items-end gap-[1px] sm:gap-1 h-28 sm:h-40">
              {Object.entries(stats.coursesByHour)
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([hour, data]) => {
                  const maxCount = Math.max(...Object.values(stats.coursesByHour).map(d => d.count));
                  const heightPercent = maxCount > 0 ? (data.count / maxCount) * 100 : 0;
                  const hourNum = parseInt(hour);
                  return (
                    <div key={hour} className="flex-1 flex flex-col items-center group relative">
                      <div 
                        className="w-full bg-gradient-to-t from-purple-500 to-purple-400 rounded-t transition-all sm:hover:from-purple-600 sm:hover:to-purple-500"
                        style={{ height: `${heightPercent}%`, minHeight: data.count > 0 ? '4px' : '0' }}
                      />
                      <span className={`text-[6px] sm:text-xs text-gray-400 mt-1 ${hourNum % 6 === 0 ? '' : 'hidden sm:block'}`}>
                        {hourNum % 6 === 0 ? `${hour}h` : hour}
                      </span>
                      <div className="absolute bottom-full mb-2 hidden sm:group-hover:block bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10">
                        {data.count} courses • {formatCurrency(data.ca)}
                        <br />Ticket moy: {formatCurrency(data.ticketMoyen)}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Analyse par jour de la semaine */}
          <div className="rounded-xl bg-white p-3 sm:p-6 shadow-sm">
            <h3 className="text-sm sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4 flex items-center gap-2">
              <Calendar className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
              <span className="hidden sm:inline">Activité par jour de la semaine</span>
              <span className="sm:hidden">Par jour</span>
            </h3>
            <div className="grid grid-cols-7 gap-1 sm:gap-2">
              {['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'].map((dayName, idx) => {
                const data = stats.coursesByDayOfWeek[idx.toString()];
                const maxCount = Math.max(...Object.values(stats.coursesByDayOfWeek).map(d => d.count));
                const intensity = maxCount > 0 ? (data.count / maxCount) : 0;
                return (
                  <div key={dayName} className="text-center">
                    <div 
                      className="rounded-md sm:rounded-lg p-1.5 sm:p-4 transition-all"
                      style={{ 
                        backgroundColor: `rgba(99, 102, 241, ${0.1 + intensity * 0.8})`,
                        color: intensity > 0.5 ? 'white' : '#374151'
                      }}
                    >
                      <p className="font-bold text-sm sm:text-2xl">{data.count}</p>
                      <p className="text-[8px] sm:text-xs opacity-75 hidden sm:block">{formatCurrency(data.ca)}</p>
                    </div>
                    <p className="text-[9px] sm:text-sm font-medium text-gray-600 mt-1 sm:mt-2">{dayName.charAt(0)}<span className="hidden sm:inline">{dayName.slice(1)}</span></p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Graphiques en grille */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-6">
            {/* Évolution par mois avec ticket moyen */}
            <div className="rounded-xl bg-white p-3 sm:p-6 shadow-sm">
              <h3 className="text-sm sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4 flex items-center gap-2">
                <BarChart3 className="h-4 w-4 sm:h-5 sm:w-5 text-purple-600" />
                <span className="hidden sm:inline">Évolution mensuelle (CA + Ticket moyen)</span>
                <span className="sm:hidden">CA mensuel</span>
              </h3>
              <div className="space-y-2 sm:space-y-3 max-h-60 sm:max-h-80 overflow-y-auto">
                {Object.entries(stats.coursesByMonth)
                  .sort((a, b) => a[0].localeCompare(b[0]))
                  .map(([month, data]) => {
                    const maxCA = Math.max(...Object.values(stats.coursesByMonth).map(d => d.ca));
                    const percentage = maxCA > 0 ? (data.ca / maxCA) * 100 : 0;
                    return (
                      <div key={month}>
                        <div className="flex justify-between text-xs sm:text-sm mb-1">
                          <span className="text-gray-600 font-medium">{month}</span>
                          <span className="text-gray-500">{data.count}</span>
                        </div>
                        <div className="flex items-center gap-2 sm:gap-3">
                          <div className="flex-1 h-3 sm:h-4 bg-gray-100 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-gradient-to-r from-purple-500 to-purple-600 rounded-full"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                          <span className="text-xs sm:text-sm font-bold text-purple-600 w-20 sm:w-28 text-right">{formatCurrency(data.ca)}</span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Évolution par semaine */}
            <div className="rounded-xl bg-white p-3 sm:p-6 shadow-sm">
              <h3 className="text-sm sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4 flex items-center gap-2">
                <Calendar className="h-4 w-4 sm:h-5 sm:w-5 text-green-600" />
                <span className="hidden sm:inline">Évolution hebdomadaire</span>
                <span className="sm:hidden">CA / Semaine</span>
              </h3>
              <div className="space-y-1.5 sm:space-y-2 max-h-60 sm:max-h-80 overflow-y-auto">
                {Object.entries(stats.coursesByWeek)
                  .sort((a, b) => a[0].localeCompare(b[0]))
                  .slice(-15) // Dernières 15 semaines
                  .map(([week, data]) => {
                    const maxCA = Math.max(...Object.values(stats.coursesByWeek).map(d => d.ca));
                    const percentage = maxCA > 0 ? (data.ca / maxCA) * 100 : 0;
                    return (
                      <div key={week} className="flex items-center gap-2 sm:gap-3">
                        <span className="text-[10px] sm:text-xs text-gray-500 w-14 sm:w-20 flex-shrink-0">{week.split('-S')[1] ? `S${week.split('-S')[1]}` : week}</span>
                        <div className="flex-1 h-2.5 sm:h-3 bg-gray-100 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-green-500 to-green-600 rounded-full"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                        <span className="text-[10px] sm:text-xs font-medium w-16 sm:w-20 text-right flex-shrink-0">{formatCurrency(data.ca)}</span>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Top Chauffeurs */}
            <div className="rounded-xl bg-white p-3 sm:p-6 shadow-sm">
              <h3 className="text-sm sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4 flex items-center gap-2">
                <Truck className="h-4 w-4 sm:h-5 sm:w-5 text-green-600" />
                Top Chauffeurs
              </h3>
              <div className="space-y-2 sm:space-y-3">
                {stats.topChauffeurs?.slice(0, 5).map((chauffeur, idx) => {
                  const maxCA = stats.topChauffeurs[0]?.ca || 1;
                  const percentage = (chauffeur.ca / maxCA) * 100;
                  return (
                    <div key={idx}>
                      <div className="flex justify-between text-xs sm:text-sm mb-1">
                        <span className="text-gray-600 flex items-center gap-1.5 sm:gap-2 min-w-0">
                          <span className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-white text-[10px] sm:text-xs font-bold flex-shrink-0 ${
                            idx === 0 ? 'bg-yellow-500' : idx === 1 ? 'bg-gray-400' : idx === 2 ? 'bg-orange-400' : 'bg-gray-300'
                          }`}>
                            {idx + 1}
                          </span>
                          <span className="truncate">{chauffeur.nom}</span>
                        </span>
                        <span className="text-gray-500 flex-shrink-0 ml-2">{chauffeur.count}</span>
                      </div>
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div className="flex-1 h-2.5 sm:h-3 bg-gray-100 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-green-500 to-green-600 rounded-full"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                        <span className="text-xs sm:text-sm font-bold text-green-600 w-16 sm:w-24 text-right">{formatCurrency(chauffeur.ca)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Top Clients */}
            <div className="rounded-xl bg-white p-3 sm:p-6 shadow-sm">
              <h3 className="text-sm sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4 flex items-center gap-2">
                <User className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
                Top Clients
              </h3>
              <div className="space-y-2 sm:space-y-3">
                {stats.topClients?.slice(0, 5).map((client, idx) => {
                  const maxCA = stats.topClients[0]?.ca || 1;
                  const percentage = (client.ca / maxCA) * 100;
                  return (
                    <div key={idx}>
                      <div className="flex justify-between text-xs sm:text-sm mb-1">
                        <span className="text-gray-600 flex items-center gap-1.5 sm:gap-2 min-w-0">
                          <span className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-white text-[10px] sm:text-xs font-bold flex-shrink-0 ${
                            idx === 0 ? 'bg-yellow-500' : idx === 1 ? 'bg-gray-400' : idx === 2 ? 'bg-orange-400' : 'bg-gray-300'
                          }`}>
                            {idx + 1}
                          </span>
                          <span className="truncate">{client.nom}</span>
                        </span>
                        <span className="text-gray-500 flex-shrink-0 ml-2">{client.count}</span>
                      </div>
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div className="flex-1 h-2.5 sm:h-3 bg-gray-100 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                        <span className="text-xs sm:text-sm font-bold text-blue-600 w-16 sm:w-24 text-right">{formatCurrency(client.ca)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Top destinations */}
            <div className="rounded-xl bg-white p-3 sm:p-6 shadow-sm">
              <h3 className="text-sm sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4 flex items-center gap-2">
                <MapPin className="h-4 w-4 sm:h-5 sm:w-5 text-red-600" />
                Top Destinations
              </h3>
              <div className="space-y-2 sm:space-y-3">
                {stats.topDestinations.slice(0, 5).map((dest, idx) => {
                  const maxCount = stats.topDestinations[0]?.count || 1;
                  const percentage = (dest.count / maxCount) * 100;
                  return (
                    <div key={dest.name}>
                      <div className="flex justify-between text-xs sm:text-sm mb-1">
                        <span className="text-gray-600 flex items-center gap-1.5 sm:gap-2 min-w-0">
                          <span className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-white text-[10px] sm:text-xs font-bold flex-shrink-0 ${
                            idx === 0 ? 'bg-yellow-500' : idx === 1 ? 'bg-gray-400' : idx === 2 ? 'bg-orange-400' : 'bg-gray-300'
                          }`}>
                            {idx + 1}
                          </span>
                          <span className="truncate">{dest.name}</span>
                        </span>
                        <span className="font-medium flex-shrink-0 ml-2">{dest.count}</span>
                      </div>
                      <div className="h-2.5 sm:h-3 bg-gray-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-red-500 to-red-600 rounded-full"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Modes de paiement - cliquables */}
            <div className="rounded-xl bg-white p-3 sm:p-6 shadow-sm">
              <h3 className="text-sm sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4 flex items-center gap-2">
                <CreditCard className="h-4 w-4 sm:h-5 sm:w-5 text-orange-600" />
                Paiements
                <span className="text-xs text-gray-400 font-normal">(cliquez pour filtrer)</span>
              </h3>
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                {Object.entries(stats.coursesByPayment).map(([paymentId, count]) => {
                  const paymentInfo = getPaiementLabel(paymentId);
                  const percentage = ((count / stats.nbCourses) * 100).toFixed(0);
                  const paymentType = paymentId === '1' ? 'cash' : paymentId === '2' ? 'card' : paymentId === '3' ? 'transfer' : 'all';
                  return (
                    <button 
                      key={paymentId} 
                      onClick={() => goToCoursesWithFilter('all', paymentType)}
                      className="rounded-lg p-2.5 sm:p-4 bg-gray-50 border text-left hover:shadow-md hover:border-purple-200 transition-all cursor-pointer"
                    >
                      <div className="flex items-center gap-1.5 sm:gap-2 text-gray-700">
                        <paymentInfo.icon className="h-3.5 w-3.5 sm:h-5 sm:w-5" />
                        <span className="font-medium text-xs sm:text-base truncate">{paymentInfo.label}</span>
                      </div>
                      <p className="text-lg sm:text-2xl font-bold mt-1 sm:mt-2 text-gray-900">{count}</p>
                      <p className="text-[10px] sm:text-sm text-gray-500">{percentage}%</p>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
            </>
          )}
        </div>
      )}

      {/* === LISTE COURSES === */}
      {activeTab === 'courses' && (
        <>
          {/* Header avec recherche et filtres */}
          <div className="space-y-3 sm:space-y-4">
            {/* Barre de recherche */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 sm:h-5 sm:w-5 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Rechercher par n° commande, client, chauffeur..."
                  value={searchTerm}
                  onChange={(e) => handleCoursesSearch(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-white py-2.5 sm:py-3 pl-10 pr-4 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20 shadow-sm"
                />
              </div>
            </div>
            
            {/* Filtres par statut */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
              <span className="text-xs text-gray-500 font-medium flex-shrink-0">Statut:</span>
              {(() => {
                const counts = getStatusCounts();
                const filters = [
                  { id: 'all', label: 'Toutes', count: counts.all, color: 'bg-gray-100 text-gray-700 border-gray-200', activeColor: 'bg-purple-600 text-white border-purple-600' },
                  { id: 'completed', label: 'Terminées', count: counts.completed, color: 'bg-emerald-50 text-emerald-700 border-emerald-200', activeColor: 'bg-emerald-600 text-white border-emerald-600' },
                  { id: 'cancelled', label: 'Annulées', count: counts.cancelled, color: 'bg-red-50 text-red-700 border-red-200', activeColor: 'bg-red-600 text-white border-red-600' },
                  { id: 'pending', label: 'En attente', count: counts.pending, color: 'bg-amber-50 text-amber-700 border-amber-200', activeColor: 'bg-amber-500 text-white border-amber-500' },
                  { id: 'abandoned', label: 'Abandonnées', count: counts.abandoned, color: 'bg-orange-50 text-orange-700 border-orange-200', activeColor: 'bg-orange-500 text-white border-orange-500' },
                ];
                
                return filters.map(filter => (
                  <button
                    key={filter.id}
                    onClick={() => handleStatusFilterChange(filter.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium border transition-all flex-shrink-0 ${
                      statusFilter === filter.id ? filter.activeColor : filter.color
                    }`}
                  >
                    {filter.label}
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] sm:text-xs ${
                      statusFilter === filter.id ? 'bg-white/20' : 'bg-black/5'
                    }`}>
                      {filter.count}
                    </span>
                  </button>
                ));
              })()}
            </div>
            
            {/* Filtres par mode de paiement */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
              <span className="text-xs text-gray-500 font-medium flex-shrink-0">Paiement:</span>
              {(() => {
                const counts = getPaymentCounts();
                const filters = [
                  { id: 'all', label: 'Tous', count: counts.all, icon: '🔄', color: 'bg-gray-100 text-gray-700 border-gray-200', activeColor: 'bg-slate-700 text-white border-slate-700' },
                  { id: 'cash', label: 'Espèces', count: counts.cash, icon: '💵', color: 'bg-green-50 text-green-700 border-green-200', activeColor: 'bg-green-600 text-white border-green-600' },
                  { id: 'card', label: 'Carte', count: counts.card, icon: '💳', color: 'bg-blue-50 text-blue-700 border-blue-200', activeColor: 'bg-blue-600 text-white border-blue-600' },
                  { id: 'transfer', label: 'Virement', count: counts.transfer, icon: '🏦', color: 'bg-purple-50 text-purple-700 border-purple-200', activeColor: 'bg-purple-600 text-white border-purple-600' },
                ];
                
                return filters.map(filter => (
                  <button
                    key={filter.id}
                    onClick={() => handlePaymentFilterChange(filter.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium border transition-all flex-shrink-0 ${
                      paymentFilter === filter.id ? filter.activeColor : filter.color
                    }`}
                  >
                    <span>{filter.icon}</span>
                    {filter.label}
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] sm:text-xs ${
                      paymentFilter === filter.id ? 'bg-white/20' : 'bg-black/5'
                    }`}>
                      {filter.count}
                    </span>
                  </button>
                ));
              })()}
            </div>
          </div>

          <div className="rounded-xl bg-white shadow-sm overflow-hidden border border-gray-100">
            {isLoading ? (
              <div className="p-8 text-center text-gray-500">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto mb-4"></div>
                Chargement...
              </div>
            ) : (
              <>
                {/* Vue Mobile */}
                <div className="md:hidden divide-y divide-gray-100">
                  {getPagedFilteredCourses().map((course) => {
                    const statut = getStatutLabel(course.statut);
                    const statusNum = parseInt(course.statut) || 0;
                    const isCompleted = statusNum === 2101050 || statusNum === 2101042 || (statusNum >= 5900 && statusNum <= 6000);
                    
                    return (
                      <div 
                        key={course.order_id} 
                        className="p-3 sm:p-4 space-y-2 sm:space-y-3 hover:bg-gray-50/50 transition-colors"
                      >
                        {/* En-tête avec numéro et montant */}
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${
                              isCompleted ? 'bg-emerald-500' : 
                              statusNum >= 4096 ? 'bg-red-500' : 'bg-amber-500'
                            }`}></div>
                            <div>
                              <p className="font-semibold text-gray-900 text-sm">#{course.order_number.slice(0, 8)}...</p>
                              <p className="text-[10px] text-gray-500">{formatDate(course.date_creation)}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-purple-600 text-sm">{formatCurrency(course.montant_total)}</p>
                            <span className={`inline-block mt-0.5 rounded-full px-2 py-0.5 text-[10px] font-medium ${statut.color}`}>
                              {statut.label}
                            </span>
                          </div>
                        </div>
                        
                        {/* Client et Chauffeur */}
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <button 
                            onClick={() => openClientProfile(course)}
                            className="bg-slate-50 rounded-lg p-2 text-left hover:bg-blue-50 hover:ring-2 hover:ring-blue-200 transition-all"
                          >
                            <p className="text-slate-500 text-[10px] font-medium mb-0.5">Client</p>
                            <p className="text-gray-900 font-medium truncate hover:text-blue-600">{course.client_prenom} {course.client_nom}</p>
                          </button>
                          <button 
                            onClick={() => course.chauffeur_id && openChauffeurProfile(course)}
                            disabled={!course.chauffeur_prenom}
                            className={`rounded-lg p-2 text-left transition-all ${course.chauffeur_prenom ? 'bg-emerald-50 hover:bg-amber-50 hover:ring-2 hover:ring-amber-200 cursor-pointer' : 'bg-red-50 cursor-not-allowed'}`}
                          >
                            <p className={`text-[10px] font-medium mb-0.5 ${course.chauffeur_prenom ? 'text-emerald-600' : 'text-red-500'}`}>
                              Chauffeur
                            </p>
                            <p className="text-gray-900 font-medium truncate">
                              {course.chauffeur_prenom ? `${course.chauffeur_prenom} ${course.chauffeur_nom}` : 'Non assigné'}
                            </p>
                          </button>
                        </div>

                        {/* Trajet */}
                        <div className="bg-gray-50 rounded-lg p-2 text-xs space-y-1">
                          <p className="text-gray-700 truncate flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0"></span>
                            {course.adresse_depart || 'N/A'}
                          </p>
                          <p className="text-gray-700 truncate flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0"></span>
                            {course.adresse_arrivee || 'N/A'}
                          </p>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            onClick={() => setSelectedCourse(course)}
                            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-gray-100 text-gray-700 text-xs font-medium hover:bg-gray-200 transition-colors"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Détails
                          </button>
                          {isCompleted && (
                            <>
                              <button
                                onClick={() => generateInvoice(course)}
                                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-purple-100 text-purple-700 text-xs font-medium hover:bg-purple-200 transition-colors"
                                title="Facture client"
                              >
                                <FileText className="h-3.5 w-3.5" />
                                Client
                              </button>
                              <button
                                onClick={() => generateCommissionInvoice(course)}
                                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-amber-100 text-amber-700 text-xs font-medium hover:bg-amber-200 transition-colors"
                                title="Facture commission chauffeur"
                              >
                                <DollarSign className="h-3.5 w-3.5" />
                                Com.
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => openGoogleMaps(course.depart_lat, course.depart_lng, course.arrivee_lat, course.arrivee_lng)}
                            className="p-2 rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
                          >
                            <MapPin className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                {/* Vue Desktop */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-gradient-to-r from-slate-50 to-purple-50 text-left text-sm text-gray-600">
                        <th className="px-4 py-4 font-semibold">N° Commande</th>
                        <th className="px-4 py-4 font-semibold">Date</th>
                        <th className="px-4 py-4 font-semibold">Client</th>
                        <th className="px-4 py-4 font-semibold">Chauffeur</th>
                        <th className="px-4 py-4 font-semibold">Trajet</th>
                        <th className="px-4 py-4 font-semibold">Montant</th>
                        <th className="px-4 py-4 font-semibold">Statut</th>
                        <th className="px-4 py-4 font-semibold text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {getPagedFilteredCourses().map((course) => {
                        const statut = getStatutLabel(course.statut);
                        const statusNum = parseInt(course.statut) || 0;
                        const isCompleted = statusNum === 2101050 || statusNum === 2101042 || (statusNum >= 5900 && statusNum <= 6000);
                        
                        return (
                          <tr key={course.order_id} className="hover:bg-purple-50/30 transition-colors">
                            <td className="px-4 py-4">
                              <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${
                                  isCompleted ? 'bg-emerald-500' : 
                                  statusNum >= 4096 ? 'bg-red-500' : 'bg-amber-500'
                                }`}></div>
                                <p className="font-semibold text-gray-900 font-mono text-sm">{course.order_number.slice(0, 12)}...</p>
                              </div>
                            </td>
                            <td className="px-4 py-4 text-sm text-gray-600">
                              {formatDate(course.date_creation)}
                            </td>
                            <td className="px-4 py-4">
                              <button 
                                onClick={() => openClientProfile(course)}
                                className="text-left hover:bg-blue-50 rounded-lg p-1 -m-1 transition-colors group"
                              >
                                <p className="text-sm font-medium text-gray-900 group-hover:text-blue-600">{course.client_prenom} {course.client_nom}</p>
                                <p className="text-xs text-gray-500">{course.client_mobile}</p>
                              </button>
                            </td>
                            <td className="px-4 py-4">
                              {course.chauffeur_prenom ? (
                                <button 
                                  onClick={() => openChauffeurProfile(course)}
                                  className="flex items-center gap-2 hover:bg-amber-50 rounded-lg p-1 -m-1 transition-colors group"
                                >
                                  <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center">
                                    <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
                                  </div>
                                  <div className="text-left">
                                    <p className="text-sm font-medium text-gray-900 group-hover:text-amber-600">{course.chauffeur_prenom} {course.chauffeur_nom}</p>
                                    <p className="text-xs text-gray-500">{course.chauffeur_mobile}</p>
                                  </div>
                                </button>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center">
                                    <XCircle className="h-3.5 w-3.5 text-red-500" />
                                  </div>
                                  <span className="text-sm text-red-600">Non assigné</span>
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex items-start gap-1.5">
                                <div className="space-y-1">
                                  <p className="text-sm text-gray-900 max-w-[180px] truncate flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0"></span>
                                    {course.adresse_depart || 'N/A'}
                                  </p>
                                  <p className="text-sm text-gray-500 max-w-[180px] truncate flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0"></span>
                                    {course.adresse_arrivee || 'N/A'}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-4">
                              <div className="space-y-0.5">
                                <p className="font-bold text-purple-600 text-base">{formatCurrency(course.montant_total)}</p>
                                <p className="text-[10px] text-gray-400">Chauffeur: {formatCurrency(course.montant_chauffeur)}</p>
                              </div>
                            </td>
                            <td className="px-4 py-4">
                              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${statut.color}`}>
                                <statut.icon className="h-3 w-3" />
                                {statut.label}
                              </span>
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  onClick={() => setSelectedCourse(course)}
                                  className="rounded-lg bg-gray-100 p-2 text-gray-600 hover:bg-gray-200 transition-colors"
                                  title="Voir détails"
                                >
                                  <Eye className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => openGoogleMaps(course.depart_lat, course.depart_lng, course.arrivee_lat, course.arrivee_lng)}
                                  className="rounded-lg bg-blue-100 p-2 text-blue-600 hover:bg-blue-200 transition-colors"
                                  title="Voir sur carte"
                                >
                                  <MapPin className="h-4 w-4" />
                                </button>
                                {isCompleted && (
                                  <>
                                    <button
                                      onClick={() => generateInvoice(course)}
                                      className="rounded-lg bg-purple-100 p-2 text-purple-600 hover:bg-purple-200 transition-colors"
                                      title="Facture client"
                                    >
                                      <FileText className="h-4 w-4" />
                                    </button>
                                    <button
                                      onClick={() => generateCommissionInvoice(course)}
                                      className="rounded-lg bg-amber-100 p-2 text-amber-600 hover:bg-amber-200 transition-colors"
                                      title="Facture commission chauffeur"
                                    >
                                      <DollarSign className="h-4 w-4" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {getFilteredCourses().length === 0 && (
                  <div className="p-12 text-center">
                    <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                      <Search className="h-8 w-8 text-gray-400" />
                    </div>
                    <p className="text-gray-500 font-medium">Aucune course trouvée</p>
                    <p className="text-gray-400 text-sm mt-1">Essayez de modifier vos filtres</p>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}

      {/* === LISTE CLIENTS === */}
      {activeTab === 'clients' && (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 sm:h-5 sm:w-5 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher..."
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-300 py-2 sm:py-2.5 pl-9 sm:pl-10 pr-3 sm:pr-4 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
            />
          </div>

          <div className="rounded-xl bg-white shadow-sm overflow-hidden">
            {isLoading ? (
              <div className="p-4 sm:p-8 text-center text-gray-500">Chargement...</div>
            ) : (
              <>
                <div className="md:hidden divide-y">
                  {clients.map((client) => {
                    const clientCourses = getClientCourses(client.id);
                    const clientStats = getProfileStats(clientCourses);
                    const firstCourse = clientCourses.length > 0 ? clientCourses[clientCourses.length - 1] : null;
                    return (
                      <button 
                        key={client.id} 
                        onClick={() => setSelectedClientProfile(client)}
                        className="w-full p-3 space-y-2 text-left hover:bg-blue-50 transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <p className="font-semibold text-gray-900 text-sm">{client.first_name} {client.last_name}</p>
                          <p className="text-[10px] text-gray-400">#{client.id}</p>
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="flex items-center gap-1 text-gray-600">
                            <Phone className="h-3 w-3" />
                            {client.mobile}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-medium">
                            {clientStats.total} courses
                          </span>
                          <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-[10px] font-medium">
                            {clientStats.totalCA.toLocaleString('fr-FR')} XPF
                          </span>
                          {firstCourse && (
                            <span className="text-[10px] text-gray-400">
                              Depuis {new Date(firstCourse.date_creation).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
                
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-gray-50 text-left text-sm text-gray-500">
                        <th className="px-4 py-3 font-medium">Nom complet</th>
                        <th className="px-4 py-3 font-medium">Contact</th>
                        <th className="px-4 py-3 font-medium text-center">Courses</th>
                        <th className="px-4 py-3 font-medium text-right">Total dépensé</th>
                        <th className="px-4 py-3 font-medium">Première course</th>
                        <th className="px-4 py-3 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {clients.map((client) => {
                        const clientCourses = getClientCourses(client.id);
                        const clientStats = getProfileStats(clientCourses);
                        const firstCourse = clientCourses.length > 0 ? clientCourses[clientCourses.length - 1] : null;
                        return (
                          <tr key={client.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3">
                              <p className="font-medium text-gray-900">{client.first_name} {client.last_name}</p>
                              <p className="text-xs text-gray-400">ID: {client.id}</p>
                            </td>
                            <td className="px-4 py-3">
                              <p className="text-sm text-gray-600">{client.mobile}</p>
                              <p className="text-xs text-gray-400 truncate max-w-[150px]">{client.email}</p>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-bold">
                                {clientStats.total}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <p className="font-bold text-purple-600">{clientStats.totalCA.toLocaleString('fr-FR')} XPF</p>
                              <p className="text-xs text-gray-400">{clientStats.terminees} terminées</p>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-500">
                              {firstCourse ? new Date(firstCourse.date_creation).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                            </td>
                            <td className="px-4 py-3">
                              <button 
                                onClick={() => setSelectedClientProfile(client)}
                                className="px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                              >
                                Voir profil
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {clients.length === 0 && (
                  <div className="p-8 text-center text-gray-500">Aucun résultat trouvé</div>
                )}
              </>
            )}
          </div>
        </>
      )}

      {/* === LISTE CHAUFFEURS === */}
      {activeTab === 'chauffeurs' && (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 sm:h-5 sm:w-5 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher..."
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-300 py-2 sm:py-2.5 pl-9 sm:pl-10 pr-3 sm:pr-4 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
            />
          </div>

          <div className="rounded-xl bg-white shadow-sm overflow-hidden">
            {isLoading ? (
              <div className="p-4 sm:p-8 text-center text-gray-500">Chargement...</div>
            ) : (
              <>
                <div className="md:hidden divide-y">
                  {chauffeurs.map((chauffeur) => {
                    const chauffeurCourses = getChauffeurCourses(chauffeur.id);
                    const chauffeurStats = getProfileStats(chauffeurCourses);
                    const firstCourse = chauffeurCourses.length > 0 ? chauffeurCourses[chauffeurCourses.length - 1] : null;
                    return (
                      <button 
                        key={chauffeur.id} 
                        onClick={() => setSelectedChauffeurProfile(chauffeur)}
                        className="w-full p-3 space-y-2 text-left hover:bg-amber-50 transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <p className="font-semibold text-gray-900 text-sm">{chauffeur.first_name} {chauffeur.last_name}</p>
                          <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] text-green-700">Chauffeur</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="flex items-center gap-1 text-gray-600">
                            <Phone className="h-3 w-3" />
                            {chauffeur.mobile}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-medium">
                            {chauffeurStats.total} courses
                          </span>
                          <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-medium">
                            {chauffeurStats.totalChauffeur.toLocaleString('fr-FR')} XPF
                          </span>
                          {firstCourse && (
                            <span className="text-[10px] text-gray-400">
                              Depuis {new Date(firstCourse.date_creation).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
                
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-gray-50 text-left text-sm text-gray-500">
                        <th className="px-4 py-3 font-medium">Nom complet</th>
                        <th className="px-4 py-3 font-medium">Contact</th>
                        <th className="px-4 py-3 font-medium text-center">Courses</th>
                        <th className="px-4 py-3 font-medium text-right">Gains totaux</th>
                        <th className="px-4 py-3 font-medium">Première course</th>
                        <th className="px-4 py-3 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {chauffeurs.map((chauffeur) => {
                        const chauffeurCourses = getChauffeurCourses(chauffeur.id);
                        const chauffeurStats = getProfileStats(chauffeurCourses);
                        const firstCourse = chauffeurCourses.length > 0 ? chauffeurCourses[chauffeurCourses.length - 1] : null;
                        return (
                          <tr key={chauffeur.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3">
                              <p className="font-medium text-gray-900">{chauffeur.first_name} {chauffeur.last_name}</p>
                              <p className="text-xs text-gray-400">ID: {chauffeur.id}</p>
                            </td>
                            <td className="px-4 py-3">
                              <p className="text-sm text-gray-600">{chauffeur.mobile}</p>
                              <p className="text-xs text-gray-400 truncate max-w-[150px]">{chauffeur.email}</p>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-bold">
                                {chauffeurStats.total}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <p className="font-bold text-amber-600">{chauffeurStats.totalChauffeur.toLocaleString('fr-FR')} XPF</p>
                              <p className="text-xs text-gray-400">{chauffeurStats.terminees} terminées</p>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-500">
                              {firstCourse ? new Date(firstCourse.date_creation).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                            </td>
                            <td className="px-4 py-3">
                              <button 
                                onClick={() => setSelectedChauffeurProfile(chauffeur)}
                                className="px-3 py-1.5 text-xs font-medium text-amber-600 bg-amber-50 rounded-lg hover:bg-amber-100 transition-colors"
                              >
                                Voir profil
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {chauffeurs.length === 0 && (
                  <div className="p-8 text-center text-gray-500">Aucun résultat trouvé</div>
                )}
              </>
            )}
          </div>
        </>
      )}

      {/* Pagination pour courses (filtrée côté frontend) */}
      {activeTab === 'courses' && getFilteredTotalPages() > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600">
            Page {coursesPage} sur {getFilteredTotalPages()} ({getFilteredCourses().length} courses)
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setCoursesPage(p => Math.max(1, p - 1))}
              disabled={coursesPage === 1}
              className="flex items-center gap-1 rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              <ChevronLeft className="h-4 w-4" />
              Préc.
            </button>
            <button
              onClick={() => setCoursesPage(p => Math.min(getFilteredTotalPages(), p + 1))}
              disabled={coursesPage === getFilteredTotalPages()}
              className="flex items-center gap-1 rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Suiv.
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Pagination pour clients/chauffeurs (paginée côté backend) */}
      {(activeTab === 'clients' || activeTab === 'chauffeurs') && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600">
            Page {currentPage} sur {totalPages} ({totalItems} éléments)
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="flex items-center gap-1 rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              <ChevronLeft className="h-4 w-4" />
              Préc.
            </button>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="flex items-center gap-1 rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Suiv.
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Modal détails course */}
      {selectedCourse && (
        <CourseDetailModal course={selectedCourse} onClose={() => setSelectedCourse(null)} />
      )}

      {/* Modal profil client */}
      {selectedClientProfile && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setSelectedClientProfile(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center">
                    <User className="h-8 w-8" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">{selectedClientProfile.first_name} {selectedClientProfile.last_name}</h2>
                    <p className="opacity-80">Client • ID: {selectedClientProfile.id}</p>
                  </div>
                </div>
                <button onClick={() => setSelectedClientProfile(null)} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
                  <XCircle className="h-6 w-6" />
                </button>
              </div>
            </div>
            
            {/* Infos + Stats */}
            <div className="p-6 border-b">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <Phone className="h-5 w-5 text-blue-600" />
                  <div>
                    <p className="text-xs text-gray-500">Téléphone</p>
                    <p className="font-medium">{selectedClientProfile.mobile || 'N/A'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <Mail className="h-5 w-5 text-blue-600" />
                  <div>
                    <p className="text-xs text-gray-500">Email</p>
                    <p className="font-medium text-sm truncate">{selectedClientProfile.email || 'N/A'}</p>
                  </div>
                </div>
                {(() => {
                  const profileCourses = getClientCourses(selectedClientProfile.id);
                  const profileStats = getProfileStats(profileCourses);
                  return (
                    <>
                      <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
                        <CheckCircle className="h-5 w-5 text-green-600" />
                        <div>
                          <p className="text-xs text-gray-500">Courses terminées</p>
                          <p className="font-bold text-green-600">{profileStats.terminees}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 p-3 bg-purple-50 rounded-lg">
                        <DollarSign className="h-5 w-5 text-purple-600" />
                        <div>
                          <p className="text-xs text-gray-500">Total dépensé</p>
                          <p className="font-bold text-purple-600">{profileStats.totalCA.toLocaleString('fr-FR')} XPF</p>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
            
            {/* Liste des courses */}
            <div className="p-6 overflow-y-auto max-h-[400px]">
              <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Car className="h-5 w-5" />
                Historique des courses ({getClientCourses(selectedClientProfile.id).length})
              </h3>
              <div className="space-y-3">
                {getClientCourses(selectedClientProfile.id).slice(0, 20).map(course => {
                  const statut = getStatutLabel(course.statut);
                  const StatusIcon = statut.icon;
                  return (
                    <button 
                      key={course.order_id} 
                      onClick={() => { setSelectedClientProfile(null); setSelectedCourse(course); }}
                      className="w-full flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-blue-50 hover:ring-2 hover:ring-blue-200 transition-all text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${statut.color}`}>
                          <StatusIcon className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">#{course.order_number}</p>
                          <p className="text-xs text-gray-500">{new Date(course.date_creation).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-purple-600">{parseInt(course.montant_total as string || '0').toLocaleString('fr-FR')} XPF</p>
                        <p className="text-xs text-gray-500">
                          {course.chauffeur_prenom ? `${course.chauffeur_prenom} ${course.chauffeur_nom || ''}` : 'Pas de chauffeur'}
                        </p>
                      </div>
                    </button>
                  );
                })}
                {getClientCourses(selectedClientProfile.id).length === 0 && (
                  <p className="text-center text-gray-500 py-8">Aucune course trouvée</p>
                )}
                {getClientCourses(selectedClientProfile.id).length > 20 && (
                  <p className="text-center text-gray-400 text-sm py-2">... et {getClientCourses(selectedClientProfile.id).length - 20} autres courses</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal profil chauffeur */}
      {selectedChauffeurProfile && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setSelectedChauffeurProfile(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center">
                    <Car className="h-8 w-8" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">{selectedChauffeurProfile.first_name} {selectedChauffeurProfile.last_name}</h2>
                    <p className="opacity-80">Chauffeur • ID: {selectedChauffeurProfile.id}</p>
                  </div>
                </div>
                <button onClick={() => setSelectedChauffeurProfile(null)} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
                  <XCircle className="h-6 w-6" />
                </button>
              </div>
            </div>
            
            {/* Infos + Stats */}
            <div className="p-6 border-b">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <Phone className="h-5 w-5 text-amber-600" />
                  <div>
                    <p className="text-xs text-gray-500">Téléphone</p>
                    <p className="font-medium">{selectedChauffeurProfile.mobile || 'N/A'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <Mail className="h-5 w-5 text-amber-600" />
                  <div>
                    <p className="text-xs text-gray-500">Email</p>
                    <p className="font-medium text-sm truncate">{selectedChauffeurProfile.email || 'N/A'}</p>
                  </div>
                </div>
                {(() => {
                  const profileCourses = getChauffeurCourses(selectedChauffeurProfile.id);
                  const profileStats = getProfileStats(profileCourses);
                  return (
                    <>
                      <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
                        <CheckCircle className="h-5 w-5 text-green-600" />
                        <div>
                          <p className="text-xs text-gray-500">Courses effectuées</p>
                          <p className="font-bold text-green-600">{profileStats.terminees}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 p-3 bg-amber-50 rounded-lg">
                        <DollarSign className="h-5 w-5 text-amber-600" />
                        <div>
                          <p className="text-xs text-gray-500">Gains totaux</p>
                          <p className="font-bold text-amber-600">{profileStats.totalChauffeur.toLocaleString('fr-FR')} XPF</p>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
              
              {/* Stats supplémentaires chauffeur */}
              {(() => {
                const profileCourses = getChauffeurCourses(selectedChauffeurProfile.id);
                const profileStats = getProfileStats(profileCourses);
                return (
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center p-3 bg-blue-50 rounded-lg">
                      <p className="text-2xl font-bold text-blue-600">{profileStats.total}</p>
                      <p className="text-xs text-gray-500">Courses totales</p>
                    </div>
                    <div className="text-center p-3 bg-red-50 rounded-lg">
                      <p className="text-2xl font-bold text-red-600">{profileStats.annulees}</p>
                      <p className="text-xs text-gray-500">Annulées</p>
                    </div>
                    <div className="text-center p-3 bg-purple-50 rounded-lg">
                      <p className="text-2xl font-bold text-purple-600">{profileStats.ticketMoyen.toLocaleString('fr-FR')}</p>
                      <p className="text-xs text-gray-500">Ticket moyen (XPF)</p>
                    </div>
                  </div>
                );
              })()}
            </div>
            
            {/* Liste des courses */}
            <div className="p-6 overflow-y-auto max-h-[350px]">
              <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Car className="h-5 w-5" />
                Historique des courses ({getChauffeurCourses(selectedChauffeurProfile.id).length})
              </h3>
              <div className="space-y-3">
                {getChauffeurCourses(selectedChauffeurProfile.id).slice(0, 20).map(course => {
                  const statut = getStatutLabel(course.statut);
                  const StatusIcon = statut.icon;
                  return (
                    <button 
                      key={course.order_id} 
                      onClick={() => { setSelectedChauffeurProfile(null); setSelectedCourse(course); }}
                      className="w-full flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-amber-50 hover:ring-2 hover:ring-amber-200 transition-all text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${statut.color}`}>
                          <StatusIcon className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">#{course.order_number}</p>
                          <p className="text-xs text-gray-500">{new Date(course.date_creation).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-amber-600">{parseInt(course.montant_chauffeur as string || '0').toLocaleString('fr-FR')} XPF</p>
                        <p className="text-xs text-gray-500">Client: {course.client_prenom} {course.client_nom || ''}</p>
                      </div>
                    </button>
                  );
                })}
                {getChauffeurCourses(selectedChauffeurProfile.id).length === 0 && (
                  <p className="text-center text-gray-500 py-8">Aucune course trouvée</p>
                )}
                {getChauffeurCourses(selectedChauffeurProfile.id).length > 20 && (
                  <p className="text-center text-gray-400 text-sm py-2">... et {getChauffeurCourses(selectedChauffeurProfile.id).length - 20} autres courses</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
