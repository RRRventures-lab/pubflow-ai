// ============================================================================
// PubFlow AI - Embedding Cache Service
// In-memory LRU cache with optional Redis backing for embeddings
// ============================================================================

import { LRUCache } from 'lru-cache';
import { createClient, RedisClientType } from 'redis';
import { logger } from '../logging/logger.js';

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

interface CachedEmbedding {
  embedding: number[];
  timestamp: number;
  modelVersion: string;
}

interface CacheConfig {
  maxSize: number;          // Max items in LRU cache
  ttlMs: number;            // Time-to-live in milliseconds
  useRedis: boolean;        // Whether to use Redis as backing store
  redisUrl?: string;        // Redis connection URL
  redisKeyPrefix: string;   // Prefix for Redis keys
}

interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  hitRate: number;
}

// --------------------------------------------------------------------------
// Default Configuration
// --------------------------------------------------------------------------

const DEFAULT_CONFIG: CacheConfig = {
  maxSize: 10000,                        // 10K embeddings in memory
  ttlMs: 24 * 60 * 60 * 1000,           // 24 hours
  useRedis: process.env.REDIS_URL !== undefined,
  redisUrl: process.env.REDIS_URL,
  redisKeyPrefix: 'pubflow:embedding:',
};

// --------------------------------------------------------------------------
// Embedding Cache Class
// --------------------------------------------------------------------------

export class EmbeddingCache {
  private lruCache: LRUCache<string, CachedEmbedding>;
  private redis: RedisClientType | null = null;
  private config: CacheConfig;
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    size: 0,
    hitRate: 0,
  };

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize LRU cache
    this.lruCache = new LRUCache<string, CachedEmbedding>({
      max: this.config.maxSize,
      ttl: this.config.ttlMs,
      updateAgeOnGet: true,
      updateAgeOnHas: true,
      dispose: (value, key) => {
        logger.debug('Evicting embedding from cache', { key });
      },
    });

    logger.info('Embedding cache initialized', {
      maxSize: this.config.maxSize,
      ttlMs: this.config.ttlMs,
      useRedis: this.config.useRedis,
    });
  }

  /**
   * Initialize Redis connection if configured
   */
  async init(): Promise<void> {
    if (this.config.useRedis && this.config.redisUrl) {
      try {
        this.redis = createClient({ url: this.config.redisUrl });

        this.redis.on('error', (err) => {
          logger.error('Redis cache error', { error: err.message });
        });

        this.redis.on('connect', () => {
          logger.info('Redis cache connected');
        });

        await this.redis.connect();
      } catch (error) {
        logger.warn('Failed to connect to Redis, using memory-only cache', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        this.redis = null;
      }
    }
  }

  /**
   * Generate cache key
   */
  private getCacheKey(tenantId: string, entityType: string, entityId: string, embeddingType: string): string {
    return `${tenantId}:${entityType}:${entityId}:${embeddingType}`;
  }

  /**
   * Get embedding from cache
   */
  async get(
    tenantId: string,
    entityType: string,
    entityId: string,
    embeddingType: string = 'combined'
  ): Promise<number[] | null> {
    const key = this.getCacheKey(tenantId, entityType, entityId, embeddingType);

    // Try LRU cache first
    const cached = this.lruCache.get(key);
    if (cached) {
      this.stats.hits++;
      this.updateHitRate();
      return cached.embedding;
    }

    // Try Redis if available
    if (this.redis) {
      try {
        const redisKey = `${this.config.redisKeyPrefix}${key}`;
        const data = await this.redis.get(redisKey);

        if (data) {
          const parsed = JSON.parse(data) as CachedEmbedding;

          // Populate LRU cache
          this.lruCache.set(key, parsed);

          this.stats.hits++;
          this.updateHitRate();
          return parsed.embedding;
        }
      } catch (error) {
        logger.warn('Redis get failed, falling back', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    this.stats.misses++;
    this.updateHitRate();
    return null;
  }

  /**
   * Set embedding in cache
   */
  async set(
    tenantId: string,
    entityType: string,
    entityId: string,
    embedding: number[],
    embeddingType: string = 'combined',
    modelVersion: string = 'text-embedding-3-small'
  ): Promise<void> {
    const key = this.getCacheKey(tenantId, entityType, entityId, embeddingType);
    const cached: CachedEmbedding = {
      embedding,
      timestamp: Date.now(),
      modelVersion,
    };

    // Set in LRU cache
    this.lruCache.set(key, cached);
    this.stats.size = this.lruCache.size;

    // Set in Redis if available
    if (this.redis) {
      try {
        const redisKey = `${this.config.redisKeyPrefix}${key}`;
        await this.redis.setEx(
          redisKey,
          Math.floor(this.config.ttlMs / 1000),
          JSON.stringify(cached)
        );
      } catch (error) {
        logger.warn('Redis set failed', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  /**
   * Set multiple embeddings at once
   */
  async setMany(
    tenantId: string,
    entityType: string,
    embeddings: Array<{
      entityId: string;
      embedding: number[];
      embeddingType?: string;
      modelVersion?: string;
    }>
  ): Promise<void> {
    // Batch LRU cache updates
    for (const item of embeddings) {
      const key = this.getCacheKey(tenantId, entityType, item.entityId, item.embeddingType || 'combined');
      this.lruCache.set(key, {
        embedding: item.embedding,
        timestamp: Date.now(),
        modelVersion: item.modelVersion || 'text-embedding-3-small',
      });
    }

    this.stats.size = this.lruCache.size;

    // Batch Redis updates if available
    if (this.redis && embeddings.length > 0) {
      try {
        const pipeline = this.redis.multi();

        for (const item of embeddings) {
          const key = this.getCacheKey(tenantId, entityType, item.entityId, item.embeddingType || 'combined');
          const redisKey = `${this.config.redisKeyPrefix}${key}`;

          pipeline.setEx(
            redisKey,
            Math.floor(this.config.ttlMs / 1000),
            JSON.stringify({
              embedding: item.embedding,
              timestamp: Date.now(),
              modelVersion: item.modelVersion || 'text-embedding-3-small',
            })
          );
        }

        await pipeline.exec();
      } catch (error) {
        logger.warn('Redis batch set failed', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  /**
   * Delete embedding from cache
   */
  async delete(
    tenantId: string,
    entityType: string,
    entityId: string,
    embeddingType: string = 'combined'
  ): Promise<void> {
    const key = this.getCacheKey(tenantId, entityType, entityId, embeddingType);

    // Delete from LRU cache
    this.lruCache.delete(key);
    this.stats.size = this.lruCache.size;

    // Delete from Redis if available
    if (this.redis) {
      try {
        const redisKey = `${this.config.redisKeyPrefix}${key}`;
        await this.redis.del(redisKey);
      } catch (error) {
        logger.warn('Redis delete failed', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  /**
   * Check if embedding exists in cache
   */
  async has(
    tenantId: string,
    entityType: string,
    entityId: string,
    embeddingType: string = 'combined'
  ): Promise<boolean> {
    const key = this.getCacheKey(tenantId, entityType, entityId, embeddingType);

    if (this.lruCache.has(key)) {
      return true;
    }

    if (this.redis) {
      try {
        const redisKey = `${this.config.redisKeyPrefix}${key}`;
        const exists = await this.redis.exists(redisKey);
        return exists === 1;
      } catch {
        return false;
      }
    }

    return false;
  }

  /**
   * Clear all embeddings for a tenant
   */
  async clearTenant(tenantId: string): Promise<void> {
    // Clear from LRU cache (iterate and delete matching keys)
    for (const key of this.lruCache.keys()) {
      if (key.startsWith(`${tenantId}:`)) {
        this.lruCache.delete(key);
      }
    }

    this.stats.size = this.lruCache.size;

    // Clear from Redis if available
    if (this.redis) {
      try {
        const pattern = `${this.config.redisKeyPrefix}${tenantId}:*`;
        const keys = await this.redis.keys(pattern);

        if (keys.length > 0) {
          await this.redis.del(keys);
        }
      } catch (error) {
        logger.warn('Redis tenant clear failed', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  /**
   * Clear entire cache
   */
  async clear(): Promise<void> {
    this.lruCache.clear();
    this.stats = { hits: 0, misses: 0, size: 0, hitRate: 0 };

    if (this.redis) {
      try {
        const pattern = `${this.config.redisKeyPrefix}*`;
        const keys = await this.redis.keys(pattern);

        if (keys.length > 0) {
          await this.redis.del(keys);
        }
      } catch (error) {
        logger.warn('Redis clear failed', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats, size: this.lruCache.size };
  }

  /**
   * Update hit rate calculation
   */
  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }

  /**
   * Graceful shutdown
   */
  async close(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
    }
    this.lruCache.clear();
  }
}

// --------------------------------------------------------------------------
// Singleton Instance
// --------------------------------------------------------------------------

let embeddingCacheInstance: EmbeddingCache | null = null;

export function getEmbeddingCache(): EmbeddingCache {
  if (!embeddingCacheInstance) {
    embeddingCacheInstance = new EmbeddingCache();
  }
  return embeddingCacheInstance;
}

export async function initEmbeddingCache(config?: Partial<CacheConfig>): Promise<EmbeddingCache> {
  embeddingCacheInstance = new EmbeddingCache(config);
  await embeddingCacheInstance.init();
  return embeddingCacheInstance;
}
