-- =============================================================================
-- ANALYZER CONFIG TABLES
-- =============================================================================
-- Stores the current active analyzer configuration and version history.
-- Used by the Config-Driven Calibration System.

-- =============================================================================
-- TABLE: analyzer_config (Current Active Config - Single Row)
-- =============================================================================
CREATE TABLE IF NOT EXISTS analyzer_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version VARCHAR(50) NOT NULL,
    config_json JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(255) DEFAULT 'system',
    notes TEXT,
    validation_status VARCHAR(50) DEFAULT 'not_validated',
    
    -- Ensure only one active config
    CONSTRAINT single_active_config UNIQUE (id)
);

-- =============================================================================
-- TABLE: analyzer_config_history (Append-Only Version History)
-- =============================================================================
CREATE TABLE IF NOT EXISTS analyzer_config_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version VARCHAR(50) NOT NULL,
    config_json JSONB NOT NULL,
    previous_config_json JSONB,
    diff_summary JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(255) NOT NULL,
    notes TEXT NOT NULL,
    based_on_version VARCHAR(50),
    action VARCHAR(50) DEFAULT 'update', -- 'initial', 'update', 'rollback', 'ai_import'
    validation_status VARCHAR(50) DEFAULT 'not_validated'
);

-- Index for fast version lookups
CREATE INDEX IF NOT EXISTS idx_config_history_version ON analyzer_config_history(version);
CREATE INDEX IF NOT EXISTS idx_config_history_created_at ON analyzer_config_history(created_at DESC);

-- =============================================================================
-- INITIAL CONFIG INSERT (Run once to seed the table)
-- =============================================================================
-- This will be done via configService.js initialization
-- DO NOT run this SQL directly - use the seed function instead
