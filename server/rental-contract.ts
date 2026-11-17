/**
 * Snapshot HTML du contrat de location (stocké en base + Cloudinary).
 * Aligné sur le contrat signé côté app client.
 */
import {
  buildCustomRentalContractHtml,
  buildDefaultRentalContractHtml,
} from "@shared/rental-contract-html";
import { persistContractHtml, persistContractPdf } from "./persist-media";
import { createHash } from "crypto";
import type { Request } from "express";
import { downloadSignedDocumentPdf } from "./yousign";
import { db } from "./db";
import { orders } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

type ContractOrder = {
  id: string;
  clientName?: string | null;
  totalPrice?: number | null;
  driverName?: string | null;
  rideOption?: any;
  /** Colonne orders.supplements : suppléments + assurances optionnelles */
  supplements?: any[] | null;
  status?: string | null;
};

/** Toute version de snapshot sans ce marqueur est régénérée (détail des prix, bloc loueur). */
const CONTRACT_VERSION_MARKER = "<!--rave-contract-v2-->";

const NOT_ACCEPTED_STATUSES = new Set([
  "pending",
  "cancelled",
  "expired",
  "payment_failed",
  "declined",
  "rejected",
]);

function isAcceptedByLoueur(status?: string | null): boolean {
  return !!status && !NOT_ACCEPTED_STATUSES.has(status);
}

function fmtXpf(n: number): string {
  return `${Math.round(Number(n) || 0).toLocaleString("fr-FR")} XPF`;
}

function buildPriceRows(order: ContractOrder, rideOpt: any, days: number): string {
  const rows: string[] = [];
  const breakdown: any[] = Array.isArray(rideOpt.pricingBreakdown) ? rideOpt.pricingBreakdown : [];
  if (breakdown.length > 1) {
    for (const l of breakdown) {
      rows.push(
        `<tr><td>Jours ${escapeHtml(l.fromDay)}–${escapeHtml(l.toDay)} (${escapeHtml(l.days)} j × ${fmtXpf(l.pricePerDay)})</td><td class="r">${fmtXpf(l.subtotal)}</td></tr>`
      );
    }
  } else {
    const subtotal =
      Number(rideOpt.pricingSubtotal) || (Number(rideOpt.price) || 0) * Math.max(1, days);
    rows.push(
      `<tr><td>Location (${days} jour${days > 1 ? "s" : ""})</td><td class="r">${fmtXpf(subtotal)}</td></tr>`
    );
  }

  const supplements = Array.isArray(order.supplements) ? order.supplements : [];
  for (const s of supplements) {
    const qty = Number(s.quantity ?? s.days ?? days) || days;
    const unit = Number(s.price ?? s.pricePerDay ?? s.unitPrice ?? 0);
    const total = Number(s.total) || unit * qty;
    rows.push(
      `<tr><td>${escapeHtml(s.name || s.label || "Supplément")} (${qty} j × ${fmtXpf(unit)})</td><td class="r">${fmtXpf(total)}</td></tr>`
    );
  }

  if (rideOpt.deposit) {
    rows.push(`<tr><td>Caution (restituée au retour)</td><td class="r">${escapeHtml(rideOpt.deposit)}</td></tr>`);
  }
  return rows.join("");
}

const MAX_SIGNATURE_BYTES = 400 * 1024;

export function isValidDrawnSignature(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(value.trim());
  if (!m) return false;
  const bytes = Math.floor((m[1].length * 3) / 4);
  return bytes > 200 && bytes <= MAX_SIGNATURE_BYTES;
}

export function getRequestIp(req: Request): string | null {
  const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return fwd || req.ip || req.socket?.remoteAddress || null;
}

/** SHA-256 du contrat sans les blocs de signature (reproductible à partir de la commande). */
export function computeContractHash(order: ContractOrder): string {
  const html = buildRentalContractHtml(order, { unsignedForHash: true });
  return createHash("sha256").update(html, "utf8").digest("hex");
}

export function isClientContractSigned(rideOpt: any): boolean {
  if (!rideOpt) return false;
  return !!(
    rideOpt.clientSignatureSvg ||
    rideOpt.clientSignedAt ||
    rideOpt.yousignSignatureRequestId ||
    rideOpt.signedVia === "yousign" ||
    rideOpt.signedVia === "drawn"
  );
}

function escapeHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function signatureCertificateHtml(rideOpt: any, sigName: string): string {
  const audit = rideOpt.clientSignatureAudit;
  if (!audit) return "";
  const at = audit.signedAt ? new Date(audit.signedAt) : null;
  const when = at
    ? `${at.toLocaleDateString("fr-FR", { timeZone: "Pacific/Tahiti" })} à ${at.toLocaleTimeString("fr-FR", {
        timeZone: "Pacific/Tahiti",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })} (heure de Tahiti)`
    : "—";
  const hash = audit.contractHash ? String(audit.contractHash) : "";
  return `<div style="margin-top:8px;padding:8px 10px;border:1px solid #e5e7eb;border-radius:6px;background:#f9fafb;font-size:9px;line-height:1.5;color:#4b5563;text-align:left">
  <div style="font-weight:700;color:#111827;margin-bottom:2px">Certificat de signature électronique RAVE</div>
  <div>Signataire : ${escapeHtml(sigName)} — « Lu et approuvé »</div>
  <div>Date : ${escapeHtml(when)}</div>
  ${audit.ip ? `<div>Adresse IP : ${escapeHtml(audit.ip)}</div>` : ""}
  ${hash ? `<div>Empreinte du contrat (SHA-256) : <span style="font-family:monospace">${escapeHtml(hash.slice(0, 16))}…</span></div>` : ""}
</div>`;
}

export function buildRentalContractHtml(
  order: ContractOrder,
  opts?: { unsignedForHash?: boolean }
): string {
  const rideOpt = order.rideOption || {};
  const rd = rideOpt.rentalData || {
    vehicleName: rideOpt.title || "Véhicule",
    vehicleCategory: rideOpt.categoryLabel || rideOpt.category || "",
    days: rideOpt.days || 0,
    pricePerDay: rideOpt.price || 0,
    startDate: rideOpt.startDate,
    endDate: rideOpt.endDate,
    pickupAddress: rideOpt.pickupLocation,
  };
  const clientName = order.clientName || "Client";
  const loueurName = rideOpt.owner || order.driverName || "Loueur";
  const loueurTahiti = String(rideOpt.ownerNumeroTahiti || rideOpt.numeroTahiti || "").trim();
  const signatureImg = rideOpt.clientSignatureSvg || "";
  const loueurSigImg = rideOpt.loueurSignatureSvg || "";
  const signedAt = rideOpt.clientSignedAt;
  const sigName = rideOpt.clientSignatureName || clientName;
  const clientSigned = isClientContractSigned(rideOpt);
  const viaYousign = !!(
    rideOpt.yousignSignatureRequestId ||
    rideOpt.signedVia === "yousign"
  );
  const signedDate = signedAt
    ? new Date(signedAt).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : new Date().toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
  const signedTime = signedAt
    ? new Date(signedAt).toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
  const totalPrice = order.totalPrice || 0;
  const firstTier = Array.isArray(rideOpt.pricingBreakdown) ? rideOpt.pricingBreakdown[0] : null;
  const pricePerDay = Number(firstTier?.pricePerDay) || rd.pricePerDay || rideOpt.price || 0;
  const days = rd.days || rideOpt.days || 0;
  const ref = order.id.substring(0, 8).toUpperCase();

  const startLabel = rd.startDate
    ? new Date(rd.startDate).toLocaleDateString("fr-FR")
    : "—";
  const endLabel = rd.endDate ? new Date(rd.endDate).toLocaleDateString("fr-FR") : "—";

  const tvaRegime = rideOpt.tvaRegime === "assujetti" ? "assujetti" : "franchise";
  const tvaRate = Number(rideOpt.tvaRate) || 16;
  const tvaMode = rideOpt.tvaMode === "extra" ? "extra" : "included";
  const priceHt = Number(rideOpt.priceHt);
  const priceTva = Number(rideOpt.priceTva);
  const hasTvaSplit =
    tvaRegime === "assujetti" &&
    Number.isFinite(priceHt) &&
    Number.isFinite(priceTva) &&
    priceHt >= 0;

  let priceRowsHtml = buildPriceRows(order, rideOpt, Number(days) || 1);
  if (hasTvaSplit) {
    priceRowsHtml += [
      `<tr><td>Montant HT</td><td class="r">${Math.round(priceHt).toLocaleString("fr-FR")} XPF</td></tr>`,
      `<tr><td>TVA (${tvaRate} %${tvaMode === "extra" ? ", en sus" : ", incluse"})</td><td class="r">${Math.round(priceTva).toLocaleString("fr-FR")} XPF</td></tr>`,
    ].join("");
  }

  const clientSigBlock = !clientSigned
    ? `<div class="sig-date">Non signé</div>`
    : signatureImg
      ? `<img class="sig-img" src="${signatureImg}" alt="Signature"/>
  <div class="sig-date">✓ Signé électroniquement${viaYousign ? " via Yousign" : ""} le ${signedDate}${signedTime ? " à " + signedTime : ""}</div>
  ${signatureCertificateHtml(rideOpt, sigName)}`
      : `<div style="margin-top:8px;padding:14px;border:2px solid #22c55e;border-radius:8px;background:#f0fdf4;text-align:center">
  <div style="font-size:28px;font-family:Georgia,serif;font-style:italic;color:#166534">${String(sigName).replace(/</g, "")}</div>
  <div class="sig-date" style="color:#166534;margin-top:6px">✓ Signé électroniquement${viaYousign ? " via Yousign" : ""} le ${signedDate}${signedTime ? " à " + signedTime : ""}</div>
</div>`;

  const loueurTahitiLine = loueurTahiti
    ? `<div class="sig-date">N° Tahiti : ${escapeHtml(loueurTahiti)}</div>`
    : "";
  const loueurState = loueurSigImg ? "signed" : isAcceptedByLoueur(order.status) ? "accepted" : "pending";
  const loueurSigBlock =
    loueurState === "signed"
      ? `<img class="sig-img" src="${loueurSigImg}" alt="Signature loueur"/>
  <div class="sig-date">✓ Signé${
    rideOpt.loueurSignedAt
      ? ` le ${new Date(rideOpt.loueurSignedAt).toLocaleDateString("fr-FR", { timeZone: "Pacific/Tahiti" })}`
      : ""
  }</div>`
      : loueurState === "accepted"
        ? `<div class="sig-date" style="color:#166534;font-weight:700">✓ Réservation acceptée électroniquement par le loueur</div>`
        : `<div class="sig-date">En attente de validation du loueur</div>`;

  const signatureHtml = opts?.unsignedForHash
    ? `<div class="signature-box"><div class="sig-label">Le locataire</div><div class="sig-name">${escapeHtml(sigName)}</div></div>
<div class="signature-box"><div class="sig-label">Le loueur</div><div class="sig-name">${escapeHtml(loueurName)}</div></div>`
    : `${CONTRACT_VERSION_MARKER}<div class="signature-box">
  <div class="sig-label">Le locataire</div>
  <div class="sig-name">${escapeHtml(sigName)}</div>
  ${clientSigBlock}
</div>
<div class="signature-box" data-loueur-state="${loueurState}">
  <div class="sig-label">Le loueur</div>
  <div class="sig-name">${escapeHtml(loueurName)}</div>
  ${loueurTahitiLine}
  ${loueurSigBlock}
</div>`;

  const params = {
    ref,
    contractDate: signedDate,
    loueurName,
    loueurNumeroTahiti: loueurTahiti || null,
    clientName,
    vehicleName: String(rd.vehicleName || rideOpt.title || "Véhicule"),
    vehicleMeta: String(rd.vehicleCategory || rideOpt.categoryLabel || ""),
    startLabel,
    endLabel,
    days: Number(days) || 0,
    pickupLocation: String(rd.pickupAddress || rideOpt.pickupLocation || ""),
    pricePerDayLabel: `${Math.round(Number(pricePerDay)).toLocaleString("fr-FR")} XPF${
      tvaRegime === "assujetti" ? " TTC" : ""
    }`,
    priceRowsHtml,
    totalLabel: `${Number(totalPrice).toLocaleString("fr-FR")} XPF${
      tvaRegime === "assujetti" ? " TTC" : ""
    }`,
    paymentNote:
      tvaRegime === "assujetti"
        ? tvaMode === "extra"
          ? `TVA ${tvaRate} % facturée en sus du tarif HT.`
          : `TVA ${tvaRate} % incluse dans le tarif.`
        : "TVA non applicable (franchise en base).",
    signatureHtml,
    customBody: rideOpt.customContractText || null,
  };

  const isCustom =
    rideOpt.rentalContractMode === "custom" &&
    !!(rideOpt.customContractText && String(rideOpt.customContractText).trim());

  return isCustom
    ? buildCustomRentalContractHtml({ ...params, isCustom: true })
    : buildDefaultRentalContractHtml(params);
}

export function isSnapshotStale(html: string, rideOpt: any, status?: string | null): boolean {
  if (!html.includes(CONTRACT_VERSION_MARKER)) return true;
  if (isAcceptedByLoueur(status) && /data-loueur-state="pending"/.test(html)) return true;
  if (isClientContractSigned(rideOpt) && /Non signé/i.test(html)) return true;
  if (rideOpt.loueurSignatureSvg && /<div class="sig-date">En attente<\/div>/.test(html)) return true;
  if (rideOpt.clientSignatureAudit && !/Certificat de signature électronique RAVE/.test(html)) return true;
  return false;
}

/** Régénère le snapshot HTML (après ajout d'une signature) et le persiste. Retourne le rideOption mis à jour. */
export async function refreshContractSnapshot(order: ContractOrder): Promise<any> {
  const rideOpt = { ...((order.rideOption || {}) as any) };
  const html = buildRentalContractHtml({ ...order, rideOption: rideOpt });
  rideOpt.contractHtmlSnapshot = html;
  const patch: Record<string, unknown> = { contractHtmlSnapshot: html };
  if (rideOpt.loueurSignatureSvg) patch.loueurSignatureSvg = rideOpt.loueurSignatureSvg;
  if (rideOpt.loueurSignedAt) patch.loueurSignedAt = rideOpt.loueurSignedAt;
  try {
    const url = await persistContractHtml(html, order.id);
    if (url) {
      rideOpt.contractUrl = url;
      patch.contractUrl = url;
    }
  } catch (e) {
    console.warn("[CONTRACT] snapshot upload failed:", e);
  }
  await db
    .update(orders)
    .set({
      rideOption: sql`coalesce(${orders.rideOption}, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb`,
    } as any)
    .where(eq(orders.id, order.id));
  return rideOpt;
}

export type ResolvedContract = {
  html: string;
  contractUrl: string | null;
  signedPdfUrl: string | null;
  signed: boolean;
  signedVia: string | null;
  /** PDF Yousign natif (base64) si disponible */
  pdfBase64: string | null;
  clientSignatureAudit?: any;
  loueurSigned?: boolean;
  error?: string | null;
};

/** HTML snapshot + PDF Yousign (téléchargé / mis en cache) */
export async function resolveOrderContract(order: {
  id: string;
  clientName?: string | null;
  totalPrice?: number | null;
  driverName?: string | null;
  rideOption?: any;
  supplements?: any[] | null;
  status?: string | null;
}): Promise<ResolvedContract> {
  const rideOpt = { ...((order.rideOption || {}) as any) };
  const signed = isClientContractSigned(rideOpt);
  const viaYousign = !!(
    rideOpt.yousignSignatureRequestId ||
    rideOpt.signedVia === "yousign"
  );

  let html = rideOpt.contractHtmlSnapshot as string | undefined;
  let contractUrl = (rideOpt.contractUrl as string | undefined) || null;
  let signedPdfUrl = (rideOpt.yousignSignedPdfUrl as string | undefined) || null;
  let pdfBase64: string | null = null;
  let error: string | null = null;

  const cachePatch: Record<string, unknown> = {};
  if (!html || isSnapshotStale(html, rideOpt, order.status)) {
    html = buildRentalContractHtml({ ...order, rideOption: rideOpt });
    try {
      const url = await persistContractHtml(html, order.id);
      if (url) {
        contractUrl = url;
        rideOpt.contractUrl = url;
        cachePatch.contractUrl = url;
      }
      rideOpt.contractHtmlSnapshot = html;
      cachePatch.contractHtmlSnapshot = html;
    } catch {
      /* ignore */
    }
  }

  // PDF Yousign : cache Cloudinary OU téléchargement API
  if (signedPdfUrl && /^https:\/\//i.test(signedPdfUrl)) {
    try {
      const r = await fetch(signedPdfUrl);
      if (r.ok) {
        pdfBase64 = Buffer.from(await r.arrayBuffer()).toString("base64");
      }
    } catch {
      /* retry yousign */
    }
  }

  if (!pdfBase64 && rideOpt.yousignSignatureRequestId) {
    try {
      const buf = await downloadSignedDocumentPdf(
        String(rideOpt.yousignSignatureRequestId),
        rideOpt.yousignDocumentId || null
      );
      pdfBase64 = buf.toString("base64");
      try {
        const url = await persistContractPdf(buf, order.id);
        if (url) {
          signedPdfUrl = url;
          rideOpt.yousignSignedPdfUrl = url;
          cachePatch.yousignSignedPdfUrl = url;
        }
      } catch {
        /* ignore cache fail */
      }
    } catch (e: any) {
      error = e?.message || "PDF Yousign indisponible";
      console.warn("[CONTRACT] Yousign PDF:", error);
    }
  }

  // Persister uniquement les clés régénérées (sans jamais écraser payzenStatus écrit en parallèle)
  if (Object.keys(cachePatch).length > 0) {
    try {
      await db
        .update(orders)
        .set({
          rideOption: sql`coalesce(${orders.rideOption}, '{}'::jsonb) || ${JSON.stringify(cachePatch)}::jsonb`,
        } as any)
        .where(eq(orders.id, order.id));
    } catch {
      /* ignore */
    }
  }

  return {
    html: html!,
    contractUrl,
    signedPdfUrl,
    signed,
    signedVia:
      rideOpt.signedVia ||
      (viaYousign ? "yousign" : rideOpt.clientSignatureSvg ? "canvas" : null),
    pdfBase64,
    clientSignatureAudit: rideOpt.clientSignatureAudit || null,
    loueurSigned: !!rideOpt.loueurSignatureSvg,
    error,
  };
}
