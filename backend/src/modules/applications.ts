import { Router } from 'express';
import type { RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { apiDateTime, nowSql } from '../domain/dates';
import { centsToMoneyString, moneyToCents } from '../domain/money';
import { fullName } from '../domain/names';
import { nextNumber } from '../domain/sequences';
import { execute, query, withTransaction } from '../db';
import { AppError } from '../errors';
import { asyncHandler, currentUser, requireAuth, requirePermission, validate } from '../http';
import { parseId } from '../params';
import {
  APPLICATION_STATUSES,
  isoDateSchema,
  LIKE_ESCAPE,
  likeContains,
  pageMeta,
  pageQuerySchema,
  positiveMoneySchema,
  REQUIREMENT_STATUSES,
} from '../schemas';
import { createAgreement, findActiveAgreementSummary } from './agreements';
import { approvalSchema, decideApplication, evaluationSchema, evaluateApplication, loadApproval, loadEvaluation } from './credit';

type ApplicationRow = RowDataPacket & {
  id: number;
  application_number: string;
  borrower_id: number;
  borrower_number: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  verification_status: string;
  product_id: number;
  product_code: string;
  product_name: string;
  requested_amount: string;
  term_months: number;
  monthly_interest_rate: string;
  purpose: string | null;
  status: (typeof APPLICATION_STATUSES)[number];
  submitted_at: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
};

type RequirementRow = RowDataPacket & {
  id: number;
  name: string;
  is_required: number;
  status: (typeof REQUIREMENT_STATUSES)[number];
  notes: string | null;
};

const applicationSelect = `
  SELECT a.*, b.borrower_number, b.first_name, b.middle_name, b.last_name, b.verification_status,
         p.code AS product_code, p.name AS product_name
  FROM loan_applications a
  INNER JOIN borrowers b ON b.id = a.borrower_id
  INNER JOIN loan_products p ON p.id = a.product_id
`;

function mapApplication(row: ApplicationRow) {
  return {
    id: row.id,
    applicationNumber: row.application_number,
    borrowerId: row.borrower_id,
    borrowerNumber: row.borrower_number,
    borrowerName: fullName(row.first_name, row.middle_name, row.last_name),
    borrowerVerificationStatus: row.verification_status,
    productId: row.product_id,
    productCode: row.product_code,
    productName: row.product_name,
    requestedAmount: Number(row.requested_amount),
    termMonths: row.term_months,
    monthlyInterestRate: Number(row.monthly_interest_rate),
    purpose: row.purpose,
    status: row.status,
    submittedAt: apiDateTime(row.submitted_at),
    createdBy: row.created_by,
    createdAt: apiDateTime(row.created_at),
    updatedAt: apiDateTime(row.updated_at),
  };
}

function mapRequirement(row: RequirementRow) {
  return {
    id: row.id,
    name: row.name,
    isRequired: row.is_required === 1,
    status: row.status,
    notes: row.notes,
  };
}

async function applicationDetail(id: number) {
  const rows = await query<ApplicationRow>(`${applicationSelect} WHERE a.id = ?`, [id]);
  const row = rows[0];
  if (!row) {
    throw new AppError(404, 'Application not found');
  }
  const requirements = await query<RequirementRow>(
    'SELECT id, name, is_required, status, notes FROM application_requirements WHERE application_id = ? ORDER BY id',
    [id],
  );
  return {
    ...mapApplication(row),
    requirements: requirements.map(mapRequirement),
    evaluation: await loadEvaluation(id),
    approval: await loadApproval(id),
    agreement: await findActiveAgreementSummary(id),
  };
}

type ProductRow = RowDataPacket & {
  id: number;
  status: 'active' | 'inactive';
  monthly_interest_rate: string;
  min_amount: string;
  max_amount: string;
  min_term_months: number;
  max_term_months: number;
};

function assertProductFit(product: ProductRow, amount: number, termMonths: number): void {
  if (product.status !== 'active') {
    throw new AppError(409, 'Loan product is inactive');
  }
  const amountCents = moneyToCents(amount);
  if (amountCents < moneyToCents(product.min_amount) || amountCents > moneyToCents(product.max_amount)) {
    throw new AppError(400, 'Requested amount is outside the product limits');
  }
  if (termMonths < product.min_term_months || termMonths > product.max_term_months) {
    throw new AppError(400, 'Term is outside the product limits');
  }
}

const createSchema = z.object({
  borrowerId: z.number().int().positive(),
  productId: z.number().int().positive(),
  requestedAmount: positiveMoneySchema,
  termMonths: z.number().int().min(1).max(360),
  purpose: z.string().trim().max(255).nullable().optional(),
});

const patchSchema = z
  .object({
    requestedAmount: positiveMoneySchema.optional(),
    termMonths: z.number().int().min(1).max(360).optional(),
    purpose: z.string().trim().max(255).nullable().optional(),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), 'Provide at least one field to update');

const requirementSchema = z.object({
  status: z.enum(REQUIREMENT_STATUSES),
  notes: z.string().trim().max(255).nullable().optional(),
});

const listQuerySchema = pageQuerySchema.extend({
  status: z.enum(APPLICATION_STATUSES).optional(),
  borrowerId: z.coerce.number().int().positive().optional(),
  q: z.string().trim().max(100).optional(),
});

export const applicationsRouter = Router();
applicationsRouter.use(requireAuth);

applicationsRouter.get(
  '/',
  requirePermission('applications.read'),
  asyncHandler(async (req, res) => {
    const filters = validate(listQuerySchema, req.query);
    const where: string[] = [];
    const params: unknown[] = [];
    if (filters.status) {
      where.push('a.status = ?');
      params.push(filters.status);
    }
    if (filters.borrowerId) {
      where.push('a.borrower_id = ?');
      params.push(filters.borrowerId);
    }
    if (filters.q) {
      const like = likeContains(filters.q);
      where.push(
        `(a.application_number LIKE ? ${LIKE_ESCAPE} OR b.borrower_number LIKE ? ${LIKE_ESCAPE} OR b.first_name LIKE ? ${LIKE_ESCAPE} OR b.last_name LIKE ? ${LIKE_ESCAPE})`,
      );
      params.push(like, like, like, like);
    }
    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const totalRows = await query<RowDataPacket & { count: number }>(
      `SELECT COUNT(*) AS count
       FROM loan_applications a
       INNER JOIN borrowers b ON b.id = a.borrower_id
       ${whereSql}`,
      params,
    );
    const offset = (filters.page - 1) * filters.pageSize;
    const rows = await query<ApplicationRow>(
      `${applicationSelect} ${whereSql} ORDER BY a.id DESC LIMIT ? OFFSET ?`,
      [...params, filters.pageSize, offset],
    );
    res.json({
      data: rows.map(mapApplication),
      meta: pageMeta(filters.page, filters.pageSize, Number(totalRows[0]?.count ?? 0)),
    });
  }),
);

applicationsRouter.post(
  '/',
  requirePermission('applications.write'),
  asyncHandler(async (req, res) => {
    const body = validate(createSchema, req.body);
    const userId = currentUser(req).id;
    const id = await withTransaction(async (conn) => {
      const borrowers = await query<RowDataPacket>('SELECT id FROM borrowers WHERE id = ?', [body.borrowerId], conn);
      if (!borrowers[0]) {
        throw new AppError(404, 'Borrower not found');
      }
      const products = await query<ProductRow>('SELECT * FROM loan_products WHERE id = ? FOR UPDATE', [body.productId], conn);
      const product = products[0];
      if (!product) {
        throw new AppError(404, 'Loan product not found');
      }
      assertProductFit(product, body.requestedAmount, body.termMonths);
      const applicationNumber = await nextNumber(conn, 'application', 'APP');
      const created = await execute(
        `INSERT INTO loan_applications (
           application_number, borrower_id, product_id, requested_amount, term_months,
           monthly_interest_rate, purpose, status, created_by
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?)`,
        [
          applicationNumber,
          body.borrowerId,
          body.productId,
          centsToMoneyString(moneyToCents(body.requestedAmount)),
          body.termMonths,
          product.monthly_interest_rate,
          body.purpose ?? null,
          userId,
        ],
        conn,
      );
      const requirements = await query<RowDataPacket & { id: number; name: string; is_required: number }>(
        'SELECT id, name, is_required FROM product_requirements WHERE product_id = ? ORDER BY id',
        [body.productId],
        conn,
      );
      for (const requirement of requirements) {
        await execute(
          `INSERT INTO application_requirements (application_id, product_requirement_id, name, is_required, status)
           VALUES (?, ?, ?, ?, 'pending')`,
          [created.insertId, requirement.id, requirement.name, requirement.is_required],
          conn,
        );
      }
      return created.insertId;
    });
    res.status(201).json({ data: await applicationDetail(id) });
  }),
);

applicationsRouter.get(
  '/:id',
  requirePermission('applications.read'),
  asyncHandler(async (req, res) => {
    res.json({ data: await applicationDetail(parseId(req.params.id)) });
  }),
);

applicationsRouter.patch(
  '/:id',
  requirePermission('applications.write'),
  asyncHandler(async (req, res) => {
    const applicationId = parseId(req.params.id);
    const body = validate(patchSchema, req.body);
    await withTransaction(async (conn) => {
      const rows = await query<
        RowDataPacket & {
          status: string;
          product_id: number;
          requested_amount: string;
          term_months: number;
          purpose: string | null;
        }
      >(
        'SELECT status, product_id, requested_amount, term_months, purpose FROM loan_applications WHERE id = ? FOR UPDATE',
        [applicationId],
        conn,
      );
      const application = rows[0];
      if (!application) {
        throw new AppError(404, 'Application not found');
      }
      if (application.status !== 'draft') {
        throw new AppError(409, 'Only a draft application can be edited');
      }
      const products = await query<ProductRow>('SELECT * FROM loan_products WHERE id = ?', [application.product_id], conn);
      const product = products[0];
      if (!product) {
        throw new AppError(404, 'Loan product not found');
      }
      const amount = body.requestedAmount ?? Number(application.requested_amount);
      const termMonths = body.termMonths ?? application.term_months;
      const purpose = body.purpose === undefined ? application.purpose : body.purpose;
      assertProductFit(product, amount, termMonths);
      await execute(
        `UPDATE loan_applications
         SET requested_amount = ?, term_months = ?, monthly_interest_rate = ?, purpose = ?
         WHERE id = ?`,
        [
          centsToMoneyString(moneyToCents(amount)),
          termMonths,
          product.monthly_interest_rate,
          purpose,
          applicationId,
        ],
        conn,
      );
    });
    res.json({ data: await applicationDetail(applicationId) });
  }),
);

applicationsRouter.post(
  '/:id/submit',
  requirePermission('applications.write'),
  asyncHandler(async (req, res) => {
    const applicationId = parseId(req.params.id);
    await withTransaction(async (conn) => {
      const rows = await query<
        RowDataPacket & {
          status: string;
          borrower_id: number;
          product_id: number;
          requested_amount: string;
          term_months: number;
        }
      >('SELECT * FROM loan_applications WHERE id = ? FOR UPDATE', [applicationId], conn);
      const application = rows[0];
      if (!application) {
        throw new AppError(404, 'Application not found');
      }
      if (application.status !== 'draft') {
        throw new AppError(409, 'Only a draft application can be submitted');
      }
      const borrowers = await query<RowDataPacket & { verification_status: string }>(
        'SELECT verification_status FROM borrowers WHERE id = ?',
        [application.borrower_id],
        conn,
      );
      if (borrowers[0]?.verification_status !== 'verified') {
        throw new AppError(409, 'Borrower must be verified before the application can be submitted');
      }
      const products = await query<ProductRow>('SELECT * FROM loan_products WHERE id = ?', [application.product_id], conn);
      const product = products[0];
      if (!product) {
        throw new AppError(404, 'Loan product not found');
      }
      assertProductFit(product, Number(application.requested_amount), application.term_months);
      const requirements = await query<RequirementRow>(
        'SELECT id, name, is_required, status, notes FROM application_requirements WHERE application_id = ?',
        [applicationId],
        conn,
      );
      const pending = requirements.filter((item) => item.is_required === 1 && item.status === 'pending').map((item) => item.name);
      if (pending.length > 0) {
        throw new AppError(409, `Required documents are still pending: ${pending.join(', ')}`);
      }
      await execute(
        `UPDATE loan_applications
         SET status = 'submitted', submitted_at = ?, monthly_interest_rate = ?
         WHERE id = ?`,
        [nowSql(), product.monthly_interest_rate, applicationId],
        conn,
      );
    });
    res.json({ data: await applicationDetail(applicationId) });
  }),
);

applicationsRouter.post(
  '/:id/withdraw',
  requirePermission('applications.write'),
  asyncHandler(async (req, res) => {
    const applicationId = parseId(req.params.id);
    await withTransaction(async (conn) => {
      const rows = await query<RowDataPacket & { status: string }>(
        'SELECT status FROM loan_applications WHERE id = ? FOR UPDATE',
        [applicationId],
        conn,
      );
      const application = rows[0];
      if (!application) {
        throw new AppError(404, 'Application not found');
      }
      if (application.status !== 'draft' && application.status !== 'submitted') {
        throw new AppError(409, 'Only a draft or submitted application can be withdrawn');
      }
      await execute("UPDATE loan_applications SET status = 'withdrawn' WHERE id = ?", [applicationId], conn);
    });
    res.json({ data: await applicationDetail(applicationId) });
  }),
);

applicationsRouter.patch(
  '/:id/requirements/:requirementId',
  requirePermission('applications.write'),
  asyncHandler(async (req, res) => {
    const applicationId = parseId(req.params.id);
    const requirementId = parseId(req.params.requirementId, 'requirement id');
    const body = validate(requirementSchema, req.body);
    await withTransaction(async (conn) => {
      const applications = await query<RowDataPacket & { status: string }>(
        'SELECT status FROM loan_applications WHERE id = ? FOR UPDATE',
        [applicationId],
        conn,
      );
      const application = applications[0];
      if (!application) {
        throw new AppError(404, 'Application not found');
      }
      if (!['draft', 'submitted', 'under_review'].includes(application.status)) {
        throw new AppError(409, 'Requirements can be updated only before the application is decided');
      }
      const result =
        body.notes === undefined
          ? await execute(
              'UPDATE application_requirements SET status = ? WHERE id = ? AND application_id = ?',
              [body.status, requirementId, applicationId],
              conn,
            )
          : await execute(
              'UPDATE application_requirements SET status = ?, notes = ? WHERE id = ? AND application_id = ?',
              [body.status, body.notes, requirementId, applicationId],
              conn,
            );
      if (result.affectedRows === 0) {
        throw new AppError(404, 'Requirement not found');
      }
    });
    res.json({ data: await applicationDetail(applicationId) });
  }),
);

applicationsRouter.post(
  '/:id/evaluation',
  requirePermission('credit.evaluate'),
  asyncHandler(async (req, res) => {
    const body = validate(evaluationSchema, req.body);
    const data = await evaluateApplication(parseId(req.params.id), currentUser(req).id, body);
    res.json({ data });
  }),
);

applicationsRouter.get(
  '/:id/evaluation',
  requirePermission('applications.read'),
  asyncHandler(async (req, res) => {
    const evaluation = await loadEvaluation(parseId(req.params.id));
    if (!evaluation) {
      throw new AppError(404, 'Credit evaluation not found');
    }
    res.json({ data: evaluation });
  }),
);

applicationsRouter.post(
  '/:id/approval',
  requirePermission('credit.approve'),
  asyncHandler(async (req, res) => {
    const body = validate(approvalSchema, req.body);
    const approval = await decideApplication(parseId(req.params.id), currentUser(req).id, body);
    if (!approval) {
      throw new AppError(500, 'Approval could not be recorded');
    }
    res.status(201).json({ data: approval });
  }),
);

applicationsRouter.post(
  '/:id/agreement',
  requirePermission('agreements.write'),
  asyncHandler(async (req, res) => {
    const body = validate(z.object({ firstDueDate: isoDateSchema }), req.body);
    const data = await createAgreement(parseId(req.params.id), currentUser(req).id, body);
    res.status(201).json({ data });
  }),
);
