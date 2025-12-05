// ============================================================================
// PubFlow AI - Royalty Processing Types
// Types for statement processing, matching, and distribution
// ============================================================================

// ============================================================================
// Statement Types
// ============================================================================

export type StatementFormat = 'csv' | 'excel' | 'edi' | 'json';
export type StatementSource =
  | 'ASCAP' | 'BMI' | 'SESAC' | 'GMR'     // US PROs
  | 'PRS' | 'MCPS'                         // UK
  | 'SACEM' | 'SDRM'                       // France
  | 'GEMA'                                 // Germany
  | 'SPOTIFY' | 'APPLE' | 'AMAZON'         // DSPs
  | 'YOUTUBE' | 'TIKTOK' | 'META'          // Social
  | 'CUSTOM';                              // User-defined

export type RightType = 'performance' | 'mechanical' | 'sync' | 'print' | 'other';
export type UsageType = 'streaming' | 'download' | 'broadcast' | 'live' | 'background' | 'other';

export interface StatementMetadata {
  id: string;
  tenantId: string;
  filename: string;
  format: StatementFormat;
  source: StatementSource;
  period: {
    start: Date;
    end: Date;
  };
  currency: string;
  totalAmount: number;
  rowCount: number;
  uploadedAt: Date;
  uploadedBy: string;
  status: StatementStatus;
  processingStartedAt?: Date;
  processingCompletedAt?: Date;
  errorMessage?: string;
}

export type StatementStatus =
  | 'uploaded'      // File uploaded, not processed
  | 'mapping'       // Column mapping in progress
  | 'processing'    // Being processed
  | 'matching'      // Match phase
  | 'review'        // Needs human review
  | 'completed'     // Fully processed
  | 'failed';       // Processing failed

// ============================================================================
// Statement Row (Raw Input)
// ============================================================================

export interface StatementRow {
  rowNumber: number;
  rawData: Record<string, string | number | null>;

  // Normalized fields (after column mapping)
  workTitle?: string;
  writerName?: string;
  writerFirstName?: string;
  writerLastName?: string;
  performerName?: string;
  iswc?: string;
  isrc?: string;
  workCode?: string;           // Society/DSP work ID
  publisherCode?: string;

  // Financial
  amount: number;
  currency?: string;
  rightType?: RightType;
  usageType?: UsageType;
  usageCount?: number;         // Plays, streams, etc.

  // Metadata
  territory?: string;          // ISO country code or TIS code
  periodStart?: Date;
  periodEnd?: Date;

  // Processing
  matchStatus?: MatchStatus;
  matchedWorkId?: string;
  matchConfidence?: number;
  matchMethod?: MatchMethod;
  reviewStatus?: ReviewStatus;
  reviewedBy?: string;
  reviewedAt?: Date;
}

// ============================================================================
// Column Mapping
// ============================================================================

export interface ColumnMapping {
  sourceColumn: string;
  targetField: keyof StatementRow | null;
  transform?: ColumnTransform;
  required?: boolean;
}

export type ColumnTransform =
  | 'none'
  | 'uppercase'
  | 'lowercase'
  | 'trim'
  | 'parseNumber'
  | 'parseDate'
  | 'splitName'         // "Last, First" -> separate fields
  | 'normalizeISWC'
  | 'normalizeISRC';

export interface ColumnMappingTemplate {
  id: string;
  name: string;
  source: StatementSource;
  mappings: ColumnMapping[];
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Matching Types
// ============================================================================

export type MatchStatus =
  | 'pending'           // Not yet processed
  | 'exact'             // Exact match found (ISWC/ISRC)
  | 'fuzzy_high'        // High confidence fuzzy match (>95%)
  | 'fuzzy_medium'      // Medium confidence (70-95%)
  | 'fuzzy_low'         // Low confidence (<70%)
  | 'no_match'          // No match found
  | 'manual'            // Manually matched
  | 'rejected';         // Manually rejected

export type MatchMethod =
  | 'iswc'              // Matched by ISWC
  | 'isrc'              // Matched by ISRC
  | 'work_code'         // Matched by publisher work code
  | 'title_writer'      // Matched by title + writer
  | 'vector_similarity' // AI vector embedding match
  | 'gpt_rerank'        // GPT-4 reranked
  | 'manual';           // Human matched

export type ReviewStatus =
  | 'pending'           // Awaiting review
  | 'approved'          // Match approved
  | 'rejected'          // Match rejected
  | 'rematched';        // Rematched to different work

export interface MatchCandidate {
  workId: string;
  workCode: string;
  title: string;
  iswc?: string;
  writers: string[];
  score: number;
  method: MatchMethod;
  explanation?: string;
}

export interface MatchResult {
  rowNumber: number;
  status: MatchStatus;
  confidence: number;
  matchedWorkId?: string;
  method?: MatchMethod;
  candidates: MatchCandidate[];
  processingTimeMs: number;
}

// ============================================================================
// Distribution Types
// ============================================================================

export interface Distribution {
  id: string;
  statementId: string;
  workId: string;
  writerId?: string;
  publisherId?: string;

  // Amounts
  grossAmount: number;
  sharePercentage: number;
  netAmount: number;

  // Context
  rightType: RightType;
  usageType?: UsageType;
  territory?: string;
  period: {
    start: Date;
    end: Date;
  };

  // Source tracking
  sourceRowNumbers: number[];
  currency: string;

  // Status
  status: DistributionStatus;
  payoutId?: string;
  paidAt?: Date;
}

export type DistributionStatus =
  | 'calculated'        // Distribution calculated
  | 'approved'          // Approved for payout
  | 'processing'        // Payout in progress
  | 'paid'              // Paid out
  | 'held'              // On hold
  | 'disputed';         // Under dispute

export interface DistributionSummary {
  statementId: string;
  totalGross: number;
  totalDistributed: number;
  totalUndistributed: number;
  matchRate: number;
  byRightType: Record<RightType, number>;
  byWriter: Array<{
    writerId: string;
    writerName: string;
    amount: number;
    percentage: number;
  }>;
  byPublisher: Array<{
    publisherId: string;
    publisherName: string;
    amount: number;
    percentage: number;
  }>;
}

// ============================================================================
// Processing Context
// ============================================================================

export interface ProcessingContext {
  tenantId: string;
  statementId: string;
  userId: string;

  // Caches (zero-query pattern)
  workCache: Map<string, CachedWork>;
  iswcIndex: Map<string, string>;     // ISWC -> workId
  isrcIndex: Map<string, string[]>;   // ISRC -> workIds
  workCodeIndex: Map<string, string>; // workCode -> workId

  // Vector search
  embeddingsReady: boolean;

  // Stats
  stats: ProcessingStats;
}

export interface CachedWork {
  id: string;
  workCode: string;
  title: string;
  normalizedTitle: string;
  iswc?: string;
  writers: Array<{
    id: string;
    firstName: string;
    lastName: string;
    fullName: string;
    normalizedName: string;
    share: number;
    isControlled: boolean;
  }>;
  publishers: Array<{
    id: string;
    code: string;
    name: string;
    share: number;
  }>;
  recordings: Array<{
    isrc?: string;
    title: string;
  }>;
  embedding?: number[];
}

export interface ProcessingStats {
  totalRows: number;
  processedRows: number;
  exactMatches: number;
  fuzzyMatches: number;
  noMatches: number;
  reviewRequired: number;
  errors: number;
  startTime: Date;
  endTime?: Date;
  averageMatchTimeMs: number;
}

// ============================================================================
// AI Matching Configuration
// ============================================================================

export interface MatchingConfig {
  // Thresholds
  exactMatchEnabled: boolean;
  fuzzyMatchEnabled: boolean;
  autoMatchThreshold: number;       // Default: 0.95 (auto-approve above)
  reviewThreshold: number;          // Default: 0.70 (review between this and auto)
  noMatchThreshold: number;         // Default: 0.30 (reject below)

  // Vector search
  vectorSearchEnabled: boolean;
  vectorCandidateCount: number;     // Default: 50

  // GPT reranking
  gptRerankEnabled: boolean;
  gptRerankTopK: number;            // Default: 10
  gptModel: string;                 // Default: 'gpt-4-turbo'

  // Performance
  batchSize: number;                // Default: 100
  concurrency: number;              // Default: 5
  timeoutMs: number;                // Default: 30000
}

export const DEFAULT_MATCHING_CONFIG: MatchingConfig = {
  exactMatchEnabled: true,
  fuzzyMatchEnabled: true,
  autoMatchThreshold: 0.95,
  reviewThreshold: 0.70,
  noMatchThreshold: 0.30,
  vectorSearchEnabled: true,
  vectorCandidateCount: 50,
  gptRerankEnabled: true,
  gptRerankTopK: 10,
  gptModel: 'gpt-4-turbo',
  batchSize: 100,
  concurrency: 5,
  timeoutMs: 30000,
};
