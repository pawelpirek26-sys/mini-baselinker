import { z } from 'zod';

export const partSchema = z.object({
  name: z.string().min(3, 'Nazwa min. 3 znaki').max(200),
  oemNumber: z.string().max(100).optional().nullable(),
  catalogNumber: z.string().max(100).optional().nullable(),
  ean: z.string().max(20).optional().nullable(),

  category: z.enum([
    'hamulce', 'silnik', 'skrzynia', 'zawieszenie', 'elektryka',
    'nadwozie', 'uklad_kierowniczy', 'uklad_wydechowy', 'klimatyzacja',
    'oswietlenie', 'filtry', 'pasy_i_napedy', 'inne',
  ]),
  subcategory: z.string().max(100).optional().nullable(),
  condition: z.enum(['NEW', 'REGENERATED', 'USED']).default('NEW'),

  priceNet: z.number().positive('Cena netto musi być dodatnia'),
  priceBrutto: z.number().positive('Cena brutto musi być dodatnia'),
  vatRate: z.number().min(0).max(100).default(23),
  stock: z.number().int().min(0).default(0),
  stockMin: z.number().int().min(0).default(1),

  descriptionShort: z.string().max(500).optional().nullable(),
  descriptionLong: z.string().optional().nullable(),
  technicalParams: z.record(z.string(), z.unknown()).optional().nullable(),
});

export const partUpdateSchema = partSchema.partial();

export type PartInput = z.infer<typeof partSchema>;
export type PartUpdateInput = z.infer<typeof partUpdateSchema>;

// ── Filtry listy części ──────────────────────
export const partsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  category: z.string().optional(),
  condition: z.enum(['NEW', 'REGENERATED', 'USED']).optional(),
  sortBy: z.enum(['name', 'createdAt', 'priceNet', 'stock']).default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});
