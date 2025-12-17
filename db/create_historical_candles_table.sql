-- ============================================================================
-- Historical Candles Table
-- ============================================================================
-- Stores historical market data for backtesting without API calls
-- Data sources: Coinglass API (price, OI, funding, taker buy/sell volume)
-- 
-- Created: 2025-12-17
-- ============================================================================

CREATE TABLE IF NOT EXISTS historical_candles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Identification
    exchange TEXT NOT NULL,           -- 'Binance' or 'Bybit'
    symbol TEXT NOT NULL DEFAULT 'BTC',
    timeframe TEXT NOT NULL,          -- '30m', '1h', '4h', '1d'
    timestamp BIGINT NOT NULL,        -- Candle open time (milliseconds)
    
    -- Price OHLCV
    open NUMERIC,
    high NUMERIC,
    low NUMERIC,
    close NUMERIC,
    volume NUMERIC,
    
    -- Open Interest
    oi NUMERIC,                       -- Open interest value
    oi_open NUMERIC,
    oi_high NUMERIC,
    oi_low NUMERIC,
    oi_close NUMERIC,
    
    -- Taker Buy/Sell Volume (for CVD calculation)
    buy_volume NUMERIC,               -- Taker buy volume (USD)
    sell_volume NUMERIC,              -- Taker sell volume (USD)
    -- Note: CVD = cumulative(buy_volume - sell_volume), calculated at read time
    
    -- Funding Rate
    funding_rate NUMERIC,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- Indexes
-- ============================================================================

-- Primary lookup index: get candles for a specific exchange/symbol/timeframe range
CREATE INDEX IF NOT EXISTS idx_candles_lookup 
ON historical_candles(exchange, symbol, timeframe, timestamp);

-- Unique constraint: prevent duplicate candles
CREATE UNIQUE INDEX IF NOT EXISTS idx_candles_unique 
ON historical_candles(exchange, symbol, timeframe, timestamp);

-- Latest timestamp lookup (for sync progress)
CREATE INDEX IF NOT EXISTS idx_candles_latest 
ON historical_candles(exchange, symbol, timeframe, timestamp DESC);

-- ============================================================================
-- Sync Progress Table
-- ============================================================================
-- Tracks sync progress for resumable data ingestion

CREATE TABLE IF NOT EXISTS historical_sync_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exchange TEXT NOT NULL,
    symbol TEXT NOT NULL,
    timeframe TEXT NOT NULL,
    data_type TEXT NOT NULL,          -- 'price', 'oi', 'funding', 'taker_volume'
    last_synced_timestamp BIGINT,     -- Last successfully synced candle timestamp
    total_rows BIGINT DEFAULT 0,
    status TEXT DEFAULT 'pending',    -- 'pending', 'syncing', 'completed', 'failed'
    error TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(exchange, symbol, timeframe, data_type)
);

-- ============================================================================
-- Helper Function: Update timestamp on row update
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to historical_candles
DROP TRIGGER IF EXISTS update_historical_candles_updated_at ON historical_candles;
CREATE TRIGGER update_historical_candles_updated_at
    BEFORE UPDATE ON historical_candles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to sync_progress
DROP TRIGGER IF EXISTS update_sync_progress_updated_at ON historical_sync_progress;
CREATE TRIGGER update_sync_progress_updated_at
    BEFORE UPDATE ON historical_sync_progress
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Estimated Data Volume
-- ============================================================================
-- For 3 months (90 days) per exchange:
-- 30m candles: 90 * 48 = 4,320 rows
-- 1h candles:  90 * 24 = 2,160 rows  
-- 4h candles:  90 * 6  = 540 rows
-- 1d candles:  90 * 1  = 90 rows
-- Total per exchange: ~7,110 rows
-- Total for 2 exchanges: ~14,220 rows
-- 
-- This is trivial for PostgreSQL/Supabase (< 1MB)
-- ============================================================================
