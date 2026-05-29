/**
 * ImportService
 * -------------
 * Parsuje i waliduje pliki CSV/Excel z częściami do masowego importu.
 *
 * Obsługiwane formaty:
 *  - CSV (dowolny separator: , ; \t)
 *  - Excel .xlsx / .xls (przez exceljs)
 *
 * Logika:
 *  1. Wykryj kolumny (auto-mapowanie po nazwach lub numerach)
 *  2. Waliduj każdy wiersz przez Zod
 *  3. Zwróć { valid, invalid } — import tylko valid
 */

import { z } from 'zod';

// ── Schemat jednego wiersza importu ───────────

export const importRowSchema = z.object({
  name:             z.string().min(3).max(200),
  oemNumber:        z.string().max(100).optional().nullable(),
  catalogNumber:    z.string().max(100).optional().nullable(),
  ean:              z.string().max(20).optional().nullable(),
  category:         z.enum([
    'hamulce','silnik','skrzynia','zawieszenie','elektryka',
    'nadwozie','uklad_kierowniczy','uklad_wydechowy','klimatyzacja',
    'oswietlenie','filtry','pasy_i_napedy','inne',
  ]).default('inne'),
  subcategory:      z.string().max(100).optional().nullable(),
  condition:        z.enum(['NEW','REGENERATED','USED']).default('NEW'),
  priceNet:         z.coerce.number().positive(),
  priceBrutto:      z.coerce.number().positive().optional(),
  vatRate:          z.coerce.number().min(0).max(100).default(23),
  stock:            z.coerce.number().int().min(0).default(0),
  stockMin:         z.coerce.number().int().min(0).default(1),
  descriptionShort: z.string().max(500).optional().nullable(),
  descriptionLong:  z.string().optional().nullable(),
  // Kompatybilność — opcjonalnie jako pola rozdzielone
  brand:            z.string().max(50).optional().nullable(),
  model:            z.string().max(100).optional().nullable(),
  yearFrom:         z.coerce.number().int().optional().nullable(),
  yearTo:           z.coerce.number().int().optional().nullable(),
});

export type ImportRow = z.infer<typeof importRowSchema>;

export interface ImportResult {
  rowIndex:  number;
  raw:       Record<string, string>;
  parsed?:   ImportRow;
  errors?:   Array<{ field: string; message: string }>;
  status:    'valid' | 'invalid';
}

export interface ParsedImport {
  valid:        ImportResult[];
  invalid:      ImportResult[];
  total:        number;
  headers:      string[];
  columnMap:    Record<string, string>; // csvColumn → partField
}

// ── Mapowanie nazw kolumn CSV → pola Part ─────

const COLUMN_ALIASES: Record<string, string> = {
  // Nazwa
  'nazwa':            'name',
  'name':             'name',
  'part name':        'name',
  'nazwa części':     'name',
  // OEM
  'oem':              'oemNumber',
  'oem number':       'oemNumber',
  'numer oem':        'oemNumber',
  'oem_number':       'oemNumber',
  'ref':              'oemNumber',
  // Katalogowy
  'catalog':          'catalogNumber',
  'catalog number':   'catalogNumber',
  'nr kat':           'catalogNumber',
  'nr katalogowy':    'catalogNumber',
  'catalog_ref':      'catalogNumber',
  // EAN
  'ean':              'ean',
  'gtin':             'ean',
  'barcode':          'ean',
  'kod ean':          'ean',
  // Kategoria
  'category':         'category',
  'kategoria':        'category',
  'typ':              'category',
  'type':             'category',
  // Stan
  'condition':        'condition',
  'stan':             'condition',
  'state':            'condition',
  // Ceny
  'price':            'priceNet',
  'price net':        'priceNet',
  'cena':             'priceNet',
  'cena netto':       'priceNet',
  'price_net':        'priceNet',
  'price netto':      'priceNet',
  'price brutto':     'priceBrutto',
  'cena brutto':      'priceBrutto',
  'price_brutto':     'priceBrutto',
  'gross price':      'priceBrutto',
  'vat':              'vatRate',
  'vat rate':         'vatRate',
  'stawka vat':       'vatRate',
  // Magazyn
  'stock':            'stock',
  'qty':              'stock',
  'quantity':         'stock',
  'ilosc':            'stock',
  'ilość':            'stock',
  'stan magazynowy':  'stock',
  // Opisy
  'description':      'descriptionShort',
  'opis':             'descriptionShort',
  'short description':'descriptionShort',
  'opis krotki':      'descriptionShort',
  'long description': 'descriptionLong',
  'opis pelny':       'descriptionLong',
  'full description': 'descriptionLong',
  // Kompatybilność
  'brand':            'brand',
  'marka':            'brand',
  'make':             'brand',
  'model':            'model',
  'year from':        'yearFrom',
  'rok od':           'yearFrom',
  'year_from':        'yearFrom',
  'year to':          'yearTo',
  'rok do':           'yearTo',
  'year_to':          'yearTo',
};

function normalizeHeader(h: string): string {
  return h.toLowerCase().trim().replace(/[_\-]+/g, ' ');
}

export function buildColumnMap(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const h of headers) {
    const normalized = normalizeHeader(h);
    const field = COLUMN_ALIASES[normalized] ?? COLUMN_ALIASES[h.toLowerCase().trim()];
    if (field) map[h] = field;
  }
  return map;
}

// ── CSV Parser ────────────────────────────────

function detectSeparator(firstLine: string): string {
  const counts = {
    ',': (firstLine.match(/,/g) ?? []).length,
    ';': (firstLine.match(/;/g) ?? []).length,
    '\t':(firstLine.match(/\t/g) ?? []).length,
  };
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

function parseCsvLine(line: string, sep: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === sep && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export function parseCsvText(text: string): { headers: string[]; rows: Record<string, string>[] } {
  // Usuń BOM jeśli jest
  const clean = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = clean.split('\n').filter((l) => l.trim());
  if (!lines.length) return { headers: [], rows: [] };

  const sep     = detectSeparator(lines[0]);
  const headers = parseCsvLine(lines[0], sep);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const vals = parseCsvLine(lines[i], sep);
    if (vals.every((v) => !v.trim())) continue; // pomiń puste wiersze
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = vals[idx] ?? ''; });
    rows.push(row);
  }

  return { headers, rows };
}

// ── Walidacja i mapowanie wierszy ─────────────

function mapConditionAlias(v: string): string {
  const map: Record<string, string> = {
    'nowa': 'NEW', 'new': 'NEW', 'n': 'NEW',
    'regenerowana': 'REGENERATED', 'regenerated': 'REGENERATED', 'regen': 'REGENERATED', 'r': 'REGENERATED',
    'uzywana': 'USED', 'używana': 'USED', 'used': 'USED', 'u': 'USED',
  };
  return map[v.toLowerCase().trim()] ?? v.toUpperCase();
}

function mapCategoryAlias(v: string): string {
  const map: Record<string, string> = {
    'brake':          'hamulce', 'brakes':       'hamulce', 'hamulce': 'hamulce',
    'engine':         'silnik',  'silnik':        'silnik',
    'gearbox':        'skrzynia','transmission':  'skrzynia','skrzynia': 'skrzynia',
    'suspension':     'zawieszenie','zawieszenie':'zawieszenie',
    'electrical':     'elektryka','electricals':  'elektryka','elektryka': 'elektryka',
    'body':           'nadwozie','nadwozie':       'nadwozie',
    'steering':       'uklad_kierowniczy',
    'exhaust':        'uklad_wydechowy',
    'ac':             'klimatyzacja','klimatyzacja':'klimatyzacja',
    'lights':         'oswietlenie','lighting':    'oswietlenie','oswietlenie': 'oswietlenie',
    'filters':        'filtry','filtry':           'filtry',
    'belts':          'pasy_i_napedy','drives':   'pasy_i_napedy',
    'other':          'inne','inne':               'inne',
  };
  return map[v.toLowerCase().trim()] ?? 'inne';
}

export function validateRows(
  rows:      Record<string, string>[],
  columnMap: Record<string, string>,
): ImportResult[] {
  return rows.map((raw, rowIndex) => {
    // Remapuj kolumny CSV → pola Part
    const mapped: Record<string, unknown> = {};
    for (const [csvCol, value] of Object.entries(raw)) {
      const field = columnMap[csvCol];
      if (field) mapped[field] = value.trim();
    }

    // Normalizuj stan i kategorię
    if (mapped.condition) mapped.condition = mapConditionAlias(String(mapped.condition));
    if (mapped.category)  mapped.category  = mapCategoryAlias(String(mapped.category));

    // Auto-przelicz brutto jeśli brak
    if (mapped.priceNet && !mapped.priceBrutto) {
      const net = Number(mapped.priceNet);
      const vat = Number(mapped.vatRate ?? 23);
      if (!isNaN(net)) mapped.priceBrutto = Math.round(net * (1 + vat / 100) * 100) / 100;
    }

    const result = importRowSchema.safeParse(mapped);

    if (result.success) {
      return { rowIndex: rowIndex + 2, raw, parsed: result.data, status: 'valid' as const };
    } else {
      return {
        rowIndex: rowIndex + 2,
        raw,
        errors: result.error.issues.map((i) => ({
          field:   i.path.join('.') || 'ogólny',
          message: i.message,
        })),
        status: 'invalid' as const,
      };
    }
  });
}

export function processImport(
  rows:    Record<string, string>[],
  headers: string[],
): ParsedImport {
  const columnMap = buildColumnMap(headers);
  const results   = validateRows(rows, columnMap);
  return {
    valid:     results.filter((r) => r.status === 'valid'),
    invalid:   results.filter((r) => r.status === 'invalid'),
    total:     results.length,
    headers,
    columnMap,
  };
}
