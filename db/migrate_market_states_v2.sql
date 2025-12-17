-- ============================================================================
-- MIGRATION: market_states → minimal schema
-- ============================================================================
-- Run this in Supabase SQL Editor AFTER the replay_states migration
--
-- REMOVES 16 REDUNDANT COLUMNS (all in full_state_json):
-- timeframe, trade_stance, risk_mode, exchange_scenario,
-- binance_oi_change, bybit_oi_change, binance_cvd, bybit_cvd,
-- regime_state, regime_subtype, funding_rate,
-- macro_bias, macro_confidence, micro_bias, micro_confidence,
-- scalping_bias, scalping_confidence, macro_anchored, hierarchy_warning
-- ============================================================================

-- Step 1: Create new minimal schema table
CREATE TABLE IF NOT EXISTS market_states_v2 (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- =========================================================================
  -- IDENTITY
  -- =========================================================================
  timestamp BIGINT NOT NULL,
  symbol TEXT NOT NULL DEFAULT 'BTC',
  
  -- =========================================================================
  -- MINIMAL FLAT COLUMNS (for indexing & fast queries only)
  -- =========================================================================
  bias TEXT,                           -- LONG/SHORT/WAIT (for accuracy queries)
  confidence NUMERIC,                  -- 0-10 (for confidence calibration)
  primary_regime TEXT,                 -- For regime performance analysis
  price NUMERIC,                       -- Quick charts without parsing JSON
  
  -- =========================================================================
  -- SINGLE SOURCE OF TRUTH - all analyzer fields live here
  -- =========================================================================
  full_state_json JSONB NOT NULL,
  
  -- =========================================================================
  -- OUTCOME LABELING (populated later by updateStateOutcome)
  -- =========================================================================
  outcome_label TEXT,                  -- CONTINUATION/REVERSAL/NOISE
  outcome_reason TEXT,
  outcome_horizon TEXT,                -- SCALPING/MICRO/MACRO
  outcome_price NUMERIC,
  outcome_move_pct NUMERIC,
  outcome_mfe NUMERIC,                 -- Max Favorable Excursion
  outcome_mae NUMERIC,                 -- Max Adverse Excursion
  outcome_labeled_at BIGINT,
  
  -- =========================================================================
  -- METADATA
  -- =========================================================================
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 2: Create indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_market_v2_timestamp ON market_states_v2(timestamp);
CREATE INDEX IF NOT EXISTS idx_market_v2_symbol ON market_states_v2(symbol);
CREATE INDEX IF NOT EXISTS idx_market_v2_bias ON market_states_v2(bias) WHERE bias IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_market_v2_outcome ON market_states_v2(outcome_label) WHERE outcome_label IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_market_v2_regime ON market_states_v2(primary_regime) WHERE primary_regime IS NOT NULL;

-- Step 3: Backfill from old table (if it exists)
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'market_states') THEN
    INSERT INTO market_states_v2 (
      id, timestamp, symbol,
      bias, confidence, primary_regime, price,
      full_state_json,
      outcome_label, outcome_reason, outcome_horizon,
      outcome_price, outcome_move_pct, outcome_mfe, outcome_mae, outcome_labeled_at,
      created_at
    )
    SELECT
      id, timestamp, symbol,
      bias, confidence, primary_regime, price,
      COALESCE(full_state_json, '{}'::jsonb),
      outcome_label, outcome_reason, outcome_horizon,
      outcome_price, outcome_move_pct, outcome_mfe, outcome_mae, outcome_labeled_at,
      created_at
    FROM market_states
    ON CONFLICT (id) DO NOTHING;
    
    RAISE NOTICE 'Backfilled data from market_states to market_states_v2';
  ELSE
    RAISE NOTICE 'No existing market_states table found - starting fresh';
  END IF;
END $$;

-- Step 4: Swap tables (safe rename)
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'market_states') THEN
    ALTER TABLE market_states RENAME TO market_states_old;
    RAISE NOTICE 'Renamed market_states → market_states_old';
  END IF;
  
  ALTER TABLE market_states_v2 RENAME TO market_states;
  RAISE NOTICE 'Renamed market_states_v2 → market_states';
END $$;

-- Step 5: Rename indexes
ALTER INDEX IF EXISTS idx_market_v2_timestamp RENAME TO idx_market_states_timestamp;
ALTER INDEX IF EXISTS idx_market_v2_symbol RENAME TO idx_market_states_symbol;
ALTER INDEX IF EXISTS idx_market_v2_bias RENAME TO idx_market_states_bias;
ALTER INDEX IF EXISTS idx_market_v2_outcome RENAME TO idx_market_states_outcome;
ALTER INDEX IF EXISTS idx_market_v2_regime RENAME TO idx_market_states_regime;

-- ============================================================================
-- DONE! You can drop market_states_old after verifying everything works:
-- DROP TABLE IF EXISTS market_states_old;
-- ============================================================================
