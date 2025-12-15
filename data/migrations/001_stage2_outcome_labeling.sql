-- STAGE 2: Outcome Labeling & Ground Truth - Database Migration
-- Run this migration to add outcome labeling columns to market_states table

-- =====================================================================
-- OUTCOME LABELING COLUMNS
-- =====================================================================
-- These columns store the outcome evaluation after horizon expiry

ALTER TABLE market_states 
ADD COLUMN IF NOT EXISTS outcome_label TEXT;

ALTER TABLE market_states 
ADD COLUMN IF NOT EXISTS outcome_reason TEXT;

ALTER TABLE market_states 
ADD COLUMN IF NOT EXISTS outcome_horizon TEXT;

ALTER TABLE market_states 
ADD COLUMN IF NOT EXISTS outcome_price NUMERIC;

ALTER TABLE market_states 
ADD COLUMN IF NOT EXISTS outcome_move_pct NUMERIC;

ALTER TABLE market_states 
ADD COLUMN IF NOT EXISTS outcome_mfe NUMERIC;

ALTER TABLE market_states 
ADD COLUMN IF NOT EXISTS outcome_mae NUMERIC;

ALTER TABLE market_states 
ADD COLUMN IF NOT EXISTS outcome_labeled_at BIGINT;

-- =====================================================================
-- HIERARCHY VALIDATION COLUMNS
-- =====================================================================
-- These columns capture the three-layer hierarchy state for validation

ALTER TABLE market_states 
ADD COLUMN IF NOT EXISTS macro_bias TEXT;

ALTER TABLE market_states 
ADD COLUMN IF NOT EXISTS macro_confidence NUMERIC;

ALTER TABLE market_states 
ADD COLUMN IF NOT EXISTS micro_bias TEXT;

ALTER TABLE market_states 
ADD COLUMN IF NOT EXISTS micro_confidence NUMERIC;

ALTER TABLE market_states 
ADD COLUMN IF NOT EXISTS scalping_bias TEXT;

ALTER TABLE market_states 
ADD COLUMN IF NOT EXISTS scalping_confidence NUMERIC;

ALTER TABLE market_states 
ADD COLUMN IF NOT EXISTS macro_anchored BOOLEAN DEFAULT FALSE;

ALTER TABLE market_states 
ADD COLUMN IF NOT EXISTS hierarchy_warning TEXT;

-- =====================================================================
-- INDEXES FOR OUTCOME QUERIES
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_market_states_outcome_label 
ON market_states(outcome_label);

CREATE INDEX IF NOT EXISTS idx_market_states_outcome_pending 
ON market_states(timestamp) 
WHERE outcome_label IS NULL;

CREATE INDEX IF NOT EXISTS idx_market_states_macro_anchored 
ON market_states(macro_anchored) 
WHERE macro_anchored = TRUE;

-- =====================================================================
-- COMMENTS FOR DOCUMENTATION
-- =====================================================================

COMMENT ON COLUMN market_states.outcome_label IS 
'Stage 2: Outcome label (CONTINUATION, REVERSAL, NOISE, or NULL for pending)';

COMMENT ON COLUMN market_states.outcome_reason IS 
'Stage 2: Human-readable reason for the outcome label';

COMMENT ON COLUMN market_states.outcome_horizon IS 
'Stage 2: Time horizon used for evaluation (SCALPING, MICRO, MACRO)';

COMMENT ON COLUMN market_states.outcome_mfe IS 
'Stage 2: Max Favorable Excursion - best move in predicted direction';

COMMENT ON COLUMN market_states.outcome_mae IS 
'Stage 2: Max Adverse Excursion - worst move against predicted direction';

COMMENT ON COLUMN market_states.macro_anchored IS 
'Stage 2: Was macro anchoring applied (lower TF blocked by macro)?';
