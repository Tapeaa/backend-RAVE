/**
 * Snapshot HTML du contrat de location (stocké en base + Cloudinary).
 * Aligné sur le contrat signé côté app client.
 */
import {
  buildCustomRentalContractHtml,
  buildDefaultRentalContractHtml,
} from "@shared/rental-contract-html";

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

  const signatureHtml = `<div class="signature-box">
  <div class="sig-label">Le locataire</div>
  <div class="sig-name">${sigName}</div>
  ${
    signatureImg
      ? `<img class="sig-img" src="${signatureImg}" alt="Signature"/>
  <div class="sig-date">✓ Signé le ${signedDate}${signedTime ? " à " + signedTime : ""}</div>`
      : `<div class="sig-date">Non signé</div>`
  }
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
    pricePerDayLabel: `${Number(pricePerDay).toLocaleString("fr-FR")} XPF`,
    totalLabel: `${Number(totalPrice).toLocaleString("fr-FR")} XPF`,
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
