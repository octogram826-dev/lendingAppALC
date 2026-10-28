import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { z, type ZodTypeAny } from 'zod';
import { AppError } from './errors';
import { loadAuthUser, readUserId, type AuthUser } from './session';

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

export function validate<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new AppError(400, 'Validation failed', parsed.error.flatten());
  }
  return parsed.data;
}

export function currentUser(req: Request): AuthUser {
  if (!req.user) {
    throw new AppError(401, 'Authentication required');
  }
  return req.user;
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.header('authorization');
  if (!header || !header.startsWith('Bearer ')) {
    next(new AppError(401, 'Authentication required'));
    return;
  }

  let userId: number;
  try {
    userId = readUserId(header.slice('Bearer '.length).trim());
  } catch (error) {
    next(error instanceof AppError ? error : new AppError(401, 'Invalid or expired token'));
    return;
  }

  loadAuthUser(userId)
    .then((user) => {
      if (!user || user.status !== 'active') {
        next(new AppError(401, 'Invalid or expired token'));
        return;
      }
      req.user = user;
      next();
    })
    .catch(next);
}

export function requirePermission(...codes: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const user = req.user;
    if (!user) {
      next(new AppError(401, 'Authentication required'));
      return;
    }
    const allowed = codes.every((code) => user.permissions.includes(code));
    if (!allowed) {
      next(new AppError(403, 'You do not have permission to perform this action'));
      return;
    }
    next();
  };
}

export function requireAnyPermission(...codes: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const user = req.user;
    if (!user) {
      next(new AppError(401, 'Authentication required'));
      return;
    }
    if (!codes.some((code) => user.permissions.includes(code))) {
      next(new AppError(403, 'You do not have permission to perform this action'));
      return;
    }
    next();
  };
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    if (err.status >= 500) {
      console.error(err);
    }
    const error = err.details === undefined ? { message: err.message } : { message: err.message, details: err.details };
    res.status(err.status).json({ error });
    return;
  }

  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ error: { message: 'Invalid JSON' } });
    return;
  }

  console.error(err);
  res.status(500).json({ error: { message: 'Internal server error' } });
}
