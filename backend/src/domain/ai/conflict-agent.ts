// ============================================================================
// PubFlow AI - Conflict Detection Agent
// ============================================================================
// Comprehensive validation and conflict detection:
// - Share totals (PR/MR/SR must equal 100%)
// - Duplicate ISWC detection
// - Semantic duplicate works
// - Writer conflicts and IPI mismatches
// - Territory overlaps
// - Society affiliation inconsistencies
// ============================================================================

import { db } from '../../infrastructure/database/connection.js';
import { getEmbeddingService } from './embedding-service.js';
import type {
  AIContext,
  ConflictCheckRequest,
  ConflictCheckResult,
  Conflict,
  ConflictType,
  ConflictDetails,
  WriterShare,
  PublisherShare,
} from './types.js';

// ----------------------------------------------------------------------------
// Configuration
// ----------------------------------------------------------------------------

interface ConflictConfig {
  shareTolerancePercent: number;          // 0.01 - allow 0.01% rounding error
  duplicateSimilarityThreshold: number;   // 0.85 - semantic duplicate threshold
  minConfidenceForConflict: number;       // 0.7 - confidence to flag conflict
}

const DEFAULT_CONFIG: ConflictConfig = {
  shareTolerancePercent: 0.01,
  duplicateSimilarityThreshold: 0.85,
  minConfidenceForConflict: 0.7,
};

// Valid roles for writers and publishers
const VALID_WRITER_ROLES = ['C', 'A', 'CA', 'AR', 'SA', 'SR', 'TR', 'AD', 'SE'];
const VALID_PUBLISHER_ROLES = ['E', 'AM', 'PA', 'SE', 'ES', 'AS'];

// ----------------------------------------------------------------------------
// Conflict Detection Agent Class
// ----------------------------------------------------------------------------

export class ConflictDetectionAgent {
  private embeddingService = getEmbeddingService();
  private config: ConflictConfig;

  constructor(config?: Partial<ConflictConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // --------------------------------------------------------------------------
  // Main Conflict Check Method
  // --------------------------------------------------------------------------

  /**
   * Run all conflict checks on a work
   */
  async checkConflicts(
    ctx: AIContext,
    request: ConflictCheckRequest
  ): Promise<ConflictCheckResult> {
    const startTime = Date.now();
    const conflicts: Conflict[] = [];
    const checkedRules: string[] = [];

    // Run all conflict checks
    const checks = [
      this.checkShareTotals(request),
      this.checkDuplicateIswc(ctx.tenantId, request),
      this.checkSemanticDuplicates(ctx.tenantId, request),
      this.checkWriterConflicts(ctx.tenantId, request),
      this.checkTerritoryOverlaps(request),
      this.checkControlledParties(request),
      this.checkIpiMismatches(ctx.tenantId, request),
      this.checkSocietyAffiliations(request),
      this.checkRoleValidity(request),
    ];

    const results = await Promise.all(checks);

    for (const result of results) {
      checkedRules.push(result.rule);
      conflicts.push(...result.conflicts);
    }

    // Store conflicts in database
    await this.storeConflicts(ctx.tenantId, request.workId, conflicts);

    return {
      workId: request.workId,
      conflicts,
      passed: conflicts.filter((c) => c.severity === 'error').length === 0,
      checkedRules,
      processingTimeMs: Date.now() - startTime,
    };
  }

  // --------------------------------------------------------------------------
  // Individual Conflict Checks
  // --------------------------------------------------------------------------

  /**
   * Check that PR/MR/SR shares total exactly 100%
   */
  private async checkShareTotals(
    request: ConflictCheckRequest
  ): Promise<{ rule: string; conflicts: Conflict[] }> {
    const conflicts: Conflict[] = [];
    const tolerance = this.config.shareTolerancePercent;

    const allParties = [...request.writers, ...request.publishers];

    // Check PR shares
    const prTotal = allParties.reduce((sum, p) => sum + p.prShare, 0);
    if (Math.abs(prTotal - 100) > tolerance) {
      conflicts.push(this.createConflict(
        request.workId,
        'share_total_invalid',
        prTotal > 100 ? 'error' : 'warning',
        `Performance rights shares total ${prTotal.toFixed(2)}%, expected 100%`,
        {
          shareType: 'PR',
          expectedTotal: 100,
          actualTotal: prTotal,
        },
        prTotal > 100
          ? 'Reduce writer/publisher PR shares to total 100%'
          : 'Add missing PR shares or check for uncontrolled parties'
      ));
    }

    // Check MR shares
    const mrTotal = allParties.reduce((sum, p) => sum + p.mrShare, 0);
    if (Math.abs(mrTotal - 100) > tolerance) {
      conflicts.push(this.createConflict(
        request.workId,
        'share_total_invalid',
        mrTotal > 100 ? 'error' : 'warning',
        `Mechanical rights shares total ${mrTotal.toFixed(2)}%, expected 100%`,
        {
          shareType: 'MR',
          expectedTotal: 100,
          actualTotal: mrTotal,
        },
        mrTotal > 100
          ? 'Reduce writer/publisher MR shares to total 100%'
          : 'Add missing MR shares'
      ));
    }

    // Check SR shares
    const srTotal = allParties.reduce((sum, p) => sum + p.srShare, 0);
    if (Math.abs(srTotal - 100) > tolerance) {
      conflicts.push(this.createConflict(
        request.workId,
        'share_total_invalid',
        srTotal > 100 ? 'error' : 'warning',
        `Synchronization rights shares total ${srTotal.toFixed(2)}%, expected 100%`,
        {
          shareType: 'SR',
          expectedTotal: 100,
          actualTotal: srTotal,
        },
        srTotal > 100
          ? 'Reduce writer/publisher SR shares to total 100%'
          : 'Add missing SR shares'
      ));
    }

    return { rule: 'share_totals', conflicts };
  }

  /**
   * Check for duplicate ISWC across works
   */
  private async checkDuplicateIswc(
    tenantId: string,
    request: ConflictCheckRequest
  ): Promise<{ rule: string; conflicts: Conflict[] }> {
    const conflicts: Conflict[] = [];

    if (!request.iswc) {
      return { rule: 'duplicate_iswc', conflicts };
    }

    const result = await db.query(`
      SELECT id, title FROM works
      WHERE tenant_id = $1 AND iswc = $2 AND id != $3
      LIMIT 1
    `, [tenantId, request.iswc, request.workId]);

    if (result.rows.length > 0) {
      const duplicate = result.rows[0];
      conflicts.push(this.createConflict(
        request.workId,
        'duplicate_iswc',
        'error',
        `ISWC ${request.iswc} is already assigned to "${duplicate.title}"`,
        {
          duplicateWorkId: duplicate.id,
          duplicateWorkTitle: duplicate.title,
        },
        'Remove ISWC from one of the works or merge duplicate works',
        false
      ));
    }

    return { rule: 'duplicate_iswc', conflicts };
  }

  /**
   * Check for semantically similar works (potential duplicates)
   */
  private async checkSemanticDuplicates(
    tenantId: string,
    request: ConflictCheckRequest
  ): Promise<{ rule: string; conflicts: Conflict[] }> {
    const conflicts: Conflict[] = [];

    try {
      // Build search text
      const queryText = [
        request.title,
        ...request.writers.map((w) => w.name),
      ].join(' ');

      // Generate embedding
      const queryEmbedding = await this.embeddingService.embed(queryText);

      // Search for similar works
      const similarWorks = await this.embeddingService.searchSimilarWorks(
        tenantId,
        queryEmbedding,
        {
          topK: 5,
          minSimilarity: this.config.duplicateSimilarityThreshold,
          includeMetadata: true,
        }
      );

      // Filter out the current work
      const duplicates = similarWorks.filter(
        (w) => w.workId !== request.workId && w.similarity >= this.config.duplicateSimilarityThreshold
      );

      for (const dup of duplicates) {
        // Get work details
        const workResult = await db.query(`
          SELECT title FROM works WHERE id = $1
        `, [dup.workId]);

        const dupTitle = workResult.rows[0]?.title || 'Unknown';

        conflicts.push(this.createConflict(
          request.workId,
          'duplicate_work',
          dup.similarity >= 0.95 ? 'error' : 'warning',
          `Potential duplicate: "${dupTitle}" (${Math.round(dup.similarity * 100)}% similar)`,
          {
            duplicateWorkId: dup.workId,
            duplicateWorkTitle: dupTitle,
            similarityScore: dup.similarity,
          },
          'Review and merge duplicate works if confirmed',
          false
        ));
      }
    } catch (error) {
      console.error('Semantic duplicate check failed:', error);
    }

    return { rule: 'semantic_duplicates', conflicts };
  }

  /**
   * Check for writer conflicts (same writer with different shares)
   */
  private async checkWriterConflicts(
    tenantId: string,
    request: ConflictCheckRequest
  ): Promise<{ rule: string; conflicts: Conflict[] }> {
    const conflicts: Conflict[] = [];

    for (const writer of request.writers) {
      if (!writer.ipi) continue;

      // Find other works with same writer IPI
      const result = await db.query(`
        SELECT w.id, w.title, wiw.pr_share, wiw.mr_share
        FROM works w
        JOIN writers_in_works wiw ON w.id = wiw.work_id
        JOIN writers wr ON wiw.writer_id = wr.id
        WHERE w.tenant_id = $1 AND wr.ipi = $2 AND w.id != $3
        LIMIT 5
      `, [tenantId, writer.ipi, request.workId]);

      for (const row of result.rows) {
        // Check for significant share differences
        const prDiff = Math.abs(row.pr_share - writer.prShare);
        const mrDiff = Math.abs(row.mr_share - writer.mrShare);

        if (prDiff > 10 || mrDiff > 10) {
          conflicts.push(this.createConflict(
            request.workId,
            'writer_conflict',
            'warning',
            `Writer "${writer.name}" has different shares in "${row.title}" (PR: ${row.pr_share}% vs ${writer.prShare}%)`,
            {
              writerId: writer.writerId,
              writerName: writer.name,
              existingShare: row.pr_share,
              newShare: writer.prShare,
            },
            'Review writer shares for consistency across works'
          ));
        }
      }
    }

    return { rule: 'writer_conflicts', conflicts };
  }

  /**
   * Check for territory overlaps
   */
  private async checkTerritoryOverlaps(
    request: ConflictCheckRequest
  ): Promise<{ rule: string; conflicts: Conflict[] }> {
    const conflicts: Conflict[] = [];

    // Build territory claims by party
    const territoryClaims = new Map<string, string[]>();

    for (const pub of request.publishers.filter((p) => p.controlled)) {
      const territories = request.territories || ['2136']; // World
      for (const territory of territories) {
        const existing = territoryClaims.get(territory) || [];
        existing.push(pub.name);
        territoryClaims.set(territory, existing);
      }
    }

    // Check for multiple claims on same territory
    for (const [territory, claimants] of territoryClaims) {
      if (claimants.length > 1) {
        conflicts.push(this.createConflict(
          request.workId,
          'territory_overlap',
          'warning',
          `Multiple publishers claiming territory ${territory}: ${claimants.join(', ')}`,
          {
            territory,
            claimingParties: claimants,
          },
          'Clarify territory assignments between publishers'
        ));
      }
    }

    return { rule: 'territory_overlaps', conflicts };
  }

  /**
   * Check that there's at least one controlled party
   */
  private async checkControlledParties(
    request: ConflictCheckRequest
  ): Promise<{ rule: string; conflicts: Conflict[] }> {
    const conflicts: Conflict[] = [];

    const hasControlledWriter = request.writers.some((w) => w.controlled);
    const hasControlledPublisher = request.publishers.some((p) => p.controlled);

    if (!hasControlledWriter && !hasControlledPublisher) {
      conflicts.push(this.createConflict(
        request.workId,
        'missing_controlled_party',
        'error',
        'No controlled writer or publisher in this work',
        {
          affectedFields: ['writers', 'publishers'],
        },
        'Add at least one controlled writer or publisher'
      ));
    }

    return { rule: 'controlled_parties', conflicts };
  }

  /**
   * Check IPI numbers match expected names
   */
  private async checkIpiMismatches(
    tenantId: string,
    request: ConflictCheckRequest
  ): Promise<{ rule: string; conflicts: Conflict[] }> {
    const conflicts: Conflict[] = [];

    for (const writer of request.writers) {
      if (!writer.ipi) continue;

      // Look up IPI in database
      const result = await db.query(`
        SELECT first_name, last_name, ipi FROM writers
        WHERE tenant_id = $1 AND ipi = $2
        LIMIT 1
      `, [tenantId, writer.ipi]);

      if (result.rows.length > 0) {
        const existingWriter = result.rows[0];
        const existingName = `${existingWriter.first_name} ${existingWriter.last_name}`.toLowerCase();
        const inputName = writer.name.toLowerCase();

        // Check if names are significantly different
        const similarity = this.stringSimilarity(existingName, inputName);
        if (similarity < 0.7) {
          conflicts.push(this.createConflict(
            request.workId,
            'ipi_mismatch',
            'warning',
            `IPI ${writer.ipi} is registered to "${existingWriter.first_name} ${existingWriter.last_name}" but work lists "${writer.name}"`,
            {
              expectedIpi: writer.ipi,
              actualIpi: writer.ipi,
              affectedFields: ['writer_name', 'writer_ipi'],
            },
            'Verify writer IPI or correct name spelling'
          ));
        }
      }
    }

    return { rule: 'ipi_mismatches', conflicts };
  }

  /**
   * Check society affiliations are consistent
   */
  private async checkSocietyAffiliations(
    request: ConflictCheckRequest
  ): Promise<{ rule: string; conflicts: Conflict[] }> {
    const conflicts: Conflict[] = [];

    // Check writers have society if controlled
    for (const writer of request.writers) {
      if (writer.controlled && !writer.society) {
        conflicts.push(this.createConflict(
          request.workId,
          'society_affiliation',
          'warning',
          `Controlled writer "${writer.name}" has no society affiliation`,
          {
            writerId: writer.writerId,
            writerName: writer.name,
          },
          'Add society affiliation for controlled writer'
        ));
      }
    }

    // Check publishers have society if controlled
    for (const pub of request.publishers) {
      if (pub.controlled && !pub.society) {
        conflicts.push(this.createConflict(
          request.workId,
          'society_affiliation',
          'warning',
          `Controlled publisher "${pub.name}" has no society affiliation`,
          {
            affectedFields: ['publisher_society'],
          },
          'Add society affiliation for controlled publisher'
        ));
      }
    }

    return { rule: 'society_affiliations', conflicts };
  }

  /**
   * Check role validity
   */
  private async checkRoleValidity(
    request: ConflictCheckRequest
  ): Promise<{ rule: string; conflicts: Conflict[] }> {
    const conflicts: Conflict[] = [];

    for (const writer of request.writers) {
      if (!VALID_WRITER_ROLES.includes(writer.role)) {
        conflicts.push(this.createConflict(
          request.workId,
          'writer_conflict',
          'error',
          `Invalid writer role "${writer.role}" for "${writer.name}"`,
          {
            writerId: writer.writerId,
            writerName: writer.name,
            affectedFields: ['writer_role'],
          },
          `Use valid role: ${VALID_WRITER_ROLES.join(', ')}`
        ));
      }
    }

    for (const pub of request.publishers) {
      if (!VALID_PUBLISHER_ROLES.includes(pub.role)) {
        conflicts.push(this.createConflict(
          request.workId,
          'writer_conflict', // Using writer_conflict type for now
          'error',
          `Invalid publisher role "${pub.role}" for "${pub.name}"`,
          {
            affectedFields: ['publisher_role'],
          },
          `Use valid role: ${VALID_PUBLISHER_ROLES.join(', ')}`
        ));
      }
    }

    return { rule: 'role_validity', conflicts };
  }

  // --------------------------------------------------------------------------
  // Helper Methods
  // --------------------------------------------------------------------------

  private createConflict(
    workId: string,
    type: ConflictType,
    severity: Conflict['severity'],
    description: string,
    details: ConflictDetails,
    suggestedResolution?: string,
    autoResolvable: boolean = false
  ): Conflict {
    return {
      id: crypto.randomUUID(),
      workId,
      type,
      severity,
      description,
      details,
      suggestedResolution,
      autoResolvable,
      status: 'open',
      createdAt: new Date(),
    };
  }

  private async storeConflicts(
    tenantId: string,
    workId: string,
    conflicts: Conflict[]
  ): Promise<void> {
    // Clear existing open conflicts for this work
    await db.query(`
      UPDATE conflicts SET status = 'resolved', resolved_at = NOW()
      WHERE tenant_id = $1 AND work_id = $2 AND status = 'open'
    `, [tenantId, workId]);

    // Insert new conflicts
    for (const conflict of conflicts) {
      await db.query(`
        INSERT INTO conflicts (
          id, tenant_id, work_id, type, severity, description,
          details, suggested_resolution, auto_resolvable, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [
        conflict.id,
        tenantId,
        workId,
        conflict.type,
        conflict.severity,
        conflict.description,
        JSON.stringify(conflict.details),
        conflict.suggestedResolution,
        conflict.autoResolvable,
        conflict.status,
        conflict.createdAt,
      ]);
    }
  }

  /**
   * Resolve a conflict
   */
  async resolveConflict(
    ctx: AIContext,
    conflictId: string,
    resolution: 'resolved' | 'ignored'
  ): Promise<void> {
    await db.query(`
      UPDATE conflicts
      SET status = $2, resolved_at = NOW(), resolved_by = $3
      WHERE id = $1 AND tenant_id = $4
    `, [conflictId, resolution, ctx.userId, ctx.tenantId]);
  }

  /**
   * Get open conflicts for a tenant
   */
  async getOpenConflicts(
    tenantId: string,
    options?: { workId?: string; severity?: string; limit?: number }
  ): Promise<Conflict[]> {
    const conditions = ['tenant_id = $1', "status = 'open'"];
    const params: unknown[] = [tenantId];

    if (options?.workId) {
      conditions.push(`work_id = $${params.length + 1}`);
      params.push(options.workId);
    }

    if (options?.severity) {
      conditions.push(`severity = $${params.length + 1}`);
      params.push(options.severity);
    }

    const limit = options?.limit || 100;
    params.push(limit);

    const result = await db.query(`
      SELECT * FROM conflicts
      WHERE ${conditions.join(' AND ')}
      ORDER BY
        CASE severity WHEN 'error' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,
        created_at DESC
      LIMIT $${params.length}
    `, params);

    return result.rows;
  }

  private stringSimilarity(a: string, b: string): number {
    if (a === b) return 1;
    if (!a || !b) return 0;

    const longer = a.length > b.length ? a : b;
    const shorter = a.length > b.length ? b : a;
    const longerLength = longer.length;

    if (longerLength === 0) return 1;

    const distance = this.levenshteinDistance(longer, shorter);
    return (longerLength - distance) / longerLength;
  }

  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }
}

// ----------------------------------------------------------------------------
// Singleton Instance
// ----------------------------------------------------------------------------

let conflictAgent: ConflictDetectionAgent | null = null;

export function getConflictAgent(): ConflictDetectionAgent {
  if (!conflictAgent) {
    conflictAgent = new ConflictDetectionAgent();
  }
  return conflictAgent;
}
