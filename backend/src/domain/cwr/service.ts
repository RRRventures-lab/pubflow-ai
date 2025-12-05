// ============================================================================
// PubFlow AI - CWR Service
// High-level service for CWR generation and ACK processing
// ============================================================================

import { CWRGeneratorFactory, generateCWRFilename } from './generator.js';
import { ShareCalculator, calculateOwnership } from './share-calculator.js';
import type {
  CWRVersion, CWRWorkData, CWRGenerationResult, TransactionType,
  CWRAlternateTitle, CWRRecordingData, CWRPerformerData
} from './types.js';
import { tenantQuery, tenantTransaction, TenantContext } from '../../infrastructure/database/pool.js';
import { logger } from '../../infrastructure/logging/logger.js';
import type { Work, Writer, WriterInWork, Recording, Publisher, CWRExport } from '../../shared/types/index.js';

// ============================================================================
// CWR Service
// ============================================================================

export class CWRService {
  private shareCalculator = new ShareCalculator();

  /**
   * Generate CWR file for selected works
   */
  async generateCWR(
    ctx: TenantContext,
    options: {
      version: CWRVersion;
      submitterCode: string;
      submitterName: string;
      submitterIPI: string;
      receiverCode: string;
      transactionType?: TransactionType;
      workIds: string[];
    }
  ): Promise<{
    export: CWRExport;
    result: CWRGenerationResult;
  }> {
    logger.info('Starting CWR generation', {
      tenantId: ctx.tenantId,
      version: options.version,
      workCount: options.workIds.length,
    });

    // Load works with all related data
    const works = await this.loadWorksForCWR(ctx, options.workIds);

    if (works.length === 0) {
      throw new Error('No works found for CWR generation');
    }

    // Create generator
    const generator = CWRGeneratorFactory.create(options.version, {
      submitterCode: options.submitterCode,
      submitterName: options.submitterName,
      submitterIPI: options.submitterIPI,
      receiverCode: options.receiverCode,
      transactionType: options.transactionType,
    });

    // Generate CWR file
    const result = generator.generate(works);

    // Save to database
    const cwrExport = await this.saveCWRExport(ctx, options, result);

    logger.info('CWR generation complete', {
      tenantId: ctx.tenantId,
      exportId: cwrExport.id,
      filename: result.filename,
      transactionCount: result.transactionCount,
      recordCount: result.recordCount,
      warnings: result.warnings.length,
    });

    return { export: cwrExport, result };
  }

  /**
   * Load works with all related data for CWR generation
   */
  private async loadWorksForCWR(
    ctx: TenantContext,
    workIds: string[]
  ): Promise<CWRWorkData[]> {
    const works: CWRWorkData[] = [];

    for (const workId of workIds) {
      // Load work
      const workResult = await tenantQuery<Work>(
        ctx,
        'SELECT * FROM works WHERE id = $1',
        [workId]
      );

      if (workResult.rows.length === 0) {
        logger.warn('Work not found for CWR', { workId });
        continue;
      }

      const work = workResult.rows[0];

      // Load writers in work
      const writersResult = await tenantQuery<
        WriterInWork & {
          first_name: string;
          last_name: string;
          ipi_name_number: string;
          ipi_base_number: string;
          pr_society: string;
          mr_society: string;
          sr_society: string;
          publisher_code: string;
        }
      >(
        ctx,
        `SELECT wiw.*, w.first_name, w.last_name, w.ipi_name_number, w.ipi_base_number,
                w.pr_society, w.mr_society, w.sr_society, w.publisher_code
         FROM writers_in_works wiw
         JOIN writers w ON wiw.writer_id = w.id
         WHERE wiw.work_id = $1
         ORDER BY wiw.share DESC`,
        [workId]
      );

      // Load publishers
      const publishersResult = await tenantQuery<Publisher>(
        ctx,
        `SELECT p.* FROM publishers p
         JOIN publishers_in_works piw ON p.id = piw.publisher_id
         WHERE piw.work_id = $1
         ORDER BY piw.sequence`,
        [workId]
      );

      // Load alternate titles
      const altTitlesResult = await tenantQuery<{ title: string; title_type: string; language: string }>(
        ctx,
        'SELECT title, title_type, language FROM alternate_titles WHERE work_id = $1',
        [workId]
      );

      // Load recordings
      const recordingsResult = await tenantQuery<Recording>(
        ctx,
        'SELECT * FROM recordings WHERE work_id = $1',
        [workId]
      );

      // Load performers (from recordings)
      const performersResult = await tenantQuery<{ first_name: string; last_name: string; ipi_name_number: string; isni: string }>(
        ctx,
        `SELECT DISTINCT pa.first_name, pa.last_name, pa.ipi_name_number, pa.isni
         FROM performing_artists pa
         JOIN recordings r ON pa.recording_id = r.id
         WHERE r.work_id = $1`,
        [workId]
      );

      // Calculate shares
      const shareInputs = writersResult.rows.map(w => ({
        writerId: w.writerId,
        writerCode: `W${w.writerId.slice(0, 8)}`.toUpperCase(),
        firstName: w.first_name,
        lastName: w.last_name,
        role: w.role as any,
        share: Number(w.share),
        isControlled: w.isControlled,
        ipiNameNumber: w.ipi_name_number,
        ipiBaseNumber: w.ipi_base_number,
        prSociety: w.pr_society,
        mrSociety: w.mr_society,
        srSociety: w.sr_society,
        publisherCode: w.publisher_code || publishersResult.rows[0]?.publisherCode,
        manuscriptShare: w.manuscriptShare ? Number(w.manuscriptShare) : undefined,
      }));

      const publisherInputs = publishersResult.rows.map(p => ({
        publisherId: p.id,
        publisherCode: p.publisherCode,
        name: p.name,
        ipiNameNumber: p.ipiNameNumber,
        ipiBaseNumber: p.ipiBaseNumber,
        prSociety: p.prSociety,
        mrSociety: p.mrSociety,
        srSociety: p.srSociety,
      }));

      const shareResult = this.shareCalculator.calculate(shareInputs, publisherInputs);

      // Build CWR work data
      const cwrWork: CWRWorkData = {
        id: work.id,
        title: work.title,
        workCode: work.workCode,
        iswc: work.iswc,
        duration: work.duration,
        versionType: work.versionType as 'ORI' | 'MOD',
        recordedIndicator: recordingsResult.rows.length > 0 ? 'Y' : 'U',
        originalTitle: work.originalTitle,
        alternateTitles: altTitlesResult.rows.map(t => ({
          title: t.title,
          type: t.title_type as any,
          language: t.language,
        })),
        writers: shareResult.writers,
        publishers: shareResult.publishers,
        recordings: recordingsResult.rows.map(r => ({
          isrc: r.isrc,
          title: r.recordingTitle,
          versionTitle: r.versionTitle,
          releaseDate: r.releaseDate?.toISOString?.() || undefined,
          duration: r.duration,
          recordLabel: r.recordLabel,
        })),
        performers: performersResult.rows.map(p => ({
          firstName: p.first_name,
          lastName: p.last_name,
          ipiNameNumber: p.ipi_name_number,
          isni: p.isni,
        })),
      };

      works.push(cwrWork);
    }

    return works;
  }

  /**
   * Save CWR export to database
   */
  private async saveCWRExport(
    ctx: TenantContext,
    options: {
      version: CWRVersion;
      submitterCode: string;
      receiverCode: string;
      transactionType?: TransactionType;
      workIds: string[];
    },
    result: CWRGenerationResult
  ): Promise<CWRExport> {
    return tenantTransaction(ctx, async (client) => {
      // Insert export record
      const exportResult = await client.query<CWRExport>(
        `INSERT INTO cwr_exports (
          version, submitter_code, receiver_code, filename, file_content,
          work_count, transaction_type, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'GENERATED')
        RETURNING *`,
        [
          options.version,
          options.submitterCode,
          options.receiverCode,
          result.filename,
          result.content,
          result.works.length,
          options.transactionType || 'NWR',
        ]
      );

      const cwrExport = exportResult.rows[0];

      // Link works to export
      for (let i = 0; i < options.workIds.length; i++) {
        await client.query(
          `INSERT INTO works_in_cwr_exports (
            cwr_export_id, work_id, transaction_sequence, record_sequence
          ) VALUES ($1, $2, $3, 1)`,
          [cwrExport.id, options.workIds[i], i + 1]
        );
      }

      return cwrExport;
    });
  }

  /**
   * Preview CWR generation without saving
   */
  async previewCWR(
    ctx: TenantContext,
    options: {
      version: CWRVersion;
      submitterCode: string;
      submitterName: string;
      submitterIPI: string;
      receiverCode: string;
      transactionType?: TransactionType;
      workIds: string[];
    }
  ): Promise<{
    preview: string;
    warnings: string[];
    errors: string[];
  }> {
    const works = await this.loadWorksForCWR(ctx, options.workIds);

    const generator = CWRGeneratorFactory.create(options.version, {
      submitterCode: options.submitterCode,
      submitterName: options.submitterName,
      submitterIPI: options.submitterIPI,
      receiverCode: options.receiverCode,
      transactionType: options.transactionType,
    });

    const result = generator.generate(works);

    // Return first 100 lines as preview
    const lines = result.content.split('\r\n');
    const preview = lines.slice(0, 100).join('\r\n');

    return {
      preview,
      warnings: result.warnings,
      errors: result.errors,
    };
  }

  /**
   * Get supported CWR versions
   */
  getSupportedVersions(): { version: CWRVersion; name: string; description: string }[] {
    return [
      { version: '21', name: 'CWR 2.1', description: 'Legacy format, widely supported' },
      { version: '22', name: 'CWR 2.2', description: 'Extended format with recording details' },
      { version: '30', name: 'CWR 3.0', description: 'Modern format with enhanced fields' },
      { version: '31', name: 'CWR 3.1', description: 'Latest format with manuscript shares' },
    ];
  }
}

// Export singleton
export const cwrService = new CWRService();
