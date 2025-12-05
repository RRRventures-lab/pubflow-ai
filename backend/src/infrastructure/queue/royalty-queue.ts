// ============================================================================
// PubFlow AI - Royalty Processing Queue
// BullMQ workers for async royalty statement processing
// ============================================================================

import { Job } from 'bullmq';
import { getQueue, registerWorker, QUEUE_NAMES } from './connection.js';
import { royaltyProcessor, ProcessingOptions, ProcessingResult } from '../../domain/royalty/processor.js';
import { distributionCalculator } from '../../domain/royalty/distribution-calculator.js';
import { workCache } from '../../domain/royalty/work-cache.js';
import { tenantQuery, TenantContext } from '../database/pool.js';
import { logger } from '../logging/logger.js';
import type { StatementSource, StatementFormat, MatchingConfig } from '../../domain/royalty/types.js';

// ============================================================================
// Job Types
// ============================================================================

export interface RoyaltyProcessingJobData {
  tenantId: string;
  userId: string;
  statementId: string;
  fileContent: string;  // Base64 encoded
  options?: {
    columnMappings?: any[];
    matchingConfig?: Partial<MatchingConfig>;
    autoDistribute?: boolean;
  };
}

export interface AIMatchingJobData {
  tenantId: string;
  userId: string;
  statementId: string;
  rowNumbers: number[];
  useGptRerank?: boolean;
}

export interface DistributionJobData {
  tenantId: string;
  userId: string;
  statementId: string;
  period: {
    start: string;
    end: string;
  };
}

export interface RoyaltyJobResult {
  success: boolean;
  statementId: string;
  status?: string;
  stats?: ProcessingResult['stats'];
  errors?: string[];
  warnings?: string[];
}

// ============================================================================
// Queues
// ============================================================================

const royaltyQueue = getQueue(QUEUE_NAMES.ROYALTY_PROCESSING);
const aiMatchingQueue = getQueue(QUEUE_NAMES.AI_MATCHING);

// ============================================================================
// Enqueue Functions
// ============================================================================

/**
 * Enqueue royalty statement processing
 */
export async function enqueueRoyaltyProcessing(
  data: RoyaltyProcessingJobData,
  options?: {
    priority?: number;
    delay?: number;
    jobId?: string;
  }
): Promise<string> {
  const job = await royaltyQueue.add('process-statement', data, {
    priority: options?.priority || 0,
    delay: options?.delay || 0,
    jobId: options?.jobId,
    attempts: 2,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
  });

  logger.info('Royalty processing job enqueued', {
    jobId: job.id,
    tenantId: data.tenantId,
    statementId: data.statementId,
  });

  return job.id!;
}

/**
 * Enqueue AI-enhanced matching for specific rows
 */
export async function enqueueAIMatching(
  data: AIMatchingJobData,
  options?: {
    priority?: number;
    jobId?: string;
  }
): Promise<string> {
  const job = await aiMatchingQueue.add('ai-match', data, {
    priority: options?.priority || 0,
    jobId: options?.jobId,
  });

  logger.info('AI matching job enqueued', {
    jobId: job.id,
    tenantId: data.tenantId,
    statementId: data.statementId,
    rowCount: data.rowNumbers.length,
  });

  return job.id!;
}

/**
 * Enqueue distribution calculation
 */
export async function enqueueDistributionCalculation(
  data: DistributionJobData,
  options?: {
    priority?: number;
    jobId?: string;
  }
): Promise<string> {
  const job = await royaltyQueue.add('calculate-distributions', data, {
    priority: options?.priority || 0,
    jobId: options?.jobId,
  });

  logger.info('Distribution calculation job enqueued', {
    jobId: job.id,
    tenantId: data.tenantId,
    statementId: data.statementId,
  });

  return job.id!;
}

// ============================================================================
// Job Status
// ============================================================================

/**
 * Get royalty job status
 */
export async function getRoyaltyJobStatus(jobId: string): Promise<{
  state: string;
  progress?: number;
  result?: RoyaltyJobResult;
  failedReason?: string;
}> {
  const job = await royaltyQueue.getJob(jobId);

  if (!job) {
    return { state: 'not_found' };
  }

  const state = await job.getState();

  return {
    state,
    progress: job.progress as number,
    result: job.returnvalue as RoyaltyJobResult,
    failedReason: job.failedReason,
  };
}

// ============================================================================
// Workers
// ============================================================================

/**
 * Process royalty statement
 */
async function processRoyaltyStatement(
  job: Job<RoyaltyProcessingJobData>
): Promise<RoyaltyJobResult> {
  const { data } = job;

  logger.info('Processing royalty statement', {
    jobId: job.id,
    tenantId: data.tenantId,
    statementId: data.statementId,
  });

  try {
    const ctx: TenantContext = {
      tenantId: data.tenantId,
      userId: data.userId,
    };

    await job.updateProgress(5);

    // Decode file content
    const fileContent = Buffer.from(data.fileContent, 'base64');

    await job.updateProgress(10);

    // Process statement
    const result = await royaltyProcessor.processStatement(
      ctx,
      data.statementId,
      fileContent,
      {
        columnMappings: data.options?.columnMappings,
        matchingConfig: data.options?.matchingConfig,
        autoDistribute: data.options?.autoDistribute,
      }
    );

    await job.updateProgress(100);

    logger.info('Royalty statement processed', {
      jobId: job.id,
      statementId: data.statementId,
      status: result.status,
      stats: result.stats,
    });

    return {
      success: result.status !== 'failed',
      statementId: data.statementId,
      status: result.status,
      stats: result.stats,
      errors: result.errors,
      warnings: result.warnings,
    };
  } catch (error) {
    logger.error('Royalty statement processing failed', {
      jobId: job.id,
      statementId: data.statementId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return {
      success: false,
      statementId: data.statementId,
      errors: [error instanceof Error ? error.message : 'Processing failed'],
    };
  }
}

/**
 * Process AI-enhanced matching
 */
async function processAIMatching(
  job: Job<AIMatchingJobData>
): Promise<RoyaltyJobResult> {
  const { data } = job;

  logger.info('Processing AI matching', {
    jobId: job.id,
    tenantId: data.tenantId,
    statementId: data.statementId,
    rowCount: data.rowNumbers.length,
  });

  try {
    const ctx: TenantContext = {
      tenantId: data.tenantId,
      userId: data.userId,
    };

    // TODO: Implement AI-enhanced matching using vector search + GPT reranking
    // This would:
    // 1. Load rows that need matching
    // 2. Generate embeddings for each row's title/writer
    // 3. Perform vector similarity search
    // 4. Optionally rerank with GPT-4
    // 5. Update match results

    await job.updateProgress(100);

    return {
      success: true,
      statementId: data.statementId,
    };
  } catch (error) {
    logger.error('AI matching failed', {
      jobId: job.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return {
      success: false,
      statementId: data.statementId,
      errors: [error instanceof Error ? error.message : 'AI matching failed'],
    };
  }
}

/**
 * Calculate distributions
 */
async function processDistributionCalculation(
  job: Job<DistributionJobData>
): Promise<RoyaltyJobResult> {
  const { data } = job;

  logger.info('Calculating distributions', {
    jobId: job.id,
    tenantId: data.tenantId,
    statementId: data.statementId,
  });

  try {
    const ctx: TenantContext = {
      tenantId: data.tenantId,
      userId: data.userId,
    };

    await job.updateProgress(10);

    // Load work cache
    const processingCtx = await workCache.getProcessingContext(ctx, data.statementId);

    await job.updateProgress(30);

    // Calculate distributions
    const period = {
      start: new Date(data.period.start),
      end: new Date(data.period.end),
    };

    const summary = await distributionCalculator.calculateStatementDistributions(
      ctx,
      data.statementId,
      processingCtx,
      period
    );

    await job.updateProgress(100);

    logger.info('Distribution calculation complete', {
      jobId: job.id,
      statementId: data.statementId,
      totalDistributed: summary.totalDistributed,
    });

    return {
      success: true,
      statementId: data.statementId,
      stats: {
        totalRows: 0,
        processedRows: 0,
        exactMatches: 0,
        fuzzyMatches: 0,
        noMatches: 0,
        reviewRequired: 0,
        errors: 0,
        totalAmount: summary.totalGross,
        matchedAmount: summary.totalDistributed,
        unmatchedAmount: summary.totalUndistributed,
      },
    };
  } catch (error) {
    logger.error('Distribution calculation failed', {
      jobId: job.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return {
      success: false,
      statementId: data.statementId,
      errors: [error instanceof Error ? error.message : 'Distribution calculation failed'],
    };
  }
}

// ============================================================================
// Worker Registration
// ============================================================================

export function startRoyaltyWorkers(): void {
  // Main royalty processing worker
  registerWorker(QUEUE_NAMES.ROYALTY_PROCESSING, async (job) => {
    switch (job.name) {
      case 'process-statement':
        return processRoyaltyStatement(job);
      case 'calculate-distributions':
        return processDistributionCalculation(job);
      default:
        throw new Error(`Unknown job type: ${job.name}`);
    }
  }, {
    concurrency: 2, // Limit concurrent processing
  });

  // AI matching worker
  registerWorker(QUEUE_NAMES.AI_MATCHING, processAIMatching, {
    concurrency: 3,
  });

  logger.info('Royalty workers started');
}

// ============================================================================
// Queue Stats
// ============================================================================

export async function getRoyaltyQueueStats(): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}> {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    royaltyQueue.getWaitingCount(),
    royaltyQueue.getActiveCount(),
    royaltyQueue.getCompletedCount(),
    royaltyQueue.getFailedCount(),
    royaltyQueue.getDelayedCount(),
  ]);

  return { waiting, active, completed, failed, delayed };
}
