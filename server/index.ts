import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import path from "path";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { apiLimiter, validateHeaders, validateUrlParams } from "./security";
import { logger } from "./logger";
import { healthCheck, metricsEndpoint, performanceMonitor } from "./monitoring";
import { ensureVerificationCodesTable } from "./ensure-verification-codes-table";
import { ensureClientLegalColumns } from "./ensure-client-legal-columns";
import { ensurePrestatairesTable } from "./ensure-prestataires-table";
import { ensureFraisServiceConfigTable } from "./ensure-frais-service-config";
import { ensureCollecteFraisColumns } from "./ensure-collecte-frais-columns";
import { ensureDriverCommissionColumn } from "./ensure-driver-commission-column";

const app = express();
app.set("trust proxy", 1);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// Serve static files from the public folder (for logo and other assets)
app.use(express.static(path.join(process.cwd(), "public")));

// ═══════════════════════════════════════════════════════════════════════════
// SÉCURITÉ ET MONITORING - Appliqué avant toutes les routes
// ═══════════════════════════════════════════════════════════════════════════

// Performance monitoring (mesure le temps de réponse)
app.use(performanceMonitor);

// Validation des headers et paramètres
app.use(validateHeaders);
app.use(validateUrlParams);

// Rate limiting général (sauf /health et /metrics)
app.use("/api", apiLimiter);

// Health check amélioré - enregistré en premier pour les probes de déploiement
app.get("/health", healthCheck);

// Endpoint de métriques pour monitoring externe
app.get("/metrics", metricsEndpoint);

// ═══════════════════════════════════════════════════════════════════════════
// LOGGING STRUCTURÉ - Remplace l'ancien système de logs
// ═══════════════════════════════════════════════════════════════════════════

app.use((req, res, next) => {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    // Utiliser le nouveau logger structuré
    logger.http(req, res, duration);
  });

  next();
});

(async () => {
  try {
    // S'assurer que la table verification_codes existe
    await ensureVerificationCodesTable();
    
    // S'assurer que les colonnes CGU existent dans la table clients
    await ensureClientLegalColumns();
    
    // S'assurer que les tables prestataires et collecte_frais existent
    await ensurePrestatairesTable();
    
    // S'assurer que la table frais_service_config existe
    await ensureFraisServiceConfigTable();
    
    // S'assurer que les colonnes de détail frais existent dans collecte_frais
    await ensureCollecteFraisColumns();
    
    // S'assurer que la colonne commission_chauffeur existe dans drivers
    await ensureDriverCommissionColumn();
    
    const server = await registerRoutes(app);

    // ═══════════════════════════════════════════════════════════════════════════
    // GESTION D'ERREURS GLOBALE - Logs structurés
    // ═══════════════════════════════════════════════════════════════════════════
    app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";

      // Logger l'erreur avec contexte
      logger.errorWithStack("Unhandled error in request", err instanceof Error ? err : new Error(message), {
        method: req.method,
        path: req.path,
        statusCode: status,
      });

      // En production, ne pas exposer les détails de l'erreur
      if (process.env.NODE_ENV === 'production' && status === 500) {
        res.status(status).json({ 
          error: "Erreur serveur",
          // Ne pas exposer le message d'erreur en production
        });
      } else {
        res.status(status).json({ 
          error: message,
          // En développement, inclure plus de détails
          ...(process.env.NODE_ENV === 'development' && {
            stack: err.stack,
          }),
        });
      }
    });

    // importantly only setup vite in development and after
    // setting up all the other routes so the catch-all route
    // doesn't interfere with the other routes
    if (app.get("env") === "development") {
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }

    // ALWAYS serve the app on the port specified in the environment variable PORT
    // Other ports are firewalled. Default to 5000 if not specified.
    // this serves both the API and the client.
    // It is the only port that is not firewalled.
    const port = parseInt(process.env.PORT || '5000', 10);
    server.listen(port, "0.0.0.0", () => {
      log(`serving on port ${port}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
})();
