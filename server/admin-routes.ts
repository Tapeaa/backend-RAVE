/**
 * Tape'ā Back Office - Routes API Admin
 * ADAPTÉ pour utiliser la structure existante (dbStorage)
 * Routes SÉPARÉES - ne modifie pas l'app mobile
 */

import type { Express } from "express";
import { z } from "zod";
import { dbStorage } from "./db-storage";
import { requireAdminAuth, requirePrestataireAuth, requireDashboardAuth, AuthenticatedRequest, generatePrestataireToken, isSociete } from "./admin-auth";
import { db } from "./db";
import { getIO } from "./routes";
import { notifyClient, notifyDriver } from "./onesignal";
import { clients, drivers, orders, invoices, tarifs, supplements, carouselImages, homeCategories, messages, prestataires, collecteFrais, vehicleModels, loueurVehicles, driverSessions } from "@shared/schema";
import { eq, desc, asc, count, sql, and, gte, inArray, isNotNull, or } from "drizzle-orm";
import { syncTahitiVehicleCatalog } from "./sync-vehicle-catalog";

// ============================================================================
// ROUTES D'AUTHENTIFICATION ADMIN
// ============================================================================

export function registerAdminAuthRoutes(app: Express) {
  // Login admin ou prestataire
  app.post("/api/auth/admin/login", async (req, res) => {
    try {
      const { password, code } = req.body;

      // Si un code 6 chiffres est fourni, c'est une connexion prestataire
      if (code) {
        const codeStr = String(code).trim();
        
        if (codeStr.length !== 6) {
          return res.status(400).json({ error: "Le code doit contenir 6 chiffres", code: "INVALID_CODE_FORMAT" });
        }

        // Rechercher le prestataire avec ce code
        const [prestataire] = await db
          .select()
          .from(prestataires)
          .where(and(
            eq(prestataires.code, codeStr),
            eq(prestataires.isActive, true)
          ));

        if (!prestataire) {
          return res.status(401).json({ error: "Code invalide ou compte désactivé", code: "INVALID_CODE" });
        }

        // Générer un token prestataire
        const token = generatePrestataireToken({
          id: prestataire.id,
          type: prestataire.type as "societe_taxi" | "societe_tourisme" | "patente_taxi" | "patente_tourisme",
          nom: prestataire.nom,
        });

        res.cookie("admin_token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          maxAge: 24 * 60 * 60 * 1000,
        });

        return res.json({ 
          success: true, 
          token,
          userType: "prestataire",
          prestataire: {
            id: prestataire.id,
            nom: prestataire.nom,
            type: prestataire.type,
            isSociete: isSociete(prestataire.type),
          }
        });
      }

      // Sinon, c'est une connexion admin avec mot de passe
      if (!password) {
        return res.status(400).json({ error: "Mot de passe ou code requis", code: "MISSING_CREDENTIALS" });
      }

      // Vérification simple du mot de passe (en production, utiliser ADMIN_PASSWORD_HASH)
      const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
      if (password !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: "Mot de passe incorrect", code: "INVALID_PASSWORD" });
      }

      const { generateAdminToken } = await import("./admin-auth.js");
      const token = generateAdminToken();

      res.cookie("admin_token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 24 * 60 * 60 * 1000,
      });

      return res.json({ success: true, token, userType: "admin" });
    } catch (error) {
      console.error("Admin/Prestataire login error:", error);
      return res.status(500).json({ error: "Erreur serveur", code: "SERVER_ERROR" });
    }
  });

  app.post("/api/auth/admin/logout", (_req, res) => {
    res.clearCookie("admin_token");
    return res.json({ success: true });
  });

  app.get("/api/auth/admin/verify", requireDashboardAuth, (req: AuthenticatedRequest, res) => {
    if (req.userType === "admin") {
      return res.json({ success: true, authenticated: true, userType: "admin" });
    } else if (req.userType === "prestataire" && req.prestataire) {
      return res.json({ 
        success: true, 
        authenticated: true, 
        userType: "prestataire",
        prestataire: {
          id: req.prestataire.id,
          nom: req.prestataire.name,
          type: req.prestataire.type,
          isSociete: isSociete(req.prestataire.type),
        }
      });
    }
    return res.json({ success: true, authenticated: true });
  });
}

// ============================================================================
// ROUTES ADMIN (protégées)
// ============================================================================

export function registerAdminRoutes(app: Express) {
  // Enregistrer les routes d'auth d'abord
  registerAdminAuthRoutes(app);

  // ============ DASHBOARD STATS ============
  
  app.get("/api/admin/dashboard/stats", requireAdminAuth, async (_req: AuthenticatedRequest, res) => {
    try {
      // Utiliser les tables existantes
      const [totalClientsResult, totalDriversResult, totalOrdersResult] = await Promise.all([
        db.select({ count: count() }).from(clients),
        db.select({ count: count() }).from(drivers),
        db.select({ count: count() }).from(orders),
      ]);

      const allOrders = await db.select().from(orders);
      const allDrivers = await db.select().from(drivers);
      const allClients = await db.select().from(clients);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const ordersToday = allOrders.filter(
        (o) => new Date(o.createdAt) >= today
      );

      const completedOrders = allOrders.filter(
        (o) => o.status === "completed" || o.status === "payment_confirmed"
      );

      const totalRevenue = completedOrders.reduce((sum, o) => sum + Number(o.totalPrice), 0);
      const revenueToday = ordersToday
        .filter((o) => o.status === "completed" || o.status === "payment_confirmed")
        .reduce((sum, o) => sum + Number(o.totalPrice), 0);

      const [onlineResult] = await db
        .select({ count: count() })
        .from(driverSessions)
        .where(and(eq(driverSessions.isOnline, true), gte(driverSessions.expiresAt, new Date())));

      return res.json({
        totalClients: totalClientsResult[0]?.count || 0,
        totalChauffeurs: totalDriversResult[0]?.count || 0,
        totalCommandes: totalOrdersResult[0]?.count || 0,
        chauffeursActifs: allDrivers.filter((d) => d.isActive).length,
        chauffeursEnLigne: onlineResult?.count || 0,
        clientsActifs: allClients.filter((c) => c.isVerified).length,
        commandesTerminees: completedOrders.length,
        commandesEnCours: allOrders.filter((o) => o.status === "in_progress").length,
        commandesEnAttente: allOrders.filter((o) => o.status === "pending").length,
        commandesAnnulees: allOrders.filter((o) => o.status === "cancelled").length,
        revenusTotaux: totalRevenue,
        commandesAujourdhui: ordersToday.length,
        revenusAujourdhui: revenueToday,
      });
    } catch (error) {
      console.error("Dashboard stats error:", error);
      return res.status(500).json({ error: "Erreur serveur", code: "SERVER_ERROR" });
    }
  });

  app.get("/api/admin/dashboard/activities", requireAdminAuth, async (_req: AuthenticatedRequest, res) => {
    try {
      const inProgressStatuses = ["accepted", "driver_enroute", "driver_arrived", "in_progress"];
      const statusCandidates = ["pending", ...inProgressStatuses];

      const ordersList = await db
        .select()
        .from(orders)
        .where(inArray(orders.status, statusCandidates))
        .orderBy(desc(orders.createdAt));

      const activities = ordersList
        .filter((order) => order.isAdvanceBooking || inProgressStatuses.includes(order.status))
        .map((order) => ({
          id: order.id,
          eventType: order.isAdvanceBooking ? "advance_booking" : "order_in_progress",
          customerName: order.clientName,
          amount: order.totalPrice,
          currency: "XPF",
          created: new Date(order.scheduledTime || order.createdAt).getTime() / 1000,
          description: order.isAdvanceBooking
            ? "Réservation à l'avance"
            : "Commande en cours",
        }));

      return res.json({ activities });
    } catch (error) {
      console.error("Dashboard activities error:", error);
      return res.status(500).json({ error: "Erreur serveur", code: "SERVER_ERROR" });
    }
  });

  app.get("/api/admin/chauffeurs/locations", requireAdminAuth, async (_req: AuthenticatedRequest, res) => {
    try {
      const driversList = await db
        .select()
        .from(drivers)
        .where(and(isNotNull(drivers.lastLatitude), isNotNull(drivers.lastLongitude)))
        .orderBy(desc(drivers.lastLocationAt));

      const chauffeurs = driversList.map((driver) => ({
        id: driver.id,
        firstName: driver.firstName,
        lastName: driver.lastName,
        latitude: driver.lastLatitude,
        longitude: driver.lastLongitude,
        vehicleModel: driver.vehicleModel,
        vehiclePlate: driver.vehiclePlate,
        updatedAt: driver.lastLocationAt?.toISOString() || null,
      }));

      console.log(`[ADMIN] /api/admin/chauffeurs/locations - Found ${chauffeurs.length} drivers with location`);
      return res.json({ chauffeurs });
    } catch (error) {
      console.error("Get chauffeur locations error:", error);
      return res.status(500).json({ error: "Erreur serveur", code: "SERVER_ERROR" });
    }
  });

  // Debug endpoint to check all drivers and their location status
  app.get("/api/admin/debug/drivers-locations", requireAdminAuth, async (_req: AuthenticatedRequest, res) => {
    try {
      const allDrivers = await db.select().from(drivers);
      
      const debugInfo = allDrivers.map((driver) => ({
        id: driver.id,
        name: `${driver.firstName} ${driver.lastName}`,
        hasLocation: driver.lastLatitude !== null && driver.lastLongitude !== null,
        lastLatitude: driver.lastLatitude,
        lastLongitude: driver.lastLongitude,
        lastLocationAt: driver.lastLocationAt?.toISOString() || null,
        isActive: driver.isActive,
      }));

      console.log(`[DEBUG] All drivers location status:`, JSON.stringify(debugInfo, null, 2));
      
      return res.json({
        totalDrivers: allDrivers.length,
        driversWithLocation: debugInfo.filter(d => d.hasLocation).length,
        drivers: debugInfo,
      });
    } catch (error) {
      console.error("Debug drivers locations error:", error);
      return res.status(500).json({ error: "Erreur serveur", code: "SERVER_ERROR" });
    }
  });

  // ============ MESSAGES (ADMIN) ============

  app.get("/api/admin/messages/conversations", requireAdminAuth, async (_req: AuthenticatedRequest, res) => {
    try {
      const allMessages = await db.select().from(messages).orderBy(desc(messages.createdAt));

      const latestByOrder = new Map<string, { lastMessage: string; lastMessageAt: string; unreadCount: number }>();
      for (const msg of allMessages) {
        if (!latestByOrder.has(msg.orderId)) {
          latestByOrder.set(msg.orderId, {
            lastMessage: msg.content,
            lastMessageAt: msg.createdAt.toISOString(),
            unreadCount: msg.isRead ? 0 : 1,
          });
        } else if (!msg.isRead) {
          const current = latestByOrder.get(msg.orderId);
          if (current) {
            current.unreadCount += 1;
          }
        }
      }

      const orderIds = Array.from(latestByOrder.keys());
      if (orderIds.length === 0) {
        return res.json({ conversations: [] });
      }

      const ordersWithMessages = await db
        .select()
        .from(orders)
        .where(inArray(orders.id, orderIds));

      const driverIds = ordersWithMessages
        .map((order) => order.assignedDriverId)
        .filter((id): id is string => !!id);

      const driversList = driverIds.length
        ? await db.select().from(drivers).where(inArray(drivers.id, driverIds))
        : [];

      const driverMap = new Map(driversList.map((driver) => [driver.id, driver]));

      const conversations = ordersWithMessages
        .map((order) => {
          const latest = latestByOrder.get(order.id);
          if (!latest) return null;
          const driver = order.assignedDriverId ? driverMap.get(order.assignedDriverId) : null;
          const driverName = driver ? `${driver.firstName} ${driver.lastName}` : "Chauffeur";

          return {
            id: order.id,
            orderId: order.id,
            clientId: order.clientId,
            driverId: order.assignedDriverId,
            clientName: order.clientName,
            driverName,
            lastMessage: latest.lastMessage,
            lastMessageAt: latest.lastMessageAt,
            unreadCount: latest.unreadCount,
            orderStatus: order.status,
          };
        })
        .filter(Boolean)
        .sort(
          (a, b) =>
            new Date((b as any).lastMessageAt).getTime() -
            new Date((a as any).lastMessageAt).getTime()
        );

      return res.json({ conversations });
    } catch (error) {
      console.error("Admin conversations error:", error);
      return res.status(500).json({ error: "Erreur serveur", code: "SERVER_ERROR" });
    }
  });

  app.get("/api/admin/messages/order/:orderId", requireAdminAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const order = await dbStorage.getOrder(req.params.orderId);
      if (!order) {
        return res.status(404).json({ error: "Commande non trouvée", code: "NOT_FOUND" });
      }

      const orderMessages = await dbStorage.getMessagesByOrder(order.id);

      return res.json({
        order,
        messages: orderMessages,
      });
    } catch (error) {
      console.error("Admin messages error:", error);
      return res.status(500).json({ error: "Erreur serveur", code: "SERVER_ERROR" });
    }
  });

  app.post("/api/admin/messages/send", requireAdminAuth, async (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      orderId: z.string().min(1),
      recipientType: z.enum(["client", "driver"]),
      content: z.string().min(1).max(1000),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Paramètres invalides", code: "INVALID_BODY" });
    }

    const { orderId, recipientType, content } = parsed.data;

    try {
      const order = await dbStorage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ error: "Commande non trouvée", code: "NOT_FOUND" });
      }

      let senderType: "client" | "driver";
      let senderId: string | null;

      if (recipientType === "client") {
        senderType = "driver";
        senderId = order.assignedDriverId || null;
        if (!senderId) {
          return res.status(400).json({ error: "Aucun chauffeur assigné", code: "NO_DRIVER" });
        }
      } else {
        senderType = "client";
        senderId = order.clientId || null;
        if (!senderId) {
          return res.status(400).json({ error: "Client introuvable", code: "NO_CLIENT" });
        }
        if (!order.assignedDriverId) {
          return res.status(400).json({ error: "Aucun chauffeur assigné", code: "NO_DRIVER" });
        }
      }

      const message = await dbStorage.createMessage({
        orderId,
        senderId,
        senderType,
        content: content.substring(0, 1000),
      });

      const io = getIO();
      if (recipientType === "client") {
        io.to(`order:${orderId}`).emit("chat:message", { orderId, message });
        io.to(`order:${orderId}`).emit("chat:notification", {
          orderId,
          message,
          fromAdmin: true,
          senderName: "Support RAVE",
        });
        if (order.clientId) {
          await notifyClient(order.clientId, "💬 Message du support", content.substring(0, 1000), {
            type: "admin_message",
            orderId,
          });
        }
      } else {
        io.to(`driver:${order.assignedDriverId}`).emit("chat:message", { orderId, message });
        io.to(`order:${orderId}`).emit("chat:message", { orderId, message });
        io.to(`driver:${order.assignedDriverId}`).emit("chat:notification", {
          orderId,
          message,
          fromAdmin: true,
          senderName: "Support RAVE",
        });
        io.to(`order:${orderId}`).emit("chat:notification", {
          orderId,
          message,
          fromAdmin: true,
          senderName: "Support RAVE",
        });
        if (order.assignedDriverId) {
          await notifyDriver(order.assignedDriverId, "💬 Message du support", content.substring(0, 1000), {
            type: "admin_message",
            orderId,
          });
        }
      }

      return res.json({ message });
    } catch (error) {
      console.error("Admin send message error:", error);
      return res.status(500).json({ error: "Erreur serveur", code: "SERVER_ERROR" });
    }
  });

  app.delete("/api/admin/messages/order/:orderId", requireAdminAuth, async (req: AuthenticatedRequest, res) => {
    const orderId = req.params.orderId;
    if (!orderId) {
      return res.status(400).json({ error: "Commande invalide", code: "INVALID_ORDER" });
    }

    try {
      await dbStorage.deleteMessagesByOrderId(orderId);
      return res.json({ success: true });
    } catch (error) {
      console.error("Admin delete order messages error:", error);
      return res.status(500).json({ error: "Erreur serveur", code: "SERVER_ERROR" });
    }
  });

  app.post("/api/admin/messages/direct", requireAdminAuth, async (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      recipientType: z.enum(["client", "driver"]),
      recipientId: z.string().min(1),
      content: z.string().min(1).max(1000),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Paramètres invalides", code: "INVALID_BODY" });
    }

    const { recipientType, recipientId, content } = parsed.data;

    try {
      if (recipientType === "client") {
        const client = await dbStorage.getClient(recipientId);
        if (!client) {
          return res.status(404).json({ error: "Client introuvable", code: "NO_CLIENT" });
        }
        const message = await dbStorage.createSupportMessage({
          recipientType: "client",
          recipientId,
          senderType: "admin",
          content: content.substring(0, 1000),
        });
        await notifyClient(recipientId, "💬 Message du support", content.substring(0, 1000), {
          type: "support_message",
          recipientType: "client",
          url: "/support-chat",
        });
        return res.json({ message });
      } else {
        const driver = await dbStorage.getDriver(recipientId);
        if (!driver) {
          return res.status(404).json({ error: "Chauffeur introuvable", code: "NO_DRIVER" });
        }
        const message = await dbStorage.createSupportMessage({
          recipientType: "driver",
          recipientId,
          senderType: "admin",
          content: content.substring(0, 1000),
        });
        await notifyDriver(recipientId, "💬 Message du support", content.substring(0, 1000), {
          type: "support_message",
          recipientType: "driver",
          url: "/chauffeur/support-chat",
        });
        const io = getIO();
        io.to(`driver:${recipientId}`).emit("chat:notification", {
          message: { content: content.substring(0, 1000) },
          fromAdmin: true,
          senderName: "Support RAVE",
        });
        return res.json({ message });
      }
    } catch (error) {
      console.error("Admin direct message error:", error);
      return res.status(500).json({ error: "Erreur serveur", code: "SERVER_ERROR" });
    }
  });

  app.get("/api/admin/messages/support/conversations", requireAdminAuth, async (_req: AuthenticatedRequest, res) => {
    try {
      const conversations = await dbStorage.getSupportConversations();
      return res.json({ conversations });
    } catch (error) {
      console.error("Admin support conversations error:", error);
      return res.status(500).json({ error: "Erreur serveur", code: "SERVER_ERROR" });
    }
  });

  app.get("/api/admin/messages/support", requireAdminAuth, async (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      recipientType: z.enum(["client", "driver"]),
      recipientId: z.string().min(1),
    });

    const parsed = schema.safeParse({
      recipientType: req.query.recipientType,
      recipientId: req.query.recipientId,
    });

    if (!parsed.success) {
      return res.status(400).json({ error: "Paramètres invalides", code: "INVALID_QUERY" });
    }

    const { recipientType, recipientId } = parsed.data;

    try {
      const messages = await dbStorage.getSupportMessagesForRecipient(recipientType, recipientId);
      return res.json({ messages });
    } catch (error) {
      console.error("Admin support messages error:", error);
      return res.status(500).json({ error: "Erreur serveur", code: "SERVER_ERROR" });
    }
  });

  app.delete("/api/admin/messages/support", requireAdminAuth, async (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      recipientType: z.enum(["client", "driver"]),
      recipientId: z.string().min(1),
    });

    const parsed = schema.safeParse({
      recipientType: req.query.recipientType,
      recipientId: req.query.recipientId,
    });

    if (!parsed.success) {
      return res.status(400).json({ error: "Paramètres invalides", code: "INVALID_QUERY" });
    }

    const { recipientType, recipientId } = parsed.data;

    try {
      await dbStorage.deleteSupportMessagesForRecipient(recipientType, recipientId);
      return res.json({ success: true });
    } catch (error) {
      console.error("Admin delete support messages error:", error);
      return res.status(500).json({ error: "Erreur serveur", code: "SERVER_ERROR" });
    }
  });

  app.post("/api/admin/messages/resolve-order", requireAdminAuth, async (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      recipientType: z.enum(["client", "driver"]),
      recipientId: z.string().min(1),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Paramètres invalides", code: "INVALID_BODY" });
    }

    const { recipientType, recipientId } = parsed.data;
    const activeStatuses = ["pending", "accepted", "driver_enroute", "driver_arrived", "in_progress"];

    try {
      const ordersList =
        recipientType === "client"
          ? await dbStorage.getOrdersByClient(recipientId)
          : await dbStorage.getOrdersByDriver(recipientId);

      const activeOrders = ordersList.filter((order) => activeStatuses.includes(order.status));
      const latestOrder = activeOrders[0] ?? ordersList[0];

      if (!latestOrder) {
        return res.status(404).json({ error: "Aucune course trouvée", code: "NO_ORDER" });
      }

      const driver =
        latestOrder.assignedDriverId ? await dbStorage.getDriver(latestOrder.assignedDriverId) : null;
      const driverName = driver ? `${driver.firstName} ${driver.lastName}` : "Chauffeur";

      return res.json({
        orderId: latestOrder.id,
        clientId: latestOrder.clientId,
        driverId: latestOrder.assignedDriverId,
        clientName: latestOrder.clientName,
        driverName,
        orderStatus: latestOrder.status,
        isActive: activeStatuses.includes(latestOrder.status),
      });
    } catch (error) {
      console.error("Admin resolve order error:", error);
      return res.status(500).json({ error: "Erreur serveur", code: "SERVER_ERROR" });
    }
  });

  app.get("/api/admin/messages/orders", requireAdminAuth, async (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      recipientType: z.enum(["client", "driver"]),
      recipientId: z.string().min(1),
    });

    const parsed = schema.safeParse({
      recipientType: req.query.recipientType,
      recipientId: req.query.recipientId,
    });

    if (!parsed.success) {
      return res.status(400).json({ error: "Paramètres invalides", code: "INVALID_QUERY" });
    }

    const { recipientType, recipientId } = parsed.data;

    try {
      const ordersList =
        recipientType === "client"
          ? await dbStorage.getOrdersByClient(recipientId)
          : await dbStorage.getOrdersByDriver(recipientId);

      const driverIds = ordersList
        .map((order) => order.assignedDriverId)
        .filter((id): id is string => !!id);

      const driversList = driverIds.length
        ? await db.select().from(drivers).where(inArray(drivers.id, driverIds))
        : [];

      const driverMap = new Map(driversList.map((driver) => [driver.id, driver]));

      const ordersResponse = ordersList.map((order) => {
        const driver = order.assignedDriverId ? driverMap.get(order.assignedDriverId) : null;
        return {
          orderId: order.id,
          clientId: order.clientId,
          clientName: order.clientName,
          driverId: order.assignedDriverId,
          driverName: driver ? `${driver.firstName} ${driver.lastName}` : "Chauffeur",
          status: order.status,
          createdAt: order.createdAt,
        };
      });

      return res.json({ orders: ordersResponse });
    } catch (error) {
      console.error("Admin message orders error:", error);
      return res.status(500).json({ error: "Erreur serveur", code: "SERVER_ERROR" });
    }
  });

  // ============ CLIENTS ============
  
  app.get("/api/admin/clients", requireAdminAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const page = parseInt((req.query.page as string) || "1", 10);
      const limit = parseInt((req.query.limit as string) || "20", 10);
      const offset = (page - 1) * limit;

      const allClients = await db.select().from(clients).orderBy(desc(clients.createdAt));
      const total = allClients.length;
      const paginatedClients = allClients.slice(offset, offset + limit);

      return res.json({
        clients: paginatedClients,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      });
    } catch (error) {
      console.error("Get clients error:", error);
      return res.status(500).json({ error: "Erreur serveur", code: "SERVER_ERROR" });
    }
  });

  app.get("/api/admin/clients/:id", requireAdminAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const client = await dbStorage.getClient(req.params.id);
      if (!client) {
        return res.status(404).json({ error: "Client non trouvé", code: "NOT_FOUND" });
      }

      const clientOrders = await dbStorage.getOrdersByClient(client.id);

      return res.json({ client, commandes: clientOrders });
    } catch (error) {
      console.error("Get client error:", error);
      return res.status(500).json({ error: "Erreur serveur", code: "SERVER_ERROR" });
    }
  });

  // Supprimer un client complètement (avec toutes ses données)
  app.delete("/api/admin/clients/:id", requireAdminAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const clientId = req.params.id;
      
      // Vérifier que le client existe
      const client = await dbStorage.getClient(clientId);
      if (!client) {
        return res.status(404).json({ error: "Client non trouvé", code: "NOT_FOUND" });
      }

      // Supprimer le client et toutes ses données associées
      await dbStorage.deleteClient(clientId);

      console.log(`[Admin] Client ${clientId} (${client.firstName} ${client.lastName}) supprimé complètement`);
      
      return res.json({ success: true, message: "Client supprimé avec succès" });
    } catch (error) {
      console.error("Delete client error:", error);
      return res.status(500).json({ error: "Erreur serveur lors de la suppression", code: "SERVER_ERROR" });
    }
  });

  // ============ CHAUFFEURS ============
  
  // Créer un nouveau chauffeur avec mot de passe généré
  app.post("/api/admin/chauffeurs", requireAdminAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { firstName, lastName, phone, vehicleModel, vehicleColor, vehiclePlate } = req.body;

      if (!firstName || !lastName || !phone) {
        return res.status(400).json({
          error: "Prénom, nom et téléphone requis",
          code: "MISSING_FIELDS",
        });
      }

      const existingDriver = await db.select().from(drivers).where(eq(drivers.phone, phone)).limit(1);
      if (existingDriver.length > 0) {
        return res.status(400).json({
          error: "Un loueur avec ce numéro de téléphone existe déjà",
          code: "PHONE_EXISTS",
        });
      }

      // Code unique pour l'app Loueur (drivers.code) ET le portail (prestataires.code)
      let code: string;
      let codeExists = true;
      while (codeExists) {
        code = Math.floor(100000 + Math.random() * 900000).toString();
        const [existingDriverCode] = await db.select().from(drivers).where(eq(drivers.code, code)).limit(1);
        const [existingPrestataireCode] = await db.select().from(prestataires).where(eq(prestataires.code, code)).limit(1);
        codeExists = !!existingDriverCode || !!existingPrestataireCode;
      }

      const generatePassword = () => {
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        let password = "";
        for (let i = 0; i < 8; i++) {
          password += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return password;
      };
      const password = generatePassword();

      // Organisation liée (requis pour loueur_vehicles.prestataireId + catalogue)
      const [newPrestataire] = await db
        .insert(prestataires)
        .values({
          nom: `${firstName} ${lastName}`.trim(),
          type: "loueur_individuel",
          phone,
          code: code!,
          isActive: true,
        })
        .returning();

      const [newDriver] = await db
        .insert(drivers)
        .values({
          phone,
          code: code!,
          password,
          firstName,
          lastName,
          typeChauffeur: "patente",
          prestataireId: newPrestataire.id,
          vehicleModel: vehicleModel || null,
          vehicleColor: vehicleColor || null,
          vehiclePlate: vehiclePlate || null,
          isActive: true,
          cguAccepted: false,
          privacyPolicyRead: false,
        })
        .returning();

      console.log(`[Admin] Loueur créé: ${firstName} ${lastName} (${phone}) — code app ${code} — prestataire ${newPrestataire.id}`);

      return res.json({
        success: true,
        chauffeur: newDriver,
        prestataire: newPrestataire,
        code: code!,
        password,
        message: `Loueur créé. Code app: ${code}, Mot de passe: ${password}`,
      });
    } catch (error) {
      console.error("Create loueur error:", error);
      return res.status(500).json({ error: "Erreur serveur", code: "SERVER_ERROR" });
    }
  });
  
  app.get("/api/admin/chauffeurs", requireAdminAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const page = parseInt((req.query.page as string) || "1", 10);
      const limit = parseInt((req.query.limit as string) || "20", 10);
      const offset = (page - 1) * limit;

      // Récupérer tous les chauffeurs avec un LEFT JOIN sur prestataires pour avoir le nom
      const allDriversWithPrestataire = await db
        .select({
          id: drivers.id,
          firstName: drivers.firstName,
          lastName: drivers.lastName,
          phone: drivers.phone,
          typeChauffeur: drivers.typeChauffeur,
          prestataireId: drivers.prestataireId,
          prestataireName: prestataires.nom,
          vehicleModel: drivers.vehicleModel,
          vehicleColor: drivers.vehicleColor,
          vehiclePlate: drivers.vehiclePlate,
          photoUrl: drivers.photoUrl,
          isActive: drivers.isActive,
          createdAt: drivers.createdAt,
          code: drivers.code,
        })
        .from(drivers)
        .leftJoin(prestataires, eq(drivers.prestataireId, prestataires.id))
        .orderBy(desc(drivers.createdAt));
      
      const total = allDriversWithPrestataire.length;
      const paginatedDrivers = allDriversWithPrestataire.slice(offset, offset + limit);

      return res.json({
        chauffeurs: paginatedDrivers,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      });
    } catch (error) {
      console.error("Get chauffeurs error:", error);
      return res.status(500).json({ error: "Erreur serveur", code: "SERVER_ERROR" });
    }
  });

  app.get("/api/admin/chauffeurs/:id", requireAdminAuth, async (req: AuthenticatedRequest, res) => {
    try {
      let driver = await dbStorage.getDriver(req.params.id);
      if (!driver) {
        return res.status(404).json({ error: "Loueur introuvable", code: "NOT_FOUND" });
      }

      // Réparer les loueurs sans organisation (catalogue / véhicules)
      if (!driver.prestataireId) {
        const repairCode = driver.code || Math.floor(100000 + Math.random() * 900000).toString();
        const [org] = await db
          .insert(prestataires)
          .values({
            nom: `${driver.firstName} ${driver.lastName}`.trim(),
            type: "loueur_individuel",
            phone: driver.phone,
            code: repairCode,
            isActive: driver.isActive !== false,
          })
          .returning();
        await db.update(drivers).set({ prestataireId: org.id }).where(eq(drivers.id, driver.id));
        driver = await dbStorage.getDriver(driver.id);
        console.log(`[Admin] Loueur ${driver?.id} lié au prestataire ${org.id}`);
      }

      const driverOrders = await dbStorage.getOrdersByDriver(driver!.id);

      let prestataire = null;
      if (driver!.prestataireId) {
        const [p] = await db.select().from(prestataires).where(eq(prestataires.id, driver!.prestataireId)).limit(1);
        prestataire = p || null;
      }

      const vehicles = await db
        .select({
          id: loueurVehicles.id,
          plate: loueurVehicles.plate,
          pricePerDay: loueurVehicles.pricePerDay,
          availableForRental: loueurVehicles.availableForRental,
          isActive: loueurVehicles.isActive,
          customImageUrl: loueurVehicles.customImageUrl,
          modelName: vehicleModels.name,
          modelCategory: vehicleModels.category,
          modelImageUrl: vehicleModels.imageUrl,
          vehicleModelId: loueurVehicles.vehicleModelId,
        })
        .from(loueurVehicles)
        .leftJoin(vehicleModels, eq(loueurVehicles.vehicleModelId, vehicleModels.id))
        .where(eq(loueurVehicles.driverId, driver!.id))
        .orderBy(desc(loueurVehicles.createdAt));

      return res.json({
        chauffeur: driver,
        prestataire,
        vehicles,
        commandes: driverOrders,
      });
    } catch (error) {
      console.error("Get loueur error:", error);
      return res.status(500).json({ error: "Erreur serveur", code: "SERVER_ERROR" });
    }
  });

  // Activer/Désactiver un loueur (+ org liée pour le catalogue)
  app.patch("/api/admin/chauffeurs/:id/status", requireAdminAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { isActive } = req.body;
      const active = isActive === true;
      await db.update(drivers).set({ isActive: active }).where(eq(drivers.id, req.params.id));
      const updatedDriver = await dbStorage.getDriver(req.params.id);
      if (updatedDriver?.prestataireId) {
        await db
          .update(prestataires)
          .set({ isActive: active })
          .where(eq(prestataires.id, updatedDriver.prestataireId));
      }
      res.json({ success: true, chauffeur: updatedDriver });
    } catch (error) {
      console.error("Update loueur status error:", error);
      res.status(500).json({ error: "Erreur serveur", code: "SERVER_ERROR" });
    }
  });

  // Modifier le type de chauffeur (salarié/patenté)
  app.patch("/api/admin/chauffeurs/:id/type", requireAdminAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { typeChauffeur } = req.body;
      
      if (!typeChauffeur || !["salarie", "patente"].includes(typeChauffeur)) {
        return res.status(400).json({ 
          error: "Type de chauffeur invalide. Valeurs acceptées: 'salarie', 'patente'", 
          code: "INVALID_TYPE" 
        });
      }
      
      await db.update(drivers)
        .set({ typeChauffeur })
        .where(eq(drivers.id, req.params.id));
      
      const updatedDriver = await dbStorage.getDriver(req.params.id);
      
      console.log(`[Admin] Type chauffeur ${req.params.id} mis à jour: ${typeChauffeur}`);
      
      res.json({ success: true, chauffeur: updatedDriver });
    } catch (error) {
      console.error("Update chauffeur type error:", error);
      res.status(500).json({ error: "Erreur serveur", code: "SERVER_ERROR" });
    }
  });

  // Modifier la photo de profil d'un chauffeur
  app.patch("/api/admin/chauffeurs/:id/photo", requireAdminAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { photoUrl } = req.body;
      
      if (!photoUrl || typeof photoUrl !== 'string') {
        return res.status(400).json({ 
          error: "URL de photo invalide.", 
          code: "INVALID_PHOTO_URL" 
        });
      }
      
      await db.update(drivers)
        .set({ photoUrl })
        .where(eq(drivers.id, req.params.id));
      
      const updatedDriver = await dbStorage.getDriver(req.params.id);
      
      console.log(`[Admin] Photo chauffeur ${req.params.id} mise à jour`);
      
      res.json({ success: true, chauffeur: updatedDriver });
    } catch (error) {
      console.error("Update chauffeur photo error:", error);
      res.status(500).json({ error: "Erreur serveur", code: "SERVER_ERROR" });
    }
  });

  // Supprimer un loueur complètement (véhicules, sessions, org liée)
  app.delete("/api/admin/chauffeurs/:id", requireAdminAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const driverId = req.params.id;

      const driver = await dbStorage.getDriver(driverId);
      if (!driver) {
        return res.status(404).json({ error: "Loueur introuvable", code: "NOT_FOUND" });
      }

      await dbStorage.deleteDriver(driverId);

      console.log(`[Admin] Loueur ${driverId} (${driver.firstName} ${driver.lastName}) supprimé`);

      return res.json({ success: true, message: "Loueur supprimé avec succès" });
    } catch (error: any) {
      console.error("Delete loueur error:", error);
      const detail = String(error?.message || error || "");
      return res.status(500).json({
        error: detail.includes("foreign key") || detail.includes("violates")
          ? "Impossible de supprimer : des données liées bloquent encore la suppression. Réessayez."
          : "Erreur serveur lors de la suppression du loueur",
        code: "SERVER_ERROR",
        detail: process.env.NODE_ENV === "development" ? detail : undefined,
      });
    }
  });

  // Modifier les informations du chauffeur (nom, téléphone, véhicule)
  app.patch("/api/admin/chauffeurs/:id/profile", requireAdminAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { firstName, lastName, phone, vehicleModel, vehicleColor, vehiclePlate } = req.body;
      
      const updateData: any = {};
      if (firstName !== undefined) updateData.firstName = firstName;
      if (lastName !== undefined) updateData.lastName = lastName;
      if (phone !== undefined) updateData.phone = phone;
      if (vehicleModel !== undefined) updateData.vehicleModel = vehicleModel;
      if (vehicleColor !== undefined) updateData.vehicleColor = vehicleColor;
      if (vehiclePlate !== undefined) updateData.vehiclePlate = vehiclePlate;
      
      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ 
          error: "Aucune donnée à mettre à jour", 
          code: "NO_DATA" 
        });
      }
      
      await db.update(drivers)
        .set(updateData)
        .where(eq(drivers.id, req.params.id));
      
      const updatedDriver = await dbStorage.getDriver(req.params.id);
      
      // Si le nom a changé, mettre à jour les sessions + org liée (catalogue)
      if ((firstName !== undefined || lastName !== undefined) && updatedDriver) {
        const newName = `${updatedDriver.firstName} ${updatedDriver.lastName}`;
        await dbStorage.updateDriverNameInDbSessions(req.params.id, newName);
        const { storage } = await import("./storage");
        await storage.updateDriverNameInSessions(req.params.id, newName);
        if (updatedDriver.prestataireId) {
          await db
            .update(prestataires)
            .set({ nom: newName.trim() })
            .where(eq(prestataires.id, updatedDriver.prestataireId));
        }
      }
      if (phone !== undefined && updatedDriver?.prestataireId) {
        await db
          .update(prestataires)
          .set({ phone })
          .where(eq(prestataires.id, updatedDriver.prestataireId));
      }
      
      console.log(`[Admin] Profil loueur ${req.params.id} mis à jour:`, updateData);
      
      res.json({ success: true, chauffeur: updatedDriver });
    } catch (error) {
      console.error("Update chauffeur profile error:", error);
      res.status(500).json({ error: "Erreur serveur", code: "SERVER_ERROR" });
    }
  });

  // ============ COMMANDES ============
  
  app.get("/api/admin/commandes", requireAdminAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const page = parseInt((req.query.page as string) || "1", 10);
      const limit = parseInt((req.query.limit as string) || "20", 10);
      const offset = (page - 1) * limit;
      const status = req.query.status as string;

      let query = db.select().from(orders);
      if (status) {
        query = query.where(eq(orders.status, status)) as typeof query;
      }

      const allOrders = await query.orderBy(desc(orders.createdAt));
      const total = allOrders.length;
      const paginatedOrders = allOrders.slice(offset, offset + limit);

      return res.json({
        commandes: paginatedOrders,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      });
    } catch (error) {
      console.error("Get commandes error:", error);
      return res.status(500).json({ error: "Erreur serveur", code: "SERVER_ERROR" });
    }
  });

  app.get("/api/admin/commandes/:id", requireAdminAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const order = await dbStorage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ error: "Commande non trouvée", code: "NOT_FOUND" });
      }

      let client = null;
      let driver = null;
      let prestataire = null;

      if (order.clientId) {
        client = await dbStorage.getClient(order.clientId);
      }
      if (order.assignedDriverId) {
        driver = await dbStorage.getDriver(order.assignedDriverId);
        // Récupérer le prestataire si le chauffeur en a un
        if (driver?.prestataireId) {
          const [p] = await db.select().from(prestataires).where(eq(prestataires.id, driver.prestataireId));
          prestataire = p ? { id: p.id, nom: p.nom, type: p.type } : null;
        }
      }

      // Config frais et tarif attente (pour détail paiement prestataire)
      const fraisConfig = await dbStorage.getFraisServiceConfig();
      const fraisServicePercent = fraisConfig?.fraisServicePrestataire ?? 15;
      let waitingRatePerMin = 42;
      try {
        const [waitingTarif] = await db.select().from(tarifs).where(and(eq(tarifs.actif, true), eq(tarifs.typeTarif, "minute_arret"))).limit(1);
        if (waitingTarif?.prixXpf) waitingRatePerMin = waitingTarif.prixXpf;
      } catch { /* fallback 42 */ }
      const freeMinutes = 0;

      // Récupérer les ratings du client et du chauffeur pour cette commande
      const [clientRating, driverRating] = await Promise.all([
        dbStorage.getRatingByOrderAndRater(req.params.id, 'client'),
        dbStorage.getRatingByOrderAndRater(req.params.id, 'driver'),
      ]);

      return res.json({ 
        commande: order, 
        client, 
        chauffeur: driver,
        prestataire,
        waitingRatePerMin,
        freeMinutes,
        fraisServicePercent,
        fraisConfig: fraisConfig ? { fraisServicePrestataire: fraisConfig.fraisServicePrestataire, commissionPrestataire: fraisConfig.commissionPrestataire } : null,
        ratings: {
          client: clientRating, // Rating donné par le client (sur le chauffeur)
          chauffeur: driverRating, // Rating donné par le chauffeur (sur le client)
        }
      });
    } catch (error) {
      console.error("Get commande error:", error);
      return res.status(500).json({ error: "Erreur serveur", code: "SERVER_ERROR" });
    }
  });

  // Mettre à jour le statut d'une commande
  app.patch("/api/admin/commandes/:id/statut", requireAdminAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { status } = req.body;
      const validStatuses = [
        "pending",
        "accepted",
        "driver_enroute",
        "driver_arrived",
        "in_progress",
        "completed",
        "payment_pending",
        "payment_confirmed",
        "cancelled",
        "booked",
        "contract_signed",
      ];

      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: "Statut invalide", code: "INVALID_STATUS" });
      }

      const updatedOrder = await dbStorage.updateOrderStatus(req.params.id, status);
      if (!updatedOrder) {
        return res.status(404).json({ error: "Commande non trouvée", code: "NOT_FOUND" });
      }

      return res.json(updatedOrder);
    } catch (error) {
      console.error("Update commande statut error:", error);
      return res.status(500).json({ error: "Erreur serveur", code: "SERVER_ERROR" });
    }
  });

  // ============ TARIFS ============
  
  app.get("/api/admin/tarifs", requireAdminAuth, async (_req: AuthenticatedRequest, res) => {
    try {
      const allTarifs = await db.select().from(tarifs).orderBy(desc(tarifs.createdAt));
      return res.json(allTarifs);
    } catch (error) {
      console.error("Get tarifs error:", error);
      // Si la table n'existe pas encore, retourner un tableau vide
      if (error instanceof Error && error.message.includes('does not exist')) {
        return res.json([]);
      }
      return res.status(500).json({ error: "Erreur serveur", code: "SERVER_ERROR" });
    }
  });

  app.get("/api/admin/tarifs/:id", requireAdminAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const tarif = await dbStorage.getTarif(req.params.id);
      if (!tarif) {
        return res.status(404).json({ error: "Tarif non trouvé", code: "NOT_FOUND" });
      }
      return res.json(tarif);
    } catch (error) {
      console.error("Get tarif error:", error);
      return res.status(500).json({ error: "Erreur serveur", code: "SERVER_ERROR" });
    }
  });

  app.post("/api/admin/tarifs", requireAdminAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { nom, typeTarif, prixXpf, heureDebut, heureFin } = req.body;
      
      if (!nom || !typeTarif || prixXpf === undefined) {
        return res.status(400).json({ error: "Nom, type et prix requis", code: "MISSING_FIELDS" });
      }

      const newTarif = await dbStorage.createTarif({
        nom,
        typeTarif,
        prixXpf: parseFloat(prixXpf),
        heureDebut: heureDebut || null,
        heureFin: heureFin || null,
      });

      return res.json(newTarif);
    } catch (error) {
      console.error("Create tarif error:", error);
      return res.status(500).json({ error: "Erreur serveur", code: "SERVER_ERROR" });
    }
  });

  app.patch("/api/admin/tarifs/:id", requireAdminAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { nom, typeTarif, prixXpf, heureDebut, heureFin, actif } = req.body;
      
      const updateData: any = {};
      if (nom !== undefined) updateData.nom = nom;
      if (typeTarif !== undefined) updateData.typeTarif = typeTarif;
      if (prixXpf !== undefined) updateData.prixXpf = parseFloat(prixXpf);
      if (heureDebut !== undefined) updateData.heureDebut = heureDebut;
      if (heureFin !== undefined) updateData.heureFin = heureFin;
      if (actif !== undefined) updateData.actif = actif;

      const updated = await dbStorage.updateTarif(req.params.id, updateData);
      if (!updated) {
        return res.status(404).json({ error: "Tarif non trouvé", code: "NOT_FOUND" });
      }

      return res.json(updated);
    } catch (error) {
      console.error("Update tarif error:", error);
      return res.status(500).json({ error: "Erreur serveur", code: "SERVER_ERROR" });
    }
  });

  app.delete("/api/admin/tarifs/:id", requireAdminAuth, async (req: AuthenticatedRequest, res) => {
    try {
      await dbStorage.deleteTarif(req.params.id);
      return res.json({ success: true });
    } catch (error) {
      console.error("Delete tarif error:", error);
      return res.status(500).json({ error: "Erreur serveur", code: "SERVER_ERROR" });
    }
  });

  app.get("/api/admin/supplements", requireAdminAuth, async (_req: AuthenticatedRequest, res) => {
    try {
      const allSupplements = await db.select().from(supplements);
      return res.json(allSupplements);
    } catch (error) {
      console.error("Get supplements error:", error);
      if (error instanceof Error && error.message.includes('does not exist')) {
        return res.json([]);
      }
      return res.status(500).json({ error: "Erreur serveur", code: "SERVER_ERROR" });
    }
  });

  app.get("/api/admin/supplements/:id", requireAdminAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const [supplement] = await db.select().from(supplements).where(eq(supplements.id, req.params.id));
      if (!supplement) {
        return res.status(404).json({ error: "Supplément non trouvé", code: "NOT_FOUND" });
      }
      return res.json(supplement);
    } catch (error) {
      console.error("Get supplement error:", error);
      return res.status(500).json({ error: "Erreur serveur", code: "SERVER_ERROR" });
    }
  });

  app.post("/api/admin/supplements", requireAdminAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { nom, description, prixXpf, typeSupplement } = req.body;
      
      if (!nom || prixXpf === undefined) {
        return res.status(400).json({ error: "Nom et prix requis", code: "MISSING_FIELDS" });
      }

      const newSupplement = await dbStorage.createSupplement({
        nom,
        description: description || null,
        prixXpf: parseFloat(prixXpf),
        typeSupplement: typeSupplement || 'fixe',
      });

      return res.json(newSupplement);
    } catch (error) {
      console.error("Create supplement error:", error);
      return res.status(500).json({ error: "Erreur serveur", code: "SERVER_ERROR" });
    }
  });

  app.patch("/api/admin/supplements/:id", requireAdminAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { nom, description, prixXpf, typeSupplement, actif } = req.body;
      
      const updateData: any = {};
      if (nom !== undefined) updateData.nom = nom;
      if (description !== undefined) updateData.description = description;
      if (prixXpf !== undefined) updateData.prixXpf = parseFloat(prixXpf);
      if (typeSupplement !== undefined) updateData.typeSupplement = typeSupplement;
      if (actif !== undefined) updateData.actif = actif;

      const updated = await dbStorage.updateSupplement(req.params.id, updateData);
      if (!updated) {
        return res.status(404).json({ error: "Supplément non trouvé", code: "NOT_FOUND" });
      }

      return res.json(updated);
    } catch (error) {
      console.error("Update supplement error:", error);
      return res.status(500).json({ error: "Erreur serveur", code: "SERVER_ERROR" });
    }
  });

  app.delete("/api/admin/supplements/:id", requireAdminAuth, async (req: AuthenticatedRequest, res) => {
    try {
      await dbStorage.deleteSupplement(req.params.id);
      return res.json({ success: true });
    } catch (error) {
      console.error("Delete supplement error:", error);
      return res.status(500).json({ error: "Erreur serveur", code: "SERVER_ERROR" });
    }
  });

  // ============ PAIEMENTS STRIPE ============
  
  app.get("/api/admin/stripe/payments", requireAdminAuth, async (_req: AuthenticatedRequest, res) => {
    try {
      const completedStatuses = ["completed", "payment_confirmed"];
      const completedOrders = await db
        .select()
        .from(orders)
        .where(inArray(orders.status, completedStatuses))
        .orderBy(desc(orders.createdAt));

      const orderIds = completedOrders.map((order) => order.id);
      const invoicesList = orderIds.length
        ? await db.select().from(invoices).where(inArray(invoices.orderId, orderIds))
        : [];
      const invoiceMap = new Map(invoicesList.map((inv) => [inv.orderId, inv]));

      const totalRevenue = completedOrders.reduce(
        (sum, order) => sum + Number(order.totalPrice),
        0
      );

      return res.json({
        payments: completedOrders.map((order) => {
          const invoice = invoiceMap.get(order.id);
          return {
            id: order.id,
            amount: order.totalPrice,
            currency: invoice?.currency || "XPF",
            status: order.status,
            createdAt: order.createdAt,
            pdfUrl: invoice?.pdfUrl || null,
            clientName: order.clientName,
            clientPhone: order.clientPhone,
            paymentMethod: order.paymentMethod,
          };
        }),
        totalRevenue,
        successfulPayments: completedOrders.length,
      });
    } catch (error) {
      console.error("Get stripe payments error:", error);
      return res.status(500).json({ error: "Erreur serveur", code: "SERVER_ERROR" });
    }
  });

  // ============ CAROUSEL / PUB IMAGES ============
  
  // Créer la table carousel_images si elle n'existe pas
  async function ensureCarouselTable() {
    try {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS carousel_images (
          id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid(),
          title TEXT NOT NULL,
          image_url TEXT NOT NULL,
          link_url TEXT,
          position INTEGER DEFAULT 0 NOT NULL,
          is_active BOOLEAN DEFAULT true NOT NULL,
          created_at TIMESTAMP DEFAULT NOW() NOT NULL,
          updated_at TIMESTAMP DEFAULT NOW() NOT NULL
        )
      `);
    } catch (error) {
      console.log("[Admin] Carousel table already exists or error:", error);
    }
  }
  
  // Appel initial pour créer la table
  ensureCarouselTable();
  
  // Récupérer toutes les images du carousel
  app.get("/api/admin/carousel", requireAdminAuth, async (_req: AuthenticatedRequest, res) => {
    try {
      const images = await db.select()
        .from(carouselImages)
        .orderBy(asc(carouselImages.position));
      
      return res.json({ images });
    } catch (error) {
      console.error("Get carousel images error:", error);
      return res.status(500).json({ error: "Erreur serveur", code: "SERVER_ERROR" });
    }
  });
  
  // API publique pour les apps client (sans auth)
  app.get("/api/carousel", async (_req, res) => {
    try {
      const images = await db.select()
        .from(carouselImages)
        .where(eq(carouselImages.isActive, true))
        .orderBy(asc(carouselImages.position));
      
      return res.json({ images });
    } catch (error) {
      console.error("Get public carousel images error:", error);
      return res.status(500).json({ error: "Erreur serveur", code: "SERVER_ERROR" });
    }
  });

  // ─── Options écran d'accueil client (3 icônes liées aux modèles catalogue) ───
  async function loadHomeCategoriesEnriched(activeOnly = false) {
    const selectFields = {
      id: homeCategories.id,
      label: homeCategories.label,
      priceRange: homeCategories.priceRange,
      model: homeCategories.model,
      imageUrl: homeCategories.imageUrl,
      vehicleModelId: homeCategories.vehicleModelId,
      position: homeCategories.position,
      isActive: homeCategories.isActive,
      updatedAt: homeCategories.updatedAt,
      vehicleModelName: vehicleModels.name,
      vehicleModelCategory: vehicleModels.category,
      vehicleModelImageUrl: vehicleModels.imageUrl,
    };

    const rows = activeOnly
      ? await db
          .select(selectFields)
          .from(homeCategories)
          .leftJoin(vehicleModels, eq(homeCategories.vehicleModelId, vehicleModels.id))
          .where(eq(homeCategories.isActive, true))
          .orderBy(asc(homeCategories.position))
      : await db
          .select(selectFields)
          .from(homeCategories)
          .leftJoin(vehicleModels, eq(homeCategories.vehicleModelId, vehicleModels.id))
          .orderBy(asc(homeCategories.position));

    return rows.map((row) => ({
      id: row.id,
      label: row.label,
      priceRange: row.priceRange,
      // Image = photo du modèle catalogue (admin Véhicules), sinon override legacy
      imageUrl: row.vehicleModelImageUrl || row.imageUrl || null,
      model: row.vehicleModelName || row.model || null,
      vehicleModelId: row.vehicleModelId,
      position: row.position,
      isActive: row.isActive,
      updatedAt: row.updatedAt,
      vehicleModel: row.vehicleModelId
        ? {
            id: row.vehicleModelId,
            name: row.vehicleModelName,
            category: row.vehicleModelCategory,
            imageUrl: row.vehicleModelImageUrl,
          }
        : null,
    }));
  }

  app.get("/api/home-categories", async (_req, res) => {
    try {
      const categories = await loadHomeCategoriesEnriched(true);
      return res.json({ categories });
    } catch (error) {
      console.error("Get home categories error:", error);
      return res.status(500).json({ error: "Erreur serveur", code: "SERVER_ERROR" });
    }
  });

  app.get("/api/admin/home-categories", requireAdminAuth, async (_req: AuthenticatedRequest, res) => {
    try {
      const categories = await loadHomeCategoriesEnriched(false);
      return res.json({ categories });
    } catch (error) {
      console.error("Admin get home categories error:", error);
      return res.status(500).json({ error: "Erreur serveur", code: "SERVER_ERROR" });
    }
  });

  app.patch("/api/admin/home-categories/:id", requireAdminAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const updates: Record<string, unknown> = { updatedAt: new Date() };

      if (req.body.label !== undefined) updates.label = req.body.label;
      if (req.body.priceRange !== undefined) updates.priceRange = req.body.priceRange;
      if (req.body.isActive !== undefined) updates.isActive = req.body.isActive;
      if (req.body.position !== undefined) updates.position = req.body.position;

      if (req.body.vehicleModelId !== undefined) {
        const modelId = req.body.vehicleModelId as string | null;
        if (modelId) {
          const [vm] = await db
            .select()
            .from(vehicleModels)
            .where(eq(vehicleModels.id, modelId));
          if (!vm) {
            return res.status(400).json({ error: "Modèle de véhicule introuvable" });
          }
          updates.vehicleModelId = vm.id;
          updates.model = vm.name;
          // L'image affichée vient du modèle ; on nettoie l'override legacy
          updates.imageUrl = null;
        } else {
          updates.vehicleModelId = null;
        }
      }

      if (Object.keys(updates).length <= 1) {
        return res.status(400).json({ error: "Aucune modification fournie" });
      }
      const [updated] = await db
        .update(homeCategories)
        .set(updates)
        .where(eq(homeCategories.id, id))
        .returning();
      if (!updated) {
        return res.status(404).json({ error: "Option introuvable" });
      }
      console.log(`[Admin] Home category updated: ${id}`, {
        vehicleModelId: updated.vehicleModelId,
      });
      const [enriched] = (await loadHomeCategoriesEnriched(false)).filter((c) => c.id === id);
      return res.json(enriched || updated);
    } catch (error) {
      console.error("Update home category error:", error);
      return res.status(500).json({ error: "Erreur serveur", code: "SERVER_ERROR" });
    }
  });
  
  // Ajouter une image au carousel
  app.post("/api/admin/carousel", requireAdminAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { title, imageUrl, linkUrl, position, isActive } = req.body;
      
      if (!title || !imageUrl) {
        return res.status(400).json({ 
          error: "Titre et URL de l'image requis", 
          code: "MISSING_FIELDS" 
        });
      }
      
      const [newImage] = await db.insert(carouselImages).values({
        title,
        imageUrl,
        linkUrl: linkUrl || null,
        position: position || 0,
        isActive: isActive !== false,
      }).returning();
      
      console.log(`[Admin] Image carousel ajoutée: ${title}`);
      
      return res.json({ success: true, image: newImage });
    } catch (error) {
      console.error("Create carousel image error:", error);
      return res.status(500).json({ error: "Erreur serveur", code: "SERVER_ERROR" });
    }
  });
  
  // Modifier une image du carousel
  app.patch("/api/admin/carousel/:id", requireAdminAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { title, imageUrl, linkUrl, position, isActive } = req.body;
      
      const updateData: any = { updatedAt: new Date() };
      if (title !== undefined) updateData.title = title;
      if (imageUrl !== undefined) updateData.imageUrl = imageUrl;
      if (linkUrl !== undefined) updateData.linkUrl = linkUrl;
      if (position !== undefined) updateData.position = position;
      if (isActive !== undefined) updateData.isActive = isActive;
      
      const [updated] = await db.update(carouselImages)
        .set(updateData)
        .where(eq(carouselImages.id, req.params.id))
        .returning();
      
      if (!updated) {
        return res.status(404).json({ error: "Image non trouvée", code: "NOT_FOUND" });
      }
      
      console.log(`[Admin] Image carousel ${req.params.id} mise à jour`);
      
      return res.json({ success: true, image: updated });
    } catch (error) {
      console.error("Update carousel image error:", error);
      return res.status(500).json({ error: "Erreur serveur", code: "SERVER_ERROR" });
    }
  });
  
  // Supprimer une image du carousel
  app.delete("/api/admin/carousel/:id", requireAdminAuth, async (req: AuthenticatedRequest, res) => {
    try {
      await db.delete(carouselImages).where(eq(carouselImages.id, req.params.id));
      
      console.log(`[Admin] Image carousel ${req.params.id} supprimée`);
      
      return res.json({ success: true });
    } catch (error) {
      console.error("Delete carousel image error:", error);
      return res.status(500).json({ error: "Erreur serveur", code: "SERVER_ERROR" });
    }
  });

  // ============================================================================
  // ROUTE DE TEST - Créer un client de test sans vérification SMS
  // ============================================================================
  
  // Route pour forcer la vérification d'un client existant
  app.get("/api/admin/verify-test-client", async (_req, res) => {
    try {
      const testPhone = "+68912345678";
      
      const client = await dbStorage.getClientByPhone(testPhone);
      if (!client) {
        return res.status(404).json({ error: "Client non trouvé. Créez-le d'abord via /api/admin/create-test-client" });
      }
      
      // Forcer la vérification
      await dbStorage.updateClientVerified(client.id, true);
      
      console.log(`[Admin] Client ${testPhone} forcé comme vérifié`);
      
      return res.json({ 
        success: true, 
        message: "✅ Client marqué comme VÉRIFIÉ. Vous pouvez maintenant vous connecter.",
        credentials: {
          phone: testPhone,
          password: "test123"
        }
      });
    } catch (error) {
      console.error("Verify test client error:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });

  // Route GET simple pour créer rapidement un client de test prédéfini
  app.get("/api/admin/create-test-client", async (_req, res) => {
    try {
      const testPhone = "+68912345678";
      const testPassword = "test123";
      const testFirstName = "Test";
      const testLastName = "Client";

      // Vérifier si le client existe déjà
      let existingClient = await dbStorage.getClientByPhone(testPhone);
      if (existingClient) {
        // S'assurer que le client est vérifié pour pouvoir se connecter sans SMS
        if (!existingClient.isVerified) {
          await dbStorage.updateClientVerified(existingClient.id, true);
          console.log(`[Admin] Client de test marqué comme vérifié: ${testPhone}`);
        }
        console.log(`[Admin] Client de test existe déjà: ${testPhone}`);
        return res.json({ 
          success: true, 
          client: {
            id: existingClient.id,
            phone: testPhone,
            firstName: existingClient.firstName,
            lastName: existingClient.lastName,
            password: testPassword,
            isVerified: true,
          },
          message: "✅ Client de test existant et vérifié. Utilisez ces identifiants pour vous connecter."
        });
      }

      // Créer le client de test
      const client = await dbStorage.createClient({
        phone: testPhone,
        password: testPassword,
        firstName: testFirstName,
        lastName: testLastName,
      });

      // Marquer le client comme vérifié immédiatement (pas besoin de SMS)
      await dbStorage.updateClientVerified(client.id, true);

      console.log(`[Admin] Client de test créé et vérifié: ${client.id} - ${testPhone}`);

      return res.json({ 
        success: true, 
        client: {
          id: client.id,
          phone: testPhone,
          firstName: client.firstName,
          lastName: client.lastName,
          password: testPassword,
          isVerified: true,
        },
        message: "✅ Client de test créé et vérifié. Utilisez ces identifiants pour vous connecter."
      });
    } catch (error) {
      console.error("Create test client error:", error);
      return res.status(500).json({ error: "Erreur serveur", code: "SERVER_ERROR" });
    }
  });

  app.post("/api/admin/test-client", requireAdminAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { phone, password, firstName, lastName } = req.body;

      if (!phone || !password || !firstName || !lastName) {
        return res.status(400).json({ 
          error: "Tous les champs sont requis: phone, password, firstName, lastName", 
          code: "MISSING_FIELDS" 
        });
      }

      // Vérifier si le client existe déjà
      const existingClient = await dbStorage.getClientByPhone(phone);
      if (existingClient) {
        // Retourner le client existant
        console.log(`[Admin] Client de test existe déjà: ${phone}`);
        return res.json({ 
          success: true, 
          client: {
            id: existingClient.id,
            phone: existingClient.phone,
            firstName: existingClient.firstName,
            lastName: existingClient.lastName,
          },
          message: "Client existant retourné"
        });
      }

      // Créer le client de test
      const client = await dbStorage.createClient({
        phone,
        password,
        firstName,
        lastName,
      });

      console.log(`[Admin] Client de test créé: ${client.id} - ${phone}`);

      return res.json({ 
        success: true, 
        client: {
          id: client.id,
          phone: client.phone,
          firstName: client.firstName,
          lastName: client.lastName,
        },
        message: "Client de test créé avec succès"
      });
    } catch (error) {
      console.error("Create test client error:", error);
      return res.status(500).json({ error: "Erreur serveur", code: "SERVER_ERROR" });
    }
  });

  // ============ GESTION DES PRESTATAIRES (Admin uniquement) ============

  // Liste tous les prestataires
  app.get("/api/admin/prestataires", requireAdminAuth, async (_req: AuthenticatedRequest, res) => {
    try {
      const allPrestataires = await db
        .select()
        .from(prestataires)
        .orderBy(desc(prestataires.createdAt));

      // Pour chaque prestataire, compter ses chauffeurs
      const prestatairesWithStats = await Promise.all(
        allPrestataires.map(async (p) => {
          const [driverCount] = await db
            .select({ count: count() })
            .from(drivers)
            .where(eq(drivers.prestataireId, p.id));
          
          return {
            ...p,
            createdAt: p.createdAt.toISOString(),
            totalChauffeurs: driverCount?.count || 0,
          };
        })
      );

      return res.json({ prestataires: prestatairesWithStats });
    } catch (error) {
      console.error("Error fetching prestataires:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });

  // Proxy pour télécharger un document avec le bon type (évite CORS et fichier générique)
  app.get("/api/admin/proxy-document", requireAdminAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const url = req.query.url as string;
      const filename = req.query.filename as string;
      if (!url || typeof url !== "string") {
        return res.status(400).json({ error: "URL manquante" });
      }
      if (!url.startsWith("https://res.cloudinary.com/")) {
        return res.status(400).json({ error: "URL non autorisée" });
      }
      const fetchRes = await fetch(url);
      if (!fetchRes.ok) {
        return res.status(502).json({ error: "Erreur lors du chargement du document" });
      }
      const contentType = fetchRes.headers.get("Content-Type") || "application/octet-stream";
      const buffer = Buffer.from(await fetchRes.arrayBuffer());
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${(filename || "document").replace(/"/g, "'")}"`);
      res.send(buffer);
    } catch (error) {
      console.error("Error proxying document:", error);
      res.status(500).json({ error: "Erreur serveur" });
    }
  });

  // Détails d'un prestataire
  app.get("/api/admin/prestataires/:id", requireAdminAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;

      const [prestataire] = await db
        .select()
        .from(prestataires)
        .where(eq(prestataires.id, id));

      if (!prestataire) {
        return res.status(404).json({ error: "Prestataire non trouvé" });
      }

      // Récupérer les chauffeurs du prestataire
      const prestataireDrivers = await db
        .select()
        .from(drivers)
        .where(eq(drivers.prestataireId, id))
        .orderBy(desc(drivers.createdAt));

      return res.json({
        prestataire: {
          ...prestataire,
          createdAt: prestataire.createdAt.toISOString(),
        },
        chauffeurs: prestataireDrivers.map(d => ({
          ...d,
          createdAt: d.createdAt.toISOString(),
        })),
      });
    } catch (error) {
      console.error("Error fetching prestataire:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });

  // Créer un prestataire
  app.post("/api/admin/prestataires", requireAdminAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { nom, type, numeroTahiti, email, phone } = req.body;

      if (!nom || !type) {
        return res.status(400).json({ error: "Nom et type requis" });
      }

      // Valider le type
      const validTypes = ["societe_taxi", "societe_tourisme", "patente_taxi", "patente_tourisme", "agence_location", "loueur_individuel"];
      if (!validTypes.includes(type)) {
        return res.status(400).json({ error: "Type invalide" });
      }

      // Générer un code 6 chiffres unique
      let code: string;
      let codeExists = true;
      while (codeExists) {
        code = Math.floor(100000 + Math.random() * 900000).toString();
        const [existing] = await db
          .select()
          .from(prestataires)
          .where(eq(prestataires.code, code));
        codeExists = !!existing;
      }

      // Créer le prestataire
      const [newPrestataire] = await db
        .insert(prestataires)
        .values({
          nom,
          type,
          numeroTahiti: numeroTahiti || null,
          email: email || null,
          phone: phone || null,
          code: code!,
          isActive: true,
        })
        .returning();

      // Si c'est un patenté ou loueur individuel, créer automatiquement le compte chauffeur/loueur
      let createdDriver = null;
      if (type === "patente_taxi" || type === "patente_tourisme" || type === "loueur_individuel") {
        // Générer un numéro de téléphone unique si non fourni
        const driverPhone = phone || `+689${code}`;
        
        // Vérifier si le téléphone existe déjà
        const [existingDriver] = await db
          .select()
          .from(drivers)
          .where(eq(drivers.phone, driverPhone));

        if (!existingDriver) {
          [createdDriver] = await db
            .insert(drivers)
            .values({
              phone: driverPhone,
              code: code!,
              firstName: nom.split(" ")[0] || nom,
              lastName: nom.split(" ").slice(1).join(" ") || "",
              typeChauffeur: "patente",
              prestataireId: newPrestataire.id,
              isActive: true,
            })
            .returning();
        }
      }

      console.log(`[Admin] Prestataire créé: ${newPrestataire.id} - ${nom} (${type})`);

      return res.json({
        success: true,
        prestataire: {
          ...newPrestataire,
          createdAt: newPrestataire.createdAt.toISOString(),
        },
        driver: createdDriver ? {
          ...createdDriver,
          createdAt: createdDriver.createdAt.toISOString(),
        } : null,
        code: code!,
      });
    } catch (error) {
      console.error("Error creating prestataire:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });

  // Modifier un prestataire
  app.patch("/api/admin/prestataires/:id", requireAdminAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const { nom, numeroTahiti, email, phone, isActive } = req.body;

      const updateData: any = {};
      if (nom !== undefined) updateData.nom = nom;
      if (numeroTahiti !== undefined) updateData.numeroTahiti = numeroTahiti;
      if (email !== undefined) updateData.email = email;
      if (phone !== undefined) updateData.phone = phone;
      if (isActive !== undefined) updateData.isActive = isActive;

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: "Aucune donnée à mettre à jour" });
      }

      const [updated] = await db
        .update(prestataires)
        .set(updateData)
        .where(eq(prestataires.id, id))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: "Prestataire non trouvé" });
      }

      // Sync app Loueur + sessions (nom / téléphone / statut)
      try {
        const { syncPrestataireToAppAccounts } = await import("./sync-prestataire-app");
        await syncPrestataireToAppAccounts({
          prestataireId: updated.id,
          nom: updateData.nom,
          phone: updateData.phone,
          isActive: updateData.isActive,
          matchCode: updated.code,
        });
      } catch (syncErr) {
        console.warn("[Admin] prestataire→driver sync failed:", syncErr);
      }

      console.log(`[Admin] Prestataire modifié: ${id}`);

      return res.json({
        success: true,
        prestataire: {
          ...updated,
          createdAt: updated.createdAt.toISOString(),
        },
      });
    } catch (error) {
      console.error("Error updating prestataire:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });

  // Supprimer un prestataire
  app.delete("/api/admin/prestataires/:id", requireAdminAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;

      // Récupérer le prestataire pour connaître son type
      const [prestataire] = await db
        .select()
        .from(prestataires)
        .where(eq(prestataires.id, id));

      if (!prestataire) {
        return res.status(404).json({ error: "Prestataire non trouvé" });
      }

      // Récupérer les chauffeurs du prestataire
      const prestataireDrivers = await db
        .select()
        .from(drivers)
        .where(eq(drivers.prestataireId, id));

      const isPatenté = prestataire.type === 'patente_taxi' || prestataire.type === 'patente_tourisme';

      // Pour les sociétés : si elles ont plus de 1 chauffeur, désactiver au lieu de supprimer
      if (!isPatenté && prestataireDrivers.length > 0) {
        const [updated] = await db
          .update(prestataires)
          .set({ isActive: false })
          .where(eq(prestataires.id, id))
          .returning();

        console.log(`[Admin] Prestataire société désactivé (a ${prestataireDrivers.length} chauffeurs): ${id}`);

        return res.json({
          success: true,
          message: `Prestataire désactivé (impossible de supprimer car il a ${prestataireDrivers.length} chauffeur(s))`,
          prestataire: {
            ...updated,
            createdAt: updated.createdAt.toISOString(),
          },
        });
      }

      // Pour les patentés : supprimer d'abord tous les chauffeurs associés (qui est le patenté lui-même)
      if (prestataireDrivers.length > 0) {
        console.log(`[Admin] Suppression de ${prestataireDrivers.length} chauffeur(s) du prestataire ${id}`);
        
        for (const driver of prestataireDrivers) {
          try {
            await dbStorage.deleteDriver(driver.id);
          } catch (err) {
            console.error(`[Admin] Erreur lors de la suppression du chauffeur ${driver.id}:`, err);
          }
        }
      }

      // Supprimer le prestataire
      await db.delete(prestataires).where(eq(prestataires.id, id));

      console.log(`[Admin] Prestataire supprimé: ${id} (${prestataire.type})`);

      return res.json({ success: true, message: "Prestataire supprimé avec succès" });
    } catch (error) {
      console.error("Error deleting prestataire:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });

  // ============ COLLECTE DE FRAIS (Admin) ============

  // Liste toutes les collectes de frais
  app.get("/api/admin/collecte", requireAdminAuth, async (_req: AuthenticatedRequest, res) => {
    try {
      const allCollecte = await db
        .select({
          collecte: collecteFrais,
          prestataire: prestataires,
          driver: drivers,
        })
        .from(collecteFrais)
        .leftJoin(prestataires, eq(collecteFrais.prestataireId, prestataires.id))
        .leftJoin(drivers, eq(collecteFrais.driverId, drivers.id))
        .orderBy(desc(collecteFrais.createdAt));

      // Récupérer la config pour recalculer les montants des collectes non payées
      const fraisConfig = await dbStorage.getFraisServiceConfig();
      const fraisServicePercent = fraisConfig?.fraisServicePrestataire || 15;
      const commissionPrestatairePercent = fraisConfig?.commissionPrestataire || 0;

      // Recalculer les montants pour les collectes non payées
      const collectesWithRecalc = await Promise.all(allCollecte.map(async (c) => {
        let montantDu = c.collecte.montantDu;
        let fraisService = c.collecte.fraisService || 0;
        let commissionSupplementaire = c.collecte.commissionSupplementaire || 0;

        // Si la collecte n'est pas payée, recalculer en temps réel
        if (!c.collecte.isPaid) {
          const orderIds = (c.collecte.orderIds as string[]) || [];
          let totalFrais = 0;
          let totalCommission = 0;

          for (const orderId of orderIds) {
            const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
            if (order) {
              totalFrais += Math.round(order.totalPrice * fraisServicePercent / 100);
              totalCommission += Math.round(order.totalPrice * commissionPrestatairePercent / 100);
            }
          }

          fraisService = totalFrais;
          commissionSupplementaire = totalCommission;
          montantDu = totalFrais + totalCommission;
        }

        return {
          ...c.collecte,
          montantDu,
          fraisService,
          commissionSupplementaire,
          createdAt: c.collecte.createdAt.toISOString(),
          paidAt: c.collecte.paidAt?.toISOString() || null,
          markedByAdminAt: c.collecte.markedByAdminAt?.toISOString() || null,
          prestataire: c.prestataire ? {
            id: c.prestataire.id,
            nom: c.prestataire.nom,
            type: c.prestataire.type,
          } : null,
          driver: c.driver ? {
            id: c.driver.id,
            firstName: c.driver.firstName,
            lastName: c.driver.lastName,
          } : null,
        };
      }));

      return res.json({
        collectes: collectesWithRecalc,
      });
    } catch (error) {
      console.error("Error fetching collecte:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });

  // Détails d'une collecte (avec les courses)
  app.get("/api/admin/collecte/:id", requireAdminAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;

      const [collecte] = await db
        .select()
        .from(collecteFrais)
        .where(eq(collecteFrais.id, id));

      if (!collecte) {
        return res.status(404).json({ error: "Collecte non trouvée" });
      }

      // Récupérer le prestataire
      let prestataire = null;
      if (collecte.prestataireId) {
        const [p] = await db.select().from(prestataires).where(eq(prestataires.id, collecte.prestataireId));
        prestataire = p ? { id: p.id, nom: p.nom, type: p.type } : null;
      }

      // Récupérer le chauffeur
      let driver = null;
      if (collecte.driverId) {
        const [d] = await db.select().from(drivers).where(eq(drivers.id, collecte.driverId));
        driver = d ? { id: d.id, firstName: d.firstName, lastName: d.lastName } : null;
      }

      // Récupérer les courses associées
      const orderIds = (collecte.orderIds as string[]) || [];
      const coursesDetails = [];

      // Récupérer la config des frais et commissions
      const fraisConfig = await dbStorage.getFraisServiceConfig();
      const fraisServicePercent = fraisConfig?.fraisServicePrestataire || 15;
      const commissionPrestatairePercent = fraisConfig?.commissionPrestataire || 0;

      let totalFraisService = 0;
      let totalCommissionSupplementaire = 0;

      for (const orderId of orderIds) {
        const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
        if (order) {
          // Calculer séparément les frais de service et la commission supplémentaire
          const fraisService = Math.round(order.totalPrice * fraisServicePercent / 100);
          const commissionSupplementaire = Math.round(order.totalPrice * commissionPrestatairePercent / 100);
          const commission = fraisService + commissionSupplementaire;
          
          totalFraisService += fraisService;
          totalCommissionSupplementaire += commissionSupplementaire;
          
          coursesDetails.push({
            id: order.id,
            date: order.createdAt.toISOString(),
            clientName: order.clientName,
            totalPrice: order.totalPrice,
            driverEarnings: order.driverEarnings,
            commission,
            fraisService,
            commissionSupplementaire,
            paymentMethod: order.paymentMethod,
            status: order.status,
          });
        }
      }

      // Si la collecte n'est pas payée, utiliser les montants recalculés
      const collecteData = {
        ...collecte,
        fraisService: collecte.isPaid ? (collecte.fraisService || 0) : totalFraisService,
        commissionSupplementaire: collecte.isPaid ? (collecte.commissionSupplementaire || 0) : totalCommissionSupplementaire,
        montantDu: collecte.isPaid ? collecte.montantDu : (totalFraisService + totalCommissionSupplementaire),
        createdAt: collecte.createdAt.toISOString(),
        paidAt: collecte.paidAt?.toISOString() || null,
        markedByAdminAt: collecte.markedByAdminAt?.toISOString() || null,
      };

      return res.json({
        collecte: collecteData,
        prestataire,
        driver,
        courses: coursesDetails,
      });
    } catch (error) {
      console.error("Error fetching collecte details:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });

  // Marquer une collecte comme payée
  app.patch("/api/admin/collecte/:id/paid", requireAdminAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const { montantPaye } = req.body;

      const [updated] = await db
        .update(collecteFrais)
        .set({
          isPaid: true,
          montantPaye: montantPaye || 0,
          paidAt: new Date(),
          markedByAdminAt: new Date(),
        })
        .where(eq(collecteFrais.id, id))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: "Collecte non trouvée" });
      }

      console.log(`[Admin] Collecte marquée payée: ${id}`);

      return res.json({
        success: true,
        collecte: {
          ...updated,
          createdAt: updated.createdAt.toISOString(),
          paidAt: updated.paidAt?.toISOString() || null,
          markedByAdminAt: updated.markedByAdminAt?.toISOString() || null,
        },
      });
    } catch (error) {
      console.error("Error marking collecte paid:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });

  // Recalculer les collecteFrais à partir des courses existantes
  app.post("/api/admin/collecte/recalculate", requireAdminAuth, async (_req: AuthenticatedRequest, res) => {
    try {
      console.log("[Admin] Recalculating collecteFrais from existing orders...");

      // ÉTAPE 1: Supprimer toutes les entrées NON PAYÉES (on recalcule depuis zéro)
      await db
        .delete(collecteFrais)
        .where(eq(collecteFrais.isPaid, false));
      
      console.log("[Admin] Deleted all unpaid collecteFrais entries");

      // ÉTAPE 2: Récupérer toutes les courses terminées (payment_confirmed)
      const completedOrders = await db
        .select()
        .from(orders)
        .where(eq(orders.status, "payment_confirmed"));

      // ÉTAPE 3: Récupérer la config des frais et commissions UNE SEULE FOIS
      const fraisConfig = await dbStorage.getFraisServiceConfig();
      const fraisServicePercent = fraisConfig?.fraisServicePrestataire || 15;
      const commissionPrestatairePercent = fraisConfig?.commissionPrestataire || 0;
      
      // Grouper les courses par chauffeur et période
      const groupedData: Record<string, {
        prestataireId: string;
        driverId: string;
        periode: string;
        totalCommission: number;
        totalFraisService: number;
        totalCommissionSupplementaire: number;
        orderIds: string[];
      }> = {};

      let skipped = 0;

      for (const order of completedOrders) {
        if (!order.assignedDriverId) {
          skipped++;
          continue;
        }

        // Récupérer le chauffeur
        const [driver] = await db
          .select()
          .from(drivers)
          .where(eq(drivers.id, order.assignedDriverId));

        if (!driver || !driver.prestataireId) {
          skipped++;
          continue;
        }
        
        // Calculer séparément les frais de service et la commission supplémentaire
        const fraisService = Math.round(order.totalPrice * fraisServicePercent / 100);
        const commissionSupplementaire = Math.round(order.totalPrice * commissionPrestatairePercent / 100);
        const commission = fraisService + commissionSupplementaire;
        const periode = order.createdAt.toISOString().slice(0, 7); // "2026-01"
        const key = `${driver.prestataireId}_${order.assignedDriverId}_${periode}`;

        if (!groupedData[key]) {
          groupedData[key] = {
            prestataireId: driver.prestataireId,
            driverId: order.assignedDriverId,
            periode,
            totalCommission: 0,
            totalFraisService: 0,
            totalCommissionSupplementaire: 0,
            orderIds: [],
          };
        }

        groupedData[key].totalCommission += commission;
        groupedData[key].totalFraisService += fraisService;
        groupedData[key].totalCommissionSupplementaire += commissionSupplementaire;
        groupedData[key].orderIds.push(order.id);
      }

      // ÉTAPE 4: Créer les nouvelles entrées
      let created = 0;
      for (const data of Object.values(groupedData)) {
        await db.insert(collecteFrais).values({
          prestataireId: data.prestataireId,
          driverId: data.driverId,
          periode: data.periode,
          montantDu: data.totalCommission,
          fraisService: data.totalFraisService,
          commissionSupplementaire: data.totalCommissionSupplementaire,
          montantPaye: 0,
          orderIds: data.orderIds,
          isPaid: false,
        });
        created++;
      }

      const totalCourses = Object.values(groupedData).reduce((sum, d) => sum + d.orderIds.length, 0);
      const totalCommission = Object.values(groupedData).reduce((sum, d) => sum + d.totalCommission, 0);

      console.log(`[Admin] CollecteFrais recalculated: ${created} entries, ${totalCourses} courses, ${totalCommission} XPF total`);

      return res.json({
        success: true,
        message: `Recalcul terminé: ${created} entrées créées pour ${totalCourses} courses (${totalCommission.toLocaleString()} XPF)`,
        stats: { created, totalCourses, totalCommission, skipped },
      });
    } catch (error) {
      console.error("Error recalculating collecte:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });

  // ============================================================================
  // GESTION DES MODÈLES DE VÉHICULES (Admin)
  // ============================================================================

  // POST /api/admin/vehicles/sync-catalog — Importe tous les modèles de l'app Loueur
  app.post("/api/admin/vehicles/sync-catalog", requireAdminAuth, async (_req: AuthenticatedRequest, res) => {
    try {
      const result = await syncTahitiVehicleCatalog();
      return res.json({
        success: true,
        inserted: result.inserted,
        total: result.total,
        message:
          result.inserted > 0
            ? `${result.inserted} modèle(s) importé(s) depuis le catalogue Loueur (${result.total} au total).`
            : `Catalogue déjà à jour (${result.total} modèles).`,
      });
    } catch (error) {
      console.error("Error syncing vehicle catalog:", error);
      return res.status(500).json({ error: "Erreur lors de la synchronisation du catalogue" });
    }
  });

  // GET /api/admin/vehicles - Liste rapide (sans sync bloquant — utiliser POST sync-catalog)
  app.get("/api/admin/vehicles", requireAdminAuth, async (_req: AuthenticatedRequest, res) => {
    try {
      // Compteurs loueurs en une seule requête (évite timeout Render avec ~200 modèles)
      const countRows = await db
        .select({
          vehicleModelId: loueurVehicles.vehicleModelId,
          loueurCount: sql<number>`count(*)::int`,
        })
        .from(loueurVehicles)
        .where(eq(loueurVehicles.isActive, true))
        .groupBy(loueurVehicles.vehicleModelId);

      const countByModel = new Map<string, number>();
      for (const row of countRows) {
        if (row.vehicleModelId) countByModel.set(row.vehicleModelId, Number(row.loueurCount) || 0);
      }

      const models = await db
        .select()
        .from(vehicleModels)
        .orderBy(asc(vehicleModels.category), asc(vehicleModels.name));

      const modelsWithCounts = models.map((model) => ({
        ...model,
        loueurCount: countByModel.get(model.id) || 0,
      }));

      return res.json(modelsWithCounts);
    } catch (error) {
      console.error("Error fetching vehicle models:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });

  // GET /api/admin/vehicles/:id - Détails d'un modèle de véhicule
  app.get("/api/admin/vehicles/:id", requireAdminAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const [model] = await db
        .select()
        .from(vehicleModels)
        .where(eq(vehicleModels.id, id));

      if (!model) {
        return res.status(404).json({ error: "Modèle de véhicule introuvable" });
      }

      // Récupérer les véhicules loueurs liés à ce modèle
      const vehicles = await db
        .select({
          id: loueurVehicles.id,
          plate: loueurVehicles.plate,
          pricePerDay: loueurVehicles.pricePerDay,
          pricePerDayLongTerm: loueurVehicles.pricePerDayLongTerm,
          availableForRental: loueurVehicles.availableForRental,
          availableForDelivery: loueurVehicles.availableForDelivery,
          availableForLongTerm: loueurVehicles.availableForLongTerm,
          isActive: loueurVehicles.isActive,
          createdAt: loueurVehicles.createdAt,
          prestataireName: prestataires.nom,
          prestataireId: loueurVehicles.prestataireId,
        })
        .from(loueurVehicles)
        .leftJoin(prestataires, eq(loueurVehicles.prestataireId, prestataires.id))
        .where(eq(loueurVehicles.vehicleModelId, id))
        .orderBy(desc(loueurVehicles.createdAt));

      return res.json({ ...model, vehicles });
    } catch (error) {
      console.error("Error fetching vehicle model details:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });

  // POST /api/admin/vehicles - Créer un modèle de véhicule
  app.post("/api/admin/vehicles", requireAdminAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { name, category, imageUrl, description, seats, transmission, fuel } = req.body;

      if (!name || !category) {
        return res.status(400).json({ error: "Nom et catégorie requis" });
      }

      const validCategories = ["citadine", "berline", "suv", "pickup", "utilitaire", "premium", "autre"];
      if (!validCategories.includes(category)) {
        return res.status(400).json({ error: `Catégorie invalide (${validCategories.join(", ")})` });
      }

      const [newModel] = await db
        .insert(vehicleModels)
        .values({
          name,
          category,
          imageUrl: imageUrl || null,
          description: description || null,
          seats: seats || 5,
          transmission: transmission || "auto",
          fuel: fuel || "essence",
          isActive: true,
        })
        .returning();

      console.log(`[Admin] Vehicle model created: ${newModel.name} (${newModel.category}) image=${!!newModel.imageUrl}`);
      return res.status(201).json(newModel);
    } catch (error) {
      console.error("Error creating vehicle model:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });

  // PATCH /api/admin/vehicles/:id - Modifier un modèle de véhicule
  app.patch("/api/admin/vehicles/:id", requireAdminAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const updates: Record<string, any> = {};

      const allowedFields = ["name", "category", "imageUrl", "description", "seats", "transmission", "fuel", "isActive"];
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          // Map camelCase to schema fields
          if (field === "imageUrl") updates.imageUrl = req.body[field];
          else if (field === "isActive") updates.isActive = req.body[field];
          else updates[field] = req.body[field];
        }
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "Aucune modification fournie" });
      }

      const validCategories = ["citadine", "berline", "suv", "pickup", "utilitaire", "premium", "autre"];
      if (updates.category && !validCategories.includes(updates.category)) {
        return res.status(400).json({ error: `Catégorie invalide (${validCategories.join(", ")})` });
      }

      const [updated] = await db
        .update(vehicleModels)
        .set(updates)
        .where(eq(vehicleModels.id, id))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: "Modèle de véhicule introuvable" });
      }

      console.log(`[Admin] Vehicle model updated: ${updated.name}`);
      return res.json(updated);
    } catch (error) {
      console.error("Error updating vehicle model:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });

  // DELETE /api/admin/vehicles/:id - Supprimer un modèle de véhicule
  app.delete("/api/admin/vehicles/:id", requireAdminAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;

      // Vérifier s'il y a des véhicules loueurs actifs liés
      const [activeVehicles] = await db
        .select({ count: count() })
        .from(loueurVehicles)
        .where(and(
          eq(loueurVehicles.vehicleModelId, id),
          eq(loueurVehicles.isActive, true)
        ));

      if (activeVehicles && activeVehicles.count > 0) {
        return res.status(400).json({
          error: `Impossible de supprimer: ${activeVehicles.count} véhicule(s) loueur(s) actif(s) utilisent ce modèle. Désactivez-les d'abord.`,
        });
      }

      // Supprimer les véhicules loueurs inactifs liés
      await db
        .delete(loueurVehicles)
        .where(eq(loueurVehicles.vehicleModelId, id));

      const [deleted] = await db
        .delete(vehicleModels)
        .where(eq(vehicleModels.id, id))
        .returning();

      if (!deleted) {
        return res.status(404).json({ error: "Modèle de véhicule introuvable" });
      }

      console.log(`[Admin] Vehicle model deleted: ${deleted.name}`);
      return res.json({ success: true, message: `Modèle "${deleted.name}" supprimé` });
    } catch (error) {
      console.error("Error deleting vehicle model:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });
}
