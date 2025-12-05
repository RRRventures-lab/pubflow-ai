// ============================================================================
// PubFlow AI - Rate Limiting Middleware
// Token bucket algorithm with tenant-aware limits
// ============================================================================

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { LRUCache } from 'lru-cache';
import { logger } from '../../infrastructure/logging/logger.js';

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

interface RateLimitConfig {
  // Default limits
  defaultRequestsPerMinute: number;
  defaultRequestsPerHour: number;

  // AI-specific limits (more expensive operations)
  aiRequestsPerMinute: number;
  aiRequestsPerHour: number;

  // Burst limits
  burstSize: number;

  // Plan-based multipliers
  planMultipliers: Record<string, number>;

  // Skip list (paths to exclude from rate limiting)
  skipPaths: string[];

  // Response headers
  includeHeaders: boolean;
}

interface RateLimitBucket {
  tokens: number;
  lastRefill: number;
  requestsThisMinute: number;
  requestsThisHour: number;
  minuteReset: number;
  hourReset: number;
}

interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
  retryAfter?: number;
}

// --------------------------------------------------------------------------
// Default Configuration
// --------------------------------------------------------------------------

const DEFAULT_CONFIG: RateLimitConfig = {
  defaultRequestsPerMinute: 60,
  defaultRequestsPerHour: 1000,
  aiRequestsPerMinute: 20,
  aiRequestsPerHour: 200,
  burstSize: 10,
  planMultipliers: {
    free: 0.5,
    basic: 1,
    pro: 2,
    enterprise: 10,
  },
  skipPaths: ['/health', '/ready', '/metrics'],
  includeHeaders: true,
};

// --------------------------------------------------------------------------
// Rate Limiter Class
// --------------------------------------------------------------------------

export class RateLimiter {
  private config: RateLimitConfig;
  private buckets: LRUCache<string, RateLimitBucket>;

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Use LRU cache to automatically evict old entries
    this.buckets = new LRUCache<string, RateLimitBucket>({
      max: 100000, // Max 100K tenants/users tracked
      ttl: 60 * 60 * 1000, // 1 hour TTL
    });
  }

  /**
   * Get rate limit bucket key
   */
  private getKey(tenantId: string, userId?: string, endpoint?: string): string {
    const parts = [tenantId];
    if (userId) parts.push(userId);
    if (endpoint) parts.push(endpoint);
    return parts.join(':');
  }

  /**
   * Get or create bucket for key
   */
  private getBucket(key: string): RateLimitBucket {
    let bucket = this.buckets.get(key);

    if (!bucket) {
      const now = Date.now();
      bucket = {
        tokens: this.config.burstSize,
        lastRefill: now,
        requestsThisMinute: 0,
        requestsThisHour: 0,
        minuteReset: now + 60000,
        hourReset: now + 3600000,
      };
      this.buckets.set(key, bucket);
    }

    return bucket;
  }

  /**
   * Refill tokens based on time elapsed
   */
  private refillTokens(bucket: RateLimitBucket, tokensPerMinute: number): void {
    const now = Date.now();
    const elapsed = now - bucket.lastRefill;
    const tokensToAdd = (elapsed / 60000) * tokensPerMinute;

    bucket.tokens = Math.min(this.config.burstSize, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;

    // Reset minute/hour counters
    if (now >= bucket.minuteReset) {
      bucket.requestsThisMinute = 0;
      bucket.minuteReset = now + 60000;
    }

    if (now >= bucket.hourReset) {
      bucket.requestsThisHour = 0;
      bucket.hourReset = now + 3600000;
    }
  }

  /**
   * Check if request should be rate limited
   */
  check(
    tenantId: string,
    userId: string | undefined,
    isAiEndpoint: boolean,
    planId: string = 'basic'
  ): RateLimitInfo {
    const key = this.getKey(tenantId, userId);
    const bucket = this.getBucket(key);

    // Get limits based on endpoint type and plan
    const multiplier = this.config.planMultipliers[planId] || 1;
    const requestsPerMinute = (isAiEndpoint
      ? this.config.aiRequestsPerMinute
      : this.config.defaultRequestsPerMinute) * multiplier;
    const requestsPerHour = (isAiEndpoint
      ? this.config.aiRequestsPerHour
      : this.config.defaultRequestsPerHour) * multiplier;

    // Refill tokens
    this.refillTokens(bucket, requestsPerMinute);

    const now = Date.now();

    // Check minute limit
    if (bucket.requestsThisMinute >= requestsPerMinute) {
      return {
        limit: Math.floor(requestsPerMinute),
        remaining: 0,
        reset: Math.ceil((bucket.minuteReset - now) / 1000),
        retryAfter: Math.ceil((bucket.minuteReset - now) / 1000),
      };
    }

    // Check hour limit
    if (bucket.requestsThisHour >= requestsPerHour) {
      return {
        limit: Math.floor(requestsPerHour),
        remaining: 0,
        reset: Math.ceil((bucket.hourReset - now) / 1000),
        retryAfter: Math.ceil((bucket.hourReset - now) / 1000),
      };
    }

    // Check burst (token bucket)
    if (bucket.tokens < 1) {
      const secondsUntilToken = ((1 - bucket.tokens) / requestsPerMinute) * 60;
      return {
        limit: Math.floor(requestsPerMinute),
        remaining: 0,
        reset: Math.ceil(secondsUntilToken),
        retryAfter: Math.ceil(secondsUntilToken),
      };
    }

    // Request allowed
    return {
      limit: Math.floor(requestsPerMinute),
      remaining: Math.floor(bucket.tokens),
      reset: Math.ceil((bucket.minuteReset - now) / 1000),
    };
  }

  /**
   * Consume a token (call after request is allowed)
   */
  consume(tenantId: string, userId?: string): void {
    const key = this.getKey(tenantId, userId);
    const bucket = this.getBucket(key);

    bucket.tokens = Math.max(0, bucket.tokens - 1);
    bucket.requestsThisMinute++;
    bucket.requestsThisHour++;
  }

  /**
   * Get current stats for a key
   */
  getStats(tenantId: string, userId?: string): RateLimitBucket | undefined {
    const key = this.getKey(tenantId, userId);
    return this.buckets.get(key);
  }

  /**
   * Reset limits for a key (admin function)
   */
  reset(tenantId: string, userId?: string): void {
    const key = this.getKey(tenantId, userId);
    this.buckets.delete(key);
  }

  /**
   * Clear all rate limit data
   */
  clear(): void {
    this.buckets.clear();
  }
}

// --------------------------------------------------------------------------
// Fastify Plugin
// --------------------------------------------------------------------------

export async function rateLimitPlugin(
  app: FastifyInstance,
  options: Partial<RateLimitConfig> = {}
): Promise<void> {
  const limiter = new RateLimiter(options);
  const config = { ...DEFAULT_CONFIG, ...options };

  // Decorate app with rate limiter for direct access
  app.decorate('rateLimiter', limiter);

  // Add preHandler hook
  app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip excluded paths
    if (config.skipPaths.some((path) => request.url.startsWith(path))) {
      return;
    }

    // Get tenant context
    const tenantContext = (request as any).tenantContext;
    if (!tenantContext) {
      // No tenant context = public route, use IP-based limiting
      const ip = request.ip;
      const info = limiter.check(ip, undefined, false);

      if (info.retryAfter) {
        addRateLimitHeaders(reply, info, config.includeHeaders);
        return reply.status(429).send({
          error: 'Too Many Requests',
          retryAfter: info.retryAfter,
        });
      }

      limiter.consume(ip);
      addRateLimitHeaders(reply, info, config.includeHeaders);
      return;
    }

    // Determine if this is an AI endpoint
    const isAiEndpoint = request.url.startsWith('/ai/');

    // Check rate limit
    const info = limiter.check(
      tenantContext.tenantId,
      tenantContext.userId,
      isAiEndpoint,
      tenantContext.planId
    );

    // Add headers
    addRateLimitHeaders(reply, info, config.includeHeaders);

    // Block if rate limited
    if (info.retryAfter) {
      logger.warn('Rate limit exceeded', {
        tenantId: tenantContext.tenantId,
        userId: tenantContext.userId,
        endpoint: request.url,
        retryAfter: info.retryAfter,
      });

      return reply.status(429).send({
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Please retry after ${info.retryAfter} seconds.`,
        retryAfter: info.retryAfter,
        limit: info.limit,
      });
    }

    // Consume token
    limiter.consume(tenantContext.tenantId, tenantContext.userId);
  });
}

/**
 * Add rate limit headers to response
 */
function addRateLimitHeaders(
  reply: FastifyReply,
  info: RateLimitInfo,
  include: boolean
): void {
  if (!include) return;

  reply.header('X-RateLimit-Limit', info.limit.toString());
  reply.header('X-RateLimit-Remaining', info.remaining.toString());
  reply.header('X-RateLimit-Reset', info.reset.toString());

  if (info.retryAfter) {
    reply.header('Retry-After', info.retryAfter.toString());
  }
}

// --------------------------------------------------------------------------
// Exports
// --------------------------------------------------------------------------

export { RateLimiter };

// Singleton instance for direct use
let rateLimiterInstance: RateLimiter | null = null;

export function getRateLimiter(): RateLimiter {
  if (!rateLimiterInstance) {
    rateLimiterInstance = new RateLimiter();
  }
  return rateLimiterInstance;
}
