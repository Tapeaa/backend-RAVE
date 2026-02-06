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

      // === EN-TÊTE ===
      // "Tape'a" en gros
      doc.fontSize(36)
        .fillColor('#F5C400') // Couleur jaune TAPEA
        .font('Helvetica-Bold')
        .text('Tape\'a', 50, 50, { align: 'center' });
      
      // "numéro tahiti! F11193" en petit en dessous
      doc.fontSize(14)
        .fillColor('#666666')
        .font('Helvetica')
        .text('numéro tahiti! F11193', 50, 95, { align: 'center' });
      
      doc.fontSize(12)
        .fillColor('#666666')
        .font('Helvetica')
        .text('Reçu de paiement', 50, 115, { align: 'center' });

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

      // === INFORMATIONS DE LA COMMANDE ===
      const orderY = startY + 70;
      doc.fontSize(11)
        .fillColor('#666666')
        .font('Helvetica-Bold')
        .text('Détails de la course:', 50, orderY);
      
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

      // === MONTANT CENTRÉ AU MILIEU DE LA PAGE ===
      // Définir footerY avant de l'utiliser
      const footerY = 750;
      
      // Calculer la position verticale au milieu (entre le contenu et le footer)
      const pageHeight = 842; // Hauteur A4 en points
      const availableHeight = pageHeight - footerY - 50; // Espace disponible avant le footer
      const amountY = paymentCurrentY + (footerY - paymentCurrentY - 100) / 2; // Centré verticalement
      
      // Label "Montant total TTC" centré
      doc.fontSize(16)
        .fillColor('#666666')
        .font('Helvetica-Bold')
        .text('Montant total TTC:', 50, amountY, { align: 'center', width: 500 });
      
      // Montant en gros, centré
      doc.fontSize(32)
        .fillColor('#F5C400') // Jaune TAPEA pour le montant
        .font('Helvetica-Bold')
        .text(
          `${invoice.amount.toFixed(0)} ${invoice.currency || 'XPF'} TTC`,
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
          'Merci d\'avoir utilisé Tape\'a pour votre déplacement.',
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
