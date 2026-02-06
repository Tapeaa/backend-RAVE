# 🔒 Configuration Backend pour Production

Ce document décrit les améliorations de sécurité et de monitoring implémentées pour la production.

## ✅ Checklist de Sécurité

- [x] **HTTPS obligatoire** : Déjà géré par Render (pas d'action requise)
- [x] **Rate limiting sur les APIs** : Implémenté avec `express-rate-limit`
- [x] **Validation des inputs côté serveur** : Utilise Zod (déjà présent, amélioré)
- [x] **Logs d'erreur structurés** : Système de logging JSON structuré
- [x] **Monitoring (Uptime, erreurs)** : Endpoints `/health` et `/metrics` améliorés

---

## 📦 Installation

### 1. Installer express-rate-limit

```bash
npm install express-rate-limit
npm install --save-dev @types/express-rate-limit
```

### 2. Vérifier que tout fonctionne

```bash
npm run build
npm start
```

---

## 🛡️ Fonctionnalités Implémentées

### 1. Rate Limiting

Protection contre les abus et attaques DDoS :

- **API général** : 100 requêtes / 15 minutes par IP
- **Authentification** : 5 tentatives / 15 minutes par IP (protection brute force)
- **Création de commandes** : 10 commandes / heure par IP
- **Envoi SMS/OTP** : 3 envois / heure par IP (protection abus Twilio)

**Fichier** : `server/security.ts`

### 2. Validation des Headers

- Vérification HTTPS en production
- Validation du Content-Type pour les requêtes POST/PUT/PATCH
- Protection contre les injections SQL dans les paramètres d'URL

**Fichier** : `server/security.ts`

### 3. Logs Structurés

Système de logging JSON pour faciliter l'analyse :

- **Niveaux** : `error`, `warn`, `info`, `debug`
- **Format JSON en production** : Facilite l'analyse avec des outils externes
- **Format lisible en développement** : Pour faciliter le debug
- **Contextualisation automatique** : IP, méthode, path, durée, user ID, etc.

**Fichier** : `server/logger.ts`

**Exemple de log en production** :
```json
{
  "timestamp": "2025-01-20T10:30:00.000Z",
  "level": "error",
  "message": "HTTP POST /api/orders",
  "method": "POST",
  "path": "/api/orders",
  "statusCode": 500,
  "duration": 1234,
  "ip": "192.168.1.1",
  "error": {
    "name": "DatabaseError",
    "message": "Connection timeout",
    "stack": "..."
  }
}
```

### 4. Monitoring Amélioré

#### Endpoint `/health`

Vérifie la santé du système :
- ✅ Connexion base de données
- ✅ Utilisation mémoire
- ✅ Uptime du serveur
- ✅ Latence base de données

**Réponse** :
```json
{
  "status": "healthy",
  "timestamp": 1705752000000,
  "uptime": 3600,
  "memory": {
    "used": "256MB",
    "total": "512MB",
    "percentage": "50%"
  },
  "database": {
    "connected": true,
    "latency": "12ms"
  }
}
```

#### Endpoint `/metrics`

Métriques pour monitoring externe (compatible Prometheus/Grafana) :
- Uptime en secondes
- Mémoire utilisée/totale
- Statut base de données
- Latence base de données

**Réponse** :
```json
{
  "uptime_seconds": 3600,
  "memory_used_mb": 256,
  "memory_total_mb": 512,
  "memory_percentage": 50,
  "database_connected": 1,
  "database_latency_ms": 12,
  "timestamp": 1705752000000
}
```

### 5. Détection de Problèmes

Le système détecte automatiquement :
- ⚠️ Requêtes lentes (> 5 secondes)
- ⚠️ Utilisation mémoire élevée (> 85%)
- ⚠️ Erreurs de base de données

Les alertes sont loggées automatiquement avec le contexte complet.

---

## 🔧 Configuration

### Variables d'Environnement

Aucune nouvelle variable requise. Le système utilise :
- `NODE_ENV` : `production` ou `development` (déjà présent)

### Ajuster les Limites de Rate Limiting

Modifier dans `server/security.ts` :

```typescript
// Exemple : Augmenter la limite API
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200, // Augmenté de 100 à 200
  // ...
});
```

---

## 📊 Utilisation avec Render

### Logs sur Render

Les logs structurés JSON sont automatiquement capturés par Render. Vous pouvez :
1. Voir les logs dans le dashboard Render
2. Filtrer par niveau (`error`, `warn`, `info`)
3. Rechercher par message ou contexte

### Monitoring avec Render

Render fournit déjà :
- ✅ Uptime monitoring (via `/health`)
- ✅ Alertes automatiques en cas de crash
- ✅ Métriques CPU/Mémoire

**Pour aller plus loin** :
- Utiliser `/metrics` avec un service externe (Grafana, Datadog, etc.)
- Configurer des alertes basées sur les métriques

---

## 🚀 Prochaines Étapes (Optionnel)

### 1. Monitoring Externe

Intégrer avec :
- **Grafana** : Dashboard de métriques
- **Sentry** : Tracking d'erreurs en temps réel
- **Datadog** : Monitoring complet

### 2. Alertes Automatiques

Configurer des alertes pour :
- Taux d'erreur > 5%
- Latence > 2 secondes
- Mémoire > 90%
- Base de données déconnectée

### 3. Validation Zod Avancée

Améliorer la validation existante :
- Ajouter des schémas Zod pour toutes les routes
- Valider les types de données (email, phone, etc.)
- Messages d'erreur personnalisés

---

## 📝 Notes Importantes

1. **Rate Limiting** : Les limites sont par IP. Si vous avez beaucoup d'utilisateurs derrière le même proxy (ex: entreprise), ajustez les limites.

2. **Logs** : En production, les logs sont en JSON. Utilisez `jq` ou un outil similaire pour les analyser :
   ```bash
   # Filtrer les erreurs
   cat logs.txt | jq 'select(.level == "error")'
   ```

3. **Performance** : Le monitoring ajoute ~1-2ms par requête. Impact négligeable.

4. **Sécurité** : Les validations de headers et paramètres sont appliquées avant toutes les routes. Aucune route n'est exemptée (sauf `/health` et `/metrics`).

---

## ✅ Vérification

Pour vérifier que tout fonctionne :

1. **Rate Limiting** :
   ```bash
   # Faire 101 requêtes rapidement
   for i in {1..101}; do curl http://localhost:5000/api/test; done
   # La 101ème devrait retourner une erreur 429
   ```

2. **Health Check** :
   ```bash
   curl http://localhost:5000/health
   # Devrait retourner {"status":"healthy",...}
   ```

3. **Logs** :
   ```bash
   # Faire une requête et vérifier les logs
   curl http://localhost:5000/api/test
   # Les logs devraient être en JSON (en production)
   ```

---

## 🆘 Dépannage

### Rate Limiting trop strict

Si les utilisateurs légitimes sont bloqués :
1. Augmenter les limites dans `server/security.ts`
2. Ou exclure certaines IPs (ajouter dans `skip`)

### Logs non structurés

Vérifier que `NODE_ENV=production` est défini.

### Health check échoue

Vérifier :
1. Connexion base de données (variables d'environnement)
2. Mémoire disponible
3. Logs d'erreur pour plus de détails

---

**Dernière mise à jour** : 2025-01-20
