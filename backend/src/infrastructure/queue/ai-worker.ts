// ============================================================================
// PubFlow AI - AI Task Worker
// Background job processor for AI tasks (enrichment, matching, conflicts)
// ============================================================================

import { EventEmitter } from 'events';
import { pool, tenantQuery } from '../database/pool.js';
import { logger } from '../logging/logger.js';
import {
  getAIOrchestrator,
  getEnrichmentAgent,
  getMatchingAgent,
  getConflictAgent,
  getEmbeddingService,
  type AIContext,
} from '../../domain/ai/index.js';

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

interface AITask {
  id: string;
  task_type: string;
  entity_type: string;
  entity_id: string;
  status: string;
  priority: number;
  input: any;
  tenant_id: string;
}

interface WorkerConfig {
  pollIntervalMs: number;      // How often to check for new tasks
  batchSize: number;           // Max tasks to process at once
  concurrency: number;         // Parallel task processing
  retryAttempts: number;       // Number of retries on failure
  retryDelayMs: number;        // Delay between retries
  taskTimeoutMs: number;       // Max time for a single task
}

interface WorkerStats {
  processed: number;
  succeeded: number;
  failed: number;
  retried: number;
  processing: number;
  uptime: number;
}

// --------------------------------------------------------------------------
// Default Configuration
// --------------------------------------------------------------------------

const DEFAULT_CONFIG: WorkerConfig = {
  pollIntervalMs: 5000,        // 5 seconds
  batchSize: 10,               // 10 tasks per batch
  concurrency: 3,              // 3 parallel tasks
  retryAttempts: 3,            // 3 retry attempts
  retryDelayMs: 5000,          // 5 second retry delay
  taskTimeoutMs: 60000,        // 60 second timeout
};

// --------------------------------------------------------------------------
// AI Task Worker Class
// --------------------------------------------------------------------------

export class AIWorker extends EventEmitter {
  private config: WorkerConfig;
  private isRunning: boolean = false;
  private pollTimeout: NodeJS.Timeout | null = null;
  private activeTasks: Map<string, Promise<void>> = new Map();
  private stats: WorkerStats;
  private startTime: number = 0;

  // AI Agents
  private orchestrator = getAIOrchestrator();
  private enrichmentAgent = getEnrichmentAgent();
  private matchingAgent = getMatchingAgent();
  private conflictAgent = getConflictAgent();
  private embeddingService = getEmbeddingService();

  constructor(config: Partial<WorkerConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.stats = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      retried: 0,
      processing: 0,
      uptime: 0,
    };
  }

  /**
   * Start the worker
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('AI Worker already running');
      return;
    }

    logger.info('Starting AI Worker', { config: this.config });

    this.isRunning = true;
    this.startTime = Date.now();
    this.emit('started');

    await this.poll();
  }

  /**
   * Stop the worker gracefully
   */
  async stop(): Promise<void> {
    logger.info('Stopping AI Worker...');

    this.isRunning = false;

    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout);
      this.pollTimeout = null;
    }

    // Wait for active tasks to complete
    if (this.activeTasks.size > 0) {
      logger.info(`Waiting for ${this.activeTasks.size} active tasks to complete...`);
      await Promise.allSettled(this.activeTasks.values());
    }

    this.emit('stopped');
    logger.info('AI Worker stopped', { stats: this.getStats() });
  }

  /**
   * Poll for new tasks
   */
  private async poll(): Promise<void> {
    if (!this.isRunning) return;

    try {
      // Check if we have capacity
      const availableSlots = this.config.concurrency - this.activeTasks.size;

      if (availableSlots > 0) {
        const tasks = await this.fetchPendingTasks(Math.min(availableSlots, this.config.batchSize));

        for (const task of tasks) {
          this.processTask(task);
        }
      }
    } catch (error) {
      logger.error('Error polling for tasks', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // Schedule next poll
    this.pollTimeout = setTimeout(() => this.poll(), this.config.pollIntervalMs);
  }

  /**
   * Fetch pending tasks from database
   */
  private async fetchPendingTasks(limit: number): Promise<AITask[]> {
    const result = await pool.query<AITask>(
      `UPDATE ai_tasks
       SET status = 'PROCESSING', started_at = NOW()
       WHERE id IN (
         SELECT id FROM ai_tasks
         WHERE status = 'PENDING'
         ORDER BY priority DESC, created_at ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED
       )
       RETURNING *`,
      [limit]
    );

    return result.rows;
  }

  /**
   * Process a single task
   */
  private async processTask(task: AITask): Promise<void> {
    const taskPromise = this.executeTask(task);
    this.activeTasks.set(task.id, taskPromise);
    this.stats.processing++;

    try {
      await taskPromise;
    } finally {
      this.activeTasks.delete(task.id);
      this.stats.processing--;
    }
  }

  /**
   * Execute task with retry logic
   */
  private async executeTask(task: AITask): Promise<void> {
    let attempts = 0;
    let lastError: Error | null = null;

    while (attempts < this.config.retryAttempts) {
      attempts++;

      try {
        await this.runTask(task);

        // Success - update status
        await this.updateTaskStatus(task.id, 'COMPLETED');
        this.stats.succeeded++;
        this.stats.processed++;

        this.emit('taskCompleted', { task, attempts });
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');

        logger.warn(`Task ${task.id} attempt ${attempts} failed`, {
          taskId: task.id,
          taskType: task.task_type,
          error: lastError.message,
        });

        if (attempts < this.config.retryAttempts) {
          this.stats.retried++;
          await this.sleep(this.config.retryDelayMs * attempts); // Exponential backoff
        }
      }
    }

    // All retries exhausted
    await this.updateTaskStatus(task.id, 'FAILED', lastError?.message);
    this.stats.failed++;
    this.stats.processed++;

    this.emit('taskFailed', { task, error: lastError, attempts });
  }

  /**
   * Run the actual task based on type
   */
  private async runTask(task: AITask): Promise<void> {
    const ctx: AIContext = {
      tenantId: task.tenant_id,
      userId: 'system',
      requestId: `worker-${task.id}`,
      trace: [],
    };

    // Wrap in timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Task timeout')), this.config.taskTimeoutMs);
    });

    const taskPromise = (async () => {
      switch (task.task_type) {
        case 'ENRICHMENT':
          await this.runEnrichmentTask(ctx, task);
          break;

        case 'MATCHING':
          await this.runMatchingTask(ctx, task);
          break;

        case 'CONFLICT_DETECTION':
          await this.runConflictTask(ctx, task);
          break;

        case 'EMBEDDING_GENERATION':
          await this.runEmbeddingTask(ctx, task);
          break;

        case 'BATCH_PROCESS':
          await this.runBatchTask(ctx, task);
          break;

        default:
          throw new Error(`Unknown task type: ${task.task_type}`);
      }
    })();

    await Promise.race([taskPromise, timeoutPromise]);
  }

  /**
   * Run enrichment task
   */
  private async runEnrichmentTask(ctx: AIContext, task: AITask): Promise<void> {
    // Get work data
    const workResult = await tenantQuery(
      ctx,
      `SELECT w.*, array_agg(wr.first_name || ' ' || wr.last_name) as writer_names
       FROM works w
       LEFT JOIN writers_in_works wiw ON w.id = wiw.work_id
       LEFT JOIN writers wr ON wiw.writer_id = wr.id
       WHERE w.id = $1
       GROUP BY w.id`,
      [task.entity_id]
    );

    if (workResult.rows.length === 0) {
      throw new Error(`Work not found: ${task.entity_id}`);
    }

    const work = workResult.rows[0];

    await this.enrichmentAgent.enrichWork(ctx, {
      workId: task.entity_id,
      title: work.title,
      writers: work.writer_names?.filter(Boolean) || [],
      existingIswc: work.iswc,
      sources: task.input?.sources || ['musicbrainz', 'discogs'],
      autoApply: task.input?.autoApply || false,
    });
  }

  /**
   * Run matching task
   */
  private async runMatchingTask(ctx: AIContext, task: AITask): Promise<void> {
    // Get statement line data
    const lineResult = await tenantQuery(
      ctx,
      'SELECT * FROM royalty_statement_lines WHERE id = $1',
      [task.entity_id]
    );

    if (lineResult.rows.length === 0) {
      throw new Error(`Statement line not found: ${task.entity_id}`);
    }

    const line = lineResult.rows[0];

    const result = await this.matchingAgent.match(ctx, {
      statementLineId: task.entity_id,
      title: line.song_title,
      writers: line.writer_names || [],
      performer: line.performer_names?.[0],
      isrc: line.isrc,
      iswc: line.iswc,
    });

    // Auto-apply high confidence matches
    if (result.recommendation === 'auto_match' && result.bestMatch) {
      await tenantQuery(
        ctx,
        `UPDATE royalty_statement_lines
         SET matched_work_id = $1,
             match_status = 'AUTO_MATCHED',
             match_confidence = $2,
             match_method = 'ai_worker'
         WHERE id = $3`,
        [result.bestMatch.workId, result.bestMatch.confidence, task.entity_id]
      );
    }
  }

  /**
   * Run conflict detection task
   */
  private async runConflictTask(ctx: AIContext, task: AITask): Promise<void> {
    // Get comprehensive work data
    const workResult = await tenantQuery(
      ctx,
      `SELECT w.*,
              json_agg(DISTINCT jsonb_build_object(
                'id', wr.id,
                'name', wr.first_name || ' ' || wr.last_name,
                'ipi', wr.ipi_name_number,
                'prShare', wiw.pr_share,
                'mrShare', wiw.mr_share,
                'srShare', wiw.sr_share,
                'role', wiw.role,
                'controlled', wiw.is_controlled
              )) FILTER (WHERE wr.id IS NOT NULL) as writers,
              json_agg(DISTINCT jsonb_build_object(
                'id', p.id,
                'name', p.name,
                'ipi', p.ipi_name_number,
                'prShare', piw.pr_share,
                'mrShare', piw.mr_share,
                'srShare', piw.sr_share,
                'role', piw.role,
                'controlled', p.is_controlled
              )) FILTER (WHERE p.id IS NOT NULL) as publishers
       FROM works w
       LEFT JOIN writers_in_works wiw ON w.id = wiw.work_id
       LEFT JOIN writers wr ON wiw.writer_id = wr.id
       LEFT JOIN publishers_in_works piw ON w.id = piw.work_id
       LEFT JOIN publishers p ON piw.publisher_id = p.id
       WHERE w.id = $1
       GROUP BY w.id`,
      [task.entity_id]
    );

    if (workResult.rows.length === 0) {
      throw new Error(`Work not found: ${task.entity_id}`);
    }

    const work = workResult.rows[0];

    await this.conflictAgent.checkConflicts(ctx, {
      workId: task.entity_id,
      title: work.title,
      iswc: work.iswc,
      writers: work.writers || [],
      publishers: work.publishers || [],
    });
  }

  /**
   * Run embedding generation task
   */
  private async runEmbeddingTask(ctx: AIContext, task: AITask): Promise<void> {
    if (task.entity_type === 'WORK') {
      // Get work data
      const workResult = await tenantQuery(
        ctx,
        `SELECT w.id, w.title,
                array_agg(json_build_object('name', wr.first_name || ' ' || wr.last_name, 'ipi', wr.ipi_name_number)) as writers
         FROM works w
         LEFT JOIN writers_in_works wiw ON w.id = wiw.work_id
         LEFT JOIN writers wr ON wiw.writer_id = wr.id
         WHERE w.id = $1
         GROUP BY w.id`,
        [task.entity_id]
      );

      if (workResult.rows.length === 0) {
        throw new Error(`Work not found: ${task.entity_id}`);
      }

      const work = workResult.rows[0];
      const embedding = await this.embeddingService.embedWork({
        id: work.id,
        title: work.title,
        writers: work.writers?.filter((w: any) => w.name) || [],
      });

      // Store in database
      await tenantQuery(
        ctx,
        `INSERT INTO work_embeddings (work_id, title_embedding, writer_embedding, combined_embedding, model_version)
         VALUES ($1, $2, $3, $4, 'text-embedding-3-small')
         ON CONFLICT (work_id) DO UPDATE SET
           title_embedding = EXCLUDED.title_embedding,
           writer_embedding = EXCLUDED.writer_embedding,
           combined_embedding = EXCLUDED.combined_embedding,
           updated_at = NOW()`,
        [
          task.entity_id,
          JSON.stringify(embedding.titleEmbedding),
          JSON.stringify(embedding.writerEmbedding),
          JSON.stringify(embedding.combinedEmbedding),
        ]
      );
    }
  }

  /**
   * Run batch processing task
   */
  private async runBatchTask(ctx: AIContext, task: AITask): Promise<void> {
    const { workIds, operations } = task.input || {};

    if (!workIds || !Array.isArray(workIds)) {
      throw new Error('Invalid batch task input: missing workIds');
    }

    // Process in smaller batches to avoid overwhelming the system
    const batchSize = 10;
    for (let i = 0; i < workIds.length; i += batchSize) {
      const batch = workIds.slice(i, i + batchSize);

      await Promise.all(
        batch.map((workId: string) =>
          this.orchestrator.process(ctx, {
            workId,
            operations: operations || ['conflicts'],
          })
        )
      );
    }
  }

  /**
   * Update task status in database
   */
  private async updateTaskStatus(
    taskId: string,
    status: 'COMPLETED' | 'FAILED',
    errorMessage?: string
  ): Promise<void> {
    await pool.query(
      `UPDATE ai_tasks
       SET status = $1,
           completed_at = NOW(),
           error_message = $2
       WHERE id = $3`,
      [status, errorMessage || null, taskId]
    );
  }

  /**
   * Get worker statistics
   */
  getStats(): WorkerStats {
    return {
      ...this.stats,
      uptime: this.isRunning ? Date.now() - this.startTime : 0,
    };
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// --------------------------------------------------------------------------
// Singleton Instance
// --------------------------------------------------------------------------

let workerInstance: AIWorker | null = null;

export function getAIWorker(): AIWorker {
  if (!workerInstance) {
    workerInstance = new AIWorker();
  }
  return workerInstance;
}

export async function startAIWorker(config?: Partial<WorkerConfig>): Promise<AIWorker> {
  workerInstance = new AIWorker(config);
  await workerInstance.start();
  return workerInstance;
}

export async function stopAIWorker(): Promise<void> {
  if (workerInstance) {
    await workerInstance.stop();
    workerInstance = null;
  }
}
