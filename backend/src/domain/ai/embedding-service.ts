// ============================================================================
// PubFlow AI - Embedding Service
// ============================================================================

import OpenAI from 'openai';
import { db } from '../../infrastructure/database/connection.js';
import type {
  EmbeddingRequest,
  EmbeddingResult,
  EmbeddingModel,
  WorkEmbedding,
  VectorSearchOptions,
  VectorSearchResult,
} from './types.js';

// ----------------------------------------------------------------------------
// Configuration
// ----------------------------------------------------------------------------

const DEFAULT_MODEL: EmbeddingModel = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS: Record<EmbeddingModel, number> = {
  'text-embedding-3-small': 1536,
  'text-embedding-3-large': 3072,
  'text-embedding-ada-002': 1536,
};

// ----------------------------------------------------------------------------
// Embedding Service Class
// ----------------------------------------------------------------------------

export class EmbeddingService {
  private openai: OpenAI;
  private model: EmbeddingModel;
  private cache: Map<string, number[]> = new Map();

  constructor(apiKey?: string, model?: EmbeddingModel) {
    this.openai = new OpenAI({
      apiKey: apiKey || process.env.OPENAI_API_KEY,
    });
    this.model = model || DEFAULT_MODEL;
  }

  // --------------------------------------------------------------------------
  // Core Embedding Methods
  // --------------------------------------------------------------------------

  /**
   * Generate embeddings for one or more texts
   */
  async generateEmbeddings(request: EmbeddingRequest): Promise<EmbeddingResult> {
    const model = request.model || this.model;
    const startTime = Date.now();

    // Check cache for single text
    if (request.texts.length === 1) {
      const cacheKey = this.getCacheKey(request.texts[0], model);
      const cached = this.cache.get(cacheKey);
      if (cached) {
        return {
          embeddings: [cached],
          model,
          dimensions: EMBEDDING_DIMENSIONS[model],
          tokensUsed: 0,
        };
      }
    }

    // Call OpenAI API
    const response = await this.openai.embeddings.create({
      model,
      input: request.texts,
    });

    const embeddings = response.data.map((d) => d.embedding);

    // Cache single embedding
    if (request.texts.length === 1) {
      const cacheKey = this.getCacheKey(request.texts[0], model);
      this.cache.set(cacheKey, embeddings[0]);
    }

    return {
      embeddings,
      model,
      dimensions: EMBEDDING_DIMENSIONS[model],
      tokensUsed: response.usage?.total_tokens || 0,
    };
  }

  /**
   * Generate embedding for a single text
   */
  async embed(text: string): Promise<number[]> {
    const result = await this.generateEmbeddings({ texts: [text] });
    return result.embeddings[0];
  }

  /**
   * Generate embedding for a work (combining title + writers)
   */
  async embedWork(work: {
    id: string;
    title: string;
    writers?: Array<{ firstName: string; lastName: string }>;
    alternateTitles?: string[];
  }): Promise<WorkEmbedding> {
    // Build composite text for embedding
    const titleText = [
      work.title,
      ...(work.alternateTitles || []),
    ].join(' | ');

    const writerText = (work.writers || [])
      .map((w) => `${w.firstName} ${w.lastName}`)
      .join(', ');

    const combinedText = `${titleText} by ${writerText}`;

    // Generate embeddings in parallel
    const [titleResult, writerResult, combinedResult] = await Promise.all([
      this.embed(titleText),
      writerText ? this.embed(writerText) : Promise.resolve(new Array(EMBEDDING_DIMENSIONS[this.model]).fill(0)),
      this.embed(combinedText),
    ]);

    return {
      workId: work.id,
      titleEmbedding: titleResult,
      writerEmbedding: writerResult,
      combinedEmbedding: combinedResult,
      model: this.model,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  // --------------------------------------------------------------------------
  // Vector Storage Methods (pgvector)
  // --------------------------------------------------------------------------

  /**
   * Store work embedding in database
   */
  async storeWorkEmbedding(
    tenantId: string,
    embedding: WorkEmbedding
  ): Promise<void> {
    await db.query(`
      INSERT INTO work_embeddings (
        tenant_id,
        work_id,
        title_embedding,
        writer_embedding,
        combined_embedding,
        model,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (tenant_id, work_id)
      DO UPDATE SET
        title_embedding = EXCLUDED.title_embedding,
        writer_embedding = EXCLUDED.writer_embedding,
        combined_embedding = EXCLUDED.combined_embedding,
        model = EXCLUDED.model,
        updated_at = EXCLUDED.updated_at
    `, [
      tenantId,
      embedding.workId,
      JSON.stringify(embedding.titleEmbedding),
      JSON.stringify(embedding.writerEmbedding),
      JSON.stringify(embedding.combinedEmbedding),
      embedding.model,
      embedding.createdAt,
      embedding.updatedAt,
    ]);
  }

  /**
   * Batch store work embeddings
   */
  async storeWorkEmbeddingsBatch(
    tenantId: string,
    embeddings: WorkEmbedding[]
  ): Promise<void> {
    if (embeddings.length === 0) return;

    // Build bulk insert
    const values: unknown[] = [];
    const placeholders: string[] = [];
    let paramIndex = 1;

    for (const emb of embeddings) {
      placeholders.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6}, $${paramIndex + 7})`);
      values.push(
        tenantId,
        emb.workId,
        JSON.stringify(emb.titleEmbedding),
        JSON.stringify(emb.writerEmbedding),
        JSON.stringify(emb.combinedEmbedding),
        emb.model,
        emb.createdAt,
        emb.updatedAt
      );
      paramIndex += 8;
    }

    await db.query(`
      INSERT INTO work_embeddings (
        tenant_id,
        work_id,
        title_embedding,
        writer_embedding,
        combined_embedding,
        model,
        created_at,
        updated_at
      ) VALUES ${placeholders.join(', ')}
      ON CONFLICT (tenant_id, work_id)
      DO UPDATE SET
        title_embedding = EXCLUDED.title_embedding,
        writer_embedding = EXCLUDED.writer_embedding,
        combined_embedding = EXCLUDED.combined_embedding,
        model = EXCLUDED.model,
        updated_at = EXCLUDED.updated_at
    `, values);
  }

  /**
   * Search for similar works using vector similarity
   */
  async searchSimilarWorks(
    tenantId: string,
    queryEmbedding: number[],
    options: VectorSearchOptions
  ): Promise<VectorSearchResult[]> {
    const { topK = 50, minSimilarity = 0.5, includeMetadata = false } = options;

    // Use cosine similarity with pgvector
    const result = await db.query(`
      SELECT
        we.work_id,
        1 - (we.combined_embedding <=> $2::vector) as similarity
        ${includeMetadata ? ', w.title, w.iswc' : ''}
      FROM work_embeddings we
      ${includeMetadata ? 'JOIN works w ON we.work_id = w.id AND we.tenant_id = w.tenant_id' : ''}
      WHERE we.tenant_id = $1
        AND 1 - (we.combined_embedding <=> $2::vector) >= $3
      ORDER BY we.combined_embedding <=> $2::vector
      LIMIT $4
    `, [tenantId, JSON.stringify(queryEmbedding), minSimilarity, topK]);

    return result.rows.map((row) => ({
      workId: row.work_id,
      similarity: parseFloat(row.similarity),
      metadata: includeMetadata ? {
        title: row.title,
        iswc: row.iswc,
      } : undefined,
    }));
  }

  /**
   * Search by title similarity
   */
  async searchByTitle(
    tenantId: string,
    title: string,
    options: Partial<VectorSearchOptions> = {}
  ): Promise<VectorSearchResult[]> {
    const titleEmbedding = await this.embed(title);

    const result = await db.query(`
      SELECT
        we.work_id,
        1 - (we.title_embedding <=> $2::vector) as similarity
      FROM work_embeddings we
      WHERE we.tenant_id = $1
        AND 1 - (we.title_embedding <=> $2::vector) >= $3
      ORDER BY we.title_embedding <=> $2::vector
      LIMIT $4
    `, [
      tenantId,
      JSON.stringify(titleEmbedding),
      options.minSimilarity || 0.5,
      options.topK || 50,
    ]);

    return result.rows.map((row) => ({
      workId: row.work_id,
      similarity: parseFloat(row.similarity),
    }));
  }

  /**
   * Search by writer similarity
   */
  async searchByWriter(
    tenantId: string,
    writerName: string,
    options: Partial<VectorSearchOptions> = {}
  ): Promise<VectorSearchResult[]> {
    const writerEmbedding = await this.embed(writerName);

    const result = await db.query(`
      SELECT
        we.work_id,
        1 - (we.writer_embedding <=> $2::vector) as similarity
      FROM work_embeddings we
      WHERE we.tenant_id = $1
        AND 1 - (we.writer_embedding <=> $2::vector) >= $3
      ORDER BY we.writer_embedding <=> $2::vector
      LIMIT $4
    `, [
      tenantId,
      JSON.stringify(writerEmbedding),
      options.minSimilarity || 0.5,
      options.topK || 50,
    ]);

    return result.rows.map((row) => ({
      workId: row.work_id,
      similarity: parseFloat(row.similarity),
    }));
  }

  // --------------------------------------------------------------------------
  // Utility Methods
  // --------------------------------------------------------------------------

  /**
   * Calculate cosine similarity between two vectors
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same dimensions');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  /**
   * Normalize a vector to unit length
   */
  normalize(vector: number[]): number[] {
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    if (magnitude === 0) return vector;
    return vector.map((val) => val / magnitude);
  }

  /**
   * Get embedding dimensions for current model
   */
  getDimensions(): number {
    return EMBEDDING_DIMENSIONS[this.model];
  }

  /**
   * Get cache key for embedding
   */
  private getCacheKey(text: string, model: string): string {
    return `${model}:${text.slice(0, 100)}`;
  }

  /**
   * Clear embedding cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache size
   */
  getCacheSize(): number {
    return this.cache.size;
  }
}

// ----------------------------------------------------------------------------
// Singleton Instance
// ----------------------------------------------------------------------------

let embeddingService: EmbeddingService | null = null;

export function getEmbeddingService(): EmbeddingService {
  if (!embeddingService) {
    embeddingService = new EmbeddingService();
  }
  return embeddingService;
}

// ----------------------------------------------------------------------------
// Database Migration for pgvector
// ----------------------------------------------------------------------------

export const EMBEDDING_MIGRATION = `
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create work embeddings table
CREATE TABLE IF NOT EXISTS work_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  work_id UUID NOT NULL,
  title_embedding vector(1536),
  writer_embedding vector(1536),
  combined_embedding vector(1536),
  model VARCHAR(50) NOT NULL DEFAULT 'text-embedding-3-small',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, work_id)
);

-- Create HNSW index for fast similarity search
CREATE INDEX IF NOT EXISTS work_embeddings_combined_idx
ON work_embeddings
USING hnsw (combined_embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS work_embeddings_title_idx
ON work_embeddings
USING hnsw (title_embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS work_embeddings_writer_idx
ON work_embeddings
USING hnsw (writer_embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Index for tenant filtering
CREATE INDEX IF NOT EXISTS work_embeddings_tenant_idx ON work_embeddings(tenant_id);
`;
