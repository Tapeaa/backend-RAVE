/**
 * Abonnement plateforme loueur : colonnes drivers + config prix (admin-editable).
 */
import { db } from "./db";
import { and, eq, or, sql } from "drizzle-orm";
import { drivers, loueurVehicles } from "@shared/schema";

export type LoueurPlanId = "monthly" | "semiannual";

export const TRIAL_DAYS = 30;
export const GRACE_DAYS = 5;

export type SubscriptionStatus =
  | "none"
  | "trial"
  | "pending"
  | "active"
  | "grace"
  | "expired";

export type SubscriptionAccess = {
  status: SubscriptionStatus;
  /** Peut accepter des locations et ajouter des véhicules */
  access: boolean;
  /** Visible dans le catalogue public */
  catalogVisible: boolean;
  daysRemaining: number | null;
  graceDaysRemaining: number | null;
  endsAt: string | null;
  pending: boolean;
};

function parseEndsAt(raw: string | Date | null | undefined): Date | null {
  if (!raw) return null;
  const d = raw instanceof Date ? raw : new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function toPgTimestamp(value: unknown, fallback?: Date | null): Date | null {
  const parsed = parseEndsAt(value as string | Date | null | undefined);
  if (parsed) return parsed;
  return fallback === undefined ? null : fallback;
}

function daysBetween(fromMs: number, toMs: number): number {
  return Math.max(0, Math.ceil((toMs - fromMs) / (24 * 60 * 60 * 1000)));
}

export const DEFAULT_LOUEUR_STRIPE_PAYMENT_LINK =
  "https://buy.stripe.com/8x2eVd6Uc19Q8tnfye0Jq04";

export function getLoueurStripePaymentLink(): string {
  return (process.env.LOUEUR_STRIPE_PAYMENT_LINK || DEFAULT_LOUEUR_STRIPE_PAYMENT_LINK).trim();
}

export function buildLoueurStripeCheckoutUrl(
  driverId: string,
  email?: string | null
): string {
  const url = new URL(getLoueurStripePaymentLink());
  url.searchParams.set("client_reference_id", `drv_${driverId}`);
  const mail = String(email || "").trim();
  if (mail.includes("@")) url.searchParams.set("prefilled_email", mail);
  return url.toString();
}

export function parseLoueurDriverRef(ref: string | null | undefined): string | null {
  const raw = String(ref || "").trim();
  if (!raw) return null;
  if (raw.startsWith("drv_")) return raw.slice(4) || null;
  return raw;
}

export async function activatePaidLoueurSubscription(opts: {
  driverId: string;
  plan?: LoueurPlanId;
  amountXpf?: number | null;
  stripeSessionId?: string | null;
  stripeInvoiceId?: string | null;
  stripeSubscriptionId?: string | null;
  stripeCustomerId?: string | null;
  /** replace = 1 période à partir de maintenant (premier paiement). extend = renouvellement. */
  mode?: "replace" | "extend";
  periodEndsAt?: Date | string | number | null;
}): Promise<{ ok: true; endsAt: string; alreadyProcessed?: boolean } | { ok: false; error: string }> {
  const [driver] = await db.select().from(drivers).where(eq(drivers.id, opts.driverId)).limit(1);
  if (!driver) return { ok: false, error: "Loueur introuvable" };

  const alreadySession =
    opts.stripeSessionId &&
    (driver as any).subscriptionStripeSessionId &&
    (driver as any).subscriptionStripeSessionId === opts.stripeSessionId;
  const alreadyInvoice =
    opts.stripeInvoiceId &&
    (driver as any).subscriptionStripeInvoiceId &&
    (driver as any).subscriptionStripeInvoiceId === opts.stripeInvoiceId;
  if ((alreadySession || alreadyInvoice) && resolveSubscriptionStatus(driver as any).status === "active") {
    const current = resolveSubscriptionStatus(driver as any);
    return {
      ok: true,
      alreadyProcessed: true,
      endsAt: current.endsAt || new Date().toISOString(),
    };
  }

  const plans = await getLoueurSubscriptionPlans();
  const plan =
    opts.plan === "semiannual" && plans.semiannual ? plans.semiannual : plans.monthly;
  const now = new Date();
  const currentEnd = parseEndsAt((driver as any).subscriptionEndsAt);
  const explicitEnd = parseEndsAt(
    typeof opts.periodEndsAt === "number"
      ? new Date(opts.periodEndsAt * 1000)
      : (opts.periodEndsAt as string | Date | null | undefined)
  );
  let ends: Date;
  if (explicitEnd && explicitEnd.getTime() > now.getTime()) {
    ends = explicitEnd;
  } else if (opts.mode === "extend") {
    const startFrom =
      currentEnd && currentEnd.getTime() > now.getTime() ? currentEnd : now;
    ends = new Date(startFrom.getTime() + plan.days * 24 * 60 * 60 * 1000);
  } else {
    ends = new Date(now.getTime() + plan.days * 24 * 60 * 60 * 1000);
  }

  const core = {
    subscriptionPlan: plan.id,
    subscriptionStatus: "active" as const,
    subscriptionStartsAt: opts.mode === "extend" ? ((driver as any).subscriptionStartsAt || now) : now,
    subscriptionEndsAt: ends,
    subscriptionAmount: opts.amountXpf != null ? opts.amountXpf : plan.amountXpf,
  };
  const extras = {
    ...(opts.stripeSessionId ? { subscriptionStripeSessionId: opts.stripeSessionId } : {}),
    ...(opts.stripeInvoiceId ? { subscriptionStripeInvoiceId: opts.stripeInvoiceId } : {}),
    ...(opts.stripeSubscriptionId
      ? { subscriptionStripeSubscriptionId: opts.stripeSubscriptionId }
      : {}),
    ...(opts.stripeCustomerId ? { subscriptionStripeCustomerId: opts.stripeCustomerId } : {}),
  };

  try {
    await db
      .update(drivers)
      .set({ ...core, ...extras } as any)
      .where(eq(drivers.id, opts.driverId));
  } catch (error) {
    console.warn("[STRIPE-LOUEUR] update complet impossible, fallback statut seul:", error);
    await db.update(drivers).set(core as any).where(eq(drivers.id, opts.driverId));
  }

  return { ok: true, endsAt: ends.toISOString() };
}

/** Corrige un abo mensuel/6 mois dont la date de fin a été empilée (essai + paiement = 60 j). */
export async function normalizePaidSubscriptionPeriod(driver: {
  id: string;
  subscriptionStatus?: string | null;
  subscriptionPlan?: string | null;
  subscriptionStartsAt?: string | Date | null;
  subscriptionEndsAt?: string | Date | null;
}): Promise<boolean> {
  if ((driver.subscriptionStatus || "") !== "active") return false;
  const planId = driver.subscriptionPlan === "semiannual" ? "semiannual" : "monthly";
  const plans = await getLoueurSubscriptionPlans();
  const plan = planId === "semiannual" && plans.semiannual ? plans.semiannual : plans.monthly;
  const start = parseEndsAt(driver.subscriptionStartsAt) || new Date();
  const end = parseEndsAt(driver.subscriptionEndsAt);
  if (!end) return false;
  const maxMs = plan.days * 24 * 60 * 60 * 1000 + 2 * 24 * 60 * 60 * 1000;
  if (end.getTime() - start.getTime() <= maxMs) return false;
  const corrected = new Date(start.getTime() + plan.days * 24 * 60 * 60 * 1000);
  await db
    .update(drivers)
    .set({ subscriptionEndsAt: corrected } as any)
    .where(eq(drivers.id, driver.id));
  console.log(
    `[STRIPE-LOUEUR] période corrigée driver=${driver.id} ${end.toISOString()} -> ${corrected.toISOString()} (${plan.days} j)`
  );
  return true;
}

export function trialSubscriptionValues(now = new Date()) {
  const ends = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  return {
    subscriptionPlan: "trial" as const,
    subscriptionStatus: "trial" as const,
    subscriptionStartsAt: now,
    subscriptionEndsAt: ends,
    subscriptionAmount: 0,
  };
}

/** Compte créé (code) sans essai : peut ajouter un véhicule, pas encore au catalogue. */
export function idleSubscriptionValues() {
  return {
    subscriptionPlan: null as string | null,
    subscriptionStatus: "none" as const,
    subscriptionStartsAt: null as Date | null,
    subscriptionEndsAt: null as Date | null,
    subscriptionAmount: 0,
  };
}

function vehicleOwnerFilter(opts: { driverId?: string | null; prestataireId?: string | null }) {
  const ownerFilters = [];
  if (opts.driverId) ownerFilters.push(eq(loueurVehicles.driverId, opts.driverId));
  if (opts.prestataireId) ownerFilters.push(eq(loueurVehicles.prestataireId, opts.prestataireId));
  if (ownerFilters.length === 0) return null;
  return ownerFilters.length === 1 ? ownerFilters[0] : or(...ownerFilters);
}

/** Véhicule visible côté app client : actif + ouvert à la location. */
export async function driverHasVisibleVehicle(opts: {
  driverId?: string | null;
  prestataireId?: string | null;
}): Promise<boolean> {
  const owner = vehicleOwnerFilter(opts);
  if (!owner) return false;

  const [row] = await db
    .select({ id: loueurVehicles.id })
    .from(loueurVehicles)
    .where(and(eq(loueurVehicles.isActive, true), eq(loueurVehicles.availableForRental, true), owner))
    .limit(1);
  return !!row;
}

async function driverHasAnyVehicle(opts: {
  driverId?: string | null;
  prestataireId?: string | null;
}): Promise<boolean> {
  const owner = vehicleOwnerFilter(opts);
  if (!owner) return false;
  const [row] = await db.select({ id: loueurVehicles.id }).from(loueurVehicles).where(owner).limit(1);
  return !!row;
}

export type LoueurTrialSyncResult<T> = {
  driver: T;
  waitingFirstVehicle: boolean;
  startedTrial: boolean;
};

/**
 * L'essai 30 j démarre au 1er véhicule visible sur l'app client.
 * Sans véhicule : statut none (pas de « paiement en attente »).
 * Un essai déjà lancé sans véhicule (création admin ancienne) est remis à zéro.
 */
export async function syncLoueurTrialFromVehicles<T extends {
  id: string;
  prestataireId?: string | null;
  subscriptionStatus?: string | null;
  subscriptionPlan?: string | null;
  subscriptionStartsAt?: string | Date | null;
  subscriptionEndsAt?: string | Date | null;
}>(driver: T): Promise<LoueurTrialSyncResult<T>> {
  const raw = (driver.subscriptionStatus || "none").toLowerCase();
  const resolved = resolveSubscriptionStatus(driver);
  if (resolved.status === "active" || resolved.status === "grace" || resolved.status === "expired") {
    return { driver, waitingFirstVehicle: false, startedTrial: false };
  }

  const hasVehicle = await driverHasVisibleVehicle({
    driverId: driver.id,
    prestataireId: driver.prestataireId,
  });

  if (!hasVehicle) {
    const neverConfigured = !(await driverHasAnyVehicle({
      driverId: driver.id,
      prestataireId: driver.prestataireId,
    }));
    if (raw === "trial" && neverConfigured) {
      await db.update(drivers).set(idleSubscriptionValues() as any).where(eq(drivers.id, driver.id));
      return {
        driver: { ...driver, ...idleSubscriptionValues() },
        waitingFirstVehicle: true,
        startedTrial: false,
      };
    }
    return { driver, waitingFirstVehicle: raw !== "trial", startedTrial: false };
  }

  const trialAlreadyRunning = raw === "trial" && !!parseEndsAt(driver.subscriptionEndsAt);
  if (trialAlreadyRunning) {
    return { driver, waitingFirstVehicle: false, startedTrial: false };
  }

  const trial = trialSubscriptionValues();
  await db.update(drivers).set(trial as any).where(eq(drivers.id, driver.id));
  console.log(`[ABO-LOUEUR] essai 30 j lancé driver=${driver.id} (1er véhicule visible)`);
  return {
    driver: { ...driver, ...trial },
    waitingFirstVehicle: false,
    startedTrial: true,
  };
}

export async function maybeStartLoueurTrialAfterVehicleWrite(vehicle: {
  driverId?: string | null;
  prestataireId?: string | null;
}): Promise<void> {
  let driverRow: typeof drivers.$inferSelect | undefined;
  if (vehicle.driverId) {
    const [row] = await db.select().from(drivers).where(eq(drivers.id, vehicle.driverId)).limit(1);
    driverRow = row;
  }
  if (!driverRow && vehicle.prestataireId) {
    const [row] = await db
      .select()
      .from(drivers)
      .where(eq(drivers.prestataireId, vehicle.prestataireId))
      .limit(1);
    driverRow = row;
  }
  if (driverRow) {
    await syncLoueurTrialFromVehicles(driverRow as any);
  }
}

/**
 * Statut opérationnel d'un loueur.
 * - trial / active / grace : accès + catalogue
 * - pending avec endsAt encore valide (essai en cours) : accès conservé
 * - none sans date : peut configurer un véhicule, hors catalogue jusqu'à l'essai
 * - expired après grâce 5 j : hors catalogue
 */
export function resolveSubscriptionStatus(driver: {
  subscriptionStatus?: string | null;
  subscriptionEndsAt?: string | Date | null;
} | null | undefined): SubscriptionAccess {
  if (!driver) {
    return {
      status: "none",
      access: false,
      catalogVisible: false,
      daysRemaining: null,
      graceDaysRemaining: null,
      endsAt: null,
      pending: false,
    };
  }

  const raw = (driver.subscriptionStatus || "none") as string;
  const pending = raw === "pending";
  const end = parseEndsAt(driver.subscriptionEndsAt);
  const endsAt = end ? end.toISOString() : null;
  const now = Date.now();

  const fromEndDate = (statusIfActive: SubscriptionStatus): SubscriptionAccess => {
    if (!end) {
      return {
        status: pending ? "pending" : (raw as SubscriptionStatus) || "none",
        access: !pending && (raw === "none" || raw === "trial" || raw === "active"),
        catalogVisible: !pending && (raw === "trial" || raw === "active"),
        daysRemaining: null,
        graceDaysRemaining: null,
        endsAt,
        pending,
      };
    }
    if (end.getTime() > now) {
      const status: SubscriptionStatus = pending
        ? "pending"
        : raw === "trial"
          ? "trial"
          : "active";
      return {
        status,
        access: true,
        catalogVisible: true,
        daysRemaining: daysBetween(now, end.getTime()),
        graceDaysRemaining: null,
        endsAt,
        pending,
      };
    }
    const graceUntil = end.getTime() + GRACE_DAYS * 24 * 60 * 60 * 1000;
    if (now <= graceUntil) {
      return {
        status: "grace",
        access: true,
        catalogVisible: true,
        daysRemaining: 0,
        graceDaysRemaining: daysBetween(now, graceUntil),
        endsAt,
        pending,
      };
    }
    return {
      status: "expired",
      access: false,
      catalogVisible: false,
      daysRemaining: 0,
      graceDaysRemaining: 0,
      endsAt,
      pending,
    };
  };

  if (pending) {
    return fromEndDate("pending");
  }
  if (raw === "none" && !end) {
    return {
      status: "none",
      access: true,
      catalogVisible: false,
      daysRemaining: null,
      graceDaysRemaining: null,
      endsAt: null,
      pending: false,
    };
  }
  return fromEndDate(raw === "trial" ? "trial" : "active");
}

export type LoueurPlanDef = {
  id: LoueurPlanId;
  label: string;
  amountXpf: number;
  days: number;
  stripePriceId?: string;
};

export type LoueurSubscriptionPlans = {
  monthly: LoueurPlanDef;
  semiannual?: LoueurPlanDef;
};

/** Fallback uniquement si Stripe est injoignable */
export const DEFAULT_LOUEUR_SUBSCRIPTION_PLANS: LoueurSubscriptionPlans = {
  monthly: { id: "monthly", label: "Mensuel", amountXpf: 8990, days: 30 },
};

/** @deprecated préférer getLoueurSubscriptionPlans() pour les prix live */
export const LOUEUR_SUBSCRIPTION_PLANS = DEFAULT_LOUEUR_SUBSCRIPTION_PLANS;

export async function ensureLoueurSubscriptionColumns(): Promise<void> {
  try {
    await db.execute(sql`
      ALTER TABLE drivers
      ADD COLUMN IF NOT EXISTS default_meeting_point TEXT
    `);
    await db.execute(sql`
      ALTER TABLE drivers
      ADD COLUMN IF NOT EXISTS subscription_plan TEXT
    `);
    await db.execute(sql`
      ALTER TABLE drivers
      ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'none'
    `);
    await db.execute(sql`
      ALTER TABLE drivers
      ADD COLUMN IF NOT EXISTS subscription_starts_at TIMESTAMP
    `);
    await db.execute(sql`
      ALTER TABLE drivers
      ADD COLUMN IF NOT EXISTS subscription_ends_at TIMESTAMP
    `);
    await db.execute(sql`
      ALTER TABLE drivers
      ADD COLUMN IF NOT EXISTS subscription_amount REAL
    `);
    await db.execute(sql`
      ALTER TABLE drivers
      ADD COLUMN IF NOT EXISTS subscription_stripe_session_id TEXT
    `);
    await db.execute(sql`
      ALTER TABLE drivers
      ADD COLUMN IF NOT EXISTS subscription_stripe_subscription_id TEXT
    `);
    await db.execute(sql`
      ALTER TABLE drivers
      ADD COLUMN IF NOT EXISTS subscription_stripe_customer_id TEXT
    `);
    await db.execute(sql`
      ALTER TABLE drivers
      ADD COLUMN IF NOT EXISTS subscription_stripe_invoice_id TEXT
    `);
    await db.execute(sql`
      ALTER TABLE loueur_vehicles
      ADD COLUMN IF NOT EXISTS default_meeting_point TEXT
    `);
    await ensureLoueurSubscriptionConfigTable();
    console.log("[DB] ✅ Colonnes abonnement / RDV loueur OK");
  } catch (e) {
    console.warn("[DB] ensureLoueurSubscriptionColumns:", e);
  }
}

export async function ensureLoueurSubscriptionConfigTable(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS loueur_subscription_config (
        id VARCHAR PRIMARY KEY DEFAULT 'default',
        monthly_amount_xpf REAL NOT NULL DEFAULT 5000,
        monthly_label TEXT NOT NULL DEFAULT 'Mensuel',
        monthly_days INTEGER NOT NULL DEFAULT 30,
        semiannual_amount_xpf REAL NOT NULL DEFAULT 30000,
        semiannual_label TEXT NOT NULL DEFAULT '6 mois',
        semiannual_days INTEGER NOT NULL DEFAULT 180,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);

    await db.execute(sql`
      INSERT INTO loueur_subscription_config (
        id,
        monthly_amount_xpf,
        monthly_label,
        monthly_days,
        semiannual_amount_xpf,
        semiannual_label,
        semiannual_days
      ) VALUES (
        'default',
        5000,
        'Mensuel',
        30,
        30000,
        '6 mois',
        180
      )
      ON CONFLICT (id) DO NOTHING
    `);
  } catch (e) {
    console.warn("[DB] ensureLoueurSubscriptionConfigTable:", e);
  }
}

function clampPositiveInt(n: unknown, fallback: number, min = 1, max = 3660): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, Math.round(v)));
}

function clampAmount(n: unknown, fallback: number): number {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return fallback;
  return Math.round(v);
}

export async function getLoueurSubscriptionPlans(opts?: {
  refresh?: boolean;
}): Promise<LoueurSubscriptionPlans> {
  const { fetchStripeLoueurPlans } = await import("./stripe-loueur-plans");
  const stripePlans = await fetchStripeLoueurPlans({ refresh: opts?.refresh });
  if (stripePlans?.monthly) return stripePlans;

  try {
    await ensureLoueurSubscriptionConfigTable();
    const result = await db.execute(sql`
      SELECT
        monthly_amount_xpf,
        monthly_label,
        monthly_days,
        semiannual_amount_xpf,
        semiannual_label,
        semiannual_days
      FROM loueur_subscription_config
      WHERE id = 'default'
      LIMIT 1
    `);

    const row = result.rows?.[0] as Record<string, unknown> | undefined;
    if (!row) return { ...DEFAULT_LOUEUR_SUBSCRIPTION_PLANS };

    const d = DEFAULT_LOUEUR_SUBSCRIPTION_PLANS;
    return {
      monthly: {
        id: "monthly",
        label: String(row.monthly_label || d.monthly.label),
        amountXpf: clampAmount(row.monthly_amount_xpf, d.monthly.amountXpf),
        days: clampPositiveInt(row.monthly_days, d.monthly.days),
      },
    };
  } catch (e) {
    console.warn("[getLoueurSubscriptionPlans]", e);
    return { ...DEFAULT_LOUEUR_SUBSCRIPTION_PLANS };
  }
}

/** Les prix se changent dans Stripe. Cette fonction force un rechargement. */
export async function updateLoueurSubscriptionPlans(_input?: unknown): Promise<LoueurSubscriptionPlans> {
  const { invalidateLoueurStripePlansCache } = await import("./stripe-loueur-plans");
  invalidateLoueurStripePlansCache();
  return getLoueurSubscriptionPlans({ refresh: true });
}
