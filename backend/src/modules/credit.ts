import type { RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { CAPACITY_CHECKLIST, CHECKLIST_RESULTS, type ChecklistCode } from '../domain/checklist';
import { apiDateTime, nowSql } from '../domain/dates';
import { quoteFlatLoan } from '../domain/flatInterest';
import { centsToMoneyString, installmentRatio, moneyToCents } from '../domain/money';
import { fullName } from '../domain/names';
import { execute, query, withTransaction } from '../db';
import { AppError } from '../errors';
import { nonNegativeMoneySchema } from '../schemas';
import { getMaxInstallmentRatio } from '../settingsStore';

type ApplicationLock = RowDataPacket & {
  id: number;
  status: string;
  requested_amount: string;
  term_months: number;
  monthly_interest_rate: string;
  stated_income: string | null;
};

type EvaluationRow = RowDataPacket & {
  id: number;
  application_id: number;
  evaluator_id: number;
  evaluator_first_name: string;
  evaluator_last_name: string;
  stated_monthly_income: string;
  verified_monthly_income: string;
  existing_monthly_obligations: string;
  disposable_income: string;
  proposed_installment: string;
  recommendation: 'approve' | 'reject';
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type ChecklistRow = RowDataPacket & {
  item_code: string;
  label: string;
  result: 'pass' | 'fail' | 'na';
  notes: string | null;
};

type ApprovalRow = RowDataPacket & {
  id: number;
  application_id: number;
  evaluation_id: number;
  approver_id: number;
  approver_first_name: string;
  approver_last_name: string;
  decision: 'approved' | 'rejected';
  comments: string | null;
  decided_at: string;
};

export const evaluationSchema = z.object({
  verifiedMonthlyIncome: nonNegativeMoneySchema,
  existingMonthlyObligations: nonNegativeMoneySchema.default(0),
  recommendation: z.enum(['approve', 'reject']),
  notes: z.string().trim().max(1000).nullable().optional(),
  checklist: z.array(
    z.object({
      code: z.string().trim().min(1).max(64),
      result: z.enum(CHECKLIST_RESULTS),
      notes: z.string().trim().max(255).nullable().optional(),
    }),
  ),
});

export const approvalSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  comments: z.string().trim().max(1000).nullable().optional(),
});

type EvaluationInput = z.infer<typeof evaluationSchema>;
type ApprovalInput = z.infer<typeof approvalSchema>;

function checklistOrThrow(input: EvaluationInput): Map<ChecklistCode, { result: 'pass' | 'fail' | 'na'; notes: string | null }> {
  const submitted = new Map<ChecklistCode, { result: 'pass' | 'fail' | 'na'; notes: string | null }>();
  for (const item of input.checklist) {
    const known = CAPACITY_CHECKLIST.find((entry) => entry.code === item.code);
    if (!known) {
      throw new AppError(400, `Unknown checklist item ${item.code}`);
    }
    if (submitted.has(known.code)) {
      throw new AppError(400, `Duplicate checklist item ${item.code}`);
    }
    submitted.set(known.code, { result: item.result, notes: item.notes ?? null });
  }
  for (const entry of CAPACITY_CHECKLIST) {
    if (!submitted.has(entry.code)) {
      throw new AppError(400, `Missing checklist item ${entry.code}`);
    }
  }
  if (input.recommendation === 'approve') {
    for (const entry of CAPACITY_CHECKLIST) {
      const item = submitted.get(entry.code);
      if (item?.result === 'fail') {
        throw new AppError(400, 'An approval recommendation requires every checklist item to pass or be not applicable');
      }
    }
    if (submitted.get('installment_within_capacity')?.result !== 'pass') {
      throw new AppError(400, 'An approval recommendation requires installment capacity to pass');
    }
  }
  return submitted;
}

async function evaluationDto(applicationId: number, maxRatio: number) {
  const rows = await query<EvaluationRow>(
    `SELECT e.*, u.first_name AS evaluator_first_name, u.last_name AS evaluator_last_name
     FROM credit_evaluations e
     INNER JOIN users u ON u.id = e.evaluator_id
     WHERE e.application_id = ?`,
    [applicationId],
  );
  const row = rows[0];
  if (!row) {
    return null;
  }
  const items = await query<ChecklistRow>(
    'SELECT item_code, label, result, notes FROM capacity_checklist_items WHERE evaluation_id = ? ORDER BY id',
    [row.id],
  );
  const ratio = installmentRatio(moneyToCents(row.proposed_installment), moneyToCents(row.verified_monthly_income));
  return {
    id: row.id,
    applicationId: row.application_id,
    evaluatorId: row.evaluator_id,
    evaluatorName: fullName(row.evaluator_first_name, null, row.evaluator_last_name),
    statedMonthlyIncome: Number(row.stated_monthly_income),
    verifiedMonthlyIncome: Number(row.verified_monthly_income),
    existingMonthlyObligations: Number(row.existing_monthly_obligations),
    disposableIncome: Number(row.disposable_income),
    proposedInstallment: Number(row.proposed_installment),
    installmentToIncomeRatio: ratio,
    maxInstallmentToIncome: maxRatio,
    withinPolicy: ratio !== null && ratio <= maxRatio,
    recommendation: row.recommendation,
    notes: row.notes,
    checklist: items.map((item) => ({
      code: item.item_code,
      label: item.label,
      result: item.result,
      notes: item.notes,
    })),
    createdAt: apiDateTime(row.created_at),
    updatedAt: apiDateTime(row.updated_at),
  };
}

export async function loadEvaluation(applicationId: number) {
  return evaluationDto(applicationId, await getMaxInstallmentRatio());
}

export async function loadApproval(applicationId: number) {
  const rows = await query<ApprovalRow>(
    `SELECT a.*, u.first_name AS approver_first_name, u.last_name AS approver_last_name
     FROM approvals a
     INNER JOIN users u ON u.id = a.approver_id
     WHERE a.application_id = ?`,
    [applicationId],
  );
  const row = rows[0];
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    applicationId: row.application_id,
    evaluationId: row.evaluation_id,
    approverId: row.approver_id,
    approverName: fullName(row.approver_first_name, null, row.approver_last_name),
    decision: row.decision,
    comments: row.comments,
    decidedAt: apiDateTime(row.decided_at),
  };
}

export async function evaluateApplication(applicationId: number, userId: number, input: EvaluationInput) {
  const checklist = checklistOrThrow(input);
  const maxRatio = await getMaxInstallmentRatio();

  await withTransaction(async (conn) => {
    const applications = await query<ApplicationLock>(
      `SELECT a.id, a.status, a.requested_amount, a.term_months, a.monthly_interest_rate, b.monthly_income AS stated_income
       FROM loan_applications a
       INNER JOIN borrowers b ON b.id = a.borrower_id
       WHERE a.id = ?
       FOR UPDATE`,
      [applicationId],
      conn,
    );
    const application = applications[0];
    if (!application) {
      throw new AppError(404, 'Application not found');
    }
    if (application.status !== 'submitted' && application.status !== 'under_review') {
      throw new AppError(409, 'Credit evaluation is available after the application is submitted and before it is decided');
    }
    const approvals = await query<RowDataPacket>('SELECT id FROM approvals WHERE application_id = ?', [applicationId], conn);
    if (approvals[0]) {
      throw new AppError(409, 'This application already has an approval decision');
    }

    const quote = quoteFlatLoan({
      principal: application.requested_amount,
      monthlyInterestRate: application.monthly_interest_rate,
      termMonths: application.term_months,
      firstDueDate: '2026-01-15',
    });
    const verifiedCents = moneyToCents(input.verifiedMonthlyIncome);
    const obligationCents = moneyToCents(input.existingMonthlyObligations);
    const statedCents = moneyToCents(application.stated_income ?? 0);
    const installmentCents = moneyToCents(quote.installmentAmount);

    const existing = await query<RowDataPacket & { id: number }>(
      'SELECT id FROM credit_evaluations WHERE application_id = ?',
      [applicationId],
      conn,
    );
    let evaluationId = existing[0]?.id;
    const values = [
      userId,
      centsToMoneyString(statedCents),
      centsToMoneyString(verifiedCents),
      centsToMoneyString(obligationCents),
      centsToMoneyString(verifiedCents - obligationCents),
      centsToMoneyString(installmentCents),
      input.recommendation,
      input.notes ?? null,
    ];
    if (evaluationId) {
      await execute(
        `UPDATE credit_evaluations
         SET evaluator_id = ?, stated_monthly_income = ?, verified_monthly_income = ?,
             existing_monthly_obligations = ?, disposable_income = ?, proposed_installment = ?,
             recommendation = ?, notes = ?
         WHERE id = ?`,
        [...values, evaluationId],
        conn,
      );
      await execute('DELETE FROM capacity_checklist_items WHERE evaluation_id = ?', [evaluationId], conn);
    } else {
      const created = await execute(
        `INSERT INTO credit_evaluations (
           application_id, evaluator_id, stated_monthly_income, verified_monthly_income,
           existing_monthly_obligations, disposable_income, proposed_installment, recommendation, notes
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [applicationId, ...values],
        conn,
      );
      evaluationId = created.insertId;
    }

    for (const entry of CAPACITY_CHECKLIST) {
      const item = checklist.get(entry.code);
      if (!item) {
        throw new AppError(400, `Missing checklist item ${entry.code}`);
      }
      await execute(
        `INSERT INTO capacity_checklist_items (evaluation_id, item_code, label, result, notes) VALUES (?, ?, ?, ?, ?)`,
        [evaluationId, entry.code, entry.label, item.result, item.notes],
        conn,
      );
    }
    await execute("UPDATE loan_applications SET status = 'under_review' WHERE id = ?", [applicationId], conn);
  });

  const evaluation = await evaluationDto(applicationId, maxRatio);
  if (!evaluation) {
    throw new AppError(500, 'Credit evaluation could not be recorded');
  }
  return evaluation;
}

export async function decideApplication(applicationId: number, userId: number, input: ApprovalInput) {
  await withTransaction(async (conn) => {
    const applications = await query<RowDataPacket & { id: number; status: string }>(
      'SELECT id, status FROM loan_applications WHERE id = ? FOR UPDATE',
      [applicationId],
      conn,
    );
    const application = applications[0];
    if (!application) {
      throw new AppError(404, 'Application not found');
    }
    if (application.status !== 'under_review') {
      throw new AppError(409, 'One-level approval requires a completed credit evaluation');
    }
    const evaluations = await query<RowDataPacket & { id: number }>(
      'SELECT id FROM credit_evaluations WHERE application_id = ?',
      [applicationId],
      conn,
    );
    const evaluation = evaluations[0];
    if (!evaluation) {
      throw new AppError(409, 'Record a credit evaluation before approval');
    }
    const existing = await query<RowDataPacket>('SELECT id FROM approvals WHERE application_id = ?', [applicationId], conn);
    if (existing[0]) {
      throw new AppError(409, 'This application already has an approval decision');
    }
    await execute(
      `INSERT INTO approvals (application_id, evaluation_id, approver_id, decision, comments, decided_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [applicationId, evaluation.id, userId, input.decision, input.comments ?? null, nowSql()],
      conn,
    );
    await execute('UPDATE loan_applications SET status = ? WHERE id = ?', [input.decision, applicationId], conn);
  });
  return loadApproval(applicationId);
}
