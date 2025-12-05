// ============================================================================
// PubFlow AI - CWR Generator Service
// Main orchestrator for CWR file generation
// ============================================================================

import {
  buildHDR, buildGRH, buildWRK, buildSPU, buildSPT, buildSWR, buildSWT,
  buildPWR, buildOPU, buildOWR, buildALT, buildPER, buildREC, buildGRT, buildTRL
} from './records.js';
import type {
  CWRVersion, CWRWorkData, CWRGenerationContext, CWRGenerationResult,
  TransactionType, CWRWriterData, CWRPublisherData
} from './types.js';
import { logger } from '../../infrastructure/logging/logger.js';

// ============================================================================
// CWR Generator Interface
// ============================================================================

export interface ICWRGenerator {
  generate(works: CWRWorkData[]): CWRGenerationResult;
  getVersion(): CWRVersion;
}

// ============================================================================
// Base CWR Generator
// ============================================================================

export abstract class BaseCWRGenerator implements ICWRGenerator {
  protected ctx: CWRGenerationContext;
  protected records: string[] = [];
  protected errors: string[] = [];
  protected warnings: string[] = [];
  protected recordCount = 0;
  protected transactionCount = 0;

  constructor(ctx: CWRGenerationContext) {
    this.ctx = ctx;
  }

  abstract getVersion(): CWRVersion;

  generate(works: CWRWorkData[]): CWRGenerationResult {
    this.reset();

    try {
      // Validate works before generation
      this.validateWorks(works);

      // Build file structure
      this.addRecord(buildHDR(this.ctx));
      this.addRecord(buildGRH(this.ctx));

      // Generate each work transaction
      for (const work of works) {
        this.generateWorkTransaction(work);
      }

      // Group and transmission trailers
      this.addRecord(buildGRT(this.ctx, this.transactionCount, this.recordCount + 2));
      const trl = buildTRL(this.ctx, this.transactionCount, this.recordCount + 2);

      return {
        filename: this.ctx.filename,
        content: this.records.join('') + trl,
        version: this.getVersion(),
        transactionCount: this.transactionCount,
        recordCount: this.recordCount + 2, // +2 for GRT and TRL
        works: works.map(w => w.workCode),
        errors: this.errors,
        warnings: this.warnings,
      };
    } catch (error) {
      logger.error('CWR generation failed', { error, version: this.getVersion() });
      throw error;
    }
  }

  protected reset(): void {
    this.records = [];
    this.errors = [];
    this.warnings = [];
    this.recordCount = 0;
    this.transactionCount = 0;
  }

  protected addRecord(record: string): void {
    this.records.push(record);
    this.recordCount++;
  }

  protected validateWorks(works: CWRWorkData[]): void {
    for (const work of works) {
      // Must have at least one writer
      if (!work.writers || work.writers.length === 0) {
        this.errors.push(`Work ${work.workCode}: Must have at least one writer`);
      }

      // Controlled writers must have controlled publishers
      const controlledWriters = work.writers.filter(w => w.isControlled);
      if (controlledWriters.length > 0 && work.publishers.length === 0) {
        this.warnings.push(`Work ${work.workCode}: Controlled writers without publisher`);
      }

      // Validate shares total ~100%
      const writerShares = work.writers.reduce((sum, w) => sum + w.prShare, 0);
      if (Math.abs(writerShares - 100) > 0.01 && writerShares > 0) {
        this.warnings.push(
          `Work ${work.workCode}: Writer PR shares total ${writerShares.toFixed(2)}%, expected 100%`
        );
      }
    }

    if (this.errors.length > 0) {
      throw new Error(`CWR validation failed: ${this.errors.join('; ')}`);
    }
  }

  protected generateWorkTransaction(work: CWRWorkData): void {
    this.transactionCount++;
    const txSeq = this.transactionCount;
    let recSeq = 0;

    // Work record (NWR/REV/WRK)
    const recordType = this.ctx.transactionType === 'REV' ? 'REV' : 'NWR';
    this.addRecord(buildWRK(this.ctx, work, txSeq, recordType));

    // Controlled publishers
    for (const pub of work.publishers) {
      recSeq++;
      this.addRecord(buildSPU(this.ctx, pub, txSeq, recSeq));
      recSeq++;
      this.addRecord(buildSPT(this.ctx, pub, txSeq, recSeq));
    }

    // If no controlled publisher, add OPU for uncontrolled share
    if (work.publishers.length === 0) {
      const totalPrShare = work.writers.reduce((sum, w) => sum + w.prShare, 0);
      const totalMrShare = work.writers.reduce((sum, w) => sum + w.mrShare, 0);
      const totalSrShare = work.writers.reduce((sum, w) => sum + w.srShare, 0);

      // Calculate publisher share (typically 50% of total)
      const pubPrShare = Math.min(50, 100 - totalPrShare);
      const pubMrShare = Math.min(50, 100 - totalMrShare);
      const pubSrShare = Math.min(50, 100 - totalSrShare);

      if (pubPrShare > 0 || pubMrShare > 0 || pubSrShare > 0) {
        recSeq++;
        this.addRecord(buildOPU(this.ctx, txSeq, recSeq, 1, pubPrShare, pubMrShare, pubSrShare));
      }
    }

    // Controlled writers (SWR/SWT)
    const controlledWriters = work.writers.filter(w => w.isControlled);
    for (const writer of controlledWriters) {
      recSeq++;
      this.addRecord(buildSWR(this.ctx, writer, txSeq, recSeq));
      recSeq++;
      this.addRecord(buildSWT(this.ctx, writer, txSeq, recSeq));

      // PWR record linking writer to publisher
      if (writer.publisherCode) {
        const pub = work.publishers.find(p => p.code === writer.publisherCode);
        if (pub) {
          recSeq++;
          this.addRecord(buildPWR(this.ctx, writer, pub, txSeq, recSeq));
        }
      }
    }

    // Non-controlled writers (OWR)
    const uncontrolledWriters = work.writers.filter(w => !w.isControlled);
    for (const writer of uncontrolledWriters) {
      recSeq++;
      this.addRecord(buildOWR(this.ctx, writer, txSeq, recSeq));
    }

    // Alternate titles
    for (const altTitle of work.alternateTitles || []) {
      recSeq++;
      this.addRecord(buildALT(this.ctx, altTitle, txSeq, recSeq));
    }

    // Performers
    for (const performer of work.performers || []) {
      recSeq++;
      this.addRecord(buildPER(this.ctx, performer, txSeq, recSeq));
    }

    // Recordings
    for (const recording of work.recordings || []) {
      recSeq++;
      this.addRecord(buildREC(this.ctx, recording, work.workCode, txSeq, recSeq));
    }
  }
}

// ============================================================================
// CWR 2.1 Generator
// ============================================================================

export class CWR21Generator extends BaseCWRGenerator {
  getVersion(): CWRVersion {
    return '21';
  }
}

// ============================================================================
// CWR 2.2 Generator
// ============================================================================

export class CWR22Generator extends BaseCWRGenerator {
  getVersion(): CWRVersion {
    return '22';
  }
}

// ============================================================================
// CWR 3.0 Generator
// ============================================================================

export class CWR30Generator extends BaseCWRGenerator {
  getVersion(): CWRVersion {
    return '30';
  }
}

// ============================================================================
// CWR 3.1 Generator
// ============================================================================

export class CWR31Generator extends BaseCWRGenerator {
  getVersion(): CWRVersion {
    return '31';
  }
}

// ============================================================================
// Generator Factory
// ============================================================================

export class CWRGeneratorFactory {
  static create(
    version: CWRVersion,
    options: {
      submitterCode: string;
      submitterName: string;
      submitterIPI: string;
      receiverCode: string;
      transactionType?: TransactionType;
    }
  ): ICWRGenerator {
    const now = new Date();
    const dateStr = now.toISOString().slice(2, 10).replace(/-/g, '');

    const ctx: CWRGenerationContext = {
      version,
      submitterCode: options.submitterCode,
      submitterName: options.submitterName,
      submitterIPI: options.submitterIPI,
      receiverCode: options.receiverCode,
      transactionType: options.transactionType || 'NWR',
      creationDate: now,
      filename: `CW${dateStr}${options.submitterCode}${options.receiverCode}.V${version}`,
    };

    switch (version) {
      case '21':
        return new CWR21Generator(ctx);
      case '22':
        return new CWR22Generator(ctx);
      case '30':
        return new CWR30Generator(ctx);
      case '31':
        return new CWR31Generator(ctx);
      default:
        throw new Error(`Unsupported CWR version: ${version}`);
    }
  }
}

// ============================================================================
// Helper: Generate filename
// ============================================================================

export function generateCWRFilename(
  submitterCode: string,
  receiverCode: string,
  version: CWRVersion,
  date: Date = new Date()
): string {
  const dateStr = date.toISOString().slice(2, 10).replace(/-/g, '');
  return `CW${dateStr}${submitterCode}${receiverCode}.V${version}`;
}
