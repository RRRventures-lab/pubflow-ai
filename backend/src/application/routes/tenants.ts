// ============================================================================
// PubFlow AI - Tenant Management Routes
// ============================================================================

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { publicQuery } from '../../infrastructure/database/pool.js';
import { tenantManager } from '../../infrastructure/database/tenant-manager.js';
import { requireRole } from '../middleware/auth.js';
import type { Tenant, TenantSettings } from '../../shared/types/index.js';

export async function tenantRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /tenants/current
   * Get current tenant info
   */
  app.get('/current', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.tenant) {
      return reply.status(404).send({ message: 'No tenant context' });
    }

    return request.tenant;
  });

  /**
   * PATCH /tenants/current/settings
   * Update current tenant settings (owner/admin only)
   */
  app.patch(
    '/current/settings',
    { preHandler: [requireRole('OWNER', 'ADMIN')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.tenant) {
        return reply.status(404).send({ message: 'No tenant context' });
      }

      const settings = z.object({
        branding: z.object({
          primaryColor: z.string().optional(),
          logo: z.string().optional(),
          companyName: z.string().optional(),
        }).optional(),
        defaults: z.object({
          cwrVersion: z.enum(['21', '22', '30', '31']).optional(),
          submitterCode: z.string().optional(),
          defaultSociety: z.string().optional(),
        }).optional(),
      }).parse(request.body);

      const updated = await tenantManager.updateTenantSettings(
        request.tenant.id,
        settings as Partial<TenantSettings>
      );

      return updated;
    }
  );

  /**
   * GET /tenants/current/users
   * List users in current tenant
   */
  app.get('/current/users', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.tenant) {
      return reply.status(404).send({ message: 'No tenant context' });
    }

    const result = await publicQuery(
      `SELECT id, email, first_name, last_name, role, is_active, last_login_at, created_at
       FROM users
       WHERE tenant_id = $1
       ORDER BY created_at DESC`,
      [request.tenant.id]
    );

    return { data: result.rows };
  });

  /**
   * POST /tenants/current/users
   * Invite new user to tenant (owner/admin only)
   */
  app.post(
    '/current/users',
    { preHandler: [requireRole('OWNER', 'ADMIN')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.tenant) {
        return reply.status(404).send({ message: 'No tenant context' });
      }

      const body = z.object({
        email: z.string().email(),
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        role: z.enum(['ADMIN', 'MANAGER', 'USER', 'VIEWER']),
      }).parse(request.body);

      // TODO: Send invitation email with temp password or magic link

      return reply.status(501).send({ message: 'User invitation not yet implemented' });
    }
  );

  /**
   * GET /tenants/current/stats
   * Get tenant statistics
   */
  app.get('/current/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = request.tenantContext;
    if (!ctx) {
      return reply.status(404).send({ message: 'No tenant context' });
    }

    // Import tenantQuery here to avoid circular deps
    const { tenantQuery } = await import('../../infrastructure/database/pool.js');

    const [works, writers, recordings, cwrExports, statements] = await Promise.all([
      tenantQuery<{ count: string }>(ctx, 'SELECT COUNT(*) as count FROM works'),
      tenantQuery<{ count: string }>(ctx, 'SELECT COUNT(*) as count FROM writers'),
      tenantQuery<{ count: string }>(ctx, 'SELECT COUNT(*) as count FROM recordings'),
      tenantQuery<{ count: string }>(ctx, 'SELECT COUNT(*) as count FROM cwr_exports'),
      tenantQuery<{ count: string }>(ctx, 'SELECT COUNT(*) as count FROM royalty_statements'),
    ]);

    return {
      works: parseInt(works.rows[0].count, 10),
      writers: parseInt(writers.rows[0].count, 10),
      recordings: parseInt(recordings.rows[0].count, 10),
      cwrExports: parseInt(cwrExports.rows[0].count, 10),
      statements: parseInt(statements.rows[0].count, 10),
    };
  });
}
