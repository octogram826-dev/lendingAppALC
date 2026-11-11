import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

function read(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

function readFirst(names: string[], fallback: string): string {
  for (const name of names) {
    const value = process.env[name];
    if (value !== undefined && value !== '') {
      return value;
    }
  }
  return fallback;
}

function readIntFirst(names: string[], fallback: number): number {
  for (const name of names) {
    const raw = process.env[name];
    if (raw === undefined || raw === '') {
      continue;
    }
    const value = Number(raw);
    if (!Number.isInteger(value)) {
      throw new Error(`${name} must be an integer`);
    }
    return value;
  }
  return fallback;
}

const dbName = readFirst(['DB_NAME', 'MYSQLDATABASE'], 'lms');
if (!/^[A-Za-z0-9_]+$/.test(dbName)) {
  throw new Error('DB_NAME may contain only letters, numbers, and underscores');
}

export const env = {
  nodeEnv: read('NODE_ENV', 'development'),
  port: readIntFirst(['PORT'], 3000),
  jwtSecret: process.env.JWT_SECRET ?? '',
  jwtExpiresIn: read('JWT_EXPIRES_IN', '8h'),
  dbHost: readFirst(['DB_HOST', 'MYSQLHOST'], '127.0.0.1'),
  dbPort: readIntFirst(['DB_PORT', 'MYSQLPORT'], 3306),
  dbUser: readFirst(['DB_USER', 'MYSQLUSER'], 'root'),
  dbPassword: process.env.DB_PASSWORD ?? process.env.MYSQLPASSWORD ?? '',
  dbName,
  corsOrigin: read('CORS_ORIGIN', '*'),
};

export function assertServerEnv(): void {
  if (env.jwtSecret.length < 16) {
    throw new Error('JWT_SECRET must be set to at least 16 characters');
  }
  if (env.port < 1 || env.port > 65535) {
    throw new Error('PORT must be between 1 and 65535');
  }
  if (env.dbPort < 1 || env.dbPort > 65535) {
    throw new Error('DB_PORT must be between 1 and 65535');
  }
}
