/**
 * Webhook Stripe : activation instantanée de l'abonnement loueur
 * dès que le Payment Link est payé.
 */
import type { Express, Request, Response } from "express";
import Stripe from "stripe";
import { db } from "./db";
import { drivers, prestataires } from "@shared/schema";
import { eq } from "drizzle-orm";
import {
  activatePaidLoueurSubscription,
  getLoueurSubscriptionPlans,
  parseLoueurDriverRef,
  type LoueurPlanId,
} from "./ensure-loueur-subscription";
import { getLinkedAppDrivers } from "./sync-prestataire-app";

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  return key ? new Stripe(key) : null;
}

async function resolveDriverIdFromCheckout(
  session: Stripe.Checkout.Session
): Promise<string | null> {
  const fromMeta = String(session.metadata?.driverId || "").trim();
  if (fromMeta) {
    const [byMeta] = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.id, fromMeta)).limit(1);
    if (byMeta) return byMeta.id;
  }
  const fromRef = parseLoueurDriverRef(session.client_reference_id);
  if (fromRef) {
    const [d] = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.id, fromRef)).limit(1);
    if (d) return d.id;
  }

  const email = (
    session.customer_details?.email ||
    session.customer_email ||
    ""
  )
    .trim()
    .toLowerCase();
  if (!email) return null;

  const [p] = await db
    .select()
    .from(prestataires)
    .where(eq(prestataires.email, email))
    .limit(1);
  if (p) {
    const linked = await getLinkedAppDrivers(p.id, {
      matchCode: p.code,
      matchPhone: p.phone,
    });
    if (linked[0]?.id) return linked[0].id;
  }
  return null;
}

function stripeRefId(ref: string | { id: string } | null | undefined): string | null {
  if (!ref) return null;
  return typeof ref === "string" ? ref : ref.id || null;
}

async function planFromCheckoutAmount(amountTotal: number | null): Promise<LoueurPlanId> {
  const plans = await getLoueurSubscriptionPlans();
  if (amountTotal == null || !plans.semiannual) return "monthly";
  const semi = plans.semiannual.amountXpf;
  const monthly = plans.monthly.amountXpf;
  if (Math.abs(amountTotal - semi) <= Math.abs(amountTotal - monthly)) {
    return "semiannual";
  }
  return "monthly";
}

export async function handleLoueurStripeCheckoutPaid(
  session: Stripe.Checkout.Session
): Promise<{ ok: boolean; driverId?: string; error?: string }> {
  const paid =
    session.payment_status === "paid" ||
    session.payment_status === "no_payment_required" ||
    session.status === "complete";
  if (!paid) {
    return { ok: false, error: `payment_status=${session.payment_status} status=${session.status}` };
  }
  const driverId = await resolveDriverIdFromCheckout(session);
  if (!driverId) {
    return { ok: false, error: "Impossible d’identifier le loueur (client_reference_id manquant)" };
  }
  const plan = await planFromCheckoutAmount(session.amount_total);
  const result = await activatePaidLoueurSubscription({
    driverId,
    plan,
    amountXpf: session.amount_total,
    stripeSessionId: session.id,
    stripeSubscriptionId: stripeRefId(session.subscription),
    stripeCustomerId: stripeRefId(session.customer),
  });
  if (!result.ok) return { ok: false, driverId, error: result.error };
  console.log(
    `[STRIPE-LOUEUR] Abonnement activé driver=${driverId} session=${session.id} already=${!!result.alreadyProcessed}`
  );
  return { ok: true, driverId };
}

async function findDriverByStripeSubscription(subscriptionId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: drivers.id })
    .from(drivers)
    .where(eq(drivers.subscriptionStripeSubscriptionId, subscriptionId))
    .limit(1);
  return row?.id || null;
}

export async function confirmLoueurCheckoutSession(
  sessionId: string
): Promise<{ ok: boolean; driverId?: string; error?: string }> {
  const stripe = getStripe();
  if (!stripe) return { ok: false, error: "Stripe non configuré" };
  const id = String(sessionId || "").trim();
  if (!id.startsWith("cs_")) return { ok: false, error: "Session Stripe invalide" };
  try {
    const session = await stripe.checkout.sessions.retrieve(id);
    return handleLoueurStripeCheckoutPaid(session);
  } catch (error: any) {
    return { ok: false, error: error?.message || "Session Stripe introuvable" };
  }
}

function sessionMatchesLoueur(
  session: Stripe.Checkout.Session,
  driverIds: string[],
  emails: string[]
): boolean {
  const paid =
    session.payment_status === "paid" ||
    session.payment_status === "no_payment_required" ||
    session.status === "complete";
  if (!paid) return false;
  const metaId = String(session.metadata?.driverId || "").trim();
  const ref = String(session.client_reference_id || "").trim();
  if (metaId && driverIds.includes(metaId)) return true;
  if (driverIds.some((id) => ref === id || ref === `drv_${id}`)) return true;
  const sessionEmail = (
    session.customer_details?.email ||
    session.customer_email ||
    ""
  )
    .trim()
    .toLowerCase();
  return !!sessionEmail && emails.includes(sessionEmail);
}

export async function recoverPaidLoueurCheckout(
  driverId: string,
  opts?: { email?: string | null; driverIds?: string[] }
): Promise<{ ok: boolean; error?: string; driverId?: string }> {
  const stripe = getStripe();
  if (!stripe || !driverId) return { ok: false, error: "Stripe non configuré" };
  const driverIds = Array.from(new Set([driverId, ...(opts?.driverIds || [])].filter(Boolean)));
  const emails = [opts?.email]
    .map((e) => String(e || "").trim().toLowerCase())
    .filter((e) => e.includes("@"));

  try {
    let listed: Stripe.Checkout.Session[] = [];
    try {
      const page = await stripe.checkout.sessions.list({ limit: 100, status: "complete" });
      listed = page.data;
    } catch {
      const page = await stripe.checkout.sessions.list({ limit: 100 });
      listed = page.data;
    }

    const match = listed.find((session) => sessionMatchesLoueur(session, driverIds, emails));
    if (match) {
      const targets = driverIds.length ? driverIds : [driverId];
      let last: { ok: boolean; driverId?: string; error?: string } = { ok: false };
      for (const id of targets) {
        const forced: Stripe.Checkout.Session = {
          ...match,
          metadata: { ...(match.metadata || {}), driverId: id },
          client_reference_id: match.client_reference_id || `drv_${id}`,
        };
        last = await handleLoueurStripeCheckoutPaid(forced);
      }
      console.log(
        `[STRIPE-LOUEUR] recover checkout ${match.id} drivers=${targets.join(",")} ok=${last.ok} err=${last.error || ""}`
      );
      return last.ok ? { ok: true, driverId: last.driverId } : { ok: false, error: last.error };
    }

    const subs = await stripe.subscriptions.list({
      status: "all",
      limit: 40,
      expand: ["data.customer"],
    });
    const liveSub = subs.data.find((sub) => {
      if (sub.status !== "active" && sub.status !== "trialing") return false;
      const metaId = String(sub.metadata?.driverId || "").trim();
      if (metaId && driverIds.includes(metaId)) return true;
      const customer = sub.customer;
      const customerEmail =
        customer && typeof customer !== "string" && "email" in customer
          ? String((customer as Stripe.Customer).email || "").trim().toLowerCase()
          : "";
      return !!customerEmail && emails.includes(customerEmail);
    });

    if (!liveSub) {
      console.warn(
        `[STRIPE-LOUEUR] recover: aucun paiement pour driver=${driverId} email=${emails.join(",") || "-"} sessions=${listed.length} subs=${subs.data.length}`
      );
      return { ok: false, error: "Aucun paiement Stripe trouvé" };
    }

    const price = liveSub.items.data[0]?.price;
    const amount = price?.unit_amount ?? null;
    const targets = driverIds.length ? driverIds : [driverId];
    for (const id of targets) {
      await activatePaidLoueurSubscription({
        driverId: id,
        plan: "monthly",
        amountXpf: amount,
        stripeSubscriptionId: liveSub.id,
        stripeCustomerId: stripeRefId(liveSub.customer),
      });
    }
    console.log(`[STRIPE-LOUEUR] recover subscription ${liveSub.id} drivers=${targets.join(",")}`);
    return { ok: true, driverId };
  } catch (error: any) {
    console.warn("[STRIPE-LOUEUR] recover error:", error?.message || error);
    return { ok: false, error: error?.message || "Recherche Stripe impossible" };
  }
}

export async function handleLoueurStripeInvoicePaid(
  invoice: Stripe.Invoice
): Promise<{ ok: boolean; driverId?: string; error?: string }> {
  const reason = invoice.billing_reason;
  if (reason && reason !== "subscription_cycle" && reason !== "subscription_create") {
    return { ok: true };
  }
  const subscriptionId = stripeRefId(
    (invoice as any).subscription || (invoice as any).parent?.subscription_details?.subscription
  );
  if (!subscriptionId) return { ok: false, error: "invoice sans subscription" };

  let driverId = await findDriverByStripeSubscription(subscriptionId);
  if (!driverId) {
    const stripe = getStripe();
    const metaId = stripe
      ? (await stripe.subscriptions.retrieve(subscriptionId)).metadata?.driverId
      : null;
    if (metaId) {
      const [row] = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.id, metaId)).limit(1);
      driverId = row?.id || null;
    }
  }
  if (!driverId) {
    return { ok: false, error: `Aucun loueur lié à ${subscriptionId}` };
  }

  const result = await activatePaidLoueurSubscription({
    driverId,
    plan: "monthly",
    amountXpf: invoice.amount_paid,
    stripeInvoiceId: invoice.id,
    stripeSubscriptionId: subscriptionId,
    stripeCustomerId: stripeRefId(invoice.customer),
  });
  if (!result.ok) return { ok: false, driverId, error: result.error };
  console.log(`[STRIPE-LOUEUR] Renouvellement driver=${driverId} invoice=${invoice.id}`);
  return { ok: true, driverId };
}

export async function handleLoueurStripeSubscriptionDeleted(
  subscription: Stripe.Subscription
): Promise<void> {
  const driverId = await findDriverByStripeSubscription(subscription.id);
  if (!driverId) return;
  await db
    .update(drivers)
    .set({ subscriptionStatus: "expired" } as any)
    .where(eq(drivers.id, driverId));
  console.log(`[STRIPE-LOUEUR] Abonnement Stripe annulé driver=${driverId}`);
}

export function registerStripeLoueurWebhook(app: Express): void {
  app.post("/api/public/loueur-subscription/confirm", async (req: Request, res: Response) => {
    const sessionId = String(req.body?.sessionId || req.query.session_id || "").trim();
    const result = await confirmLoueurCheckoutSession(sessionId);
    if (!result.ok) {
      return res.status(400).json({ success: false, error: result.error || "Paiement non confirmé" });
    }
    return res.json({ success: true, driverId: result.driverId });
  });

  app.post("/api/webhooks/stripe-loueur", async (req: Request, res: Response) => {
    const stripe = getStripe();
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
    if (!stripe || !webhookSecret) {
      console.error("[STRIPE-LOUEUR] STRIPE_SECRET_KEY ou STRIPE_WEBHOOK_SECRET manquant");
      return res.status(500).json({ error: "Webhook Stripe non configuré" });
    }

    const signature = req.headers["stripe-signature"];
    if (!signature || typeof signature !== "string") {
      return res.status(400).json({ error: "Signature Stripe absente" });
    }

    const rawBody: Buffer | undefined = (req as any).rawBody;
    if (!rawBody) {
      console.error("[STRIPE-LOUEUR] rawBody manquant — le JSON parser a déjà consommé le body");
      return res.status(400).json({ error: "Corps brut requis" });
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err: any) {
      console.error("[STRIPE-LOUEUR] Signature invalide:", err?.message);
      return res.status(400).json({ error: "Signature invalide" });
    }

    try {
      console.log(`[STRIPE-LOUEUR] event ${event.type}`);
      if (
        event.type === "checkout.session.completed" ||
        event.type === "checkout.session.async_payment_succeeded"
      ) {
        const session = event.data.object as Stripe.Checkout.Session;
        const result = await handleLoueurStripeCheckoutPaid(session);
        if (!result.ok) {
          console.warn("[STRIPE-LOUEUR] Activation ignorée:", result.error);
        }
      } else if (event.type === "invoice.paid") {
        const invoice = event.data.object as Stripe.Invoice;
        const result = await handleLoueurStripeInvoicePaid(invoice);
        if (!result.ok) {
          console.warn("[STRIPE-LOUEUR] Renouvellement ignoré:", result.error);
        }
      } else if (event.type === "customer.subscription.deleted") {
        await handleLoueurStripeSubscriptionDeleted(event.data.object as Stripe.Subscription);
      }
      return res.json({ received: true });
    } catch (error) {
      console.error("[STRIPE-LOUEUR] Handler error:", error);
      return res.status(500).json({ error: "Erreur webhook" });
    }
  });
}
