import { Router } from 'express';
import { prisma } from '../utils/prisma';
import { authenticate } from '../middleware/auth';
import { runSync } from '../services/truckpartsSyncEngine';

export const syncRouter = Router();
syncRouter.use(authenticate);

// POST /api/sync/run — ręczna synchronizacja
syncRouter.post('/run', async (req, res, next) => {
  try {
    const logId = await runSync(req.user!.userId, 'MANUAL');
    const log = await prisma.syncLog.findUnique({ where: { id: logId } });
    res.json(log);
  } catch (err) {
    next(err);
  }
});

// GET /api/sync/status — ostatni log
syncRouter.get('/status', async (req, res, next) => {
  try {
    const log = await prisma.syncLog.findFirst({
      orderBy: { createdAt: 'desc' },
    });
    res.json(log ?? null);
  } catch (err) {
    next(err);
  }
});

// GET /api/sync/logs?page=1&limit=20
syncRouter.get('/logs', async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Number(req.query.limit) || 20);
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      prisma.syncLog.findMany({ orderBy: { createdAt: 'desc' }, skip, take: limit }),
      prisma.syncLog.count(),
    ]);

    res.json({ items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (err) {
    next(err);
  }
});
