-- ============================================================================
-- replay_states table for Stage 3 Historical Replay Backtesting
-- ============================================================================
-- This table stores replay backtest states SEPARATELY from live market_states
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS replay_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Replay-specific fields
  batch_id UUID NOT NULL,
  as_of_timestamp BIGINT NOT NULL,
  symbol TEXT NOT NULL DEFAULT 'BTC',
  
  -- Core fields (same as market_states)
  timestamp BIGINT NOT NULL,
  timeframe TEXT,
  bias TEXT,
  confidence NUMERIC,
  trade_stance TEXT,
  primary_regime TEXT,
  risk_mode TEXT,
  exchange_scenario TEXT,
  
  -- Exchange data
  binance_oi_change NUMERIC,
  bybit_oi_change NUMERIC,
  binance_cvd NUMERIC,
  bybit_cvd NUMERIC,
  regime_state TEXT,
  regime_subtype TEXT,
  funding_rate NUMERIC,
  price NUMERIC,
  
  -- Hierarchy
  macro_bias TEXT,
  macro_confidence NUMERIC,
  micro_bias TEXT,
  micro_confidence NUMERIC,
  scalping_bias TEXT,
  scalping_confidence NUMERIC,
  macro_anchored BOOLEAN DEFAULT FALSE,
  hierarchy_warning TEXT,
  
  -- Full state JSON
  full_state_json JSONB,
  
  -- Outcome labeling
  outcome_label TEXT,
  outcome_reason TEXT,
  outcome_horizon TEXT,
  outcome_price NUMERIC,
  outcome_move_pct NUMERIC,
  outcome_mfe NUMERIC,
  outcome_mae NUMERIC,
  outcome_labeled_at BIGINT,
  
  -- Replay metadata
  data_range_latest BIGINT,
  candles_captured JSONB,
  status TEXT DEFAULT 'COMPLETED',
  error_message TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Unique constraint for idempotency
  CONSTRAINT unique_replay_sample UNIQUE (batch_id, as_of_timestamp, symbol)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_replay_states_batch ON replay_states(batch_id);
CREATE INDEX IF NOT EXISTS idx_replay_states_timestamp ON replay_states(as_of_timestamp);
CREATE INDEX IF NOT EXISTS idx_replay_states_symbol ON replay_states(symbol);
CREATE INDEX IF NOT EXISTS idx_replay_states_status ON replay_states(status);
CREATE INDEX IF NOT EXISTS idx_replay_states_outcome ON replay_states(outcome_label) WHERE outcome_label IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_replay_states_unlabeled ON replay_states(symbol, status, as_of_timestamp) 
  WHERE outcome_label IS NULL AND status = 'COMPLETED';

-- Enable Row Level Security (RLS) if needed
-- ALTER TABLE replay_states ENABLE ROW LEVEL SECURITY;
