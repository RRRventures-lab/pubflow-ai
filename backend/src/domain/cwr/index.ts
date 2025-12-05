// ============================================================================
// PubFlow AI - CWR Domain Module
// Common Works Registration file generation and processing
// ============================================================================

// Types
export type {
  CWRVersion,
  TransactionType,
  WriterRole,
  PublisherRole,
  TitleType,
  CWRWorkData,
  CWRWriterData,
  CWRPublisherData,
  CWRAlternateTitle,
  CWRRecordingData,
  CWRPerformerData,
  CWRGenerationContext,
  CWRGenerationResult,
} from './types.js';

// Formatter utilities
export {
  rjust,
  ljust,
  zeros,
  formatDate,
  formatTime,
  formatDuration,
  formatShare,
  formatIPI,
  formatISWC,
  formatISRC,
  formatSociety,
  cwrString,
  buildRecord,
} from './formatter.js';

// Record builders
export {
  buildHDR,
  buildGRH,
  buildGRT,
  buildTRL,
  buildWRK,
  buildSPU,
  buildSPT,
  buildSWR,
  buildSWT,
  buildPWR,
  buildOPU,
  buildOWR,
  buildALT,
  buildPER,
  buildREC,
} from './records.js';

// Generator
export {
  ICWRGenerator,
  BaseCWRGenerator,
  CWR21Generator,
  CWR22Generator,
  CWR30Generator,
  CWR31Generator,
  CWRGeneratorFactory,
  generateCWRFilename,
} from './generator.js';

// Share Calculator
export {
  ShareInput,
  PublisherInput,
  ShareCalculationResult,
  ShareCalculator,
  shareCalculator,
  validateShares,
  calculateOwnership,
} from './share-calculator.js';

// Validator
export {
  ValidationSeverity,
  ValidationIssue,
  ValidationResult,
  CWRValidator,
  cwrValidator,
  isWorkCWRReady,
  validateWorksForCWR,
} from './validator.js';

// ACK Parser
export {
  AckStatus,
  ACKRecord,
  ACKParseResult,
  ACKParser,
  ackParser,
} from './ack-parser.js';

// Service
export {
  CWRService,
  cwrService,
} from './service.js';
