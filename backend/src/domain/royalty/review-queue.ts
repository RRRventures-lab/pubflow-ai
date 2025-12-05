// ============================================================================
// PubFlow AI - Review Queue Service
// Manages human review queue for uncertain matches
// ============================================================================

import { tenantQuery, tenantTransaction, TenantContext } from '../../infrastructure/database/pool.js';
import { logger } from '../../infrastructure/logging/logger.js';
import type {
  StatementRow,
  MatchResult,
  MatchCandidate,
  ReviewStatus,
} from './types.js';

// ============================================================================
// Review Item Types
// ============================================================================

export interface ReviewItem {
  id: string;
  statementId: string;
  rowNumber: number;
  statementRow: StatementRow;
  matchResult: MatchResult;
  status: ReviewStatus;
  assignedTo?: string;
  resolvedBy?: string;
  resolvedAt?: Date;
  resolution?: ReviewResolution;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReviewResolution {
  action: 'approve' | 'reject' | 'rematch' | 'skip';
  matchedWorkId?: string;
  confidence?: number;
  notes?: string;
}

export interface ReviewQueueStats {
  pending: number;
  inProgress: number;
  resolved: number;
  byStatement: Record<string, {
    pending: number;
    resolved: number;
    total: number;
  }>;
}

// ============================================================================
// Review Queue Service
// ============================================================================

export class ReviewQueueService {
  /**
   * Add items to review queue
   */
  async addToQueue(
    ctx: TenantContext,
    statementId: string,
    items: Array<{
      row: StatementRow;
      matchResult: MatchResult;
    }>
  ): Promise<number> {
    if (items.length === 0) {
      return 0;
    }

    let addedCount = 0;

    await tenantTransaction(ctx, async (client) => {
      for (const item of items) {
        // Only add items that need review
        if (item.matchResult.status !== 'fuzzy_medium' &&
            item.matchResult.status !== 'fuzzy_low') {
          continue;
        }

        await client.query(
          `INSERT INTO royalty_review_queue (
            statement_id, row_number, statement_row, match_result, status
          ) VALUES ($1, $2, $3, $4, 'pending')
          ON CONFLICT (statement_id, row_number)
          DO UPDATE SET match_result = $4, updated_at = NOW()`,
          [
            statementId,
            item.row.rowNumber,
            JSON.stringify(item.row),
            JSON.stringify(item.matchResult),
          ]
        );

        addedCount++;
      }
    });

    logger.info('Added items to review queue', {
      tenantId: ctx.tenantId,
      statementId,
      addedCount,
    });

    return addedCount;
  }

  /**
   * Get pending review items
   */
  async getPendingItems(
    ctx: TenantContext,
    options?: {
      statementId?: string;
      assignedTo?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<{
    items: ReviewItem[];
    total: number;
  }> {
    const params: any[] = [];
    let whereClause = "WHERE status = 'pending'";

    if (options?.statementId) {
      params.push(options.statementId);
      whereClause += ` AND statement_id = $${params.length}`;
    }

    if (options?.assignedTo) {
      params.push(options.assignedTo);
      whereClause += ` AND assigned_to = $${params.length}`;
    }

    // Get total count
    const countResult = await tenantQuery(
      ctx,
      `SELECT COUNT(*) FROM royalty_review_queue ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Get items
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;
    params.push(limit, offset);

    const result = await tenantQuery(
      ctx,
      `SELECT * FROM royalty_review_queue
       ${whereClause}
       ORDER BY created_at ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const items = result.rows.map(this.mapRowToReviewItem);

    return { items, total };
  }

  /**
   * Get a single review item
   */
  async getItem(
    ctx: TenantContext,
    itemId: string
  ): Promise<ReviewItem | null> {
    const result = await tenantQuery(
      ctx,
      'SELECT * FROM royalty_review_queue WHERE id = $1',
      [itemId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToReviewItem(result.rows[0]);
  }

  /**
   * Assign items to a reviewer
   */
  async assignItems(
    ctx: TenantContext,
    itemIds: string[],
    assignedTo: string
  ): Promise<number> {
    const result = await tenantQuery(
      ctx,
      `UPDATE royalty_review_queue
       SET assigned_to = $1, status = 'pending', updated_at = NOW()
       WHERE id = ANY($2) AND status = 'pending'
       RETURNING id`,
      [assignedTo, itemIds]
    );

    return result.rows.length;
  }

  /**
   * Resolve a review item
   */
  async resolveItem(
    ctx: TenantContext,
    itemId: string,
    resolution: ReviewResolution,
    resolvedBy: string
  ): Promise<ReviewItem | null> {
    const result = await tenantQuery(
      ctx,
      `UPDATE royalty_review_queue
       SET status = $1,
           resolution = $2,
           resolved_by = $3,
           resolved_at = NOW(),
           updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [
        resolution.action === 'approve' || resolution.action === 'rematch'
          ? 'approved'
          : 'rejected',
        JSON.stringify(resolution),
        resolvedBy,
        itemId,
      ]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const item = this.mapRowToReviewItem(result.rows[0]);

    // If approved or rematched, update the statement row
    if (resolution.action === 'approve' || resolution.action === 'rematch') {
      await this.applyResolution(ctx, item, resolution);
    }

    logger.info('Review item resolved', {
      tenantId: ctx.tenantId,
      itemId,
      action: resolution.action,
      matchedWorkId: resolution.matchedWorkId,
    });

    return item;
  }

  /**
   * Bulk resolve items
   */
  async bulkResolve(
    ctx: TenantContext,
    itemIds: string[],
    resolution: ReviewResolution,
    resolvedBy: string
  ): Promise<number> {
    let resolvedCount = 0;

    await tenantTransaction(ctx, async (client) => {
      for (const itemId of itemIds) {
        const result = await client.query(
          `UPDATE royalty_review_queue
           SET status = $1,
               resolution = $2,
               resolved_by = $3,
               resolved_at = NOW(),
               updated_at = NOW()
           WHERE id = $4 AND status = 'pending'
           RETURNING *`,
          [
            resolution.action === 'approve' || resolution.action === 'rematch'
              ? 'approved'
              : 'rejected',
            JSON.stringify(resolution),
            resolvedBy,
            itemId,
          ]
        );

        if (result.rows.length > 0) {
          resolvedCount++;

          // Apply resolution
          if (resolution.action === 'approve' || resolution.action === 'rematch') {
            const item = this.mapRowToReviewItem(result.rows[0]);
            // Update statement row
            await client.query(
              `UPDATE royalty_statement_rows
               SET match_status = 'manual',
                   matched_work_id = $1,
                   match_confidence = $2,
                   match_method = 'manual',
                   review_status = 'approved',
                   reviewed_by = $3,
                   reviewed_at = NOW()
               WHERE statement_id = $4 AND row_number = $5`,
              [
                resolution.matchedWorkId || item.matchResult.matchedWorkId,
                resolution.confidence || item.matchResult.confidence,
                resolvedBy,
                item.statementId,
                item.rowNumber,
              ]
            );
          }
        }
      }
    });

    logger.info('Bulk resolve completed', {
      tenantId: ctx.tenantId,
      requested: itemIds.length,
      resolved: resolvedCount,
    });

    return resolvedCount;
  }

  /**
   * Get queue statistics
   */
  async getStats(
    ctx: TenantContext,
    statementId?: string
  ): Promise<ReviewQueueStats> {
    let whereClause = '';
    const params: any[] = [];

    if (statementId) {
      params.push(statementId);
      whereClause = `WHERE statement_id = $1`;
    }

    const result = await tenantQuery(
      ctx,
      `SELECT
        statement_id,
        status,
        COUNT(*) as count
       FROM royalty_review_queue
       ${whereClause}
       GROUP BY statement_id, status`,
      params
    );

    const stats: ReviewQueueStats = {
      pending: 0,
      inProgress: 0,
      resolved: 0,
      byStatement: {},
    };

    for (const row of result.rows) {
      const count = parseInt(row.count, 10);

      // Update totals
      if (row.status === 'pending') {
        stats.pending += count;
      } else if (row.status === 'in_progress') {
        stats.inProgress += count;
      } else {
        stats.resolved += count;
      }

      // Update by statement
      if (!stats.byStatement[row.statement_id]) {
        stats.byStatement[row.statement_id] = {
          pending: 0,
          resolved: 0,
          total: 0,
        };
      }

      if (row.status === 'pending' || row.status === 'in_progress') {
        stats.byStatement[row.statement_id].pending += count;
      } else {
        stats.byStatement[row.statement_id].resolved += count;
      }
      stats.byStatement[row.statement_id].total += count;
    }

    return stats;
  }

  /**
   * Apply resolution to statement row
   */
  private async applyResolution(
    ctx: TenantContext,
    item: ReviewItem,
    resolution: ReviewResolution
  ): Promise<void> {
    await tenantQuery(
      ctx,
      `UPDATE royalty_statement_rows
       SET match_status = 'manual',
           matched_work_id = $1,
           match_confidence = $2,
           match_method = 'manual',
           review_status = 'approved',
           reviewed_by = $3,
           reviewed_at = NOW()
       WHERE statement_id = $4 AND row_number = $5`,
      [
        resolution.matchedWorkId || item.matchResult.matchedWorkId,
        resolution.confidence || item.matchResult.confidence,
        item.resolvedBy,
        item.statementId,
        item.rowNumber,
      ]
    );
  }

  /**
   * Map database row to ReviewItem
   */
  private mapRowToReviewItem(row: any): ReviewItem {
    return {
      id: row.id,
      statementId: row.statement_id,
      rowNumber: row.row_number,
      statementRow: row.statement_row,
      matchResult: row.match_result,
      status: row.status,
      assignedTo: row.assigned_to,
      resolvedBy: row.resolved_by,
      resolvedAt: row.resolved_at,
      resolution: row.resolution,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

// ============================================================================
// Review Queue Database Schema (for reference)
// ============================================================================

/*
CREATE TABLE royalty_review_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  statement_id UUID NOT NULL REFERENCES royalty_statements(id),
  row_number INTEGER NOT NULL,
  statement_row JSONB NOT NULL,
  match_result JSONB NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  assigned_to UUID REFERENCES users(id),
  resolved_by UUID REFERENCES users(id),
  resolved_at TIMESTAMPTZ,
  resolution JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(statement_id, row_number)
);

CREATE INDEX idx_review_queue_status ON royalty_review_queue(status);
CREATE INDEX idx_review_queue_statement ON royalty_review_queue(statement_id);
CREATE INDEX idx_review_queue_assigned ON royalty_review_queue(assigned_to) WHERE assigned_to IS NOT NULL;
*/

// Export singleton
export const reviewQueueService = new ReviewQueueService();
