// ============================================================================
// PubFlow AI - Writers Routes
// CRUD operations for songwriters
// ============================================================================

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { tenantQuery } from '../../infrastructure/database/pool.js';
import { requireTenant } from '../middleware/tenant.js';
import { NotFoundError, BadRequestError } from '../middleware/error.js';
import { validateIPI, validateIPIBase, validateSocietyCode } from '../../shared/validators/index.js';
import type { Writer, PaginatedResponse } from '../../shared/types/index.js';

// --------------------------------------------------------------------------
// Schemas
// --------------------------------------------------------------------------

const CreateWriterSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  ipiNameNumber: z.string().optional(),
  ipiBaseNumber: z.string().optional(),
  prSociety: z.string().max(10).optional(),
  mrSociety: z.string().max(10).optional(),
  srSociety: z.string().max(10).optional(),
  publisherCode: z.string().max(10).optional(),
  isControlled: z.boolean().default(false),
});

const UpdateWriterSchema = CreateWriterSchema.partial();

const WriterQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  isControlled: z.coerce.boolean().optional(),
  society: z.string().optional(),
  sortBy: z.enum(['lastName', 'firstName', 'createdAt']).default('lastName'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

// --------------------------------------------------------------------------
// Routes
// --------------------------------------------------------------------------

export async function writerRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /writers
   * List writers with pagination and filtering
   */
  app.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = requireTenant(request);
    const query = WriterQuerySchema.parse(request.query);

    const offset = (query.page - 1) * query.pageSize;
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (query.search) {
      conditions.push(`(
        first_name ILIKE $${paramIndex} OR
        last_name ILIKE $${paramIndex} OR
        ipi_name_number = $${paramIndex + 1}
      )`);
      params.push(`%${query.search}%`, query.search.replace(/\D/g, ''));
      paramIndex += 2;
    }

    if (query.isControlled !== undefined) {
      conditions.push(`is_controlled = $${paramIndex}`);
      params.push(query.isControlled);
      paramIndex++;
    }

    if (query.society) {
      conditions.push(`(pr_society = $${paramIndex} OR mr_society = $${paramIndex} OR sr_society = $${paramIndex})`);
      params.push(query.society.toUpperCase());
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await tenantQuery<{ count: string }>(
      ctx,
      `SELECT COUNT(*) as count FROM writers ${whereClause}`,
      params
    );
    const totalCount = parseInt(countResult.rows[0].count, 10);

    const sortColumn = query.sortBy === 'lastName' ? 'last_name' : query.sortBy === 'firstName' ? 'first_name' : 'created_at';

    const writersResult = await tenantQuery<Writer>(
      ctx,
      `SELECT * FROM writers
       ${whereClause}
       ORDER BY ${sortColumn} ${query.sortOrder}
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, query.pageSize, offset]
    );

    const response: PaginatedResponse<Writer> = {
      data: writersResult.rows,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / query.pageSize),
        hasNextPage: query.page * query.pageSize < totalCount,
        hasPrevPage: query.page > 1,
      },
    };

    return response;
  });

  /**
   * GET /writers/:id
   * Get single writer with works
   */
  app.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const ctx = requireTenant(request);
    const { id } = request.params;

    const writerResult = await tenantQuery<Writer>(
      ctx,
      'SELECT * FROM writers WHERE id = $1',
      [id]
    );

    if (writerResult.rows.length === 0) {
      throw NotFoundError('Writer', id);
    }

    // Get works for this writer
    const worksResult = await tenantQuery<{ id: string; title: string; role: string; share: number }>(
      ctx,
      `SELECT w.id, w.title, wiw.role, wiw.share
       FROM works w
       JOIN writers_in_works wiw ON w.id = wiw.work_id
       WHERE wiw.writer_id = $1
       ORDER BY w.title`,
      [id]
    );

    return {
      ...writerResult.rows[0],
      works: worksResult.rows,
      workCount: worksResult.rows.length,
    };
  });

  /**
   * POST /writers
   * Create new writer
   */
  app.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = requireTenant(request);
    const body = CreateWriterSchema.parse(request.body);

    // Validate IPI if provided
    if (body.ipiNameNumber) {
      const ipiValidation = validateIPI(body.ipiNameNumber);
      if (!ipiValidation.isValid) {
        throw BadRequestError(ipiValidation.errors?.join(', ') || 'Invalid IPI Name Number');
      }
      body.ipiNameNumber = ipiValidation.normalizedValue;
    }

    if (body.ipiBaseNumber) {
      const ipiBaseValidation = validateIPIBase(body.ipiBaseNumber);
      if (!ipiBaseValidation.isValid) {
        throw BadRequestError(ipiBaseValidation.errors?.join(', ') || 'Invalid IPI Base Number');
      }
      body.ipiBaseNumber = ipiBaseValidation.normalizedValue;
    }

    // Validate society codes
    for (const field of ['prSociety', 'mrSociety', 'srSociety'] as const) {
      if (body[field]) {
        const validation = validateSocietyCode(body[field]);
        if (!validation.isValid) {
          throw BadRequestError(`Invalid ${field}: ${validation.errors?.join(', ')}`);
        }
      }
    }

    const result = await tenantQuery<Writer>(
      ctx,
      `INSERT INTO writers (
        first_name, last_name, ipi_name_number, ipi_base_number,
        pr_society, mr_society, sr_society, publisher_code, is_controlled
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        body.firstName,
        body.lastName,
        body.ipiNameNumber,
        body.ipiBaseNumber,
        body.prSociety?.toUpperCase(),
        body.mrSociety?.toUpperCase(),
        body.srSociety?.toUpperCase(),
        body.publisherCode,
        body.isControlled,
      ]
    );

    return reply.status(201).send(result.rows[0]);
  });

  /**
   * PATCH /writers/:id
   * Update writer
   */
  app.patch('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const ctx = requireTenant(request);
    const { id } = request.params;
    const body = UpdateWriterSchema.parse(request.body);

    const existingResult = await tenantQuery(ctx, 'SELECT id FROM writers WHERE id = $1', [id]);
    if (existingResult.rows.length === 0) {
      throw NotFoundError('Writer', id);
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    const fieldMappings: Record<string, string> = {
      firstName: 'first_name',
      lastName: 'last_name',
      ipiNameNumber: 'ipi_name_number',
      ipiBaseNumber: 'ipi_base_number',
      prSociety: 'pr_society',
      mrSociety: 'mr_society',
      srSociety: 'sr_society',
      publisherCode: 'publisher_code',
      isControlled: 'is_controlled',
    };

    for (const [key, column] of Object.entries(fieldMappings)) {
      const value = body[key as keyof typeof body];
      if (value !== undefined) {
        updates.push(`${column} = $${paramIndex++}`);
        values.push(value);
      }
    }

    if (updates.length === 0) {
      throw BadRequestError('No fields to update');
    }

    values.push(id);

    const result = await tenantQuery<Writer>(
      ctx,
      `UPDATE writers SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    return result.rows[0];
  });

  /**
   * DELETE /writers/:id
   * Delete writer (will fail if writer has works)
   */
  app.delete('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const ctx = requireTenant(request);
    const { id } = request.params;

    try {
      const result = await tenantQuery(ctx, 'DELETE FROM writers WHERE id = $1', [id]);

      if (result.rowCount === 0) {
        throw NotFoundError('Writer', id);
      }

      return reply.status(204).send();
    } catch (error: any) {
      if (error.code === '23503') { // Foreign key violation
        throw BadRequestError('Cannot delete writer with associated works');
      }
      throw error;
    }
  });
}
