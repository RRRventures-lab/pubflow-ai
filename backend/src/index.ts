// ============================================================================
// PubFlow AI - Main Application Entry Point
// AI-Powered Music Publishing Administration Platform
// ============================================================================

import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import websocket from '@fastify/websocket';
import 'dotenv/config';

import { logger } from './infrastructure/logging/logger.js';
import { initSentry, sentryPlugin, closeSentry } from './infrastructure/monitoring/sentry.js';

// Initialize Sentry before anything else
initSentry();
import { checkDatabaseHealth, closePool } from './infrastructure/database/pool.js';
import { tenantMiddleware } from './application/middleware/tenant.js';
import { authMiddleware } from './application/middleware/auth.js';
import { errorHandler } from './application/middleware/error.js';

// Route imports
import { authRoutes } from './application/routes/auth.js';
import { workRoutes } from './application/routes/works.js';
import { writerRoutes } from './application/routes/writers.js';
import { cwrRoutes } from './application/routes/cwr.js';
import { royaltyRoutes } from './application/routes/royalties.js';
import { aiRoutes } from './application/routes/ai.js';
import { tenantRoutes } from './application/routes/tenants.js';
import { healthRoutes, createMetricsHook } from './application/routes/health.js';
import { musicDataRoutes } from './application/routes/music-data.js';

// --------------------------------------------------------------------------
// Fastify Instance
// --------------------------------------------------------------------------

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    transport:
      process.env.NODE_ENV !== 'production'
        ? {
            target: 'pino-pretty',
            options: { colorize: true },
          }
        : undefined,
  },
  trustProxy: true,
});

// --------------------------------------------------------------------------
// Plugins
// --------------------------------------------------------------------------

// Security
await app.register(helmet, {
  contentSecurityPolicy: process.env.NODE_ENV === 'production',
});

// SECURITY: Validate CORS origins properly
const allowedOrigins = (process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'])
  .map(origin => origin.trim())
  .filter(origin => {
    try {
      new URL(origin);
      return true;
    } catch {
      logger.warn('Invalid CORS origin ignored', { origin });
      return false;
    }
  });

await app.register(cors, {
  origin: (origin, callback) => {
    // Allow requests with no origin (same-origin, mobile apps, curl)
    if (!origin) {
      return callback(null, true);
    }
    // Check if origin is in allowed list
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    // Reject unknown origins
    logger.warn('CORS origin rejected', { origin });
    return callback(new Error('CORS origin not allowed'), false);
  },
  credentials: true,
});

await app.register(rateLimit, {
  max: 1000,
  timeWindow: '1 minute',
});

// JWT Authentication
// SECURITY: JWT secret is REQUIRED - no fallback to prevent weak secrets in production
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  logger.error('FATAL: JWT_SECRET environment variable is missing or too short (minimum 32 characters)');
  process.exit(1);
}

await app.register(jwt, {
  secret: jwtSecret,
  sign: {
    expiresIn: '15m',
  },
});

// File uploads
await app.register(multipart, {
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB for large statements
  },
});

// WebSocket for real-time updates
await app.register(websocket);

// API Documentation
await app.register(swagger, {
  openapi: {
    info: {
      title: 'PubFlow AI API',
      description: 'AI-Powered Music Publishing Administration Platform',
      version: '1.0.0',
    },
    servers: [
      { url: 'http://localhost:3001', description: 'Development' },
      { url: 'https://api.pubflow.ai', description: 'Production' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
        apiKey: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
});

await app.register(swaggerUi, {
  routePrefix: '/docs',
  uiConfig: {
    docExpansion: 'list',
    deepLinking: true,
  },
});

// --------------------------------------------------------------------------
// Global Hooks & Middleware
// --------------------------------------------------------------------------

// Error handler
app.setErrorHandler(errorHandler);

// Sentry error tracking
await app.register(sentryPlugin);

// Metrics collection hooks
const metricsHook = createMetricsHook();
app.addHook('onRequest', metricsHook.onRequest);
app.addHook('onResponse', metricsHook.onResponse);

// Tenant context middleware (for authenticated routes)
app.addHook('onRequest', tenantMiddleware);

// --------------------------------------------------------------------------
// Health & Metrics Routes (public, no auth)
// --------------------------------------------------------------------------

await app.register(healthRoutes);

app.get('/', async () => {
  return {
    name: 'PubFlow AI',
    description: 'AI-Powered Music Publishing Administration Platform',
    version: '1.0.0',
    documentation: '/docs',
    health: '/health',
    metrics: '/metrics',
  };
});

// --------------------------------------------------------------------------
// API Routes
// --------------------------------------------------------------------------

// Public routes (no auth required)
await app.register(authRoutes, { prefix: '/api/v1/auth' });

// Protected routes (auth required)
await app.register(
  async (protectedApp) => {
    // Auth middleware for all routes in this scope
    protectedApp.addHook('onRequest', authMiddleware);

    await protectedApp.register(tenantRoutes, { prefix: '/tenants' });
    await protectedApp.register(workRoutes, { prefix: '/works' });
    await protectedApp.register(writerRoutes, { prefix: '/writers' });
    await protectedApp.register(cwrRoutes, { prefix: '/cwr' });
    await protectedApp.register(royaltyRoutes, { prefix: '/royalties' });
    await protectedApp.register(aiRoutes, { prefix: '/ai' });
    await protectedApp.register(musicDataRoutes, { prefix: '/music-data' });
  },
  { prefix: '/api/v1' }
);

// --------------------------------------------------------------------------
// WebSocket for Real-time Updates
// SECURITY: WebSocket connections require authentication
// --------------------------------------------------------------------------

app.get('/ws', { websocket: true }, async (socket, req) => {
  // SECURITY: Verify JWT token from query parameter or header
  const token = req.query.token as string || req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    logger.warn('WebSocket connection rejected: No token provided', { ip: req.ip });
    socket.close(4001, 'Authentication required');
    return;
  }

  try {
    // Verify the JWT token
    const decoded = app.jwt.verify(token) as { sub: string; tenantId: string };

    // Store user context on socket
    (socket as any).userId = decoded.sub;
    (socket as any).tenantId = decoded.tenantId;

    logger.debug('WebSocket authenticated', { userId: decoded.sub, tenantId: decoded.tenantId });
  } catch (error) {
    logger.warn('WebSocket connection rejected: Invalid token', { ip: req.ip, error });
    socket.close(4002, 'Invalid token');
    return;
  }

  socket.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      logger.debug('WebSocket message received', {
        type: data.type,
        userId: (socket as any).userId
      });

      // Handle subscription to events
      if (data.type === 'subscribe') {
        // Store subscription info on socket
        (socket as any).subscriptions = data.channels;
      }
    } catch (error) {
      logger.warn('WebSocket invalid message format', { error });
    }
  });

  socket.on('close', () => {
    logger.debug('WebSocket connection closed', { userId: (socket as any).userId });
  });
});

// --------------------------------------------------------------------------
// Graceful Shutdown
// --------------------------------------------------------------------------

const shutdown = async (signal: string) => {
  logger.info(`Received ${signal}, shutting down gracefully...`);

  await app.close();
  await closePool();
  await closeSentry();

  logger.info('Server shut down complete');
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// --------------------------------------------------------------------------
// Start Server
// --------------------------------------------------------------------------

const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '3001', 10);
    const host = process.env.HOST || '0.0.0.0';

    await app.listen({ port, host });

    logger.info(`PubFlow AI server started`, {
      port,
      host,
      environment: process.env.NODE_ENV || 'development',
      docs: `http://localhost:${port}/docs`,
    });
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
};

start();

export { app };
