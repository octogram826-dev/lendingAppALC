import { z } from 'zod';
import { isRealIsoDate, todayUtc } from './domain/dates';

export const GENDERS = ['male', 'female', 'other', 'unspecified'] as const;
export const CIVIL_STATUSES = ['single', 'married', 'widowed', 'separated', 'unspecified'] as const;
export const EMPLOYMENT_STATUSES = ['employed', 'self_employed', 'business_owner', 'retired', 'unemployed', 'other'] as const;
export const DOCUMENT_TYPES = ['national_id', 'passport', 'drivers_license', 'tax_id', 'social_security', 'other'] as const;
export const VERIFICATION_STATUSES = ['pending', 'verified', 'rejected'] as const;
export const APPLICATION_STATUSES = ['draft', 'submitted', 'under_review', 'approved', 'rejected', 'withdrawn', 'disbursed'] as const;
export const REQUIREMENT_STATUSES = ['pending', 'submitted', 'waived'] as const;
export const PAYMENT_METHODS = ['cash', 'bank_transfer', 'check'] as const;
export const LOAN_STATUSES = ['active', 'overdue', 'closed'] as const;

function decimalSchema(decimals: number, label: string) {
  const pattern = new RegExp(`^\\d+(\\.\\d{1,${decimals}})?$`);
  return z
    .union([z.number(), z.string()])
    .superRefine((value, ctx) => {
      const text = typeof value === 'number' ? value.toString() : value.trim();
      if (!pattern.test(text)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${label} must be a number with at most ${decimals} decimal places`,
        });
      }
    })
    .transform((value): number => {
      const text = typeof value === 'number' ? value.toString() : value.trim();
      return Number(text);
    });
}

export const positiveMoneySchema = decimalSchema(2, 'Amount').refine(
  (value) => value > 0 && value <= 99_999_999.99,
  'Amount must be greater than 0 and at most 99999999.99',
);

export const nonNegativeMoneySchema = decimalSchema(2, 'Amount').refine(
  (value) => value >= 0 && value <= 99_999_999.99,
  'Amount must be between 0 and 99999999.99',
);

export const interestRateSchema = decimalSchema(4, 'Interest rate').refine(
  (value) => value >= 0 && value <= 20,
  'Monthly interest rate must be between 0 and 20 percent',
);

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
  .refine(isRealIsoDate, 'Invalid calendar date');

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters')
  .regex(/[A-Za-z]/, 'Password must include a letter')
  .regex(/\d/, 'Password must include a number');

export const pageQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export function pageMeta(page: number, pageSize: number, total: number) {
  return { page, pageSize, total };
}

export function likeContains(value: string): string {
  return `%${value.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}

export const LIKE_ESCAPE = "ESCAPE '\\\\'";

const optionalBlank = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => {
      if (value === undefined) {
        return undefined;
      }
      if (value === null || value.length === 0) {
        return null;
      }
      return value;
    });

export const optionalEmailSchema = z
  .union([z.string().trim().max(255), z.null()])
  .optional()
  .transform((value, ctx) => {
    if (value === undefined) {
      return undefined;
    }
    if (value === null || value.trim() === '') {
      return null;
    }
    const parsed = z.string().email().safeParse(value.trim());
    if (!parsed.success) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid email' });
      return z.NEVER;
    }
    return parsed.data.toLowerCase();
  });

export const optionalDateSchema = z
  .union([isoDateSchema, z.literal(''), z.null()])
  .optional()
  .transform((value) => {
    if (value === undefined) {
      return undefined;
    }
    if (value === null || value === '') {
      return null;
    }
    return value;
  });

export const borrowerFields = {
  firstName: z.string().trim().min(1).max(100),
  middleName: optionalBlank(100),
  lastName: z.string().trim().min(1).max(100),
  dateOfBirth: optionalDateSchema.refine(
    (value) => value === undefined || value === null || value <= todayUtc(),
    'Date of birth cannot be in the future',
  ),
  gender: z.enum(GENDERS).optional(),
  civilStatus: z.enum(CIVIL_STATUSES).optional(),
  email: optionalEmailSchema,
  mobile: optionalBlank(32),
  addressLine: optionalBlank(255),
  city: optionalBlank(100),
  province: optionalBlank(100),
  postalCode: optionalBlank(20),
  employmentStatus: z.enum(EMPLOYMENT_STATUSES).nullable().optional(),
  employerName: optionalBlank(150),
  monthlyIncome: nonNegativeMoneySchema.nullable().optional(),
};

export function hasAnyField(value: object): boolean {
  return Object.values(value).some((item) => item !== undefined);
}
