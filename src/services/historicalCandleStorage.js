// src/services/historicalCandleStorage.js
// ============================================================================
// Historical Candle Storage Service
// ============================================================================
// Provides database access for historical candle data used in backtesting.
// This replaces live API calls during backtests, making them instant.
//
// Created: 2025-12-17
// ============================================================================

const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');

/**
 * =======================================================================
 * SUPABASE CLIENT
 * =======================================================================
 */

let supabaseClient = null;

function getSupabase() {
    if (!supabaseClient) {
        const url = process.env.SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_KEY;

        if (!url || !key) {
            logger.warn('[HistoricalStorage] Supabase not configured');
            return null;
        }

        supabaseClient = createClient(url, key);
    }
    return supabaseClient;
}

/**
 * =======================================================================
 * CANDLE STORAGE OPERATIONS
 * =======================================================================
 */

/**
 * Upsert candles (insert or update on conflict)
 * @param {Array} candles - Array of candle objects
 * @returns {Object} { success, inserted, updated, errors }
 */
async function upsertCandles(candles) {
    const client = getSupabase();
    if (!client) return { success: false, error: 'Database not configured' };

    if (!candles || candles.length === 0) {
        return { success: true, inserted: 0, updated: 0 };
    }

    try {
        // Supabase upsert with onConflict - merged table uses (exchange, symbol, timeframe, timestamp)
        const { data, error } = await client
            .from('historical_candles')
            .upsert(candles, {
                onConflict: 'exchange,symbol,timeframe,timestamp',  // No data_type - merged rows
                ignoreDuplicates: false
            })
            .select('id');

        if (error) {
            logger.error('[HistoricalStorage] Upsert failed:', error);
            return { success: false, error: error.message };
        }

        return {
            success: true,
            count: candles.length,
            upserted: data?.length || 0
        };

    } catch (err) {
        logger.error('[HistoricalStorage] Upsert exception:', err);
        return { success: false, error: err.message };
    }
}

/**
 * Get candles for a specific range
 * MERGED TABLE: One row contains all data types (price, OI, funding, taker volume)
 * @param {Object} params - { exchange, symbol, timeframe, startTime, endTime }
 * @returns {Array} Candles sorted by timestamp ascending
 */
async function getCandles({ exchange, symbol = 'BTC', timeframe, startTime, endTime }) {
    const client = getSupabase();
    if (!client) return [];

    try {
        let query = client
            .from('historical_candles')
            .select('*')
            .eq('exchange', exchange)
            .eq('symbol', symbol)
            .eq('timeframe', timeframe)
            .order('timestamp', { ascending: true });

        if (startTime) {
            query = query.gte('timestamp', startTime);
        }
        if (endTime) {
            query = query.lte('timestamp', endTime);
        }

        const { data, error } = await query;

        if (error) {
            logger.error('[HistoricalStorage] getCandles error:', error);
            return [];
        }

        // Debug logging
        logger.debug(`[HistoricalStorage] getCandles: ${exchange}/${symbol}/${timeframe} => ${data?.length || 0} rows`);

        return data || [];

    } catch (err) {
        logger.error('[HistoricalStorage] getCandles exception:', err);
        return [];
    }
}

/**
 * Get latest timestamp for a specific exchange/symbol/timeframe
 * MERGED TABLE: No data_type filtering - one row per timestamp
 * Used to know where to resume syncing
 */
async function getLatestTimestamp(exchange, symbol = 'BTC', timeframe) {
    const client = getSupabase();
    if (!client) return null;

    try {
        let query = client
            .from('historical_candles')
            .select('timestamp')
            .eq('exchange', exchange)
            .eq('symbol', symbol)
            .eq('timeframe', timeframe);

        const { data, error } = await query
            .order('timestamp', { ascending: false })
            .limit(1)
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
            logger.error('[HistoricalStorage] getLatestTimestamp error:', error);
            return null;
        }

        return data?.timestamp || null;

    } catch (err) {
        logger.error('[HistoricalStorage] getLatestTimestamp exception:', err);
        return null;
    }
}

/**
 * Get earliest timestamp for a specific exchange/symbol/timeframe
 */
async function getEarliestTimestamp(exchange, symbol = 'BTC', timeframe) {
    const client = getSupabase();
    if (!client) return null;

    try {
        const { data, error } = await client
            .from('historical_candles')
            .select('timestamp')
            .eq('exchange', exchange)
            .eq('symbol', symbol)
            .eq('timeframe', timeframe)
            .order('timestamp', { ascending: true })
            .limit(1)
            .single();

        if (error && error.code !== 'PGRST116') {
            return null;
        }

        return data?.timestamp || null;

    } catch (err) {
        return null;
    }
}

/**
 * Check if we have data for a given time range
 * Returns true if we have at least some candles in the range
 */
async function hasDataForRange(startTime, endTime, options = {}) {
    const { exchange = 'Binance', symbol = 'BTC', timeframe = '4h' } = options;

    const client = getSupabase();
    if (!client) return false;

    try {
        const { count, error } = await client
            .from('historical_candles')
            .select('*', { count: 'exact', head: true })
            .eq('exchange', exchange)
            .eq('symbol', symbol)
            .eq('timeframe', timeframe)
            .gte('timestamp', startTime)
            .lte('timestamp', endTime);

        if (error) {
            logger.error('[HistoricalStorage] hasDataForRange error:', error);
            return false;
        }

        // Consider having data if we have at least some candles
        return (count || 0) > 0;

    } catch (err) {
        return false;
    }
}

/**
 * Get data coverage information (for UI display)
 * Returns date ranges and counts for each exchange/timeframe
 */
async function getDataCoverage(symbol = 'BTC') {
    const client = getSupabase();
    if (!client) return { success: false, error: 'Database not configured' };

    try {
        const exchanges = ['Binance', 'Bybit'];
        const timeframes = ['30m', '1h', '4h', '1d'];

        const coverage = {};

        for (const exchange of exchanges) {
            coverage[exchange] = {};

            for (const tf of timeframes) {
                const earliest = await getEarliestTimestamp(exchange, symbol, tf);
                const latest = await getLatestTimestamp(exchange, symbol, tf);

                // Count ALL rows for this exchange/timeframe (including all data_types)
                const { count } = await client
                    .from('historical_candles')
                    .select('*', { count: 'exact', head: true })
                    .eq('exchange', exchange)
                    .eq('symbol', symbol)
                    .eq('timeframe', tf);

                coverage[exchange][tf] = {
                    earliest: earliest ? new Date(earliest).toISOString() : null,
                    latest: latest ? new Date(latest).toISOString() : null,
                    count: count || 0
                };
            }
        }

        // Get total row count from database directly
        const { count: totalCount } = await client
            .from('historical_candles')
            .select('*', { count: 'exact', head: true })
            .eq('symbol', symbol);

        // Calculate overall range
        let overallEarliest = null;
        let overallLatest = null;

        for (const exchange of exchanges) {
            for (const tf of timeframes) {
                const c = coverage[exchange][tf];
                if (c.earliest) {
                    if (!overallEarliest || new Date(c.earliest) < new Date(overallEarliest)) {
                        overallEarliest = c.earliest;
                    }
                }
                if (c.latest) {
                    if (!overallLatest || new Date(c.latest) > new Date(overallLatest)) {
                        overallLatest = c.latest;
                    }
                }
            }
        }

        return {
            success: true,
            overall: {
                earliest: overallEarliest,
                latest: overallLatest,
                totalRows: totalCount || 0
            },
            byExchange: coverage
        };

    } catch (err) {
        logger.error('[HistoricalStorage] getDataCoverage exception:', err);
        return { success: false, error: err.message };
    }
}

/**
 * Delete old candles (for cleanup)
 */
async function deleteOldCandles(beforeTimestamp) {
    const client = getSupabase();
    if (!client) return { success: false, error: 'Database not configured' };

    try {
        const { data, error } = await client
            .from('historical_candles')
            .delete()
            .lt('timestamp', beforeTimestamp)
            .select('id');

        if (error) {
            return { success: false, error: error.message };
        }

        return { success: true, deleted: data?.length || 0 };

    } catch (err) {
        return { success: false, error: err.message };
    }
}

/**
 * =======================================================================
 * SYNC PROGRESS TRACKING
 * =======================================================================
 */

/**
 * Get sync progress for all exchange/timeframe combinations
 */
async function getSyncProgress(symbol = 'BTC') {
    const client = getSupabase();
    if (!client) return [];

    try {
        const { data, error } = await client
            .from('historical_sync_progress')
            .select('*')
            .eq('symbol', symbol)
            .order('exchange')
            .order('timeframe');

        if (error) {
            logger.error('[HistoricalStorage] getSyncProgress error:', error);
            return [];
        }

        return data || [];

    } catch (err) {
        return [];
    }
}

/**
 * Update sync progress
 */
async function updateSyncProgress({ exchange, symbol = 'BTC', timeframe, dataType, lastTimestamp, status, error: errorMsg }) {
    const client = getSupabase();
    if (!client) return { success: false };

    try {
        const now = new Date().toISOString();

        const record = {
            exchange,
            symbol,
            timeframe,
            data_type: dataType,
            last_synced_timestamp: lastTimestamp,
            status,
            error: errorMsg || null,
            updated_at: now
        };

        if (status === 'syncing') {
            record.started_at = now;
        } else if (status === 'completed') {
            record.completed_at = now;
        }

        const { error } = await client
            .from('historical_sync_progress')
            .upsert(record, {
                onConflict: 'exchange,symbol,timeframe,data_type'
            });

        if (error) {
            logger.error('[HistoricalStorage] updateSyncProgress error:', error);
            return { success: false, error: error.message };
        }

        return { success: true };

    } catch (err) {
        return { success: false, error: err.message };
    }
}

/**
 * Delete candles with optional filters (for clearing old data before re-sync)
 * @param {Object} options - { exchange, timeframe }
 */
async function deleteCandles({ exchange, timeframe } = {}) {
    const client = getSupabase();
    if (!client) return { success: false, error: 'Database not configured' };

    try {
        let query = client
            .from('historical_candles')
            .delete();

        // Add filters
        if (exchange) {
            query = query.eq('exchange', exchange);
        }
        if (timeframe) {
            query = query.eq('timeframe', timeframe);
        }

        // If no filters, we need at least one condition (delete all)
        if (!exchange && !timeframe) {
            // Delete ALL - use a condition that's always true
            query = query.gte('id', '00000000-0000-0000-0000-000000000000');
        }

        const { data, error, count } = await query.select('id');

        if (error) {
            logger.error('[HistoricalStorage] deleteCandles error:', error);
            return { success: false, error: error.message };
        }

        logger.info(`[HistoricalStorage] Deleted ${data?.length || 0} candles${exchange ? ` for ${exchange}` : ''}${timeframe ? ` ${timeframe}` : ''}`);
        return { success: true, deleted: data?.length || 0 };

    } catch (err) {
        logger.error('[HistoricalStorage] deleteCandles exception:', err);
        return { success: false, error: err.message };
    }
}

/**
 * =======================================================================
 * EXPORTS
 * =======================================================================
 */

module.exports = {
    // Core operations
    upsertCandles,
    getCandles,
    getLatestTimestamp,
    getEarliestTimestamp,
    hasDataForRange,
    getDataCoverage,
    deleteCandles,

    // Sync progress
    getSyncProgress,
    updateSyncProgress,

    // Client access
    getSupabase
};
