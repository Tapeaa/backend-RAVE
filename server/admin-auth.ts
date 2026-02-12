/**
 * Tape'ā Back Office - Middleware d'authentification admin et prestataires
 * JWT-based authentication pour Express.js
 * ADAPTÉ pour fonctionner avec la structure existante
 */

import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

// ============================================================================
// CONFIGURATION
// ============================================================================

const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || "admin-secret-key-change-in-production";
const JWT_EXPIRES_IN = "24h";
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || "";

// Si pas de hash configuré, utiliser un mot de passe simple en dev
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

// ============================================================================
// TYPES
// ============================================================================

export interface AdminTokenPayload {
  type: "admin";
  iat: number;
  exp: number;
}

export interface PrestataireTokenPayload {
  type: "prestataire";
  prestataireId: string;
  prestataireType: "societe_taxi" | "societe_tourisme" | "patente_taxi" | "patente_tourisme";
  prestataireName: string;
  iat: number;
  exp: number;
}

export type TokenPayload = AdminTokenPayload | PrestataireTokenPayload;

export interface AuthenticatedRequest extends Request {
  admin?: boolean;
  prestataire?: {
    id: string;
    type: "societe_taxi" | "societe_tourisme" | "patente_taxi" | "patente_tourisme";
    name: string;
  };
  userType?: "admin" | "prestataire";
}

// ============================================================================
// FONCTIONS UTILITAIRES
// ============================================================================

export function generateAdminToken(): string {
  const payload: Omit<AdminTokenPayload, "iat" | "exp"> = {
    type: "admin",
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function generatePrestataireToken(prestataire: {
  id: string;
  type: "societe_taxi" | "societe_tourisme" | "patente_taxi" | "patente_tourisme";
  nom: string;
}): string {
  const payload: Omit<PrestataireTokenPayload, "iat" | "exp"> = {
    type: "prestataire",
    prestataireId: prestataire.id,
    prestataireType: prestataire.type,
    prestataireName: prestataire.nom,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken<T>(token: string): T | null {
  try {
    return jwt.verify(token, JWT_SECRET) as T;
  } catch {
    return null;
  }
}

// ============================================================================
// MIDDLEWARES
// ============================================================================

/**
 * Middleware pour les routes admin uniquement
 */
export function requireAdminAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace("Bearer ", "") || req.cookies?.admin_token;

  if (!token) {
    res.status(401).json({ error: "Token manquant", code: "MISSING_TOKEN" });
    return;
  }

  const payload = verifyToken<AdminTokenPayload>(token);
  if (!payload || payload.type !== "admin") {
    res.status(401).json({ error: "Token invalide", code: "INVALID_TOKEN" });
    return;
  }

  req.admin = true;
  req.userType = "admin";
  next();
}

/**
 * Middleware pour les routes prestataires uniquement
 */
export function requirePrestataireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace("Bearer ", "") || req.cookies?.admin_token;

  if (!token) {
    res.status(401).json({ error: "Token manquant", code: "MISSING_TOKEN" });
    return;
  }

  const payload = verifyToken<PrestataireTokenPayload>(token);
  if (!payload || payload.type !== "prestataire") {
    res.status(401).json({ error: "Token invalide ou non autorisé", code: "INVALID_TOKEN" });
    return;
  }

  req.prestataire = {
    id: payload.prestataireId,
    type: payload.prestataireType,
    name: payload.prestataireName,
  };
  req.userType = "prestataire";
  next();
}

/**
 * Middleware pour les routes accessibles par admin OU prestataire
 */
export function requireDashboardAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace("Bearer ", "") || req.cookies?.admin_token;

  if (!token) {
    res.status(401).json({ error: "Token manquant", code: "MISSING_TOKEN" });
    return;
  }

  // Essayer d'abord comme admin
  const adminPayload = verifyToken<AdminTokenPayload>(token);
  if (adminPayload && adminPayload.type === "admin") {
    req.admin = true;
    req.userType = "admin";
    next();
    return;
  }

  // Sinon essayer comme prestataire
  const prestatairePayload = verifyToken<PrestataireTokenPayload>(token);
  if (prestatairePayload && prestatairePayload.type === "prestataire") {
    req.prestataire = {
      id: prestatairePayload.prestataireId,
      type: prestatairePayload.prestataireType,
      name: prestatairePayload.prestataireName,
    };
    req.userType = "prestataire";
    next();
    return;
  }

  res.status(401).json({ error: "Token invalide", code: "INVALID_TOKEN" });
}

/**
 * Helper pour vérifier si le prestataire est une société (peut créer des chauffeurs)
 */
export function isSociete(type: string): boolean {
  return type === "societe_taxi" || type === "societe_tourisme" || type === "agence_location";
}

export function isLoueur(type: string): boolean {
  return type === "agence_location" || type === "loueur_individuel";
}

/**
 * Helper pour vérifier si le prestataire est un patenté (indépendant)
 */
export function isPatente(type: string): boolean {
  return type === "patente_taxi" || type === "patente_tourisme";
}
