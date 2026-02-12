CREATE TABLE "carousel_images" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"image_url" text NOT NULL,
	"link_url" text,
	"position" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_sessions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" varchar NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"hashed_password" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text,
	"photo_url" text,
	"is_verified" boolean DEFAULT false NOT NULL,
	"wallet_balance" real DEFAULT 0 NOT NULL,
	"average_rating" real,
	"total_rides" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"cgu_accepted" boolean DEFAULT false,
	"cgu_accepted_at" timestamp,
	"cgu_version" text,
	"privacy_policy_read" boolean DEFAULT false,
	"privacy_policy_read_at" timestamp,
	"privacy_policy_version" text,
	CONSTRAINT "clients_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "collecte_frais" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prestataire_id" varchar,
	"driver_id" varchar,
	"periode" text NOT NULL,
	"montant_du" real NOT NULL,
	"frais_service" real DEFAULT 0,
	"commission_supplementaire" real DEFAULT 0,
	"montant_paye" real DEFAULT 0,
	"order_ids" jsonb DEFAULT '[]'::jsonb,
	"is_paid" boolean DEFAULT false,
	"paid_at" timestamp,
	"marked_by_admin_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commissions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type_chauffeur" text NOT NULL,
	"nom_affichage" text NOT NULL,
	"pourcentage_chauffeur" real NOT NULL,
	"pourcentage_commission" real NOT NULL,
	"description" text,
	"actif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "commissions_type_chauffeur_unique" UNIQUE("type_chauffeur")
);
--> statement-breakpoint
CREATE TABLE "driver_sessions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"driver_id" varchar NOT NULL,
	"driver_name" text NOT NULL,
	"is_online" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drivers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"code" text NOT NULL,
	"password" text,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"type_chauffeur" text DEFAULT 'patente' NOT NULL,
	"vehicle_model" text,
	"vehicle_color" text,
	"vehicle_plate" text,
	"photo_url" text,
	"last_latitude" real,
	"last_longitude" real,
	"last_location_at" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"average_rating" real,
	"total_rides" integer DEFAULT 0 NOT NULL,
	"prestataire_id" varchar,
	"commission_chauffeur" real DEFAULT 95,
	"cgu_accepted" boolean DEFAULT false,
	"cgu_accepted_at" timestamp,
	"cgu_version" text,
	"privacy_policy_read" boolean DEFAULT false,
	"privacy_policy_read_at" timestamp,
	"privacy_policy_version" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "drivers_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "frais_service_config" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"frais_service_prestataire" real DEFAULT 15 NOT NULL,
	"commission_prestataire" real DEFAULT 0 NOT NULL,
	"commission_salarie_tapea" real DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" varchar NOT NULL,
	"order_id" varchar NOT NULL,
	"stripe_payment_intent_id" text,
	"stripe_invoice_id" text,
	"amount" real NOT NULL,
	"currency" text DEFAULT 'XPF' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"pdf_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"paid_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "loueur_vehicles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vehicle_model_id" varchar NOT NULL,
	"prestataire_id" varchar NOT NULL,
	"driver_id" varchar,
	"plate" text,
	"price_per_day" real NOT NULL,
	"price_per_day_long_term" real,
	"available_for_rental" boolean DEFAULT true NOT NULL,
	"available_for_delivery" boolean DEFAULT false NOT NULL,
	"available_for_long_term" boolean DEFAULT false NOT NULL,
	"custom_image_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" varchar NOT NULL,
	"sender_id" varchar NOT NULL,
	"sender_type" text NOT NULL,
	"content" text NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" varchar,
	"client_name" text NOT NULL,
	"client_phone" text NOT NULL,
	"addresses" jsonb NOT NULL,
	"ride_option" jsonb NOT NULL,
	"route_info" jsonb,
	"passengers" integer NOT NULL,
	"supplements" jsonb NOT NULL,
	"total_price" real NOT NULL,
	"driver_earnings" real NOT NULL,
	"waiting_time_minutes" integer,
	"payment_method" text DEFAULT 'cash' NOT NULL,
	"driver_comment" text,
	"scheduled_time" timestamp,
	"is_advance_booking" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"assigned_driver_id" varchar,
	"client_rating_id" varchar,
	"driver_rating_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_methods" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" varchar NOT NULL,
	"stripe_payment_method_id" text NOT NULL,
	"last4" text NOT NULL,
	"brand" text NOT NULL,
	"expiry_month" integer NOT NULL,
	"expiry_year" integer NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payment_methods_stripe_payment_method_id_unique" UNIQUE("stripe_payment_method_id")
);
--> statement-breakpoint
CREATE TABLE "prestataires" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nom" text NOT NULL,
	"type" text NOT NULL,
	"numero_tahiti" text,
	"email" text,
	"phone" text,
	"code" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"doc_numero_tahiti" text,
	"doc_attestation_qualification" text,
	"doc_licence_transport" text,
	"doc_assurance_pro" text
);
--> statement-breakpoint
CREATE TABLE "ratings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" varchar NOT NULL,
	"rater_type" text NOT NULL,
	"rater_id" varchar NOT NULL,
	"rated_type" text NOT NULL,
	"rated_id" varchar NOT NULL,
	"score" integer NOT NULL,
	"comment" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stripe_customers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" varchar NOT NULL,
	"stripe_customer_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "stripe_customers_client_id_unique" UNIQUE("client_id"),
	CONSTRAINT "stripe_customers_stripe_customer_id_unique" UNIQUE("stripe_customer_id")
);
--> statement-breakpoint
CREATE TABLE "supplements" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nom" text NOT NULL,
	"description" text,
	"prix_xpf" real NOT NULL,
	"type_supplement" text DEFAULT 'fixe' NOT NULL,
	"actif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_messages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_type" text NOT NULL,
	"recipient_id" varchar NOT NULL,
	"sender_type" text DEFAULT 'admin' NOT NULL,
	"sender_id" varchar,
	"content" text NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tarifs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nom" text NOT NULL,
	"type_tarif" text NOT NULL,
	"prix_xpf" real NOT NULL,
	"heure_debut" text,
	"heure_fin" text,
	"actif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "vehicle_models" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"image_url" text,
	"description" text,
	"seats" integer DEFAULT 5 NOT NULL,
	"transmission" text DEFAULT 'auto' NOT NULL,
	"fuel" text DEFAULT 'essence' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_codes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"code" text NOT NULL,
	"type" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_sessions" ADD CONSTRAINT "client_sessions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collecte_frais" ADD CONSTRAINT "collecte_frais_prestataire_id_prestataires_id_fk" FOREIGN KEY ("prestataire_id") REFERENCES "public"."prestataires"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collecte_frais" ADD CONSTRAINT "collecte_frais_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_sessions" ADD CONSTRAINT "driver_sessions_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_prestataire_id_prestataires_id_fk" FOREIGN KEY ("prestataire_id") REFERENCES "public"."prestataires"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loueur_vehicles" ADD CONSTRAINT "loueur_vehicles_vehicle_model_id_vehicle_models_id_fk" FOREIGN KEY ("vehicle_model_id") REFERENCES "public"."vehicle_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loueur_vehicles" ADD CONSTRAINT "loueur_vehicles_prestataire_id_prestataires_id_fk" FOREIGN KEY ("prestataire_id") REFERENCES "public"."prestataires"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loueur_vehicles" ADD CONSTRAINT "loueur_vehicles_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_customers" ADD CONSTRAINT "stripe_customers_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;