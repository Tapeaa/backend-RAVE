import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, real, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

// Prestataires table (sociétés de transport et patentés)
export const prestataires = pgTable("prestataires", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nom: text("nom").notNull(), // Nom entreprise ou patenté
  type: text("type").notNull(), // societe_taxi, societe_tourisme, patente_taxi, patente_tourisme
  numeroTahiti: text("numero_tahiti"), // Numéro Tahiti ou K-BIS
  email: text("email"),
  phone: text("phone"),
  code: text("code").notNull(), // Code 6 chiffres pour connexion dashboard
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  // Documents optionnels (URLs Cloudinary)
  docNumeroTahiti: text("doc_numero_tahiti"),
  docAttestationQualification: text("doc_attestation_qualification"),
  docLicenceTransport: text("doc_licence_transport"),
  docAssurancePro: text("doc_assurance_pro"),
});

// Drivers table (for driver accounts)
export const drivers = pgTable("drivers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  phone: text("phone").notNull().unique(),
  code: text("code").notNull(), // 6-digit access code
  password: text("password"), // Mot de passe pour connexion (optionnel, peut être généré)
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  typeChauffeur: text("type_chauffeur").default("patente").notNull(), // "salarie" or "patente"
  vehicleModel: text("vehicle_model"),
  vehicleColor: text("vehicle_color"),
  vehiclePlate: text("vehicle_plate"),
  photoUrl: text("photo_url"), // Photo de profil du chauffeur
  lastLatitude: real("last_latitude"),
  lastLongitude: real("last_longitude"),
  lastLocationAt: timestamp("last_location_at"),
  isActive: boolean("is_active").default(true).notNull(),
  averageRating: real("average_rating"),
  totalRides: integer("total_rides").default(0).notNull(),
  // Lien vers le prestataire (société ou patenté)
  prestataireId: varchar("prestataire_id").references(() => prestataires.id),
  // Commission du chauffeur (% qu'il garde de chaque course)
  commissionChauffeur: real("commission_chauffeur").default(95), // Par défaut 95%
  // Champs légaux (CGU et politique de confidentialité)
  cguAccepted: boolean("cgu_accepted").default(false),
  cguAcceptedAt: timestamp("cgu_accepted_at"),
  cguVersion: text("cgu_version"),
  privacyPolicyRead: boolean("privacy_policy_read").default(false),
  privacyPolicyReadAt: timestamp("privacy_policy_read_at"),
  privacyPolicyVersion: text("privacy_policy_version"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ═══ MODÈLES DE VÉHICULES (géré par l'admin) ═══
export const vehicleModels = pgTable("vehicle_models", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(), // Ex: "Renault Clio", "Toyota RAV4"
  category: text("category").notNull(), // "citadine" | "berline" | "suv"
  imageUrl: text("image_url"), // Image par défaut (Cloudinary)
  description: text("description"),
  seats: integer("seats").default(5).notNull(),
  transmission: text("transmission").default("auto").notNull(), // "auto" | "manual"
  fuel: text("fuel").default("essence").notNull(), // "essence" | "diesel" | "electrique" | "hybride"
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ═══ VÉHICULES DES LOUEURS (géré par le prestataire loueur) ═══
export const loueurVehicles = pgTable("loueur_vehicles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  vehicleModelId: varchar("vehicle_model_id").notNull().references(() => vehicleModels.id),
  prestataireId: varchar("prestataire_id").notNull().references(() => prestataires.id),
  driverId: varchar("driver_id").references(() => drivers.id), // Nullable - pour loueur individuel
  plate: text("plate"), // Immatriculation
  pricePerDay: real("price_per_day").notNull(), // Prix/jour en XPF
  pricePerDayLongTerm: real("price_per_day_long_term"), // Prix réduit pour location longue durée
  availableForRental: boolean("available_for_rental").default(true).notNull(), // Louer
  availableForDelivery: boolean("available_for_delivery").default(false).notNull(), // Livraison
  availableForLongTerm: boolean("available_for_long_term").default(false).notNull(), // Long terme
  customImageUrl: text("custom_image_url"), // Override image du modèle
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Carousel images table (for advertising/pub)
export const carouselImages = pgTable("carousel_images", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  imageUrl: text("image_url").notNull(),
  linkUrl: text("link_url"), // Optional link when clicked
  position: integer("position").default(0).notNull(), // Order in carousel
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

// Driver schema
export const driverSchema = z.object({
  id: z.string(),
  phone: z.string(),
  code: z.string(),
  password: z.string().nullable().optional(),
  firstName: z.string(),
  lastName: z.string(),
  typeChauffeur: z.enum(["salarie", "patente"]).default("patente"),
  vehicleModel: z.string().nullable(),
  vehicleColor: z.string().nullable(),
  vehiclePlate: z.string().nullable(),
  photoUrl: z.string().nullable(),
  lastLatitude: z.number().nullable().optional(),
  lastLongitude: z.number().nullable().optional(),
  lastLocationAt: z.string().nullable().optional(),
  isActive: z.boolean(),
  averageRating: z.number().nullable(),
  totalRides: z.number(),
  prestataireId: z.string().nullable().optional(),
  prestataireName: z.string().nullable().optional(), // Nom du prestataire (pour affichage)
  commissionChauffeur: z.number().optional(), // % que le chauffeur garde
  cguAccepted: z.boolean().optional(),
  cguAcceptedAt: z.string().nullable().optional(),
  cguVersion: z.string().nullable().optional(),
  privacyPolicyRead: z.boolean().optional(),
  privacyPolicyReadAt: z.string().nullable().optional(),
  privacyPolicyVersion: z.string().nullable().optional(),
  createdAt: z.string(),
});

export type Driver = z.infer<typeof driverSchema>;

export const insertDriverSchema = z.object({
  phone: z.string(),
  code: z.string().length(6, "Le code doit contenir 6 chiffres"),
  firstName: z.string().min(1, "Prénom requis"),
  lastName: z.string().min(1, "Nom requis"),
  typeChauffeur: z.enum(["salarie", "patente"]).default("patente"),
  vehicleModel: z.string().optional(),
  vehicleColor: z.string().optional(),
  vehiclePlate: z.string().optional(),
  photoUrl: z.string().optional(),
  prestataireId: z.string().optional(),
});

// Carousel image schema
export const carouselImageSchema = z.object({
  id: z.string(),
  title: z.string(),
  imageUrl: z.string(),
  linkUrl: z.string().nullable(),
  position: z.number(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type CarouselImage = z.infer<typeof carouselImageSchema>;

export type InsertDriver = z.infer<typeof insertDriverSchema>;

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Client table (for authenticated customers)
export const clients = pgTable("clients", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  phone: text("phone").notNull().unique(),
  hashedPassword: text("hashed_password").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email"),
  photoUrl: text("photo_url"), // Photo de profil du client
  isVerified: boolean("is_verified").default(false).notNull(),
  walletBalance: real("wallet_balance").default(0).notNull(),
  averageRating: real("average_rating"),
  totalRides: integer("total_rides").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  // CGU et politique de confidentialité
  cguAccepted: boolean("cgu_accepted").default(false),
  cguAcceptedAt: timestamp("cgu_accepted_at"),
  cguVersion: text("cgu_version"),
  privacyPolicyRead: boolean("privacy_policy_read").default(false),
  privacyPolicyReadAt: timestamp("privacy_policy_read_at"),
  privacyPolicyVersion: text("privacy_policy_version"),
});

// Client sessions table
export const clientSessions = pgTable("client_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientId: varchar("client_id").notNull().references(() => clients.id),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
});

// Driver sessions table (persistent across server restarts)
export const driverSessions = pgTable("driver_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  driverId: varchar("driver_id").notNull().references(() => drivers.id),
  driverName: text("driver_name").notNull(),
  isOnline: boolean("is_online").default(false).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
});

// Stripe customer and payment methods for clients
export const stripeCustomers = pgTable("stripe_customers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientId: varchar("client_id").notNull().references(() => clients.id).unique(),
  stripeCustomerId: text("stripe_customer_id").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Saved payment methods (cards)
export const paymentMethods = pgTable("payment_methods", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientId: varchar("client_id").notNull().references(() => clients.id),
  stripePaymentMethodId: text("stripe_payment_method_id").notNull().unique(),
  last4: text("last4").notNull(),
  brand: text("brand").notNull(), // visa, mastercard, etc.
  expiryMonth: integer("expiry_month").notNull(),
  expiryYear: integer("expiry_year").notNull(),
  isDefault: boolean("is_default").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Messages table for client-driver chat
export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id),
  senderId: varchar("sender_id").notNull(), // client or driver ID
  senderType: text("sender_type").notNull(), // "client" or "driver"
  content: text("content").notNull(),
  isRead: boolean("is_read").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Support direct messages (admin -> client/driver, sans commande)
export const supportMessages = pgTable("support_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  recipientType: text("recipient_type").notNull(), // "client" or "driver"
  recipientId: varchar("recipient_id").notNull(),
  senderType: text("sender_type").default("admin").notNull(), // "admin" | "client" | "driver"
  senderId: varchar("sender_id"),
  content: text("content").notNull(),
  isRead: boolean("is_read").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Invoices for completed rides
export const invoices = pgTable("invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientId: varchar("client_id").notNull().references(() => clients.id),
  orderId: varchar("order_id").notNull().references(() => orders.id),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  stripeInvoiceId: text("stripe_invoice_id"),
  amount: real("amount").notNull(),
  currency: text("currency").default("XPF").notNull(),
  status: text("status").default("pending").notNull(), // pending, paid, failed
  pdfUrl: text("pdf_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  paidAt: timestamp("paid_at"),
});

// Verification codes table (for SMS verification)
export const verificationCodes = pgTable("verification_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  phone: text("phone").notNull(),
  code: text("code").notNull(),
  type: text("type").notNull(), // "registration", "login", "password_reset"
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Pricing/Tarifs table
export const tarifs = pgTable("tarifs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nom: text("nom").notNull(),
  typeTarif: text("type_tarif").notNull(), // prise_en_charge, kilometre_jour, kilometre_nuit, minute_arret, supplement
  prixXpf: real("prix_xpf").notNull(),
  heureDebut: text("heure_debut"), // Format HH:MM
  heureFin: text("heure_fin"), // Format HH:MM
  actif: boolean("actif").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Supplements table
export const supplements = pgTable("supplements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nom: text("nom").notNull(),
  description: text("description"),
  prixXpf: real("prix_xpf").notNull(),
  typeSupplement: text("type_supplement").default("fixe").notNull(), // fixe, pourcentage
  actif: boolean("actif").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Orders table
export const orders = pgTable("orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientId: varchar("client_id").references(() => clients.id),
  clientName: text("client_name").notNull(),
  clientPhone: text("client_phone").notNull(),
  addresses: jsonb("addresses").notNull(),
  rideOption: jsonb("ride_option").notNull(),
  routeInfo: jsonb("route_info"),
  passengers: integer("passengers").notNull(),
  supplements: jsonb("supplements").notNull(),
  totalPrice: real("total_price").notNull(),
  driverEarnings: real("driver_earnings").notNull(),
  waitingTimeMinutes: integer("waiting_time_minutes"),
  paymentMethod: text("payment_method").default("cash").notNull(), // "cash" or "card"
  driverComment: text("driver_comment"), // Message du client pour le chauffeur
  scheduledTime: timestamp("scheduled_time"),
  isAdvanceBooking: boolean("is_advance_booking").default(false).notNull(),
  status: text("status").default("pending").notNull(),
  assignedDriverId: varchar("assigned_driver_id"),
  clientRatingId: varchar("client_rating_id"),
  driverRatingId: varchar("driver_rating_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});

// Client schema (for authenticated customers)
export const clientSchema = z.object({
  id: z.string(),
  phone: z.string(), // E.164 format with +689 prefix
  hashedPassword: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().nullable(),
  photoUrl: z.string().nullable(),
  isVerified: z.boolean(),
  walletBalance: z.number(),
  averageRating: z.number().nullable(),
  totalRides: z.number(),
  createdAt: z.string(),
  // CGU et politique de confidentialité
  cguAccepted: z.boolean().optional(),
  cguAcceptedAt: z.string().nullable().optional(),
  cguVersion: z.string().nullable().optional(),
  privacyPolicyRead: z.boolean().optional(),
  privacyPolicyReadAt: z.string().nullable().optional(),
  privacyPolicyVersion: z.string().nullable().optional(),
});

export type Client = z.infer<typeof clientSchema>;

// Update client profile schema
export const updateClientProfileSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  email: z.string().email().nullable().optional(),
  photoUrl: z.string().nullable().optional(),
});

export type UpdateClientProfile = z.infer<typeof updateClientProfileSchema>;

// Update driver profile schema
export const updateDriverProfileSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  typeChauffeur: z.enum(["salarie", "patente"]).optional(),
  vehicleModel: z.string().nullable().optional(),
  vehicleColor: z.string().nullable().optional(),
  vehiclePlate: z.string().nullable().optional(),
});

export type UpdateDriverProfile = z.infer<typeof updateDriverProfileSchema>;

// Insert client schema (for registration)
export const insertClientSchema = z.object({
  phone: z.string().regex(/^\+689\d{6,8}$/, "Numéro de téléphone invalide"),
  password: z.string().min(6, "Minimum 6 caractères"),
  firstName: z.string().min(1, "Prénom requis"),
  lastName: z.string().min(1, "Nom requis"),
});

export type InsertClient = z.infer<typeof insertClientSchema>;

// Client session schema
export const clientSessionSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  expiresAt: z.string(),
  createdAt: z.string(),
  lastSeenAt: z.string(),
});

export type ClientSession = z.infer<typeof clientSessionSchema>;

// Verification code schema (for SMS verification)
export const verificationCodeSchema = z.object({
  id: z.string(),
  phone: z.string(),
  code: z.string(),
  type: z.enum(["registration", "login", "password_reset"]),
  expiresAt: z.string(),
  usedAt: z.string().nullable(),
  createdAt: z.string(),
});

export type VerificationCode = z.infer<typeof verificationCodeSchema>;

// Wallet transaction schema
export const walletTransactionSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  type: z.enum(["credit", "debit"]),
  amount: z.number(),
  balanceAfter: z.number(),
  description: z.string(),
  orderId: z.string().nullable(),
  createdAt: z.string(),
});

export type WalletTransaction = z.infer<typeof walletTransactionSchema>;

// Ratings table (client rates driver AND driver rates client)
export const ratings = pgTable("ratings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull(),
  raterType: text("rater_type").notNull(), // "client" or "driver"
  raterId: varchar("rater_id").notNull(), // clientId or driverId
  ratedType: text("rated_type").notNull(), // "driver" or "client"
  ratedId: varchar("rated_id").notNull(), // driverId or clientId
  score: integer("score").notNull(), // 1-5
  comment: text("comment"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Rating schema (Zod validation)
export const ratingSchema = z.object({
  id: z.string(),
  orderId: z.string(),
  raterType: z.enum(["client", "driver"]),
  raterId: z.string(),
  ratedType: z.enum(["driver", "client"]),
  ratedId: z.string(),
  score: z.number().min(1).max(5),
  comment: z.string().nullable(),
  createdAt: z.string(),
});

export type Rating = z.infer<typeof ratingSchema>;

// Client rating schema (legacy - for compatibility)
export const clientRatingSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  orderId: z.string(),
  score: z.number().min(1).max(5),
  comment: z.string().nullable(),
  createdAt: z.string(),
});

export type ClientRating = z.infer<typeof clientRatingSchema>;

// Order supplement schema
// Utiliser .passthrough() pour permettre les champs supplémentaires (comme description)
export const supplementSchema = z.object({
  id: z.string(),
  name: z.string(),
  icon: z.string().optional(), // Rendre optionnel et accepter n'importe quelle string
  price: z.number(),
  quantity: z.number(),
}).passthrough(); // Permettre les champs supplémentaires comme 'description'

export type Supplement = z.infer<typeof supplementSchema>;

// Route info schema
export const routeInfoSchema = z.object({
  distance: z.number(),
  duration: z.string(),
});

export type RouteInfo = z.infer<typeof routeInfoSchema>;

// Address field schema
export const addressFieldSchema = z.object({
  id: z.string(),
  value: z.string(),
  placeId: z.string().nullable(),
  type: z.enum(["pickup", "stop", "destination"]),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

export type AddressField = z.infer<typeof addressFieldSchema>;

// Order status
export const orderStatusSchema = z.enum([
  "pending", 
  "accepted",
  "booked",  // ═══ RÉSERVATION À L'AVANCE ═══
  "declined", 
  "expired", 
  "cancelled",
  "driver_enroute",
  "driver_arrived",
  "in_progress",
  "at_stop_1",
  "at_stop_2",
  "at_stop_3",
  "completed",
  "payment_pending",
  "payment_confirmed",
  "payment_failed"
]);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

// Order schema
export const orderSchema = z.object({
  id: z.string(),
  clientId: z.string().nullable(), // Linked to authenticated client
  clientName: z.string(),
  clientPhone: z.string(),
  addresses: z.array(addressFieldSchema),
  rideOption: z.object({
    id: z.string(),
    title: z.string(),
    price: z.number(),
    pricePerKm: z.number(),
  }).passthrough(), // Permettre les champs supplémentaires (rentalData pour la location)
  routeInfo: routeInfoSchema.optional(),
  passengers: z.number().min(1).max(8),
  supplements: z.array(supplementSchema),
  paymentMethod: z.enum(["cash", "card"]),
  totalPrice: z.number(),
  driverEarnings: z.number(),
  waitingTimeMinutes: z.number().nullable(),
  driverArrivedAt: z.string().nullable(),
  driverComment: z.string().nullable(), // Message du client pour le chauffeur
  scheduledTime: z.string().nullable(),
  isAdvanceBooking: z.boolean(),
  status: orderStatusSchema,
  assignedDriverId: z.string().nullable(),
  clientRatingId: z.string().nullable(), // Rating given by client
  driverRatingId: z.string().nullable(), // Rating given by driver
  createdAt: z.string(),
  expiresAt: z.string(),
});

export type Order = z.infer<typeof orderSchema>;

// Insert order schema (for creating new orders)
// Utiliser .passthrough() pour permettre les champs supplémentaires (comme description dans supplements)
export const insertOrderSchema = orderSchema.omit({
  id: true,
  clientId: true,
  status: true,
  assignedDriverId: true,
  clientRatingId: true,
  driverRatingId: true,
  createdAt: true,
  expiresAt: true,
  waitingTimeMinutes: true, // Omit waitingTimeMinutes - it's added later when ride starts
  driverArrivedAt: true, // Omit driverArrivedAt - it's set when driver arrives, not at order creation
}).passthrough(); // Permettre les champs supplémentaires non définis

export type InsertOrder = z.infer<typeof insertOrderSchema>;

// Driver session schema
export const driverSessionSchema = z.object({
  id: z.string(),
  driverId: z.string(),
  driverName: z.string(),
  isOnline: z.boolean(),
  socketIds: z.array(z.string()),
  createdAt: z.string(),
  expiresAt: z.string(),
  lastSeenAt: z.string(),
});

export type DriverSession = z.infer<typeof driverSessionSchema>;

// Push subscription schema for iOS PWA notifications
export const pushSubscriptionSchema = z.object({
  endpoint: z.string(),
  keys: z.object({
    p256dh: z.string(),
    auth: z.string(),
  }),
});

export type PushSubscription = z.infer<typeof pushSubscriptionSchema>;

// Driver push subscription (links subscription to driver)
export const driverPushSubscriptionSchema = z.object({
  id: z.string(),
  driverId: z.string(),
  subscription: pushSubscriptionSchema,
  createdAt: z.string(),
});

export type DriverPushSubscription = z.infer<typeof driverPushSubscriptionSchema>;

// Stripe customer schema
export const stripeCustomerSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  stripeCustomerId: z.string(),
  createdAt: z.string(),
});

export type StripeCustomer = z.infer<typeof stripeCustomerSchema>;

// Payment method schema
export const paymentMethodSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  stripePaymentMethodId: z.string(),
  last4: z.string(),
  brand: z.string(),
  expiryMonth: z.number(),
  expiryYear: z.number(),
  isDefault: z.boolean(),
  createdAt: z.string(),
});

export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

// Invoice schema
export const invoiceSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  orderId: z.string(),
  stripePaymentIntentId: z.string().nullable(),
  stripeInvoiceId: z.string().nullable(),
  amount: z.number(),
  currency: z.string(),
  status: z.enum(["pending", "paid", "failed"]),
  pdfUrl: z.string().nullable(),
  createdAt: z.string(),
  paidAt: z.string().nullable(),
});

export type Invoice = z.infer<typeof invoiceSchema>;

// Message schema for chat
export const messageSchema = z.object({
  id: z.string(),
  orderId: z.string(),
  senderId: z.string(),
  senderType: z.enum(["client", "driver"]),
  content: z.string(),
  isRead: z.boolean(),
  createdAt: z.string(),
});

export type Message = z.infer<typeof messageSchema>;

// Support message schema
export const supportMessageSchema = z.object({
  id: z.string(),
  recipientType: z.enum(["client", "driver"]),
  recipientId: z.string(),
  senderType: z.enum(["admin", "client", "driver"]),
  senderId: z.string().nullable(),
  content: z.string(),
  isRead: z.boolean(),
  createdAt: z.string(),
});

export type SupportMessage = z.infer<typeof supportMessageSchema>;

export const insertSupportMessageSchema = z.object({
  recipientType: z.enum(["client", "driver"]),
  recipientId: z.string(),
  senderType: z.enum(["admin", "client", "driver"]).optional(),
  senderId: z.string().nullable().optional(),
  content: z.string().min(1).max(1000),
  isRead: z.boolean().optional(),
});

export type InsertSupportMessage = z.infer<typeof insertSupportMessageSchema>;

// Insert message schema
export const insertMessageSchema = z.object({
  orderId: z.string(),
  senderId: z.string(),
  senderType: z.enum(["client", "driver"]),
  content: z.string().min(1, "Message requis").max(1000, "Message trop long"),
});

export type InsertMessage = z.infer<typeof insertMessageSchema>;

// Conversation schema (for listing conversations)
export const conversationSchema = z.object({
  orderId: z.string(),
  otherPartyName: z.string(),
  otherPartyType: z.enum(["client", "driver"]),
  lastMessage: z.string(),
  lastMessageAt: z.string(),
  unreadCount: z.number(),
  orderStatus: z.string(),
  pickup: z.string(),
  destination: z.string(),
});

export type Conversation = z.infer<typeof conversationSchema>;

// Commission configuration table
export const commissions = pgTable("commissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  typeChauffeur: text("type_chauffeur").notNull().unique(), // "salarie", "patente" 
  nomAffichage: text("nom_affichage").notNull(),
  pourcentageChauffeur: real("pourcentage_chauffeur").notNull(), // % that driver keeps (e.g., 85 = 85%)
  pourcentageCommission: real("pourcentage_commission").notNull(), // % TAPEA takes (e.g., 15 = 15%)
  description: text("description"),
  actif: boolean("actif").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Commission schema
export const commissionSchema = z.object({
  id: z.string(),
  typeChauffeur: z.string(),
  nomAffichage: z.string(),
  pourcentageChauffeur: z.number(),
  pourcentageCommission: z.number(),
  description: z.string().nullable(),
  actif: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Commission = z.infer<typeof commissionSchema>;

// Frais de service configuration table
export const fraisServiceConfig = pgTable("frais_service_config", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fraisServicePrestataire: real("frais_service_prestataire").notNull().default(15), // % frais de service pour les prestataires (payé par le client)
  commissionPrestataire: real("commission_prestataire").notNull().default(0), // % commission TAPEA sur le subtotal des prestataires
  commissionSalarieTapea: real("commission_salarie_tapea").notNull().default(0), // % commission TAPEA sur les gains des salariés TAPEA
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Frais de service config schema
export const fraisServiceConfigSchema = z.object({
  id: z.string(),
  fraisServicePrestataire: z.number(),
  commissionPrestataire: z.number(),
  commissionSalarieTapea: z.number(),
  updatedAt: z.string(),
});

export type FraisServiceConfig = z.infer<typeof fraisServiceConfigSchema>;

// Collecte de frais table (commissions dues à TAPEA)
export const collecteFrais = pgTable("collecte_frais", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  prestataireId: varchar("prestataire_id").references(() => prestataires.id),
  driverId: varchar("driver_id").references(() => drivers.id),
  periode: text("periode").notNull(), // "2026-01" (mois)
  montantDu: real("montant_du").notNull(), // Total commission due à TAPEA (fraisService + commissionSupplementaire)
  fraisService: real("frais_service").default(0), // Frais de service (ex: 25% du total courses)
  commissionSupplementaire: real("commission_supplementaire").default(0), // Commission additionnelle (ex: 10% du total)
  montantPaye: real("montant_paye").default(0),
  orderIds: jsonb("order_ids").default([]), // Liste des IDs de courses incluses
  isPaid: boolean("is_paid").default(false),
  paidAt: timestamp("paid_at"),
  markedByAdminAt: timestamp("marked_by_admin_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Prestataire schema
export const prestataireSchema = z.object({
  id: z.string(),
  nom: z.string(),
  type: z.enum(["societe_taxi", "societe_tourisme", "patente_taxi", "patente_tourisme", "agence_location", "loueur_individuel"]),
  numeroTahiti: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  code: z.string(),
  isActive: z.boolean(),
  createdAt: z.string(),
});

export type Prestataire = z.infer<typeof prestataireSchema>;

// Insert prestataire schema
export const insertPrestataireSchema = z.object({
  nom: z.string().min(1, "Nom requis"),
  type: z.enum(["societe_taxi", "societe_tourisme", "patente_taxi", "patente_tourisme", "agence_location", "loueur_individuel"]),
  numeroTahiti: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  code: z.string().length(6, "Le code doit contenir 6 chiffres"),
});

export type InsertPrestataire = z.infer<typeof insertPrestataireSchema>;

// ═══ VEHICLE MODEL SCHEMAS ═══
export const vehicleModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.enum(["citadine", "berline", "suv"]),
  imageUrl: z.string().nullable(),
  description: z.string().nullable(),
  seats: z.number(),
  transmission: z.enum(["auto", "manual"]),
  fuel: z.enum(["essence", "diesel", "electrique", "hybride"]),
  isActive: z.boolean(),
  createdAt: z.string(),
});

export type VehicleModel = z.infer<typeof vehicleModelSchema>;

export const insertVehicleModelSchema = z.object({
  name: z.string().min(1, "Nom du véhicule requis"),
  category: z.enum(["citadine", "berline", "suv"]),
  imageUrl: z.string().optional(),
  description: z.string().optional(),
  seats: z.number().min(1).max(9).optional(),
  transmission: z.enum(["auto", "manual"]).optional(),
  fuel: z.enum(["essence", "diesel", "electrique", "hybride"]).optional(),
});

export type InsertVehicleModel = z.infer<typeof insertVehicleModelSchema>;

// ═══ LOUEUR VEHICLE SCHEMAS ═══
export const loueurVehicleSchema = z.object({
  id: z.string(),
  vehicleModelId: z.string(),
  prestataireId: z.string(),
  driverId: z.string().nullable(),
  plate: z.string().nullable(),
  pricePerDay: z.number(),
  pricePerDayLongTerm: z.number().nullable(),
  availableForRental: z.boolean(),
  availableForDelivery: z.boolean(),
  availableForLongTerm: z.boolean(),
  customImageUrl: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
});

export type LoueurVehicle = z.infer<typeof loueurVehicleSchema>;

export const insertLoueurVehicleSchema = z.object({
  vehicleModelId: z.string().min(1, "Modèle de véhicule requis"),
  plate: z.string().optional(),
  pricePerDay: z.number().min(1, "Prix par jour requis"),
  pricePerDayLongTerm: z.number().optional(),
  availableForRental: z.boolean().optional(),
  availableForDelivery: z.boolean().optional(),
  availableForLongTerm: z.boolean().optional(),
  customImageUrl: z.string().optional(),
});

export type InsertLoueurVehicle = z.infer<typeof insertLoueurVehicleSchema>;

// Collecte frais schema
export const collecteFraisSchema = z.object({
  id: z.string(),
  prestataireId: z.string().nullable(),
  driverId: z.string().nullable(),
  periode: z.string(),
  montantDu: z.number(),
  fraisService: z.number().optional(),
  commissionSupplementaire: z.number().optional(),
  montantPaye: z.number(),
  orderIds: z.array(z.string()).optional(),
  isPaid: z.boolean(),
  paidAt: z.string().nullable(),
  markedByAdminAt: z.string().nullable(),
  createdAt: z.string(),
});

export type CollecteFrais = z.infer<typeof collecteFraisSchema>;