// ============================================================================
// PubFlow AI - Work Cache Service
// Zero-query processing pattern - preload all tenant works for fast matching
// ============================================================================

import { tenantQuery, TenantContext } from '../../infrastructure/database/pool.js';
import { logger } from '../../infrastructure/logging/logger.js';
import type { CachedWork, ProcessingContext, ProcessingStats } from './types.js';

// ============================================================================
// Work Cache
// ============================================================================

export class WorkCache {
  private cache = new Map<string, TenantWorkCache>();
  private ttlMs = 30 * 60 * 1000; // 30 minutes

  /**
   * Get or create processing context for a tenant
   */
  async getProcessingContext(
    ctx: TenantContext,
    statementId: string
  ): Promise<ProcessingContext> {
    const existing = this.cache.get(ctx.tenantId);

    // Check if cache is still valid
    if (existing && Date.now() - existing.loadedAt < this.ttlMs) {
      logger.debug('Using cached work data', {
        tenantId: ctx.tenantId,
        workCount: existing.workCache.size,
      });

      return {
        tenantId: ctx.tenantId,
        statementId,
        userId: ctx.userId || 'system',
        workCache: existing.workCache,
        iswcIndex: existing.iswcIndex,
        isrcIndex: existing.isrcIndex,
        workCodeIndex: existing.workCodeIndex,
        embeddingsReady: existing.embeddingsReady,
        stats: this.createStats(),
      };
    }

    // Load fresh data
    logger.info('Loading tenant work data into cache', { tenantId: ctx.tenantId });

    const tenantCache = await this.loadTenantData(ctx);
    this.cache.set(ctx.tenantId, tenantCache);

    return {
      tenantId: ctx.tenantId,
      statementId,
      userId: ctx.userId || 'system',
      workCache: tenantCache.workCache,
      iswcIndex: tenantCache.iswcIndex,
      isrcIndex: tenantCache.isrcIndex,
      workCodeIndex: tenantCache.workCodeIndex,
      embeddingsReady: tenantCache.embeddingsReady,
      stats: this.createStats(),
    };
  }

  /**
   * Load all tenant work data
   */
  private async loadTenantData(ctx: TenantContext): Promise<TenantWorkCache> {
    const startTime = Date.now();

    // Load works with writers and publishers
    const worksResult = await tenantQuery(
      ctx,
      `SELECT
        w.id,
        w.work_code,
        w.title,
        w.iswc,
        w.embedding,
        COALESCE(
          json_agg(DISTINCT jsonb_build_object(
            'id', wr.id,
            'firstName', wr.first_name,
            'lastName', wr.last_name,
            'share', wiw.share,
            'isControlled', wiw.is_controlled
          )) FILTER (WHERE wr.id IS NOT NULL),
          '[]'
        ) as writers,
        COALESCE(
          json_agg(DISTINCT jsonb_build_object(
            'id', p.id,
            'code', p.publisher_code,
            'name', p.name,
            'share', piw.share
          )) FILTER (WHERE p.id IS NOT NULL),
          '[]'
        ) as publishers
      FROM works w
      LEFT JOIN writers_in_works wiw ON w.id = wiw.work_id
      LEFT JOIN writers wr ON wiw.writer_id = wr.id
      LEFT JOIN publishers_in_works piw ON w.id = piw.work_id
      LEFT JOIN publishers p ON piw.publisher_id = p.id
      GROUP BY w.id, w.work_code, w.title, w.iswc, w.embedding`
    );

    // Load recordings
    const recordingsResult = await tenantQuery(
      ctx,
      `SELECT work_id, isrc, recording_title as title
       FROM recordings
       WHERE work_id IS NOT NULL`
    );

    // Build indices
    const workCache = new Map<string, CachedWork>();
    const iswcIndex = new Map<string, string>();
    const isrcIndex = new Map<string, string[]>();
    const workCodeIndex = new Map<string, string>();

    // Index recordings by work
    const recordingsByWork = new Map<string, Array<{ isrc?: string; title: string }>>();
    for (const rec of recordingsResult.rows) {
      const workRecs = recordingsByWork.get(rec.work_id) || [];
      workRecs.push({ isrc: rec.isrc, title: rec.title });
      recordingsByWork.set(rec.work_id, workRecs);

      // Index by ISRC
      if (rec.isrc) {
        const workIds = isrcIndex.get(rec.isrc) || [];
        if (!workIds.includes(rec.work_id)) {
          workIds.push(rec.work_id);
        }
        isrcIndex.set(rec.isrc, workIds);
      }
    }

    let embeddingsReady = true;

    // Process works
    for (const work of worksResult.rows as any[]) {
      const writers = (work.writers || []).map((w: any) => ({
        id: w.id,
        firstName: w.firstName || '',
        lastName: w.lastName || '',
        fullName: `${w.firstName || ''} ${w.lastName || ''}`.trim(),
        normalizedName: this.normalizeName(`${w.firstName || ''} ${w.lastName || ''}`),
        share: Number(w.share) || 0,
        isControlled: Boolean(w.isControlled),
      }));

      const publishers = (work.publishers || []).map((p: any) => ({
        id: p.id,
        code: p.code || '',
        name: p.name || '',
        share: Number(p.share) || 0,
      }));

      const cachedWork: CachedWork = {
        id: work.id,
        workCode: work.work_code,
        title: work.title,
        normalizedTitle: this.normalizeTitle(work.title),
        iswc: work.iswc,
        writers,
        publishers,
        recordings: recordingsByWork.get(work.id) || [],
        embedding: work.embedding,
      };

      // Check if embedding exists
      if (!work.embedding) {
        embeddingsReady = false;
      }

      workCache.set(work.id, cachedWork);

      // Index by ISWC
      if (work.iswc) {
        iswcIndex.set(this.normalizeISWC(work.iswc), work.id);
      }

      // Index by work code
      if (work.work_code) {
        workCodeIndex.set(work.work_code.toUpperCase(), work.id);
      }
    }

    const loadTime = Date.now() - startTime;
    logger.info('Tenant work data loaded', {
      tenantId: ctx.tenantId,
      workCount: workCache.size,
      iswcCount: iswcIndex.size,
      isrcCount: isrcIndex.size,
      embeddingsReady,
      loadTimeMs: loadTime,
    });

    return {
      workCache,
      iswcIndex,
      isrcIndex,
      workCodeIndex,
      embeddingsReady,
      loadedAt: Date.now(),
    };
  }

  /**
   * Invalidate tenant cache
   */
  invalidate(tenantId: string): void {
    this.cache.delete(tenantId);
    logger.debug('Cache invalidated', { tenantId });
  }

  /**
   * Invalidate all caches
   */
  invalidateAll(): void {
    this.cache.clear();
    logger.debug('All caches invalidated');
  }

  /**
   * Normalize title for matching
   */
  private normalizeTitle(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^\w\s]/g, '')     // Remove punctuation
      .replace(/\s+/g, ' ')         // Normalize whitespace
      .replace(/^(the|a|an)\s+/i, '') // Remove leading articles
      .trim();
  }

  /**
   * Normalize name for matching
   */
  private normalizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Normalize ISWC for indexing
   */
  private normalizeISWC(iswc: string): string {
    return iswc.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  }

  /**
   * Create fresh stats object
   */
  private createStats(): ProcessingStats {
    return {
      totalRows: 0,
      processedRows: 0,
      exactMatches: 0,
      fuzzyMatches: 0,
      noMatches: 0,
      reviewRequired: 0,
      errors: 0,
      startTime: new Date(),
      averageMatchTimeMs: 0,
    };
  }

  /**
   * Get cache stats
   */
  getCacheStats(): {
    tenants: number;
    totalWorks: number;
    memoryUsageEstimate: string;
  } {
    let totalWorks = 0;
    for (const cache of this.cache.values()) {
      totalWorks += cache.workCache.size;
    }

    // Rough memory estimate (very approximate)
    const avgWorkSize = 2000; // bytes per work
    const memoryBytes = totalWorks * avgWorkSize;
    const memoryMB = (memoryBytes / (1024 * 1024)).toFixed(2);

    return {
      tenants: this.cache.size,
      totalWorks,
      memoryUsageEstimate: `~${memoryMB} MB`,
    };
  }
}

// ============================================================================
// Tenant Cache Structure
// ============================================================================

interface TenantWorkCache {
  workCache: Map<string, CachedWork>;
  iswcIndex: Map<string, string>;
  isrcIndex: Map<string, string[]>;
  workCodeIndex: Map<string, string>;
  embeddingsReady: boolean;
  loadedAt: number;
}

// ============================================================================
// Text Normalization Utilities
// ============================================================================

/**
 * Normalize text for matching
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // Remove diacritics
    .replace(/[^\w\s]/g, '')           // Remove punctuation
    .replace(/\s+/g, ' ')              // Normalize whitespace
    .trim();
}

/**
 * Create phonetic code (simplified Soundex-like)
 */
export function phoneticEncode(text: string): string {
  const normalized = normalizeText(text);

  // Simplified phonetic encoding
  return normalized
    .replace(/[aeiouyhw]/g, '')        // Remove vowels and some consonants
    .replace(/b|f|p|v/g, '1')          // Group similar sounds
    .replace(/c|g|j|k|q|s|x|z/g, '2')
    .replace(/d|t/g, '3')
    .replace(/l/g, '4')
    .replace(/m|n/g, '5')
    .replace(/r/g, '6')
    .replace(/(.)\1+/g, '$1')          // Remove duplicates
    .slice(0, 6)                        // Limit length
    .padEnd(6, '0');                    // Pad if needed
}

/**
 * Calculate string similarity (Jaccard on character bigrams)
 */
export function stringSimilarity(a: string, b: string): number {
  const s1 = normalizeText(a);
  const s2 = normalizeText(b);

  if (s1 === s2) return 1.0;
  if (!s1 || !s2) return 0.0;

  // Create bigram sets
  const getBigrams = (str: string): Set<string> => {
    const bigrams = new Set<string>();
    for (let i = 0; i < str.length - 1; i++) {
      bigrams.add(str.slice(i, i + 2));
    }
    return bigrams;
  };

  const bigrams1 = getBigrams(s1);
  const bigrams2 = getBigrams(s2);

  // Jaccard similarity
  let intersection = 0;
  for (const bigram of bigrams1) {
    if (bigrams2.has(bigram)) {
      intersection++;
    }
  }

  const union = bigrams1.size + bigrams2.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * Calculate Levenshtein distance
 */
export function levenshteinDistance(a: string, b: string): number {
  const s1 = normalizeText(a);
  const s2 = normalizeText(b);

  if (s1 === s2) return 0;
  if (!s1.length) return s2.length;
  if (!s2.length) return s1.length;

  const matrix: number[][] = [];

  for (let i = 0; i <= s1.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= s2.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= s1.length; i++) {
    for (let j = 1; j <= s2.length; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,       // Deletion
        matrix[i][j - 1] + 1,       // Insertion
        matrix[i - 1][j - 1] + cost // Substitution
      );
    }
  }

  return matrix[s1.length][s2.length];
}

/**
 * Normalized Levenshtein similarity (0-1)
 */
export function levenshteinSimilarity(a: string, b: string): number {
  const s1 = normalizeText(a);
  const s2 = normalizeText(b);
  const maxLen = Math.max(s1.length, s2.length);

  if (maxLen === 0) return 1.0;

  const distance = levenshteinDistance(a, b);
  return 1 - distance / maxLen;
}

// Export singleton
export const workCache = new WorkCache();
