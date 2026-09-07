/**
 * Snapshot HTML du contrat de location (stocké en base + Cloudinary).
 * Aligné sur le contrat signé côté app client.
 */
import {
  buildCustomRentalContractHtml,
  buildDefaultRentalContractHtml,
} from "@shared/rental-contract-html";
import { persistContractHtml, persistContractPdf } from "./persist-media";
import { downloadSignedDocumentPdf } from "./yousign";
import { db } from "./db";
import { orders } from "@shared/schema";
import { eq } from "drizzle-orm";

export function isClientContractSigned(rideOpt: any): boolean {
  if (!rideOpt) return false;
  return !!(
    rideOpt.clientSignatureSvg ||
    rideOpt.clientSignedAt ||
    rideOpt.yousignSignatureRequestId ||
    rideOpt.signedVia === "yousign"
  );
}

export function buildRentalContractHtml(order: {
  id: string;
  clientName?: string | null;
  totalPrice?: number | null;
  driverName?: string | null;
  rideOption?: any;
}): string {
  const rideOpt = order.rideOption || {};
  const rd = rideOpt.rentalData || {
    vehicleName: rideOpt.title || "Véhicule",
    vehicleCategory: rideOpt.categoryLabel || rideOpt.category || "",
    days: rideOpt.days || 0,
    pricePerDay: (rideOpt.price || 0) / Math.max(1, rideOpt.days || 1),
    startDate: rideOpt.startDate,
    endDate: rideOpt.endDate,
    pickupAddress: rideOpt.pickupLocation,
  };
  const clientName = order.clientName || "Client";
  const loueurName = order.driverName || rideOpt.owner || "Loueur";
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
  const pricePerDay = rd.pricePerDay || rideOpt.price || 0;
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

  let priceRowsHtml: string | undefined;
  if (hasTvaSplit) {
    priceRowsHtml = [
      `<tr><td>Montant HT</td><td class="r">${Math.round(priceHt).toLocaleString("fr-FR")} XPF</td></tr>`,
      `<tr><td>TVA (${tvaRate} %${tvaMode === "extra" ? ", en sus" : ", incluse"})</td><td class="r">${Math.round(priceTva).toLocaleString("fr-FR")} XPF</td></tr>`,
      `<tr><td>Total TTC</td><td class="r">${Number(totalPrice).toLocaleString("fr-FR")} XPF</td></tr>`,
    ].join("");
  }

  const clientSigBlock = !clientSigned
    ? `<div class="sig-date">Non signé</div>`
    : signatureImg
      ? `<img class="sig-img" src="${signatureImg}" alt="Signature"/>
  <div class="sig-date">✓ Signé le ${signedDate}${signedTime ? " à " + signedTime : ""}</div>`
      : `<div style="margin-top:8px;padding:14px;border:2px solid #22c55e;border-radius:8px;background:#f0fdf4;text-align:center">
  <div style="font-size:28px;font-family:Georgia,serif;font-style:italic;color:#166534">${String(sigName).replace(/</g, "")}</div>
  <div class="sig-date" style="color:#166534;margin-top:6px">✓ Signé électroniquement${viaYousign ? " via Yousign" : ""} le ${signedDate}${signedTime ? " à " + signedTime : ""}</div>
</div>`;

  const signatureHtml = `<div class="signature-box">
  <div class="sig-label">Le locataire</div>
  <div class="sig-name">${sigName}</div>
  ${clientSigBlock}
</div>
<div class="signature-box">
  <div class="sig-label">Le loueur</div>
  <div class="sig-name">${loueurName}</div>
  ${
    loueurSigImg
      ? `<img class="sig-img" src="${loueurSigImg}" alt="Signature loueur"/>
  <div class="sig-date">✓ Signé</div>`
      : `<div class="sig-date">En attente</div>`
  }
</div>`;

  const params = {
    ref,
    contractDate: signedDate,
    loueurName,
    loueurNumeroTahiti: rideOpt.ownerNumeroTahiti || rideOpt.numeroTahiti || null,
    clientName,
    vehicleName: String(rd.vehicleName || rideOpt.title || "Véhicule"),
    vehicleMeta: String(rd.vehicleCategory || rideOpt.categoryLabel || ""),
    startLabel,
    endLabel,
    days: Number(days) || 0,
    pickupLocation: String(rd.pickupAddress || rideOpt.pickupLocation || ""),
    pricePerDayLabel: `${Number(pricePerDay).toLocaleString("fr-FR")} XPF${
      tvaRegime === "assujetti"
        ? tvaMode === "extra"
          ? " (base HT + TVA)"
          : " TTC"
        : ""
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

export type ResolvedContract = {
  html: string;
  contractUrl: string | null;
  signedPdfUrl: string | null;
  signed: boolean;
  signedVia: string | null;
  /** PDF Yousign natif (base64) si disponible */
  pdfBase64: string | null;
  error?: string | null;
};

/** HTML snapshot + PDF Yousign (téléchargé / mis en cache) */
export async function resolveOrderContract(order: {
  id: string;
  clientName?: string | null;
  totalPrice?: number | null;
  driverName?: string | null;
  rideOption?: any;
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

  const snapshotStaleYousign =
    !!html &&
    viaYousign &&
    !rideOpt.clientSignatureSvg &&
    /Non signé/i.test(html);

  if (!html || snapshotStaleYousign) {
    html = buildRentalContractHtml({ ...order, rideOption: rideOpt });
    try {
      const url = await persistContractHtml(html, order.id);
      if (url) contractUrl = url;
      rideOpt.contractHtmlSnapshot = html;
      if (url) rideOpt.contractUrl = url;
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
        }
      } catch {
        /* ignore cache fail */
      }
    } catch (e: any) {
      error = e?.message || "PDF Yousign indisponible";
      console.warn("[CONTRACT] Yousign PDF:", error);
    }
  }

  // Persister cache éventuel
  if (rideOpt.yousignSignedPdfUrl || rideOpt.contractHtmlSnapshot) {
    try {
      await db
        .update(orders)
        .set({ rideOption: rideOpt as any })
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
    error,
  };
}
