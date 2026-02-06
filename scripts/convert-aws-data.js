/**
 * Script de conversion des données AWS MariaDB vers JSON
 * Exécuter avec: node scripts/convert-aws-data.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Chemins des fichiers
const DATA_EXPORT_PATH = 'C:\\Users\\Planet Fenua\\Desktop\\data_export';
const OUTPUT_PATH = path.join(__dirname, '..', 'server', 'data', 'TAPEA_DATA_COMPLET.json');

// Fonction pour parser un fichier TSV
function parseTSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());
  
  if (lines.length === 0) return [];
  
  // Première ligne = headers
  const headers = lines[0].split('\t');
  const data = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split('\t');
    const row = {};
    headers.forEach((header, idx) => {
      row[header.trim()] = values[idx] || '';
    });
    data.push(row);
  }
  
  return data;
}

// Vérifier si un compte est spam/test
function isSpamAccount(user) {
  const spamPatterns = ['xxxxxx', 'xxxxx', 'xxxx', 'test', 'client.test', 'chauffeur.test'];
  const fieldsToCheck = [
    user.first_name, 
    user.last_name, 
    user.email, 
    user.mobile,
    user.user_code
  ];
  
  for (const field of fieldsToCheck) {
    if (!field) continue;
    const lowerField = String(field).toLowerCase();
    for (const pattern of spamPatterns) {
      if (lowerField.includes(pattern)) return true;
    }
  }
  
  // Vérifier si supprimé
  if (user.deleted === '1') return true;
  
  return false;
}

// ID à partir duquel les "chauffeurs" sont en fait des clients
// (app client fermée, ils se sont inscrits sur l'app chauffeur par erreur)
const FAKE_CHAUFFEUR_START_ID = 2654; // Claire Rocuet et tous ceux après

// Vérifier si un chauffeur est en fait un client mal classé
function isFakeChauffeur(user) {
  if (user.user_type !== '2') return false;
  const userId = parseInt(user.id);
  return userId >= FAKE_CHAUFFEUR_START_ID;
}

// Vérifier si un email est légitime
function isLegitEmail(email) {
  if (!email || email === 'NULL' || email.includes('_')) return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Parser les infos client/chauffeur depuis le JSON embarqué dans les commandes
function parseEmbeddedJSON(jsonStr) {
  if (!jsonStr || jsonStr === 'NULL') return null;
  try {
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

// Fonction principale
async function main() {
  console.log('🚀 Démarrage de la conversion des données AWS...\n');
  
  // Lire les fichiers
  console.log('📂 Lecture des fichiers CSV/TSV...');
  const clientsRaw = parseTSV(path.join(DATA_EXPORT_PATH, 'clients.csv'));
  const commandesRaw = parseTSV(path.join(DATA_EXPORT_PATH, 'commandes.csv'));
  
  console.log(`   - ${clientsRaw.length} utilisateurs trouvés`);
  console.log(`   - ${commandesRaw.length} commandes trouvées\n`);
  
  // Filtrer les utilisateurs légitimes
  console.log('🧹 Filtrage des comptes spam/test...');
  
  const allClients = [];
  const allChauffeurs = [];
  const seenIds = new Set();
  
  let fakeChauffeursMoved = 0;
  
  for (const user of clientsRaw) {
    // Éviter les doublons
    if (seenIds.has(user.id)) continue;
    seenIds.add(user.id);
    
    // Filtrer les spams
    if (isSpamAccount(user)) continue;
    
    // Déterminer le vrai type d'utilisateur
    let effectiveUserType = user.user_type;
    
    // Vérifier si c'est un faux chauffeur (client inscrit par erreur sur l'app chauffeur)
    if (isFakeChauffeur(user)) {
      effectiveUserType = '1'; // Convertir en client
      fakeChauffeursMoved++;
    }
    
    // Vérifier l'email pour les vrais chauffeurs uniquement
    if (effectiveUserType === '2' && !isLegitEmail(user.email)) continue;
    
    const cleanUser = {
      id: user.id,
      user_number: user.user_number,
      user_code: user.user_code,
      first_name: user.first_name,
      last_name: user.last_name,
      full_name: user.full_name || `${user.first_name} ${user.last_name}`.trim(),
      email: user.email,
      mobile: user.mobile,
      mobile_dial_code: user.mobile_dial_code,
      city: user.city,
      postal_code: user.postal_code,
      address: user.address,
      user_type: effectiveUserType,
      activated: user.activated,
      status: user.status,
      create_time: user.create_time
    };
    
    if (effectiveUserType === '1') {
      allClients.push(cleanUser);
    } else if (effectiveUserType === '2') {
      allChauffeurs.push(cleanUser);
    }
  }
  
  console.log(`   - ${fakeChauffeursMoved} faux chauffeurs déplacés vers clients`);
  
  console.log(`   - ${allClients.length} clients légitimes`);
  console.log(`   - ${allChauffeurs.length} chauffeurs légitimes\n`);
  
  // Convertir les commandes
  console.log('📝 Conversion des commandes...');
  const allCourses = [];
  const seenOrderIds = new Set();
  
  for (const cmd of commandesRaw) {
    if (seenOrderIds.has(cmd.id)) continue;
    seenOrderIds.add(cmd.id);
    
    // Parser les JSON embarqués pour client et chauffeur
    const clientInfo = parseEmbeddedJSON(cmd.client);
    const driverInfo = parseEmbeddedJSON(cmd.driver);
    
    const course = {
      order_id: cmd.id,
      order_number: cmd.order_number,
      date_creation: cmd.create_time,
      statut: cmd.status,
      
      // Client
      client_id: cmd.client_id,
      client_prenom: clientInfo?.first_name || '',
      client_nom: clientInfo?.last_name || '',
      client_email: clientInfo?.email || '',
      client_mobile: clientInfo?.mobile || '',
      
      // Chauffeur
      chauffeur_id: cmd.driver_id || '',
      chauffeur_prenom: driverInfo?.first_name || '',
      chauffeur_nom: driverInfo?.last_name || '',
      chauffeur_email: driverInfo?.email || '',
      chauffeur_mobile: driverInfo?.mobile || '',
      
      // Adresses
      adresse_depart: cmd.from_address,
      code_postal_depart: cmd.from_postal_code,
      adresse_arrivee: cmd.to_address,
      code_postal_arrivee: cmd.to_postal_code,
      
      // Coordonnées GPS
      depart_lat: cmd.from_lat,
      depart_lng: cmd.from_lng,
      arrivee_lat: cmd.to_lat,
      arrivee_lng: cmd.to_lng,
      
      // Détails course
      distance_km: cmd.distance,
      duree_min: cmd.duration,
      nb_passagers: cmd.passenger_count,
      nb_bagages: cmd.luggage_count,
      
      // Financier (montants en centimes, convertir en XPF)
      montant_total: cmd.total,
      montant_chauffeur: cmd.driver_amount,
      montant_commission: cmd.commission_amount,
      
      // Paiement
      type_paiement_id: cmd.payment_type_id,
      
      // Notes
      note_client: cmd.rating_on_client,
      note_chauffeur: cmd.rating_on_driver,
      
      // Horaires
      heure_prise_en_charge: cmd.pick_time,
      heure_debut: cmd.start_time,
      heure_fin_course: cmd.end_time,
      
      // Annulation
      heure_annulation: cmd.cancel_time,
      type_annulation: cmd.cancel_type,
      
      // Acceptation
      heure_assignation: cmd.assign_time,
      heure_acceptation: cmd.accept_time
    };
    
    allCourses.push(course);
  }
  
  console.log(`   - ${allCourses.length} courses converties\n`);
  
  // Calculer les statistiques
  const totalCA = allCourses.reduce((sum, c) => sum + (parseInt(c.montant_total) || 0), 0);
  const dates = allCourses
    .map(c => c.date_creation)
    .filter(d => d && d !== 'NULL')
    .sort();
  
  // Créer l'objet final
  const finalData = {
    metadata: {
      source: 'AWS MariaDB Export',
      export_date: new Date().toISOString(),
      periode: {
        debut: dates[0] || 'N/A',
        fin: dates[dates.length - 1] || 'N/A'
      },
      stats: {
        total_clients: allClients.length,
        total_chauffeurs: allChauffeurs.length,
        total_courses: allCourses.length,
        total_ca: totalCA
      }
    },
    clients: [...allClients, ...allChauffeurs],
    courses: allCourses
  };
  
  // Écrire le fichier
  console.log('💾 Écriture du fichier JSON...');
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(finalData, null, 2), 'utf-8');
  
  console.log(`\n✅ Conversion terminée !`);
  console.log(`   Fichier créé: ${OUTPUT_PATH}`);
  console.log(`\n📊 Résumé:`);
  console.log(`   - ${allClients.length} clients`);
  console.log(`   - ${allChauffeurs.length} chauffeurs`);
  console.log(`   - ${allCourses.length} courses`);
  console.log(`   - ${totalCA.toLocaleString()} XPF de CA total`);
  console.log(`   - Période: ${dates[0]} → ${dates[dates.length - 1]}`);
}

main().catch(console.error);
