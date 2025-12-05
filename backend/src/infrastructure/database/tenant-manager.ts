// ============================================================================
// PubFlow AI - Multi-Tenant Schema Manager
// Schema-per-tenant isolation pattern
// ============================================================================

import { pool, query, publicQuery } from './pool.js';
import { logger } from '../logging/logger.js';
import type { Tenant, TenantSettings } from '../../shared/types/index.js';

// --------------------------------------------------------------------------
// Tenant Schema DDL
// This creates all tables for a new tenant schema
// --------------------------------------------------------------------------

const TENANT_SCHEMA_DDL = `
-- Enable pgvector extension (if not exists in public schema)
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- Writers
-- ============================================================================
CREATE TABLE writers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  ipi_name_number VARCHAR(11),
  ipi_base_number VARCHAR(13),
  pr_society VARCHAR(10),
  mr_society VARCHAR(10),
  sr_society VARCHAR(10),
  publisher_code VARCHAR(10),
  is_controlled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_ipi CHECK (ipi_name_number IS NULL OR ipi_name_number ~ '^\\d{11}$')
);

CREATE INDEX idx_writers_ipi ON writers(ipi_name_number) WHERE ipi_name_number IS NOT NULL;
CREATE INDEX idx_writers_name ON writers(last_name, first_name);
CREATE INDEX idx_writers_controlled ON writers(is_controlled) WHERE is_controlled = true;

-- ============================================================================
-- Publishers
-- ============================================================================
CREATE TABLE publishers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  ipi_name_number VARCHAR(11),
  ipi_base_number VARCHAR(13),
  pr_society VARCHAR(10),
  mr_society VARCHAR(10),
  sr_society VARCHAR(10),
  publisher_code VARCHAR(10) NOT NULL,
  publisher_type VARCHAR(2) NOT NULL DEFAULT 'E',
  is_controlled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_publisher_type CHECK (publisher_type IN ('E', 'AM', 'SE', 'PA', 'ES'))
);

CREATE INDEX idx_publishers_code ON publishers(publisher_code);

-- ============================================================================
-- Works
-- ============================================================================
CREATE TABLE works (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(600) NOT NULL,
  iswc VARCHAR(15),
  work_code VARCHAR(50) NOT NULL,
  work_type VARCHAR(3) DEFAULT 'ORI',
  version_type VARCHAR(3) DEFAULT 'ORI',
  duration INTEGER,
  text_music_relationship VARCHAR(3),
  composite_type VARCHAR(3),
  excerpt_type VARCHAR(3),
  music_arrangement VARCHAR(3),
  lyric_adaptation VARCHAR(3),
  language VARCHAR(3),
  original_title VARCHAR(600),
  registration_date DATE,
  last_status_change TIMESTAMPTZ,

  -- Calculated ownership percentages
  pr_ownership DECIMAL(5,2),
  mr_ownership DECIMAL(5,2),
  sr_ownership DECIMAL(5,2),

  -- AI embedding (1536 dimensions for text-embedding-3-large)
  embedding vector(1536),
  embedding_updated_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_iswc CHECK (iswc IS NULL OR iswc ~ '^T-\\d{9}-\\d$'),
  CONSTRAINT valid_work_type CHECK (work_type IN ('ORI', 'MOD', 'ARR', 'TRA', 'JAZ', 'MED', 'POT', 'UNS'))
);

CREATE UNIQUE INDEX idx_works_code ON works(work_code);
CREATE INDEX idx_works_iswc ON works(iswc) WHERE iswc IS NOT NULL;
CREATE INDEX idx_works_title ON works USING gin(to_tsvector('english', title));
CREATE INDEX idx_works_embedding ON works USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

-- ============================================================================
-- Writers in Works (Junction Table)
-- ============================================================================
CREATE TABLE writers_in_works (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id UUID NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  writer_id UUID NOT NULL REFERENCES writers(id) ON DELETE RESTRICT,
  role VARCHAR(2) NOT NULL,
  share DECIMAL(5,2) NOT NULL,
  is_controlled BOOLEAN DEFAULT false,
  publisher_id UUID REFERENCES publishers(id),
  original_publisher_id UUID REFERENCES publishers(id),
  pr_share DECIMAL(5,2),
  mr_share DECIMAL(5,2),
  sr_share DECIMAL(5,2),
  manuscript_share DECIMAL(5,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_role CHECK (role IN ('C', 'A', 'CA', 'AR', 'AD', 'TR', 'SA', 'SR')),
  CONSTRAINT valid_share CHECK (share >= 0 AND share <= 100),
  UNIQUE(work_id, writer_id, role)
);

CREATE INDEX idx_wiw_work ON writers_in_works(work_id);
CREATE INDEX idx_wiw_writer ON writers_in_works(writer_id);

-- ============================================================================
-- Publishers in Works
-- ============================================================================
CREATE TABLE publishers_in_works (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id UUID NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  publisher_id UUID NOT NULL REFERENCES publishers(id) ON DELETE RESTRICT,
  role VARCHAR(2) NOT NULL DEFAULT 'E',
  pr_share DECIMAL(5,2),
  mr_share DECIMAL(5,2),
  sr_share DECIMAL(5,2),
  sequence INTEGER NOT NULL DEFAULT 1,
  special_agreement BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_pub_role CHECK (role IN ('E', 'AM', 'SE', 'PA', 'ES')),
  UNIQUE(work_id, publisher_id, sequence)
);

CREATE INDEX idx_piw_work ON publishers_in_works(work_id);

-- ============================================================================
-- Alternate Titles
-- ============================================================================
CREATE TABLE alternate_titles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id UUID NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  title VARCHAR(600) NOT NULL,
  title_type VARCHAR(2) NOT NULL DEFAULT 'AT',
  language VARCHAR(3),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_title_type CHECK (title_type IN ('AT', 'TE', 'FT', 'IT', 'OT', 'TT', 'PT', 'RT', 'ET', 'OL', 'AL'))
);

CREATE INDEX idx_alt_titles_work ON alternate_titles(work_id);
CREATE INDEX idx_alt_titles_title ON alternate_titles USING gin(to_tsvector('english', title));

-- ============================================================================
-- Recordings
-- ============================================================================
CREATE TABLE recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id UUID NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  isrc VARCHAR(15),
  recording_title VARCHAR(600),
  version_title VARCHAR(600),
  release_date DATE,
  duration INTEGER,
  record_label VARCHAR(200),
  catalog_number VARCHAR(50),
  ean13 VARCHAR(13),

  -- AI embedding
  embedding vector(1536),
  embedding_updated_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_isrc CHECK (isrc IS NULL OR isrc ~ '^[A-Z]{2}[A-Z0-9]{3}\\d{7}$')
);

CREATE INDEX idx_recordings_work ON recordings(work_id);
CREATE INDEX idx_recordings_isrc ON recordings(isrc) WHERE isrc IS NOT NULL;

-- ============================================================================
-- Performing Artists
-- ============================================================================
CREATE TABLE performing_artists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_id UUID NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
  first_name VARCHAR(100),
  last_name VARCHAR(100) NOT NULL,
  ipi_name_number VARCHAR(11),
  isni VARCHAR(16),
  role VARCHAR(20) DEFAULT 'FEATURED',
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_artist_role CHECK (role IN ('FEATURED', 'MAIN', 'GUEST'))
);

CREATE INDEX idx_artists_recording ON performing_artists(recording_id);

-- ============================================================================
-- CWR Exports
-- ============================================================================
CREATE TABLE cwr_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version VARCHAR(2) NOT NULL,
  submitter_code VARCHAR(3) NOT NULL,
  receiver_code VARCHAR(3) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  file_content TEXT,
  work_count INTEGER NOT NULL DEFAULT 0,
  transaction_type VARCHAR(3) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  submitted_at TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_cwr_version CHECK (version IN ('21', '22', '30', '31')),
  CONSTRAINT valid_cwr_status CHECK (status IN ('DRAFT', 'GENERATED', 'SUBMITTED', 'ACKNOWLEDGED', 'ERROR'))
);

CREATE INDEX idx_cwr_exports_status ON cwr_exports(status);
CREATE INDEX idx_cwr_exports_created ON cwr_exports(created_at DESC);

-- ============================================================================
-- Works in CWR Export
-- ============================================================================
CREATE TABLE works_in_cwr_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cwr_export_id UUID NOT NULL REFERENCES cwr_exports(id) ON DELETE CASCADE,
  work_id UUID NOT NULL REFERENCES works(id) ON DELETE RESTRICT,
  transaction_sequence INTEGER NOT NULL,
  record_sequence INTEGER NOT NULL,
  status VARCHAR(10) DEFAULT 'PENDING',
  society_work_id VARCHAR(50),
  acknowledged_at TIMESTAMPTZ,
  error_details TEXT
);

CREATE INDEX idx_wice_export ON works_in_cwr_exports(cwr_export_id);
CREATE INDEX idx_wice_work ON works_in_cwr_exports(work_id);

-- ============================================================================
-- Royalty Statements
-- ============================================================================
CREATE TABLE royalty_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename VARCHAR(255) NOT NULL,
  source_type VARCHAR(50) NOT NULL,
  period VARCHAR(20) NOT NULL,
  format VARCHAR(10) NOT NULL,
  total_lines INTEGER NOT NULL DEFAULT 0,
  matched_lines INTEGER DEFAULT 0,
  unmatched_lines INTEGER DEFAULT 0,
  total_amount DECIMAL(15,2),
  currency VARCHAR(3) DEFAULT 'USD',
  status VARCHAR(20) DEFAULT 'UPLOADED',
  column_mapping JSONB,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  CONSTRAINT valid_stmt_status CHECK (status IN ('UPLOADED', 'MAPPING', 'PROCESSING', 'MATCHING', 'REVIEW', 'COMPLETE'))
);

CREATE INDEX idx_statements_status ON royalty_statements(status);
CREATE INDEX idx_statements_source ON royalty_statements(source_type);

-- ============================================================================
-- Royalty Statement Lines
-- ============================================================================
CREATE TABLE royalty_statement_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id UUID NOT NULL REFERENCES royalty_statements(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL,
  raw_data JSONB NOT NULL,

  -- Parsed fields
  song_title VARCHAR(600),
  writer_names TEXT[],
  performer_names TEXT[],
  iswc VARCHAR(15),
  isrc VARCHAR(15),
  amount DECIMAL(15,4) NOT NULL,
  units INTEGER,
  usage_type VARCHAR(50),
  territory VARCHAR(10),

  -- Matching
  match_status VARCHAR(20) DEFAULT 'UNMATCHED',
  matched_work_id UUID REFERENCES works(id),
  match_confidence DECIMAL(3,2),
  match_method VARCHAR(20),
  match_candidates JSONB,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,

  -- AI embedding
  embedding vector(1536),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_match_status CHECK (match_status IN ('UNMATCHED', 'AUTO_MATCHED', 'AI_MATCHED', 'HUMAN_MATCHED', 'REJECTED'))
);

CREATE INDEX idx_stmt_lines_statement ON royalty_statement_lines(statement_id);
CREATE INDEX idx_stmt_lines_status ON royalty_statement_lines(match_status);
CREATE INDEX idx_stmt_lines_work ON royalty_statement_lines(matched_work_id) WHERE matched_work_id IS NOT NULL;
CREATE INDEX idx_stmt_lines_embedding ON royalty_statement_lines USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

-- ============================================================================
-- Royalty Distributions
-- ============================================================================
CREATE TABLE royalty_distributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id UUID NOT NULL REFERENCES royalty_statements(id),
  statement_line_id UUID NOT NULL REFERENCES royalty_statement_lines(id),
  work_id UUID NOT NULL REFERENCES works(id),
  writer_id UUID REFERENCES writers(id),
  publisher_id UUID REFERENCES publishers(id),

  gross_amount DECIMAL(15,4) NOT NULL,
  fee_amount DECIMAL(15,4) DEFAULT 0,
  net_amount DECIMAL(15,4) NOT NULL,
  share_percentage DECIMAL(5,2) NOT NULL,

  status VARCHAR(20) DEFAULT 'CALCULATED',
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_dist_status CHECK (status IN ('CALCULATED', 'APPROVED', 'PAID'))
);

CREATE INDEX idx_distributions_statement ON royalty_distributions(statement_id);
CREATE INDEX idx_distributions_work ON royalty_distributions(work_id);
CREATE INDEX idx_distributions_writer ON royalty_distributions(writer_id) WHERE writer_id IS NOT NULL;
CREATE INDEX idx_distributions_status ON royalty_distributions(status);

-- ============================================================================
-- AI Tasks Queue
-- ============================================================================
CREATE TABLE ai_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_type VARCHAR(30) NOT NULL,
  entity_type VARCHAR(20) NOT NULL,
  entity_id UUID NOT NULL,
  status VARCHAR(20) DEFAULT 'PENDING',
  priority INTEGER DEFAULT 0,
  input JSONB,
  output JSONB,
  confidence DECIMAL(3,2),
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_task_status CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'))
);

CREATE INDEX idx_ai_tasks_status ON ai_tasks(status, priority DESC);
CREATE INDEX idx_ai_tasks_entity ON ai_tasks(entity_type, entity_id);

-- ============================================================================
-- Enrichment Proposals
-- ============================================================================
CREATE TABLE enrichment_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id UUID NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  ai_task_id UUID REFERENCES ai_tasks(id),
  proposal_type VARCHAR(20) NOT NULL,
  field VARCHAR(100) NOT NULL,
  current_value TEXT,
  proposed_value TEXT NOT NULL,
  source VARCHAR(100) NOT NULL,
  confidence DECIMAL(3,2) NOT NULL,
  status VARCHAR(20) DEFAULT 'PENDING',
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_proposal_status CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED'))
);

CREATE INDEX idx_proposals_work ON enrichment_proposals(work_id);
CREATE INDEX idx_proposals_status ON enrichment_proposals(status);

-- ============================================================================
-- Conflict Records
-- ============================================================================
CREATE TABLE conflict_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id UUID NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  conflict_type VARCHAR(30) NOT NULL,
  severity VARCHAR(10) NOT NULL,
  description TEXT NOT NULL,
  related_work_ids UUID[],
  suggested_resolution TEXT,
  status VARCHAR(20) DEFAULT 'OPEN',
  resolved_by UUID,
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_conflict_severity CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  CONSTRAINT valid_conflict_status CHECK (status IN ('OPEN', 'IN_REVIEW', 'RESOLVED', 'DISMISSED'))
);

CREATE INDEX idx_conflicts_work ON conflict_records(work_id);
CREATE INDEX idx_conflicts_status ON conflict_records(status);
CREATE INDEX idx_conflicts_severity ON conflict_records(severity);

-- ============================================================================
-- Audit Log
-- ============================================================================
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  action VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID NOT NULL,
  previous_value JSONB,
  new_value JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);

-- ============================================================================
-- Updated At Trigger
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to all tables with updated_at
CREATE TRIGGER update_writers_updated_at BEFORE UPDATE ON writers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_publishers_updated_at BEFORE UPDATE ON publishers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_works_updated_at BEFORE UPDATE ON works FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_wiw_updated_at BEFORE UPDATE ON writers_in_works FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_recordings_updated_at BEFORE UPDATE ON recordings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_cwr_exports_updated_at BEFORE UPDATE ON cwr_exports FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_stmt_lines_updated_at BEFORE UPDATE ON royalty_statement_lines FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_distributions_updated_at BEFORE UPDATE ON royalty_distributions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_conflicts_updated_at BEFORE UPDATE ON conflict_records FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
`;

// --------------------------------------------------------------------------
// Tenant Manager Class
// --------------------------------------------------------------------------

export class TenantManager {
  /**
   * Create a new tenant with their own schema
   */
  async createTenant(
    name: string,
    slug: string,
    planId: string = 'basic',
    settings: TenantSettings = {}
  ): Promise<Tenant> {
    const schemaName = `tenant_${slug.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`;

    logger.info('Creating new tenant', { name, slug, schemaName });

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Insert tenant record in public schema
      const tenantResult = await client.query<Tenant>(
        `INSERT INTO tenants (name, slug, schema_name, plan_id, settings, is_active)
         VALUES ($1, $2, $3, $4, $5, true)
         RETURNING *`,
        [name, slug, schemaName, planId, JSON.stringify(settings)]
      );

      const tenant = tenantResult.rows[0];

      // Create the tenant's schema
      await client.query(`CREATE SCHEMA IF NOT EXISTS ${schemaName}`);

      // Set search path and create all tables
      await client.query(`SET search_path TO ${schemaName}`);
      await client.query(TENANT_SCHEMA_DDL);

      await client.query('COMMIT');

      logger.info('Tenant created successfully', { tenantId: tenant.id, schemaName });

      return tenant;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to create tenant', { error, name, slug });
      throw error;
    } finally {
      await client.query('SET search_path TO public');
      client.release();
    }
  }

  /**
   * Get tenant by ID
   */
  async getTenantById(tenantId: string): Promise<Tenant | null> {
    const result = await publicQuery<Tenant>(
      'SELECT * FROM tenants WHERE id = $1 AND is_active = true',
      [tenantId]
    );
    return result.rows[0] || null;
  }

  /**
   * Get tenant by slug
   */
  async getTenantBySlug(slug: string): Promise<Tenant | null> {
    const result = await publicQuery<Tenant>(
      'SELECT * FROM tenants WHERE slug = $1 AND is_active = true',
      [slug]
    );
    return result.rows[0] || null;
  }

  /**
   * List all active tenants
   */
  async listTenants(): Promise<Tenant[]> {
    const result = await publicQuery<Tenant>(
      'SELECT * FROM tenants WHERE is_active = true ORDER BY created_at DESC'
    );
    return result.rows;
  }

  /**
   * Update tenant settings
   */
  async updateTenantSettings(
    tenantId: string,
    settings: Partial<TenantSettings>
  ): Promise<Tenant> {
    const result = await publicQuery<Tenant>(
      `UPDATE tenants
       SET settings = settings || $2::jsonb, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [tenantId, JSON.stringify(settings)]
    );

    if (result.rows.length === 0) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }

    return result.rows[0];
  }

  /**
   * Deactivate a tenant (soft delete)
   */
  async deactivateTenant(tenantId: string): Promise<void> {
    await publicQuery(
      'UPDATE tenants SET is_active = false, updated_at = NOW() WHERE id = $1',
      [tenantId]
    );
    logger.info('Tenant deactivated', { tenantId });
  }

  /**
   * Drop tenant schema (hard delete - use with caution!)
   */
  async dropTenantSchema(tenantId: string): Promise<void> {
    const tenant = await this.getTenantById(tenantId);
    if (!tenant) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }

    logger.warn('Dropping tenant schema', { tenantId, schemaName: tenant.schemaName });

    await query(`DROP SCHEMA IF EXISTS ${tenant.schemaName} CASCADE`);
    await publicQuery('DELETE FROM tenants WHERE id = $1', [tenantId]);

    logger.info('Tenant schema dropped', { tenantId, schemaName: tenant.schemaName });
  }
}

export const tenantManager = new TenantManager();
