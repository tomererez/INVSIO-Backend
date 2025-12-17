// dataUtils.js
// Shared utilities for interval configuration, timestamp alignment, and validation
// Used by both marketDataService (LIVE) and historicalDataService (REPLAY)

/**
 * =============================================================================
 * INTERVAL CONFIGURATION
 * =============================================================================
 * Single source of truth for all timeframe-related constants
 */
const INTERVAL_CONFIG = {
    '30m': {
        ms: 30 * 60 * 1000,           // 1,800,000 ms
        minCandles: 50,               // ~25 hours of context
        fetchBuffer: 20,              // Extra candles to fetch
        apiInterval: '30m',           // Coinglass API format
        description: '30 minute candles'
    },
    '1h': {
        ms: 60 * 60 * 1000,           // 3,600,000 ms
        minCandles: 168,              // 7 days of context
        fetchBuffer: 30,
        apiInterval: '1h',
        description: '1 hour candles'
    },
    '4h': {
        ms: 4 * 60 * 60 * 1000,       // 14,400,000 ms
        minCandles: 126,              // 3 weeks of context
        fetchBuffer: 20,
        apiInterval: '4h',
        description: '4 hour candles'
    },
    '1d': {
        ms: 24 * 60 * 60 * 1000,      // 86,400,000 ms
        minCandles: 50,               // 50 days of context (reduced from 60 to match available data)
        fetchBuffer: 10,
        apiInterval: '1d',
        description: '1 day candles'
    }
};

// CVD uses different API interval format
const CVD_API_INTERVALS = {
    '30m': 'm30',
    '1h': 'h1',
    '4h': 'h4',
    '1d': 'h24'
};

/**
 * =============================================================================
 * TIMESTAMP ALIGNMENT UTILITIES
 * =============================================================================
 * Critical for ensuring deterministic replay windows with no lookahead
 */

/**
 * Convert interval string to milliseconds
 * @param {string} interval - Interval string ('30m', '1h', '4h', '1d')
 * @returns {number} Milliseconds
 */
function intervalToMs(interval) {
    const config = INTERVAL_CONFIG[interval];
    if (!config) {
        throw new Error(`Unknown interval: ${interval}. Valid: ${Object.keys(INTERVAL_CONFIG).join(', ')}`);
    }
    return config.ms;
}

/**
 * Align a timestamp to the END of the LAST CLOSED candle for a given interval.
 * 
 * For replay/backtest: This ensures we only use data that was actually available
 * at asOfTimestamp (no lookahead).
 * 
 * Example for 4h interval at 14:47:
 *   - Current candle: 12:00-16:00 (not yet closed)
 *   - Last closed candle: 08:00-12:00
 *   - Returns: 12:00:00.000 (end of last closed candle = start of current)
 * 
 * @param {string} interval - Interval ('30m', '1h', '4h', '1d')
 * @param {number} asOfTimestamp - The "as of" timestamp in milliseconds
 * @returns {number} Aligned timestamp (end of last closed candle)
 */
function alignEndTimeToLastClosedCandle(interval, asOfTimestamp) {
    const intervalMs = intervalToMs(interval);

    // Floor to the start of the current candle
    const currentCandleStart = Math.floor(asOfTimestamp / intervalMs) * intervalMs;

    // The last CLOSED candle ended at currentCandleStart
    // (i.e., the candle from currentCandleStart - intervalMs to currentCandleStart)
    return currentCandleStart;
}

/**
 * Align a timestamp to a candle boundary (start of a candle).
 * Used for computing start_time for historical fetches.
 * 
 * @param {string} interval - Interval ('30m', '1h', '4h', '1d')
 * @param {number} timestamp - Timestamp to align
 * @returns {number} Aligned timestamp (start of candle containing this timestamp)
 */
function alignStartTimeToBoundary(interval, timestamp) {
    const intervalMs = intervalToMs(interval);
    return Math.floor(timestamp / intervalMs) * intervalMs;
}

/**
 * Compute the lookback window for historical data fetching.
 * 
 * @param {string} interval - Interval
 * @param {number} candleCount - Number of candles needed
 * @returns {number} Lookback window in milliseconds
 */
function computeLookbackWindowMs(interval, candleCount) {
    return intervalToMs(interval) * candleCount;
}

/**
 * Get interval config or throw if invalid
 * @param {string} interval - Interval string
 * @returns {Object} Interval config
 */
function getIntervalConfig(interval) {
    const config = INTERVAL_CONFIG[interval];
    if (!config) {
        throw new Error(`Unknown interval: ${interval}. Valid: ${Object.keys(INTERVAL_CONFIG).join(', ')}`);
    }
    return config;
}

/**
 * Get CVD API interval format
 * @param {string} interval - Standard interval
 * @returns {string} Coinglass CVD API interval format
 */
function getCVDApiInterval(interval) {
    return CVD_API_INTERVALS[interval] || 'h4';
}

/**
 * =============================================================================
 * DATA VALIDATION UTILITIES
 * =============================================================================
 */

/**
 * Validate that candle timestamps are properly spaced and don't exceed endTime.
 * 
 * @param {Array} candles - Array of candle data
 * @param {string} interval - Expected interval
 * @param {number} endTimeAligned - Aligned end timestamp
 * @returns {Object} { valid, issues[], lastCandleTime }
 */
function validateCandleSeries(candles, interval, endTimeAligned) {
    const result = {
        valid: true,
        issues: [],
        lastCandleTime: null,
        candleCount: candles?.length || 0
    };

    if (!candles || candles.length === 0) {
        result.valid = false;
        result.issues.push('No candle data received');
        return result;
    }

    const intervalMs = intervalToMs(interval);
    const maxAllowedGap = intervalMs * 2; // Allow up to 1 missing candle

    // Sort by time to ensure correct order
    const sorted = [...candles].sort((a, b) => {
        const timeA = a.time || a.t || a.timestamp || 0;
        const timeB = b.time || b.t || b.timestamp || 0;
        return timeA - timeB;
    });

    // Check last candle doesn't exceed endTime (lookahead check)
    const lastCandle = sorted[sorted.length - 1];
    const lastCandleTime = lastCandle.time || lastCandle.t || lastCandle.timestamp;
    result.lastCandleTime = lastCandleTime;

    if (lastCandleTime > endTimeAligned) {
        result.valid = false;
        result.issues.push(
            `LOOKAHEAD VIOLATION: Last candle time ${new Date(lastCandleTime).toISOString()} ` +
            `exceeds aligned end time ${new Date(endTimeAligned).toISOString()}`
        );
    }

    // Check for major gaps in the series
    let gapCount = 0;
    for (let i = 1; i < sorted.length; i++) {
        const prevTime = sorted[i - 1].time || sorted[i - 1].t || sorted[i - 1].timestamp;
        const currTime = sorted[i].time || sorted[i].t || sorted[i].timestamp;
        const gap = currTime - prevTime;

        if (gap > maxAllowedGap) {
            gapCount++;
            if (gapCount <= 3) { // Only report first 3 gaps
                result.issues.push(
                    `Gap at index ${i}: ${Math.round(gap / intervalMs)} candles missing ` +
                    `between ${new Date(prevTime).toISOString()} and ${new Date(currTime).toISOString()}`
                );
            }
        }
    }

    if (gapCount > 3) {
        result.issues.push(`... and ${gapCount - 3} more gaps`);
    }

    if (gapCount > 5) {
        result.valid = false;
        result.issues.push(`Series has too many gaps (${gapCount}), data may be unreliable`);
    }

    return result;
}

/**
 * =============================================================================
 * CUSTOM ERROR TYPES
 * =============================================================================
 */

/**
 * Error thrown when there's insufficient historical data
 */
class InsufficientDataError extends Error {
    constructor(interval, got, need, context = {}) {
        const message = `Insufficient data for ${interval}: got ${got} candles, need ${need}`;
        super(message);
        this.name = 'InsufficientDataError';
        this.interval = interval;
        this.got = got;
        this.need = need;
        this.context = context;
    }

    toLogObject() {
        return {
            message: this.message,
            interval: this.interval,
            got: this.got,
            need: this.need,
            context: this.context
        };
    }
}

/**
 * Error thrown when lookahead is detected (data after asOfTimestamp)
 */
class LookaheadViolationError extends Error {
    constructor(dataTime, asOfTime, context = {}) {
        const message = `Lookahead violation: data at ${new Date(dataTime).toISOString()} ` +
            `exceeds asOfTimestamp ${new Date(asOfTime).toISOString()}`;
        super(message);
        this.name = 'LookaheadViolationError';
        this.dataTime = dataTime;
        this.asOfTime = asOfTime;
        this.context = context;
    }

    toLogObject() {
        return {
            message: this.message,
            dataTime: this.dataTime,
            asOfTime: this.asOfTime,
            context: this.context
        };
    }
}

/**
 * =============================================================================
 * EXPORTS
 * =============================================================================
 */
module.exports = {
    // Config
    INTERVAL_CONFIG,
    CVD_API_INTERVALS,

    // Utilities
    intervalToMs,
    alignEndTimeToLastClosedCandle,
    alignStartTimeToBoundary,
    computeLookbackWindowMs,
    getIntervalConfig,
    getCVDApiInterval,

    // Validation
    validateCandleSeries,

    // Error types
    InsufficientDataError,
    LookaheadViolationError
};
