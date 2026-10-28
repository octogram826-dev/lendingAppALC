import { Router } from 'express';
import type { RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { execute, placeholders, query, withTransaction } from '../db';
import { AppError, isDuplicateKey } from '../errors';
import { asyncHandler, currentUser, requireAuth, requirePermission, validate } from '../http';
import { parseId } from '../params';
import { hasAnyField, LIKE_ESCAPE, likeContains, pageMeta, pageQuerySchema, passwordSchema } from '../schemas';
import { apiDateTime } from '../domain/dates';
import { hashPassword } from '../session';

type UserRow = RowDataPacket & {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
};

type RoleLink = RowDataPacket & { user_id: number; id: number; name: string };

function mapUser(row: UserRow, roles: Array<{ id: number; name: string }>) {
  return {
    id: row.id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    status: row.status,
    roles,
    createdAt: apiDateTime(row.created_at),
    updatedAt: apiDateTime(row.updated_at),
  };
}

async function rolesForUsers(userIds: number[]): Promise<Map<number, Array<{ id: number; name: string }>>> {
  const grouped = new Map<number, Array<{ id: number; name: string }>>();
  if (userIds.length === 0) {
    return grouped;
  }
  const links = await query<RoleLink>(
    `SELECT ur.user_id, r.id, r.name
     FROM user_roles ur
     INNER JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_id IN (${placeholders(userIds.length)})
     ORDER BY r.name`,
    userIds,
  );
  for (const link of links) {
    const current = grouped.get(link.user_id) ?? [];
    current.push({ id: link.id, name: link.name });
    grouped.set(link.user_id, current);
  }
  return grouped;
}

async function getUser(id: number) {
  const rows = await query<UserRow>(
    'SELECT id, email, first_name, last_name, status, created_at, updated_at FROM users WHERE id = ?',
    [id],
  );
  const row = rows[0];
  if (!row) {
    throw new AppError(404, 'User not found');
  }
  const roles = await rolesForUsers([id]);
  return mapUser(row, roles.get(id) ?? []);
}

async function countOtherActiveAdmins(userId: number): Promise<number> {
  const rows = await query<RowDataPacket & { count: number }>(
    `SELECT COUNT(*) AS count
     FROM users u
     INNER JOIN user_roles ur ON ur.user_id = u.id
     INNER JOIN roles r ON r.id = ur.role_id
     WHERE r.name = 'admin' AND u.status = 'active' AND u.id <> ?`,
    [userId],
  );
  return Number(rows[0]?.count ?? 0);
}

const listQuerySchema = pageQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

const createUserSchema = z.object({
  email: z.string().trim().email().max(255).transform((value) => value.toLowerCase()),
  password: passwordSchema,
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  status: z.enum(['active', 'inactive']).default('active'),
  roleIds: z.array(z.number().int().positive()).min(1),
});

const patchUserSchema = z
  .object({
    firstName: z.string().trim().min(1).max(100).optional(),
    lastName: z.string().trim().min(1).max(100).optional(),
    status: z.enum(['active', 'inactive']).optional(),
    password: passwordSchema.optional(),
  })
  .refine(hasAnyField, 'Provide at least one field to update');

const roleAssignmentSchema = z.object({
  roleIds: z.array(z.number().int().positive()).min(1),
});

export const usersRouter = Router();
usersRouter.use(requireAuth);

usersRouter.get(
  '/',
  requirePermission('users.read'),
  asyncHandler(async (req, res) => {
    const filters = validate(listQuerySchema, req.query);
    const where: string[] = [];
    const params: unknown[] = [];
    if (filters.status) {
      where.push('status = ?');
      params.push(filters.status);
    }
    if (filters.q) {
      const like = likeContains(filters.q);
      where.push(
        `(email LIKE ? ${LIKE_ESCAPE} OR first_name LIKE ? ${LIKE_ESCAPE} OR last_name LIKE ? ${LIKE_ESCAPE})`,
      );
      params.push(like, like, like);
    }
    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const totalRows = await query<RowDataPacket & { count: number }>(
      `SELECT COUNT(*) AS count FROM users ${whereSql}`,
      params,
    );
    const offset = (filters.page - 1) * filters.pageSize;
    const rows = await query<UserRow>(
      `SELECT id, email, first_name, last_name, status, created_at, updated_at
       FROM users ${whereSql}
       ORDER BY last_name, first_name, id
       LIMIT ? OFFSET ?`,
      [...params, filters.pageSize, offset],
    );
    const roles = await rolesForUsers(rows.map((row) => row.id));
    res.json({
      data: rows.map((row) => mapUser(row, roles.get(row.id) ?? [])),
      meta: pageMeta(filters.page, filters.pageSize, Number(totalRows[0]?.count ?? 0)),
    });
  }),
);

usersRouter.post(
  '/',
  requirePermission('users.write'),
  asyncHandler(async (req, res) => {
    const body = validate(createUserSchema, req.body);
    const roleIds = [...new Set(body.roleIds)];
    const roles = await query<RowDataPacket & { id: number; name: string }>(
      `SELECT id, name FROM roles WHERE id IN (${placeholders(roleIds.length)})`,
      roleIds,
    );
    if (roles.length !== roleIds.length) {
      throw new AppError(400, 'One or more roles do not exist');
    }

    try {
      const passwordHash = await hashPassword(body.password);
      const userId = await withTransaction(async (conn) => {
        const created = await execute(
          `INSERT INTO users (email, password_hash, first_name, last_name, status) VALUES (?, ?, ?, ?, ?)`,
          [body.email, passwordHash, body.firstName, body.lastName, body.status],
          conn,
        );
        for (const roleId of roleIds) {
          await execute('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [created.insertId, roleId], conn);
        }
        return created.insertId;
      });
      res.status(201).json({ data: await getUser(userId) });
    } catch (error) {
      if (isDuplicateKey(error)) {
        throw new AppError(409, 'A user with this email already exists');
      }
      throw error;
    }
  }),
);

usersRouter.get(
  '/:id',
  requirePermission('users.read'),
  asyncHandler(async (req, res) => {
    res.json({ data: await getUser(parseId(req.params.id)) });
  }),
);

usersRouter.patch(
  '/:id',
  requirePermission('users.write'),
  asyncHandler(async (req, res) => {
    const userId = parseId(req.params.id);
    const body = validate(patchUserSchema, req.body);
    const existing = await getUser(userId);
    const actor = currentUser(req);

    if (body.status === 'inactive' && actor.id === userId) {
      throw new AppError(409, 'You cannot deactivate your own account');
    }

    const isActiveAdmin = existing.status === 'active' && existing.roles.some((role) => role.name === 'admin');
    if (isActiveAdmin && body.status === 'inactive' && (await countOtherActiveAdmins(userId)) === 0) {
      throw new AppError(409, 'The last active admin cannot be deactivated');
    }

    const sets: string[] = [];
    const params: unknown[] = [];
    if (body.firstName !== undefined) {
      sets.push('first_name = ?');
      params.push(body.firstName);
    }
    if (body.lastName !== undefined) {
      sets.push('last_name = ?');
      params.push(body.lastName);
    }
    if (body.status !== undefined) {
      sets.push('status = ?');
      params.push(body.status);
    }
    if (body.password !== undefined) {
      sets.push('password_hash = ?');
      params.push(await hashPassword(body.password));
    }
    await execute(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, [...params, userId]);
    res.json({ data: await getUser(userId) });
  }),
);

usersRouter.put(
  '/:id/roles',
  requirePermission('users.write'),
  asyncHandler(async (req, res) => {
    const userId = parseId(req.params.id);
    const body = validate(roleAssignmentSchema, req.body);
    const roleIds = [...new Set(body.roleIds)];
    const existing = await getUser(userId);
    const roles = await query<RowDataPacket & { id: number; name: string }>(
      `SELECT id, name FROM roles WHERE id IN (${placeholders(roleIds.length)})`,
      roleIds,
    );
    if (roles.length !== roleIds.length) {
      throw new AppError(400, 'One or more roles do not exist');
    }

    const keepsAdmin = roles.some((role) => role.name === 'admin');
    const isActiveAdmin = existing.status === 'active' && existing.roles.some((role) => role.name === 'admin');
    if (isActiveAdmin && !keepsAdmin && (await countOtherActiveAdmins(userId)) === 0) {
      throw new AppError(409, 'The last active admin must keep the admin role');
    }

    await withTransaction(async (conn) => {
      await execute('DELETE FROM user_roles WHERE user_id = ?', [userId], conn);
      for (const roleId of roleIds) {
        await execute('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, roleId], conn);
      }
    });
    res.json({ data: await getUser(userId) });
  }),
);

type RoleRow = RowDataPacket & { id: number; name: string; description: string };
type PermissionLink = RowDataPacket & { role_id: number; code: string };

async function loadRoles() {
  const roles = await query<RoleRow>('SELECT id, name, description FROM roles ORDER BY name');
  const links =
    roles.length === 0
      ? []
      : await query<PermissionLink>(
          `SELECT rp.role_id, p.code
           FROM role_permissions rp
           INNER JOIN permissions p ON p.id = rp.permission_id
           WHERE rp.role_id IN (${placeholders(roles.length)})
           ORDER BY p.code`,
          roles.map((role) => role.id),
        );
  const codes = new Map<number, string[]>();
  for (const link of links) {
    const current = codes.get(link.role_id) ?? [];
    current.push(link.code);
    codes.set(link.role_id, current);
  }
  return roles.map((role) => ({
    id: role.id,
    name: role.name,
    description: role.description,
    permissions: codes.get(role.id) ?? [],
  }));
}

async function assertPermissionCodes(codes: string[]): Promise<void> {
  if (codes.length === 0) {
    return;
  }
  const unique = [...new Set(codes)];
  const rows = await query<RowDataPacket & { code: string }>(
    `SELECT code FROM permissions WHERE code IN (${placeholders(unique.length)})`,
    unique,
  );
  if (rows.length !== unique.length) {
    throw new AppError(400, 'One or more permissions do not exist');
  }
}

const roleNameSchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9_]{1,62}$/, 'Role name must be lowercase and use letters, numbers, or underscores');

const createRoleSchema = z.object({
  name: roleNameSchema,
  description: z.string().trim().max(255).default(''),
  permissionCodes: z.array(z.string().trim().min(1).max(64)).default([]),
});

const patchRoleSchema = z
  .object({
    description: z.string().trim().max(255).optional(),
    permissionCodes: z.array(z.string().trim().min(1).max(64)).optional(),
  })
  .refine(hasAnyField, 'Provide at least one field to update');

export const rolesRouter = Router();
rolesRouter.use(requireAuth, requirePermission('roles.manage'));

rolesRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ data: await loadRoles() });
  }),
);

rolesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = validate(createRoleSchema, req.body);
    const permissionCodes = [...new Set(body.permissionCodes)];
    await assertPermissionCodes(permissionCodes);
    try {
      await withTransaction(async (conn) => {
        const created = await execute(
          'INSERT INTO roles (name, description) VALUES (?, ?)',
          [body.name, body.description],
          conn,
        );
        if (permissionCodes.length > 0) {
          const permissions = await query<RowDataPacket & { id: number; code: string }>(
            `SELECT id, code FROM permissions WHERE code IN (${placeholders(permissionCodes.length)})`,
            permissionCodes,
            conn,
          );
          for (const permission of permissions) {
            await execute(
              'INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)',
              [created.insertId, permission.id],
              conn,
            );
          }
        }
      });
    } catch (error) {
      if (isDuplicateKey(error)) {
        throw new AppError(409, 'A role with this name already exists');
      }
      throw error;
    }
    res.status(201).json({ data: await loadRoles().then((roles) => roles.find((role) => role.name === body.name)) });
  }),
);

rolesRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const roleId = parseId(req.params.id);
    const body = validate(patchRoleSchema, req.body);
    const existing = await query<RoleRow>('SELECT id, name, description FROM roles WHERE id = ?', [roleId]);
    const role = existing[0];
    if (!role) {
      throw new AppError(404, 'Role not found');
    }
    if (role.name === 'admin' && body.permissionCodes !== undefined) {
      throw new AppError(409, 'The admin role always retains every permission');
    }
    if (body.permissionCodes !== undefined) {
      await assertPermissionCodes(body.permissionCodes);
    }

    await withTransaction(async (conn) => {
      if (body.description !== undefined) {
        await execute('UPDATE roles SET description = ? WHERE id = ?', [body.description, roleId], conn);
      }
      if (body.permissionCodes !== undefined) {
        const permissionCodes = [...new Set(body.permissionCodes)];
        await execute('DELETE FROM role_permissions WHERE role_id = ?', [roleId], conn);
        if (permissionCodes.length > 0) {
          const permissions = await query<RowDataPacket & { id: number }>(
            `SELECT id FROM permissions WHERE code IN (${placeholders(permissionCodes.length)})`,
            permissionCodes,
            conn,
          );
          for (const permission of permissions) {
            await execute(
              'INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)',
              [roleId, permission.id],
              conn,
            );
          }
        }
      }
    });

    const roles = await loadRoles();
    res.json({ data: roles.find((item) => item.id === roleId) });
  }),
);

export const permissionsRouter = Router();
permissionsRouter.use(requireAuth, requirePermission('roles.manage'));

permissionsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows = await query<RowDataPacket & { id: number; code: string; description: string }>(
      'SELECT id, code, description FROM permissions ORDER BY code',
    );
    res.json({
      data: rows.map((row) => ({ id: row.id, code: row.code, description: row.description })),
    });
  }),
);
