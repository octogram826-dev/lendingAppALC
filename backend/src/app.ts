import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import type { RowDataPacket } from 'mysql2/promise';
import { env } from './config';
import { query } from './db';
import { asyncHandler, errorHandler } from './http';
import { agreementsRouter } from './modules/agreements';
import { applicationsRouter } from './modules/applications';
import { authRouter } from './modules/auth';
import { borrowersRouter } from './modules/borrowers';
import { dashboardRouter } from './modules/dashboard';
import { loansRouter, receiptsRouter } from './modules/loans';
import { productsRouter } from './modules/products';
import { settingsRouter } from './modules/settings';
import { permissionsRouter, rolesRouter, usersRouter } from './modules/users';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: env.corsOrigin === '*' ? true : env.corsOrigin }));
  app.use(express.json({ limit: '1mb' }));
  app.use((req, res, next) => {
    const started = Date.now();
    res.on('finish', () => {
      console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - started}ms`);
    });
    next();
  });

  app.get(
    '/api/health',
    asyncHandler(async (_req, res) => {
      try {
        await query<RowDataPacket>('SELECT 1 AS ok');
        res.json({ data: { status: 'ok', database: 'up' } });
      } catch (error) {
        console.error(error);
        res.status(503).json({ error: { message: 'Database unavailable' } });
      }
    }),
  );

  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/roles', rolesRouter);
  app.use('/api/permissions', permissionsRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/borrowers', borrowersRouter);
  app.use('/api/products', productsRouter);
  app.use('/api/applications', applicationsRouter);
  app.use('/api/agreements', agreementsRouter);
  app.use('/api/loans', loansRouter);
  app.use('/api/receipts', receiptsRouter);
  app.use('/api/dashboard', dashboardRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: { message: 'Not found' } });
  });
  app.use(errorHandler);
  return app;
}
