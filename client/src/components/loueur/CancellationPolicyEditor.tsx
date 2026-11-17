import {
  CANCELLATION_PRESETS,
  CANCELLATION_TITLE_MAX,
  CANCELLATION_DESC_MIN,
  CANCELLATION_DESC_MAX,
} from '@shared/listing-extras';

type Props = {
  title: string;
  desc: string;
  onChange: (next: { title: string; desc: string }) => void;
};

export function CancellationPolicyEditor({ title, desc, onChange }: Props) {
  const activePreset =
    CANCELLATION_PRESETS.find((p) => p.title === title.trim() && p.desc === desc.trim())?.id ??
    (title.trim() || desc.trim() ? 'custom' : null);
  const descLen = desc.trim().length;

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-medium text-gray-700 mb-1.5">Partir d’un modèle</p>
        <div className="flex flex-wrap gap-2">
          {CANCELLATION_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onChange({ title: p.title, desc: p.desc })}
              className={`px-3 py-1.5 rounded-full text-sm font-semibold border transition ${
                activePreset === p.id
                  ? 'bg-emerald-500 border-emerald-500 text-gray-900'
                  : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
              }`}
            >
              {p.label}
            </button>
          ))}
          <span
            className={`px-3 py-1.5 rounded-full text-sm font-semibold border ${
              activePreset === 'custom'
                ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                : 'bg-white border-dashed border-gray-200 text-gray-400'
            }`}
          >
            Personnalisée
          </span>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Titre *</label>
        <input
          type="text"
          value={title}
          maxLength={CANCELLATION_TITLE_MAX}
          onChange={(e) => onChange({ title: e.target.value, desc })}
          placeholder="Ex. Annulation modérée"
          className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Conditions détaillées *</label>
        <textarea
          value={desc}
          maxLength={CANCELLATION_DESC_MAX}
          onChange={(e) => onChange({ title, desc: e.target.value })}
          rows={5}
          placeholder="Délais, pourcentage remboursé, cas de non-présentation…"
          className="w-full px-3 py-2 border rounded-lg text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
        />
        <p className={`text-xs mt-1 text-right ${descLen < CANCELLATION_DESC_MIN ? 'text-red-600' : 'text-gray-400'}`}>
          {descLen < CANCELLATION_DESC_MIN
            ? `Encore ${CANCELLATION_DESC_MIN - descLen} caractères minimum`
            : `${descLen} / ${CANCELLATION_DESC_MAX}`}
        </p>
      </div>
    </div>
  );
}
