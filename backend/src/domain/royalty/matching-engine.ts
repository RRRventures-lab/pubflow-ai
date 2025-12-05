// ============================================================================
// PubFlow AI - Royalty Matching Engine
// Matches statement rows to works using exact and fuzzy matching
// ============================================================================

import { logger } from '../../infrastructure/logging/logger.js';
import {
  normalizeText,
  phoneticEncode,
  stringSimilarity,
  levenshteinSimilarity,
} from './work-cache.js';
import type {
  StatementRow,
  ProcessingContext,
  CachedWork,
  MatchResult,
  MatchCandidate,
  MatchStatus,
  MatchMethod,
  MatchingConfig,
  DEFAULT_MATCHING_CONFIG,
} from './types.js';

// ============================================================================
// Matching Engine
// ============================================================================

export class MatchingEngine {
  private config: MatchingConfig;

  constructor(config: Partial<MatchingConfig> = {}) {
    this.config = {
      exactMatchEnabled: true,
      fuzzyMatchEnabled: true,
      autoMatchThreshold: 0.95,
      reviewThreshold: 0.70,
      noMatchThreshold: 0.30,
      vectorSearchEnabled: true,
      vectorCandidateCount: 50,
      gptRerankEnabled: true,
      gptRerankTopK: 10,
      gptModel: 'gpt-4-turbo',
      batchSize: 100,
      concurrency: 5,
      timeoutMs: 30000,
      ...config,
    };
  }

  /**
   * Match a single statement row
   */
  async matchRow(
    row: StatementRow,
    ctx: ProcessingContext
  ): Promise<MatchResult> {
    const startTime = Date.now();
    const candidates: MatchCandidate[] = [];

    // Phase 1: Exact matching
    if (this.config.exactMatchEnabled) {
      const exactMatch = this.tryExactMatch(row, ctx);
      if (exactMatch) {
        return {
          rowNumber: row.rowNumber,
          status: 'exact',
          confidence: 1.0,
          matchedWorkId: exactMatch.workId,
          method: exactMatch.method,
          candidates: [exactMatch],
          processingTimeMs: Date.now() - startTime,
        };
      }
    }

    // Phase 2: Fuzzy matching
    if (this.config.fuzzyMatchEnabled) {
      const fuzzyCandidates = await this.fuzzyMatch(row, ctx);
      candidates.push(...fuzzyCandidates);
    }

    // Determine status based on best candidate
    const result = this.determineMatchResult(row, candidates, startTime);

    return result;
  }

  /**
   * Match multiple rows in batch
   */
  async matchBatch(
    rows: StatementRow[],
    ctx: ProcessingContext,
    onProgress?: (processed: number, total: number) => void
  ): Promise<MatchResult[]> {
    const results: MatchResult[] = [];
    const batchSize = this.config.batchSize;

    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);

      // Process batch concurrently (up to concurrency limit)
      const batchResults = await Promise.all(
        batch.map(row => this.matchRow(row, ctx))
      );

      results.push(...batchResults);

      // Update stats
      ctx.stats.processedRows = results.length;
      ctx.stats.exactMatches = results.filter(r => r.status === 'exact').length;
      ctx.stats.fuzzyMatches = results.filter(r =>
        r.status === 'fuzzy_high' || r.status === 'fuzzy_medium'
      ).length;
      ctx.stats.noMatches = results.filter(r => r.status === 'no_match').length;
      ctx.stats.reviewRequired = results.filter(r => r.status === 'fuzzy_medium').length;

      // Calculate average match time
      const totalTime = results.reduce((sum, r) => sum + r.processingTimeMs, 0);
      ctx.stats.averageMatchTimeMs = totalTime / results.length;

      onProgress?.(results.length, rows.length);
    }

    return results;
  }

  // ==========================================================================
  // Exact Matching
  // ==========================================================================

  /**
   * Try exact match using identifiers
   */
  private tryExactMatch(
    row: StatementRow,
    ctx: ProcessingContext
  ): MatchCandidate | null {
    // Try ISWC match
    if (row.iswc) {
      const normalizedISWC = row.iswc.replace(/[^A-Z0-9]/gi, '').toUpperCase();
      const workId = ctx.iswcIndex.get(normalizedISWC);

      if (workId) {
        const work = ctx.workCache.get(workId);
        if (work) {
          return this.createCandidate(work, 1.0, 'iswc', 'Matched by ISWC');
        }
      }
    }

    // Try ISRC match
    if (row.isrc) {
      const normalizedISRC = row.isrc.replace(/[^A-Z0-9]/gi, '').toUpperCase();
      const workIds = ctx.isrcIndex.get(normalizedISRC);

      if (workIds && workIds.length === 1) {
        const work = ctx.workCache.get(workIds[0]);
        if (work) {
          return this.createCandidate(work, 1.0, 'isrc', 'Matched by ISRC');
        }
      }
      // If multiple works have same ISRC, don't auto-match
      if (workIds && workIds.length > 1) {
        logger.debug('Multiple works found for ISRC', {
          isrc: row.isrc,
          workCount: workIds.length,
        });
      }
    }

    // Try work code match
    if (row.workCode) {
      const workId = ctx.workCodeIndex.get(row.workCode.toUpperCase());

      if (workId) {
        const work = ctx.workCache.get(workId);
        if (work) {
          return this.createCandidate(work, 1.0, 'work_code', 'Matched by work code');
        }
      }
    }

    return null;
  }

  // ==========================================================================
  // Fuzzy Matching
  // ==========================================================================

  /**
   * Perform fuzzy matching
   */
  private async fuzzyMatch(
    row: StatementRow,
    ctx: ProcessingContext
  ): Promise<MatchCandidate[]> {
    const candidates: MatchCandidate[] = [];

    // Need at least title for fuzzy matching
    if (!row.workTitle) {
      return candidates;
    }

    // Phase 1: Vector similarity search (if embeddings ready)
    if (this.config.vectorSearchEnabled && ctx.embeddingsReady) {
      // TODO: Integrate with actual vector search
      // For now, fall through to text-based fuzzy matching
    }

    // Phase 2: Text-based fuzzy matching
    const textCandidates = this.textFuzzyMatch(row, ctx);
    candidates.push(...textCandidates);

    // Phase 3: GPT reranking (if enabled and candidates found)
    if (this.config.gptRerankEnabled && candidates.length > 1) {
      // TODO: Integrate GPT-4 reranking
      // For now, just sort by score
      candidates.sort((a, b) => b.score - a.score);
    }

    return candidates.slice(0, this.config.vectorCandidateCount);
  }

  /**
   * Text-based fuzzy matching
   */
  private textFuzzyMatch(
    row: StatementRow,
    ctx: ProcessingContext
  ): MatchCandidate[] {
    const candidates: MatchCandidate[] = [];
    const normalizedTitle = normalizeText(row.workTitle || '');
    const phoneticTitle = phoneticEncode(row.workTitle || '');

    // Build writer name for matching
    let writerName = '';
    if (row.writerLastName && row.writerFirstName) {
      writerName = `${row.writerFirstName} ${row.writerLastName}`;
    } else if (row.writerName) {
      writerName = row.writerName;
    }
    const normalizedWriter = normalizeText(writerName);

    // Iterate through all works
    for (const work of ctx.workCache.values()) {
      let score = 0;
      let matchDetails: string[] = [];

      // Title similarity (weighted: 60%)
      const titleSimilarity = this.calculateTitleSimilarity(
        normalizedTitle,
        phoneticTitle,
        work.normalizedTitle,
        phoneticEncode(work.title)
      );
      score += titleSimilarity * 0.6;
      if (titleSimilarity > 0.8) {
        matchDetails.push(`Title: ${(titleSimilarity * 100).toFixed(0)}%`);
      }

      // Writer similarity (weighted: 40%)
      if (normalizedWriter) {
        const writerSimilarity = this.calculateWriterSimilarity(
          normalizedWriter,
          work.writers
        );
        score += writerSimilarity * 0.4;
        if (writerSimilarity > 0.8) {
          matchDetails.push(`Writer: ${(writerSimilarity * 100).toFixed(0)}%`);
        }
      } else {
        // If no writer info, boost title weight
        score = titleSimilarity;
      }

      // Only include if above threshold
      if (score >= this.config.noMatchThreshold) {
        candidates.push(this.createCandidate(
          work,
          score,
          'title_writer',
          matchDetails.join(', ') || `Score: ${(score * 100).toFixed(0)}%`
        ));
      }
    }

    // Sort by score descending
    candidates.sort((a, b) => b.score - a.score);

    return candidates.slice(0, this.config.vectorCandidateCount);
  }

  /**
   * Calculate title similarity using multiple methods
   */
  private calculateTitleSimilarity(
    normalizedA: string,
    phoneticA: string,
    normalizedB: string,
    phoneticB: string
  ): number {
    // Exact normalized match
    if (normalizedA === normalizedB) {
      return 1.0;
    }

    // Phonetic match
    if (phoneticA === phoneticB && phoneticA !== '000000') {
      return 0.95;
    }

    // String similarity methods
    const jaccardSim = stringSimilarity(normalizedA, normalizedB);
    const levenSim = levenshteinSimilarity(normalizedA, normalizedB);

    // Weighted combination
    return jaccardSim * 0.5 + levenSim * 0.5;
  }

  /**
   * Calculate writer similarity
   */
  private calculateWriterSimilarity(
    searchWriter: string,
    workWriters: CachedWork['writers']
  ): number {
    if (!workWriters || workWriters.length === 0) {
      return 0;
    }

    let bestMatch = 0;

    for (const writer of workWriters) {
      // Try full name match
      const fullNameSim = stringSimilarity(searchWriter, writer.normalizedName);

      // Try last name only match (higher weight for controlled writers)
      const lastNameSim = stringSimilarity(
        searchWriter,
        normalizeText(writer.lastName)
      );

      const writerSim = Math.max(fullNameSim, lastNameSim * 0.9);

      if (writerSim > bestMatch) {
        bestMatch = writerSim;
      }
    }

    return bestMatch;
  }

  // ==========================================================================
  // Result Determination
  // ==========================================================================

  /**
   * Determine final match result
   */
  private determineMatchResult(
    row: StatementRow,
    candidates: MatchCandidate[],
    startTime: number
  ): MatchResult {
    const processingTimeMs = Date.now() - startTime;

    if (candidates.length === 0) {
      return {
        rowNumber: row.rowNumber,
        status: 'no_match',
        confidence: 0,
        candidates: [],
        processingTimeMs,
      };
    }

    const bestCandidate = candidates[0];

    // Determine status based on confidence
    let status: MatchStatus;
    if (bestCandidate.score >= this.config.autoMatchThreshold) {
      status = 'fuzzy_high';
    } else if (bestCandidate.score >= this.config.reviewThreshold) {
      status = 'fuzzy_medium';
    } else if (bestCandidate.score >= this.config.noMatchThreshold) {
      status = 'fuzzy_low';
    } else {
      status = 'no_match';
    }

    return {
      rowNumber: row.rowNumber,
      status,
      confidence: bestCandidate.score,
      matchedWorkId: status === 'fuzzy_high' ? bestCandidate.workId : undefined,
      method: bestCandidate.method,
      candidates: candidates.slice(0, 10), // Return top 10
      processingTimeMs,
    };
  }

  /**
   * Create match candidate from work
   */
  private createCandidate(
    work: CachedWork,
    score: number,
    method: MatchMethod,
    explanation?: string
  ): MatchCandidate {
    return {
      workId: work.id,
      workCode: work.workCode,
      title: work.title,
      iswc: work.iswc,
      writers: work.writers.map(w => w.fullName),
      score,
      method,
      explanation,
    };
  }

  // ==========================================================================
  // Configuration
  // ==========================================================================

  /**
   * Update matching configuration
   */
  updateConfig(config: Partial<MatchingConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): MatchingConfig {
    return { ...this.config };
  }
}

// ============================================================================
// Vector Matching Integration (for AI-powered matching)
// ============================================================================

export interface VectorSearchResult {
  workId: string;
  similarity: number;
}

/**
 * Create embedding for text (placeholder - integrate with OpenAI)
 */
export async function createEmbedding(text: string): Promise<number[]> {
  // TODO: Integrate with OpenAI text-embedding-3-large
  // This is a placeholder that returns empty array
  logger.debug('Embedding creation not yet implemented', { textLength: text.length });
  return [];
}

/**
 * Search for similar works using vector similarity
 */
export async function vectorSearch(
  embedding: number[],
  tenantId: string,
  limit: number = 50
): Promise<VectorSearchResult[]> {
  // TODO: Implement pgvector search
  // SELECT id, 1 - (embedding <=> $1) as similarity
  // FROM works
  // WHERE tenant_id = $2
  // ORDER BY embedding <=> $1
  // LIMIT $3
  logger.debug('Vector search not yet implemented');
  return [];
}

// ============================================================================
// GPT Reranking (for AI-powered matching)
// ============================================================================

export interface RerankResult {
  workId: string;
  score: number;
  reasoning: string;
}

/**
 * Rerank candidates using GPT-4
 */
export async function gptRerank(
  row: StatementRow,
  candidates: MatchCandidate[],
  model: string = 'gpt-4-turbo'
): Promise<RerankResult[]> {
  // TODO: Implement GPT-4 reranking
  // Create prompt with statement row details and candidate works
  // Ask GPT to rank them by likelihood of being the same work
  logger.debug('GPT reranking not yet implemented');
  return candidates.map(c => ({
    workId: c.workId,
    score: c.score,
    reasoning: 'GPT reranking not implemented',
  }));
}

// Export singleton
export const matchingEngine = new MatchingEngine();
