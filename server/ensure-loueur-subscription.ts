/**
 * Abonnement plateforme loueur : colonnes drivers + config prix (admin-editable).
 */
import { db } from "./db";
import { sql } from "drizzle-orm";

export type LoueurPlanId = "monthly" | "semiannual";

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
