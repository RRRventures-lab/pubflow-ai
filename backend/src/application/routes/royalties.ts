// ============================================================================
// PubFlow AI - Royalties Routes
// Statement upload, matching, and distribution
// ============================================================================

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { tenantQuery } from '../../infrastructure/database/pool.js';
import { requireTenant } from '../middleware/tenant.js';
import { NotFoundError } from '../middleware/error.js';
import type { RoyaltyStatement, RoyaltyStatementLine } from '../../shared/types/index.js';

export async function royaltyRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /royalties/statements
   * List royalty statements
   */
  app.get('/statements', async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = requireTenant(request);

    const result = await tenantQuery<RoyaltyStatement>(
      ctx,
      `SELECT * FROM royalty_statements ORDER BY uploaded_at DESC LIMIT 100`
    );

    return { data: result.rows };
  });

  /**
   * POST /royalties/statements
   * Upload new royalty statement (CSV/XLSX)
   */
  app.post('/statements', async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = requireTenant(request);

    // TODO: Implement file upload and parsing in Phase 3
    return { message: 'Statement upload not yet implemented' };
  });

  /**
   * GET /royalties/statements/:id
   * Get statement details with lines
   */
  app.get('/statements/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const ctx = requireTenant(request);
    const { id } = request.params;

    const result = await tenantQuery<RoyaltyStatement>(
      ctx,
      'SELECT * FROM royalty_statements WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      throw NotFoundError('Statement', id);
    }

    return result.rows[0];
  });

  /**
   * GET /royalties/statements/:id/lines
   * Get statement lines with pagination
   */
  app.get('/statements/:id/lines', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const ctx = requireTenant(request);
    const { id } = request.params;
    const { page = 1, pageSize = 50, status } = request.query as any;

    const offset = (page - 1) * pageSize;
    let whereClause = 'WHERE statement_id = $1';
    const params: unknown[] = [id];

    if (status) {
      whereClause += ' AND match_status = $2';
      params.push(status);
    }

    const result = await tenantQuery<RoyaltyStatementLine>(
      ctx,
      `SELECT * FROM royalty_statement_lines
       ${whereClause}
       ORDER BY line_number
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset]
    );

    return { data: result.rows };
  });

  /**
   * GET /royalties/matching-queue
   * Get lines requiring human review
   */
  app.get('/matching-queue', async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = requireTenant(request);

    const result = await tenantQuery<RoyaltyStatementLine>(
      ctx,
      `SELECT rsl.*, rs.source_type, rs.period
       FROM royalty_statement_lines rsl
       JOIN royalty_statements rs ON rsl.statement_id = rs.id
       WHERE rsl.match_status IN ('UNMATCHED', 'AI_MATCHED')
         AND rsl.match_confidence < 0.95
       ORDER BY rsl.amount DESC
       LIMIT 100`
    );

    return { data: result.rows };
  });

  /**
   * POST /royalties/statements/:statementId/lines/:lineId/match
   * Manually match a statement line to a work
   */
  app.post('/statements/:statementId/lines/:lineId/match', async (
    request: FastifyRequest<{ Params: { statementId: string; lineId: string } }>,
    reply: FastifyReply
  ) => {
    const ctx = requireTenant(request);
    const { lineId } = request.params;
    const { workId } = z.object({ workId: z.string().uuid() }).parse(request.body);

    await tenantQuery(
      ctx,
      `UPDATE royalty_statement_lines
       SET matched_work_id = $1,
           match_status = 'HUMAN_MATCHED',
           match_confidence = 1.0,
           match_method = 'MANUAL',
           reviewed_by = $2,
           reviewed_at = NOW()
       WHERE id = $3`,
      [workId, ctx.userId, lineId]
    );

    return { success: true };
  });

  /**
   * POST /royalties/statements/:id/process
   * Trigger matching pipeline for statement
   */
  app.post('/statements/:id/process', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const ctx = requireTenant(request);
    const { id } = request.params;

    // TODO: Queue matching pipeline in Phase 3/4
    await tenantQuery(
      ctx,
      `UPDATE royalty_statements SET status = 'PROCESSING' WHERE id = $1`,
      [id]
    );

    return { message: 'Processing queued', statementId: id };
  });

  /**
   * GET /royalties/distributions
   * Get calculated distributions
   */
  app.get('/distributions', async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = requireTenant(request);
    const { statementId, writerId, status } = request.query as any;

    let whereClause = '';
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (statementId) {
      conditions.push(`statement_id = $${params.length + 1}`);
      params.push(statementId);
    }

    if (writerId) {
      conditions.push(`writer_id = $${params.length + 1}`);
      params.push(writerId);
    }

    if (status) {
      conditions.push(`status = $${params.length + 1}`);
      params.push(status);
    }

    if (conditions.length > 0) {
      whereClause = `WHERE ${conditions.join(' AND ')}`;
    }

    const result = await tenantQuery(
      ctx,
      `SELECT * FROM royalty_distributions ${whereClause} ORDER BY created_at DESC LIMIT 500`,
      params
    );

    return { data: result.rows };
  });
}
