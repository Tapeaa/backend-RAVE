/**
 * RAVE - Dashboard Prestataire Loueur - Mes Véhicules
 * Flotte + tarifs dégressifs + termes fiche client
 */

import { useEffect, useRef, useState } from 'react';
import { CarFront, Plus, X, Check, Edit, Trash2, Eye, EyeOff, Search, CalendarOff, FileText, Bold, List, Heading2, FilePlus2 } from 'lucide-react';
import {
  buildCustomRentalContractHtml,
  buildDefaultRentalContractHtml,
} from '@shared/rental-contract-html';
import {
  DEFAULT_LISTING_EXTRAS,
  FEATURE_PRESETS,
  INCLUDED_PRESETS,
  SUPPLEMENT_PRESETS,
  FUEL_OPTIONS,
  TRANSMISSION_OPTIONS,
  normalizeListingExtras,
  type VehicleListingExtras,
  type IncludedItem,
  type FuelCode,
  type TransmissionCode,
} from '@shared/listing-extras';

interface VehicleModel {
  id: string;
  name: string;
  category: string;
  imageUrl: string | null;
  seats: number;
  transmission: string;
  fuel: string;
}

interface PricingTier {
  fromDay: number;
  toDay: number;
  pricePerDay: number;
}

interface LoueurVehicle {
  id: string;
  vehicleModelId: string;
  plate: string | null;
  pricePerDay: number;
  pricePerDayLongTerm: number | null;
  pricingTiers?: PricingTier[] | null;
  maxRentalDays?: number | null;
  listingExtras?: VehicleListingExtras | Record<string, unknown> | null;
  availableForRental: boolean;
  customImageUrl: string | null;
  defaultMeetingPoint?: string | null;
  rentalContractMode?: 'app_default' | 'custom' | string | null;
  customContractText?: string | null;
  isActive: boolean;
  createdAt: string;
  modelName: string;
  modelCategory: string;
  modelImageUrl: string | null;
  modelSeats: number;
  modelTransmission: string;
  modelFuel: string;
}

interface AvailabilityBlock {
  id: string;
  loueurVehicleId: string;
  startDate: string;
  endDate: string;
  reason: string | null;
}

function blockInclusiveEndYmd(endIso: string): string {
  const d = new Date(endIso);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function formatBlockLabel(startIso: string, endIso: string): string {
  const start = startIso.slice(0, 10);
  const end = blockInclusiveEndYmd(endIso);
  const fmt = (ymd: string) =>
    new Date(ymd + 'T12:00:00').toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  return start === end ? fmt(start) : `${fmt(start)} → ${fmt(end)}`;
}

function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const categoryLabels: Record<string, string> = {
  citadine: 'Citadine',
  berline: 'Berline',
  suv: 'SUV',
};

const categoryColors: Record<string, string> = {
  citadine: 'bg-blue-100 text-blue-800',
  berline: 'bg-purple-100 text-purple-800',
  suv: 'bg-amber-100 text-amber-800',
};

function defaultTiers(price = 5000, maxDays = 90): PricingTier[] {
  return [{ fromDay: 1, toDay: maxDays, pricePerDay: price }];
}

function syncTierEdges(tiers: PricingTier[], maxRentalDays: number): PricingTier[] {
  if (tiers.length === 0) return defaultTiers(5000, maxRentalDays);
  const next = tiers.map((t) => ({ ...t }));
  next[0].fromDay = 1;
  for (let i = 1; i < next.length; i++) {
    next[i].fromDay = next[i - 1].toDay + 1;
    if (next[i].toDay < next[i].fromDay) next[i].toDay = next[i].fromDay;
  }
  const last = next[next.length - 1];
  if (last.toDay > maxRentalDays) last.toDay = maxRentalDays;
  if (last.toDay < last.fromDay) last.toDay = last.fromDay;
  return next;
}

function cloneExtras(
  extras?: VehicleListingExtras | Record<string, unknown> | null,
  model?: { seats?: number; transmission?: string; fuel?: string } | null
): VehicleListingExtras {
  const base = normalizeListingExtras(extras);
  const seats = base.seats ?? model?.seats ?? null;
  const transmission =
    base.transmission ??
    (model?.transmission === 'manual' || model?.transmission === 'auto'
      ? (model.transmission as TransmissionCode)
      : null);
  const fuel =
    base.fuel ??
    (model?.fuel === 'essence' ||
    model?.fuel === 'diesel' ||
    model?.fuel === 'electrique' ||
    model?.fuel === 'hybride'
      ? (model.fuel as FuelCode)
      : null);
  return { ...base, seats, transmission, fuel };
}

type FormState = {
  vehicleModelId: string;
  plate: string;
  maxRentalDays: number;
  pricingTiers: PricingTier[];
  availableForRental: boolean;
  listingExtras: VehicleListingExtras;
  defaultMeetingPoint: string;
  rentalContractMode: 'app_default' | 'custom';
  customContractText: string;
};

export function PrestataireMesVehicules() {
  const [vehicles, setVehicles] = useState<LoueurVehicle[]>([]);
  const [models, setModels] = useState<VehicleModel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<LoueurVehicle | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const [formData, setFormData] = useState<FormState>({
    vehicleModelId: '',
    plate: '',
    maxRentalDays: 90,
    pricingTiers: defaultTiers(),
    availableForRental: true,
    listingExtras: cloneExtras(),
    defaultMeetingPoint: '',
    rentalContractMode: 'app_default',
    customContractText: '',
  });
  const [showContractPreview, setShowContractPreview] = useState(false);
  const customContractRef = useRef<HTMLTextAreaElement>(null);
  const [availabilityBlocks, setAvailabilityBlocks] = useState<AvailabilityBlock[]>([]);
  const [blockStart, setBlockStart] = useState(todayYmd());
  const [blockEnd, setBlockEnd] = useState(todayYmd());
  const [blockReason, setBlockReason] = useState('');
  const [blockSaving, setBlockSaving] = useState(false);
  const [blocksLoading, setBlocksLoading] = useState(false);

  useEffect(() => {
    fetchVehicles();
    fetchModels();
  }, []);

  async function fetchVehicles() {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch('/api/prestataire/vehicles', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setVehicles(data);
      }
    } catch (error) {
      console.error('Error fetching vehicles:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function fetchModels() {
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch('/api/prestataire/vehicle-models', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setModels(data);
      }
    } catch (error) {
      console.error('Error fetching models:', error);
    }
  }

  async function fetchAvailabilityBlocks(vehicleId: string) {
    setBlocksLoading(true);
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch(`/api/prestataire/vehicles/${vehicleId}/availability-blocks`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setAvailabilityBlocks(Array.isArray(data.blocks) ? data.blocks : []);
      } else {
        setAvailabilityBlocks([]);
      }
    } catch {
      setAvailabilityBlocks([]);
    } finally {
      setBlocksLoading(false);
    }
  }

  async function addAvailabilityBlock() {
    if (!editingVehicle) return;
    if (blockEnd < blockStart) {
      alert('La date de fin doit être après le début');
      return;
    }
    setBlockSaving(true);
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch(
        `/api/prestataire/vehicles/${editingVehicle.id}/availability-blocks`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            startDate: blockStart,
            endDate: blockEnd,
            reason: blockReason.trim() || undefined,
          }),
        }
      );
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        alert(err.error || 'Erreur');
        return;
      }
      setBlockReason('');
      await fetchAvailabilityBlocks(editingVehicle.id);
    } catch (e) {
      console.error(e);
      alert('Erreur réseau');
    } finally {
      setBlockSaving(false);
    }
  }

  async function removeAvailabilityBlock(blockId: string) {
    if (!editingVehicle) return;
    if (!confirm('Supprimer ce blocage de dates ?')) return;
    try {
      const token = localStorage.getItem('admin_token');
      await fetch(
        `/api/prestataire/vehicles/${editingVehicle.id}/availability-blocks/${blockId}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      await fetchAvailabilityBlocks(editingVehicle.id);
    } catch (e) {
      console.error(e);
    }
  }

  function openCreateModal() {
    setEditingVehicle(null);
    setAvailabilityBlocks([]);
    setShowContractPreview(false);
    const model = models[0];
    setFormData({
      vehicleModelId: model?.id || '',
      plate: '',
      maxRentalDays: 90,
      pricingTiers: defaultTiers(5000, 90),
      availableForRental: true,
      listingExtras: cloneExtras(DEFAULT_LISTING_EXTRAS, model),
      defaultMeetingPoint: '',
      rentalContractMode: 'app_default',
      customContractText: '',
    });
    setShowModal(true);
  }

  function openEditModal(vehicle: LoueurVehicle) {
    setEditingVehicle(vehicle);
    setShowContractPreview(false);
    setBlockStart(todayYmd());
    setBlockEnd(todayYmd());
    setBlockReason('');
    void fetchAvailabilityBlocks(vehicle.id);
    const maxDays = vehicle.maxRentalDays || 90;
    const tiers =
      vehicle.pricingTiers && vehicle.pricingTiers.length > 0
        ? syncTierEdges(vehicle.pricingTiers, maxDays)
        : defaultTiers(vehicle.pricePerDay, maxDays);
    setFormData({
      vehicleModelId: vehicle.vehicleModelId,
      plate: vehicle.plate || '',
      maxRentalDays: maxDays,
      pricingTiers: tiers,
      availableForRental: vehicle.availableForRental,
      listingExtras: cloneExtras(vehicle.listingExtras, {
        seats: vehicle.modelSeats,
        transmission: vehicle.modelTransmission,
        fuel: vehicle.modelFuel,
      }),
      defaultMeetingPoint: vehicle.defaultMeetingPoint || '',
      rentalContractMode: vehicle.rentalContractMode === 'custom' ? 'custom' : 'app_default',
      customContractText: vehicle.customContractText || '',
    });
    setShowModal(true);
  }

  function updateExtras(patch: Partial<VehicleListingExtras>) {
    setFormData((prev) => ({
      ...prev,
      listingExtras: { ...prev.listingExtras, ...patch },
    }));
  }

  function toggleFeature(
    group: 'featuresSafety' | 'featuresConnectivity' | 'featuresComfort',
    label: string
  ) {
    setFormData((prev) => {
      const list = prev.listingExtras[group];
      const next = list.includes(label) ? list.filter((x) => x !== label) : [...list, label];
      return { ...prev, listingExtras: { ...prev.listingExtras, [group]: next } };
    });
  }

  function toggleIncluded(item: IncludedItem) {
    setFormData((prev) => {
      const list = prev.listingExtras.includedItems;
      const exists = list.some((x) => x.label === item.label);
      const next = exists
        ? list.filter((x) => x.label !== item.label)
        : [...list, { label: item.label, desc: item.desc }];
      return { ...prev, listingExtras: { ...prev.listingExtras, includedItems: next } };
    });
  }

  function updateMaxRentalDays(value: number) {
    const maxRentalDays = Math.min(90, Math.max(1, value || 1));
    setFormData((prev) => ({
      ...prev,
      maxRentalDays,
      pricingTiers: syncTierEdges(prev.pricingTiers, maxRentalDays),
    }));
  }

  function updateTierToDay(index: number, toDay: number) {
    setFormData((prev) => {
      const tiers = prev.pricingTiers.map((t) => ({ ...t }));
      const minTo = tiers[index].fromDay;
      const maxTo =
        index < tiers.length - 1
          ? Math.min(prev.maxRentalDays - (tiers.length - 1 - index), prev.maxRentalDays)
          : prev.maxRentalDays;
      tiers[index].toDay = Math.min(maxTo, Math.max(minTo, toDay || minTo));
      return { ...prev, pricingTiers: syncTierEdges(tiers, prev.maxRentalDays) };
    });
  }

  function updateTierPrice(index: number, pricePerDay: number) {
    setFormData((prev) => {
      const tiers = prev.pricingTiers.map((t, i) =>
        i === index ? { ...t, pricePerDay: Math.max(0, pricePerDay || 0) } : t
      );
      return { ...prev, pricingTiers: tiers };
    });
  }

  function addTier() {
    setFormData((prev) => {
      const tiers = prev.pricingTiers.map((t) => ({ ...t }));
      const last = tiers[tiers.length - 1];
      if (last.toDay <= last.fromDay && last.toDay >= prev.maxRentalDays) {
        alert('Allongez ou réduisez la durée max avant d’ajouter un palier');
        return prev;
      }
      if (last.toDay >= prev.maxRentalDays) {
        last.toDay = Math.max(last.fromDay, last.toDay - 1);
      }
      if (last.toDay < last.fromDay) {
        alert('Allongez le palier précédent avant d’en ajouter un');
        return prev;
      }
      const fromDay = last.toDay + 1;
      if (fromDay > prev.maxRentalDays) {
        alert(`Impossible d'ajouter un palier : durée max déjà couverte (${prev.maxRentalDays} j)`);
        return prev;
      }
      tiers.push({
        fromDay,
        toDay: prev.maxRentalDays,
        pricePerDay: Math.max(1000, Math.round(last.pricePerDay * 0.9)),
      });
      return { ...prev, pricingTiers: syncTierEdges(tiers, prev.maxRentalDays) };
    });
  }

  function removeTier(index: number) {
    setFormData((prev) => {
      if (prev.pricingTiers.length <= 1) return prev;
      const tiers = prev.pricingTiers.filter((_, i) => i !== index);
      tiers[tiers.length - 1].toDay = prev.maxRentalDays;
      return { ...prev, pricingTiers: syncTierEdges(tiers, prev.maxRentalDays) };
    });
  }

  async function handleSave() {
    if (!formData.vehicleModelId) {
      alert('Veuillez sélectionner un modèle');
      return;
    }
    if (formData.pricingTiers.some((t) => t.pricePerDay < 1)) {
      alert('Chaque palier doit avoir un prix > 0');
      return;
    }
    if (formData.rentalContractMode === 'custom' && !formData.customContractText.trim()) {
      alert('Rédigez votre contrat personnalisé, ou choisissez le contrat RAVE par défaut.');
      return;
    }

    setIsSaving(true);
    try {
      const token = localStorage.getItem('admin_token');
      const url = editingVehicle
        ? `/api/prestataire/vehicles/${editingVehicle.id}`
        : '/api/prestataire/vehicles';
      const method = editingVehicle ? 'PATCH' : 'POST';

      const body: any = {
        pricePerDay: formData.pricingTiers[0].pricePerDay,
        pricingTiers: formData.pricingTiers,
        maxRentalDays: formData.maxRentalDays,
        plate: formData.plate || null,
        availableForRental: formData.availableForRental,
        availableForDelivery: false,
        availableForLongTerm: false,
        listingExtras: formData.listingExtras,
        defaultMeetingPoint: formData.defaultMeetingPoint.trim() || null,
        rentalContractMode: formData.rentalContractMode,
        customContractText:
          formData.rentalContractMode === 'custom' ? formData.customContractText.trim() : null,
      };

      if (!editingVehicle) {
        body.vehicleModelId = formData.vehicleModelId;
      }

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        setShowModal(false);
        fetchVehicles();
      } else {
        const err = await response.json();
        alert(err.error || 'Erreur');
      }
    } catch (error) {
      console.error('Error saving vehicle:', error);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggle(vehicle: LoueurVehicle) {
    try {
      const token = localStorage.getItem('admin_token');
      await fetch(`/api/prestataire/vehicles/${vehicle.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ isActive: !vehicle.isActive }),
      });
      fetchVehicles();
    } catch (error) {
      console.error('Error toggling vehicle:', error);
    }
  }

  async function handleDelete(vehicle: LoueurVehicle) {
    if (!confirm(`Supprimer ce véhicule (${vehicle.modelName}) ?`)) return;
    try {
      const token = localStorage.getItem('admin_token');
      await fetch(`/api/prestataire/vehicles/${vehicle.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchVehicles();
    } catch (error) {
      console.error('Error deleting vehicle:', error);
    }
  }

  const filteredVehicles = vehicles.filter(
    (v) =>
      v.modelName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (v.plate && v.plate.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const selectedModel = models.find((m) => m.id === formData.vehicleModelId);
  const extras = formData.listingExtras;

  const setCustomText = (customContractText: string) => {
    setFormData((prev) => ({ ...prev, customContractText }));
    setShowContractPreview(true);
  };

  const nextArticleNumber = (text: string) => {
    const matches = [...text.matchAll(/Article\s+(\d+)/gi)];
    return matches.reduce((max, m) => Math.max(max, Number(m[1]) || 0), 0) + 1;
  };

  const insertAtCursor = (insert: string, selectInner?: { start: number; end: number }) => {
    const el = customContractRef.current;
    const text = formData.customContractText;
    if (!el) {
      setCustomText(text + insert);
      return;
    }
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? start;
    const next = text.slice(0, start) + insert + text.slice(end);
    setCustomText(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = selectInner
        ? { start: start + selectInner.start, end: start + selectInner.end }
        : { start: start + insert.length, end: start + insert.length };
      el.setSelectionRange(pos.start, pos.end);
    });
  };

  const wrapSelection = (before: string, after: string, placeholder: string) => {
    const el = customContractRef.current;
    const text = formData.customContractText;
    if (!el) {
      setCustomText(text + before + placeholder + after);
      return;
    }
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const selected = text.slice(start, end);
    const inner = selected || placeholder;
    const insert = `${before}${inner}${after}`;
    const next = text.slice(0, start) + insert + text.slice(end);
    setCustomText(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + before.length, start + before.length + inner.length);
    });
  };

  const insertTitle = () => {
    const n = nextArticleNumber(formData.customContractText);
    const label = window.prompt('Titre de la section (apparaîtra en vert)', `Article ${n} — `);
    if (label == null) return;
    const clean = label.trim() || `Article ${n} — Titre`;
    const prefix = formData.customContractText
      ? formData.customContractText.endsWith('\n')
        ? '\n'
        : '\n\n'
      : '';
    insertAtCursor(`${prefix}## ${clean}\n`);
  };

  const insertBullet = () => {
    const el = customContractRef.current;
    const text = formData.customContractText;
    if (el && el.selectionEnd > el.selectionStart) {
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const chunk = text.slice(start, end);
      const bulleted = chunk
        .split('\n')
        .map((line) => {
          const t = line.trim();
          if (!t || t.startsWith('- ')) return line;
          return `- ${t}`;
        })
        .join('\n');
      const next = text.slice(0, start) + bulleted + text.slice(end);
      setCustomText(next);
      return;
    }
    const prefix = text && !text.endsWith('\n') ? '\n' : '';
    insertAtCursor(`${prefix}- `);
  };

  const insertContractTemplate = () => {
    const name = selectedModel?.name || editingVehicle?.modelName || 'Véhicule';
    setCustomText(
      [
        '## Article 1 — Parties',
        'Le Loueur : **Votre nom / société**',
        'Le Locataire : le client signataire',
        '',
        '## Article 2 — Véhicule',
        `Modèle : ${name}`,
        'État et accessoires constatés à la remise des clés.',
        '',
        '## Article 3 — Conditions',
        '- Permis de conduire valide obligatoire',
        '- Restituer le véhicule propre et avec le même niveau de carburant',
        '- Signaler immédiatement tout sinistre au loueur',
        '',
        '## Article 4 — Caution et assurance',
        'La caution est restituée après contrôle du véhicule, sous réserve de dégâts ou amendes.',
      ].join('\n')
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center">
            <CarFront className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Mes Véhicules</h1>
            <p className="text-sm text-gray-500">
              {vehicles.length} véhicule{vehicles.length > 1 ? 's' : ''} — tarifs & conditions fiche client
            </p>
          </div>
        </div>
        <button
          onClick={openCreateModal}
          disabled={models.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
        >
          <Plus className="w-4 h-4" />
          Ajouter
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="p-3 rounded-xl border bg-white">
          <p className="text-xs text-gray-500">Total</p>
          <p className="text-xl font-bold">{vehicles.length}</p>
        </div>
        <div className="p-3 rounded-xl border bg-green-50 border-green-200">
          <p className="text-xs text-gray-500">Actifs</p>
          <p className="text-xl font-bold text-green-700">{vehicles.filter((v) => v.isActive).length}</p>
        </div>
        <div className="p-3 rounded-xl border bg-blue-50 border-blue-200">
          <p className="text-xs text-gray-500">En location</p>
          <p className="text-xl font-bold text-blue-700">{vehicles.filter((v) => v.availableForRental).length}</p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Rechercher un véhicule..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-black/20"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin h-8 w-8 border-4 border-black border-t-transparent rounded-full" />
        </div>
      ) : filteredVehicles.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 rounded-xl">
          <CarFront className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">
            {models.length === 0
              ? "Aucun modèle de véhicule disponible. Contactez l'administrateur."
              : 'Aucun véhicule dans votre flotte'}
          </p>
          {models.length > 0 && (
            <button onClick={openCreateModal} className="mt-3 text-sm text-black underline">
              Ajouter votre premier véhicule
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredVehicles.map((vehicle) => {
            const tierCount = vehicle.pricingTiers?.length || 0;
            return (
              <div
                key={vehicle.id}
                className={`bg-white rounded-xl border p-4 flex items-center gap-4 transition-all hover:shadow-sm ${
                  !vehicle.isActive ? 'opacity-60' : ''
                }`}
              >
                <div className="w-20 h-16 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center">
                  {vehicle.customImageUrl || vehicle.modelImageUrl ? (
                    <img
                      src={vehicle.customImageUrl || vehicle.modelImageUrl!}
                      alt={vehicle.modelName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <CarFront className="w-8 h-8 text-gray-300" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900 truncate">{vehicle.modelName}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${categoryColors[vehicle.modelCategory]}`}>
                      {categoryLabels[vehicle.modelCategory]}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-gray-500">
                    {vehicle.plate && <span>Plaque: {vehicle.plate}</span>}
                    {vehicle.defaultMeetingPoint ? (
                      <span className="block truncate text-emerald-700">
                        RDV: {vehicle.defaultMeetingPoint}
                      </span>
                    ) : null}
                    <span className="font-medium text-gray-900">
                      dès {vehicle.pricePerDay.toLocaleString()} XPF/jour
                    </span>
                    {tierCount > 1 && (
                      <span className="text-xs bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded">
                        {tierCount} paliers
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {vehicle.availableForRental && (
                      <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">Location</span>
                    )}
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        vehicle.rentalContractMode === 'custom'
                          ? 'bg-violet-50 text-violet-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {vehicle.rentalContractMode === 'custom' ? 'Contrat perso' : 'Contrat RAVE'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => handleToggle(vehicle)}
                    className="p-2 rounded-lg hover:bg-gray-100"
                    title={vehicle.isActive ? 'Désactiver' : 'Activer'}
                  >
                    {vehicle.isActive ? (
                      <Eye className="w-4 h-4 text-green-600" />
                    ) : (
                      <EyeOff className="w-4 h-4 text-gray-400" />
                    )}
                  </button>
                  <button onClick={() => openEditModal(vehicle)} className="p-2 rounded-lg hover:bg-gray-100" title="Modifier">
                    <Edit className="w-4 h-4 text-gray-500" />
                  </button>
                  <button onClick={() => handleDelete(vehicle)} className="p-2 rounded-lg hover:bg-red-50" title="Supprimer">
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white z-10">
              <h2 className="text-lg font-bold">{editingVehicle ? 'Modifier le véhicule' : 'Ajouter un véhicule'}</h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {!editingVehicle && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Modèle de véhicule *</label>
                  <select
                    value={formData.vehicleModelId}
                    onChange={(e) => {
                      const id = e.target.value;
                      const model = models.find((m) => m.id === id);
                      setFormData((prev) => ({
                        ...prev,
                        vehicleModelId: id,
                        listingExtras: cloneExtras(prev.listingExtras, model),
                      }));
                    }}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-black/20"
                  >
                    {models.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name} ({categoryLabels[model.category]})
                      </option>
                    ))}
                  </select>
                  {selectedModel?.imageUrl && (
                    <div className="mt-2 h-24 bg-gray-50 rounded-lg overflow-hidden flex items-center justify-center">
                      <img src={selectedModel.imageUrl} alt={selectedModel.name} className="h-full object-contain" />
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Immatriculation</label>
                <input
                  type="text"
                  value={formData.plate}
                  onChange={(e) => setFormData((prev) => ({ ...prev, plate: e.target.value }))}
                  placeholder="Ex: 12345 P"
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-black/20"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Lieu de récupération / RDV par défaut
                </label>
                <input
                  type="text"
                  value={formData.defaultMeetingPoint}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, defaultMeetingPoint: e.target.value }))
                  }
                  placeholder="Ex: Parking Fare Ute, Papeete"
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-black/20"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Envoyé automatiquement au client quand vous acceptez une location de ce véhicule.
                  Vous pourrez aussi en envoyer un autre depuis l’app loueur.
                </p>
              </div>

              {/* Contrat de location — par véhicule */}
              <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-100">
                    <FileText className="h-4 w-4 text-violet-700" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Contrat de location</h3>
                    <p className="text-xs text-gray-600">
                      Choisissez le contrat présenté au client pour ce véhicule (comme dans l’app loueur).
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setFormData((prev) => ({
                      ...prev,
                      rentalContractMode: 'app_default',
                    }))
                  }
                  className={`w-full text-left rounded-xl border p-3 transition ${
                    formData.rentalContractMode === 'app_default'
                      ? 'border-violet-500 bg-white ring-1 ring-violet-200'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                        formData.rentalContractMode === 'app_default'
                          ? 'border-violet-600 bg-violet-600 text-white'
                          : 'border-gray-300'
                      }`}
                    >
                      {formData.rentalContractMode === 'app_default' ? (
                        <Check className="h-3 w-3" />
                      ) : null}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Contrat RAVE (par défaut)</p>
                      <p className="text-xs text-gray-500">
                        Contrat standard — compatible diffusion multi-loueurs sur le même modèle
                      </p>
                    </div>
                  </div>
                </button>

                {formData.rentalContractMode === 'app_default' && (
                  <div className="rounded-lg border border-gray-200 bg-white p-3 space-y-2">
                    <button
                      type="button"
                      onClick={() => setShowContractPreview((v) => !v)}
                      className="text-xs font-medium text-violet-700 hover:underline"
                    >
                      {showContractPreview ? 'Masquer l’aperçu' : 'Voir le contrat (identique à la signature client)'}
                    </button>
                    {showContractPreview ? (
                      <iframe
                        title="Aperçu contrat RAVE"
                        className="w-full h-80 rounded-md border border-gray-100 bg-white"
                        srcDoc={buildDefaultRentalContractHtml({
                          ref: 'APERCU',
                          contractDate: new Date().toLocaleDateString('fr-FR'),
                          loueurName: 'Votre nom (loueur)',
                          loueurNumeroTahiti: '[Votre N° Tahiti / K-BIS]',
                          clientName: '[Nom du client]',
                          clientInfo: '[Coordonnées client]',
                          vehicleName: selectedModel?.name || editingVehicle?.modelName || 'Véhicule',
                          vehicleMeta: formData.plate ? `Immat. ${formData.plate}` : undefined,
                          startLabel: '[Date début]',
                          endLabel: '[Date fin]',
                          days: 3,
                          pickupLocation: formData.defaultMeetingPoint || '[Lieu]',
                          pricePerDayLabel: `${(formData.pricingTiers[0]?.pricePerDay || 0).toLocaleString('fr-FR')} XPF`,
                          totalLabel: `${((formData.pricingTiers[0]?.pricePerDay || 0) * 3).toLocaleString('fr-FR')} XPF`,
                          previewMode: true,
                        })}
                      />
                    ) : null}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setFormData((prev) => ({
                      ...prev,
                      rentalContractMode: 'custom',
                    }));
                    setShowContractPreview(true);
                  }}
                  className={`w-full text-left rounded-xl border p-3 transition ${
                    formData.rentalContractMode === 'custom'
                      ? 'border-violet-500 bg-white ring-1 ring-violet-200'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                        formData.rentalContractMode === 'custom'
                          ? 'border-violet-600 bg-violet-600 text-white'
                          : 'border-gray-300'
                      }`}
                    >
                      {formData.rentalContractMode === 'custom' ? (
                        <Check className="h-3 w-3" />
                      ) : null}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Contrat personnalisé</p>
                      <p className="text-xs text-gray-500">
                        Rédigez vos conditions — boutons Titre, Gras et Liste
                      </p>
                    </div>
                  </div>
                </button>

                {formData.rentalContractMode === 'custom' && (
                  <div className="space-y-2">
                    <p className="text-xs text-gray-500">
                      Écrivez normalement, puis utilisez les boutons. L’aperçu montre exactement ce que
                      verra le client à la signature.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white font-medium hover:bg-gray-50"
                        onClick={insertTitle}
                      >
                        <Heading2 className="h-3.5 w-3.5" />
                        + Titre
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white font-medium hover:bg-gray-50"
                        onClick={() => wrapSelection('**', '**', 'texte important')}
                      >
                        <Bold className="h-3.5 w-3.5" />
                        + Gras
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white font-medium hover:bg-gray-50"
                        onClick={insertBullet}
                      >
                        <List className="h-3.5 w-3.5" />
                        + Liste
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white font-medium hover:bg-gray-50"
                        onClick={insertContractTemplate}
                      >
                        <FilePlus2 className="h-3.5 w-3.5" />
                        + Modèle
                      </button>
                    </div>
                    <textarea
                      ref={customContractRef}
                      value={formData.customContractText}
                      onChange={(e) => {
                        setFormData((prev) => ({
                          ...prev,
                          customContractText: e.target.value,
                        }));
                        if (e.target.value.trim()) setShowContractPreview(true);
                      }}
                      rows={12}
                      placeholder={`Écrivez vos articles ici…

Astuce : sélectionnez un mot puis cliquez sur Gras.
Cliquez sur Titre pour une section verte.`}
                      className="w-full px-3 py-2 border border-violet-200 rounded-lg text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-violet-300"
                    />
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => setShowContractPreview((v) => !v)}
                        className="text-xs font-medium text-violet-700 hover:underline"
                      >
                        {showContractPreview ? 'Masquer l’aperçu' : 'Voir l’aperçu client'}
                      </button>
                      <p className="text-xs text-gray-500">
                        {formData.customContractText.length} caractère
                        {formData.customContractText.length > 1 ? 's' : ''}
                      </p>
                    </div>
                    {showContractPreview ? (
                      <iframe
                        title="Aperçu contrat perso"
                        className="w-full h-72 rounded-md border border-violet-100 bg-white"
                        srcDoc={buildCustomRentalContractHtml({
                          ref: 'APERCU',
                          contractDate: new Date().toLocaleDateString('fr-FR'),
                          loueurName: 'Votre nom',
                          clientName: '[Client]',
                          vehicleName: selectedModel?.name || editingVehicle?.modelName || 'Véhicule',
                          startLabel: '[Début]',
                          endLabel: '[Fin]',
                          days: 1,
                          pricePerDayLabel: `${(formData.pricingTiers[0]?.pricePerDay || 0).toLocaleString('fr-FR')} XPF`,
                          totalLabel: `${(formData.pricingTiers[0]?.pricePerDay || 0).toLocaleString('fr-FR')} XPF`,
                          customBody:
                            formData.customContractText.trim() ||
                            'Rédigez votre contrat…\nL’aperçu se met à jour ici.',
                          isCustom: true,
                        })}
                      />
                    ) : null}
                  </div>
                )}
              </div>

              {editingVehicle && (
                <div className="rounded-xl border border-orange-200 bg-orange-50/60 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <CalendarOff className="w-4 h-4 text-orange-700" />
                    <h3 className="text-sm font-semibold text-orange-900">Indisponibilités</h3>
                  </div>
                  <p className="text-xs text-orange-800/80">
                    Bloquez des dates pour une réservation hors RAVE. Le véhicule reste publié le
                    reste du temps (plus rapide que de le désactiver).
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] uppercase text-orange-700">Du</label>
                      <input
                        type="date"
                        value={blockStart}
                        onChange={(e) => {
                          setBlockStart(e.target.value);
                          if (blockEnd < e.target.value) setBlockEnd(e.target.value);
                        }}
                        className="w-full px-2 py-1.5 border border-orange-200 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase text-orange-700">Au</label>
                      <input
                        type="date"
                        value={blockEnd}
                        min={blockStart}
                        onChange={(e) => setBlockEnd(e.target.value)}
                        className="w-full px-2 py-1.5 border border-orange-200 rounded-lg text-sm"
                      />
                    </div>
                  </div>
                  <input
                    type="text"
                    value={blockReason}
                    onChange={(e) => setBlockReason(e.target.value)}
                    placeholder="Motif (optionnel) — ex. WhatsApp / walk-in"
                    className="w-full px-3 py-2 border border-orange-200 rounded-lg text-sm"
                  />
                  <button
                    type="button"
                    onClick={addAvailabilityBlock}
                    disabled={blockSaving}
                    className="w-full py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold disabled:opacity-50"
                  >
                    {blockSaving ? 'Enregistrement…' : 'Bloquer ces dates'}
                  </button>
                  {blocksLoading ? (
                    <p className="text-xs text-orange-700">Chargement…</p>
                  ) : availabilityBlocks.length === 0 ? (
                    <p className="text-xs text-orange-700/70">Aucun blocage manuel.</p>
                  ) : (
                    <ul className="space-y-2">
                      {availabilityBlocks.map((b) => (
                        <li
                          key={b.id}
                          className="flex items-center justify-between gap-2 bg-white border border-orange-100 rounded-lg px-3 py-2"
                        >
                          <div>
                            <p className="text-sm font-semibold text-gray-900">
                              {formatBlockLabel(b.startDate, b.endDate)}
                            </p>
                            {b.reason ? (
                              <p className="text-xs text-gray-500">{b.reason}</p>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            onClick={() => removeAvailabilityBlock(b.id)}
                            className="text-red-500 hover:text-red-700 p-1"
                            title="Supprimer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Durée max de location (jours) *
                </label>
                <input
                  type="number"
                  min={1}
                  max={90}
                  value={formData.maxRentalDays}
                  onChange={(e) => updateMaxRentalDays(parseInt(e.target.value))}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-black/20"
                />
                <p className="text-xs text-gray-500 mt-1">Entre 1 et 90 jours. Le client ne pourra pas réserver plus long.</p>
              </div>

              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Tarif dégressif</h3>
                    <p className="text-xs text-gray-600">
                      Chaque tranche est facturée à son prix. Sans trou. Au-delà du dernier palier → dernier prix jusqu’à la durée max.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addTier}
                    className="shrink-0 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-black text-white hover:bg-gray-800"
                  >
                    + Palier
                  </button>
                </div>

                {formData.pricingTiers.map((tier, index) => (
                  <div key={index} className="grid grid-cols-12 gap-2 items-end bg-white rounded-lg border p-3">
                    <div className="col-span-3">
                      <label className="text-[10px] uppercase text-gray-500">Du jour</label>
                      <input
                        type="number"
                        value={tier.fromDay}
                        disabled
                        className="w-full px-2 py-1.5 border rounded-lg bg-gray-50 text-sm"
                      />
                    </div>
                    <div className="col-span-3">
                      <label className="text-[10px] uppercase text-gray-500">Au jour</label>
                      <input
                        type="number"
                        min={tier.fromDay}
                        max={formData.maxRentalDays}
                        value={tier.toDay}
                        onChange={(e) => updateTierToDay(index, parseInt(e.target.value))}
                        className="w-full px-2 py-1.5 border rounded-lg text-sm"
                      />
                    </div>
                    <div className="col-span-4">
                      <label className="text-[10px] uppercase text-gray-500">Prix / jour (XPF)</label>
                      <input
                        type="number"
                        min={1}
                        value={tier.pricePerDay}
                        onChange={(e) => updateTierPrice(index, parseInt(e.target.value))}
                        className="w-full px-2 py-1.5 border rounded-lg text-sm"
                      />
                    </div>
                    <div className="col-span-2 flex justify-end">
                      {formData.pricingTiers.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeTier(index)}
                          className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                          title="Supprimer le palier"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-4 space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Conditions fiche client</h3>
                  <p className="text-xs text-gray-600">
                    Visible dans l’app client. Configurable ici seulement (pas dans l’app loueur mobile).
                  </p>
                </div>

                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Annulation — titre</label>
                    <input
                      type="text"
                      value={extras.cancellationTitle}
                      onChange={(e) => updateExtras({ cancellationTitle: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg text-sm"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Annulation — détail</label>
                    <textarea
                      value={extras.cancellationDesc}
                      onChange={(e) => updateExtras({ cancellationDesc: e.target.value })}
                      rows={2}
                      className="w-full px-3 py-2 border rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Paiement — titre</label>
                    <input
                      type="text"
                      value={extras.paymentTitle}
                      onChange={(e) => updateExtras({ paymentTitle: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg text-sm"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Paiement — détail</label>
                    <textarea
                      value={extras.paymentDesc}
                      onChange={(e) => updateExtras({ paymentDesc: e.target.value })}
                      rows={2}
                      className="w-full px-3 py-2 border rounded-lg text-sm"
                    />
                  </div>
                </div>

                <div className="border-t pt-3 space-y-2">
                  <p className="text-xs font-semibold text-gray-800 uppercase tracking-wide">Kilométrage</p>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={extras.mileageUnlimited}
                      onChange={(e) => updateExtras({ mileageUnlimited: e.target.checked })}
                      className="w-4 h-4 rounded"
                    />
                    Kilométrage illimité
                  </label>
                  {!extras.mileageUnlimited && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Km inclus / jour</label>
                        <input
                          type="number"
                          min={0}
                          value={extras.mileageKmPerDay ?? ''}
                          onChange={(e) =>
                            updateExtras({
                              mileageKmPerDay: e.target.value === '' ? null : Number(e.target.value),
                            })
                          }
                          className="w-full px-3 py-2 border rounded-lg text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Prix km supplémentaire (XPF)</label>
                        <input
                          type="number"
                          min={0}
                          value={extras.mileageExtraPricePerKm ?? ''}
                          onChange={(e) =>
                            updateExtras({
                              mileageExtraPricePerKm: e.target.value === '' ? null : Number(e.target.value),
                            })
                          }
                          className="w-full px-3 py-2 border rounded-lg text-sm"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="border-t pt-3 space-y-3">
                  <p className="text-xs font-semibold text-gray-800 uppercase tracking-wide">Assurance</p>

                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={extras.insuranceIncluded}
                      onChange={(e) =>
                        updateExtras({
                          insuranceIncluded: e.target.checked,
                          insuranceMode: e.target.checked
                            ? 'included'
                            : extras.insuranceOptions.length > 0
                              ? 'extra'
                              : 'none',
                        })
                      }
                      className="w-4 h-4 rounded"
                    />
                    Assurance de base incluse dans le prix
                  </label>
                  {extras.insuranceIncluded && (
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Libellé assurance incluse</label>
                      <input
                        type="text"
                        value={extras.insuranceIncludedLabel}
                        onChange={(e) =>
                          updateExtras({
                            insuranceIncludedLabel: e.target.value,
                            insuranceLabel: e.target.value,
                          })
                        }
                        placeholder="Ex: Assurance tous risques"
                        className="w-full px-3 py-2 border rounded-lg text-sm"
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-gray-700">
                        Options payantes proposées au client
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          const id = `ins_${Date.now()}`;
                          updateExtras({
                            insuranceOptions: [
                              ...extras.insuranceOptions,
                              {
                                id,
                                label: 'Assurance complémentaire',
                                desc: '',
                                pricePerDay: 1500,
                              },
                            ],
                            insuranceMode: extras.insuranceIncluded ? 'included' : 'extra',
                          });
                        }}
                        className="text-xs font-medium px-2.5 py-1.5 rounded-lg bg-black text-white hover:bg-gray-800"
                      >
                        + Option
                      </button>
                    </div>
                    <p className="text-[11px] text-gray-500">
                      Le client pourra cocher ces assurances à la réservation. Laissez vide si vous n’en proposez pas.
                    </p>
                    {extras.insuranceOptions.map((opt, index) => (
                      <div key={opt.id} className="space-y-2 bg-white rounded-lg border p-3">
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                          <div className="sm:col-span-4">
                            <label className="text-[10px] uppercase text-gray-500">Libellé</label>
                            <input
                              type="text"
                              value={opt.label}
                              onChange={(e) => {
                                const next = extras.insuranceOptions.map((x, i) =>
                                  i === index ? { ...x, label: e.target.value } : x
                                );
                                updateExtras({ insuranceOptions: next });
                              }}
                              className="w-full px-2 py-1.5 border rounded-lg text-sm"
                              placeholder="Ex: Franchise réduite"
                            />
                          </div>
                          <div className="sm:col-span-4">
                            <label className="text-[10px] uppercase text-gray-500">Description</label>
                            <input
                              type="text"
                              value={opt.desc || ''}
                              onChange={(e) => {
                                const next = extras.insuranceOptions.map((x, i) =>
                                  i === index ? { ...x, desc: e.target.value } : x
                                );
                                updateExtras({ insuranceOptions: next });
                              }}
                              className="w-full px-2 py-1.5 border rounded-lg text-sm"
                              placeholder="Optionnel"
                            />
                          </div>
                          <div className="sm:col-span-3">
                            <label className="text-[10px] uppercase text-gray-500">XPF / jour</label>
                            <input
                              type="number"
                              min={1}
                              value={opt.pricePerDay}
                              onChange={(e) => {
                                const next = extras.insuranceOptions.map((x, i) =>
                                  i === index
                                    ? { ...x, pricePerDay: Math.max(1, Number(e.target.value) || 1) }
                                    : x
                                );
                                updateExtras({ insuranceOptions: next });
                              }}
                              className="w-full px-2 py-1.5 border rounded-lg text-sm"
                            />
                          </div>
                          <div className="sm:col-span-1 flex justify-end">
                            <button
                              type="button"
                              onClick={() => {
                                const next = extras.insuranceOptions.filter((_, i) => i !== index);
                                updateExtras({
                                  insuranceOptions: next,
                                  insuranceMode: extras.insuranceIncluded
                                    ? 'included'
                                    : next.length > 0
                                      ? 'extra'
                                      : 'none',
                                });
                              }}
                              className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                              title="Supprimer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border-t pt-3 space-y-3">
                  <p className="text-xs font-semibold text-gray-800 uppercase tracking-wide">
                    Suppléments
                  </p>
                  <p className="text-[11px] text-gray-500">
                    Proposés au client à la réservation (GPS, siège bébé…). Laissez vide si aucun.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {SUPPLEMENT_PRESETS.map((preset) => {
                      const already = (extras.supplementOptions || []).some(
                        (s) => s.label.toLowerCase() === preset.label.toLowerCase()
                      );
                      return (
                        <button
                          key={preset.label}
                          type="button"
                          disabled={already}
                          onClick={() => {
                            updateExtras({
                              supplementOptions: [
                                ...(extras.supplementOptions || []),
                                {
                                  id: `sup_${Date.now()}_${preset.label}`,
                                  label: preset.label,
                                  desc: '',
                                  pricePerDay: preset.pricePerDay,
                                },
                              ],
                            });
                          }}
                          className="text-[11px] px-2.5 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          + {preset.label}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => {
                        updateExtras({
                          supplementOptions: [
                            ...(extras.supplementOptions || []),
                            {
                              id: `sup_${Date.now()}`,
                              label: 'Supplément',
                              desc: '',
                              pricePerDay: 500,
                            },
                          ],
                        });
                      }}
                      className="text-[11px] font-medium px-2.5 py-1.5 rounded-lg bg-black text-white hover:bg-gray-800"
                    >
                      + Personnalisé
                    </button>
                  </div>
                  {(extras.supplementOptions || []).map((opt, index) => (
                    <div key={opt.id} className="space-y-2 bg-white rounded-lg border p-3">
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                        <div className="sm:col-span-4">
                          <label className="text-[10px] uppercase text-gray-500">Libellé</label>
                          <input
                            type="text"
                            value={opt.label}
                            onChange={(e) => {
                              const next = extras.supplementOptions.map((x, i) =>
                                i === index ? { ...x, label: e.target.value } : x
                              );
                              updateExtras({ supplementOptions: next });
                            }}
                            className="w-full px-2 py-1.5 border rounded-lg text-sm"
                          />
                        </div>
                        <div className="sm:col-span-4">
                          <label className="text-[10px] uppercase text-gray-500">Description</label>
                          <input
                            type="text"
                            value={opt.desc || ''}
                            onChange={(e) => {
                              const next = extras.supplementOptions.map((x, i) =>
                                i === index ? { ...x, desc: e.target.value } : x
                              );
                              updateExtras({ supplementOptions: next });
                            }}
                            className="w-full px-2 py-1.5 border rounded-lg text-sm"
                            placeholder="Optionnel"
                          />
                        </div>
                        <div className="sm:col-span-3">
                          <label className="text-[10px] uppercase text-gray-500">XPF / jour</label>
                          <input
                            type="number"
                            min={1}
                            value={opt.pricePerDay}
                            onChange={(e) => {
                              const next = extras.supplementOptions.map((x, i) =>
                                i === index
                                  ? { ...x, pricePerDay: Math.max(1, Number(e.target.value) || 1) }
                                  : x
                              );
                              updateExtras({ supplementOptions: next });
                            }}
                            className="w-full px-2 py-1.5 border rounded-lg text-sm"
                          />
                        </div>
                        <div className="sm:col-span-1 flex justify-end">
                          <button
                            type="button"
                            onClick={() => {
                              updateExtras({
                                supplementOptions: extras.supplementOptions.filter((_, i) => i !== index),
                              });
                            }}
                            className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                            title="Supprimer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="border-t pt-3 space-y-3">
                  <p className="text-xs font-semibold text-gray-800 uppercase tracking-wide">Caractéristiques</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Places</label>
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={extras.seats ?? ''}
                        onChange={(e) =>
                          updateExtras({
                            seats: e.target.value === '' ? null : Math.max(1, Number(e.target.value) || 1),
                          })
                        }
                        className="w-full px-3 py-2 border rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Boîte</label>
                      <select
                        value={extras.transmission || 'auto'}
                        onChange={(e) => updateExtras({ transmission: e.target.value as TransmissionCode })}
                        className="w-full px-3 py-2 border rounded-lg text-sm"
                      >
                        {TRANSMISSION_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Carburant</label>
                      <select
                        value={extras.fuel || 'essence'}
                        onChange={(e) => updateExtras({ fuel: e.target.value as FuelCode })}
                        className="w-full px-3 py-2 border rounded-lg text-sm"
                      >
                        {FUEL_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {(
                    [
                      { key: 'featuresSafety' as const, title: 'Sécurité', presets: FEATURE_PRESETS.safety },
                      { key: 'featuresConnectivity' as const, title: 'Connectivité', presets: FEATURE_PRESETS.connectivity },
                      { key: 'featuresComfort' as const, title: 'Confort', presets: FEATURE_PRESETS.comfort },
                    ]
                  ).map((group) => (
                    <div key={group.key}>
                      <p className="text-xs font-medium text-gray-700 mb-1">{group.title}</p>
                      <div className="flex flex-wrap gap-2">
                        {group.presets.map((label) => {
                          const on = extras[group.key].includes(label);
                          return (
                            <button
                              key={label}
                              type="button"
                              onClick={() => toggleFeature(group.key, label)}
                              className={`text-xs px-2.5 py-1 rounded-full border ${
                                on
                                  ? 'bg-black text-white border-black'
                                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                              }`}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="border-t pt-3 space-y-2">
                  <p className="text-xs font-semibold text-gray-800 uppercase tracking-wide">Inclus dans le prix</p>
                  <div className="space-y-1.5">
                    {INCLUDED_PRESETS.map((item) => {
                      const on = extras.includedItems.some((x) => x.label === item.label);
                      return (
                        <label key={item.label} className="flex items-start gap-2 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => toggleIncluded(item)}
                            className="mt-0.5 w-4 h-4 rounded"
                          />
                          <span>
                            <span className="font-medium text-gray-800">{item.label}</span>
                            {item.desc ? (
                              <span className="block text-xs text-gray-500">{item.desc}</span>
                            ) : null}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="border-t pt-3 space-y-2">
                  <p className="text-xs font-semibold text-gray-800 uppercase tracking-wide">Caution</p>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={extras.depositRequired}
                      onChange={(e) => updateExtras({ depositRequired: e.target.checked })}
                      className="w-4 h-4 rounded"
                    />
                    Exiger une caution
                  </label>
                  {extras.depositRequired ? (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Montant (XPF)</label>
                        <input
                          type="number"
                          min={0}
                          value={extras.depositAmount ?? ''}
                          onChange={(e) =>
                            updateExtras({
                              depositAmount: e.target.value === '' ? null : Number(e.target.value),
                            })
                          }
                          placeholder="Ex: 50000"
                          className="w-full px-3 py-2 border rounded-lg text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Note</label>
                        <input
                          type="text"
                          value={extras.depositNote}
                          onChange={(e) => updateExtras({ depositNote: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg text-sm"
                        />
                      </div>
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={extras.depositNote}
                      onChange={(e) => updateExtras({ depositNote: e.target.value })}
                      placeholder="Message si pas de caution"
                      className="w-full px-3 py-2 border rounded-lg text-sm"
                    />
                  )}
                </div>
              </div>

              <div>
                <label className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.availableForRental}
                    onChange={(e) => setFormData((prev) => ({ ...prev, availableForRental: e.target.checked }))}
                    className="w-4 h-4 rounded border-gray-300"
                  />
                  <span className="text-sm text-gray-700">Disponible à la location</span>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-5 border-t sticky bottom-0 bg-white">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">
                Annuler
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-2 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
              >
                {isSaving ? (
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                {editingVehicle ? 'Enregistrer' : 'Ajouter'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
