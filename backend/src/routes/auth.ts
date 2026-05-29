import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { AppError } from '../middleware/errorHandler';

export const authRouter = Router();

const registerSchema = z.object({
  email: z.string().email('Nieprawidłowy email'),
  password: z.string().min(8, 'Hasło min. 8 znaków'),
  name: z.string().min(2, 'Imię min. 2 znaki'),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// POST /api/auth/register
authRouter.post('/register', async (req, res, next) => {
  try {
    const data = registerSchema.parse(req.body);

    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) throw new AppError(409, 'Konto z tym emailem już istnieje');

    const hash = await bcrypt.hash(data.password, 12);
    const user = await prisma.user.create({
      data: { email: data.email, password: hash, name: data.name },
      select: { id: true, email: true, name: true, role: true },
    });

    const expiresIn = (process.env.JWT_EXPIRES_IN ?? '7d') as jwt.SignOptions['expiresIn'];
    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET!,
      { expiresIn },
    );

    res.status(201).json({ user, token });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
authRouter.post('/login', async (req, res, next) => {
  try {
    const data = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email: data.email } });
    if (!user) throw new AppError(401, 'Nieprawidłowy email lub hasło');

    const valid = await bcrypt.compare(data.password, user.password);
    if (!valid) throw new AppError(401, 'Nieprawidłowy email lub hasło');

    const expiresIn = (process.env.JWT_EXPIRES_IN ?? '7d') as jwt.SignOptions['expiresIn'];
    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET!,
      { expiresIn },
    );

    res.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      token,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
authRouter.get('/me', async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) throw new AppError(401, 'Brak tokenu');

    const token = authHeader.slice(7);
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, name: true, role: true },
    });
    if (!user) throw new AppError(404, 'Użytkownik nie istnieje');

    res.json(user);
  } catch (err) {
    next(err);
  }
});
