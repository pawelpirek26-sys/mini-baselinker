import { Router } from 'express';
import { z } from 'zod';
import * as otomoto from '../services/otomotoService';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { prisma } from '../utils/prisma';

export const otomotoRouter = Router();

// ── Konfiguracja (zapis Client ID / Secret) ───

/** POST /api/otomoto/configure
 *  Zapisz dane dostępowe Otomoto Business */
otomotoRouter.post('/configure', authenticate, async (req, res, next) => {
  try {
    const schema = z.object({
      clientId:     z.string().min(1, 'Wymagany Client ID'),
      clientSecret: z.string().min(1, 'Wymagany Client Secret'),
      advertiserId: z.string().min(1, 'Wymagany Advertiser ID'),
    });
    const data = schema.parse(req.body);
    await otomoto.saveCredentials(data);
    res.json({ success: true, message: 'Konfiguracja Otomoto zapisana' });
  } catch (err) {
    next(err);
  }
});

/** GET /api/otomoto/status */
otomotoRouter.get('/status', authenticate, async (_req, res, next) => {
  try {
    const status = await otomoto.getConnectionStatus();
    res.json(status);
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/otomoto/disconnect */
otomotoRouter.delete('/disconnect', authenticate, async (_req, res, next) => {
  try {
    await prisma.portalCredential.updateMany({
      where: { portal: 'OTOMOTO' },
      data:  { isActive: false },
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ── Kategorie ─────────────────────────────────

/** GET /api/otomoto/categories?parentId= */
otomotoRouter.get('/categories', authenticate, async (req, res, next) => {
  try {
    const { parentId } = req.query as { parentId?: string };
    const categories = await otomoto.getCategories(parentId);
    res.json(categories);
  } catch (err) {
    next(err);
  }
});

/** GET /api/otomoto/categories/:id/params */
otomotoRouter.get('/categories/:id/params', authenticate, async (req, res, next) => {
  try {
    const params = await otomoto.getCategoryParams(req.params.id);
    res.json(params);
  } catch (err) {
    next(err);
  }
});

/** GET /api/otomoto/categories/local
 *  Zwraca lokalne mapowanie kategorii (bez zapytania do API) */
otomotoRouter.get('/categories/local', authenticate, (_req, res) => {
  res.json(
    Object.entries(otomoto.OTOMOTO_TRUCK_PARTS_CATEGORIES).map(([key, val]) => ({
      partCategory: key,
      ...val,
    })),
  );
});

// ── Ogłoszenia ────────────────────────────────

/** GET /api/otomoto/ads?page=&limit=&status= */
otomotoRouter.get('/ads', authenticate, async (req, res, next) => {
  try {
    const { page, limit, status } = req.query as {
      page?: string; limit?: string; status?: string;
    };
    const result = await otomoto.getAds({
      page:   page  ? Number(page)  : 1,
      limit:  limit ? Number(limit) : 50,
      status,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/** POST /api/otomoto/publish/:listingId
 *  Wystaw konkretny listing na Otomoto */
otomotoRouter.post('/publish/:listingId', authenticate, async (req, res, next) => {
  try {
    const listing = await prisma.listing.findFirst({
      where: { id: req.params.listingId, userId: req.user!.userId, portal: 'OTOMOTO' },
    });
    if (!listing) throw new AppError(404, 'Wystawienie Otomoto nie znalezione');
    if (listing.status === 'PROCESSING') throw new AppError(409, 'Już w trakcie przetwarzania');

    const { publishListing } = await import('../services/listingExecutor');
    const result = await publishListing(req.params.listingId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/** POST /api/otomoto/publish-part/:partId
 *  Wystaw część używając domyślnego szablonu Otomoto */
otomotoRouter.post('/publish-part/:partId', authenticate, async (req, res, next) => {
  try {
    const part = await prisma.part.findFirst({
      where: { id: req.params.partId, userId: req.user!.userId },
    });
    if (!part) throw new AppError(404, 'Część nie znaleziona');

    const template = await prisma.template.findFirst({
      where: { userId: req.user!.userId, portal: 'OTOMOTO', isDefault: true, isActive: true },
    });
    if (!template) throw new AppError(404, 'Brak domyślnego szablonu Otomoto');

    const listing = await prisma.listing.upsert({
      where: { partId_templateId: { partId: part.id, templateId: template.id } },
      create: {
        partId: part.id, templateId: template.id,
        portal: 'OTOMOTO', status: 'PENDING', userId: req.user!.userId,
      },
      update: { status: 'PENDING', errorMessage: null, errorDetails: null },
    });

    const { publishListing } = await import('../services/listingExecutor');
    const result = await publishListing(listing.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/otomoto/ads/:adId
 *  Zakończ ogłoszenie na Otomoto */
otomotoRouter.delete('/ads/:adId', authenticate, async (req, res, next) => {
  try {
    await otomoto.deleteAd(req.params.adId);

    await prisma.listing.updateMany({
      where: { externalId: req.params.adId, portal: 'OTOMOTO', userId: req.user!.userId },
      data:  { status: 'ENDED' },
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});
