// ============================================================================
// PubFlow AI - Queue Infrastructure
// ============================================================================

export {
  getQueue,
  registerWorker,
  getQueueEvents,
  shutdownQueues,
  getRedisConnection,
  QUEUE_NAMES,
} from './connection.js';

export {
  enqueueCWRGeneration,
  enqueueACKProcessing,
  getCWRJobStatus,
  cancelCWRJob,
  startCWRWorkers,
  getCWRQueueStats,
  getRecentCWRJobs,
} from './cwr-queue.js';

export type {
  CWRGenerationJobData,
  CWRAcknowledgementJobData,
  CWRJobResult,
  ACKJobResult,
} from './cwr-queue.js';

// Royalty Queue
export {
  enqueueRoyaltyProcessing,
  enqueueAIMatching,
  enqueueDistributionCalculation,
  getRoyaltyJobStatus,
  startRoyaltyWorkers,
  getRoyaltyQueueStats,
} from './royalty-queue.js';

export type {
  RoyaltyProcessingJobData,
  AIMatchingJobData,
  DistributionJobData,
  RoyaltyJobResult,
} from './royalty-queue.js';
