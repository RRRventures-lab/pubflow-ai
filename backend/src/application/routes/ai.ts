// ============================================================================
// PubFlow AI - AI Routes
// Enrichment, matching, conflict detection with real AI agents
// ============================================================================

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { tenantQuery } from '../../infrastructure/database/pool.js';
import { requireTenant } from '../middleware/tenant.js';
import { NotFoundError } from '../middleware/error.js';
import {
  getAIOrchestrator,
  getEmbeddingService,
  getEnrichmentAgent,
  getMatchingAgent,
  getConflictAgent,
  type AIContext,
  type EnrichmentRequest,
  type MatchingRequest,
  type ConflictCheckRequest,
} from '../../domain/ai/index.js';
import type { AITask, EnrichmentProposal, ConflictRecord } from '../../shared/types/index.js';

// Helper to create AI context from request
function createAIContext(request: FastifyRequest): AIContext {
  const ctx = requireTenant(request);
  return {
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    requestId: (request.id as string) || crypto.randomUUID(),
    trace: [],
  };
}

export async function aiRoutes(app: FastifyInstance): Promise<void> {
  // Get singleton instances
  const orchestrator = getAIOrchestrator();
  const embeddingService = getEmbeddingService();
  const enrichmentAgent = getEnrichmentAgent();
  const matchingAgent = getMatchingAgent();
  const conflictAgent = getConflictAgent();

  // ============================================================================
  // AI ORCHESTRATION ROUTES
  // ============================================================================

  /**
   * POST /ai/process
   * Full AI processing pipeline for a work
   */
  app.post('/process', async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = createAIContext(request);
    const body = z.object({
      workId: z.string().uuid(),
      operations: z.array(z.enum(['enrich', 'match', 'conflicts'])).default(['enrich', 'conflicts']),
    }).parse(request.body);

    const result = await orchestrator.process(ctx, {
      workId: body.workId,
      operations: body.operations,
    });

    if (!result.success) {
      return reply.status(500).send({ error: result.error });
    }

    return {
      success: true,
      data: result.data,
      trace: ctx.trace,
    };
  });

  /**
   * POST /ai/batch
   * Batch process multiple works
   */
  app.post('/batch', async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = createAIContext(request);
    const body = z.object({
      workIds: z.array(z.string().uuid()).min(1).max(100),
      operations: z.array(z.enum(['enrich', 'match', 'conflicts'])).default(['conflicts']),
    }).parse(request.body);

    const results = await orchestrator.batchProcess(ctx, body.workIds, body.operations);

    return {
      success: true,
      total: body.workIds.length,
      processed: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results,
    };
  });

  /**
   * GET /ai/stats
   * Get AI statistics for tenant
   */
  app.get('/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = requireTenant(request);
    const stats = await orchestrator.getAIStats(ctx.tenantId);
    return { data: stats };
  });

  // ============================================================================
  // AI TASK ROUTES
  // ============================================================================

  /**
   * GET /ai/tasks
   * List AI tasks
   */
  app.get('/tasks', async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = requireTenant(request);
    const { status, taskType, limit = 100 } = request.query as any;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (status) {
      conditions.push(`status = $${params.length + 1}`);
      params.push(status);
    }

    if (taskType) {
      conditions.push(`task_type = $${params.length + 1}`);
      params.push(taskType);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await tenantQuery<AITask>(
      ctx,
      `SELECT * FROM ai_tasks ${whereClause} ORDER BY created_at DESC LIMIT $${params.length + 1}`,
      [...params, Math.min(limit, 500)]
    );

    return { data: result.rows };
  });

  /**
   * GET /ai/tasks/:id
   * Get single AI task with details
   */
  app.get('/tasks/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const ctx = requireTenant(request);
    const { id } = request.params;

    const result = await tenantQuery<AITask>(
      ctx,
      'SELECT * FROM ai_tasks WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      throw NotFoundError('AI Task', id);
    }

    return { data: result.rows[0] };
  });

  // ============================================================================
  // EMBEDDING ROUTES
  // ============================================================================

  /**
   * POST /ai/embed/work/:workId
   * Generate/refresh embedding for a work
   */
  app.post('/embed/work/:workId', async (
    request: FastifyRequest<{ Params: { workId: string } }>,
    reply: FastifyReply
  ) => {
    const ctx = createAIContext(request);
    const { workId } = request.params;

    // Get work data
    const workResult = await tenantQuery(
      ctx,
      `SELECT w.id, w.title,
              array_agg(json_build_object('name', wr.name, 'ipi', wr.ipi_name_number)) as writers
       FROM works w
       LEFT JOIN writers_in_work wiw ON w.id = wiw.work_id
       LEFT JOIN writers wr ON wiw.writer_id = wr.id
       WHERE w.id = $1
       GROUP BY w.id`,
      [workId]
    );

    if (workResult.rows.length === 0) {
      throw NotFoundError('Work', workId);
    }

    const work = workResult.rows[0];
    const embedding = await embeddingService.embedWork({
      id: work.id,
      title: work.title,
      writers: work.writers?.filter((w: any) => w.name) || [],
    });

    // Store embedding
    await tenantQuery(
      ctx,
      `INSERT INTO work_embeddings (work_id, title_embedding, writer_embedding, combined_embedding, model_version)
       VALUES ($1, $2, $3, $4, 'text-embedding-3-small')
       ON CONFLICT (work_id) DO UPDATE SET
         title_embedding = EXCLUDED.title_embedding,
         writer_embedding = EXCLUDED.writer_embedding,
         combined_embedding = EXCLUDED.combined_embedding,
         updated_at = NOW()`,
      [workId, JSON.stringify(embedding.titleEmbedding), JSON.stringify(embedding.writerEmbedding), JSON.stringify(embedding.combinedEmbedding)]
    );

    return reply.status(201).send({
      success: true,
      workId,
      dimensions: embedding.titleEmbedding.length,
    });
  });

  /**
   * POST /ai/search/semantic
   * Vector similarity search using embeddings
   */
  app.post('/search/semantic', async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = createAIContext(request);
    const body = z.object({
      query: z.string().min(1),
      limit: z.number().int().min(1).max(50).default(10),
      threshold: z.number().min(0).max(1).default(0.7),
    }).parse(request.body);

    // Generate embedding for query
    const queryEmbedding = await embeddingService.generateEmbedding(body.query);

    // Search similar works
    const results = await embeddingService.searchSimilarWorks(ctx.tenantId, queryEmbedding, {
      limit: body.limit,
      threshold: body.threshold,
    });

    return {
      data: results,
      query: body.query,
      method: 'vector_search',
    };
  });

  /**
   * POST /ai/search
   * Hybrid search (text + vector)
   */
  app.post('/search', async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = requireTenant(request);
    const body = z.object({
      query: z.string().min(1),
      entityType: z.enum(['WORK', 'RECORDING']).default('WORK'),
      limit: z.number().int().min(1).max(50).default(10),
      useVectors: z.boolean().default(true),
    }).parse(request.body);

    if (body.entityType === 'WORK') {
      // Text search first
      const textResult = await tenantQuery(
        ctx,
        `SELECT id, title, iswc, work_code,
                ts_rank(to_tsvector('english', title), plainto_tsquery('english', $1)) as text_rank
         FROM works
         WHERE to_tsvector('english', title) @@ plainto_tsquery('english', $1)
         ORDER BY text_rank DESC
         LIMIT $2`,
        [body.query, body.limit]
      );

      // If vectors enabled, also do semantic search
      let vectorResults: any[] = [];
      if (body.useVectors) {
        try {
          const queryEmbedding = await embeddingService.generateEmbedding(body.query);
          vectorResults = await embeddingService.searchSimilarWorks(ctx.tenantId, queryEmbedding, {
            limit: body.limit,
            threshold: 0.6,
          });
        } catch (e) {
          // Vector search failed, continue with text results
        }
      }

      // Merge and deduplicate results
      const seen = new Set<string>();
      const merged = [];

      for (const r of textResult.rows) {
        if (!seen.has(r.id)) {
          seen.add(r.id);
          merged.push({ ...r, source: 'text', score: r.text_rank });
        }
      }

      for (const r of vectorResults) {
        if (!seen.has(r.workId)) {
          seen.add(r.workId);
          merged.push({ id: r.workId, title: r.title, iswc: r.iswc, source: 'vector', score: r.similarity });
        }
      }

      return { data: merged.slice(0, body.limit), method: 'hybrid_search' };
    }

    return { data: [], method: 'hybrid_search' };
  });

  // ============================================================================
  // ENRICHMENT ROUTES
  // ============================================================================

  /**
   * POST /ai/enrich/:workId
   * Trigger enrichment for a work
   */
  app.post('/enrich/:workId', async (
    request: FastifyRequest<{ Params: { workId: string } }>,
    reply: FastifyReply
  ) => {
    const ctx = createAIContext(request);
    const { workId } = request.params;
    const body = z.object({
      sources: z.array(z.enum(['musicbrainz', 'discogs', 'ascap', 'bmi'])).default(['musicbrainz', 'discogs']),
      autoApply: z.boolean().default(false),
    }).parse(request.body || {});

    // Get work data
    const workResult = await tenantQuery(
      ctx,
      `SELECT w.*, array_agg(wr.name) as writer_names
       FROM works w
       LEFT JOIN writers_in_work wiw ON w.id = wiw.work_id
       LEFT JOIN writers wr ON wiw.writer_id = wr.id
       WHERE w.id = $1
       GROUP BY w.id`,
      [workId]
    );

    if (workResult.rows.length === 0) {
      throw NotFoundError('Work', workId);
    }

    const work = workResult.rows[0];

    // Run enrichment
    const result = await enrichmentAgent.enrichWork(ctx, {
      workId,
      title: work.title,
      writers: work.writer_names?.filter(Boolean) || [],
      existingIswc: work.iswc,
      existingIsrc: undefined,
      sources: body.sources,
      autoApply: body.autoApply,
    });

    // Store proposals in database
    for (const proposal of result.proposals) {
      await tenantQuery(
        ctx,
        `INSERT INTO enrichment_proposals
         (work_id, field_name, current_value, proposed_value, source, confidence, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          workId,
          proposal.field,
          proposal.currentValue,
          proposal.proposedValue,
          proposal.source,
          proposal.confidence,
          proposal.confidence >= 0.95 && body.autoApply ? 'APPROVED' : 'PENDING',
        ]
      );
    }

    // Create AI task record
    await tenantQuery<AITask>(
      ctx,
      `INSERT INTO ai_tasks (task_type, entity_type, entity_id, status, result)
       VALUES ('ENRICHMENT', 'WORK', $1, 'COMPLETED', $2)`,
      [workId, JSON.stringify({ proposalCount: result.proposals.length, applied: result.applied })]
    );

    return reply.status(201).send({
      success: true,
      proposals: result.proposals,
      applied: result.applied,
      trace: ctx.trace,
    });
  });

  /**
   * GET /ai/enrichments
   * List enrichment proposals
   */
  app.get('/enrichments', async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = requireTenant(request);
    const { status, workId, limit = 100 } = request.query as any;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (status) {
      conditions.push(`ep.status = $${params.length + 1}`);
      params.push(status);
    }

    if (workId) {
      conditions.push(`ep.work_id = $${params.length + 1}`);
      params.push(workId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await tenantQuery<EnrichmentProposal>(
      ctx,
      `SELECT ep.*, w.title as work_title
       FROM enrichment_proposals ep
       JOIN works w ON ep.work_id = w.id
       ${whereClause}
       ORDER BY ep.confidence DESC, ep.created_at DESC
       LIMIT $${params.length + 1}`,
      [...params, Math.min(limit, 500)]
    );

    return { data: result.rows };
  });

  /**
   * POST /ai/enrichments/:id/approve
   * Approve and apply an enrichment proposal
   */
  app.post('/enrichments/:id/approve', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    const ctx = createAIContext(request);
    const { id } = request.params;

    // Get proposal
    const proposalResult = await tenantQuery<EnrichmentProposal>(
      ctx,
      'SELECT * FROM enrichment_proposals WHERE id = $1',
      [id]
    );

    if (proposalResult.rows.length === 0) {
      throw NotFoundError('Enrichment Proposal', id);
    }

    const proposal = proposalResult.rows[0];

    // Apply the enrichment through the agent
    await enrichmentAgent.approveProposal(ctx, id);

    // Mark as approved
    await tenantQuery(
      ctx,
      `UPDATE enrichment_proposals
       SET status = 'APPROVED', reviewed_by = $1, reviewed_at = NOW()
       WHERE id = $2`,
      [ctx.userId, id]
    );

    return { success: true, applied: true, field: proposal.field_name };
  });

  /**
   * POST /ai/enrichments/:id/reject
   * Reject an enrichment proposal
   */
  app.post('/enrichments/:id/reject', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    const ctx = requireTenant(request);
    const { id } = request.params;

    await tenantQuery(
      ctx,
      `UPDATE enrichment_proposals
       SET status = 'REJECTED', reviewed_by = $1, reviewed_at = NOW()
       WHERE id = $2`,
      [ctx.userId, id]
    );

    return { success: true };
  });

  /**
   * POST /ai/enrichments/bulk-approve
   * Bulk approve high-confidence proposals
   */
  app.post('/enrichments/bulk-approve', async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = createAIContext(request);
    const body = z.object({
      minConfidence: z.number().min(0.8).max(1).default(0.95),
      workId: z.string().uuid().optional(),
    }).parse(request.body || {});

    // Get high-confidence pending proposals
    let query = `SELECT id FROM enrichment_proposals WHERE status = 'PENDING' AND confidence >= $1`;
    const params: unknown[] = [body.minConfidence];

    if (body.workId) {
      query += ` AND work_id = $2`;
      params.push(body.workId);
    }

    const proposals = await tenantQuery<{ id: string }>(ctx, query, params);

    let approved = 0;
    for (const p of proposals.rows) {
      try {
        await enrichmentAgent.approveProposal(ctx, p.id);
        await tenantQuery(
          ctx,
          `UPDATE enrichment_proposals SET status = 'APPROVED', reviewed_by = $1, reviewed_at = NOW() WHERE id = $2`,
          [ctx.userId, p.id]
        );
        approved++;
      } catch (e) {
        // Skip failed proposals
      }
    }

    return { success: true, total: proposals.rows.length, approved };
  });

  // ============================================================================
  // MATCHING ROUTES
  // ============================================================================

  /**
   * POST /ai/match
   * Find matches for a statement line
   */
  app.post('/match', async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = createAIContext(request);
    const body = z.object({
      title: z.string().min(1),
      writers: z.array(z.string()).default([]),
      performer: z.string().optional(),
      isrc: z.string().optional(),
      iswc: z.string().optional(),
      externalId: z.string().optional(),
      amount: z.number().optional(),
    }).parse(request.body);

    const result = await matchingAgent.match(ctx, {
      statementLineId: body.externalId || crypto.randomUUID(),
      title: body.title,
      writers: body.writers,
      performer: body.performer,
      isrc: body.isrc,
      iswc: body.iswc,
    });

    return {
      success: true,
      recommendation: result.recommendation,
      bestMatch: result.bestMatch,
      candidates: result.candidates.slice(0, 10),
      pipelineStages: result.pipelineStages,
      trace: ctx.trace,
    };
  });

  /**
   * POST /ai/match/batch
   * Batch match statement lines
   */
  app.post('/match/batch', async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = createAIContext(request);
    const body = z.object({
      lines: z.array(z.object({
        id: z.string(),
        title: z.string(),
        writers: z.array(z.string()).default([]),
        performer: z.string().optional(),
        isrc: z.string().optional(),
        iswc: z.string().optional(),
      })).min(1).max(100),
    }).parse(request.body);

    const results = await matchingAgent.batchMatch(
      ctx,
      body.lines.map(l => ({
        statementLineId: l.id,
        title: l.title,
        writers: l.writers,
        performer: l.performer,
        isrc: l.isrc,
        iswc: l.iswc,
      }))
    );

    const summary = {
      total: results.length,
      autoMatched: results.filter(r => r.recommendation === 'auto_match').length,
      needsReview: results.filter(r => r.recommendation === 'review').length,
      noMatch: results.filter(r => r.recommendation === 'no_match').length,
      createNew: results.filter(r => r.recommendation === 'create_new').length,
    };

    return {
      success: true,
      summary,
      results: results.map(r => ({
        lineId: r.pipelineStages[0]?.input?.statementLineId,
        recommendation: r.recommendation,
        bestMatch: r.bestMatch ? {
          workId: r.bestMatch.workId,
          title: r.bestMatch.title,
          confidence: r.bestMatch.confidence,
        } : null,
      })),
    };
  });

  /**
   * POST /ai/match/confirm/:matchId
   * Confirm a match (human approval)
   */
  app.post('/match/confirm/:matchId', async (
    request: FastifyRequest<{ Params: { matchId: string } }>,
    reply: FastifyReply
  ) => {
    const ctx = requireTenant(request);
    const { matchId } = request.params;
    const body = z.object({
      workId: z.string().uuid(),
      statementLineId: z.string().uuid(),
    }).parse(request.body);

    // Update match status
    await tenantQuery(
      ctx,
      `UPDATE royalty_statement_lines
       SET matched_work_id = $1, match_status = 'MATCHED', match_confidence = 1.0, matched_by = $2, matched_at = NOW()
       WHERE id = $3`,
      [body.workId, ctx.userId, body.statementLineId]
    );

    // Log for AI learning
    await tenantQuery(
      ctx,
      `INSERT INTO ai_audit_log (action, entity_type, entity_id, user_id, details)
       VALUES ('MATCH_CONFIRMED', 'STATEMENT_LINE', $1, $2, $3)`,
      [body.statementLineId, ctx.userId, JSON.stringify({ workId: body.workId })]
    );

    return { success: true };
  });

  /**
   * POST /ai/match/reject/:matchId
   * Reject a match suggestion
   */
  app.post('/match/reject/:matchId', async (
    request: FastifyRequest<{ Params: { matchId: string } }>,
    reply: FastifyReply
  ) => {
    const ctx = requireTenant(request);
    const { matchId } = request.params;
    const body = z.object({
      statementLineId: z.string().uuid(),
      reason: z.string().optional(),
    }).parse(request.body);

    await tenantQuery(
      ctx,
      `UPDATE royalty_statement_lines
       SET match_status = 'NO_MATCH'
       WHERE id = $1`,
      [body.statementLineId]
    );

    // Log for AI learning
    await tenantQuery(
      ctx,
      `INSERT INTO ai_audit_log (action, entity_type, entity_id, user_id, details)
       VALUES ('MATCH_REJECTED', 'STATEMENT_LINE', $1, $2, $3)`,
      [body.statementLineId, ctx.userId, JSON.stringify({ reason: body.reason })]
    );

    return { success: true };
  });

  // ============================================================================
  // CONFLICT DETECTION ROUTES
  // ============================================================================

  /**
   * POST /ai/conflicts/check/:workId
   * Run conflict detection for a work
   */
  app.post('/conflicts/check/:workId', async (
    request: FastifyRequest<{ Params: { workId: string } }>,
    reply: FastifyReply
  ) => {
    const ctx = createAIContext(request);
    const { workId } = request.params;

    // Get comprehensive work data
    const workResult = await tenantQuery(
      ctx,
      `SELECT w.*,
              json_agg(DISTINCT jsonb_build_object(
                'id', wr.id,
                'name', wr.name,
                'ipi', wr.ipi_name_number,
                'prShare', wiw.pr_share,
                'mrShare', wiw.mr_share,
                'srShare', wiw.sr_share,
                'role', wiw.role,
                'controlled', wiw.controlled,
                'territories', wiw.territories
              )) FILTER (WHERE wr.id IS NOT NULL) as writers,
              json_agg(DISTINCT jsonb_build_object(
                'id', p.id,
                'name', p.name,
                'ipi', p.ipi_name_number,
                'prShare', piw.pr_share,
                'mrShare', piw.mr_share,
                'srShare', piw.sr_share,
                'role', piw.role,
                'controlled', piw.controlled,
                'territories', piw.territories
              )) FILTER (WHERE p.id IS NOT NULL) as publishers
       FROM works w
       LEFT JOIN writers_in_work wiw ON w.id = wiw.work_id
       LEFT JOIN writers wr ON wiw.writer_id = wr.id
       LEFT JOIN publishers_in_work piw ON w.id = piw.work_id
       LEFT JOIN publishers p ON piw.publisher_id = p.id
       WHERE w.id = $1
       GROUP BY w.id`,
      [workId]
    );

    if (workResult.rows.length === 0) {
      throw NotFoundError('Work', workId);
    }

    const work = workResult.rows[0];

    // Run conflict detection
    const result = await conflictAgent.checkConflicts(ctx, {
      workId,
      title: work.title,
      iswc: work.iswc,
      writers: work.writers || [],
      publishers: work.publishers || [],
    });

    // Store conflicts in database
    for (const conflict of result.conflicts) {
      await tenantQuery(
        ctx,
        `INSERT INTO conflict_records
         (work_id, conflict_type, severity, description, details, status)
         VALUES ($1, $2, $3, $4, $5, 'OPEN')
         ON CONFLICT (work_id, conflict_type, description) DO UPDATE SET
           severity = EXCLUDED.severity,
           details = EXCLUDED.details,
           updated_at = NOW()`,
        [
          workId,
          conflict.type,
          conflict.severity,
          conflict.description,
          JSON.stringify(conflict.details),
        ]
      );
    }

    // Create AI task record
    await tenantQuery<AITask>(
      ctx,
      `INSERT INTO ai_tasks (task_type, entity_type, entity_id, status, result)
       VALUES ('CONFLICT_DETECTION', 'WORK', $1, 'COMPLETED', $2)`,
      [workId, JSON.stringify({ conflictCount: result.conflicts.length })]
    );

    return {
      success: true,
      hasConflicts: result.conflicts.length > 0,
      conflicts: result.conflicts,
      checksRun: result.checksRun,
      trace: ctx.trace,
    };
  });

  /**
   * GET /ai/conflicts
   * List conflict records
   */
  app.get('/conflicts', async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = requireTenant(request);
    const { status, severity, workId, limit = 100 } = request.query as any;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (status) {
      conditions.push(`cr.status = $${params.length + 1}`);
      params.push(status);
    }

    if (severity) {
      conditions.push(`cr.severity = $${params.length + 1}`);
      params.push(severity);
    }

    if (workId) {
      conditions.push(`cr.work_id = $${params.length + 1}`);
      params.push(workId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await tenantQuery<ConflictRecord>(
      ctx,
      `SELECT cr.*, w.title as work_title
       FROM conflict_records cr
       JOIN works w ON cr.work_id = w.id
       ${whereClause}
       ORDER BY
         CASE cr.severity
           WHEN 'CRITICAL' THEN 1
           WHEN 'HIGH' THEN 2
           WHEN 'MEDIUM' THEN 3
           ELSE 4
         END,
         cr.created_at DESC
       LIMIT $${params.length + 1}`,
      [...params, Math.min(limit, 500)]
    );

    return { data: result.rows };
  });

  /**
   * POST /ai/conflicts/:id/resolve
   * Resolve a conflict
   */
  app.post('/conflicts/:id/resolve', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    const ctx = requireTenant(request);
    const { id } = request.params;
    const body = z.object({
      resolution: z.enum(['FIXED', 'ACCEPTED', 'FALSE_POSITIVE']),
      notes: z.string().optional(),
    }).parse(request.body);

    await tenantQuery(
      ctx,
      `UPDATE conflict_records
       SET status = 'RESOLVED',
           resolved_by = $1,
           resolved_at = NOW(),
           resolution_notes = $2,
           resolution = $3
       WHERE id = $4`,
      [ctx.userId, body.notes, body.resolution, id]
    );

    // Log for audit
    await tenantQuery(
      ctx,
      `INSERT INTO ai_audit_log (action, entity_type, entity_id, user_id, details)
       VALUES ('CONFLICT_RESOLVED', 'CONFLICT', $1, $2, $3)`,
      [id, ctx.userId, JSON.stringify(body)]
    );

    return { success: true };
  });

  /**
   * POST /ai/conflicts/bulk-check
   * Check conflicts for multiple works
   */
  app.post('/conflicts/bulk-check', async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = createAIContext(request);
    const body = z.object({
      workIds: z.array(z.string().uuid()).min(1).max(100),
    }).parse(request.body);

    const results = [];
    for (const workId of body.workIds) {
      try {
        const result = await orchestrator.checkConflictsQuick(ctx, workId);
        results.push({
          workId,
          hasConflicts: result.conflicts.length > 0,
          conflictCount: result.conflicts.length,
        });
      } catch (e) {
        results.push({ workId, error: true });
      }
    }

    const summary = {
      total: body.workIds.length,
      withConflicts: results.filter(r => r.hasConflicts).length,
      clean: results.filter(r => r.hasConflicts === false).length,
      errors: results.filter(r => r.error).length,
    };

    return { success: true, summary, results };
  });

  // ============================================================================
  // AUDIT & ANALYTICS ROUTES
  // ============================================================================

  /**
   * GET /ai/audit
   * Get AI audit log
   */
  app.get('/audit', async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = requireTenant(request);
    const { action, entityType, limit = 100 } = request.query as any;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (action) {
      conditions.push(`action = $${params.length + 1}`);
      params.push(action);
    }

    if (entityType) {
      conditions.push(`entity_type = $${params.length + 1}`);
      params.push(entityType);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await tenantQuery(
      ctx,
      `SELECT * FROM ai_audit_log ${whereClause} ORDER BY created_at DESC LIMIT $${params.length + 1}`,
      [...params, Math.min(limit, 1000)]
    );

    return { data: result.rows };
  });
}
