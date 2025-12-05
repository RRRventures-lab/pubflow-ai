// ============================================================================
// PubFlow AI - Royalty Domain Module
// Royalty statement processing, matching, and distribution
// ============================================================================

// Types
export type {
  StatementFormat,
  StatementSource,
  RightType,
  UsageType,
  StatementMetadata,
  StatementStatus,
  StatementRow,
  ColumnMapping,
  ColumnTransform,
  ColumnMappingTemplate,
  MatchStatus,
  MatchMethod,
  ReviewStatus,
  MatchCandidate,
  MatchResult,
  Distribution,
  DistributionStatus,
  DistributionSummary,
  ProcessingContext,
  CachedWork,
  ProcessingStats,
  MatchingConfig,
} from './types.js';

export { DEFAULT_MATCHING_CONFIG } from './types.js';

// Statement Parser
export {
  StatementParser,
  statementParser,
} from './statement-parser.js';
export type { ParseResult } from './statement-parser.js';

// Work Cache
export {
  WorkCache,
  workCache,
  normalizeText,
  phoneticEncode,
  stringSimilarity,
  levenshteinDistance,
  levenshteinSimilarity,
} from './work-cache.js';

// Matching Engine
export {
  MatchingEngine,
  matchingEngine,
  createEmbedding,
  vectorSearch,
  gptRerank,
} from './matching-engine.js';
export type { VectorSearchResult, RerankResult } from './matching-engine.js';

// Review Queue
export {
  ReviewQueueService,
  reviewQueueService,
} from './review-queue.js';
export type { ReviewItem, ReviewResolution, ReviewQueueStats } from './review-queue.js';

// Distribution Calculator
export {
  DistributionCalculator,
  distributionCalculator,
} from './distribution-calculator.js';
export type { DistributionInput, DistributionResult } from './distribution-calculator.js';

// Processor (main service)
export {
  RoyaltyProcessor,
  royaltyProcessor,
} from './processor.js';
export type { ProcessingOptions, ProcessingResult } from './processor.js';
