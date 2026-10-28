import { Router } from 'express';
import type { RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { addDays, apiDate, apiDateTime, nowSql, todayUtc } from '../domain/dates';
import { fullName } from '../domain/names';
import { centsToMoney, centsToMoneyString, moneyToCents } from '../domain/money';
import { nextNumber } from '../domain/sequences';
import { execute, pool, query, withTransaction } from '../db';
import { AppError } from '../errors';
import { asyncHandler, currentUser, requireAuth, requirePermission, validate } from '../http';
import { refreshOverdueFlags } from './overdue';
import { parseId } from '../params';
import { isoDateSchema, LIKE_ESCAPE, likeContains, LOAN_STATUSES, pageMeta, pageQuerySchema, PAYMENT_METHODS, positiveMoneySchema } from '../schemas';

type LoanRow = RowDataPacket & {
  id: number;
  account_number: string;
  agreement_id: number;
  agreement_number: string;
  borrower_id: number;
  borrower_number: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  principal: string;
  total_interest: string;
  total_payable: string;
  outstanding_principal: string;
  outstanding_interest: string;
  outstanding_balance: string;
  status: (typeof LOAN_STATUSES)[number];
  disbursed_at: string;
  maturity_date: string;
  closed_at: string | null;
};

type ScheduleRow = RowDataPacket & {
  id: number;
  installment_number: number;
  due_date: string;
  principal_due: string;
  interest_due: string;
  total_due: string;
  principal_paid: string;
  interest_paid: string;
  total_paid: string;
  status: 'pending' | 'partial' | 'paid' | 'overdue';
  paid_at: string | null;
};

type DisbursementRow = RowDataPacket & {
  id: number;
  amount: string;
  release_date: string;
  method: (typeof PAYMENT_METHODS)[number];
  reference_number: string | null;
  notes: string | null;
  released_by: number | null;
  created_at: string;
};

const loanSelect = `
  SELECT la.*, ag.agreement_number, b.borrower_number, b.first_name, b.middle_name, b.last_name
  FROM loan_accounts la
  INNER JOIN loan_agreements ag ON ag.id = la.agreement_id
  INNER JOIN borrowers b ON b.id = la.borrower_id
`;

function mapLoan(row: LoanRow) {
  const outstanding = moneyToCents(row.outstanding_balance);
  return {
    id: row.id,
    accountNumber: row.account_number,
    agreementId: row.agreement_id,
    agreementNumber: row.agreement_number,
    borrowerId: row.borrower_id,
    borrowerNumber: row.borrower_number,
    borrowerName: fullName(row.first_name, row.middle_name, row.last_name),
    principal: Number(row.principal),
    totalInterest: Number(row.total_interest),
    totalPayable: Number(row.total_payable),
    outstandingPrincipal: Number(row.outstanding_principal),
    outstandingInterest: Number(row.outstanding_interest),
    outstandingBalance: centsToMoney(outstanding),
    status: row.status,
    readyToClose: row.status !== 'closed' && outstanding === 0,
    disbursedAt: apiDateTime(row.disbursed_at),
    maturityDate: apiDate(row.maturity_date),
    closedAt: apiDateTime(row.closed_at),
  };
}

function mapSchedule(row: ScheduleRow) {
  return {
    id: row.id,
    installmentNumber: row.installment_number,
    dueDate: apiDate(row.due_date),
    principalDue: Number(row.principal_due),
    interestDue: Number(row.interest_due),
    totalDue: Number(row.total_due),
    principalPaid: Number(row.principal_paid),
    interestPaid: Number(row.interest_paid),
    totalPaid: Number(row.total_paid),
    status: row.status,
    paidAt: apiDateTime(row.paid_at),
  };
}

function mapDisbursement(row: DisbursementRow) {
  return {
    id: row.id,
    amount: Number(row.amount),
    releaseDate: apiDate(row.release_date),
    method: row.method,
    referenceNumber: row.reference_number,
    notes: row.notes,
    releasedBy: row.released_by,
    createdAt: apiDateTime(row.created_at),
  };
}

async function loanDetail(id: number) {
  await refreshOverdueFlags(pool, id);
  const rows = await query<LoanRow>(`${loanSelect} WHERE la.id = ?`, [id]);
  const row = rows[0];
  if (!row) {
    throw new AppError(404, 'Loan account not found');
  }
  const schedule = await query<ScheduleRow>(
    `SELECT id, installment_number, due_date, principal_due, interest_due, total_due,
            principal_paid, interest_paid, total_paid, status, paid_at
     FROM repayment_schedules WHERE loan_account_id = ? ORDER BY installment_number`,
    [id],
  );
  const disbursements = await query<DisbursementRow>(
    `SELECT id, amount, release_date, method, reference_number, notes, released_by, created_at
     FROM disbursements WHERE loan_account_id = ?`,
    [id],
  );
  return {
    ...mapLoan(row),
    disbursement: disbursements[0] ? mapDisbursement(disbursements[0]) : null,
    schedule: schedule.map(mapSchedule),
  };
}

const listQuerySchema = pageQuerySchema.extend({
  status: z.enum(LOAN_STATUSES).optional(),
  borrowerId: z.coerce.number().int().positive().optional(),
  q: z.string().trim().max(100).optional(),
});

const paymentSchema = z.object({
  amount: positiveMoneySchema,
  paymentDate: isoDateSchema.refine(
    (value) => value <= addDays(todayUtc(), 1),
    'Payment date cannot be more than one day ahead',
  ),
  method: z.enum(PAYMENT_METHODS),
  referenceNumber: z.string().trim().max(64).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

export const loansRouter = Router();
loansRouter.use(requireAuth);

loansRouter.post(
  '/overdue/refresh',
  requirePermission('loans.read'),
  asyncHandler(async (_req, res) => {
    await refreshOverdueFlags();
    res.json({ data: { refreshed: true } });
  }),
);

loansRouter.get(
  '/',
  requirePermission('loans.read'),
  asyncHandler(async (req, res) => {
    await refreshOverdueFlags();
    const filters = validate(listQuerySchema, req.query);
    const where: string[] = [];
    const params: unknown[] = [];
    if (filters.status) {
      where.push('la.status = ?');
      params.push(filters.status);
    }
    if (filters.borrowerId) {
      where.push('la.borrower_id = ?');
      params.push(filters.borrowerId);
    }
    if (filters.q) {
      const like = likeContains(filters.q);
      where.push(
        `(la.account_number LIKE ? ${LIKE_ESCAPE} OR ag.agreement_number LIKE ? ${LIKE_ESCAPE} OR b.borrower_number LIKE ? ${LIKE_ESCAPE} OR b.last_name LIKE ? ${LIKE_ESCAPE})`,
      );
      params.push(like, like, like, like);
    }
    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const totalRows = await query<RowDataPacket & { count: number }>(
      `SELECT COUNT(*) AS count
       FROM loan_accounts la
       INNER JOIN loan_agreements ag ON ag.id = la.agreement_id
       INNER JOIN borrowers b ON b.id = la.borrower_id
       ${whereSql}`,
      params,
    );
    const offset = (filters.page - 1) * filters.pageSize;
    const rows = await query<LoanRow>(
      `${loanSelect} ${whereSql} ORDER BY la.id DESC LIMIT ? OFFSET ?`,
      [...params, filters.pageSize, offset],
    );
    res.json({
      data: rows.map(mapLoan),
      meta: pageMeta(filters.page, filters.pageSize, Number(totalRows[0]?.count ?? 0)),
    });
  }),
);

loansRouter.get(
  '/:id',
  requirePermission('loans.read'),
  asyncHandler(async (req, res) => {
    res.json({ data: await loanDetail(parseId(req.params.id)) });
  }),
);

loansRouter.get(
  '/:id/payments',
  requirePermission('loans.read'),
  asyncHandler(async (req, res) => {
    const loanId = parseId(req.params.id);
    const filters = validate(pageQuerySchema, req.query);
    const loans = await query<RowDataPacket>('SELECT id FROM loan_accounts WHERE id = ?', [loanId]);
    if (!loans[0]) {
      throw new AppError(404, 'Loan account not found');
    }
    const totalRows = await query<RowDataPacket & { count: number }>(
      'SELECT COUNT(*) AS count FROM payments WHERE loan_account_id = ?',
      [loanId],
    );
    const offset = (filters.page - 1) * filters.pageSize;
    const rows = await query<
      RowDataPacket & {
        id: number;
        receipt_number: string;
        amount: string;
        payment_date: string;
        method: string;
        reference_number: string | null;
        notes: string | null;
        posted_by: number | null;
        created_at: string;
      }
    >(
      `SELECT id, receipt_number, amount, payment_date, method, reference_number, notes, posted_by, created_at
       FROM payments WHERE loan_account_id = ? ORDER BY id DESC LIMIT ? OFFSET ?`,
      [loanId, filters.pageSize, offset],
    );
    res.json({
      data: rows.map((row) => ({
        id: row.id,
        receiptNumber: row.receipt_number,
        amount: Number(row.amount),
        paymentDate: apiDate(row.payment_date),
        method: row.method,
        referenceNumber: row.reference_number,
        notes: row.notes,
        postedBy: row.posted_by,
        createdAt: apiDateTime(row.created_at),
      })),
      meta: pageMeta(filters.page, filters.pageSize, Number(totalRows[0]?.count ?? 0)),
    });
  }),
);

loansRouter.post(
  '/:id/payments',
  requirePermission('payments.post'),
  asyncHandler(async (req, res) => {
    const loanId = parseId(req.params.id);
    const body = validate(paymentSchema, req.body);
    const userId = currentUser(req).id;
    const paymentCents = moneyToCents(body.amount);

    const posted = await withTransaction(async (conn) => {
      const loans = await query<LoanRow>(`${loanSelect} WHERE la.id = ? FOR UPDATE`, [loanId], conn);
      const loan = loans[0];
      if (!loan) {
        throw new AppError(404, 'Loan account not found');
      }
      if (loan.status === 'closed') {
        throw new AppError(409, 'Closed loans cannot accept payments');
      }
      if (paymentCents > moneyToCents(loan.outstanding_balance)) {
        throw new AppError(409, 'Payment exceeds the outstanding balance');
      }

      const schedule = await query<ScheduleRow>(
        `SELECT id, installment_number, due_date, principal_due, interest_due, total_due,
                principal_paid, interest_paid, total_paid, status, paid_at
         FROM repayment_schedules
         WHERE loan_account_id = ?
         ORDER BY installment_number
         FOR UPDATE`,
        [loanId],
        conn,
      );

      let remaining = paymentCents;
      const allocations: Array<{ scheduleId: number; installmentNumber: number; interestCents: number; principalCents: number }> = [];
      let outstandingPrincipal = 0;
      let outstandingInterest = 0;

      for (const line of schedule) {
        const interestDue = moneyToCents(line.interest_due);
        const principalDue = moneyToCents(line.principal_due);
        const interestPaid = moneyToCents(line.interest_paid);
        const principalPaid = moneyToCents(line.principal_paid);
        let interestApplied = 0;
        let principalApplied = 0;
        if (remaining > 0) {
          interestApplied = Math.min(remaining, Math.max(interestDue - interestPaid, 0));
          remaining -= interestApplied;
          principalApplied = Math.min(remaining, Math.max(principalDue - principalPaid, 0));
          remaining -= principalApplied;
        }
        const nextInterestPaid = interestPaid + interestApplied;
        const nextPrincipalPaid = principalPaid + principalApplied;
        const nextTotalPaid = nextInterestPaid + nextPrincipalPaid;
        const totalDue = interestDue + principalDue;
        if (interestApplied > 0 || principalApplied > 0) {
          const status = nextTotalPaid === totalDue ? 'paid' : nextTotalPaid > 0 ? 'partial' : 'pending';
          await execute(
            `UPDATE repayment_schedules
             SET interest_paid = ?, principal_paid = ?, total_paid = ?, status = ?, paid_at = ?
             WHERE id = ?`,
            [
              centsToMoneyString(nextInterestPaid),
              centsToMoneyString(nextPrincipalPaid),
              centsToMoneyString(nextTotalPaid),
              status,
              status === 'paid' ? (line.paid_at ? line.paid_at : nowSql()) : null,
              line.id,
            ],
            conn,
          );
          allocations.push({
            scheduleId: line.id,
            installmentNumber: line.installment_number,
            interestCents: interestApplied,
            principalCents: principalApplied,
          });
        }
        outstandingInterest += interestDue - nextInterestPaid;
        outstandingPrincipal += principalDue - nextPrincipalPaid;
      }

      if (remaining !== 0) {
        throw new AppError(409, 'Payment exceeds the outstanding balance');
      }

      const receiptNumber = await nextNumber(conn, 'receipt', 'RCT');
      const payment = await execute(
        `INSERT INTO payments (
           loan_account_id, receipt_number, amount, payment_date, method, reference_number, notes, posted_by
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          loanId,
          receiptNumber,
          centsToMoneyString(paymentCents),
          body.paymentDate,
          body.method,
          body.referenceNumber ?? null,
          body.notes ?? null,
          userId,
        ],
        conn,
      );
      for (const allocation of allocations) {
        const amount = allocation.interestCents + allocation.principalCents;
        await execute(
          `INSERT INTO payment_allocations (payment_id, schedule_id, interest_applied, principal_applied, amount)
           VALUES (?, ?, ?, ?, ?)`,
          [
            payment.insertId,
            allocation.scheduleId,
            centsToMoneyString(allocation.interestCents),
            centsToMoneyString(allocation.principalCents),
            centsToMoneyString(amount),
          ],
          conn,
        );
      }
      await execute(
        `UPDATE loan_accounts
         SET outstanding_principal = ?, outstanding_interest = ?, outstanding_balance = ?
         WHERE id = ?`,
        [
          centsToMoneyString(outstandingPrincipal),
          centsToMoneyString(outstandingInterest),
          centsToMoneyString(outstandingPrincipal + outstandingInterest),
          loanId,
        ],
        conn,
      );
      await refreshOverdueFlags(conn, loanId);
      const updated = await query<LoanRow>(`${loanSelect} WHERE la.id = ?`, [loanId], conn);
      const updatedLoan = updated[0];
      if (!updatedLoan) {
        throw new AppError(404, 'Loan account not found');
      }
      return {
        receipt: {
          id: payment.insertId,
          receiptNumber,
          loanAccountId: loanId,
          accountNumber: loan.account_number,
          amount: centsToMoney(paymentCents),
          paymentDate: body.paymentDate,
          method: body.method,
          referenceNumber: body.referenceNumber ?? null,
          notes: body.notes ?? null,
          postedBy: userId,
          allocations: allocations.map((allocation) => ({
            installmentNumber: allocation.installmentNumber,
            interestApplied: centsToMoney(allocation.interestCents),
            principalApplied: centsToMoney(allocation.principalCents),
            amount: centsToMoney(allocation.interestCents + allocation.principalCents),
          })),
        },
        loan: mapLoan(updatedLoan),
      };
    });

    res.status(201).json({ data: posted });
  }),
);

loansRouter.post(
  '/:id/close',
  requirePermission('loans.close'),
  asyncHandler(async (req, res) => {
    const loanId = parseId(req.params.id);
    await withTransaction(async (conn) => {
      const rows = await query<RowDataPacket & { status: string; outstanding_balance: string }>(
        'SELECT status, outstanding_balance FROM loan_accounts WHERE id = ? FOR UPDATE',
        [loanId],
        conn,
      );
      const loan = rows[0];
      if (!loan) {
        throw new AppError(404, 'Loan account not found');
      }
      if (loan.status === 'closed') {
        throw new AppError(409, 'Loan account is already closed');
      }
      if (moneyToCents(loan.outstanding_balance) !== 0) {
        throw new AppError(409, 'Loan account can be closed only when the outstanding balance is zero');
      }
      await execute(
        "UPDATE loan_accounts SET status = 'closed', closed_at = ? WHERE id = ?",
        [nowSql(), loanId],
        conn,
      );
    });
    res.json({ data: await loanDetail(loanId) });
  }),
);

export const receiptsRouter = Router();
receiptsRouter.use(requireAuth, requirePermission('loans.read'));

receiptsRouter.get(
  '/:receiptNumber',
  asyncHandler(async (req, res) => {
    const receiptNumber = req.params.receiptNumber;
    if (!/^RCT-\d{6}$/.test(receiptNumber)) {
      throw new AppError(404, 'Receipt not found');
    }
    const payments = await query<
      RowDataPacket & {
        id: number;
        loan_account_id: number;
        account_number: string;
        receipt_number: string;
        amount: string;
        payment_date: string;
        method: string;
        reference_number: string | null;
        notes: string | null;
        posted_by: number | null;
        created_at: string;
        outstanding_balance: string;
      }
    >(
      `SELECT p.*, la.account_number, la.outstanding_balance
       FROM payments p
       INNER JOIN loan_accounts la ON la.id = p.loan_account_id
       WHERE p.receipt_number = ?`,
      [receiptNumber],
    );
    const payment = payments[0];
    if (!payment) {
      throw new AppError(404, 'Receipt not found');
    }
    const allocations = await query<
      RowDataPacket & {
        installment_number: number;
        interest_applied: string;
        principal_applied: string;
        amount: string;
      }
    >(
      `SELECT rs.installment_number, pa.interest_applied, pa.principal_applied, pa.amount
       FROM payment_allocations pa
       INNER JOIN repayment_schedules rs ON rs.id = pa.schedule_id
       WHERE pa.payment_id = ?
       ORDER BY rs.installment_number`,
      [payment.id],
    );
    res.json({
      data: {
        id: payment.id,
        receiptNumber: payment.receipt_number,
        loanAccountId: payment.loan_account_id,
        accountNumber: payment.account_number,
        amount: Number(payment.amount),
        paymentDate: apiDate(payment.payment_date),
        method: payment.method,
        referenceNumber: payment.reference_number,
        notes: payment.notes,
        postedBy: payment.posted_by,
        createdAt: apiDateTime(payment.created_at),
        currentOutstandingBalance: Number(payment.outstanding_balance),
        allocations: allocations.map((allocation) => ({
          installmentNumber: allocation.installment_number,
          interestApplied: Number(allocation.interest_applied),
          principalApplied: Number(allocation.principal_applied),
          amount: Number(allocation.amount),
        })),
      },
    });
  }),
);
