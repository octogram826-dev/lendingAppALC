import { AppError } from './errors';

export function parseId(value: string, label = 'id'): number {
  if (!/^\d+$/.test(value)) {
    throw new AppError(400, `Invalid ${label}`);
  }
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new AppError(400, `Invalid ${label}`);
  }
  return id;
}
