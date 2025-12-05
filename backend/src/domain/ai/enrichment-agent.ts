// ============================================================================
// PubFlow AI - Enrichment Agent
// ============================================================================
// Discovers and proposes metadata from external sources:
// - MusicBrainz (ISWC, recordings, ISRCs)
// - Discogs (release info, performers)
// - PRO databases (ASCAP ACE, BMI Repertoire)
// ============================================================================

import { db } from '../../infrastructure/database/connection.js';
import type {
  AIContext,
  EnrichmentRequest,
  EnrichmentResult,
  EnrichmentProposal,
  EnrichmentEvidence,
  EnrichableField,
  EnrichmentSource,
  MusicBrainzWork,
  DiscogsRelease,
} from './types.js';

// ----------------------------------------------------------------------------
// Configuration
// ----------------------------------------------------------------------------

const MUSICBRAINZ_API = 'https://musicbrainz.org/ws/2';
const DISCOGS_API = 'https://api.discogs.com';
const USER_AGENT = 'PubFlowAI/1.0 (publishing@pubflow.ai)';

const DEFAULT_SOURCES: EnrichmentSource[] = [
  { name: 'musicbrainz', priority: 1, enabled: true, rateLimit: 1 },
  { name: 'discogs', priority: 2, enabled: true, rateLimit: 1 },
];

// Auto-apply threshold (proposals above this confidence are auto-applied)
const AUTO_APPLY_THRESHOLD = 0.95;

// ----------------------------------------------------------------------------
// Rate Limiter
// ----------------------------------------------------------------------------

class RateLimiter {
  private lastRequest: Map<string, number> = new Map();
  private minIntervalMs: number;

  constructor(requestsPerSecond: number = 1) {
    this.minIntervalMs = 1000 / requestsPerSecond;
  }

  async throttle(key: string): Promise<void> {
    const now = Date.now();
    const lastTime = this.lastRequest.get(key) || 0;
    const elapsed = now - lastTime;

    if (elapsed < this.minIntervalMs) {
      await new Promise((resolve) =>
        setTimeout(resolve, this.minIntervalMs - elapsed)
      );
    }

    this.lastRequest.set(key, Date.now());
  }
}

// ----------------------------------------------------------------------------
// Enrichment Agent Class
// ----------------------------------------------------------------------------

export class EnrichmentAgent {
  private rateLimiter = new RateLimiter(1);
  private sources: EnrichmentSource[];
  private discogsToken?: string;

  constructor(options?: { sources?: EnrichmentSource[]; discogsToken?: string }) {
    this.sources = options?.sources || DEFAULT_SOURCES;
    this.discogsToken = options?.discogsToken || process.env.DISCOGS_TOKEN;
  }

  // --------------------------------------------------------------------------
  // Main Enrichment Method
  // --------------------------------------------------------------------------

  /**
   * Enrich a work with metadata from external sources
   */
  async enrichWork(
    ctx: AIContext,
    request: EnrichmentRequest
  ): Promise<EnrichmentResult> {
    const startTime = Date.now();
    const proposals: EnrichmentProposal[] = [];
    const sourcesQueried: EnrichmentSource['name'][] = [];
    let totalMatches = 0;

    // Determine which sources to query
    const activeSources = this.sources
      .filter((s) => s.enabled)
      .filter((s) => !request.sources || request.sources.includes(s.name))
      .sort((a, b) => a.priority - b.priority);

    // Query each source
    for (const source of activeSources) {
      try {
        await this.rateLimiter.throttle(source.name);
        sourcesQueried.push(source.name);

        const sourceProposals = await this.querySource(source.name, request);
        proposals.push(...sourceProposals);
        totalMatches += sourceProposals.length > 0 ? 1 : 0;
      } catch (error) {
        console.error(`Error querying ${source.name}:`, error);
      }
    }

    // Deduplicate and rank proposals
    const rankedProposals = this.deduplicateAndRank(proposals);

    // Store proposals in database
    await this.storeProposals(ctx.tenantId, request.workId, rankedProposals);

    return {
      workId: request.workId,
      proposals: rankedProposals,
      sourcesQueried,
      totalMatches,
      processingTimeMs: Date.now() - startTime,
    };
  }

  // --------------------------------------------------------------------------
  // Source-Specific Query Methods
  // --------------------------------------------------------------------------

  private async querySource(
    source: EnrichmentSource['name'],
    request: EnrichmentRequest
  ): Promise<EnrichmentProposal[]> {
    switch (source) {
      case 'musicbrainz':
        return this.queryMusicBrainz(request);
      case 'discogs':
        return this.queryDiscogs(request);
      case 'ascap':
        return this.queryASCAP(request);
      case 'bmi':
        return this.queryBMI(request);
      default:
        return [];
    }
  }

  /**
   * Query MusicBrainz for work metadata
   */
  private async queryMusicBrainz(
    request: EnrichmentRequest
  ): Promise<EnrichmentProposal[]> {
    const proposals: EnrichmentProposal[] = [];

    // Search by title and writers
    const query = this.buildMusicBrainzQuery(request);
    const searchUrl = `${MUSICBRAINZ_API}/work?query=${encodeURIComponent(query)}&fmt=json&limit=10`;

    const response = await fetch(searchUrl, {
      headers: { 'User-Agent': USER_AGENT },
    });

    if (!response.ok) return proposals;

    const data = await response.json() as { works?: MusicBrainzWork[] };
    const works = data.works || [];

    for (const work of works) {
      const matchScore = this.calculateMatchScore(request, {
        title: work.title,
        iswc: work.iswc,
      });

      if (matchScore < 0.5) continue;

      // ISWC proposal
      if (work.iswc && !request.iswc) {
        proposals.push(this.createProposal(
          request.workId,
          'iswc',
          request.iswc || null,
          work.iswc,
          'musicbrainz',
          matchScore,
          [{
            source: 'MusicBrainz',
            url: `https://musicbrainz.org/work/${work.id}`,
            matchScore,
            rawData: { workId: work.id, title: work.title },
            timestamp: new Date(),
          }]
        ));
      }

      // Get recordings for ISRC
      if (work.id) {
        const recordings = await this.getMusicBrainzRecordings(work.id);
        for (const recording of recordings.slice(0, 3)) {
          if (recording.isrc && !request.isrc) {
            proposals.push(this.createProposal(
              request.workId,
              'isrc',
              request.isrc || null,
              recording.isrc,
              'musicbrainz',
              matchScore * 0.9,
              [{
                source: 'MusicBrainz',
                url: `https://musicbrainz.org/recording/${recording.id}`,
                matchScore: matchScore * 0.9,
                rawData: recording,
                timestamp: new Date(),
              }]
            ));
          }

          // Duration
          if (recording.duration) {
            proposals.push(this.createProposal(
              request.workId,
              'duration',
              null,
              String(recording.duration),
              'musicbrainz',
              matchScore * 0.85,
              [{
                source: 'MusicBrainz',
                matchScore: matchScore * 0.85,
                rawData: { duration: recording.duration },
                timestamp: new Date(),
              }]
            ));
          }
        }
      }
    }

    return proposals;
  }

  /**
   * Get recordings for a MusicBrainz work
   */
  private async getMusicBrainzRecordings(
    workId: string
  ): Promise<Array<{ id: string; title: string; isrc?: string; duration?: number }>> {
    await this.rateLimiter.throttle('musicbrainz');

    const url = `${MUSICBRAINZ_API}/recording?work=${workId}&fmt=json&limit=10`;
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
    });

    if (!response.ok) return [];

    const data = await response.json() as { recordings?: Array<{
      id: string;
      title: string;
      isrcs?: string[];
      length?: number;
    }> };

    return (data.recordings || []).map((r) => ({
      id: r.id,
      title: r.title,
      isrc: r.isrcs?.[0],
      duration: r.length,
    }));
  }

  /**
   * Query Discogs for release and performer info
   */
  private async queryDiscogs(
    request: EnrichmentRequest
  ): Promise<EnrichmentProposal[]> {
    const proposals: EnrichmentProposal[] = [];
    if (!this.discogsToken) return proposals;

    // Search releases
    const query = `${request.title} ${request.performers?.join(' ') || ''}`.trim();
    const searchUrl = `${DISCOGS_API}/database/search?q=${encodeURIComponent(query)}&type=release&per_page=10`;

    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        'Authorization': `Discogs token=${this.discogsToken}`,
      },
    });

    if (!response.ok) return proposals;

    const data = await response.json() as { results?: Array<{ id: number; title: string }> };
    const releases = data.results || [];

    for (const release of releases.slice(0, 3)) {
      // Get full release details
      await this.rateLimiter.throttle('discogs');
      const releaseData = await this.getDiscogsRelease(release.id);

      if (!releaseData) continue;

      const matchScore = this.calculateMatchScore(request, {
        title: releaseData.title,
        performers: releaseData.artists?.map((a) => a.name),
      });

      if (matchScore < 0.5) continue;

      // Extract performers
      if (releaseData.artists) {
        for (const artist of releaseData.artists) {
          proposals.push(this.createProposal(
            request.workId,
            'performer',
            null,
            artist.name,
            'discogs',
            matchScore * 0.85,
            [{
              source: 'Discogs',
              url: `https://www.discogs.com/release/${release.id}`,
              matchScore: matchScore * 0.85,
              rawData: { artistId: artist.id, artistName: artist.name },
              timestamp: new Date(),
            }]
          ));
        }
      }

      // Extract track info
      const matchingTrack = releaseData.tracklist?.find((t) =>
        this.normalizeTitle(t.title) === this.normalizeTitle(request.title)
      );

      if (matchingTrack?.duration) {
        const durationMs = this.parseDuration(matchingTrack.duration);
        if (durationMs) {
          proposals.push(this.createProposal(
            request.workId,
            'duration',
            null,
            String(durationMs),
            'discogs',
            matchScore * 0.8,
            [{
              source: 'Discogs',
              url: `https://www.discogs.com/release/${release.id}`,
              matchScore: matchScore * 0.8,
              rawData: { duration: matchingTrack.duration },
              timestamp: new Date(),
            }]
          ));
        }
      }
    }

    return proposals;
  }

  private async getDiscogsRelease(releaseId: number): Promise<DiscogsRelease | null> {
    const url = `${DISCOGS_API}/releases/${releaseId}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Authorization': `Discogs token=${this.discogsToken}`,
      },
    });

    if (!response.ok) return null;
    return response.json() as Promise<DiscogsRelease>;
  }

  /**
   * Query ASCAP ACE database (placeholder - would need web scraping)
   */
  private async queryASCAP(
    _request: EnrichmentRequest
  ): Promise<EnrichmentProposal[]> {
    // ASCAP ACE: https://www.ascap.com/repertory
    // Would require web scraping or official API access
    return [];
  }

  /**
   * Query BMI Repertoire (placeholder - would need web scraping)
   */
  private async queryBMI(
    _request: EnrichmentRequest
  ): Promise<EnrichmentProposal[]> {
    // BMI Repertoire: https://repertoire.bmi.com
    // Would require web scraping or official API access
    return [];
  }

  // --------------------------------------------------------------------------
  // Proposal Management
  // --------------------------------------------------------------------------

  /**
   * Create an enrichment proposal
   */
  private createProposal(
    workId: string,
    field: EnrichableField,
    currentValue: string | null,
    proposedValue: string,
    source: EnrichmentSource['name'],
    confidence: number,
    evidence: EnrichmentEvidence[]
  ): EnrichmentProposal {
    return {
      id: crypto.randomUUID(),
      workId,
      field,
      currentValue,
      proposedValue,
      source,
      confidence,
      evidence,
      status: confidence >= AUTO_APPLY_THRESHOLD ? 'auto_applied' : 'pending',
      createdAt: new Date(),
    };
  }

  /**
   * Deduplicate and rank proposals
   */
  private deduplicateAndRank(
    proposals: EnrichmentProposal[]
  ): EnrichmentProposal[] {
    // Group by field + proposedValue
    const grouped = new Map<string, EnrichmentProposal[]>();

    for (const proposal of proposals) {
      const key = `${proposal.field}:${proposal.proposedValue}`;
      const existing = grouped.get(key) || [];
      existing.push(proposal);
      grouped.set(key, existing);
    }

    // Take best proposal per field (highest confidence with most evidence)
    const result: EnrichmentProposal[] = [];
    const seenFields = new Set<string>();

    const sorted = Array.from(grouped.values())
      .map((group) => {
        // Merge evidence from all sources
        const merged = { ...group[0] };
        merged.evidence = group.flatMap((p) => p.evidence);
        merged.confidence = Math.max(...group.map((p) => p.confidence));
        return merged;
      })
      .sort((a, b) => b.confidence - a.confidence);

    for (const proposal of sorted) {
      // Only keep one proposal per field (the best one)
      if (!seenFields.has(proposal.field)) {
        seenFields.add(proposal.field);
        result.push(proposal);
      }
    }

    return result;
  }

  /**
   * Store proposals in database
   */
  private async storeProposals(
    tenantId: string,
    workId: string,
    proposals: EnrichmentProposal[]
  ): Promise<void> {
    if (proposals.length === 0) return;

    for (const proposal of proposals) {
      await db.query(`
        INSERT INTO enrichment_proposals (
          id, tenant_id, work_id, field, current_value, proposed_value,
          source, confidence, evidence, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (tenant_id, work_id, field, proposed_value)
        DO UPDATE SET
          confidence = GREATEST(enrichment_proposals.confidence, EXCLUDED.confidence),
          evidence = enrichment_proposals.evidence || EXCLUDED.evidence,
          updated_at = NOW()
      `, [
        proposal.id,
        tenantId,
        workId,
        proposal.field,
        proposal.currentValue,
        proposal.proposedValue,
        proposal.source,
        proposal.confidence,
        JSON.stringify(proposal.evidence),
        proposal.status,
        proposal.createdAt,
      ]);
    }
  }

  // --------------------------------------------------------------------------
  // Approval Methods
  // --------------------------------------------------------------------------

  /**
   * Approve an enrichment proposal and apply it to the work
   */
  async approveProposal(
    ctx: AIContext,
    proposalId: string
  ): Promise<void> {
    const result = await db.query(`
      UPDATE enrichment_proposals
      SET status = 'approved', reviewed_at = NOW(), reviewed_by = $2
      WHERE id = $1 AND tenant_id = $3
      RETURNING *
    `, [proposalId, ctx.userId, ctx.tenantId]);

    const proposal = result.rows[0];
    if (!proposal) throw new Error('Proposal not found');

    // Apply to work
    await this.applyProposalToWork(ctx.tenantId, proposal);
  }

  /**
   * Reject an enrichment proposal
   */
  async rejectProposal(
    ctx: AIContext,
    proposalId: string
  ): Promise<void> {
    await db.query(`
      UPDATE enrichment_proposals
      SET status = 'rejected', reviewed_at = NOW(), reviewed_by = $2
      WHERE id = $1 AND tenant_id = $3
    `, [proposalId, ctx.userId, ctx.tenantId]);
  }

  /**
   * Apply a proposal to the work record
   */
  private async applyProposalToWork(
    tenantId: string,
    proposal: EnrichmentProposal
  ): Promise<void> {
    const fieldMapping: Record<string, string> = {
      iswc: 'iswc',
      duration: 'duration',
      language: 'language',
    };

    const dbField = fieldMapping[proposal.field];
    if (dbField) {
      await db.query(`
        UPDATE works SET ${dbField} = $1, updated_at = NOW()
        WHERE id = $2 AND tenant_id = $3
      `, [proposal.proposedValue, proposal.workId, tenantId]);
    }
  }

  /**
   * Get pending proposals for a tenant
   */
  async getPendingProposals(
    tenantId: string,
    options?: { workId?: string; limit?: number }
  ): Promise<EnrichmentProposal[]> {
    const conditions = ['tenant_id = $1', "status = 'pending'"];
    const params: unknown[] = [tenantId];

    if (options?.workId) {
      conditions.push(`work_id = $${params.length + 1}`);
      params.push(options.workId);
    }

    const limit = options?.limit || 100;
    params.push(limit);

    const result = await db.query(`
      SELECT * FROM enrichment_proposals
      WHERE ${conditions.join(' AND ')}
      ORDER BY confidence DESC
      LIMIT $${params.length}
    `, params);

    return result.rows;
  }

  // --------------------------------------------------------------------------
  // Utility Methods
  // --------------------------------------------------------------------------

  private buildMusicBrainzQuery(request: EnrichmentRequest): string {
    const parts: string[] = [];

    if (request.title) {
      parts.push(`work:"${request.title}"`);
    }

    if (request.writers?.length) {
      parts.push(`artist:"${request.writers[0]}"`);
    }

    if (request.iswc) {
      parts.push(`iswc:"${request.iswc}"`);
    }

    return parts.join(' AND ') || request.title;
  }

  private calculateMatchScore(
    request: EnrichmentRequest,
    candidate: { title?: string; iswc?: string; performers?: string[] }
  ): number {
    let score = 0;
    let factors = 0;

    // Title similarity
    if (request.title && candidate.title) {
      score += this.stringSimilarity(
        this.normalizeTitle(request.title),
        this.normalizeTitle(candidate.title)
      );
      factors++;
    }

    // ISWC exact match
    if (request.iswc && candidate.iswc) {
      score += request.iswc === candidate.iswc ? 1 : 0;
      factors++;
    }

    // Performer match
    if (request.performers?.length && candidate.performers?.length) {
      const performerScore = this.calculateSetOverlap(
        request.performers.map((p) => p.toLowerCase()),
        candidate.performers.map((p) => p.toLowerCase())
      );
      score += performerScore;
      factors++;
    }

    return factors > 0 ? score / factors : 0;
  }

  private normalizeTitle(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
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

  private calculateSetOverlap(a: string[], b: string[]): number {
    const setA = new Set(a);
    const setB = new Set(b);
    const intersection = [...setA].filter((x) => setB.has(x));
    const union = new Set([...setA, ...setB]);
    return union.size > 0 ? intersection.length / union.size : 0;
  }

  private parseDuration(duration: string): number | null {
    // Parse "3:45" or "03:45" format
    const match = duration.match(/^(\d+):(\d+)$/);
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      return (minutes * 60 + seconds) * 1000;
    }
    return null;
  }
}

// ----------------------------------------------------------------------------
// Singleton Instance
// ----------------------------------------------------------------------------

let enrichmentAgent: EnrichmentAgent | null = null;

export function getEnrichmentAgent(): EnrichmentAgent {
  if (!enrichmentAgent) {
    enrichmentAgent = new EnrichmentAgent();
  }
  return enrichmentAgent;
}
