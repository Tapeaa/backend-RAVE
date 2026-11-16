/**
 * Prix d'abonnement loueur : le tarif par défaut du produit Stripe est la source de vérité.
 * Produit : Abonnement RAVE (prod_V6LPtnFYwO9E)
 */
import type { Request } from "express";
import Stripe from "stripe";
import type { LoueurPlanDef, LoueurPlanId, LoueurSubscriptionPlans } from "./ensure-loueur-subscription";

export const DEFAULT_LOUEUR_STRIPE_PRODUCT_ID = "prod_V6LPtnFYwO9E";

const CACHE_TTL_MS = 60 * 1000;
const ZERO_DECIMAL = new Set([
  "bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga",
  "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf",
]);

type CachedPlans = {
  at: number;
  plans: LoueurSubscriptionPlans;
};

let cache: CachedPlans | null = null;
let lastError: string | null = null;
let lastFromStripe = false;

export function getLoueurStripeProductId(): string {
  return (process.env.LOUEUR_STRIPE_PRODUCT_ID || DEFAULT_LOUEUR_STRIPE_PRODUCT_ID).trim();
}

export function invalidateLoueurStripePlansCache(): void {
  cache = null;
}

export function getStripePlansStatus(): {
  fromStripe: boolean;
  error: string | null;
  productId: string;
} {
  return {
    fromStripe: lastFromStripe,
    error: lastError,
    productId: getLoueurStripeProductId(),
  };
}

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  return key ? new Stripe(key) : null;
}

function toMajorAmount(unitAmount: number, currency: string): number {
  return ZERO_DECIMAL.has(currency.toLowerCase()) ? unitAmount : Math.round(unitAmount / 100);
}

function mapRecurringPrice(price: Stripe.Price): (LoueurPlanDef & { stripePriceId: string }) | null {
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
    stripePriceId: price.id,
  };
}

function stripeKeyMode(): "test" | "live" | "unknown" {
  const key = process.env.STRIPE_SECRET_KEY || "";
  if (key.startsWith("sk_test")) return "test";
  if (key.startsWith("sk_live")) return "live";
  return "unknown";
}

async function resolveDefaultPrice(
  stripe: Stripe,
  product: Stripe.Product
): Promise<Stripe.Price | null> {
  const raw = product.default_price;
  if (!raw) return null;
  if (typeof raw !== "string") return raw;
  try {
    return await stripe.prices.retrieve(raw);
  } catch {
    return null;
  }
}

async function resolveLoueurProduct(stripe: Stripe): Promise<Stripe.Product> {
  const wantedId = getLoueurStripeProductId();
  const mode = stripeKeyMode();
  try {
    return await stripe.products.retrieve(wantedId, { expand: ["default_price"] });
  } catch (error: any) {
    if (error?.code !== "resource_missing") throw error;
  }

  const listed = await stripe.products.list({ active: true, limit: 100 });
  const match =
    listed.data.find((p) => /abonnement\s*rave/i.test(p.name || "")) ||
    listed.data.find((p) => /abonnement/i.test(p.name || ""));
  if (match) {
    console.warn(
      `[STRIPE-LOUEUR] ${wantedId} introuvable en mode ${mode}, fallback produit ${match.id} (${match.name})`
    );
    return stripe.products.retrieve(match.id, { expand: ["default_price"] });
  }

  throw new Error(
    `Produit ${wantedId} introuvable en mode Stripe ${mode}. ` +
      `La clé Render (STRIPE_SECRET_KEY) n’est pas le même environnement (test/live) que le dashboard où tu as créé Abonnement RAVE. ` +
      `Mets la Secret key ${mode === "test" ? "live (sk_live_…)" : "test (sk_test_…)"} correspondant au dashboard.`
  );
}

export async function fetchStripeLoueurPlans(
  opts?: { refresh?: boolean }
): Promise<LoueurSubscriptionPlans | null> {
  if (!opts?.refresh && cache && Date.now() - cache.at < CACHE_TTL_MS) {
    lastFromStripe = true;
    return cache.plans;
  }

  const stripe = getStripe();
  if (!stripe) {
    lastError = "STRIPE_SECRET_KEY manquant sur le serveur";
    lastFromStripe = false;
    console.warn("[STRIPE-LOUEUR]", lastError);
    return cache?.plans || null;
  }

  try {
    const product = await resolveLoueurProduct(stripe);
    const defaultPrice = await resolveDefaultPrice(stripe, product);
    const listed = await stripe.prices.list({
      product: product.id,
      active: true,
      limit: 20,
    });

    const mapped = listed.data
      .map(mapRecurringPrice)
      .filter((p): p is LoueurPlanDef & { stripePriceId: string } => !!p);

    const defaultMapped = defaultPrice ? mapRecurringPrice(defaultPrice) : null;
    const monthly =
      (defaultMapped && defaultMapped.id === "monthly" ? defaultMapped : null) ||
      mapped.find((p) => p.id === "monthly") ||
      defaultMapped ||
      mapped[0];

    if (!monthly) {
      lastError = `Aucun tarif récurrent actif sur ${product.id}`;
      lastFromStripe = false;
      console.warn("[STRIPE-LOUEUR]", lastError);
      return cache?.plans || null;
    }

    const semiannual = mapped.find(
      (p) => p.id === "semiannual" && p.stripePriceId !== monthly.stripePriceId
    );

    const plans: LoueurSubscriptionPlans = semiannual
      ? { monthly, semiannual }
      : { monthly };

    cache = { at: Date.now(), plans };
    lastError = null;
    lastFromStripe = true;
    console.log(
      `[STRIPE-LOUEUR] mode=${stripeKeyMode()} produit=${product.id} tarif=${monthly.amountXpf} XPF (${monthly.stripePriceId})`
    );
    return plans;
  } catch (error: any) {
    lastError = error?.message || "Lecture Stripe impossible";
    lastFromStripe = false;
    console.warn("[STRIPE-LOUEUR] Lecture des tarifs Stripe impossible:", lastError);
    return cache?.plans || null;
  }
}

export function publicOriginFromReq(req: Request): string {
  const env = (process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || "").trim();
  if (env) return env.replace(/\/$/, "");
  const proto = String(req.headers["x-forwarded-proto"] || req.protocol || "https").split(",")[0];
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "backend-rave.onrender.com");
  return `${proto}://${host}`;
}

export async function createLoueurStripeCheckout(opts: {
  driverId: string;
  email?: string | null;
  priceId?: string | null;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ url: string; sessionId: string } | { error: string }> {
  const stripe = getStripe();
  if (!stripe) return { error: "STRIPE_SECRET_KEY manquant sur le serveur" };

  try {
    let priceId = opts.priceId || null;
    if (!priceId) {
      const plans = await fetchStripeLoueurPlans({ refresh: true });
      priceId = plans?.monthly?.stripePriceId || null;
    }
    if (!priceId) {
      const product = await resolveLoueurProduct(stripe);
      const def = await resolveDefaultPrice(stripe, product);
      priceId = def?.id || null;
    }
    if (!priceId) return { error: "Aucun tarif Stripe par défaut" };

    const mail = String(opts.email || "").trim();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: `drv_${opts.driverId}`,
      customer_email: mail.includes("@") ? mail : undefined,
      success_url: opts.successUrl,
      cancel_url: opts.cancelUrl,
      metadata: { driverId: opts.driverId },
      subscription_data: {
        metadata: { driverId: opts.driverId },
      },
      allow_promotion_codes: true,
    });

    if (!session.url) return { error: "Stripe n’a pas renvoyé d’URL de paiement" };
    return { url: session.url, sessionId: session.id };
  } catch (error: any) {
    return { error: error?.message || "Checkout Stripe impossible" };
  }
}
