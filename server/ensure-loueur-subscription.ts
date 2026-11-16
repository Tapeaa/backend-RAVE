/**
 * Abonnement plateforme loueur : colonnes drivers + config prix (admin-editable).
 */
import { db } from "./db";
import { eq, sql } from "drizzle-orm";
import { drivers } from "@shared/schema";

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
}): Promise<{ ok: true; endsAt: string; alreadyProcessed?: boolean } | { ok: false; error: string }> {
  const [driver] = await db.select().from(drivers).where(eq(drivers.id, opts.driverId)).limit(1);
  if (!driver) return { ok: false, error: "Loueur introuvable" };

  if (
    opts.stripeSessionId &&
    (driver as any).subscriptionStripeSessionId &&
    (driver as any).subscriptionStripeSessionId === opts.stripeSessionId
  ) {
    const current = resolveSubscriptionStatus(driver as any);
    return {
      ok: true,
      alreadyProcessed: true,
      endsAt: current.endsAt || new Date().toISOString(),
    };
  }

  const plans = await getLoueurSubscriptionPlans();
  const plan = plans[opts.plan === "semiannual" ? "semiannual" : "monthly"];
  const now = new Date();
  const currentEnd = parseEndsAt((driver as any).subscriptionEndsAt);
  const startFrom =
    currentEnd && currentEnd.getTime() > now.getTime() ? currentEnd : now;
  const ends = new Date(startFrom.getTime() + plan.days * 24 * 60 * 60 * 1000);

  await db
    .update(drivers)
    .set({
      subscriptionPlan: plan.id,
      subscriptionStatus: "active",
      subscriptionStartsAt: now,
      subscriptionEndsAt: ends,
      subscriptionAmount: opts.amountXpf != null ? opts.amountXpf : plan.amountXpf,
      ...(opts.stripeSessionId
        ? { subscriptionStripeSessionId: opts.stripeSessionId }
        : {}),
    } as any)
    .where(eq(drivers.id, opts.driverId));

  return { ok: true, endsAt: ends.toISOString() };
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

/**
 * Statut opérationnel d'un loueur.
 * - trial / active / grace : accès + catalogue
 * - pending avec endsAt encore valide (essai en cours) : accès conservé
 * - none sans date : comptes hérités, accès conservé
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
        catalogVisible: !pending && (raw === "none" || raw === "trial" || raw === "active"),
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
      catalogVisible: true,
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
};

export type LoueurSubscriptionPlans = {
  monthly: LoueurPlanDef;
  semiannual: LoueurPlanDef;
};

/** Valeurs par défaut si la table config est absente / vide */
export const DEFAULT_LOUEUR_SUBSCRIPTION_PLANS: LoueurSubscriptionPlans = {
  monthly: { id: "monthly", label: "Mensuel", amountXpf: 5000, days: 30 },
  semiannual: { id: "semiannual", label: "6 mois", amountXpf: 30000, days: 180 },
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

export async function getLoueurSubscriptionPlans(): Promise<LoueurSubscriptionPlans> {
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
      semiannual: {
        id: "semiannual",
        label: String(row.semiannual_label || d.semiannual.label),
        amountXpf: clampAmount(row.semiannual_amount_xpf, d.semiannual.amountXpf),
        days: clampPositiveInt(row.semiannual_days, d.semiannual.days),
      },
    };
  } catch (e) {
    console.warn("[getLoueurSubscriptionPlans]", e);
    return { ...DEFAULT_LOUEUR_SUBSCRIPTION_PLANS };
  }
}

export async function updateLoueurSubscriptionPlans(input: {
  monthlyAmountXpf?: number;
  monthlyLabel?: string;
  monthlyDays?: number;
  semiannualAmountXpf?: number;
  semiannualLabel?: string;
  semiannualDays?: number;
}): Promise<LoueurSubscriptionPlans> {
  await ensureLoueurSubscriptionConfigTable();
  const current = await getLoueurSubscriptionPlans();

  const monthlyAmount =
    input.monthlyAmountXpf !== undefined
      ? clampAmount(input.monthlyAmountXpf, current.monthly.amountXpf)
      : current.monthly.amountXpf;
  const monthlyLabel =
    typeof input.monthlyLabel === "string" && input.monthlyLabel.trim()
      ? input.monthlyLabel.trim().slice(0, 80)
      : current.monthly.label;
  const monthlyDays =
    input.monthlyDays !== undefined
      ? clampPositiveInt(input.monthlyDays, current.monthly.days)
      : current.monthly.days;

  const semiannualAmount =
    input.semiannualAmountXpf !== undefined
      ? clampAmount(input.semiannualAmountXpf, current.semiannual.amountXpf)
      : current.semiannual.amountXpf;
  const semiannualLabel =
    typeof input.semiannualLabel === "string" && input.semiannualLabel.trim()
      ? input.semiannualLabel.trim().slice(0, 80)
      : current.semiannual.label;
  const semiannualDays =
    input.semiannualDays !== undefined
      ? clampPositiveInt(input.semiannualDays, current.semiannual.days)
      : current.semiannual.days;

  await db.execute(sql`
    UPDATE loueur_subscription_config
    SET
      monthly_amount_xpf = ${monthlyAmount},
      monthly_label = ${monthlyLabel},
      monthly_days = ${monthlyDays},
      semiannual_amount_xpf = ${semiannualAmount},
      semiannual_label = ${semiannualLabel},
      semiannual_days = ${semiannualDays},
      updated_at = NOW()
    WHERE id = 'default'
  `);

  return getLoueurSubscriptionPlans();
}
