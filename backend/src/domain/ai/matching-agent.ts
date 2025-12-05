// ============================================================================
// PubFlow AI - Matching Agent
// ============================================================================
// Intelligent matching of royalty statement lines to works using:
// 1. Exact matching (ISWC, ISRC, work codes)
// 2. Fuzzy matching (title/writer similarity)
// 3. Semantic matching (vector embeddings)
// 4. GPT-4 reranking for contextual understanding
// ============================================================================

import OpenAI from 'openai';
import { db } from '../../infrastructure/database/connection.js';
import { getEmbeddingService } from './embedding-service.js';
import type {
  AIContext,
  MatchingRequest,
  MatchingResult,
  MatchCandidate,
  MatchType,
  MatchDetail,
  PipelineStage,
  VectorSearchOptions,
} from './types.js';

// ----------------------------------------------------------------------------
// Configuration
// ----------------------------------------------------------------------------

interface MatchingConfig {
  autoMatchThreshold: number;     // 0.95 - auto-accept above this
  reviewThreshold: number;        // 0.70 - send to review above this
  noMatchThreshold: number;       // 0.30 - reject below this
  vectorSearchTopK: number;       // 50 - candidates from vector search
  fuzzySearchTopK: number;        // 20 - candidates from fuzzy search
  finalTopK: number;              // 10 - final candidates returned
  enableGptReranking: boolean;    // true - use GPT-4 for reranking
  gptRerankTopK: number;          // 10 - candidates to send to GPT
}

const DEFAULT_CONFIG: MatchingConfig = {
  autoMatchThreshold: 0.95,
  reviewThreshold: 0.70,
  noMatchThreshold: 0.30,
  vectorSearchTopK: 50,
  fuzzySearchTopK: 20,
  finalTopK: 10,
  enableGptReranking: true,
  gptRerankTopK: 10,
};

// ----------------------------------------------------------------------------
// Matching Agent Class
// ----------------------------------------------------------------------------

export class MatchingAgent {
  private openai: OpenAI;
  private embeddingService = getEmbeddingService();
  private config: MatchingConfig;

  constructor(config?: Partial<MatchingConfig>) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // --------------------------------------------------------------------------
  // Main Matching Method
  // --------------------------------------------------------------------------

  /**
   * Find the best matching work for a statement line
   */
  async match(
    ctx: AIContext,
    request: MatchingRequest
  ): Promise<MatchingResult> {
    const startTime = Date.now();
    const pipelineStages: PipelineStage[] = [];

    // Stage 1: Exact Matching
    const exactStart = Date.now();
    let candidates = await this.exactMatch(ctx.tenantId, request);
    pipelineStages.push({
      name: 'exact_match',
      candidatesIn: 1,
      candidatesOut: candidates.length,
      timeMs: Date.now() - exactStart,
    });

    // If we have a high-confidence exact match, return early
    if (candidates.length > 0 && candidates[0].score >= this.config.autoMatchThreshold) {
      return this.buildResult(candidates, pipelineStages, Date.now() - startTime);
    }

    // Stage 2: Fuzzy Matching
    const fuzzyStart = Date.now();
    const fuzzyCandidates = await this.fuzzyMatch(ctx.tenantId, request);
    candidates = this.mergeCandidates(candidates, fuzzyCandidates);
    pipelineStages.push({
      name: 'fuzzy_match',
      candidatesIn: fuzzyCandidates.length,
      candidatesOut: candidates.length,
      timeMs: Date.now() - fuzzyStart,
    });

    // Stage 3: Vector/Semantic Matching
    const vectorStart = Date.now();
    const vectorCandidates = await this.vectorMatch(ctx.tenantId, request);
    candidates = this.mergeCandidates(candidates, vectorCandidates);
    pipelineStages.push({
      name: 'vector_match',
      candidatesIn: vectorCandidates.length,
      candidatesOut: candidates.length,
      timeMs: Date.now() - vectorStart,
    });

    // Sort by score and limit
    candidates.sort((a, b) => b.score - a.score);
    candidates = candidates.slice(0, this.config.gptRerankTopK);

    // Stage 4: GPT-4 Reranking (if enabled and we have candidates)
    if (this.config.enableGptReranking && candidates.length > 1) {
      const gptStart = Date.now();
      candidates = await this.gptRerank(request, candidates);
      pipelineStages.push({
        name: 'gpt_rerank',
        candidatesIn: candidates.length,
        candidatesOut: candidates.length,
        timeMs: Date.now() - gptStart,
      });
    }

    // Final sort and limit
    candidates.sort((a, b) => b.score - a.score);
    candidates = candidates.slice(0, this.config.finalTopK);

    return this.buildResult(candidates, pipelineStages, Date.now() - startTime);
  }

  // --------------------------------------------------------------------------
  // Stage 1: Exact Matching
  // --------------------------------------------------------------------------

  private async exactMatch(
    tenantId: string,
    request: MatchingRequest
  ): Promise<MatchCandidate[]> {
    const candidates: MatchCandidate[] = [];

    // Match by ISWC
    if (request.iswc) {
      const result = await db.query(`
        SELECT w.id, w.title, w.iswc,
          array_agg(DISTINCT concat(wr.first_name, ' ', wr.last_name)) as writers
        FROM works w
        LEFT JOIN writers_in_works wiw ON w.id = wiw.work_id
        LEFT JOIN writers wr ON wiw.writer_id = wr.id
        WHERE w.tenant_id = $1 AND w.iswc = $2
        GROUP BY w.id
      `, [tenantId, request.iswc]);

      for (const row of result.rows) {
        candidates.push({
          workId: row.id,
          title: row.title,
          iswc: row.iswc,
          writers: row.writers.filter(Boolean),
          score: 1.0,
          matchType: 'exact',
          matchDetails: [{
            field: 'iswc',
            inputValue: request.iswc,
            matchedValue: row.iswc,
            similarity: 1.0,
            method: 'exact',
          }],
          explanation: 'Exact ISWC match',
        });
      }
    }

    // Match by ISRC (via recordings)
    if (request.isrc && candidates.length === 0) {
      const result = await db.query(`
        SELECT w.id, w.title, w.iswc, r.isrc,
          array_agg(DISTINCT concat(wr.first_name, ' ', wr.last_name)) as writers
        FROM works w
        JOIN recordings r ON w.id = r.work_id
        LEFT JOIN writers_in_works wiw ON w.id = wiw.work_id
        LEFT JOIN writers wr ON wiw.writer_id = wr.id
        WHERE w.tenant_id = $1 AND r.isrc = $2
        GROUP BY w.id, r.isrc
      `, [tenantId, request.isrc]);

      for (const row of result.rows) {
        candidates.push({
          workId: row.id,
          title: row.title,
          iswc: row.iswc,
          writers: row.writers.filter(Boolean),
          score: 0.98,
          matchType: 'exact',
          matchDetails: [{
            field: 'isrc',
            inputValue: request.isrc,
            matchedValue: row.isrc,
            similarity: 1.0,
            method: 'exact',
          }],
          explanation: 'Exact ISRC match via recording',
        });
      }
    }

    return candidates;
  }

  // --------------------------------------------------------------------------
  // Stage 2: Fuzzy Matching
  // --------------------------------------------------------------------------

  private async fuzzyMatch(
    tenantId: string,
    request: MatchingRequest
  ): Promise<MatchCandidate[]> {
    const candidates: MatchCandidate[] = [];
    const normalizedTitle = this.normalizeText(request.title);

    // PostgreSQL similarity search using pg_trgm
    const result = await db.query(`
      SELECT w.id, w.title, w.iswc,
        array_agg(DISTINCT concat(wr.first_name, ' ', wr.last_name)) as writers,
        similarity(lower(w.title), $2) as title_sim
      FROM works w
      LEFT JOIN writers_in_works wiw ON w.id = wiw.work_id
      LEFT JOIN writers wr ON wiw.writer_id = wr.id
      WHERE w.tenant_id = $1
        AND similarity(lower(w.title), $2) > 0.3
      GROUP BY w.id
      ORDER BY title_sim DESC
      LIMIT $3
    `, [tenantId, normalizedTitle, this.config.fuzzySearchTopK]);

    for (const row of result.rows) {
      const matchDetails: MatchDetail[] = [{
        field: 'title',
        inputValue: request.title,
        matchedValue: row.title,
        similarity: parseFloat(row.title_sim),
        method: 'levenshtein',
      }];

      // Calculate writer similarity if writers provided
      let writerSim = 0;
      if (request.writers?.length && row.writers?.length) {
        writerSim = this.calculateWriterSimilarity(request.writers, row.writers);
        matchDetails.push({
          field: 'writers',
          inputValue: request.writers.join(', '),
          matchedValue: row.writers.join(', '),
          similarity: writerSim,
          method: 'levenshtein',
        });
      }

      // Weighted score: 70% title, 30% writers
      const titleWeight = request.writers?.length ? 0.7 : 1.0;
      const writerWeight = request.writers?.length ? 0.3 : 0;
      const score = parseFloat(row.title_sim) * titleWeight + writerSim * writerWeight;

      candidates.push({
        workId: row.id,
        title: row.title,
        iswc: row.iswc,
        writers: row.writers.filter(Boolean),
        score,
        matchType: 'fuzzy',
        matchDetails,
        explanation: `Fuzzy match: ${Math.round(score * 100)}% overall similarity`,
      });
    }

    return candidates;
  }

  // --------------------------------------------------------------------------
  // Stage 3: Vector/Semantic Matching
  // --------------------------------------------------------------------------

  private async vectorMatch(
    tenantId: string,
    request: MatchingRequest
  ): Promise<MatchCandidate[]> {
    const candidates: MatchCandidate[] = [];

    // Build query text
    const queryText = [
      request.title,
      ...(request.writers || []),
      ...(request.performers || []),
    ].join(' ');

    // Generate embedding
    const queryEmbedding = await this.embeddingService.embed(queryText);

    // Search similar works
    const searchOptions: VectorSearchOptions = {
      topK: this.config.vectorSearchTopK,
      minSimilarity: 0.5,
      includeMetadata: true,
    };

    const vectorResults = await this.embeddingService.searchSimilarWorks(
      tenantId,
      queryEmbedding,
      searchOptions
    );

    // Fetch full work data for matches
    if (vectorResults.length > 0) {
      const workIds = vectorResults.map((r) => r.workId);

      const result = await db.query(`
        SELECT w.id, w.title, w.iswc,
          array_agg(DISTINCT concat(wr.first_name, ' ', wr.last_name)) as writers
        FROM works w
        LEFT JOIN writers_in_works wiw ON w.id = wiw.work_id
        LEFT JOIN writers wr ON wiw.writer_id = wr.id
        WHERE w.id = ANY($1)
        GROUP BY w.id
      `, [workIds]);

      const workMap = new Map(result.rows.map((r) => [r.id, r]));

      for (const vr of vectorResults) {
        const work = workMap.get(vr.workId);
        if (!work) continue;

        candidates.push({
          workId: work.id,
          title: work.title,
          iswc: work.iswc,
          writers: work.writers?.filter(Boolean) || [],
          score: vr.similarity,
          matchType: 'semantic',
          matchDetails: [{
            field: 'combined',
            inputValue: queryText,
            matchedValue: `${work.title} by ${work.writers?.join(', ')}`,
            similarity: vr.similarity,
            method: 'vector',
          }],
          explanation: `Semantic similarity: ${Math.round(vr.similarity * 100)}%`,
        });
      }
    }

    return candidates;
  }

  // --------------------------------------------------------------------------
  // Stage 4: GPT-4 Reranking
  // --------------------------------------------------------------------------

  private async gptRerank(
    request: MatchingRequest,
    candidates: MatchCandidate[]
  ): Promise<MatchCandidate[]> {
    if (candidates.length === 0) return candidates;

    const prompt = this.buildRerankingPrompt(request, candidates);

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          {
            role: 'system',
            content: `You are an expert music publishing analyst. Your task is to rank work candidates based on how well they match a royalty statement line. Consider:
- Title similarity (accounting for alternate titles, translations)
- Writer/composer name variations
- Context clues from performer or source
- Common music industry naming conventions

Return a JSON array of work IDs in order from best to worst match, with confidence scores.`,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: 1000,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) return candidates;

      const result = JSON.parse(content) as {
        rankings: Array<{
          workId: string;
          confidence: number;
          reasoning?: string;
        }>;
      };

      // Update candidates with GPT rankings
      const candidateMap = new Map(candidates.map((c) => [c.workId, c]));
      const reranked: MatchCandidate[] = [];

      for (const ranking of result.rankings) {
        const candidate = candidateMap.get(ranking.workId);
        if (candidate) {
          // Blend original score with GPT confidence
          const blendedScore = candidate.score * 0.4 + ranking.confidence * 0.6;
          reranked.push({
            ...candidate,
            score: blendedScore,
            matchType: 'ai_reranked',
            explanation: ranking.reasoning || candidate.explanation,
          });
        }
      }

      // Add any candidates not in GPT response
      for (const candidate of candidates) {
        if (!reranked.find((r) => r.workId === candidate.workId)) {
          reranked.push({
            ...candidate,
            score: candidate.score * 0.5, // Penalize non-ranked
          });
        }
      }

      return reranked;
    } catch (error) {
      console.error('GPT reranking failed:', error);
      return candidates; // Fall back to original ordering
    }
  }

  private buildRerankingPrompt(
    request: MatchingRequest,
    candidates: MatchCandidate[]
  ): string {
    return `## Royalty Statement Line
Title: ${request.title}
${request.writers?.length ? `Writers: ${request.writers.join(', ')}` : ''}
${request.performers?.length ? `Performers: ${request.performers.join(', ')}` : ''}
${request.source ? `Source: ${request.source}` : ''}
${request.amount ? `Amount: ${request.amount}` : ''}

## Candidate Works
${candidates.map((c, i) => `
${i + 1}. ID: ${c.workId}
   Title: ${c.title}
   ${c.iswc ? `ISWC: ${c.iswc}` : ''}
   Writers: ${c.writers.join(', ') || 'Unknown'}
   Current Score: ${(c.score * 100).toFixed(1)}%
`).join('')}

## Task
Rank these candidates from best to worst match. Return JSON:
{
  "rankings": [
    {"workId": "...", "confidence": 0.95, "reasoning": "..."},
    ...
  ]
}`;
  }

  // --------------------------------------------------------------------------
  // Helper Methods
  // --------------------------------------------------------------------------

  private mergeCandidates(
    existing: MatchCandidate[],
    newCandidates: MatchCandidate[]
  ): MatchCandidate[] {
    const map = new Map(existing.map((c) => [c.workId, c]));

    for (const candidate of newCandidates) {
      const existingCandidate = map.get(candidate.workId);
      if (existingCandidate) {
        // Merge: take max score and combine match details
        if (candidate.score > existingCandidate.score) {
          existingCandidate.score = candidate.score;
          existingCandidate.matchType = candidate.matchType;
          existingCandidate.explanation = candidate.explanation;
        }
        existingCandidate.matchDetails.push(...candidate.matchDetails);
      } else {
        map.set(candidate.workId, candidate);
      }
    }

    return Array.from(map.values());
  }

  private buildResult(
    candidates: MatchCandidate[],
    pipelineStages: PipelineStage[],
    processingTimeMs: number
  ): MatchingResult {
    const bestMatch = candidates[0];
    let recommendation: MatchingResult['recommendation'];

    if (!bestMatch || bestMatch.score < this.config.noMatchThreshold) {
      recommendation = 'no_match';
    } else if (bestMatch.score >= this.config.autoMatchThreshold) {
      recommendation = 'auto_match';
    } else if (bestMatch.score >= this.config.reviewThreshold) {
      recommendation = 'review';
    } else {
      recommendation = 'create_new';
    }

    return {
      candidates,
      bestMatch,
      autoMatchThreshold: this.config.autoMatchThreshold,
      reviewThreshold: this.config.reviewThreshold,
      recommendation,
      processingTimeMs,
      pipelineStages,
    };
  }

  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private calculateWriterSimilarity(input: string[], candidates: string[]): number {
    const normalizedInput = input.map((w) => this.normalizeText(w));
    const normalizedCandidates = candidates.map((w) => this.normalizeText(w));

    let maxSimilarity = 0;

    for (const inputWriter of normalizedInput) {
      for (const candidateWriter of normalizedCandidates) {
        const sim = this.stringSimilarity(inputWriter, candidateWriter);
        maxSimilarity = Math.max(maxSimilarity, sim);
      }
    }

    return maxSimilarity;
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

let matchingAgent: MatchingAgent | null = null;

export function getMatchingAgent(): MatchingAgent {
  if (!matchingAgent) {
    matchingAgent = new MatchingAgent();
  }
  return matchingAgent;
}
