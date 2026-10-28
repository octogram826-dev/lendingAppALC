import { execute, pool, type Sql } from '../db';
import { getGraceDays } from '../settingsStore';

export async function refreshOverdueFlags(conn: Sql = pool, loanAccountId?: number): Promise<void> {
  const graceDays = await getGraceDays(conn);
  const loanId = loanAccountId ?? null;

  await execute(
    `UPDATE repayment_schedules rs
     INNER JOIN loan_accounts la ON la.id = rs.loan_account_id
     SET rs.status = 'overdue'
     WHERE la.status <> 'closed'
       AND (? IS NULL OR la.id = ?)
       AND rs.status IN ('pending', 'partial')
       AND DATE_ADD(rs.due_date, INTERVAL ? DAY) < CURDATE()`,
    [loanId, loanId, graceDays],
    conn,
  );

  await execute(
    `UPDATE repayment_schedules rs
     INNER JOIN loan_accounts la ON la.id = rs.loan_account_id
     SET rs.status = IF(rs.total_paid > 0, 'partial', 'pending')
     WHERE la.status <> 'closed'
       AND (? IS NULL OR la.id = ?)
       AND rs.status = 'overdue'
       AND DATE_ADD(rs.due_date, INTERVAL ? DAY) >= CURDATE()`,
    [loanId, loanId, graceDays],
    conn,
  );

  await execute(
    `UPDATE loan_accounts la
     SET la.status = 'overdue'
     WHERE la.status = 'active'
       AND (? IS NULL OR la.id = ?)
       AND EXISTS (
         SELECT 1 FROM repayment_schedules rs
         WHERE rs.loan_account_id = la.id AND rs.status = 'overdue'
       )`,
    [loanId, loanId],
    conn,
  );

  await execute(
    `UPDATE loan_accounts la
     SET la.status = 'active'
     WHERE la.status = 'overdue'
       AND (? IS NULL OR la.id = ?)
       AND NOT EXISTS (
         SELECT 1 FROM repayment_schedules rs
         WHERE rs.loan_account_id = la.id AND rs.status = 'overdue'
       )`,
    [loanId, loanId],
    conn,
  );
}
