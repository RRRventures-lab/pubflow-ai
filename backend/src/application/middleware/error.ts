// ============================================================================
// PubFlow AI - Error Handler Middleware
// ============================================================================

import { FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../../infrastructure/logging/logger.js';
import { ZodError } from 'zod';

interface AppError extends Error {
  statusCode?: number;
  code?: string;
  details?: Record<string, unknown>;
}

export async function errorHandler(
  error: FastifyError | AppError | ZodError,
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Log the error
  logger.error('Request error', {
    error: error.message,
    stack: error.stack,
    url: request.url,
    method: request.method,
    tenantId: request.tenantContext?.tenantId,
    userId: request.user?.id,
  });

  // Handle Zod validation errors
  if (error instanceof ZodError) {
    return reply.status(400).send({
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      details: error.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      })),
    });
  }

  // Handle known application errors
  const appError = error as AppError;
  if (appError.statusCode) {
    return reply.status(appError.statusCode).send({
      code: appError.code || 'ERROR',
      message: appError.message,
      details: appError.details,
    });
  }

  // Handle Fastify errors
  if ('statusCode' in error && error.statusCode) {
    return reply.status(error.statusCode).send({
      code: error.code || 'ERROR',
      message: error.message,
    });
  }

  // Default to 500 for unknown errors
  return reply.status(500).send({
    code: 'INTERNAL_ERROR',
    message:
      process.env.NODE_ENV === 'production'
        ? 'An unexpected error occurred'
        : error.message,
  });
}

/**
 * Create an application error
 */
export function createError(
  statusCode: number,
  code: string,
  message: string,
  details?: Record<string, unknown>
): AppError {
  const error = new Error(message) as AppError;
  error.statusCode = statusCode;
  error.code = code;
  error.details = details;
  return error;
}

// Common error factories
export const NotFoundError = (resource: string, id?: string) =>
  createError(404, 'NOT_FOUND', `${resource}${id ? ` with ID ${id}` : ''} not found`);

export const UnauthorizedError = (message = 'Unauthorized') =>
  createError(401, 'UNAUTHORIZED', message);

export const ForbiddenError = (message = 'Forbidden') =>
  createError(403, 'FORBIDDEN', message);

export const BadRequestError = (message: string, details?: Record<string, unknown>) =>
  createError(400, 'BAD_REQUEST', message, details);

export const ConflictError = (message: string) =>
  createError(409, 'CONFLICT', message);
