// ============================================================================
// PubFlow AI - Sentry Error Tracking Integration
// Comprehensive error monitoring and performance tracking
// ============================================================================

import * as Sentry from '@sentry/node';
import { FastifyInstance, FastifyRequest, FastifyReply, FastifyError } from 'fastify';
import { logger } from '../logging/logger.js';

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

interface SentryConfig {
  dsn: string | undefined;
  environment: string;
  release: string;
  tracesSampleRate: number;
  profilesSampleRate: number;
  debug: boolean;
}

interface UserContext {
  id: string;
  email?: string;
  tenantId?: string;
}

// --------------------------------------------------------------------------
// Configuration
// --------------------------------------------------------------------------

const config: SentryConfig = {
  dsn: process.env.SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
  release: process.env.npm_package_version || '1.0.0',
  tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),
  profilesSampleRate: parseFloat(process.env.SENTRY_PROFILES_SAMPLE_RATE || '0.1'),
  debug: process.env.SENTRY_DEBUG === 'true',
};

// --------------------------------------------------------------------------
// Initialization
// --------------------------------------------------------------------------

let isInitialized = false;

export function initSentry(): void {
  if (isInitialized) {
    logger.warn('Sentry already initialized');
    return;
  }

  if (!config.dsn) {
    logger.info('Sentry DSN not configured, error tracking disabled');
    return;
  }

  try {
    Sentry.init({
      dsn: config.dsn,
      environment: config.environment,
      release: `pubflow-ai@${config.release}`,

      // Performance Monitoring
      tracesSampleRate: config.tracesSampleRate,
      profilesSampleRate: config.profilesSampleRate,

      // Integrations
      integrations: [
        // HTTP tracking
        Sentry.httpIntegration(),
        // PostgreSQL query tracking
        Sentry.postgresIntegration(),
        // Console logging integration
        Sentry.consoleIntegration(),
      ],

      // Filter sensitive data
      beforeSend(event) {
        // Remove sensitive headers
        if (event.request?.headers) {
          delete event.request.headers['authorization'];
          delete event.request.headers['cookie'];
          delete event.request.headers['x-api-key'];
        }

        // Remove sensitive data from body
        if (event.request?.data) {
          const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'creditCard'];
          for (const field of sensitiveFields) {
            if (event.request.data[field]) {
              event.request.data[field] = '[REDACTED]';
            }
          }
        }

        return event;
      },

      // Filter breadcrumbs
      beforeBreadcrumb(breadcrumb) {
        // Don't track health checks
        if (breadcrumb.category === 'http' && breadcrumb.data?.url?.includes('/health')) {
          return null;
        }
        return breadcrumb;
      },

      // Ignore specific errors
      ignoreErrors: [
        // Rate limit errors are expected
        'Too Many Requests',
        // Auth errors are expected
        'Unauthorized',
        'Invalid token',
        // Network errors
        'Network request failed',
        'ECONNREFUSED',
        'ETIMEDOUT',
      ],

      debug: config.debug,
    });

    isInitialized = true;
    logger.info('Sentry initialized', {
      environment: config.environment,
      release: config.release,
      tracesSampleRate: config.tracesSampleRate,
    });
  } catch (error) {
    logger.error('Failed to initialize Sentry', { error });
  }
}

// --------------------------------------------------------------------------
// Context Helpers
// --------------------------------------------------------------------------

export function setUserContext(user: UserContext): void {
  if (!isInitialized) return;

  Sentry.setUser({
    id: user.id,
    email: user.email,
    tenantId: user.tenantId,
  } as any);
}

export function clearUserContext(): void {
  if (!isInitialized) return;
  Sentry.setUser(null);
}

export function setTenantContext(tenantId: string): void {
  if (!isInitialized) return;

  Sentry.setTag('tenant_id', tenantId);
  Sentry.setContext('tenant', { id: tenantId });
}

// --------------------------------------------------------------------------
// Error Capturing
// --------------------------------------------------------------------------

export function captureException(
  error: Error,
  context?: Record<string, any>
): string | undefined {
  if (!isInitialized) {
    logger.error('Error captured (Sentry disabled)', { error, context });
    return undefined;
  }

  return Sentry.captureException(error, {
    extra: context,
  });
}

export function captureMessage(
  message: string,
  level: Sentry.SeverityLevel = 'info',
  context?: Record<string, any>
): string | undefined {
  if (!isInitialized) {
    logger.log(level, message, context);
    return undefined;
  }

  return Sentry.captureMessage(message, {
    level,
    extra: context,
  });
}

// --------------------------------------------------------------------------
// Transaction & Span Helpers
// --------------------------------------------------------------------------

export function startTransaction(
  name: string,
  op: string
): Sentry.Span | undefined {
  if (!isInitialized) return undefined;

  return Sentry.startInactiveSpan({
    name,
    op,
  });
}

export function startSpan<T>(
  name: string,
  op: string,
  callback: () => T | Promise<T>
): Promise<T> {
  if (!isInitialized) {
    return Promise.resolve(callback());
  }

  return Sentry.startSpan(
    { name, op },
    callback
  );
}

// --------------------------------------------------------------------------
// Fastify Plugin
// --------------------------------------------------------------------------

export async function sentryPlugin(app: FastifyInstance): Promise<void> {
  if (!isInitialized) {
    logger.info('Sentry plugin skipped - not initialized');
    return;
  }

  // Request hook - start transaction
  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // Set request context
    Sentry.setContext('request', {
      method: request.method,
      url: request.url,
      headers: {
        'user-agent': request.headers['user-agent'],
        'content-type': request.headers['content-type'],
      },
    });

    // Add request ID as tag
    const requestId = request.headers['x-request-id'] || request.id;
    if (requestId) {
      Sentry.setTag('request_id', requestId as string);
    }
  });

  // Response hook - add breadcrumb
  app.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    Sentry.addBreadcrumb({
      category: 'http',
      message: `${request.method} ${request.url}`,
      level: reply.statusCode >= 400 ? 'error' : 'info',
      data: {
        status_code: reply.statusCode,
        duration: reply.elapsedTime,
      },
    });
  });

  // Error hook - capture errors
  app.addHook('onError', async (request: FastifyRequest, reply: FastifyReply, error: FastifyError) => {
    // Add request context to error
    Sentry.setContext('request', {
      method: request.method,
      url: request.url,
      params: request.params,
      query: request.query,
    });

    // Add tenant context if available
    const tenantContext = (request as any).tenantContext;
    if (tenantContext) {
      setTenantContext(tenantContext.tenantId);
      setUserContext({
        id: tenantContext.userId,
        tenantId: tenantContext.tenantId,
      });
    }

    // Capture the error
    captureException(error, {
      statusCode: error.statusCode,
      validation: error.validation,
    });
  });

  logger.info('Sentry Fastify plugin registered');
}

// --------------------------------------------------------------------------
// AI Task Tracking
// --------------------------------------------------------------------------

export function trackAITask(
  taskType: string,
  taskId: string,
  tenantId: string
): Sentry.Span | undefined {
  if (!isInitialized) return undefined;

  const span = Sentry.startInactiveSpan({
    name: `ai.${taskType.toLowerCase()}`,
    op: 'ai.task',
    attributes: {
      'ai.task_id': taskId,
      'ai.task_type': taskType,
      'tenant_id': tenantId,
    },
  });

  return span;
}

export function finishAITask(
  span: Sentry.Span | undefined,
  status: 'ok' | 'error',
  data?: Record<string, any>
): void {
  if (!span) return;

  span.setStatus({ code: status === 'ok' ? 1 : 2 });
  if (data) {
    span.setAttributes(data);
  }
  span.end();
}

// --------------------------------------------------------------------------
// Shutdown
// --------------------------------------------------------------------------

export async function closeSentry(): Promise<void> {
  if (!isInitialized) return;

  try {
    await Sentry.close(2000);
    logger.info('Sentry closed');
  } catch (error) {
    logger.error('Error closing Sentry', { error });
  }
}

// --------------------------------------------------------------------------
// Export Sentry for direct access
// --------------------------------------------------------------------------

export { Sentry };
