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
  if (session.payment_status && session.payment_status !== "paid") {
    return { ok: false, error: `payment_status=${session.payment_status}` };
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

export async function handleLoueurStripeInvoicePaid(
  invoice: Stripe.Invoice
): Promise<{ ok: boolean; driverId?: string; error?: string }> {
  if (invoice.billing_reason && invoice.billing_reason !== "subscription_cycle") {
    return { ok: true };
  }
  const subscriptionId = stripeRefId(
    (invoice as any).subscription || (invoice as any).parent?.subscription_details?.subscription
  );
  if (!subscriptionId) return { ok: false, error: "invoice sans subscription" };

  const driverId = await findDriverByStripeSubscription(subscriptionId);
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
