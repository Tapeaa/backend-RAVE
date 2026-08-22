/**
 * Termes affichés sur la fiche véhicule client
 * (éditables uniquement depuis le dashboard web loueur).
 */

export type IncludedItem = {
  label: string;
  desc?: string;
};

export type InsuranceMode = "included" | "extra" | "none";

export type VehicleListingExtras = {
  cancellationTitle: string;
  cancellationDesc: string;
  paymentTitle: string;
  paymentDesc: string;
  mileageUnlimited: boolean;
  mileageKmPerDay: number | null;
  mileageExtraPricePerKm: number | null;
  insuranceMode: InsuranceMode;
  insuranceLabel: string;
  insurancePricePerDay: number | null;
  featuresSafety: string[];
  featuresConnectivity: string[];
  featuresComfort: string[];
  includedItems: IncludedItem[];
  depositRequired: boolean;
  depositAmount: number | null;
  depositNote: string;
};

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

export const DEFAULT_LISTING_EXTRAS: VehicleListingExtras = {
  cancellationTitle: "Annulation gratuite",
  cancellationDesc:
    "Remboursement complet dans les 24 heures suivant la réservation. Options plus flexibles lors du paiement.",
  paymentTitle: "Paiement au loueur",
  paymentDesc:
    "Le paiement se fait directement auprès du loueur lors de la prise en charge du véhicule.",
  mileageUnlimited: false,
  mileageKmPerDay: 200,
  mileageExtraPricePerKm: 50,
  insuranceMode: "included",
  insuranceLabel: "Assurance tous risques",
  insurancePricePerDay: null,
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

export function normalizeListingExtras(raw: unknown): VehicleListingExtras {
  const d = DEFAULT_LISTING_EXTRAS;
  if (!raw || typeof raw !== "object") return { ...d, includedItems: d.includedItems.map((i) => ({ ...i })) };

  const o = raw as Record<string, unknown>;
  const mode = o.insuranceMode;
  const insuranceMode: InsuranceMode =
    mode === "extra" || mode === "none" || mode === "included" ? mode : d.insuranceMode;

  return {
    cancellationTitle: asString(o.cancellationTitle, d.cancellationTitle) || d.cancellationTitle,
    cancellationDesc: asString(o.cancellationDesc, d.cancellationDesc),
    paymentTitle: asString(o.paymentTitle, d.paymentTitle) || d.paymentTitle,
    paymentDesc: asString(o.paymentDesc, d.paymentDesc),
    mileageUnlimited: o.mileageUnlimited === true,
    mileageKmPerDay: asNullableNumber(o.mileageKmPerDay) ?? d.mileageKmPerDay,
    mileageExtraPricePerKm: asNullableNumber(o.mileageExtraPricePerKm) ?? d.mileageExtraPricePerKm,
    insuranceMode,
    insuranceLabel: asString(o.insuranceLabel, d.insuranceLabel) || d.insuranceLabel,
    insurancePricePerDay: asNullableNumber(o.insurancePricePerDay),
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
