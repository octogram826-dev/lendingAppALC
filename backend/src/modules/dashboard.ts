import { Router } from 'express';
import type { RowDataPacket } from 'mysql2/promise';
import { asCount, asMoney } from '../domain/money';
import { query } from '../db';
import { asyncHandler, requireAuth, requirePermission } from '../http';
import { refreshOverdueFlags } from './overdue';
import { APPLICATION_STATUSES } from '../schemas';
import { getSettingValue, SETTING_KEYS } from '../settingsStore';

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth, requirePermission('dashboard.read'));

dashboardRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    await refreshOverdueFlags();

    const borrowers = await query<RowDataPacket & { count: number }>('SELECT COUNT(*) AS count FROM borrowers');
    const loanRows = await query<RowDataPacket & { status: string; count: number; principal: string; outstanding: string }>(
      `SELECT status, COUNT(*) AS count, COALESCE(SUM(principal), 0) AS principal, COALESCE(SUM(outstanding_balance), 0) AS outstanding
       FROM loan_accounts GROUP BY status`,
    );
    const applicationRows = await query<RowDataPacket & { status: string; count: number }>(
      'SELECT status, COUNT(*) AS count FROM loan_applications GROUP BY status',
    );
    const overdueInstallments = await query<RowDataPacket & { count: number; amount: string }>(
      `SELECT COUNT(*) AS count, COALESCE(SUM(total_due - total_paid), 0) AS amount
       FROM repayment_schedules WHERE status = 'overdue'`,
    );
    const postedToday = await query<RowDataPacket & { amount: string }>(
      'SELECT COALESCE(SUM(amount), 0) AS amount FROM payments WHERE payment_date = CURDATE()',
    );
    const postedThisMonth = await query<RowDataPacket & { amount: string }>(
      `SELECT COALESCE(SUM(amount), 0) AS amount FROM payments
       WHERE payment_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
         AND payment_date < DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH)`,
    );
    const duesThisMonth = await query<RowDataPacket & { due: string; collected: string }>(
      `SELECT COALESCE(SUM(total_due), 0) AS due, COALESCE(SUM(total_paid), 0) AS collected
       FROM repayment_schedules
       WHERE due_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
         AND due_date < DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH)`,
    );
    const disbursedThisMonth = await query<RowDataPacket & { amount: string; count: number }>(
      `SELECT COALESCE(SUM(amount), 0) AS amount, COUNT(*) AS count FROM disbursements
       WHERE release_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
         AND release_date < DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH)`,
    );
    const pendingClosure = await query<RowDataPacket & { count: number }>(
      "SELECT COUNT(*) AS count FROM loan_accounts WHERE status <> 'closed' AND outstanding_balance = 0",
    );

    const byStatus = Object.fromEntries(APPLICATION_STATUSES.map((status) => [status, 0])) as Record<
      (typeof APPLICATION_STATUSES)[number],
      number
    >;
    for (const row of applicationRows) {
      if (row.status in byStatus) {
        byStatus[row.status as (typeof APPLICATION_STATUSES)[number]] = asCount(row.count);
      }
    }

    const loanSummary = {
      active: { count: 0, principal: 0, outstanding: 0 },
      overdue: { count: 0, principal: 0, outstanding: 0 },
      closed: { count: 0, principal: 0, outstanding: 0 },
    };
    for (const row of loanRows) {
      if (row.status === 'active' || row.status === 'overdue' || row.status === 'closed') {
        loanSummary[row.status] = {
          count: asCount(row.count),
          principal: asMoney(row.principal) ?? 0,
          outstanding: asMoney(row.outstanding) ?? 0,
        };
      }
    }

    res.json({
      data: {
        companyName: await getSettingValue(SETTING_KEYS.companyName),
        currency: await getSettingValue(SETTING_KEYS.currency),
        portfolio: {
          borrowerCount: asCount(borrowers[0]?.count),
          accountsActive: loanSummary.active.count,
          accountsOverdue: loanSummary.overdue.count,
          accountsClosed: loanSummary.closed.count,
          principalDisbursed:
            loanSummary.active.principal + loanSummary.overdue.principal + loanSummary.closed.principal,
          outstandingBalance: loanSummary.active.outstanding + loanSummary.overdue.outstanding,
          fullyPaidPendingClosure: asCount(pendingClosure[0]?.count),
          disbursedThisMonth: asMoney(disbursedThisMonth[0]?.amount) ?? 0,
          disbursementCountThisMonth: asCount(disbursedThisMonth[0]?.count),
        },
        applications: {
          total: Object.values(byStatus).reduce((sum, count) => sum + count, 0),
          byStatus,
        },
        collections: {
          postedToday: asMoney(postedToday[0]?.amount) ?? 0,
          postedThisMonth: asMoney(postedThisMonth[0]?.amount) ?? 0,
          dueThisMonth: asMoney(duesThisMonth[0]?.due) ?? 0,
          collectedOnDuesThisMonth: asMoney(duesThisMonth[0]?.collected) ?? 0,
        },
        overdue: {
          accounts: loanSummary.overdue.count,
          outstandingBalance: loanSummary.overdue.outstanding,
          installments: asCount(overdueInstallments[0]?.count),
          installmentAmount: asMoney(overdueInstallments[0]?.amount) ?? 0,
        },
      },
    });
  }),
);
