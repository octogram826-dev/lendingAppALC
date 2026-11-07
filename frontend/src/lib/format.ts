const SPECIAL: Record<string, string> = {
  na: 'N/A',
  pass: 'Pass',
  fail: 'Fail',
};

let currencyCode = 'PHP';

export function setCurrency(code: string) {
  if (/^[A-Z]{3}$/.test(code)) currencyCode = code;
}

export function currency() {
  return currencyCode;
}

export function money(value: number | null | undefined) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const amount = Number(value);
  try {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currencyCode} ${amount.toFixed(2)}`;
  }
}

export function roleTitle(name: string) {
  if (name === 'admin') return 'Administrator';
  return label(name);
}

export function label(value: string | null | undefined) {
  if (!value) return '—';
  if (SPECIAL[value]) return SPECIAL[value];
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' }).format(new Date(year, month - 1, day));
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' }).format(date);
}

export function formatWhen(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function localDate(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function blankToNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function qs(params: Record<string, string | number | undefined | null>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

export function fullName(first: string, last: string) {
  return `${first} ${last}`.trim();
}

export function ratioPercent(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return '—';
  return `${(value * 100).toFixed(2)}%`;
}
