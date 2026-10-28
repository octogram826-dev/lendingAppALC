export const PERMISSIONS = [
  { code: 'dashboard.read', description: 'View portfolio, application, collection, and overdue summaries' },
  { code: 'users.read', description: 'View internal user accounts' },
  { code: 'users.write', description: 'Create and update internal user accounts' },
  { code: 'roles.manage', description: 'Manage roles and permissions' },
  { code: 'settings.manage', description: 'Manage system setup' },
  { code: 'borrowers.read', description: 'View borrower profiles and identity documents' },
  { code: 'borrowers.write', description: 'Create and update borrower profiles and identity documents' },
  { code: 'borrowers.verify', description: 'Set borrower and identity document verification status' },
  { code: 'products.read', description: 'View loan products and requirements' },
  { code: 'products.write', description: 'Manage flat-interest loan products and requirements' },
  { code: 'applications.read', description: 'View loan applications' },
  { code: 'applications.write', description: 'Create and update loan applications' },
  { code: 'credit.evaluate', description: 'Record income review and the capacity checklist' },
  { code: 'credit.approve', description: 'Record one-level credit approval' },
  { code: 'agreements.write', description: 'Record agreements and agreement documents' },
  { code: 'disbursements.write', description: 'Record manual fund releases' },
  { code: 'loans.read', description: 'View loan accounts, schedules, balances, and receipts' },
  { code: 'payments.post', description: 'Post manual payments' },
  { code: 'loans.close', description: 'Close fully paid loan accounts' },
] as const;

export type PermissionCode = (typeof PERMISSIONS)[number]['code'];

export const SEEDED_ROLES: Array<{ name: string; description: string; permissions: PermissionCode[] | '*' }> = [
  {
    name: 'admin',
    description: 'Full access to user administration, system setup, and the lending workflow',
    permissions: '*',
  },
  {
    name: 'loan_officer',
    description: 'Borrower registration, loan applications, and agreement recording',
    permissions: [
      'dashboard.read',
      'borrowers.read',
      'borrowers.write',
      'borrowers.verify',
      'products.read',
      'applications.read',
      'applications.write',
      'agreements.write',
      'loans.read',
    ],
  },
  {
    name: 'credit_analyst',
    description: 'Income review and capacity checklist',
    permissions: ['dashboard.read', 'borrowers.read', 'applications.read', 'credit.evaluate', 'loans.read'],
  },
  {
    name: 'approver',
    description: 'One-level credit approval',
    permissions: ['dashboard.read', 'borrowers.read', 'applications.read', 'credit.approve', 'loans.read'],
  },
  {
    name: 'finance_officer',
    description: 'Manual fund-release entries',
    permissions: ['dashboard.read', 'borrowers.read', 'applications.read', 'disbursements.write', 'loans.read'],
  },
  {
    name: 'cashier',
    description: 'Manual payment posting, receipts, and loan closure',
    permissions: ['dashboard.read', 'borrowers.read', 'loans.read', 'payments.post', 'loans.close'],
  },
  {
    name: 'viewer',
    description: 'Read-only access to portfolio and workflow records',
    permissions: ['dashboard.read', 'borrowers.read', 'products.read', 'applications.read', 'loans.read'],
  },
];
