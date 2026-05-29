import { Router } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import * as allegroService from '../services/allegroService';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { prisma } from '../utils/prisma';

export const allegroRouter = Router();

// ── OAuth flow (nie wymaga JWT – to strona redirect) ──

/** GET /api/allegro/oauth/start
 *  Frontend wywołuje to → dostaje URL → redirect do Allegro */
allegroRouter.get('/oauth/start', authenticate, (_req, res, next) => {
  try {
    const state = crypto.randomBytes(16).toString('hex');
    const url   = allegroService.buildAuthorizationUrl(state);
    res.json({ url, state });
  } catch (err) {
    next(err);
  }
});

/** GET /api/allegro/oauth/callback
 *  Allegro przekierowuje tutaj z ?code=...&state=... */
allegroRouter.get('/oauth/callback', async (req, res, next) => {
  try {
    const { code, state, error } = req.query as Record<string, string>;

    if (error) {
      const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';
      return res.redirect(`${frontendUrl}/settings?allegro_error=${encodeURIComponent(error)}`);
    }

    if (!code || !state) throw new AppError(400, 'Brak code lub state');

    await allegroService.exchangeCodeForTokens(code, state);

    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';
    res.redirect(`${frontendUrl}/settings?allegro_connected=1`);
  } catch (err) {
    next(err);
  }
});

/** GET /api/allegro/status */
allegroRouter.get('/status', authenticate, async (_req, res, next) => {
  try {
    const status = await allegroService.getConnectionStatus();
    res.json(status);
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/allegro/disconnect */
allegroRouter.delete('/disconnect', authenticate, async (_req, res, next) => {
  try {
    await prisma.portalCredential.updateMany({
      where: { portal: 'ALLEGRO' },
      data:  { isActive: false },
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ── Kategorie ────────────────────────────────

/** GET /api/allegro/categories?parentId= */
allegroRouter.get('/categories', authenticate, async (req, res, next) => {
  try {
    const { parentId } = req.query as { parentId?: string };
    const categories = await allegroService.getCategories(parentId);
    res.json(categories);
  } catch (err) {
    next(err);
  }
});

/** GET /api/allegro/categories/:id/parameters */
allegroRouter.get('/categories/:id/parameters', authenticate, async (req, res, next) => {
  try {
    const params = await allegroService.getCategoryParameters(req.params.id);
    res.json(params);
  } catch (err) {
    next(err);
  }
});

// ── Shipping rates ────────────────────────────

/** GET /api/allegro/shipping-rates */
allegroRouter.get('/shipping-rates', authenticate, async (_req, res, next) => {
  try {
    const rates = await allegroService.getShippingRates();
    res.json(rates);
  } catch (err) {
    next(err);
  }
});

// ── Publish ───────────────────────────────────

/** POST /api/allegro/publish/:listingId
 *  Wystaw konkretne wystawienie na Allegro */
allegroRouter.post('/publish/:listingId', authenticate, async (req, res, next) => {
  try {
    const listing = await prisma.listing.findFirst({
      where: { id: req.params.listingId, userId: req.user!.userId, portal: 'ALLEGRO' },
    });
    if (!listing) throw new AppError(404, 'Wystawienie nie znalezione');

    // Importuj dynamicznie żeby nie blokować startu serwera jeśli Allegro niedostępne
    const { publishListing } = await import('../services/listingExecutor');
    const result = await publishListing(req.params.listingId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/** POST /api/allegro/publish-bulk
 *  Wystaw wiele wystawień
 *  Body: { listingIds: string[] } */
allegroRouter.post('/publish-bulk', authenticate, async (req, res, next) => {
  try {
    const schema = z.object({ listingIds: z.array(z.string()).min(1).max(50) });
    const { listingIds } = schema.parse(req.body);

    // Sprawdź własność
    const owned = await prisma.listing.findMany({
      where: { id: { in: listingIds }, userId: req.user!.userId, portal: 'ALLEGRO' },
      select: { id: true },
    });
    if (owned.length !== listingIds.length) {
      throw new AppError(403, 'Niektóre wystawienia nie należą do Ciebie lub nie są Allegro');
    }

    const { publishMany } = await import('../services/listingExecutor');
    const results = await publishMany(listingIds);
    res.json({ results });
  } catch (err) {
    next(err);
  }
});

/** POST /api/allegro/publish-part/:partId
 *  Wystaw część na Allegro używając domyślnego szablonu */
allegroRouter.post('/publish-part/:partId', authenticate, async (req, res, next) => {
  try {
    const part = await prisma.part.findFirst({
      where: { id: req.params.partId, userId: req.user!.userId },
    });
    if (!part) throw new AppError(404, 'Część nie znaleziona');

    // Pobierz domyślny szablon Allegro
    const template = await prisma.template.findFirst({
      where: { userId: req.user!.userId, portal: 'ALLEGRO', isDefault: true, isActive: true },
    });
    if (!template) throw new AppError(404, 'Brak domyślnego szablonu Allegro');

    // Upsert listingu
    const listing = await prisma.listing.upsert({
      where: { partId_templateId: { partId: part.id, templateId: template.id } },
      create: {
        partId:     part.id,
        templateId: template.id,
        portal:     'ALLEGRO',
        status:     'PENDING',
        userId:     req.user!.userId,
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

/** DELETE /api/allegro/offers/:offerId
 *  Zakończ ofertę na Allegro */
allegroRouter.delete('/offers/:offerId', authenticate, async (req, res, next) => {
  try {
    await allegroService.endOffer(req.params.offerId);

    // Zaktualizuj status listingu
    await prisma.listing.updateMany({
      where: { externalId: req.params.offerId, portal: 'ALLEGRO', userId: req.user!.userId },
      data:  { status: 'ENDED' },
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});
