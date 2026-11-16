/**
 * Prix d'abonnement loueur : Stripe est la source de vérité.
 * Produit : Abonnement RAVE (prod_V6LPtnFYwO9E) sauf override env.
 */
import Stripe from "stripe";
import type { LoueurPlanDef, LoueurPlanId, LoueurSubscriptionPlans } from "./ensure-loueur-subscription";

export const DEFAULT_LOUEUR_STRIPE_PRODUCT_ID = "prod_V6LPtnFYwO9E";

const CACHE_TTL_MS = 5 * 60 * 1000;
const ZERO_DECIMAL = new Set([
  "bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga",
  "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf",
]);

type CachedPlans = {
  at: number;
  plans: LoueurSubscriptionPlans;
};

let cache: CachedPlans | null = null;

export function getLoueurStripeProductId(): string {
  return (process.env.LOUEUR_STRIPE_PRODUCT_ID || DEFAULT_LOUEUR_STRIPE_PRODUCT_ID).trim();
}

export function invalidateLoueurStripePlansCache(): void {
  cache = null;
}

function toMajorAmount(unitAmount: number, currency: string): number {
  return ZERO_DECIMAL.has(currency.toLowerCase()) ? unitAmount : Math.round(unitAmount / 100);
}

function mapRecurringPrice(price: Stripe.Price): LoueurPlanDef | null {
  if (!price.active || price.unit_amount == null) return null;
  const rec = price.recurring;
  if (!rec) return null;
  const count = rec.interval_count || 1;
  let id: LoueurPlanId = "monthly";
  let days = 30;
  let label = "Mensuel";
  if (rec.interval === "month" && count === 1) {
    id = "monthly";
    days = 30;
    label = "Mensuel";
  } else if (rec.interval === "month" && count === 6) {
    id = "semiannual";
    days = 180;
    label = "6 mois";
  } else if (rec.interval === "year" && count === 1) {
    id = "semiannual";
    days = 365;
    label = "Annuel";
  } else if (rec.interval === "month") {
    id = count >= 6 ? "semiannual" : "monthly";
    days = count * 30;
    label = count === 1 ? "Mensuel" : `${count} mois`;
  } else {
    return null;
  }
  if (price.nickname?.trim()) label = price.nickname.trim();
  return {
    id,
    label,
    amountXpf: toMajorAmount(price.unit_amount, price.currency),
    days,
  };
}

export async function fetchStripeLoueurPlans(
  opts?: { refresh?: boolean }
): Promise<LoueurSubscriptionPlans | null> {
  if (!opts?.refresh && cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.plans;
  }

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return cache?.plans || null;

  try {
    const stripe = new Stripe(key);
    const productId = getLoueurStripeProductId();
    const listed = await stripe.prices.list({
      product: productId,
      active: true,
      limit: 20,
    });
    const mapped = listed.data
      .map(mapRecurringPrice)
      .filter((p): p is LoueurPlanDef => !!p);

    if (mapped.length === 0) {
      console.warn(`[STRIPE-LOUEUR] Aucun tarif récurrent actif sur ${productId}`);
      return cache?.plans || null;
    }

    const monthly =
      mapped.find((p) => p.id === "monthly") || { ...mapped[0], id: "monthly" as const };
    const semiannual = mapped.find(
      (p) => p.id === "semiannual" && p.amountXpf !== monthly.amountXpf
    );

    const plans: LoueurSubscriptionPlans = semiannual
      ? { monthly, semiannual }
      : { monthly };

    cache = { at: Date.now(), plans };
    return plans;
  } catch (error) {
    console.warn("[STRIPE-LOUEUR] Lecture des tarifs Stripe impossible:", error);
    return cache?.plans || null;
  }
}
