# 🚀 Installation Rapide - Sécurité Backend

## Étape 1 : Installer express-rate-limit

```bash
npm install express-rate-limit
```

## Étape 2 : Vérifier que tout compile

```bash
npm run build
```

Si vous avez des erreurs TypeScript, installer aussi les types :

```bash
npm install --save-dev @types/express-rate-limit
```

## Étape 3 : Tester en local

```bash
npm run dev
```

Vérifier que le serveur démarre sans erreur.

## Étape 4 : Tester les endpoints

### Health Check
```bash
curl http://localhost:5000/health
```

Devrait retourner :
```json
{
  "status": "healthy",
  "timestamp": 1705752000000,
  "uptime": 3600,
  "memory": { ... },
  "database": { ... }
}
```

### Metrics
```bash
curl http://localhost:5000/metrics
```

### Rate Limiting (tester)
```bash
# Faire plusieurs requêtes rapidement
for i in {1..10}; do curl http://localhost:5000/api/orders/pending; done
```

## Étape 5 : Déployer sur Render

1. **Commit les changements** :
   ```bash
   git add .
   git commit -m "feat: Add security and monitoring improvements"
   git push origin main
   ```

2. **Render va automatiquement** :
   - Installer `express-rate-limit`
   - Builder le projet
   - Redémarrer le serveur

3. **Vérifier les logs sur Render** :
   - Les logs devraient maintenant être en JSON structuré
   - Vérifier que `/health` fonctionne

## ✅ Vérification Finale

- [ ] `npm run build` fonctionne sans erreur
- [ ] Le serveur démarre en local
- [ ] `/health` retourne `{"status":"healthy"}`
- [ ] `/metrics` retourne des métriques
- [ ] Les logs sont structurés (JSON en production)
- [ ] Le déploiement sur Render fonctionne

## 🆘 Problèmes Courants

### Erreur : "Cannot find module 'express-rate-limit'"
**Solution** : `npm install express-rate-limit`

### Erreur TypeScript : "Cannot find type definitions"
**Solution** : `npm install --save-dev @types/express-rate-limit`

### Le serveur ne démarre pas
**Vérifier** :
1. Les imports dans `server/index.ts` sont corrects
2. `server/security.ts`, `server/logger.ts`, `server/monitoring.ts` existent
3. Aucune erreur de syntaxe dans les nouveaux fichiers

### Rate limiting trop strict
**Solution** : Ajuster les limites dans `server/security.ts`

---

**Temps estimé** : 5-10 minutes
