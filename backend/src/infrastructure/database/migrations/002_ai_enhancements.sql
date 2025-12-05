-- ============================================================================
-- PubFlow AI - AI Enhancements Migration
-- Adds AI-specific tables and columns for Phase 5 AI Agent Orchestra
-- ============================================================================

-- ============================================================================
-- Work Embeddings Table (separate from works for flexibility)
-- Stores multiple embedding types per work
-- ============================================================================
CREATE TABLE IF NOT EXISTS work_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id UUID NOT NULL UNIQUE,
  title_embedding vector(1536),
  writer_embedding vector(1536),
  combined_embedding vector(1536),
  model_version VARCHAR(50) NOT NULL DEFAULT 'text-embedding-3-small',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_work_embeddings_work ON work_embeddings(work_id);
CREATE INDEX IF NOT EXISTS idx_work_embeddings_combined ON work_embeddings USING hnsw (combined_embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX IF NOT EXISTS idx_work_embeddings_title ON work_embeddings USING hnsw (title_embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

-- ============================================================================
-- AI Audit Log Table (dedicated for AI decisions)
-- Tracks all AI-made decisions for transparency and ML feedback
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID NOT NULL,
  user_id UUID,
  details JSONB DEFAULT '{}',
  confidence DECIMAL(3,2),
  model_version VARCHAR(50),
  processing_time_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_audit_action ON ai_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_ai_audit_entity ON ai_audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_ai_audit_user ON ai_audit_log(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_audit_created ON ai_audit_log(created_at DESC);

-- ============================================================================
-- Add missing columns to enrichment_proposals
-- ============================================================================
ALTER TABLE enrichment_proposals
ADD COLUMN IF NOT EXISTS field_name VARCHAR(100);

-- Copy existing field values to field_name if field_name is null
UPDATE enrichment_proposals SET field_name = field WHERE field_name IS NULL AND field IS NOT NULL;

-- ============================================================================
-- Add missing columns to conflict_records
-- ============================================================================
ALTER TABLE conflict_records
ADD COLUMN IF NOT EXISTS details JSONB DEFAULT '{}';

ALTER TABLE conflict_records
ADD COLUMN IF NOT EXISTS resolution VARCHAR(30);

-- Add unique constraint for upsert support
CREATE UNIQUE INDEX IF NOT EXISTS idx_conflict_unique
ON conflict_records(work_id, conflict_type, description)
WHERE status = 'OPEN';

-- ============================================================================
-- Add missing columns to ai_tasks
-- ============================================================================
ALTER TABLE ai_tasks
ADD COLUMN IF NOT EXISTS result JSONB;

-- ============================================================================
-- Add matched_by and matched_at to royalty_statement_lines
-- ============================================================================
ALTER TABLE royalty_statement_lines
ADD COLUMN IF NOT EXISTS matched_by UUID;

ALTER TABLE royalty_statement_lines
ADD COLUMN IF NOT EXISTS matched_at TIMESTAMPTZ;

-- ============================================================================
-- Create AI Stats Materialized View for dashboard performance
-- ============================================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS ai_stats AS
SELECT
  COUNT(*) FILTER (WHERE status = 'PENDING') as enrichments_pending,
  COUNT(*) FILTER (WHERE status = 'APPROVED') as enrichments_approved,
  COUNT(*) FILTER (WHERE status = 'REJECTED') as enrichments_rejected
FROM enrichment_proposals;

-- Create index on materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_stats ON ai_stats(enrichments_pending);

-- Function to refresh AI stats
CREATE OR REPLACE FUNCTION refresh_ai_stats()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY ai_stats;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Trigger to update work embeddings timestamp
-- ============================================================================
CREATE OR REPLACE FUNCTION update_embedding_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_work_embeddings_timestamp
BEFORE UPDATE ON work_embeddings
FOR EACH ROW
EXECUTE FUNCTION update_embedding_timestamp();

-- ============================================================================
-- Function to find similar works using vector similarity
-- ============================================================================
CREATE OR REPLACE FUNCTION find_similar_works(
  query_embedding vector(1536),
  similarity_threshold DECIMAL DEFAULT 0.7,
  max_results INTEGER DEFAULT 10
)
RETURNS TABLE(
  work_id UUID,
  title VARCHAR(600),
  iswc VARCHAR(15),
  similarity DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    w.id as work_id,
    w.title,
    w.iswc,
    (1 - (we.combined_embedding <=> query_embedding))::DECIMAL as similarity
  FROM works w
  JOIN work_embeddings we ON w.id = we.work_id
  WHERE (1 - (we.combined_embedding <=> query_embedding)) >= similarity_threshold
  ORDER BY we.combined_embedding <=> query_embedding
  LIMIT max_results;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Function to batch update match status
-- ============================================================================
CREATE OR REPLACE FUNCTION batch_update_match_status(
  line_ids UUID[],
  new_status VARCHAR(20),
  matched_work UUID DEFAULT NULL,
  confidence DECIMAL DEFAULT NULL,
  user_id UUID DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE royalty_statement_lines
  SET
    match_status = new_status,
    matched_work_id = COALESCE(matched_work, matched_work_id),
    match_confidence = COALESCE(confidence, match_confidence),
    matched_by = user_id,
    matched_at = CASE WHEN matched_work IS NOT NULL THEN NOW() ELSE matched_at END,
    updated_at = NOW()
  WHERE id = ANY(line_ids);

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Add pg_trgm extension for fuzzy matching
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Add trigram indexes for fuzzy search
CREATE INDEX IF NOT EXISTS idx_works_title_trgm ON works USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_writers_name_trgm ON writers USING gin ((first_name || ' ' || last_name) gin_trgm_ops);

-- ============================================================================
-- Create function for fuzzy title matching
-- ============================================================================
CREATE OR REPLACE FUNCTION fuzzy_match_works(
  search_title VARCHAR,
  similarity_threshold DECIMAL DEFAULT 0.3,
  max_results INTEGER DEFAULT 50
)
RETURNS TABLE(
  work_id UUID,
  title VARCHAR(600),
  iswc VARCHAR(15),
  similarity DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    w.id as work_id,
    w.title,
    w.iswc,
    similarity(w.title, search_title)::DECIMAL as similarity
  FROM works w
  WHERE similarity(w.title, search_title) >= similarity_threshold
  ORDER BY similarity(w.title, search_title) DESC
  LIMIT max_results;
END;
$$ LANGUAGE plpgsql;
