# ALC internal LMS API

Phase 1 backend for the internal loan management system used by ALC staff.

Workflow: borrower registration, credit evaluation, one-level approval, agreement and manual disbursement, loan servicing, repayment, and closure.

The `frontend` directory is intentionally empty.

## Stack

Node.js, TypeScript, Express, and MySQL.

## Setup

From this directory:

```bash
cp .env.example .env
# Set JWT_SECRET to a random string of at least 16 characters.
# Set DB_USER and DB_PASSWORD for your MySQL server.

npm install
npm run db:setup
npm run dev
```

`db:setup` creates the `lms` database, applies `src/db/schema.sql`, and seeds roles, settings, an admin user, and a sample flat-interest product. `db:migrate` creates missing tables and does not alter tables that already exist.

The API listens on `http://localhost:3000`. `GET /api/health` checks the database.

### Local admin

After seeding in development:

- Email: `admin@alc.local`
- Password: `ChangeMe123!`

Change it with `POST /api/auth/password`. In production, set `SEED_ADMIN_PASSWORD` before running `npm run db:seed`. Re-running the seed does not reset an existing admin password, setting values, or the sample product. It does reset the permissions on the seeded roles.

Seeded currency is `PHP`. Change the `currency` setting if ALC uses a different currency.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start the API with reload |
| `npm run build` / `npm start` | Compile and run `dist` |
| `npm test` | Flat-interest schedule tests, no database required |
| `npm run db:migrate` | Create the database and tables |
| `npm run db:seed` | Seed roles, settings, admin, and the sample product |
| `npm run db:setup` | Migrate and seed |

## Auth

Send `Authorization: Bearer <token>` from `POST /api/auth/login`.

| Role | What they do |
| --- | --- |
| `admin` | Users, roles, system setup, and the full workflow |
| `loan_officer` | Borrowers, applications, and agreements |
| `credit_analyst` | Income review and capacity checklist |
| `approver` | One-level approval |
| `finance_officer` | Manual fund release |
| `cashier` | Manual payments, receipts, and closure |
| `viewer` | Read-only records and the dashboard |

## Flat interest

Interest = principal × (monthly rate ÷ 100) × term in months.

Principal and interest are split evenly across installments. Any leftover cents are added to the final installment. The stored schedule is the source of truth for what is due.

The seeded `PERSONAL` product is 2% per month, 5,000 to 200,000, for 3 to 36 months.

## Overdue flags

An unpaid installment becomes overdue when the current date is after the due date plus `overdue_grace_days`. A loan is overdue when any installment is overdue. Opening the dashboard or loan list refreshes these flags. A fully paid loan stays active until `POST /api/loans/:id/close`.

Payments post to the oldest unpaid installment, interest first, then principal. The payment amount cannot exceed the outstanding balance.

Identity documents and agreement documents store a `fileReference` string. This API does not upload files.

## Endpoints

### Dashboard and analytics

- `GET /api/dashboard` — portfolio, applications, collections, and overdue summaries

### User administration

- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/password`
- `GET /api/users`, `POST /api/users`, `GET /api/users/:id`, `PATCH /api/users/:id`
- `PUT /api/users/:id/roles`
- `GET /api/roles`, `POST /api/roles`, `PATCH /api/roles/:id`
- `GET /api/permissions`
- `GET /api/settings`, `PUT /api/settings/:key`

Settings keys: `company_name`, `currency`, `max_installment_to_income`, `overdue_grace_days`.

### Borrowers and KYC

- `GET /api/borrowers`, `POST /api/borrowers`, `GET /api/borrowers/:id`, `PATCH /api/borrowers/:id`
- `POST /api/borrowers/:id/verification`
- `POST /api/borrowers/:id/documents`
- `PATCH /api/borrowers/:id/documents/:documentId`

A borrower must be verified before an application can be submitted.

### Loan products and applications

- `GET /api/products`, `POST /api/products`, `GET /api/products/:id`, `PATCH /api/products/:id`
- `POST /api/products/:id/requirements`
- `PATCH /api/products/:id/requirements/:requirementId`
- `DELETE /api/products/:id/requirements/:requirementId`
- `GET /api/applications`, `POST /api/applications`, `GET /api/applications/:id`, `PATCH /api/applications/:id`
- `POST /api/applications/:id/submit`
- `POST /api/applications/:id/withdraw`
- `PATCH /api/applications/:id/requirements/:requirementId`

Application status moves `draft` → `submitted` → `under_review` → `approved` or `rejected`, then `disbursed`. `withdrawn` is available from draft or submitted. Borrower and product are fixed after creation. Amount, term, and purpose can change while the application is a draft. The monthly rate is copied from the product at submission.

### Credit evaluation and approval

- `POST /api/applications/:id/evaluation`
- `GET /api/applications/:id/evaluation`
- `POST /api/applications/:id/approval`

The evaluation stores verified income, existing obligations, disposable income, and the installment calculated from the flat-interest terms. The capacity checklist is:

- `identity_verified`
- `income_reviewed`
- `source_of_income_confirmed`
- `obligations_reviewed`
- `installment_within_capacity`
- `no_adverse_internal_record`

Each item is `pass`, `fail`, or `na`. A recommendation of `approve` requires every item to pass or be not applicable, and installment capacity must pass. Approval is one decision, `approved` or `rejected`, and it requires an evaluation.

### Agreement and disbursement

- `POST /api/applications/:id/agreement` with `{ "firstDueDate": "YYYY-MM-DD" }`
- `GET /api/agreements`, `GET /api/agreements/:id`, `PATCH /api/agreements/:id`
- `POST /api/agreements/:id/documents`
- `POST /api/agreements/:id/execute`
- `POST /api/agreements/:id/cancel`
- `POST /api/agreements/:id/disburse`

Execution requires at least one recorded document. Disbursement releases the full principal, opens the loan account, and builds the repayment schedule. The release date cannot be after the first due date.

### Loan accounts and payments

- `GET /api/loans`
- `POST /api/loans/overdue/refresh`
- `GET /api/loans/:id` — account, disbursement, balances, and schedule
- `GET /api/loans/:id/payments`
- `POST /api/loans/:id/payments`
- `POST /api/loans/:id/close`
- `GET /api/receipts/:receiptNumber`

Lists accept `page` and `pageSize` (max 100). Responses use `{ "data": ... }` and list responses include `meta`. Errors use `{ "error": { "message": "...", "details": ... } }`.
