/**
 * Envoi d'emails via Resend
 * Variables d'environnement : RESEND_API_KEY, RESEND_FROM_EMAIL, ADMIN_SUPPORT_EMAIL
 */

import { Resend } from "resend";

const RESEND_API_KEY = process.env.RESEND_API_KEY || process.env.MESSAGERIE_SUPPORT || process.env.Messagerie_Support;
const rawFrom = process.env.RESEND_FROM_EMAIL || "TAPEA Support <onboarding@resend.dev>";
const RESEND_FROM = rawFrom.includes("<") ? rawFrom : `TAPEA Support <${rawFrom}>`;
const ADMIN_EMAIL = process.env.ADMIN_SUPPORT_EMAIL || process.env.ADMIN_EMAIL || "Tapea.pf@gmail.com";

let resend: Resend | null = null;
if (RESEND_API_KEY) {
  resend = new Resend(RESEND_API_KEY);
  console.log("[Email] Resend configuré:", { from: RESEND_FROM, to: ADMIN_EMAIL });
} else {
  console.log("[Email] Resend NON configuré (clé API manquante)");
}

export function isEmailConfigured(): boolean {
  return !!resend && !!RESEND_API_KEY;
}

/**
 * Envoie un email au admin quand un client ou chauffeur envoie un message au support
 */
export async function sendSupportMessageNotification(params: {
  senderType: "client" | "driver";
  senderName: string;
  content: string;
}): Promise<{ success: boolean; error?: string }> {
  if (!resend) {
    console.log("[Email] Resend non configuré (RESEND_API_KEY manquant), notification ignorée");
    return { success: false, error: "Email non configuré" };
  }

  const { senderType, senderName, content } = params;
  console.log("[Email] Envoi notification support:", { senderType, senderName, contentLength: content.length });
  const typeLabel = senderType === "client" ? "Client" : "Chauffeur";
  const subject = `[TAPEA Support] Nouveau message de ${senderName} (${typeLabel})`;
  const preview = content.length > 200 ? content.substring(0, 200) + "..." : content;
  const html = `
    <div style="font-family: sans-serif; max-width: 600px;">
      <h2>Nouveau message support</h2>
      <p><strong>De :</strong> ${senderName} (${typeLabel})</p>
      <p><strong>Date :</strong> ${new Date().toLocaleString("fr-FR")}</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 16px 0;" />
      <p style="white-space: pre-wrap;">${String(preview).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")}</p>
      <p style="margin-top: 24px; font-size: 12px; color: #666;">
        Consultez le dashboard admin pour répondre.
      </p>
    </div>
  `;

  try {
    const { data, error } = await resend.emails.send({
      from: RESEND_FROM,
      to: [ADMIN_EMAIL],
      subject,
      html,
    });
    if (error) {
      console.error("[Email] Erreur Resend:", error);
      return { success: false, error: error.message };
    }
    console.log("[Email] Notification support envoyée:", data?.id);
    return { success: true };
  } catch (err) {
    console.error("[Email] Erreur envoi:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Erreur inconnue",
    };
  }
}
