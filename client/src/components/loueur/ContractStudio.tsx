/**
 * Éditeur de contrat plein écran : articles sous forme de cartes + aperçu client en grand.
 * Le texte produit reste le markdown léger lu par formatCustomContractBody (## titre, - liste, **gras**).
 */
import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, Eye, FileText, Pencil, Plus, Sparkles, Trash2, X } from 'lucide-react';
import {
  CONTRACT_SUMMARY_DEFAULT_LABELS,
  CONTRACT_VARIABLES,
  type ContractSettings,
  type ContractSummaryKey,
} from '@shared/rental-contract-html';

const SUMMARY_EXAMPLES: Record<ContractSummaryKey, string> = {
  loueur: 'Votre nom ou société',
  tahiti: 'Votre N° Tahiti (si renseigné)',
  client: 'Nom du client',
  vehicle: 'Le véhicule loué',
  period: 'Dates de début et de fin',
  total: 'Prix total de la location',
};

type Section = { id: string; title: string; body: string };

let seq = 0;
const newId = () => `s${Date.now().toString(36)}${(seq++).toString(36)}`;

const stripArticlePrefix = (s: string) => s.replace(/^Article\s+\d+\s*[—–:-]?\s*/i, '').trim();

export function parseContractSections(text: string): Section[] {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const out: Section[] = [];
  let cur: Section | null = null;
  for (const line of lines) {
    const t = line.trim();
    const m = t.match(/^##\s+(.+)$/) || t.match(/^(Article\s+\d+.*)$/i);
    if (m) {
      if (cur) out.push(cur);
      cur = { id: newId(), title: stripArticlePrefix(m[1]), body: '' };
    } else {
      if (!cur) cur = { id: newId(), title: '', body: '' };
      cur.body = cur.body ? `${cur.body}\n${line}` : line;
    }
  }
  if (cur) out.push(cur);
  return out
    .map((s) => ({ ...s, body: s.body.trim() }))
    .filter((s) => s.title || s.body);
}

export function serializeContractSections(sections: Section[]): string {
  let n = 0;
  return sections
    .filter((s) => s.title.trim() || s.body.trim())
    .map((s) => {
      const body = s.body.trim();
      if (!s.title.trim()) return body;
      n += 1;
      return `## Article ${n} — ${s.title.trim()}${body ? `\n${body}` : ''}`;
    })
    .join('\n\n');
}

const CLAUSES: { title: string; body: string }[] = [
  {
    title: 'Conducteurs',
    body: 'Seul le locataire, ou un conducteur déclaré au loueur, peut conduire le véhicule.\n- Permis de conduire valide obligatoire',
  },
  {
    title: 'Carburant',
    body: 'Le véhicule est remis avec le plein. Il doit être rendu avec le même niveau de carburant, sinon le carburant manquant sera facturé.',
  },
  {
    title: 'Caution',
    body: 'Une caution est demandée à la remise des clés. Elle est rendue au retour du véhicule, après vérification, sauf dégâts, amendes ou carburant manquant.',
  },
  {
    title: 'Retard',
    body: 'Tout retard doit être signalé au loueur. Au-delà d’une heure de retard, une journée supplémentaire peut être facturée.',
  },
  {
    title: 'Propreté',
    body: 'Le véhicule doit être rendu propre. Des frais de nettoyage peuvent être demandés si le véhicule est très sale (sable, boue…).',
  },
  {
    title: 'Interdiction de fumer',
    body: 'Il est interdit de fumer dans le véhicule. Des frais de nettoyage seront facturés en cas de non-respect.',
  },
  {
    title: 'Animaux',
    body: 'Les animaux ne sont pas acceptés dans le véhicule, sauf accord du loueur.',
  },
  {
    title: 'Accident, panne ou vol',
    body: 'En cas d’accident, de panne ou de vol, le locataire prévient immédiatement le loueur et, si besoin, la gendarmerie.\n- Un constat amiable doit être rempli en cas d’accident',
  },
  {
    title: 'Amendes',
    body: 'Les amendes et PV reçus pendant la location sont à la charge du locataire.',
  },
  {
    title: 'Sortie de l’île',
    body: 'Le véhicule ne peut pas quitter l’île (ferry, bateau) sans l’accord écrit du loueur.',
  },
  {
    title: 'Routes autorisées',
    body: 'Le véhicule doit rester sur les routes goudronnées. Les pistes non autorisées et la plage sont interdites.',
  },
];

const TEMPLATE_TITLES = ['Conducteurs', 'Carburant', 'Caution', 'Accident, panne ou vol', 'Amendes'];

type Props = {
  open: boolean;
  onClose: () => void;
  mode: 'app_default' | 'custom';
  value: string;
  onChange: (text: string) => void;
  buildPreview: (body: string) => string;
  onSwitchToCustom?: () => void;
  settings?: ContractSettings | null;
  onSettingsChange?: (s: ContractSettings | null) => void;
};

export function ContractStudio({
  open,
  onClose,
  mode,
  value,
  onChange,
  buildPreview,
  onSwitchToCustom,
  settings,
  onSettingsChange,
}: Props) {
  const [sections, setSections] = useState<Section[]>([]);
  const [mobileView, setMobileView] = useState<'edit' | 'preview'>('edit');
  const [showClauses, setShowClauses] = useState(false);
  const [showHeader, setShowHeader] = useState(false);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const bodyRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const readOnly = mode === 'app_default';
  const st: ContractSettings = settings || {};
  const hidden = new Set(st.hidden || []);
  const extraRows = st.extraRows || [];
  const headerCustomized =
    Object.values(st.labels || {}).some((v) => v && v.trim()) || hidden.size > 0 || extraRows.length > 0;

  const setSettings = (next: ContractSettings) => onSettingsChange?.(next);
  const setLabel = (k: ContractSummaryKey, v: string) =>
    setSettings({ ...st, labels: { ...(st.labels || {}), [k]: v } });
  const toggleHidden = (k: ContractSummaryKey) => {
    const h = new Set(hidden);
    if (h.has(k)) h.delete(k);
    else h.add(k);
    setSettings({ ...st, hidden: Array.from(h) });
  };
  const setExtraRows = (rows: { label: string; value: string }[]) => setSettings({ ...st, extraRows: rows });

  useEffect(() => {
    if (!open) return;
    setSections(parseContractSections(value));
    setMobileView(mode === 'app_default' ? 'preview' : 'edit');
    setShowClauses(false);
    // Ne réinitialise qu'à l'ouverture : value change à chaque frappe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const update = (next: Section[]) => {
    setSections(next);
    onChange(serializeContractSections(next));
  };
  const patch = (id: string, p: Partial<Section>) =>
    update(sections.map((s) => (s.id === id ? { ...s, ...p } : s)));
  const insertVariable = (s: Section, token: string) => {
    const el = bodyRefs.current[s.id];
    const start = el?.selectionStart ?? s.body.length;
    const end = el?.selectionEnd ?? start;
    const before = s.body.slice(0, start);
    const pad = before && !/\s$/.test(before) ? ' ' : '';
    const insert = `${pad}${token}`;
    patch(s.id, { body: before + insert + s.body.slice(end) });
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const pos = start + insert.length;
      el.setSelectionRange(pos, pos);
    });
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= sections.length) return;
    const next = [...sections];
    [next[i], next[j]] = [next[j], next[i]];
    update(next);
  };
  const remove = (s: Section) => {
    if ((s.title.trim() || s.body.trim()) && !window.confirm(`Supprimer l’article « ${s.title || 'sans titre'} » ?`)) return;
    update(sections.filter((x) => x.id !== s.id));
  };
  const addSection = (title = '', body = '') => {
    update([...sections, { id: newId(), title, body }]);
    setShowClauses(false);
    requestAnimationFrame(() => {
      document.getElementById('contract-studio-list')?.scrollTo({ top: 1e6, behavior: 'smooth' });
    });
  };
  const useTemplate = () =>
    update(
      CLAUSES.filter((c) => TEMPLATE_TITLES.includes(c.title)).map((c) => ({ id: newId(), ...c }))
    );

  const usedTitles = new Set(sections.map((s) => s.title.trim().toLowerCase()));
  const previewHtml = buildPreview(
    readOnly ? '' : serializeContractSections(sections) || 'Ajoutez un article à gauche : il apparaîtra ici.'
  );
  let articleNo = 0;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-white">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-600">
            <FileText className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-gray-900 sm:text-lg">
              {readOnly ? 'Contrat RAVE (par défaut)' : 'Mon contrat de location'}
            </h2>
            <p className="truncate text-xs text-gray-500">
              {readOnly
                ? 'Voici exactement ce que le client signera.'
                : 'Les modifications sont visibles en direct dans l’aperçu.'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-2 rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
        >
          {readOnly ? <X className="h-4 w-4" /> : null}
          {readOnly ? 'Fermer' : 'Terminé'}
        </button>
      </div>

      {!readOnly && (
        <div className="flex border-b md:hidden">
          {(['edit', 'preview'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setMobileView(v)}
              className={`flex flex-1 items-center justify-center gap-2 py-2.5 text-sm font-semibold ${
                mobileView === v ? 'border-b-2 border-violet-600 text-violet-700' : 'text-gray-500'
              }`}
            >
              {v === 'edit' ? <Pencil className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {v === 'edit' ? 'Écrire' : 'Aperçu'}
            </button>
          ))}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {!readOnly && (
          <div
            id="contract-studio-list"
            className={`${mobileView === 'edit' ? 'flex' : 'hidden'} w-full flex-col overflow-y-auto bg-gray-50 md:flex md:w-1/2 lg:w-[45%]`}
          >
            <div className="space-y-4 p-4 sm:p-6">
              <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-900">
                <p className="font-semibold">Comment ça marche ?</p>
                <p className="mt-1">
                  Votre contrat est découpé en <b>articles</b>. Chaque article a un titre et un texte.
                  Les numéros (Article 1, Article 2…) sont ajoutés tout seuls. Le nom du client, le véhicule,
                  les dates, le prix et les signatures sont déjà inclus automatiquement.
                </p>
              </div>

              {onSettingsChange && (
                <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
                  <button
                    type="button"
                    onClick={() => setShowHeader((v) => !v)}
                    className="flex w-full items-center justify-between gap-3 p-4 text-left"
                  >
                    <div>
                      <p className="text-sm font-semibold text-gray-900">En-tête du contrat</p>
                      <p className="text-xs text-gray-500">
                        {headerCustomized
                          ? 'Personnalisé — cliquez pour modifier'
                          : 'Renommer ou cacher les lignes du haut, ajouter vos propres lignes'}
                      </p>
                    </div>
                    <ChevronDown
                      className={`h-5 w-5 shrink-0 text-gray-400 transition-transform ${showHeader ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {showHeader && (
                    <div className="space-y-4 border-t px-4 pb-4 pt-3">
                      <p className="text-xs text-gray-500">
                        Les valeurs (nom du client, dates, prix…) sont remplies automatiquement à chaque réservation.
                        Vous pouvez changer le nom de chaque ligne ou la cacher.
                      </p>
                      <div className="space-y-2">
                        {(Object.keys(CONTRACT_SUMMARY_DEFAULT_LABELS) as ContractSummaryKey[]).map((k) => {
                          const visible = !hidden.has(k);
                          return (
                            <div
                              key={k}
                              className={`flex flex-col gap-2 rounded-lg border p-2.5 sm:flex-row sm:items-center ${
                                visible ? 'border-gray-200' : 'border-dashed border-gray-200 bg-gray-50 opacity-70'
                              }`}
                            >
                              <label className="flex shrink-0 items-center gap-2 text-xs font-medium text-gray-700 sm:w-24">
                                <input
                                  type="checkbox"
                                  checked={visible}
                                  onChange={() => toggleHidden(k)}
                                  className="h-4 w-4 accent-violet-600"
                                />
                                {visible ? 'Affichée' : 'Cachée'}
                              </label>
                              <input
                                value={st.labels?.[k] ?? ''}
                                onChange={(e) => setLabel(k, e.target.value)}
                                placeholder={CONTRACT_SUMMARY_DEFAULT_LABELS[k]}
                                disabled={!visible}
                                className="min-w-0 flex-1 rounded-md border border-gray-300 px-2.5 py-1.5 text-sm font-semibold disabled:bg-gray-100"
                              />
                              <span className="text-xs italic text-gray-400 sm:w-44 sm:text-right">
                                {SUMMARY_EXAMPLES[k]}
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      <div>
                        <p className="text-sm font-semibold text-gray-900">Vos lignes en plus</p>
                        <p className="mb-2 text-xs text-gray-500">
                          Ex. « Kilométrage » : « Illimité », ou « Carburant » : « Plein à plein ».
                        </p>
                        <div className="space-y-2">
                          {extraRows.map((r, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <input
                                value={r.label}
                                onChange={(e) =>
                                  setExtraRows(extraRows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                                }
                                placeholder="Nom de la ligne"
                                className="w-2/5 min-w-0 rounded-md border border-gray-300 px-2.5 py-1.5 text-sm font-semibold"
                              />
                              <input
                                value={r.value}
                                onChange={(e) =>
                                  setExtraRows(extraRows.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))
                                }
                                placeholder="Valeur"
                                className="min-w-0 flex-1 rounded-md border border-gray-300 px-2.5 py-1.5 text-sm"
                              />
                              <button
                                type="button"
                                title="Supprimer la ligne"
                                onClick={() => setExtraRows(extraRows.filter((_, j) => j !== i))}
                                className="rounded-md p-1.5 text-red-500 hover:bg-red-50"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                        {extraRows.length < 15 && (
                          <button
                            type="button"
                            onClick={() => setExtraRows([...extraRows, { label: '', value: '' }])}
                            className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-violet-300 px-3 py-1.5 text-sm font-semibold text-violet-700 hover:bg-violet-50"
                          >
                            <Plus className="h-4 w-4" />
                            Ajouter une ligne
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {sections.length === 0 && (
                <div className="rounded-xl border-2 border-dashed border-gray-300 bg-white p-6 text-center">
                  <p className="text-base font-semibold text-gray-900">Votre contrat est vide</p>
                  <p className="mt-1 text-sm text-gray-500">
                    Le plus simple : partir de notre modèle, puis modifier ce que vous voulez.
                  </p>
                  <div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={useTemplate}
                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700"
                    >
                      <Sparkles className="h-4 w-4" />
                      Utiliser le modèle
                    </button>
                    <button
                      type="button"
                      onClick={() => addSection()}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-50"
                    >
                      <Plus className="h-4 w-4" />
                      Partir de zéro
                    </button>
                  </div>
                </div>
              )}

              {sections.map((s, i) => {
                if (s.title.trim()) articleNo += 1;
                return (
                  <div key={s.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <span className="rounded-md bg-green-100 px-2 py-0.5 text-xs font-bold text-green-800">
                        {s.title.trim() ? `Article ${articleNo}` : 'Texte d’introduction'}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          title="Monter"
                          disabled={i === 0}
                          onClick={() => move(i, -1)}
                          className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                        >
                          <ArrowUp className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          title="Descendre"
                          disabled={i === sections.length - 1}
                          onClick={() => move(i, 1)}
                          className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                        >
                          <ArrowDown className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          title="Supprimer"
                          onClick={() => remove(s)}
                          className="rounded-md p-1.5 text-red-500 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <label className="text-xs font-medium text-gray-500">Titre</label>
                    <input
                      value={s.title}
                      onChange={(e) => patch(s.id, { title: e.target.value })}
                      placeholder="Ex : Carburant"
                      className="mb-3 mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-violet-300"
                    />
                    <label className="text-xs font-medium text-gray-500">Texte</label>
                    <textarea
                      ref={(el) => {
                        bodyRefs.current[s.id] = el;
                      }}
                      value={s.body}
                      onFocus={() => setFocusedId(s.id)}
                      onChange={(e) => patch(s.id, { body: e.target.value })}
                      rows={Math.min(12, Math.max(3, s.body.split('\n').length + 1))}
                      placeholder="Écrivez la règle comme vous l’expliqueriez au client."
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base leading-relaxed focus:outline-none focus:ring-2 focus:ring-violet-300"
                    />
                    {focusedId === s.id ? (
                      <>
                        <p className="mt-2 text-xs text-gray-500">
                          Insérer une info remplie automatiquement à chaque réservation :
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {CONTRACT_VARIABLES.map((v) => (
                            <button
                              key={v.token}
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => insertVariable(s, v.token)}
                              className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-800 hover:bg-sky-100"
                            >
                              + {v.label}
                            </button>
                          ))}
                        </div>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setFocusedId(s.id);
                          bodyRefs.current[s.id]?.focus();
                        }}
                        className="mt-2 text-xs font-medium text-sky-700 hover:underline"
                      >
                        + Insérer une info automatique (nom du client, dates, prix…)
                      </button>
                    )}
                  </div>
                );
              })}

              {sections.length > 0 && (
                <div className="space-y-3">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => addSection()}
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border-2 border-dashed border-violet-300 bg-white px-4 py-3 text-sm font-semibold text-violet-700 hover:bg-violet-50"
                    >
                      <Plus className="h-4 w-4" />
                      Ajouter un article vide
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowClauses((v) => !v)}
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-700"
                    >
                      <Sparkles className="h-4 w-4" />
                      Ajouter une règle toute prête
                    </button>
                  </div>
                </div>
              )}

              {(showClauses || sections.length === 0) && (
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <p className="text-sm font-semibold text-gray-900">Règles toutes prêtes</p>
                  <p className="mb-3 text-xs text-gray-500">Cliquez pour l’ajouter, vous pourrez modifier le texte ensuite.</p>
                  <div className="flex flex-wrap gap-2">
                    {CLAUSES.map((c) => {
                      const used = usedTitles.has(c.title.toLowerCase());
                      return (
                        <button
                          key={c.title}
                          type="button"
                          disabled={used}
                          onClick={() => addSection(c.title, c.body)}
                          className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 hover:border-violet-400 hover:bg-violet-50 disabled:cursor-default disabled:border-green-200 disabled:bg-green-50 disabled:text-green-700"
                        >
                          {used ? '✓' : <Plus className="h-3.5 w-3.5" />}
                          {c.title}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <p className="pb-4 text-xs text-gray-400">
                Astuce : commencez une ligne par un tiret « - » pour faire une liste à puces.
              </p>
            </div>
          </div>
        )}

        <div
          className={`${readOnly || mobileView === 'preview' ? 'flex' : 'hidden'} min-h-0 w-full flex-col bg-gray-200 md:flex ${
            readOnly ? '' : 'md:w-1/2 lg:w-[55%]'
          }`}
        >
          <div className="flex items-center justify-between px-4 py-2 text-xs font-medium text-gray-600">
            <span className="inline-flex items-center gap-1.5">
              <Eye className="h-3.5 w-3.5" />
              Aperçu — ce que verra le client
            </span>
            {readOnly && onSwitchToCustom ? (
              <button
                type="button"
                onClick={onSwitchToCustom}
                className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700"
              >
                Écrire mes propres règles
              </button>
            ) : null}
          </div>
          <div className="min-h-0 flex-1 px-2 pb-2 sm:px-4 sm:pb-4">
            <iframe
              title="Aperçu du contrat"
              className="mx-auto block h-full w-full max-w-3xl rounded-lg border border-gray-300 bg-white shadow-lg"
              srcDoc={previewHtml}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
