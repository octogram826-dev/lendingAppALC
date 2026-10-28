import bcrypt from 'bcryptjs';
import jwt, { type SignOptions } from 'jsonwebtoken';
import type { RowDataPacket } from 'mysql2/promise';
import { env } from './config';
import { query } from './db';
import { AppError } from './errors';

export interface AuthUser {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  status: 'active' | 'inactive';
  roles: string[];
  permissions: string[];
}

type UserRow = RowDataPacket & {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  status: 'active' | 'inactive';
  password_hash?: string;
};

let dummyHash: string | null = null;

function getDummyHash(): string {
  dummyHash ??= bcrypt.hashSync('lms-dummy-password', 10);
  return dummyHash;
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export function signToken(userId: number): string {
  const options: SignOptions = { expiresIn: env.jwtExpiresIn as SignOptions['expiresIn'] };
  return jwt.sign({ sub: userId }, env.jwtSecret, options);
}

export function readUserId(token: string): number {
  const payload = jwt.verify(token, env.jwtSecret);
  if (typeof payload === 'string' || payload.sub === undefined) {
    throw new AppError(401, 'Invalid or expired token');
  }
  const userId = Number(payload.sub);
  if (!Number.isSafeInteger(userId) || userId < 1) {
    throw new AppError(401, 'Invalid or expired token');
  }
  return userId;
}

export async function loadAuthUser(userId: number): Promise<AuthUser | null> {
  const users = await query<UserRow>(
    'SELECT id, email, first_name, last_name, status FROM users WHERE id = ?',
    [userId],
  );
  const user = users[0];
  if (!user) {
    return null;
  }

  const roles = await query<RowDataPacket & { name: string }>(
    `SELECT r.name
     FROM roles r
     INNER JOIN user_roles ur ON ur.role_id = r.id
     WHERE ur.user_id = ?
     ORDER BY r.name`,
    [userId],
  );
  const permissions = await query<RowDataPacket & { code: string }>(
    `SELECT DISTINCT p.code
     FROM permissions p
     INNER JOIN role_permissions rp ON rp.permission_id = p.id
     INNER JOIN user_roles ur ON ur.role_id = rp.role_id
     WHERE ur.user_id = ?
     ORDER BY p.code`,
    [userId],
  );

  return {
    id: user.id,
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    status: user.status,
    roles: roles.map((role) => role.name),
    permissions: permissions.map((permission) => permission.code),
  };
}

export async function login(email: string, password: string): Promise<{ token: string; user: AuthUser }> {
  const rows = await query<UserRow>(
    'SELECT id, password_hash, status FROM users WHERE email = ?',
    [email.toLowerCase()],
  );
  const row = rows[0];
  const matches = await bcrypt.compare(password, row?.password_hash ?? getDummyHash());
  if (!row || row.status !== 'active' || !matches) {
    throw new AppError(401, 'Invalid email or password');
  }

  const user = await loadAuthUser(row.id);
  if (!user) {
    throw new AppError(401, 'Invalid email or password');
  }
  return { token: signToken(user.id), user };
}

export async function verifyPassword(userId: number, password: string): Promise<boolean> {
  const rows = await query<UserRow>('SELECT password_hash FROM users WHERE id = ?', [userId]);
  const row = rows[0];
  if (!row?.password_hash) {
    return false;
  }
  return bcrypt.compare(password, row.password_hash);
}
