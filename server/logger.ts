/**
 * Système de logs structurés pour la production
 * - Logs JSON pour faciliter l'analyse
 * - Niveaux de log (error, warn, info, debug)
 * - Contextualisation automatique (timestamp, IP, user, etc.)
 */

import type { Request, Response } from 'express';
import { getClientIp } from './security';

export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug',
}

interface LogContext {
  timestamp: string;
  level: LogLevel;
  message: string;
  ip?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  duration?: number;
  userId?: string;
  driverId?: string;
  orderId?: string;
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
  };
  [key: string]: any; // Permet d'ajouter des champs personnalisés
}

/**
 * Formate un log en JSON structuré
 */
function formatLog(context: LogContext): string {
  const logEntry = {
    ...context,
    timestamp: new Date().toISOString(),
  };

  // En production, toujours utiliser JSON pour faciliter l'analyse
  if (process.env.NODE_ENV === 'production') {
    return JSON.stringify(logEntry);
  }

  // En développement, format lisible pour la console
  const { timestamp, level, message, ...rest } = logEntry;
  const restStr = Object.keys(rest).length > 0 ? ` ${JSON.stringify(rest)}` : '';
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${restStr}`;
}

/**
 * Logger principal
 */
class Logger {
  private log(level: LogLevel, message: string, context: Partial<LogContext> = {}) {
    const logEntry: LogContext = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...context,
    };

    const formatted = formatLog(logEntry);
    
    // Utiliser console.error pour les erreurs (pour que Render les capture)
    if (level === LogLevel.ERROR) {
      console.error(formatted);
    } else if (level === LogLevel.WARN) {
      console.warn(formatted);
    } else {
      console.log(formatted);
    }
  }

  error(message: string, context: Partial<LogContext> = {}) {
    this.log(LogLevel.ERROR, message, context);
  }

  warn(message: string, context: Partial<LogContext> = {}) {
    this.log(LogLevel.WARN, message, context);
  }

  info(message: string, context: Partial<LogContext> = {}) {
    this.log(LogLevel.INFO, message, context);
  }

  debug(message: string, context: Partial<LogContext> = {}) {
    // En production, ignorer les logs debug
    if (process.env.NODE_ENV !== 'production') {
      this.log(LogLevel.DEBUG, message, context);
    }
  }

  /**
   * Log une requête HTTP avec son contexte
   */
  http(req: Request, res: Response, duration: number) {
    const context: Partial<LogContext> = {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
      ip: getClientIp(req),
    };

    // Ajouter l'ID utilisateur si disponible
    if ((req as any).clientId) {
      context.userId = (req as any).clientId;
    }
    if ((req as any).driverId) {
      context.driverId = (req as any).driverId;
    }

    // Choisir le niveau selon le status code
    if (res.statusCode >= 500) {
      this.error(`HTTP ${req.method} ${req.path}`, context);
    } else if (res.statusCode >= 400) {
      this.warn(`HTTP ${req.method} ${req.path}`, context);
    } else {
      this.info(`HTTP ${req.method} ${req.path}`, context);
    }
  }

  /**
   * Log une erreur avec stack trace
   */
  errorWithStack(message: string, error: Error, context: Partial<LogContext> = {}) {
    this.error(message, {
      ...context,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: (error as any).code,
      },
    });
  }
}

// Export d'une instance singleton
export const logger = new Logger();
