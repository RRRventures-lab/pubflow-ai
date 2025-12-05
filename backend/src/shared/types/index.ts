// ============================================================================
// PubFlow AI - Core Domain Types
// Based on CISAC/CWR specifications and django-music-publisher models
// ============================================================================

// --------------------------------------------------------------------------
// Writer Types
// --------------------------------------------------------------------------

export type WriterRole = 'C' | 'A' | 'CA' | 'AR' | 'AD' | 'TR' | 'SA' | 'SR';
// C = Composer, A = Author/Lyricist, CA = Composer-Author
// AR = Arranger, AD = Adaptor, TR = Translator
// SA = Sub-Arranger, SR = Sub-Author

export interface Writer {
  id: string;
  tenantId: string;
  firstName: string;
  lastName: string;
  ipiNameNumber?: string;      // 11 digits, modulo 101 checksum
  ipiBaseNumber?: string;      // I-NNNNNNNNN-C format
  prSociety?: string;          // CISAC society code (3 chars)
  mrSociety?: string;
  srSociety?: string;
  publisherCode?: string;
  isControlled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface WriterInWork {
  id: string;
  workId: string;
  writerId: string;
  role: WriterRole;
  share: number;               // Percentage 0-100 (2 decimal places)
  isControlled: boolean;
  publisherId?: string;
  originalPublisherId?: string;
  prShare?: number;            // Performance share
  mrShare?: number;            // Mechanical share
  srShare?: number;            // Sync share
  manuscriptShare?: number;    // Publisher's manuscript share
  createdAt: Date;
  updatedAt: Date;
}

// --------------------------------------------------------------------------
// Work Types
// --------------------------------------------------------------------------

export type WorkType =
  | 'ORI'  // Original Work
  | 'MOD'  // Modified Work
  | 'ARR'  // Arrangement
  | 'TRA'  // Translation
  | 'JAZ'  // Jazz Version
  | 'MED'  // Medley
  | 'POT'  // Potpourri
  | 'UNS'  // Unspecified;

export type VersionType = 'ORI' | 'MOD';

export interface Work {
  id: string;
  tenantId: string;
  title: string;
  iswc?: string;               // T-NNNNNNNNN-C format
  workCode: string;            // Internal catalog code
  workType: WorkType;
  versionType: VersionType;
  duration?: number;           // In seconds
  textMusicRelationship?: 'MTX' | 'MUS' | 'TXT';
  compositeType?: 'COM' | 'MED' | 'POT' | 'UCO';
  excerptType?: 'UNS' | 'MOV' | 'POT';
  musicArrangement?: 'ORI' | 'ARR' | 'UNS';
  lyricAdaptation?: 'ORI' | 'MOD' | 'UNS';
  language?: string;           // ISO 639-2 (3 letter)
  originalTitle?: string;
  registrationDate?: Date;
  lastStatusChange?: Date;

  // Calculated fields
  prOwnership?: number;        // Total controlled PR share
  mrOwnership?: number;        // Total controlled MR share
  srOwnership?: number;        // Total controlled SR share

  // AI metadata
  embedding?: number[];        // pgvector embedding (1536 dimensions)
  embeddingUpdatedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

export interface AlternateTitle {
  id: string;
  workId: string;
  title: string;
  titleType: 'AT' | 'TE' | 'FT' | 'IT' | 'OT' | 'TT' | 'PT' | 'RT' | 'ET' | 'OL' | 'AL';
  // AT=Alternative, TE=First Line of Text, FT=Formal Title, IT=Incorrect Title
  // OT=Original Title, TT=Original Title Transliterated, PT=Part Title
  // RT=Restricted Title, ET=Extra Search Title, OL=Original Title Language, AL=Alternative Language
  language?: string;
  createdAt: Date;
}

// --------------------------------------------------------------------------
// Recording Types
// --------------------------------------------------------------------------

export interface Recording {
  id: string;
  tenantId: string;
  workId: string;
  isrc?: string;               // CC-XXX-YY-NNNNN format
  recordingTitle?: string;
  versionTitle?: string;
  releaseDate?: Date;
  duration?: number;           // In seconds
  recordLabel?: string;
  catalogNumber?: string;
  ean13?: string;              // EAN-13 barcode

  // AI metadata
  embedding?: number[];
  embeddingUpdatedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

export interface PerformingArtist {
  id: string;
  recordingId: string;
  firstName?: string;
  lastName: string;
  ipiNameNumber?: string;
  isni?: string;               // International Standard Name Identifier
  role: 'FEATURED' | 'MAIN' | 'GUEST';
  createdAt: Date;
}

// --------------------------------------------------------------------------
// Publisher Types
// --------------------------------------------------------------------------

export interface Publisher {
  id: string;
  tenantId: string;
  name: string;
  ipiNameNumber?: string;
  ipiBaseNumber?: string;
  prSociety?: string;
  mrSociety?: string;
  srSociety?: string;
  publisherCode: string;       // CWR submitter code (2-3 chars)
  publisherType: 'E' | 'AM' | 'SE' | 'PA' | 'ES';
  // E=Original Publisher, AM=Administrator, SE=Sub-publisher
  // PA=Income Participant, ES=Substitute Publisher
  isControlled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublisherInWork {
  id: string;
  workId: string;
  publisherId: string;
  role: 'E' | 'AM' | 'SE' | 'PA' | 'ES';
  prShare?: number;
  mrShare?: number;
  srShare?: number;
  sequence: number;            // Publisher chain sequence
  specialAgreement?: boolean;
  createdAt: Date;
}

// --------------------------------------------------------------------------
// CWR Types
// --------------------------------------------------------------------------

export type CWRVersion = '21' | '22' | '30' | '31';

export type CWRTransactionType =
  | 'NWR'  // New Work Registration
  | 'REV'  // Revised Registration
  | 'ISW'  // Notification of ISWC
  | 'EXC'  // Existing Work Claim
  | 'ACK'; // Acknowledgement

export type AcknowledgementStatus =
  | 'CO'   // Conflict
  | 'DU'   // Duplicate
  | 'RA'   // Registration Accepted
  | 'AS'   // Agreement Starts
  | 'AC'   // Agreement Claim
  | 'SR'   // Society Registration
  | 'CR'   // Claim Rejected
  | 'RJ'   // Rejected
  | 'NP';  // Not in Portfolio

export interface CWRExport {
  id: string;
  tenantId: string;
  version: CWRVersion;
  submitterCode: string;       // 2-3 character code
  receiverCode: string;        // Target society code
  filename: string;
  fileContent?: string;        // Raw CWR content
  workCount: number;
  transactionType: CWRTransactionType;
  status: 'DRAFT' | 'GENERATED' | 'SUBMITTED' | 'ACKNOWLEDGED' | 'ERROR';
  submittedAt?: Date;
  acknowledgedAt?: Date;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkInCWRExport {
  id: string;
  cwrExportId: string;
  workId: string;
  transactionSequence: number;
  recordSequence: number;
  status: AcknowledgementStatus | 'PENDING';
  societyWorkId?: string;      // Remote work ID from society
  acknowledgedAt?: Date;
  errorDetails?: string;
}

// --------------------------------------------------------------------------
// Royalty Types
// --------------------------------------------------------------------------

export type StatementFormat = 'CSV' | 'XLSX' | 'EDI' | 'XML';

export type MatchStatus =
  | 'UNMATCHED'
  | 'AUTO_MATCHED'
  | 'AI_MATCHED'
  | 'HUMAN_MATCHED'
  | 'REJECTED';

export interface RoyaltyStatement {
  id: string;
  tenantId: string;
  filename: string;
  sourceType: string;          // ASCAP, BMI, SESAC, PRS, etc.
  period: string;              // YYYY-Q1, YYYY-MM, etc.
  format: StatementFormat;
  totalLines: number;
  matchedLines: number;
  unmatchedLines: number;
  totalAmount: number;
  currency: string;
  status: 'UPLOADED' | 'MAPPING' | 'PROCESSING' | 'MATCHING' | 'REVIEW' | 'COMPLETE';
  columnMapping?: Record<string, string>;
  uploadedAt: Date;
  processedAt?: Date;
  completedAt?: Date;
}

export interface RoyaltyStatementLine {
  id: string;
  statementId: string;
  lineNumber: number;
  rawData: Record<string, unknown>;  // Original row data

  // Parsed/mapped fields
  songTitle?: string;
  writerNames?: string[];
  performerNames?: string[];
  iswc?: string;
  isrc?: string;
  amount: number;
  units?: number;
  usageType?: string;
  territory?: string;

  // Matching results
  matchStatus: MatchStatus;
  matchedWorkId?: string;
  matchConfidence?: number;    // 0-1 AI confidence score
  matchMethod?: 'EXACT_ISWC' | 'EXACT_ISRC' | 'FUZZY' | 'AI' | 'MANUAL';
  matchCandidates?: MatchCandidate[];
  reviewedBy?: string;
  reviewedAt?: Date;

  // AI metadata
  embedding?: number[];

  createdAt: Date;
  updatedAt: Date;
}

export interface MatchCandidate {
  workId: string;
  score: number;
  method: 'VECTOR' | 'PHONETIC' | 'EXACT';
  explanation?: string;
}

export interface RoyaltyDistribution {
  id: string;
  tenantId: string;
  statementId: string;
  statementLineId: string;
  workId: string;
  writerId?: string;
  publisherId?: string;

  grossAmount: number;
  feeAmount: number;
  netAmount: number;
  sharePercentage: number;

  status: 'CALCULATED' | 'APPROVED' | 'PAID';
  approvedBy?: string;
  approvedAt?: Date;
  paidAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

// --------------------------------------------------------------------------
// Territory Types
// --------------------------------------------------------------------------

export interface Territory {
  id: string;
  tisCode: string;             // CISAC TIS code (2-4 digits)
  name: string;
  isoCode?: string;            // ISO 3166-1 alpha-2
  parentTisCode?: string;
  isActive: boolean;
}

export interface TerritoryShare {
  workId: string;
  territoryCode: string;
  prShare: number;
  mrShare: number;
  srShare: number;
  includeFlag: boolean;        // Include or exclude from parent
}

// --------------------------------------------------------------------------
// AI Types
// --------------------------------------------------------------------------

export type AITaskType =
  | 'EMBEDDING_GENERATION'
  | 'ENRICHMENT'
  | 'MATCHING'
  | 'CONFLICT_DETECTION'
  | 'DUPLICATE_CHECK';

export type AITaskStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface AITask {
  id: string;
  tenantId: string;
  taskType: AITaskType;
  entityType: 'WORK' | 'WRITER' | 'RECORDING' | 'STATEMENT_LINE';
  entityId: string;
  status: AITaskStatus;
  priority: number;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  confidence?: number;
  errorMessage?: string;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
}

export interface EnrichmentProposal {
  id: string;
  tenantId: string;
  workId: string;
  aiTaskId: string;
  proposalType: 'IPI' | 'ISWC' | 'ISRC' | 'METADATA' | 'WRITER';
  field: string;
  currentValue?: string;
  proposedValue: string;
  source: string;              // MusicBrainz, Discogs, ASCAP, BMI, etc.
  confidence: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewedBy?: string;
  reviewedAt?: Date;
  createdAt: Date;
}

export interface ConflictRecord {
  id: string;
  tenantId: string;
  workId: string;
  conflictType: 'SHARE_MISMATCH' | 'DUPLICATE_ISWC' | 'WRITER_CONFLICT' | 'TERRITORY_OVERLAP' | 'SEMANTIC_DUPLICATE';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  relatedWorkIds?: string[];
  suggestedResolution?: string;
  status: 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'DISMISSED';
  resolvedBy?: string;
  resolvedAt?: Date;
  resolutionNotes?: string;
  createdAt: Date;
  updatedAt: Date;
}

// --------------------------------------------------------------------------
// Multi-Tenancy Types
// --------------------------------------------------------------------------

export interface Tenant {
  id: string;
  name: string;
  slug: string;                // URL-safe identifier
  schemaName: string;          // PostgreSQL schema name
  planId: string;
  settings: TenantSettings;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface TenantSettings {
  branding?: {
    primaryColor?: string;
    logo?: string;
    companyName?: string;
  };
  defaults?: {
    cwrVersion?: CWRVersion;
    submitterCode?: string;
    defaultSociety?: string;
  };
  features?: {
    aiEnrichment?: boolean;
    aiMatching?: boolean;
    cwrGeneration?: boolean;
    royaltyProcessing?: boolean;
  };
}

// --------------------------------------------------------------------------
// User & Auth Types
// --------------------------------------------------------------------------

export type UserRole = 'OWNER' | 'ADMIN' | 'MANAGER' | 'USER' | 'VIEWER';

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  tenantId: string;
  role: UserRole;
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Session {
  id: string;
  userId: string;
  tenantId: string;
  refreshToken: string;
  expiresAt: Date;
  createdAt: Date;
}

// --------------------------------------------------------------------------
// Audit Types
// --------------------------------------------------------------------------

export interface AuditLog {
  id: string;
  tenantId: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  previousValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

// --------------------------------------------------------------------------
// API Response Types
// --------------------------------------------------------------------------

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export interface ValidationResult {
  isValid: boolean;
  errors?: string[];
  warnings?: string[];
  normalizedValue?: string;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}
