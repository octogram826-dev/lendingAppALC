import assert from 'node:assert/strict';
import test from 'node:test';
import { addMonths, isRealIsoDate } from './dates';
import { interestCents, quoteFlatLoan } from './flatInterest';
import { moneyToCents } from './money';

test('flat interest for 10000 at 2 percent for 12 months is 2400', () => {
  const quote = quoteFlatLoan({
    principal: 10000,
    monthlyInterestRate: 2,
    termMonths: 12,
    firstDueDate: '2026-02-01',
  });

  assert.equal(quote.totalInterest, 2400);
  assert.equal(quote.totalPayable, 12400);
  assert.equal(quote.installmentAmount, 1033.33);
  assert.equal(quote.finalInstallmentAmount, 1033.37);
  assert.equal(quote.schedule.length, 12);
  assert.equal(quote.schedule[0].dueDate, '2026-02-01');
  assert.equal(quote.schedule[11].dueDate, '2027-01-01');
  assert.equal(quote.schedule[0].principalDue, 833.33);
  assert.equal(quote.schedule[0].interestDue, 200);
  assert.equal(quote.schedule[11].principalDue, 833.37);

  const principal = quote.schedule.reduce((sum, line) => sum + moneyToCents(line.principalDue), 0);
  const interest = quote.schedule.reduce((sum, line) => sum + moneyToCents(line.interestDue), 0);
  const total = quote.schedule.reduce((sum, line) => sum + moneyToCents(line.totalDue), 0);
  assert.equal(principal, moneyToCents(10000));
  assert.equal(interest, moneyToCents(2400));
  assert.equal(total, moneyToCents(12400));
});

test('flat interest for 1000 at 1.5 percent for 3 months is 45', () => {
  const quote = quoteFlatLoan({
    principal: '1000.00',
    monthlyInterestRate: '1.5000',
    termMonths: 3,
    firstDueDate: '2026-03-15',
  });

  assert.equal(quote.totalInterest, 45);
  assert.equal(quote.totalPayable, 1045);
  assert.equal(quote.schedule[0].totalDue, 348.33);
  assert.equal(quote.schedule[2].totalDue, 348.34);
});

test('interest rounding is half up', () => {
  assert.equal(interestCents(1, 500000, 1), 1);
  assert.equal(interestCents(1, 499999, 1), 0);
  assert.equal(interestCents(moneyToCents('100.01'), decimalToBasis('1.3333'), 1), 133);
});

test('month-end due dates clamp to the last day of the month', () => {
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2024-01-31', 1), '2024-02-29');
  assert.equal(addMonths('2026-01-31', 2), '2026-03-31');
  assert.equal(isRealIsoDate('2026-02-31'), false);
  assert.equal(isRealIsoDate('2026-02-28'), true);
});

function decimalToBasis(value: string): number {
  const [whole, fraction = ''] = value.split('.');
  return Number(whole) * 10000 + Number(`${fraction}0000`.slice(0, 4));
}
