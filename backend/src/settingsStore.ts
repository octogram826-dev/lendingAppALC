import type { RowDataPacket } from 'mysql2/promise';
import { pool, query, type Sql } from './db';
import { AppError } from './errors';

export const SETTING_KEYS = {
  companyName: 'company_name',
  currency: 'currency',
  maxInstallmentToIncome: 'max_installment_to_income',
  overdueGraceDays: 'overdue_grace_days',
} as const;

export async function getSettingValue(key: string, conn: Sql = pool): Promise<string> {
  const rows = await query<RowDataPacket & { setting_value: string }>(
    'SELECT setting_value FROM system_settings WHERE setting_key = ?',
    [key],
    conn,
  );
  const row = rows[0];
  if (!row) {
    throw new AppError(500, `System setting ${key} is not configured`);
  }
  return row.setting_value;
}

export async function getGraceDays(conn: Sql = pool): Promise<number> {
  const value = Number(await getSettingValue(SETTING_KEYS.overdueGraceDays, conn));
  if (!Number.isInteger(value) || value < 0 || value > 365) {
    throw new AppError(500, 'System setting overdue_grace_days is invalid');
  }
  return value;
}

export async function getMaxInstallmentRatio(conn: Sql = pool): Promise<number> {
  const value = Number(await getSettingValue(SETTING_KEYS.maxInstallmentToIncome, conn));
  if (!Number.isFinite(value) || value <= 0 || value > 1) {
    throw new AppError(500, 'System setting max_installment_to_income is invalid');
  }
  return value;
}
