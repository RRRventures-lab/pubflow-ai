// ============================================================================
// PubFlow AI - Database Connection Pool
// Multi-tenant schema-per-tenant architecture
// ============================================================================

import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { logger } from '../logging/logger.js';

// --------------------------------------------------------------------------
// Pool Configuration
// --------------------------------------------------------------------------

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'pubflow',
  user: process.env.DB_USER || 'pubflow',
  password: process.env.DB_PASSWORD || 'pubflow',
  max: parseInt(process.env.DB_POOL_MAX || '20', 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  logger.error('Unexpected database pool error', { error: err.message });
});

pool.on('connect', (client) => {
  logger.debug('New database client connected');
});

// --------------------------------------------------------------------------
// Query Helpers
// --------------------------------------------------------------------------

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const start = Date.now();
  const result = await pool.query<T>(text, params);
  const duration = Date.now() - start;

  logger.debug('Database query executed', {
    query: text.slice(0, 100),
    duration: `${duration}ms`,
    rowCount: result.rowCount,
  });

  return result;
}

export async function getClient(): Promise<PoolClient> {
  return pool.connect();
}

// --------------------------------------------------------------------------
// Tenant-Scoped Query
// --------------------------------------------------------------------------

export interface TenantContext {
  tenantId: string;
  schemaName: string;
  userId?: string;
}

/**
 * Execute a query within a tenant's schema context
 */
export async function tenantQuery<T extends QueryResultRow = QueryResultRow>(
  ctx: TenantContext,
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const client = await pool.connect();

  try {
    // Set schema search path for this connection
    await client.query(`SET search_path TO ${ctx.schemaName}, public`);

    const start = Date.now();
    const result = await client.query<T>(text, params);
    const duration = Date.now() - start;

    logger.debug('Tenant query executed', {
      tenantId: ctx.tenantId,
      schema: ctx.schemaName,
      query: text.slice(0, 100),
      duration: `${duration}ms`,
      rowCount: result.rowCount,
    });

    return result;
  } finally {
    // Reset to public schema before releasing
    await client.query('SET search_path TO public');
    client.release();
  }
}

/**
 * Execute multiple queries in a transaction within tenant context
 */
export async function tenantTransaction<T>(
  ctx: TenantContext,
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();

  try {
    // Set schema and start transaction
    await client.query(`SET search_path TO ${ctx.schemaName}, public`);
    await client.query('BEGIN');

    const result = await callback(client);

    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.query('SET search_path TO public');
    client.release();
  }
}

// --------------------------------------------------------------------------
// Public Schema Query (for tenant management, users, etc.)
// --------------------------------------------------------------------------

export async function publicQuery<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const client = await pool.connect();

  try {
    await client.query('SET search_path TO public');
    return await client.query<T>(text, params);
  } finally {
    client.release();
  }
}

// --------------------------------------------------------------------------
// Health Check
// --------------------------------------------------------------------------

export async function checkDatabaseHealth(): Promise<{
  healthy: boolean;
  latency?: number;
  error?: string;
}> {
  const start = Date.now();

  try {
    await pool.query('SELECT 1');
    return {
      healthy: true,
      latency: Date.now() - start,
    };
  } catch (error) {
    return {
      healthy: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// --------------------------------------------------------------------------
// Cleanup
// --------------------------------------------------------------------------

export async function closePool(): Promise<void> {
  await pool.end();
  logger.info('Database pool closed');
}

export { pool };
