import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

export const compatibilityRouter = Router();
compatibilityRouter.use(authenticate);

const compatSchema = z.object({
  brand: z.string().min(1).max(50),
  series: z.string().max(50).optional().nullable(),
  model: z.string().max(100).optional().nullable(),
  yearFrom: z.number().int().min(1950).max(2030).optional().nullable(),
  yearTo: z.number().int().min(1950).max(2030).optional().nullable(),
  engineCode: z.string().max(50).optional().nullable(),
  vinRange: z.string().max(200).optional().nullable(),
  tecdocId: z.string().max(50).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

// GET /api/compatibility/:partId
compatibilityRouter.get('/:partId', async (req, res, next) => {
  try {
    const part = await prisma.part.findFirst({
      where: { id: req.params.partId, userId: req.user!.userId },
    });
    if (!part) throw new AppError(404, 'Część nie znaleziona');

    const items = await prisma.compatibility.findMany({
      where: { partId: req.params.partId },
      orderBy: [{ brand: 'asc' }, { model: 'asc' }],
    });
    res.json(items);
  } catch (err) {
    next(err);
  }
});

// POST /api/compatibility/:partId
compatibilityRouter.post('/:partId', async (req, res, next) => {
  try {
    const part = await prisma.part.findFirst({
      where: { id: req.params.partId, userId: req.user!.userId },
    });
    if (!part) throw new AppError(404, 'Część nie znaleziona');

    const data = compatSchema.parse(req.body);
    const item = await prisma.compatibility.create({
      data: { partId: req.params.partId, ...data },
    });
    res.status(201).json(item);
  } catch (err) {
    next(err);
  }
});

// POST /api/compatibility/:partId/bulk
compatibilityRouter.post('/:partId/bulk', async (req, res, next) => {
  try {
    const part = await prisma.part.findFirst({
      where: { id: req.params.partId, userId: req.user!.userId },
    });
    if (!part) throw new AppError(404, 'Część nie znaleziona');

    const items = z.array(compatSchema).min(1).parse(req.body);
    const created = await prisma.$transaction(
      items.map((item) =>
        prisma.compatibility.create({ data: { partId: req.params.partId, ...item } }),
      ),
    );
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/compatibility/:id
compatibilityRouter.patch('/:id', async (req, res, next) => {
  try {
    const item = await prisma.compatibility.findUnique({ where: { id: req.params.id } });
    if (!item) throw new AppError(404, 'Wpis nie znaleziony');

    const part = await prisma.part.findFirst({
      where: { id: item.partId, userId: req.user!.userId },
    });
    if (!part) throw new AppError(403, 'Brak dostępu');

    const data = compatSchema.partial().parse(req.body);
    const updated = await prisma.compatibility.update({
      where: { id: req.params.id },
      data,
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/compatibility/:id
compatibilityRouter.delete('/:id', async (req, res, next) => {
  try {
    const item = await prisma.compatibility.findUnique({ where: { id: req.params.id } });
    if (!item) throw new AppError(404, 'Wpis nie znaleziony');

    const part = await prisma.part.findFirst({
      where: { id: item.partId, userId: req.user!.userId },
    });
    if (!part) throw new AppError(403, 'Brak dostępu');

    await prisma.compatibility.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
