import { Router } from 'express';
import { z } from 'zod';
import { execute } from '../db';
import { AppError } from '../errors';
import { asyncHandler, currentUser, requireAuth, validate } from '../http';
import { passwordSchema } from '../schemas';
import { hashPassword, login, verifyPassword } from '../session';

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(1).max(72),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(72),
  newPassword: passwordSchema,
});

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const body = validate(loginSchema, req.body);
    const result = await login(body.email, body.password);
    res.json({ data: result });
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ data: currentUser(req) });
  }),
);

authRouter.post(
  '/password',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const body = validate(changePasswordSchema, req.body);
    if (body.currentPassword === body.newPassword) {
      throw new AppError(400, 'New password must be different from the current password');
    }
    const matches = await verifyPassword(user.id, body.currentPassword);
    if (!matches) {
      throw new AppError(400, 'Current password is incorrect');
    }
    await execute('UPDATE users SET password_hash = ? WHERE id = ?', [await hashPassword(body.newPassword), user.id]);
    res.json({ data: { changed: true } });
  }),
);
