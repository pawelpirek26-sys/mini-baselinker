import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

export const templatesRouter = Router();
templatesRouter.use(authenticate);

const templateSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional().nullable(),
  portal: z.enum(['ALLEGRO', 'OTOMOTO', 'AUTOLINE']),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
  fieldMapping: z.record(z.string(), z.unknown()),
  portalConfig: z.record(z.string(), z.unknown()).default({}),
  portalCategoryId: z.string().optional().nullable(),
  portalCategoryName: z.string().optional().nullable(),
});

// GET /api/templates
templatesRouter.get('/', async (req, res, next) => {
  try {
    const portal = req.query.portal as string | undefined;
    const templates = await prisma.template.findMany({
      where: {
        userId: req.user!.userId,
        ...(portal && { portal: portal as 'ALLEGRO' | 'OTOMOTO' | 'AUTOLINE' }),
      },
      include: { _count: { select: { listings: true } } },
      orderBy: [{ portal: 'asc' }, { name: 'asc' }],
    });
    res.json(templates);
  } catch (err) {
    next(err);
  }
});

// GET /api/templates/:id
templatesRouter.get('/:id', async (req, res, next) => {
  try {
    const tmpl = await prisma.template.findFirst({
      where: { id: req.params.id, userId: req.user!.userId },
    });
    if (!tmpl) throw new AppError(404, 'Szablon nie znaleziony');
    res.json(tmpl);
  } catch (err) {
    next(err);
  }
});

// POST /api/templates
templatesRouter.post('/', async (req, res, next) => {
  try {
    const data = templateSchema.parse(req.body);

    // Jeśli ustawiamy jako domyślny – zdejmujemy flagę z innych
    if (data.isDefault) {
      await prisma.template.updateMany({
        where: { userId: req.user!.userId, portal: data.portal },
        data: { isDefault: false },
      });
    }

    const tmpl = await prisma.template.create({
      data: {
        ...data,
        fieldMapping: JSON.stringify(data.fieldMapping),
        portalConfig: JSON.stringify(data.portalConfig),
        userId: req.user!.userId,
      },
    });
    res.status(201).json(tmpl);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/templates/:id
templatesRouter.patch('/:id', async (req, res, next) => {
  try {
    const existing = await prisma.template.findFirst({
      where: { id: req.params.id, userId: req.user!.userId },
    });
    if (!existing) throw new AppError(404, 'Szablon nie znaleziony');

    const data = templateSchema.partial().parse(req.body);

    if (data.isDefault) {
      await prisma.template.updateMany({
        where: { userId: req.user!.userId, portal: existing.portal },
        data: { isDefault: false },
      });
    }

    const updated = await prisma.template.update({
      where: { id: req.params.id },
      data: {
        ...data,
        fieldMapping: data.fieldMapping ? JSON.stringify(data.fieldMapping) : undefined,
        portalConfig: data.portalConfig ? JSON.stringify(data.portalConfig) : undefined,
      },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/templates/:id
templatesRouter.delete('/:id', async (req, res, next) => {
  try {
    const existing = await prisma.template.findFirst({
      where: { id: req.params.id, userId: req.user!.userId },
    });
    if (!existing) throw new AppError(404, 'Szablon nie znaleziony');

    const hasListings = await prisma.listing.count({ where: { templateId: req.params.id } });
    if (hasListings > 0) {
      throw new AppError(409, `Szablon ma ${hasListings} powiązanych wystawień – usuń je najpierw`);
    }

    await prisma.template.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
