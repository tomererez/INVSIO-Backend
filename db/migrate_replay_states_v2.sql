-- ============================================================================
-- MIGRATION: replay_states → minimal schema (NO timeframe column)
-- ============================================================================
-- Run this in Supabase SQL Editor
--
-- MINIMAL COLUMNS RATIONALE:
-- - Only flat columns needed for indexing/filtering/scoreboard
-- - full_state_json is the SINGLE SOURCE OF TRUTH for all market state data
-- - Future analyzer changes do NOT require DB migrations
-- - NO timeframe column (all timeframes are in full_state_json)
-- ============================================================================

-- Step 1: Create new minimal schema table
CREATE TABLE IF NOT EXISTS replay_states_v2 (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- =========================================================================
  -- REPLAY IDENTITY (required for idempotency)
  -- =========================================================================
  batch_id UUID NOT NULL,
  as_of_timestamp BIGINT NOT NULL,
  symbol TEXT NOT NULL DEFAULT 'BTC',
  
  -- =========================================================================
  -- MINIMAL FLAT COLUMNS (for indexing & fast scoreboard queries only)
  -- =========================================================================
  timestamp BIGINT,                    -- When the state was generated
  bias TEXT,                           -- LONG/SHORT/WAIT (for accuracy queries)
  confidence NUMERIC,                  -- 0-10 (for confidence calibration)
  primary_regime TEXT,                 -- For regime performance analysis
  price NUMERIC,                       -- Quick reference
  
  -- =========================================================================
  -- SINGLE SOURCE OF TRUTH - all analyzer fields live here
  -- =========================================================================
  full_state_json JSONB NOT NULL,
  
  -- =========================================================================
  -- OUTCOME LABELING (populated by outcomeLabelingJob)
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
  -- STATUS & METADATA
  -- =========================================================================
  status TEXT DEFAULT 'COMPLETED',     -- COMPLETED/FAILED/etc
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- =========================================================================
  -- UNIQUE CONSTRAINT for idempotency (no timeframe needed)
  -- =========================================================================
  CONSTRAINT unique_replay_sample_v2 UNIQUE (batch_id, as_of_timestamp, symbol)
);

-- Step 2: Create indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_replay_v2_batch ON replay_states_v2(batch_id);
CREATE INDEX IF NOT EXISTS idx_replay_v2_batch_timestamp ON replay_states_v2(batch_id, as_of_timestamp);
CREATE INDEX IF NOT EXISTS idx_replay_v2_status ON replay_states_v2(status);
CREATE INDEX IF NOT EXISTS idx_replay_v2_outcome ON replay_states_v2(outcome_label) 
  WHERE outcome_label IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_replay_v2_unlabeled ON replay_states_v2(symbol, status, as_of_timestamp) 
  WHERE outcome_label IS NULL AND status = 'COMPLETED';
CREATE INDEX IF NOT EXISTS idx_replay_v2_bias ON replay_states_v2(bias) WHERE bias IS NOT NULL;

-- Step 3: Backfill from old table (if it exists)
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'replay_states') THEN
    INSERT INTO replay_states_v2 (
      id, batch_id, as_of_timestamp, symbol, timestamp,
      bias, confidence, primary_regime, price,
      full_state_json,
      outcome_label, outcome_reason, outcome_horizon,
      outcome_price, outcome_move_pct, outcome_mfe, outcome_mae, outcome_labeled_at,
      status, error_message, created_at
    )
    SELECT
      id, batch_id, as_of_timestamp, symbol, timestamp,
      bias, confidence, primary_regime, price,
      COALESCE(full_state_json, '{}'::jsonb),
      outcome_label, outcome_reason, outcome_horizon,
      outcome_price, outcome_move_pct, outcome_mfe, outcome_mae, outcome_labeled_at,
      COALESCE(status, 'COMPLETED'), error_message, created_at
    FROM replay_states
    ON CONFLICT (batch_id, as_of_timestamp, symbol) DO NOTHING;
    
    RAISE NOTICE 'Backfilled data from replay_states to replay_states_v2';
  ELSE
    RAISE NOTICE 'No existing replay_states table found - starting fresh';
  END IF;
END $$;

-- Step 4: Swap tables (safe rename)
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'replay_states') THEN
    ALTER TABLE replay_states RENAME TO replay_states_old;
    RAISE NOTICE 'Renamed replay_states → replay_states_old';
  END IF;
  
  ALTER TABLE replay_states_v2 RENAME TO replay_states;
  RAISE NOTICE 'Renamed replay_states_v2 → replay_states';
  
  ALTER TABLE replay_states RENAME CONSTRAINT unique_replay_sample_v2 TO unique_replay_sample;
END $$;

-- Step 5: Rename indexes to match new table name
ALTER INDEX IF EXISTS idx_replay_v2_batch RENAME TO idx_replay_states_batch;
ALTER INDEX IF EXISTS idx_replay_v2_batch_timestamp RENAME TO idx_replay_states_batch_timestamp;
ALTER INDEX IF EXISTS idx_replay_v2_status RENAME TO idx_replay_states_status;
ALTER INDEX IF EXISTS idx_replay_v2_outcome RENAME TO idx_replay_states_outcome;
ALTER INDEX IF EXISTS idx_replay_v2_unlabeled RENAME TO idx_replay_states_unlabeled;
ALTER INDEX IF EXISTS idx_replay_v2_bias RENAME TO idx_replay_states_bias;

-- ============================================================================
-- DONE! You can drop replay_states_old after verifying everything works:
-- DROP TABLE IF EXISTS replay_states_old;
-- ============================================================================
