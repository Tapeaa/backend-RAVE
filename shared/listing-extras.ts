/**
 * Termes affichés sur la fiche véhicule client
 * (éditables uniquement depuis le dashboard web loueur).
 */

export type IncludedItem = {
  label: string;
  desc?: string;
};

export type InsuranceOption = {
  id: string;
  label: string;
  desc?: string;
  pricePerDay: number;
};

/** Supplément payant (GPS, siège bébé, etc.) — même forme qu’une option assurance */
export type SupplementOption = InsuranceOption;

/** @deprecated conservé pour rétrocompat lecture anciennes fiches */
export type InsuranceMode = "included" | "extra" | "none";
export type TransmissionCode = "auto" | "manual";
export type FuelCode = "essence" | "diesel" | "electrique" | "hybride";

export type VehicleListingExtras = {
  seats: number | null;
  transmission: TransmissionCode | null;
  fuel: FuelCode | null;
  cancellationTitle: string;
  cancellationDesc: string;
  paymentTitle: string;
  paymentDesc: string;
  mileageUnlimited: boolean;
  mileageKmPerDay: number | null;
  mileageExtraPricePerKm: number | null;
  /** Assurance de base incluse dans le prix */
  insuranceIncluded: boolean;
  insuranceIncludedLabel: string;
  /** Options payantes proposées au client (0..n) */
  insuranceOptions: InsuranceOption[];
  /** Legacy — dérivé à la normalisation */
  insuranceMode: InsuranceMode;
  insuranceLabel: string;
  insurancePricePerDay: number | null;
  /** Suppléments payants configurés par le loueur (0..n) */
  supplementOptions: SupplementOption[];
  featuresSafety: string[];
  featuresConnectivity: string[];
  featuresComfort: string[];
  includedItems: IncludedItem[];
  depositRequired: boolean;
  depositAmount: number | null;
  depositNote: string;
};

export const TRANSMISSION_OPTIONS: { value: TransmissionCode; label: string }[] = [
  { value: "auto", label: "Automatique" },
  { value: "manual", label: "Manuelle" },
];

export const FUEL_OPTIONS: { value: FuelCode; label: string }[] = [
  { value: "essence", label: "Essence" },
  { value: "diesel", label: "Diesel" },
  { value: "electrique", label: "Électrique" },
  { value: "hybride", label: "Hybride" },
];

export const FEATURE_PRESETS = {
  safety: [
    "Caméra de recul",
    "Aide au stationnement",
    "Régulateur de vitesse",
    "Traction intégrale",
    "Surveillance des angles morts",
    "ABS",
    "Airbags",
  ],
  connectivity: [
    "Bluetooth",
    "Chargeur USB",
    "Port USB",
    "GPS intégré",
    "Apple CarPlay / Android Auto",
  ],
  comfort: [
    "Climatisation automatique",
    "Sièges chauffants",
    "Vitres électriques",
    "Rétroviseurs électriques",
    "Toit ouvrant",
  ],
} as const;

export const INCLUDED_PRESETS: IncludedItem[] = [
  {
    label: "Prise en charge simplifiée",
    desc: "Utilisez l'application pour les instructions de prise en charge et retour",
  },
  {
    label: "Ajoutez gratuitement des conducteurs supplémentaires",
  },
  {
    label: "Délai supplémentaire de 30 minutes pour le retour",
    desc: "Pas de frais si votre retard ne dépasse pas 30 minutes",
  },
  {
    label: "Pas nécessaire de laver le véhicule, mais gardez-le propre",
  },
  {
    label: "Assistance routière gratuite 24h/24, 7j/7",
  },
  {
    label: "Service Clients disponible 24h/24, 7j/7",
  },
];

/** Suggestions rapides dashboard (le loueur choisit lesquels ajouter) */
export const SUPPLEMENT_PRESETS: { label: string; pricePerDay: number }[] = [
  { label: "GPS portable", pricePerDay: 500 },
  { label: "Siège bébé", pricePerDay: 800 },
  { label: "Galerie de toit", pricePerDay: 1000 },
  { label: "Glacière", pricePerDay: 300 },
];

export const DEFAULT_LISTING_EXTRAS: VehicleListingExtras = {
  seats: null,
  transmission: null,
  fuel: null,
  cancellationTitle: "Annulation gratuite",
  cancellationDesc:
    "Remboursement complet dans les 24 heures suivant la réservation. Options plus flexibles lors du paiement.",
  paymentTitle: "Paiement au loueur",
  paymentDesc:
    "Le paiement se fait directement auprès du loueur lors de la prise en charge du véhicule.",
  mileageUnlimited: false,
  mileageKmPerDay: 200,
  mileageExtraPricePerKm: 50,
  insuranceIncluded: false,
  insuranceIncludedLabel: "Assurance tous risques",
  insuranceOptions: [],
  insuranceMode: "none",
  insuranceLabel: "Assurance tous risques",
  insurancePricePerDay: null,
  supplementOptions: [],
  featuresSafety: [...FEATURE_PRESETS.safety],
  featuresConnectivity: [...FEATURE_PRESETS.connectivity],
  featuresComfort: [...FEATURE_PRESETS.comfort],
  includedItems: INCLUDED_PRESETS.map((i) => ({ ...i })),
  depositRequired: false,
  depositAmount: null,
  depositNote: "À convenir avec le loueur",
};

function asString(v: unknown, fallback: string): string {
  return typeof v === "string" ? v : fallback;
}

function asNullableNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x).trim()).filter(Boolean);
}

function asIncludedItems(v: unknown): IncludedItem[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((item: any) => ({
      label: String(item?.label || "").trim(),
      desc: item?.desc ? String(item.desc).trim() : undefined,
    }))
    .filter((i) => i.label);
}

function asPaidOptions(v: unknown, idPrefix: string): InsuranceOption[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((item: any, i: number) => {
      const label = String(item?.label || "").trim();
      const pricePerDay = Math.round(Number(item?.pricePerDay) || 0);
      if (!label || pricePerDay < 1) return null;
      return {
        id: String(item?.id || `${idPrefix}_${i}_${label}`).trim() || `${idPrefix}_${i}`,
        label,
        desc: item?.desc ? String(item.desc).trim() : undefined,
        pricePerDay,
      };
    })
    .filter(Boolean) as InsuranceOption[];
}

function asInsuranceOptions(v: unknown): InsuranceOption[] {
  return asPaidOptions(v, "ins");
}

function asSupplementOptions(v: unknown): SupplementOption[] {
  return asPaidOptions(v, "sup");
}

function deriveInsuranceFromLegacy(o: Record<string, unknown>, d: VehicleListingExtras): {
  insuranceIncluded: boolean;
  insuranceIncludedLabel: string;
  insuranceOptions: InsuranceOption[];
} {
  const mode = o.insuranceMode;
  const label = asString(o.insuranceLabel, d.insuranceIncludedLabel) || d.insuranceIncludedLabel;
  const price = asNullableNumber(o.insurancePricePerDay);

  if (mode === "extra") {
    const options: InsuranceOption[] =
      price != null && price > 0
        ? [{ id: "ins_legacy", label, desc: undefined, pricePerDay: price }]
        : [];
    return { insuranceIncluded: false, insuranceIncludedLabel: label, insuranceOptions: options };
  }
  if (mode === "included") {
    return { insuranceIncluded: true, insuranceIncludedLabel: label, insuranceOptions: [] };
  }
  return { insuranceIncluded: false, insuranceIncludedLabel: label, insuranceOptions: [] };
}

export function normalizeListingExtras(raw: unknown): VehicleListingExtras {
  const d = DEFAULT_LISTING_EXTRAS;
  if (!raw || typeof raw !== "object") {
    return {
      ...d,
      includedItems: d.includedItems.map((i) => ({ ...i })),
      insuranceOptions: [],
      supplementOptions: [],
    };
  }

  const o = raw as Record<string, unknown>;

  const seatsRaw = asNullableNumber(o.seats);
  const transmissionRaw = typeof o.transmission === "string" ? o.transmission : null;
  const fuelRaw = typeof o.fuel === "string" ? o.fuel : null;
  const transmission: TransmissionCode | null =
    transmissionRaw === "auto" || transmissionRaw === "manual" ? transmissionRaw : null;
  const fuel: FuelCode | null =
    fuelRaw === "essence" || fuelRaw === "diesel" || fuelRaw === "electrique" || fuelRaw === "hybride"
      ? fuelRaw
      : null;

  const hasNewInsurance =
    Object.prototype.hasOwnProperty.call(o, "insuranceIncluded") ||
    Object.prototype.hasOwnProperty.call(o, "insuranceOptions");

  let insuranceIncluded: boolean;
  let insuranceIncludedLabel: string;
  let insuranceOptions: InsuranceOption[];

  if (hasNewInsurance) {
    insuranceIncluded = o.insuranceIncluded === true;
    insuranceIncludedLabel =
      asString(o.insuranceIncludedLabel, d.insuranceIncludedLabel) ||
      asString(o.insuranceLabel, d.insuranceIncludedLabel) ||
      d.insuranceIncludedLabel;
    insuranceOptions = asInsuranceOptions(o.insuranceOptions);
  } else {
    const derived = deriveInsuranceFromLegacy(o, d);
    insuranceIncluded = derived.insuranceIncluded;
    insuranceIncludedLabel = derived.insuranceIncludedLabel;
    insuranceOptions = derived.insuranceOptions;
  }

  // Legacy mirrors
  let insuranceMode: InsuranceMode = "none";
  let insurancePricePerDay: number | null = null;
  if (insuranceIncluded) insuranceMode = "included";
  else if (insuranceOptions.length > 0) {
    insuranceMode = "extra";
    insurancePricePerDay = insuranceOptions[0].pricePerDay;
  }

  return {
    seats: seatsRaw != null && seatsRaw >= 1 ? Math.floor(seatsRaw) : null,
    transmission,
    fuel,
    cancellationTitle: asString(o.cancellationTitle, d.cancellationTitle) || d.cancellationTitle,
    cancellationDesc: asString(o.cancellationDesc, d.cancellationDesc),
    paymentTitle: asString(o.paymentTitle, d.paymentTitle) || d.paymentTitle,
    paymentDesc: asString(o.paymentDesc, d.paymentDesc),
    mileageUnlimited: o.mileageUnlimited === true,
    mileageKmPerDay: asNullableNumber(o.mileageKmPerDay) ?? d.mileageKmPerDay,
    mileageExtraPricePerKm: asNullableNumber(o.mileageExtraPricePerKm) ?? d.mileageExtraPricePerKm,
    insuranceIncluded,
    insuranceIncludedLabel,
    insuranceOptions,
    insuranceMode,
    insuranceLabel: insuranceIncludedLabel,
    insurancePricePerDay,
    supplementOptions: asSupplementOptions(o.supplementOptions),
    featuresSafety: Object.prototype.hasOwnProperty.call(o, "featuresSafety")
      ? asStringArray(o.featuresSafety)
      : [...d.featuresSafety],
    featuresConnectivity: Object.prototype.hasOwnProperty.call(o, "featuresConnectivity")
      ? asStringArray(o.featuresConnectivity)
      : [...d.featuresConnectivity],
    featuresComfort: Object.prototype.hasOwnProperty.call(o, "featuresComfort")
      ? asStringArray(o.featuresComfort)
      : [...d.featuresComfort],
    includedItems: Object.prototype.hasOwnProperty.call(o, "includedItems")
      ? asIncludedItems(o.includedItems)
      : d.includedItems.map((i) => ({ ...i })),
    depositRequired: o.depositRequired === true,
    depositAmount: asNullableNumber(o.depositAmount),
    depositNote: asString(o.depositNote, d.depositNote),
  };
}

export function hasInsuranceSection(extras: VehicleListingExtras): boolean {
  return extras.insuranceIncluded || extras.insuranceOptions.length > 0;
}

/** Specs affichées client : override loueur sinon modèle catalogue. */
export function resolveVehicleSpecs(
  extras: VehicleListingExtras | unknown,
  model: { seats?: number | null; transmission?: string | null; fuel?: string | null }
): { seats: number; transmission: string; fuel: string } {
  const e = normalizeListingExtras(extras);
  const transmission =
    e.transmission ||
    (model.transmission === "manual" || model.transmission === "auto" ? model.transmission : "auto");
  const fuel =
    e.fuel ||
    (model.fuel === "essence" ||
    model.fuel === "diesel" ||
    model.fuel === "electrique" ||
    model.fuel === "hybride"
      ? model.fuel
      : "essence");
  return {
    seats: e.seats != null && e.seats >= 1 ? e.seats : Number(model.seats) || 5,
    transmission,
    fuel,
  };
}
