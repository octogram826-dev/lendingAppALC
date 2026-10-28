import { Router } from 'express';
import type { RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { apiDate, apiDateTime, nowSql } from '../domain/dates';
import { quoteFlatLoan } from '../domain/flatInterest';
import { centsToMoneyString, moneyToCents } from '../domain/money';
import { fullName } from '../domain/names';
import { nextNumber } from '../domain/sequences';
import { execute, query, withTransaction, type Sql } from '../db';
import { AppError } from '../errors';
import { asyncHandler, currentUser, requireAnyPermission, requireAuth, requirePermission, validate } from '../http';
import { refreshOverdueFlags } from './overdue';
import { parseId } from '../params';
import { isoDateSchema, LIKE_ESCAPE, likeContains, pageMeta, pageQuerySchema, PAYMENT_METHODS } from '../schemas';

type AgreementRow = RowDataPacket & {
  id: number;
  agreement_number: string;
  application_id: number;
  application_number: string;
  borrower_id: number;
  borrower_number: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  product_id: number;
  product_code: string;
  principal: string;
  monthly_interest_rate: string;
  term_months: number;
  total_interest: string;
  total_payable: string;
  installment_amount: string;
  first_due_date: string;
  status: 'draft' | 'executed' | 'disbursed' | 'cancelled';
  executed_at: string | null;
  cancelled_at: string | null;
  cancellation_notes: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
};

type DocumentRow = RowDataPacket & {
  id: number;
  document_type: string;
  file_reference: string | null;
  notes: string | null;
  recorded_by: number | null;
  recorded_at: string;
};

const agreementSelect = `
  SELECT ag.*, a.application_number, b.borrower_number, b.first_name, b.middle_name, b.last_name, p.code AS product_code
  FROM loan_agreements ag
  INNER JOIN loan_applications a ON a.id = ag.application_id
  INNER JOIN borrowers b ON b.id = ag.borrower_id
  INNER JOIN loan_products p ON p.id = ag.product_id
`;

function mapAgreement(row: AgreementRow, documents?: DocumentRow[]) {
  const firstDueDate = apiDate(row.first_due_date) ?? '';
  const quote = quoteFlatLoan({
    principal: row.principal,
    monthlyInterestRate: row.monthly_interest_rate,
    termMonths: row.term_months,
    firstDueDate,
  });
  return {
    id: row.id,
    agreementNumber: row.agreement_number,
    applicationId: row.application_id,
    applicationNumber: row.application_number,
    borrowerId: row.borrower_id,
    borrowerNumber: row.borrower_number,
    borrowerName: fullName(row.first_name, row.middle_name, row.last_name),
    productId: row.product_id,
    productCode: row.product_code,
    principal: Number(row.principal),
    monthlyInterestRate: Number(row.monthly_interest_rate),
    termMonths: row.term_months,
    totalInterest: Number(row.total_interest),
    totalPayable: Number(row.total_payable),
    installmentAmount: Number(row.installment_amount),
    finalInstallmentAmount: quote.finalInstallmentAmount,
    firstDueDate,
    status: row.status,
    executedAt: apiDateTime(row.executed_at),
    cancelledAt: apiDateTime(row.cancelled_at),
    cancellationNotes: row.cancellation_notes,
    createdBy: row.created_by,
    createdAt: apiDateTime(row.created_at),
    updatedAt: apiDateTime(row.updated_at),
    ...(documents
      ? {
          documents: documents.map((document) => ({
            id: document.id,
            documentType: document.document_type,
            fileReference: document.file_reference,
            notes: document.notes,
            recordedBy: document.recorded_by,
            recordedAt: apiDateTime(document.recorded_at),
          })),
        }
      : {}),
  };
}

async function getAgreementRow(id: number, conn?: Sql): Promise<AgreementRow> {
  const rows = await query<AgreementRow>(`${agreementSelect} WHERE ag.id = ?`, [id], conn);
  const row = rows[0];
  if (!row) {
    throw new AppError(404, 'Agreement not found');
  }
  return row;
}

async function agreementDetail(id: number, conn?: Sql) {
  const row = await getAgreementRow(id, conn);
  const documents = await query<DocumentRow>(
    `SELECT id, document_type, file_reference, notes, recorded_by, recorded_at
     FROM agreement_documents WHERE agreement_id = ? ORDER BY id`,
    [id],
    conn,
  );
  return mapAgreement(row, documents);
}

export async function findActiveAgreementSummary(applicationId: number) {
  const rows = await query<RowDataPacket & { id: number; agreement_number: string; status: string }>(
    `SELECT id, agreement_number, status
     FROM loan_agreements
     WHERE application_id = ? AND status <> 'cancelled'
     ORDER BY id DESC
     LIMIT 1`,
    [applicationId],
  );
  const row = rows[0];
  if (!row) {
    return null;
  }
  return { id: row.id, agreementNumber: row.agreement_number, status: row.status };
}

const patchSchema = z.object({ firstDueDate: isoDateSchema });
const documentSchema = z.object({
  documentType: z.string().trim().min(1).max(64),
  fileReference: z.string().trim().max(255).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});
const cancelSchema = z.object({
  notes: z.string().trim().max(500).nullable().optional(),
});
const disburseSchema = z.object({
  releaseDate: isoDateSchema,
  method: z.enum(PAYMENT_METHODS),
  referenceNumber: z.string().trim().max(64).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

export async function createAgreement(
  applicationId: number,
  userId: number,
  input: { firstDueDate: string },
) {
  const agreementId = await withTransaction(async (conn) => {
    const applications = await query<
      RowDataPacket & {
        id: number;
        status: string;
        borrower_id: number;
        product_id: number;
        requested_amount: string;
        term_months: number;
        monthly_interest_rate: string;
      }
    >('SELECT * FROM loan_applications WHERE id = ? FOR UPDATE', [applicationId], conn);
    const application = applications[0];
    if (!application) {
      throw new AppError(404, 'Application not found');
    }
    if (application.status !== 'approved') {
      throw new AppError(409, 'An agreement can be recorded only for an approved application');
    }
    const existing = await query<RowDataPacket>(
      "SELECT id FROM loan_agreements WHERE application_id = ? AND status <> 'cancelled' FOR UPDATE",
      [applicationId],
      conn,
    );
    if (existing[0]) {
      throw new AppError(409, 'This application already has an agreement');
    }

    const quote = quoteFlatLoan({
      principal: application.requested_amount,
      monthlyInterestRate: application.monthly_interest_rate,
      termMonths: application.term_months,
      firstDueDate: input.firstDueDate,
    });
    const agreementNumber = await nextNumber(conn, 'agreement', 'AGR');
    const created = await execute(
      `INSERT INTO loan_agreements (
         agreement_number, application_id, borrower_id, product_id, principal, monthly_interest_rate,
         term_months, total_interest, total_payable, installment_amount, first_due_date, status, created_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)`,
      [
        agreementNumber,
        application.id,
        application.borrower_id,
        application.product_id,
        centsToMoneyString(moneyToCents(quote.principal)),
        application.monthly_interest_rate,
        application.term_months,
        centsToMoneyString(moneyToCents(quote.totalInterest)),
        centsToMoneyString(moneyToCents(quote.totalPayable)),
        centsToMoneyString(moneyToCents(quote.installmentAmount)),
        input.firstDueDate,
        userId,
      ],
      conn,
    );
    return created.insertId;
  });
  return agreementDetail(agreementId);
}

export const agreementsRouter = Router();
agreementsRouter.use(requireAuth);

agreementsRouter.get(
  '/',
  requireAnyPermission('agreements.write', 'disbursements.write', 'loans.read'),
  asyncHandler(async (req, res) => {
    const filters = validate(
      pageQuerySchema.extend({
        status: z.enum(['draft', 'executed', 'disbursed', 'cancelled']).optional(),
        q: z.string().trim().max(100).optional(),
      }),
      req.query,
    );
    const where: string[] = [];
    const params: unknown[] = [];
    if (filters.status) {
      where.push('ag.status = ?');
      params.push(filters.status);
    }
    if (filters.q) {
      const like = likeContains(filters.q);
      where.push(
        `(ag.agreement_number LIKE ? ${LIKE_ESCAPE} OR a.application_number LIKE ? ${LIKE_ESCAPE} OR b.borrower_number LIKE ? ${LIKE_ESCAPE} OR b.last_name LIKE ? ${LIKE_ESCAPE})`,
      );
      params.push(like, like, like, like);
    }
    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const totalRows = await query<RowDataPacket & { count: number }>(
      `SELECT COUNT(*) AS count
       FROM loan_agreements ag
       INNER JOIN loan_applications a ON a.id = ag.application_id
       INNER JOIN borrowers b ON b.id = ag.borrower_id
       ${whereSql}`,
      params,
    );
    const offset = (filters.page - 1) * filters.pageSize;
    const rows = await query<AgreementRow>(
      `${agreementSelect} ${whereSql} ORDER BY ag.id DESC LIMIT ? OFFSET ?`,
      [...params, filters.pageSize, offset],
    );
    res.json({
      data: rows.map((row) => mapAgreement(row)),
      meta: pageMeta(filters.page, filters.pageSize, Number(totalRows[0]?.count ?? 0)),
    });
  }),
);

agreementsRouter.get(
  '/:id',
  requireAnyPermission('agreements.write', 'disbursements.write', 'loans.read'),
  asyncHandler(async (req, res) => {
    res.json({ data: await agreementDetail(parseId(req.params.id)) });
  }),
);

agreementsRouter.patch(
  '/:id',
  requirePermission('agreements.write'),
  asyncHandler(async (req, res) => {
    const agreementId = parseId(req.params.id);
    const body = validate(patchSchema, req.body);
    await withTransaction(async (conn) => {
      const rows = await query<RowDataPacket & { status: string }>(
        'SELECT status FROM loan_agreements WHERE id = ? FOR UPDATE',
        [agreementId],
        conn,
      );
      const agreement = rows[0];
      if (!agreement) {
        throw new AppError(404, 'Agreement not found');
      }
      if (agreement.status !== 'draft' && agreement.status !== 'executed') {
        throw new AppError(409, 'The first due date can be changed only before disbursement');
      }
      await execute('UPDATE loan_agreements SET first_due_date = ? WHERE id = ?', [body.firstDueDate, agreementId], conn);
    });
    res.json({ data: await agreementDetail(agreementId) });
  }),
);

agreementsRouter.post(
  '/:id/documents',
  requirePermission('agreements.write'),
  asyncHandler(async (req, res) => {
    const agreementId = parseId(req.params.id);
    const body = validate(documentSchema, req.body);
    const rows = await query<RowDataPacket & { status: string }>('SELECT status FROM loan_agreements WHERE id = ?', [
      agreementId,
    ]);
    const agreement = rows[0];
    if (!agreement) {
      throw new AppError(404, 'Agreement not found');
    }
    if (agreement.status === 'cancelled') {
      throw new AppError(409, 'Documents cannot be recorded on a cancelled agreement');
    }
    await execute(
      `INSERT INTO agreement_documents (agreement_id, document_type, file_reference, notes, recorded_by, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [agreementId, body.documentType, body.fileReference ?? null, body.notes ?? null, currentUser(req).id, nowSql()],
    );
    res.status(201).json({ data: await agreementDetail(agreementId) });
  }),
);

agreementsRouter.post(
  '/:id/execute',
  requirePermission('agreements.write'),
  asyncHandler(async (req, res) => {
    const agreementId = parseId(req.params.id);
    await withTransaction(async (conn) => {
      const rows = await query<RowDataPacket & { status: string }>(
        'SELECT status FROM loan_agreements WHERE id = ? FOR UPDATE',
        [agreementId],
        conn,
      );
      const agreement = rows[0];
      if (!agreement) {
        throw new AppError(404, 'Agreement not found');
      }
      if (agreement.status !== 'draft') {
        throw new AppError(409, 'Only a draft agreement can be executed');
      }
      const documents = await query<RowDataPacket & { count: number }>(
        'SELECT COUNT(*) AS count FROM agreement_documents WHERE agreement_id = ?',
        [agreementId],
        conn,
      );
      if (Number(documents[0]?.count ?? 0) < 1) {
        throw new AppError(409, 'Record at least one agreement document before execution');
      }
      await execute(
        "UPDATE loan_agreements SET status = 'executed', executed_at = ? WHERE id = ?",
        [nowSql(), agreementId],
        conn,
      );
    });
    res.json({ data: await agreementDetail(agreementId) });
  }),
);

agreementsRouter.post(
  '/:id/cancel',
  requirePermission('agreements.write'),
  asyncHandler(async (req, res) => {
    const agreementId = parseId(req.params.id);
    const body = validate(cancelSchema, req.body ?? {});
    await withTransaction(async (conn) => {
      const rows = await query<RowDataPacket & { status: string }>(
        'SELECT status FROM loan_agreements WHERE id = ? FOR UPDATE',
        [agreementId],
        conn,
      );
      const agreement = rows[0];
      if (!agreement) {
        throw new AppError(404, 'Agreement not found');
      }
      if (agreement.status !== 'draft' && agreement.status !== 'executed') {
        throw new AppError(409, 'Only a draft or executed agreement can be cancelled');
      }
      await execute(
        `UPDATE loan_agreements
         SET status = 'cancelled', cancelled_at = ?, cancellation_notes = ?
         WHERE id = ?`,
        [nowSql(), body.notes ?? null, agreementId],
        conn,
      );
    });
    res.json({ data: await agreementDetail(agreementId) });
  }),
);

agreementsRouter.post(
  '/:id/disburse',
  requirePermission('disbursements.write'),
  asyncHandler(async (req, res) => {
    const agreementId = parseId(req.params.id);
    const body = validate(disburseSchema, req.body);
    const userId = currentUser(req).id;

    const result = await withTransaction(async (conn) => {
      const rows = await query<AgreementRow>(`${agreementSelect} WHERE ag.id = ? FOR UPDATE`, [agreementId], conn);
      const agreement = rows[0];
      if (!agreement) {
        throw new AppError(404, 'Agreement not found');
      }
      if (agreement.status !== 'executed') {
        throw new AppError(409, 'Funds can be released only for an executed agreement');
      }
      const firstDueDate = apiDate(agreement.first_due_date) ?? '';
      if (body.releaseDate > firstDueDate) {
        throw new AppError(400, 'Release date cannot be after the first due date');
      }
      const quote = quoteFlatLoan({
        principal: agreement.principal,
        monthlyInterestRate: agreement.monthly_interest_rate,
        termMonths: agreement.term_months,
        firstDueDate,
      });
      if (moneyToCents(quote.totalInterest) !== moneyToCents(agreement.total_interest)) {
        throw new AppError(500, 'Agreement figures do not match the flat-interest schedule');
      }

      const accountNumber = await nextNumber(conn, 'loan', 'LN');
      const maturityDate = quote.schedule[quote.schedule.length - 1]?.dueDate;
      if (!maturityDate) {
        throw new AppError(500, 'Repayment schedule could not be built');
      }
      const loan = await execute(
        `INSERT INTO loan_accounts (
           account_number, agreement_id, borrower_id, principal, total_interest, total_payable,
           outstanding_principal, outstanding_interest, outstanding_balance, status, disbursed_at, maturity_date
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
        [
          accountNumber,
          agreement.id,
          agreement.borrower_id,
          centsToMoneyString(moneyToCents(quote.principal)),
          centsToMoneyString(moneyToCents(quote.totalInterest)),
          centsToMoneyString(moneyToCents(quote.totalPayable)),
          centsToMoneyString(moneyToCents(quote.principal)),
          centsToMoneyString(moneyToCents(quote.totalInterest)),
          centsToMoneyString(moneyToCents(quote.totalPayable)),
          nowSql(),
          maturityDate,
        ],
        conn,
      );

      for (const line of quote.schedule) {
        await execute(
          `INSERT INTO repayment_schedules (
             loan_account_id, installment_number, due_date, principal_due, interest_due, total_due
           ) VALUES (?, ?, ?, ?, ?, ?)`,
          [
            loan.insertId,
            line.installmentNumber,
            line.dueDate,
            centsToMoneyString(moneyToCents(line.principalDue)),
            centsToMoneyString(moneyToCents(line.interestDue)),
            centsToMoneyString(moneyToCents(line.totalDue)),
          ],
          conn,
        );
      }

      await execute(
        `INSERT INTO disbursements (
           agreement_id, loan_account_id, amount, release_date, method, reference_number, notes, released_by
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          agreement.id,
          loan.insertId,
          centsToMoneyString(moneyToCents(quote.principal)),
          body.releaseDate,
          body.method,
          body.referenceNumber ?? null,
          body.notes ?? null,
          userId,
        ],
        conn,
      );
      await execute("UPDATE loan_agreements SET status = 'disbursed' WHERE id = ?", [agreement.id], conn);
      await execute("UPDATE loan_applications SET status = 'disbursed' WHERE id = ?", [agreement.application_id], conn);
      await refreshOverdueFlags(conn, loan.insertId);
      return { loanAccountId: loan.insertId, accountNumber };
    });

    res.status(201).json({
      data: {
        agreement: await agreementDetail(agreementId),
        loanAccountId: result.loanAccountId,
        accountNumber: result.accountNumber,
      },
    });
  }),
);
