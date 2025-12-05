// ============================================================================
// PubFlow AI - Distribution Calculator
// Calculates royalty distributions based on work shares
// ============================================================================

import { tenantQuery, tenantTransaction, TenantContext } from '../../infrastructure/database/pool.js';
import { logger } from '../../infrastructure/logging/logger.js';
import type {
  StatementRow,
  Distribution,
  DistributionSummary,
  DistributionStatus,
  RightType,
  ProcessingContext,
  CachedWork,
} from './types.js';

// ============================================================================
// Distribution Types
// ============================================================================

export interface DistributionInput {
  statementId: string;
  workId: string;
  rows: StatementRow[];
  work: CachedWork;
  rightType: RightType;
}

export interface DistributionResult {
  distributions: Distribution[];
  totalGross: number;
  totalDistributed: number;
  writerDistributions: Map<string, number>;
  publisherDistributions: Map<string, number>;
}

// ============================================================================
// Distribution Calculator
// ============================================================================

export class DistributionCalculator {
  /**
   * Calculate distributions for matched rows
   */
  calculateDistributions(
    input: DistributionInput,
    period: { start: Date; end: Date }
  ): DistributionResult {
    const { statementId, workId, rows, work, rightType } = input;

    // Calculate total gross amount
    const totalGross = rows.reduce((sum, row) => sum + row.amount, 0);

    const distributions: Distribution[] = [];
    const writerDistributions = new Map<string, number>();
    const publisherDistributions = new Map<string, number>();

    // Get shares based on right type
    const writerShares = this.getWriterShares(work, rightType);
    const publisherShares = this.getPublisherShares(work, rightType);

    // Calculate writer distributions
    for (const writer of work.writers) {
      const share = writerShares.get(writer.id) || 0;
      if (share <= 0) continue;

      const netAmount = this.round(totalGross * (share / 100));

      const distribution: Distribution = {
        id: '', // Will be set on save
        statementId,
        workId,
        writerId: writer.id,
        publisherId: undefined,
        grossAmount: totalGross,
        sharePercentage: share,
        netAmount,
        rightType,
        usageType: rows[0]?.usageType,
        territory: rows[0]?.territory,
        period,
        sourceRowNumbers: rows.map(r => r.rowNumber),
        currency: rows[0]?.currency || 'USD',
        status: 'calculated',
      };

      distributions.push(distribution);
      writerDistributions.set(
        writer.id,
        (writerDistributions.get(writer.id) || 0) + netAmount
      );
    }

    // Calculate publisher distributions
    for (const publisher of work.publishers) {
      const share = publisherShares.get(publisher.id) || 0;
      if (share <= 0) continue;

      const netAmount = this.round(totalGross * (share / 100));

      const distribution: Distribution = {
        id: '',
        statementId,
        workId,
        writerId: undefined,
        publisherId: publisher.id,
        grossAmount: totalGross,
        sharePercentage: share,
        netAmount,
        rightType,
        usageType: rows[0]?.usageType,
        territory: rows[0]?.territory,
        period,
        sourceRowNumbers: rows.map(r => r.rowNumber),
        currency: rows[0]?.currency || 'USD',
        status: 'calculated',
      };

      distributions.push(distribution);
      publisherDistributions.set(
        publisher.id,
        (publisherDistributions.get(publisher.id) || 0) + netAmount
      );
    }

    const totalDistributed = distributions.reduce((sum, d) => sum + d.netAmount, 0);

    // Check for rounding discrepancy
    if (Math.abs(totalGross - totalDistributed) > 0.01) {
      logger.debug('Distribution rounding adjustment', {
        workId,
        totalGross,
        totalDistributed,
        difference: totalGross - totalDistributed,
      });
    }

    return {
      distributions,
      totalGross,
      totalDistributed,
      writerDistributions,
      publisherDistributions,
    };
  }

  /**
   * Calculate distributions for all matched rows in a statement
   */
  async calculateStatementDistributions(
    ctx: TenantContext,
    statementId: string,
    processingCtx: ProcessingContext,
    period: { start: Date; end: Date }
  ): Promise<DistributionSummary> {
    // Get all matched rows grouped by work
    const matchedRowsResult = await tenantQuery(
      ctx,
      `SELECT * FROM royalty_statement_rows
       WHERE statement_id = $1
         AND matched_work_id IS NOT NULL
         AND match_status IN ('exact', 'fuzzy_high', 'manual')
       ORDER BY matched_work_id`,
      [statementId]
    );

    // Group rows by work
    const rowsByWork = new Map<string, StatementRow[]>();
    for (const row of matchedRowsResult.rows) {
      const workId = row.matched_work_id;
      const rows = rowsByWork.get(workId) || [];
      rows.push(this.mapDbRowToStatementRow(row));
      rowsByWork.set(workId, rows);
    }

    const allDistributions: Distribution[] = [];
    let totalGross = 0;
    const writerTotals = new Map<string, { id: string; name: string; amount: number }>();
    const publisherTotals = new Map<string, { id: string; name: string; amount: number }>();
    const rightTypeTotals: Record<RightType, number> = {
      performance: 0,
      mechanical: 0,
      sync: 0,
      print: 0,
      other: 0,
    };

    // Calculate distributions for each work
    for (const [workId, rows] of rowsByWork) {
      const work = processingCtx.workCache.get(workId);
      if (!work) {
        logger.warn('Work not found in cache', { workId });
        continue;
      }

      // Determine right type from rows
      const rightType = this.determineRightType(rows);

      const result = this.calculateDistributions({
        statementId,
        workId,
        rows,
        work,
        rightType,
      }, period);

      allDistributions.push(...result.distributions);
      totalGross += result.totalGross;
      rightTypeTotals[rightType] += result.totalGross;

      // Aggregate by writer
      for (const [writerId, amount] of result.writerDistributions) {
        const writer = work.writers.find(w => w.id === writerId);
        const existing = writerTotals.get(writerId) || {
          id: writerId,
          name: writer?.fullName || 'Unknown',
          amount: 0,
        };
        existing.amount += amount;
        writerTotals.set(writerId, existing);
      }

      // Aggregate by publisher
      for (const [publisherId, amount] of result.publisherDistributions) {
        const publisher = work.publishers.find(p => p.id === publisherId);
        const existing = publisherTotals.get(publisherId) || {
          id: publisherId,
          name: publisher?.name || 'Unknown',
          amount: 0,
        };
        existing.amount += amount;
        publisherTotals.set(publisherId, existing);
      }
    }

    // Save distributions to database
    await this.saveDistributions(ctx, allDistributions);

    // Calculate totals
    const totalDistributed = allDistributions.reduce((sum, d) => sum + d.netAmount, 0);
    const unmatchedResult = await tenantQuery(
      ctx,
      `SELECT COALESCE(SUM(amount), 0) as total FROM royalty_statement_rows
       WHERE statement_id = $1
         AND (matched_work_id IS NULL OR match_status NOT IN ('exact', 'fuzzy_high', 'manual'))`,
      [statementId]
    );
    const totalUndistributed = parseFloat(unmatchedResult.rows[0].total) || 0;

    // Calculate match rate
    const totalRowsResult = await tenantQuery(
      ctx,
      'SELECT COUNT(*) FROM royalty_statement_rows WHERE statement_id = $1',
      [statementId]
    );
    const totalRows = parseInt(totalRowsResult.rows[0].count, 10);
    const matchRate = totalRows > 0 ? rowsByWork.size / totalRows : 0;

    // Build summary
    const summary: DistributionSummary = {
      statementId,
      totalGross,
      totalDistributed,
      totalUndistributed,
      matchRate,
      byRightType: rightTypeTotals,
      byWriter: Array.from(writerTotals.values())
        .map(w => ({
          writerId: w.id,
          writerName: w.name,
          amount: w.amount,
          percentage: totalDistributed > 0 ? (w.amount / totalDistributed) * 100 : 0,
        }))
        .sort((a, b) => b.amount - a.amount),
      byPublisher: Array.from(publisherTotals.values())
        .map(p => ({
          publisherId: p.id,
          publisherName: p.name,
          amount: p.amount,
          percentage: totalDistributed > 0 ? (p.amount / totalDistributed) * 100 : 0,
        }))
        .sort((a, b) => b.amount - a.amount),
    };

    logger.info('Distribution calculation complete', {
      tenantId: ctx.tenantId,
      statementId,
      totalGross,
      totalDistributed,
      distributionCount: allDistributions.length,
      matchRate,
    });

    return summary;
  }

  /**
   * Save distributions to database
   */
  private async saveDistributions(
    ctx: TenantContext,
    distributions: Distribution[]
  ): Promise<void> {
    if (distributions.length === 0) return;

    await tenantTransaction(ctx, async (client) => {
      for (const dist of distributions) {
        await client.query(
          `INSERT INTO royalty_distributions (
            statement_id, work_id, writer_id, publisher_id,
            gross_amount, share_percentage, net_amount,
            right_type, usage_type, territory,
            period_start, period_end, source_row_numbers,
            currency, status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
          [
            dist.statementId,
            dist.workId,
            dist.writerId,
            dist.publisherId,
            dist.grossAmount,
            dist.sharePercentage,
            dist.netAmount,
            dist.rightType,
            dist.usageType,
            dist.territory,
            dist.period.start,
            dist.period.end,
            dist.sourceRowNumbers,
            dist.currency,
            dist.status,
          ]
        );
      }
    });
  }

  /**
   * Get writer shares based on right type
   */
  private getWriterShares(work: CachedWork, rightType: RightType): Map<string, number> {
    const shares = new Map<string, number>();

    for (const writer of work.writers) {
      // Use the appropriate share based on right type
      // For now, use the general share - in production would have PR/MR/SR shares
      shares.set(writer.id, writer.share);
    }

    return shares;
  }

  /**
   * Get publisher shares based on right type
   */
  private getPublisherShares(work: CachedWork, rightType: RightType): Map<string, number> {
    const shares = new Map<string, number>();

    for (const publisher of work.publishers) {
      shares.set(publisher.id, publisher.share);
    }

    return shares;
  }

  /**
   * Determine right type from rows
   */
  private determineRightType(rows: StatementRow[]): RightType {
    // Check if any row has explicit right type
    for (const row of rows) {
      if (row.rightType) {
        return row.rightType;
      }
    }

    // Try to infer from usage type
    for (const row of rows) {
      if (row.usageType) {
        switch (row.usageType) {
          case 'streaming':
          case 'download':
            return 'mechanical';
          case 'broadcast':
          case 'live':
            return 'performance';
          case 'background':
            return 'sync';
        }
      }
    }

    return 'other';
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

  /**
   * Round to 2 decimal places
   */
  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }
}

// ============================================================================
// Distribution Database Schema (for reference)
// ============================================================================

/*
CREATE TABLE royalty_distributions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  statement_id UUID NOT NULL REFERENCES royalty_statements(id),
  work_id UUID NOT NULL REFERENCES works(id),
  writer_id UUID REFERENCES writers(id),
  publisher_id UUID REFERENCES publishers(id),
  gross_amount DECIMAL(15,2) NOT NULL,
  share_percentage DECIMAL(5,2) NOT NULL,
  net_amount DECIMAL(15,2) NOT NULL,
  right_type VARCHAR(20) NOT NULL,
  usage_type VARCHAR(20),
  territory VARCHAR(10),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  source_row_numbers INTEGER[] NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  status VARCHAR(20) NOT NULL DEFAULT 'calculated',
  payout_id UUID REFERENCES payouts(id),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_distributions_statement ON royalty_distributions(statement_id);
CREATE INDEX idx_distributions_work ON royalty_distributions(work_id);
CREATE INDEX idx_distributions_writer ON royalty_distributions(writer_id);
CREATE INDEX idx_distributions_publisher ON royalty_distributions(publisher_id);
CREATE INDEX idx_distributions_status ON royalty_distributions(status);
*/

// Export singleton
export const distributionCalculator = new DistributionCalculator();
