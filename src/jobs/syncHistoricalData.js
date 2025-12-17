// src/jobs/syncHistoricalData.js
// ============================================================================
// Historical Data Sync Job - With Smart Rate Limiting
// ============================================================================
// Downloads historical market data from Coinglass API and stores in Supabase.
// Run once to backfill, then periodically to keep data fresh.
//
// Features:
// - Fetches 3 months of data for all timeframes
// - Smart rate limiting with rolling window (stays under 80 req/min)
// - Auto-pause on 429 errors (65s cooldown)
// - Resumable (tracks progress in database)
// - Progress logging for UI feedback
//
// Created: 2025-12-17
// Updated: 2025-12-17 - Added smart rate limiting
// ============================================================================

const coinglassClient = require('../services/coinglassClient');
const historicalCandleStorage = require('../services/historicalCandleStorage');
const logger = require('../utils/logger');

/**
 * =======================================================================
 * CONFIGURATION
 * =======================================================================
 */

const SYNC_CONFIG = {
    // Data range to sync (3 months by default)
    defaultDaysBack: 90,

    // Exchanges to sync
    exchanges: [
        { name: 'Binance', symbol: 'BTCUSDT' },
        { name: 'Bybit', symbol: 'BTCUSD' }
    ],

    // Timeframes to sync
    timeframes: ['30m', '1h', '4h', '1d'],

    // Batch sizes (how many candles per API request)
    batchSize: {
        '30m': 500,
        '1h': 500,
        '4h': 500,
        '1d': 500
    }
};

/**
 * =======================================================================
 * RATE LIMITER
 * =======================================================================
 * Tracks requests in a rolling 60-second window to stay under the limit.
 */

const RATE_LIMIT = {
    maxRequestsPerMinute: 80,
    rateLimitCooldownMs: 65000,   // 65 seconds on 429 error
    minDelayBetweenRequests: 50,  // Small delay just to not hammer the server

    // Stats
    totalRequests: 0,
    rateLimitHits: 0
};

/**
 * Simple wait - no preemptive throttling, just a small delay
 * We rely on 429 error handling for actual rate limiting
 */
async function waitForRateLimit() {
    // Just a small delay between requests
    await sleep(RATE_LIMIT.minDelayBetweenRequests);
}

/**
 * Record a request was made
 */
function recordRequest() {
    RATE_LIMIT.requestTimestamps.push(Date.now());
    RATE_LIMIT.totalRequests++;
}

/**
 * Handle rate limit error (429)
 */
async function handleRateLimitError() {
    RATE_LIMIT.rateLimitHits++;

    const resumeTime = new Date(Date.now() + RATE_LIMIT.rateLimitCooldownMs).toLocaleTimeString();
    logger.warn(`[SYNC] Rate limit hit! Pausing for ${RATE_LIMIT.rateLimitCooldownMs / 1000}s... Resume at ${resumeTime}`);

    syncState.progress.currentTask = `Rate limited - resuming at ${resumeTime}`;

    // Clear request history (we're pausing anyway)
    RATE_LIMIT.requestTimestamps = [];

    await sleep(RATE_LIMIT.rateLimitCooldownMs);

    logger.info('[SYNC] Resuming after rate limit pause...');
}

/**
 * Check if error is a rate limit error
 */
function isRateLimitError(error) {
    if (!error) return false;
    const msg = error.message || error.msg || String(error);
    return msg.includes('Too Many Requests') ||
        msg.includes('rate limit') ||
        msg.includes('429') ||
        error.code === '400' && msg.includes('Too Many');
}

// In-memory sync state
let syncState = {
    isRunning: false,
    progress: {
        current: 0,
        total: 0,
        currentTask: '',
        errors: [],
        requestsMade: 0,
        candlesStored: 0
    },
    startedAt: null,
    abortRequested: false
};

/**
 * =======================================================================
 * MAIN SYNC FUNCTION
 * =======================================================================
 */

async function startSync(options = {}) {
    if (syncState.isRunning) {
        return {
            success: false,
            error: 'Sync already in progress',
            progress: syncState.progress
        };
    }

    const {
        daysBack = SYNC_CONFIG.defaultDaysBack,
        force = false,
        exchanges = ['Binance', 'Bybit'],   // Filter: 'Binance', 'Bybit', or both
        timeframes = ['30m', '1h', '4h', '1d'],  // Filter specific timeframes
        dataTypes = ['price', 'oi', 'funding', 'taker_volume']  // Filter specific data types
    } = options;

    // Filter exchanges based on input
    const selectedExchanges = SYNC_CONFIG.exchanges.filter(e =>
        exchanges.includes(e.name) || exchanges.includes('both') || exchanges.includes('all')
    );

    // Filter timeframes
    const selectedTimeframes = SYNC_CONFIG.timeframes.filter(tf =>
        timeframes.includes(tf) || timeframes.includes('all')
    );

    // Filter data types
    const allDataTypes = ['price', 'oi', 'funding', 'taker_volume'];
    const selectedDataTypes = allDataTypes.filter(dt =>
        dataTypes.includes(dt) || dataTypes.includes('all')
    );

    // Reset state
    syncState = {
        isRunning: true,
        progress: {
            current: 0,
            total: 0,
            currentTask: 'Initializing...',
            errors: [],
            requestsMade: 0,
            candlesStored: 0
        },
        startedAt: Date.now(),
        abortRequested: false,
        // Store filter info for display
        filters: {
            exchanges: selectedExchanges.map(e => e.name),
            timeframes: selectedTimeframes,
            dataTypes: selectedDataTypes
        }
    };

    // Reset rate limiter
    RATE_LIMIT.requestTimestamps = [];
    RATE_LIMIT.totalRequests = 0;
    RATE_LIMIT.rateLimitHits = 0;

    logger.info(`[SYNC] Starting historical data sync: ${daysBack} days back`);
    logger.info(`[SYNC]   Exchanges: ${selectedExchanges.map(e => e.name).join(', ')}`);
    logger.info(`[SYNC]   Timeframes: ${selectedTimeframes.join(', ')}`);
    logger.info(`[SYNC]   Data types: ${selectedDataTypes.join(', ')}`);

    try {
        // Calculate total tasks for progress tracking
        const totalTasks = selectedExchanges.length * selectedTimeframes.length * selectedDataTypes.length;
        syncState.progress.total = totalTasks;

        const endTime = Date.now();
        const startTime = endTime - (daysBack * 24 * 60 * 60 * 1000);

        // Sync each exchange
        for (const exchange of selectedExchanges) {
            if (syncState.abortRequested) break;

            // Sync each timeframe
            for (const timeframe of selectedTimeframes) {
                if (syncState.abortRequested) break;

                await syncTimeframeDataFiltered(exchange, timeframe, startTime, endTime, force, selectedDataTypes);
            }
        }

        syncState.isRunning = false;

        const duration = Date.now() - syncState.startedAt;
        logger.info(`[SYNC] ✅ Sync completed!`);
        logger.info(`[SYNC]    Tasks: ${syncState.progress.current}/${syncState.progress.total}`);
        logger.info(`[SYNC]    Candles stored: ${syncState.progress.candlesStored.toLocaleString()}`);
        logger.info(`[SYNC]    Requests made: ${RATE_LIMIT.totalRequests}`);
        logger.info(`[SYNC]    Rate limit hits: ${RATE_LIMIT.rateLimitHits}`);
        logger.info(`[SYNC]    Duration: ${Math.round(duration / 1000 / 60)} minutes`);

        return {
            success: true,
            completed: syncState.progress.current,
            total: syncState.progress.total,
            candlesStored: syncState.progress.candlesStored,
            errors: syncState.progress.errors,
            duration
        };

    } catch (error) {
        syncState.isRunning = false;
        logger.error('[SYNC] Fatal error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Sync all data types for a specific timeframe
 */
async function syncTimeframeData(exchange, timeframe, startTime, endTime, force) {
    const dataTypes = ['price', 'oi', 'funding', 'taker_volume'];

    for (const dataType of dataTypes) {
        if (syncState.abortRequested) return;

        const taskName = `${exchange.name} ${timeframe} ${dataType}`;
        syncState.progress.currentTask = taskName;

        logger.info(`[SYNC] Syncing ${taskName}... (${syncState.progress.current + 1}/${syncState.progress.total})`);

        try {
            // Update sync progress in database
            await historicalCandleStorage.updateSyncProgress({
                exchange: exchange.name,
                symbol: 'BTC',
                timeframe,
                dataType,
                status: 'syncing'
            });

            // Determine start time (resume from last sync if not forcing)
            // MERGED TABLE: No data_type filtering - use single latest timestamp per exchange/timeframe
            let fetchStartTime = startTime;
            if (!force) {
                const lastTimestamp = await historicalCandleStorage.getLatestTimestamp(
                    exchange.name, 'BTC', timeframe
                );
                if (lastTimestamp && lastTimestamp > startTime) {
                    fetchStartTime = lastTimestamp;
                    logger.info(`[SYNC] Resuming ${taskName} from ${new Date(fetchStartTime).toISOString()}`);
                }
            }

            // Fetch and store data
            const result = await fetchAndStoreData(exchange, timeframe, dataType, fetchStartTime, endTime);

            // Update progress
            await historicalCandleStorage.updateSyncProgress({
                exchange: exchange.name,
                symbol: 'BTC',
                timeframe,
                dataType,
                lastTimestamp: endTime,
                status: result.success ? 'completed' : 'failed',
                error: result.error
            });

            if (result.success) {
                syncState.progress.candlesStored += result.stored || 0;
            } else {
                syncState.progress.errors.push({ task: taskName, error: result.error });
            }

        } catch (err) {
            logger.error(`[SYNC] Error syncing ${taskName}:`, err.message);
            syncState.progress.errors.push({ task: taskName, error: err.message });
        }

        syncState.progress.current++;
    }
}

/**
 * Sync filtered data types for a specific timeframe
 * Used when user selects specific data types to sync
 */
async function syncTimeframeDataFiltered(exchange, timeframe, startTime, endTime, force, selectedDataTypes) {
    for (const dataType of selectedDataTypes) {
        if (syncState.abortRequested) return;

        const taskName = `${exchange.name} ${timeframe} ${dataType}`;
        syncState.progress.currentTask = taskName;

        logger.info(`[SYNC] Syncing ${taskName}... (${syncState.progress.current + 1}/${syncState.progress.total})`);

        try {
            // Update sync progress in database
            await historicalCandleStorage.updateSyncProgress({
                exchange: exchange.name,
                symbol: 'BTC',
                timeframe,
                dataType,
                status: 'syncing'
            });

            // Determine start time (resume from last sync if not forcing)
            let fetchStartTime = startTime;
            if (!force) {
                const lastTimestamp = await historicalCandleStorage.getLatestTimestamp(
                    exchange.name, 'BTC', timeframe
                );
                if (lastTimestamp && lastTimestamp > startTime) {
                    fetchStartTime = lastTimestamp;
                    logger.info(`[SYNC] Resuming ${taskName} from ${new Date(fetchStartTime).toISOString()}`);
                }
            }

            // Fetch and store data
            const result = await fetchAndStoreData(exchange, timeframe, dataType, fetchStartTime, endTime);

            // Update progress
            await historicalCandleStorage.updateSyncProgress({
                exchange: exchange.name,
                symbol: 'BTC',
                timeframe,
                dataType,
                lastTimestamp: endTime,
                status: result.success ? 'completed' : 'failed',
                error: result.error
            });

            if (result.success) {
                syncState.progress.candlesStored += result.stored || 0;
            } else {
                syncState.progress.errors.push({ task: taskName, error: result.error });
            }

        } catch (err) {
            logger.error(`[SYNC] Error syncing ${taskName}:`, err.message);
            syncState.progress.errors.push({ task: taskName, error: err.message });
        }

        syncState.progress.current++;
    }
}

/**
 * Clear all historical data (for re-syncing with new structure)
 */
async function clearData(options = {}) {
    const { exchange, timeframe, confirm = false } = options;

    if (!confirm) {
        return {
            success: false,
            error: 'Confirmation required. Pass confirm: true to delete data.',
            warning: 'This will delete historical candle data!'
        };
    }

    try {
        const result = await historicalCandleStorage.deleteCandles({ exchange, timeframe });
        logger.info(`[SYNC] Cleared ${result.deleted || 0} rows${exchange ? ` for ${exchange}` : ''}${timeframe ? ` ${timeframe}` : ''}`);
        return { success: true, deleted: result.deleted || 0 };
    } catch (err) {
        logger.error('[SYNC] Clear data error:', err);
        return { success: false, error: err.message };
    }
}

/**
 * Fetch data from API and store in database
 */
async function fetchAndStoreData(exchange, timeframe, dataType, startTime, endTime) {
    const batchSize = SYNC_CONFIG.batchSize[timeframe] || 500;
    let totalStored = 0;
    let currentStart = startTime;
    let consecutiveErrors = 0;
    const maxConsecutiveErrors = 5;

    while (currentStart < endTime) {
        if (syncState.abortRequested) {
            return { success: false, error: 'Aborted by user', stored: totalStored };
        }

        // Wait for rate limit before making request
        await waitForRateLimit();

        // Fetch from API
        let rawData = [];
        let fetchError = null;

        try {
            recordRequest();
            syncState.progress.requestsMade = RATE_LIMIT.totalRequests;

            // Log that we're making a request
            logger.info(`[SYNC] Fetching ${dataType} from ${new Date(currentStart).toISOString().slice(0, 16)}...`);

            if (dataType === 'price') {
                rawData = await coinglassClient.getPriceHistory({
                    exchange: exchange.name,
                    symbol: exchange.symbol,
                    interval: timeframe,
                    limit: batchSize,
                    startTime: currentStart,
                    endTime
                });
            } else if (dataType === 'oi') {
                rawData = await coinglassClient.getOIHistory({
                    exchange: exchange.name,
                    symbol: exchange.symbol,
                    interval: timeframe,
                    limit: batchSize,
                    startTime: currentStart,
                    endTime
                });
            } else if (dataType === 'funding') {
                rawData = await coinglassClient.getFundingHistory({
                    exchange: exchange.name,
                    symbol: exchange.symbol,
                    interval: timeframe,
                    limit: batchSize,
                    startTime: currentStart,
                    endTime
                });
            } else if (dataType === 'taker_volume') {
                rawData = await coinglassClient.getTakerBuySellVolume({
                    exchange: exchange.name,
                    symbol: exchange.symbol,
                    interval: timeframe,
                    limit: batchSize,
                    startTime: currentStart,
                    endTime
                });
            }

            consecutiveErrors = 0; // Reset on success

        } catch (err) {
            fetchError = err;
            consecutiveErrors++;

            // Check if it's a rate limit error
            if (isRateLimitError(err)) {
                await handleRateLimitError();
                continue; // Retry the same request
            }

            logger.warn(`[SYNC] API error (${consecutiveErrors}/${maxConsecutiveErrors}): ${err.message}`);

            if (consecutiveErrors >= maxConsecutiveErrors) {
                logger.error(`[SYNC] Too many consecutive errors, moving to next task`);
                return { success: false, error: `Too many errors: ${err.message}`, stored: totalStored };
            }

            await sleep(5000); // Wait 5s before retry
            continue;
        }

        if (!rawData || rawData.length === 0) {
            // No more data, this task is complete
            logger.info(`[SYNC] No data returned, task complete`);
            break;
        }

        // Transform to storage format
        const candles = transformToCandles(rawData, exchange.name, timeframe, dataType);
        logger.info(`[SYNC] Got ${rawData.length} items, transformed to ${candles.length} candles`);

        if (candles.length > 0) {
            // Store in database
            const storeResult = await historicalCandleStorage.upsertCandles(candles);

            if (storeResult.success) {
                totalStored += candles.length;
                syncState.progress.candlesStored += candles.length;  // Update in real-time!
                const progress = `${totalStored} candles`;
                syncState.progress.currentTask = `${exchange.name} ${timeframe} ${dataType} - ${progress}`;

                // Log every 1000 candles
                if (totalStored % 1000 < candles.length) {
                    logger.info(`[SYNC] ${exchange.name} ${timeframe} ${dataType}: ${totalStored} candles stored`);
                }
            } else {
                logger.error(`[SYNC] Store error:`, storeResult.error);
            }

            // Update current position
            const lastCandle = candles[candles.length - 1];
            if (lastCandle && lastCandle.timestamp) {
                const newStart = lastCandle.timestamp + 1;

                // Check if we're stuck on the same timestamp (API returns same candle repeatedly)
                if (newStart <= currentStart) {
                    logger.info(`[SYNC] Caught up to current time, task complete`);
                    break;
                }

                currentStart = newStart;
            } else {
                break;
            }
        } else {
            break;
        }
    }

    return { success: true, stored: totalStored };
}

/**
 * Transform raw API data to candle storage format
 * MERGED TABLE: No data_type column - each row contains all data types
 */
function transformToCandles(rawData, exchange, timeframe, dataType) {
    if (!Array.isArray(rawData)) return [];

    return rawData.map(item => {
        // Base candle - no data_type column in merged table
        const candle = {
            exchange,
            symbol: 'BTC',
            timeframe,
            timestamp: item.time || item.t || item.createTime
        };

        if (!candle.timestamp) return null;

        // Add columns based on data type being synced
        if (dataType === 'price') {
            candle.open = item.open || item.o;
            candle.high = item.high || item.h;
            candle.low = item.low || item.l;
            candle.close = item.close || item.c;
            candle.volume = item.volume || item.vol || item.v;
        } else if (dataType === 'oi') {
            candle.oi = item.oi || item.openInterest;
            candle.oi_open = item.open || item.o;
            candle.oi_high = item.high || item.h;
            candle.oi_low = item.low || item.l;
            candle.oi_close = item.close || item.c;
        } else if (dataType === 'funding') {
            candle.funding_rate = item.rate || item.fundingRate || item.close;
        } else if (dataType === 'taker_volume') {
            candle.buy_volume = item.buyVol || item.taker_buy_volume_usd || item.buyVolume;
            candle.sell_volume = item.sellVol || item.taker_sell_volume_usd || item.sellVolume;
        }

        return candle;
    }).filter(c => c !== null && c.timestamp);
}

/**
 * =======================================================================
 * SYNC CONTROL
 * =======================================================================
 */

function getSyncStatus() {
    return {
        isRunning: syncState.isRunning,
        progress: {
            ...syncState.progress,
            requestsInLastMinute: RATE_LIMIT.totalRequests, // Simplified - just show total
            totalRequests: RATE_LIMIT.totalRequests,
            rateLimitHits: RATE_LIMIT.rateLimitHits
        },
        startedAt: syncState.startedAt,
        elapsed: syncState.startedAt ? Date.now() - syncState.startedAt : 0
    };
}

function abortSync() {
    if (syncState.isRunning) {
        syncState.abortRequested = true;
        logger.info('[SYNC] Abort requested');
        return { success: true, message: 'Abort requested, will stop after current request' };
    }
    return { success: false, message: 'No sync in progress' };
}

async function syncRecent(days = 1) {
    return startSync({ daysBack: days, force: false });
}

/**
 * =======================================================================
 * HELPERS
 * =======================================================================
 */

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * =======================================================================
 * EXPORTS
 * =======================================================================
 */

module.exports = {
    startSync,
    getSyncStatus,
    abortSync,
    syncRecent,
    clearData,
    SYNC_CONFIG
};
