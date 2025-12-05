# PubFlow AI

AI-Powered Music Publishing Administration Platform

## Overview

PubFlow AI is a next-generation SaaS platform for music publishers, combining enterprise-grade CWR (Common Works Registration) processing, intelligent royalty management, and AI-powered metadata enrichment.

## Features

- **CWR Generation**: Full support for CWR 2.1, 2.2, and 3.0 specifications
- **AI Matching**: Intelligent royalty statement matching with 95%+ accuracy
- **Metadata Enrichment**: Automated IPI, ISWC, and ISRC discovery
- **Conflict Detection**: AI-powered duplicate and share conflict identification
- **Multi-Tenant**: Secure schema-per-tenant architecture
- **Real-Time Dashboard**: Vue.js/Nuxt frontend with virtual scrolling for 100K+ works

## Tech Stack

### Backend
- **Runtime**: Node.js 20+
- **Framework**: Fastify
- **Database**: PostgreSQL 16 with pgvector
- **Queue**: Redis + BullMQ
- **AI**: OpenAI GPT-4, text-embedding-3-large

### Frontend
- **Framework**: Nuxt 3 (Vue 3)
- **Styling**: Tailwind CSS
- **State**: Pinia
- **Components**: HeadlessUI, Heroicons

## Quick Start

### Prerequisites
- Docker and Docker Compose
- Node.js 20+
- PostgreSQL 16+ with pgvector
- Redis 7+
- OpenAI API key

### Development

```bash
# Clone the repository
git clone https://github.com/RRRventures-lab/pubflow-ai.git
cd pubflow-ai

# Copy environment files
cp .env.example .env

# Start services with Docker
docker compose up -d

# Or run locally
cd backend && npm install && npm run dev
cd frontend && npm install && npm run dev
```

### Environment Variables

See `.env.example` for required configuration.

## Architecture

```
pubflow-ai/
├── backend/           # Fastify API server
│   ├── src/
│   │   ├── application/    # Routes, middleware
│   │   ├── domain/         # Business logic, entities
│   │   └── infrastructure/ # Database, AI, external services
├── frontend/          # Nuxt 3 application
│   ├── pages/         # Vue pages
│   ├── components/    # Reusable components
│   └── stores/        # Pinia state management
├── docker-compose.yml # Container orchestration
└── Dockerfile         # Multi-stage build
```

## API Documentation

API documentation is available at `/docs` when running the server.

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for production deployment guides.

## License

Proprietary - All rights reserved.
