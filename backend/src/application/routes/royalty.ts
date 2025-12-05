// ============================================================================
// PubFlow AI - Royalty Routes
// API endpoints for royalty statement processing
// ============================================================================

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { requireTenant } from '../middleware/tenant.js';
import { NotFoundError, BadRequestError } from '../middleware/error.js';
import { royaltyProcessor } from '../../domain/royalty/processor.js';
import { reviewQueueService } from '../../domain/royalty/review-queue.js';
import { distributionCalculator } from '../../domain/royalty/distribution-calculator.js';
import { workCache } from '../../domain/royalty/work-cache.js';
import {
  enqueueRoyaltyProcessing,
  enqueueDistributionCalculation,
  getRoyaltyJobStatus,
  getRoyaltyQueueStats,
} from '../../infrastructure/queue/royalty-queue.js';
import type { StatementSource, StatementFormat } from '../../domain/royalty/types.js';

// --------------------------------------------------------------------------
// Schemas
// --------------------------------------------------------------------------

const UploadStatementSchema = z.object({
  source: z.enum([
    'ASCAP', 'BMI', 'SESAC', 'GMR', 'PRS', 'MCPS', 'SACEM', 'SDRM', 'GEMA',
    'SPOTIFY', 'APPLE', 'AMAZON', 'YOUTUBE', 'TIKTOK', 'META', 'CUSTOM',
  ]),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  currency: z.string().length(3).default('USD'),
});

const ProcessStatementSchema = z.object({
  statementId: z.string().uuid(),
  async: z.boolean().default(true),
  options: z.object({
    columnMappings: z.array(z.object({
      sourceColumn: z.string(),
      targetField: z.string().nullable(),
      transform: z.string().optional(),
    })).optional(),
    matchingConfig: z.object({
      autoMatchThreshold: z.number().min(0).max(1).optional(),
      reviewThreshold: z.number().min(0).max(1).optional(),
      vectorSearchEnabled: z.boolean().optional(),
      gptRerankEnabled: z.boolean().optional(),
    }).optional(),
    autoDistribute: z.boolean().default(false),
  }).optional(),
});

const ResolveReviewSchema = z.object({
  action: z.enum(['approve', 'reject', 'rematch', 'skip']),
  matchedWorkId: z.string().uuid().optional(),
  confidence: z.number().min(0).max(1).optional(),
  notes: z.string().optional(),
});

const BulkResolveSchema = z.object({
  itemIds: z.array(z.string().uuid()).min(1),
  resolution: ResolveReviewSchema,
});

// --------------------------------------------------------------------------
// Routes
// --------------------------------------------------------------------------

export async function royaltyRoutes(app: FastifyInstance): Promise<void> {
  // ==========================================================================
  // Statements
  // ==========================================================================

  /**
   * GET /royalty/statements
   * List royalty statements
   */
  app.get('/statements', async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = requireTenant(request);
    const { status, source, limit, offset } = request.query as any;

    const result = await royaltyProcessor.listStatements(ctx, {
      status,
      source,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });

    return {
      data: result.statements,
      pagination: {
        total: result.total,
        limit: parseInt(limit || '50', 10),
        offset: parseInt(offset || '0', 10),
      },
    };
  });

  /**
   * GET /royalty/statements/:id
   * Get statement details
   */
  app.get('/statements/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const ctx = requireTenant(request);
    const { id } = request.params;

    const statement = await royaltyProcessor.getStatement(ctx, id);
    if (!statement) {
      throw NotFoundError('Statement', id);
    }

    return statement;
  });

  /**
   * POST /royalty/statements/upload
   * Upload a new statement file
   */
  app.post('/statements/upload', async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = requireTenant(request);

    // Get multipart data
    const data = await request.file();
    if (!data) {
      throw BadRequestError('No file uploaded');
    }

    const metadata = UploadStatementSchema.parse(
      JSON.parse(data.fields.metadata?.toString() || '{}')
    );

    const content = await data.toBuffer();

    const statement = await royaltyProcessor.uploadStatement(
      ctx,
      {
        content,
        filename: data.filename,
      },
      {
        source: metadata.source as StatementSource,
        periodStart: new Date(metadata.periodStart),
        periodEnd: new Date(metadata.periodEnd),
        currency: metadata.currency,
      }
    );

    return reply.status(201).send(statement);
  });

  /**
   * POST /royalty/statements/process
   * Process a statement (sync or async)
   */
  app.post('/statements/process', async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = requireTenant(request);

    // Handle multipart: file + JSON body
    const data = await request.file();
    if (!data) {
      throw BadRequestError('No file uploaded');
    }

    const bodyFields = data.fields.body?.toString() || '{}';
    const body = ProcessStatementSchema.parse(JSON.parse(bodyFields));
    const fileContent = await data.toBuffer();

    if (body.async) {
      // Queue for async processing
      const jobId = await enqueueRoyaltyProcessing({
        tenantId: ctx.tenantId,
        userId: ctx.userId || 'system',
        statementId: body.statementId,
        fileContent: fileContent.toString('base64'),
        options: body.options,
      });

      return reply.status(202).send({
        message: 'Statement processing queued',
        jobId,
        checkStatus: `/api/v1/royalty/jobs/${jobId}`,
      });
    }

    // Sync processing
    const result = await royaltyProcessor.processStatement(
      ctx,
      body.statementId,
      fileContent,
      body.options
    );

    return result;
  });

  /**
   * GET /royalty/statements/:id/rows
   * Get statement rows
   */
  app.get('/statements/:id/rows', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const ctx = requireTenant(request);
    const { id } = request.params;
    const { matchStatus, limit, offset } = request.query as any;

    const result = await royaltyProcessor.getStatementRows(ctx, id, {
      matchStatus,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });

    return {
      data: result.rows,
      pagination: {
        total: result.total,
        limit: parseInt(limit || '100', 10),
        offset: parseInt(offset || '0', 10),
      },
    };
  });

  /**
   * POST /royalty/statements/:id/distribute
   * Calculate distributions for a statement
   */
  app.post('/statements/:id/distribute', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const ctx = requireTenant(request);
    const { id } = request.params;
    const { async = true } = request.body as any;

    const statement = await royaltyProcessor.getStatement(ctx, id);
    if (!statement) {
      throw NotFoundError('Statement', id);
    }

    if (async) {
      const jobId = await enqueueDistributionCalculation({
        tenantId: ctx.tenantId,
        userId: ctx.userId || 'system',
        statementId: id,
        period: {
          start: statement.period.start.toISOString(),
          end: statement.period.end.toISOString(),
        },
      });

      return reply.status(202).send({
        message: 'Distribution calculation queued',
        jobId,
        checkStatus: `/api/v1/royalty/jobs/${jobId}`,
      });
    }

    // Sync calculation
    const processingCtx = await workCache.getProcessingContext(ctx, id);
    const summary = await distributionCalculator.calculateStatementDistributions(
      ctx,
      id,
      processingCtx,
      statement.period
    );

    return summary;
  });

  // ==========================================================================
  // Jobs
  // ==========================================================================

  /**
   * GET /royalty/jobs/:jobId
   * Get job status
   */
  app.get('/jobs/:jobId', async (request: FastifyRequest<{ Params: { jobId: string } }>, reply: FastifyReply) => {
    const { jobId } = request.params;

    const status = await getRoyaltyJobStatus(jobId);
    if (status.state === 'not_found') {
      throw NotFoundError('Job', jobId);
    }

    return status;
  });

  /**
   * GET /royalty/queue/stats
   * Get queue statistics
   */
  app.get('/queue/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    const stats = await getRoyaltyQueueStats();
    return stats;
  });

  // ==========================================================================
  // Review Queue
  // ==========================================================================

  /**
   * GET /royalty/review
   * Get review queue items
   */
  app.get('/review', async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = requireTenant(request);
    const { statementId, assignedTo, limit, offset } = request.query as any;

    const result = await reviewQueueService.getPendingItems(ctx, {
      statementId,
      assignedTo,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });

    return {
      data: result.items,
      pagination: {
        total: result.total,
        limit: parseInt(limit || '50', 10),
        offset: parseInt(offset || '0', 10),
      },
    };
  });

  /**
   * GET /royalty/review/stats
   * Get review queue statistics
   */
  app.get('/review/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = requireTenant(request);
    const { statementId } = request.query as any;

    const stats = await reviewQueueService.getStats(ctx, statementId);
    return stats;
  });

  /**
   * GET /royalty/review/:id
   * Get single review item
   */
  app.get('/review/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const ctx = requireTenant(request);
    const { id } = request.params;

    const item = await reviewQueueService.getItem(ctx, id);
    if (!item) {
      throw NotFoundError('Review item', id);
    }

    return item;
  });

  /**
   * POST /royalty/review/:id/resolve
   * Resolve a review item
   */
  app.post('/review/:id/resolve', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const ctx = requireTenant(request);
    const { id } = request.params;
    const body = ResolveReviewSchema.parse(request.body);

    const item = await reviewQueueService.resolveItem(
      ctx,
      id,
      body,
      ctx.userId || 'system'
    );

    if (!item) {
      throw NotFoundError('Review item', id);
    }

    return item;
  });

  /**
   * POST /royalty/review/bulk-resolve
   * Bulk resolve review items
   */
  app.post('/review/bulk-resolve', async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = requireTenant(request);
    const body = BulkResolveSchema.parse(request.body);

    const resolvedCount = await reviewQueueService.bulkResolve(
      ctx,
      body.itemIds,
      body.resolution,
      ctx.userId || 'system'
    );

    return {
      message: `Resolved ${resolvedCount} items`,
      resolvedCount,
      requestedCount: body.itemIds.length,
    };
  });

  /**
   * POST /royalty/review/assign
   * Assign review items to a user
   */
  app.post('/review/assign', async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = requireTenant(request);
    const body = z.object({
      itemIds: z.array(z.string().uuid()).min(1),
      assignedTo: z.string().uuid(),
    }).parse(request.body);

    const assignedCount = await reviewQueueService.assignItems(
      ctx,
      body.itemIds,
      body.assignedTo
    );

    return {
      message: `Assigned ${assignedCount} items`,
      assignedCount,
      requestedCount: body.itemIds.length,
    };
  });

  // ==========================================================================
  // Cache Management
  // ==========================================================================

  /**
   * GET /royalty/cache/stats
   * Get work cache statistics
   */
  app.get('/cache/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    const stats = workCache.getCacheStats();
    return stats;
  });

  /**
   * POST /royalty/cache/invalidate
   * Invalidate work cache
   */
  app.post('/cache/invalidate', async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = requireTenant(request);
    const { all } = request.body as any;

    if (all) {
      workCache.invalidateAll();
      return { message: 'All caches invalidated' };
    }

    workCache.invalidate(ctx.tenantId);
    return { message: `Cache invalidated for tenant ${ctx.tenantId}` };
  });

  // ==========================================================================
  // Matching Sources
  // ==========================================================================

  /**
   * GET /royalty/sources
   * Get supported statement sources
   */
  app.get('/sources', async (request: FastifyRequest, reply: FastifyReply) => {
    return {
      sources: [
        { code: 'ASCAP', name: 'ASCAP', type: 'pro', country: 'US' },
        { code: 'BMI', name: 'BMI', type: 'pro', country: 'US' },
        { code: 'SESAC', name: 'SESAC', type: 'pro', country: 'US' },
        { code: 'GMR', name: 'GMR', type: 'pro', country: 'US' },
        { code: 'PRS', name: 'PRS for Music', type: 'pro', country: 'UK' },
        { code: 'MCPS', name: 'MCPS', type: 'mro', country: 'UK' },
        { code: 'SACEM', name: 'SACEM', type: 'pro', country: 'FR' },
        { code: 'GEMA', name: 'GEMA', type: 'pro', country: 'DE' },
        { code: 'SPOTIFY', name: 'Spotify', type: 'dsp' },
        { code: 'APPLE', name: 'Apple Music', type: 'dsp' },
        { code: 'AMAZON', name: 'Amazon Music', type: 'dsp' },
        { code: 'YOUTUBE', name: 'YouTube', type: 'dsp' },
        { code: 'TIKTOK', name: 'TikTok', type: 'dsp' },
        { code: 'META', name: 'Meta (Facebook/Instagram)', type: 'dsp' },
        { code: 'CUSTOM', name: 'Custom/Other', type: 'other' },
      ],
    };
  });
}
