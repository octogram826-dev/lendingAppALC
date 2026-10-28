import { Router } from 'express';
import type { RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { apiDate, apiDateTime, nowSql } from '../domain/dates';
import { centsToMoneyString, moneyToCents } from '../domain/money';
import { fullName } from '../domain/names';
import { nextNumber } from '../domain/sequences';
import { execute, query, withTransaction } from '../db';
import { AppError, isDuplicateKey } from '../errors';
import { asyncHandler, currentUser, requireAuth, requirePermission, validate } from '../http';
import { parseId } from '../params';
import {
  borrowerFields,
  CIVIL_STATUSES,
  DOCUMENT_TYPES,
  GENDERS,
  hasAnyField,
  LIKE_ESCAPE,
  likeContains,
  optionalDateSchema,
  pageMeta,
  pageQuerySchema,
  VERIFICATION_STATUSES,
} from '../schemas';

type BorrowerRow = RowDataPacket & {
  id: number;
  borrower_number: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  date_of_birth: string | null;
  gender: (typeof GENDERS)[number];
  civil_status: (typeof CIVIL_STATUSES)[number];
  email: string | null;
  mobile: string | null;
  address_line: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  employment_status: string | null;
  employer_name: string | null;
  monthly_income: string | null;
  verification_status: (typeof VERIFICATION_STATUSES)[number];
  verification_notes: string | null;
  verified_by: number | null;
  verified_at: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
};

type DocumentRow = RowDataPacket & {
  id: number;
  borrower_id: number;
  document_type: (typeof DOCUMENT_TYPES)[number];
  document_number: string;
  issued_date: string | null;
  expiry_date: string | null;
  file_reference: string | null;
  verification_status: (typeof VERIFICATION_STATUSES)[number];
  notes: string | null;
  verified_by: number | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
};

function moneyValue(value: number | null | undefined): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  return centsToMoneyString(moneyToCents(value));
}

function mapBorrower(row: BorrowerRow) {
  return {
    id: row.id,
    borrowerNumber: row.borrower_number,
    firstName: row.first_name,
    middleName: row.middle_name,
    lastName: row.last_name,
    fullName: fullName(row.first_name, row.middle_name, row.last_name),
    dateOfBirth: apiDate(row.date_of_birth),
    gender: row.gender,
    civilStatus: row.civil_status,
    email: row.email,
    mobile: row.mobile,
    addressLine: row.address_line,
    city: row.city,
    province: row.province,
    postalCode: row.postal_code,
    employmentStatus: row.employment_status,
    employerName: row.employer_name,
    monthlyIncome: row.monthly_income === null ? null : Number(row.monthly_income),
    verificationStatus: row.verification_status,
    verificationNotes: row.verification_notes,
    verifiedBy: row.verified_by,
    verifiedAt: apiDateTime(row.verified_at),
    createdBy: row.created_by,
    createdAt: apiDateTime(row.created_at),
    updatedAt: apiDateTime(row.updated_at),
  };
}

function mapDocument(row: DocumentRow) {
  return {
    id: row.id,
    borrowerId: row.borrower_id,
    documentType: row.document_type,
    documentNumber: row.document_number,
    issuedDate: apiDate(row.issued_date),
    expiryDate: apiDate(row.expiry_date),
    fileReference: row.file_reference,
    verificationStatus: row.verification_status,
    notes: row.notes,
    verifiedBy: row.verified_by,
    verifiedAt: apiDateTime(row.verified_at),
    createdAt: apiDateTime(row.created_at),
    updatedAt: apiDateTime(row.updated_at),
  };
}

async function getBorrowerRow(id: number): Promise<BorrowerRow> {
  const rows = await query<BorrowerRow>('SELECT * FROM borrowers WHERE id = ?', [id]);
  const row = rows[0];
  if (!row) {
    throw new AppError(404, 'Borrower not found');
  }
  return row;
}

async function listDocuments(borrowerId: number): Promise<DocumentRow[]> {
  return query<DocumentRow>(
    'SELECT * FROM identity_documents WHERE borrower_id = ? ORDER BY id',
    [borrowerId],
  );
}

async function borrowerDetail(id: number) {
  const row = await getBorrowerRow(id);
  const documents = await listDocuments(id);
  return { ...mapBorrower(row), documents: documents.map(mapDocument) };
}

const createBorrowerSchema = z.object({
  ...borrowerFields,
  gender: z.enum(GENDERS).default('unspecified'),
  civilStatus: z.enum(CIVIL_STATUSES).default('unspecified'),
});

const patchBorrowerSchema = z
  .object(borrowerFields)
  .partial()
  .refine(hasAnyField, 'Provide at least one field to update');

const listQuerySchema = pageQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
  verificationStatus: z.enum(VERIFICATION_STATUSES).optional(),
});

const verificationSchema = z.object({
  status: z.enum(VERIFICATION_STATUSES),
  notes: z.string().trim().max(500).nullable().optional(),
});

const optionalReference = z
  .string()
  .trim()
  .max(255)
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

const createDocumentSchema = z
  .object({
    documentType: z.enum(DOCUMENT_TYPES),
    documentNumber: z.string().trim().min(1).max(64),
    issuedDate: optionalDateSchema,
    expiryDate: optionalDateSchema,
    fileReference: optionalReference,
    notes: z.string().trim().max(500).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.issuedDate && value.expiryDate && value.expiryDate < value.issuedDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expiryDate'],
        message: 'Expiry date cannot be before the issued date',
      });
    }
  });

const patchDocumentSchema = z
  .object({
    documentType: z.enum(DOCUMENT_TYPES).optional(),
    documentNumber: z.string().trim().min(1).max(64).optional(),
    issuedDate: optionalDateSchema,
    expiryDate: optionalDateSchema,
    fileReference: optionalReference,
    notes: z.string().trim().max(500).nullable().optional(),
    verificationStatus: z.enum(VERIFICATION_STATUSES).optional(),
  })
  .refine(hasAnyField, 'Provide at least one field to update');

export const borrowersRouter = Router();
borrowersRouter.use(requireAuth);

borrowersRouter.get(
  '/',
  requirePermission('borrowers.read'),
  asyncHandler(async (req, res) => {
    const filters = validate(listQuerySchema, req.query);
    const where: string[] = [];
    const params: unknown[] = [];
    if (filters.verificationStatus) {
      where.push('verification_status = ?');
      params.push(filters.verificationStatus);
    }
    if (filters.q) {
      const like = likeContains(filters.q);
      where.push(
        `(borrower_number LIKE ? ${LIKE_ESCAPE} OR first_name LIKE ? ${LIKE_ESCAPE} OR last_name LIKE ? ${LIKE_ESCAPE} OR email LIKE ? ${LIKE_ESCAPE} OR mobile LIKE ? ${LIKE_ESCAPE})`,
      );
      params.push(like, like, like, like, like);
    }
    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const totalRows = await query<RowDataPacket & { count: number }>(
      `SELECT COUNT(*) AS count FROM borrowers ${whereSql}`,
      params,
    );
    const offset = (filters.page - 1) * filters.pageSize;
    const rows = await query<BorrowerRow>(
      `SELECT * FROM borrowers ${whereSql} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...params, filters.pageSize, offset],
    );
    res.json({
      data: rows.map(mapBorrower),
      meta: pageMeta(filters.page, filters.pageSize, Number(totalRows[0]?.count ?? 0)),
    });
  }),
);

borrowersRouter.post(
  '/',
  requirePermission('borrowers.write'),
  asyncHandler(async (req, res) => {
    const body = validate(createBorrowerSchema, req.body);
    const actor = currentUser(req);
    try {
      const id = await withTransaction(async (conn) => {
        const borrowerNumber = await nextNumber(conn, 'borrower', 'BRW');
        const created = await execute(
          `INSERT INTO borrowers (
             borrower_number, first_name, middle_name, last_name, date_of_birth, gender, civil_status,
             email, mobile, address_line, city, province, postal_code, employment_status, employer_name,
             monthly_income, created_by
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            borrowerNumber,
            body.firstName,
            body.middleName ?? null,
            body.lastName,
            body.dateOfBirth ?? null,
            body.gender,
            body.civilStatus,
            body.email ?? null,
            body.mobile ?? null,
            body.addressLine ?? null,
            body.city ?? null,
            body.province ?? null,
            body.postalCode ?? null,
            body.employmentStatus ?? null,
            body.employerName ?? null,
            moneyValue(body.monthlyIncome) ?? null,
            actor.id,
          ],
          conn,
        );
        return created.insertId;
      });
      res.status(201).json({ data: await borrowerDetail(id) });
    } catch (error) {
      if (isDuplicateKey(error)) {
        throw new AppError(409, 'A borrower with this email already exists');
      }
      throw error;
    }
  }),
);

borrowersRouter.get(
  '/:id',
  requirePermission('borrowers.read'),
  asyncHandler(async (req, res) => {
    res.json({ data: await borrowerDetail(parseId(req.params.id)) });
  }),
);

borrowersRouter.patch(
  '/:id',
  requirePermission('borrowers.write'),
  asyncHandler(async (req, res) => {
    const borrowerId = parseId(req.params.id);
    const body = validate(patchBorrowerSchema, req.body);
    await getBorrowerRow(borrowerId);
    const sets: string[] = [];
    const params: unknown[] = [];
    const assign = (column: string, value: unknown) => {
      if (value !== undefined) {
        sets.push(`${column} = ?`);
        params.push(value);
      }
    };
    assign('first_name', body.firstName);
    assign('middle_name', body.middleName);
    assign('last_name', body.lastName);
    assign('date_of_birth', body.dateOfBirth);
    assign('gender', body.gender);
    assign('civil_status', body.civilStatus);
    assign('email', body.email);
    assign('mobile', body.mobile);
    assign('address_line', body.addressLine);
    assign('city', body.city);
    assign('province', body.province);
    assign('postal_code', body.postalCode);
    assign('employment_status', body.employmentStatus);
    assign('employer_name', body.employerName);
    assign('monthly_income', moneyValue(body.monthlyIncome));
    try {
      await execute(`UPDATE borrowers SET ${sets.join(', ')} WHERE id = ?`, [...params, borrowerId]);
    } catch (error) {
      if (isDuplicateKey(error)) {
        throw new AppError(409, 'A borrower with this email already exists');
      }
      throw error;
    }
    res.json({ data: await borrowerDetail(borrowerId) });
  }),
);

borrowersRouter.post(
  '/:id/verification',
  requirePermission('borrowers.verify'),
  asyncHandler(async (req, res) => {
    const borrowerId = parseId(req.params.id);
    const body = validate(verificationSchema, req.body);
    const existing = await getBorrowerRow(borrowerId);
    const notes = body.notes === undefined ? existing.verification_notes : body.notes;
    await execute(
      `UPDATE borrowers
       SET verification_status = ?, verification_notes = ?, verified_by = ?, verified_at = ?
       WHERE id = ?`,
      [body.status, notes, currentUser(req).id, nowSql(), borrowerId],
    );
    res.json({ data: await borrowerDetail(borrowerId) });
  }),
);

borrowersRouter.post(
  '/:id/documents',
  requirePermission('borrowers.write'),
  asyncHandler(async (req, res) => {
    const borrowerId = parseId(req.params.id);
    const body = validate(createDocumentSchema, req.body);
    await getBorrowerRow(borrowerId);
    try {
      await execute(
        `INSERT INTO identity_documents (
           borrower_id, document_type, document_number, issued_date, expiry_date, file_reference, notes
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          borrowerId,
          body.documentType,
          body.documentNumber,
          body.issuedDate ?? null,
          body.expiryDate ?? null,
          body.fileReference ?? null,
          body.notes ?? null,
        ],
      );
    } catch (error) {
      if (isDuplicateKey(error)) {
        throw new AppError(409, 'This identity document is already recorded');
      }
      throw error;
    }
    res.status(201).json({ data: await borrowerDetail(borrowerId) });
  }),
);

borrowersRouter.patch(
  '/:id/documents/:documentId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const borrowerId = parseId(req.params.id);
    const documentId = parseId(req.params.documentId, 'document id');
    const body = validate(patchDocumentSchema, req.body);
    const user = currentUser(req);
    const profileFields = ['documentType', 'documentNumber', 'issuedDate', 'expiryDate', 'fileReference', 'notes'] as const;
    const changesProfile = profileFields.some((field) => body[field] !== undefined);
    if (changesProfile && !user.permissions.includes('borrowers.write')) {
      throw new AppError(403, 'You do not have permission to perform this action');
    }
    if (body.verificationStatus !== undefined && !user.permissions.includes('borrowers.verify')) {
      throw new AppError(403, 'You do not have permission to perform this action');
    }

    const documents = await query<DocumentRow>(
      'SELECT * FROM identity_documents WHERE id = ? AND borrower_id = ?',
      [documentId, borrowerId],
    );
    const document = documents[0];
    if (!document) {
      throw new AppError(404, 'Identity document not found');
    }

    const issuedDate = body.issuedDate === undefined ? apiDate(document.issued_date) : body.issuedDate;
    const expiryDate = body.expiryDate === undefined ? apiDate(document.expiry_date) : body.expiryDate;
    if (issuedDate && expiryDate && expiryDate < issuedDate) {
      throw new AppError(400, 'Expiry date cannot be before the issued date');
    }

    const sets: string[] = [];
    const params: unknown[] = [];
    const assign = (column: string, value: unknown) => {
      if (value !== undefined) {
        sets.push(`${column} = ?`);
        params.push(value);
      }
    };
    assign('document_type', body.documentType);
    assign('document_number', body.documentNumber);
    assign('issued_date', body.issuedDate);
    assign('expiry_date', body.expiryDate);
    assign('file_reference', body.fileReference);
    assign('notes', body.notes);
    if (body.verificationStatus !== undefined) {
      assign('verification_status', body.verificationStatus);
      assign('verified_by', user.id);
      assign('verified_at', nowSql());
    }

    try {
      await execute(`UPDATE identity_documents SET ${sets.join(', ')} WHERE id = ?`, [...params, documentId]);
    } catch (error) {
      if (isDuplicateKey(error)) {
        throw new AppError(409, 'This identity document is already recorded');
      }
      throw error;
    }
    res.json({ data: await borrowerDetail(borrowerId) });
  }),
);
