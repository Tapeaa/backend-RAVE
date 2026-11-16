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

/** Statuts d'une location carte pas encore transmise au loueur (paiement non abouti). */
export const AWAITING_PAYMENT_STATUS = "awaiting_payment";
export const PAYMENT_FAILED_STATUS = "payment_failed";

/**
 * Paiement validé : la location rejoint le circuit normal (pending → acceptation loueur).
 * `released` = la commande vient d'être libérée vers le loueur (à notifier).
 */
export async function markOrderPayzenPaid(
  orderId: string,
  meta?: Record<string, unknown>
): Promise<{ order: typeof orders.$inferSelect; released: boolean } | null> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) return null;
  const prev = (order.rideOption || {}) as any;
  const isRental = prev.type === "rental" || prev.isRentalOrder === true;
  const wasHeld = order.status === AWAITING_PAYMENT_STATUS || order.status === PAYMENT_FAILED_STATUS;
  // Anciennes locations payées passées à tort en payment_confirmed (statut « terminé ») avant acceptation
  const wrongDone = isRental && order.status === "payment_confirmed" && !order.assignedDriverId;
  if (prev.payzenStatus === "paid" && !wasHeld && !wrongDone) {
    return { order, released: false };
  }
  const ro = {
    ...prev,
    ...meta,
    payzenStatus: "paid",
    payzenPaidAt: prev.payzenPaidAt || new Date().toISOString(),
    payzenFailReason: null,
  };
  const nextStatus = isRental ? (wasHeld || wrongDone ? "pending" : order.status) : "payment_confirmed";
  const [updated] = await db
    .update(orders)
    .set({
      status: nextStatus,
      paymentMethod: "card",
      rideOption: ro,
      ...(nextStatus === "pending" && order.status !== "pending"
        ? { expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) }
        : {}),
    } as any)
    .where(eq(orders.id, orderId))
    .returning();
  return { order: updated, released: isRental && (wasHeld || wrongDone) };
}

/** Paiement refusé / abandonné : la location n'est jamais transmise au loueur. */
export async function markOrderPayzenFailed(orderId: string, reason: string) {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) return null;
  const prev = (order.rideOption || {}) as any;
  if (prev.payzenStatus === "paid" || order.status !== AWAITING_PAYMENT_STATUS) return order;
  const [updated] = await db
    .update(orders)
    .set({
      status: PAYMENT_FAILED_STATUS,
      rideOption: {
        ...prev,
        payzenStatus: "failed",
        payzenFailReason: reason.slice(0, 300),
        payzenFailedAt: new Date().toISOString(),
      },
    } as any)
    .where(eq(orders.id, orderId))
    .returning();
  return updated;
}

/** Statut réel côté PayZen (Order/Get) avec les identifiants OSB du loueur de la commande. */
export async function fetchPayzenOrderStatus(orderId: string): Promise<{
  orderStatus: string | null;
  errorMessage: string | null;
}> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw Object.assign(new Error("Commande introuvable"), { status: 404 });
  const loueurVehicleId = String((order.rideOption as any)?.loueurVehicleId || "").trim();
  const [vehicle] = loueurVehicleId
    ? await db
        .select({ prestataireId: loueurVehicles.prestataireId })
        .from(loueurVehicles)
        .where(eq(loueurVehicles.id, loueurVehicleId))
        .limit(1)
    : [];
  const [prestataire] = vehicle?.prestataireId
    ? await db.select().from(prestataires).where(eq(prestataires.id, vehicle.prestataireId)).limit(1)
    : [];
  if (!prestataire || !prestataireHasOsbCredentials(prestataire as any)) {
    throw Object.assign(new Error("Paiement en ligne non configuré"), {
      status: 400,
      code: "OSB_NOT_CONFIGURED",
    });
  }
  const shopId = String((prestataire as any).osbShopId).trim();
  const certificate = await decryptOsbCertificate(String((prestataire as any).osbCertificateEncrypted));
  const pzRes = await fetch(`${getPayzenApiBase()}/V4/Order/Get`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: basicAuthHeader(shopId, certificate) },
    body: JSON.stringify({ orderId }),
  });
  const pzJson = (await pzRes.json().catch(() => null)) as any;
  if (pzJson?.status !== "SUCCESS") {
    return {
      orderStatus: null,
      errorMessage: pzJson?.answer?.errorMessage || `PayZen HTTP ${pzRes.status}`,
    };
  }
  const txs: any[] = Array.isArray(pzJson?.answer?.transactions) ? pzJson.answer.transactions : [];
  const lastTx = txs[txs.length - 1];
  return {
    orderStatus: pzJson?.answer?.orderStatus || lastTx?.status || null,
    errorMessage: lastTx?.detailedErrorMessage || lastTx?.errorMessage || null,
  };
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

export type PayzenConnectionTestResult = {
  ok: boolean;
  message: string;
  shopIdPrefix?: string;
  formTokenReceived?: boolean;
  publicKeyPresent?: boolean;
  errorCode?: string | null;
};

/**
 * Teste Shop ID + certificat auprès de PayZen (CreatePayment 1 XPF).
 * N’encaisse rien : seul un formToken est émis, jamais soumis au formulaire.
 */
export async function testPayzenConnection(params: {
  shopId: string;
  certificate: string;
  publicKey?: string | null;
}): Promise<PayzenConnectionTestResult> {
  const shopId = String(params.shopId || "").trim();
  const certificate = String(params.certificate || "").trim();
  const publicKey = params.publicKey != null ? String(params.publicKey).trim() : "";

  if (!shopId || !certificate) {
    return {
      ok: false,
      message: "Shop ID et certificat sont requis pour le test",
      publicKeyPresent: !!publicKey,
    };
  }

  const baseUrl = getPayzenApiBase();
  const testOrderId = `rave-conn-${Date.now()}`;
  const body = {
    amount: 1,
    currency: "XPF",
    orderId: testOrderId,
    customer: {
      billingDetails: {
        firstName: "RAVE",
        lastName: "ConnexionTest",
      },
    },
  };

  try {
    const response = await fetch(`${baseUrl}/V4/Charge/CreatePayment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: basicAuthHeader(shopId, certificate),
      },
      body: JSON.stringify(body),
    });

    const json = (await response.json().catch(() => null)) as any;
    const formToken = json?.answer?.formToken;
    const errorCode = json?.answer?.errorCode ?? null;
    const errorMessage =
      json?.answer?.errorMessage ||
      json?.answer?.detailedErrorMessage ||
      json?.errorMessage ||
      (!response.ok ? `HTTP ${response.status}` : null);

    if (response.ok && json?.status === "SUCCESS" && typeof formToken === "string" && formToken) {
      return {
        ok: true,
        message: publicKey
          ? "Connexion PayZen OK — Shop ID et certificat valides"
          : "Connexion PayZen OK — pensez à renseigner aussi la clé publique pour le formulaire client",
        shopIdPrefix: shopId.slice(0, 4) + "…",
        formTokenReceived: true,
        publicKeyPresent: !!publicKey,
      };
    }

    return {
      ok: false,
      message: errorMessage || "Identifiants PayZen refusés",
      shopIdPrefix: shopId.slice(0, 4) + "…",
      formTokenReceived: false,
      publicKeyPresent: !!publicKey,
      errorCode,
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Erreur réseau vers PayZen",
      shopIdPrefix: shopId.slice(0, 4) + "…",
      publicKeyPresent: !!publicKey,
    };
  }
}

/** Charge les credentials stockés d’un prestataire puis teste PayZen. */
export async function testPayzenForPrestataireId(
  prestataireId: string
): Promise<PayzenConnectionTestResult> {
  const [row] = await db
    .select()
    .from(prestataires)
    .where(eq(prestataires.id, prestataireId))
    .limit(1);

  if (!row || !prestataireHasOsbCredentials(row as any)) {
    return {
      ok: false,
      message: "Paiement OSB non configuré pour ce loueur",
    };
  }

  const certificate = await decryptOsbCertificate(
    String((row as any).osbCertificateEncrypted)
  );
  return testPayzenConnection({
    shopId: String((row as any).osbShopId),
    certificate,
    publicKey: (row as any).osbPublicKey,
  });
}
