// ============================================================================
// PubFlow AI - Queue Connection (BullMQ/Redis)
// ============================================================================

import { Queue, Worker, QueueEvents, ConnectionOptions } from 'bullmq';
import { logger } from '../logging/logger.js';

// ============================================================================
// Redis Connection Configuration
// ============================================================================

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  maxRetriesPerRequest?: number;
}

const defaultConfig: RedisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || '0', 10),
  maxRetriesPerRequest: null as any, // Required for BullMQ
};

export function getRedisConnection(): ConnectionOptions {
  return {
    host: defaultConfig.host,
    port: defaultConfig.port,
    password: defaultConfig.password,
    db: defaultConfig.db,
    maxRetriesPerRequest: null,
  };
}

// ============================================================================
// Queue Registry
// ============================================================================

const queues = new Map<string, Queue>();
const workers = new Map<string, Worker>();
const queueEvents = new Map<string, QueueEvents>();

/**
 * Get or create a queue
 */
export function getQueue(name: string): Queue {
  if (!queues.has(name)) {
    const queue = new Queue(name, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: {
          count: 1000,
          age: 24 * 60 * 60, // 24 hours
        },
        removeOnFail: {
          count: 5000,
          age: 7 * 24 * 60 * 60, // 7 days
        },
      },
    });

    queues.set(name, queue);
    logger.info('Queue created', { queue: name });
  }

  return queues.get(name)!;
}

/**
 * Register a worker for a queue
 */
export function registerWorker(
  queueName: string,
  processor: (job: any) => Promise<any>,
  options: { concurrency?: number } = {}
): Worker {
  if (workers.has(queueName)) {
    logger.warn('Worker already registered', { queue: queueName });
    return workers.get(queueName)!;
  }

  const worker = new Worker(queueName, processor, {
    connection: getRedisConnection(),
    concurrency: options.concurrency || 5,
  });

  // Event handlers
  worker.on('completed', (job) => {
    logger.info('Job completed', {
      queue: queueName,
      jobId: job.id,
      jobName: job.name,
    });
  });

  worker.on('failed', (job, err) => {
    logger.error('Job failed', {
      queue: queueName,
      jobId: job?.id,
      jobName: job?.name,
      error: err.message,
    });
  });

  worker.on('error', (err) => {
    logger.error('Worker error', { queue: queueName, error: err.message });
  });

  workers.set(queueName, worker);
  logger.info('Worker registered', { queue: queueName, concurrency: options.concurrency || 5 });

  return worker;
}

/**
 * Get queue events for monitoring
 */
export function getQueueEvents(queueName: string): QueueEvents {
  if (!queueEvents.has(queueName)) {
    const events = new QueueEvents(queueName, {
      connection: getRedisConnection(),
    });
    queueEvents.set(queueName, events);
  }

  return queueEvents.get(queueName)!;
}

/**
 * Graceful shutdown
 */
export async function shutdownQueues(): Promise<void> {
  logger.info('Shutting down queues...');

  // Close workers first
  for (const [name, worker] of workers) {
    logger.debug('Closing worker', { queue: name });
    await worker.close();
  }
  workers.clear();

  // Close queue events
  for (const [name, events] of queueEvents) {
    logger.debug('Closing queue events', { queue: name });
    await events.close();
  }
  queueEvents.clear();

  // Close queues
  for (const [name, queue] of queues) {
    logger.debug('Closing queue', { queue: name });
    await queue.close();
  }
  queues.clear();

  logger.info('All queues shut down');
}

// ============================================================================
// Queue Names
// ============================================================================

export const QUEUE_NAMES = {
  CWR_GENERATION: 'cwr-generation',
  CWR_ACKNOWLEDGEMENT: 'cwr-acknowledgement',
  ROYALTY_PROCESSING: 'royalty-processing',
  AI_ENRICHMENT: 'ai-enrichment',
  AI_MATCHING: 'ai-matching',
  NOTIFICATIONS: 'notifications',
} as const;

export type QueueName = typeof QUEUE_NAMES[keyof typeof QUEUE_NAMES];
