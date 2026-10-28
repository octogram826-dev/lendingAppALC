import { Router } from 'express';
import type { RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { apiDateTime } from '../domain/dates';
import { asMoney, centsToMoneyString, moneyToCents } from '../domain/money';
import { execute, query } from '../db';
import { AppError, isDuplicateKey } from '../errors';
import { asyncHandler, requireAuth, requirePermission, validate } from '../http';
import { parseId } from '../params';
import { hasAnyField, interestRateSchema, pageMeta, pageQuerySchema, positiveMoneySchema } from '../schemas';

type ProductRow = RowDataPacket & {
  id: number;
  code: string;
  name: string;
  description: string | null;
  interest_method: 'flat';
  monthly_interest_rate: string;
  min_amount: string;
  max_amount: string;
  min_term_months: number;
  max_term_months: number;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
};

type RequirementRow = RowDataPacket & {
  id: number;
  product_id: number;
  name: string;
  description: string | null;
  is_required: number;
};

function mapRequirement(row: RequirementRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isRequired: row.is_required === 1,
  };
}

function mapProduct(row: ProductRow, requirements?: RequirementRow[]) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    interestMethod: row.interest_method,
    monthlyInterestRate: Number(row.monthly_interest_rate),
    minAmount: asMoney(row.min_amount),
    maxAmount: asMoney(row.max_amount),
    minTermMonths: row.min_term_months,
    maxTermMonths: row.max_term_months,
    status: row.status,
    createdAt: apiDateTime(row.created_at),
    updatedAt: apiDateTime(row.updated_at),
    ...(requirements ? { requirements: requirements.map(mapRequirement) } : {}),
  };
}

async function getProductRow(id: number): Promise<ProductRow> {
  const rows = await query<ProductRow>('SELECT * FROM loan_products WHERE id = ?', [id]);
  const row = rows[0];
  if (!row) {
    throw new AppError(404, 'Loan product not found');
  }
  return row;
}

async function productDetail(id: number) {
  const row = await getProductRow(id);
  const requirements = await query<RequirementRow>(
    'SELECT * FROM product_requirements WHERE product_id = ? ORDER BY id',
    [id],
  );
  return mapProduct(row, requirements);
}

const termSchema = z.number().int().min(1).max(360);
const optionalText = z
  .string()
  .trim()
  .max(500)
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

const productSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(2)
      .max(32)
      .regex(/^[A-Za-z0-9_-]+$/, 'Code may contain letters, numbers, hyphens, and underscores')
      .transform((value) => value.toUpperCase()),
    name: z.string().trim().min(1).max(150),
    description: optionalText,
    monthlyInterestRate: interestRateSchema,
    minAmount: positiveMoneySchema,
    maxAmount: positiveMoneySchema,
    minTermMonths: termSchema,
    maxTermMonths: termSchema,
    status: z.enum(['active', 'inactive']).default('active'),
  })
  .superRefine((value, ctx) => {
    if (moneyToCents(value.minAmount) > moneyToCents(value.maxAmount)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['maxAmount'],
        message: 'Maximum amount must be at least the minimum amount',
      });
    }
    if (value.minTermMonths > value.maxTermMonths) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['maxTermMonths'],
        message: 'Maximum term must be at least the minimum term',
      });
    }
  });

const patchProductSchema = z
  .object({
    name: z.string().trim().min(1).max(150).optional(),
    description: optionalText,
    monthlyInterestRate: interestRateSchema.optional(),
    minAmount: positiveMoneySchema.optional(),
    maxAmount: positiveMoneySchema.optional(),
    minTermMonths: termSchema.optional(),
    maxTermMonths: termSchema.optional(),
    status: z.enum(['active', 'inactive']).optional(),
  })
  .refine(hasAnyField, 'Provide at least one field to update');

const requirementSchema = z.object({
  name: z.string().trim().min(1).max(150),
  description: z.string().trim().max(255).nullable().optional(),
  isRequired: z.boolean().default(true),
});

const patchRequirementSchema = z
  .object({
    name: z.string().trim().min(1).max(150).optional(),
    description: z.string().trim().max(255).nullable().optional(),
    isRequired: z.boolean().optional(),
  })
  .refine(hasAnyField, 'Provide at least one field to update');

export const productsRouter = Router();
productsRouter.use(requireAuth);

productsRouter.get(
  '/',
  requirePermission('products.read'),
  asyncHandler(async (req, res) => {
    const filters = validate(
      pageQuerySchema.extend({ status: z.enum(['active', 'inactive']).optional() }),
      req.query,
    );
    const where: string[] = [];
    const params: unknown[] = [];
    if (filters.status) {
      where.push('status = ?');
      params.push(filters.status);
    }
    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const totalRows = await query<RowDataPacket & { count: number }>(
      `SELECT COUNT(*) AS count FROM loan_products ${whereSql}`,
      params,
    );
    const offset = (filters.page - 1) * filters.pageSize;
    const rows = await query<ProductRow>(
      `SELECT * FROM loan_products ${whereSql} ORDER BY code LIMIT ? OFFSET ?`,
      [...params, filters.pageSize, offset],
    );
    res.json({
      data: rows.map((row) => mapProduct(row)),
      meta: pageMeta(filters.page, filters.pageSize, Number(totalRows[0]?.count ?? 0)),
    });
  }),
);

productsRouter.post(
  '/',
  requirePermission('products.write'),
  asyncHandler(async (req, res) => {
    const body = validate(productSchema, req.body);
    try {
      const created = await execute(
        `INSERT INTO loan_products (
           code, name, description, interest_method, monthly_interest_rate,
           min_amount, max_amount, min_term_months, max_term_months, status
         ) VALUES (?, ?, ?, 'flat', ?, ?, ?, ?, ?, ?)`,
        [
          body.code,
          body.name,
          body.description ?? null,
          body.monthlyInterestRate,
          centsToMoneyString(moneyToCents(body.minAmount)),
          centsToMoneyString(moneyToCents(body.maxAmount)),
          body.minTermMonths,
          body.maxTermMonths,
          body.status,
        ],
      );
      res.status(201).json({ data: await productDetail(created.insertId) });
    } catch (error) {
      if (isDuplicateKey(error)) {
        throw new AppError(409, 'A product with this code already exists');
      }
      throw error;
    }
  }),
);

productsRouter.get(
  '/:id',
  requirePermission('products.read'),
  asyncHandler(async (req, res) => {
    res.json({ data: await productDetail(parseId(req.params.id)) });
  }),
);

productsRouter.patch(
  '/:id',
  requirePermission('products.write'),
  asyncHandler(async (req, res) => {
    const productId = parseId(req.params.id);
    const body = validate(patchProductSchema, req.body);
    const product = await getProductRow(productId);
    const minAmount = body.minAmount ?? Number(product.min_amount);
    const maxAmount = body.maxAmount ?? Number(product.max_amount);
    const minTerm = body.minTermMonths ?? product.min_term_months;
    const maxTerm = body.maxTermMonths ?? product.max_term_months;
    if (moneyToCents(minAmount) > moneyToCents(maxAmount)) {
      throw new AppError(400, 'Maximum amount must be at least the minimum amount');
    }
    if (minTerm > maxTerm) {
      throw new AppError(400, 'Maximum term must be at least the minimum term');
    }

    const sets: string[] = [];
    const params: unknown[] = [];
    const assign = (column: string, value: unknown) => {
      if (value !== undefined) {
        sets.push(`${column} = ?`);
        params.push(value);
      }
    };
    assign('name', body.name);
    assign('description', body.description);
    assign('monthly_interest_rate', body.monthlyInterestRate);
    assign('min_amount', body.minAmount === undefined ? undefined : centsToMoneyString(moneyToCents(body.minAmount)));
    assign('max_amount', body.maxAmount === undefined ? undefined : centsToMoneyString(moneyToCents(body.maxAmount)));
    assign('min_term_months', body.minTermMonths);
    assign('max_term_months', body.maxTermMonths);
    assign('status', body.status);
    await execute(`UPDATE loan_products SET ${sets.join(', ')} WHERE id = ?`, [...params, productId]);
    res.json({ data: await productDetail(productId) });
  }),
);

productsRouter.post(
  '/:id/requirements',
  requirePermission('products.write'),
  asyncHandler(async (req, res) => {
    const productId = parseId(req.params.id);
    const body = validate(requirementSchema, req.body);
    await getProductRow(productId);
    await execute(
      'INSERT INTO product_requirements (product_id, name, description, is_required) VALUES (?, ?, ?, ?)',
      [productId, body.name, body.description ?? null, body.isRequired ? 1 : 0],
    );
    res.status(201).json({ data: await productDetail(productId) });
  }),
);

productsRouter.patch(
  '/:id/requirements/:requirementId',
  requirePermission('products.write'),
  asyncHandler(async (req, res) => {
    const productId = parseId(req.params.id);
    const requirementId = parseId(req.params.requirementId, 'requirement id');
    const body = validate(patchRequirementSchema, req.body);
    const rows = await query<RequirementRow>(
      'SELECT * FROM product_requirements WHERE id = ? AND product_id = ?',
      [requirementId, productId],
    );
    if (!rows[0]) {
      throw new AppError(404, 'Requirement not found');
    }
    const sets: string[] = [];
    const params: unknown[] = [];
    if (body.name !== undefined) {
      sets.push('name = ?');
      params.push(body.name);
    }
    if (body.description !== undefined) {
      sets.push('description = ?');
      params.push(body.description === '' ? null : body.description);
    }
    if (body.isRequired !== undefined) {
      sets.push('is_required = ?');
      params.push(body.isRequired ? 1 : 0);
    }
    await execute(`UPDATE product_requirements SET ${sets.join(', ')} WHERE id = ?`, [...params, requirementId]);
    res.json({ data: await productDetail(productId) });
  }),
);

productsRouter.delete(
  '/:id/requirements/:requirementId',
  requirePermission('products.write'),
  asyncHandler(async (req, res) => {
    const productId = parseId(req.params.id);
    const requirementId = parseId(req.params.requirementId, 'requirement id');
    const result = await execute('DELETE FROM product_requirements WHERE id = ? AND product_id = ?', [
      requirementId,
      productId,
    ]);
    if (result.affectedRows === 0) {
      throw new AppError(404, 'Requirement not found');
    }
    res.status(204).send();
  }),
);
