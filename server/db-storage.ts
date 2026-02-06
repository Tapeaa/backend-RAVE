import { eq, and, gt, isNull, isNotNull, sql, desc } from "drizzle-orm";
import { db } from "./db";
import { 
  clients, 
  clientSessions, 
  driverSessions,
  verificationCodes,
  orders,
  drivers,
  stripeCustomers,
  paymentMethods,
  invoices,
  tarifs,
  supplements,
  messages,
  supportMessages,
  commissions,
  prestataires,
  ratings
} from "@shared/schema";
import { 
  type Client,
  type InsertClient,
  type ClientSession,
  type VerificationCode,
  type Order,
  type InsertOrder,
  type AddressField,
  type Driver,
  type InsertDriver,
  type StripeCustomer,
  type PaymentMethod,
  type Invoice,
  type DriverSession,
  type Message,
  type InsertMessage,
  type SupportMessage,
  type InsertSupportMessage,
  type Commission
} from "@shared/schema";
import { randomUUID, scryptSync, randomBytes } from "crypto";

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) return false;
  const testHash = scryptSync(password, salt, 64).toString("hex");
  return hash === testHash;
}

function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export { hashPassword, verifyPassword };

export class DbStorage {
  private mapOrder(order: any): Order {
    // S'assurer que rideOption est un objet (certains drivers retournent une string)
    const rideOption = typeof order.rideOption === 'string' 
      ? JSON.parse(order.rideOption) 
      : order.rideOption;
    
    return {
      id: order.id,
      clientId: order.clientId,
      clientName: order.clientName,
      clientPhone: order.clientPhone,
      addresses: order.addresses as AddressField[],
      rideOption: rideOption as Order["rideOption"],
      routeInfo: order.routeInfo as Order["routeInfo"],
      passengers: order.passengers,
      supplements: order.supplements as Order["supplements"],
      totalPrice: order.totalPrice,
      driverEarnings: order.driverEarnings,
      waitingTimeMinutes: order.waitingTimeMinutes ?? null,
      driverArrivedAt: (rideOption as any)?.driverArrivedAt || null,
      driverComment: order.driverComment || null,
      paymentMethod: (order.paymentMethod || "cash") as Order["paymentMethod"],
      scheduledTime: order.scheduledTime instanceof Date ? order.scheduledTime.toISOString() : (order.scheduledTime ?? null),
      isAdvanceBooking: order.isAdvanceBooking,
      status: order.status as Order["status"],
      assignedDriverId: order.assignedDriverId,
      clientRatingId: order.clientRatingId,
      driverRatingId: order.driverRatingId,
      createdAt: order.createdAt instanceof Date ? order.createdAt.toISOString() : order.createdAt,
      expiresAt: order.expiresAt instanceof Date ? order.expiresAt.toISOString() : order.expiresAt,
    };
  }

  async createClient(insertClient: InsertClient): Promise<Client> {
    const hashedPassword = hashPassword(insertClient.password);
    
    const [client] = await db.insert(clients).values({
      phone: insertClient.phone,
      hashedPassword,
      firstName: insertClient.firstName,
      lastName: insertClient.lastName,
      isVerified: false,
      walletBalance: 0,
      totalRides: 0,
    }).returning();
    
    return {
      id: client.id,
      phone: client.phone,
      hashedPassword: client.hashedPassword,
      firstName: client.firstName,
      lastName: client.lastName,
      email: client.email,
      photoUrl: client.photoUrl,
      isVerified: client.isVerified,
      walletBalance: client.walletBalance,
      averageRating: client.averageRating,
      totalRides: client.totalRides,
      createdAt: client.createdAt.toISOString(),
    };
  }

  async getClient(id: string): Promise<Client | undefined> {
    const [client] = await db.select().from(clients).where(eq(clients.id, id));
    if (!client) return undefined;
    
    return {
      id: client.id,
      phone: client.phone,
      hashedPassword: client.hashedPassword,
      firstName: client.firstName,
      lastName: client.lastName,
      email: client.email,
      photoUrl: client.photoUrl,
      isVerified: client.isVerified,
      walletBalance: client.walletBalance,
      averageRating: client.averageRating,
      totalRides: client.totalRides,
      createdAt: client.createdAt.toISOString(),
      // CGU et politique de confidentialité
      cguAccepted: client.cguAccepted || false,
      cguAcceptedAt: client.cguAcceptedAt?.toISOString() || null,
      cguVersion: client.cguVersion || null,
      privacyPolicyRead: client.privacyPolicyRead || false,
      privacyPolicyReadAt: client.privacyPolicyReadAt?.toISOString() || null,
      privacyPolicyVersion: client.privacyPolicyVersion || null,
    };
  }

  async getClientByPhone(phone: string): Promise<Client | undefined> {
    const [client] = await db.select().from(clients).where(eq(clients.phone, phone));
    if (!client) return undefined;
    
    return {
      id: client.id,
      phone: client.phone,
      hashedPassword: client.hashedPassword,
      firstName: client.firstName,
      lastName: client.lastName,
      email: client.email,
      photoUrl: client.photoUrl,
      isVerified: client.isVerified,
      walletBalance: client.walletBalance,
      averageRating: client.averageRating,
      totalRides: client.totalRides,
      createdAt: client.createdAt.toISOString(),
      // CGU et politique de confidentialité
      cguAccepted: client.cguAccepted || false,
      cguAcceptedAt: client.cguAcceptedAt?.toISOString() || null,
      cguVersion: client.cguVersion || null,
      privacyPolicyRead: client.privacyPolicyRead || false,
      privacyPolicyReadAt: client.privacyPolicyReadAt?.toISOString() || null,
      privacyPolicyVersion: client.privacyPolicyVersion || null,
    };
  }

  async updateClientVerified(clientId: string, isVerified: boolean): Promise<Client | undefined> {
    const [client] = await db.update(clients)
      .set({ isVerified })
      .where(eq(clients.id, clientId))
      .returning();
    
    if (!client) return undefined;
    
    return {
      id: client.id,
      phone: client.phone,
      hashedPassword: client.hashedPassword,
      firstName: client.firstName,
      lastName: client.lastName,
      email: client.email,
      photoUrl: client.photoUrl,
      isVerified: client.isVerified,
      walletBalance: client.walletBalance,
      averageRating: client.averageRating,
      totalRides: client.totalRides,
      createdAt: client.createdAt.toISOString(),
    };
  }

  async updateClientPassword(clientId: string, hashedPassword: string): Promise<Client | undefined> {
    const [client] = await db.update(clients)
      .set({ hashedPassword })
      .where(eq(clients.id, clientId))
      .returning();
    
    if (!client) return undefined;
    
    return {
      id: client.id,
      phone: client.phone,
      hashedPassword: client.hashedPassword,
      firstName: client.firstName,
      lastName: client.lastName,
      email: client.email,
      photoUrl: client.photoUrl,
      isVerified: client.isVerified,
      walletBalance: client.walletBalance,
      averageRating: client.averageRating,
      totalRides: client.totalRides,
      createdAt: client.createdAt.toISOString(),
    };
  }

  async updateClientWallet(clientId: string, amount: number): Promise<Client | undefined> {
    const current = await this.getClient(clientId);
    if (!current) return undefined;
    
    const newBalance = current.walletBalance + amount;
    
    const [client] = await db.update(clients)
      .set({ walletBalance: newBalance })
      .where(eq(clients.id, clientId))
      .returning();
    
    if (!client) return undefined;
    
    return {
      id: client.id,
      phone: client.phone,
      hashedPassword: client.hashedPassword,
      firstName: client.firstName,
      lastName: client.lastName,
      email: client.email,
      photoUrl: client.photoUrl,
      isVerified: client.isVerified,
      walletBalance: client.walletBalance,
      averageRating: client.averageRating,
      totalRides: client.totalRides,
      createdAt: client.createdAt.toISOString(),
    };
  }

  async updateClientProfile(clientId: string, data: { firstName?: string; lastName?: string; email?: string | null; photoUrl?: string | null }): Promise<Client | undefined> {
    const updateData: Record<string, unknown> = {};
    if (data.firstName !== undefined) updateData.firstName = data.firstName;
    if (data.lastName !== undefined) updateData.lastName = data.lastName;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.photoUrl !== undefined) updateData.photoUrl = data.photoUrl;
    
    if (Object.keys(updateData).length === 0) {
      return this.getClient(clientId);
    }
    
    const [client] = await db.update(clients)
      .set(updateData)
      .where(eq(clients.id, clientId))
      .returning();
    
    if (!client) return undefined;
    
    return {
      id: client.id,
      phone: client.phone,
      hashedPassword: client.hashedPassword,
      firstName: client.firstName,
      lastName: client.lastName,
      email: client.email,
      photoUrl: client.photoUrl,
      isVerified: client.isVerified,
      walletBalance: client.walletBalance,
      averageRating: client.averageRating,
      totalRides: client.totalRides,
      createdAt: client.createdAt.toISOString(),
    };
  }

  async updateDriverProfile(driverId: string, data: { firstName?: string; lastName?: string; vehicleModel?: string | null; vehicleColor?: string | null; vehiclePlate?: string | null }): Promise<Driver | undefined> {
    const updateData: Record<string, unknown> = {};
    if (data.firstName !== undefined) updateData.firstName = data.firstName;
    if (data.lastName !== undefined) updateData.lastName = data.lastName;
    if (data.vehicleModel !== undefined) updateData.vehicleModel = data.vehicleModel;
    if (data.vehicleColor !== undefined) updateData.vehicleColor = data.vehicleColor;
    if (data.vehiclePlate !== undefined) updateData.vehiclePlate = data.vehiclePlate;
    
    if (Object.keys(updateData).length === 0) {
      return this.getDriver(driverId);
    }
    
    const [driver] = await db.update(drivers)
      .set(updateData)
      .where(eq(drivers.id, driverId))
      .returning();
    
    if (!driver) return undefined;
    
    return {
      id: driver.id,
      phone: driver.phone,
      code: driver.code,
      firstName: driver.firstName,
      lastName: driver.lastName,
      typeChauffeur: driver.typeChauffeur as "salarie" | "patente",
      vehicleModel: driver.vehicleModel,
      vehicleColor: driver.vehicleColor,
      vehiclePlate: driver.vehiclePlate,
      photoUrl: driver.photoUrl,
      lastLatitude: driver.lastLatitude ?? null,
      lastLongitude: driver.lastLongitude ?? null,
      lastLocationAt: driver.lastLocationAt?.toISOString() || null,
      isActive: driver.isActive,
      averageRating: driver.averageRating,
      totalRides: driver.totalRides,
      createdAt: driver.createdAt.toISOString(),
    };
  }

  async updateDriverLastLocation(
    driverId: string,
    latitude: number,
    longitude: number,
    timestamp: number
  ): Promise<void> {
    await db.update(drivers)
      .set({
        lastLatitude: latitude,
        lastLongitude: longitude,
        lastLocationAt: new Date(timestamp),
      })
      .where(eq(drivers.id, driverId));
  }

  async incrementDriverTotalRides(driverId: string): Promise<void> {
    try {
      await db.update(drivers)
        .set({ totalRides: sql`${drivers.totalRides} + 1` })
        .where(eq(drivers.id, driverId));
      console.log(`[DB] Incremented totalRides for driver ${driverId}`);
    } catch (error) {
      console.error(`[DB] Error incrementing totalRides for driver ${driverId}:`, error);
    }
  }

  async createClientSession(clientId: string): Promise<ClientSession> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    const [session] = await db.insert(clientSessions).values({
      clientId,
      expiresAt,
    }).returning();
    
    return {
      id: session.id,
      clientId: session.clientId,
      expiresAt: session.expiresAt.toISOString(),
      createdAt: session.createdAt.toISOString(),
      lastSeenAt: session.lastSeenAt.toISOString(),
    };
  }

  async getClientSession(id: string): Promise<ClientSession | undefined> {
    const now = new Date();
    const [session] = await db.select()
      .from(clientSessions)
      .where(and(
        eq(clientSessions.id, id),
        gt(clientSessions.expiresAt, now)
      ));
    
    if (!session) return undefined;
    
    return {
      id: session.id,
      clientId: session.clientId,
      expiresAt: session.expiresAt.toISOString(),
      createdAt: session.createdAt.toISOString(),
      lastSeenAt: session.lastSeenAt.toISOString(),
    };
  }

  async deleteClientSession(id: string): Promise<boolean> {
    const result = await db.delete(clientSessions)
      .where(eq(clientSessions.id, id));
    return true;
  }

  async refreshClientSession(id: string): Promise<ClientSession | undefined> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    const [session] = await db.update(clientSessions)
      .set({ expiresAt, lastSeenAt: now })
      .where(eq(clientSessions.id, id))
      .returning();
    
    if (!session) return undefined;
    
    return {
      id: session.id,
      clientId: session.clientId,
      expiresAt: session.expiresAt.toISOString(),
      createdAt: session.createdAt.toISOString(),
      lastSeenAt: session.lastSeenAt.toISOString(),
    };
  }

  // Driver session methods (persistent in database)
  // sessionId parameter allows syncing with in-memory session ID
  async createDbDriverSession(driverId: string, driverName: string, sessionId?: string): Promise<{ id: string; driverId: string; driverName: string; expiresAt: string }> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days
    
    // If sessionId provided, check if it already exists in database
    if (sessionId) {
      const existingById = await this.getDbDriverSession(sessionId);
      if (existingById) {
        // Session already exists, just refresh it
        return this.refreshDbDriverSession(sessionId) as Promise<{ id: string; driverId: string; driverName: string; expiresAt: string }>;
      }
    }
    
    // Check if a different session already exists for this driver
    const existingSession = await this.getDbDriverSessionByDriverId(driverId);
    if (existingSession) {
      // Delete old session and create new one with the in-memory session ID
      await db.delete(driverSessions).where(eq(driverSessions.id, existingSession.id));
    }
    
    // Create new session with the provided sessionId (or let DB generate one)
    const insertValues: any = {
      driverId,
      driverName,
      expiresAt,
      isOnline: false,
    };
    
    if (sessionId) {
      insertValues.id = sessionId;
    }
    
    const [session] = await db.insert(driverSessions).values(insertValues).returning();
    
    return {
      id: session.id,
      driverId: session.driverId,
      driverName: session.driverName,
      expiresAt: session.expiresAt.toISOString(),
    };
  }

  async getDbDriverSession(id: string): Promise<{ id: string; driverId: string; driverName: string; expiresAt: string; isOnline: boolean; createdAt?: string } | undefined> {
    const now = new Date();
    const [session] = await db.select()
      .from(driverSessions)
      .where(and(
        eq(driverSessions.id, id),
        gt(driverSessions.expiresAt, now)
      ));
    
    if (!session) return undefined;
    
    return {
      id: session.id,
      driverId: session.driverId,
      driverName: session.driverName,
      expiresAt: session.expiresAt.toISOString(),
      isOnline: session.isOnline,
      createdAt: session.createdAt?.toISOString(),
    };
  }

  async getDbDriverSessionByDriverId(driverId: string): Promise<{ id: string; driverId: string; driverName: string; expiresAt: string } | undefined> {
    const now = new Date();
    const [session] = await db.select()
      .from(driverSessions)
      .where(and(
        eq(driverSessions.driverId, driverId),
        gt(driverSessions.expiresAt, now)
      ));
    
    if (!session) return undefined;
    
    return {
      id: session.id,
      driverId: session.driverId,
      driverName: session.driverName,
      expiresAt: session.expiresAt.toISOString(),
    };
  }

  async refreshDbDriverSession(id: string): Promise<{ id: string; driverId: string; driverName: string; expiresAt: string } | undefined> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    const [session] = await db.update(driverSessions)
      .set({ expiresAt, lastSeenAt: now })
      .where(eq(driverSessions.id, id))
      .returning();
    
    if (!session) return undefined;
    
    return {
      id: session.id,
      driverId: session.driverId,
      driverName: session.driverName,
      expiresAt: session.expiresAt.toISOString(),
    };
  }

  async updateDriverNameInDbSessions(driverId: string, newName: string): Promise<void> {
    await db.update(driverSessions)
      .set({ driverName: newName })
      .where(eq(driverSessions.driverId, driverId));
    console.log(`[DB] Updated driver name to "${newName}" in sessions for driverId ${driverId}`);
  }

  async createVerificationCode(phone: string, type: "registration" | "login" | "password_reset"): Promise<VerificationCode> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);
    const code = generateVerificationCode();
    
    const [vc] = await db.insert(verificationCodes).values({
      phone,
      code,
      type,
      expiresAt,
    }).returning();
    
    console.log(`[SMS] Code de vérification pour ${phone}: ${code}`);
    
    return {
      id: vc.id,
      phone: vc.phone,
      code: vc.code,
      type: vc.type as "registration" | "login" | "password_reset",
      expiresAt: vc.expiresAt.toISOString(),
      usedAt: vc.usedAt?.toISOString() ?? null,
      createdAt: vc.createdAt.toISOString(),
    };
  }

  async getVerificationCode(phone: string, code: string, type: "registration" | "login" | "password_reset"): Promise<VerificationCode | undefined> {
    const now = new Date();
    const [vc] = await db.select()
      .from(verificationCodes)
      .where(and(
        eq(verificationCodes.phone, phone),
        eq(verificationCodes.code, code),
        eq(verificationCodes.type, type),
        isNull(verificationCodes.usedAt),
        gt(verificationCodes.expiresAt, now)
      ));
    
    if (!vc) return undefined;
    
    return {
      id: vc.id,
      phone: vc.phone,
      code: vc.code,
      type: vc.type as "registration" | "login" | "password_reset",
      expiresAt: vc.expiresAt.toISOString(),
      usedAt: vc.usedAt?.toISOString() ?? null,
      createdAt: vc.createdAt.toISOString(),
    };
  }

  async markVerificationCodeUsed(id: string): Promise<void> {
    await db.update(verificationCodes)
      .set({ usedAt: new Date() })
      .where(eq(verificationCodes.id, id));
  }

  async createOrder(insertOrder: InsertOrder, clientId?: string): Promise<Order> {
    const now = new Date();
    
    // Durée de vie selon le type de commande:
    // - Réservation à l'avance ou Tour de l'île: 3 jours (72 heures)
    // - Chauffeur immédiat: 20 minutes
    const isAdvanceOrTour = insertOrder.isAdvanceBooking || insertOrder.rideOption?.id === 'tour';
    const expirationTime = isAdvanceOrTour 
      ? 3 * 24 * 60 * 60 * 1000  // 3 jours en millisecondes
      : 20 * 60 * 1000;          // 20 minutes en millisecondes
    const expiresAt = new Date(now.getTime() + expirationTime);
    
    const [order] = await db.insert(orders).values({
      clientId: clientId ?? null,
      clientName: insertOrder.clientName,
      clientPhone: insertOrder.clientPhone,
      addresses: insertOrder.addresses as any,
      rideOption: {
        ...insertOrder.rideOption,
        initialTotalPrice: insertOrder.totalPrice,
        initialDriverEarnings: insertOrder.driverEarnings
      } as any,
      routeInfo: insertOrder.routeInfo as any,
      passengers: insertOrder.passengers,
      supplements: insertOrder.supplements as any,
      totalPrice: insertOrder.totalPrice,
      driverEarnings: insertOrder.driverEarnings,
      paymentMethod: insertOrder.paymentMethod || "cash",
      driverComment: (insertOrder as any).driverComment || null, // Message du client pour le chauffeur
      scheduledTime: insertOrder.scheduledTime ? new Date(insertOrder.scheduledTime) : null,
      isAdvanceBooking: insertOrder.isAdvanceBooking,
      status: "pending",
      expiresAt,
    }).returning();
    
    return this.mapOrder(order);
  }

  async getOrder(id: string): Promise<Order | undefined> {
    const [order] = await db.select().from(orders).where(eq(orders.id, id));
    if (!order) return undefined;
    return this.mapOrder(order);
  }

  async getPendingOrders(): Promise<Order[]> {
    const now = new Date();
    const result = await db.select()
      .from(orders)
      .where(and(
        eq(orders.status, "pending"),
        gt(orders.expiresAt, now)
      ));
    
    return result.map((order: any) => this.mapOrder(order));
  }

  async updateOrderStatus(id: string, status: Order["status"], driverId?: string, waitingTimeMinutes?: number | null, driverArrivedAt?: Date | null, driverEarnings?: number): Promise<Order | undefined> {
    const updateData: any = { status };
    if (driverId) updateData.assignedDriverId = driverId;
    
    // Si driverEarnings est fourni (recalculé selon le type de chauffeur), le mettre à jour
    if (driverEarnings !== undefined) {
      updateData.driverEarnings = driverEarnings;
      console.log(`[updateOrderStatus] Updated driverEarnings to ${driverEarnings} for order ${id}`);
    }
    
    // Si driverArrivedAt est fourni, on le stocke dans rideOption (pour éviter migration DB)
    if (driverArrivedAt !== undefined) {
      const currentOrder = await this.getOrder(id);
      if (currentOrder) {
        updateData.rideOption = {
          ...currentOrder.rideOption,
          driverArrivedAt: driverArrivedAt?.toISOString() || null
        };
      }
    }
    
    // Si waitingTimeMinutes est fourni, calculer le supplément d'attente
    if (waitingTimeMinutes !== undefined && waitingTimeMinutes !== null && waitingTimeMinutes > 0) {
      updateData.waitingTimeMinutes = waitingTimeMinutes;
      
      // Récupérer la commande actuelle pour calculer le nouveau totalPrice
      const currentOrder = await this.getOrder(id);
      if (currentOrder) {
        let waitingRate = 42; // Tarif d'attente par défaut (Dashboard)
        try {
          const [waitingTarif] = await db
            .select()
            .from(tarifs)
            .where(and(eq(tarifs.actif, true), eq(tarifs.typeTarif, "minute_arret")))
            .limit(1);
          if (waitingTarif?.prixXpf) {
            waitingRate = waitingTarif.prixXpf;
          }
        } catch (error) {
          console.warn("[updateOrderStatus] Impossible de récupérer le tarif minute_arret, fallback 42.");
        }

        // Calculer le supplément : Tarif Dashboard par minute après les 5 premières gratuites
        const freeMinutes = 5;
        const billableMinutes = Math.max(0, waitingTimeMinutes - freeMinutes);
        const waitingFee = billableMinutes * waitingRate;
        
        // Utiliser le prix initial s'il est stocké dans rideOption, sinon le prix actuel
        const initialPrice = (currentOrder.rideOption as any)?.initialTotalPrice;
        const basePrice = initialPrice !== undefined ? initialPrice : currentOrder.totalPrice;
        
        // Ajouter le supplément au prix de base + les arrêts payants déjà enregistrés
        const paidStopsCost = (currentOrder.rideOption as any)?.paidStopsCost || 0;
        const newTotalPrice = basePrice + waitingFee + paidStopsCost;
        updateData.totalPrice = newTotalPrice;
        
        // Ajuster les gains du chauffeur proportionnellement (85% du total)
        const initialEarnings = (currentOrder.rideOption as any)?.initialDriverEarnings;
        const baseEarnings = initialEarnings !== undefined ? initialEarnings : currentOrder.driverEarnings;
        const newDriverEarnings = baseEarnings + (waitingFee * 0.85) + (paidStopsCost * 0.85);
        updateData.driverEarnings = newDriverEarnings;
        
        console.log(`[updateOrderStatus] Frais d'attente calculés: ${billableMinutes} min × ${waitingRate} XPF = ${waitingFee} XPF. Nouveau total: ${newTotalPrice} XPF (Base: ${basePrice}, Arrêts: ${paidStopsCost})`);
      }
    }
    
    const [order] = await db.update(orders)
      .set(updateData)
      .where(eq(orders.id, id))
      .returning();
    
    if (!order) return undefined;
    return this.mapOrder(order);
  }

  async getOrdersByDriver(driverId: string): Promise<Order[]> {
    const result = await db.select().from(orders).where(eq(orders.assignedDriverId, driverId));
    return result.map((order: any) => this.mapOrder(order));
  }

  async getOrdersByClient(clientId: string): Promise<Order[]> {
    const result = await db.select()
      .from(orders)
      .where(eq(orders.clientId, clientId))
      .orderBy(desc(orders.createdAt));
    
    return result.map((order: any) => this.mapOrder(order));
  }

  // Fonction pour gérer les arrêts : facturation du temps d'arrêt (Tarif Dashboard dès la 1ère minute)
  async updateOrderStopTime(id: string, stopIndex: number, stopMinutes: number): Promise<Order | undefined> {
    // Récupérer la commande actuelle
    const currentOrder = await this.getOrder(id);
    if (!currentOrder) return undefined;

    let stopRate = 42; // Tarif par défaut (Dashboard)
    try {
      const [waitingTarif] = await db
        .select()
        .from(tarifs)
        .where(and(eq(tarifs.actif, true), eq(tarifs.typeTarif, "minute_arret")))
        .limit(1);
      if (waitingTarif?.prixXpf) {
        stopRate = waitingTarif.prixXpf;
      }
    } catch (error) {
      console.warn("[updateOrderStopTime] Impossible de récupérer le tarif minute_arret, fallback 42.");
    }

    // Pour les arrêts, chaque minute est facturée (pas de 5 minutes gratuites)
    const stopFee = stopMinutes * stopRate;

    // Mettre à jour le statut selon l'arrêt
    let newStatus: Order["status"];
    if (stopIndex === 1) {
      newStatus = "at_stop_1";
    } else if (stopIndex === 2) {
      newStatus = "at_stop_2";
    } else if (stopIndex === 3) {
      newStatus = "at_stop_3";
    } else {
      newStatus = currentOrder.status; // Ne pas changer le statut si index invalide
    }

    // Calculer le nouveau coût total des arrêts payants
    const currentPaidStopsCost = (currentOrder.rideOption as any)?.paidStopsCost || 0;
    const newPaidStopsCost = currentPaidStopsCost + stopFee;

    // Calculer le nouveau prix total basé sur le prix initial + attente + arrêts
    const initialPrice = (currentOrder.rideOption as any)?.initialTotalPrice;
    const basePrice = initialPrice !== undefined ? initialPrice : currentOrder.totalPrice;
    
    // Calculer les frais d'attente actuels (s'ils existent)
    const waitingMinutes = currentOrder.waitingTimeMinutes || 0;
    const waitingFee = Math.max(0, waitingMinutes - 5) * stopRate;

    const newTotalPrice = basePrice + waitingFee + newPaidStopsCost;
    
    // Ajuster les gains du chauffeur proportionnellement (85% du total)
    const initialEarnings = (currentOrder.rideOption as any)?.initialDriverEarnings;
    const baseEarnings = initialEarnings !== undefined ? initialEarnings : currentOrder.driverEarnings;
    const newDriverEarnings = baseEarnings + (waitingFee * 0.85) + (newPaidStopsCost * 0.85);

    const updateData: any = {
      status: newStatus,
      totalPrice: newTotalPrice,
      driverEarnings: newDriverEarnings,
      rideOption: {
        ...currentOrder.rideOption,
        paidStopsCost: newPaidStopsCost
      }
    };

    console.log(`[updateOrderStopTime] Arrêt ${stopIndex}: ${stopMinutes} min × ${stopRate} XPF = ${stopFee} XPF. Nouveau total: ${newTotalPrice} XPF. Total arrêts: ${newPaidStopsCost} XPF`);

    const [order] = await db.update(orders)
      .set(updateData)
      .where(eq(orders.id, id))
      .returning();
    
    if (!order) return undefined;
    return this.mapOrder(order);
  }

  async getBookedOrders(): Promise<Order[]> {
    const result = await db.select()
      .from(orders)
      .where(eq(orders.status, 'booked'));
    
    return result.map((order: any) => this.mapOrder(order));
  }

  // Driver methods
  async createDriver(insertDriver: InsertDriver): Promise<Driver> {
    const [driver] = await db.insert(drivers).values({
      phone: insertDriver.phone,
      code: insertDriver.code,
      firstName: insertDriver.firstName,
      lastName: insertDriver.lastName,
      vehicleModel: insertDriver.vehicleModel ?? null,
      vehicleColor: insertDriver.vehicleColor ?? null,
      vehiclePlate: insertDriver.vehiclePlate ?? null,
      isActive: true,
      totalRides: 0,
    }).returning();

    return {
      id: driver.id,
      phone: driver.phone,
      code: driver.code,
      firstName: driver.firstName,
      lastName: driver.lastName,
      typeChauffeur: driver.typeChauffeur as "salarie" | "patente",
      vehicleModel: driver.vehicleModel,
      vehicleColor: driver.vehicleColor,
      vehiclePlate: driver.vehiclePlate,
      photoUrl: driver.photoUrl,
      lastLatitude: driver.lastLatitude ?? null,
      lastLongitude: driver.lastLongitude ?? null,
      lastLocationAt: driver.lastLocationAt?.toISOString() || null,
      isActive: driver.isActive,
      averageRating: driver.averageRating,
      totalRides: driver.totalRides,
      createdAt: driver.createdAt.toISOString(),
    };
  }

  async getDriver(id: string): Promise<Driver | undefined> {
    const [driver] = await db.select().from(drivers).where(eq(drivers.id, id));
    if (!driver) return undefined;

    // Récupérer le nom du prestataire si le chauffeur est lié à un prestataire
    let prestataireName: string | null = null;
    if (driver.prestataireId) {
      const [prestataire] = await db.select().from(prestataires).where(eq(prestataires.id, driver.prestataireId));
      prestataireName = prestataire?.nom || null;
    }

    return {
      id: driver.id,
      phone: driver.phone,
      code: driver.code,
      password: driver.password || null,
      firstName: driver.firstName,
      lastName: driver.lastName,
      typeChauffeur: driver.typeChauffeur as "salarie" | "patente",
      vehicleModel: driver.vehicleModel,
      vehicleColor: driver.vehicleColor,
      vehiclePlate: driver.vehiclePlate,
      photoUrl: driver.photoUrl,
      lastLatitude: driver.lastLatitude ?? null,
      lastLongitude: driver.lastLongitude ?? null,
      lastLocationAt: driver.lastLocationAt?.toISOString() || null,
      isActive: driver.isActive,
      averageRating: driver.averageRating,
      totalRides: driver.totalRides,
      prestataireId: driver.prestataireId || null,
      prestataireName: prestataireName,
      commissionChauffeur: driver.commissionChauffeur ?? 95,
      cguAccepted: driver.cguAccepted || false,
      cguAcceptedAt: driver.cguAcceptedAt?.toISOString() || null,
      cguVersion: driver.cguVersion || null,
      privacyPolicyRead: driver.privacyPolicyRead || false,
      privacyPolicyReadAt: driver.privacyPolicyReadAt?.toISOString() || null,
      privacyPolicyVersion: driver.privacyPolicyVersion || null,
      createdAt: driver.createdAt.toISOString(),
    };
  }

  async getDriverById(id: string): Promise<Driver | undefined> {
    const [driver] = await db.select().from(drivers).where(eq(drivers.id, id));
    if (!driver) return undefined;

    return {
      id: driver.id,
      phone: driver.phone,
      code: driver.code,
      password: driver.password || null,
      firstName: driver.firstName,
      lastName: driver.lastName,
      typeChauffeur: driver.typeChauffeur as "salarie" | "patente",
      vehicleModel: driver.vehicleModel,
      vehicleColor: driver.vehicleColor,
      vehiclePlate: driver.vehiclePlate,
      photoUrl: driver.photoUrl,
      isActive: driver.isActive,
      averageRating: driver.averageRating,
      totalRides: driver.totalRides,
      cguAccepted: driver.cguAccepted || false,
      cguAcceptedAt: driver.cguAcceptedAt?.toISOString() || null,
      cguVersion: driver.cguVersion || null,
      privacyPolicyRead: driver.privacyPolicyRead || false,
      privacyPolicyReadAt: driver.privacyPolicyReadAt?.toISOString() || null,
      privacyPolicyVersion: driver.privacyPolicyVersion || null,
      createdAt: driver.createdAt.toISOString(),
    };
  }

  async getDriverByPhone(phone: string): Promise<Driver | undefined> {
    const [driver] = await db.select().from(drivers).where(eq(drivers.phone, phone));
    if (!driver) return undefined;

    return {
      id: driver.id,
      phone: driver.phone,
      code: driver.code,
      firstName: driver.firstName,
      lastName: driver.lastName,
      typeChauffeur: driver.typeChauffeur as "salarie" | "patente",
      vehicleModel: driver.vehicleModel,
      vehicleColor: driver.vehicleColor,
      vehiclePlate: driver.vehiclePlate,
      photoUrl: driver.photoUrl,
      lastLatitude: driver.lastLatitude ?? null,
      lastLongitude: driver.lastLongitude ?? null,
      lastLocationAt: driver.lastLocationAt?.toISOString() || null,
      isActive: driver.isActive,
      averageRating: driver.averageRating,
      totalRides: driver.totalRides,
      createdAt: driver.createdAt.toISOString(),
    };
  }

  async getDriverByCode(code: string): Promise<Driver | undefined> {
    const [driver] = await db.select().from(drivers).where(eq(drivers.code, code));
    if (!driver) return undefined;

    // Récupérer le nom du prestataire si le chauffeur est lié à un prestataire
    let prestataireName: string | null = null;
    if (driver.prestataireId) {
      const [prestataire] = await db.select().from(prestataires).where(eq(prestataires.id, driver.prestataireId));
      prestataireName = prestataire?.nom || null;
    }

    return {
      id: driver.id,
      phone: driver.phone,
      code: driver.code,
      password: driver.password || null,
      firstName: driver.firstName,
      lastName: driver.lastName,
      typeChauffeur: driver.typeChauffeur as "salarie" | "patente",
      vehicleModel: driver.vehicleModel,
      vehicleColor: driver.vehicleColor,
      vehiclePlate: driver.vehiclePlate,
      photoUrl: driver.photoUrl,
      isActive: driver.isActive,
      averageRating: driver.averageRating,
      totalRides: driver.totalRides,
      prestataireId: driver.prestataireId || null,
      prestataireName: prestataireName,
      cguAccepted: driver.cguAccepted || false,
      cguAcceptedAt: driver.cguAcceptedAt?.toISOString() || null,
      cguVersion: driver.cguVersion || null,
      privacyPolicyRead: driver.privacyPolicyRead || false,
      privacyPolicyReadAt: driver.privacyPolicyReadAt?.toISOString() || null,
      privacyPolicyVersion: driver.privacyPolicyVersion || null,
      createdAt: driver.createdAt.toISOString(),
    };
  }

  async getAllDrivers(): Promise<Driver[]> {
    const result = await db.select().from(drivers);
    return result.map(driver => ({
      id: driver.id,
      phone: driver.phone,
      code: driver.code,
      password: driver.password || null,
      firstName: driver.firstName,
      lastName: driver.lastName,
      typeChauffeur: driver.typeChauffeur as "salarie" | "patente",
      vehicleModel: driver.vehicleModel,
      vehicleColor: driver.vehicleColor,
      vehiclePlate: driver.vehiclePlate,
      photoUrl: driver.photoUrl,
      isActive: driver.isActive,
      averageRating: driver.averageRating,
      totalRides: driver.totalRides,
      cguAccepted: driver.cguAccepted || false,
      cguAcceptedAt: driver.cguAcceptedAt?.toISOString() || null,
      cguVersion: driver.cguVersion || null,
      privacyPolicyRead: driver.privacyPolicyRead || false,
      privacyPolicyReadAt: driver.privacyPolicyReadAt?.toISOString() || null,
      privacyPolicyVersion: driver.privacyPolicyVersion || null,
      createdAt: driver.createdAt.toISOString(),
    }));
  }

  // Stripe Customer Methods
  async getStripeCustomer(clientId: string): Promise<StripeCustomer | undefined> {
    const [customer] = await db.select().from(stripeCustomers).where(eq(stripeCustomers.clientId, clientId));
    if (!customer) return undefined;
    return {
      id: customer.id,
      clientId: customer.clientId,
      stripeCustomerId: customer.stripeCustomerId,
      createdAt: customer.createdAt.toISOString(),
    };
  }

  async createStripeCustomer(clientId: string, stripeCustomerId: string): Promise<StripeCustomer> {
    const [customer] = await db.insert(stripeCustomers).values({
      clientId,
      stripeCustomerId,
    }).returning();
    return {
      id: customer.id,
      clientId: customer.clientId,
      stripeCustomerId: customer.stripeCustomerId,
      createdAt: customer.createdAt.toISOString(),
    };
  }

  // Payment Methods
  async getPaymentMethods(clientId: string): Promise<PaymentMethod[]> {
    const result = await db.select().from(paymentMethods).where(eq(paymentMethods.clientId, clientId));
    return result.map(pm => ({
      id: pm.id,
      clientId: pm.clientId,
      stripePaymentMethodId: pm.stripePaymentMethodId,
      last4: pm.last4,
      brand: pm.brand,
      expiryMonth: pm.expiryMonth,
      expiryYear: pm.expiryYear,
      isDefault: pm.isDefault,
      createdAt: pm.createdAt.toISOString(),
    }));
  }

  async addPaymentMethod(data: {
    clientId: string;
    stripePaymentMethodId: string;
    last4: string;
    brand: string;
    expiryMonth: number;
    expiryYear: number;
    isDefault: boolean;
  }): Promise<PaymentMethod> {
    // If this is marked as default, unset other defaults first
    if (data.isDefault) {
      await db.update(paymentMethods)
        .set({ isDefault: false })
        .where(eq(paymentMethods.clientId, data.clientId));
    }
    
    const [pm] = await db.insert(paymentMethods).values(data).returning();
    return {
      id: pm.id,
      clientId: pm.clientId,
      stripePaymentMethodId: pm.stripePaymentMethodId,
      last4: pm.last4,
      brand: pm.brand,
      expiryMonth: pm.expiryMonth,
      expiryYear: pm.expiryYear,
      isDefault: pm.isDefault,
      createdAt: pm.createdAt.toISOString(),
    };
  }

  async deletePaymentMethod(id: string, clientId: string): Promise<boolean> {
    const result = await db.delete(paymentMethods)
      .where(and(eq(paymentMethods.id, id), eq(paymentMethods.clientId, clientId)));
    return true;
  }

  async setDefaultPaymentMethod(id: string, clientId: string): Promise<boolean> {
    await db.update(paymentMethods)
      .set({ isDefault: false })
      .where(eq(paymentMethods.clientId, clientId));
    await db.update(paymentMethods)
      .set({ isDefault: true })
      .where(and(eq(paymentMethods.id, id), eq(paymentMethods.clientId, clientId)));
    return true;
  }

  // Invoice Methods
  async createInvoice(data: {
    clientId: string;
    orderId: string;
    amount: number;
    stripePaymentIntentId?: string;
    stripeInvoiceId?: string;
  }): Promise<Invoice> {
    const [invoice] = await db.insert(invoices).values({
      clientId: data.clientId,
      orderId: data.orderId,
      amount: data.amount,
      stripePaymentIntentId: data.stripePaymentIntentId || null,
      stripeInvoiceId: data.stripeInvoiceId || null,
      status: "pending",
    }).returning();
    return {
      id: invoice.id,
      clientId: invoice.clientId,
      orderId: invoice.orderId,
      stripePaymentIntentId: invoice.stripePaymentIntentId,
      stripeInvoiceId: invoice.stripeInvoiceId,
      amount: invoice.amount,
      currency: invoice.currency,
      status: invoice.status as Invoice["status"],
      pdfUrl: invoice.pdfUrl,
      createdAt: invoice.createdAt.toISOString(),
      paidAt: invoice.paidAt?.toISOString() || null,
    };
  }

  async updateInvoiceStatus(id: string, status: Invoice["status"], pdfUrl?: string, stripeInvoiceId?: string): Promise<Invoice | undefined> {
    const updateData: any = { status };
    if (status === "paid") {
      updateData.paidAt = new Date();
    }
    if (pdfUrl) {
      updateData.pdfUrl = pdfUrl;
    }
    if (stripeInvoiceId) {
      updateData.stripeInvoiceId = stripeInvoiceId;
    }
    
    const [invoice] = await db.update(invoices)
      .set(updateData)
      .where(eq(invoices.id, id))
      .returning();
    
    if (!invoice) return undefined;
    return {
      id: invoice.id,
      clientId: invoice.clientId,
      orderId: invoice.orderId,
      stripePaymentIntentId: invoice.stripePaymentIntentId,
      stripeInvoiceId: invoice.stripeInvoiceId,
      amount: invoice.amount,
      currency: invoice.currency,
      status: invoice.status as Invoice["status"],
      pdfUrl: invoice.pdfUrl,
      createdAt: invoice.createdAt.toISOString(),
      paidAt: invoice.paidAt?.toISOString() || null,
    };
  }

  async getInvoicesByClient(clientId: string): Promise<Invoice[]> {
    const result = await db.select().from(invoices).where(eq(invoices.clientId, clientId));
    return result.map(invoice => ({
      id: invoice.id,
      clientId: invoice.clientId,
      orderId: invoice.orderId,
      stripePaymentIntentId: invoice.stripePaymentIntentId,
      stripeInvoiceId: invoice.stripeInvoiceId,
      amount: invoice.amount,
      currency: invoice.currency,
      status: invoice.status as Invoice["status"],
      pdfUrl: invoice.pdfUrl,
      createdAt: invoice.createdAt.toISOString(),
      paidAt: invoice.paidAt?.toISOString() || null,
    }));
  }

  async getInvoiceByOrder(orderId: string): Promise<Invoice | undefined> {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.orderId, orderId));
    if (!invoice) return undefined;
    return {
      id: invoice.id,
      clientId: invoice.clientId,
      orderId: invoice.orderId,
      stripePaymentIntentId: invoice.stripePaymentIntentId,
      stripeInvoiceId: invoice.stripeInvoiceId,
      amount: invoice.amount,
      currency: invoice.currency,
      status: invoice.status as Invoice["status"],
      pdfUrl: invoice.pdfUrl,
      createdAt: invoice.createdAt.toISOString(),
      paidAt: invoice.paidAt?.toISOString() || null,
    };
  }

  // ============ TARIFS ============
  
  async getAllTarifs(): Promise<any[]> {
    try {
      const result = await db.select().from(tarifs).where(eq(tarifs.actif, true));
      return result.map(t => ({
        id: t.id,
        nom: t.nom,
        typeTarif: t.typeTarif,
        prixXpf: t.prixXpf,
        heureDebut: t.heureDebut,
        heureFin: t.heureFin,
        actif: t.actif,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      }));
    } catch (error) {
      // Si la table n'existe pas encore, retourner un tableau vide
      if (error instanceof Error && error.message.includes('does not exist')) {
        return [];
      }
      throw error;
    }
  }

  async getTarif(id: string): Promise<any | undefined> {
    const [tarif] = await db.select().from(tarifs).where(eq(tarifs.id, id));
    if (!tarif) return undefined;
    return {
      id: tarif.id,
      nom: tarif.nom,
      typeTarif: tarif.typeTarif,
      prixXpf: tarif.prixXpf,
      heureDebut: tarif.heureDebut,
      heureFin: tarif.heureFin,
      actif: tarif.actif,
      createdAt: tarif.createdAt.toISOString(),
      updatedAt: tarif.updatedAt.toISOString(),
    };
  }

  async createTarif(data: {
    nom: string;
    typeTarif: string;
    prixXpf: number;
    heureDebut?: string | null;
    heureFin?: string | null;
  }): Promise<any> {
    const [newTarif] = await db.insert(tarifs).values({
      nom: data.nom,
      typeTarif: data.typeTarif,
      prixXpf: data.prixXpf,
      heureDebut: data.heureDebut || null,
      heureFin: data.heureFin || null,
    }).returning();
    
    return {
      id: newTarif.id,
      nom: newTarif.nom,
      typeTarif: newTarif.typeTarif,
      prixXpf: newTarif.prixXpf,
      heureDebut: newTarif.heureDebut,
      heureFin: newTarif.heureFin,
      actif: newTarif.actif,
      createdAt: newTarif.createdAt.toISOString(),
      updatedAt: newTarif.updatedAt.toISOString(),
    };
  }

  async updateTarif(id: string, data: {
    nom?: string;
    typeTarif?: string;
    prixXpf?: number;
    heureDebut?: string | null;
    heureFin?: string | null;
    actif?: boolean;
  }): Promise<any | undefined> {
    const updateData: any = { updatedAt: new Date() };
    if (data.nom !== undefined) updateData.nom = data.nom;
    if (data.typeTarif !== undefined) updateData.typeTarif = data.typeTarif;
    if (data.prixXpf !== undefined) updateData.prixXpf = data.prixXpf;
    if (data.heureDebut !== undefined) updateData.heureDebut = data.heureDebut;
    if (data.heureFin !== undefined) updateData.heureFin = data.heureFin;
    if (data.actif !== undefined) updateData.actif = data.actif;

    const [updated] = await db.update(tarifs)
      .set(updateData)
      .where(eq(tarifs.id, id))
      .returning();
    
    if (!updated) return undefined;
    return {
      id: updated.id,
      nom: updated.nom,
      typeTarif: updated.typeTarif,
      prixXpf: updated.prixXpf,
      heureDebut: updated.heureDebut,
      heureFin: updated.heureFin,
      actif: updated.actif,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  async deleteTarif(id: string): Promise<boolean> {
    const result = await db.delete(tarifs).where(eq(tarifs.id, id));
    return true;
  }

  // ============ SUPPLEMENTS ============
  
  async getAllSupplements(): Promise<any[]> {
    try {
      const result = await db.select().from(supplements);
      return result.map(s => ({
        id: s.id,
        nom: s.nom,
        description: s.description,
        prixXpf: s.prixXpf,
        typeSupplement: s.typeSupplement,
        actif: s.actif,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      }));
    } catch (error) {
      if (error instanceof Error && error.message.includes('does not exist')) {
        return [];
      }
      throw error;
    }
  }

  async getSupplement(id: string): Promise<any | undefined> {
    const [supplement] = await db.select().from(supplements).where(eq(supplements.id, id));
    if (!supplement) return undefined;
    return {
      id: supplement.id,
      nom: supplement.nom,
      description: supplement.description,
      prixXpf: supplement.prixXpf,
      typeSupplement: supplement.typeSupplement,
      actif: supplement.actif,
      createdAt: supplement.createdAt.toISOString(),
      updatedAt: supplement.updatedAt.toISOString(),
    };
  }

  async createSupplement(data: {
    nom: string;
    description?: string | null;
    prixXpf: number;
    typeSupplement: string;
  }): Promise<any> {
    const [newSupplement] = await db.insert(supplements).values({
      nom: data.nom,
      description: data.description || null,
      prixXpf: data.prixXpf,
      typeSupplement: data.typeSupplement,
    }).returning();
    
    return {
      id: newSupplement.id,
      nom: newSupplement.nom,
      description: newSupplement.description,
      prixXpf: newSupplement.prixXpf,
      typeSupplement: newSupplement.typeSupplement,
      actif: newSupplement.actif,
      createdAt: newSupplement.createdAt.toISOString(),
      updatedAt: newSupplement.updatedAt.toISOString(),
    };
  }

  async updateSupplement(id: string, data: {
    nom?: string;
    description?: string | null;
    prixXpf?: number;
    typeSupplement?: string;
    actif?: boolean;
  }): Promise<any | undefined> {
    const updateData: any = { updatedAt: new Date() };
    if (data.nom !== undefined) updateData.nom = data.nom;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.prixXpf !== undefined) updateData.prixXpf = data.prixXpf;
    if (data.typeSupplement !== undefined) updateData.typeSupplement = data.typeSupplement;
    if (data.actif !== undefined) updateData.actif = data.actif;

    const [updated] = await db.update(supplements)
      .set(updateData)
      .where(eq(supplements.id, id))
      .returning();
    
    if (!updated) return undefined;
    return {
      id: updated.id,
      nom: updated.nom,
      description: updated.description,
      prixXpf: updated.prixXpf,
      typeSupplement: updated.typeSupplement,
      actif: updated.actif,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  async deleteSupplement(id: string): Promise<boolean> {
    await db.delete(supplements).where(eq(supplements.id, id));
    return true;
  }

  // ============ MESSAGES ============

  async createMessage(data: InsertMessage): Promise<Message> {
    const [message] = await db.insert(messages).values({
      orderId: data.orderId,
      senderId: data.senderId,
      senderType: data.senderType,
      content: data.content,
      isRead: false,
    }).returning();

    return {
      id: message.id,
      orderId: message.orderId,
      senderId: message.senderId,
      senderType: message.senderType as "client" | "driver",
      content: message.content,
      isRead: message.isRead,
      createdAt: message.createdAt.toISOString(),
    };
  }

  // Messages directs support (admin -> client/driver)
  async createSupportMessage(data: InsertSupportMessage): Promise<SupportMessage> {
    const senderType = data.senderType || "admin";
    const isRead = typeof data.isRead === "boolean" ? data.isRead : senderType !== "admin";

    const [message] = await db.insert(supportMessages).values({
      recipientType: data.recipientType,
      recipientId: data.recipientId,
      senderType,
      senderId: data.senderId || null,
      content: data.content,
      isRead,
    }).returning();

    return {
      id: message.id,
      recipientType: message.recipientType as "client" | "driver",
      recipientId: message.recipientId,
      senderType: message.senderType as "admin" | "client" | "driver",
      senderId: message.senderId,
      content: message.content,
      isRead: message.isRead,
      createdAt: message.createdAt.toISOString(),
    };
  }

  async getSupportMessagesForRecipient(recipientType: "client" | "driver", recipientId: string): Promise<SupportMessage[]> {
    const result = await db.select()
      .from(supportMessages)
      .where(and(
        eq(supportMessages.recipientType, recipientType),
        eq(supportMessages.recipientId, recipientId)
      ));

    return result
      .map((m) => ({
        id: m.id,
        recipientType: m.recipientType as "client" | "driver",
        recipientId: m.recipientId,
        senderType: (m as any).senderType as "admin" | "client" | "driver",
        senderId: (m as any).senderId ?? null,
        content: m.content,
        isRead: m.isRead,
        createdAt: m.createdAt.toISOString(),
      }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getSupportConversations(): Promise<Array<{
    id: string;
    recipientType: "client" | "driver";
    recipientId: string;
    recipientName: string;
    lastMessage: string | null;
    lastMessageAt: string | null;
  }>> {
    const rows = await db
      .select()
      .from(supportMessages)
      .orderBy(desc(supportMessages.createdAt));

    const map = new Map<
      string,
      {
        recipientType: "client" | "driver";
        recipientId: string;
        lastMessage: string | null;
        lastMessageAt: string | null;
      }
    >();

    for (const row of rows) {
      const recipientType = row.recipientType as "client" | "driver";
      const recipientId = row.recipientId;
      const key = `${recipientType}:${recipientId}`;

      if (!map.has(key)) {
        map.set(key, {
          recipientType,
          recipientId,
          lastMessage: row.content || null,
          lastMessageAt: row.createdAt ? row.createdAt.toISOString() : null,
        });
      }
    }

    const conversations = await Promise.all(
      Array.from(map.values()).map(async (conv) => {
        if (conv.recipientType === "client") {
          const client = await this.getClient(conv.recipientId);
          const name = client ? `${client.firstName} ${client.lastName}`.trim() : "Client";
          return { ...conv, id: `${conv.recipientType}:${conv.recipientId}`, recipientName: name };
        }
        const driver = await this.getDriver(conv.recipientId);
        const name = driver ? `${driver.firstName} ${driver.lastName}`.trim() : "Chauffeur";
        return { ...conv, id: `${conv.recipientType}:${conv.recipientId}`, recipientName: name };
      })
    );

    return conversations.sort((a, b) => {
      const dateA = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const dateB = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return dateB - dateA;
    });
  }

  async markSupportMessagesRead(recipientType: "client" | "driver", recipientId: string): Promise<void> {
    await db.update(supportMessages)
      .set({ isRead: true })
      .where(and(
        eq(supportMessages.recipientType, recipientType),
        eq(supportMessages.recipientId, recipientId),
        eq(supportMessages.isRead, false),
        eq(supportMessages.senderType, "admin")
      ));
  }

  async deleteSupportMessagesForRecipient(recipientType: "client" | "driver", recipientId: string): Promise<void> {
    await db.delete(supportMessages).where(and(
      eq(supportMessages.recipientType, recipientType),
      eq(supportMessages.recipientId, recipientId)
    ));
  }

  async getMessagesByOrder(orderId: string): Promise<Message[]> {
    const result = await db.select()
      .from(messages)
      .where(eq(messages.orderId, orderId));

    return result
      .map(m => ({
        id: m.id,
        orderId: m.orderId,
        senderId: m.senderId,
        senderType: m.senderType as "client" | "driver",
        content: m.content,
        isRead: m.isRead,
        createdAt: m.createdAt.toISOString(),
      }))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  async deleteMessagesByOrderId(orderId: string): Promise<void> {
    await db.delete(messages).where(eq(messages.orderId, orderId));
  }

  async markMessagesAsRead(orderId: string, recipientType: "client" | "driver"): Promise<void> {
    // Mark messages as read where the sender is NOT the recipient
    const senderType = recipientType === "client" ? "driver" : "client";
    await db.update(messages)
      .set({ isRead: true })
      .where(and(
        eq(messages.orderId, orderId),
        eq(messages.senderType, senderType),
        eq(messages.isRead, false)
      ));
  }

  async getUnreadMessageCount(orderId: string, recipientType: "client" | "driver"): Promise<number> {
    const senderType = recipientType === "client" ? "driver" : "client";
    const result = await db.select()
      .from(messages)
      .where(and(
        eq(messages.orderId, orderId),
        eq(messages.senderType, senderType),
        eq(messages.isRead, false)
      ));
    return result.length;
  }

  async getConversationsForClient(clientId: string): Promise<any[]> {
    // Get all orders for this client that have messages
    const clientOrders = await db.select()
      .from(orders)
      .where(eq(orders.clientId, clientId));

    const conversations = [];
    for (const order of clientOrders) {
      const orderMessages = await this.getMessagesByOrder(order.id);
      if (orderMessages.length === 0) continue;

      const lastMessage = orderMessages[orderMessages.length - 1];
      const unreadCount = await this.getUnreadMessageCount(order.id, "client");
      
      // Get driver info
      let driverName = "Chauffeur";
      if (order.assignedDriverId) {
        const driver = await this.getDriver(order.assignedDriverId);
        if (driver) {
          driverName = `${driver.firstName} ${driver.lastName}`;
        }
      }

      const addresses = order.addresses as AddressField[];
      const pickup = addresses.find(a => a.type === "pickup")?.value || "Départ";
      const destination = addresses.find(a => a.type === "destination")?.value || "Destination";

      conversations.push({
        orderId: order.id,
        otherPartyName: driverName,
        otherPartyType: "driver",
        lastMessage: lastMessage.content,
        lastMessageAt: lastMessage.createdAt,
        unreadCount,
        orderStatus: order.status,
        pickup,
        destination,
      });
    }

    return conversations.sort((a, b) => 
      new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
    );
  }

  async getConversationsForDriver(driverId: string): Promise<any[]> {
    // Get all orders for this driver that have messages
    const driverOrders = await db.select()
      .from(orders)
      .where(eq(orders.assignedDriverId, driverId));

    const conversations = [];
    for (const order of driverOrders) {
      const orderMessages = await this.getMessagesByOrder(order.id);
      if (orderMessages.length === 0) continue;

      const lastMessage = orderMessages[orderMessages.length - 1];
      const unreadCount = await this.getUnreadMessageCount(order.id, "driver");

      const addresses = order.addresses as AddressField[];
      const pickup = addresses.find(a => a.type === "pickup")?.value || "Départ";
      const destination = addresses.find(a => a.type === "destination")?.value || "Destination";

      conversations.push({
        orderId: order.id,
        otherPartyName: order.clientName,
        otherPartyType: "client",
        lastMessage: lastMessage.content,
        lastMessageAt: lastMessage.createdAt,
        unreadCount,
        orderStatus: order.status,
        pickup,
        destination,
      });
    }

    return conversations.sort((a, b) => 
      new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
    );
  }

  // ============ COMMISSIONS ============

  async getCommissions(): Promise<Commission[]> {
    const results = await db.select()
      .from(commissions)
      .where(eq(commissions.actif, true));
    
    return results.map(c => ({
      id: c.id,
      typeChauffeur: c.typeChauffeur,
      nomAffichage: c.nomAffichage,
      pourcentageChauffeur: c.pourcentageChauffeur,
      pourcentageCommission: c.pourcentageCommission,
      description: c.description,
      actif: c.actif,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    }));
  }

  async getCommissionByType(typeChauffeur: string): Promise<Commission | null> {
    const [result] = await db.select()
      .from(commissions)
      .where(and(
        eq(commissions.typeChauffeur, typeChauffeur),
        eq(commissions.actif, true)
      ));
    
    if (!result) return null;
    
    return {
      id: result.id,
      typeChauffeur: result.typeChauffeur,
      nomAffichage: result.nomAffichage,
      pourcentageChauffeur: result.pourcentageChauffeur,
      pourcentageCommission: result.pourcentageCommission,
      description: result.description,
      actif: result.actif,
      createdAt: result.createdAt.toISOString(),
      updatedAt: result.updatedAt.toISOString(),
    };
  }

  async updateCommission(id: string, pourcentageChauffeur: number): Promise<Commission | null> {
    const pourcentageCommission = 100 - pourcentageChauffeur;
    
    const [updated] = await db.update(commissions)
      .set({
        pourcentageChauffeur,
        pourcentageCommission,
        updatedAt: new Date(),
      })
      .where(eq(commissions.id, id))
      .returning();
    
    if (!updated) return null;
    
    return {
      id: updated.id,
      typeChauffeur: updated.typeChauffeur,
      nomAffichage: updated.nomAffichage,
      pourcentageChauffeur: updated.pourcentageChauffeur,
      pourcentageCommission: updated.pourcentageCommission,
      description: updated.description,
      actif: updated.actif,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  async createDefaultCommissions(): Promise<void> {
    try {
      // First, try to create the table if it doesn't exist
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS commissions (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          type_chauffeur TEXT NOT NULL UNIQUE,
          nom_affichage TEXT NOT NULL,
          pourcentage_chauffeur REAL NOT NULL,
          pourcentage_commission REAL NOT NULL,
          description TEXT,
          actif BOOLEAN DEFAULT true NOT NULL,
          created_at TIMESTAMP DEFAULT NOW() NOT NULL,
          updated_at TIMESTAMP DEFAULT NOW() NOT NULL
        )
      `);
      console.log("[DB] Commissions table ensured");

      // Check if commissions already exist
      const existing = await db.select().from(commissions);
      if (existing.length > 0) return;

      // Create default commissions
      // Note: Ces valeurs ne sont utilisées que si la table est vide
      await db.insert(commissions).values([
        {
          typeChauffeur: "salarie",
          nomAffichage: "Chauffeur Salarié",
          pourcentageChauffeur: 34,
          pourcentageCommission: 66,
          description: "Commission pour les chauffeurs salariés TAPEA (salaire + prime)",
          actif: true,
        },
        {
          typeChauffeur: "patente",
          nomAffichage: "Chauffeur Patenté (Indépendant)",
          pourcentageChauffeur: 92,
          pourcentageCommission: 8,
          description: "Commission pour les chauffeurs indépendants/patentés",
          actif: true,
        },
      ]);
      console.log("[DB] Default commissions created");
    } catch (error) {
      console.error("[DB] Error creating commissions:", error);
      throw error;
    }
  }

  async runMigrations(): Promise<void> {
    try {
      // Add photo_url column to drivers table if it doesn't exist
      await db.execute(sql`
        ALTER TABLE drivers ADD COLUMN IF NOT EXISTS photo_url TEXT
      `);
      console.log("[DB] ✅ Migration: photo_url column ensured on drivers table");

      await db.execute(sql`
        ALTER TABLE drivers ADD COLUMN IF NOT EXISTS last_latitude REAL
      `);
      await db.execute(sql`
        ALTER TABLE drivers ADD COLUMN IF NOT EXISTS last_longitude REAL
      `);
      await db.execute(sql`
        ALTER TABLE drivers ADD COLUMN IF NOT EXISTS last_location_at TIMESTAMP
      `);
      console.log("[DB] ✅ Migration: last location columns ensured on drivers table");

      // Add photo_url column to clients table if it doesn't exist
      await db.execute(sql`
        ALTER TABLE clients ADD COLUMN IF NOT EXISTS photo_url TEXT
      `);
      console.log("[DB] ✅ Migration: photo_url column ensured on clients table");

      // Create carousel_images table if it doesn't exist
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
      console.log("[DB] ✅ Migration: carousel_images table ensured");

      // Create ratings table if it doesn't exist
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS ratings (
          id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid(),
          order_id VARCHAR(255) NOT NULL,
          rater_type TEXT NOT NULL,
          rater_id VARCHAR(255) NOT NULL,
          rated_type TEXT NOT NULL,
          rated_id VARCHAR(255) NOT NULL,
          score INTEGER NOT NULL CHECK (score >= 1 AND score <= 5),
          comment TEXT,
          created_at TIMESTAMP DEFAULT NOW() NOT NULL
        )
      `);
      console.log("[DB] ✅ Migration: ratings table ensured");

      // Migration: Add waiting_time_minutes column to orders table
      await db.execute(sql`
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS waiting_time_minutes INTEGER
      `);
      console.log("[DB] ✅ Migration: waiting_time_minutes column ensured on orders table");

      // Migration: Add driver_comment column to orders table
      await db.execute(sql`
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS driver_comment TEXT
      `);
      console.log("[DB] ✅ Migration: driver_comment column ensured on orders table");

      // Create support_messages table if it doesn't exist
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS support_messages (
          id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid(),
          recipient_type TEXT NOT NULL,
          recipient_id VARCHAR(255) NOT NULL,
          sender_type TEXT NOT NULL DEFAULT 'admin',
          sender_id VARCHAR(255),
          content TEXT NOT NULL,
          is_read BOOLEAN DEFAULT false NOT NULL,
          created_at TIMESTAMP DEFAULT NOW() NOT NULL
        )
      `);
      console.log("[DB] ✅ Migration: support_messages table ensured");

      await db.execute(sql`
        ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS sender_type TEXT DEFAULT 'admin' NOT NULL
      `);
      await db.execute(sql`
        ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS sender_id VARCHAR(255)
      `);
      console.log("[DB] ✅ Migration: support_messages columns ensured");
    } catch (error) {
      // Ignore errors if columns/tables already exist
      console.log("[DB] Migration check completed (some may already exist)");
    }
  }

  // ============ RATINGS ============
  
  async createRating(data: {
    orderId: string;
    raterType: 'client' | 'driver';
    raterId: string;
    ratedType: 'driver' | 'client';
    ratedId: string;
    score: number;
    comment?: string;
  }): Promise<{ id: string }> {
    const result = await db.execute(sql`
      INSERT INTO ratings (order_id, rater_type, rater_id, rated_type, rated_id, score, comment)
      VALUES (${data.orderId}, ${data.raterType}, ${data.raterId}, ${data.ratedType}, ${data.ratedId}, ${data.score}, ${data.comment || null})
      RETURNING id
    `);
    const id = (result.rows[0] as any).id;

    // Update the order with the rating ID
    if (data.raterType === 'client') {
      await db.execute(sql`UPDATE orders SET client_rating_id = ${id} WHERE id = ${data.orderId}`);
    } else {
      await db.execute(sql`UPDATE orders SET driver_rating_id = ${id} WHERE id = ${data.orderId}`);
    }

    // Update average rating of the rated entity
    await this.updateAverageRating(data.ratedType, data.ratedId);

    return { id };
  }

  async getRatingByOrderAndRater(orderId: string, raterType: 'client' | 'driver'): Promise<{ id: string; score: number; comment: string | null } | null> {
    const rows = await db.select({ id: ratings.id, score: ratings.score, comment: ratings.comment })
      .from(ratings)
      .where(and(eq(ratings.orderId, orderId), eq(ratings.raterType, raterType)))
      .limit(1);
    return rows[0] || null;
  }

  async updateAverageRating(entityType: 'driver' | 'client', entityId: string): Promise<void> {
    const result = await db.execute(sql`
      SELECT AVG(score) as avg_score FROM ratings WHERE rated_type = ${entityType} AND rated_id = ${entityId}
    `);
    const avgScore = (result.rows[0] as any)?.avg_score || null;

    if (entityType === 'driver') {
      await db.execute(sql`UPDATE drivers SET average_rating = ${avgScore} WHERE id = ${entityId}`);
    } else {
      await db.execute(sql`UPDATE clients SET average_rating = ${avgScore} WHERE id = ${entityId}`);
    }
  }

  /**
   * Supprime complètement un client et toutes ses données associées
   * @param clientId ID du client à supprimer
   * @returns true si supprimé avec succès
   */
  async deleteClient(clientId: string): Promise<boolean> {
    try {
      // Récupérer le numéro de téléphone du client avant de le supprimer
      const client = await this.getClient(clientId);
      if (!client) {
        throw new Error(`Client ${clientId} non trouvé`);
      }

      console.log(`[deleteClient] Début suppression client ${clientId} (${client.phone})`);

      // Supprimer toutes les données associées dans l'ordre (éviter les erreurs de clé étrangère)
      // 1. Sessions client
      console.log('[deleteClient] 1. Suppression sessions...');
      await db.delete(clientSessions).where(eq(clientSessions.clientId, clientId));
      
      // 2. Codes de vérification (avec try/catch au cas où la table n'existe pas)
      console.log('[deleteClient] 2. Suppression codes vérification...');
      try {
        await db.delete(verificationCodes).where(eq(verificationCodes.phone, client.phone));
      } catch (e) {
        console.log('[deleteClient] Table verification_codes non trouvée, ignoré');
      }
      
      // 3. Ratings où le client est rater ou rated
      console.log('[deleteClient] 3. Suppression ratings...');
      try {
        await db.execute(sql`DELETE FROM ratings WHERE rater_id = ${clientId} OR rated_id = ${clientId}`);
      } catch (e) {
        console.log('[deleteClient] Table ratings non trouvée, ignoré');
      }
      
      // 4. Support messages (messages directs admin)
      console.log('[deleteClient] 4. Suppression support_messages...');
      try {
        await db.execute(sql`DELETE FROM support_messages WHERE recipient_type = 'client' AND recipient_id = ${clientId}`);
      } catch (e) {
        console.log('[deleteClient] Table support_messages non trouvée, ignoré');
      }
      
      // 5. Messages liés aux commandes du client (AVANT de supprimer les orders - contrainte FK)
      console.log('[deleteClient] 5. Suppression messages commandes...');
      try {
        await db.execute(sql`DELETE FROM messages WHERE order_id IN (SELECT id FROM orders WHERE client_id = ${clientId})`);
      } catch (e) {
        console.log('[deleteClient] Table messages non trouvée, ignoré');
      }
      
      // 6. Factures (invoices) - AVANT orders car invoices référence orders
      console.log('[deleteClient] 6. Suppression invoices...');
      try {
        await db.execute(sql`DELETE FROM invoices WHERE client_id = ${clientId}`);
      } catch (e) {
        console.log('[deleteClient] Table invoices non trouvée, ignoré');
      }
      
      // 7. Commandes (orders) - supprimer toutes les commandes du client (après messages et invoices)
      console.log('[deleteClient] 7. Suppression orders...');
      await db.delete(orders).where(eq(orders.clientId, clientId));
      
      // 8. Clients Stripe
      console.log('[deleteClient] 8. Suppression stripeCustomers...');
      await db.delete(stripeCustomers).where(eq(stripeCustomers.clientId, clientId));
      
      // 9. Méthodes de paiement
      console.log('[deleteClient] 9. Suppression paymentMethods...');
      await db.delete(paymentMethods).where(eq(paymentMethods.clientId, clientId));
      
      // 10. Enfin, supprimer le client lui-même
      console.log('[deleteClient] 10. Suppression client...');
      await db.delete(clients).where(eq(clients.id, clientId));
      
      console.log(`[deleteClient] ✅ Client ${clientId} et toutes ses données supprimés avec succès`);
      return true;
    } catch (error) {
      console.error(`[deleteClient] ❌ Erreur lors de la suppression du client ${clientId}:`, error);
      throw error;
    }
  }

  async deleteDriver(driverId: string): Promise<boolean> {
    try {
      // Récupérer le chauffeur avant de le supprimer
      const driver = await this.getDriver(driverId);
      if (!driver) {
        throw new Error(`Chauffeur ${driverId} non trouvé`);
      }

      // Supprimer toutes les données associées dans l'ordre (éviter les erreurs de clé étrangère)
      // 1. Sessions chauffeur
      await db.delete(driverSessions).where(eq(driverSessions.driverId, driverId));
      
      // 2. Ratings où le chauffeur est rater ou rated
      await db.execute(sql`DELETE FROM ratings WHERE rater_id = ${driverId} OR rated_id = ${driverId}`);
      
      // 3. Messages liés aux commandes du chauffeur (AVANT de supprimer les orders - contrainte FK)
      try {
        // Supprimer les messages liés aux commandes du chauffeur
        await db.execute(sql`DELETE FROM messages WHERE order_id IN (SELECT id FROM orders WHERE assigned_driver_id = ${driverId})`);
        // Supprimer aussi les messages envoyés par le chauffeur (senderId avec senderType = 'driver')
        await db.execute(sql`DELETE FROM messages WHERE sender_id = ${driverId} AND sender_type = 'driver'`);
      } catch (e) {
        // Table messages peut ne pas exister, ignorer l'erreur
        console.log('[deleteDriver] Table messages non trouvée, ignoré');
      }
      
      // 4. Factures (invoices) - supprimer les factures liées aux commandes du chauffeur (AVANT de supprimer les orders - contrainte FK)
      try {
        await db.execute(sql`DELETE FROM invoices WHERE order_id IN (SELECT id FROM orders WHERE assigned_driver_id = ${driverId})`);
      } catch (e) {
        // Table invoices peut ne pas exister, ignorer l'erreur
        console.log('[deleteDriver] Table invoices non trouvée, ignoré');
      }
      
      // 5. Commandes (orders) - supprimer toutes les commandes assignées au chauffeur (après invoices)
      await db.delete(orders).where(eq(orders.assignedDriverId, driverId));
      
      // 6. Collecte de frais - mettre driver_id à NULL pour garder l'historique
      try {
        await db.execute(sql`UPDATE collecte_frais SET driver_id = NULL WHERE driver_id = ${driverId}`);
        console.log(`[deleteDriver] Collecte de frais mise à jour (driver_id => NULL)`);
      } catch (e) {
        console.log('[deleteDriver] Erreur mise à jour collecte_frais, ignoré:', e);
      }
      
      // 7. Enfin, supprimer le chauffeur lui-même
      await db.delete(drivers).where(eq(drivers.id, driverId));
      
      console.log(`[deleteDriver] Chauffeur ${driverId} et toutes ses données supprimés avec succès`);
      return true;
    } catch (error) {
      console.error(`[deleteDriver] Erreur lors de la suppression du chauffeur ${driverId}:`, error);
      throw error;
    }
  }

  async deletePrestataire(prestataireId: string): Promise<boolean> {
    try {
      // 1. Supprimer tous les chauffeurs associés au prestataire
      const chauffeurs = await db.select().from(drivers).where(eq(drivers.prestataireId, prestataireId));
      
      console.log(`[deletePrestataire] Suppression de ${chauffeurs.length} chauffeurs du prestataire ${prestataireId}`);
      
      for (const chauffeur of chauffeurs) {
        await this.deleteDriver(chauffeur.id);
      }
      
      // 2. Mettre à jour collecte_frais pour mettre prestataire_id à NULL
      try {
        await db.execute(sql`UPDATE collecte_frais SET prestataire_id = NULL WHERE prestataire_id = ${prestataireId}`);
        console.log(`[deletePrestataire] Collecte de frais mise à jour (prestataire_id => NULL)`);
      } catch (e) {
        console.log('[deletePrestataire] Erreur mise à jour collecte_frais, ignoré:', e);
      }
      
      // 3. Supprimer les sessions prestataire
      await db.execute(sql`DELETE FROM prestataire_sessions WHERE prestataire_id = ${prestataireId}`);
      
      // 4. Supprimer le prestataire
      await db.delete(prestataires).where(eq(prestataires.id, prestataireId));
      
      console.log(`[deletePrestataire] Prestataire ${prestataireId} supprimé avec succès`);
      return true;
    } catch (error) {
      console.error(`[deletePrestataire] Erreur lors de la suppression du prestataire ${prestataireId}:`, error);
      throw error;
    }
  }

  /**
   * Récupère les réservations à l'avance qui doivent recevoir un rappel
   * @param minutesBefore - Nombre de minutes avant le début de la réservation
   * @param toleranceMinutes - Tolérance en minutes (ex: 5 min de marge)
   */
  async getUpcomingReservations(minutesBefore: number, toleranceMinutes: number = 5): Promise<Order[]> {
    try {
      const now = new Date();
      const targetTime = new Date(now.getTime() + minutesBefore * 60 * 1000);
      const minTime = new Date(targetTime.getTime() - toleranceMinutes * 60 * 1000);
      const maxTime = new Date(targetTime.getTime() + toleranceMinutes * 60 * 1000);

      console.log(`[getUpcomingReservations] Now: ${now.toISOString()}`);
      console.log(`[getUpcomingReservations] Checking for reservations ${minutesBefore} min ahead`);
      console.log(`[getUpcomingReservations] Target window: ${minTime.toISOString()} - ${maxTime.toISOString()}`);

      // Récupérer toutes les réservations booked avec un chauffeur assigné
      const result = await db
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.isAdvanceBooking, true),
            eq(orders.status, 'booked'),
            isNotNull(orders.assignedDriverId),
            isNotNull(orders.scheduledTime),
            sql`${orders.scheduledTime} >= ${minTime.toISOString()}`,
            sql`${orders.scheduledTime} <= ${maxTime.toISOString()}`
          )
        );

      console.log(`[getUpcomingReservations] Found ${result.length} reservations for ${minutesBefore} min reminder`);
      
      if (result.length > 0) {
        result.forEach((r: any) => {
          console.log(`[getUpcomingReservations] - Order ${r.id}: scheduledTime=${r.scheduled_time}, assignedDriverId=${r.assigned_driver_id}`);
        });
      }
      
      return result.map(this.mapOrder);
    } catch (error) {
      console.error('[getUpcomingReservations] Error:', error);
      return [];
    }
  }

  // ============ FRAIS DE SERVICE CONFIG ============

  async getFraisServiceConfig(): Promise<{
    fraisServicePrestataire: number;
    commissionPrestataire: number;
    commissionSalarieTapea: number;
  } | null> {
    try {
      const result = await db.execute(sql`
        SELECT 
          frais_service_prestataire,
          commission_prestataire,
          commission_salarie_tapea
        FROM frais_service_config 
        WHERE id = 'default'
        LIMIT 1
      `);
      
      if (result.rows && result.rows.length > 0) {
        const row = result.rows[0] as any;
        return {
          fraisServicePrestataire: row.frais_service_prestataire || 15,
          commissionPrestataire: row.commission_prestataire || 0,
          commissionSalarieTapea: row.commission_salarie_tapea || 0,
        };
      }
      
      return null;
    } catch (error) {
      console.error('[getFraisServiceConfig] Error:', error);
      return null;
    }
  }

  async updateFraisServiceConfig(data: {
    fraisServicePrestataire?: number;
    commissionPrestataire?: number;
    commissionSalarieTapea?: number;
  }): Promise<{
    fraisServicePrestataire: number;
    commissionPrestataire: number;
    commissionSalarieTapea: number;
  }> {
    try {
      // First ensure the table and default row exist
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS frais_service_config (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          frais_service_prestataire REAL NOT NULL DEFAULT 15,
          commission_prestataire REAL NOT NULL DEFAULT 0,
          commission_salarie_tapea REAL NOT NULL DEFAULT 0,
          updated_at TIMESTAMP DEFAULT NOW() NOT NULL
        )
      `);

      await db.execute(sql`
        INSERT INTO frais_service_config (id, frais_service_prestataire, commission_prestataire, commission_salarie_tapea)
        VALUES ('default', 15, 0, 0)
        ON CONFLICT (id) DO NOTHING
      `);

      // Build update query dynamically
      const updates: string[] = [];
      if (data.fraisServicePrestataire !== undefined) {
        updates.push(`frais_service_prestataire = ${data.fraisServicePrestataire}`);
      }
      if (data.commissionPrestataire !== undefined) {
        updates.push(`commission_prestataire = ${data.commissionPrestataire}`);
      }
      if (data.commissionSalarieTapea !== undefined) {
        updates.push(`commission_salarie_tapea = ${data.commissionSalarieTapea}`);
      }
      updates.push(`updated_at = NOW()`);

      if (updates.length > 1) {
        await db.execute(sql.raw(`
          UPDATE frais_service_config 
          SET ${updates.join(', ')}
          WHERE id = 'default'
        `));
      }

      // Return updated config
      const result = await this.getFraisServiceConfig();
      return result || {
        fraisServicePrestataire: 15,
        commissionPrestataire: 0,
        commissionSalarieTapea: 0,
      };
    } catch (error) {
      console.error('[updateFraisServiceConfig] Error:', error);
      return {
        fraisServicePrestataire: 15,
        commissionPrestataire: 0,
        commissionSalarieTapea: 0,
      };
    }
  }
}

export const dbStorage = new DbStorage();

// Run migrations on startup
dbStorage.runMigrations().catch(console.error);
