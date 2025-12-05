// ============================================================================
// PubFlow AI - Works Routes
// CRUD operations for musical works
// ============================================================================

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { tenantQuery, tenantTransaction } from '../../infrastructure/database/pool.js';
import { requireTenant } from '../middleware/tenant.js';
import { NotFoundError, BadRequestError } from '../middleware/error.js';
import {
  validateISWC,
  validateCWRString,
  validateShare,
  validateSharesTotal,
} from '../../shared/validators/index.js';
import type { Work, WriterInWork, AlternateTitle, PaginatedResponse } from '../../shared/types/index.js';

// --------------------------------------------------------------------------
// Schemas
// --------------------------------------------------------------------------

const CreateWorkSchema = z.object({
  title: z.string().min(1).max(600),
  iswc: z.string().optional(),
  workCode: z.string().min(1).max(50),
  workType: z.enum(['ORI', 'MOD', 'ARR', 'TRA', 'JAZ', 'MED', 'POT', 'UNS']).default('ORI'),
  versionType: z.enum(['ORI', 'MOD']).default('ORI'),
  duration: z.number().int().positive().optional(),
  language: z.string().length(3).optional(),
  originalTitle: z.string().max(600).optional(),
  alternateTitles: z.array(z.object({
    title: z.string().min(1).max(600),
    titleType: z.enum(['AT', 'TE', 'FT', 'IT', 'OT', 'TT', 'PT', 'RT', 'ET', 'OL', 'AL']).default('AT'),
    language: z.string().length(3).optional(),
  })).optional(),
  writers: z.array(z.object({
    writerId: z.string().uuid(),
    role: z.enum(['C', 'A', 'CA', 'AR', 'AD', 'TR', 'SA', 'SR']),
    share: z.number().min(0).max(100),
    isControlled: z.boolean().default(false),
    publisherId: z.string().uuid().optional(),
    prShare: z.number().min(0).max(100).optional(),
    mrShare: z.number().min(0).max(100).optional(),
    srShare: z.number().min(0).max(100).optional(),
  })).min(1),
});

const UpdateWorkSchema = CreateWorkSchema.partial().omit({ workCode: true, writers: true });

const WorkQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  iswc: z.string().optional(),
  hasIswc: z.coerce.boolean().optional(),
  sortBy: z.enum(['title', 'workCode', 'createdAt', 'updatedAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// --------------------------------------------------------------------------
// Routes
// --------------------------------------------------------------------------

export async function workRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /works
   * List works with pagination and filtering
   */
  app.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = requireTenant(request);
    const query = WorkQuerySchema.parse(request.query);

    const offset = (query.page - 1) * query.pageSize;

    // Build WHERE clause
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (query.search) {
      conditions.push(`(
        title ILIKE $${paramIndex} OR
        work_code ILIKE $${paramIndex} OR
        iswc = $${paramIndex + 1}
      )`);
      params.push(`%${query.search}%`, query.search.toUpperCase());
      paramIndex += 2;
    }

    if (query.iswc) {
      conditions.push(`iswc = $${paramIndex}`);
      params.push(query.iswc.toUpperCase());
      paramIndex++;
    }

    if (query.hasIswc !== undefined) {
      conditions.push(query.hasIswc ? 'iswc IS NOT NULL' : 'iswc IS NULL');
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countResult = await tenantQuery<{ count: string }>(
      ctx,
      `SELECT COUNT(*) as count FROM works ${whereClause}`,
      params
    );
    const totalCount = parseInt(countResult.rows[0].count, 10);

    // Get works
    const worksResult = await tenantQuery<Work>(
      ctx,
      `SELECT * FROM works
       ${whereClause}
       ORDER BY ${query.sortBy} ${query.sortOrder}
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, query.pageSize, offset]
    );

    const response: PaginatedResponse<Work> = {
      data: worksResult.rows,
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
   * GET /works/:id
   * Get single work with writers and alternate titles
   */
  app.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const ctx = requireTenant(request);
    const { id } = request.params;

    const workResult = await tenantQuery<Work>(
      ctx,
      'SELECT * FROM works WHERE id = $1',
      [id]
    );

    if (workResult.rows.length === 0) {
      throw NotFoundError('Work', id);
    }

    const work = workResult.rows[0];

    // Get writers in work
    const writersResult = await tenantQuery<WriterInWork & { firstName: string; lastName: string; ipiNameNumber: string }>(
      ctx,
      `SELECT wiw.*, w.first_name, w.last_name, w.ipi_name_number
       FROM writers_in_works wiw
       JOIN writers w ON wiw.writer_id = w.id
       WHERE wiw.work_id = $1
       ORDER BY wiw.share DESC`,
      [id]
    );

    // Get alternate titles
    const titlesResult = await tenantQuery<AlternateTitle>(
      ctx,
      'SELECT * FROM alternate_titles WHERE work_id = $1 ORDER BY created_at',
      [id]
    );

    return {
      ...work,
      writers: writersResult.rows,
      alternateTitles: titlesResult.rows,
    };
  });

  /**
   * POST /works
   * Create new work with writers
   */
  app.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = requireTenant(request);
    const body = CreateWorkSchema.parse(request.body);

    // Validate ISWC if provided
    if (body.iswc) {
      const iswcValidation = validateISWC(body.iswc);
      if (!iswcValidation.isValid) {
        throw BadRequestError(iswcValidation.errors?.join(', ') || 'Invalid ISWC');
      }
      body.iswc = iswcValidation.normalizedValue;
    }

    // Validate title for CWR compatibility
    const titleValidation = validateCWRString(body.title, 'Title', 600);
    if (!titleValidation.isValid) {
      throw BadRequestError(titleValidation.errors?.join(', ') || 'Invalid title');
    }

    // Validate writer shares total 100%
    const shares = body.writers.map(w => w.share);
    const sharesValidation = validateSharesTotal(shares);
    if (!sharesValidation.isValid) {
      throw BadRequestError(sharesValidation.errors?.join(', ') || 'Invalid shares');
    }

    // Create work in transaction
    const work = await tenantTransaction(ctx, async (client) => {
      // Insert work
      const workResult = await client.query<Work>(
        `INSERT INTO works (
          title, iswc, work_code, work_type, version_type,
          duration, language, original_title
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`,
        [
          titleValidation.normalizedValue,
          body.iswc,
          body.workCode,
          body.workType,
          body.versionType,
          body.duration,
          body.language,
          body.originalTitle,
        ]
      );

      const newWork = workResult.rows[0];

      // Insert writers
      for (const writer of body.writers) {
        await client.query(
          `INSERT INTO writers_in_works (
            work_id, writer_id, role, share, is_controlled,
            publisher_id, pr_share, mr_share, sr_share
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            newWork.id,
            writer.writerId,
            writer.role,
            writer.share,
            writer.isControlled,
            writer.publisherId,
            writer.prShare,
            writer.mrShare,
            writer.srShare,
          ]
        );
      }

      // Insert alternate titles
      if (body.alternateTitles) {
        for (const altTitle of body.alternateTitles) {
          const altTitleValidation = validateCWRString(altTitle.title, 'Alternate Title', 600);
          await client.query(
            `INSERT INTO alternate_titles (work_id, title, title_type, language)
             VALUES ($1, $2, $3, $4)`,
            [newWork.id, altTitleValidation.normalizedValue, altTitle.titleType, altTitle.language]
          );
        }
      }

      // Calculate ownership percentages
      const controlledWriters = body.writers.filter(w => w.isControlled);
      const prOwnership = controlledWriters.reduce((sum, w) => sum + (w.prShare || w.share), 0);
      const mrOwnership = controlledWriters.reduce((sum, w) => sum + (w.mrShare || w.share), 0);
      const srOwnership = controlledWriters.reduce((sum, w) => sum + (w.srShare || w.share), 0);

      await client.query(
        `UPDATE works SET pr_ownership = $1, mr_ownership = $2, sr_ownership = $3 WHERE id = $4`,
        [prOwnership, mrOwnership, srOwnership, newWork.id]
      );

      return { ...newWork, prOwnership, mrOwnership, srOwnership };
    });

    return reply.status(201).send(work);
  });

  /**
   * PATCH /works/:id
   * Update work (not writers - use separate endpoints)
   */
  app.patch('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const ctx = requireTenant(request);
    const { id } = request.params;
    const body = UpdateWorkSchema.parse(request.body);

    // Check work exists
    const existingResult = await tenantQuery<Work>(ctx, 'SELECT id FROM works WHERE id = $1', [id]);
    if (existingResult.rows.length === 0) {
      throw NotFoundError('Work', id);
    }

    // Build update query
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (body.title !== undefined) {
      const titleValidation = validateCWRString(body.title, 'Title', 600);
      updates.push(`title = $${paramIndex++}`);
      values.push(titleValidation.normalizedValue);
    }

    if (body.iswc !== undefined) {
      const iswcValidation = validateISWC(body.iswc);
      if (body.iswc && !iswcValidation.isValid) {
        throw BadRequestError(iswcValidation.errors?.join(', ') || 'Invalid ISWC');
      }
      updates.push(`iswc = $${paramIndex++}`);
      values.push(iswcValidation.normalizedValue || null);
    }

    if (body.workType !== undefined) {
      updates.push(`work_type = $${paramIndex++}`);
      values.push(body.workType);
    }

    if (body.versionType !== undefined) {
      updates.push(`version_type = $${paramIndex++}`);
      values.push(body.versionType);
    }

    if (body.duration !== undefined) {
      updates.push(`duration = $${paramIndex++}`);
      values.push(body.duration);
    }

    if (body.language !== undefined) {
      updates.push(`language = $${paramIndex++}`);
      values.push(body.language);
    }

    if (body.originalTitle !== undefined) {
      updates.push(`original_title = $${paramIndex++}`);
      values.push(body.originalTitle);
    }

    if (updates.length === 0) {
      throw BadRequestError('No fields to update');
    }

    values.push(id);

    const result = await tenantQuery<Work>(
      ctx,
      `UPDATE works SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    return result.rows[0];
  });

  /**
   * DELETE /works/:id
   * Soft delete or hard delete work
   */
  app.delete('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const ctx = requireTenant(request);
    const { id } = request.params;

    const result = await tenantQuery(ctx, 'DELETE FROM works WHERE id = $1', [id]);

    if (result.rowCount === 0) {
      throw NotFoundError('Work', id);
    }

    return reply.status(204).send();
  });

  /**
   * POST /works/:id/writers
   * Add writer to work
   */
  app.post('/:id/writers', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const ctx = requireTenant(request);
    const { id } = request.params;
    const body = z.object({
      writerId: z.string().uuid(),
      role: z.enum(['C', 'A', 'CA', 'AR', 'AD', 'TR', 'SA', 'SR']),
      share: z.number().min(0).max(100),
      isControlled: z.boolean().default(false),
      publisherId: z.string().uuid().optional(),
    }).parse(request.body);

    // Verify work exists
    const workResult = await tenantQuery(ctx, 'SELECT id FROM works WHERE id = $1', [id]);
    if (workResult.rows.length === 0) {
      throw NotFoundError('Work', id);
    }

    const result = await tenantQuery<WriterInWork>(
      ctx,
      `INSERT INTO writers_in_works (work_id, writer_id, role, share, is_controlled, publisher_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [id, body.writerId, body.role, body.share, body.isControlled, body.publisherId]
    );

    return reply.status(201).send(result.rows[0]);
  });

  /**
   * DELETE /works/:id/writers/:writerId
   * Remove writer from work
   */
  app.delete('/:id/writers/:writerInWorkId', async (
    request: FastifyRequest<{ Params: { id: string; writerInWorkId: string } }>,
    reply: FastifyReply
  ) => {
    const ctx = requireTenant(request);
    const { id, writerInWorkId } = request.params;

    const result = await tenantQuery(
      ctx,
      'DELETE FROM writers_in_works WHERE id = $1 AND work_id = $2',
      [writerInWorkId, id]
    );

    if (result.rowCount === 0) {
      throw NotFoundError('Writer in Work', writerInWorkId);
    }

    return reply.status(204).send();
  });

  /**
   * GET /works/:id/cwr-preview
   * Preview CWR records for this work
   */
  app.get('/:id/cwr-preview', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const ctx = requireTenant(request);
    const { id } = request.params;

    // This would call the CWR generator service
    // For now, return placeholder
    return {
      workId: id,
      message: 'CWR preview not yet implemented',
      records: [],
    };
  });
}
