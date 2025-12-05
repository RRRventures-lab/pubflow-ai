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

await app.register(cors, {
  origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
  credentials: true,
});

await app.register(rateLimit, {
  max: 1000,
  timeWindow: '1 minute',
});

// JWT Authentication
await app.register(jwt, {
  secret: process.env.JWT_SECRET || 'CHANGE_ME_IN_PRODUCTION_pubflow_secret_key_2024',
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
  },
  { prefix: '/api/v1' }
);

// --------------------------------------------------------------------------
// WebSocket for Real-time Updates
// --------------------------------------------------------------------------

app.get('/ws', { websocket: true }, (socket, req) => {
  socket.on('message', (message) => {
    const data = JSON.parse(message.toString());
    logger.debug('WebSocket message received', { type: data.type });

    // Handle subscription to events
    if (data.type === 'subscribe') {
      // Store subscription info on socket
      (socket as any).subscriptions = data.channels;
    }
  });

  socket.on('close', () => {
    logger.debug('WebSocket connection closed');
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
