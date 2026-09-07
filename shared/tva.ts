/**
 * TVA loueur — source de vérité partagée (backend + clients via copie / @shared).
 */

export type TvaRegime = "franchise" | "assujetti";
export type TvaMode = "included" | "extra";

export type TvaBreakdown = {
  ht: number;
  tva: number;
  ttc: number;
  regime: TvaRegime;
  mode: TvaMode;
  rate: number;
};

export function normalizeTvaRegime(v: unknown): TvaRegime {
  return v === "assujetti" ? "assujetti" : "franchise";
}

export function normalizeTvaMode(v: unknown): TvaMode {
  return v === "extra" ? "extra" : "included";
}

export function normalizeTvaRate(v: unknown, fallback = 16): number {
  const n = Number(v);
  if (Number.isNaN(n) || n < 0 || n > 100) return fallback;
  return n;
}

/** Profil facturation complet pour activer le compte loueur */
export function isBillingProfileComplete(p: {
  address?: string | null;
  tvaRegime?: string | null;
  tvaRate?: number | null;
  tvaMode?: string | null;
  nom?: string | null;
  phone?: string | null;
  numeroTahiti?: string | null;
}): { ok: true } | { ok: false; missing: string[] } {
  const missing: string[] = [];
  if (!String(p.nom || "").trim()) missing.push("nom");
  if (!String(p.phone || "").trim()) missing.push("téléphone");
  if (!String(p.numeroTahiti || "").trim()) missing.push("N° Tahiti");
  if (!String(p.address || "").trim() || String(p.address).trim().length < 8) {
    missing.push("adresse de facturation");
  }
  const regime = normalizeTvaRegime(p.tvaRegime);
  if (regime === "assujetti") {
    const rate = normalizeTvaRate(p.tvaRate, NaN);
    if (Number.isNaN(rate)) missing.push("taux de TVA");
    const mode = p.tvaMode;
    if (mode !== "included" && mode !== "extra") {
      missing.push("mode TVA (incluse ou en plus)");
    }
  }
  return missing.length ? { ok: false, missing } : { ok: true };
}

/**
 * Prix saisi par le loueur (offre journalière / palier) → montant payé par le client (TTC).
 * - franchise : tel quel
 * - assujetti + included : le prix saisi est TTC
 * - assujetti + extra : le prix saisi est HT → on ajoute la TVA
 */
export function listedToClientPayable(
  listedAmount: number,
  opts: { regime?: string | null; mode?: string | null; rate?: number | null }
): number {
  const amount = Math.max(0, Math.round(Number(listedAmount) || 0));
  const regime = normalizeTvaRegime(opts.regime);
  if (regime !== "assujetti") return amount;
  const rate = normalizeTvaRate(opts.rate);
  const mode = normalizeTvaMode(opts.mode);
  if (mode === "extra") {
    return Math.round(amount * (1 + rate / 100));
  }
  return amount;
}

/** Décompose un total TTC payé pour facture / contrat */
export function splitFromPayableTtc(
  payableTtc: number,
  opts: { regime?: string | null; mode?: string | null; rate?: number | null }
): TvaBreakdown {
  const ttc = Math.max(0, Math.round(Number(payableTtc) || 0));
  const regime = normalizeTvaRegime(opts.regime);
  const mode = normalizeTvaMode(opts.mode);
  const rate = normalizeTvaRate(opts.rate);
  if (regime !== "assujetti" || rate <= 0) {
    return { ht: ttc, tva: 0, ttc, regime, mode, rate };
  }
  const ht = Math.round(ttc / (1 + rate / 100));
  const tva = ttc - ht;
  return { ht, tva, ttc, regime, mode, rate };
}

/** Applique TVA à un montant listé (HT ou TTC selon mode) → breakdown */
export function breakdownFromListed(
  listedAmount: number,
  opts: { regime?: string | null; mode?: string | null; rate?: number | null }
): TvaBreakdown {
  const ttc = listedToClientPayable(listedAmount, opts);
  return splitFromPayableTtc(ttc, opts);
}

export function tvaPublicLabel(opts: {
  regime?: string | null;
  mode?: string | null;
  rate?: number | null;
}): string {
  const regime = normalizeTvaRegime(opts.regime);
  if (regime !== "assujetti") {
    return "TVA non applicable (franchise en base)";
  }
  const rate = normalizeTvaRate(opts.rate);
  const mode = normalizeTvaMode(opts.mode);
  return mode === "extra"
    ? `TVA ${rate} % en sus du tarif`
    : `TVA ${rate} % incluse dans le tarif`;
}

/** Paliers listés (saisie loueur) → paliers payables client (TTC) */
export function mapPricingTiersForClient<T extends { pricePerDay: number }>(
  tiers: T[] | null | undefined,
  opts: { regime?: string | null; mode?: string | null; rate?: number | null }
): Array<T & { pricePerDayListed: number; pricePerDay: number }> {
  return (Array.isArray(tiers) ? tiers : []).map((t) => {
    const listed = Number(t.pricePerDay) || 0;
    return {
      ...t,
      pricePerDayListed: listed,
      pricePerDay: listedToClientPayable(listed, opts),
    };
  });
}

export function publicTvaMeta(opts: {
  regime?: string | null;
  mode?: string | null;
  rate?: number | null;
}) {
  const regime = normalizeTvaRegime(opts.regime);
  const mode = normalizeTvaMode(opts.mode);
  const rate = normalizeTvaRate(opts.rate);
  return {
    tvaRegime: regime,
    tvaMode: regime === "assujetti" ? mode : null,
    tvaRate: regime === "assujetti" ? rate : null,
    tvaLabel: tvaPublicLabel(opts),
  };
}

/** Applique la TVA client sur les options payantes d'une fiche véhicule */
export function mapListingExtrasPricesForClient(
  extras: {
    insuranceOptions?: Array<{ pricePerDay: number; [k: string]: any }>;
    supplementOptions?: Array<{ pricePerDay: number; [k: string]: any }>;
    insurancePricePerDay?: number | null;
    [k: string]: any;
  },
  opts: { regime?: string | null; mode?: string | null; rate?: number | null }
) {
  const mapOpt = <T extends { pricePerDay: number }>(o: T) => ({
    ...o,
    pricePerDayListed: Number(o.pricePerDay) || 0,
    pricePerDay: listedToClientPayable(o.pricePerDay, opts),
  });
  return {
    ...extras,
    insuranceOptions: (extras.insuranceOptions || []).map(mapOpt),
    supplementOptions: (extras.supplementOptions || []).map(mapOpt),
    insurancePricePerDay:
      extras.insurancePricePerDay != null
        ? listedToClientPayable(extras.insurancePricePerDay, opts)
        : null,
  };
}
