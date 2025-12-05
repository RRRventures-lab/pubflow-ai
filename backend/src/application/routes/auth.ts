// ============================================================================
// PubFlow AI - Authentication Routes
// Login, Register, Refresh Token, Logout
// ============================================================================

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import bcrypt from 'bcrypt';
import { v4 as uuid } from 'uuid';
import { z } from 'zod';
import { publicQuery } from '../../infrastructure/database/pool.js';
import { tenantManager } from '../../infrastructure/database/tenant-manager.js';
import { logger } from '../../infrastructure/logging/logger.js';
import { BadRequestError, UnauthorizedError, ConflictError } from '../middleware/error.js';
import type { User, Tenant, UserRole } from '../../shared/types/index.js';

// --------------------------------------------------------------------------
// Schemas
// --------------------------------------------------------------------------

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  tenantSlug: z.string().optional(),
});

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  tenantName: z.string().min(2).max(200),
  tenantSlug: z.string().min(2).max(100).regex(/^[a-z0-9\-]+$/),
});

const RefreshSchema = z.object({
  refreshToken: z.string(),
});

// --------------------------------------------------------------------------
// Routes
// --------------------------------------------------------------------------

export async function authRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /auth/login
   * Authenticate user and return tokens
   */
  app.post('/login', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = LoginSchema.parse(request.body);

    // Find user by email (across all tenants or specific tenant)
    let userQuery = `
      SELECT u.*, t.slug as tenant_slug, t.schema_name, t.name as tenant_name
      FROM users u
      JOIN tenants t ON u.tenant_id = t.id
      WHERE u.email = $1 AND u.is_active = true AND t.is_active = true
    `;
    const params: unknown[] = [body.email];

    if (body.tenantSlug) {
      userQuery += ' AND t.slug = $2';
      params.push(body.tenantSlug);
    }

    userQuery += ' LIMIT 1';

    const result = await publicQuery<
      User & { tenant_slug: string; schema_name: string; tenant_name: string }
    >(userQuery, params);

    if (result.rows.length === 0) {
      throw UnauthorizedError('Invalid email or password');
    }

    const user = result.rows[0];

    // Verify password
    const validPassword = await bcrypt.compare(body.password, user.passwordHash);
    if (!validPassword) {
      throw UnauthorizedError('Invalid email or password');
    }

    // Generate tokens
    const accessToken = app.jwt.sign({
      userId: user.id,
      email: user.email,
      tenantId: user.tenantId,
      role: user.role,
    });

    const refreshToken = uuid();
    const refreshExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Store refresh token
    await publicQuery(
      `INSERT INTO sessions (user_id, tenant_id, refresh_token, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [user.id, user.tenantId, refreshToken, refreshExpiry]
    );

    // Update last login
    await publicQuery(
      'UPDATE users SET last_login_at = NOW() WHERE id = $1',
      [user.id]
    );

    logger.info('User logged in', { userId: user.id, email: user.email });

    return {
      accessToken,
      refreshToken,
      expiresIn: 900, // 15 minutes
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
      tenant: {
        id: user.tenantId,
        slug: user.tenant_slug,
        name: user.tenant_name,
      },
    };
  });

  /**
   * POST /auth/register
   * Register new user and create tenant
   */
  app.post('/register', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = RegisterSchema.parse(request.body);

    // Check if tenant slug already exists
    const existingTenant = await tenantManager.getTenantBySlug(body.tenantSlug);
    if (existingTenant) {
      throw ConflictError('Tenant slug already exists');
    }

    // Check if email exists in any tenant
    const existingUser = await publicQuery(
      'SELECT id FROM users WHERE email = $1',
      [body.email]
    );
    if (existingUser.rows.length > 0) {
      throw ConflictError('Email already registered');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(body.password, 12);

    // Create tenant
    const tenant = await tenantManager.createTenant(
      body.tenantName,
      body.tenantSlug,
      'basic',
      {
        branding: { companyName: body.tenantName },
        features: {
          aiEnrichment: true,
          aiMatching: false,
          cwrGeneration: true,
          royaltyProcessing: true,
        },
      }
    );

    // Create owner user
    const userResult = await publicQuery<User>(
      `INSERT INTO users (email, password_hash, first_name, last_name, tenant_id, role)
       VALUES ($1, $2, $3, $4, $5, 'OWNER')
       RETURNING *`,
      [body.email, passwordHash, body.firstName, body.lastName, tenant.id]
    );

    const user = userResult.rows[0];

    // Generate tokens
    const accessToken = app.jwt.sign({
      userId: user.id,
      email: user.email,
      tenantId: tenant.id,
      role: user.role,
    });

    const refreshToken = uuid();
    const refreshExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await publicQuery(
      `INSERT INTO sessions (user_id, tenant_id, refresh_token, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [user.id, tenant.id, refreshToken, refreshExpiry]
    );

    logger.info('New tenant and user registered', {
      tenantId: tenant.id,
      userId: user.id,
      email: user.email,
    });

    return reply.status(201).send({
      accessToken,
      refreshToken,
      expiresIn: 900,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
      tenant: {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
      },
    });
  });

  /**
   * POST /auth/refresh
   * Refresh access token using refresh token
   */
  app.post('/refresh', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = RefreshSchema.parse(request.body);

    // Find valid session
    const sessionResult = await publicQuery<{
      id: string;
      user_id: string;
      tenant_id: string;
      expires_at: Date;
    }>(
      `SELECT s.*, u.email, u.role
       FROM sessions s
       JOIN users u ON s.user_id = u.id
       WHERE s.refresh_token = $1 AND s.expires_at > NOW()`,
      [body.refreshToken]
    );

    if (sessionResult.rows.length === 0) {
      throw UnauthorizedError('Invalid or expired refresh token');
    }

    const session = sessionResult.rows[0];

    // Get user details
    const userResult = await publicQuery<User>(
      'SELECT * FROM users WHERE id = $1 AND is_active = true',
      [session.user_id]
    );

    if (userResult.rows.length === 0) {
      throw UnauthorizedError('User not found or inactive');
    }

    const user = userResult.rows[0];

    // Generate new access token
    const accessToken = app.jwt.sign({
      userId: user.id,
      email: user.email,
      tenantId: session.tenant_id,
      role: user.role,
    });

    // Optionally rotate refresh token
    const newRefreshToken = uuid();
    const newRefreshExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await publicQuery(
      `UPDATE sessions
       SET refresh_token = $1, expires_at = $2
       WHERE id = $3`,
      [newRefreshToken, newRefreshExpiry, session.id]
    );

    return {
      accessToken,
      refreshToken: newRefreshToken,
      expiresIn: 900,
    };
  });

  /**
   * POST /auth/logout
   * Invalidate refresh token
   */
  app.post('/logout', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = RefreshSchema.parse(request.body);

    await publicQuery('DELETE FROM sessions WHERE refresh_token = $1', [
      body.refreshToken,
    ]);

    return { success: true };
  });

  /**
   * GET /auth/me
   * Get current user info (requires auth)
   */
  app.get(
    '/me',
    { preHandler: [app.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as { id: string; email: string; role: UserRole };

      const userResult = await publicQuery<User & { tenant_name: string; tenant_slug: string }>(
        `SELECT u.*, t.name as tenant_name, t.slug as tenant_slug
         FROM users u
         JOIN tenants t ON u.tenant_id = t.id
         WHERE u.id = $1`,
        [payload.id]
      );

      if (userResult.rows.length === 0) {
        throw UnauthorizedError('User not found');
      }

      const user = userResult.rows[0];

      return {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        tenant: {
          id: user.tenantId,
          name: user.tenant_name,
          slug: user.tenant_slug,
        },
      };
    }
  );
}

// Extend Fastify with authenticate decorator
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
