# ============================================================================
# PubFlow AI - Multi-stage Production Dockerfile
# ============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Base image with dependencies
# -----------------------------------------------------------------------------
FROM node:20-alpine AS base

# Install required system dependencies
RUN apk add --no-cache \
    libc6-compat \
    python3 \
    make \
    g++

WORKDIR /app

# -----------------------------------------------------------------------------
# Stage 2: Install dependencies
# -----------------------------------------------------------------------------
FROM base AS deps

# Copy package files
COPY package*.json ./
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/

# Install all dependencies
RUN npm ci --workspace=backend --workspace=frontend

# -----------------------------------------------------------------------------
# Stage 3: Build backend
# -----------------------------------------------------------------------------
FROM base AS backend-builder

WORKDIR /app/backend

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/backend/node_modules ./node_modules

# Copy source
COPY backend/ .

# Build TypeScript
RUN npm run build

# -----------------------------------------------------------------------------
# Stage 4: Build frontend
# -----------------------------------------------------------------------------
FROM base AS frontend-builder

WORKDIR /app/frontend

# Copy dependencies
COPY --from=deps /app/node_modules ../node_modules
COPY --from=deps /app/frontend/node_modules ./node_modules

# Copy source
COPY frontend/ .

# Build Nuxt
ENV NODE_ENV=production
RUN npm run build

# -----------------------------------------------------------------------------
# Stage 5: Production backend image
# -----------------------------------------------------------------------------
FROM node:20-alpine AS backend

LABEL maintainer="PubFlow AI Team"
LABEL description="PubFlow AI Backend - Music Publishing Administration"

# Security: Run as non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 pubflow

WORKDIR /app

# Copy built backend
COPY --from=backend-builder --chown=pubflow:nodejs /app/backend/dist ./dist
COPY --from=backend-builder --chown=pubflow:nodejs /app/backend/package*.json ./

# Install production dependencies only
RUN npm ci --only=production && \
    npm cache clean --force

# Copy migrations
COPY --chown=pubflow:nodejs backend/src/infrastructure/database/migrations ./migrations

USER pubflow

# Environment
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "dist/index.js"]

# -----------------------------------------------------------------------------
# Stage 6: Production frontend image
# -----------------------------------------------------------------------------
FROM node:20-alpine AS frontend

LABEL maintainer="PubFlow AI Team"
LABEL description="PubFlow AI Frontend - Nuxt 3 SSR"

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 pubflow

WORKDIR /app

# Copy built frontend
COPY --from=frontend-builder --chown=pubflow:nodejs /app/frontend/.output ./.output
COPY --from=frontend-builder --chown=pubflow:nodejs /app/frontend/package*.json ./

USER pubflow

ENV NODE_ENV=production
ENV NUXT_HOST=0.0.0.0
ENV NUXT_PORT=3001

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

CMD ["node", ".output/server/index.mjs"]
