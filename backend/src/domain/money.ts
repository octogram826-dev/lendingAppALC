export function decimalToScaled(value: number | string, scale: number): number {
  const text = typeof value === 'string' ? value.trim() : value.toString();
  if (!/^\d+(\.\d+)?$/.test(text)) {
    throw new Error(`Invalid decimal: ${value}`);
  }
  const [whole, fraction = ''] = text.split('.');
  if (fraction.length > scale) {
    throw new Error(`Expected at most ${scale} decimal places`);
  }
  const padded = `${fraction}${'0'.repeat(scale)}`.slice(0, scale);
  return Number(whole) * 10 ** scale + Number(padded);
}

export function scaledToDecimalString(scaled: number, scale: number): string {
  const negative = scaled < 0;
  const absolute = Math.abs(scaled);
  const factor = 10 ** scale;
  const whole = Math.floor(absolute / factor);
  const fraction = String(absolute % factor).padStart(scale, '0');
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

export function moneyToCents(value: number | string): number {
  return decimalToScaled(value, 2);
}

export function centsToMoneyString(cents: number): string {
  return scaledToDecimalString(cents, 2);
}

export function centsToMoney(cents: number): number {
  return Number(centsToMoneyString(cents));
}

export function asMoney(value: string | number | null): number | null {
  if (value === null) {
    return null;
  }
  return Number(value);
}

export function asCount(value: string | number | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }
  return Number(value);
}

export function installmentRatio(installmentCents: number, incomeCents: number): number | null {
  if (incomeCents <= 0) {
    return null;
  }
  return Number((installmentCents / incomeCents).toFixed(4));
}
