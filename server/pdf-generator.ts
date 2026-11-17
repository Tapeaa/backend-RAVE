import PDFDocument from 'pdfkit';
import type { Order, Client, Invoice } from '@shared/schema';

/**
 * Génère un PDF de reçu/facture pour une course
 */
export async function generateInvoicePDF(
  order: Order,
  client: Client,
  invoice: Invoice
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 50, right: 50 },
      });

      const buffers: Buffer[] = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(buffers);
        resolve(pdfBuffer);
      });
      doc.on('error', reject);

      const rideOpt = (order as any).rideOption || {};
      const isRental =
        rideOpt.type === 'rental' || rideOpt.isRentalOrder === true || (order as any).orderSource === 'rental';
      const tvaRegime = rideOpt.tvaRegime === 'assujetti' ? 'assujetti' : 'franchise';
      const tvaRate = Number(rideOpt.tvaRate) || 16;
      const tvaMode = rideOpt.tvaMode === 'extra' ? 'extra' : 'included';
      const priceHt = Number(rideOpt.priceHt);
      const priceTva = Number(rideOpt.priceTva);
      // invoice.amount est figé à la création de la facture : pour une location, la commande fait foi
      const totalAmount = isRental
        ? Number(order.totalPrice) || Number(rideOpt.priceTtc) || Number(invoice.amount) || 0
        : Number(invoice.amount) || Number(order.totalPrice) || 0;
      const showTva = isRental && tvaRegime === 'assujetti' && Number.isFinite(priceHt) && Number.isFinite(priceTva);
      const fmt = (n: number) => `${Math.round(Number(n) || 0).toLocaleString('fr-FR')} XPF`;

      // === EN-TÊTE ===
      doc.fontSize(36)
        .fillColor('#1a1a1a')
        .font('Helvetica-Bold')
        .text('RAVE', 50, 50, { align: 'center' });
      
      doc.fontSize(12)
        .fillColor('#666666')
        .font('Helvetica')
        .text("EI Tape'a · N° Tahiti F11193", 50, 95, { align: 'center' });
      
      doc.fontSize(12)
        .fillColor('#666666')
        .font('Helvetica')
        .text(isRental ? 'Facture de location' : 'Reçu de paiement', 50, 115, { align: 'center' });

      // Ligne de séparation avec couleur TAPEA
      doc.moveTo(50, 135)
        .lineTo(550, 135)
        .strokeColor('#F5C400')
        .lineWidth(2)
        .stroke();

      // === INFORMATIONS DU CLIENT ===
      const startY = 155;
      doc.fontSize(11)
        .fillColor('#666666')
        .font('Helvetica-Bold')
        .text('Client:', 50, startY);
      
      doc.fontSize(11)
        .fillColor('#000000')
        .font('Helvetica')
        .text(`${client.firstName} ${client.lastName}`, 50, startY + 18);
      
      if (client.phone) {
        doc.fontSize(10)
          .fillColor('#666666')
          .text(`Téléphone: ${client.phone}`, 50, startY + 35);
      }

      if (isRental && rideOpt.owner) {
        doc.fontSize(11)
          .fillColor('#666666')
          .font('Helvetica-Bold')
          .text('Loueur:', 300, startY, { width: 250, align: 'right' });
        doc.fontSize(11)
          .fillColor('#000000')
          .font('Helvetica')
          .text(String(rideOpt.owner), 300, startY + 18, { width: 250, align: 'right' });
        if (rideOpt.ownerNumeroTahiti) {
          doc.fontSize(10)
            .fillColor('#666666')
            .text(`N° Tahiti : ${rideOpt.ownerNumeroTahiti}`, 300, startY + 35, { width: 250, align: 'right' });
        }
      }

      // === INFORMATIONS DE LA COMMANDE ===
      const orderY = startY + 70;
      doc.fontSize(11)
        .fillColor('#666666')
        .font('Helvetica-Bold')
        .text(isRental ? 'Détails de la location:' : 'Détails de la course:', 50, orderY);
      
      doc.fontSize(10)
        .fillColor('#333333')
        .font('Helvetica');

      const formatDate = (dateString: string | null | undefined): string => {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return date.toLocaleDateString('fr-FR', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
      };

      let currentY = orderY + 20;

      // Utiliser addresses (tableau JSON) pour les adresses
      if (order.addresses && Array.isArray(order.addresses) && order.addresses.length > 0) {
        const pickupAddress = order.addresses.find((addr: any) => addr.type === 'pickup') || order.addresses[0];
        if (pickupAddress && pickupAddress.value) {
          doc.text(`Départ: ${pickupAddress.value}`, 50, currentY);
          currentY += 15;
        }
      }

      const dropoffAddress = order.addresses?.find((addr: any) => addr.type === 'destination');
      if (dropoffAddress && dropoffAddress.value) {
        doc.text(`Destination: ${dropoffAddress.value}`, 50, currentY);
        currentY += 15;
      }

      if (order.createdAt) {
        doc.text(`Date: ${formatDate(order.createdAt)}`, 50, currentY);
        currentY += 15;
      }

      if (order.status) {
        const statusLabels: Record<string, string> = {
          'completed': 'Terminée',
          'payment_confirmed': 'Paiement confirmé',
          'cancelled': 'Annulée',
        };
        doc.text(`Statut: ${statusLabels[order.status] || order.status}`, 50, currentY);
        currentY += 15;
      }

      // === INFORMATIONS DE PAIEMENT ===
      const paymentY = currentY + 30;
      doc.fontSize(11)
        .fillColor('#666666')
        .font('Helvetica-Bold')
        .text('Paiement:', 50, paymentY);
      
      doc.fontSize(10)
        .fillColor('#333333')
        .font('Helvetica');

      let paymentCurrentY = paymentY + 20;

      if (invoice.paidAt) {
        doc.text(`Date de paiement: ${formatDate(invoice.paidAt)}`, 50, paymentCurrentY);
        paymentCurrentY += 15;
      }

      // Numéro de facture
      doc.text(`Numéro de facture: ${invoice.id}`, 50, paymentCurrentY);
      paymentCurrentY += 15;

      if (invoice.stripePaymentIntentId) {
        doc.text(`Transaction ID: ${invoice.stripePaymentIntentId}`, 50, paymentCurrentY);
        paymentCurrentY += 15;
      }

      const footerY = 750;

      if (isRental) {
        const days = Math.max(1, Number(rideOpt.days) || 1);
        const lines: { label: string; amount: number }[] = [];
        const breakdown: any[] = Array.isArray(rideOpt.pricingBreakdown) ? rideOpt.pricingBreakdown : [];
        const vehicle = String(rideOpt.title || rideOpt.label || 'Location véhicule');
        if (breakdown.length > 1) {
          for (const l of breakdown) {
            lines.push({
              label: `${vehicle} — jours ${l.fromDay}-${l.toDay} (${l.days} j × ${fmt(l.pricePerDay)})`,
              amount: Number(l.subtotal) || 0,
            });
          }
        } else {
          const unit = Number(breakdown[0]?.pricePerDay) || Number(rideOpt.price) || 0;
          lines.push({
            label: `${vehicle} (${days} j × ${fmt(unit)})`,
            amount: Number(rideOpt.pricingSubtotal) || unit * days,
          });
        }
        const supplements: any[] = Array.isArray((order as any).supplements) ? (order as any).supplements : [];
        for (const s of supplements) {
          const qty = Number(s.quantity ?? s.days ?? days) || days;
          const unit = Number(s.price ?? s.pricePerDay ?? s.unitPrice ?? 0);
          lines.push({
            label: `${s.name || s.label || 'Supplément'} (${qty} j × ${fmt(unit)})`,
            amount: Number(s.total) || unit * qty,
          });
        }

        let y = paymentCurrentY + 20;
        doc.fontSize(11).fillColor('#666666').font('Helvetica-Bold').text('Détail:', 50, y);
        y += 20;
        doc.fontSize(10).fillColor('#333333').font('Helvetica');
        for (const line of lines) {
          doc.text(line.label, 50, y, { width: 360 });
          doc.text(fmt(line.amount), 410, y, { width: 140, align: 'right' });
          y += Math.max(15, doc.heightOfString(line.label, { width: 360 }) + 3);
        }
        paymentCurrentY = y;
      }

      const amountY = Math.min(
        footerY - 90,
        Math.max(paymentCurrentY + 70, paymentCurrentY + (footerY - paymentCurrentY - 100) / 2)
      );
      
      if (showTva) {
        doc.fontSize(11)
          .fillColor('#333333')
          .font('Helvetica')
          .text(`Total HT : ${Math.round(priceHt).toLocaleString('fr-FR')} XPF`, 50, amountY - 36, { align: 'center', width: 500 });
        doc.text(
          `TVA ${tvaRate} % ${tvaMode === 'extra' ? 'en sus' : 'incluse'} : ${Math.round(priceTva).toLocaleString('fr-FR')} XPF`,
          50,
          amountY - 20,
          { align: 'center', width: 500 }
        );
      } else if (isRental) {
        doc.fontSize(10)
          .fillColor('#666666')
          .font('Helvetica')
          .text('TVA non applicable (franchise) — code des impôts de la Polynésie française', 50, amountY - 20, { align: 'center', width: 500 });
      }

      doc.fontSize(16)
        .fillColor('#666666')
        .font('Helvetica-Bold')
        .text(showTva ? 'Montant total TTC :' : 'Montant total :', 50, amountY, { align: 'center', width: 500 });
      
      doc.fontSize(32)
        .fillColor('#1a1a1a')
        .font('Helvetica-Bold')
        .text(
          `${Math.round(totalAmount).toLocaleString('fr-FR')} ${invoice.currency || 'XPF'}${showTva ? ' TTC' : ''}`,
          50,
          amountY + 30,
          { align: 'center', width: 500 }
        );

      // Ligne de séparation au-dessus du montant
      doc.moveTo(150, amountY - 10)
        .lineTo(450, amountY - 10)
        .strokeColor('#F5C400')
        .lineWidth(2)
        .stroke();

      // === PIED DE PAGE ===
      // footerY déjà défini plus haut
      doc.fontSize(10)
        .fillColor('#333333')
        .font('Helvetica')
        .text(
          isRental
            ? "Merci d'avoir utilisé RAVE. Le contrat de location est conclu entre le locataire et le loueur."
            : "Merci d'avoir utilisé RAVE.",
          50,
          footerY,
          { align: 'center', width: 500 }
        );

      // Finaliser le PDF
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
