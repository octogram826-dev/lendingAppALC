import { Router } from 'express';
import type { RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { apiDateTime } from '../domain/dates';
import { execute, query } from '../db';
import { AppError } from '../errors';
import { asyncHandler, requireAuth, requirePermission, validate } from '../http';
import { SETTING_KEYS } from '../settingsStore';

const valueSchema = z.object({
  value: z.union([z.string(), z.number()]),
});

function normalizeSetting(key: string, value: string | number): string {
  if (key === SETTING_KEYS.companyName) {
    if (typeof value !== 'string' || value.trim().length < 1 || value.trim().length > 100) {
      throw new AppError(400, 'company_name must be 1 to 100 characters');
    }
    return value.trim();
  }

  if (key === SETTING_KEYS.currency) {
    const currency = String(value).trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new AppError(400, 'currency must be a 3-letter ISO code');
    }
    return currency;
  }

  if (key === SETTING_KEYS.maxInstallmentToIncome) {
    const text = typeof value === 'number' ? value.toString() : value.trim();
    if (!/^\d+(\.\d{1,4})?$/.test(text)) {
      throw new AppError(400, 'max_installment_to_income must be a number with at most 4 decimal places');
    }
    const ratio = Number(text);
    if (ratio <= 0 || ratio > 1) {
      throw new AppError(400, 'max_installment_to_income must be greater than 0 and at most 1');
    }
    return ratio.toFixed(4);
  }

  if (key === SETTING_KEYS.overdueGraceDays) {
    const text = typeof value === 'number' ? value.toString() : value.trim();
    if (!/^\d+$/.test(text)) {
      throw new AppError(400, 'overdue_grace_days must be a whole number');
    }
    const days = Number(text);
    if (days < 0 || days > 365) {
      throw new AppError(400, 'overdue_grace_days must be between 0 and 365');
    }
    return String(days);
  }

  throw new AppError(404, 'Setting not found');
}

export const settingsRouter = Router();
settingsRouter.use(requireAuth, requirePermission('settings.manage'));

settingsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows = await query<RowDataPacket & { setting_key: string; setting_value: string; description: string; updated_at: string }>(
      'SELECT setting_key, setting_value, description, updated_at FROM system_settings ORDER BY setting_key',
    );
    res.json({
      data: rows.map((row) => ({
        key: row.setting_key,
        value: row.setting_value,
        description: row.description,
        updatedAt: apiDateTime(row.updated_at),
      })),
    });
  }),
);

settingsRouter.put(
  '/:key',
  asyncHandler(async (req, res) => {
    const key = req.params.key;
    const known = Object.values(SETTING_KEYS) as string[];
    if (!known.includes(key)) {
      throw new AppError(404, 'Setting not found');
    }
    const body = validate(valueSchema, req.body);
    const value = normalizeSetting(key, body.value);
    const result = await execute(
      'UPDATE system_settings SET setting_value = ? WHERE setting_key = ?',
      [value, key],
    );
    if (result.affectedRows === 0) {
      throw new AppError(404, 'Setting not found');
    }
    const rows = await query<RowDataPacket & { setting_key: string; setting_value: string; description: string; updated_at: string }>(
      'SELECT setting_key, setting_value, description, updated_at FROM system_settings WHERE setting_key = ?',
      [key],
    );
    const row = rows[0];
    res.json({
      data: {
        key: row.setting_key,
        value: row.setting_value,
        description: row.description,
        updatedAt: apiDateTime(row.updated_at),
      },
    });
  }),
);
