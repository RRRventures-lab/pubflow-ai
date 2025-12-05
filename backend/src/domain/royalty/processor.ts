// ============================================================================
// PubFlow AI - Royalty Processor Service
// Main orchestrator for royalty statement processing
// ============================================================================

import { tenantQuery, tenantTransaction, TenantContext } from '../../infrastructure/database/pool.js';
import { logger } from '../../infrastructure/logging/logger.js';
import { statementParser, ParseResult } from './statement-parser.js';
import { workCache } from './work-cache.js';
import { matchingEngine, MatchingEngine } from './matching-engine.js';
import { reviewQueueService } from './review-queue.js';
import { distributionCalculator } from './distribution-calculator.js';
import type {
  StatementMetadata,
  StatementStatus,
  StatementRow,
  ColumnMapping,
  MatchResult,
  DistributionSummary,
  ProcessingContext,
  MatchingConfig,
  StatementSource,
  StatementFormat,
} from './types.js';

// ============================================================================
// Processing Options
// ============================================================================

export interface ProcessingOptions {
  skipValidation?: boolean;
  columnMappings?: ColumnMapping[];
  matchingConfig?: Partial<MatchingConfig>;
  autoDistribute?: boolean;       // Calculate distributions immediately
  batchSize?: number;
}

export interface ProcessingResult {
  statementId: string;
  status: StatementStatus;
  stats: {
    totalRows: number;
    processedRows: number;
    exactMatches: number;
    fuzzyMatches: number;
    noMatches: number;
    reviewRequired: number;
    errors: number;
    totalAmount: number;
    matchedAmount: number;
    unmatchedAmount: number;
  };
  distribution?: DistributionSummary;
  errors: string[];
  warnings: string[];
}

// ============================================================================
// Royalty Processor
// ============================================================================

export class RoyaltyProcessor {
  private matchingEngine: MatchingEngine;

  constructor() {
    this.matchingEngine = new MatchingEngine();
  }

  /**
   * Upload and create statement record
   */
  async uploadStatement(
    ctx: TenantContext,
    file: {
      content: Buffer | string;
      filename: string;
      format?: StatementFormat;
    },
    metadata: {
      source: StatementSource;
      periodStart: Date;
      periodEnd: Date;
      currency?: string;
    }
  ): Promise<StatementMetadata> {
    // Parse file to get basic info
    const parseResult = await statementParser.parse(
      file.content,
      file.filename,
      { format: file.format, maxRows: 10 }  // Just peek at first 10 rows
    );

    // Calculate total amount from full parse
    const fullParse = await statementParser.parse(file.content, file.filename, { format: file.format });
    const totalAmount = fullParse.rows.reduce((sum, row) => sum + (row.amount || 0), 0);

    // Create statement record
    const result = await tenantQuery<StatementMetadata>(
      ctx,
      `INSERT INTO royalty_statements (
        filename, format, source, period_start, period_end,
        currency, total_amount, row_count, status, uploaded_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'uploaded', $9)
      RETURNING *`,
      [
        file.filename,
        parseResult.format,
        metadata.source,
        metadata.periodStart,
        metadata.periodEnd,
        metadata.currency || 'USD',
        totalAmount,
        fullParse.metadata.totalRows,
        ctx.userId,
      ]
    );

    const statement = this.mapRowToMetadata(result.rows[0]);

    logger.info('Statement uploaded', {
      tenantId: ctx.tenantId,
      statementId: statement.id,
      filename: file.filename,
      rowCount: fullParse.metadata.totalRows,
      totalAmount,
    });

    return statement;
  }

  /**
   * Process a statement end-to-end
   */
  async processStatement(
    ctx: TenantContext,
    statementId: string,
    fileContent: Buffer | string,
    options: ProcessingOptions = {}
  ): Promise<ProcessingResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Update status to processing
      await this.updateStatementStatus(ctx, statementId, 'processing');

      // Get statement metadata
      const statement = await this.getStatement(ctx, statementId);
      if (!statement) {
        throw new Error(`Statement not found: ${statementId}`);
      }

      // Parse file
      logger.info('Parsing statement file', { statementId, filename: statement.filename });
      const parseResult = await statementParser.parse(
        fileContent,
        statement.filename,
        { columnMappings: options.columnMappings }
      );

      errors.push(...parseResult.errors);
      warnings.push(...parseResult.warnings);

      if (parseResult.rows.length === 0) {
        throw new Error('No valid rows found in statement');
      }

      // Save parsed rows to database
      await this.saveStatementRows(ctx, statementId, parseResult.rows);

      // Load work cache
      logger.info('Loading work cache', { tenantId: ctx.tenantId });
      const processingCtx = await workCache.getProcessingContext(ctx, statementId);
      processingCtx.stats.totalRows = parseResult.rows.length;

      // Apply matching config
      if (options.matchingConfig) {
        this.matchingEngine.updateConfig(options.matchingConfig);
      }

      // Update status to matching
      await this.updateStatementStatus(ctx, statementId, 'matching');

      // Match rows
      logger.info('Starting matching phase', {
        statementId,
        rowCount: parseResult.rows.length,
        workCount: processingCtx.workCache.size,
      });

      const matchResults = await this.matchingEngine.matchBatch(
        parseResult.rows,
        processingCtx,
        (processed, total) => {
          if (processed % 1000 === 0) {
            logger.debug('Matching progress', { processed, total });
          }
        }
      );

      // Update rows with match results
      await this.updateMatchResults(ctx, statementId, parseResult.rows, matchResults);

      // Add items needing review to queue
      const reviewItems = parseResult.rows
        .map((row, i) => ({ row, matchResult: matchResults[i] }))
        .filter(item =>
          item.matchResult.status === 'fuzzy_medium' ||
          item.matchResult.status === 'fuzzy_low'
        );

      if (reviewItems.length > 0) {
        await reviewQueueService.addToQueue(ctx, statementId, reviewItems);
      }

      // Calculate stats
      const stats = {
        totalRows: parseResult.rows.length,
        processedRows: processingCtx.stats.processedRows,
        exactMatches: processingCtx.stats.exactMatches,
        fuzzyMatches: processingCtx.stats.fuzzyMatches,
        noMatches: processingCtx.stats.noMatches,
        reviewRequired: processingCtx.stats.reviewRequired,
        errors: errors.length,
        totalAmount: parseResult.rows.reduce((sum, r) => sum + r.amount, 0),
        matchedAmount: 0,
        unmatchedAmount: 0,
      };

      // Calculate matched/unmatched amounts
      for (let i = 0; i < parseResult.rows.length; i++) {
        const row = parseResult.rows[i];
        const result = matchResults[i];
        if (result.status === 'exact' || result.status === 'fuzzy_high') {
          stats.matchedAmount += row.amount;
        } else {
          stats.unmatchedAmount += row.amount;
        }
      }

      // Calculate distributions if requested
      let distribution: DistributionSummary | undefined;
      if (options.autoDistribute) {
        logger.info('Calculating distributions', { statementId });
        distribution = await distributionCalculator.calculateStatementDistributions(
          ctx,
          statementId,
          processingCtx,
          { start: statement.period.start, end: statement.period.end }
        );
      }

      // Determine final status
      const finalStatus: StatementStatus = reviewItems.length > 0 ? 'review' : 'completed';
      await this.updateStatementStatus(ctx, statementId, finalStatus);

      const processingTime = Date.now() - startTime;
      logger.info('Statement processing complete', {
        statementId,
        status: finalStatus,
        processingTimeMs: processingTime,
        ...stats,
      });

      return {
        statementId,
        status: finalStatus,
        stats,
        distribution,
        errors,
        warnings,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      errors.push(errorMsg);

      await this.updateStatementStatus(ctx, statementId, 'failed', errorMsg);

      logger.error('Statement processing failed', {
        statementId,
        error: errorMsg,
      });

      return {
        statementId,
        status: 'failed',
        stats: {
          totalRows: 0,
          processedRows: 0,
          exactMatches: 0,
          fuzzyMatches: 0,
          noMatches: 0,
          reviewRequired: 0,
          errors: 1,
          totalAmount: 0,
          matchedAmount: 0,
          unmatchedAmount: 0,
        },
        errors,
        warnings,
      };
    }
  }

  /**
   * Get statement metadata
   */
  async getStatement(
    ctx: TenantContext,
    statementId: string
  ): Promise<StatementMetadata | null> {
    const result = await tenantQuery(
      ctx,
      'SELECT * FROM royalty_statements WHERE id = $1',
      [statementId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToMetadata(result.rows[0]);
  }

  /**
   * List statements
   */
  async listStatements(
    ctx: TenantContext,
    options?: {
      status?: StatementStatus;
      source?: StatementSource;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ statements: StatementMetadata[]; total: number }> {
    const params: any[] = [];
    let whereClause = '';

    if (options?.status) {
      params.push(options.status);
      whereClause += `${whereClause ? ' AND' : ' WHERE'} status = $${params.length}`;
    }

    if (options?.source) {
      params.push(options.source);
      whereClause += `${whereClause ? ' AND' : ' WHERE'} source = $${params.length}`;
    }

    // Get count
    const countResult = await tenantQuery(
      ctx,
      `SELECT COUNT(*) FROM royalty_statements${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Get statements
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;
    params.push(limit, offset);

    const result = await tenantQuery(
      ctx,
      `SELECT * FROM royalty_statements
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return {
      statements: result.rows.map(this.mapRowToMetadata),
      total,
    };
  }

  /**
   * Get statement rows
   */
  async getStatementRows(
    ctx: TenantContext,
    statementId: string,
    options?: {
      matchStatus?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ rows: StatementRow[]; total: number }> {
    const params: any[] = [statementId];
    let whereClause = 'WHERE statement_id = $1';

    if (options?.matchStatus) {
      params.push(options.matchStatus);
      whereClause += ` AND match_status = $${params.length}`;
    }

    // Get count
    const countResult = await tenantQuery(
      ctx,
      `SELECT COUNT(*) FROM royalty_statement_rows ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Get rows
    const limit = options?.limit || 100;
    const offset = options?.offset || 0;
    params.push(limit, offset);

    const result = await tenantQuery(
      ctx,
      `SELECT * FROM royalty_statement_rows
       ${whereClause}
       ORDER BY row_number
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return {
      rows: result.rows.map(this.mapDbRowToStatementRow),
      total,
    };
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Update statement status
   */
  private async updateStatementStatus(
    ctx: TenantContext,
    statementId: string,
    status: StatementStatus,
    errorMessage?: string
  ): Promise<void> {
    const updates: string[] = ['status = $2', 'updated_at = NOW()'];
    const params: any[] = [statementId, status];

    if (status === 'processing') {
      updates.push('processing_started_at = NOW()');
    } else if (status === 'completed' || status === 'failed') {
      updates.push('processing_completed_at = NOW()');
    }

    if (errorMessage) {
      params.push(errorMessage);
      updates.push(`error_message = $${params.length}`);
    }

    await tenantQuery(
      ctx,
      `UPDATE royalty_statements SET ${updates.join(', ')} WHERE id = $1`,
      params
    );
  }

  /**
   * Save statement rows to database
   */
  private async saveStatementRows(
    ctx: TenantContext,
    statementId: string,
    rows: StatementRow[]
  ): Promise<void> {
    await tenantTransaction(ctx, async (client) => {
      // Delete existing rows
      await client.query(
        'DELETE FROM royalty_statement_rows WHERE statement_id = $1',
        [statementId]
      );

      // Insert new rows in batches
      const batchSize = 500;
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);

        for (const row of batch) {
          await client.query(
            `INSERT INTO royalty_statement_rows (
              statement_id, row_number, raw_data,
              work_title, writer_name, writer_first_name, writer_last_name,
              performer_name, iswc, isrc, work_code, publisher_code,
              amount, currency, right_type, usage_type, usage_count,
              territory, period_start, period_end, match_status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, 'pending')`,
            [
              statementId,
              row.rowNumber,
              JSON.stringify(row.rawData),
              row.workTitle,
              row.writerName,
              row.writerFirstName,
              row.writerLastName,
              row.performerName,
              row.iswc,
              row.isrc,
              row.workCode,
              row.publisherCode,
              row.amount,
              row.currency,
              row.rightType,
              row.usageType,
              row.usageCount,
              row.territory,
              row.periodStart,
              row.periodEnd,
            ]
          );
        }
      }
    });
  }

  /**
   * Update match results in database
   */
  private async updateMatchResults(
    ctx: TenantContext,
    statementId: string,
    rows: StatementRow[],
    results: MatchResult[]
  ): Promise<void> {
    await tenantTransaction(ctx, async (client) => {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const result = results[i];

        await client.query(
          `UPDATE royalty_statement_rows
           SET match_status = $1,
               matched_work_id = $2,
               match_confidence = $3,
               match_method = $4
           WHERE statement_id = $5 AND row_number = $6`,
          [
            result.status,
            result.matchedWorkId,
            result.confidence,
            result.method,
            statementId,
            row.rowNumber,
          ]
        );
      }
    });
  }

  /**
   * Map database row to StatementMetadata
   */
  private mapRowToMetadata(row: any): StatementMetadata {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      filename: row.filename,
      format: row.format,
      source: row.source,
      period: {
        start: row.period_start,
        end: row.period_end,
      },
      currency: row.currency,
      totalAmount: parseFloat(row.total_amount) || 0,
      rowCount: row.row_count,
      uploadedAt: row.uploaded_at || row.created_at,
      uploadedBy: row.uploaded_by,
      status: row.status,
      processingStartedAt: row.processing_started_at,
      processingCompletedAt: row.processing_completed_at,
      errorMessage: row.error_message,
    };
  }

  /**
   * Map database row to StatementRow
   */
  private mapDbRowToStatementRow(row: any): StatementRow {
    return {
      rowNumber: row.row_number,
      rawData: row.raw_data || {},
      workTitle: row.work_title,
      writerName: row.writer_name,
      writerFirstName: row.writer_first_name,
      writerLastName: row.writer_last_name,
      performerName: row.performer_name,
      iswc: row.iswc,
      isrc: row.isrc,
      workCode: row.work_code,
      publisherCode: row.publisher_code,
      amount: parseFloat(row.amount) || 0,
      currency: row.currency,
      rightType: row.right_type,
      usageType: row.usage_type,
      usageCount: row.usage_count,
      territory: row.territory,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      matchStatus: row.match_status,
      matchedWorkId: row.matched_work_id,
      matchConfidence: row.match_confidence,
      matchMethod: row.match_method,
      reviewStatus: row.review_status,
      reviewedBy: row.reviewed_by,
      reviewedAt: row.reviewed_at,
    };
  }
}

// Export singleton
export const royaltyProcessor = new RoyaltyProcessor();
