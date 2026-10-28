import { addMonths } from './dates';
import { centsToMoney, decimalToScaled, scaledToDecimalString } from './money';

export interface ScheduleLine {
  installmentNumber: number;
  dueDate: string;
  principalCents: number;
  interestCents: number;
  totalCents: number;
}

export interface FlatQuote {
  principal: number;
  monthlyInterestRate: number;
  termMonths: number;
  totalInterest: number;
  totalPayable: number;
  installmentAmount: number;
  finalInstallmentAmount: number;
  schedule: Array<{
    installmentNumber: number;
    dueDate: string;
    principalDue: number;
    interestDue: number;
    totalDue: number;
  }>;
}

/** Round half up for round(principalCents * rateBasisPoints * term / 1_000_000). */
export function interestCents(principalCents: number, rateBasisPoints: number, termMonths: number): number {
  const numerator = BigInt(principalCents) * BigInt(rateBasisPoints) * BigInt(termMonths);
  const divisor = 1_000_000n;
  const remainder = numerator % divisor;
  const quotient = numerator / divisor;
  if (remainder * 2n >= divisor) {
    return Number(quotient + 1n);
  }
  return Number(quotient);
}

export function buildSchedule(input: {
  principalCents: number;
  totalInterestCents: number;
  termMonths: number;
  firstDueDate: string;
}): ScheduleLine[] {
  const { principalCents, totalInterestCents, termMonths, firstDueDate } = input;
  if (!Number.isInteger(termMonths) || termMonths < 1) {
    throw new Error('Term must be a whole number of months');
  }

  const principalBase = Math.floor(principalCents / termMonths);
  const principalRemainder = principalCents - principalBase * termMonths;
  const interestBase = Math.floor(totalInterestCents / termMonths);
  const interestRemainder = totalInterestCents - interestBase * termMonths;
  const lines: ScheduleLine[] = [];

  for (let installmentNumber = 1; installmentNumber <= termMonths; installmentNumber += 1) {
    const isLast = installmentNumber === termMonths;
    const principal = principalBase + (isLast ? principalRemainder : 0);
    const interest = interestBase + (isLast ? interestRemainder : 0);
    lines.push({
      installmentNumber,
      dueDate: addMonths(firstDueDate, installmentNumber - 1),
      principalCents: principal,
      interestCents: interest,
      totalCents: principal + interest,
    });
  }

  return lines;
}

export function quoteFlatLoan(input: {
  principal: number | string;
  monthlyInterestRate: number | string;
  termMonths: number;
  firstDueDate: string;
}): FlatQuote {
  const principalCents = decimalToScaled(input.principal, 2);
  const rateBasisPoints = decimalToScaled(input.monthlyInterestRate, 4);
  const totalInterest = interestCents(principalCents, rateBasisPoints, input.termMonths);
  const lines = buildSchedule({
    principalCents,
    totalInterestCents: totalInterest,
    termMonths: input.termMonths,
    firstDueDate: input.firstDueDate,
  });

  return {
    principal: centsToMoney(principalCents),
    monthlyInterestRate: Number(scaledToDecimalString(rateBasisPoints, 4)),
    termMonths: input.termMonths,
    totalInterest: centsToMoney(totalInterest),
    totalPayable: centsToMoney(principalCents + totalInterest),
    installmentAmount: centsToMoney(lines[0]?.totalCents ?? 0),
    finalInstallmentAmount: centsToMoney(lines[lines.length - 1]?.totalCents ?? 0),
    schedule: lines.map((line) => ({
      installmentNumber: line.installmentNumber,
      dueDate: line.dueDate,
      principalDue: centsToMoney(line.principalCents),
      interestDue: centsToMoney(line.interestCents),
      totalDue: centsToMoney(line.totalCents),
    })),
  };
}
