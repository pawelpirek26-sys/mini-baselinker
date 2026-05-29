import { Router, Request } from 'express';
import multer, { FileFilterCallback } from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

export const imagesRouter = Router();
imagesRouter.use(authenticate);

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR ?? './uploads');

// Upewnij się, że folder istnieje
fs.mkdir(UPLOAD_DIR, { recursive: true }).catch(() => {});

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, unique);
  },
});

const fileFilter = (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  cb(null, allowed.includes(file.mimetype));
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: Number(process.env.MAX_FILE_SIZE ?? 10_485_760), files: 20 },
});

// POST /api/images/upload/:partId
imagesRouter.post('/upload/:partId', upload.array('images', 20), async (req, res, next) => {
  try {
    const part = await prisma.part.findFirst({
      where: { id: req.params.partId, userId: req.user!.userId },
      include: { images: { orderBy: { order: 'desc' }, take: 1 } },
    });
    if (!part) throw new AppError(404, 'Część nie znaleziona');

    const files = req.files as Express.Multer.File[];
    if (!files?.length) throw new AppError(400, 'Brak plików do wgrania');

    const maxOrder = part.images[0]?.order ?? -1;

    const created = await prisma.$transaction(
      files.map((file, i) =>
        prisma.partImage.create({
          data: {
            partId: req.params.partId,
            filename: file.filename,
            url: `/uploads/${file.filename}`,
            order: maxOrder + 1 + i,
            isCover: maxOrder + 1 + i === 0,
          },
        }),
      ),
    );

    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/images/reorder – nowa kolejność
imagesRouter.patch('/reorder', async (req, res, next) => {
  try {
    const schema = z.object({
      partId: z.string(),
      order: z.array(z.string()), // tablica ID zdjęć w nowej kolejności
    });
    const { partId, order } = schema.parse(req.body);

    const part = await prisma.part.findFirst({
      where: { id: partId, userId: req.user!.userId },
    });
    if (!part) throw new AppError(404, 'Część nie znaleziona');

    await prisma.$transaction(
      order.map((imgId, idx) =>
        prisma.partImage.update({
          where: { id: imgId },
          data: { order: idx, isCover: idx === 0 },
        }),
      ),
    );

    const images = await prisma.partImage.findMany({
      where: { partId },
      orderBy: { order: 'asc' },
    });
    res.json(images);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/images/:id
imagesRouter.delete('/:id', async (req, res, next) => {
  try {
    const img = await prisma.partImage.findUnique({ where: { id: req.params.id } });
    if (!img) throw new AppError(404, 'Zdjęcie nie znalezione');

    // Sprawdź własność przez part
    const part = await prisma.part.findFirst({
      where: { id: img.partId, userId: req.user!.userId },
    });
    if (!part) throw new AppError(403, 'Brak dostępu');

    // Usuń plik z dysku
    try {
      await fs.unlink(path.join(UPLOAD_DIR, img.filename));
    } catch {
      /* plik może już nie istnieć */
    }

    await prisma.partImage.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
