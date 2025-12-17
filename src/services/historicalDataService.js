// historicalDataService.js
// REPLAY/BACKTEST data fetching with time-windowed queries
// ALWAYS uses end_time = aligned asOfTimestamp (no lookahead)
//
// Phase 10: Now supports LOCAL DATA from historical_candles table
// When local data is available, uses database instead of API (instant, unlimited)

const coinglassClient = require('./coinglassClient');
const {
    INTERVAL_CONFIG,
    intervalToMs,
    alignEndTimeToLastClosedCandle,
    alignStartTimeToBoundary,
    computeLookbackWindowMs,
    getIntervalConfig,
    getCVDApiInterval,
    validateCandleSeries,
    InsufficientDataError,
    LookaheadViolationError
} = require('./dataUtils');

const logger = require('../utils/logger');

// Lazy-load to avoid circular dependencies
let historicalCandleStorage = null;
function getLocalStorage() {
    if (!historicalCandleStorage) {
        try {
            historicalCandleStorage = require('./historicalCandleStorage');
        } catch (e) {
            logger.debug('[HistoricalData] Local storage not available:', e.message);
        }
    }
    return historicalCandleStorage;
}

/**
 * =============================================================================
 * LOCAL DATA CONFIGURATION
 * =============================================================================
 */

const LOCAL_DATA_CONFIG = {
    // If true, prefer local data when available
    enabled: true,

    // If true, require local data (fail if not available)
    // If false, fall back to API when local data is missing
    required: false,

    // Minimum candles required in local data to use it
    minCandlesRequired: 50
};

/**
 * =============================================================================
 * LOCAL DATA HELPERS
 * =============================================================================
 */

/**
 * Try to get price data from local storage
 * Returns null if not available or insufficient
 */
async function getLocalPriceData(exchange, symbol, interval, startTime, endTime, minCandles) {
    const storage = getLocalStorage();
    if (!storage || !LOCAL_DATA_CONFIG.enabled) return null;

    try {
        const candles = await storage.getCandles({
            exchange,
            symbol: symbol.replace('USDT', '').replace('USD', ''), // Normalize to BTC
            timeframe: interval,
            startTime,
            endTime
        });

        if (candles.length >= minCandles) {
            logger.debug(`[LOCAL] Got ${candles.length} price candles from database (need ${minCandles})`);

            // Transform database format to expected format
            return candles.map(c => ({
                time: c.timestamp,
                open: Number(c.open),
                high: Number(c.high),
                low: Number(c.low),
                close: Number(c.close),
                volume: Number(c.volume || 0),
                price: Number(c.close)
            })).filter(c => c.open && c.close); // Filter out incomplete candles
        }

        logger.debug(`[LOCAL] Insufficient local data: ${candles.length} < ${minCandles}`);
        return null;

    } catch (err) {
        logger.debug(`[LOCAL] Error fetching local data:`, err.message);
        return null;
    }
}

/**
 * Try to get OI data from local storage
 */
async function getLocalOIData(exchange, symbol, interval, startTime, endTime, minCandles) {
    const storage = getLocalStorage();
    if (!storage || !LOCAL_DATA_CONFIG.enabled) return null;

    try {
        const candles = await storage.getCandles({
            exchange,
            symbol: symbol.replace('USDT', '').replace('USD', ''),
            timeframe: interval,
            startTime,
            endTime
        });

        // Filter to only candles with OI data
        const oiCandles = candles.filter(c => c.oi || c.oi_close);

        // Info logging for debugging
        logger.info(`[LOCAL-OI] ${exchange}/${interval}: ${candles.length} total candles, ${oiCandles.length} with OI data (need ${minCandles})`);

        if (oiCandles.length >= minCandles) {
            return oiCandles.map(c => ({
                time: c.timestamp,
                open: Number(c.oi_open || c.oi),
                high: Number(c.oi_high || c.oi),
                low: Number(c.oi_low || c.oi),
                close: Number(c.oi_close || c.oi),
                oi: Number(c.oi_close || c.oi)
            })).filter(c => c.oi);
        }

        return null;

    } catch (err) {
        logger.error(`[LOCAL-OI] Error:`, err.message);
        return null;
    }
}

/**
 * Try to get funding data from local storage
 */
async function getLocalFundingData(exchange, symbol, interval, startTime, endTime, minCandles) {
    const storage = getLocalStorage();
    if (!storage || !LOCAL_DATA_CONFIG.enabled) return null;

    try {
        const candles = await storage.getCandles({
            exchange,
            symbol: symbol.replace('USDT', '').replace('USD', ''),
            timeframe: interval,
            startTime,
            endTime
        });

        // Filter to candles with funding data
        const fundingCandles = candles.filter(c => c.funding_rate !== null && c.funding_rate !== undefined);

        if (fundingCandles.length >= Math.min(minCandles, 30)) {
            logger.debug(`[LOCAL] Got ${fundingCandles.length} funding candles from database`);

            return fundingCandles.map(c => ({
                time: c.timestamp,
                rate: Number(c.funding_rate),
                close: Number(c.funding_rate),
                funding_rate_avg_pct: Number(c.funding_rate * 100)
            }));
        }

        return null;

    } catch (err) {
        return null;
    }
}

/**
 * Try to get taker volume data from local storage (for CVD)
 */
async function getLocalTakerVolumeData(exchange, symbol, interval, startTime, endTime, minCandles) {
    const storage = getLocalStorage();
    if (!storage || !LOCAL_DATA_CONFIG.enabled) return null;

    try {
        const candles = await storage.getCandles({
            exchange,
            symbol: symbol.replace('USDT', '').replace('USD', ''),
            timeframe: interval,
            startTime,
            endTime
        });

        // Filter to candles with buy/sell volume
        const takerCandles = candles.filter(c => c.buy_volume !== null || c.sell_volume !== null);

        if (takerCandles.length >= Math.min(minCandles, 48)) {
            logger.debug(`[LOCAL] Got ${takerCandles.length} taker volume candles from database`);

            return takerCandles.map(c => ({
                time: c.timestamp,
                buyVol: Number(c.buy_volume || 0),
                sellVol: Number(c.sell_volume || 0)
            }));
        }

        return null;

    } catch (err) {
        return null;
    }
}

/**
 * =============================================================================
 * HISTORICAL DATA FETCHING (REPLAY ONLY)
 * =============================================================================
 * 
 * Key guarantees:
 * 1. end_time is ALWAYS aligned to last closed candle (no lookahead)
 * 2. Local data is checked first (instant, no API calls)
 * 3. Falls back to API if local data is insufficient
 * 4. Retry logic widens window on insufficient data
 * 5. Sanity checks validate candle series integrity
 */

/**
 * Fetch historical price data at a specific point in time.
 * 
 * @param {string} exchange - Exchange name (Binance, Bybit)
 * @param {string} symbol - Trading pair (BTCUSDT)
 * @param {string} interval - Candle interval (30m, 1h, 4h, 1d)
 * @param {number} asOfTimestamp - The "as of" timestamp (no data after this)
 * @param {Object} options - Optional overrides { minCandles, fetchBuffer, useLocalOnly }
 * @returns {Promise<Array>} Array of price candles, validated and filtered
 */
async function getPriceHistoryAt(exchange, symbol, interval, asOfTimestamp, options = {}) {
    const config = getIntervalConfig(interval);
    const { minCandles = config.minCandles, fetchBuffer = config.fetchBuffer, useLocalOnly = false } = options;

    // Align timestamps
    const endTimeAligned = alignEndTimeToLastClosedCandle(interval, asOfTimestamp);
    const intervalMs = intervalToMs(interval);
    const startTime = endTimeAligned - (intervalMs * (minCandles + fetchBuffer));

    // Try local data first
    const localData = await getLocalPriceData(exchange, symbol, interval, startTime, endTimeAligned, minCandles);
    if (localData && localData.length >= minCandles) {
        return localData;
    }

    // If local-only mode and no local data, throw error
    if (useLocalOnly || LOCAL_DATA_CONFIG.required) {
        throw new InsufficientDataError(interval, localData?.length || 0, minCandles, {
            exchange,
            symbol,
            reason: 'No local data available. Run data sync first.'
        });
    }

    // Fall back to API
    logger.debug(`[API] Falling back to Coinglass API for ${exchange} ${interval} price data`);

    let data = await fetchWithRetry(
        coinglassClient.getPriceHistory,
        { exchange, symbol, interval },
        endTimeAligned,
        minCandles,
        fetchBuffer,
        interval
    );

    // Transform to consistent format
    return transformPriceData(data);
}

/**
 * Fetch historical OI data at a specific point in time.
 */
async function getOIHistoryAt(exchange, symbol, interval, asOfTimestamp, options = {}) {
    const config = getIntervalConfig(interval);
    const { minCandles = config.minCandles, fetchBuffer = config.fetchBuffer, useLocalOnly = false } = options;

    const endTimeAligned = alignEndTimeToLastClosedCandle(interval, asOfTimestamp);
    const intervalMs = intervalToMs(interval);
    const startTime = endTimeAligned - (intervalMs * (minCandles + fetchBuffer));

    // Try local data first
    const localData = await getLocalOIData(exchange, symbol, interval, startTime, endTimeAligned, minCandles);
    if (localData && localData.length >= minCandles) {
        return localData;
    }

    // If local-only mode, throw error
    if (useLocalOnly || LOCAL_DATA_CONFIG.required) {
        throw new InsufficientDataError(interval, localData?.length || 0, minCandles, {
            exchange, symbol, reason: 'No local OI data available.'
        });
    }

    // Fall back to API
    let data = await fetchWithRetry(
        coinglassClient.getOIHistory,
        { exchange, symbol, interval },
        endTimeAligned,
        minCandles,
        fetchBuffer,
        interval
    );

    return transformOIData(data);
}

/**
 * Fetch historical funding rate data at a specific point in time.
 */
async function getFundingHistoryAt(exchange, symbol, interval, asOfTimestamp, options = {}) {
    const config = getIntervalConfig(interval);
    const { minCandles = Math.min(30, config.minCandles), fetchBuffer = 10, useLocalOnly = false } = options;

    const endTimeAligned = alignEndTimeToLastClosedCandle(interval, asOfTimestamp);
    const intervalMs = intervalToMs(interval);
    const startTime = endTimeAligned - (intervalMs * (minCandles + fetchBuffer));

    // Try local data first
    const localData = await getLocalFundingData(exchange, symbol, interval, startTime, endTimeAligned, minCandles);
    if (localData && localData.length >= Math.min(minCandles, 30)) {
        return localData;
    }

    // If local-only mode, throw error
    if (useLocalOnly || LOCAL_DATA_CONFIG.required) {
        throw new InsufficientDataError(interval, localData?.length || 0, minCandles, {
            exchange, symbol, reason: 'No local funding data available.'
        });
    }

    // Fall back to API
    let data = await fetchWithRetry(
        coinglassClient.getFundingHistory,
        { exchange, symbol, interval },
        endTimeAligned,
        minCandles,
        fetchBuffer,
        interval
    );

    return transformFundingData(data);
}

/**
 * Fetch historical taker volume data (for CVD) at a specific point in time.
 */
async function getTakerVolumeAt(exchange, symbol, interval, asOfTimestamp, options = {}) {
    const cvdInterval = getCVDApiInterval(interval);
    const config = getIntervalConfig(interval);
    const { minCandles = Math.min(48, config.minCandles), fetchBuffer = 15, useLocalOnly = false } = options;

    const endTimeAligned = alignEndTimeToLastClosedCandle(interval, asOfTimestamp);
    const intervalMs = intervalToMs(interval);
    const startTime = endTimeAligned - (intervalMs * (minCandles + fetchBuffer));

    // Try local data first
    const localData = await getLocalTakerVolumeData(exchange, symbol, interval, startTime, endTimeAligned, minCandles);
    if (localData && localData.length >= Math.min(minCandles, 48)) {
        return localData;
    }

    // If local-only mode, throw error
    if (useLocalOnly || LOCAL_DATA_CONFIG.required) {
        throw new InsufficientDataError(interval, localData?.length || 0, minCandles, {
            exchange, symbol, reason: 'No local taker volume data available.'
        });
    }

    // Fall back to API (CVD uses different interval format)
    let data = await fetchWithRetry(
        coinglassClient.getTakerBuySellVolume,
        { exchange, symbol, interval: cvdInterval },
        endTimeAligned,
        minCandles,
        fetchBuffer,
        interval
    );

    return data; // CVD data doesn't need transformation
}

/**
 * =============================================================================
 * FETCH WITH RETRY LOGIC
 * =============================================================================
 */

/**
 * Fetch data with retry on insufficient candles.
 * 
 * Retry strategy:
 * - Attempt 1: minCandles + buffer
 * - Attempt 2: minCandles + buffer*2 (widen window)
 * - Fail with InsufficientDataError if still not enough
 * 
 * @param {Function} fetchFn - The fetch function to call
 * @param {Object} baseParams - Base parameters (exchange, symbol, interval)
 * @param {number} endTimeAligned - Aligned end timestamp
 * @param {number} minCandles - Minimum candles required
 * @param {number} fetchBuffer - Buffer candles
 * @param {string} interval - For computing window
 * @returns {Promise<Array>} Fetched and validated data
 */
async function fetchWithRetry(fetchFn, baseParams, endTimeAligned, minCandles, fetchBuffer, interval) {
    const intervalMs = intervalToMs(interval);

    // Attempt 1: minCandles + buffer
    let attempt1CandleCount = minCandles + fetchBuffer;
    let startTime1 = alignStartTimeToBoundary(
        interval,
        endTimeAligned - computeLookbackWindowMs(interval, attempt1CandleCount)
    );

    logger.debug(`📊 Historical fetch [Attempt 1]: ${baseParams.interval} from ${new Date(startTime1).toISOString()} to ${new Date(endTimeAligned).toISOString()}`);

    let data = await fetchFn({
        ...baseParams,
        limit: attempt1CandleCount,
        startTime: startTime1,
        endTime: endTimeAligned
    });

    // Filter to ensure no lookahead
    data = filterToEndTime(data, endTimeAligned);

    // Validate series
    const validation1 = validateCandleSeries(data, interval, endTimeAligned);
    if (validation1.issues.length > 0) {
        logger.warn(`⚠️ Series validation issues [Attempt 1]:`, { issues: validation1.issues });
    }

    // Check if we have enough
    if (data.length >= minCandles) {
        logger.debug(`✅ Historical fetch success: got ${data.length} candles (need ${minCandles})`);
        return data;
    }

    // Attempt 2: Widen window (buffer * 2)
    logger.warn(`⚠️ Insufficient data [Attempt 1]: got ${data.length}, need ${minCandles}. Widening window...`);

    let attempt2CandleCount = minCandles + (fetchBuffer * 2);
    let startTime2 = alignStartTimeToBoundary(
        interval,
        endTimeAligned - computeLookbackWindowMs(interval, attempt2CandleCount)
    );

    data = await fetchFn({
        ...baseParams,
        limit: attempt2CandleCount,
        startTime: startTime2,
        endTime: endTimeAligned
    });

    // Filter again
    data = filterToEndTime(data, endTimeAligned);

    // Validate again
    const validation2 = validateCandleSeries(data, interval, endTimeAligned);
    if (validation2.issues.length > 0) {
        logger.warn(`⚠️ Series validation issues [Attempt 2]:`, { issues: validation2.issues });
    }

    // Final check
    if (data.length >= minCandles) {
        logger.info(`✅ Historical fetch success [Attempt 2]: got ${data.length} candles (need ${minCandles})`);
        return data;
    }

    // Still insufficient - throw detailed error
    throw new InsufficientDataError(interval, data.length, minCandles, {
        exchange: baseParams.exchange,
        symbol: baseParams.symbol,
        asOfTimestamp: endTimeAligned,
        startTimeUsed: startTime2,
        attempt: 2
    });
}

/**
 * Filter data to ensure no candles after endTime (strict lookahead prevention)
 */
function filterToEndTime(data, endTimeAligned) {
    if (!Array.isArray(data)) return [];

    return data.filter(candle => {
        const time = candle.time || candle.t || candle.timestamp;
        return time && time <= endTimeAligned;
    });
}

/**
 * =============================================================================
 * DATA TRANSFORMATION
 * =============================================================================
 * Transform raw Coinglass data to consistent format
 */

function transformPriceData(data) {
    return data.map(candle => ({
        time: candle.time,
        open: Number(candle.open),
        high: Number(candle.high),
        low: Number(candle.low),
        close: Number(candle.close),
        volume: Number(candle.volume_usd || 0),
        price: Number(candle.close)
    }));
}

function transformOIData(data) {
    return data.map(candle => ({
        time: candle.time,
        open: Number(candle.open || candle.o),
        high: Number(candle.high || candle.h),
        low: Number(candle.low || candle.l),
        close: Number(candle.close || candle.c),
        oi: Number(candle.close || candle.c)
    }));
}

function transformFundingData(data) {
    return data.map(candle => ({
        time: candle.time,
        open: Number(candle.open),
        high: Number(candle.high),
        low: Number(candle.low),
        close: Number(candle.close),
        rate: Number(candle.close),
        funding_rate_avg_pct: Number(candle.close * 100)
    }));
}

// Delay between API calls to stay under rate limit (80 req/min = ~750ms, use 2.5s for safety)
const RATE_LIMIT_DELAY_MS = 2500;

/**
 * Sleep utility for rate limiting
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch all historical data for an exchange at a specific point in time.
 * Uses SEQUENTIAL fetching with delays to respect rate limits.
 * 
 * @param {Object} params
 * @param {string} params.exchange - Exchange name
 * @param {string} params.symbol - Trading pair
 * @param {string[]} params.intervals - Intervals to fetch
 * @param {number} params.asOfTimestamp - The "as of" timestamp
 * @returns {Promise<Object>} { [interval]: { price, oi, funding, taker } }
 */
async function getHistoricalData(params) {
    const { exchange, symbol, intervals, asOfTimestamp } = params;

    const result = {};
    const endTimeAligned = alignEndTimeToLastClosedCandle(intervals[0], asOfTimestamp);

    logger.info(`📊 Fetching historical data for asOfTimestamp: ${new Date(asOfTimestamp).toISOString()}`);
    logger.info(`   Aligned end time: ${new Date(endTimeAligned).toISOString()}`);

    for (const interval of intervals) {
        const intervalEndTime = alignEndTimeToLastClosedCandle(interval, asOfTimestamp);

        try {
            // SEQUENTIAL fetching with delays to respect rate limits
            const price = await getPriceHistoryAt(exchange, symbol, interval, asOfTimestamp);
            await sleep(RATE_LIMIT_DELAY_MS);

            const oi = await getOIHistoryAt(exchange, symbol, interval, asOfTimestamp);
            await sleep(RATE_LIMIT_DELAY_MS);

            const funding = await getFundingHistoryAt(exchange, symbol, interval, asOfTimestamp);
            await sleep(RATE_LIMIT_DELAY_MS);

            const taker = await getTakerVolumeAt(exchange, symbol, interval, asOfTimestamp);
            await sleep(RATE_LIMIT_DELAY_MS);

            result[interval] = {
                price,
                oi,
                funding,
                taker,
                meta: {
                    exchange,
                    symbol,
                    interval,
                    asOfTimestamp,
                    endTimeAligned: intervalEndTime,
                    candlesCaptured: {
                        price: price.length,
                        oi: oi.length,
                        funding: funding.length,
                        taker: taker.length
                    }
                }
            };

            logger.info(`   ✅ ${interval}: ${price.length} price, ${oi.length} OI, ${funding.length} funding, ${taker.length} taker`);

        } catch (error) {
            // Log structured error
            logger.error(`❌ Failed to fetch ${interval} data:`, coinglassClient.formatError(error, {
                exchange,
                symbol,
                interval,
                asOfTimestamp
            }));

            // Re-throw to let caller handle
            throw error;
        }
    }

    return result;
}

/**
 * =============================================================================
 * EXPORTS
 * =============================================================================
 */
module.exports = {
    // Individual fetchers
    getPriceHistoryAt,
    getOIHistoryAt,
    getFundingHistoryAt,
    getTakerVolumeAt,

    // High-level fetcher
    getHistoricalData,

    // Utilities (re-export for convenience)
    alignEndTimeToLastClosedCandle,
    alignStartTimeToBoundary,

    // Error types
    InsufficientDataError,
    LookaheadViolationError
};
