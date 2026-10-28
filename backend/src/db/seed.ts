import type { RowDataPacket } from 'mysql2/promise';
import { env } from '../config';
import { PERMISSIONS, SEEDED_ROLES, type PermissionCode } from '../domain/permissions';
import { execute, pool, query } from '../db';
import { hashPassword } from '../session';
import { SETTING_KEYS } from '../settingsStore';

const LOCAL_ADMIN_PASSWORD = 'ChangeMe123!';

const SETTINGS: Array<{ key: string; value: string; description: string }> = [
  { key: SETTING_KEYS.companyName, value: 'ALC', description: 'Organization name' },
  { key: SETTING_KEYS.currency, value: 'PHP', description: 'ISO currency code used for loan amounts' },
  {
    key: SETTING_KEYS.maxInstallmentToIncome,
    value: '0.4000',
    description: 'Maximum proposed installment as a fraction of verified monthly income',
  },
  {
    key: SETTING_KEYS.overdueGraceDays,
    value: '0',
    description: 'Days after the due date before an unpaid installment is flagged overdue',
  },
];

async function main(): Promise<void> {
  const password = process.env.SEED_ADMIN_PASSWORD || (env.nodeEnv === 'production' ? '' : LOCAL_ADMIN_PASSWORD);
  if (!password) {
    throw new Error('Set SEED_ADMIN_PASSWORD before seeding an admin user when NODE_ENV is production');
  }

  for (const permission of PERMISSIONS) {
    await execute(
      `INSERT INTO permissions (code, description) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE description = VALUES(description)`,
      [permission.code, permission.description],
    );
  }

  const permissionRows = await query<RowDataPacket & { id: number; code: PermissionCode }>(
    'SELECT id, code FROM permissions',
  );
  const permissionIds = new Map(permissionRows.map((row) => [row.code, row.id]));

  for (const role of SEEDED_ROLES) {
    await execute(
      `INSERT INTO roles (name, description) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE description = VALUES(description)`,
      [role.name, role.description],
    );
    const roleRows = await query<RowDataPacket & { id: number }>('SELECT id FROM roles WHERE name = ?', [role.name]);
    const roleId = roleRows[0]?.id;
    if (!roleId) {
      throw new Error(`Role ${role.name} was not created`);
    }

    const codes = role.permissions === '*' ? PERMISSIONS.map((permission) => permission.code) : role.permissions;
    await execute('DELETE FROM role_permissions WHERE role_id = ?', [roleId]);
    for (const code of codes) {
      const permissionId = permissionIds.get(code);
      if (!permissionId) {
        throw new Error(`Permission ${code} is missing`);
      }
      await execute('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [roleId, permissionId]);
    }
  }

  for (const setting of SETTINGS) {
    await execute(
      `INSERT INTO system_settings (setting_key, setting_value, description) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE description = VALUES(description)`,
      [setting.key, setting.value, setting.description],
    );
  }

  const adminRole = await query<RowDataPacket & { id: number }>('SELECT id FROM roles WHERE name = ?', ['admin']);
  const adminRoleId = adminRole[0]?.id;
  if (!adminRoleId) {
    throw new Error('Admin role is missing');
  }

  const existingAdmin = await query<RowDataPacket & { id: number }>(
    'SELECT id FROM users WHERE email = ?',
    ['admin@alc.local'],
  );
  if (!existingAdmin[0]) {
    const passwordHash = await hashPassword(password);
    const created = await execute(
      `INSERT INTO users (email, password_hash, first_name, last_name, status)
       VALUES ('admin@alc.local', ?, 'System', 'Admin', 'active')`,
      [passwordHash],
    );
    await execute('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [created.insertId, adminRoleId]);
    if (password === LOCAL_ADMIN_PASSWORD) {
      console.log('Created admin@alc.local');
      console.log(`Local admin password: ${LOCAL_ADMIN_PASSWORD}`);
      console.log('Change this password after the first login.');
    } else {
      console.log('Created admin@alc.local with SEED_ADMIN_PASSWORD');
    }
  } else {
    console.log('admin@alc.local already exists; password was left unchanged');
  }

  const product = await query<RowDataPacket & { id: number }>(
    'SELECT id FROM loan_products WHERE code = ?',
    ['PERSONAL'],
  );
  if (!product[0]) {
    const created = await execute(
      `INSERT INTO loan_products (
         code, name, description, interest_method, monthly_interest_rate,
         min_amount, max_amount, min_term_months, max_term_months, status
       ) VALUES (?, ?, ?, 'flat', ?, ?, ?, ?, ?, 'active')`,
      [
        'PERSONAL',
        'Personal loan',
        'Unsecured personal loan priced with flat monthly interest',
        '2.0000',
        '5000.00',
        '200000.00',
        3,
        36,
      ],
    );
    const requirements: Array<[string, string, number]> = [
      ['Government-issued ID', 'One current government-issued identity document', 1],
      ['Proof of income', 'Payslip, remittance, or other income evidence', 1],
      ['Proof of billing address', 'Recent utility bill or other address evidence', 0],
    ];
    for (const [name, description, isRequired] of requirements) {
      await execute(
        `INSERT INTO product_requirements (product_id, name, description, is_required) VALUES (?, ?, ?, ?)`,
        [created.insertId, name, description, isRequired],
      );
    }
    console.log('Created sample product PERSONAL');
  }

  console.log('Seed complete');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
