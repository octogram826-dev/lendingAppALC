import mysql, { type Pool, type PoolConnection, type ResultSetHeader, type RowDataPacket } from 'mysql2/promise';
import { env } from './config';

export type Sql = Pool | PoolConnection;

export const pool = mysql.createPool({
  host: env.dbHost,
  port: env.dbPort,
  user: env.dbUser,
  password: env.dbPassword,
  database: env.dbName,
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,
  timezone: 'Z',
  decimalNumbers: false,
});

pool.on('connection', (connection) => {
  connection.query("SET time_zone = '+00:00'");
});

export async function query<T extends RowDataPacket>(
  sql: string,
  params: unknown[] = [],
  conn: Sql = pool,
): Promise<T[]> {
  const [rows] = await conn.query<T[]>(sql, params);
  return rows;
}

export async function execute(sql: string, params: unknown[] = [], conn: Sql = pool): Promise<ResultSetHeader> {
  const [result] = await conn.query<ResultSetHeader>(sql, params);
  return result;
}

export async function withTransaction<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export function placeholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ');
}
