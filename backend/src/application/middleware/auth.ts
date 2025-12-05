// ============================================================================
// PubFlow AI - Authentication Middleware
// JWT verification and user context
// ============================================================================

import { FastifyRequest, FastifyReply } from 'fastify';
import { tenantManager } from '../../infrastructure/database/tenant-manager.js';
import type { User, UserRole } from '../../shared/types/index.js';

// JWT Payload interface
interface JWTPayload {
  userId: string;
  email: string;
  tenantId: string;
  role: UserRole;
  iat: number;
  exp: number;
}

// Extend Fastify request to include user
declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      id: string;
      email: string;
      role: UserRole;
    };
  }
}

/**
 * Authentication middleware - verifies JWT and sets user context
 */
export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    // Verify JWT
    const payload = await request.jwtVerify<JWTPayload>();

    // Set user context
    request.user = {
      id: payload.userId,
      email: payload.email,
      role: payload.role,
    };

    // Set tenant context from JWT if not already set
    if (!request.tenantContext) {
      const tenant = await tenantManager.getTenantById(payload.tenantId);

      if (!tenant) {
        return reply.status(401).send({
          code: 'INVALID_TENANT',
          message: 'Tenant not found or inactive',
        });
      }

      request.tenant = tenant;
      request.tenantContext = {
        tenantId: tenant.id,
        schemaName: tenant.schemaName,
        userId: payload.userId,
      };
    } else {
      // Add userId to existing context
      request.tenantContext.userId = payload.userId;
    }
  } catch (error) {
    return reply.status(401).send({
      code: 'UNAUTHORIZED',
      message: 'Invalid or expired token',
    });
  }
}

/**
 * Role-based access control middleware factory
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      return reply.status(401).send({
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      });
    }

    if (!allowedRoles.includes(request.user.role)) {
      return reply.status(403).send({
        code: 'FORBIDDEN',
        message: `Requires one of these roles: ${allowedRoles.join(', ')}`,
      });
    }
  };
}

/**
 * Helper to require specific roles
 */
export const requireAdmin = requireRole('OWNER', 'ADMIN');
export const requireManager = requireRole('OWNER', 'ADMIN', 'MANAGER');
export const requireUser = requireRole('OWNER', 'ADMIN', 'MANAGER', 'USER');
