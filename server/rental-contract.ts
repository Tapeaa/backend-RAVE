/**
 * Snapshot HTML du contrat de location (stocké en base + Cloudinary).
 */
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
  const pricePerDay = rd.pricePerDay || 0;
  const days = rd.days || 0;
  const ref = order.id.substring(0, 8).toUpperCase();

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Contrat RAVE ${ref}</title>
<style>
body{font-family:-apple-system,Helvetica,Arial,sans-serif;padding:20px;color:#1a1a1a;font-size:14px;line-height:1.6;margin:0}
.header{text-align:center;margin-bottom:24px;border-bottom:2px solid #171717;padding-bottom:16px}
h3{font-size:15px;margin-top:20px;border-bottom:1px solid #E5E7EB;padding-bottom:4px}
.details-box{background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:12px;margin:10px 0}
table{width:100%;border-collapse:collapse}table td{padding:5px 0;font-size:13px}table td:first-child{color:#6B7280;width:45%}table td:last-child{font-weight:500;text-align:right}
.sig-section{margin-top:30px;border-top:2px solid #171717;padding-top:16px}
.sig-box{margin-bottom:20px;text-align:center}.sig-image img{max-width:100%;max-height:100px}
.footer{text-align:center;margin-top:30px;font-size:10px;color:#9CA3AF}
</style></head><body>
<div class="header"><h1>CONTRAT DE LOCATION</h1><h2>DE VÉHICULE</h2><div>En date du ${signedDate}</div><div>Réf. ${ref}</div></div>
<h3>Article 1 - Objet</h3><p>Mise à disposition d'un véhicule de location par le loueur au locataire, via la plateforme RAVE.</p>
<h3>Article 2 - Réservation</h3><div class="details-box"><table>
<tr><td>Véhicule</td><td>${rd.vehicleName || "N/A"}</td></tr>
<tr><td>Catégorie</td><td>${rd.vehicleCategory || "N/A"}</td></tr>
<tr><td>Prise en charge</td><td>${rd.startDate ? new Date(rd.startDate).toLocaleDateString("fr-FR") : "N/A"}</td></tr>
<tr><td>Retour</td><td>${rd.endDate ? new Date(rd.endDate).toLocaleDateString("fr-FR") : "N/A"}</td></tr>
<tr><td>Durée</td><td>${days} jour${days > 1 ? "s" : ""}</td></tr>
<tr><td>Tarif / jour</td><td>${Number(pricePerDay).toLocaleString("fr-FR")} XPF</td></tr>
<tr><td>Montant total</td><td>${Number(totalPrice).toLocaleString("fr-FR")} XPF</td></tr>
${rd.pickupAddress ? `<tr><td>Adresse</td><td>${rd.pickupAddress}</td></tr>` : ""}
</table></div>
<h3>Article 3 - Conditions</h3><p>Le locataire s'engage à : être titulaire d'un permis valide, utiliser le véhicule avec soin, le restituer dans l'état reçu, respecter le code de la route, ne pas sous-louer.</p>
<h3>Article 4 - Paiement</h3><p>Prix : ${Number(totalPrice).toLocaleString("fr-FR")} XPF pour ${days} jour${days > 1 ? "s" : ""}.</p>
<div class="sig-section">
<div class="sig-box"><div>Le locataire</div><div><strong>${sigName}</strong></div>
${signatureImg ? `<div class="sig-image"><img src="${signatureImg}" alt="Signature"/></div><div>✓ Signé le ${signedDate}${signedTime ? " à " + signedTime : ""}</div>` : "<div>Non signé</div>"}
</div>
<div class="sig-box"><div>Le loueur</div><div><strong>${loueurName}</strong></div>
${loueurSigImg ? `<div class="sig-image"><img src="${loueurSigImg}" alt="Signature loueur"/></div><div>✓ Signé</div>` : "<div>En attente</div>"}
</div>
</div>
<div class="footer">Document généré par RAVE • Snapshot permanent</div>
</body></html>`;
}
