-- Add Foreign Key to allow joining alerts with market states
ALTER TABLE alerts_history
ADD CONSTRAINT fk_market_state
FOREIGN KEY (market_state_id)
REFERENCES market_states (id)
ON DELETE SET NULL;

-- Notify PostgREST to refresh schema cache
NOTIFY pgrst, 'reload config';
