-- Create table for Absorption Events (Phase 1 & 2)
CREATE TABLE IF NOT EXISTS absorption_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    market_state_id UUID REFERENCES market_states(id),
    detected_at BIGINT NOT NULL,
    symbol TEXT NOT NULL,
    timeframe TEXT NOT NULL,
    cvd_direction TEXT NOT NULL,
    cvd_strength DECIMAL,
    cvd_noise_floor DECIMAL,
    oi_behavior TEXT,
    oi_at_detection DECIMAL,
    price_response TEXT,
    price_at_detection DECIMAL,
    location TEXT,
    sr_level_used DECIMAL,
    resolved_at BIGINT,
    resolution TEXT,
    resolution_reason TEXT,
    resolution_criteria JSONB,
    extensions_used INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique index to prevent duplicate OPEN events
CREATE UNIQUE INDEX IF NOT EXISTS absorption_unique_open 
ON absorption_events (symbol, timeframe, cvd_direction) 
WHERE resolved_at IS NULL;

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_absorption_symbol_resolved 
ON absorption_events (symbol, resolved_at);
