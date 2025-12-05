// ============================================================================
// PubFlow AI - AI Orchestrator
// ============================================================================
// Hierarchical coordinator for all AI agents with:
// - Unified API for AI operations
// - Pipeline orchestration
// - Batch processing
// - Audit logging
// - Configuration management
// ============================================================================

import { db } from '../../infrastructure/database/connection.js';
import { getEnrichmentAgent, EnrichmentAgent } from './enrichment-agent.js';
import { getMatchingAgent, MatchingAgent } from './matching-agent.js';
import { getConflictAgent, ConflictDetectionAgent } from './conflict-agent.js';
import { getEmbeddingService, EmbeddingService } from './embedding-service.js';
import type {
  AIContext,
  AIResult,
  AIAuditLog,
  OrchestratorRequest,
  OrchestratorResult,
  OrchestratorOptions,
  OrchestratorSummary,
  EnrichmentRequest,
  EnrichmentResult,
  MatchingRequest,
  MatchingResult,
  ConflictCheckRequest,
  ConflictCheckResult,
  ConflictType,
} from './types.js';

// ----------------------------------------------------------------------------
// Configuration
// ----------------------------------------------------------------------------

const DEFAULT_OPTIONS: OrchestratorOptions = {
  autoApplyEnrichments: false,
  enrichmentConfidenceThreshold: 0.95,
  matchingAutoMatchThreshold: 0.95,
  matchingReviewThreshold: 0.70,
  skipConflictCheck: false,
  maxConcurrency: 5,
  timeout: 30000,
};

// ----------------------------------------------------------------------------
// AI Orchestrator Class
// ----------------------------------------------------------------------------

export class AIOrchestrator {
  private enrichmentAgent: EnrichmentAgent;
  private matchingAgent: MatchingAgent;
  private conflictAgent: ConflictDetectionAgent;
  private embeddingService: EmbeddingService;

  constructor() {
    this.enrichmentAgent = getEnrichmentAgent();
    this.matchingAgent = getMatchingAgent();
    this.conflictAgent = getConflictAgent();
    this.embeddingService = getEmbeddingService();
  }

  // --------------------------------------------------------------------------
  // Main Orchestration Methods
  // --------------------------------------------------------------------------

  /**
   * Process a request through the AI pipeline
   */
  async process(
    ctx: AIContext,
    request: OrchestratorRequest
  ): Promise<AIResult<OrchestratorResult>> {
    const startTime = Date.now();
    const options = { ...DEFAULT_OPTIONS, ...request.options };

    try {
      let result: OrchestratorResult;

      switch (request.action) {
        case 'enrich_work':
          result = await this.enrichWork(ctx, request, options);
          break;
        case 'match_statement':
          result = await this.matchStatement(ctx, request, options);
          break;
        case 'check_conflicts':
          result = await this.checkConflicts(ctx, request, options);
          break;
        case 'full_analysis':
          result = await this.fullAnalysis(ctx, request, options);
          break;
        case 'batch_enrich':
          result = await this.batchEnrich(ctx, request, options);
          break;
        case 'batch_match':
          result = await this.batchMatch(ctx, request, options);
          break;
        default:
          throw new Error(`Unknown action: ${request.action}`);
      }

      // Log audit
      await this.logAudit(ctx, request, result, true);

      return {
        success: true,
        data: result,
        confidence: this.calculateOverallConfidence(result),
        processingTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Log failed audit
      await this.logAudit(ctx, request, { error: errorMessage } as any, false);

      return {
        success: false,
        error: errorMessage,
        confidence: 0,
        processingTimeMs: Date.now() - startTime,
      };
    }
  }

  // --------------------------------------------------------------------------
  // Individual Action Handlers
  // --------------------------------------------------------------------------

  /**
   * Enrich a single work
   */
  private async enrichWork(
    ctx: AIContext,
    request: OrchestratorRequest,
    options: OrchestratorOptions
  ): Promise<OrchestratorResult> {
    if (!request.workId || !request.workData) {
      throw new Error('workId and workData required for enrich_work');
    }

    // Fetch work if not provided
    const workData = await this.getWorkData(ctx.tenantId, request.workId);

    const enrichmentRequest: EnrichmentRequest = {
      workId: request.workId,
      title: workData.title,
      writers: workData.writers?.map((w: any) => `${w.firstName} ${w.lastName}`),
      performers: workData.performers,
      iswc: workData.iswc,
      isrc: workData.isrc,
    };

    const enrichmentResult = await this.enrichmentAgent.enrichWork(ctx, enrichmentRequest);

    // Auto-apply high-confidence enrichments if enabled
    if (options.autoApplyEnrichments) {
      for (const proposal of enrichmentResult.proposals) {
        if (proposal.confidence >= options.enrichmentConfidenceThreshold) {
          await this.enrichmentAgent.approveProposal(ctx, proposal.id);
        }
      }
    }

    // Run conflict check unless skipped
    let conflictResult: ConflictCheckResult | undefined;
    if (!options.skipConflictCheck && request.workData) {
      conflictResult = await this.conflictAgent.checkConflicts(
        ctx,
        request.workData as ConflictCheckRequest
      );
    }

    return {
      action: 'enrich_work',
      enrichmentResult,
      conflictResult,
      summary: this.buildSummary([enrichmentResult], [], conflictResult ? [conflictResult] : []),
    };
  }

  /**
   * Match a royalty statement line
   */
  private async matchStatement(
    ctx: AIContext,
    request: OrchestratorRequest,
    _options: OrchestratorOptions
  ): Promise<OrchestratorResult> {
    if (!request.matchingData) {
      throw new Error('matchingData required for match_statement');
    }

    const matchingResult = await this.matchingAgent.match(ctx, request.matchingData);

    return {
      action: 'match_statement',
      matchingResult,
      summary: this.buildSummary([], [matchingResult], []),
    };
  }

  /**
   * Check conflicts for a work
   */
  private async checkConflicts(
    ctx: AIContext,
    request: OrchestratorRequest,
    _options: OrchestratorOptions
  ): Promise<OrchestratorResult> {
    if (!request.workData) {
      throw new Error('workData required for check_conflicts');
    }

    const conflictResult = await this.conflictAgent.checkConflicts(
      ctx,
      request.workData as ConflictCheckRequest
    );

    return {
      action: 'check_conflicts',
      conflictResult,
      summary: this.buildSummary([], [], [conflictResult]),
    };
  }

  /**
   * Full analysis: enrichment + conflict detection
   */
  private async fullAnalysis(
    ctx: AIContext,
    request: OrchestratorRequest,
    options: OrchestratorOptions
  ): Promise<OrchestratorResult> {
    if (!request.workId) {
      throw new Error('workId required for full_analysis');
    }

    // Get work data
    const workData = await this.getWorkData(ctx.tenantId, request.workId);

    // Run enrichment
    const enrichmentResult = await this.enrichmentAgent.enrichWork(ctx, {
      workId: request.workId,
      title: workData.title,
      writers: workData.writers?.map((w: any) => `${w.firstName} ${w.lastName}`),
      iswc: workData.iswc,
    });

    // Auto-apply if enabled
    if (options.autoApplyEnrichments) {
      for (const proposal of enrichmentResult.proposals) {
        if (proposal.confidence >= options.enrichmentConfidenceThreshold) {
          await this.enrichmentAgent.approveProposal(ctx, proposal.id);
        }
      }
    }

    // Run conflict check
    const conflictRequest: ConflictCheckRequest = {
      workId: request.workId,
      title: workData.title,
      iswc: workData.iswc,
      writers: workData.writers || [],
      publishers: workData.publishers || [],
      territories: workData.territories,
    };

    const conflictResult = await this.conflictAgent.checkConflicts(ctx, conflictRequest);

    // Update work embeddings
    await this.updateWorkEmbedding(ctx.tenantId, workData);

    return {
      action: 'full_analysis',
      enrichmentResult,
      conflictResult,
      summary: this.buildSummary([enrichmentResult], [], [conflictResult]),
    };
  }

  /**
   * Batch enrich multiple works
   */
  private async batchEnrich(
    ctx: AIContext,
    request: OrchestratorRequest,
    options: OrchestratorOptions
  ): Promise<OrchestratorResult> {
    // Get works to enrich
    const works = await this.getWorksForBatchEnrichment(ctx.tenantId, 100);
    const enrichmentResults: EnrichmentResult[] = [];

    // Process in batches with concurrency limit
    const batchSize = options.maxConcurrency;
    for (let i = 0; i < works.length; i += batchSize) {
      const batch = works.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map((work) =>
          this.enrichmentAgent.enrichWork(ctx, {
            workId: work.id,
            title: work.title,
            writers: work.writers?.map((w: any) => `${w.firstName} ${w.lastName}`),
            iswc: work.iswc,
          })
        )
      );
      enrichmentResults.push(...batchResults);
    }

    return {
      action: 'batch_enrich',
      summary: this.buildSummary(enrichmentResults, [], []),
    };
  }

  /**
   * Batch match multiple statement lines
   */
  private async batchMatch(
    ctx: AIContext,
    request: OrchestratorRequest,
    options: OrchestratorOptions
  ): Promise<OrchestratorResult> {
    // This would typically come from the request
    const matchRequests: MatchingRequest[] = [];
    const matchingResults: MatchingResult[] = [];

    // Process in batches
    const batchSize = options.maxConcurrency;
    for (let i = 0; i < matchRequests.length; i += batchSize) {
      const batch = matchRequests.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map((req) => this.matchingAgent.match(ctx, req))
      );
      matchingResults.push(...batchResults);
    }

    return {
      action: 'batch_match',
      summary: this.buildSummary([], matchingResults, []),
    };
  }

  // --------------------------------------------------------------------------
  // Helper Methods
  // --------------------------------------------------------------------------

  private async getWorkData(tenantId: string, workId: string): Promise<any> {
    const result = await db.query(`
      SELECT
        w.id, w.title, w.iswc,
        (
          SELECT json_agg(json_build_object(
            'writerId', wr.id,
            'firstName', wr.first_name,
            'lastName', wr.last_name,
            'ipi', wr.ipi,
            'role', wiw.role,
            'prShare', wiw.pr_share,
            'mrShare', wiw.mr_share,
            'srShare', wiw.sr_share,
            'controlled', wiw.controlled,
            'society', wr.pr_affiliation
          ))
          FROM writers_in_works wiw
          JOIN writers wr ON wiw.writer_id = wr.id
          WHERE wiw.work_id = w.id
        ) as writers,
        (
          SELECT json_agg(json_build_object(
            'publisherId', p.id,
            'name', p.name,
            'ipi', p.ipi,
            'role', piw.role,
            'prShare', piw.pr_share,
            'mrShare', piw.mr_share,
            'srShare', piw.sr_share,
            'controlled', piw.controlled,
            'society', p.pr_affiliation
          ))
          FROM publishers_in_works piw
          JOIN publishers p ON piw.publisher_id = p.id
          WHERE piw.work_id = w.id
        ) as publishers
      FROM works w
      WHERE w.id = $1 AND w.tenant_id = $2
    `, [workId, tenantId]);

    if (result.rows.length === 0) {
      throw new Error(`Work not found: ${workId}`);
    }

    return result.rows[0];
  }

  private async getWorksForBatchEnrichment(
    tenantId: string,
    limit: number
  ): Promise<any[]> {
    // Get works that haven't been enriched recently
    const result = await db.query(`
      SELECT w.id, w.title, w.iswc,
        (
          SELECT json_agg(json_build_object(
            'firstName', wr.first_name,
            'lastName', wr.last_name
          ))
          FROM writers_in_works wiw
          JOIN writers wr ON wiw.writer_id = wr.id
          WHERE wiw.work_id = w.id
        ) as writers
      FROM works w
      WHERE w.tenant_id = $1
        AND w.ai_enriched = false
        AND w.status = 'active'
      ORDER BY w.created_at DESC
      LIMIT $2
    `, [tenantId, limit]);

    return result.rows;
  }

  private async updateWorkEmbedding(tenantId: string, work: any): Promise<void> {
    const embedding = await this.embeddingService.embedWork({
      id: work.id,
      title: work.title,
      writers: work.writers,
    });

    await this.embeddingService.storeWorkEmbedding(tenantId, embedding);
  }

  private buildSummary(
    enrichmentResults: EnrichmentResult[],
    matchingResults: MatchingResult[],
    conflictResults: ConflictCheckResult[]
  ): OrchestratorSummary {
    const conflictsByType: Record<ConflictType, number> = {
      share_total_invalid: 0,
      duplicate_iswc: 0,
      duplicate_work: 0,
      writer_conflict: 0,
      territory_overlap: 0,
      missing_controlled_party: 0,
      ipi_mismatch: 0,
      society_affiliation: 0,
    };

    for (const result of conflictResults) {
      for (const conflict of result.conflicts) {
        conflictsByType[conflict.type]++;
      }
    }

    let autoMatches = 0;
    let reviewRequired = 0;
    for (const result of matchingResults) {
      if (result.recommendation === 'auto_match') autoMatches++;
      if (result.recommendation === 'review') reviewRequired++;
    }

    let enrichmentsAutoApplied = 0;
    let enrichmentsProposed = 0;
    for (const result of enrichmentResults) {
      enrichmentsProposed += result.proposals.length;
      enrichmentsAutoApplied += result.proposals.filter(
        (p) => p.status === 'auto_applied'
      ).length;
    }

    return {
      totalProcessed: enrichmentResults.length + matchingResults.length,
      enrichmentsProposed,
      enrichmentsAutoApplied,
      matchesFound: matchingResults.filter((r) => r.bestMatch).length,
      autoMatches,
      reviewRequired,
      conflictsFound: conflictResults.reduce(
        (sum, r) => sum + r.conflicts.length,
        0
      ),
      conflictsByType,
      processingTimeMs: 0, // Set by caller
      errors: [],
    };
  }

  private calculateOverallConfidence(result: OrchestratorResult): number {
    const confidences: number[] = [];

    if (result.enrichmentResult) {
      const avgEnrichment = result.enrichmentResult.proposals.length > 0
        ? result.enrichmentResult.proposals.reduce((sum, p) => sum + p.confidence, 0) /
          result.enrichmentResult.proposals.length
        : 0;
      if (avgEnrichment > 0) confidences.push(avgEnrichment);
    }

    if (result.matchingResult?.bestMatch) {
      confidences.push(result.matchingResult.bestMatch.score);
    }

    if (result.conflictResult) {
      // High confidence if no errors
      const hasErrors = result.conflictResult.conflicts.some(
        (c) => c.severity === 'error'
      );
      confidences.push(hasErrors ? 0.3 : 1.0);
    }

    return confidences.length > 0
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : 0;
  }

  private async logAudit(
    ctx: AIContext,
    request: OrchestratorRequest,
    result: OrchestratorResult | { error: string },
    success: boolean
  ): Promise<void> {
    try {
      await db.query(`
        INSERT INTO ai_audit_logs (
          id, tenant_id, agent_type, action, input, output,
          confidence, approved, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      `, [
        crypto.randomUUID(),
        ctx.tenantId,
        'orchestrator',
        request.action,
        JSON.stringify(request),
        JSON.stringify(result),
        success ? this.calculateOverallConfidence(result as OrchestratorResult) : 0,
        false,
      ]);
    } catch (error) {
      console.error('Failed to log AI audit:', error);
    }
  }

  // --------------------------------------------------------------------------
  // Convenience Methods
  // --------------------------------------------------------------------------

  /**
   * Quick enrich a work
   */
  async enrichWorkQuick(
    ctx: AIContext,
    workId: string
  ): Promise<EnrichmentResult> {
    const work = await this.getWorkData(ctx.tenantId, workId);
    return this.enrichmentAgent.enrichWork(ctx, {
      workId,
      title: work.title,
      writers: work.writers?.map((w: any) => `${w.firstName} ${w.lastName}`),
      iswc: work.iswc,
    });
  }

  /**
   * Quick match a statement line
   */
  async matchQuick(
    ctx: AIContext,
    request: MatchingRequest
  ): Promise<MatchingResult> {
    return this.matchingAgent.match(ctx, request);
  }

  /**
   * Quick conflict check
   */
  async checkConflictsQuick(
    ctx: AIContext,
    workId: string
  ): Promise<ConflictCheckResult> {
    const work = await this.getWorkData(ctx.tenantId, workId);
    return this.conflictAgent.checkConflicts(ctx, {
      workId,
      title: work.title,
      iswc: work.iswc,
      writers: work.writers || [],
      publishers: work.publishers || [],
    });
  }

  /**
   * Get AI stats for a tenant
   */
  async getAIStats(tenantId: string): Promise<{
    totalEnrichments: number;
    pendingEnrichments: number;
    totalMatches: number;
    autoMatches: number;
    openConflicts: number;
    matchingAccuracy: number;
  }> {
    const [enrichments, conflicts, matches] = await Promise.all([
      db.query(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'pending') as pending
        FROM enrichment_proposals
        WHERE tenant_id = $1
      `, [tenantId]),
      db.query(`
        SELECT COUNT(*) as open_conflicts
        FROM conflicts
        WHERE tenant_id = $1 AND status = 'open'
      `, [tenantId]),
      db.query(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'matched') as auto_matched
        FROM review_queue_items
        WHERE tenant_id = $1
      `, [tenantId]),
    ]);

    const totalMatches = parseInt(matches.rows[0]?.total || '0', 10);
    const autoMatches = parseInt(matches.rows[0]?.auto_matched || '0', 10);

    return {
      totalEnrichments: parseInt(enrichments.rows[0]?.total || '0', 10),
      pendingEnrichments: parseInt(enrichments.rows[0]?.pending || '0', 10),
      totalMatches,
      autoMatches,
      openConflicts: parseInt(conflicts.rows[0]?.open_conflicts || '0', 10),
      matchingAccuracy: totalMatches > 0 ? (autoMatches / totalMatches) * 100 : 0,
    };
  }
}

// ----------------------------------------------------------------------------
// Singleton Instance
// ----------------------------------------------------------------------------

let orchestrator: AIOrchestrator | null = null;

export function getAIOrchestrator(): AIOrchestrator {
  if (!orchestrator) {
    orchestrator = new AIOrchestrator();
  }
  return orchestrator;
}
