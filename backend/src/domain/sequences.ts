import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { AppError } from '../errors';

export async function nextNumber(conn: PoolConnection, sequence: string, prefix: string): Promise<string> {
  const [rows] = await conn.query<Array<RowDataPacket & { next_value: number }>>(
    'SELECT next_value FROM number_sequences WHERE name = ? FOR UPDATE',
    [sequence],
  );
  const row = rows[0];
  if (!row) {
    throw new AppError(500, `Number sequence ${sequence} is not configured`);
  }
  const current = Number(row.next_value);
  await conn.query('UPDATE number_sequences SET next_value = ? WHERE name = ?', [current + 1, sequence]);
  return `${prefix}-${String(current).padStart(6, '0')}`;
}
