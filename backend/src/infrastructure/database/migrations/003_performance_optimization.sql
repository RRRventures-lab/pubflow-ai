-- ============================================================================
-- PubFlow AI - Performance Optimization Migration
-- Indexes, materialized views, and query functions for optimal performance
-- ============================================================================

-- ============================================================================
-- Additional Indexes for Common Query Patterns
-- ============================================================================

-- Works table - common search patterns
CREATE INDEX IF NOT EXISTS idx_works_created_at ON works(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_works_updated_at ON works(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_works_title_lower ON works(LOWER(title));
CREATE INDEX IF NOT EXISTS idx_works_work_code_lower ON works(LOWER(work_code));

-- Writers table - name search
CREATE INDEX IF NOT EXISTS idx_writers_full_name ON writers((first_name || ' ' || last_name));
CREATE INDEX IF NOT EXISTS idx_writers_ipi_partial ON writers(ipi_name_number varchar_pattern_ops) WHERE ipi_name_number IS NOT NULL;

-- Statement lines - matching queries
CREATE INDEX IF NOT EXISTS idx_stmt_lines_title ON royalty_statement_lines(song_title);
CREATE INDEX IF NOT EXISTS idx_stmt_lines_title_trgm ON royalty_statement_lines USING gin (song_title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_stmt_lines_unmatched ON royalty_statement_lines(statement_id, match_status)
  WHERE match_status IN ('UNMATCHED', 'AI_MATCHED');

-- Enrichment proposals - review queue
CREATE INDEX IF NOT EXISTS idx_proposals_pending_high ON enrichment_proposals(confidence DESC, created_at ASC)
  WHERE status = 'PENDING' AND confidence >= 0.8;

-- Conflict records - active conflicts
CREATE INDEX IF NOT EXISTS idx_conflicts_open_severity ON conflict_records(severity, created_at)
  WHERE status = 'OPEN';

-- AI tasks - queue optimization
CREATE INDEX IF NOT EXISTS idx_ai_tasks_queue ON ai_tasks(priority DESC, created_at ASC)
  WHERE status = 'PENDING';

-- CWR exports - recent exports
CREATE INDEX IF NOT EXISTS idx_cwr_recent ON cwr_exports(created_at DESC, status)
  WHERE status IN ('DRAFT', 'GENERATED', 'SUBMITTED');

-- ============================================================================
-- Partial Indexes for Hot Paths
-- ============================================================================

-- Active works (recently updated)
CREATE INDEX IF NOT EXISTS idx_works_active ON works(updated_at DESC)
  WHERE updated_at > NOW() - INTERVAL '30 days';

-- High value statement lines (for prioritization)
CREATE INDEX IF NOT EXISTS idx_stmt_lines_high_value ON royalty_statement_lines(amount DESC)
  WHERE amount > 100 AND match_status = 'UNMATCHED';

-- ============================================================================
-- Materialized View for Dashboard Stats
-- ============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS tenant_dashboard_stats AS
SELECT
  -- Works stats
  COUNT(*) as total_works,
  COUNT(*) FILTER (WHERE embedding IS NOT NULL) as embedded_works,
  COUNT(*) FILTER (WHERE iswc IS NOT NULL) as works_with_iswc,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') as recent_works,

  -- Writers stats
  (SELECT COUNT(*) FROM writers) as total_writers,
  (SELECT COUNT(*) FROM writers WHERE is_controlled = true) as controlled_writers,

  -- Statement stats
  (SELECT COUNT(*) FROM royalty_statements WHERE status = 'REVIEW') as statements_in_review,
  (SELECT COUNT(*) FROM royalty_statement_lines WHERE match_status = 'UNMATCHED') as unmatched_lines,
  (SELECT COUNT(*) FROM royalty_statement_lines WHERE match_status = 'AI_MATCHED') as ai_matched_lines,

  -- AI stats
  (SELECT COUNT(*) FROM enrichment_proposals WHERE status = 'PENDING') as pending_enrichments,
  (SELECT COUNT(*) FROM conflict_records WHERE status = 'OPEN') as open_conflicts,
  (SELECT COUNT(*) FROM conflict_records WHERE status = 'OPEN' AND severity = 'CRITICAL') as critical_conflicts,
  (SELECT COUNT(*) FROM ai_tasks WHERE status = 'PENDING') as pending_ai_tasks

FROM works;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_dashboard_stats ON tenant_dashboard_stats(total_works);

-- Refresh function for dashboard stats
CREATE OR REPLACE FUNCTION refresh_dashboard_stats()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY tenant_dashboard_stats;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Materialized View for Matching Statistics
-- ============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS matching_stats AS
SELECT
  statement_id,
  COUNT(*) as total_lines,
  COUNT(*) FILTER (WHERE match_status = 'UNMATCHED') as unmatched,
  COUNT(*) FILTER (WHERE match_status = 'AUTO_MATCHED') as auto_matched,
  COUNT(*) FILTER (WHERE match_status = 'AI_MATCHED') as ai_matched,
  COUNT(*) FILTER (WHERE match_status = 'HUMAN_MATCHED') as human_matched,
  COUNT(*) FILTER (WHERE match_status = 'REJECTED') as rejected,
  AVG(match_confidence) FILTER (WHERE match_confidence IS NOT NULL) as avg_confidence,
  SUM(amount) as total_amount,
  SUM(amount) FILTER (WHERE matched_work_id IS NOT NULL) as matched_amount
FROM royalty_statement_lines
GROUP BY statement_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_matching_stats_stmt ON matching_stats(statement_id);

-- ============================================================================
-- Optimized Search Functions
-- ============================================================================

-- Fast work search combining multiple methods
CREATE OR REPLACE FUNCTION search_works(
  search_query VARCHAR,
  search_limit INTEGER DEFAULT 20
)
RETURNS TABLE(
  work_id UUID,
  title VARCHAR(600),
  iswc VARCHAR(15),
  work_code VARCHAR(50),
  match_type VARCHAR(10),
  score DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  WITH exact_matches AS (
    SELECT id, title, iswc, work_code, 'exact'::VARCHAR as match_type, 1.0::DECIMAL as score
    FROM works
    WHERE LOWER(title) = LOWER(search_query)
       OR iswc = search_query
       OR work_code = search_query
    LIMIT search_limit
  ),
  fuzzy_matches AS (
    SELECT id, title, iswc, work_code, 'fuzzy'::VARCHAR as match_type,
           similarity(title, search_query)::DECIMAL as score
    FROM works
    WHERE similarity(title, search_query) > 0.3
      AND id NOT IN (SELECT id FROM exact_matches)
    ORDER BY score DESC
    LIMIT search_limit
  ),
  fulltext_matches AS (
    SELECT id, title, iswc, work_code, 'fulltext'::VARCHAR as match_type,
           ts_rank(to_tsvector('english', title), plainto_tsquery('english', search_query))::DECIMAL as score
    FROM works
    WHERE to_tsvector('english', title) @@ plainto_tsquery('english', search_query)
      AND id NOT IN (SELECT id FROM exact_matches)
      AND id NOT IN (SELECT id FROM fuzzy_matches)
    ORDER BY score DESC
    LIMIT search_limit
  )
  SELECT * FROM exact_matches
  UNION ALL
  SELECT * FROM fuzzy_matches
  UNION ALL
  SELECT * FROM fulltext_matches
  ORDER BY
    CASE match_type
      WHEN 'exact' THEN 1
      WHEN 'fuzzy' THEN 2
      ELSE 3
    END,
    score DESC
  LIMIT search_limit;
END;
$$ LANGUAGE plpgsql;

-- Efficient writer lookup
CREATE OR REPLACE FUNCTION find_writer_by_ipi(
  ipi_number VARCHAR
)
RETURNS TABLE(
  writer_id UUID,
  full_name VARCHAR,
  ipi_name_number VARCHAR(11),
  is_controlled BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT id, first_name || ' ' || last_name, ipi_name_number, is_controlled
  FROM writers
  WHERE ipi_name_number = ipi_number
     OR ipi_base_number = ipi_number
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Query Optimization: Prepared Statement Helpers
-- ============================================================================

-- Batch insert works with writers
CREATE OR REPLACE FUNCTION bulk_insert_works(
  works_data JSONB
)
RETURNS INTEGER AS $$
DECLARE
  work_record JSONB;
  inserted_count INTEGER := 0;
BEGIN
  FOR work_record IN SELECT * FROM jsonb_array_elements(works_data)
  LOOP
    INSERT INTO works (title, iswc, work_code)
    VALUES (
      work_record->>'title',
      work_record->>'iswc',
      work_record->>'work_code'
    )
    ON CONFLICT (work_code) DO NOTHING;

    IF FOUND THEN
      inserted_count := inserted_count + 1;
    END IF;
  END LOOP;

  RETURN inserted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Connection and Query Optimization Settings
-- ============================================================================

-- Function to set optimal session parameters
CREATE OR REPLACE FUNCTION set_optimal_session_params()
RETURNS void AS $$
BEGIN
  -- Increase work_mem for complex queries
  SET LOCAL work_mem = '256MB';

  -- Optimize for index scans
  SET LOCAL random_page_cost = 1.1;

  -- Enable parallel queries
  SET LOCAL max_parallel_workers_per_gather = 4;

  -- Optimize for large result sets
  SET LOCAL effective_cache_size = '4GB';
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Vacuum and Analyze Schedule (for maintenance)
-- ============================================================================

-- Function to run maintenance tasks
CREATE OR REPLACE FUNCTION run_table_maintenance(
  table_name TEXT
)
RETURNS void AS $$
BEGIN
  EXECUTE format('ANALYZE %I', table_name);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Statistics Helpers
-- ============================================================================

-- Get table size and row count estimates
CREATE OR REPLACE FUNCTION get_table_stats()
RETURNS TABLE(
  tablename TEXT,
  row_estimate BIGINT,
  total_bytes BIGINT,
  index_bytes BIGINT,
  table_bytes BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    relname::TEXT as tablename,
    reltuples::BIGINT as row_estimate,
    pg_total_relation_size(relid) as total_bytes,
    pg_indexes_size(relid) as index_bytes,
    pg_relation_size(relid) as table_bytes
  FROM pg_stat_user_tables
  ORDER BY pg_total_relation_size(relid) DESC;
END;
$$ LANGUAGE plpgsql;

-- Get slow queries (for monitoring)
CREATE OR REPLACE FUNCTION get_slow_queries(
  min_duration_ms INTEGER DEFAULT 1000
)
RETURNS TABLE(
  query TEXT,
  calls BIGINT,
  total_time_ms DOUBLE PRECISION,
  mean_time_ms DOUBLE PRECISION,
  rows_returned BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    query::TEXT,
    calls,
    total_exec_time as total_time_ms,
    mean_exec_time as mean_time_ms,
    rows as rows_returned
  FROM pg_stat_statements
  WHERE mean_exec_time > min_duration_ms
  ORDER BY total_exec_time DESC
  LIMIT 20;
EXCEPTION
  WHEN undefined_table THEN
    -- pg_stat_statements not installed
    RETURN;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VACUUM/ANALYZE on commonly updated tables
-- ============================================================================

-- This would be run by a scheduled job, not the migration itself
-- Example: SELECT run_table_maintenance('works');
-- Example: SELECT run_table_maintenance('royalty_statement_lines');

COMMENT ON FUNCTION run_table_maintenance IS 'Run ANALYZE on specified table. Schedule this for off-peak hours.';

-- ============================================================================
-- Create Trigger for Auto-Refresh of Stats
-- ============================================================================

-- Function to refresh stats after bulk operations
CREATE OR REPLACE FUNCTION trigger_refresh_stats()
RETURNS TRIGGER AS $$
BEGIN
  -- Only refresh periodically, not on every change
  -- In production, use a background job instead
  PERFORM pg_notify('refresh_stats', '');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Optional: Add trigger for periodic refresh notification
-- CREATE TRIGGER notify_stats_refresh
-- AFTER INSERT OR UPDATE OR DELETE ON works
-- FOR EACH STATEMENT
-- EXECUTE FUNCTION trigger_refresh_stats();
