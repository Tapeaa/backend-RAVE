/**
 * Affiche le statut des signatures contrat (canvas / Yousign) pour admin & prestataire.
 * Permet de télécharger le PDF Yousign natif ou un PDF généré depuis le HTML signé.
 */

import { useState } from "react";
import html2pdf from "html2pdf.js";

function hasClientSigned(ro: Record<string, unknown> | null | undefined): boolean {
  if (!ro) return false;
  return !!(
    ro.clientSignatureSvg ||
    ro.clientSignedAt ||
    ro.yousignSignatureRequestId ||
    ro.signedVia === "yousign"
  );
}

function hasLoueurSigned(ro: Record<string, unknown> | null | undefined): boolean {
  if (!ro) return false;
  return !!(ro.loueurSignatureSvg || ro.loueurSignedAt);
}

function formatWhen(iso: unknown): string | null {
  if (!iso || typeof iso !== "string") return null;
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function downloadBase64Pdf(base64: string, filename: string) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function downloadHtmlAsPdf(html: string, filename: string) {
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-9999px";
  container.style.top = "0";
  container.style.width = "800px";
  container.style.background = "#fff";
  container.innerHTML = html;
  document.body.appendChild(container);
  try {
    await html2pdf()
      .set({
        margin: 10,
        filename,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      })
      .from(container)
      .save();
  } finally {
    container.remove();
  }
}

export function isClientContractSigned(rideOption: any): boolean {
  return hasClientSigned(rideOption);
}

export function RentalContractSignatures({
  rideOption,
  compact = false,
  orderId,
  auth = "admin",
}: {
  rideOption: any;
  compact?: boolean;
  /** Si fourni, affiche le bouton télécharger contrat signé */
  orderId?: string;
  auth?: "admin" | "prestataire";
}) {
  const [downloading, setDownloading] = useState(false);
  const ro = (rideOption || {}) as Record<string, unknown>;
  const clientOk = hasClientSigned(ro);
  const loueurOk = hasLoueurSigned(ro);
  const viaYousign = ro.signedVia === "yousign" || !!ro.yousignSignatureRequestId;
  const clientSvg = typeof ro.clientSignatureSvg === "string" ? ro.clientSignatureSvg : null;
  const loueurSvg = typeof ro.loueurSignatureSvg === "string" ? ro.loueurSignatureSvg : null;
  const contractUrl = typeof ro.contractUrl === "string" ? ro.contractUrl : null;
  const htmlSnapshot =
    typeof ro.contractHtmlSnapshot === "string" ? ro.contractHtmlSnapshot : null;
  const clientName =
    typeof ro.clientSignatureName === "string" ? ro.clientSignatureName : null;
  const clientAt = formatWhen(ro.clientSignedAt);
  const loueurAt = formatWhen(ro.loueurSignedAt);
  const ysId =
    typeof ro.yousignSignatureRequestId === "string"
      ? ro.yousignSignatureRequestId
      : null;

  const handleDownload = async () => {
    if (!orderId) return;
    setDownloading(true);
    try {
      const token = localStorage.getItem("admin_token");
      const path =
        auth === "prestataire"
          ? `/api/prestataire/courses/${orderId}/contract`
          : `/api/admin/commandes/${orderId}/contract`;
      const res = await fetch(path, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Téléchargement impossible");
      }
      const data = (await res.json()) as {
        html?: string;
        pdfBase64?: string | null;
        contractUrl?: string | null;
      };
      const filename = `contrat-rave-${orderId.slice(0, 8)}.pdf`;

      if (data.pdfBase64) {
        downloadBase64Pdf(data.pdfBase64, filename);
        return;
      }
      if (data.html) {
        await downloadHtmlAsPdf(data.html, filename);
        return;
      }
      if (data.contractUrl) {
        window.open(data.contractUrl, "_blank", "noopener,noreferrer");
        return;
      }
      throw new Error("Contrat indisponible");
    } catch (e: any) {
      alert(e?.message || "Erreur téléchargement contrat");
    } finally {
      setDownloading(false);
    }
  };

  if (compact) {
    return (
      <span className="inline-flex flex-wrap items-center gap-2 text-sm">
        {clientOk ? (
          <span className="text-green-700 font-medium">
            Signature client OK{viaYousign ? " (Yousign)" : ""}
          </span>
        ) : (
          <span className="text-slate-500">Signature client manquante</span>
        )}
        {loueurOk ? (
          <span className="text-green-700 font-medium">Signature loueur OK</span>
        ) : null}
      </span>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-slate-900 flex items-center gap-2">
          Contrat &amp; signatures
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          {viaYousign && (
            <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
              Yousign
            </span>
          )}
          {orderId && (
            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {downloading ? "Téléchargement…" : "Télécharger le contrat PDF"}
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-3 space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Client
          </p>
          {clientOk ? (
            <>
              <p className="text-sm font-semibold text-green-700">Signé</p>
              {clientName && (
                <p className="text-sm text-slate-700">Nom : {clientName}</p>
              )}
              {clientAt && (
                <p className="text-xs text-slate-500">Le {clientAt}</p>
              )}
              {viaYousign && (
                <p className="text-xs text-indigo-600">
                  Signature électronique Yousign
                  {ysId ? (
                    <span className="block font-mono text-[10px] text-slate-400 mt-0.5 truncate" title={ysId}>
                      {ysId}
                    </span>
                  ) : null}
                </p>
              )}
              {clientSvg && (
                <div className="mt-2 rounded border border-slate-200 bg-white p-2">
                  <img
                    src={clientSvg}
                    alt="Signature client"
                    className="max-h-24 w-full object-contain"
                  />
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-slate-500">Non signé</p>
          )}
        </div>

        <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-3 space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Loueur
          </p>
          {loueurOk ? (
            <>
              <p className="text-sm font-semibold text-green-700">Signé</p>
              {loueurAt && (
                <p className="text-xs text-slate-500">Le {loueurAt}</p>
              )}
              {loueurSvg && (
                <div className="mt-2 rounded border border-slate-200 bg-white p-2">
                  <img
                    src={loueurSvg}
                    alt="Signature loueur"
                    className="max-h-24 w-full object-contain"
                  />
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-slate-500">Pas encore signé / non requis</p>
          )}
        </div>
      </div>

      {(contractUrl || htmlSnapshot) && (
        <div className="space-y-2 border-t border-slate-100 pt-3">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Document
          </p>
          {contractUrl && (
            <a
              href={contractUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex text-sm font-medium text-indigo-600 hover:underline"
            >
              Ouvrir le contrat enregistré
            </a>
          )}
          {htmlSnapshot && (
            <details className="rounded-lg border border-slate-200 bg-slate-50">
              <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-slate-700">
                Aperçu HTML du contrat
              </summary>
              <iframe
                title="Aperçu contrat"
                srcDoc={htmlSnapshot}
                className="mt-1 h-80 w-full rounded-b-lg border-0 bg-white"
                sandbox=""
              />
            </details>
          )}
        </div>
      )}
    </div>
  );
}
