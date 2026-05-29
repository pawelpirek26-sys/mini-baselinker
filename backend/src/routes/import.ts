import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { prisma } from '../utils/prisma';
import {
  parseCsvText,
  processImport,
  buildColumnMap,
  type ImportRow,
} from '../services/importService';

export const importRouter = Router();
importRouter.use(authenticate);

// Multer — tylko memory storage (nie zapisujemy na dysk)
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'text/csv', 'application/csv', 'text/plain',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];
    // Akceptuj też po rozszerzeniu
    const ext = file.originalname.toLowerCase();
    if (allowed.includes(file.mimetype) || ext.endsWith('.csv') || ext.endsWith('.xlsx') || ext.endsWith('.xls')) {
      cb(null, true);
    } else {
      cb(new Error('Akceptowane formaty: CSV, XLSX, XLS'));
    }
  },
});

// ── POST /api/import/preview ──────────────────
// Parsuje plik i zwraca podgląd bez zapisywania
importRouter.post('/preview', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) throw new AppError(400, 'Brak pliku');

    const ext = req.file.originalname.toLowerCase();
    let headers: string[] = [];
    let rows:    Record<string, string>[] = [];

    if (ext.endsWith('.xlsx') || ext.endsWith('.xls')) {
      // Excel — dynamiczny import żeby nie blokować startu jeśli exceljs nie zainstalowany
      try {
        const ExcelJS = await import('exceljs');
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(req.file.buffer.buffer.slice(req.file.buffer.byteOffset, req.file.buffer.byteOffset + req.file.buffer.byteLength) as ArrayBuffer);
        const ws = wb.worksheets[0];
        if (!ws) throw new AppError(400, 'Brak arkusza w pliku Excel');

        const headerRow = ws.getRow(1).values as (string | undefined)[];
        headers = headerRow.slice(1).map((v) => String(v ?? '')).filter(Boolean);

        ws.eachRow((row, rowNumber) => {
          if (rowNumber === 1) return;
          const vals = row.values as (string | number | undefined)[];
          const obj: Record<string, string> = {};
          headers.forEach((h, i) => { obj[h] = String(vals[i + 1] ?? ''); });
          if (Object.values(obj).some((v) => v.trim())) rows.push(obj);
        });
      } catch (xlsErr) {
        if ((xlsErr as { statusCode?: number }).statusCode) throw xlsErr;
        throw new AppError(400, 'Błąd parsowania Excel. Zainstaluj: npm install exceljs --prefix backend');
      }
    } else {
      // CSV
      const text = req.file.buffer.toString('utf-8');
      const parsed = parseCsvText(text);
      headers = parsed.headers;
      rows    = parsed.rows;
    }

    if (!headers.length) throw new AppError(400, 'Plik nie zawiera nagłówków kolumn');
    if (!rows.length)    throw new AppError(400, 'Plik nie zawiera danych (tylko nagłówek)');

    // Ograniczenie podglądu do 500 wierszy
    const limitedRows = rows.slice(0, 500);
    const result      = processImport(limitedRows, headers);
    const columnMap   = buildColumnMap(headers);

    res.json({
      headers,
      columnMap,
      valid:   result.valid.length,
      invalid: result.invalid.length,
      total:   result.total,
      // Zwróć max 20 wierszy podglądu
      previewValid:   result.valid.slice(0, 20).map((r) => ({ row: r.rowIndex, data: r.parsed })),
      previewInvalid: result.invalid.slice(0, 20).map((r) => ({
        row:    r.rowIndex,
        raw:    r.raw,
        errors: r.errors,
      })),
      truncated: rows.length > 500,
      totalInFile: rows.length,
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/import/execute ──────────────────
// Wykonuje import — zapisuje do bazy
importRouter.post('/execute', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) throw new AppError(400, 'Brak pliku');

    const optionsSchema = z.object({
      skipInvalid:    z.coerce.boolean().default(true),
      updateExisting: z.coerce.boolean().default(false),
      dryRun:         z.coerce.boolean().default(false),
    });
    const options = optionsSchema.parse(req.body);

    // Parse plik
    let headers: string[] = [];
    let rows:    Record<string, string>[] = [];

    const ext = req.file.originalname.toLowerCase();
    if (ext.endsWith('.xlsx') || ext.endsWith('.xls')) {
      const ExcelJS = await import('exceljs');
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(req.file.buffer.buffer.slice(req.file.buffer.byteOffset, req.file.buffer.byteOffset + req.file.buffer.byteLength) as ArrayBuffer);
      const ws = wb.worksheets[0];
      if (!ws) throw new AppError(400, 'Brak arkusza w pliku Excel');

      const headerRow = ws.getRow(1).values as (string | undefined)[];
      headers = headerRow.slice(1).map((v) => String(v ?? '')).filter(Boolean);
      ws.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const vals = row.values as (string | number | undefined)[];
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => { obj[h] = String(vals[i + 1] ?? ''); });
        if (Object.values(obj).some((v) => v.trim())) rows.push(obj);
      });
    } else {
      const text = req.file.buffer.toString('utf-8');
      const parsed = parseCsvText(text);
      headers = parsed.headers;
      rows    = parsed.rows;
    }

    const result = processImport(rows, headers);

    if (!options.skipInvalid && result.invalid.length > 0) {
      throw new AppError(422, `Import zatrzymany: ${result.invalid.length} błędnych wierszy`);
    }

    if (options.dryRun) {
      return res.json({
        dryRun: true,
        wouldCreate: result.valid.length,
        invalid: result.invalid.length,
        errors:  result.invalid.slice(0, 50),
      });
    }

    // Zapisz do bazy
    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: Array<{ row: number; error: string }> = [];

    for (const item of result.valid) {
      if (!item.parsed) continue;

      const data = item.parsed as ImportRow;
      const { brand, model, yearFrom, yearTo, ...partData } = data;

      try {
        let part = options.updateExisting && data.oemNumber
          ? await prisma.part.findFirst({
              where: { oemNumber: data.oemNumber, userId: req.user!.userId },
            })
          : null;

        if (part && options.updateExisting) {
          await prisma.part.update({
            where: { id: part.id },
            data:  {
              ...partData,
              priceBrutto: partData.priceBrutto ?? partData.priceNet * (1 + (partData.vatRate ?? 23) / 100),
              technicalParams: null,
            },
          });
          updated++;
        } else if (!part) {
          part = await prisma.part.create({
            data: {
              ...partData,
              priceBrutto: partData.priceBrutto ?? Math.round(partData.priceNet * (1 + (partData.vatRate ?? 23) / 100) * 100) / 100,
              technicalParams: null,
              userId: req.user!.userId,
            },
          });
          created++;

          // Dodaj kompatybilność jeśli podano
          if (brand && part) {
            await prisma.compatibility.create({
              data: {
                partId:   part.id,
                brand,
                model:    model ?? null,
                yearFrom: yearFrom ?? null,
                yearTo:   yearTo ?? null,
              },
            });
          }
        } else {
          skipped++;
        }
      } catch (err: unknown) {
        errors.push({ row: item.rowIndex, error: (err as Error).message ?? 'Błąd zapisu' });
      }
    }

    res.json({
      created,
      updated,
      skipped,
      invalid:       result.invalid.length,
      errors:        errors.slice(0, 50),
      total:         result.total,
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/import/template/csv ─────────────
// Pobierz szablon CSV do wypełnienia
importRouter.get('/template/csv', authenticate, (_req, res) => {
  const headers = [
    'name', 'oemNumber', 'catalogNumber', 'ean',
    'category', 'subcategory', 'condition',
    'priceNet', 'priceBrutto', 'vatRate',
    'stock', 'stockMin',
    'descriptionShort', 'descriptionLong',
    'brand', 'model', 'yearFrom', 'yearTo',
  ].join(',');

  const example = [
    'Tarcza hamulcowa MAN TGX', '81508030068', 'THM-001', '5901234123457',
    'hamulce', 'tarcze', 'NEW',
    '350.00', '430.50', '23',
    '5', '1',
    'Tarcza hamulcowa osi przedniej', '',
    'MAN', 'TGX 18.400', '2007', '2020',
  ].join(',');

  const csv = `${headers}\r\n${example}\r\n`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="mini_baselinker_import_template.csv"');
  res.send('\uFEFF' + csv);
});
