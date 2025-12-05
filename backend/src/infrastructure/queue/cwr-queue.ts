// ============================================================================
// PubFlow AI - CWR Generation Queue
// Async processing of CWR file generation
// ============================================================================

import { Job } from 'bullmq';
import { getQueue, registerWorker, getQueueEvents, QUEUE_NAMES } from './connection.js';
import { cwrService } from '../../domain/cwr/service.js';
import { cwrValidator, validateWorksForCWR } from '../../domain/cwr/validator.js';
import { ackParser } from '../../domain/cwr/ack-parser.js';
import { tenantQuery, TenantContext } from '../database/pool.js';
import { logger } from '../logging/logger.js';
import type { CWRVersion, TransactionType } from '../../domain/cwr/types.js';

// ============================================================================
// Job Types
// ============================================================================

export interface CWRGenerationJobData {
  tenantId: string;
  userId: string;
  version: CWRVersion;
  submitterCode: string;
  submitterName: string;
  submitterIPI: string;
  receiverCode: string;
  transactionType: TransactionType;
  workIds: string[];
  notifyOnComplete?: boolean;
}

export interface CWRAcknowledgementJobData {
  tenantId: string;
  userId: string;
  cwrExportId: string;
  ackContent: string;
  filename: string;
}

export interface CWRJobResult {
  success: boolean;
  exportId?: string;
  filename?: string;
  transactionCount?: number;
  recordCount?: number;
  errors?: string[];
  warnings?: string[];
}

export interface ACKJobResult {
  success: boolean;
  accepted: number;
  rejected: number;
  conflicts: number;
  duplicates: number;
  errors?: string[];
}

// ============================================================================
// CWR Generation Queue
// ============================================================================

const cwrQueue = getQueue(QUEUE_NAMES.CWR_GENERATION);
const ackQueue = getQueue(QUEUE_NAMES.CWR_ACKNOWLEDGEMENT);

/**
 * Add a CWR generation job to the queue
 */
export async function enqueueCWRGeneration(
  data: CWRGenerationJobData,
  options?: {
    priority?: number;
    delay?: number;
    jobId?: string;
  }
): Promise<string> {
  const job = await cwrQueue.add('generate', data, {
    priority: options?.priority || 0,
    delay: options?.delay || 0,
    jobId: options?.jobId,
  });

  logger.info('CWR generation job enqueued', {
    jobId: job.id,
    tenantId: data.tenantId,
    workCount: data.workIds.length,
    version: data.version,
  });

  return job.id!;
}

/**
 * Add an ACK processing job to the queue
 */
export async function enqueueACKProcessing(
  data: CWRAcknowledgementJobData,
  options?: {
    priority?: number;
    jobId?: string;
  }
): Promise<string> {
  const job = await ackQueue.add('process-ack', data, {
    priority: options?.priority || 0,
    jobId: options?.jobId,
  });

  logger.info('ACK processing job enqueued', {
    jobId: job.id,
    tenantId: data.tenantId,
    cwrExportId: data.cwrExportId,
    filename: data.filename,
  });

  return job.id!;
}

/**
 * Get job status
 */
export async function getCWRJobStatus(jobId: string): Promise<{
  state: string;
  progress?: number;
  result?: CWRJobResult;
  failedReason?: string;
}> {
  const job = await cwrQueue.getJob(jobId);

  if (!job) {
    return { state: 'not_found' };
  }

  const state = await job.getState();

  return {
    state,
    progress: job.progress as number,
    result: job.returnvalue as CWRJobResult,
    failedReason: job.failedReason,
  };
}

/**
 * Cancel a pending job
 */
export async function cancelCWRJob(jobId: string): Promise<boolean> {
  const job = await cwrQueue.getJob(jobId);

  if (!job) {
    return false;
  }

  const state = await job.getState();
  if (state === 'waiting' || state === 'delayed') {
    await job.remove();
    logger.info('CWR job cancelled', { jobId });
    return true;
  }

  return false;
}

// ============================================================================
// CWR Generation Worker
// ============================================================================

async function processCWRGeneration(job: Job<CWRGenerationJobData>): Promise<CWRJobResult> {
  const { data } = job;

  logger.info('Processing CWR generation job', {
    jobId: job.id,
    tenantId: data.tenantId,
    workCount: data.workIds.length,
  });

  try {
    // Create tenant context
    const ctx: TenantContext = {
      tenantId: data.tenantId,
      userId: data.userId,
    };

    // Update progress: Validating
    await job.updateProgress(10);

    // Pre-flight validation (load works first)
    const worksResult = await tenantQuery(
      ctx,
      `SELECT w.*,
        (SELECT json_agg(wiw.* || jsonb_build_object('writer', row_to_json(wr.*)))
         FROM writers_in_works wiw
         JOIN writers wr ON wiw.writer_id = wr.id
         WHERE wiw.work_id = w.id) as writers_data,
        (SELECT json_agg(piw.* || jsonb_build_object('publisher', row_to_json(p.*)))
         FROM publishers_in_works piw
         JOIN publishers p ON piw.publisher_id = p.id
         WHERE piw.work_id = w.id) as publishers_data
       FROM works w
       WHERE w.id = ANY($1)`,
      [data.workIds]
    );

    await job.updateProgress(25);

    // Check if works exist
    if (worksResult.rows.length === 0) {
      return {
        success: false,
        errors: ['No works found for the given IDs'],
      };
    }

    if (worksResult.rows.length !== data.workIds.length) {
      const foundIds = new Set(worksResult.rows.map((r: any) => r.id));
      const missing = data.workIds.filter(id => !foundIds.has(id));
      logger.warn('Some works not found', { missing });
    }

    await job.updateProgress(40);

    // Generate CWR
    const result = await cwrService.generateCWR(ctx, {
      version: data.version,
      submitterCode: data.submitterCode,
      submitterName: data.submitterName,
      submitterIPI: data.submitterIPI,
      receiverCode: data.receiverCode,
      transactionType: data.transactionType,
      workIds: data.workIds,
    });

    await job.updateProgress(90);

    // Update export status
    await tenantQuery(
      ctx,
      `UPDATE cwr_exports SET status = 'COMPLETED', completed_at = NOW() WHERE id = $1`,
      [result.export.id]
    );

    await job.updateProgress(100);

    logger.info('CWR generation completed', {
      jobId: job.id,
      exportId: result.export.id,
      filename: result.result.filename,
      transactionCount: result.result.transactionCount,
    });

    return {
      success: true,
      exportId: result.export.id,
      filename: result.result.filename,
      transactionCount: result.result.transactionCount,
      recordCount: result.result.recordCount,
      warnings: result.result.warnings,
    };
  } catch (error) {
    logger.error('CWR generation failed', {
      jobId: job.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return {
      success: false,
      errors: [error instanceof Error ? error.message : 'Generation failed'],
    };
  }
}

// ============================================================================
// ACK Processing Worker
// ============================================================================

async function processACKFile(job: Job<CWRAcknowledgementJobData>): Promise<ACKJobResult> {
  const { data } = job;

  logger.info('Processing ACK file', {
    jobId: job.id,
    tenantId: data.tenantId,
    cwrExportId: data.cwrExportId,
    filename: data.filename,
  });

  try {
    const ctx: TenantContext = {
      tenantId: data.tenantId,
      userId: data.userId,
    };

    await job.updateProgress(10);

    // Parse ACK file
    const parseResult = ackParser.parse(data.ackContent, data.filename);

    await job.updateProgress(50);

    // Update CWR export with ACK results
    await tenantQuery(
      ctx,
      `UPDATE cwr_exports SET
        ack_received_at = NOW(),
        ack_filename = $2,
        ack_accepted = $3,
        ack_rejected = $4,
        ack_conflicts = $5,
        ack_duplicates = $6,
        status = CASE
          WHEN $4 > 0 OR $5 > 0 THEN 'ISSUES'
          ELSE 'ACCEPTED'
        END
       WHERE id = $1`,
      [
        data.cwrExportId,
        data.filename,
        parseResult.accepted,
        parseResult.rejected,
        parseResult.conflicts,
        parseResult.duplicates,
      ]
    );

    await job.updateProgress(70);

    // Process individual records - update work statuses
    for (const record of parseResult.records) {
      if (record.workCode && record.status) {
        // Find work by code and update registration status
        await tenantQuery(
          ctx,
          `UPDATE works SET
            registration_status = $2,
            society_work_id = COALESCE($3, society_work_id),
            last_ack_date = NOW()
           WHERE work_code = $1`,
          [record.workCode, record.status, record.societyWorkId]
        );
      }
    }

    await job.updateProgress(100);

    logger.info('ACK processing completed', {
      jobId: job.id,
      accepted: parseResult.accepted,
      rejected: parseResult.rejected,
    });

    return {
      success: true,
      accepted: parseResult.accepted,
      rejected: parseResult.rejected,
      conflicts: parseResult.conflicts,
      duplicates: parseResult.duplicates,
      errors: parseResult.errors.length > 0 ? parseResult.errors : undefined,
    };
  } catch (error) {
    logger.error('ACK processing failed', {
      jobId: job.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return {
      success: false,
      accepted: 0,
      rejected: 0,
      conflicts: 0,
      duplicates: 0,
      errors: [error instanceof Error ? error.message : 'Processing failed'],
    };
  }
}

// ============================================================================
// Worker Registration
// ============================================================================

export function startCWRWorkers(): void {
  // CWR Generation Worker
  registerWorker(QUEUE_NAMES.CWR_GENERATION, processCWRGeneration, {
    concurrency: 3, // Process 3 jobs at a time
  });

  // ACK Processing Worker
  registerWorker(QUEUE_NAMES.CWR_ACKNOWLEDGEMENT, processACKFile, {
    concurrency: 5, // ACK processing is lighter
  });

  logger.info('CWR workers started');
}

// ============================================================================
// Queue Stats
// ============================================================================

export async function getCWRQueueStats(): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}> {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    cwrQueue.getWaitingCount(),
    cwrQueue.getActiveCount(),
    cwrQueue.getCompletedCount(),
    cwrQueue.getFailedCount(),
    cwrQueue.getDelayedCount(),
  ]);

  return { waiting, active, completed, failed, delayed };
}

/**
 * Get recent jobs
 */
export async function getRecentCWRJobs(
  status: 'completed' | 'failed' | 'waiting' | 'active',
  limit = 10
): Promise<Array<{
  id: string;
  data: CWRGenerationJobData;
  state: string;
  result?: CWRJobResult;
  failedReason?: string;
  createdAt: Date;
  finishedAt?: Date;
}>> {
  let jobs: Job[];

  switch (status) {
    case 'completed':
      jobs = await cwrQueue.getCompleted(0, limit - 1);
      break;
    case 'failed':
      jobs = await cwrQueue.getFailed(0, limit - 1);
      break;
    case 'waiting':
      jobs = await cwrQueue.getWaiting(0, limit - 1);
      break;
    case 'active':
      jobs = await cwrQueue.getActive(0, limit - 1);
      break;
    default:
      jobs = [];
  }

  return jobs.map(job => ({
    id: job.id!,
    data: job.data,
    state: status,
    result: job.returnvalue,
    failedReason: job.failedReason,
    createdAt: new Date(job.timestamp),
    finishedAt: job.finishedOn ? new Date(job.finishedOn) : undefined,
  }));
}
