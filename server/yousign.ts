/**
 * Client API Yousign v3 (signature électronique SES).
 * Clé : YOUSIGN_API_KEY (jamais en dur dans le repo).
 *
 * Sandbox : YOUSIGN_SANDBOX=true  → https://api-sandbox.yousign.app/v3
 * Prod    : YOUSIGN_SANDBOX=false → https://api.yousign.app/v3
 */

function yousignConfig() {
  const apiKey = (process.env.YOUSIGN_API_KEY || "").trim();
  const sandboxExplicit = process.env.YOUSIGN_SANDBOX;
  const isSandbox =
    sandboxExplicit === "true" ||
    process.env.YOUSIGN_ENV === "sandbox" ||
    (sandboxExplicit !== "false" && process.env.YOUSIGN_ENV !== "production");
  const baseUrl = (
    process.env.YOUSIGN_BASE_URL ||
    (isSandbox ? "https://api-sandbox.yousign.app/v3" : "https://api.yousign.app/v3")
  ).replace(/\/$/, "");
  return { apiKey, isSandbox, baseUrl };
}

export function isYousignConfigured(): boolean {
  return !!yousignConfig().apiKey;
}

export function getYousignPublicConfig() {
  const { isSandbox, baseUrl } = yousignConfig();
  return { isSandbox, baseUrl, configured: isYousignConfigured() };
}

async function ysFetch(path: string, init: RequestInit = {}) {
  const { apiKey, baseUrl } = yousignConfig();
  if (!apiKey) {
    throw new Error("YOUSIGN_API_KEY manquante sur le serveur");
  }
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${apiKey}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg =
      data?.detail ||
      data?.title ||
      data?.message ||
      data?.error ||
      (typeof data === "string" ? data : `Yousign HTTP ${res.status}`);
    const err = new Error(String(msg));
    (err as any).status = res.status;
    (err as any).body = data;
    throw err;
  }
  return data;
}

export type PrepareYousignInput = {
  pdfBase64: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  /** Titre de la demande */
  name?: string;
  locale?: string;
};

export type PrepareYousignResult = {
  signatureRequestId: string;
  documentId: string;
  signerId: string;
  signatureLink: string;
  isSandbox: boolean;
  status: string;
};

function normalizePhone(phone?: string): string | undefined {
  if (!phone) return undefined;
  const digits = phone.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("689")) return `+${digits}`;
  if (digits.length >= 6) return `+689${digits}`;
  return undefined;
}

/**
 * Crée une Signature Request, upload le PDF, ajoute le signataire, active, retourne le lien.
 * delivery_mode=none → signature embarquée (WebView), sans e-mail Yousign obligatoire.
 */
export async function prepareEmbeddedSignature(
  input: PrepareYousignInput
): Promise<PrepareYousignResult> {
  const { isSandbox } = yousignConfig();
  const firstName = String(input.firstName || "").trim();
  const lastName = String(input.lastName || "").trim();
  const email = String(input.email || "").trim().toLowerCase();
  if (!firstName || !lastName) throw new Error("Prénom et nom requis pour Yousign");
  if (!email || !email.includes("@")) throw new Error("E-mail valide requis pour Yousign");

  const pdfBuf = Buffer.from(
    String(input.pdfBase64 || "").replace(/^data:application\/pdf;base64,/, ""),
    "base64"
  );
  if (pdfBuf.length < 100) throw new Error("PDF contrat invalide ou vide");

  const sr = await ysFetch("/signature_requests", {
    method: "POST",
    body: JSON.stringify({
      name: input.name || `Contrat location RAVE — ${firstName} ${lastName}`,
      delivery_mode: "none",
      timezone: "Pacific/Tahiti",
    }),
  });
  const signatureRequestId = sr.id as string;

  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(pdfBuf)], { type: "application/pdf" }),
    `contrat-rave-${Date.now()}.pdf`
  );
  form.append("nature", "signable_document");

  const doc = await ysFetch(`/signature_requests/${signatureRequestId}/documents`, {
    method: "POST",
    body: form,
  });
  const documentId = doc.id as string;
  const totalPages = Math.max(1, Number(doc.total_pages) || 1);

  const phone = normalizePhone(input.phone);
  const signerPayload: any = {
    info: {
      first_name: firstName,
      last_name: lastName,
      email,
      locale: input.locale || "fr",
      ...(phone ? { phone_number: phone } : {}),
    },
    signature_level: "electronic_signature",
    // otp_email : validation e-mail Yousign (SES). Plus fiable que SMS Polynésie.
    signature_authentication_mode: "otp_email",
    fields: [
      {
        document_id: documentId,
        type: "signature",
        page: totalPages,
        width: 200,
        height: 70,
        // Origine bas-gauche (Yousign)
        x: 50,
        y: 60,
      },
    ],
  };

  const signer = await ysFetch(`/signature_requests/${signatureRequestId}/signers`, {
    method: "POST",
    body: JSON.stringify(signerPayload),
  });
  const signerId = signer.id as string;

  const activated = await ysFetch(`/signature_requests/${signatureRequestId}/activate`, {
    method: "POST",
  });

  const activatedSigner =
    (activated?.signers || []).find((s: any) => s.id === signerId) ||
    (activated?.signers || [])[0] ||
    signer;

  let link =
    typeof activatedSigner?.signature_link === "string" ? activatedSigner.signature_link : "";
  if (!link) {
    const refreshed = await ysFetch(
      `/signature_requests/${signatureRequestId}/signers/${signerId}`
    );
    link = typeof refreshed?.signature_link === "string" ? refreshed.signature_link : "";
  }
  if (!link) {
    throw new Error("Yousign n’a pas renvoyé de lien de signature");
  }

  return {
    signatureRequestId,
    documentId,
    signerId,
    signatureLink: link,
    isSandbox,
    status: activated?.status || "ongoing",
  };
}

export async function getSignatureRequestStatus(signatureRequestId: string) {
  const data = await ysFetch(`/signature_requests/${encodeURIComponent(signatureRequestId)}`);
  return {
    id: data.id as string,
    status: data.status as string,
    signers: (data.signers || []).map((s: any) => ({
      id: s.id,
      status: s.status,
    })),
  };
}

/** Télécharge le PDF signé (quand status=done) */
export async function downloadSignedDocumentPdf(
  signatureRequestId: string,
  documentId: string
): Promise<Buffer> {
  const { apiKey, baseUrl } = yousignConfig();
  if (!apiKey) throw new Error("YOUSIGN_API_KEY manquante");
  const res = await fetch(
    `${baseUrl}/signature_requests/${encodeURIComponent(signatureRequestId)}/documents/${encodeURIComponent(documentId)}/download`,
    { headers: { Authorization: `Bearer ${apiKey}` } }
  );
  if (!res.ok) {
    throw new Error(`Téléchargement PDF Yousign échoué (${res.status})`);
  }
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}
