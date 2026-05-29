import { useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Save, Loader2, Star, Eye, EyeOff,
  CheckCircle2, AlertCircle
} from 'lucide-react';
import { useTemplate, useCreateTemplate, useUpdateTemplate } from '../hooks/useTemplates';
import { FieldMapper, PORTAL_FIELDS } from '../components/templates/FieldMapper';
import type { Portal } from '../types';
import { PORTAL_COLORS } from '../types';
import clsx from 'clsx';
import toast from 'react-hot-toast';

const PORTALS: Portal[] = ['ALLEGRO', 'OTOMOTO', 'AUTOLINE'];

const DEFAULT_CONFIGS: Record<Portal, Record<string, unknown>> = {
  ALLEGRO: { categoryId: '257517', duration: 30, location: 'Warszawa', countryCode: 'PL', postCode: '00-001' },
  OTOMOTO: { city: 'Warszawa', region: 'mazowieckie' },
  AUTOLINE: { currency: 'PLN', country: 'PL' },
};

const DEFAULT_MAPPINGS: Record<Portal, Record<string, string>> = {
  ALLEGRO:  { title: '{{name}} OEM:{{oemNumber}}', price: 'priceBrutto', quantity: 'stock', ean: 'ean' },
  OTOMOTO:  { title: '{{name}}', price: 'priceNet' },
  AUTOLINE: { article_name: '{{name}}', price: 'priceNet', currency: 'PLN', quantity: 'stock', country: 'PL', oem_number: 'oemNumber' },
};

export default function TemplateEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate   = useNavigate();
  const isEdit     = !!id && id !== 'new';

  const { data: existing, isLoading } = useTemplate(isEdit ? id : '');
  const createTemplate = useCreateTemplate();
  const updateTemplate = useUpdateTemplate(id ?? '');

  // Form state
  const [name,        setName]        = useState('');
  const [description, setDescription] = useState('');
  const [portal,      setPortal]      = useState<Portal>('ALLEGRO');
  const [isDefault,   setIsDefault]   = useState(false);
  const [isActive,    setIsActive]    = useState(true);
  const [mapping,     setMapping]     = useState<Record<string, string>>(DEFAULT_MAPPINGS.ALLEGRO);
  const [config,      setConfig]      = useState<Record<string, unknown>>(DEFAULT_CONFIGS.ALLEGRO);
  const [portalCategoryId,   setPortalCategoryId]   = useState('');
  const [portalCategoryName, setPortalCategoryName] = useState('');

  // Załaduj istniejący szablon
  useEffect(() => {
    if (existing) {
      setName(existing.name);
      setDescription(existing.description ?? '');
      setPortal(existing.portal);
      setIsDefault(existing.isDefault);
      setIsActive(existing.isActive);
      setPortalCategoryId(existing.portalCategoryId ?? '');
      setPortalCategoryName(existing.portalCategoryName ?? '');
      try { setMapping(JSON.parse(existing.fieldMapping)); } catch { /* keep default */ }
      try { setConfig(JSON.parse(existing.portalConfig)); } catch { /* keep default */ }
    }
  }, [existing]);

  // Zmiana portalu resetuje mapowanie na domyślne (tylko przy tworzeniu)
  function handlePortalChange(p: Portal) {
    setPortal(p);
    if (!isEdit) {
      setMapping(DEFAULT_MAPPINGS[p]);
      setConfig(DEFAULT_CONFIGS[p]);
    }
  }

  const handleMappingChange = useCallback(
    (newMapping: Record<string, string>, newConfig: Record<string, unknown>) => {
      setMapping(newMapping);
      setConfig(newConfig);
    },
    [],
  );

  // Walidacja
  const portalFields  = PORTAL_FIELDS[portal];
  const requiredKeys  = portalFields.filter((f) => f.required).map((f) => f.key);
  const missingFields = requiredKeys.filter((k) => !mapping[k]?.trim());
  const isValid       = name.trim().length >= 2 && missingFields.length === 0;

  async function handleSave() {
    if (!isValid) {
      toast.error('Uzupełnij wymagane pola');
      return;
    }

    const payload = {
      name:                name.trim(),
      description:         description.trim() || null,
      portal,
      isDefault,
      isActive,
      fieldMapping:        mapping as unknown as string,
      portalConfig:        config as unknown as string,
      portalCategoryId:    portalCategoryId || null,
      portalCategoryName:  portalCategoryName || null,
    };

    if (isEdit) {
      await updateTemplate.mutateAsync(payload);
      navigate('/templates');
    } else {
      const tmpl = await createTemplate.mutateAsync(payload);
      navigate('/templates');
      void tmpl;
    }
  }

  if (isEdit && isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 size={24} className="animate-spin text-brand-400" />
      </div>
    );
  }

  const isSaving = createTemplate.isPending || updateTemplate.isPending;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/templates" className="btn-secondary py-1.5 px-2">
          <ArrowLeft size={16} />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">
            {isEdit ? 'Edytuj szablon' : 'Nowy szablon'}
          </h1>
          {isEdit && <p className="text-sm text-slate-500 mt-0.5">{existing?.name}</p>}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={!isValid || isSaving}
            className="btn-primary"
          >
            {isSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            {isEdit ? 'Zapisz zmiany' : 'Utwórz szablon'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-5">
        {/* ── Lewy panel: metadane szablonu ── */}
        <div className="col-span-1 space-y-4">
          <div className="card p-4 space-y-4">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Ustawienia szablonu</h2>

            <div>
              <label className="label">Nazwa szablonu *</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input"
                placeholder="np. Allegro – standard"
              />
            </div>

            <div>
              <label className="label">Opis (opcjonalny)</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="input resize-none text-sm"
                placeholder="Krótki opis szablonu..."
              />
            </div>

            <div>
              <label className="label">Portal *</label>
              {isEdit ? (
                <div className={clsx('badge border text-sm px-3 py-1.5 w-full justify-center', PORTAL_COLORS[portal])}>
                  {portal}
                </div>
              ) : (
                <div className="flex gap-1.5">
                  {PORTALS.map((p) => (
                    <button
                      key={p}
                      onClick={() => handlePortalChange(p)}
                      className={clsx(
                        'flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all',
                        portal === p
                          ? `border-current ${PORTAL_COLORS[p]}`
                          : 'border-slate-700 text-slate-500 hover:border-slate-600',
                      )}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="label">Kategoria w portalu</label>
              <div className="space-y-1.5">
                <input
                  value={portalCategoryId}
                  onChange={(e) => setPortalCategoryId(e.target.value)}
                  className="input text-sm font-mono"
                  placeholder="ID kategorii"
                />
                <input
                  value={portalCategoryName}
                  onChange={(e) => setPortalCategoryName(e.target.value)}
                  className="input text-sm"
                  placeholder="Nazwa kategorii (opcjonalnie)"
                />
              </div>
            </div>

            <div className="space-y-2.5 pt-1">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox" checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                  className="accent-brand-500 w-4 h-4"
                />
                <div>
                  <div className="flex items-center gap-1 text-sm text-slate-200">
                    <Star size={12} className="text-yellow-400 fill-yellow-400" />
                    Domyślny szablon
                  </div>
                  <div className="text-xs text-slate-500">Używany przy „Wystaw na wszystkie portale"</div>
                </div>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox" checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="accent-brand-500 w-4 h-4"
                />
                <div>
                  <div className="flex items-center gap-1 text-sm text-slate-200">
                    {isActive ? <Eye size={12} className="text-green-400" /> : <EyeOff size={12} className="text-slate-500" />}
                    {isActive ? 'Aktywny' : 'Nieaktywny'}
                  </div>
                  <div className="text-xs text-slate-500">Nieaktywne szablony są pomijane</div>
                </div>
              </label>
            </div>
          </div>

          {/* Walidacja */}
          <div className="card p-4 space-y-2">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Status</h3>
            {missingFields.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-green-400">
                <CheckCircle2 size={14} />
                Wszystkie wymagane pola wypełnione
              </div>
            ) : (
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-red-400">
                  <AlertCircle size={14} />
                  Brakujące pola wymagane:
                </div>
                {missingFields.map((k) => (
                  <div key={k} className="text-xs text-red-400/70 font-mono pl-5">• {k}</div>
                ))}
              </div>
            )}
          </div>

          {/* Legenda typów */}
          <div className="card p-4 space-y-2">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Typy wartości</h3>
            <div className="space-y-2 text-xs text-slate-500">
              <div><span className="text-brand-400 font-medium">Pole</span> — bezpośrednia referencja do pola Part (np. <code className="text-brand-400 font-mono">priceNet</code>)</div>
              <div><span className="text-purple-400 font-medium">Szablon</span> — interpolacja z <code className="text-purple-400 font-mono">{'{{pole}}'}</code> (np. <code className="text-purple-400 font-mono">{'{{name}} OEM:{{oemNumber}}'}</code>)</div>
              <div><span className="text-amber-400 font-medium">Stała</span> — wartość wpisana ręcznie (np. <code className="text-amber-400 font-mono">Warszawa</code>, <code className="text-amber-400 font-mono">PLN</code>)</div>
            </div>
          </div>
        </div>

        {/* ── Prawy panel: mapper ── */}
        <div className="col-span-2">
          <div className="card overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-800">
              <h2 className="text-sm font-semibold text-white">
                Mapowanie pól — {portal}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Przypisz pola portalu do danych z bazy części
              </p>
            </div>

            <FieldMapper
              portal={portal}
              fieldMapping={mapping}
              portalConfig={config}
              onChange={handleMappingChange}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
