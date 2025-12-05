-- ============================================================================
-- PubFlow AI - Public Schema Migration
-- Contains: tenants, users, sessions, plans, territories, societies
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ============================================================================
-- Subscription Plans
-- ============================================================================
CREATE TABLE IF NOT EXISTS plans (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  max_works INTEGER,
  max_users INTEGER,
  features JSONB DEFAULT '{}',
  price_monthly DECIMAL(10,2),
  price_yearly DECIMAL(10,2),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default plans
INSERT INTO plans (id, name, description, max_works, max_users, features, price_monthly, price_yearly) VALUES
  ('free', 'Free', 'For small catalogs', 100, 2, '{"cwrGeneration": true, "aiEnrichment": false, "aiMatching": false}', 0, 0),
  ('basic', 'Basic', 'For growing publishers', 1000, 5, '{"cwrGeneration": true, "aiEnrichment": true, "aiMatching": false}', 49, 490),
  ('pro', 'Professional', 'For established publishers', 10000, 20, '{"cwrGeneration": true, "aiEnrichment": true, "aiMatching": true}', 199, 1990),
  ('enterprise', 'Enterprise', 'Unlimited everything', NULL, NULL, '{"cwrGeneration": true, "aiEnrichment": true, "aiMatching": true, "api": true, "priority": true}', NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- Tenants
-- ============================================================================
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  schema_name VARCHAR(100) NOT NULL UNIQUE,
  plan_id VARCHAR(50) NOT NULL REFERENCES plans(id) DEFAULT 'basic',
  settings JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenants_active ON tenants(is_active) WHERE is_active = true;

-- ============================================================================
-- Users (shared across tenants but scoped)
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL DEFAULT 'USER',
  is_active BOOLEAN DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_user_role CHECK (role IN ('OWNER', 'ADMIN', 'MANAGER', 'USER', 'VIEWER')),
  UNIQUE(email, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active) WHERE is_active = true;

-- ============================================================================
-- Sessions / Refresh Tokens
-- ============================================================================
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  refresh_token VARCHAR(500) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(refresh_token);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- Clean up expired sessions automatically
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS void AS $$
BEGIN
  DELETE FROM sessions WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- CISAC Societies (Reference Data)
-- ============================================================================
CREATE TABLE IF NOT EXISTS societies (
  id VARCHAR(10) PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  full_name VARCHAR(500),
  country VARCHAR(3),
  territory_code VARCHAR(10),
  society_type VARCHAR(20) NOT NULL DEFAULT 'PRO',
  website VARCHAR(500),
  is_active BOOLEAN DEFAULT true,

  CONSTRAINT valid_society_type CHECK (society_type IN ('PRO', 'MRO', 'BOTH'))
);

-- Insert major societies
INSERT INTO societies (id, name, full_name, country, society_type) VALUES
  ('ASCAP', 'ASCAP', 'American Society of Composers, Authors and Publishers', 'US', 'PRO'),
  ('BMI', 'BMI', 'Broadcast Music, Inc.', 'US', 'PRO'),
  ('SESAC', 'SESAC', 'SESAC Holdings', 'US', 'PRO'),
  ('GMR', 'GMR', 'Global Music Rights', 'US', 'PRO'),
  ('SOCAN', 'SOCAN', 'Society of Composers, Authors and Music Publishers of Canada', 'CA', 'BOTH'),
  ('PRS', 'PRS', 'PRS for Music', 'GB', 'PRO'),
  ('MCPS', 'MCPS', 'Mechanical-Copyright Protection Society', 'GB', 'MRO'),
  ('SACEM', 'SACEM', 'Société des Auteurs, Compositeurs et Éditeurs de Musique', 'FR', 'BOTH'),
  ('GEMA', 'GEMA', 'Gesellschaft für musikalische Aufführungs- und mechanische Vervielfältigungsrechte', 'DE', 'BOTH'),
  ('SGAE', 'SGAE', 'Sociedad General de Autores y Editores', 'ES', 'BOTH'),
  ('SIAE', 'SIAE', 'Società Italiana degli Autori ed Editori', 'IT', 'BOTH'),
  ('JASRAC', 'JASRAC', 'Japanese Society for Rights of Authors, Composers and Publishers', 'JP', 'BOTH'),
  ('APRA', 'APRA', 'Australasian Performing Right Association', 'AU', 'PRO'),
  ('AMCOS', 'AMCOS', 'Australasian Mechanical Copyright Owners Society', 'AU', 'MRO')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- CISAC Territories (Reference Data)
-- Based on ~/Desktop/cisac-repos/territories
-- ============================================================================
CREATE TABLE IF NOT EXISTS territories (
  id SERIAL PRIMARY KEY,
  tis_code VARCHAR(10) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  iso_code VARCHAR(3),
  parent_tis_code VARCHAR(10),
  is_active BOOLEAN DEFAULT true
);

-- Insert major territories
INSERT INTO territories (tis_code, name, iso_code) VALUES
  ('2136', 'World', NULL),
  ('2100', 'Europe', NULL),
  ('840', 'United States', 'US'),
  ('826', 'United Kingdom', 'GB'),
  ('250', 'France', 'FR'),
  ('276', 'Germany', 'DE'),
  ('724', 'Spain', 'ES'),
  ('380', 'Italy', 'IT'),
  ('392', 'Japan', 'JP'),
  ('124', 'Canada', 'CA'),
  ('36', 'Australia', 'AU'),
  ('76', 'Brazil', 'BR'),
  ('484', 'Mexico', 'MX'),
  ('410', 'Republic of Korea', 'KR'),
  ('156', 'China', 'CN'),
  ('356', 'India', 'IN'),
  ('528', 'Netherlands', 'NL'),
  ('752', 'Sweden', 'SE'),
  ('578', 'Norway', 'NO'),
  ('208', 'Denmark', 'DK')
ON CONFLICT (tis_code) DO NOTHING;

-- ============================================================================
-- API Keys for external integrations
-- ============================================================================
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  key_hash VARCHAR(255) NOT NULL,
  key_prefix VARCHAR(10) NOT NULL,
  permissions JSONB DEFAULT '[]',
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON api_keys(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix);

-- ============================================================================
-- Updated At Trigger for public tables
-- ============================================================================
CREATE OR REPLACE FUNCTION update_public_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION update_public_updated_at();
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_public_updated_at();
CREATE TRIGGER update_plans_updated_at BEFORE UPDATE ON plans FOR EACH ROW EXECUTE FUNCTION update_public_updated_at();
