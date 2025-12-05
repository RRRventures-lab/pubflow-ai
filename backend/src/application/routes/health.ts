// ============================================================================
// PubFlow AI - Health Check & Metrics Endpoints
// Comprehensive system health monitoring
// ============================================================================

import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { pool, checkDatabaseHealth } from '../../infrastructure/database/pool.js';
import { logger } from '../../infrastructure/logging/logger.js';

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  uptime: number;
  environment: string;
  services: {
    database: ServiceHealth;
    redis: ServiceHealth;
    ai: ServiceHealth;
  };
}

interface ServiceHealth {
  status: 'up' | 'down' | 'degraded';
  latency?: number;
  message?: string;
  details?: Record<string, any>;
}

interface MetricsResponse {
  timestamp: string;
  system: SystemMetrics;
  application: ApplicationMetrics;
  database: DatabaseMetrics;
}

interface SystemMetrics {
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  cpu: {
    usage: number;
  };
  uptime: number;
}

interface ApplicationMetrics {
  requests: {
    total: number;
    success: number;
    error: number;
    rate: number;
  };
  latency: {
    p50: number;
    p95: number;
    p99: number;
    avg: number;
  };
  activeConnections: number;
}

interface DatabaseMetrics {
  connections: {
    total: number;
    idle: number;
    waiting: number;
  };
  queries: {
    total: number;
    slow: number;
  };
  tables: TableStats[];
}

interface TableStats {
  name: string;
  rowEstimate: number;
  sizeBytes: number;
}

// --------------------------------------------------------------------------
// In-memory metrics storage (replace with Redis/Prometheus in production)
// --------------------------------------------------------------------------

const metrics = {
  requests: { total: 0, success: 0, error: 0 },
  latencies: [] as number[],
  startTime: Date.now(),
};

// --------------------------------------------------------------------------
// Helper Functions
// --------------------------------------------------------------------------

async function checkRedisHealth(): Promise<ServiceHealth> {
  try {
    // TODO: Implement actual Redis health check
    // For now, return a mock response
    const start = Date.now();

    // Simulate Redis ping
    await new Promise((resolve) => setTimeout(resolve, 1));

    return {
      status: 'up',
      latency: Date.now() - start,
    };
  } catch (error) {
    return {
      status: 'down',
      message: error instanceof Error ? error.message : 'Redis connection failed',
    };
  }
}

async function checkAIHealth(): Promise<ServiceHealth> {
  try {
    // Check if OpenAI API key is configured
    const hasApiKey = !!process.env.OPENAI_API_KEY;

    if (!hasApiKey) {
      return {
        status: 'degraded',
        message: 'OpenAI API key not configured',
      };
    }

    // Check pending AI tasks count
    const result = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'PENDING') as pending,
        COUNT(*) FILTER (WHERE status = 'PROCESSING') as processing,
        COUNT(*) FILTER (WHERE status = 'FAILED' AND created_at > NOW() - INTERVAL '1 hour') as recent_failures
      FROM ai_tasks
    `);

    const stats = result.rows[0] || { pending: 0, processing: 0, recent_failures: 0 };

    // Degraded if too many failures or backlog
    if (parseInt(stats.recent_failures) > 10) {
      return {
        status: 'degraded',
        message: 'High AI task failure rate',
        details: stats,
      };
    }

    return {
      status: 'up',
      details: {
        pendingTasks: parseInt(stats.pending),
        processingTasks: parseInt(stats.processing),
      },
    };
  } catch (error) {
    return {
      status: 'down',
      message: error instanceof Error ? error.message : 'AI service check failed',
    };
  }
}

async function getDatabaseMetrics(): Promise<DatabaseMetrics> {
  try {
    // Connection pool stats
    const poolStats = {
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount,
    };

    // Table statistics
    const tableResult = await pool.query(`
      SELECT
        relname as name,
        n_live_tup as row_estimate,
        pg_relation_size(relid) as size_bytes
      FROM pg_stat_user_tables
      ORDER BY pg_relation_size(relid) DESC
      LIMIT 10
    `);

    // Slow query count (if pg_stat_statements is available)
    let slowQueries = 0;
    try {
      const slowResult = await pool.query(`
        SELECT COUNT(*) as count
        FROM pg_stat_statements
        WHERE mean_exec_time > 1000
      `);
      slowQueries = parseInt(slowResult.rows[0]?.count || '0');
    } catch {
      // pg_stat_statements may not be available
    }

    return {
      connections: poolStats,
      queries: {
        total: 0, // Would need connection-level tracking
        slow: slowQueries,
      },
      tables: tableResult.rows.map((row) => ({
        name: row.name,
        rowEstimate: parseInt(row.row_estimate),
        sizeBytes: parseInt(row.size_bytes),
      })),
    };
  } catch (error) {
    logger.error('Failed to get database metrics', { error });
    return {
      connections: { total: 0, idle: 0, waiting: 0 },
      queries: { total: 0, slow: 0 },
      tables: [],
    };
  }
}

function getSystemMetrics(): SystemMetrics {
  const memUsage = process.memoryUsage();
  const totalMem = require('os').totalmem();

  return {
    memory: {
      used: memUsage.heapUsed,
      total: memUsage.heapTotal,
      percentage: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100),
    },
    cpu: {
      usage: process.cpuUsage().user / 1000000, // Convert to seconds
    },
    uptime: process.uptime(),
  };
}

function getApplicationMetrics(): ApplicationMetrics {
  const now = Date.now();
  const uptimeSeconds = (now - metrics.startTime) / 1000;

  // Calculate latency percentiles
  const sortedLatencies = [...metrics.latencies].sort((a, b) => a - b);
  const p50Index = Math.floor(sortedLatencies.length * 0.5);
  const p95Index = Math.floor(sortedLatencies.length * 0.95);
  const p99Index = Math.floor(sortedLatencies.length * 0.99);

  return {
    requests: {
      total: metrics.requests.total,
      success: metrics.requests.success,
      error: metrics.requests.error,
      rate: uptimeSeconds > 0 ? metrics.requests.total / uptimeSeconds : 0,
    },
    latency: {
      p50: sortedLatencies[p50Index] || 0,
      p95: sortedLatencies[p95Index] || 0,
      p99: sortedLatencies[p99Index] || 0,
      avg:
        sortedLatencies.length > 0
          ? sortedLatencies.reduce((a, b) => a + b, 0) / sortedLatencies.length
          : 0,
    },
    activeConnections: 0, // Would need WebSocket tracking
  };
}

// --------------------------------------------------------------------------
// Routes
// --------------------------------------------------------------------------

export const healthRoutes: FastifyPluginAsync = async (app) => {
  // -------------------------------------------------------------------------
  // Basic Health Check (for load balancers/orchestrators)
  // -------------------------------------------------------------------------
  app.get(
    '/health',
    {
      schema: {
        tags: ['Health'],
        summary: 'Basic health check',
        description: 'Returns basic health status for container orchestration',
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['healthy', 'degraded', 'unhealthy'] },
              timestamp: { type: 'string', format: 'date-time' },
            },
          },
          503: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const dbHealth = await checkDatabaseHealth();

      if (!dbHealth.healthy) {
        return reply.status(503).send({
          status: 'unhealthy',
          message: 'Database connection failed',
        });
      }

      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
      };
    }
  );

  // -------------------------------------------------------------------------
  // Detailed Health Check
  // -------------------------------------------------------------------------
  app.get(
    '/health/detailed',
    {
      schema: {
        tags: ['Health'],
        summary: 'Detailed health check',
        description: 'Returns comprehensive health status of all services',
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              timestamp: { type: 'string' },
              version: { type: 'string' },
              uptime: { type: 'number' },
              environment: { type: 'string' },
              services: { type: 'object' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const [dbHealth, redisHealth, aiHealth] = await Promise.all([
        checkDatabaseHealth(),
        checkRedisHealth(),
        checkAIHealth(),
      ]);

      // Determine overall status
      let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

      const dbStatus = dbHealth.healthy ? 'up' : 'down';
      if (dbStatus === 'down') {
        overallStatus = 'unhealthy';
      } else if (redisHealth.status === 'down' || aiHealth.status === 'degraded') {
        overallStatus = 'degraded';
      }

      const response: HealthStatus = {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
        services: {
          database: {
            status: dbStatus,
            latency: dbHealth.latency,
            details: {
              poolSize: pool.totalCount,
              idleConnections: pool.idleCount,
            },
          },
          redis: redisHealth,
          ai: aiHealth,
        },
      };

      return response;
    }
  );

  // -------------------------------------------------------------------------
  // Readiness Check (for Kubernetes)
  // -------------------------------------------------------------------------
  app.get(
    '/ready',
    {
      schema: {
        tags: ['Health'],
        summary: 'Readiness check',
        description: 'Indicates if the service is ready to accept traffic',
        response: {
          200: { type: 'object', properties: { ready: { type: 'boolean' } } },
          503: { type: 'object', properties: { ready: { type: 'boolean' }, reason: { type: 'string' } } },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const dbHealth = await checkDatabaseHealth();

      if (!dbHealth.healthy) {
        return reply.status(503).send({
          ready: false,
          reason: 'Database not ready',
        });
      }

      return { ready: true };
    }
  );

  // -------------------------------------------------------------------------
  // Liveness Check (for Kubernetes)
  // -------------------------------------------------------------------------
  app.get(
    '/live',
    {
      schema: {
        tags: ['Health'],
        summary: 'Liveness check',
        description: 'Indicates if the process is alive and should not be restarted',
        response: {
          200: { type: 'object', properties: { alive: { type: 'boolean' } } },
        },
      },
    },
    async () => {
      return { alive: true };
    }
  );

  // -------------------------------------------------------------------------
  // Metrics Endpoint
  // -------------------------------------------------------------------------
  app.get(
    '/metrics',
    {
      schema: {
        tags: ['Health'],
        summary: 'Application metrics',
        description: 'Returns system and application metrics',
        response: {
          200: {
            type: 'object',
            properties: {
              timestamp: { type: 'string' },
              system: { type: 'object' },
              application: { type: 'object' },
              database: { type: 'object' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const [systemMetrics, dbMetrics] = await Promise.all([
        Promise.resolve(getSystemMetrics()),
        getDatabaseMetrics(),
      ]);

      const response: MetricsResponse = {
        timestamp: new Date().toISOString(),
        system: systemMetrics,
        application: getApplicationMetrics(),
        database: dbMetrics,
      };

      return response;
    }
  );

  // -------------------------------------------------------------------------
  // Prometheus-format Metrics
  // -------------------------------------------------------------------------
  app.get(
    '/metrics/prometheus',
    {
      schema: {
        tags: ['Health'],
        summary: 'Prometheus metrics',
        description: 'Returns metrics in Prometheus text format',
        produces: ['text/plain'],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const systemMetrics = getSystemMetrics();
      const appMetrics = getApplicationMetrics();

      const lines = [
        '# HELP pubflow_process_memory_heap_bytes Process heap memory in bytes',
        '# TYPE pubflow_process_memory_heap_bytes gauge',
        `pubflow_process_memory_heap_bytes ${systemMetrics.memory.used}`,
        '',
        '# HELP pubflow_process_uptime_seconds Process uptime in seconds',
        '# TYPE pubflow_process_uptime_seconds counter',
        `pubflow_process_uptime_seconds ${systemMetrics.uptime}`,
        '',
        '# HELP pubflow_http_requests_total Total HTTP requests',
        '# TYPE pubflow_http_requests_total counter',
        `pubflow_http_requests_total{status="success"} ${appMetrics.requests.success}`,
        `pubflow_http_requests_total{status="error"} ${appMetrics.requests.error}`,
        '',
        '# HELP pubflow_http_request_duration_seconds HTTP request latency',
        '# TYPE pubflow_http_request_duration_seconds histogram',
        `pubflow_http_request_duration_seconds{quantile="0.5"} ${appMetrics.latency.p50 / 1000}`,
        `pubflow_http_request_duration_seconds{quantile="0.95"} ${appMetrics.latency.p95 / 1000}`,
        `pubflow_http_request_duration_seconds{quantile="0.99"} ${appMetrics.latency.p99 / 1000}`,
        '',
        '# HELP pubflow_database_connections Database connection pool stats',
        '# TYPE pubflow_database_connections gauge',
        `pubflow_database_connections{state="total"} ${pool.totalCount}`,
        `pubflow_database_connections{state="idle"} ${pool.idleCount}`,
        `pubflow_database_connections{state="waiting"} ${pool.waitingCount}`,
      ];

      reply.header('Content-Type', 'text/plain');
      return lines.join('\n');
    }
  );
};

// --------------------------------------------------------------------------
// Metrics Collection Hook (add to main app)
// --------------------------------------------------------------------------

export function createMetricsHook() {
  return {
    onRequest: async (request: FastifyRequest, reply: FastifyReply) => {
      (request as any).startTime = Date.now();
      metrics.requests.total++;
    },
    onResponse: async (request: FastifyRequest, reply: FastifyReply) => {
      const latency = Date.now() - ((request as any).startTime || Date.now());
      metrics.latencies.push(latency);

      // Keep only last 1000 latencies to prevent memory growth
      if (metrics.latencies.length > 1000) {
        metrics.latencies.shift();
      }

      if (reply.statusCode >= 400) {
        metrics.requests.error++;
      } else {
        metrics.requests.success++;
      }
    },
  };
}

export { metrics };
