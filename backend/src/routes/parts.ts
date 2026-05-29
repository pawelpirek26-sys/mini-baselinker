import { Router } from 'express';
import { prisma } from '../utils/prisma';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { partSchema, partUpdateSchema, partsQuerySchema } from '../utils/schemas';

export const partsRouter = Router();
partsRouter.use(authenticate);

// ── GET /api/parts ───────────────────────────
partsRouter.get('/', async (req, res, next) => {
  try {
    const q = partsQuerySchema.parse(req.query);
    const skip = (q.page - 1) * q.limit;

    const where: Record<string, unknown> = {
      userId: req.user!.userId,
      ...(q.search && {
        OR: [
          { name: { contains: q.search } },
          { oemNumber: { contains: q.search } },
          { catalogNumber: { contains: q.search } },
        ],
      }),
      ...(q.category && { category: q.category }),
      ...(q.condition && { condition: q.condition }),
    };

    const [items, total] = await Promise.all([
      prisma.part.findMany({
        where,
        skip,
        take: q.limit,
        orderBy: { [q.sortBy]: q.sortDir },
        include: {
          images: { orderBy: { order: 'asc' }, take: 1 },
          _count: { select: { listings: true, compatibility: true } },
        },
      }),
      prisma.part.count({ where }),
    ]);

    res.json({
      items,
      pagination: {
        page: q.page,
        limit: q.limit,
        total,
        totalPages: Math.ceil(total / q.limit),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/parts/:id ───────────────────────
partsRouter.get('/:id', async (req, res, next) => {
  try {
    const part = await prisma.part.findFirst({
      where: { id: req.params.id, userId: req.user!.userId },
      include: {
        images: { orderBy: { order: 'asc' } },
        compatibility: true,
        listings: {
          include: { template: { select: { id: true, name: true, portal: true } } },
          orderBy: { updatedAt: 'desc' },
        },
      },
    });
    if (!part) throw new AppError(404, 'Część nie znaleziona');
    res.json(part);
  } catch (err) {
    next(err);
  }
});

// ── POST /api/parts ──────────────────────────
partsRouter.post('/', async (req, res, next) => {
  try {
    const data = partSchema.parse(req.body);
    const part = await prisma.part.create({
      data: {
        ...data,
        technicalParams: data.technicalParams
          ? JSON.stringify(data.technicalParams)
          : null,
        userId: req.user!.userId,
      },
    });
    res.status(201).json(part);
  } catch (err) {
    next(err);
  }
});

// ── PATCH /api/parts/:id ─────────────────────
partsRouter.patch('/:id', async (req, res, next) => {
  try {
    const existing = await prisma.part.findFirst({
      where: { id: req.params.id, userId: req.user!.userId },
    });
    if (!existing) throw new AppError(404, 'Część nie znaleziona');

    const data = partUpdateSchema.parse(req.body);
    const updated = await prisma.part.update({
      where: { id: req.params.id },
      data: {
        ...data,
        technicalParams:
          data.technicalParams !== undefined
            ? data.technicalParams
              ? JSON.stringify(data.technicalParams)
              : null
            : undefined,
      },
      include: { images: { orderBy: { order: 'asc' } } },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/parts/:id ────────────────────
partsRouter.delete('/:id', async (req, res, next) => {
  try {
    const existing = await prisma.part.findFirst({
      where: { id: req.params.id, userId: req.user!.userId },
    });
    if (!existing) throw new AppError(404, 'Część nie znaleziona');

    await prisma.part.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
