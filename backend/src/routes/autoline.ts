import { Router } from 'express';
import { z } from 'zod';
import {
  buildAutolineRow,
  generateCsv,
  generateXml,
  previewRow,
} from '../services/autolineService';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { prisma } from '../utils/prisma';
import type { Part, Compatibility, PartImage, Template } from '../utils/types';

export const autolineRouter = Router();

type PartFull = Part & { images: PartImage[]; compatibility: Compatibility[] };

// ── Helpers ───────────────────────────────────

async function getPartsForExport(
  userId:   string,
  partIds?: string[],
): Promise<PartFull[]> {
  const parts = await prisma.part.findMany({
    where: {
      userId,
      ...(partIds?.length ? { id: { in: partIds } } : {}),
      stock: { gt: 0 }, // tylko dostępne
    },
    include: {
      images:        { orderBy: { order: 'asc' } },
      compatibility: true,
    },
    orderBy: { createdAt: 'desc' },
  });
  return parts as PartFull[];
}

async function getDefaultAutolineTemplate(userId: string) {
  return prisma.template.findFirst({
    where: { userId, portal: 'AUTOLINE', isDefault: true, isActive: true },
  });
}

// ── Podgląd eksportu ──────────────────────────

/** GET /api/autoline/preview
 *  Zwraca podgląd wierszy bez pobierania pliku */
autolineRouter.get('/preview', authenticate, async (req, res, next) => {
  try {
    const { partIds } = req.query as { partIds?: string };
    const ids = partIds ? partIds.split(',').filter(Boolean) : undefined;

    const parts    = await getPartsForExport(req.user!.userId, ids);
    const template = await getDefaultAutolineTemplate(req.user!.userId);

    if (!template) throw new AppError(404, 'Brak domyślnego szablonu Autoline');

    const appBaseUrl = process.env.APP_PUBLIC_URL ?? 'http://localhost:4000';
    const rows = parts.map((p) => previewRow(buildAutolineRow(p, template as Template, appBaseUrl)));

    res.json({ rows, total: rows.length, templateName: template.name });
  } catch (err) {
    next(err);
  }
});

/** POST /api/autoline/preview
 *  Podgląd z wybranym szablonem i zestawem części */
autolineRouter.post('/preview', authenticate, async (req, res, next) => {
  try {
    const schema = z.object({
      templateId: z.string().optional(),
      partIds:    z.array(z.string()).optional(),
    });
    const { templateId, partIds } = schema.parse(req.body);

    const parts = await getPartsForExport(req.user!.userId, partIds);
    const template = templateId
      ? await prisma.template.findFirst({ where: { id: templateId, userId: req.user!.userId } })
      : await getDefaultAutolineTemplate(req.user!.userId);

    if (!template) throw new AppError(404, 'Szablon nie znaleziony');

    const appBaseUrl = process.env.APP_PUBLIC_URL ?? 'http://localhost:4000';
    const rows = parts.map((p) => previewRow(buildAutolineRow(p, template as Template, appBaseUrl)));

    res.json({ rows, total: rows.length, templateName: template.name });
  } catch (err) {
    next(err);
  }
});

// ── Pobieranie pliku CSV ──────────────────────

/** GET /api/autoline/export/csv?partIds=id1,id2&templateId=
 *  Pobierz plik CSV gotowy do importu w Autoline */
autolineRouter.get('/export/csv', authenticate, async (req, res, next) => {
  try {
    const { partIds, templateId } = req.query as { partIds?: string; templateId?: string };
    const ids = partIds ? partIds.split(',').filter(Boolean) : undefined;

    const parts    = await getPartsForExport(req.user!.userId, ids);
    const template = templateId
      ? await prisma.template.findFirst({ where: { id: templateId, userId: req.user!.userId } })
      : await getDefaultAutolineTemplate(req.user!.userId);

    if (!template) throw new AppError(404, 'Brak domyślnego szablonu Autoline');
    if (!parts.length) throw new AppError(400, 'Brak części do eksportu (sprawdź stany magazynowe)');

    const appBaseUrl = process.env.APP_PUBLIC_URL ?? 'http://localhost:4000';
    const rows = parts.map((p) => buildAutolineRow(p, template as Template, appBaseUrl));
    const csv  = generateCsv(rows);

    const filename = `autoline_export_${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('\uFEFF' + csv); // BOM dla Excel
  } catch (err) {
    next(err);
  }
});

/** POST /api/autoline/export/csv
 *  Pobierz CSV z konkretnym zestawem części */
autolineRouter.post('/export/csv', authenticate, async (req, res, next) => {
  try {
    const schema = z.object({
      templateId: z.string().optional(),
      partIds:    z.array(z.string()).optional(),
    });
    const { templateId, partIds } = schema.parse(req.body);

    const parts    = await getPartsForExport(req.user!.userId, partIds);
    const template = templateId
      ? await prisma.template.findFirst({ where: { id: templateId, userId: req.user!.userId } })
      : await getDefaultAutolineTemplate(req.user!.userId);

    if (!template) throw new AppError(404, 'Brak domyślnego szablonu Autoline');
    if (!parts.length) throw new AppError(400, 'Brak części do eksportu');

    const appBaseUrl = process.env.APP_PUBLIC_URL ?? 'http://localhost:4000';
    const rows    = parts.map((p) => buildAutolineRow(p, template as Template, appBaseUrl));
    const csv     = generateCsv(rows);
    const filename = `autoline_export_${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('\uFEFF' + csv);
  } catch (err) {
    next(err);
  }
});

// ── Pobieranie pliku XML ──────────────────────

/** POST /api/autoline/export/xml */
autolineRouter.post('/export/xml', authenticate, async (req, res, next) => {
  try {
    const schema = z.object({
      templateId: z.string().optional(),
      partIds:    z.array(z.string()).optional(),
      feedTitle:  z.string().optional(),
    });
    const { templateId, partIds, feedTitle } = schema.parse(req.body);

    const parts    = await getPartsForExport(req.user!.userId, partIds);
    const template = templateId
      ? await prisma.template.findFirst({ where: { id: templateId, userId: req.user!.userId } })
      : await getDefaultAutolineTemplate(req.user!.userId);

    if (!template) throw new AppError(404, 'Brak domyślnego szablonu Autoline');
    if (!parts.length) throw new AppError(400, 'Brak części do eksportu');

    const appBaseUrl = process.env.APP_PUBLIC_URL ?? 'http://localhost:4000';
    const rows    = parts.map((p) => buildAutolineRow(p, template as Template, appBaseUrl));
    const xml     = generateXml(rows, feedTitle ?? 'Mini Baselinker Export');
    const filename = `autoline_export_${new Date().toISOString().slice(0, 10)}.xml`;

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(xml);
  } catch (err) {
    next(err);
  }
});

// ── Oznacz jako "wyeksportowane" ──────────────

/** POST /api/autoline/mark-exported
 *  Tworzy listing z statusem ACTIVE (bez API) dla części wyeksportowanych do pliku */
autolineRouter.post('/mark-exported', authenticate, async (req, res, next) => {
  try {
    const schema = z.object({
      partIds:    z.array(z.string()).min(1),
      templateId: z.string().optional(),
    });
    const { partIds, templateId } = schema.parse(req.body);

    const template = templateId
      ? await prisma.template.findFirst({ where: { id: templateId, userId: req.user!.userId } })
      : await getDefaultAutolineTemplate(req.user!.userId);

    if (!template) throw new AppError(404, 'Brak domyślnego szablonu Autoline');

    const results = await Promise.allSettled(
      partIds.map(async (partId) => {
        const listing = await prisma.listing.upsert({
          where: { partId_templateId: { partId, templateId: template.id } },
          create: {
            partId, templateId: template.id,
            portal:   'AUTOLINE',
            status:   'ACTIVE',
            userId:   req.user!.userId,
            listedAt: new Date(),
            externalData: JSON.stringify({ method: 'file_export', exportedAt: new Date().toISOString() }),
          },
          update: {
            status:   'ACTIVE',
            listedAt: new Date(),
            errorMessage: null,
          },
        });

        await prisma.listingHistory.create({
          data: {
            listingId: listing.id,
            status:    'ACTIVE',
            message:   'Wyeksportowano do pliku Autoline',
          },
        });

        return listing;
      }),
    );

    const ok   = results.filter((r) => r.status === 'fulfilled').length;
    const fail = results.filter((r) => r.status === 'rejected').length;

    res.json({ ok, fail, total: partIds.length });
  } catch (err) {
    next(err);
  }
});

// ── Statystyki eksportu ───────────────────────

/** GET /api/autoline/stats */
autolineRouter.get('/stats', authenticate, async (req, res, next) => {
  try {
    const [total, active, error, partsInStock] = await Promise.all([
      prisma.listing.count({ where: { userId: req.user!.userId, portal: 'AUTOLINE' } }),
      prisma.listing.count({ where: { userId: req.user!.userId, portal: 'AUTOLINE', status: 'ACTIVE' } }),
      prisma.listing.count({ where: { userId: req.user!.userId, portal: 'AUTOLINE', status: 'ERROR' } }),
      prisma.part.count({ where: { userId: req.user!.userId, stock: { gt: 0 } } }),
    ]);

    res.json({ total, active, error, partsInStock });
  } catch (err) {
    next(err);
  }
});
