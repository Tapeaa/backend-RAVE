/**
 * Configuration de sécurité pour la production
 * - Rate limiting
 * - Validation des headers
 * - Protection contre les attaques courantes
 */

import rateLimit from 'express-rate-limit';
import type { Request, Response, NextFunction } from 'express';

// ═══════════════════════════════════════════════════════════════════════════
// RATE LIMITING - Protection contre les abus et attaques DDoS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Rate limiter général pour toutes les routes API
 * 1000 requêtes par 15 minutes par IP (augmenté pour tests)
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limite de 1000 requêtes par IP
  message: {
    error: 'Trop de requêtes depuis cette IP, veuillez réessayer plus tard.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true, // Retourne les headers `RateLimit-*` dans la réponse
  legacyHeaders: false, // Désactive les headers `X-RateLimit-*`
  // Skip rate limiting pour les health checks et le polling messages
  skip: (req: Request) =>
    req.path === '/health' ||
    req.path.startsWith('/api/messages') ||
    req.path.startsWith('/api/admin/messages') ||
    req.path.startsWith('/api/orders/active'),
});

/**
 * Rate limiter strict pour les routes d'authentification
 * 5 tentatives par 15 minutes par IP (protection contre brute force)
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Seulement 5 tentatives
  message: {
    error: 'Trop de tentatives de connexion. Veuillez réessayer dans 15 minutes.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip si c'est une requête de health check
  skip: (req: Request) => req.path === '/health',
});

/**
 * Rate limiter pour les routes de création de commandes
 * 10 commandes par heure par IP (protection contre spam)
 */
export const orderLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 heure
  max: 10, // 10 commandes max par heure
  message: {
    error: 'Trop de commandes créées. Veuillez réessayer plus tard.',
    retryAfter: '1 heure'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: Request) => req.path === '/health',
});

/**
 * Rate limiter pour les routes d'envoi de SMS/OTP
 * 3 envois par heure par IP (protection contre abus Twilio)
 */
export const smsLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 heure
  max: 3, // 3 SMS max par heure
  message: {
    error: 'Trop de demandes de code de vérification. Veuillez réessayer plus tard.',
    retryAfter: '1 heure'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: Request) => req.path === '/health',
});

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION DES HEADERS - Protection contre les attaques basiques
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Middleware pour valider les headers essentiels
 */
export const validateHeaders = (req: Request, res: Response, next: NextFunction) => {
  // En production, forcer HTTPS (Render le fait déjà, mais on vérifie)
  if (process.env.NODE_ENV === 'production' && req.headers['x-forwarded-proto'] !== 'https') {
    // Render ajoute automatiquement x-forwarded-proto, donc ce cas ne devrait pas arriver
    // Mais on le garde pour sécurité
    return res.status(403).json({ 
      error: 'HTTPS requis en production' 
    });
  }

  // Valider Content-Type pour les requêtes POST/PUT/PATCH avec body
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body && Object.keys(req.body).length > 0) {
    const contentType = req.headers['content-type'];
    if (!contentType || !contentType.includes('application/json')) {
      return res.status(400).json({ 
        error: 'Content-Type doit être application/json' 
      });
    }
  }

  next();
};

// ═══════════════════════════════════════════════════════════════════════════
// PROTECTION CONTRE LES INJECTIONS SQL (via validation des paramètres)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Valide que les paramètres d'URL ne contiennent pas de caractères suspects
 */
export const validateUrlParams = (req: Request, res: Response, next: NextFunction) => {
  const suspiciousPatterns = [
    /[<>'"]/, // Caractères HTML/JS dangereux
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\b)/i, // Commandes SQL
    /javascript:/i, // Protocole JavaScript
    /on\w+\s*=/i, // Handlers d'événements HTML
  ];

  // Vérifier les paramètres de route
  const params = { ...req.params, ...req.query };
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') {
      for (const pattern of suspiciousPatterns) {
        if (pattern.test(value)) {
          return res.status(400).json({ 
            error: `Paramètre invalide détecté: ${key}` 
          });
        }
      }
    }
  }

  next();
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Obtenir l'IP réelle du client (même derrière un proxy comme Render)
// ═══════════════════════════════════════════════════════════════════════════

export const getClientIp = (req: Request): string => {
  // Render et la plupart des proxies ajoutent ces headers
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    // x-forwarded-for peut contenir plusieurs IPs, prendre la première
    return Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0].trim();
  }
  
  // Fallback sur l'IP directe
  return req.socket.remoteAddress || 'unknown';
};
