/**
 * Système de monitoring pour la production
 * - Health check amélioré
 * - Métriques de performance
 * - Détection de problèmes
 */

import type { Request, Response } from 'express';
import { db } from './db';
import { logger } from './logger';
import { sql } from 'drizzle-orm';

// ═══════════════════════════════════════════════════════════════════════════
// MÉTRIQUES EN TEMPS RÉEL
// ═══════════════════════════════════════════════════════════════════════════

interface SystemMetrics {
  uptime: number;
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  database: {
    connected: boolean;
    latency?: number;
  };
  timestamp: number;
}

let lastHealthCheck: SystemMetrics | null = null;

/**
 * Vérifie la santé de la base de données
 */
async function checkDatabase(): Promise<{ connected: boolean; latency?: number }> {
  try {
    const start = Date.now();
    // Simple query pour vérifier la connexion
    await db.execute(sql`SELECT 1`);
    const latency = Date.now() - start;
    
    return { connected: true, latency };
  } catch (error) {
    logger.error('Database health check failed', { error: error instanceof Error ? error.message : 'Unknown error' });
    return { connected: false };
  }
}

/**
 * Collecte les métriques système
 */
async function collectMetrics(): Promise<SystemMetrics> {
  const memUsage = process.memoryUsage();
  const totalMemory = memUsage.heapTotal;
  const usedMemory = memUsage.heapUsed;
  
  const dbStatus = await checkDatabase();
  
  return {
    uptime: process.uptime(),
    memory: {
      used: Math.round(usedMemory / 1024 / 1024), // MB
      total: Math.round(totalMemory / 1024 / 1024), // MB
      percentage: Math.round((usedMemory / totalMemory) * 100),
    },
    database: dbStatus,
    timestamp: Date.now(),
  };
}

/**
 * Endpoint /health amélioré avec métriques
 */
export async function healthCheck(req: Request, res: Response) {
  try {
    const metrics = await collectMetrics();
    lastHealthCheck = metrics;

    // Déterminer le statut global
    const isHealthy = metrics.database.connected && metrics.memory.percentage < 90;

    const statusCode = isHealthy ? 200 : 503; // 503 Service Unavailable si problème

    res.status(statusCode).json({
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: metrics.timestamp,
      uptime: Math.round(metrics.uptime),
      memory: {
        used: `${metrics.memory.used}MB`,
        total: `${metrics.memory.total}MB`,
        percentage: `${metrics.memory.percentage}%`,
      },
      database: {
        connected: metrics.database.connected,
        latency: metrics.database.latency ? `${metrics.database.latency}ms` : undefined,
      },
      // En développement, inclure plus de détails
      ...(process.env.NODE_ENV === 'development' && {
        nodeVersion: process.version,
        platform: process.platform,
      }),
    });
  } catch (error) {
    logger.errorWithStack('Health check failed', error instanceof Error ? error : new Error('Unknown error'));
    res.status(503).json({
      status: 'error',
      message: 'Health check failed',
      timestamp: Date.now(),
    });
  }
}

/**
 * Endpoint /metrics pour le monitoring externe
 * Retourne les métriques en format compatible Prometheus/Grafana
 */
export async function metricsEndpoint(req: Request, res: Response) {
  try {
    const metrics = lastHealthCheck || await collectMetrics();

    // Format simple pour monitoring externe
    res.json({
      uptime_seconds: Math.round(metrics.uptime),
      memory_used_mb: metrics.memory.used,
      memory_total_mb: metrics.memory.total,
      memory_percentage: metrics.memory.percentage,
      database_connected: metrics.database.connected ? 1 : 0,
      database_latency_ms: metrics.database.latency || 0,
      timestamp: metrics.timestamp,
    });
  } catch (error) {
    logger.errorWithStack('Metrics endpoint failed', error instanceof Error ? error : new Error('Unknown error'));
    res.status(500).json({ error: 'Failed to collect metrics' });
  }
}

/**
 * Middleware pour détecter les problèmes de performance
 */
export function performanceMonitor(req: Request, res: Response, next: () => void) {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    
    // Alerter si une requête prend trop de temps
    if (duration > 5000) { // Plus de 5 secondes
      logger.warn('Slow request detected', {
        method: req.method,
        path: req.path,
        duration,
        statusCode: res.statusCode,
      });
    }

    // Alerter si utilisation mémoire élevée
    const memUsage = process.memoryUsage();
    const heapUsedPercentage = (memUsage.heapUsed / memUsage.heapTotal) * 100;
    if (heapUsedPercentage > 85) {
      logger.warn('High memory usage detected', {
        heapUsedPercentage: Math.round(heapUsedPercentage),
        heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024),
      });
    }
  });

  next();
}
