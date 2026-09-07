/**
 * Affiche signatures + téléchargement PDF (Yousign natif ou HTML→PDF).
 */

import { useState, useEffect } from "react";
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

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function downloadBase64Pdf(base64: string, filename: string) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  triggerBlobDownload(new Blob([bytes], { type: "application/pdf" }), filename);
}

/** html2pdf échoue souvent sur un document HTML complet → iframe + body */
async function downloadHtmlAsPdf(html: string, filename: string) {
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;left:-10000px;top:0;width:800px;height:1100px;border:0;";
  document.body.appendChild(iframe);
  try {
    await new Promise<void>((resolve, reject) => {
      iframe.onload = () => resolve();
      iframe.onerror = () => reject(new Error("iframe load failed"));
      iframe.srcdoc = html;
      // fallback si onload ne fire pas
      setTimeout(() => resolve(), 800);
    });
    const doc = iframe.contentDocument;
    const target = doc?.body || doc?.documentElement;
    if (!target) throw new Error("Impossible de préparer le PDF");
    await html2pdf()
      .set({
        margin: [10, 10, 10, 10],
        filename,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["avoid-all", "css", "legacy"] },
      })
      .from(target)
      .save();
  } finally {
    iframe.remove();
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
  orderId?: string;
  auth?: "admin" | "prestataire";
}) {
  const [downloading, setDownloading] = useState(false);
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const ro = (rideOption || {}) as Record<string, unknown>;
  const clientOk = hasClientSigned(ro);
  const loueurOk = hasLoueurSigned(ro);
  const viaYousign = ro.signedVia === "yousign" || !!ro.yousignSignatureRequestId;
  const clientSvg = typeof ro.clientSignatureSvg === "string" ? ro.clientSignatureSvg : null;
  const loueurSvg = typeof ro.loueurSignatureSvg === "string" ? ro.loueurSignatureSvg : null;
  const contractUrl = typeof ro.contractUrl === "string" ? ro.contractUrl : null;
  const signedPdfUrl =
    typeof ro.yousignSignedPdfUrl === "string" ? ro.yousignSignedPdfUrl : null;
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

  async function fetchContract() {
    if (!orderId) throw new Error("Commande introuvable");
    const token = localStorage.getItem("admin_token");
    const path =
      auth === "prestataire"
        ? `/api/prestataire/courses/${orderId}/contract`
        : `/api/admin/commandes/${orderId}/contract`;
    const res = await fetch(path, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
    return data as {
      html?: string;
      pdfBase64?: string | null;
      signedPdfUrl?: string | null;
      contractUrl?: string | null;
      error?: string | null;
    };
  }

  // Charge automatiquement le PDF signé pour afficher la signature
  useEffect(() => {
    if (!orderId || compact || !viaYousign || previewPdfUrl) return;
    let cancelled = false;
    (async () => {
      try {
        if (signedPdfUrl) {
          if (!cancelled) setPreviewPdfUrl(signedPdfUrl);
          return;
        }
        const data = await fetchContract();
        if (cancelled) return;
        if (data.pdfBase64) {
          const bin = atob(data.pdfBase64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          setPreviewPdfUrl(URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })));
        } else if (data.signedPdfUrl) {
          setPreviewPdfUrl(data.signedPdfUrl);
        }
      } catch {
        /* silencieux — bouton manuel reste dispo */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, viaYousign, compact, signedPdfUrl]);

  const handleDownload = async () => {
    if (!orderId) return;
    setDownloading(true);
    setMsg(null);
    const filename = `contrat-rave-${orderId.slice(0, 8)}.pdf`;
    try {
      // 1) URL PDF déjà en cache
      if (signedPdfUrl) {
        const r = await fetch(signedPdfUrl);
        if (r.ok) {
          triggerBlobDownload(await r.blob(), filename);
          setMsg("PDF Yousign téléchargé (signature client incluse).");
          return;
        }
      }

      const data = await fetchContract();

      if (data.pdfBase64) {
        downloadBase64Pdf(data.pdfBase64, filename);
        if (data.pdfBase64) {
          const bin = atob(data.pdfBase64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
          setPreviewPdfUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return url;
          });
        }
        setMsg("PDF signé Yousign téléchargé.");
        return;
      }

      if (data.signedPdfUrl) {
        window.open(data.signedPdfUrl, "_blank", "noopener,noreferrer");
        setMsg("Ouverture du PDF signé…");
        return;
      }

      if (data.html) {
        try {
          await downloadHtmlAsPdf(data.html, filename);
          setMsg(
            viaYousign
              ? "PDF généré. La signature Yousign officielle n’a pas pu être récupérée — le document indique la signature électronique."
              : "PDF du contrat généré."
          );
          return;
        } catch (pdfErr) {
          console.warn("html2pdf failed, open HTML", pdfErr);
          const w = window.open("", "_blank");
          if (w) {
            w.document.write(data.html);
            w.document.close();
            setTimeout(() => w.print(), 500);
          }
          setMsg("Ouvrez la fenêtre et utilisez Imprimer → Enregistrer en PDF.");
          return;
        }
      }

      if (data.contractUrl) {
        window.open(data.contractUrl, "_blank", "noopener,noreferrer");
        return;
      }

      throw new Error(data.error || "Contrat indisponible");
    } catch (e: any) {
      setMsg(e?.message || "Erreur téléchargement");
      alert(e?.message || "Erreur téléchargement contrat");
    } finally {
      setDownloading(false);
    }
  };

  const handlePreviewSignedPdf = async () => {
    if (!orderId) return;
    setDownloading(true);
    try {
      if (signedPdfUrl) {
        setPreviewPdfUrl(signedPdfUrl);
        return;
      }
      const data = await fetchContract();
      if (data.pdfBase64) {
        const bin = atob(data.pdfBase64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
        setPreviewPdfUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
        return;
      }
      if (data.signedPdfUrl) {
        setPreviewPdfUrl(data.signedPdfUrl);
        return;
      }
      alert(data.error || "PDF signé Yousign indisponible pour le moment");
    } catch (e: any) {
      alert(e?.message || "Erreur");
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
        <h3 className="font-semibold text-slate-900">Contrat &amp; signatures</h3>
        <div className="flex flex-wrap items-center gap-2">
          {viaYousign && (
            <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
              Yousign
            </span>
          )}
        </div>
      </div>

      {orderId && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {downloading ? "Téléchargement…" : "Télécharger le contrat PDF signé"}
          </button>
          {viaYousign && (
            <button
              type="button"
              onClick={handlePreviewSignedPdf}
              disabled={downloading}
              className="rounded-lg border border-indigo-300 bg-indigo-50 px-4 py-2.5 text-sm font-medium text-indigo-800 hover:bg-indigo-100 disabled:opacity-60"
            >
              Voir le PDF avec signature
            </button>
          )}
        </div>
      )}
      {msg && <p className="text-sm text-slate-600">{msg}</p>}

      {previewPdfUrl && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Aperçu PDF signé (signature client Yousign)
          </p>
          <iframe
            title="PDF contrat signé"
            src={previewPdfUrl}
            className="h-[480px] w-full rounded-lg border border-slate-200 bg-slate-50"
          />
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-3 space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Client</p>
          {clientOk ? (
            <>
              <p className="text-sm font-semibold text-green-700">Signé</p>
              {clientName && <p className="text-sm text-slate-700">Nom : {clientName}</p>}
              {clientAt && <p className="text-xs text-slate-500">Le {clientAt}</p>}
              {viaYousign && (
                <p className="text-xs text-indigo-600">
                  Signature électronique Yousign — visible dans le PDF téléchargé
                  {ysId ? (
                    <span className="block font-mono text-[10px] text-slate-400 mt-0.5 truncate" title={ysId}>
                      {ysId}
                    </span>
                  ) : null}
                </p>
              )}
              {clientSvg ? (
                <div className="mt-2 rounded border border-slate-200 bg-white p-2">
                  <img src={clientSvg} alt="Signature client" className="max-h-24 w-full object-contain" />
                </div>
              ) : viaYousign && clientName ? (
                <div className="mt-2 rounded-lg border-2 border-green-500 bg-green-50 p-4 text-center">
                  <p className="font-serif text-2xl italic text-green-800">{clientName}</p>
                  <p className="mt-1 text-xs font-medium text-green-700">✓ Signé via Yousign</p>
                </div>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-slate-500">Non signé</p>
          )}
        </div>

        <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-3 space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Loueur</p>
          {loueurOk ? (
            <>
              <p className="text-sm font-semibold text-green-700">Signé</p>
              {loueurAt && <p className="text-xs text-slate-500">Le {loueurAt}</p>}
              {loueurSvg && (
                <div className="mt-2 rounded border border-slate-200 bg-white p-2">
                  <img src={loueurSvg} alt="Signature loueur" className="max-h-24 w-full object-contain" />
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-slate-500">Pas encore signé / non requis</p>
          )}
        </div>
      </div>

      {(contractUrl || htmlSnapshot) && !previewPdfUrl && (
        <div className="space-y-2 border-t border-slate-100 pt-3">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Document HTML</p>
          {contractUrl && (
            <a
              href={contractUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex text-sm font-medium text-indigo-600 hover:underline"
            >
              Ouvrir le contrat HTML
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
