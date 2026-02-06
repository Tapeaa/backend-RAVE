/**
 * Script pour supprimer les courses de test/spam
 * Exécuter avec: node scripts/filter-courses.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_PATH = path.join(__dirname, '..', 'server', 'data', 'TAPEA_DATA_COMPLET.json');

// Charger les données
console.log('📂 Chargement des données...');
const rawData = fs.readFileSync(DATA_PATH, 'utf-8');
const data = JSON.parse(rawData);

console.log(`   - ${data.clients.length} utilisateurs`);
console.log(`   - ${data.courses.length} courses\n`);

// Liste des personnes à supprimer (courses où ils sont client OU chauffeur)
const personnesASupprimer = [
  { prenom: 'teriimana', nom: 'morgant' },
  { prenom: 'test26', nom: 'client' },
  { prenom: 'test', nom: 'client' },
];

// Compteurs
const suppressionParPersonne = {};
personnesASupprimer.forEach(p => {
  suppressionParPersonne[`${p.prenom} ${p.nom}`] = 0;
});

// Filtrer les courses
const filteredCourses = data.courses.filter(course => {
  const clientPrenom = course.client_prenom?.toLowerCase() || '';
  const clientNom = course.client_nom?.toLowerCase() || '';
  const chauffeurPrenom = course.chauffeur_prenom?.toLowerCase() || '';
  const chauffeurNom = course.chauffeur_nom?.toLowerCase() || '';
  
  for (const personne of personnesASupprimer) {
    // Vérifier si la personne est client
    const isClient = clientPrenom === personne.prenom && 
      (clientNom === personne.nom || clientNom.includes(personne.nom) || personne.nom.includes(clientNom));
    
    // Vérifier si la personne est chauffeur
    const isChauffeur = chauffeurPrenom === personne.prenom && 
      (chauffeurNom === personne.nom || chauffeurNom.includes(personne.nom) || personne.nom.includes(chauffeurNom));
    
    if (isClient || isChauffeur) {
      suppressionParPersonne[`${personne.prenom} ${personne.nom}`]++;
      const role = isClient ? 'client' : 'chauffeur';
      console.log(`🗑️  Course ${course.order_id} - ${personne.prenom} ${personne.nom} (${role}) - ${course.date_creation}`);
      return false; // Supprimer
    }
  }
  
  return true; // Garder
});

const totalSupprime = Object.values(suppressionParPersonne).reduce((a, b) => a + b, 0);

console.log(`\n📊 Résumé par personne:`);
Object.entries(suppressionParPersonne).forEach(([nom, count]) => {
  if (count > 0) {
    console.log(`   - ${nom}: ${count} courses`);
  }
});
console.log(`\n   Total supprimé: ${totalSupprime}`);
console.log(`   Courses restantes: ${filteredCourses.length}\n`);

// Recalculer les stats
const totalCA = filteredCourses.reduce((sum, c) => sum + (parseInt(c.montant_total) || 0), 0);
const dates = filteredCourses
  .map(c => c.date_creation)
  .filter(d => d && d !== 'NULL')
  .sort();

// Mettre à jour les données
data.courses = filteredCourses;
data.metadata.stats.total_courses = filteredCourses.length;
data.metadata.stats.total_ca = totalCA;
data.metadata.periode = {
  debut: dates[0] || 'N/A',
  fin: dates[dates.length - 1] || 'N/A'
};
data.metadata.export_date = new Date().toISOString();

// Sauvegarder
console.log('💾 Sauvegarde des données filtrées...');
fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf-8');

console.log(`\n✅ Terminé !`);
console.log(`   - ${filteredCourses.length} courses conservées`);
console.log(`   - CA total: ${totalCA.toLocaleString()} XPF`);
