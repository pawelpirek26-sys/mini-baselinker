/**
 * /api/publish — endpoint „Wystaw na wszystkie portale"
 *
 * POST /api/publish/start         → tworzy job, zwraca jobId
 * GET  /api/publish/stream/:jobId → SSE stream z progress
 * GET  /api/publish/job/:jobId    → polling fallback (wynik joba)
 * POST /api/publish/part/:partId  → skrót: start + stream w jednym żądaniu (nie-SSE)
 */

import { Router } from 'express';
import { z } from 'zod';
import { authenticate, type JwtPayload } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { sseBroker } from '../utils/sseBroker';
import {
  createJob,
  startJobAsync,
  getJob,
  type Portal,
} from '../services/publishJobService';
import { prisma } from '../utils/prisma';

export const publishRouter = Router();

const PORTALS: Portal[] = ['ALLEGRO', 'OTOMOTO', 'AUTOLINE'];

// ── POST /api/publish/start ───────────────────
// Tworzy job i natychmiast zwraca jobId.
// Klient łączy się z SSE stream i nasłuchuje postępu.
publishRouter.post('/start', authenticate, async (req, res, next) => {
  try {
    const schema = z.object({
      partId:      z.string(),
      portals:     z.array(z.enum(['ALLEGRO', 'OTOMOTO', 'AUTOLINE'])).min(1).default(['ALLEGRO', 'OTOMOTO', 'AUTOLINE']),
      templateIds: z.record(z.enum(['ALLEGRO', 'OTOMOTO', 'AUTOLINE']), z.string()).optional(),
    });
    const data = schema.parse(req.body);
    const user = req.user as JwtPayload;

    // Sprawdź czy część istnieje i należy do użytkownika
    const part = await prisma.part.findFirst({ where: { id: data.partId, userId: user.userId } });
    if (!part) throw new AppError(404, 'Część nie znaleziona');

    const jobId = createJob({
      partId:      data.partId,
      userId:      user.userId,
      portals:     data.portals as Portal[],
      templateIds: data.templateIds as Partial<Record<Portal, string>> | undefined,
    });

    // Uruchom asynchronicznie — klient łączy się z SSE niezależnie
    startJobAsync(jobId, {
      partId:      data.partId,
      userId:      user.userId,
      portals:     data.portals as Portal[],
      templateIds: data.templateIds as Partial<Record<Portal, string>> | undefined,
    });

    res.json({ jobId, partId: data.partId, portals: data.portals });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/publish/stream/:jobId ────────────
// SSE endpoint — klient łączy się i dostaje eventy w czasie rzeczywistym.
// Nie wymaga JWT w nagłówku — jobId jest wystarczającym tokenem.
publishRouter.get('/stream/:jobId', (req, res) => {
  const { jobId } = req.params;

  // Dodaj CORS dla EventSource (może wysyłać bez Authorization)
  res.setHeader('Access-Control-Allow-Origin', process.env.FRONTEND_URL ?? 'http://localhost:5173');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  sseBroker.subscribe(jobId, res);

  // Jeśli job już zakończony — wyślij ostatni stan i zamknij
  const job = getJob(jobId);
  if (job?.status === 'done' || job?.status === 'error') {
    sseBroker.send(jobId, {
      type:      'job_done',
      jobId,
      timestamp: new Date().toISOString(),
      progress:  { done: job.results.length, total: job.portals.length },
      error:     job.results.some((r) => r.status !== 'ok')
        ? `${job.results.filter((r) => r.status !== 'ok').length} portale z błędami`
        : undefined,
    });
    res.end();
  }
});

// ── GET /api/publish/job/:jobId ───────────────
// Polling fallback — zwraca aktualny stan joba (bez SSE).
publishRouter.get('/job/:jobId', authenticate, (req, res, next) => {
  try {
    const job = getJob(req.params.jobId);
    if (!job) throw new AppError(404, 'Job nie znaleziony (może wygasł)');
    res.json(job);
  } catch (err) {
    next(err);
  }
});

// ── POST /api/publish/part/:partId ───────────
// Skrócony endpoint: nie-SSE, czeka na zakończenie joba i zwraca wynik.
// Używany przez przyciski w formularzach gdy SSE jest niedostępne.
publishRouter.post('/part/:partId', authenticate, async (req, res, next) => {
  try {
    const schema = z.object({
      portals: z.array(z.enum(['ALLEGRO', 'OTOMOTO', 'AUTOLINE'])).default(['ALLEGRO', 'OTOMOTO', 'AUTOLINE']),
    });
    const { portals } = schema.parse(req.body);
    const user = req.user as JwtPayload;

    const part = await prisma.part.findFirst({ where: { id: req.params.partId, userId: user.userId } });
    if (!part) throw new AppError(404, 'Część nie znaleziona');

    const { runJob, createJob } = await import('../services/publishJobService');
    const jobId = createJob({ partId: part.id, userId: user.userId, portals: portals as Portal[] });
    await runJob(jobId, { partId: part.id, userId: user.userId, portals: portals as Portal[] });

    const job = getJob(jobId);
    res.json({ jobId, results: job?.results ?? [] });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/publish/status ───────────────────
// Globalny status: ile portali podłączonych, ile aktywnych jobów, SSE connections
publishRouter.get('/status', authenticate, async (req, res, next) => {
  try {
    const user = req.user as JwtPayload;
    const [allegroStatus, otomotoStatus, autolineStats] = await Promise.allSettled([
      import('../services/allegroService').then((m) => m.getConnectionStatus()),
      import('../services/otomotoService').then((m) => m.getConnectionStatus()),
      prisma.part.count({ where: { userId: user.userId, stock: { gt: 0 } } }),
    ]);

    const [listingStats] = await Promise.all([
      prisma.listing.groupBy({
        by:     ['portal', 'status'],
        where:  { userId: user.userId },
        _count: { id: true },
      }),
    ]);

    // Pogrupuj statystyki per portal
    const byPortal: Record<string, Record<string, number>> = {};
    for (const row of listingStats) {
      if (!byPortal[row.portal]) byPortal[row.portal] = {};
      byPortal[row.portal][row.status] = row._count.id;
    }

    res.json({
      portals: {
        ALLEGRO: {
          connected: allegroStatus.status === 'fulfilled' ? allegroStatus.value.connected : false,
          stats:     byPortal['ALLEGRO'] ?? {},
        },
        OTOMOTO: {
          connected: otomotoStatus.status === 'fulfilled' ? otomotoStatus.value.connected : false,
          stats:     byPortal['OTOMOTO'] ?? {},
        },
        AUTOLINE: {
          connected: true, // Zawsze dostępne (eksport pliku)
          stats:     byPortal['AUTOLINE'] ?? {},
        },
      },
      partsInStock:      autolineStats.status === 'fulfilled' ? autolineStats.value : 0,
      sseConnections:    sseBroker.connectionCount,
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/publish/history/:partId ─────────
// Historia wystawień danej części na wszystkie portale
publishRouter.get('/history/:partId', authenticate, async (req, res, next) => {
  try {
    const part = await prisma.part.findFirst({
      where: { id: req.params.partId, userId: req.user!.userId },
    });
    if (!part) throw new AppError(404, 'Część nie znaleziona');

    const listings = await prisma.listing.findMany({
      where:   { partId: req.params.partId },
      include: {
        template: { select: { id: true, name: true, portal: true } },
        history:  { orderBy: { createdAt: 'desc' }, take: 10 },
      },
      orderBy: { updatedAt: 'desc' },
    });

    res.json(listings);
  } catch (err) {
    next(err);
  }
});
