// ============================================================================
// PubFlow AI - CWR Validation Service
// Pre-flight checks before CWR generation
// ============================================================================

import { validateIPI, validateISWC, validateISRC } from '../../shared/validators/index.js';
import type { CWRWorkData, CWRWriterData, CWRPublisherData, CWRVersion } from './types.js';

// ============================================================================
// Validation Types
// ============================================================================

export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
  severity: ValidationSeverity;
  code: string;
  message: string;
  field?: string;
  workId?: string;
  workCode?: string;
  writerId?: string;
  publisherId?: string;
}

export interface ValidationResult {
  isValid: boolean;
  canGenerate: boolean;  // true if only warnings, false if errors
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  info: ValidationIssue[];
  summary: {
    totalWorks: number;
    validWorks: number;
    errorCount: number;
    warningCount: number;
  };
}

// ============================================================================
// Validation Rules
// ============================================================================

const SOCIETY_CODES = new Set([
  'ASCAP', 'BMI', 'SESAC', 'GMR',  // US
  'PRS', 'MCPS',                    // UK
  'SACEM', 'SDRM',                  // France
  'GEMA',                           // Germany
  'SGAE',                           // Spain
  'SIAE',                           // Italy
  'JASRAC',                         // Japan
  'APRA', 'AMCOS',                  // Australia
  'SOCAN', 'CMRRA',                 // Canada
  // Add more as needed - use 3-digit TIS codes in production
]);

const WRITER_ROLES = new Set(['CA', 'A', 'AD', 'AR', 'C', 'SA', 'SR', 'TR', 'PA', 'E', 'ES', 'AM', 'SE', 'AQ']);
const PUBLISHER_ROLES = new Set(['E', 'AM', 'PA', 'SE', 'ES', 'AQ']);
const TITLE_TYPES = new Set(['AT', 'TE', 'FT', 'IT', 'OT', 'TT', 'PT', 'RT', 'ET', 'OL', 'AL']);

// ============================================================================
// CWR Validator
// ============================================================================

export class CWRValidator {
  private issues: ValidationIssue[] = [];
  private version: CWRVersion = '21';

  /**
   * Validate works for CWR generation
   */
  validate(works: CWRWorkData[], version: CWRVersion = '21'): ValidationResult {
    this.issues = [];
    this.version = version;

    // Validate each work
    for (const work of works) {
      this.validateWork(work);
    }

    // Categorize issues
    const errors = this.issues.filter(i => i.severity === 'error');
    const warnings = this.issues.filter(i => i.severity === 'warning');
    const info = this.issues.filter(i => i.severity === 'info');

    // Count valid works (no errors)
    const workErrorCounts = new Map<string, number>();
    for (const error of errors) {
      if (error.workCode) {
        workErrorCounts.set(error.workCode, (workErrorCounts.get(error.workCode) || 0) + 1);
      }
    }
    const validWorks = works.filter(w => !workErrorCounts.has(w.workCode)).length;

    return {
      isValid: errors.length === 0,
      canGenerate: errors.length === 0,
      errors,
      warnings,
      info,
      summary: {
        totalWorks: works.length,
        validWorks,
        errorCount: errors.length,
        warningCount: warnings.length,
      },
    };
  }

  /**
   * Validate a single work
   */
  private validateWork(work: CWRWorkData): void {
    // Required fields
    this.validateRequired(work);

    // Work identifiers
    this.validateWorkIdentifiers(work);

    // Writers
    this.validateWriters(work);

    // Publishers
    this.validatePublishers(work);

    // Share totals
    this.validateShares(work);

    // Alternate titles
    this.validateAlternateTitles(work);

    // Recordings
    this.validateRecordings(work);

    // Version-specific validations
    this.validateVersionSpecific(work);
  }

  /**
   * Validate required fields
   */
  private validateRequired(work: CWRWorkData): void {
    if (!work.title || work.title.trim().length === 0) {
      this.addIssue('error', 'MISSING_TITLE', 'Work title is required', work, 'title');
    }

    if (!work.workCode || work.workCode.trim().length === 0) {
      this.addIssue('error', 'MISSING_WORK_CODE', 'Work code (submitter ID) is required', work, 'workCode');
    }

    if (!work.writers || work.writers.length === 0) {
      this.addIssue('error', 'NO_WRITERS', 'Work must have at least one writer', work);
    }

    // Version type required
    if (!work.versionType) {
      this.addIssue('warning', 'MISSING_VERSION_TYPE', 'Version type not specified, defaulting to ORI', work, 'versionType');
    }
  }

  /**
   * Validate work identifiers (ISWC)
   */
  private validateWorkIdentifiers(work: CWRWorkData): void {
    // ISWC validation
    if (work.iswc) {
      const iswcResult = validateISWC(work.iswc);
      if (!iswcResult.isValid) {
        this.addIssue('error', 'INVALID_ISWC', `Invalid ISWC: ${iswcResult.error}`, work, 'iswc');
      }
    } else {
      this.addIssue('info', 'NO_ISWC', 'Work has no ISWC - will be assigned by society', work, 'iswc');
    }

    // Work code format
    if (work.workCode && work.workCode.length > 14) {
      this.addIssue('error', 'WORK_CODE_TOO_LONG', 'Work code exceeds 14 characters', work, 'workCode');
    }

    // Title length
    if (work.title && work.title.length > 60) {
      this.addIssue('warning', 'TITLE_TRUNCATED', 'Title exceeds 60 characters and will be truncated', work, 'title');
    }

    // Duration validation
    if (work.duration !== undefined && work.duration !== null) {
      if (work.duration < 0) {
        this.addIssue('error', 'INVALID_DURATION', 'Duration cannot be negative', work, 'duration');
      } else if (work.duration > 359999) {
        this.addIssue('warning', 'DURATION_EXCEEDS_MAX', 'Duration exceeds maximum CWR value (99:59:59)', work, 'duration');
      }
    }
  }

  /**
   * Validate writers
   */
  private validateWriters(work: CWRWorkData): void {
    const writerCodes = new Set<string>();

    for (const writer of work.writers) {
      // Check for duplicate writer codes
      if (writerCodes.has(writer.code)) {
        this.addIssue('error', 'DUPLICATE_WRITER_CODE', `Duplicate writer code: ${writer.code}`, work, 'writers');
      }
      writerCodes.add(writer.code);

      // Writer name required
      if (!writer.lastName || writer.lastName.trim().length === 0) {
        this.addIssue('error', 'MISSING_WRITER_NAME', `Writer ${writer.code} missing last name`, work, 'writers');
      }

      // Writer role validation
      if (!writer.role || !WRITER_ROLES.has(writer.role)) {
        this.addIssue('error', 'INVALID_WRITER_ROLE', `Writer ${writer.code} has invalid role: ${writer.role}`, work, 'writers');
      }

      // IPI validation for controlled writers
      if (writer.isControlled) {
        if (!writer.ipiNameNumber) {
          this.addIssue('warning', 'CONTROLLED_WRITER_NO_IPI',
            `Controlled writer ${writer.code} has no IPI - may cause rejection`, work, 'writers');
        } else {
          const ipiResult = validateIPI(writer.ipiNameNumber);
          if (!ipiResult.isValid) {
            this.addIssue('error', 'INVALID_WRITER_IPI',
              `Writer ${writer.code} has invalid IPI: ${ipiResult.error}`, work, 'writers');
          }
        }

        // Controlled writer must have society affiliations
        if (!writer.prSociety) {
          this.addIssue('warning', 'CONTROLLED_WRITER_NO_PR_SOCIETY',
            `Controlled writer ${writer.code} has no PR society`, work, 'writers');
        }

        // Controlled writer should link to publisher
        if (!writer.publisherCode) {
          this.addIssue('warning', 'CONTROLLED_WRITER_NO_PUBLISHER',
            `Controlled writer ${writer.code} not linked to publisher`, work, 'writers');
        }
      }

      // Share validation
      if (writer.prShare < 0 || writer.prShare > 100) {
        this.addIssue('error', 'INVALID_PR_SHARE',
          `Writer ${writer.code} PR share out of range: ${writer.prShare}`, work, 'writers');
      }
      if (writer.mrShare < 0 || writer.mrShare > 100) {
        this.addIssue('error', 'INVALID_MR_SHARE',
          `Writer ${writer.code} MR share out of range: ${writer.mrShare}`, work, 'writers');
      }
      if (writer.srShare < 0 || writer.srShare > 100) {
        this.addIssue('error', 'INVALID_SR_SHARE',
          `Writer ${writer.code} SR share out of range: ${writer.srShare}`, work, 'writers');
      }

      // Name length limits
      if (writer.lastName && writer.lastName.length > 45) {
        this.addIssue('warning', 'WRITER_NAME_TRUNCATED',
          `Writer ${writer.code} last name exceeds 45 chars`, work, 'writers');
      }
      if (writer.firstName && writer.firstName.length > 30) {
        this.addIssue('warning', 'WRITER_NAME_TRUNCATED',
          `Writer ${writer.code} first name exceeds 30 chars`, work, 'writers');
      }
    }
  }

  /**
   * Validate publishers
   */
  private validatePublishers(work: CWRWorkData): void {
    const publisherCodes = new Set<string>();
    const controlledWriters = work.writers.filter(w => w.isControlled);

    // Check if controlled writers have publishers
    if (controlledWriters.length > 0 && work.publishers.length === 0) {
      this.addIssue('warning', 'NO_PUBLISHER_FOR_CONTROLLED',
        'Controlled writers exist but no publisher defined', work);
    }

    for (const pub of work.publishers) {
      // Check for duplicate publisher codes
      if (publisherCodes.has(pub.code)) {
        this.addIssue('error', 'DUPLICATE_PUBLISHER_CODE',
          `Duplicate publisher code: ${pub.code}`, work, 'publishers');
      }
      publisherCodes.add(pub.code);

      // Publisher name required
      if (!pub.name || pub.name.trim().length === 0) {
        this.addIssue('error', 'MISSING_PUBLISHER_NAME',
          `Publisher ${pub.code} missing name`, work, 'publishers');
      }

      // IPI validation
      if (pub.ipiNameNumber) {
        const ipiResult = validateIPI(pub.ipiNameNumber);
        if (!ipiResult.isValid) {
          this.addIssue('error', 'INVALID_PUBLISHER_IPI',
            `Publisher ${pub.code} has invalid IPI: ${ipiResult.error}`, work, 'publishers');
        }
      } else {
        this.addIssue('warning', 'PUBLISHER_NO_IPI',
          `Publisher ${pub.code} has no IPI`, work, 'publishers');
      }

      // Role validation
      if (pub.role && !PUBLISHER_ROLES.has(pub.role)) {
        this.addIssue('error', 'INVALID_PUBLISHER_ROLE',
          `Publisher ${pub.code} has invalid role: ${pub.role}`, work, 'publishers');
      }

      // Share validation
      if (pub.prShare < 0 || pub.prShare > 100) {
        this.addIssue('error', 'INVALID_PUBLISHER_PR_SHARE',
          `Publisher ${pub.code} PR share out of range`, work, 'publishers');
      }

      // Name length
      if (pub.name && pub.name.length > 45) {
        this.addIssue('warning', 'PUBLISHER_NAME_TRUNCATED',
          `Publisher ${pub.code} name exceeds 45 chars`, work, 'publishers');
      }
    }

    // Verify all controlled writers link to valid publishers
    for (const writer of controlledWriters) {
      if (writer.publisherCode && !publisherCodes.has(writer.publisherCode)) {
        this.addIssue('error', 'WRITER_PUBLISHER_NOT_FOUND',
          `Writer ${writer.code} links to unknown publisher ${writer.publisherCode}`, work, 'writers');
      }
    }
  }

  /**
   * Validate share totals
   */
  private validateShares(work: CWRWorkData): void {
    // Calculate totals
    const writerPrTotal = work.writers.reduce((sum, w) => sum + (w.prShare || 0), 0);
    const writerMrTotal = work.writers.reduce((sum, w) => sum + (w.mrShare || 0), 0);
    const writerSrTotal = work.writers.reduce((sum, w) => sum + (w.srShare || 0), 0);

    const pubPrTotal = work.publishers.reduce((sum, p) => sum + (p.prShare || 0), 0);
    const pubMrTotal = work.publishers.reduce((sum, p) => sum + (p.mrShare || 0), 0);
    const pubSrTotal = work.publishers.reduce((sum, p) => sum + (p.srShare || 0), 0);

    const totalPr = writerPrTotal + pubPrTotal;
    const totalMr = writerMrTotal + pubMrTotal;
    const totalSr = writerSrTotal + pubSrTotal;

    // PR shares should total 100%
    if (Math.abs(totalPr - 100) > 0.1) {
      this.addIssue('error', 'PR_SHARES_NOT_100',
        `PR shares total ${totalPr.toFixed(2)}%, must equal 100%`, work, 'shares');
    }

    // MR shares should total 100%
    if (Math.abs(totalMr - 100) > 0.1) {
      this.addIssue('error', 'MR_SHARES_NOT_100',
        `MR shares total ${totalMr.toFixed(2)}%, must equal 100%`, work, 'shares');
    }

    // SR shares should total 100%
    if (Math.abs(totalSr - 100) > 0.1) {
      this.addIssue('error', 'SR_SHARES_NOT_100',
        `SR shares total ${totalSr.toFixed(2)}%, must equal 100%`, work, 'shares');
    }

    // Individual share consistency check
    for (const writer of work.writers) {
      if (Math.abs(writer.prShare - writer.mrShare) > 0.01 ||
          Math.abs(writer.mrShare - writer.srShare) > 0.01) {
        // Different shares for different rights is valid but uncommon
        this.addIssue('info', 'DIFFERENT_RIGHT_SHARES',
          `Writer ${writer.code} has different shares for PR/MR/SR`, work, 'writers');
      }
    }
  }

  /**
   * Validate alternate titles
   */
  private validateAlternateTitles(work: CWRWorkData): void {
    if (!work.alternateTitles) return;

    for (const alt of work.alternateTitles) {
      if (!alt.title || alt.title.trim().length === 0) {
        this.addIssue('warning', 'EMPTY_ALT_TITLE', 'Empty alternate title', work, 'alternateTitles');
        continue;
      }

      if (alt.title.length > 60) {
        this.addIssue('warning', 'ALT_TITLE_TRUNCATED',
          `Alternate title "${alt.title.slice(0, 20)}..." exceeds 60 chars`, work, 'alternateTitles');
      }

      if (alt.type && !TITLE_TYPES.has(alt.type)) {
        this.addIssue('warning', 'INVALID_TITLE_TYPE',
          `Invalid title type: ${alt.type}`, work, 'alternateTitles');
      }
    }
  }

  /**
   * Validate recordings
   */
  private validateRecordings(work: CWRWorkData): void {
    if (!work.recordings) return;

    const isrcs = new Set<string>();

    for (const rec of work.recordings) {
      // ISRC validation
      if (rec.isrc) {
        if (isrcs.has(rec.isrc)) {
          this.addIssue('warning', 'DUPLICATE_ISRC',
            `Duplicate ISRC in work: ${rec.isrc}`, work, 'recordings');
        }
        isrcs.add(rec.isrc);

        const isrcResult = validateISRC(rec.isrc);
        if (!isrcResult.isValid) {
          this.addIssue('error', 'INVALID_ISRC',
            `Invalid ISRC: ${isrcResult.error}`, work, 'recordings');
        }
      }

      // Recording title
      if (rec.title && rec.title.length > 60) {
        this.addIssue('warning', 'RECORDING_TITLE_TRUNCATED',
          `Recording title exceeds 60 chars`, work, 'recordings');
      }

      // Duration
      if (rec.duration !== undefined && rec.duration < 0) {
        this.addIssue('error', 'INVALID_RECORDING_DURATION',
          'Recording duration cannot be negative', work, 'recordings');
      }
    }
  }

  /**
   * Version-specific validations
   */
  private validateVersionSpecific(work: CWRWorkData): void {
    // CWR 3.0+ requires additional fields
    if (this.version === '30' || this.version === '31') {
      // CWR 3.x has stricter IPI requirements
      for (const writer of work.writers.filter(w => w.isControlled)) {
        if (!writer.ipiNameNumber) {
          this.addIssue('error', 'CWR3_REQUIRES_IPI',
            `CWR ${this.version} requires IPI for controlled writer ${writer.code}`, work, 'writers');
        }
      }
    }

    // CWR 2.1 specific
    if (this.version === '21') {
      // Some newer fields not supported
      for (const writer of work.writers) {
        if (writer.ipiBaseNumber) {
          this.addIssue('info', 'CWR21_IPI_BASE_IGNORED',
            `IPI Base Number ignored in CWR 2.1 for writer ${writer.code}`, work, 'writers');
        }
      }
    }
  }

  /**
   * Add a validation issue
   */
  private addIssue(
    severity: ValidationSeverity,
    code: string,
    message: string,
    work: CWRWorkData,
    field?: string
  ): void {
    this.issues.push({
      severity,
      code,
      message,
      field,
      workId: work.id,
      workCode: work.workCode,
    });
  }
}

// ============================================================================
// Quick Validation Helpers
// ============================================================================

/**
 * Quick check if work is ready for CWR generation
 */
export function isWorkCWRReady(work: CWRWorkData): boolean {
  const validator = new CWRValidator();
  const result = validator.validate([work]);
  return result.canGenerate;
}

/**
 * Get validation summary for multiple works
 */
export function validateWorksForCWR(works: CWRWorkData[], version: CWRVersion = '21'): ValidationResult {
  const validator = new CWRValidator();
  return validator.validate(works, version);
}

// Export singleton
export const cwrValidator = new CWRValidator();
