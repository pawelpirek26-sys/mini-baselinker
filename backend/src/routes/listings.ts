import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

export const listingsRouter = Router();
listingsRouter.use(authenticate);

const createListingSchema = z.object({
  partId: z.string(),
  templateId: z.string(),
});

const bulkListSchema = z.object({
  partId: z.string(),
  templateIds: z.array(z.string()).min(1).max(10),
});

// GET /api/listings?partId=&portal=&status=
listingsRouter.get('/', async (req, res, next) => {
  try {
    const { partId, portal, status } = req.query;
    const listings = await prisma.listing.findMany({
      where: {
        userId: req.user!.userId,
        ...(partId && { partId: partId as string }),
        ...(portal && { portal: portal as 'ALLEGRO' | 'OTOMOTO' | 'AUTOLINE' }),
        ...(status && { status: status as string }),
      } as object,
      include: {
        part: { select: { id: true, name: true, oemNumber: true } },
        template: { select: { id: true, name: true, portal: true } },
        history: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
      orderBy: { updatedAt: 'desc' },
    });
    res.json(listings);
  } catch (err) {
    next(err);
  }
});

// POST /api/listings – utwórz jedno wystawienie (DRAFT)
listingsRouter.post('/', async (req, res, next) => {
  try {
    const data = createListingSchema.parse(req.body);

    // Sprawdź własność
    const part = await prisma.part.findFirst({
      where: { id: data.partId, userId: req.user!.userId },
    });
    if (!part) throw new AppError(404, 'Część nie znaleziona');

    const template = await prisma.template.findFirst({
      where: { id: data.templateId, userId: req.user!.userId },
    });
    if (!template) throw new AppError(404, 'Szablon nie znaleziony');

    const listing = await prisma.listing.upsert({
      where: { partId_templateId: { partId: data.partId, templateId: data.templateId } },
      create: {
        partId: data.partId,
        templateId: data.templateId,
        portal: template.portal,
        status: 'DRAFT',
        userId: req.user!.userId,
      },
      update: { status: 'DRAFT', errorMessage: null, errorDetails: null },
      include: {
        part: { select: { id: true, name: true } },
        template: { select: { id: true, name: true, portal: true } },
      },
    });

    res.status(201).json(listing);
  } catch (err) {
    next(err);
  }
});

// POST /api/listings/bulk – wystaw część na wiele szablonów naraz
listingsRouter.post('/bulk', async (req, res, next) => {
  try {
    const data = bulkListSchema.parse(req.body);

    const part = await prisma.part.findFirst({
      where: { id: data.partId, userId: req.user!.userId },
    });
    if (!part) throw new AppError(404, 'Część nie znaleziona');

    const results = await Promise.allSettled(
      data.templateIds.map(async (templateId) => {
        const template = await prisma.template.findFirst({
          where: { id: templateId, userId: req.user!.userId },
        });
        if (!template) throw new Error(`Szablon ${templateId} nie znaleziony`);

        return prisma.listing.upsert({
          where: { partId_templateId: { partId: data.partId, templateId } },
          create: {
            partId: data.partId,
            templateId,
            portal: template.portal,
            status: 'PENDING',
            userId: req.user!.userId,
          },
          update: { status: 'PENDING', errorMessage: null },
        });
      }),
    );

    const summary = results.map((r, i) => ({
      templateId: data.templateIds[i],
      status: r.status,
      ...(r.status === 'fulfilled' && { listing: r.value }),
      ...(r.status === 'rejected' && { error: (r.reason as Error).message }),
    }));

    res.json({ summary, partId: data.partId });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/listings/:id/status – ręczna zmiana statusu
listingsRouter.patch('/:id/status', async (req, res, next) => {
  try {
    const schema = z.object({
      status: z.enum(['PENDING', 'PROCESSING', 'ACTIVE', 'EXPIRED', 'ENDED', 'ERROR', 'DRAFT']),
      externalId: z.string().optional(),
      externalUrl: z.string().url().optional(),
      errorMessage: z.string().optional(),
    });
    const data = schema.parse(req.body);

    const listing = await prisma.listing.findFirst({
      where: { id: req.params.id, userId: req.user!.userId },
    });
    if (!listing) throw new AppError(404, 'Wystawienie nie znalezione');

    const [updated] = await prisma.$transaction([
      prisma.listing.update({
        where: { id: req.params.id },
        data: {
          status: data.status,
          externalId: data.externalId,
          externalUrl: data.externalUrl,
          errorMessage: data.errorMessage,
          listedAt: data.status === 'ACTIVE' ? new Date() : undefined,
        },
      }),
      prisma.listingHistory.create({
        data: {
          listingId: req.params.id,
          status: data.status,
          message: data.errorMessage ?? `Status zmieniony na ${data.status}`,
        },
      }),
    ]);

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/listings/:id
listingsRouter.delete('/:id', async (req, res, next) => {
  try {
    const listing = await prisma.listing.findFirst({
      where: { id: req.params.id, userId: req.user!.userId },
    });
    if (!listing) throw new AppError(404, 'Wystawienie nie znalezione');
    await prisma.listing.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// POST /api/listings/:id/publish – wywołaj executor dla konkretnego listingu
listingsRouter.post('/:id/publish', async (req, res, next) => {
  try {
    const listing = await prisma.listing.findFirst({
      where: { id: req.params.id, userId: req.user!.userId },
    });
    if (!listing) throw new AppError(404, 'Wystawienie nie znalezione');
    if (listing.status === 'PROCESSING') {
      throw new AppError(409, 'Wystawienie jest już w trakcie przetwarzania');
    }
    const { publishListing } = await import('../services/listingExecutor');
    const result = await publishListing(req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/listings/publish-all
listingsRouter.post('/publish-all', async (req, res, next) => {
  try {
    const schema = z.object({
      portal: z.enum(['ALLEGRO', 'OTOMOTO', 'AUTOLINE']).optional(),
      partId: z.string().optional(),
    });
    const { portal, partId } = schema.parse(req.body);
    const listings = await prisma.listing.findMany({
      where: {
        userId: req.user!.userId,
        status: { in: ['PENDING', 'DRAFT', 'ERROR'] },
        ...(portal && { portal }),
        ...(partId && { partId }),
      },
      select: { id: true },
    });
    if (!listings.length) return res.json({ results: [], message: 'Brak wystawień do opublikowania' });
    const { publishMany } = await import('../services/listingExecutor');
    const results = await publishMany(listings.map((l: { id: string }) => l.id));
    res.json({ results });
  } catch (err) {
    next(err);
  }
});
