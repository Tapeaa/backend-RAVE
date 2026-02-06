import type { Express } from "express";
import { createServer, type Server } from "http";
import { Server as SocketIOServer } from "socket.io";
import { randomBytes } from "crypto";
import webpush from "web-push";
import { z } from "zod";
import Stripe from "stripe";
import { storage } from "./storage";
import { verifyPassword, hashPassword, dbStorage } from "./db-storage";
import { db } from "./db";
import { insertOrderSchema, pushSubscriptionSchema, insertClientSchema, orders, driverSessions, drivers, collecteFrais, type Order, type OrderStatus, type DriverSession } from "@shared/schema";
import { eq } from "drizzle-orm";
import cookieParser from "cookie-parser";
import { driverNotifications, clientNotifications, notifyDriver, notifyClient, startClientLiveActivity, updateClientLiveActivity, endClientLiveActivity } from "./onesignal";
import { sendVerificationCode, verifyCode, isTwilioConfigured, sendSMSMessage } from "./twilio";
import { generateInvoicePDF } from "./pdf-generator";
import { sendSupportMessageNotification } from "./email";

/**
 * Helper function to get driver session with database fallback.
 * This ensures sessions survive server restarts on Render.
 * 
 * 1. First checks in-memory storage
 * 2. If not found, checks database
 * 3. If found in database, restores the session in memory with the same ID
 */
async function getDriverSessionWithFallback(sessionId: string): Promise<DriverSession | undefined> {
  // First, try in-memory storage
  let session = await storage.getDriverSession(sessionId);
  if (session) {
    return session;
  }
  
  // Not in memory - check database
  const dbSession = await dbStorage.getDbDriverSession(sessionId);
  if (!dbSession) {
    console.log(`[Session Fallback] Session ${sessionId} not found in memory or database`);
    return undefined;
  }
  
  console.log(`[Session Fallback] Session ${sessionId} found in database, restoring in memory for driver ${dbSession.driverName}`);
  
  // Restore the session in memory with the same ID from the database
  session = await storage.restoreDriverSession(
    sessionId,
    dbSession.driverId, 
    dbSession.driverName,
    dbSession.expiresAt
  );
  
  return session;
}

// Initialize Stripe (only if key is provided)
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_PUBLISHABLE_KEY = process.env.STRIPE_PUBLISHABLE_KEY || "";
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

// Google Elevation API (majoration hauteur)
const GOOGLE_ELEVATION_API_KEY =
  process.env.GOOGLE_ELEVATION_API_KEY ||
  process.env.GOOGLE_MAPS_API_KEY ||
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  "";
const HEIGHT_SURCHARGE_THRESHOLD_METERS = 250;
const HEIGHT_SURCHARGE_AMOUNT = 500;
const HEIGHT_SURCHARGE_ID = "height_surcharge";
const HEIGHT_SURCHARGE_NAME = "Majoration hauteur";

type LatLng = { lat: number; lng: number };

function getAddressByType(addresses: any[], type: "pickup" | "destination"): any | null {
  return Array.isArray(addresses) ? addresses.find((a) => a?.type === type) : null;
}

function extractLatLngFromAddress(address: any): LatLng | null {
  if (!address) return null;
  const lat = Number(address.lat);
  const lng = Number(address.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  return { lat, lng };
}

async function geocodeAddress(address: any): Promise<LatLng | null> {
  if (!GOOGLE_ELEVATION_API_KEY || !address) return null;

  const placeId = typeof address.placeId === "string" ? address.placeId : "";
  const value = typeof address.value === "string" ? address.value : "";
  if (!placeId && !value) return null;

  const query = placeId
    ? `place_id=${encodeURIComponent(placeId)}`
    : `address=${encodeURIComponent(value)}`;
  const url = `https://maps.googleapis.com/maps/api/geocode/json?${query}&key=${GOOGLE_ELEVATION_API_KEY}&language=fr&region=pf`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.warn("[Geocode] API error:", response.status, response.statusText);
      return null;
    }
    const data: any = await response.json();
    if (data.status !== "OK" || !Array.isArray(data.results) || data.results.length === 0) {
      console.warn("[Geocode] Unexpected response:", data.status, data.error_message);
      return null;
    }
    const location = data.results[0]?.geometry?.location;
    if (!location) return null;
    return { lat: Number(location.lat), lng: Number(location.lng) };
  } catch (error) {
    console.warn("[Geocode] Fetch failed:", error);
    return null;
  }
}

async function fetchElevations(coords: LatLng[]): Promise<number[]> {
  if (!GOOGLE_ELEVATION_API_KEY || coords.length === 0) {
    return [];
  }

  const locations = coords.map((c) => `${c.lat},${c.lng}`).join("|");
  const url = `https://maps.googleapis.com/maps/api/elevation/json?locations=${encodeURIComponent(
    locations
  )}&key=${GOOGLE_ELEVATION_API_KEY}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.warn("[Elevation] API error:", response.status, response.statusText);
      return [];
    }
    const data: any = await response.json();
    if (data.status !== "OK" || !Array.isArray(data.results)) {
      console.warn("[Elevation] Unexpected response:", data.status, data.error_message);
      return [];
    }
    return data.results
      .map((r: any) => Number(r?.elevation))
      .filter((e: number) => Number.isFinite(e));
  } catch (error) {
    console.warn("[Elevation] Fetch failed:", error);
    return [];
  }
}

// Validation schemas for profile updates
const updateClientProfileSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  // Accepte une chaîne vide et la transforme en null, sinon valide comme email
  email: z.string().transform(val => val === '' ? null : val).pipe(z.string().email().nullable()).optional(),
});

const updateDriverProfileSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  vehicleModel: z.string().max(100).optional().nullable(),
  vehicleColor: z.string().max(50).optional().nullable(),
  vehiclePlate: z.string().max(20).optional().nullable(),
});

// Configure web-push with VAPID keys
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:contact@tapea.pf";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  console.log("[PUSH] Web push configured with VAPID keys");
} else {
  console.warn("[PUSH] VAPID keys not configured - push notifications disabled");
}

// Function to send push notifications to all subscribed drivers
async function sendPushToAllDrivers(order: Order) {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.log("[PUSH] Skipping push - VAPID not configured");
    return;
  }
  
  const subscriptions = await storage.getAllPushSubscriptions();
  console.log(`[PUSH] Sending push notifications to ${subscriptions.length} drivers`);
  
  const pickupAddress = order.addresses.find(a => a.type === "pickup")?.value || "Adresse inconnue";
  
  const payload = JSON.stringify({
    title: "Nouvelle course disponible",
    body: `${order.clientName} - ${pickupAddress}`,
    url: "/chauffeur",
    orderId: order.id,
  });
  
  for (const driverSub of subscriptions) {
    try {
      await webpush.sendNotification(driverSub.subscription, payload);
      console.log(`[PUSH] Notification sent to driver ${driverSub.driverId}`);
    } catch (error: any) {
      console.error(`[PUSH] Failed to send to driver ${driverSub.driverId}:`, error.message);
      // If subscription is invalid (410 Gone), remove it
      if (error.statusCode === 410) {
        await storage.removePushSubscription(driverSub.driverId);
        console.log(`[PUSH] Removed invalid subscription for driver ${driverSub.driverId}`);
      }
    }
  }
}

// Socket.IO instance export for use in other modules
let io: SocketIOServer;

// Track payment confirmations (requires both driver and client to confirm)
const paymentConfirmations = new Map<string, { 
  driver: boolean; 
  client: boolean; 
  driverSocketId: string | null;
  clientSocketId: string | null;
}>();

// Track payments currently being processed to prevent duplicate charges
const paymentsInProgress = new Map<string, boolean>();

// Track client authentication tokens for each order (token generated at order creation)
const orderClientTokens = new Map<string, { token: string; socketId: string | null }>();
// Store latest driver locations for HTTP polling backup
const driverLocations = new Map<string, { lat: number; lng: number; heading: number; speed?: number; timestamp: number }>();
// Track last event emission times to prevent duplicate events on reconnection
const lastEventEmissions = new Map<string, number>();
// Store active paid stops for persistence (orderId -> { startTime, accumulatedSeconds })
const activePaidStops = new Map<string, { startTime: number; accumulatedSeconds: number }>();

// Generate a secure random token
function generateClientToken(): string {
  return randomBytes(16).toString('hex');
}

export function getIO(): SocketIOServer {
  return io;
}

export function getDriverLocations() {
  return driverLocations;
}

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  
  // Initialize Socket.IO with optimized settings for Render.com
  // Augmenter les timeouts pour éviter les déconnexions fréquentes
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    },
    // Configuration pour éviter les déconnexions fréquentes sur Render
    // Augmenter pingTimeout pour tolérer les micro-coupures réseau mobile
    pingTimeout: 120000, // 120 secondes (2 minutes) - temps d'attente avant de considérer la connexion morte
    // Réduire pingInterval pour envoyer des pings plus fréquents et détecter les problèmes plus tôt
    pingInterval: 20000, // 20 secondes - intervalle entre les pings (plus fréquent = détection plus rapide)
    transports: ['websocket', 'polling'], // Permettre les deux transports pour meilleure compatibilité
    allowEIO3: true, // Compatibilité avec les anciennes versions
    // Configuration pour les reconnexions
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
      skipMiddlewares: true,
    },
    // Configuration supplémentaire pour améliorer la stabilité
    maxHttpBufferSize: 1e8, // 100 MB
    serveClient: false, // Ne pas servir le client Socket.IO (pas nécessaire)
    // Désactiver les déconnexions automatiques pour les connexions inactives
    // (Render gère déjà les timeouts)
  });

  // Socket.IO connection handling
  io.on("connection", (socket) => {
    console.log(`Socket connected: ${socket.id}`);
    
    // Driver joins their session room
    socket.on("driver:join", async (data: { sessionId: string }, callback?: (ack: { success: boolean }) => void) => {
      console.log(`[DEBUG] driver:join received from socket ${socket.id}, sessionId: ${data.sessionId}`);
      // Use fallback to recover session from database if not in memory (after server restart)
      const session = await getDriverSessionWithFallback(data.sessionId);
      if (session) {
        await storage.addSocketToSession(data.sessionId, socket.id);
        socket.join(`driver:${session.driverId}`);
        // Note: Don't join drivers:online here - wait for driver:status with isOnline=true
        console.log(`Driver ${session.driverName} joined with socket ${socket.id} (waiting for status to go online)`);
        
        if (callback) callback({ success: true });
      } else {
        console.log(`[DEBUG] driver:join - session not found for ${data.sessionId}`);
        if (callback) callback({ success: false });
      }
    });
    
    // Client joins to track their order (requires valid client token)
    socket.on("client:join", (data: { orderId: string; clientToken?: string }) => {
      const tokenData = orderClientTokens.get(data.orderId);
      
      // Validate the client token
      if (!tokenData) {
        console.log(`Client socket ${socket.id} tried to join unknown order: ${data.orderId}`);
        socket.emit("client:join:error", { message: "Commande non trouvée" });
        return;
      }
      
      if (!data.clientToken || tokenData.token !== data.clientToken) {
        console.log(`Client socket ${socket.id} provided invalid token for order: ${data.orderId}`);
        socket.emit("client:join:error", { message: "Token client invalide" });
        return;
      }
      
      // Vérifier si le socket est déjà dans la room pour éviter les rejoins multiples
      const orderRoom = `order:${data.orderId}`;
      const room = io.sockets.adapter.rooms.get(orderRoom);
      const alreadyInRoom = room?.has(socket.id);
      
      if (alreadyInRoom && tokenData.socketId === socket.id) {
        // Déjà dans la room avec le bon socket, ne rien faire
        console.log(`Client socket ${socket.id} already in room ${orderRoom}, skipping rejoin`);
        return;
      }
      
      // Prevent token replay: only allow binding if not already bound to a different socket
      if (tokenData.socketId && tokenData.socketId !== socket.id) {
        // Check if the existing socket is still connected
        const existingSocket = io.sockets.sockets.get(tokenData.socketId);
        if (existingSocket && existingSocket.connected) {
          console.log(`Client socket ${socket.id} rejected: token already bound to ${tokenData.socketId}`);
          socket.emit("client:join:error", { message: "Session déjà active sur un autre appareil" });
          return;
        }
        // Existing socket is disconnected, allow rebinding
        console.log(`Client socket ${socket.id} rebinding token (old socket ${tokenData.socketId} disconnected)`);
      }
      
      // Register the authenticated socket
      tokenData.socketId = socket.id;
      orderClientTokens.set(data.orderId, tokenData);
      
      socket.join(orderRoom);
      console.log(`Client socket ${socket.id} authenticated and joined order room: ${data.orderId}`);
    });
    
    // Driver goes online/offline
    socket.on("driver:status", async (data: { sessionId: string; isOnline: boolean }) => {
      console.log(`[DEBUG] driver:status received from socket ${socket.id}, sessionId: ${data.sessionId}, isOnline: ${data.isOnline}`);
      const session = await storage.updateDriverOnlineStatus(data.sessionId, data.isOnline);
      if (session) {
        if (data.isOnline) {
          socket.join("drivers:online");
          // Debug: verify room membership
          const driversRoom = io.sockets.adapter.rooms.get("drivers:online");
          console.log(`[DEBUG] Driver ${session.driverName} joined drivers:online, room now has ${driversRoom?.size || 0} socket(s)`);
          
          // Send pending orders to the newly online driver
          const pendingOrders = await dbStorage.getPendingOrders();
          if (pendingOrders.length > 0) {
            socket.emit("orders:pending", pendingOrders);
            console.log(`[DEBUG] Sent ${pendingOrders.length} pending orders to driver ${session.driverName}`);
          }
        } else {
          socket.leave("drivers:online");
          console.log(`[DEBUG] Driver ${session.driverName} left drivers:online`);
        }
        console.log(`Driver ${session.driverName} is now ${data.isOnline ? 'online' : 'offline'}`);
      } else {
        console.log(`[DEBUG] driver:status - session not found for ${data.sessionId}`);
      }
    });
    
    // Driver accepts an order
    socket.on("order:accept", async (data: { orderId: string; sessionId: string }) => {
      console.log(`[DEBUG] order:accept received - orderId: ${data.orderId}, sessionId: ${data.sessionId}`);
      
      // Use fallback to recover session from database if not in memory (after server restart)
      const session = await getDriverSessionWithFallback(data.sessionId);
      const order = await dbStorage.getOrder(data.orderId);
      
      console.log(`[DEBUG] Session found: ${session ? session.driverName : 'NO'}, Order found: ${order ? 'YES' : 'NO'}, Order status: ${order?.status || 'N/A'}`);
      
      if (!session || !order) {
        console.log(`[DEBUG] order:accept:error - Session or order invalid`);
        socket.emit("order:accept:error", { message: "Session ou commande invalide" });
        return;
      }
      
      if (order.status !== "pending") {
        console.log(`[DEBUG] order:accept:error - Order status is ${order.status}, not pending`);
        socket.emit("order:accept:error", { message: "Cette commande n'est plus disponible" });
        return;
      }
      
      // Get driver info to determine type and calculate correct commission
      const driver = await dbStorage.getDriver(session.driverId);
      const driverType = driver?.typeChauffeur || "patente";
      
      // ═══════════════════════════════════════════════════════════════════════════
      // SALARIÉ TAPEA: Si c'est un salarié TAPEA (sans prestataireId), les frais de service sont OFFERTS
      // ═══════════════════════════════════════════════════════════════════════════
      const isSalarieTapea = driverType === 'salarie' && !driver?.prestataireId;
      let finalTotalPrice = order.totalPrice;
      let finalDriverEarnings = order.driverEarnings;
      let fraisServiceOfferts = false;
      
      // Récupérer le % de frais de service et commissions depuis la config
      const fraisServiceConfig = await dbStorage.getFraisServiceConfig();
      const fraisServicePercent = fraisServiceConfig?.fraisServicePrestataire || 15;
      const commissionSalarieTapea = fraisServiceConfig?.commissionSalarieTapea || 0;
      
      if (isSalarieTapea) {
        // Pour les salariés TAPEA, le prix inclut X% de frais de service qu'on doit retirer
        // Le prix affiché était: total = subtotal + X%
        // Donc subtotal = total / (1 + X/100)
        const prixOriginal = order.totalPrice; // Conserver le prix original AVANT réduction
        const subtotal = Math.round(order.totalPrice / (1 + fraisServicePercent / 100));
        const fraisServiceRetires = order.totalPrice - subtotal;
        
        finalTotalPrice = subtotal;
        // Appliquer la commission du salarié TAPEA sur le subtotal
        finalDriverEarnings = Math.round(subtotal * (commissionSalarieTapea / 100));
        fraisServiceOfferts = true;
        
        console.log(`[ORDER:ACCEPT] Salarié TAPEA detected! Frais de service offerts: ${fraisServiceRetires} XPF`);
        console.log(`[ORDER:ACCEPT] Prix original: ${order.totalPrice} -> Prix final: ${finalTotalPrice}`);
        console.log(`[ORDER:ACCEPT] Commission salarié: ${commissionSalarieTapea}%, Gains: ${subtotal} -> ${finalDriverEarnings} XPF`);
        
        // Mettre à jour le prix de la commande dans la base de données
        // ET stocker le prix initial dans rideOption pour référence ultérieure
        const updatedRideOption = {
          ...((order.rideOption as any) || {}),
          initialTotalPrice: prixOriginal, // Prix AVANT déduction des frais
          fraisServiceOfferts: true,
        };
        
        await db.update(orders).set({ 
          totalPrice: finalTotalPrice,
          driverEarnings: finalDriverEarnings,
          rideOption: updatedRideOption 
        }).where(eq(orders.id, data.orderId));
      } else {
        // Pour les chauffeurs prestataires, utiliser leur commission individuelle
        const driver = await dbStorage.getDriver(session.driverId);
        if (driver && driver.commissionChauffeur !== undefined && driver.commissionChauffeur !== null) {
          // Le driverEarnings est déjà le subtotal (prix sans frais service)
          // On applique la commission du chauffeur sur ce montant
          finalDriverEarnings = Math.round(order.driverEarnings * (driver.commissionChauffeur / 100));
          console.log(`[ORDER:ACCEPT] Recalculated driverEarnings for prestataire driver: ${order.driverEarnings} -> ${finalDriverEarnings} (${driver.commissionChauffeur}%)`);
        } else {
          console.warn("[ORDER:ACCEPT] Driver commission not set, using default 95%");
          finalDriverEarnings = Math.round(order.driverEarnings * 0.95);
        }
      }
      
      // ═══════════════════════════════════════════════════════════════════════════
      // RÉSERVATION À L'AVANCE: Déterminer le statut en fonction du type de commande
      // ═══════════════════════════════════════════════════════════════════════════
      const isAdvanceBooking = order.isAdvanceBooking === true;
      const newStatus = isAdvanceBooking ? "booked" : "accepted";
      console.log(`[ORDER:ACCEPT] isAdvanceBooking: ${isAdvanceBooking}, newStatus: ${newStatus}`);
      
      // Update order status with recalculated driverEarnings based on driver type
      // If status is driver_arrived, set driverArrivedAt
      let updatedOrder;
      if (newStatus === "driver_arrived") {
        updatedOrder = await dbStorage.updateOrderStatus(data.orderId, newStatus, session.driverId, undefined, new Date(), finalDriverEarnings);
      } else {
        updatedOrder = await dbStorage.updateOrderStatus(data.orderId, newStatus, session.driverId, undefined, undefined, finalDriverEarnings);
      }
      
      if (updatedOrder) {
        // Include the correct driverEarnings AND totalPrice (for Salarié TAPEA with reduced price)
        const orderWithCorrectEarnings = {
          ...updatedOrder,
          totalPrice: finalTotalPrice, // Prix réduit si salarié TAPEA
          driverEarnings: finalDriverEarnings
        };
        
        // Broadcast the status change to BOTH ride and order rooms for compatibility
        // (ride room for drivers, order room for clients)
        const statusPayload = {
          orderId: data.orderId,
          status: newStatus,
          orderStatus: updatedOrder.status,
          driverName: updatedOrder.clientName,
          totalPrice: fraisServiceOfferts ? finalTotalPrice : updatedOrder.totalPrice,
          driverEarnings: finalDriverEarnings,
          waitingTimeMinutes: updatedOrder.waitingTimeMinutes,
          driverArrivedAt: updatedOrder.driverArrivedAt,
          fraisServiceOfferts: fraisServiceOfferts, // Indique si les frais de service sont offerts
        };
        io.to(`ride:${data.orderId}`).emit("ride:status:changed", statusPayload);
        io.to(`order:${data.orderId}`).emit("ride:status:changed", statusPayload);
        
        // NOTE: L'événement frais:service:offerts est maintenant émis au DÉMARRAGE de la course (inprogress)
        // pas au moment de l'acceptation. Voir le handler ride:status pour l'émission.
        if (fraisServiceOfferts) {
          console.log(`[ORDER:ACCEPT] Frais de service offerts détectés pour ${data.orderId} - notification sera envoyée au démarrage de la course`);
        }
        
        // Notify all other drivers to remove this order
        socket.to("drivers:online").emit("order:taken", { orderId: data.orderId });
        
        const clientRoom = io.sockets.adapter.rooms.get(`order:${data.orderId}`);
        const clientSocketCount = clientRoom?.size || 0;
        
        if (isAdvanceBooking) {
          // ═══ RÉSERVATION À L'AVANCE: Comportement spécifique ═══
          console.log(`[ORDER:ACCEPT] Advance booking - orderId: ${data.orderId}, scheduledTime: ${order.scheduledTime}`);
          
          // Notify the accepting driver - ne pas rediriger vers course-en-cours
          socket.emit("order:booked:success", orderWithCorrectEarnings);
          
          // Notify the client that their booking has been confirmed
          console.log(`[ORDER:ACCEPT] Notifying client of booking confirmation - Room: order:${data.orderId}, Sockets in room: ${clientSocketCount}`);
          
          const bookingConfirmEventData = {
            orderId: data.orderId,
            driverName: session.driverName,
            driverId: session.driverId,
            sessionId: session.id,
            orderStatus: "booked",
            scheduledTime: order.scheduledTime,
            timestamp: Date.now()
          };
          
          // Broadcast to room
          io.to(`order:${data.orderId}`).emit("order:booking:confirmed", bookingConfirmEventData);
          
          // ═══ FALLBACK: Émission directe au socket client authentifié ═══
          // Si le client a un socket enregistré, on lui envoie directement
          const clientTokenData = orderClientTokens.get(data.orderId);
          if (clientTokenData?.socketId) {
            const clientSocket = io.sockets.sockets.get(clientTokenData.socketId);
            if (clientSocket && clientSocket.connected) {
              console.log(`[ORDER:ACCEPT] Direct emission to client socket: ${clientTokenData.socketId}`);
              clientSocket.emit("order:booking:confirmed", bookingConfirmEventData);
            } else {
              console.log(`[ORDER:ACCEPT] Client socket ${clientTokenData.socketId} not connected`);
            }
          } else {
            console.log(`[ORDER:ACCEPT] No client socket registered for order ${data.orderId}`);
          }
          
          // Send OneSignal push notification to client
          if (order.clientId) {
            const formattedDate = order.scheduledTime 
              ? new Date(order.scheduledTime).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Pacific/Tahiti' })
              : '';
            const formattedTime = order.scheduledTime
              ? new Date(order.scheduledTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Pacific/Tahiti' })
              : '';
            clientNotifications.bookingConfirmed?.(order.clientId, session.driverName, data.orderId, formattedDate, formattedTime);
          }
          
          console.log(`Advance booking ${data.orderId} confirmed by driver ${session.driverName} (${driverType}) - Scheduled: ${order.scheduledTime} - Earnings: ${finalDriverEarnings} XPF`);
        } else {
          // ═══ COURSE IMMÉDIATE: Comportement normal ═══
          // Notify the accepting driver with correct earnings
          socket.emit("order:accept:success", orderWithCorrectEarnings);
          
          // Notify the client that their order has been accepted
          console.log(`[ORDER:ACCEPT] Notifying client - Room: order:${data.orderId}, Sockets in room: ${clientSocketCount}`);
          
          // Emit the event with order status to help client sync
          io.to(`order:${data.orderId}`).emit("order:driver:assigned", {
            orderId: data.orderId,
            driverName: session.driverName,
            driverId: session.driverId,
            sessionId: session.id,
            orderStatus: "accepted",
            timestamp: Date.now()
          });
          
          // Send OneSignal push notification to client
          if (order.clientId) {
            clientNotifications.driverAccepted(order.clientId, session.driverName, data.orderId);
          }
          
          console.log(`Order ${data.orderId} accepted by driver ${session.driverName} (${driverType}) - Earnings: ${finalDriverEarnings} XPF`);
        }
      }
    });
    
    // Driver declines an order
    socket.on("order:decline", async (data: { orderId: string; sessionId: string }) => {
      console.log(`Driver declined order ${data.orderId}`);
      // Just acknowledge - order stays pending for other drivers
      socket.emit("order:decline:success", { orderId: data.orderId });
    });
    
    // Driver updates ride status (enroute, arrived, inprogress, completed)
    socket.on("ride:status:update", async (data: { 
      orderId: string; 
      sessionId: string; 
      status: "enroute" | "arrived" | "inprogress" | "completed";
      waitingTimeMinutes?: number;
    }) => {
      console.log(`[DEBUG] ride:status:update - orderId: ${data.orderId}, status: ${data.status}`);
      
      // Use fallback to recover session from database if not in memory (after server restart)
      const session = await getDriverSessionWithFallback(data.sessionId);
      const order = await dbStorage.getOrder(data.orderId);
      
      if (!session || !order) {
        socket.emit("ride:status:error", { message: "Session ou commande invalide" });
        return;
      }
      
      // Verify this driver is assigned to this order
      if (order.assignedDriverId !== session.driverId) {
        socket.emit("ride:status:error", { message: "Vous n'êtes pas assigné à cette course" });
        return;
      }
      
      // Map ride status to order status
      let orderStatus: OrderStatus;
      switch (data.status) {
        case "enroute":
          orderStatus = "driver_enroute";
          break;
        case "arrived":
          orderStatus = "driver_arrived";
          break;
        case "inprogress":
          orderStatus = "in_progress";
          break;
        case "completed":
          orderStatus = "completed";
          break;
        default:
          orderStatus = "accepted";
      }
      
      // Si le statut passe à "in_progress", récupérer le temps d'attente depuis data
      const waitingTimeMinutes = (data.status === "inprogress" && data.waitingTimeMinutes !== undefined)
        ? data.waitingTimeMinutes
        : undefined;
      
      // If status is arrived: utiliser le timestamp du chauffeur pour synchro timer client/chauffeur
      let updatedOrder;
      if (data.status === "arrived") {
        const currentArrivedAt = (order.rideOption as any)?.driverArrivedAt;
        const driverSentAt = (data as { driverArrivedAt?: string }).driverArrivedAt;
        const arrivedAtToUse = driverSentAt
          ? new Date(driverSentAt)
          : (!currentArrivedAt ? new Date() : undefined);
        if (arrivedAtToUse) {
          updatedOrder = await dbStorage.updateOrderStatus(data.orderId, orderStatus, undefined, undefined, arrivedAtToUse);
          console.log(`[RideStatus] Set driverArrivedAt for order ${data.orderId}`, driverSentAt ? '(from driver)' : '(server fallback)');
        } else {
          updatedOrder = await dbStorage.updateOrderStatus(data.orderId, orderStatus);
          console.log(`[RideStatus] driverArrivedAt already set for order ${data.orderId}, preserving`);
        }
      } else {
        updatedOrder = await dbStorage.updateOrderStatus(data.orderId, orderStatus, undefined, waitingTimeMinutes);
      }
      
      if (updatedOrder) {
        const statusTimestamp = Date.now();
        // Éviter d'émettre l'événement plusieurs fois (protection contre les reconnexions)
        const eventKey = `ride:status:changed:${data.orderId}:${data.status}`;
        const lastEmission = lastEventEmissions.get(eventKey);
        const now = statusTimestamp;
        // Ne pas réémettre si l'événement a été émis il y a moins de 2 secondes
        if (lastEmission && (now - lastEmission) < 2000) {
          console.log(`[RIDE:STATUS] Skipping duplicate event emission for order ${data.orderId} status ${data.status} (last emission ${now - lastEmission}ms ago)`);
        } else {
          // ═══════════════════════════════════════════════════════════════════════════
          // FRAIS DE SERVICE OFFERTS: Vérifier si les frais sont offerts au DÉMARRAGE
          // ═══════════════════════════════════════════════════════════════════════════
          let fraisServiceOfferts = false;
          let initialPriceForFrais = 0;
          
          if (data.status === 'inprogress') {
            // Vérifier si le chauffeur est un salarié TAPEA (frais de service offerts)
            const driver = await dbStorage.getDriver(session.driverId);
            const isSalarieTapea = driver?.typeChauffeur === 'salarie' && !driver?.prestataireId;
            
            if (isSalarieTapea) {
              // Récupérer le % de frais de service depuis la config
              const fraisServiceConfig = await dbStorage.getFraisServiceConfig();
              const fraisServicePercent = fraisServiceConfig?.fraisServicePrestataire || 15;
              
              // Calculer l'économie réalisée
              initialPriceForFrais = (updatedOrder.rideOption as any)?.initialTotalPrice || Math.round(updatedOrder.totalPrice * (1 + fraisServicePercent / 100));
              const economie = initialPriceForFrais - updatedOrder.totalPrice;
              
              if (economie > 0) {
                fraisServiceOfferts = true;
                console.log(`[RIDE:STATUS] 🎁 Salarié TAPEA detected - frais offerts: ${economie} XPF (${fraisServicePercent}%)`);
              }
            }
          }
          
          // Notify both driver and client about the status change
          // Inclure fraisServiceOfferts pour que le client affiche le modal
          io.to(`order:${data.orderId}`).emit("ride:status:changed", {
            orderId: data.orderId,
            status: data.status,
            orderStatus: orderStatus,
            driverName: session.driverName,
            statusTimestamp,
            driverArrivedAt: updatedOrder.driverArrivedAt,
            totalPrice: updatedOrder.totalPrice,
            driverEarnings: updatedOrder.driverEarnings,
            waitingTimeMinutes: updatedOrder.waitingTimeMinutes,
            paidStopsCost: (updatedOrder.rideOption as any)?.paidStopsCost || 0,
            fraisServiceOfferts: fraisServiceOfferts, // Flag pour le client
          });
          lastEventEmissions.set(eventKey, now);
          
          // Émettre aussi l'événement séparé pour les apps qui écoutent cet événement
          if (fraisServiceOfferts) {
            const fraisPayload = {
              orderId: data.orderId,
              message: "Bonne nouvelle ! Les frais de service vous sont offerts !",
              ancienPrix: initialPriceForFrais,
              nouveauPrix: updatedOrder.totalPrice,
              economie: initialPriceForFrais - updatedOrder.totalPrice,
            };
            
            // Émettre vers les deux rooms pour s'assurer que le client reçoit
            io.to(`ride:${data.orderId}`).emit("frais:service:offerts", fraisPayload);
            io.to(`order:${data.orderId}`).emit("frais:service:offerts", fraisPayload);
            console.log(`[RIDE:STATUS] 🎁 Frais de service offerts notification sent at ride start for order ${data.orderId}`);
          }
        }
        
        // Send OneSignal push notification when driver arrives
        if (data.status === 'arrived' && order.clientId) {
          clientNotifications.driverArrived(order.clientId, session.driverName, data.orderId);
        }
        
        console.log(`Ride status updated: ${data.orderId} -> ${data.status}`);
      }
    });
    
    // Payment confirmation - SIMPLIFIED: Driver confirmation alone completes the payment
    socket.on("payment:confirm", async (data: { orderId: string; confirmed: boolean; role: 'driver' | 'client'; sessionId?: string; clientToken?: string; paymentMethod?: 'card' | 'cash' }) => {
      console.log(`[DEBUG] payment:confirm - orderId: ${data.orderId}, confirmed: ${data.confirmed}, role: ${data.role}, paymentMethod: ${data.paymentMethod}`);
      
      const order = await dbStorage.getOrder(data.orderId);
      if (!order) {
        socket.emit("payment:error", { message: "Commande non trouvée" });
        return;
      }

      // Only driver can confirm payment (simplified flow)
      if (data.role === 'driver') {
        if (!data.sessionId) {
          socket.emit("payment:error", { message: "Session manquante" });
          return;
        }
        // Use fallback to recover session from database if not in memory (after server restart)
        const session = await getDriverSessionWithFallback(data.sessionId);
        if (!session) {
          socket.emit("payment:error", { message: "Session invalide" });
          return;
        }
        // Don't require socket to be in session.socketIds - just verify session and driver assignment
        if (order.assignedDriverId !== session.driverId) {
          socket.emit("payment:error", { message: "Vous n'êtes pas le chauffeur de cette course" });
          return;
        }
        
        if (data.confirmed) {
          // Check if payment is already in progress to prevent duplicate charges
          if (paymentsInProgress.get(data.orderId)) {
            console.log(`[DEBUG] Payment already in progress for order ${data.orderId}, ignoring duplicate request`);
            // Emit via payment:status so frontend can handle with existing listeners
            io.to(`order:${data.orderId}`).emit("payment:status", {
              orderId: data.orderId,
              status: "payment_processing",
              confirmed: false,
              message: "Un paiement est déjà en cours de traitement"
            });
            return;
          }
          
          // Mark payment as in progress to prevent duplicate charges
          paymentsInProgress.set(data.orderId, true);
          
          // Utiliser le mode de paiement choisi par le chauffeur si fourni, sinon celui de la commande
          const effectivePaymentMethod = data.paymentMethod || order.paymentMethod;
          console.log(`[DEBUG] Effective payment method: ${effectivePaymentMethod} (driver choice: ${data.paymentMethod}, order: ${order.paymentMethod})`);
          
          // Le chauffeur confirme le paiement directement (TPE physique ou espèces)
          // Pas d'appel Stripe - le paiement est validé immédiatement
          console.log(`[DEBUG] Payment confirmed by driver (TPE/cash) for order ${data.orderId}`);
          
          await dbStorage.updateOrderStatus(data.orderId, "payment_confirmed");
          
          // Incrémenter le compteur de courses du chauffeur
          if (order.assignedDriverId) {
            await dbStorage.incrementDriverTotalRides(order.assignedDriverId);
            
            // Créer une entrée dans collecteFrais si le chauffeur est lié à un prestataire
            try {
              const driver = await dbStorage.getDriver(order.assignedDriverId);
              if (driver && driver.prestataireId) {
                // Récupérer la config des frais et commissions
                const fraisConfig = await dbStorage.getFraisServiceConfig();
                const fraisServicePercent = fraisConfig?.fraisServicePrestataire || 15;
                const commissionPrestatairePercent = fraisConfig?.commissionPrestataire || 0;
                
                // Calculer séparément les frais de service et la commission supplémentaire
                const fraisService = Math.round(order.totalPrice * fraisServicePercent / 100);
                const commissionSupplementaire = Math.round(order.totalPrice * commissionPrestatairePercent / 100);
                const commission = fraisService + commissionSupplementaire;
                const periode = new Date().toISOString().slice(0, 7); // "2026-01"
                
                // Vérifier si une entrée existe déjà pour cette période et ce chauffeur
                const existingEntries = await db
                  .select()
                  .from(collecteFrais)
                  .where(eq(collecteFrais.driverId, order.assignedDriverId));
                
                const existingForPeriod = existingEntries.find(e => e.periode === periode && !e.isPaid);
                
                if (existingForPeriod) {
                  // Mettre à jour le montant existant et ajouter l'orderId
                  const currentOrderIds = (existingForPeriod.orderIds as string[]) || [];
                  if (!currentOrderIds.includes(data.orderId)) {
                    currentOrderIds.push(data.orderId);
                  }
                  await db
                    .update(collecteFrais)
                    .set({ 
                      montantDu: (existingForPeriod.montantDu || 0) + commission,
                      fraisService: (existingForPeriod.fraisService || 0) + fraisService,
                      commissionSupplementaire: (existingForPeriod.commissionSupplementaire || 0) + commissionSupplementaire,
                      orderIds: currentOrderIds,
                    })
                    .where(eq(collecteFrais.id, existingForPeriod.id));
                  console.log(`[CollecteFrais] Updated entry for driver ${order.assignedDriverId}, periode ${periode}, added ${commission} XPF (${fraisServicePercent}% frais: ${fraisService} + ${commissionPrestatairePercent}% commission: ${commissionSupplementaire})`);
                } else {
                  // Créer une nouvelle entrée avec l'orderId
                  await db.insert(collecteFrais).values({
                    prestataireId: driver.prestataireId,
                    driverId: order.assignedDriverId,
                    periode,
                    montantDu: commission,
                    fraisService: fraisService,
                    commissionSupplementaire: commissionSupplementaire,
                    montantPaye: 0,
                    orderIds: [data.orderId],
                    isPaid: false,
                  });
                  console.log(`[CollecteFrais] Created new entry for driver ${order.assignedDriverId}, periode ${periode}, commission ${commission} XPF (${fraisServicePercent}% frais: ${fraisService} + ${commissionPrestatairePercent}% commission: ${commissionSupplementaire})`);
                }
              }
            } catch (collecteError) {
              console.error("[CollecteFrais] Error creating/updating collecte entry:", collecteError);
              // Ne pas bloquer la confirmation de paiement
            }
          }
          
          paymentConfirmations.delete(data.orderId);
          paymentsInProgress.delete(data.orderId);
          // Ne pas supprimer orderClientTokens immédiatement - le garder pour permettre la notation
          // Le token sera supprimé après la notation ou après un délai (voir route rate-driver)
          
          io.to(`order:${data.orderId}`).emit("payment:status", {
            orderId: data.orderId,
            status: "payment_confirmed",
            confirmed: true,
            driverConfirmed: true,
            clientConfirmed: true,
            amount: order.totalPrice,
            paymentMethod: effectivePaymentMethod,
            cardBrand: null,
            cardLast4: null
          });
          
          // IMPORTANT: Émettre aussi ride:status:changed pour que le client puisse détecter le changement
          io.to(`order:${data.orderId}`).emit("ride:status:changed", {
            orderId: data.orderId,
            status: "completed",
            orderStatus: "payment_confirmed",
            driverName: session.driverName || "Chauffeur",
            totalPrice: order.totalPrice,
            driverEarnings: order.driverEarnings,
          });
          console.log(`[DEBUG] Emitted ride:status:changed with payment_confirmed for order ${data.orderId}`);
          
          // Send OneSignal push notifications for payment confirmation
          if (order.clientId) {
            clientNotifications.rideCompleted(order.clientId, order.totalPrice, data.orderId);
          }
          if (order.assignedDriverId) {
            driverNotifications.paymentConfirmed(order.assignedDriverId, order.driverEarnings || order.totalPrice, data.orderId);
          }
          
          console.log(`[DEBUG] Payment confirmed by driver for order ${data.orderId}`);
        } else {
          // Driver rejects payment - keep status as payment_pending to allow client to resolve
          paymentConfirmations.delete(data.orderId);
          paymentsInProgress.delete(data.orderId);
          // Keep orderClientTokens so client can retry or switch to cash
          
          io.to(`order:${data.orderId}`).emit("payment:status", {
            orderId: data.orderId,
            status: "payment_failed",
            confirmed: false,
            driverConfirmed: false,
            clientConfirmed: false,
            amount: order.totalPrice,
            paymentMethod: order.paymentMethod,
            errorMessage: "Le chauffeur a refusé le paiement"
          });
          console.log(`[DEBUG] Driver rejected payment for order ${data.orderId} - keeping status as payment_pending for retry`);
        }
      } else {
        // Client confirmation is informational only (not required)
        console.log(`[DEBUG] Client payment confirmation received but not required: ${data.orderId}`);
      }
    });
    
    // Payment retry - client requests to retry payment with their new/updated card
    socket.on("payment:retry", async (data: { orderId: string; clientToken: string }) => {
      console.log(`[DEBUG] payment:retry - orderId: ${data.orderId}`);
      
      const order = await dbStorage.getOrder(data.orderId);
      if (!order) {
        socket.emit("payment:retry:error", { message: "Commande non trouvée" });
        return;
      }
      
      // Verify client token
      const tokenData = orderClientTokens.get(data.orderId);
      if (!tokenData || tokenData.token !== data.clientToken) {
        socket.emit("payment:retry:error", { message: "Token client invalide" });
        return;
      }
      
      // Reset order to payment_pending status
      await dbStorage.updateOrderStatus(data.orderId, "payment_pending");
      
      // Reinitialize payment confirmation tracking
      paymentConfirmations.set(data.orderId, {
        driver: false,
        client: false,
        driverSocketId: null,
        clientSocketId: socket.id
      });
      
      // Notify driver that client wants to retry payment
      io.to(`order:${data.orderId}`).emit("payment:retry:ready", {
        orderId: data.orderId,
        message: "Le client a mis à jour sa carte. Prêt à réessayer le paiement."
      });
      
      console.log(`[DEBUG] Payment retry initialized for order ${data.orderId}`);
    });
    
    // Switch to cash payment - client wants to pay in cash instead
    socket.on("payment:switch-cash", async (data: { orderId: string; clientToken: string }) => {
      console.log(`[DEBUG] payment:switch-cash - orderId: ${data.orderId}`);
      
      const order = await dbStorage.getOrder(data.orderId);
      if (!order) {
        socket.emit("payment:switch-cash:error", { message: "Commande non trouvée" });
        return;
      }
      
      // Verify client token
      const tokenData = orderClientTokens.get(data.orderId);
      if (!tokenData || tokenData.token !== data.clientToken) {
        socket.emit("payment:switch-cash:error", { message: "Token client invalide" });
        return;
      }
      
      // Update order payment method to cash
      await dbStorage.updateOrderPaymentMethod(data.orderId, "cash");
      await dbStorage.updateOrderStatus(data.orderId, "payment_pending");
      
      // Reinitialize payment confirmation tracking
      paymentConfirmations.set(data.orderId, {
        driver: false,
        client: false,
        driverSocketId: null,
        clientSocketId: socket.id
      });
      
      // Notify driver that client wants to pay in cash
      io.to(`order:${data.orderId}`).emit("payment:switched-to-cash", {
        orderId: data.orderId,
        amount: order.totalPrice,
        message: "Le client souhaite payer en espèces"
      });
      
      console.log(`[DEBUG] Payment switched to cash for order ${data.orderId}`);
    });
    
    // Unilateral ride cancellation - either party can cancel at any time
    socket.on("ride:cancel", async (data: { orderId: string; role: 'driver' | 'client'; reason?: string; sessionId?: string; clientToken?: string }) => {
      console.log(`[DEBUG] ride:cancel - orderId: ${data.orderId}, role: ${data.role}, reason: ${data.reason}`);
      
      const order = await dbStorage.getOrder(data.orderId);
      if (!order) {
        socket.emit("ride:cancel:error", { message: "Commande non trouvée" });
        return;
      }
      
      // Validate the cancellation request
      if (data.role === 'driver') {
        if (!data.sessionId) {
          socket.emit("ride:cancel:error", { message: "Session manquante" });
          return;
        }
        // Use fallback to recover session from database if not in memory (after server restart)
        const session = await getDriverSessionWithFallback(data.sessionId);
        if (!session || order.assignedDriverId !== session.driverId) {
          socket.emit("ride:cancel:error", { message: "Vous n'êtes pas le chauffeur de cette course" });
          return;
        }
      } else if (data.role === 'client') {
        const tokenData = orderClientTokens.get(data.orderId);
        if (!tokenData || tokenData.token !== data.clientToken) {
          socket.emit("ride:cancel:error", { message: "Token client invalide" });
          return;
        }
      }
      
      // Cancel the order
      await dbStorage.updateOrderStatus(data.orderId, "cancelled");
      paymentConfirmations.delete(data.orderId);
      orderClientTokens.delete(data.orderId);
      
      // Notify all parties - Émettre les deux événements pour compatibilité
      const cancelData = {
        orderId: data.orderId,
        cancelledBy: data.role,
        reason: data.reason || "Annulé par " + (data.role === 'driver' ? "le chauffeur" : "le client")
      };
      
      io.to(`order:${data.orderId}`).emit("ride:cancelled", cancelData);
      
      // Notifier tous les chauffeurs en ligne que la commande est annulée (pour supprimer de leur liste)
      io.to("drivers:online").emit("ride:cancelled", cancelData);
      
      // Émettre aussi ride:status:changed pour que l'app chauffeur reçoive la notification
      io.to(`order:${data.orderId}`).emit("ride:status:changed", {
        orderId: data.orderId,
        status: 'cancelled',
        orderStatus: 'cancelled',
        driverName: '',
        cancelledBy: data.role,
      });
      
      // Send OneSignal push notifications
      if (data.role === 'client' && order.assignedDriverId) {
        // Client cancelled - notify the driver
        driverNotifications.clientCancelled(order.assignedDriverId, data.orderId);
      } else if (data.role === 'driver' && order.clientId) {
        // Driver cancelled - notify the client
        notifyClient(order.clientId, '❌ Course annulée', 'Votre chauffeur a annulé la course.', {
          type: 'driver_cancelled',
          orderId: data.orderId
        });
      }
      
      console.log(`[DEBUG] Order ${data.orderId} cancelled by ${data.role}`);
    });
    
    // Real-time location updates - Driver sends their location
    socket.on("location:driver:update", async (data: {
      orderId: string;
      sessionId: string;
      lat: number;
      lng: number;
      heading?: number;
      speed?: number;
      timestamp: number;
    }) => {
      // Use fallback to recover session from database if not in memory (after server restart)
      const session = await getDriverSessionWithFallback(data.sessionId);
      const order = await dbStorage.getOrder(data.orderId);
      
      if (!session || !order || order.assignedDriverId !== session.driverId) {
        console.log(`[DEBUG] location:driver:update ignored - invalid session or order`);
        return;
      }
      
      // Store latest driver location for HTTP polling backup
      driverLocations.set(data.orderId, {
        lat: data.lat,
        lng: data.lng,
        heading: data.heading || 0,
        speed: data.speed,
        timestamp: data.timestamp
      });

      try {
        await dbStorage.updateDriverLastLocation(session.driverId, data.lat, data.lng, data.timestamp);
      } catch (error) {
        console.warn("[DEBUG] Failed to persist driver location:", error);
      }
      
      // Use io.to() to broadcast to ALL members of the room including the sender if needed
      // This ensures the client receives the location update
      io.to(`order:${data.orderId}`).emit("location:driver", {
        orderId: data.orderId,
        lat: data.lat,
        lng: data.lng,
        heading: data.heading,
        speed: data.speed,
        timestamp: data.timestamp
      });
      console.log(`[DEBUG] Driver location broadcasted for order ${data.orderId}: ${data.lat}, ${data.lng}, heading: ${data.heading}`);
    });
    
    // Real-time location updates - Client sends their location
    socket.on("location:client:update", async (data: {
      orderId: string;
      clientToken: string;
      lat: number;
      lng: number;
      timestamp: number;
    }) => {
      // Validate client token
      const tokenData = orderClientTokens.get(data.orderId);
      if (!tokenData || tokenData.token !== data.clientToken) {
        return; // Silently ignore invalid location updates
      }
      
      // Relay to the order room (driver will receive this)
      socket.to(`order:${data.orderId}`).emit("location:client", {
        orderId: data.orderId,
        lat: data.lat,
        lng: data.lng,
        timestamp: data.timestamp
      });
    });
    
    // Paid stop started by driver
    socket.on("paid:stop:started", async (data: {
      orderId: string;
      sessionId: string;
      startTime: number;
      accumulatedSeconds: number;
    }) => {
      console.log(`[PAID_STOP] paid:stop:started received for order ${data.orderId}`);
      
      // Use fallback to recover session from database if not in memory (after server restart)
      const session = await getDriverSessionWithFallback(data.sessionId);
      const order = await dbStorage.getOrder(data.orderId);
      
      if (!session || !order || order.assignedDriverId !== session.driverId) {
        console.log(`[PAID_STOP] Invalid session or order for paid stop`);
        return;
      }
      
      // Store the active paid stop
      activePaidStops.set(data.orderId, {
        startTime: data.startTime,
        accumulatedSeconds: data.accumulatedSeconds
      });
      
      const eventData = {
        orderId: data.orderId,
        startTime: data.startTime,
        accumulatedSeconds: data.accumulatedSeconds
      };
      
      // Check room and client status
      const tokenData = orderClientTokens.get(data.orderId);
      const orderRoom = io.sockets.adapter.rooms.get(`order:${data.orderId}`);
      const roomSize = orderRoom?.size || 0;
      const clientInRoom = tokenData?.socketId && orderRoom?.has(tokenData.socketId);
      
      console.log(`[PAID_STOP] Broadcasting paid:stop:started for order ${data.orderId}:`);
      console.log(`[PAID_STOP]   - Room "order:${data.orderId}" exists: ${!!orderRoom}, size: ${roomSize}`);
      console.log(`[PAID_STOP]   - Client token socketId: ${tokenData?.socketId || 'none'}`);
      console.log(`[PAID_STOP]   - Client in room: ${clientInRoom}`);
      
      // Broadcast to the order room
      io.to(`order:${data.orderId}`).emit("paid:stop:started", eventData);
      
      // ALWAYS emit directly to client if we have their socketId (ensures delivery)
      if (tokenData?.socketId) {
        io.to(tokenData.socketId).emit("paid:stop:started", eventData);
        console.log(`[PAID_STOP] Also sent paid:stop:started directly to client socket ${tokenData.socketId}`);
      }
      
      console.log(`[PAID_STOP] paid:stop:started broadcasted for order ${data.orderId}`);
    });
    
    // Paid stop ended by driver
    socket.on("paid:stop:ended", async (data: {
      orderId: string;
      sessionId: string;
      cost: number;
      durationMinutes: number;
      newAccumulatedSeconds?: number;
      totalCost?: number;
    }) => {
      console.log(`[PAID_STOP] paid:stop:ended received for order ${data.orderId}, cost: ${data.cost}, totalCost: ${data.totalCost}`);
      
      // Use fallback to recover session from database if not in memory (after server restart)
      const session = await getDriverSessionWithFallback(data.sessionId);
      const order = await dbStorage.getOrder(data.orderId);
      
      if (!session || !order || order.assignedDriverId !== session.driverId) {
        console.log(`[PAID_STOP] Invalid session or order for paid stop end`);
        return;
      }
      
      // Remove the active paid stop
      activePaidStops.delete(data.orderId);
      
      const eventData = {
        orderId: data.orderId,
        cost: data.cost,
        durationMinutes: data.durationMinutes,
        newAccumulatedSeconds: data.newAccumulatedSeconds,
        totalCost: data.totalCost,
      };
      
      // Check room and client status
      const tokenData = orderClientTokens.get(data.orderId);
      const orderRoom = io.sockets.adapter.rooms.get(`order:${data.orderId}`);
      const roomSize = orderRoom?.size || 0;
      const clientInRoom = tokenData?.socketId && orderRoom?.has(tokenData.socketId);
      
      console.log(`[PAID_STOP] Broadcasting paid:stop:ended for order ${data.orderId}:`);
      console.log(`[PAID_STOP]   - Room size: ${roomSize}, client socketId: ${tokenData?.socketId || 'none'}, in room: ${clientInRoom}`);
      
      // Broadcast to the order room
      io.to(`order:${data.orderId}`).emit("paid:stop:ended", eventData);
      
      // ALWAYS emit directly to client if we have their socketId (ensures delivery)
      if (tokenData?.socketId) {
        io.to(tokenData.socketId).emit("paid:stop:ended", eventData);
        console.log(`[PAID_STOP] Also sent paid:stop:ended directly to client socket ${tokenData.socketId}`);
      }
      
      console.log(`[PAID_STOP] paid:stop:ended broadcasted for order ${data.orderId}`);
    });
    
    // Driver or client joins ride room (with validation)
    socket.on("ride:join", async (data: { orderId: string; role?: 'driver' | 'client'; sessionId?: string; clientToken?: string }) => {
      const order = await dbStorage.getOrder(data.orderId);
      if (!order) {
        console.log(`Socket ${socket.id} tried to join non-existent order room: ${data.orderId}`);
        return;
      }
      
      // Validate based on role
      if (data.role === 'driver') {
        // Verify driver session and assignment
        if (!data.sessionId) {
          console.log(`Driver socket ${socket.id} missing sessionId for ride:join`);
          return;
        }
        // Use fallback to recover session from database if not in memory (after server restart)
        const session = await getDriverSessionWithFallback(data.sessionId);
        if (!session || order.assignedDriverId !== session.driverId) {
          console.log(`Driver socket ${socket.id} not assigned to order ${data.orderId}`);
          return;
        }
        socket.join(`order:${data.orderId}`);
        console.log(`Driver ${session.driverName} joined ride room: ${data.orderId}`);
      } else if (data.role === 'client') {
        // Verify client token
        const tokenData = orderClientTokens.get(data.orderId);
        if (!tokenData || tokenData.token !== data.clientToken) {
          console.log(`Client socket ${socket.id} invalid token for ride:join order ${data.orderId}`);
          return;
        }
        
        // Vérifier si le socket est déjà dans la room pour éviter les rejoins multiples
        const orderRoom = `order:${data.orderId}`;
        const room = io.sockets.adapter.rooms.get(orderRoom);
        const alreadyInRoom = room?.has(socket.id);
        
        if (alreadyInRoom && tokenData.socketId === socket.id) {
          // Déjà dans la room avec le bon socket, ne rien faire
          console.log(`Client socket ${socket.id} already in ride room ${orderRoom}, skipping rejoin`);
          return;
        }
        
        // Verify socket is the authenticated one (or allow rebinding if old socket disconnected)
        if (tokenData.socketId && tokenData.socketId !== socket.id) {
          const existingSocket = io.sockets.sockets.get(tokenData.socketId);
          if (existingSocket && existingSocket.connected) {
            console.log(`Client socket ${socket.id} rejected in ride:join: already bound to ${tokenData.socketId}`);
            return;
          }
          // Allow rebinding from disconnected socket
          console.log(`Client socket ${socket.id} rebinding in ride:join (old socket disconnected)`);
        }
        
        // Bind the socket to this token
        tokenData.socketId = socket.id;
        orderClientTokens.set(data.orderId, tokenData);
        socket.join(orderRoom);
        console.log(`Client socket ${socket.id} authenticated and joined ride room: ${data.orderId}`);
      } else {
        // No role specified - reject
        console.log(`Socket ${socket.id} attempted ride:join without role for order ${data.orderId}`);
      }
    });

    // ============ CHAT SOCKET EVENTS ============

    // Client sends a chat message via socket (real-time)
    socket.on("chat:send:client", async (data: { orderId: string; clientToken: string; clientSessionId?: string; content: string }) => {
      console.log(`[CHAT] Client sending message for order ${data.orderId}`);
      
      // First, try to get the order to validate
      let order;
      try {
        order = await dbStorage.getOrder(data.orderId);
        if (!order) {
          console.log(`[CHAT] Order ${data.orderId} not found`);
          socket.emit("chat:error", { message: "Commande non trouvée" });
          return;
        }
      } catch (err) {
        console.error(`[CHAT] Error fetching order ${data.orderId}:`, err);
        socket.emit("chat:error", { message: "Erreur serveur" });
        return;
      }

      // Validate client - try multiple methods:
      // 1. Check token in memory (works if server hasn't restarted)
      // 2. Check client session if provided (works always)
      // 3. Fallback: verify the socket is in the order room
      let isValidClient = false;
      
      // Method 1: Token in memory
      const tokenData = orderClientTokens.get(data.orderId);
      if (tokenData && tokenData.token === data.clientToken) {
        isValidClient = true;
        console.log(`[CHAT] Client validated via memory token`);
      }
      
      // Method 2: Session validation (fallback after server restart)
      if (!isValidClient && data.clientSessionId) {
        const session = await dbStorage.getClientSession(data.clientSessionId);
        if (session && session.clientId === order.clientId) {
          isValidClient = true;
          console.log(`[CHAT] Client validated via session`);
          // Restore token in memory for future use
          if (data.clientToken) {
            orderClientTokens.set(data.orderId, { token: data.clientToken, socketId: socket.id });
          }
        }
      }
      
      // Method 3: Check if socket is in the order room and order has this client
      if (!isValidClient && order.clientId) {
        const socketRooms = socket.rooms;
        if (socketRooms.has(`order:${data.orderId}`)) {
          isValidClient = true;
          console.log(`[CHAT] Client validated via room membership`);
        }
      }
      
      if (!isValidClient) {
        console.log(`[CHAT] Invalid client authentication for order ${data.orderId}`);
        socket.emit("chat:error", { message: "Authentification invalide. Veuillez recharger l'application." });
        return;
      }

      try {
        // Check order is in valid state for messaging (including pending for pre-acceptance chat)
        const validStatuses = ["pending", "accepted", "driver_enroute", "driver_arrived", "in_progress"];
        if (!validStatuses.includes(order.status)) {
          socket.emit("chat:error", { message: "La messagerie n'est disponible que pendant une course active" });
          return;
        }

        const message = await dbStorage.createMessage({
          orderId: data.orderId,
          senderId: order.clientId || "anonymous",
          senderType: "client",
          content: data.content.substring(0, 1000),
        });

        // Emit to both client (confirmation) and driver
        socket.emit("chat:message", { orderId: data.orderId, message });
        
        // For pending orders, emit to all online drivers via drivers:online room
        if (order.status === "pending") {
          io.to("drivers:online").emit("chat:message", { orderId: data.orderId, message });
          // Also emit notification for pop-up display
          io.to("drivers:online").emit("chat:notification", { 
            orderId: data.orderId, 
            message, 
            clientName: order.clientName || 'Client',
            fromClient: true 
          });
        } else if (order.assignedDriverId) {
          console.log(`[CHAT] Sending message to driver room: driver:${order.assignedDriverId}`);
          io.to(`driver:${order.assignedDriverId}`).emit("chat:message", { orderId: data.orderId, message });
          // Also emit notification for pop-up display
          io.to(`driver:${order.assignedDriverId}`).emit("chat:notification", { 
            orderId: data.orderId, 
            message, 
            clientName: order.clientName || 'Client',
            fromClient: true 
          });
          // Send OneSignal push notification to assigned driver
          console.log(`[CHAT] Sending OneSignal push to driver: ${order.assignedDriverId}`);
          driverNotifications.newMessageFromClient(order.assignedDriverId, order.clientName || 'Client', data.orderId);
        }
        
        // Also emit to order room for any listeners
        io.to(`order:${data.orderId}`).emit("chat:message", { orderId: data.orderId, message });

        console.log(`[CHAT] Message sent from client for order ${data.orderId}`);
      } catch (error) {
        console.error("[CHAT] Error sending client message:", error);
        socket.emit("chat:error", { message: "Erreur lors de l'envoi du message" });
      }
    });

    // Driver sends a chat message via socket (real-time)
    socket.on("chat:send:driver", async (data: { orderId: string; sessionId: string; content: string }) => {
      console.log(`[CHAT] Driver sending message for order ${data.orderId}`);
      
      // Validate driver session
      let driverId: string | undefined;
      const session = await storage.getDriverSession(data.sessionId);
      if (session) {
        driverId = session.driverId;
      } else {
        // Fallback to database session
        const dbSession = await dbStorage.getDbDriverSession(data.sessionId);
        if (dbSession) {
          driverId = dbSession.driverId;
        }
      }
      
      if (!driverId) {
        console.log(`[CHAT] Invalid driver session ${data.sessionId}`);
        socket.emit("chat:error", { message: "Session invalide" });
        return;
      }

      try {
        const order = await dbStorage.getOrder(data.orderId);
        if (!order) {
          socket.emit("chat:error", { message: "Commande introuvable" });
          return;
        }
        
        // Allow messaging for pending orders (pre-acceptance) OR if driver is assigned
        const isPending = order.status === "pending";
        const isAssignedDriver = order.assignedDriverId === driverId;
        
        if (!isPending && !isAssignedDriver) {
          socket.emit("chat:error", { message: "Accès non autorisé" });
          return;
        }

        // Check order is in valid state for messaging
        const validStatuses = ["pending", "accepted", "driver_enroute", "driver_arrived", "in_progress"];
        if (!validStatuses.includes(order.status)) {
          socket.emit("chat:error", { message: "La messagerie n'est disponible que pendant une course active" });
          return;
        }

        const message = await dbStorage.createMessage({
          orderId: data.orderId,
          senderId: driverId,
          senderType: "driver",
          content: data.content.substring(0, 1000),
        });

        // Emit to both driver (confirmation) and client
        socket.emit("chat:message", { orderId: data.orderId, message });
        io.to(`order:${data.orderId}`).emit("chat:message", { orderId: data.orderId, message });
        
        // Emit notification bubble to client (for pending orders - pre-acceptance messaging)
        io.to(`order:${data.orderId}`).emit("chat:notification", { 
          orderId: data.orderId, 
          message,
          fromDriver: true,
          driverName: session?.driverName || 'Chauffeur'
        });
        
        // Send OneSignal push notification to client
        if (order.clientId) {
          clientNotifications.newMessageFromDriver(order.clientId, session?.driverName || 'Chauffeur', data.orderId);
        }

        console.log(`[CHAT] Message sent from driver for order ${data.orderId}`);
      } catch (error) {
        console.error("[CHAT] Error sending driver message:", error);
        socket.emit("chat:error", { message: "Erreur lors de l'envoi du message" });
      }
    });

    // Mark messages as read
    socket.on("chat:read", async (data: { orderId: string; role: "client" | "driver"; sessionId?: string; clientToken?: string }) => {
      try {
        if (data.role === "client") {
          const tokenData = orderClientTokens.get(data.orderId);
          if (!tokenData || tokenData.token !== data.clientToken) return;
        } else if (data.role === "driver") {
          // Use fallback to recover session from database if not in memory (after server restart)
          const session = await getDriverSessionWithFallback(data.sessionId || "");
          if (!session) return;
        }

        await dbStorage.markMessagesAsRead(data.orderId, data.role);
        console.log(`[CHAT] Messages marked as read for ${data.role} in order ${data.orderId}`);
      } catch (error) {
        console.error("[CHAT] Error marking messages as read:", error);
      }
    });
    
    socket.on("disconnect", async () => {
      console.log(`Socket disconnected: ${socket.id}`);
      
      // Clean up client token binding if this socket was bound to an order
      for (const [orderId, tokenData] of orderClientTokens.entries()) {
        if (tokenData.socketId === socket.id) {
          console.log(`[DISCONNECT] Cleaning up client token binding for order ${orderId}`);
          // Don't remove the token, just clear the socket binding to allow reconnection
          tokenData.socketId = null;
          orderClientTokens.set(orderId, tokenData);
        }
      }
      
      // Remove socket from all sessions and set driver offline if no sockets remain
      const sessions = await storage.getOnlineDriverSessions();
      for (const session of sessions) {
        if (session.socketIds.includes(socket.id)) {
          await storage.removeSocketFromSession(session.id, socket.id);
          // Refresh session to check remaining sockets
          const updatedSession = await storage.getDriverSession(session.id);
          if (updatedSession && updatedSession.socketIds.length === 0) {
            // No more sockets - mark driver as offline to prevent phantom orders
            console.log(`Driver ${updatedSession.driverName} has no more sockets - marking offline`);
            await storage.updateDriverOnlineStatus(session.id, false);
          }
        }
      }
    });
  });

  // API Routes
  
  // Create a new order (called when client confirms booking)
 // Create a new order (called when client confirms booking)
app.post("/api/orders", async (req, res) => {
  try {
    const validatedData = insertOrderSchema.parse(req.body);

    // Majoration hauteur (auto, non sélectionnable côté client)
    let supplements = Array.isArray(validatedData.supplements) ? [...validatedData.supplements] : [];
    let totalPrice = validatedData.totalPrice;
    try {
      const pickupAddress = getAddressByType(validatedData.addresses, "pickup");
      const destinationAddress = getAddressByType(validatedData.addresses, "destination");

      let pickupCoord = extractLatLngFromAddress(pickupAddress);
      let destinationCoord = extractLatLngFromAddress(destinationAddress);

      if (!pickupCoord) {
        pickupCoord = await geocodeAddress(pickupAddress);
      }
      if (!destinationCoord) {
        destinationCoord = await geocodeAddress(destinationAddress);
      }
      const coords = [pickupCoord, destinationCoord].filter(Boolean) as LatLng[];
      if (coords.length > 0) {
        const elevations = await fetchElevations(coords);
        const hasHeightSurcharge = elevations.some((e) => e >= HEIGHT_SURCHARGE_THRESHOLD_METERS);
        if (hasHeightSurcharge) {
          const alreadyAdded = supplements.some((s: any) => s?.id === HEIGHT_SURCHARGE_ID);
          if (!alreadyAdded) {
            supplements.push({
              id: HEIGHT_SURCHARGE_ID,
              name: HEIGHT_SURCHARGE_NAME,
              price: HEIGHT_SURCHARGE_AMOUNT,
              quantity: 1,
              typeSupplement: "auto",
            });
            totalPrice += HEIGHT_SURCHARGE_AMOUNT;
            console.log("[Orders] Majoration hauteur appliquée:", {
              orderTotal: totalPrice,
              elevations,
            });
          }
        }
      }
    } catch (e) {
      console.warn("[Orders] Majoration hauteur: calcul ignoré", e);
    }

    const orderPayload = {
      ...validatedData,
      supplements,
      totalPrice,
    };
    
    // On récupère la session du client depuis les headers (mobile) ou cookie (web)
    // L'app mobile envoie déjà X-Client-Session-Id, donc ça marchera pour elle.
const headerSessionRaw = (req.headers["x-client-session-id"] as string | undefined) || "";
const headerSessionId = headerSessionRaw.split(",")[0].trim() || undefined;

// Le cookie peut contenir "id,clientSessionId=id", on le nettoie
const rawCookieSessionId = req.cookies?.clientSessionId as string | undefined;
const cookieSessionId = rawCookieSessionId?.split(",")[0].trim() || undefined;

// IMPORTANT : on privilégie le header (mobile) puis le cookie (web)
const sessionId = headerSessionId || cookieSessionId;

    let clientId: string | undefined = undefined;

    if (sessionId) {
      const session = await dbStorage.getClientSession(sessionId);
      if (session && new Date(session.expiresAt) > new Date()) {
        clientId = session.clientId;
      }
    }

    // Recalculer driverEarnings avec la commission de la base de données
    // On utilise "patente" par défaut car on ne connait pas encore le chauffeur
    let finalDriverEarnings = orderPayload.driverEarnings;
    try {
      const commission = await dbStorage.getCommissionByType("patente");
      if (commission) {
        finalDriverEarnings = Math.round(orderPayload.totalPrice * (commission.pourcentageChauffeur / 100));
        console.log(`[Orders] Recalculated driverEarnings: ${orderPayload.driverEarnings} -> ${finalDriverEarnings} (${commission.pourcentageChauffeur}% of ${orderPayload.totalPrice})`);
      }
    } catch (commissionError) {
      console.warn("[Orders] Failed to fetch commission, using client-provided driverEarnings:", commissionError);
    }

    // Mettre à jour les données avec les gains recalculés
    const orderDataWithCorrectEarnings = {
      ...orderPayload,
      driverEarnings: finalDriverEarnings,
    };

    // ICI : on crée la commande en liant le clientId si on l'a trouvé
    const order = await dbStorage.createOrder(orderDataWithCorrectEarnings, clientId);
    
    // Generate a secure client token for this order
    const clientToken = generateClientToken();
    orderClientTokens.set(order.id, { token: clientToken, socketId: null });
    console.log(`[DEBUG] Generated client token for order ${order.id}: ${clientToken.substring(0, 8)}...`);
    
    // Debug: Check how many sockets are in drivers:online room
    const driversRoom = io.sockets.adapter.rooms.get("drivers:online");
    const driverCount = driversRoom ? driversRoom.size : 0;
    console.log(`[DEBUG] Drivers online room has ${driverCount} socket(s)`);
    
    // Broadcast to all online drivers via WebSocket
    io.to("drivers:online").emit("order:new", order);
    
    console.log(`New order created: ${order.id}, broadcasted to ${driverCount} drivers`);
    
    // Send push notifications to all subscribed drivers (for iOS PWA)
    sendPushToAllDrivers(order);
    
    // Send OneSignal push notifications to all online drivers
    driverNotifications.newOrder(order.id, order.pickupAddress || 'Nouvelle course', order.totalPrice);
    
    // Set timeout to expire order if not accepted
    // Pour les réservations à l'avance et tours de l'île: pas de timeout (3 jours gérés par expiresAt en DB)
    // Pour les courses immédiates: 5 minutes
    const isAdvanceOrTour = order.isAdvanceBooking || order.rideOption?.id === 'tour';
    
    if (!isAdvanceOrTour) {
      // Timeout uniquement pour les courses immédiates
      setTimeout(async () => {
        const currentOrder = await dbStorage.getOrder(order.id);
        if (currentOrder && currentOrder.status === "pending") {
          await dbStorage.updateOrderStatus(order.id, "expired");
          orderClientTokens.delete(order.id); // Clean up expired order token
          
          const expireData = {
            orderId: order.id,
            cancelledBy: 'system' as const,
            reason: 'Commande expirée - aucun chauffeur disponible',
          };
          
          // Notifier tous les chauffeurs que la commande a expiré
          io.to("drivers:online").emit("order:expired", { orderId: order.id });
          io.to("drivers:online").emit("ride:cancelled", expireData);
          
          // Notifier aussi la room de la commande
          io.to(`order:${order.id}`).emit("ride:cancelled", expireData);
          
          console.log(`Order ${order.id} expired (20 minutes timeout)`);
        }
      }, 20 * 60 * 1000); // 20 minutes timeout pour courses immédiates
    } else {
      console.log(`Order ${order.id} is advance booking/tour - no short timeout (expires in 3 days)`);
    }
    
    // Return order with client token (only the client creating the order receives this)
    res.json({ success: true, order, clientToken });
  } catch (error) {
    console.error("Error creating order:", error);
    res.status(400).json({ success: false, error: "Invalid order data" });
  }
});

// Vérifier la majoration hauteur avant commande
app.post("/api/height-surcharge-check", async (req, res) => {
  try {
    const pickup = req.body?.pickup || {};
    const destination = req.body?.destination || {};

    const pickupCoord = extractLatLngFromAddress(pickup) || await geocodeAddress(pickup);
    const destinationCoord = extractLatLngFromAddress(destination) || await geocodeAddress(destination);

    const coords = [pickupCoord, destinationCoord].filter(Boolean) as LatLng[];
    if (coords.length === 0) {
      return res.json({ applies: false });
    }

    const elevations = await fetchElevations(coords);
    const applies = elevations.some((e) => e >= HEIGHT_SURCHARGE_THRESHOLD_METERS);
    return res.json({ applies, elevations });
  } catch (error) {
    console.warn("[HeightSurcharge] Check failed:", error);
    return res.json({ applies: false });
  }
});
  
  // Get pending orders (for driver hydration)
  app.get("/api/orders/pending", async (req, res) => {
    const orders = await dbStorage.getPendingOrders();
    res.json(orders);
  });
  
// Get active order for authenticated client
// Get active order for authenticated client
app.get("/api/orders/active/client", async (req, res) => {
  try {
    const headerSessionRaw = (req.headers["x-client-session-id"] as string | undefined) || "";
    const headerSessionId = headerSessionRaw.split(",")[0].trim() || undefined;

    const rawCookieSessionId = req.cookies?.clientSessionId as string | undefined;
    const cookieSessionId = rawCookieSessionId?.split(",")[0].trim() || undefined;

    const sessionId = headerSessionId || cookieSessionId;

    if (!sessionId) {
      return res.json({ hasActiveOrder: false });
    }

    const session = await dbStorage.getClientSession(sessionId);
    if (!session) {
      return res.json({ hasActiveOrder: false });
    }

    // Statuts vraiment actifs (course en cours, pas terminée)
    const activeStatuses: OrderStatus[] = [
      "pending",
      "accepted",
      "driver_enroute",
      "driver_arrived",
      "in_progress",
    ];
    // Note: "completed", "payment_pending", "payment_confirmed", "cancelled" sont des statuts terminés
    const orders = await dbStorage.getOrdersByClient(session.clientId);

    const matchingOrders = orders
      .filter((o: Order) => {
        // Inclure les commandes avec statut actif
        if (!activeStatuses.includes(o.status as OrderStatus)) {
          return false;
        }
        
        // Pour les commandes "pending", on les inclut même sans chauffeur assigné
        // Pour les autres statuts, on vérifie qu'un chauffeur est assigné
        if (o.status === "pending") {
          return true; // Inclure les commandes en attente même sans chauffeur
        }
        
        // Pour les autres statuts actifs, un chauffeur doit être assigné
        return o.assignedDriverId !== null && o.assignedDriverId !== undefined;
      })
      .sort(
        (a: Order, b: Order) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

    const activeOrder = matchingOrders[0];

    if (!activeOrder) {
      return res.json({ hasActiveOrder: false });
    }

    const tokenData = orderClientTokens.get(activeOrder.id);

    res.json({
      hasActiveOrder: true,
      order: activeOrder,
      clientToken: tokenData?.token || null,
    });
  } catch (error) {
    console.error("Error getting active client order:", error);
    res.status(500).json({ error: "Erreur lors de la récupération de la course active" });
  }
});

// Live Activities (Client) - démarrage / mise à jour / fin
const LIVE_ACTIVITY_TYPE = "ride_tracking";

app.post("/api/live-activities/start", async (req, res) => {
  try {
    const authClientId = await getAuthenticatedClient(req);
    if (!authClientId) {
      return res.status(401).json({ error: "Non authentifié" });
    }

    const { orderId, updates } = req.body || {};
    if (!orderId || typeof orderId !== "string") {
      return res.status(400).json({ error: "orderId requis" });
    }

    const success = await startClientLiveActivity(
      authClientId,
      LIVE_ACTIVITY_TYPE,
      orderId,
      updates || {}
    );
    return res.json({ success });
  } catch (error) {
    console.error("[LiveActivity] start error:", error);
    return res.status(500).json({ error: "Erreur Live Activity" });
  }
});

app.post("/api/live-activities/update", async (req, res) => {
  try {
    const authClientId = await getAuthenticatedClient(req);
    if (!authClientId) {
      return res.status(401).json({ error: "Non authentifié" });
    }

    const { orderId, updates } = req.body || {};
    if (!orderId || typeof orderId !== "string") {
      return res.status(400).json({ error: "orderId requis" });
    }

    const success = await updateClientLiveActivity(
      authClientId,
      LIVE_ACTIVITY_TYPE,
      orderId,
      updates || {}
    );
    return res.json({ success });
  } catch (error) {
    console.error("[LiveActivity] update error:", error);
    return res.status(500).json({ error: "Erreur Live Activity" });
  }
});

app.post("/api/live-activities/end", async (req, res) => {
  try {
    const authClientId = await getAuthenticatedClient(req);
    if (!authClientId) {
      return res.status(401).json({ error: "Non authentifié" });
    }

    const { orderId, updates } = req.body || {};
    if (!orderId || typeof orderId !== "string") {
      return res.status(400).json({ error: "orderId requis" });
    }

    const success = await endClientLiveActivity(
      authClientId,
      LIVE_ACTIVITY_TYPE,
      orderId,
      updates || {}
    );
    return res.json({ success });
  } catch (error) {
    console.error("[LiveActivity] end error:", error);
    return res.status(500).json({ error: "Erreur Live Activity" });
  }
});
    
    

  
  // Get active order for authenticated driver
  app.get("/api/orders/active/driver", async (req, res) => {
    const sessionId = req.query.sessionId as string;
    if (!sessionId) {
      return res.json({ hasActiveOrder: false });
    }
    
    // First try in-memory session
    let driverId: string | undefined;
    const session = await storage.getDriverSession(sessionId);
    if (session) {
      driverId = session.driverId;
    } else {
      // Fallback to database session (survives server restart)
      const dbSession = await dbStorage.getDbDriverSession(sessionId);
      if (dbSession) {
        driverId = dbSession.driverId;
        console.log(`[Active Order] Found driver ${driverId} via DB session fallback`);
      }
    }
    
    if (!driverId) {
      return res.json({ hasActiveOrder: false });
    }
    
    // Find active order for this driver (only truly active statuses)
    const activeStatuses: OrderStatus[] = ["accepted", "driver_enroute", "driver_arrived", "in_progress"];
    const orders = await dbStorage.getOrdersByDriver(driverId);
    const activeOrder = orders.find((o: Order) => activeStatuses.includes(o.status as OrderStatus));
    
    if (!activeOrder) {
      return res.json({ hasActiveOrder: false });
    }
    
    console.log(`[Active Order] Found active order ${activeOrder.id} for driver ${driverId}`);
    res.json({
      hasActiveOrder: true,
      order: activeOrder
    });
  });
  
  // Get driver location for an order (HTTP polling backup for WebSocket)
  app.get("/api/orders/:id/driver-location", async (req, res) => {
    const orderId = req.params.id;
    const order = await dbStorage.getOrder(orderId);
    
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }
    
    const location = driverLocations.get(orderId);
    if (!location) {
      return res.json({ hasLocation: false });
    }
    
    res.json({
      hasLocation: true,
      lat: location.lat,
      lng: location.lng,
      heading: location.heading,
      speed: location.speed,
      timestamp: location.timestamp
    });
  });
  
  // Get order by ID
  app.get("/api/orders/:id", async (req, res) => {
    const order = await dbStorage.getOrder(req.params.id);
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }
    
    // Enrich with current driver info if assigned
    let driverInfo = null;
    if (order.assignedDriverId) {
      const driver = await dbStorage.getDriver(order.assignedDriverId);
      if (driver) {
        driverInfo = {
          id: driver.id,
          name: `${driver.firstName} ${driver.lastName}`.trim(),
          phone: driver.phone,
          vehicleModel: driver.vehicleModel,
          vehicleColor: driver.vehicleColor,
          vehiclePlate: driver.vehiclePlate,
          photoUrl: driver.photoUrl,
          averageRating: driver.averageRating,
        };
      }
    }
    
    // Enrich with current client info if linked
    let clientInfo = null;
    if (order.clientId) {
      const client = await dbStorage.getClient(order.clientId);
      if (client) {
        clientInfo = {
          id: client.id,
          name: `${client.firstName} ${client.lastName}`.trim(),
          phone: client.phone,
          email: client.email,
          photoUrl: client.photoUrl,
          averageRating: client.averageRating,
        };
      }
    }
    
    res.json({
      ...order,
      driver: driverInfo,
      client: clientInfo,
    });
  });

  // Generate and download invoice PDF for an order
  app.get("/api/invoices/:orderId/pdf", async (req, res) => {
    try {
      const { orderId } = req.params;
      
      // Récupérer la commande
      const order = await dbStorage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ error: "Commande non trouvée" });
      }

      // Récupérer ou créer la facture si elle n'existe pas
      let invoice = await dbStorage.getInvoiceByOrder(orderId);
      if (!invoice) {
        // Si pas de facture, en créer une à partir de la commande
        console.log(`[PDF] Facture non trouvée pour la commande ${orderId}, création automatique...`);
        if (!order.clientId) {
          return res.status(400).json({ error: "Client non associé à cette commande" });
        }
        invoice = await dbStorage.createInvoice({
          clientId: order.clientId,
          orderId: orderId,
          amount: order.totalPrice,
        });
        // Mettre à jour le statut si la commande est payée
        if (order.status === 'payment_confirmed' || order.status === 'completed') {
          await dbStorage.updateInvoiceStatus(invoice.id, 'paid');
        }
      }

      // Récupérer le client
      if (!order.clientId) {
        return res.status(400).json({ error: "Client non associé à cette commande" });
      }
      const client = await dbStorage.getClient(order.clientId);
      if (!client) {
        return res.status(404).json({ error: "Client non trouvé" });
      }

      // Générer le PDF
      const pdfBuffer = await generateInvoicePDF(order, client, invoice);

      // Envoyer le PDF en réponse
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="facture-${orderId}.pdf"`);
      res.setHeader('Content-Length', pdfBuffer.length.toString());
      res.send(pdfBuffer);
    } catch (error: any) {
      console.error('[PDF] Erreur lors de la génération du PDF:', error);
      res.status(500).json({ error: "Erreur lors de la génération du PDF", details: error.message });
    }
  });

  // HTTP endpoint for cancelling orders (fallback for Socket.IO)
  app.post("/api/orders/:id/cancel", async (req, res) => {
    try {
      const orderId = req.params.id;
      const { role, reason, clientToken, driverSessionId } = req.body;
      
      if (!role || !['client', 'driver'].includes(role)) {
        return res.status(400).json({ error: "Role invalide (client ou driver requis)" });
      }
      
      const order = await dbStorage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ error: "Commande non trouvée" });
      }
      
      // Vérifier si la commande peut être annulée
      // Permettre la ré-annulation si déjà cancelled (cas de double appel) - ne pas retourner d'erreur
      const nonCancellableStatuses = ['completed', 'payment_confirmed'];
      if (nonCancellableStatuses.includes(order.status)) {
        return res.status(400).json({ 
          error: `Impossible d'annuler une commande avec le statut "${order.status}"`,
          currentStatus: order.status 
        });
      }
      
      // Si déjà cancelled ou expired, retourner success sans modifier (évite les erreurs 400 sur double appel)
      if (order.status === 'cancelled' || order.status === 'expired') {
        console.log(`[HTTP] Order ${orderId} already ${order.status}, returning success (idempotent)`);
        return res.json({ 
          success: true, 
          message: `La commande est déjà ${order.status === 'cancelled' ? 'annulée' : 'expirée'}`,
          currentStatus: order.status 
        });
      }
      
      // Valider l'identité de l'annulateur
      if (role === 'driver') {
        if (!driverSessionId) {
          return res.status(400).json({ error: "Session chauffeur requise" });
        }
        const session = await storage.getDriverSession(driverSessionId);
        if (!session) {
          // Fallback to database session
          const dbSession = await dbStorage.getDbDriverSession(driverSessionId);
          if (!dbSession) {
            return res.status(401).json({ error: "Session chauffeur invalide" });
          }
          if (order.assignedDriverId && order.assignedDriverId !== dbSession.driverId) {
            return res.status(403).json({ error: "Vous n'êtes pas le chauffeur de cette course" });
          }
        } else {
          if (order.assignedDriverId && order.assignedDriverId !== session.driverId) {
            return res.status(403).json({ error: "Vous n'êtes pas le chauffeur de cette course" });
          }
        }
      } else if (role === 'client') {
        // Pour le client, vérifier le token si fourni (mais permettre aussi sans token si pas de sécurité requise)
        const tokenData = orderClientTokens.get(orderId);
        if (tokenData && clientToken && tokenData.token !== clientToken) {
          return res.status(403).json({ error: "Token client invalide" });
        }
      }
      
      // Annuler la commande
      const updatedOrder = await dbStorage.updateOrderStatus(orderId, "cancelled");
      
      if (!updatedOrder) {
        return res.status(500).json({ error: "Erreur lors de l'annulation" });
      }
      
      // Nettoyer les données associées
      paymentConfirmations.delete(orderId);
      orderClientTokens.delete(orderId);
      
      // Notifier via Socket.IO - Émettre les deux événements pour compatibilité
      const cancelData = {
        orderId,
        cancelledBy: role,
        reason: reason || 'Annulation manuelle',
      };
      
      io.to(`order:${orderId}`).emit("ride:cancelled", cancelData);
      
      // Notifier tous les chauffeurs en ligne que la commande est annulée (pour supprimer de leur liste)
      io.to("drivers:online").emit("ride:cancelled", cancelData);
      
      // Émettre aussi ride:status:changed pour que l'app chauffeur reçoive la notification
      io.to(`order:${orderId}`).emit("ride:status:changed", {
        orderId,
        status: 'cancelled',
        orderStatus: 'cancelled',
        driverName: '',
        cancelledBy: role,
      });
      
      // Send OneSignal push notifications
      if (role === 'client' && order.assignedDriverId) {
        // Client cancelled - notify the driver
        driverNotifications.clientCancelled(order.assignedDriverId, orderId);
      } else if (role === 'driver' && order.clientId) {
        // Driver cancelled - notify the client
        notifyClient(order.clientId, '❌ Course annulée', 'Votre chauffeur a annulé la course.', {
          type: 'driver_cancelled',
          orderId
        });
      }
      
      console.log(`[HTTP] Order ${orderId} cancelled by ${role}. Reason: ${reason || 'Non spécifié'}`);
      
      return res.json({ 
        success: true, 
        message: "Commande annulée avec succès",
        order: updatedOrder 
      });
    } catch (error) {
      console.error("Error cancelling order:", error);
      return res.status(500).json({ error: "Erreur interne du serveur" });
    }
  });

  // ============ RATINGS ENDPOINTS ============

  // Client rates driver after ride
  app.post("/api/orders/:id/rate-driver", async (req, res) => {
    try {
      const orderId = req.params.id;
      const { score, comment } = req.body;

      console.log(`[Rating] POST /api/orders/${orderId}/rate-driver`, {
        score,
        hasComment: !!comment,
      });

      // Authentification stricte via session client
      const authClientId = await getAuthenticatedClient(req);
      if (!authClientId) {
        console.error(`[Rating] Client not authenticated for order ${orderId}`);
        return res.status(401).json({ error: "Non authentifié" });
      }

      if (!score) {
        console.error(`[Rating] Missing score`);
        return res.status(400).json({ error: "score requis" });
      }

      if (score < 1 || score > 5) {
        return res.status(400).json({ error: "Le score doit être entre 1 et 5" });
      }

      // Récupérer la commande
      const order = await dbStorage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ error: "Commande non trouvée" });
      }

      // Vérifier que la commande appartient bien à ce client
      if (order.clientId !== authClientId) {
        console.error(`[Rating] Client ${authClientId} tried to rate order ${orderId} belonging to ${order.clientId}`);
        return res.status(403).json({ error: "Cette commande ne vous appartient pas" });
      }

      if (!order.assignedDriverId) {
        return res.status(400).json({ error: "Aucun chauffeur assigné à cette commande" });
      }

      // Vérifier que la commande est terminée
      if (!['completed', 'payment_confirmed', 'payment_pending'].includes(order.status)) {
        return res.status(400).json({ error: "La course doit être terminée pour noter" });
      }

      // Vérifier si déjà noté
      const existingRating = await dbStorage.getRatingByOrderAndRater(orderId, 'client');
      if (existingRating) {
        return res.status(400).json({ error: "Vous avez déjà noté cette course" });
      }

      // Créer la note
      const rating = await dbStorage.createRating({
        orderId,
        raterType: 'client',
        raterId: order.clientId || 'anonymous',
        ratedType: 'driver',
        ratedId: order.assignedDriverId,
        score,
        comment: comment || undefined,
      });

      console.log(`[Rating] Client rated driver ${order.assignedDriverId} with ${score} stars for order ${orderId}`);
      
      // Supprimer le token après la notation réussie pour nettoyer la mémoire
      // (mais seulement si le rating a été créé avec succès)
      orderClientTokens.delete(orderId);
      console.log(`[Rating] Token cleaned up for order ${orderId} after successful rating`);

      return res.json({ success: true, ratingId: rating.id });
    } catch (error) {
      console.error("Error rating driver:", error);
      return res.status(500).json({ error: "Erreur interne du serveur" });
    }
  });

  // Driver rates client after ride
  app.post("/api/orders/:id/rate-client", async (req, res) => {
    try {
      const orderId = req.params.id;
      const { sessionId, score, comment } = req.body;

      if (!sessionId || !score) {
        return res.status(400).json({ error: "sessionId et score requis" });
      }

      if (score < 1 || score > 5) {
        return res.status(400).json({ error: "Le score doit être entre 1 et 5" });
      }

      // Use fallback to recover session from database if not in memory (after server restart)
      const session = await getDriverSessionWithFallback(sessionId);
      if (!session) {
        return res.status(403).json({ error: "Session invalide" });
      }

      // Récupérer la commande
      const order = await dbStorage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ error: "Commande non trouvée" });
      }

      if (order.assignedDriverId !== session.driverId) {
        return res.status(403).json({ error: "Vous n'êtes pas le chauffeur de cette course" });
      }

      if (!order.clientId) {
        return res.status(400).json({ error: "Aucun client associé à cette commande" });
      }

      // Vérifier que la commande est terminée
      if (!['completed', 'payment_confirmed', 'payment_pending'].includes(order.status)) {
        return res.status(400).json({ error: "La course doit être terminée pour noter" });
      }

      // Vérifier si déjà noté
      const existingRating = await dbStorage.getRatingByOrderAndRater(orderId, 'driver');
      if (existingRating) {
        return res.status(400).json({ error: "Vous avez déjà noté cette course" });
      }

      // Créer la note
      const rating = await dbStorage.createRating({
        orderId,
        raterType: 'driver',
        raterId: session.driverId,
        ratedType: 'client',
        ratedId: order.clientId,
        score,
        comment: comment || undefined,
      });

      console.log(`[Rating] Driver ${session.driverId} rated client ${order.clientId} with ${score} stars for order ${orderId}`);

      return res.json({ success: true, ratingId: rating.id });
    } catch (error) {
      console.error("Error rating client:", error);
      return res.status(500).json({ error: "Erreur interne du serveur" });
    }
  });

  // Update waiting time for an order (called by client when ride starts)
  // Route pour gérer les arrêts (arrivée à l'arrêt, temps d'arrêt, reprise de la course)
  app.post("/api/orders/:id/stop", async (req, res) => {
    try {
      const orderId = req.params.id;
      const { action, stopIndex, stopMinutes, driverSessionId } = req.body;

      if (!action || !['arrive', 'finish', 'resume'].includes(action)) {
        return res.status(400).json({ error: "Action invalide (arrive, finish, ou resume requis)" });
      }

      // Valider la session chauffeur
      if (!driverSessionId) {
        return res.status(400).json({ error: "Session chauffeur requise" });
      }

      // Essayer d'abord la session en mémoire, puis la DB
      let session = storage.getDriverSession(driverSessionId);
      if (!session) {
        session = await dbStorage.getDbDriverSession(driverSessionId);
      }
      if (!session) {
        return res.status(401).json({ error: "Session chauffeur invalide" });
      }

      const order = await dbStorage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ error: "Commande non trouvée" });
      }

      // Log pour debug
      console.log(`[Stop] Validation chauffeur - Order assignedDriverId: ${order.assignedDriverId}, Session driverId: ${session.driverId}`);

      if (order.assignedDriverId !== session.driverId) {
        console.error(`[Stop] ERREUR: assignedDriverId (${order.assignedDriverId}) !== session.driverId (${session.driverId})`);
        return res.status(403).json({ error: "Vous n'êtes pas le chauffeur de cette course" });
      }

      let updatedOrder: Order | undefined;

      if (action === 'arrive') {
        // Arrivée à l'arrêt : changer le statut vers at_stop_X
        if (!stopIndex || stopIndex < 1 || stopIndex > 3) {
          return res.status(400).json({ error: "stopIndex invalide (1-3 requis)" });
        }

        const stopStatus: OrderStatus = `at_stop_${stopIndex}` as OrderStatus;
        updatedOrder = await dbStorage.updateOrderStatus(orderId, stopStatus);

        // Notifier le client et le chauffeur via Socket.IO
        const stopData = {
          orderId,
          status: `at_stop_${stopIndex}`,
          orderStatus: stopStatus,
          driverName: session.driverName || '',
          stopIndex, // Ajouter l'index de l'arrêt pour faciliter la gestion côté client
        };
        
        io.to(`order:${orderId}`).emit("ride:status:changed", stopData);
        
        // Notifier aussi le chauffeur pour synchronisation
        io.to(`driver:${session.driverId}`).emit("ride:status:changed", stopData);

        console.log(`[Stop] Chauffeur ${session.driverId} arrivé à l'arrêt ${stopIndex} pour la commande ${orderId}`);

      } else if (action === 'finish') {
        // Fin de l'arrêt : mettre à jour le temps d'arrêt facturé
        if (!stopIndex || stopIndex < 1 || stopIndex > 3) {
          return res.status(400).json({ error: "stopIndex invalide (1-3 requis)" });
        }
        if (stopMinutes === undefined || stopMinutes === null || typeof stopMinutes !== 'number' || stopMinutes < 0) {
          return res.status(400).json({ error: "stopMinutes invalide (nombre >= 0 requis)" });
        }

        // Mettre à jour le temps d'arrêt et recalculer le prix
        updatedOrder = await dbStorage.updateOrderStopTime(orderId, stopIndex, stopMinutes);

        // Notifier le client via Socket.IO (le statut reste à at_stop_X jusqu'à ce que le chauffeur reprenne)
        io.to(`order:${orderId}`).emit("ride:status:changed", {
          orderId,
          status: `at_stop_${stopIndex}_finished`,
          orderStatus: `at_stop_${stopIndex}`, // Le statut reste at_stop_X
          driverName: session.driverName || '',
          stopMinutes,
        });
        
        // Notifier aussi le chauffeur pour synchronisation
        io.to(`driver:${session.driverId}`).emit("ride:status:changed", {
          orderId,
          status: `at_stop_${stopIndex}_finished`,
          orderStatus: `at_stop_${stopIndex}`,
          driverName: session.driverName || '',
          stopMinutes,
        });

        console.log(`[Stop] Arrêt ${stopIndex} terminé : ${stopMinutes} min facturés pour la commande ${orderId}`);

      } else if (action === 'resume') {
        // Reprise de la course : repasser à in_progress
        updatedOrder = await dbStorage.updateOrderStatus(orderId, 'in_progress');

        // Notifier le client et le chauffeur via Socket.IO
        const resumeData = {
          orderId,
          status: 'inprogress',
          orderStatus: 'in_progress',
          driverName: session.driverName || '',
        };
        
        io.to(`order:${orderId}`).emit("ride:status:changed", resumeData);
        
        // Notifier aussi le chauffeur pour synchronisation
        io.to(`driver:${session.driverId}`).emit("ride:status:changed", resumeData);

        console.log(`[Stop] Chauffeur ${session.driverId} reprend la course après l'arrêt pour la commande ${orderId}`);
      }

      if (!updatedOrder) {
        return res.status(500).json({ error: "Erreur lors de la mise à jour" });
      }

      return res.json({ success: true, order: updatedOrder });
    } catch (error) {
      console.error("Error handling stop:", error);
      return res.status(500).json({ error: "Erreur interne du serveur" });
    }
  });

  app.post("/api/orders/:id/waiting-time", async (req, res) => {
    try {
      const orderId = req.params.id;
      let { waitingTimeMinutes } = req.body;

      // Récupérer la commande actuelle
      const order = await dbStorage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ error: "Commande non trouvée" });
      }

      // Calculate waiting time based on driverArrivedAt if available
      if (order.driverArrivedAt) {
        const arrivedAt = new Date(order.driverArrivedAt);
        const now = new Date();
        const diffMs = now.getTime() - arrivedAt.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        waitingTimeMinutes = diffMins;
        console.log(`[WaitingTime] Calculé à partir de driverArrivedAt: ${waitingTimeMinutes} min (arrivedAt: ${arrivedAt.toISOString()}, now: ${now.toISOString()})`);
      }

      // Accepter 0 comme valeur valide (pas d'attente)
      if (waitingTimeMinutes === undefined || waitingTimeMinutes === null || typeof waitingTimeMinutes !== 'number' || waitingTimeMinutes < 0) {
        return res.status(400).json({ error: "Temps d'attente invalide" });
      }

      // Vérifier que le statut est "driver_arrived" ou "in_progress" (le chauffeur l'envoie quand il clique "Démarrer la course")
      if (order.status !== 'in_progress' && order.status !== 'driver_arrived') {
        return res.status(400).json({ error: "La commande doit être en cours ou le chauffeur doit être arrivé pour enregistrer le temps d'attente" });
      }

      // Mettre à jour le temps d'attente et calculer le supplément
      const updatedOrder = await dbStorage.updateOrderStatus(orderId, 'in_progress', undefined, waitingTimeMinutes);
      
      if (updatedOrder) {
        // Broadcast the waiting time update to the order room
        io.to(`order:${orderId}`).emit("ride:status:changed", {
          orderId: orderId,
          status: "inprogress",
          orderStatus: updatedOrder.status,
          totalPrice: updatedOrder.totalPrice,
          driverEarnings: updatedOrder.driverEarnings,
          waitingTimeMinutes: updatedOrder.waitingTimeMinutes,
          paidStopsCost: (updatedOrder.rideOption as any)?.paidStopsCost || 0
        });

        return res.json({ 
          success: true, 
          waitingTimeMinutes: updatedOrder.waitingTimeMinutes,
          totalPrice: updatedOrder.totalPrice,
          waitingFee: updatedOrder.waitingTimeMinutes ? Math.max(0, (updatedOrder.waitingTimeMinutes - 5) * 42) : 0
        });
      }
    } catch (error) {
      console.error("Error updating waiting time:", error);
      return res.status(500).json({ error: "Erreur interne du serveur" });
    }
  });

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // âš ï¸ STABLE v1.0 - API ARRÃŠT PAYANT - NE PAS MODIFIER SANS DEMANDE
  // Cette route persiste le coÃ»t d'un arrÃªt payant dans la commande.
  // - Ajoute le coÃ»t au totalPrice existant (accumulation)
  // - VÃ©rifie la session chauffeur avant de modifier
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // Persist paid stop cost
  app.post("/api/orders/:id/paid-stop", async (req, res) => {
    try {
      const orderId = req.params.id;
      const { cost, durationMinutes, sessionId } = req.body;

      console.log(`[PAID_STOP API] POST /api/orders/${orderId}/paid-stop`, { cost, durationMinutes });

      const order = await dbStorage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ error: "Commande non trouvée" });
      }

      // Validate driver session with fallback
      if (sessionId) {
        const session = await getDriverSessionWithFallback(sessionId);
        if (!session || order.assignedDriverId !== session.driverId) {
          return res.status(403).json({ error: "Session invalide" });
        }
      }

      // Update the order's total price and persist paidStopsCost in rideOption
      const currentPrice = order.totalPrice || 0;
      const newPrice = currentPrice + cost;
      
      const currentPaidStopsCost = (order.rideOption as any)?.paidStopsCost || 0;
      const newPaidStopsCost = currentPaidStopsCost + cost;

      // Update driver earnings (85% of the added cost)
      const currentEarnings = order.driverEarnings || 0;
      const newEarnings = currentEarnings + (cost * 0.85);
      
      await db.update(orders)
        .set({
          totalPrice: newPrice,
          driverEarnings: newEarnings,
          rideOption: {
            ...order.rideOption,
            paidStopsCost: newPaidStopsCost
          }
        })
        .where(eq(orders.id, orderId));

      console.log(`[PAID_STOP API] Order ${orderId} price updated: ${currentPrice} -> ${newPrice} (+${cost} XPF). PaidStopsCost: ${newPaidStopsCost}`);

      // Broadcast the update to the order room
      io.to(`order:${orderId}`).emit("ride:status:changed", {
        orderId: orderId,
        totalPrice: newPrice,
        driverEarnings: newEarnings,
        paidStopsCost: newPaidStopsCost
      });

      return res.json({
        success: true,
        addedCost: cost,
        durationMinutes: durationMinutes,
        newTotalPrice: newPrice,
        newPaidStopsCost: newPaidStopsCost
      });
    } catch (error) {
      console.error("Error updating paid stop cost:", error);
      return res.status(500).json({ error: "Erreur interne du serveur" });
    }
  });

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // âš ï¸ STABLE v1.0 - STATUS ARRÃŠT PAYANT - NE PAS MODIFIER SANS DEMANDE
  // UtilisÃ©e pour la synchronisation client aprÃ¨s reconnexion
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // Get paid stop status (for client polling/reconnection)
  app.get("/api/orders/:id/paid-stop/status", async (req, res) => {
    try {
      const orderId = req.params.id;

      const order = await dbStorage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ error: "Commande non trouvée" });
      }

      const activePaidStop = activePaidStops.get(orderId);
      
      if (activePaidStop) {
        return res.json({
          active: true,
          startTime: activePaidStop.startTime,
          accumulatedSeconds: activePaidStop.accumulatedSeconds
        });
      } else {
        return res.json({
          active: false
        });
      }
    } catch (error) {
      console.error("Error getting paid stop status:", error);
      return res.status(500).json({ error: "Erreur interne du serveur" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // RÉSERVATION À L'AVANCE: Démarrer une course réservée
  // ═══════════════════════════════════════════════════════════════════════════
  app.post("/api/orders/:id/start-booking", async (req, res) => {
    try {
      const orderId = req.params.id;
      const sessionId = req.headers["x-driver-session"] as string;
      
      if (!sessionId) {
        return res.status(401).json({ error: "Session manquante" });
      }
      
      // Use fallback to recover session from database if not in memory (after server restart)
      const session = await getDriverSessionWithFallback(sessionId);
      if (!session) {
        return res.status(401).json({ error: "Session invalide" });
      }
      
      const order = await dbStorage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ error: "Commande non trouvée" });
      }
      
      // Vérifier que le chauffeur est bien assigné à cette commande
      if (order.assignedDriverId !== session.driverId) {
        return res.status(403).json({ error: "Vous n'êtes pas assigné à cette course" });
      }
      
      // Vérifier que la commande est bien une réservation
      if (order.status !== 'booked') {
        return res.status(400).json({ error: "Cette commande n'est pas une réservation en attente" });
      }
      
      // Mettre à jour le statut vers "accepted" pour démarrer la course
      const updatedOrder = await dbStorage.updateOrderStatus(orderId, "accepted", session.driverId);
      
      if (updatedOrder) {
        console.log(`[BOOKING:START] Booking ${orderId} started by driver ${session.driverName}`);
        
        // Notifier le client que la course démarre
        io.to(`order:${orderId}`).emit("ride:status:changed", {
          orderId,
          status: "accepted",
          driverName: session.driverName,
          timestamp: Date.now()
        });
        
        return res.json({ success: true, order: updatedOrder });
      } else {
        return res.status(500).json({ error: "Erreur lors du démarrage de la course" });
      }
    } catch (error) {
      console.error("Error starting booking:", error);
      return res.status(500).json({ error: "Erreur interne du serveur" });
    }
  });

  // Check if rating exists for an order
  app.get("/api/orders/:id/rating-status", async (req, res) => {
    try {
      const orderId = req.params.id;
      const { role } = req.query;

      if (!role || !['client', 'driver'].includes(role as string)) {
        return res.status(400).json({ error: "Role requis (client ou driver)" });
      }

      const existingRating = await dbStorage.getRatingByOrderAndRater(orderId, role as 'client' | 'driver');

      return res.json({
        hasRated: !!existingRating,
        rating: existingRating ? { score: existingRating.score, comment: existingRating.comment } : null,
      });
    } catch (error) {
      console.error("Error checking rating status:", error);
      return res.status(500).json({ error: "Erreur interne du serveur" });
    }
  });

  // HTTP endpoint to force cleanup orphan orders (no driver assigned for too long)
  app.post("/api/orders/cleanup-orphans", async (req, res) => {
    try {
      const allOrders = await dbStorage.getAllOrders();
      const now = new Date();
      const ORPHAN_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
      
      let cleanedCount = 0;
      
      for (const order of allOrders) {
        // Commandes en attente sans chauffeur depuis plus de 10 minutes
        if (order.status === 'pending' && !order.assignedDriverId) {
          const orderAge = now.getTime() - new Date(order.createdAt).getTime();
          if (orderAge > ORPHAN_TIMEOUT_MS) {
            await dbStorage.updateOrderStatus(order.id, 'expired');
            io.to(`order:${order.id}`).emit("ride:cancelled", {
              orderId: order.id,
              cancelledBy: 'system',
              reason: 'Aucun chauffeur disponible - commande expirée',
            });
            cleanedCount++;
            console.log(`[CLEANUP] Order ${order.id} expired (no driver for ${Math.round(orderAge / 60000)} minutes)`);
          }
        }
        
        // Commandes "orphelines" avec chauffeur assigné mais inactif depuis longtemps
        if (['accepted', 'driver_enroute', 'driver_arrived', 'in_progress'].includes(order.status)) {
          const orderAge = now.getTime() - new Date(order.updatedAt || order.createdAt).getTime();
          // 1 heure d'inactivité = probablement abandonnée
          if (orderAge > 60 * 60 * 1000) {
            await dbStorage.updateOrderStatus(order.id, 'expired');
            io.to(`order:${order.id}`).emit("ride:cancelled", {
              orderId: order.id,
              cancelledBy: 'system',
              reason: 'Course expirée - trop longue inactivité',
            });
            cleanedCount++;
            console.log(`[CLEANUP] Order ${order.id} expired (inactive for ${Math.round(orderAge / 3600000)} hours)`);
          }
        }
      }
      
      return res.json({ 
        success: true, 
        message: `${cleanedCount} commande(s) nettoyée(s)`,
        cleanedCount 
      });
    } catch (error) {
      console.error("Error cleaning up orders:", error);
      return res.status(500).json({ error: "Erreur lors du nettoyage" });
    }
  });

  // Update order status (HTTP fallback for socket)
  app.patch("/api/orders/:id/status", async (req, res) => {
    try {
      const orderId = req.params.id;
      const { status, driverSessionId } = req.body;
      
      if (!status || !driverSessionId) {
        return res.status(400).json({ error: "Status and driverSessionId required" });
      }
      
      // Use fallback to recover session from database if not in memory (after server restart)
      const session = await getDriverSessionWithFallback(driverSessionId);
      if (!session) {
        return res.status(401).json({ error: "Invalid driver session" });
      }
      
      const order = await dbStorage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      
      // Verify driver is assigned to this order
      if (order.assignedDriverId !== session.driverId) {
        return res.status(403).json({ error: "Not assigned to this order" });
      }
      
      const validStatuses = ['driver_enroute', 'driver_arrived', 'in_progress', 'completed', 'payment_pending', 'payment_confirmed'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }
      
      const driverArrivedAtFromBody = req.body.driverArrivedAt as string | undefined;
      const arrivedAtForUpdate = status === 'driver_arrived'
        ? (driverArrivedAtFromBody ? new Date(driverArrivedAtFromBody) : new Date())
        : undefined;
      
      const updatedOrder = await dbStorage.updateOrderStatus(
        orderId, 
        status as OrderStatus, 
        undefined, 
        undefined, 
        arrivedAtForUpdate
      );
      
      if (updatedOrder) {
        // Notify via socket as well
        io.to(`order:${orderId}`).emit("ride:status:changed", {
          orderId,
          status: status,
          orderStatus: status,
          driverName: session.driverName,
          driverArrivedAt: updatedOrder.driverArrivedAt,
          totalPrice: updatedOrder.totalPrice,
          driverEarnings: updatedOrder.driverEarnings,
          waitingTimeMinutes: updatedOrder.waitingTimeMinutes
        });
        
        console.log(`[HTTP] Order status updated: ${orderId} -> ${status}`);
        return res.json({ success: true, order: updatedOrder });
      }
      
      return res.status(500).json({ error: "Failed to update status" });
    } catch (error) {
      console.error("Error updating order status:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  // Create driver session (on login)
  app.post("/api/driver-sessions", async (req, res) => {
    try {
      const { driverId, driverName } = req.body;
      
      if (!driverId || !driverName) {
        return res.status(400).json({ error: "Missing driverId or driverName" });
      }
      
      const session = await storage.createDriverSession(driverId, driverName);
      res.json({ success: true, session });
    } catch (error) {
      console.error("Error creating driver session:", error);
      res.status(500).json({ error: "Failed to create session" });
    }
  });
  
  // Update driver online status
  app.patch("/api/driver-sessions/:id/status", async (req, res) => {
    try {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/18c9163f-4b67-4579-b7aa-ab0aff42521f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'routes.ts:2360',message:'PATCH /api/driver-sessions/:id/status - Entry',data:{sessionId:req.params.id,isOnline:req.body.isOnline},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B'})}).catch(()=>{});
      // #endregion
      
      const { isOnline } = req.body;
      let session = await storage.updateDriverOnlineStatus(req.params.id, isOnline);
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/18c9163f-4b67-4579-b7aa-ab0aff42521f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'routes.ts:2365',message:'After storage.updateDriverOnlineStatus',data:{sessionFound:!!session,sessionId:req.params.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B'})}).catch(()=>{});
      // #endregion
      
      // Si la session n'existe pas en mémoire, vérifier en base de données (fallback après redémarrage)
      if (!session) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/18c9163f-4b67-4579-b7aa-ab0aff42521f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'routes.ts:2370',message:'Session not in memory, checking database',data:{sessionId:req.params.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        
        const dbSession = await dbStorage.getDbDriverSession(req.params.id);
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/18c9163f-4b67-4579-b7aa-ab0aff42521f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'routes.ts:2375',message:'Database session check result',data:{dbSessionFound:!!dbSession,sessionId:req.params.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        
        if (dbSession) {
          // Recréer la session en mémoire avec les données de la base
          session = await storage.createDriverSession(dbSession.driverId, dbSession.driverName);
          // S'assurer que l'ID de session correspond
          if (session.id !== dbSession.id) {
            // Si l'ID ne correspond pas, mettre à jour le statut en base directement
            await db.update(driverSessions)
              .set({ isOnline })
              .where(eq(driverSessions.id, dbSession.id));
            
            // Retourner un format compatible
            return res.json({ 
              success: true, 
              session: {
                id: dbSession.id,
                driverId: dbSession.driverId,
                driverName: dbSession.driverName,
                isOnline,
                expiresAt: dbSession.expiresAt,
              }
            });
          }
          // Mettre à jour le statut de la session recréée
          session = await storage.updateDriverOnlineStatus(session.id, isOnline);
        }
      }
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/18c9163f-4b67-4579-b7aa-ab0aff42521f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'routes.ts:2400',message:'Final session check before response',data:{sessionFound:!!session,sessionId:req.params.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B'})}).catch(()=>{});
      // #endregion
      
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      
      // Mettre à jour aussi en base de données pour la persistance
      try {
        await db.update(driverSessions)
          .set({ isOnline })
          .where(eq(driverSessions.id, session.id));
      } catch (dbError) {
        // Ignorer l'erreur si la session n'existe pas en base (peut arriver pour les anciennes sessions)
        console.log(`[Session Status] Could not update DB session ${session.id}:`, dbError);
      }
      
      res.json({ success: true, session });
    } catch (error) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/18c9163f-4b67-4579-b7aa-ab0aff42521f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'routes.ts:2415',message:'Error in status update endpoint',data:{error:error instanceof Error ? error.message : 'Unknown',sessionId:req.params.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B'})}).catch(()=>{});
      // #endregion
      console.error("Error updating driver status:", error);
      res.status(500).json({ error: "Failed to update status" });
    }
  });
  
  // Get driver session
  app.get("/api/driver-sessions/:id", async (req, res) => {
    // First try in-memory session
    let session = await storage.getDriverSession(req.params.id);
    
    if (!session) {
      // Fallback to database session (survives server restart)
      const dbSession = await dbStorage.getDbDriverSession(req.params.id);
      if (dbSession) {
        console.log(`[Session] Found session ${req.params.id} via DB fallback, isOnline from DB: ${dbSession.isOnline}`);
        // Return a compatible format with the actual isOnline value from database
        return res.json({
          id: dbSession.id,
          driverId: dbSession.driverId,
          driverName: dbSession.driverName,
          isOnline: dbSession.isOnline, // Garder le statut sauvegardé en base de données
          socketIds: [],
          createdAt: dbSession.createdAt,
          expiresAt: dbSession.expiresAt,
        });
      }
      return res.status(404).json({ error: "Session not found" });
    }
    res.json(session);
  });

  // ============ Push Notification Routes ============
  
  // Get VAPID public key (for client to subscribe)
  // ============ TARIFS PUBLICS (pour l'app client) ============
  app.get("/api/tarifs", async (req, res) => {
    try {
      const allTarifs = await dbStorage.getAllTarifs();
      return res.json(allTarifs);
    } catch (error) {
      console.error("Get public tarifs error:", error);
      // Si la table n'existe pas encore, retourner un tableau vide
      if (error instanceof Error && error.message.includes('does not exist')) {
        return res.json([]);
      }
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });

  app.get("/api/supplements", async (req, res) => {
    try {
      const allSupplements = await dbStorage.getAllSupplements();
      return res.json(allSupplements.filter(s => s.actif));
    } catch (error) {
      console.error("Get public supplements error:", error);
      if (error instanceof Error && error.message.includes('does not exist')) {
        return res.json([]);
      }
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });

  // ============ COMMISSIONS API (pour l'app chauffeur) ============
  
  // Get all commissions (public - used by driver app)
  app.get("/api/commissions", async (req, res) => {
    try {
      // Initialize default commissions if needed
      await dbStorage.createDefaultCommissions();
      
      const allCommissions = await dbStorage.getCommissions();
      return res.json({
        success: true,
        commissions: allCommissions
      });
    } catch (error) {
      console.error("Get commissions error:", error);
      if (error instanceof Error && error.message.includes('does not exist')) {
        // Return default commissions if table doesn't exist
        // Note: Ces valeurs doivent correspondre à la configuration du dashboard
        return res.json({
          success: true,
          commissions: [
            {
              id: "default-salarie",
              typeChauffeur: "salarie",
              nomAffichage: "Chauffeur Salarié",
              pourcentageChauffeur: 34,
              pourcentageCommission: 66,
              description: "Commission pour les chauffeurs salariés TAPEA",
              actif: true,
            },
            {
              id: "default-patente",
              typeChauffeur: "patente",
              nomAffichage: "Chauffeur Patenté (Indépendant)",
              pourcentageChauffeur: 92,
              pourcentageCommission: 8,
              description: "Commission pour les chauffeurs indépendants/patentés",
              actif: true,
            }
          ]
        });
      }
      return res.status(500).json({ success: false, error: "Erreur serveur" });
    }
  });

  // Get commission for a specific driver type
  app.get("/api/commissions/:typeChauffeur", async (req, res) => {
    try {
      const { typeChauffeur } = req.params;
      const commission = await dbStorage.getCommissionByType(typeChauffeur);
      
      if (!commission) {
        return res.status(404).json({ success: false, error: "Commission non trouvée" });
      }
      
      return res.json({ success: true, commission });
    } catch (error) {
      console.error("Get commission by type error:", error);
      return res.status(500).json({ success: false, error: "Erreur serveur" });
    }
  });

  // Update commission (called from dashboard)
  app.post("/api/commissions/sync", async (req, res) => {
    try {
      const { id, pourcentageChauffeur } = req.body;
      
      if (!id || pourcentageChauffeur === undefined) {
        return res.status(400).json({ success: false, error: "Missing id or pourcentageChauffeur" });
      }
      
      if (pourcentageChauffeur < 0 || pourcentageChauffeur > 100) {
        return res.status(400).json({ success: false, error: "Le pourcentage doit être entre 0 et 100" });
      }
      
      const updated = await dbStorage.updateCommission(id, pourcentageChauffeur);
      
      if (!updated) {
        return res.status(404).json({ success: false, error: "Commission non trouvée" });
      }
      
      console.log(`[COMMISSION] Updated ${updated.typeChauffeur}: ${updated.pourcentageChauffeur}% chauffeur / ${updated.pourcentageCommission}% TAPEA`);
      
      return res.json({ success: true, commission: updated });
    } catch (error) {
      console.error("Update commission error:", error);
      return res.status(500).json({ success: false, error: "Erreur serveur" });
    }
  });

  // ============ FRAIS DE SERVICE CONFIG API ============
  
  // Get frais de service configuration (public - used by mobile apps)
  app.get("/api/frais-service-config", async (req, res) => {
    try {
      const config = await dbStorage.getFraisServiceConfig();
      return res.json({
        success: true,
        config: config || {
          fraisServicePrestataire: 15,
          commissionPrestataire: 0,
          commissionSalarieTapea: 0,
        }
      });
    } catch (error) {
      console.error("Get frais service config error:", error);
      // Return default values on error
      return res.json({
        success: true,
        config: {
          fraisServicePrestataire: 15,
          commissionPrestataire: 0,
          commissionSalarieTapea: 0,
        }
      });
    }
  });

  // Update frais de service configuration (admin only)
  app.post("/api/frais-service-config", async (req, res) => {
    try {
      const { fraisServicePrestataire, commissionPrestataire, commissionSalarieTapea } = req.body;
      
      // Validate inputs
      if (fraisServicePrestataire !== undefined && (fraisServicePrestataire < 0 || fraisServicePrestataire > 100)) {
        return res.status(400).json({ success: false, error: "Les frais de service doivent être entre 0 et 100" });
      }
      if (commissionPrestataire !== undefined && (commissionPrestataire < 0 || commissionPrestataire > 100)) {
        return res.status(400).json({ success: false, error: "La commission prestataire doit être entre 0 et 100" });
      }
      if (commissionSalarieTapea !== undefined && (commissionSalarieTapea < 0 || commissionSalarieTapea > 100)) {
        return res.status(400).json({ success: false, error: "La commission salarié TAPEA doit être entre 0 et 100" });
      }
      
      const updated = await dbStorage.updateFraisServiceConfig({
        fraisServicePrestataire,
        commissionPrestataire,
        commissionSalarieTapea,
      });
      
      console.log(`[FRAIS_SERVICE] Config updated: fraisService=${updated.fraisServicePrestataire}%, commissionPrestataire=${updated.commissionPrestataire}%, commissionSalarie=${updated.commissionSalarieTapea}%`);
      
      return res.json({ success: true, config: updated });
    } catch (error) {
      console.error("Update frais service config error:", error);
      return res.status(500).json({ success: false, error: "Erreur serveur" });
    }
  });

  app.get("/api/push/vapid-public-key", (req, res) => {
    if (!VAPID_PUBLIC_KEY) {
      return res.status(503).json({ error: "Push notifications not configured" });
    }
    res.json({ publicKey: VAPID_PUBLIC_KEY });
  });
  
  // Subscribe a driver to push notifications (requires valid driver session)
  app.post("/api/push/subscribe", async (req, res) => {
    try {
      const { sessionId, subscription } = req.body;
      
      if (!sessionId) {
        return res.status(400).json({ error: "Missing sessionId" });
      }
      
      // Use fallback to recover session from database if not in memory (after server restart)
      const session = await getDriverSessionWithFallback(sessionId);
      if (!session) {
        return res.status(401).json({ error: "Invalid or expired session" });
      }
      
      // Validate subscription format
      const validatedSub = pushSubscriptionSchema.parse(subscription);
      
      // Use the driverId from the verified session
      const driverSub = await storage.savePushSubscription(session.driverId, validatedSub);
      console.log(`[PUSH] Driver ${session.driverName} (${session.driverId}) subscribed to push notifications`);
      
      res.json({ success: true, subscription: driverSub });
    } catch (error) {
      console.error("[PUSH] Subscription error:", error);
      res.status(400).json({ error: "Invalid subscription data" });
    }
  });
  
  // Unsubscribe a driver from push notifications (requires valid driver session)
  app.delete("/api/push/subscribe/:sessionId", async (req, res) => {
    const { sessionId } = req.params;
    
    // Use fallback to recover session from database if not in memory (after server restart)
    const session = await getDriverSessionWithFallback(sessionId);
    if (!session) {
      return res.status(401).json({ error: "Invalid or expired session" });
    }
    
    const removed = await storage.removePushSubscription(session.driverId);
    if (removed) {
      console.log(`[PUSH] Driver ${session.driverName} (${session.driverId}) unsubscribed from push notifications`);
      res.json({ success: true });
    } else {
      res.status(404).json({ error: "Subscription not found" });
    }
  });
  
  // Check if driver is subscribed to push (requires valid driver session)
  app.get("/api/push/status/:sessionId", async (req, res) => {
    const { sessionId } = req.params;
    
    // Use fallback to recover session from database if not in memory (after server restart)
    const session = await getDriverSessionWithFallback(sessionId);
    if (!session) {
      return res.status(401).json({ error: "Invalid or expired session" });
    }
    
    const subscription = await storage.getPushSubscription(session.driverId);
    res.json({ subscribed: !!subscription });
  });

  // ========================
  // CLIENT AUTHENTICATION ROUTES
  // ========================
  
  // Register a new client
  app.post("/api/auth/register", async (req, res) => {
    try {
      const validatedData = insertClientSchema.parse(req.body);
      
      // Check if phone already exists
      const existingClient = await dbStorage.getClientByPhone(validatedData.phone);
      if (existingClient) {
        return res.status(409).json({ error: "Ce numéro de téléphone est déjà utilisé" });
      }
      
      // Create client in database (NOT verified yet - will be verified after SMS code)
      const client = await dbStorage.createClient(validatedData);
      // Don't mark as verified yet - wait for SMS verification
      await dbStorage.updateClientVerified(client.id, false);
      
      // Send verification code via Twilio
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/18c9163f-4b67-4579-b7aa-ab0aff42521f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server/routes.ts:1935',message:'Before Twilio check',data:{clientId:client.id,phone:client.phone,NODE_ENV:process.env.NODE_ENV},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      const isDev = process.env.NODE_ENV !== "production";
      const twilioConfigured = isTwilioConfigured();
      let shouldUseDevCode = !twilioConfigured || isDev; // Par défaut, utiliser le code dev si Twilio n'est pas configuré ou en dev
      let smsSuccess = false;
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/18c9163f-4b67-4579-b7aa-ab0aff42521f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server/routes.ts:1938',message:'Twilio config check',data:{isDev,twilioConfigured,hasTWILIO_ACCOUNT_SID:!!process.env.TWILIO_ACCOUNT_SID,hasTWILIO_AUTH_TOKEN:!!process.env.TWILIO_AUTH_TOKEN,hasTWILIO_VERIFY_SERVICE_SID:!!process.env.TWILIO_VERIFY_SERVICE_SID},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      
      if (twilioConfigured) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/18c9163f-4b67-4579-b7aa-ab0aff42521f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server/routes.ts:1942',message:'Before sendVerificationCode',data:{phone:client.phone},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        const smsResult = await sendVerificationCode(client.phone);
        console.log(`[REGISTER] Résultat Twilio SMS:`, { success: smsResult.success, error: smsResult.error });
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/18c9163f-4b67-4579-b7aa-ab0aff42521f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server/routes.ts:1944',message:'After sendVerificationCode',data:{success:smsResult.success,error:smsResult.error},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        if (!smsResult.success) {
          console.error(`[REGISTER] ❌ Échec envoi SMS Twilio: ${smsResult.error}`);
          
          // Si l'erreur est liée à l'authentification Twilio (credentials invalides), basculer en mode dev
          const isAuthError = smsResult.error?.includes('Authenticate') || smsResult.error?.includes('credentials') || smsResult.error?.includes('Configuration Twilio invalide');
          
          if (isAuthError) {
            console.warn(`[REGISTER] Credentials Twilio invalides - basculement en mode dev pour cette inscription`);
            shouldUseDevCode = true; // Forcer l'utilisation du code dev si erreur d'auth
          } else if (!isDev) {
            // En production, on rejette si Twilio échoue (sauf erreur d'auth)
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/18c9163f-4b67-4579-b7aa-ab0aff42521f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server/routes.ts:1947',message:'Twilio failed, attempting delete',data:{clientId:client.id,smsError:smsResult.error,isDev},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
            // Essayer de supprimer le client créé (avec try/catch au cas où la méthode n'existe pas)
            try {
              if (typeof dbStorage.deleteClient === 'function') {
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/18c9163f-4b67-4579-b7aa-ab0aff42521f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server/routes.ts:1950',message:'Calling deleteClient',data:{clientId:client.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
                // #endregion
                await dbStorage.deleteClient(client.id);
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/18c9163f-4b67-4579-b7aa-ab0aff42521f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server/routes.ts:1953',message:'deleteClient success',data:{clientId:client.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
                // #endregion
              } else {
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/18c9163f-4b67-4579-b7aa-ab0aff42521f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server/routes.ts:1956',message:'deleteClient not found, using fallback',data:{clientId:client.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
                // #endregion
                // Fallback: supprimer directement via SQL si la méthode n'existe pas
                const { db } = await import("./db");
                const { clients } = await import("@shared/schema");
                const { eq } = await import("drizzle-orm");
                await db.delete(clients).where(eq(clients.id, client.id));
              }
            } catch (deleteError) {
              console.error(`[REGISTER] Impossible de supprimer le client créé:`, deleteError);
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/18c9163f-4b67-4579-b7aa-ab0aff42521f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server/routes.ts:1961',message:'deleteClient error',data:{clientId:client.id,errorMessage:deleteError instanceof Error?deleteError.message:String(deleteError)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
              // #endregion
              // On continue quand même - le client restera en base mais non vérifié
            }
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/18c9163f-4b67-4579-b7aa-ab0aff42521f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server/routes.ts:1965',message:'Returning 500 error',data:{smsError:smsResult.error},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
            // #endregion
            return res.status(500).json({ error: smsResult.error || "Erreur lors de l'envoi du code SMS" });
          } else {
            // En dev, si Twilio échoue, utiliser le code dev
            shouldUseDevCode = true;
          }
          // En dev ou si erreur d'auth, on accepte avec code de secours
          console.warn(`[REGISTER] Mode dev ou Twilio invalide - SMS échoué, utilisation du code de secours`);
        } else {
          smsSuccess = true;
        }
      } else {
        console.warn(`[REGISTER] Twilio non configuré - utilisation du mode dev`);
      }
      
      // In development or if Twilio is not configured or if SMS failed, provide a dev code
      res.json({ 
        success: true,
        needsVerification: true,
        phone: client.phone,
        message: (twilioConfigured && smsSuccess) ? "Code de vérification envoyé par SMS" : "Mode développement - utilisez le code de secours",
        ...(shouldUseDevCode && { devCode: "111111" })
      });
    } catch (error: any) {
      console.error("Error registering client:", error);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/18c9163f-4b67-4579-b7aa-ab0aff42521f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server/routes.ts:1988',message:'Register catch error',data:{errorMessage:error instanceof Error?error.message:String(error),errorName:error instanceof Error?error.name:'unknown',errorCode:error.code,errorStack:error instanceof Error?error.stack:undefined,hasErrors:!!error.errors},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      if (error.errors) {
        return res.status(400).json({ error: error.errors[0]?.message || "Données invalides" });
      }
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/18c9163f-4b67-4579-b7aa-ab0aff42521f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server/routes.ts:2017',message:'Returning generic 400/500 error',data:{errorMessage:error instanceof Error?error.message:String(error),errorCode:error.code,errorName:error instanceof Error?error.name:'unknown'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      
      // Si l'erreur est "Authenticate" (Twilio credentials invalides), retourner un message plus clair
      const isAuthError = error.message === 'Authenticate' || error.message?.includes('Authenticate');
      if (isAuthError) {
        console.error('[REGISTER] Erreur Twilio Authenticate détectée dans catch général');
        // En production, retourner une erreur mais permettre le mode dev
        const isDev = process.env.NODE_ENV !== "production";
        if (!isDev) {
          return res.status(500).json({ error: "Configuration Twilio invalide. Vérifiez les credentials sur Render." });
        }
      }
      
      const statusCode = isAuthError ? 500 : 400;
      res.status(statusCode).json({ error: error.message || "Erreur lors de l'inscription" });
    }
  });
  
  // Verify registration code
  app.post("/api/auth/verify", async (req, res) => {
    try {
      const { phone, code, type } = req.body;
      
      console.log(`[VERIFY] Phone: ${phone}, Code: ${code}, Type: ${type}, NODE_ENV: ${process.env.NODE_ENV}`);
      
      if (!phone || !code) {
        return res.status(400).json({ error: "Téléphone et code requis" });
      }
      
      // Get client first
      const client = await dbStorage.getClientByPhone(phone);
      if (!client) {
        return res.status(404).json({ error: "Client non trouvé" });
      }
      
      // Verify code via Twilio or fallback to dev mode
      const isDev = process.env.NODE_ENV !== "production";
      const twilioConfigured = isTwilioConfigured();
      const codeStr = String(code).trim();
      let isCodeValid = false;
      
      // In development, accept 111111 as universal code (fallback)
      if (isDev && codeStr === "111111") {
        console.log(`[VERIFY] Accepting dev code 111111`);
        isCodeValid = true;
      } else if (twilioConfigured) {
        // Use Twilio Verify Service
        console.log(`[VERIFY] Vérification via Twilio...`);
        const verifyResult = await verifyCode(phone, codeStr);
        if (!verifyResult.success) {
          return res.status(400).json({ error: verifyResult.error || "Erreur lors de la vérification" });
        }
        isCodeValid = verifyResult.verified;
        if (!isCodeValid) {
          return res.status(400).json({ error: verifyResult.error || "Code invalide ou expiré" });
        }
      } else {
        // Fallback to database verification if Twilio not configured
        console.log(`[VERIFY] Twilio non configuré - vérification via base de données...`);
        const verificationCode = await dbStorage.getVerificationCode(phone, codeStr, type || "registration");
        if (!verificationCode) {
          return res.status(400).json({ error: "Code invalide ou expiré" });
        }
        // Mark code as used
        await dbStorage.markVerificationCodeUsed(verificationCode.id);
        isCodeValid = true;
      }
      
      if (!isCodeValid) {
        return res.status(400).json({ error: "Code invalide ou expiré" });
      }
      
      // Mark client as verified
      await dbStorage.updateClientVerified(client.id, true);
      console.log(`[VERIFY] Client ${client.id} marqué comme vérifié`);
      
      // Create session
      const session = await dbStorage.createClientSession(client.id);
      
      // Set session cookie
      res.cookie("clientSessionId", session.id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        sameSite: "lax"
      });
      
      res.json({ 
        success: true,
        client: {
          id: client.id,
          phone: client.phone,
          firstName: client.firstName,
          lastName: client.lastName,
          walletBalance: client.walletBalance,
          averageRating: client.averageRating,
          totalRides: client.totalRides,
          // CGU et politique de confidentialité
          cguAccepted: client.cguAccepted || false,
          cguAcceptedAt: client.cguAcceptedAt || null,
          cguVersion: client.cguVersion || null,
          privacyPolicyRead: client.privacyPolicyRead || false,
          privacyPolicyReadAt: client.privacyPolicyReadAt || null,
          privacyPolicyVersion: client.privacyPolicyVersion || null,
        },
        session: {
          id: session.id,
        }
      });
    } catch (error) {
      console.error("Error verifying code:", error);
      res.status(500).json({ error: "Erreur de vérification" });
    }
  });
  
  // Login with phone
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { phone, password } = req.body;
      
      if (!phone || !password) {
        return res.status(400).json({ error: "Téléphone et mot de passe requis" });
      }
      
      const client = await dbStorage.getClientByPhone(phone);
      if (!client) {
        return res.status(401).json({ error: "Numéro de téléphone ou mot de passe incorrect" });
      }
      
      if (!verifyPassword(password, client.hashedPassword)) {
        return res.status(401).json({ error: "Numéro de téléphone ou mot de passe incorrect" });
      }
      
      if (!client.isVerified) {
        // Send verification code via Twilio
        const isDev = process.env.NODE_ENV !== "production";
        const twilioConfigured = isTwilioConfigured();
        
        if (twilioConfigured) {
          const smsResult = await sendVerificationCode(client.phone);
          if (!smsResult.success) {
            console.error(`[LOGIN] Échec envoi SMS Twilio: ${smsResult.error}`);
            // En cas d'échec Twilio, on peut soit utiliser le code de secours en dev, soit rejeter
            if (!isDev) {
              return res.status(500).json({ error: smsResult.error || "Erreur lors de l'envoi du code SMS" });
            }
            console.warn(`[LOGIN] Mode dev - SMS échoué, utilisation du code de secours`);
          }
        } else {
          // Fallback to database verification code
          const verificationCode = await dbStorage.createVerificationCode(phone, "login");
          console.log(`[SMS] Code de connexion pour ${phone}: ${verificationCode.code}`);
        }
        
        return res.status(403).json({ 
          error: "Compte non vérifié", 
          needsVerification: true,
          phone: client.phone,
          message: twilioConfigured ? "Code de vérification envoyé par SMS" : "Mode développement - utilisez le code de secours",
          ...((isDev || !twilioConfigured) && { devCode: "111111" })
        });
      }
      
      // Create session
      const session = await dbStorage.createClientSession(client.id);
      
      // Set session cookie
      res.cookie("clientSessionId", session.id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: 7 * 24 * 60 * 60 * 1000,
        sameSite: "lax"
      });
      
      res.json({ 
        success: true,
        client: {
          id: client.id,
          phone: client.phone,
          firstName: client.firstName,
          lastName: client.lastName,
          email: client.email,
          photoUrl: client.photoUrl,
          walletBalance: client.walletBalance,
          averageRating: client.averageRating,
          totalRides: client.totalRides,
          // CGU et politique de confidentialité
          cguAccepted: client.cguAccepted || false,
          cguAcceptedAt: client.cguAcceptedAt || null,
          cguVersion: client.cguVersion || null,
          privacyPolicyRead: client.privacyPolicyRead || false,
          privacyPolicyReadAt: client.privacyPolicyReadAt || null,
          privacyPolicyVersion: client.privacyPolicyVersion || null,
        },
        session: {
          id: session.id,
        }
      });
    } catch (error) {
      console.error("Error logging in:", error);
      res.status(500).json({ error: "Erreur de connexion" });
    }
  });
  
  // Logout
  app.post("/api/auth/logout", async (req, res) => {
    const sessionId = req.cookies?.clientSessionId;
    if (sessionId) {
      await dbStorage.deleteClientSession(sessionId);
    }
    res.clearCookie("clientSessionId");
    res.json({ success: true });
  });
  
  // Get current client (check session)
  app.get("/api/auth/me", async (req, res) => {
    // Session depuis cookie (web) OU header explicite (React Native)
    const headerSessionRaw = (req.headers["x-client-session-id"] as string | undefined) || "";
    const headerSessionId = headerSessionRaw.split(",")[0].trim() || undefined;
    
    const rawCookieSessionId = req.cookies?.clientSessionId as string | undefined;
    const cookieSessionId = rawCookieSessionId?.split(",")[0].trim() || undefined;
    
    // Privilégier le header (mobile) puis le cookie (web)
    const sessionId = headerSessionId || cookieSessionId;
    
    if (!sessionId) {
      return res.status(401).json({ error: "Non authentifié" });
    }
    
    const session = await dbStorage.getClientSession(sessionId);
    if (!session) {
      res.clearCookie("clientSessionId");
      return res.status(401).json({ error: "Session expirée" });
    }
    
    const client = await dbStorage.getClient(session.clientId);
    if (!client) {
      res.clearCookie("clientSessionId");
      return res.status(401).json({ error: "Client non trouvé" });
    }
    
    // Refresh session
    await dbStorage.refreshClientSession(sessionId);
    
    res.json({
      id: client.id,
      phone: client.phone,
      firstName: client.firstName,
      lastName: client.lastName,
      email: client.email,
      photoUrl: client.photoUrl,
      walletBalance: client.walletBalance,
      averageRating: client.averageRating,
      totalRides: client.totalRides,
      // CGU et politique de confidentialité
      cguAccepted: client.cguAccepted || false,
      cguAcceptedAt: client.cguAcceptedAt || null,
      cguVersion: client.cguVersion || null,
      privacyPolicyRead: client.privacyPolicyRead || false,
      privacyPolicyReadAt: client.privacyPolicyReadAt || null,
      privacyPolicyVersion: client.privacyPolicyVersion || null,
    });
  });

  // Mettre à jour les acceptations légales d'un client
  app.patch("/api/clients/:id/legal", async (req, res) => {
    try {
      const clientId = req.params.id;
      
      // Vérifier l'authentification via header ou cookie
      const headerSessionRaw = (req.headers["x-client-session-id"] as string | undefined) || 
                               (req.headers["x-client-session"] as string | undefined) || "";
      const headerSessionId = headerSessionRaw.split(",")[0].trim() || undefined;
      const rawCookieSessionId = req.cookies?.clientSessionId as string | undefined;
      const cookieSessionId = rawCookieSessionId?.split(",")[0].trim() || undefined;
      const sessionId = headerSessionId || cookieSessionId;
      
      if (!sessionId) {
        return res.status(401).json({ error: "Session requise" });
      }
      
      const session = await dbStorage.getClientSession(sessionId);
      if (!session) {
        return res.status(401).json({ error: "Session invalide ou expirée" });
      }
      
      // Vérifier que le client modifie bien son propre profil
      if (session.clientId !== clientId) {
        return res.status(403).json({ error: "Accès non autorisé" });
      }
      
      const { cguAccepted, cguAcceptedAt, cguVersion, privacyPolicyRead, privacyPolicyReadAt, privacyPolicyVersion } = req.body;

      const updateData: any = {};
      if (cguAccepted !== undefined) updateData.cguAccepted = cguAccepted;
      if (cguAcceptedAt !== undefined) {
        let convertedDate: Date | null = null;
        if (cguAcceptedAt) {
          if (typeof cguAcceptedAt === 'string') {
            convertedDate = new Date(cguAcceptedAt);
          } else if (cguAcceptedAt instanceof Date) {
            convertedDate = cguAcceptedAt;
          } else {
            convertedDate = new Date(cguAcceptedAt);
          }
        }
        updateData.cguAcceptedAt = convertedDate && !isNaN(convertedDate.getTime()) ? convertedDate : null;
      }
      if (cguVersion !== undefined) updateData.cguVersion = cguVersion;
      if (privacyPolicyRead !== undefined) updateData.privacyPolicyRead = privacyPolicyRead;
      if (privacyPolicyReadAt !== undefined) {
        let convertedDate: Date | null = null;
        if (privacyPolicyReadAt) {
          if (typeof privacyPolicyReadAt === 'string') {
            convertedDate = new Date(privacyPolicyReadAt);
          } else if (privacyPolicyReadAt instanceof Date) {
            convertedDate = privacyPolicyReadAt;
          } else {
            convertedDate = new Date(privacyPolicyReadAt);
          }
        }
        updateData.privacyPolicyReadAt = convertedDate && !isNaN(convertedDate.getTime()) ? convertedDate : null;
      }
      if (privacyPolicyVersion !== undefined) updateData.privacyPolicyVersion = privacyPolicyVersion;

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: "Aucune donnée à mettre à jour" });
      }

      console.log(`[API] Mise à jour légale pour client ${clientId}:`, updateData);

      const { clients } = await import("@shared/schema");
      
      try {
        await db.update(clients)
          .set(updateData)
          .where(eq(clients.id, clientId));
        
        console.log(`[API] Mise à jour légale réussie pour client ${clientId}`);
        
        // Récupérer le client mis à jour
        const updatedClient = await dbStorage.getClient(clientId);
        
        res.json({ 
          success: true, 
          message: "Acceptations légales mises à jour",
          client: updatedClient ? {
            id: updatedClient.id,
            cguAccepted: updatedClient.cguAccepted || false,
            cguAcceptedAt: updatedClient.cguAcceptedAt || null,
            cguVersion: updatedClient.cguVersion || null,
            privacyPolicyRead: updatedClient.privacyPolicyRead || false,
            privacyPolicyReadAt: updatedClient.privacyPolicyReadAt || null,
            privacyPolicyVersion: updatedClient.privacyPolicyVersion || null,
          } : null
        });
      } catch (dbError: any) {
        console.error("[API] Erreur DB lors de la mise à jour légale client:", {
          message: dbError?.message,
          code: dbError?.code,
          detail: dbError?.detail,
        });
        return res.status(500).json({ error: "Erreur lors de la mise à jour" });
      }
    } catch (error) {
      console.error("[API] Erreur lors de la mise à jour légale client:", error);
      res.status(500).json({ error: "Erreur serveur" });
    }
  });

  // Messages support directs (client)
  app.get("/api/messages/direct", async (req, res) => {
    const headerSessionRaw = (req.headers["x-client-session-id"] as string | undefined) || "";
    const headerSessionId = headerSessionRaw.split(",")[0].trim() || undefined;
    const rawCookieSessionId = req.cookies?.clientSessionId as string | undefined;
    const cookieSessionId = rawCookieSessionId?.split(",")[0].trim() || undefined;
    const sessionId = headerSessionId || cookieSessionId;

    if (!sessionId) {
      return res.status(401).json({ error: "Non authentifié" });
    }

    const session = await dbStorage.getClientSession(sessionId);
    if (!session) {
      res.clearCookie("clientSessionId");
      return res.status(401).json({ error: "Session expirée" });
    }

    const client = await dbStorage.getClient(session.clientId);
    if (!client) {
      res.clearCookie("clientSessionId");
      return res.status(401).json({ error: "Client non trouvé" });
    }

    const messages = await dbStorage.getSupportMessagesForRecipient("client", client.id);
    return res.json({ messages });
  });

  app.post("/api/messages/direct/read", async (req, res) => {
    const headerSessionRaw = (req.headers["x-client-session-id"] as string | undefined) || "";
    const headerSessionId = headerSessionRaw.split(",")[0].trim() || undefined;
    const rawCookieSessionId = req.cookies?.clientSessionId as string | undefined;
    const cookieSessionId = rawCookieSessionId?.split(",")[0].trim() || undefined;
    const sessionId = headerSessionId || cookieSessionId;

    if (!sessionId) {
      return res.status(401).json({ error: "Non authentifié" });
    }

    const session = await dbStorage.getClientSession(sessionId);
    if (!session) {
      res.clearCookie("clientSessionId");
      return res.status(401).json({ error: "Session expirée" });
    }

    await dbStorage.markSupportMessagesRead("client", session.clientId);
    return res.json({ success: true });
  });

  app.post("/api/messages/direct/send", async (req, res) => {
    const schema = z.object({
      content: z.string().min(1).max(1000),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Paramètres invalides" });
    }

    const headerSessionRaw = (req.headers["x-client-session-id"] as string | undefined) || "";
    const headerSessionId = headerSessionRaw.split(",")[0].trim() || undefined;
    const rawCookieSessionId = req.cookies?.clientSessionId as string | undefined;
    const cookieSessionId = rawCookieSessionId?.split(",")[0].trim() || undefined;
    const sessionId = headerSessionId || cookieSessionId;

    if (!sessionId) {
      return res.status(401).json({ error: "Non authentifié" });
    }

    const session = await dbStorage.getClientSession(sessionId);
    if (!session) {
      res.clearCookie("clientSessionId");
      return res.status(401).json({ error: "Session expirée" });
    }

    const message = await dbStorage.createSupportMessage({
      recipientType: "client",
      recipientId: session.clientId,
      senderType: "client",
      senderId: session.clientId,
      content: parsed.data.content.substring(0, 1000),
      isRead: true,
    });

    const client = await dbStorage.getClient(session.clientId);
    const senderName = client ? `${client.firstName || ""} ${client.lastName || ""}`.trim() || "Client" : "Client";
    sendSupportMessageNotification({
      senderType: "client",
      senderName,
      content: parsed.data.content,
    }).catch((err) => console.error("[Email] Notification support client:", err));

    return res.json({ message });
  });

  app.delete("/api/messages/direct", async (req, res) => {
    const authClientId = await getAuthenticatedClient(req);
    if (!authClientId) {
      return res.status(401).json({ error: "Non authentifié" });
    }

    try {
      await dbStorage.deleteSupportMessagesForRecipient("client", authClientId);
      return res.json({ success: true });
    } catch (error) {
      console.error("[API] Error deleting support messages:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });
  
  // Request password reset - utilise Twilio Verify Service (comme création de compte)
  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const { phone } = req.body;
      
      if (!phone) {
        return res.status(400).json({ error: "Numéro de téléphone requis" });
      }
      
      const client = await dbStorage.getClientByPhone(phone);
      if (!client) {
        // Don't reveal if account exists
        return res.json({ success: true, message: "Si ce numéro existe, un code a été envoyé" });
      }
      
      console.log(`[PASSWORD RESET] Envoi du code via Twilio Verify à ${phone}`);
      
      // Utiliser Twilio Verify Service (génère et envoie son propre code)
      const result = await sendVerificationCode(phone);
      
      if (!result.success) {
        console.error(`[PASSWORD RESET] ❌ Échec Twilio Verify:`, result.error);
        return res.status(500).json({ error: result.error || "Erreur lors de l'envoi du code" });
      }
      
      console.log(`[PASSWORD RESET] ✅ Code envoyé via Twilio Verify à ${phone}`);
      
      res.json({ 
        success: true, 
        message: "Code de vérification envoyé par SMS"
      });
    } catch (error) {
      console.error("Error requesting password reset:", error);
      res.status(500).json({ error: "Erreur lors de la demande" });
    }
  });
  
  // Verify reset code (before password reset) - validation du format uniquement
  // Note: La vraie vérification Twilio se fait dans /api/auth/reset-password
  // car Twilio Verify ne permet qu'une seule vérification par code
  app.post("/api/auth/verify-reset-code", async (req, res) => {
    try {
      const { phone, code } = req.body;
      
      if (!phone || !code) {
        return res.status(400).json({ error: "Tous les champs sont requis" });
      }
      
      const codeStr = String(code);
      
      // Valider le format du code (6 chiffres)
      if (!/^\d{6}$/.test(codeStr)) {
        return res.status(400).json({ error: "Le code doit contenir 6 chiffres" });
      }
      
      // On ne vérifie pas via Twilio ici car ça consommerait le code
      // La vraie vérification se fera dans reset-password
      res.json({ success: true, message: "Format du code valide" });
    } catch (error) {
      console.error("Error verifying reset code:", error);
      res.status(500).json({ error: "Erreur lors de la vérification" });
    }
  });
  
  // Verify reset code and set new password - utilise Twilio Verify Service
  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { phone, code, newPassword } = req.body;
      
      if (!phone || !code || !newPassword) {
        return res.status(400).json({ error: "Tous les champs sont requis" });
      }
      
      if (newPassword.length < 6) {
        return res.status(400).json({ error: "Le mot de passe doit contenir au moins 6 caractères" });
      }
      
      // In development, accept 111111 as universal code
      const isDev = process.env.NODE_ENV !== "production";
      const codeStr = String(code);
      
      if (!(isDev && codeStr === "111111")) {
        // Vérifier via Twilio Verify Service
        const result = await verifyCode(phone, codeStr);
        
        if (!result.success || !result.verified) {
          return res.status(400).json({ error: result.error || "Code invalide ou expiré" });
        }
      }
      
      const client = await dbStorage.getClientByPhone(phone);
      if (!client) {
        return res.status(404).json({ error: "Client non trouvé" });
      }
      
      // Update password
      await dbStorage.updateClientPassword(client.id, hashPassword(newPassword));
      
      // Créer une session pour connecter automatiquement l'utilisateur
      const session = await dbStorage.createClientSession(client.id);
      
      // Set session cookie
      res.cookie("client_session", session.id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      });
      
      res.json({ 
        success: true, 
        message: "Mot de passe réinitialisé avec succès",
        client: {
          id: client.id,
          phone: client.phone,
          firstName: client.firstName,
          lastName: client.lastName,
          email: client.email,
          avatarUrl: client.photoUrl,
          // CGU et politique de confidentialité
          cguAccepted: client.cguAccepted || false,
          cguAcceptedAt: client.cguAcceptedAt || null,
          cguVersion: client.cguVersion || null,
          privacyPolicyRead: client.privacyPolicyRead || false,
          privacyPolicyReadAt: client.privacyPolicyReadAt || null,
          privacyPolicyVersion: client.privacyPolicyVersion || null,
        },
        session: {
          id: session.id,
        }
      });
    } catch (error) {
      console.error("Error resetting password:", error);
      res.status(500).json({ error: "Erreur lors de la réinitialisation" });
    }
  });
  
  // Resend verification code - utilise Twilio Verify Service
  app.post("/api/auth/resend-code", async (req, res) => {
    try {
      const { phone, type } = req.body;
      
      if (!phone) {
        return res.status(400).json({ error: "Numéro de téléphone requis" });
      }
      
      const codeType = type || "registration";
      
      console.log(`[RESEND] Renvoi du code via Twilio Verify à ${phone} (type: ${codeType})`);
      
      // Utiliser Twilio Verify Service (génère et envoie son propre code)
      const result = await sendVerificationCode(phone);
      
      if (!result.success) {
        console.error(`[RESEND] ❌ Échec Twilio Verify:`, result.error);
        return res.status(500).json({ error: result.error || "Erreur lors de l'envoi du code" });
      }
      
      console.log(`[RESEND] ✅ Code envoyé via Twilio Verify à ${phone}`);
      
      res.json({ 
        success: true, 
        message: "Code envoyé par SMS"
      });
    } catch (error) {
      console.error("Error resending code:", error);
      res.status(500).json({ error: "Erreur lors de l'envoi" });
    }
  });
  
  // ========================
  // CLIENT DATA ROUTES
  // ========================
  
  // Get client orders
// Get client orders
app.get("/api/client/orders", async (req, res) => {
  try {
    // Session depuis cookie (web) OU header explicite (React Native)
const headerSessionRaw = (req.headers["x-client-session-id"] as string | undefined) || "";
const headerSessionId = headerSessionRaw.split(",")[0].trim() || undefined;

// Le cookie est chelou ("id,clientSessionId=id"), on le nettoie
const rawCookieSessionId = req.cookies?.clientSessionId as string | undefined;
const cookieSessionId = rawCookieSessionId?.split(",")[0].trim() || undefined;

// IMPORTANT : on privilégie le header (mobile) puis le cookie (web)
const sessionId = headerSessionId || cookieSessionId;

    const headerClientIdRaw = (req.headers["x-client-id"] as string | undefined) || "";
    const headerClientId = headerClientIdRaw.split(",")[0].trim() || undefined;

    console.log("[CLIENT_ORDERS] Incoming request", {
      cookieSessionId,
      headerSessionId,
      headerClientId,
      finalSessionId: sessionId,
    });

    let clientId: string | undefined;

    // 1) Essayer avec la session (cookie ou header)
    if (sessionId) {
      const session = await dbStorage.getClientSession(sessionId);

      console.log("[CLIENT_ORDERS] Session lookup result", {
        hasSession: !!session,
        sessionClientId: session?.clientId,
      });

      if (session) {
        clientId = session.clientId;
      }
    }

    // 2) Plan B pour React Native : utiliser le clientId envoyé par l'app
    if (!clientId && headerClientId) {
      clientId = headerClientId;
      console.log("[CLIENT_ORDERS] Using header clientId fallback", { clientId });
    }

    if (!clientId) {
      return res.status(401).json({ error: "Session expirée" });
    }

    const orders = await dbStorage.getOrdersByClient(clientId);

    console.log("[CLIENT_ORDERS] Orders found", {
      clientId,
      count: orders.length,
    });

    res.json(orders);
  } catch (error) {
    console.error("Error getting client orders:", error);
    res.status(500).json({ error: "Erreur lors de la récupération des commandes" });
  }
});
  
  // Update client profile
  app.patch("/api/client/profile", async (req, res) => {
    try {
      // Session depuis cookie (web) OU header explicite (React Native)
      const headerSessionRaw = (req.headers["x-client-session-id"] as string | undefined) || "";
      const headerSessionId = headerSessionRaw.split(",")[0].trim() || undefined;
      
      const rawCookieSessionId = req.cookies?.clientSessionId as string | undefined;
      const cookieSessionId = rawCookieSessionId?.split(",")[0].trim() || undefined;
      
      // Privilégier le header (mobile) puis le cookie (web)
      const sessionId = headerSessionId || cookieSessionId;
      
      if (!sessionId) {
        return res.status(401).json({ error: "Non authentifié" });
      }
      
      const session = await dbStorage.getClientSession(sessionId);
      if (!session) {
        return res.status(401).json({ error: "Session expirée" });
      }
      
      // Validate request body
      const validationResult = updateClientProfileSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Données invalides", 
          details: validationResult.error.flatten() 
        });
      }
      
      const rawPhotoUrl =
        typeof (req.body as any)?.photoUrl === "string"
          ? (req.body as any).photoUrl
          : null;
      const { firstName, lastName, email, photoUrl } = validationResult.data;
      const resolvedPhotoUrl = photoUrl ?? rawPhotoUrl;
      console.log("[CLIENT_PROFILE] body:", req.body);
      console.log("[CLIENT_PROFILE] parsed:", validationResult.data);
      
      const updatedClient = await dbStorage.updateClientProfile(session.clientId, {
        firstName,
        lastName,
        email,
        photoUrl: resolvedPhotoUrl
      });
      
      if (!updatedClient) {
        return res.status(404).json({ error: "Client non trouvé" });
      }
      console.log("[CLIENT_PROFILE] updated photoUrl:", updatedClient.photoUrl);
      
      res.json({
        success: true,
        client: {
          id: updatedClient.id,
          phone: updatedClient.phone,
          firstName: updatedClient.firstName,
          lastName: updatedClient.lastName,
          email: updatedClient.email,
          photoUrl: updatedClient.photoUrl,
        }
      });
    } catch (error) {
      console.error("Error updating client profile:", error);
      res.status(500).json({ error: "Erreur lors de la mise à jour" });
    }
  });
  
  // Get wallet transactions
  app.get("/api/client/wallet", async (req, res) => {
    const sessionId = req.cookies?.clientSessionId;
    
    if (!sessionId) {
      return res.status(401).json({ error: "Non authentifié" });
    }
    
    const session = await dbStorage.getClientSession(sessionId);
    if (!session) {
      return res.status(401).json({ error: "Session expirée" });
    }
    
    const client = await dbStorage.getClient(session.clientId);
    const transactions: any[] = []; // Wallet transactions not implemented in dbStorage yet
    
    res.json({
      balance: client?.walletBalance || 0,
      transactions
    });
  });
  
  // Delete client account (self-deletion)
  app.delete("/api/client/account", async (req, res) => {
    try {
      // Session depuis cookie (web) OU header explicite (React Native)
      const headerSessionRaw = (req.headers["x-client-session-id"] as string | undefined) || "";
      const headerSessionId = headerSessionRaw.split(",")[0].trim() || undefined;
      
      const rawCookieSessionId = req.cookies?.clientSessionId as string | undefined;
      const cookieSessionId = rawCookieSessionId?.split(",")[0].trim() || undefined;
      
      // Privilégier le header (mobile) puis le cookie (web)
      const sessionId = headerSessionId || cookieSessionId;
      
      const headerClientIdRaw = (req.headers["x-client-id"] as string | undefined) || "";
      const headerClientId = headerClientIdRaw.split(",")[0].trim() || undefined;
      
      console.log(`[DELETE ACCOUNT] Headers reçus:`, {
        headerSessionId,
        cookieSessionId,
        headerClientId,
        finalSessionId: sessionId
      });
      
      let clientId: string | undefined;
      
      // 1) Essayer avec la session
      if (sessionId) {
        const session = await dbStorage.getClientSession(sessionId);
        console.log(`[DELETE ACCOUNT] Session trouvée:`, session ? session.clientId : 'null');
        if (session) {
          clientId = session.clientId;
        }
      }
      
      // 2) Plan B pour React Native : utiliser le clientId envoyé par l'app
      if (!clientId && headerClientId) {
        clientId = headerClientId;
        console.log(`[DELETE ACCOUNT] Utilisation du headerClientId: ${clientId}`);
      }
      
      if (!clientId) {
        console.log(`[DELETE ACCOUNT] ❌ Pas de clientId trouvé`);
        return res.status(401).json({ error: "Non authentifié" });
      }
      
      console.log(`[DELETE ACCOUNT] Suppression du compte client: ${clientId}`);
      
      // Vérifier que le client existe avant de supprimer
      const client = await dbStorage.getClient(clientId);
      if (!client) {
        console.log(`[DELETE ACCOUNT] ❌ Client non trouvé: ${clientId}`);
        return res.status(404).json({ error: "Client non trouvé" });
      }
      
      console.log(`[DELETE ACCOUNT] Client trouvé: ${client.firstName} ${client.lastName} (${client.phone})`);
      
      // Supprimer le compte et toutes les données associées
      const deleted = await dbStorage.deleteClient(clientId);
      
      if (!deleted) {
        console.log(`[DELETE ACCOUNT] ❌ Échec de la suppression`);
        return res.status(500).json({ error: "Échec de la suppression" });
      }
      
      // Supprimer le cookie de session
      res.clearCookie("client_session");
      res.clearCookie("clientSessionId");
      
      console.log(`[DELETE ACCOUNT] ✅ Compte ${clientId} supprimé avec succès`);
      
      res.json({ success: true, message: "Compte supprimé avec succès" });
    } catch (error: any) {
      console.error("[DELETE ACCOUNT] ❌ Erreur:", error?.message || error);
      console.error("[DELETE ACCOUNT] Stack:", error?.stack);
      res.status(500).json({ error: "Erreur lors de la suppression du compte" });
    }
  });
  
  // ========================
  // DRIVER DATA ROUTES
  // ========================
  
  // Get current driver profile (from session)
  app.get("/api/driver/profile", async (req, res) => {
    try {
      // Get session ID from X-Driver-Session header
      const sessionId = req.headers['x-driver-session'] as string;
      
      if (!sessionId) {
        return res.status(401).json({ success: false, error: "Session requise" });
      }
      
      // First try in-memory session
      let session = await storage.getDriverSession(sessionId);
      let driverId: string | undefined;
      
      if (session) {
        driverId = session.driverId;
      } else {
        // Fallback to database session (survives server restart)
        const dbSession = await dbStorage.getDbDriverSession(sessionId);
        if (dbSession) {
          driverId = dbSession.driverId;
        }
      }
      
      if (!driverId) {
        return res.status(401).json({ success: false, error: "Session invalide ou expirée" });
      }
      
      const driver = await dbStorage.getDriver(driverId);
      
      if (!driver) {
        return res.status(404).json({ success: false, error: "Chauffeur non trouvé" });
      }
      
      return res.json({
        success: true,
        driver: {
          id: driver.id,
          phone: driver.phone,
          firstName: driver.firstName,
          lastName: driver.lastName,
          typeChauffeur: driver.typeChauffeur || 'patente',
          vehicleModel: driver.vehicleModel,
          vehicleColor: driver.vehicleColor,
          vehiclePlate: driver.vehiclePlate,
          isActive: driver.isActive,
          averageRating: driver.averageRating,
          totalRides: driver.totalRides,
          createdAt: driver.createdAt,
          // Prestataire info (pour afficher le nom de la société)
          prestataireId: driver.prestataireId || null,
          prestataireName: driver.prestataireName || null,
          // CGU et politique de confidentialité
          cguAccepted: driver.cguAccepted || false,
          cguAcceptedAt: driver.cguAcceptedAt || null,
          cguVersion: driver.cguVersion || null,
          privacyPolicyRead: driver.privacyPolicyRead || false,
          privacyPolicyReadAt: driver.privacyPolicyReadAt || null,
          privacyPolicyVersion: driver.privacyPolicyVersion || null,
        }
      });
    } catch (error) {
      console.error("[API] Error getting driver profile:", error);
      return res.status(500).json({ success: false, error: "Erreur serveur" });
    }
  });

  // Messages support directs (chauffeur)
  app.get("/api/messages/direct/driver", async (req, res) => {
    try {
      const headerSession = req.headers["x-driver-session"] as string | undefined;
      const sessionId = headerSession || (req.query.sessionId as string | undefined);
      if (!sessionId) {
        return res.status(401).json({ error: "Session requise" });
      }

      let driverId: string | undefined;
      const session = await storage.getDriverSession(sessionId);
      if (session) {
        driverId = session.driverId;
      } else {
        const dbSession = await dbStorage.getDbDriverSession(sessionId);
        if (dbSession) {
          driverId = dbSession.driverId;
        }
      }

      if (!driverId) {
        return res.status(401).json({ error: "Session invalide ou expirée" });
      }

      const messages = await dbStorage.getSupportMessagesForRecipient("driver", driverId);
      return res.json({ messages });
    } catch (error) {
      console.error("[API] Error getting driver support messages:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });

  app.post("/api/messages/direct/driver/read", async (req, res) => {
    try {
      const headerSession = req.headers["x-driver-session"] as string | undefined;
      const sessionId = headerSession || (req.query.sessionId as string | undefined);
      if (!sessionId) {
        return res.status(401).json({ error: "Session requise" });
      }

      let driverId: string | undefined;
      const session = await storage.getDriverSession(sessionId);
      if (session) {
        driverId = session.driverId;
      } else {
        const dbSession = await dbStorage.getDbDriverSession(sessionId);
        if (dbSession) {
          driverId = dbSession.driverId;
        }
      }

      if (!driverId) {
        return res.status(401).json({ error: "Session invalide ou expirée" });
      }

      await dbStorage.markSupportMessagesRead("driver", driverId);
      return res.json({ success: true });
    } catch (error) {
      console.error("[API] Error marking driver support messages:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });

  app.post("/api/messages/direct/driver/send", async (req, res) => {
    const schema = z.object({
      content: z.string().min(1).max(1000),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Paramètres invalides" });
    }

    const headerSession = req.headers["x-driver-session"] as string | undefined;
    const sessionId = headerSession || (req.query.sessionId as string | undefined);
    if (!sessionId) {
      return res.status(401).json({ error: "Session requise" });
    }

    let driverId: string | undefined;
    const session = await storage.getDriverSession(sessionId);
    if (session) {
      driverId = session.driverId;
    } else {
      const dbSession = await dbStorage.getDbDriverSession(sessionId);
      if (dbSession) {
        driverId = dbSession.driverId;
      }
    }

    if (!driverId) {
      return res.status(401).json({ error: "Session invalide ou expirée" });
    }

    const message = await dbStorage.createSupportMessage({
      recipientType: "driver",
      recipientId: driverId,
      senderType: "driver",
      senderId: driverId,
      content: parsed.data.content.substring(0, 1000),
      isRead: true,
    });

    const driver = await dbStorage.getDriver(driverId);
    const senderName = driver ? `${driver.firstName || ""} ${driver.lastName || ""}`.trim() || "Chauffeur" : "Chauffeur";
    sendSupportMessageNotification({
      senderType: "driver",
      senderName,
      content: parsed.data.content,
    }).catch((err) => console.error("[Email] Notification support chauffeur:", err));

    return res.json({ message });
  });

  app.delete("/api/messages/direct/driver", async (req, res) => {
    const sessionId = req.headers["x-driver-session"] as string;
    if (!sessionId) {
      return res.status(401).json({ error: "Session manquante" });
    }

    let session = await storage.getDriverSession(sessionId);
    if (!session) {
      const dbSession = await dbStorage.getDbDriverSession(sessionId);
      if (!dbSession) {
        return res.status(401).json({ error: "Session invalide" });
      }
      session = {
        id: dbSession.id,
        driverId: dbSession.driverId,
        driverName: dbSession.driverName,
        isOnline: dbSession.isOnline, // Garder le statut de la DB
        socketIds: [],
        createdAt: new Date().toISOString(),
        expiresAt: dbSession.expiresAt,
        lastSeenAt: new Date().toISOString(),
      };
    }

    try {
      await dbStorage.deleteSupportMessagesForRecipient("driver", session.driverId);
      return res.json({ success: true });
    } catch (error) {
      console.error("[API] Error deleting driver support messages:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });
  
  // Get driver profile by ID
  app.get("/api/driver/profile/:driverId", async (req, res) => {
    try {
      const { driverId } = req.params;
      
      if (!driverId) {
        return res.status(400).json({ error: "ID chauffeur requis" });
      }
      
      // Verify driver session via Authorization header (sessionId)
      const sessionId = req.headers.authorization?.replace("Bearer ", "");
      if (!sessionId) {
        return res.status(401).json({ error: "Non authentifié" });
      }
      
      // Use fallback to recover session from database if not in memory (after server restart)
      const session = await getDriverSessionWithFallback(sessionId);
      if (!session) {
        return res.status(401).json({ error: "Session expirée" });
      }
      
      // Verify the driver is requesting their own profile
      if (session.driverId !== driverId) {
        return res.status(403).json({ error: "Accès non autorisé" });
      }
      
      const driver = await dbStorage.getDriver(driverId);
      
      if (!driver) {
        return res.status(404).json({ error: "Chauffeur non trouvé" });
      }
      
      res.json({
        id: driver.id,
        phone: driver.phone,
        firstName: driver.firstName,
        lastName: driver.lastName,
        typeChauffeur: driver.typeChauffeur || 'patente',
        vehicleModel: driver.vehicleModel,
        vehicleColor: driver.vehicleColor,
        vehiclePlate: driver.vehiclePlate,
        photoUrl: driver.photoUrl,
        prestataireId: driver.prestataireId || null,
        prestataireName: driver.prestataireName || null,
        averageRating: driver.averageRating,
        totalRides: driver.totalRides,
      });
    } catch (error) {
      console.error("Error getting driver profile:", error);
      res.status(500).json({ error: "Erreur lors de la récupération du profil" });
    }
  });
  
  // Update driver profile
  app.patch("/api/driver/profile/:driverId", async (req, res) => {
    try {
      const { driverId } = req.params;
      
      if (!driverId) {
        return res.status(400).json({ error: "ID chauffeur requis" });
      }
      
      // Verify driver session via Authorization header (sessionId)
      const sessionId = req.headers.authorization?.replace("Bearer ", "");
      if (!sessionId) {
        return res.status(401).json({ error: "Non authentifié" });
      }
      
      // Use fallback to recover session from database if not in memory (after server restart)
      const session = await getDriverSessionWithFallback(sessionId);
      if (!session) {
        return res.status(401).json({ error: "Session expirée" });
      }
      
      // Verify the driver is modifying their own profile
      if (session.driverId !== driverId) {
        return res.status(403).json({ error: "Accès non autorisé" });
      }
      
      // Validate request body
      const validationResult = updateDriverProfileSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Données invalides", 
          details: validationResult.error.flatten() 
        });
      }
      
      const { firstName, lastName, vehicleModel, vehicleColor, vehiclePlate } = validationResult.data;
      
      const updatedDriver = await dbStorage.updateDriverProfile(driverId, {
        firstName,
        lastName,
        vehicleModel,
        vehicleColor,
        vehiclePlate
      });
      
      if (!updatedDriver) {
        return res.status(404).json({ error: "Chauffeur non trouvé" });
      }
      
      res.json({
        success: true,
        driver: {
          id: updatedDriver.id,
          phone: updatedDriver.phone,
          firstName: updatedDriver.firstName,
          lastName: updatedDriver.lastName,
          vehicleModel: updatedDriver.vehicleModel,
          vehicleColor: updatedDriver.vehicleColor,
          vehiclePlate: updatedDriver.vehiclePlate,
        }
      });
    } catch (error) {
      console.error("Error updating driver profile:", error);
      res.status(500).json({ error: "Erreur lors de la mise à jour" });
    }
  });
  
  // Verify driver code and create session
  app.post("/api/driver/login", async (req, res) => {
    try {
      const { code } = req.body;
      
      if (!code) {
        return res.status(400).json({ error: "Code requis" });
      }
      
      const codeStr = String(code);
      
      // Look up driver by code in database
      const driver = await dbStorage.getDriverByCode(codeStr);
      
      if (!driver) {
        return res.status(401).json({ error: "Code incorrect" });
      }
      
      if (!driver.isActive) {
        return res.status(403).json({ error: "Compte chauffeur désactivé" });
      }
      
      // Create driver session (both in-memory for sockets and in database for persistence)
      const session = await storage.createDriverSession(driver.id, `${driver.firstName} ${driver.lastName}`.trim());
      
      // Also create/refresh database session with SAME session ID for persistence across server restarts
      await dbStorage.createDbDriverSession(driver.id, `${driver.firstName} ${driver.lastName}`.trim(), session.id);
      
      res.json({ 
        success: true, 
        session,
        driver: {
          id: driver.id,
          firstName: driver.firstName,
          lastName: driver.lastName,
          phone: driver.phone,
          typeChauffeur: driver.typeChauffeur,
          vehicleModel: driver.vehicleModel,
          vehicleColor: driver.vehicleColor,
          vehiclePlate: driver.vehiclePlate,
          photoUrl: driver.photoUrl,
          prestataireId: driver.prestataireId || null,
          prestataireName: driver.prestataireName || null,
          cguAccepted: driver.cguAccepted || false,
          cguAcceptedAt: driver.cguAcceptedAt || null,
          cguVersion: driver.cguVersion || null,
          privacyPolicyRead: driver.privacyPolicyRead || false,
          privacyPolicyReadAt: driver.privacyPolicyReadAt || null,
          privacyPolicyVersion: driver.privacyPolicyVersion || null,
        },
        // Version de l'app requise - permet de vérifier que l'app utilisée est la bonne
        appVersion: "2.0.0",
        requiresMenuBurger: true, // La bonne version doit avoir un menu burger, pas un bouton de localisation
      });
    } catch (error) {
      console.error("Error verifying driver code:", error);
      res.status(500).json({ error: "Erreur lors de la connexion" });
    }
  });

  // Mettre à jour les acceptations légales d'un chauffeur
  app.patch("/api/drivers/:id/legal", async (req, res) => {
    try {
      const driverId = req.params.id;
      
      // Vérifier l'authentification via header X-Driver-Session ou Authorization
      const sessionId = req.headers['x-driver-session'] as string || 
                       req.headers.authorization?.replace("Bearer ", "");
      
      if (!sessionId) {
        return res.status(401).json({ error: "Session requise" });
      }
      
      // Use fallback to recover session from database if not in memory (after server restart)
      const session = await getDriverSessionWithFallback(sessionId);
      if (!session) {
        return res.status(401).json({ error: "Session invalide ou expirée" });
      }
      
      // Vérifier que le chauffeur modifie bien son propre profil
      if (session.driverId !== driverId) {
        return res.status(403).json({ error: "Accès non autorisé" });
      }
      
      const { cguAccepted, cguAcceptedAt, cguVersion, privacyPolicyRead, privacyPolicyReadAt, privacyPolicyVersion } = req.body;

      const updateData: any = {};
      if (cguAccepted !== undefined) updateData.cguAccepted = cguAccepted;
      if (cguAcceptedAt !== undefined) {
        // Convertir la chaîne ISO en Date si nécessaire
        let convertedDate: Date | null = null;
        if (cguAcceptedAt) {
          if (typeof cguAcceptedAt === 'string') {
            convertedDate = new Date(cguAcceptedAt);
          } else if (cguAcceptedAt instanceof Date) {
            convertedDate = cguAcceptedAt;
          } else {
            convertedDate = new Date(cguAcceptedAt);
          }
        }
        
        updateData.cguAcceptedAt = convertedDate && !isNaN(convertedDate.getTime()) ? convertedDate : null;
      }
      if (cguVersion !== undefined) updateData.cguVersion = cguVersion;
      if (privacyPolicyRead !== undefined) updateData.privacyPolicyRead = privacyPolicyRead;
      if (privacyPolicyReadAt !== undefined) {
        // Convertir la chaîne ISO en Date si nécessaire
        let convertedDate: Date | null = null;
        if (privacyPolicyReadAt) {
          if (typeof privacyPolicyReadAt === 'string') {
            convertedDate = new Date(privacyPolicyReadAt);
          } else if (privacyPolicyReadAt instanceof Date) {
            convertedDate = privacyPolicyReadAt;
          } else {
            convertedDate = new Date(privacyPolicyReadAt);
          }
        }
        
        updateData.privacyPolicyReadAt = convertedDate && !isNaN(convertedDate.getTime()) ? convertedDate : null;
      }
      if (privacyPolicyVersion !== undefined) updateData.privacyPolicyVersion = privacyPolicyVersion;

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: "Aucune donnée à mettre à jour" });
      }

      console.log(`[API] Mise à jour légale pour chauffeur ${driverId}:`, updateData);

      const { drivers } = await import("@shared/schema");
      
      try {
        await db.update(drivers)
          .set(updateData)
          .where(eq(drivers.id, driverId));
        
        console.log(`[API] Mise à jour réussie pour chauffeur ${driverId}`);
      } catch (dbError: any) {
        // Logger l'erreur complète pour le débogage
        console.error("[API] Erreur DB lors de la mise à jour:", {
          message: dbError?.message,
          code: dbError?.code,
          detail: dbError?.detail,
          driverId,
          updateData
        });
        throw dbError;
      }

      const updatedDriver = await dbStorage.getDriver(driverId);
      if (!updatedDriver) {
        return res.status(404).json({ error: "Chauffeur non trouvé après mise à jour" });
      }

      console.log(`[API] Chauffeur ${driverId} - CGU mises à jour avec succès`);

      return res.json({ success: true, driver: updatedDriver });
    } catch (error: any) {
      // Logger toutes les informations sur l'erreur
      console.error("[API] Error updating driver legal - Full error:", {
        message: error?.message,
        code: error?.code,
        detail: error?.detail,
        name: error?.name,
        stack: error?.stack,
        driverId: req.params.id,
        body: req.body,
        headers: {
          'x-driver-session': req.headers['x-driver-session'],
          authorization: req.headers.authorization ? 'present' : 'missing'
        }
      });
      
      const errorMessage = error?.message || error?.detail || String(error);
      const errorStr = errorMessage.toLowerCase();
      
      if (errorStr.includes('column') && (errorStr.includes('does not exist') || errorStr.includes('n\'existe pas') || errorStr.includes('doesn\'t exist'))) {
        return res.status(500).json({ 
          error: "Les colonnes légales n'existent pas encore dans la base de données.",
          details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
        });
      }
      
      return res.status(500).json({ 
        error: "Erreur serveur lors de la mise à jour des acceptations légales",
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
        code: error?.code || 'UNKNOWN'
      });
    }
  });
  
  // Get driver orders (completed and cancelled rides) - by session ID
  // First checks memory storage, then falls back to database for persistence
  app.get("/api/driver/orders/:sessionId", async (req, res) => {
    const { sessionId } = req.params;
    
    if (!sessionId) {
      return res.status(401).json({ error: "Session requise" });
    }
    
    // First try in-memory session
    let session = await storage.getDriverSession(sessionId);
    let driverId: string | undefined;
    
    if (session) {
      driverId = session.driverId;
    } else {
      // Fallback to database session (survives server restart)
      const dbSession = await dbStorage.getDbDriverSession(sessionId);
      if (dbSession) {
        driverId = dbSession.driverId;
      }
    }
    
    if (!driverId) {
      return res.status(401).json({ error: "Session expirée" });
    }
    
    const orders = await dbStorage.getOrdersByDriver(driverId);
    res.json(orders);
  });

  // Get driver earnings statistics (today, week, month)
  app.get("/api/driver/earnings/:sessionId", async (req, res) => {
    const { sessionId } = req.params;
    
    if (!sessionId) {
      return res.status(401).json({ error: "Session requise" });
    }
    
    // Get driver from session
    let session = await storage.getDriverSession(sessionId);
    let driverId: string | undefined;
    
    if (session) {
      driverId = session.driverId;
    } else {
      const dbSession = await dbStorage.getDbDriverSession(sessionId);
      if (dbSession) {
        driverId = dbSession.driverId;
      }
    }
    
    if (!driverId) {
      return res.status(401).json({ error: "Session expirée" });
    }
    
    try {
      // Get all driver orders
      const orders = await dbStorage.getOrdersByDriver(driverId);
      
      // Filter completed/paid orders only
      const paidStatuses = ['completed', 'payment_confirmed'];
      const completedOrders = orders.filter(o => paidStatuses.includes(o.status));
      
      // Date calculations
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      // Week start (Monday)
      const dayOfWeek = now.getDay();
      const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const weekStart = new Date(todayStart);
      weekStart.setDate(weekStart.getDate() - diffToMonday);
      
      // Month start
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      
      // Calculate earnings
      let todayEarnings = 0;
      let weekEarnings = 0;
      let monthEarnings = 0;
      let totalEarnings = 0;
      let totalKm = 0;
      
      for (const order of completedOrders) {
        const orderDate = new Date(order.createdAt);
        const earnings = order.driverEarnings || 0;
        const distance = order.routeInfo?.distance ? parseFloat(order.routeInfo.distance) : 0;
        
        totalEarnings += earnings;
        totalKm += distance;
        
        if (orderDate >= todayStart) {
          todayEarnings += earnings;
        }
        if (orderDate >= weekStart) {
          weekEarnings += earnings;
        }
        if (orderDate >= monthStart) {
          monthEarnings += earnings;
        }
      }
      
      // Get driver profile for rating and total rides
      const driver = await dbStorage.getDriver(driverId);
      
      res.json({
        success: true,
        earnings: {
          today: todayEarnings,
          week: weekEarnings,
          month: monthEarnings,
          total: totalEarnings,
        },
        stats: {
          totalRides: completedOrders.length,
          totalKm: Math.round(totalKm * 10) / 10,
          averageRating: driver?.averageRating || null,
          allTimeRides: driver?.totalRides || completedOrders.length,
        },
        orders: completedOrders.slice(0, 10), // Last 10 orders for recent activity
      });
    } catch (error) {
      console.error("Error fetching driver earnings:", error);
      res.status(500).json({ error: "Erreur serveur" });
    }
  });
  

  // ============ STRIPE PAYMENT ENDPOINTS ============
  
  // Helper to extract client session id from a request in a way that works
  // both for web (cookies) and mobile (Authorization header or explicit header)
  function getClientSessionIdFromRequest(req: Request): string | undefined {
    // 1) Standard mobile / API auth: Authorization: Bearer <sessionId>
    const auth = req.headers.authorization;
    if (auth && auth.startsWith("Bearer ")) {
      return auth.slice("Bearer ".length).trim();
    }

    // 2) Explicit header (React Native, debugging, etc.)
    const headerSessionRaw = (req.headers["x-client-session-id"] as string | undefined) || "";
    const headerSessionId = headerSessionRaw.split(",")[0].trim() || "";
    if (headerSessionId) {
      return headerSessionId;
    }

    // 3) Fallback for web / legacy: cookie
    // @ts-expect-error cookie-parser adds cookies on the req object at runtime
    const cookieSessionId = req.cookies?.clientSessionId as string | undefined;
    if (cookieSessionId) {
      return cookieSessionId;
    }

    return undefined;
  }

  // Helper to get authenticated client from session (mobile + web)
  async function getAuthenticatedClient(req: Request): Promise<string | null> {
    // Utilise le helper générique qui lit :
    // 1) Authorization: Bearer <sessionId> (mobile / API)
    // 2) X-Client-Session-Id (fallback mobile / debug)
    // 3) cookie clientSessionId (web)
    const sessionId = getClientSessionIdFromRequest(req);
    if (!sessionId) return null;

    const session = await dbStorage.getClientSession(sessionId);
    if (!session || new Date(session.expiresAt) < new Date()) return null;

    return session.clientId;
  }
  // Zod validation schemas for Stripe endpoints
  const setupIntentBodySchema = z.object({
    clientId: z.string().min(1),
  });
  
  const savePaymentMethodSchema = z.object({
    clientId: z.string().min(1),
    paymentMethodId: z.string().min(1),
    isDefault: z.boolean().optional(),
  });
  
  const paymentIntentSchema = z.object({
    clientId: z.string().min(1),
    orderId: z.string().min(1),
    amount: z.number().positive(),
    paymentMethodId: z.string().optional(),
  });
  
  const confirmPaymentSchema = z.object({
    paymentIntentId: z.string().min(1),
    invoiceId: z.string().min(1),
  });

  // Get or create Stripe customer for authenticated client
  app.post("/api/stripe/customer", async (req, res) => {
    const authClientId = await getAuthenticatedClient(req);
    if (!authClientId) {
      return res.status(401).json({ error: "Non authentifié" });
    }
    
    try {
      // Check if customer already exists
      let stripeCustomer = await dbStorage.getStripeCustomer(authClientId);
      
      if (!stripeCustomer) {
        // Get client info
        const client = await dbStorage.getClient(authClientId);
        if (!client) {
          return res.status(404).json({ error: "Client non trouvé" });
        }
        
        // Create Stripe customer
        const customer = await stripe.customers.create({
          phone: client.phone,
          name: `${client.firstName} ${client.lastName}`.trim(),
          metadata: { clientId: authClientId },
        });
        
        stripeCustomer = await dbStorage.createStripeCustomer(authClientId, customer.id);
      }
      
      res.json(stripeCustomer);
    } catch (error) {
      console.error("Error creating Stripe customer:", error);
      res.status(500).json({ error: "Erreur Stripe" });
    }
  });

  // Get Stripe publishable key (for frontend initialization)
  app.get("/api/stripe/publishable-key", (req, res) => {
    if (!STRIPE_PUBLISHABLE_KEY) {
      return res.status(500).json({ error: "Stripe publishable key not configured" });
    }
    res.json({ publishableKey: STRIPE_PUBLISHABLE_KEY });
  });

  // Create SetupIntent for adding a card (supports both URL param and body)
  app.post("/api/stripe/setup-intent/:clientId?", async (req, res) => {
    // Support clientId from URL param (mobile app) or body (web app)
    const clientIdFromUrl = req.params.clientId;
    const clientIdFromBody = req.body?.clientId;
    const requestClientId = clientIdFromUrl || clientIdFromBody;
    
    const authClientId = await getAuthenticatedClient(req);
    
    if (!authClientId) {
      return res.status(401).json({ error: "Non authentifié" });
    }
    
    // Validate: either URL param or body must have clientId
    if (!requestClientId) {
      return res.status(400).json({ error: "Données invalides - clientId requis" });
    }
    
    // Verify the request is for the authenticated user
    if (requestClientId !== authClientId) {
      return res.status(403).json({ error: "Accès non autorisé" });
    }
    
    try {
      // Get or create Stripe customer
      let stripeCustomer = await dbStorage.getStripeCustomer(authClientId);
      
      if (!stripeCustomer) {
        const client = await dbStorage.getClient(authClientId);
        if (!client) {
          return res.status(404).json({ error: "Client non trouvé" });
        }
        
        const customer = await stripe.customers.create({
          phone: client.phone,
          name: `${client.firstName} ${client.lastName}`.trim(),
          metadata: { clientId: authClientId },
        });
        
        stripeCustomer = await dbStorage.createStripeCustomer(authClientId, customer.id);
      }
      
      // Create SetupIntent
      const setupIntent = await stripe.setupIntents.create({
        customer: stripeCustomer.stripeCustomerId,
        payment_method_types: ["card"],
      });
      
      res.json({ clientSecret: setupIntent.client_secret });
    } catch (error: any) {
      console.error("Error creating SetupIntent:", error);
      res.status(500).json({ error: "Erreur Stripe" });
    }
  });

  // Save payment method after successful setup
  app.post("/api/stripe/payment-method", async (req, res) => {
    const authClientId = await getAuthenticatedClient(req);
    if (!authClientId) {
      return res.status(401).json({ error: "Non authentifié" });
    }
    
    // Validate request body
    const validation = savePaymentMethodSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: "Données invalides" });
    }
    
    const { clientId, paymentMethodId, isDefault } = validation.data;
    
    // Verify the request is for the authenticated user
    if (clientId !== authClientId) {
      return res.status(403).json({ error: "Accès non autorisé" });
    }
    
    try {
      // Get payment method details from Stripe
      const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
      
      if (!paymentMethod.card) {
        return res.status(400).json({ error: "Méthode de paiement invalide" });
      }
      
      // Get or create Stripe customer
      let stripeCustomer = await dbStorage.getStripeCustomer(authClientId);
      
      if (stripeCustomer) {
        // Attach payment method to customer
        await stripe.paymentMethods.attach(paymentMethodId, {
          customer: stripeCustomer.stripeCustomerId,
        });
      }
      
      // Check if this is the first card
      const existingMethods = await dbStorage.getPaymentMethods(authClientId);
      const shouldBeDefault = isDefault || existingMethods.length === 0;
      
      // Save to database
      const savedMethod = await dbStorage.addPaymentMethod({
        clientId: authClientId,
        stripePaymentMethodId: paymentMethodId,
        last4: paymentMethod.card.last4,
        brand: paymentMethod.card.brand,
        expiryMonth: paymentMethod.card.exp_month,
        expiryYear: paymentMethod.card.exp_year,
        isDefault: shouldBeDefault,
      });
      
      res.json(savedMethod);
    } catch (error) {
      console.error("Error saving payment method:", error);
      res.status(500).json({ error: "Erreur lors de l'enregistrement de la carte" });
    }
  });

  // Get all payment methods for authenticated client
  app.get("/api/stripe/payment-methods/:clientId", async (req, res) => {
    const authClientId = await getAuthenticatedClient(req);
    if (!authClientId) {
      return res.status(401).json({ error: "Non authentifié" });
    }
    
    const { clientId } = req.params;
    
    // Verify the request is for the authenticated user
    if (clientId !== authClientId) {
      return res.status(403).json({ error: "Accès non autorisé" });
    }
    
    try {
      const methods = await dbStorage.getPaymentMethods(authClientId);
      res.json(methods);
    } catch (error) {
      console.error("Error getting payment methods:", error);
      res.status(500).json({ error: "Erreur lors de la récupération des cartes" });
    }
  });

  // Delete a payment method
  app.delete("/api/stripe/payment-method/:id", async (req, res) => {
    const authClientId = await getAuthenticatedClient(req);
    if (!authClientId) {
      return res.status(401).json({ error: "Non authentifié" });
    }
    
    const { id } = req.params;
    
    try {
      // Get the payment method to verify ownership and find Stripe ID
      const methods = await dbStorage.getPaymentMethods(authClientId);
      const method = methods.find(m => m.id === id);
      
      if (!method) {
        return res.status(404).json({ error: "Carte non trouvée" });
      }
      
      // Detach from Stripe
      try {
        await stripe.paymentMethods.detach(method.stripePaymentMethodId);
      } catch (stripeError) {
        console.warn("Could not detach from Stripe:", stripeError);
      }
      
      await dbStorage.deletePaymentMethod(id, authClientId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting payment method:", error);
      res.status(500).json({ error: "Erreur lors de la suppression" });
    }
  });

  // Set default payment method
  app.post("/api/stripe/payment-method/:id/default", async (req, res) => {
    const authClientId = await getAuthenticatedClient(req);
    if (!authClientId) {
      return res.status(401).json({ error: "Non authentifié" });
    }
    
    const { id } = req.params;
    
    try {
      // Verify the card belongs to the authenticated user
      const methods = await dbStorage.getPaymentMethods(authClientId);
      const method = methods.find(m => m.id === id);
      
      if (!method) {
        return res.status(404).json({ error: "Carte non trouvée" });
      }
      
      await dbStorage.setDefaultPaymentMethod(id, authClientId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error setting default payment method:", error);
      res.status(500).json({ error: "Erreur lors de la mise à jour" });
    }
  });

  // Create PaymentIntent for a ride
  app.post("/api/stripe/payment-intent", async (req, res) => {
    const authClientId = await getAuthenticatedClient(req);
    if (!authClientId) {
      return res.status(401).json({ error: "Non authentifié" });
    }
    
    // Validate request body
    const validation = paymentIntentSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: "Données invalides" });
    }
    
    const { clientId, orderId, amount, paymentMethodId } = validation.data;
    
    // Verify the request is for the authenticated user
    if (clientId !== authClientId) {
      return res.status(403).json({ error: "Accès non autorisé" });
    }
    
    try {
      // Verify the order belongs to this client
      const order = await dbStorage.getOrder(orderId);
      if (!order || order.clientId !== authClientId) {
        return res.status(403).json({ error: "Commande non autorisée" });
      }
      
      // Get Stripe customer
      const stripeCustomer = await dbStorage.getStripeCustomer(authClientId);
      if (!stripeCustomer) {
        return res.status(400).json({ error: "Compte Stripe non configuré" });
      }
      
      // Convert XPF to the smallest unit (XPF has no cents, so amount is already in the smallest unit)
      const amountInSmallestUnit = Math.round(amount);
      
      // Create PaymentIntent
      const paymentIntentData: Stripe.PaymentIntentCreateParams = {
        amount: amountInSmallestUnit,
        currency: "xpf",
        customer: stripeCustomer.stripeCustomerId,
        metadata: { orderId, clientId: authClientId },
        automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      };
      
      // If a specific payment method is provided, verify it belongs to this client
      if (paymentMethodId) {
        const methods = await dbStorage.getPaymentMethods(authClientId);
        const method = methods.find(m => m.stripePaymentMethodId === paymentMethodId);
        if (!method) {
          return res.status(403).json({ error: "Méthode de paiement non autorisée" });
        }
        paymentIntentData.payment_method = paymentMethodId;
        paymentIntentData.confirm = true;
        paymentIntentData.off_session = false;
      }
      
      const paymentIntent = await stripe.paymentIntents.create(paymentIntentData);
      
      // Create invoice record
      const invoice = await dbStorage.createInvoice({
        clientId: authClientId,
        orderId,
        amount,
        stripePaymentIntentId: paymentIntent.id,
      });
      
      res.json({ 
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        invoiceId: invoice.id,
        status: paymentIntent.status,
      });
    } catch (error) {
      console.error("Error creating PaymentIntent:", error);
      res.status(500).json({ error: "Erreur lors de la création du paiement" });
    }
  });

  // Confirm payment and update invoice
  app.post("/api/stripe/confirm-payment", async (req, res) => {
    const authClientId = await getAuthenticatedClient(req);
    if (!authClientId) {
      return res.status(401).json({ error: "Non authentifié" });
    }
    
    // Validate request body
    const validation = confirmPaymentSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: "Données invalides" });
    }
    
    const { paymentIntentId, invoiceId } = validation.data;
    
    try {
      // Check payment intent status
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      
      // Verify this payment belongs to the authenticated client
      if (paymentIntent.metadata?.clientId !== authClientId) {
        return res.status(403).json({ error: "Paiement non autorisé" });
      }
      
      if (paymentIntent.status === "succeeded") {
        // Get order and client info to create proper Stripe Invoice
        const dbInvoice = await dbStorage.getInvoiceByOrder(paymentIntent.metadata?.orderId || "");
        const order = dbInvoice ? await dbStorage.getOrder(dbInvoice.orderId) : null;
        const client = await dbStorage.getClient(authClientId);
        
        let invoicePdfUrl: string | undefined;
        let stripeInvoiceId: string | undefined;
        
        // Get or create Stripe customer
        let stripeCustomer = await dbStorage.getStripeCustomer(authClientId);
        if (!stripeCustomer && client) {
          const customer = await stripe.customers.create({
            name: `${client.firstName} ${client.lastName}`,
            phone: client.phone,
            email: client.email || undefined,
            metadata: { clientId: authClientId }
          });
          stripeCustomer = await dbStorage.createStripeCustomer(authClientId, customer.id);
        }
        
        if (stripeCustomer && order) {
          try {
            // Create the invoice first as a draft
            const stripeInvoice = await stripe.invoices.create({
              customer: stripeCustomer.stripeCustomerId,
              auto_advance: false,
              collection_method: 'charge_automatically',
              metadata: {
                orderId: order.id,
                clientId: authClientId,
                paymentIntentId: paymentIntentId
              }
            });
            
            // Create invoice item and attach it to the invoice
            await stripe.invoiceItems.create({
              customer: stripeCustomer.stripeCustomerId,
              invoice: stripeInvoice.id,
              amount: Math.round(order.totalPrice), // Amount in smallest currency unit
              currency: 'xpf',
              description: `Course TAPE'A - ${order.rideOption?.title || 'Transport'}`,
            });
            
            // Finalize the invoice
            await stripe.invoices.finalizeInvoice(stripeInvoice.id);
            
            // Pay the invoice immediately (since payment already succeeded)
            const paidInvoice = await stripe.invoices.pay(stripeInvoice.id, {
              paid_out_of_band: true // Mark as paid externally since PaymentIntent already succeeded
            });
            
            stripeInvoiceId = paidInvoice.id;
            invoicePdfUrl = paidInvoice.invoice_pdf || undefined;
            
            console.log(`[STRIPE] Created invoice ${stripeInvoiceId} for order ${order.id}, PDF: ${invoicePdfUrl}`);
          } catch (invoiceError) {
            console.error("Error creating Stripe invoice:", invoiceError);
            // Continue without invoice - payment was still successful
          }
        }
        
        // Update invoice status with Stripe invoice info
        const invoice = await dbStorage.updateInvoiceStatus(invoiceId, "paid", invoicePdfUrl, stripeInvoiceId);
        
        res.json({ 
          success: true, 
          invoice,
          status: "paid",
        });
      } else {
        res.json({ 
          success: false, 
          status: paymentIntent.status,
          message: "Paiement non confirmé",
        });
      }
    } catch (error) {
      console.error("Error confirming payment:", error);
      res.status(500).json({ error: "Erreur lors de la confirmation" });
    }
  });

  // Get invoices for authenticated client
  app.get("/api/stripe/invoices/:clientId", async (req, res) => {
    const authClientId = await getAuthenticatedClient(req);
    if (!authClientId) {
      return res.status(401).json({ error: "Non authentifié" });
    }
    
    const { clientId } = req.params;
    
    // Verify the request is for the authenticated user
    if (clientId !== authClientId) {
      return res.status(403).json({ error: "Accès non autorisé" });
    }
    
    try {
      const invoices = await dbStorage.getInvoicesByClient(authClientId);
      res.json(invoices);
    } catch (error) {
      console.error("Error getting invoices:", error);
      res.status(500).json({ error: "Erreur lors de la récupération des factures" });
    }
  });

  // Generate Stripe invoice for an existing paid order that doesn't have one yet
  app.post("/api/stripe/generate-invoice/:orderId", async (req, res) => {
    const authClientId = await getAuthenticatedClient(req);
    if (!authClientId) {
      return res.status(401).json({ error: "Non authentifié" });
    }
    
    const { orderId } = req.params;
    
    try {
      // Verify the order belongs to this client
      const order = await dbStorage.getOrder(orderId);
      if (!order || order.clientId !== authClientId) {
        return res.status(403).json({ error: "Commande non autorisée" });
      }
      
      // Check if order was paid by card and is completed
      if (order.paymentMethod !== "card") {
        return res.status(400).json({ error: "Cette commande n'a pas été payée par carte" });
      }
      
      if (!["completed", "payment_confirmed"].includes(order.status)) {
        return res.status(400).json({ error: "Cette commande n'est pas terminée" });
      }
      
      // Get existing invoice record
      let dbInvoice = await dbStorage.getInvoiceByOrder(orderId);
      
      // If invoice already has a PDF URL and amount > 0, return it
      // Allow regeneration if amount is 0 (previous bug)
      if (dbInvoice?.pdfUrl && dbInvoice.amount > 0) {
        return res.json({ success: true, invoice: dbInvoice, message: "Facture déjà générée" });
      }
      
      // Get client info
      const client = await dbStorage.getClient(authClientId);
      if (!client) {
        return res.status(400).json({ error: "Client non trouvé" });
      }
      
      // Get or create Stripe customer
      let stripeCustomer = await dbStorage.getStripeCustomer(authClientId);
      if (!stripeCustomer) {
        const customer = await stripe.customers.create({
          name: `${client.firstName} ${client.lastName}`,
          phone: client.phone,
          email: client.email || undefined,
          metadata: { clientId: authClientId }
        });
        stripeCustomer = await dbStorage.createStripeCustomer(authClientId, customer.id);
      }
      
      // Create the invoice first as a draft
      const stripeInvoice = await stripe.invoices.create({
        customer: stripeCustomer.stripeCustomerId,
        auto_advance: false,
        collection_method: 'charge_automatically',
        metadata: {
          orderId: order.id,
          clientId: authClientId
        }
      });
      
      // Create invoice item and attach it to the invoice
      await stripe.invoiceItems.create({
        customer: stripeCustomer.stripeCustomerId,
        invoice: stripeInvoice.id,
        amount: Math.round(order.totalPrice),
        currency: 'xpf',
        description: `Course TAPE'A - ${order.rideOption?.title || 'Transport'} - ${new Date(order.createdAt).toLocaleDateString('fr-FR')}`,
      });
      
      // Finalize the invoice
      await stripe.invoices.finalizeInvoice(stripeInvoice.id);
      
      // Pay the invoice (mark as paid externally)
      const paidInvoice = await stripe.invoices.pay(stripeInvoice.id, {
        paid_out_of_band: true
      });
      
      // Update or create invoice record in DB
      if (dbInvoice) {
        // Update with new Stripe invoice info
        dbInvoice = await dbStorage.updateInvoiceStatus(
          dbInvoice.id, 
          "paid", 
          paidInvoice.invoice_pdf || undefined,
          paidInvoice.id
        );
      } else {
        dbInvoice = await dbStorage.createInvoice({
          clientId: authClientId,
          orderId: order.id,
          amount: order.totalPrice,
          stripeInvoiceId: paidInvoice.id
        });
        if (dbInvoice) {
          dbInvoice = await dbStorage.updateInvoiceStatus(
            dbInvoice.id, 
            "paid", 
            paidInvoice.invoice_pdf || undefined,
            paidInvoice.id
          );
        }
      }
      
      console.log(`[STRIPE] Generated invoice ${paidInvoice.id} for order ${orderId}, amount: ${order.totalPrice} XPF, PDF: ${paidInvoice.invoice_pdf}`);
      
      res.json({ 
        success: true, 
        invoice: dbInvoice,
        pdfUrl: paidInvoice.invoice_pdf
      });
    } catch (error) {
      console.error("Error generating invoice:", error);
      res.status(500).json({ error: "Erreur lors de la génération de la facture" });
    }
  });

  // Get invoice for specific order (client must own the order)
  app.get("/api/stripe/invoice/order/:orderId", async (req, res) => {
    const authClientId = await getAuthenticatedClient(req);
    if (!authClientId) {
      return res.status(401).json({ error: "Non authentifié" });
    }
    
    const { orderId } = req.params;
    
    try {
      // Verify the order belongs to this client
      const order = await dbStorage.getOrder(orderId);
      if (!order || order.clientId !== authClientId) {
        return res.status(403).json({ error: "Commande non autorisée" });
      }
      
      const invoice = await dbStorage.getInvoiceByOrder(orderId);
      res.json(invoice || null);
    } catch (error) {
      console.error("Error getting invoice:", error);
      res.status(500).json({ error: "Erreur lors de la récupération de la facture" });
    }
  });

  // ============================================================================
  // ROUTES MESSAGERIE (Chat client-chauffeur)
  // ============================================================================

  // Get messages for an order (client)
  app.get("/api/messages/order/:orderId/client", async (req, res) => {
    const authClientId = await getAuthenticatedClient(req);
    if (!authClientId) {
      return res.status(401).json({ error: "Non authentifié" });
    }

    const { orderId } = req.params;

    try {
      // Verify the order belongs to this client
      const order = await dbStorage.getOrder(orderId);
      if (!order || order.clientId !== authClientId) {
        return res.status(403).json({ error: "Accès non autorisé" });
      }

      const messages = await dbStorage.getMessagesByOrder(orderId);
      
      // Mark messages from driver as read
      await dbStorage.markMessagesAsRead(orderId, "client");

      res.json(messages);
    } catch (error) {
      console.error("Error getting messages:", error);
      res.status(500).json({ error: "Erreur lors de la récupération des messages" });
    }
  });

  // Get messages for an order (driver)
  app.get("/api/messages/order/:orderId/driver", async (req, res) => {
    const sessionId = req.headers["x-driver-session"] as string;
    if (!sessionId) {
      return res.status(401).json({ error: "Session manquante" });
    }

    // First try in-memory session
    let driverId: string | undefined;
    const session = await storage.getDriverSession(sessionId);
    if (session) {
      driverId = session.driverId;
    } else {
      // Fallback to database session (survives server restart)
      const dbSession = await dbStorage.getDbDriverSession(sessionId);
      if (dbSession) {
        driverId = dbSession.driverId;
        console.log(`[Messages] Found driver ${driverId} via DB session fallback`);
      }
    }
    
    if (!driverId) {
      return res.status(401).json({ error: "Session invalide" });
    }

    const { orderId } = req.params;

    try {
      // Verify the order - allow for pending OR assigned driver
      const order = await dbStorage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ error: "Commande introuvable" });
      }
      
      // Allow access for pending orders (pre-acceptance) OR if driver is assigned
      const isPending = order.status === "pending";
      const isAssignedDriver = order.assignedDriverId === driverId;
      
      if (!isPending && !isAssignedDriver) {
        return res.status(403).json({ error: "Accès non autorisé" });
      }

      const messages = await dbStorage.getMessagesByOrder(orderId);
      
      // Mark messages from client as read
      await dbStorage.markMessagesAsRead(orderId, "driver");

      res.json(messages);
    } catch (error) {
      console.error("Error getting messages:", error);
      res.status(500).json({ error: "Erreur lors de la récupération des messages" });
    }
  });

  // Send message (client)
  app.post("/api/messages/send/client", async (req, res) => {
    const authClientId = await getAuthenticatedClient(req);
    if (!authClientId) {
      return res.status(401).json({ error: "Non authentifié" });
    }

    const { orderId, content } = req.body;

    if (!orderId || !content) {
      return res.status(400).json({ error: "orderId et content requis" });
    }

    try {
      // Verify the order belongs to this client
      const order = await dbStorage.getOrder(orderId);
      if (!order || order.clientId !== authClientId) {
        return res.status(403).json({ error: "Accès non autorisé" });
      }

      // Check order is in valid state for messaging (including pending for pre-acceptance chat)
      const validStatuses = ["pending", "accepted", "driver_enroute", "driver_arrived", "in_progress"];
      if (!validStatuses.includes(order.status)) {
        return res.status(400).json({ error: "La messagerie n'est disponible que pendant une course active" });
      }

      const message = await dbStorage.createMessage({
        orderId,
        senderId: authClientId,
        senderType: "client",
        content: content.substring(0, 1000), // Limit message length
      });

      // Emit to driver via Socket.IO
      if (order.status === "pending") {
        // For pending orders, emit to all online drivers
        io.to("drivers:online").emit("chat:message", { orderId, message });
        io.to("drivers:online").emit("chat:notification", { 
          orderId, 
          message, 
          clientName: order.clientName || 'Client',
          fromClient: true 
        });
      } else if (order.assignedDriverId) {
        console.log(`[CHAT HTTP] Sending message to driver room: driver:${order.assignedDriverId}`);
        io.to(`driver:${order.assignedDriverId}`).emit("chat:message", { orderId, message });
        io.to(`driver:${order.assignedDriverId}`).emit("chat:notification", { 
          orderId, 
          message, 
          clientName: order.clientName || 'Client',
          fromClient: true 
        });
        // Send OneSignal push notification to assigned driver
        console.log(`[CHAT HTTP] Sending OneSignal push to driver: ${order.assignedDriverId}`);
        driverNotifications.newMessageFromClient(order.assignedDriverId, order.clientName || 'Client', orderId);
      }
      
      // Also emit to order room
      io.to(`order:${orderId}`).emit("chat:message", { orderId, message });

      res.json(message);
    } catch (error) {
      console.error("Error sending message:", error);
      res.status(500).json({ error: "Erreur lors de l'envoi du message" });
    }
  });

  // Send message (driver)
  app.post("/api/messages/send/driver", async (req, res) => {
    const sessionId = req.headers["x-driver-session"] as string;
    if (!sessionId) {
      return res.status(401).json({ error: "Session manquante" });
    }

    // Use fallback to recover session from database if not in memory (after server restart)
    const session = await getDriverSessionWithFallback(sessionId);
    if (!session) {
      return res.status(401).json({ error: "Session invalide" });
    }

    const { orderId, content } = req.body;

    if (!orderId || !content) {
      return res.status(400).json({ error: "orderId et content requis" });
    }

    try {
      // Verify the order is assigned to this driver
      const order = await dbStorage.getOrder(orderId);
      if (!order || order.assignedDriverId !== session.driverId) {
        return res.status(403).json({ error: "Accès non autorisé" });
      }

      // Check order is in active state
      const activeStatuses = ["accepted", "driver_enroute", "driver_arrived", "in_progress"];
      if (!activeStatuses.includes(order.status)) {
        return res.status(400).json({ error: "La messagerie n'est disponible que pendant une course active" });
      }

      const message = await dbStorage.createMessage({
        orderId,
        senderId: session.driverId,
        senderType: "driver",
        content: content.substring(0, 1000), // Limit message length
      });

      // Emit to client via Socket.IO
      io.to(`order:${orderId}`).emit("chat:message", {
        orderId,
        message,
      });

      res.json(message);
    } catch (error) {
      console.error("Error sending message:", error);
      res.status(500).json({ error: "Erreur lors de l'envoi du message" });
    }
  });

  // Get conversations list (client)
  app.get("/api/messages/conversations/client", async (req, res) => {
    const authClientId = await getAuthenticatedClient(req);
    if (!authClientId) {
      return res.status(401).json({ error: "Non authentifié" });
    }

    try {
      const conversations = await dbStorage.getConversationsForClient(authClientId);
      res.json(conversations);
    } catch (error) {
      console.error("Error getting conversations:", error);
      res.status(500).json({ error: "Erreur lors de la récupération des conversations" });
    }
  });

  app.delete("/api/messages/conversations/client/:orderId", async (req, res) => {
    const authClientId = await getAuthenticatedClient(req);
    if (!authClientId) {
      return res.status(401).json({ error: "Non authentifié" });
    }

    const orderId = req.params.orderId;
    if (!orderId) {
      return res.status(400).json({ error: "Commande invalide" });
    }

    try {
      const order = await dbStorage.getOrder(orderId);
      if (!order || order.clientId !== authClientId) {
        return res.status(403).json({ error: "Accès refusé" });
      }
      await dbStorage.deleteMessagesByOrderId(orderId);
      return res.json({ success: true });
    } catch (error) {
      console.error("Error deleting client conversation:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });

  // Get conversations list (driver)
  app.get("/api/messages/conversations/driver", async (req, res) => {
    const sessionId = req.headers["x-driver-session"] as string;
    if (!sessionId) {
      return res.status(401).json({ error: "Session manquante" });
    }

    let session = await storage.getDriverSession(sessionId);
    if (!session) {
      const dbSession = await dbStorage.getDbDriverSession(sessionId);
      if (!dbSession) {
        return res.status(401).json({ error: "Session invalide" });
      }
      session = {
        id: dbSession.id,
        driverId: dbSession.driverId,
        driverName: dbSession.driverName,
        isOnline: dbSession.isOnline, // Garder le statut de la DB
        socketIds: [],
        createdAt: new Date().toISOString(),
        expiresAt: dbSession.expiresAt,
        lastSeenAt: new Date().toISOString(),
      };
    }

    try {
      const conversations = await dbStorage.getConversationsForDriver(session.driverId);
      res.json(conversations);
    } catch (error) {
      console.error("Error getting conversations:", error);
      res.status(500).json({ error: "Erreur lors de la récupération des conversations" });
    }
  });

  app.delete("/api/messages/conversations/driver/:orderId", async (req, res) => {
    const sessionId = req.headers["x-driver-session"] as string;
    if (!sessionId) {
      return res.status(401).json({ error: "Session manquante" });
    }

    let session = await storage.getDriverSession(sessionId);
    if (!session) {
      const dbSession = await dbStorage.getDbDriverSession(sessionId);
      if (!dbSession) {
        return res.status(401).json({ error: "Session invalide" });
      }
      session = {
        id: dbSession.id,
        driverId: dbSession.driverId,
        driverName: dbSession.driverName,
        isOnline: dbSession.isOnline, // Garder le statut de la DB
        socketIds: [],
        createdAt: new Date().toISOString(),
        expiresAt: dbSession.expiresAt,
        lastSeenAt: new Date().toISOString(),
      };
    }

    const orderId = req.params.orderId;
    if (!orderId) {
      return res.status(400).json({ error: "Commande invalide" });
    }

    try {
      const order = await dbStorage.getOrder(orderId);
      if (!order || order.assignedDriverId !== session.driverId) {
        return res.status(403).json({ error: "Accès refusé" });
      }
      await dbStorage.deleteMessagesByOrderId(orderId);
      return res.json({ success: true });
    } catch (error) {
      console.error("Error deleting driver conversation:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  });

  // Get unread count (client)
  app.get("/api/messages/unread/client", async (req, res) => {
    const authClientId = await getAuthenticatedClient(req);
    if (!authClientId) {
      return res.status(401).json({ error: "Non authentifié" });
    }

    try {
      const conversations = await dbStorage.getConversationsForClient(authClientId);
      const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);
      res.json({ unreadCount: totalUnread });
    } catch (error) {
      console.error("Error getting unread count:", error);
      res.status(500).json({ error: "Erreur" });
    }
  });

  // Get unread count (driver)
  app.get("/api/messages/unread/driver", async (req, res) => {
    const sessionId = req.headers["x-driver-session"] as string;
    if (!sessionId) {
      return res.status(401).json({ error: "Session manquante" });
    }

    let session = await storage.getDriverSession(sessionId);
    if (!session) {
      const dbSession = await dbStorage.getDbDriverSession(sessionId);
      if (!dbSession) {
        return res.status(401).json({ error: "Session invalide" });
      }
      session = {
        id: dbSession.id,
        driverId: dbSession.driverId,
        driverName: dbSession.driverName,
        isOnline: dbSession.isOnline, // Garder le statut de la DB
        socketIds: [],
        createdAt: new Date().toISOString(),
        expiresAt: dbSession.expiresAt,
        lastSeenAt: new Date().toISOString(),
      };
    }

    try {
      const conversations = await dbStorage.getConversationsForDriver(session.driverId);
      const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);
      res.json({ unreadCount: totalUnread });
    } catch (error) {
      console.error("Error getting unread count:", error);
      res.status(500).json({ error: "Erreur" });
    }
  });

  // ============================================================================
  // CLOUDINARY UPLOAD ROUTES
  // ============================================================================
  
  const { registerUploadRoutes } = await import("./cloudinary");
  registerUploadRoutes(app);

  // ============================================================================
  // ROUTES ADMIN (SÉPARÉES - ne modifie pas l'app mobile)
  // ============================================================================
  
  // Importer et enregistrer les routes admin
  const { registerAdminRoutes } = await import("./admin-routes");
  registerAdminRoutes(app);

  // Importer et enregistrer les routes prestataires
  const { registerPrestataireRoutes } = await import("./prestataire-routes");
  registerPrestataireRoutes(app);

  // Importer et enregistrer les routes données AWS 2023
  const { registerAWSLegacyRoutes } = await import("./aws-legacy-routes");
  registerAWSLegacyRoutes(app);

  // ============================================================================
  // DEBUG: Endpoint pour tester les rappels de réservation
  // ============================================================================
  app.get("/api/debug/reservation-reminders", async (req, res) => {
    try {
      const now = new Date();
      console.log(`[DEBUG] Current server time: ${now.toISOString()}`);
      console.log(`[DEBUG] Current server time (Tahiti): ${now.toLocaleString('fr-FR', { timeZone: 'Pacific/Tahiti' })}`);
      
      // Récupérer toutes les réservations booked
      const allBookedOrders = await db
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.isAdvanceBooking, true),
            eq(orders.status, 'booked')
          )
        );
      
      console.log(`[DEBUG] Total booked advance bookings: ${allBookedOrders.length}`);
      
      const results = allBookedOrders.map((o: any) => ({
        id: o.id,
        scheduledTime: o.scheduled_time,
        scheduledTimeTahiti: o.scheduled_time ? new Date(o.scheduled_time).toLocaleString('fr-FR', { timeZone: 'Pacific/Tahiti' }) : null,
        assignedDriverId: o.assigned_driver_id,
        clientId: o.client_id,
        status: o.status,
        minutesUntil: o.scheduled_time ? Math.round((new Date(o.scheduled_time).getTime() - now.getTime()) / 60000) : null
      }));
      
      // Tester les rappels
      const reservations1h = await dbStorage.getUpcomingReservations(60, 5);
      const reservations30m = await dbStorage.getUpcomingReservations(30, 5);
      
      res.json({
        serverTimeUTC: now.toISOString(),
        serverTimeTahiti: now.toLocaleString('fr-FR', { timeZone: 'Pacific/Tahiti' }),
        totalBookedReservations: allBookedOrders.length,
        reservations: results,
        upcomingIn1Hour: reservations1h.length,
        upcomingIn30Min: reservations30m.length,
        reservations1hDetails: reservations1h.map(o => ({ id: o.id, scheduledTime: o.scheduledTime })),
        reservations30mDetails: reservations30m.map(o => ({ id: o.id, scheduledTime: o.scheduledTime }))
      });
    } catch (error) {
      console.error('[DEBUG] Error:', error);
      res.status(500).json({ error: String(error) });
    }
  });

  // ============================================================================
  // APP VERSION CHECK - Mise à jour forcée
  // ============================================================================
  
  // Configuration des versions minimales requises
  const APP_VERSION_CONFIG = {
    client: {
      minVersion: "1.0.0", // Version minimale requise pour l'app client
      currentVersion: "1.0.0", // Dernière version disponible
      forceUpdate: false, // Activer/désactiver la mise à jour forcée
      message: "Une nouvelle version de TAPEA est disponible. Veuillez mettre à jour l'application pour continuer.",
      iosStoreUrl: "https://apps.apple.com/app/tapea/id000000000", // À remplacer après publication
      androidStoreUrl: "https://play.google.com/store/apps/details?id=com.tapea.client", // À remplacer après publication
    },
    chauffeur: {
      minVersion: "1.0.0",
      currentVersion: "1.0.0",
      forceUpdate: false,
      message: "Une nouvelle version de TAPEA Chauffeur est disponible. Veuillez mettre à jour l'application pour continuer.",
      iosStoreUrl: "https://apps.apple.com/app/tapea-chauffeur/id000000000",
      androidStoreUrl: "https://play.google.com/store/apps/details?id=com.tapea.chauffeur",
    }
  };

  // Route pour vérifier la version de l'app
  app.get("/api/app/version-check", (req, res) => {
    const appType = req.query.app as string || "client"; // "client" ou "chauffeur"
    const currentAppVersion = req.query.version as string || "0.0.0";
    const platform = req.query.platform as string || "ios"; // "ios" ou "android"
    
    const config = appType === "chauffeur" ? APP_VERSION_CONFIG.chauffeur : APP_VERSION_CONFIG.client;
    
    // Fonction pour comparer les versions (ex: "1.2.3" vs "1.2.4")
    const compareVersions = (v1: string, v2: string): number => {
      const parts1 = v1.split('.').map(Number);
      const parts2 = v2.split('.').map(Number);
      
      for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
        const p1 = parts1[i] || 0;
        const p2 = parts2[i] || 0;
        if (p1 < p2) return -1;
        if (p1 > p2) return 1;
      }
      return 0;
    };
    
    const needsUpdate = compareVersions(currentAppVersion, config.minVersion) < 0;
    const storeUrl = platform === "android" ? config.androidStoreUrl : config.iosStoreUrl;
    
    console.log(`[VERSION CHECK] App: ${appType}, Version: ${currentAppVersion}, Min: ${config.minVersion}, NeedsUpdate: ${needsUpdate}`);
    
    res.json({
      minVersion: config.minVersion,
      currentVersion: config.currentVersion,
      forceUpdate: config.forceUpdate && needsUpdate,
      needsUpdate,
      message: config.message,
      storeUrl,
      iosStoreUrl: config.iosStoreUrl,
      androidStoreUrl: config.androidStoreUrl,
    });
  });

  // Route admin pour mettre à jour la configuration des versions (protégée par secret)
  app.post("/api/admin/app-version", (req: any, res) => {
    // Vérification simple via header secret
    const adminSecret = req.headers["x-admin-secret"] as string;
    const expectedSecret = process.env.ADMIN_SECRET || "tapea-admin-2026";
    
    if (adminSecret !== expectedSecret) {
      return res.status(401).json({ error: "Non autorisé" });
    }
    
    const { appType, minVersion, forceUpdate, message, iosStoreUrl, androidStoreUrl } = req.body;
    
    if (appType !== "client" && appType !== "chauffeur") {
      return res.status(400).json({ error: "appType doit être 'client' ou 'chauffeur'" });
    }
    
    const config = appType === "chauffeur" ? APP_VERSION_CONFIG.chauffeur : APP_VERSION_CONFIG.client;
    
    if (minVersion) config.minVersion = minVersion;
    if (typeof forceUpdate === "boolean") config.forceUpdate = forceUpdate;
    if (message) config.message = message;
    if (iosStoreUrl) config.iosStoreUrl = iosStoreUrl;
    if (androidStoreUrl) config.androidStoreUrl = androidStoreUrl;
    
    console.log(`[VERSION CONFIG] Updated ${appType}:`, config);
    
    res.json({ success: true, config });
  });

  // Route admin pour voir la configuration actuelle
  app.get("/api/admin/app-version", (req, res) => {
    res.json(APP_VERSION_CONFIG);
  });

  // ============================================================================
  // SERVICE DE RAPPEL POUR RÉSERVATIONS À L'AVANCE
  // ============================================================================
  
  // Set pour tracker les notifications déjà envoyées (format: "orderId-type")
  const sentReservationReminders = new Set<string>();
  
  // Nettoyer les anciennes entrées toutes les heures
  setInterval(() => {
    console.log('[ReservationReminder] Cleaning old reminder entries...');
    sentReservationReminders.clear();
  }, 60 * 60 * 1000); // 1 heure
  
  // Vérifier les réservations toutes les 1 minute
  setInterval(async () => {
    try {
      console.log(`[ReservationReminder] ⏰ Checking for upcoming reservations at ${new Date().toISOString()}`);
      
      // Rappel 1 heure avant
      const reservations1h = await dbStorage.getUpcomingReservations(60, 5);
      console.log(`[ReservationReminder] Found ${reservations1h.length} reservations for 1-hour reminder`);
      
      for (const order of reservations1h) {
        const reminderKey1h = `${order.id}-1hour`;
        if (!sentReservationReminders.has(reminderKey1h)) {
          console.log(`[ReservationReminder] 📤 Sending 1-hour reminder for order ${order.id}`);
          console.log(`[ReservationReminder] - assignedDriverId: ${order.assignedDriverId}`);
          console.log(`[ReservationReminder] - clientId: ${order.clientId}`);
          console.log(`[ReservationReminder] - scheduledTime: ${order.scheduledTime}`);
          
          // Récupérer le chauffeur assigné
          if (order.assignedDriverId) {
            const driver = await dbStorage.getDriver(order.assignedDriverId);
            const driverName = driver ? `${driver.firstName || ''} ${driver.lastName || ''}`.trim() || 'Chauffeur' : null;
            console.log(`[ReservationReminder] - driver found: ${driver ? driverName : 'NOT FOUND'}`);
            
            if (driver && driverName) {
              // Notification chauffeur
              const pickupAddress = Array.isArray(order.addresses) && order.addresses[0]
                ? (order.addresses[0] as any).value || (order.addresses[0] as any).address || 'Adresse non spécifiée'
                : 'Adresse non spécifiée';
              
              console.log(`[ReservationReminder] Sending notification to driver ${driver.id}`);
              const driverNotifResult = await driverNotifications.reservationIn1Hour(
                driver.id,
                order.clientName || 'Client',
                order.id,
                pickupAddress
              );
              console.log(`[ReservationReminder] Driver notification result: ${driverNotifResult}`);
              
              // Notification client
              if (order.clientId) {
                console.log(`[ReservationReminder] Sending notification to client ${order.clientId}`);
                const clientNotifResult = await clientNotifications.reservationIn1Hour(
                  order.clientId,
                  driverName,
                  order.id
                );
                console.log(`[ReservationReminder] Client notification result: ${clientNotifResult}`);
              }
            }
          }
          
          sentReservationReminders.add(reminderKey1h);
        }
      }
      
      // Rappel 30 minutes avant
      const reservations30m = await dbStorage.getUpcomingReservations(30, 5);
      console.log(`[ReservationReminder] Found ${reservations30m.length} reservations for 30-min reminder`);
      
      for (const order of reservations30m) {
        const reminderKey30m = `${order.id}-30min`;
        if (!sentReservationReminders.has(reminderKey30m)) {
          console.log(`[ReservationReminder] 📤 Sending 30-min reminder for order ${order.id}`);
          console.log(`[ReservationReminder] - assignedDriverId: ${order.assignedDriverId}`);
          console.log(`[ReservationReminder] - clientId: ${order.clientId}`);
          console.log(`[ReservationReminder] - scheduledTime: ${order.scheduledTime}`);
          
          // Récupérer le chauffeur assigné
          if (order.assignedDriverId) {
            const driver = await dbStorage.getDriver(order.assignedDriverId);
            const driverName = driver ? `${driver.firstName || ''} ${driver.lastName || ''}`.trim() || 'Chauffeur' : null;
            console.log(`[ReservationReminder] - driver found: ${driver ? driverName : 'NOT FOUND'}`);
            
            if (driver && driverName) {
              // Notification chauffeur
              const pickupAddress = Array.isArray(order.addresses) && order.addresses[0]
                ? (order.addresses[0] as any).value || (order.addresses[0] as any).address || 'Adresse non spécifiée'
                : 'Adresse non spécifiée';
              
              console.log(`[ReservationReminder] Sending notification to driver ${driver.id}`);
              const driverNotifResult = await driverNotifications.reservationIn30Min(
                driver.id,
                order.clientName || 'Client',
                order.id,
                pickupAddress
              );
              console.log(`[ReservationReminder] Driver notification result: ${driverNotifResult}`);
              
              // Notification client
              if (order.clientId) {
                console.log(`[ReservationReminder] Sending notification to client ${order.clientId}`);
                const clientNotifResult = await clientNotifications.reservationIn30Min(
                  order.clientId,
                  driverName,
                  order.id
                );
                console.log(`[ReservationReminder] Client notification result: ${clientNotifResult}`);
              }
            }
          }
          
          sentReservationReminders.add(reminderKey30m);
        }
      }
    } catch (error) {
      console.error('[ReservationReminder] ❌ Error checking reservations:', error);
    }
  }, 1 * 60 * 1000); // Toutes les 1 minute
  
  console.log('[ReservationReminder] ✅ Service de rappel des réservations activé');

  return httpServer;
}
