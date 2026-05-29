/**
 * FieldMapper
 * -----------
 * Wizualny edytor mapowania pól szablonu.
 * 
 * Lewa strona  — pola portalu (target fields wymagane przez Allegro/Otomoto/Autoline)
 * Prawa strona — pola Part (źródła danych)
 * 
 * Każde pole portalu można:
 *  - przypisać do pola Part (select)
 *  - wpisać szablon z interpolacją {{pole}}
 *  - wpisać wartość statyczną
 *  - pozostawić puste (niewymagane)
 */

import { useState, useCallback } from 'react';
import {
  ChevronRight, Plus, Trash2, Info,
  AlertCircle, CheckCircle2, Code2, Link2, Type
} from 'lucide-react';
import clsx from 'clsx';
import type { Portal } from '../../types';

// ── Definicje pól portali ─────────────────────

export interface PortalField {
  key:         string;
  label:       string;
  required:    boolean;
  type:        'string' | 'number' | 'template' | 'select';
  description: string;
  example?:    string;
  options?:    string[];          // dla type='select'
  maxLength?:  number;
}

export const PORTAL_FIELDS: Record<Portal, PortalField[]> = {
  ALLEGRO: [
    { key: 'title',        label: 'Tytuł oferty',         required: true,  type: 'template', description: 'Max 75 znaków. Widoczny w wynikach wyszukiwania.', example: '{{name}} OEM:{{oemNumber}}', maxLength: 75 },
    { key: 'price',        label: 'Cena (PLN)',            required: true,  type: 'string',   description: 'Referencja do pola cenowego lub wartość liczbowa.', example: 'priceBrutto' },
    { key: 'quantity',     label: 'Ilość',                 required: true,  type: 'string',   description: 'Stan magazynowy.', example: 'stock' },
    { key: 'ean',          label: 'EAN / GTIN',            required: false, type: 'string',   description: 'Kod kreskowy produktu.', example: 'ean' },
    { key: 'categoryId',   label: 'ID kategorii Allegro',  required: true,  type: 'string',   description: 'ID kategorii z drzewa kategorii Allegro.', example: '257517' },
    { key: 'condition',    label: 'Stan produktu',         required: true,  type: 'select',   description: 'Stan: NEW lub USED.', options: ['NEW', 'USED'], example: 'NEW' },
    { key: 'description',  label: 'Opis (HTML)',           required: false, type: 'template', description: 'Opis oferty. Obsługuje HTML. Generowany automatycznie jeśli puste.', example: '{{descriptionLong}}' },
    { key: 'location',     label: 'Miasto',               required: false, type: 'string',   description: 'Np. Warszawa', example: 'Warszawa' },
    { key: 'duration',     label: 'Czas trwania (dni)',   required: false, type: 'string',   description: 'Domyślnie 30 dni.', example: '30' },
    { key: 'shippingRates',label: 'ID zestawu wysyłki',   required: false, type: 'string',   description: 'ID z /api/allegro/shipping-rates.', example: '' },
  ],
  OTOMOTO: [
    { key: 'title',        label: 'Tytuł ogłoszenia',      required: true,  type: 'template', description: 'Max 70 znaków.', example: '{{name}} OEM:{{oemNumber}}', maxLength: 70 },
    { key: 'price',        label: 'Cena netto (PLN)',       required: true,  type: 'string',   description: 'Cena bez VAT.', example: 'priceNet' },
    { key: 'description',  label: 'Opis ogłoszenia',        required: false, type: 'template', description: 'Tekst bez HTML. Generowany automatycznie.', example: '{{descriptionShort}}' },
    { key: 'city',         label: 'Miasto',                 required: true,  type: 'string',   description: 'Np. Warszawa', example: 'Warszawa' },
    { key: 'region',       label: 'Województwo',            required: false, type: 'string',   description: 'Np. mazowieckie', example: 'mazowieckie' },
    { key: 'phone',        label: 'Telefon kontaktowy',     required: false, type: 'string',   description: 'Numer telefonu w formacie +48...', example: '+48500000000' },
    { key: 'brand',        label: 'Marka pojazdu',          required: false, type: 'string',   description: 'Nadpisuje dane z kompatybilności.', example: 'MAN' },
    { key: 'model',        label: 'Model pojazdu',          required: false, type: 'string',   description: 'Nadpisuje dane z kompatybilności.', example: 'TGX' },
  ],
  AUTOLINE: [
    { key: 'article_name', label: 'Nazwa części',           required: true,  type: 'template', description: 'Max 200 znaków.', example: '{{name}}', maxLength: 200 },
    { key: 'price',        label: 'Cena',                   required: true,  type: 'string',   description: 'Cena netto lub brutto.', example: 'priceNet' },
    { key: 'currency',     label: 'Waluta',                 required: true,  type: 'select',   description: 'Kod waluty.', options: ['PLN', 'EUR', 'USD'], example: 'PLN' },
    { key: 'quantity',     label: 'Ilość',                  required: true,  type: 'string',   description: 'Stan magazynowy.', example: 'stock' },
    { key: 'country',      label: 'Kraj',                   required: true,  type: 'select',   description: 'Kod kraju.', options: ['PL', 'DE', 'UA', 'CZ', 'SK', 'HU', 'LT', 'LV', 'EE'], example: 'PL' },
    { key: 'region',       label: 'Region/Województwo',     required: false, type: 'string',   description: 'Region w kraju.', example: 'mazowieckie' },
    { key: 'oem_number',   label: 'Numer OEM',              required: false, type: 'string',   description: 'Numer OEM producenta.', example: 'oemNumber' },
    { key: 'catalog_ref',  label: 'Nr katalogowy',          required: false, type: 'string',   description: 'Wewnętrzny numer katalogowy.', example: 'catalogNumber' },
    { key: 'part_type',    label: 'Typ części',             required: false, type: 'string',   description: 'Kategoria Autoline. Generowana automatycznie.', example: '' },
    { key: 'description',  label: 'Opis',                   required: false, type: 'template', description: 'Opis tekstowy. Generowany automatycznie.', example: '{{descriptionShort}}' },
  ],
};

// ── Pola Part dostępne jako źródła ───────────

export interface PartField {
  key:      string;
  label:    string;
  type:     'string' | 'number' | 'enum' | 'computed';
  example:  string;
  group:    string;
}

export const PART_FIELDS: PartField[] = [
  // Identyfikacja
  { key: 'name',             label: 'Nazwa części',          type: 'string',   example: 'Tarcza hamulcowa MAN TGX', group: 'Identyfikacja' },
  { key: 'oemNumber',        label: 'Numer OEM',             type: 'string',   example: '81508030068',              group: 'Identyfikacja' },
  { key: 'catalogNumber',    label: 'Nr katalogowy',         type: 'string',   example: 'THM-001',                  group: 'Identyfikacja' },
  { key: 'ean',              label: 'EAN/GTIN',              type: 'string',   example: '5901234123457',            group: 'Identyfikacja' },
  // Klasyfikacja
  { key: 'category',         label: 'Kategoria',             type: 'string',   example: 'hamulce',                  group: 'Klasyfikacja' },
  { key: 'subcategory',      label: 'Podkategoria',          type: 'string',   example: 'tarcze',                   group: 'Klasyfikacja' },
  { key: 'condition',        label: 'Stan (en)',             type: 'enum',     example: 'NEW',                      group: 'Klasyfikacja' },
  { key: 'condition_pl',     label: 'Stan (pl)',             type: 'computed', example: 'Nowa',                     group: 'Klasyfikacja' },
  // Ceny
  { key: 'priceNet',         label: 'Cena netto',            type: 'number',   example: '350.00',                   group: 'Ceny' },
  { key: 'priceBrutto',      label: 'Cena brutto',           type: 'number',   example: '430.50',                   group: 'Ceny' },
  { key: 'vatRate',          label: 'Stawka VAT (%)',        type: 'number',   example: '23',                       group: 'Ceny' },
  // Magazyn
  { key: 'stock',            label: 'Stan magazynowy',       type: 'number',   example: '15',                       group: 'Magazyn' },
  { key: 'stockMin',         label: 'Min. stan',             type: 'number',   example: '1',                        group: 'Magazyn' },
  // Opisy
  { key: 'descriptionShort', label: 'Krótki opis',           type: 'string',   example: 'Tarcza oś przednia',       group: 'Opisy' },
  { key: 'descriptionLong',  label: 'Pełny opis (HTML)',     type: 'string',   example: '<p>Opis...</p>',           group: 'Opisy' },
  // Obliczone
  { key: 'compatibility_text', label: 'Lista kompatybilności', type: 'computed', example: 'MAN TGX 18.400 2007–2020', group: 'Obliczone' },
  { key: 'cover_image_url',    label: 'URL zdjęcia głównego', type: 'computed', example: '/uploads/abc.jpg',          group: 'Obliczone' },
];

// ── Typy wartości wiersza mapowania ───────────

type MappingValueType = 'field' | 'template' | 'static';

interface MappingRow {
  portalKey:  string;
  valueType:  MappingValueType;
  value:      string;           // klucz pola Part, szablon {{...}} lub wartość statyczna
}

// ── Pomocniki ─────────────────────────────────

function parseMappingToRows(
  mapping:     Record<string, unknown>,
  portalFields: PortalField[],
): MappingRow[] {
  return portalFields.map((pf) => {
    const raw = mapping[pf.key];
    if (raw == null) return { portalKey: pf.key, valueType: 'field', value: '' };

    const str = String(raw);
    if (str.includes('{{')) return { portalKey: pf.key, valueType: 'template', value: str };
    // Sprawdź czy to klucz pola Part
    if (PART_FIELDS.some((f) => f.key === str)) return { portalKey: pf.key, valueType: 'field', value: str };
    // Inaczej statyczna wartość
    return { portalKey: pf.key, valueType: 'static', value: str };
  });
}

function rowsToMapping(rows: MappingRow[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const row of rows) {
    if (row.value.trim()) result[row.portalKey] = row.value.trim();
  }
  return result;
}

// ── Komponenty wiersza ────────────────────────

const VALUE_TYPE_ICONS: Record<MappingValueType, React.ReactNode> = {
  field:    <Link2 size={11} />,
  template: <Code2 size={11} />,
  static:   <Type size={11}  />,
};

const VALUE_TYPE_LABELS: Record<MappingValueType, string> = {
  field:    'Pole',
  template: 'Szablon',
  static:   'Stała',
};

const VALUE_TYPE_COLORS: Record<MappingValueType, string> = {
  field:    'text-brand-400 bg-brand-500/15',
  template: 'text-purple-400 bg-purple-500/15',
  static:   'text-amber-400 bg-amber-500/15',
};

function MappingRowEditor({
  row,
  field,
  onChange,
}: {
  row:      MappingRow;
  field:    PortalField;
  onChange: (row: MappingRow) => void;
}) {
  const [showTip, setShowTip] = useState(false);

  // Grupowanie pól Part dla selecta
  const groups = PART_FIELDS.reduce<Record<string, PartField[]>>((acc, f) => {
    if (!acc[f.group]) acc[f.group] = [];
    acc[f.group].push(f);
    return acc;
  }, {});

  const isFilled = row.value.trim().length > 0;

  return (
    <div className={clsx(
      'grid grid-cols-[1fr_auto_1fr_auto] gap-2 items-center py-2.5 px-4 border-b border-slate-800/60',
      'hover:bg-slate-900/30 transition-colors group',
    )}>
      {/* Portal field info */}
      <div className="flex items-center gap-2 min-w-0">
        {field.required ? (
          <span className="text-red-400 shrink-0 text-xs">*</span>
        ) : (
          <span className="text-slate-700 shrink-0 text-xs">○</span>
        )}
        <div className="min-w-0">
          <span className="text-sm text-slate-200 font-medium">{field.label}</span>
          <div className="flex items-center gap-1.5">
            <code className="text-xs text-slate-600 font-mono">{field.key}</code>
            {field.maxLength && (
              <span className="text-xs text-slate-600">max {field.maxLength}</span>
            )}
          </div>
        </div>
        <button
          onClick={() => setShowTip((v) => !v)}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-600 hover:text-slate-400 shrink-0"
        >
          <Info size={12} />
        </button>
      </div>

      {/* Arrow + type badge */}
      <div className="flex items-center gap-1.5 px-1">
        <ChevronRight size={12} className="text-slate-700" />
        <button
          onClick={() => {
            const types: MappingValueType[] = ['field', 'template', 'static'];
            const next = types[(types.indexOf(row.valueType) + 1) % types.length];
            onChange({ ...row, valueType: next, value: '' });
          }}
          className={clsx(
            'flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium transition-colors',
            VALUE_TYPE_COLORS[row.valueType],
          )}
          title="Kliknij aby zmienić typ (Pole / Szablon / Stała)"
        >
          {VALUE_TYPE_ICONS[row.valueType]}
          {VALUE_TYPE_LABELS[row.valueType]}
        </button>
      </div>

      {/* Value input */}
      <div className="min-w-0">
        {row.valueType === 'field' && (
          <select
            value={row.value}
            onChange={(e) => onChange({ ...row, value: e.target.value })}
            className={clsx(
              'w-full px-2 py-1.5 bg-slate-800 border rounded-lg text-xs font-mono transition-colors',
              isFilled
                ? 'border-brand-700/50 text-brand-300'
                : field.required
                  ? 'border-red-900/50 text-slate-500'
                  : 'border-slate-700 text-slate-500',
            )}
          >
            <option value="">— nie mapuj —</option>
            {Object.entries(groups).map(([group, fields]) => (
              <optgroup key={group} label={group}>
                {fields.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label} ({f.example})
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        )}

        {row.valueType === 'template' && (
          <input
            value={row.value}
            onChange={(e) => onChange({ ...row, value: e.target.value })}
            placeholder={field.example ?? `{{name}} OEM:{{oemNumber}}`}
            className={clsx(
              'w-full px-2 py-1.5 bg-slate-800 border rounded-lg text-xs font-mono transition-colors',
              isFilled
                ? 'border-purple-700/50 text-purple-300'
                : 'border-slate-700 text-slate-500',
            )}
          />
        )}

        {row.valueType === 'static' && (
          field.options ? (
            <select
              value={row.value}
              onChange={(e) => onChange({ ...row, value: e.target.value })}
              className={clsx(
                'w-full px-2 py-1.5 bg-slate-800 border rounded-lg text-xs font-mono transition-colors',
                isFilled ? 'border-amber-700/50 text-amber-300' : 'border-slate-700 text-slate-500',
              )}
            >
              <option value="">— wybierz —</option>
              {field.options.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : (
            <input
              value={row.value}
              onChange={(e) => onChange({ ...row, value: e.target.value })}
              placeholder={field.example ?? 'wartość statyczna'}
              className={clsx(
                'w-full px-2 py-1.5 bg-slate-800 border rounded-lg text-xs font-mono transition-colors',
                isFilled ? 'border-amber-700/50 text-amber-300' : 'border-slate-700 text-slate-500',
              )}
            />
          )
        )}
      </div>

      {/* Status */}
      <div className="w-5 flex justify-center">
        {field.required && !isFilled
          ? <AlertCircle size={13} className="text-red-500" />
          : isFilled
            ? <CheckCircle2 size={13} className="text-green-500/60" />
            : null
        }
      </div>

      {/* Tooltip */}
      {showTip && (
        <div className="col-span-4 px-4 pb-2">
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-400 space-y-1">
            <p>{field.description}</p>
            {field.example && (
              <p className="text-slate-500">
                Przykład: <code className="text-brand-400 font-mono">{field.example}</code>
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── PortalConfig editor ───────────────────────

interface PortalConfigEditorProps {
  portal:  Portal;
  config:  Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}

const PORTAL_CONFIG_FIELDS: Record<Portal, Array<{ key: string; label: string; placeholder: string; type?: string }>> = {
  ALLEGRO: [
    { key: 'categoryId',          label: 'ID kategorii Allegro',   placeholder: '257517' },
    { key: 'deliveryShippingRates', label: 'ID zestawu wysyłki',   placeholder: 'UUID z /api/allegro/shipping-rates' },
    { key: 'duration',            label: 'Czas trwania oferty (dni)', placeholder: '30', type: 'number' },
    { key: 'location',            label: 'Miasto wystawcy',        placeholder: 'Warszawa' },
    { key: 'postCode',            label: 'Kod pocztowy',           placeholder: '00-001' },
  ],
  OTOMOTO: [
    { key: 'city',   label: 'Miasto',        placeholder: 'Warszawa' },
    { key: 'region', label: 'Województwo',   placeholder: 'mazowieckie' },
    { key: 'phone',  label: 'Telefon',       placeholder: '+48500000000' },
  ],
  AUTOLINE: [
    { key: 'currency', label: 'Waluta',     placeholder: 'PLN' },
    { key: 'country',  label: 'Kraj',       placeholder: 'PL' },
    { key: 'region',   label: 'Region',     placeholder: 'mazowieckie' },
  ],
};

function PortalConfigEditor({ portal, config, onChange }: PortalConfigEditorProps) {
  const fields = PORTAL_CONFIG_FIELDS[portal];
  return (
    <div className="space-y-3">
      {fields.map((f) => (
        <div key={f.key} className="grid grid-cols-2 gap-3 items-center">
          <label className="text-xs text-slate-400">{f.label}</label>
          <input
            type={f.type ?? 'text'}
            value={String(config[f.key] ?? '')}
            onChange={(e) => onChange({ ...config, [f.key]: f.type === 'number' ? Number(e.target.value) : e.target.value })}
            placeholder={f.placeholder}
            className="input text-xs font-mono py-1.5"
          />
        </div>
      ))}
    </div>
  );
}

// ── Główny komponent ──────────────────────────

export interface FieldMapperProps {
  portal:       Portal;
  fieldMapping: Record<string, unknown>;
  portalConfig: Record<string, unknown>;
  onChange:     (mapping: Record<string, string>, config: Record<string, unknown>) => void;
}

export function FieldMapper({ portal, fieldMapping, portalConfig, onChange }: FieldMapperProps) {
  const portalFields = PORTAL_FIELDS[portal];
  const [rows, setRows]     = useState<MappingRow[]>(() => parseMappingToRows(fieldMapping, portalFields));
  const [config, setConfig] = useState<Record<string, unknown>>(portalConfig);
  const [activeTab, setActiveTab] = useState<'fields' | 'config' | 'preview'>('fields');

  const updateRow = useCallback((idx: number, updated: MappingRow) => {
    setRows((prev) => {
      const next = [...prev];
      next[idx] = updated;
      const mapping = rowsToMapping(next);
      onChange(mapping, config);
      return next;
    });
  }, [config, onChange]);

  const updateConfig = useCallback((newConfig: Record<string, unknown>) => {
    setConfig(newConfig);
    const mapping = rowsToMapping(rows);
    onChange(mapping, newConfig);
  }, [rows, onChange]);

  const requiredFilled  = portalFields.filter((f) => f.required).every((f) => rows.find((r) => r.portalKey === f.key)?.value.trim());
  const filledCount     = rows.filter((r) => r.value.trim()).length;

  // Podgląd JSON
  const previewMapping  = rowsToMapping(rows);
  const previewJson     = JSON.stringify(previewMapping, null, 2);
  const configJson      = JSON.stringify(config, null, 2);

  return (
    <div className="space-y-0">
      {/* Tabs */}
      <div className="flex items-center gap-0 border-b border-slate-800">
        {([
          ['fields',  'Mapowanie pól'],
          ['config',  'Konfiguracja portalu'],
          ['preview', 'Podgląd JSON'],
        ] as const).map(([tab, label]) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={clsx(
              'px-4 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors',
              activeTab === tab
                ? 'border-brand-500 text-brand-400'
                : 'border-transparent text-slate-500 hover:text-slate-300',
            )}
          >
            {label}
          </button>
        ))}

        {/* Status pill */}
        <div className="ml-auto px-4 flex items-center gap-1.5">
          <span className={clsx(
            'text-xs px-2 py-0.5 rounded-full font-medium',
            requiredFilled
              ? 'bg-green-500/15 text-green-400'
              : 'bg-red-500/15 text-red-400',
          )}>
            {filledCount}/{portalFields.length} pól
          </span>
        </div>
      </div>

      {/* Tab: Fields */}
      {activeTab === 'fields' && (
        <div>
          {/* Legend */}
          <div className="flex gap-3 px-4 py-2 border-b border-slate-800 bg-slate-900/30">
            {(['field', 'template', 'static'] as const).map((t) => (
              <div key={t} className={clsx('flex items-center gap-1 text-xs', VALUE_TYPE_COLORS[t])}>
                {VALUE_TYPE_ICONS[t]}
                <span className="font-medium">{VALUE_TYPE_LABELS[t]}</span>
                <span className="text-slate-600 ml-0.5">
                  {t === 'field' && '— klucz pola Part'}
                  {t === 'template' && '— np. {{name}} OEM:{{oemNumber}}'}
                  {t === 'static' && '— np. Warszawa, PLN, 30'}
                </span>
              </div>
            ))}
          </div>

          {/* Rows */}
          <div>
            {rows.map((row, idx) => (
              <MappingRowEditor
                key={row.portalKey}
                row={row}
                field={portalFields.find((f) => f.key === row.portalKey)!}
                onChange={(updated) => updateRow(idx, updated)}
              />
            ))}
          </div>

          {/* Custom field */}
          <AddCustomFieldRow portal={portal} onAdd={(key, value) => {
            const newRow: MappingRow = { portalKey: key, valueType: 'static', value };
            const newRows = [...rows, newRow];
            setRows(newRows);
            onChange(rowsToMapping(newRows), config);
          }} />
        </div>
      )}

      {/* Tab: Portal Config */}
      {activeTab === 'config' && (
        <div className="p-5">
          <p className="text-xs text-slate-500 mb-4">
            Ustawienia specyficzne dla portalu {portal} — używane przy wystawianiu niezależnie od mapowania pól.
          </p>
          <PortalConfigEditor portal={portal} config={config} onChange={updateConfig} />
        </div>
      )}

      {/* Tab: JSON Preview */}
      {activeTab === 'preview' && (
        <div className="p-4 space-y-4">
          <div>
            <p className="text-xs text-slate-500 mb-2 font-medium uppercase tracking-wide">fieldMapping</p>
            <pre className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-green-400 font-mono overflow-auto max-h-48">
              {previewJson}
            </pre>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-2 font-medium uppercase tracking-wide">portalConfig</p>
            <pre className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-purple-400 font-mono overflow-auto max-h-48">
              {configJson}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Dodaj niestandardowe pole ─────────────────
function AddCustomFieldRow({
  portal: _portal,
  onAdd,
}: {
  portal:  Portal;
  onAdd:   (key: string, value: string) => void;
}) {
  const [open,  setOpen]  = useState(false);
  const [key,   setKey]   = useState('');
  const [value, setValue] = useState('');

  return (
    <div className="px-4 py-2 border-t border-slate-800">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-400 transition-colors"
        >
          <Plus size={12} /> Dodaj niestandardowe pole
        </button>
      ) : (
        <div className="flex gap-2 items-center">
          <input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="klucz_pola"
            className="input text-xs font-mono py-1 w-36"
          />
          <ChevronRight size={12} className="text-slate-700 shrink-0" />
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="wartość lub {{pole}}"
            className="input text-xs font-mono py-1 flex-1"
          />
          <button
            onClick={() => { if (key && value) { onAdd(key, value); setKey(''); setValue(''); setOpen(false); } }}
            className="btn-primary py-1 px-2 text-xs"
          >
            <Plus size={11} />
          </button>
          <button onClick={() => setOpen(false)} className="text-slate-600 hover:text-slate-400">
            <Trash2 size={12} />
          </button>
        </div>
      )}
    </div>
  );
}
