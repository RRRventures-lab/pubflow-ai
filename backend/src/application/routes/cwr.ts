// ============================================================================
// PubFlow AI - CWR Routes
// CWR file generation and acknowledgement processing
// ============================================================================

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { tenantQuery, tenantTransaction } from '../../infrastructure/database/pool.js';
import { requireTenant } from '../middleware/tenant.js';
import { NotFoundError, BadRequestError } from '../middleware/error.js';
import { cwrService } from '../../domain/cwr/service.js';
import { cwrValidator, validateWorksForCWR } from '../../domain/cwr/validator.js';
import { ackParser, ACKParser } from '../../domain/cwr/ack-parser.js';
import {
  enqueueCWRGeneration,
  enqueueACKProcessing,
  getCWRJobStatus,
  cancelCWRJob,
  getCWRQueueStats,
  getRecentCWRJobs,
} from '../../infrastructure/queue/index.js';
import type { CWRExport } from '../../shared/types/index.js';
import type { CWRVersion, TransactionType } from '../../domain/cwr/types.js';

// --------------------------------------------------------------------------
// Schemas
// --------------------------------------------------------------------------

const CreateCWRExportSchema = z.object({
  version: z.enum(['21', '22', '30', '31']).default('21'),
  submitterCode: z.string().min(2).max(9),
  submitterName: z.string().min(1).max(45),
  submitterIPI: z.string().min(9).max(13).optional(),
  receiverCode: z.string().min(2).max(3),
  workIds: z.array(z.string().uuid()).min(1).max(1000),
  transactionType: z.enum(['NWR', 'REV', 'ISW', 'EXC']).default('NWR'),
  async: z.boolean().default(true), // Use queue by default
});

const ValidateWorksSchema = z.object({
  version: z.enum(['21', '22', '30', '31']).default('21'),
  workIds: z.array(z.string().uuid()).min(1),
});

const UploadACKSchema = z.object({
  cwrExportId: z.string().uuid(),
  filename: z.string(),
  content: z.string(),
});

// --------------------------------------------------------------------------
// Routes
// --------------------------------------------------------------------------

export async function cwrRoutes(app: FastifyInstance): Promise<void> {
  // ==========================================================================
  // CWR Exports
  // ==========================================================================

  /**
   * GET /cwr/exports
   * List CWR exports
   */
  app.get('/exports', async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = requireTenant(request);
    const { status, limit = '50', offset = '0' } = request.query as any;

    let query = `SELECT * FROM cwr_exports`;
    const params: any[] = [];

    if (status) {
      params.push(status);
      query += ` WHERE status = $${params.length}`;
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit, 10), parseInt(offset, 10));

    const result = await tenantQuery<CWRExport>(ctx, query, params);

    // Get total count
    const countResult = await tenantQuery(
      ctx,
      `SELECT COUNT(*) FROM cwr_exports${status ? ' WHERE status = $1' : ''}`,
      status ? [status] : []
    );

    return {
      data: result.rows,
      pagination: {
        total: parseInt(countResult.rows[0].count, 10),
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
      },
    };
  });

  /**
   * GET /cwr/exports/:id
   * Get CWR export details
   */
  app.get('/exports/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const ctx = requireTenant(request);
    const { id } = request.params;

    const result = await tenantQuery<CWRExport>(
      ctx,
      'SELECT * FROM cwr_exports WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      throw NotFoundError('CWR Export', id);
    }

    // Get works in this export
    const worksResult = await tenantQuery(
      ctx,
      `SELECT wice.*, w.title, w.iswc, w.work_code, w.registration_status
       FROM works_in_cwr_exports wice
       JOIN works w ON wice.work_id = w.id
       WHERE wice.cwr_export_id = $1
       ORDER BY wice.transaction_sequence`,
      [id]
    );

    return {
      ...result.rows[0],
      works: worksResult.rows,
    };
  });

  /**
   * POST /cwr/validate
   * Pre-flight validation for works before CWR generation
   */
  app.post('/validate', async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = requireTenant(request);
    const body = ValidateWorksSchema.parse(request.body);

    // Load works with all CWR-relevant data
    const works = await cwrService['loadWorksForCWR'](ctx, body.workIds);

    // Run validation
    const validationResult = validateWorksForCWR(works, body.version as CWRVersion);

    return {
      isValid: validationResult.isValid,
      canGenerate: validationResult.canGenerate,
      summary: validationResult.summary,
      errors: validationResult.errors,
      warnings: validationResult.warnings,
      info: validationResult.info,
    };
  });

  /**
   * POST /cwr/exports
   * Generate new CWR file
   */
  app.post('/exports', async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = requireTenant(request);
    const body = CreateCWRExportSchema.parse(request.body);

    // Validate works exist
    const worksResult = await tenantQuery(
      ctx,
      `SELECT w.id, w.work_code,
              (SELECT COUNT(*) FROM writers_in_works WHERE work_id = w.id) as writer_count
       FROM works w
       WHERE w.id = ANY($1::uuid[])`,
      [body.workIds]
    );

    if (worksResult.rows.length !== body.workIds.length) {
      const foundIds = new Set(worksResult.rows.map((r: any) => r.id));
      const missingIds = body.workIds.filter(id => !foundIds.has(id));
      throw BadRequestError(`Works not found: ${missingIds.join(', ')}`);
    }

    // Check all works have at least one writer
    const worksWithoutWriters = worksResult.rows.filter((w: any) => parseInt(w.writer_count) === 0);
    if (worksWithoutWriters.length > 0) {
      throw BadRequestError(
        `Works without writers: ${worksWithoutWriters.map((w: any) => w.work_code).join(', ')}`
      );
    }

    // Async generation via queue
    if (body.async) {
      const jobId = await enqueueCWRGeneration({
        tenantId: ctx.tenantId,
        userId: ctx.userId || 'system',
        version: body.version as CWRVersion,
        submitterCode: body.submitterCode,
        submitterName: body.submitterName,
        submitterIPI: body.submitterIPI || '',
        receiverCode: body.receiverCode,
        transactionType: body.transactionType as TransactionType,
        workIds: body.workIds,
        notifyOnComplete: true,
      });

      return reply.status(202).send({
        message: 'CWR generation queued',
        jobId,
        checkStatus: `/api/v1/cwr/jobs/${jobId}`,
      });
    }

    // Synchronous generation
    const result = await cwrService.generateCWR(ctx, {
      version: body.version as CWRVersion,
      submitterCode: body.submitterCode,
      submitterName: body.submitterName,
      submitterIPI: body.submitterIPI || '',
      receiverCode: body.receiverCode,
      transactionType: body.transactionType as TransactionType,
      workIds: body.workIds,
    });

    return reply.status(201).send({
      export: result.export,
      transactionCount: result.result.transactionCount,
      recordCount: result.result.recordCount,
      warnings: result.result.warnings,
    });
  });

  /**
   * POST /cwr/preview
   * Preview CWR generation without saving
   */
  app.post('/preview', async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = requireTenant(request);
    const body = CreateCWRExportSchema.parse(request.body);

    const result = await cwrService.previewCWR(ctx, {
      version: body.version as CWRVersion,
      submitterCode: body.submitterCode,
      submitterName: body.submitterName,
      submitterIPI: body.submitterIPI || '',
      receiverCode: body.receiverCode,
      transactionType: body.transactionType as TransactionType,
      workIds: body.workIds,
    });

    return {
      preview: result.preview,
      warnings: result.warnings,
      errors: result.errors,
      lineCount: result.preview.split('\r\n').length,
    };
  });

  /**
   * GET /cwr/exports/:id/download
   * Download CWR file
   */
  app.get('/exports/:id/download', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const ctx = requireTenant(request);
    const { id } = request.params;

    const result = await tenantQuery<CWRExport & { file_content: string }>(
      ctx,
      `SELECT filename, file_content FROM cwr_exports
       WHERE id = $1 AND status IN ('GENERATED', 'SUBMITTED', 'COMPLETED', 'ACCEPTED', 'ISSUES')`,
      [id]
    );

    if (result.rows.length === 0) {
      throw NotFoundError('CWR Export', id);
    }

    const { filename, file_content } = result.rows[0];

    if (!file_content) {
      throw BadRequestError('CWR file not yet generated');
    }

    reply.header('Content-Type', 'text/plain; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);
    return file_content;
  });

  /**
   * DELETE /cwr/exports/:id
   * Delete a CWR export (only if not submitted)
   */
  app.delete('/exports/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const ctx = requireTenant(request);
    const { id } = request.params;

    const result = await tenantQuery(
      ctx,
      `DELETE FROM cwr_exports WHERE id = $1 AND status NOT IN ('SUBMITTED', 'ACCEPTED')
       RETURNING id`,
      [id]
    );

    if (result.rows.length === 0) {
      throw BadRequestError('Cannot delete submitted or accepted exports');
    }

    return { message: 'Export deleted', id };
  });

  // ==========================================================================
  // Job Status
  // ==========================================================================

  /**
   * GET /cwr/jobs/:jobId
   * Get CWR generation job status
   */
  app.get('/jobs/:jobId', async (request: FastifyRequest<{ Params: { jobId: string } }>, reply: FastifyReply) => {
    const { jobId } = request.params;

    const status = await getCWRJobStatus(jobId);

    if (status.state === 'not_found') {
      throw NotFoundError('Job', jobId);
    }

    return status;
  });

  /**
   * DELETE /cwr/jobs/:jobId
   * Cancel a pending CWR generation job
   */
  app.delete('/jobs/:jobId', async (request: FastifyRequest<{ Params: { jobId: string } }>, reply: FastifyReply) => {
    const { jobId } = request.params;

    const cancelled = await cancelCWRJob(jobId);

    if (!cancelled) {
      throw BadRequestError('Cannot cancel job - either not found or already processing');
    }

    return { message: 'Job cancelled', jobId };
  });

  /**
   * GET /cwr/queue/stats
   * Get CWR queue statistics
   */
  app.get('/queue/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    const stats = await getCWRQueueStats();
    return stats;
  });

  /**
   * GET /cwr/queue/jobs
   * Get recent jobs by status
   */
  app.get('/queue/jobs', async (request: FastifyRequest, reply: FastifyReply) => {
    const { status = 'completed', limit = '10' } = request.query as any;

    const jobs = await getRecentCWRJobs(status, parseInt(limit, 10));

    return { data: jobs };
  });

  // ==========================================================================
  // Acknowledgements
  // ==========================================================================

  /**
   * POST /cwr/acknowledgements
   * Upload and process ACK file
   */
  app.post('/acknowledgements', async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = requireTenant(request);
    const body = UploadACKSchema.parse(request.body);

    // Verify CWR export exists
    const exportResult = await tenantQuery(
      ctx,
      'SELECT id, status FROM cwr_exports WHERE id = $1',
      [body.cwrExportId]
    );

    if (exportResult.rows.length === 0) {
      throw NotFoundError('CWR Export', body.cwrExportId);
    }

    // Queue ACK processing
    const jobId = await enqueueACKProcessing({
      tenantId: ctx.tenantId,
      userId: ctx.userId || 'system',
      cwrExportId: body.cwrExportId,
      ackContent: body.content,
      filename: body.filename,
    });

    return reply.status(202).send({
      message: 'ACK processing queued',
      jobId,
      checkStatus: `/api/v1/cwr/jobs/${jobId}`,
    });
  });

  /**
   * POST /cwr/acknowledgements/parse
   * Parse ACK file without saving (preview)
   */
  app.post('/acknowledgements/parse', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = z.object({
      content: z.string(),
      filename: z.string(),
    }).parse(request.body);

    const result = ackParser.parse(body.content, body.filename);

    return {
      filename: result.filename,
      version: result.version,
      senderCode: result.senderCode,
      processingDate: result.processingDate,
      summary: {
        accepted: result.accepted,
        rejected: result.rejected,
        conflicts: result.conflicts,
        duplicates: result.duplicates,
        total: result.records.length,
      },
      records: result.records.slice(0, 100), // Limit to first 100
      errors: result.errors,
    };
  });

  // ==========================================================================
  // Utility Endpoints
  // ==========================================================================

  /**
   * GET /cwr/versions
   * Get supported CWR versions
   */
  app.get('/versions', async (request: FastifyRequest, reply: FastifyReply) => {
    return {
      versions: cwrService.getSupportedVersions(),
    };
  });

  /**
   * GET /cwr/status-codes
   * Get ACK status code descriptions
   */
  app.get('/status-codes', async (request: FastifyRequest, reply: FastifyReply) => {
    return {
      codes: [
        { code: 'CO', description: ACKParser.getStatusDescription('CO'), requiresAttention: true },
        { code: 'DU', description: ACKParser.getStatusDescription('DU'), requiresAttention: true },
        { code: 'RA', description: ACKParser.getStatusDescription('RA'), requiresAttention: false },
        { code: 'AS', description: ACKParser.getStatusDescription('AS'), requiresAttention: false },
        { code: 'AC', description: ACKParser.getStatusDescription('AC'), requiresAttention: false },
        { code: 'SR', description: ACKParser.getStatusDescription('SR'), requiresAttention: false },
        { code: 'CR', description: ACKParser.getStatusDescription('CR'), requiresAttention: true },
        { code: 'RJ', description: ACKParser.getStatusDescription('RJ'), requiresAttention: true },
        { code: 'NP', description: ACKParser.getStatusDescription('NP'), requiresAttention: true },
      ],
    };
  });
}
