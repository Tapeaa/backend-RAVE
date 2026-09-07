/**
 * Affiche le statut des signatures contrat (canvas / Yousign) pour admin & prestataire.
 */

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

export function isClientContractSigned(rideOption: any): boolean {
  return hasClientSigned(rideOption);
}

export function RentalContractSignatures({
  rideOption,
  compact = false,
}: {
  rideOption: any;
  compact?: boolean;
}) {
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
        {viaYousign && (
          <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
            Yousign
          </span>
        )}
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
