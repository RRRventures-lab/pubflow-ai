// ============================================================================
// PubFlow AI - Tenant Context Middleware
// Extracts tenant from subdomain, header, or JWT and sets context
// ============================================================================

import { FastifyRequest, FastifyReply } from 'fastify';
import { tenantManager } from '../../infrastructure/database/tenant-manager.js';
import type { TenantContext } from '../../infrastructure/database/pool.js';
import type { Tenant } from '../../shared/types/index.js';

// Extend Fastify request to include tenant context
declare module 'fastify' {
  interface FastifyRequest {
    tenant?: Tenant;
    tenantContext?: TenantContext;
  }
}

/**
 * Tenant middleware - extracts tenant from various sources
 * Priority: 1) X-Tenant-ID header, 2) subdomain, 3) JWT claim
 */
export async function tenantMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Skip tenant resolution for public routes
  const publicPaths = ['/health', '/', '/docs', '/api/v1/auth'];
  if (publicPaths.some((path) => request.url.startsWith(path))) {
    return;
  }

  let tenant: Tenant | null = null;

  // 1. Check X-Tenant-ID header (for API key access)
  const tenantIdHeader = request.headers['x-tenant-id'] as string;
  if (tenantIdHeader) {
    tenant = await tenantManager.getTenantById(tenantIdHeader);
  }

  // 2. Check subdomain (e.g., acme.pubflow.ai)
  if (!tenant) {
    const host = request.headers.host || '';
    const subdomain = host.split('.')[0];

    // Skip localhost and main domain
    if (subdomain && !['localhost', 'api', 'www', 'app'].includes(subdomain)) {
      tenant = await tenantManager.getTenantBySlug(subdomain);
    }
  }

  // 3. Check JWT claim (set after auth middleware)
  // This is handled in auth middleware after JWT verification

  // If no tenant found on protected routes, let auth middleware handle it
  // The tenant will be extracted from the JWT payload
  if (tenant) {
    request.tenant = tenant;
    request.tenantContext = {
      tenantId: tenant.id,
      schemaName: tenant.schemaName,
    };
  }
}

/**
 * Require tenant context - use after auth middleware
 * Throws if no tenant context is available
 */
export function requireTenant(request: FastifyRequest): TenantContext {
  if (!request.tenantContext) {
    throw {
      statusCode: 400,
      code: 'TENANT_REQUIRED',
      message: 'Tenant context is required',
    };
  }
  return request.tenantContext;
}
