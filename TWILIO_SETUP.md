# Configuration Twilio pour la vérification SMS

## Variables d'environnement requises

Ajoutez ces variables dans votre fichier `.env` (en développement) ou dans le dashboard Render (en production) :

```bash
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_VERIFY_SERVICE_SID=your_twilio_verify_service_sid
```

## ⚠️ SÉCURITÉ IMPORTANTE

**Ne jamais commiter vos credentials Twilio dans le code !**

1. Aller sur [Twilio Console](https://console.twilio.com/)
2. Créer un compte et récupérer vos credentials
3. Les ajouter en variables d'environnement

## Configuration sur Render

1. Va sur [Render Dashboard](https://dashboard.render.com/)
2. Sélectionne ton service **back-end-tapea**
3. Va dans **Environment** (Variables d'environnement)
4. Ajoute les 3 variables ci-dessus
5. Redéploie le service

## Fonctionnement

Une fois configuré, le système :

- ✅ **Envoie automatiquement un SMS** avec un code à 6 chiffres lors de l'inscription
- ✅ **Vérifie le code** via Twilio Verify Service (plus sécurisé que stocker les codes en base)
- ✅ **Renvoie le code** si l'utilisateur le demande
- ✅ **Mode dev** : si Twilio n'est pas configuré, utilise le code `111111` comme fallback

## Coûts

- ~0.05-0.10$ par SMS en Polynésie française
- Verify Service inclut protection anti-spam et relances automatiques

## Test

Après configuration, teste l'inscription d'un nouveau compte pour vérifier que le SMS arrive bien.
