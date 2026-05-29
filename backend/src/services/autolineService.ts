/**
 * AutolineService
 * ---------------
 * Autoline.eu nie udostępnia publicznego REST API dla zewnętrznych integratorów —
 * obsługuje import ogłoszeń przez **plik CSV lub XML** wgrywany do panelu konta
 * lub przesyłany na dedykowany FTP/SFTP.
 *
 * Ten serwis generuje gotowe do importu pliki w formatach:
 *   - CSV  (Autoline Standard CSV)
 *   - XML  (Autoline XML Feed)
 *
 * Specyfikacja pól: https://autoline.info/help/import
 */

import type { Part, Compatibility, PartImage } from '../utils/types';
import { applyFieldMapping } from './mappingService';
import type { Template } from '../utils/types';

// ── Typy ──────────────────────────────────────

type PartFull = Part & { images: PartImage[]; compatibility: Compatibility[] };

export interface AutolineRow {
  // Pola obowiązkowe
  article_name:  string;   // Nazwa części
  price:         string;   // Cena (bez walut, tylko liczba)
  currency:      string;   // PLN / EUR / USD
  quantity:      string;   // Ilość sztuk
  country:       string;   // Kod kraju: PL / DE / UA
  region?:       string;   // Województwo / region

  // Identyfikacja
  oem_number?:   string;   // Numer OEM
  catalog_ref?:  string;   // Numer katalogowy
  ean?:          string;   // EAN/GTIN

  // Marka/model pojazdu (główny z listy kompatybilności)
  make?:         string;   // Marka (MAN, Scania, Volvo...)
  model?:        string;   // Model (TGX 18.400...)
  year_from?:    string;
  year_to?:      string;

  // Klasyfikacja
  part_type?:    string;   // Typ części (kategoria Autoline)
  condition?:    string;   // new / used / regenerated

  // Opis
  description?:  string;
  tech_params?:  string;   // Parametry techniczne (JSON/tekst)

  // Zdjęcia (URL-e rozdzielone przecinkiem)
  images?:       string;
}

// Mapowanie kategorii Part → kategorie Autoline
const AUTOLINE_CATEGORIES: Record<string, string> = {
  hamulce:           'Brake system',
  silnik:            'Engine & components',
  skrzynia:          'Gearbox & transmission',
  zawieszenie:       'Suspension',
  elektryka:         'Electrical system',
  nadwozie:          'Body parts',
  uklad_kierowniczy: 'Steering system',
  uklad_wydechowy:   'Exhaust system',
  klimatyzacja:      'Air conditioning',
  oswietlenie:       'Lighting',
  filtry:            'Filters',
  pasy_i_napedy:     'Drive belts & chains',
  inne:              'Other parts',
};

// ── Budowanie wiersza ─────────────────────────

export function buildAutolineRow(
  part:     PartFull,
  template: Template,
  appBaseUrl: string = 'http://localhost:4000',
): AutolineRow {
  const fieldMapping = JSON.parse(template.fieldMapping) as Record<string, unknown>;
  const portalConfig = JSON.parse(template.portalConfig) as Record<string, unknown>;
  const mapped       = applyFieldMapping(part, fieldMapping);

  const firstCompat = part.compatibility[0];

  // Buduj opis tekstowy
  const descParts: string[] = [];
  if (part.descriptionShort) descParts.push(part.descriptionShort);
  if (part.descriptionLong) {
    descParts.push(part.descriptionLong.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
  }
  const description = descParts.join('\n').slice(0, 3000);

  // Parametry techniczne jako string
  let techParams = '';
  if (part.technicalParams) {
    const params = JSON.parse(part.technicalParams) as Record<string, string>;
    techParams = Object.entries(params).map(([k, v]) => `${k}: ${v}`).join('; ');
  }

  // Zdjęcia — pełne URL-e
  const imageUrls = part.images
    .map((i) => i.url.startsWith('http') ? i.url : `${appBaseUrl}${i.url}`)
    .join(',');

  const row: AutolineRow = {
    article_name: String(mapped.article_name ?? mapped.title ?? mapped.name ?? part.name).slice(0, 200),
    price:        String(mapped.price ?? part.priceNet),
    currency:     String(portalConfig.currency ?? 'PLN'),
    quantity:     String(mapped.quantity ?? part.stock),
    country:      String(portalConfig.country ?? 'PL'),
    region:       portalConfig.region as string | undefined,

    oem_number:   part.oemNumber  ?? undefined,
    catalog_ref:  part.catalogNumber ?? undefined,
    ean:          part.ean        ?? undefined,

    make:         firstCompat?.brand ?? portalConfig.make as string | undefined,
    model:        firstCompat?.model ?? portalConfig.model as string | undefined,
    year_from:    firstCompat?.yearFrom ? String(firstCompat.yearFrom) : undefined,
    year_to:      firstCompat?.yearTo   ? String(firstCompat.yearTo)   : undefined,

    part_type:    AUTOLINE_CATEGORIES[part.category] ?? 'Other parts',
    condition:    part.condition === 'NEW' ? 'new' : part.condition === 'REGENERATED' ? 'regenerated' : 'used',

    description:  description || undefined,
    tech_params:  techParams  || undefined,
    images:       imageUrls   || undefined,
  };

  return row;
}

// ── CSV generator ─────────────────────────────

// Kolumny CSV w kolejności wymaganej przez Autoline
const CSV_COLUMNS: Array<keyof AutolineRow> = [
  'article_name', 'price', 'currency', 'quantity', 'country', 'region',
  'oem_number', 'catalog_ref', 'ean',
  'make', 'model', 'year_from', 'year_to',
  'part_type', 'condition',
  'description', 'tech_params', 'images',
];

function csvEscape(value: string | undefined): string {
  if (value == null || value === '') return '';
  // Jeśli zawiera przecinek, cudzysłów lub newline – otocz cudzysłowami
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function generateCsv(rows: AutolineRow[]): string {
  const header = CSV_COLUMNS.join(',');
  const lines  = rows.map((row) =>
    CSV_COLUMNS.map((col) => csvEscape(row[col])).join(','),
  );
  return [header, ...lines].join('\r\n');
}

// ── XML generator ─────────────────────────────

function xmlEscape(value: string | undefined): string {
  if (!value) return '';
  return value
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&apos;');
}

function xmlTag(tag: string, value: string | undefined): string {
  if (!value) return '';
  return `    <${tag}>${xmlEscape(value)}</${tag}>`;
}

export function generateXml(rows: AutolineRow[], feedTitle = 'Mini Baselinker Export'): string {
  const now = new Date().toISOString();

  const items = rows.map((row) => {
    const fields = [
      xmlTag('article_name', row.article_name),
      xmlTag('price',        row.price),
      xmlTag('currency',     row.currency),
      xmlTag('quantity',     row.quantity),
      xmlTag('country',      row.country),
      xmlTag('region',       row.region),
      xmlTag('oem_number',   row.oem_number),
      xmlTag('catalog_ref',  row.catalog_ref),
      xmlTag('ean',          row.ean),
      xmlTag('make',         row.make),
      xmlTag('model',        row.model),
      xmlTag('year_from',    row.year_from),
      xmlTag('year_to',      row.year_to),
      xmlTag('part_type',    row.part_type),
      xmlTag('condition',    row.condition),
      xmlTag('description',  row.description),
      xmlTag('tech_params',  row.tech_params),
      xmlTag('images',       row.images),
    ].filter(Boolean).join('\n');

    return `  <item>\n${fields}\n  </item>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<autoline_feed>
  <meta>
    <title>${xmlEscape(feedTitle)}</title>
    <generated>${now}</generated>
    <count>${rows.length}</count>
  </meta>
  <items>
${items}
  </items>
</autoline_feed>`;
}

// ── Podgląd wiersza (dla frontendu) ──────────

export function previewRow(row: AutolineRow): Record<string, string> {
  const result: Record<string, string> = {};
  for (const col of CSV_COLUMNS) {
    if (row[col] !== undefined) result[col] = String(row[col]);
  }
  return result;
}
