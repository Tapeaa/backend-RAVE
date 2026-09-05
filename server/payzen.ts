/**
 * PayZen / Lyra V4 — CreatePayment multi-tenant (credentials loueur).
 */
import { createHmac, timingSafeEqual } from "crypto";
import { db } from "./db";
import { loueurVehicles, orders, prestataires } from "@shared/schema";
import { eq } from "drizzle-orm";
import { decryptOsbCertificate, prestataireHasOsbCredentials } from "./osb-crypto";

const DEFAULT_API = "https://api.payzen.eu/api-payment";

export function getPayzenApiBase(): string {
  return (process.env.PAYZEN_API_URL || DEFAULT_API).replace(/\/$/, "");
}

export type PayzenCreateResult = {
  formToken: string;
  publicKey: string | null;
  shopId: string;
  orderId: string;
};

function basicAuthHeader(shopId: string, certificate: string): string {
  return "Basic " + Buffer.from(`${shopId}:${certificate}`, "utf8").toString("base64");
}

/** XPF : 0 décimales — montant = totalPrice en francs */
export async function createPayzenPaymentForOrder(params: {
  orderId: string;
  clientId: string;
  returnUrl?: string;
  ipnUrl?: string;
}): Promise<PayzenCreateResult> {
  const [order] = await db.select().from(orders).where(eq(orders.id, params.orderId));
  if (!order) {
    throw Object.assign(new Error("Commande introuvable"), { status: 404, code: "ORDER_NOT_FOUND" });
  }
  if (order.clientId && order.clientId !== params.clientId) {
    throw Object.assign(new Error("Accès non autorisé"), { status: 403, code: "FORBIDDEN" });
  }

  const ro = (order.rideOption || {}) as Record<string, unknown>;
  const loueurVehicleId = String(
    ro.loueurVehicleId || (ro.rentalData as any)?.loueurVehicleId || ""
  ).trim();
  if (!loueurVehicleId) {
    throw Object.assign(new Error("Commande location sans véhicule"), {
      status: 400,
      code: "NOT_RENTAL",
    });
  }

  const [vehicle] = await db
    .select({
      id: loueurVehicles.id,
      prestataireId: loueurVehicles.prestataireId,
    })
    .from(loueurVehicles)
    .where(eq(loueurVehicles.id, loueurVehicleId))
    .limit(1);

  if (!vehicle?.prestataireId) {
    throw Object.assign(new Error("Véhicule / loueur introuvable"), {
      status: 404,
      code: "VEHICLE_NOT_FOUND",
    });
  }

  const [prestataire] = await db
    .select()
    .from(prestataires)
    .where(eq(prestataires.id, vehicle.prestataireId))
    .limit(1);

  if (!prestataire || !prestataireHasOsbCredentials(prestataire as any)) {
    throw Object.assign(new Error("Paiement en ligne non configuré pour ce loueur"), {
      status: 400,
      code: "OSB_NOT_CONFIGURED",
    });
  }

  const shopId = String((prestataire as any).osbShopId).trim();
  const publicKey = ((prestataire as any).osbPublicKey as string | null) || null;
  const certificate = await decryptOsbCertificate(
    String((prestataire as any).osbCertificateEncrypted)
  );

  const amount = Math.round(Number(order.totalPrice) || 0);
  if (amount <= 0) {
    throw Object.assign(new Error("Montant invalide"), { status: 400, code: "INVALID_AMOUNT" });
  }

  const baseUrl = getPayzenApiBase();
  const body: Record<string, unknown> = {
    amount,
    currency: "XPF",
    orderId: order.id,
    customer: {
      email: undefined,
      reference: order.clientId || undefined,
      billingDetails: {
        firstName: order.clientName?.split(/\s+/)[0] || "Client",
        lastName: order.clientName?.split(/\s+/).slice(1).join(" ") || "RAVE",
        phoneNumber: order.clientPhone || undefined,
      },
    },
  };

  if (params.returnUrl) {
    (body as any).formAction = "PAYMENT";
    // Some PayZen setups accept return URLs via contrib / strongAuthentication
  }
  if (params.ipnUrl) {
    (body as any).ipnTargetUrl = params.ipnUrl;
  }

  const response = await fetch(`${baseUrl}/V4/Charge/CreatePayment`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: basicAuthHeader(shopId, certificate),
    },
    body: JSON.stringify(body),
  });

  const json = (await response.json().catch(() => null)) as any;
  if (!response.ok || json?.status !== "SUCCESS") {
    const msg =
      json?.answer?.errorMessage ||
      json?.answer?.detailedErrorMessage ||
      json?.errorMessage ||
      `PayZen error HTTP ${response.status}`;
    console.error("[PayZen] CreatePayment failed:", {
      shopIdPrefix: shopId.slice(0, 4) + "…",
      status: json?.status,
      code: json?.answer?.errorCode,
    });
    throw Object.assign(new Error(msg), { status: 502, code: "PAYZEN_ERROR" });
  }

  const formToken = json?.answer?.formToken;
  if (!formToken || typeof formToken !== "string") {
    throw Object.assign(new Error("formToken manquant dans la réponse PayZen"), {
      status: 502,
      code: "PAYZEN_NO_TOKEN",
    });
  }

  // Mémoriser l’intention de paiement (sans secrets)
  const updatedRide = {
    ...ro,
    payzenFormTokenIssuedAt: new Date().toISOString(),
    payzenStatus: "form_token_issued",
    paymentOnline: true,
  };
  await db
    .update(orders)
    .set({
      paymentMethod: "card",
      rideOption: updatedRide as any,
    } as any)
    .where(eq(orders.id, order.id));

  return {
    formToken,
    publicKey,
    shopId,
    orderId: order.id,
  };
}

/**
 * Vérifie la signature IPN PayZen (kr-answer + kr-hash) avec le certificat du shop.
 * Hash = HMAC-SHA256(kr-answer, certificate) en hex, ou SHA256 selon config.
 */
export function verifyPayzenIpnHash(
  krAnswer: string,
  krHash: string,
  certificate: string,
  algorithm: "sha256" | "sha1" = "sha256"
): boolean {
  try {
    const expected = createHmac(algorithm, certificate).update(krAnswer, "utf8").digest("hex");
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(String(krHash || "").toLowerCase(), "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function markOrderPayzenPaid(orderId: string, meta?: Record<string, unknown>) {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) return null;
  const ro = { ...(order.rideOption as any), payzenStatus: "paid", ...meta, payzenPaidAt: new Date().toISOString() };
  const [updated] = await db
    .update(orders)
    .set({
      status: "payment_confirmed",
      paymentMethod: "card",
      rideOption: ro,
    } as any)
    .where(eq(orders.id, orderId))
    .returning();
  return updated;
}

export async function getPrestataireOsbForVehicle(loueurVehicleId: string): Promise<{
  paymentOnlineAvailable: boolean;
  prestataireId: string | null;
}> {
  const [row] = await db
    .select({
      prestataireId: loueurVehicles.prestataireId,
      osbShopId: prestataires.osbShopId,
      osbCertificateEncrypted: prestataires.osbCertificateEncrypted,
    })
    .from(loueurVehicles)
    .leftJoin(prestataires, eq(loueurVehicles.prestataireId, prestataires.id))
    .where(eq(loueurVehicles.id, loueurVehicleId))
    .limit(1);

  if (!row) return { paymentOnlineAvailable: false, prestataireId: null };
  return {
    prestataireId: row.prestataireId,
    paymentOnlineAvailable: prestataireHasOsbCredentials({
      osbShopId: row.osbShopId,
      osbCertificateEncrypted: row.osbCertificateEncrypted,
    }),
  };
}
