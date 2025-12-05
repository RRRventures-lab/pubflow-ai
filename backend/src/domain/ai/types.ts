// ============================================================================
// PubFlow AI - AI Agent Types
// ============================================================================

// ----------------------------------------------------------------------------
// Common AI Types
// ----------------------------------------------------------------------------

export interface AIContext {
  tenantId: string;
  userId: string;
  requestId: string;
  traceId?: string;
}

export interface AIResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  confidence: number;
  processingTimeMs: number;
  tokensUsed?: number;
  model?: string;
}

export interface AIAuditLog {
  id: string;
  tenantId: string;
  agentType: AgentType;
  action: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  confidence: number;
  approved: boolean;
  approvedBy?: string;
  approvedAt?: Date;
  createdAt: Date;
}

export type AgentType = 'enrichment' | 'matching' | 'conflict' | 'orchestrator';

// ----------------------------------------------------------------------------
// Embedding Types
// ----------------------------------------------------------------------------

export interface EmbeddingRequest {
  texts: string[];
  model?: EmbeddingModel;
}

export interface EmbeddingResult {
  embeddings: number[][];
  model: string;
  dimensions: number;
  tokensUsed: number;
}

export type EmbeddingModel =
  | 'text-embedding-3-small'
  | 'text-embedding-3-large'
  | 'text-embedding-ada-002';

export interface WorkEmbedding {
  workId: string;
  titleEmbedding: number[];
  writerEmbedding: number[];
  combinedEmbedding: number[];
  model: string;
  createdAt: Date;
  updatedAt: Date;
}

// ----------------------------------------------------------------------------
// Enrichment Agent Types
// ----------------------------------------------------------------------------

export interface EnrichmentSource {
  name: 'musicbrainz' | 'discogs' | 'ascap' | 'bmi' | 'sesac' | 'prs' | 'gema';
  priority: number;
  enabled: boolean;
  rateLimit: number; // requests per second
}

export interface EnrichmentRequest {
  workId: string;
  title: string;
  writers?: string[];
  performers?: string[];
  isrc?: string;
  iswc?: string;
  sources?: EnrichmentSource['name'][];
}

export interface EnrichmentProposal {
  id: string;
  workId: string;
  field: EnrichableField;
  currentValue: string | null;
  proposedValue: string;
  source: EnrichmentSource['name'];
  confidence: number;
  evidence: EnrichmentEvidence[];
  status: 'pending' | 'approved' | 'rejected' | 'auto_applied';
  createdAt: Date;
  reviewedAt?: Date;
  reviewedBy?: string;
}

export type EnrichableField =
  | 'iswc'
  | 'isrc'
  | 'duration'
  | 'language'
  | 'releaseDate'
  | 'performer'
  | 'writerIpi'
  | 'publisherIpi'
  | 'alternateTitle'
  | 'recordingInfo';

export interface EnrichmentEvidence {
  source: string;
  url?: string;
  matchScore: number;
  rawData: Record<string, unknown>;
  timestamp: Date;
}

export interface EnrichmentResult {
  workId: string;
  proposals: EnrichmentProposal[];
  sourcesQueried: EnrichmentSource['name'][];
  totalMatches: number;
  processingTimeMs: number;
}

// MusicBrainz Types
export interface MusicBrainzWork {
  id: string;
  title: string;
  iswc?: string;
  type?: string;
  language?: string;
  disambiguation?: string;
  relations?: MusicBrainzRelation[];
  'artist-credit'?: MusicBrainzArtistCredit[];
}

export interface MusicBrainzRelation {
  type: string;
  'target-type': string;
  artist?: {
    id: string;
    name: string;
    'sort-name': string;
  };
  recording?: {
    id: string;
    title: string;
    isrcs?: string[];
    length?: number;
  };
}

export interface MusicBrainzArtistCredit {
  artist: {
    id: string;
    name: string;
    'sort-name': string;
  };
  joinphrase?: string;
}

// Discogs Types
export interface DiscogsRelease {
  id: number;
  title: string;
  year?: number;
  artists?: DiscogsArtist[];
  tracklist?: DiscogsTrack[];
  genres?: string[];
  styles?: string[];
  labels?: DiscogsLabel[];
}

export interface DiscogsArtist {
  id: number;
  name: string;
  role?: string;
}

export interface DiscogsTrack {
  position: string;
  title: string;
  duration?: string;
  extraartists?: DiscogsArtist[];
}

export interface DiscogsLabel {
  id: number;
  name: string;
  catno?: string;
}

// ----------------------------------------------------------------------------
// Matching Agent Types
// ----------------------------------------------------------------------------

export interface MatchingRequest {
  title: string;
  writers?: string[];
  performers?: string[];
  isrc?: string;
  iswc?: string;
  source?: string;
  amount?: number;
  additionalContext?: Record<string, unknown>;
}

export interface MatchCandidate {
  workId: string;
  title: string;
  iswc?: string;
  writers: string[];
  score: number;
  matchType: MatchType;
  matchDetails: MatchDetail[];
  explanation?: string;
}

export type MatchType = 'exact' | 'fuzzy' | 'semantic' | 'ai_reranked';

export interface MatchDetail {
  field: string;
  inputValue: string;
  matchedValue: string;
  similarity: number;
  method: 'exact' | 'levenshtein' | 'phonetic' | 'vector' | 'gpt';
}

export interface MatchingResult {
  candidates: MatchCandidate[];
  bestMatch?: MatchCandidate;
  autoMatchThreshold: number;
  reviewThreshold: number;
  recommendation: 'auto_match' | 'review' | 'no_match' | 'create_new';
  processingTimeMs: number;
  pipelineStages: PipelineStage[];
}

export interface PipelineStage {
  name: string;
  candidatesIn: number;
  candidatesOut: number;
  timeMs: number;
}

export interface VectorSearchOptions {
  topK: number;
  minSimilarity: number;
  includeMetadata: boolean;
  filter?: Record<string, unknown>;
}

export interface VectorSearchResult {
  workId: string;
  similarity: number;
  metadata?: Record<string, unknown>;
}

// ----------------------------------------------------------------------------
// Conflict Detection Agent Types
// ----------------------------------------------------------------------------

export interface ConflictCheckRequest {
  workId: string;
  title: string;
  iswc?: string;
  writers: WriterShare[];
  publishers: PublisherShare[];
  territories?: string[];
}

export interface WriterShare {
  writerId: string;
  name: string;
  ipi?: string;
  role: string;
  prShare: number;
  mrShare: number;
  srShare: number;
  controlled: boolean;
  society?: string;
}

export interface PublisherShare {
  publisherId: string;
  name: string;
  ipi?: string;
  role: string;
  prShare: number;
  mrShare: number;
  srShare: number;
  controlled: boolean;
  society?: string;
}

export interface Conflict {
  id: string;
  workId: string;
  type: ConflictType;
  severity: 'error' | 'warning' | 'info';
  description: string;
  details: ConflictDetails;
  suggestedResolution?: string;
  autoResolvable: boolean;
  status: 'open' | 'resolved' | 'ignored';
  createdAt: Date;
  resolvedAt?: Date;
  resolvedBy?: string;
}

export type ConflictType =
  | 'share_total_invalid'       // Shares don't sum to 100%
  | 'duplicate_iswc'            // Same ISWC on multiple works
  | 'duplicate_work'            // Semantic duplicate detection
  | 'writer_conflict'           // Same writer with different shares
  | 'territory_overlap'         // Conflicting territory claims
  | 'missing_controlled_party'  // No controlled writer/publisher
  | 'ipi_mismatch'              // IPI doesn't match name
  | 'society_affiliation';      // Inconsistent society affiliations

export interface ConflictDetails {
  // For share_total_invalid
  shareType?: 'PR' | 'MR' | 'SR';
  expectedTotal?: number;
  actualTotal?: number;

  // For duplicate_iswc or duplicate_work
  duplicateWorkId?: string;
  duplicateWorkTitle?: string;
  similarityScore?: number;

  // For writer_conflict
  writerId?: string;
  writerName?: string;
  existingShare?: number;
  newShare?: number;

  // For territory_overlap
  territory?: string;
  claimingParties?: string[];

  // For ipi_mismatch
  expectedIpi?: string;
  actualIpi?: string;

  // Generic
  affectedFields?: string[];
  rawData?: Record<string, unknown>;
}

export interface ConflictCheckResult {
  workId: string;
  conflicts: Conflict[];
  passed: boolean;
  checkedRules: string[];
  processingTimeMs: number;
}

// ----------------------------------------------------------------------------
// Orchestrator Types
// ----------------------------------------------------------------------------

export interface OrchestratorRequest {
  action: OrchestratorAction;
  workId?: string;
  workData?: Partial<ConflictCheckRequest>;
  matchingData?: MatchingRequest;
  options?: OrchestratorOptions;
}

export type OrchestratorAction =
  | 'enrich_work'
  | 'match_statement'
  | 'check_conflicts'
  | 'full_analysis'
  | 'batch_enrich'
  | 'batch_match';

export interface OrchestratorOptions {
  autoApplyEnrichments: boolean;
  enrichmentConfidenceThreshold: number;
  matchingAutoMatchThreshold: number;
  matchingReviewThreshold: number;
  skipConflictCheck: boolean;
  maxConcurrency: number;
  timeout: number;
}

export interface OrchestratorResult {
  action: OrchestratorAction;
  enrichmentResult?: EnrichmentResult;
  matchingResult?: MatchingResult;
  conflictResult?: ConflictCheckResult;
  summary: OrchestratorSummary;
}

export interface OrchestratorSummary {
  totalProcessed: number;
  enrichmentsProposed: number;
  enrichmentsAutoApplied: number;
  matchesFound: number;
  autoMatches: number;
  reviewRequired: number;
  conflictsFound: number;
  conflictsByType: Record<ConflictType, number>;
  processingTimeMs: number;
  errors: string[];
}

// ----------------------------------------------------------------------------
// Configuration Types
// ----------------------------------------------------------------------------

export interface AIConfig {
  openai: {
    apiKey: string;
    embeddingModel: EmbeddingModel;
    chatModel: string;
    maxTokens: number;
    temperature: number;
  };
  enrichment: {
    enabled: boolean;
    autoApplyThreshold: number;
    sources: EnrichmentSource[];
    maxProposalsPerWork: number;
  };
  matching: {
    enabled: boolean;
    autoMatchThreshold: number;
    reviewThreshold: number;
    vectorSearchTopK: number;
    enableGptReranking: boolean;
  };
  conflicts: {
    enabled: boolean;
    shareTolerancePercent: number;
    duplicateSimilarityThreshold: number;
  };
}
