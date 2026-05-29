import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { authRouter } from './routes/auth';
import { partsRouter } from './routes/parts';
import { templatesRouter } from './routes/templates';
import { listingsRouter } from './routes/listings';
import { imagesRouter } from './routes/images';
import { compatibilityRouter } from './routes/compatibility';
import { allegroRouter } from './routes/allegro';
import { otomotoRouter } from './routes/otomoto';
import { autolineRouter } from './routes/autoline';
import { publishRouter } from './routes/publish';
import { importRouter } from './routes/import';
import { errorHandler } from './middleware/errorHandler';

const app = express();
const PORT = process.env.PORT ?? 4000;

// ── Middleware ────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Statyczne pliki (zdjęcia) ────────────────
app.use('/uploads', express.static(path.resolve(process.env.UPLOAD_DIR ?? './uploads')));

// ── Trasy API ────────────────────────────────
app.use('/api/auth',          authRouter);
app.use('/api/parts',         partsRouter);
app.use('/api/templates',     templatesRouter);
app.use('/api/listings',      listingsRouter);
app.use('/api/images',        imagesRouter);
app.use('/api/compatibility',  compatibilityRouter);
app.use('/api/allegro',         allegroRouter);
app.use('/api/otomoto',         otomotoRouter);
app.use('/api/autoline',        autolineRouter);
app.use('/api/publish',         publishRouter);
app.use('/api/import',          importRouter);

// ── Health check ─────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Error handler (musi być ostatni) ─────────
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`✅  API działa na http://localhost:${PORT}`);
});

export default app;
