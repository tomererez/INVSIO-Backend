// coinglassClient.js
// Single source of truth for ALL Coinglass API communication
// Handles: headers, params, retries, normalization, structured error formatting

const axios = require('axios');

const BASE_URL = 'https://open-api-v4.coinglass.com/api';
const API_KEY = process.env.COINGLASS_API_KEY;

// Timeout and retry configuration
const CONFIG = {
    timeout: 30000,              // 30 seconds
    maxRetries: 3,               // Max retry attempts for transient errors
    retryDelayMs: 2000,          // Base delay between retries
    retryBackoffMultiplier: 1.5, // Exponential backoff
    rateLimitCooldownMs: 30000   // Cooldown after 429 rate limit
};

// Request counter for logging
let requestCounter = 0;

/**
 * =============================================================================
 * STRUCTURED ERROR FORMATTING
 * =============================================================================
 * FIXES the garbled char array logging bug by ensuring all errors are objects
 */

/**
 * Format an error for structured logging (never spreads strings)
 * @param {Error|string} error - The error to format
 * @param {Object} context - Additional context
 * @returns {Object} Structured error object
 */
function formatError(error, context = {}) {
    // If it's already an object with toLogObject method, use it
    if (error && typeof error.toLogObject === 'function') {
        return error.toLogObject();
    }

    // Extract message safely - NEVER spread strings
    let message;
    if (typeof error === 'string') {
        message = error;
    } else if (error instanceof Error) {
        message = error.message;
    } else if (error && typeof error === 'object') {
        message = error.message || error.msg || JSON.stringify(error);
    } else {
        message = String(error);
    }

    return {
        message,
        name: error?.name || 'Error',
        code: error?.code || null,
        status: error?.response?.status || null,
        ...context
    };
}

/**
 * Generate unique request ID for tracing
 */
function generateRequestId() {
    return `cg-${Date.now()}-${++requestCounter}`;
}

/**
 * =============================================================================
 * CORE REQUEST WRAPPER
 * =============================================================================
 */

/**
 * Make a GET request to Coinglass API with retries and normalization
 * 
 * @param {string} endpoint - API endpoint (e.g., '/futures/price/history')
 * @param {Object} params - Query parameters
 * @param {Object} options - Additional options
 * @returns {Promise<Array>} Normalized response data (always an array)
 */
async function request(endpoint, params = {}, options = {}) {
    const requestId = generateRequestId();
    const startTime = Date.now();

    const { retries = CONFIG.maxRetries, silent = false } = options;

    // Build request config
    const requestConfig = {
        method: 'GET',
        url: `${BASE_URL}${endpoint}`,
        params: cleanParams(params),
        headers: {
            'accept': 'application/json',
            'CG-API-KEY': API_KEY
        },
        timeout: CONFIG.timeout
    };


    let lastError = null;

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const response = await axios(requestConfig);
            const duration = Date.now() - startTime;

            // Validate response structure
            if (!response.data) {
                throw new Error('Empty response from Coinglass');
            }

            // Check for API-level errors (rate limit comes here with code '400')
            if (response.data.code !== '0') {
                const apiError = new Error(response.data.msg || 'Coinglass API error');
                apiError.code = response.data.code;

                // Check if it's a rate limit error - throw it so caller can handle
                if (response.data.msg?.includes('Too Many Requests') ||
                    response.data.msg?.includes('rate limit')) {
                    apiError.isRateLimit = true;
                    throw apiError;
                }

                throw apiError;
            }

            // Log slow requests
            if (duration > 5000 && !silent) {
                console.warn(`⏱️ Slow API call [${requestId}]: ${endpoint} took ${duration}ms`);
            }

            // Return normalized data (always array)
            return normalizeResponse(response.data.data);

        } catch (error) {
            lastError = error;
            const duration = Date.now() - startTime;

            // Handle rate limiting (429 HTTP status or API-level rate limit)
            if (error.response?.status === 429 || error.isRateLimit) {
                // Log but DON'T swallow - throw it up so sync job can pause properly
                if (!silent) {
                    console.error('❌ Coinglass request failed:', formatError(error, {
                        requestId,
                        endpoint,
                        params: requestConfig.params,
                        attempt,
                        duration
                    }));
                }
                // Throw with flag so caller knows it's a rate limit
                const rateLimitError = new Error('Too Many Requests');
                rateLimitError.isRateLimit = true;
                throw rateLimitError;
            }

            // Handle timeout
            if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
                console.warn(`⏰ Timeout [${requestId}]: ${endpoint} after ${duration}ms (attempt ${attempt}/${retries})`);
                if (attempt < retries) {
                    await sleep(CONFIG.retryDelayMs * Math.pow(CONFIG.retryBackoffMultiplier, attempt - 1));
                    continue;
                }
            }

            // Handle transient network errors
            if (isTransientError(error) && attempt < retries) {
                console.warn(`🔄 Retrying [${requestId}]: ${endpoint} (attempt ${attempt}/${retries})`);
                await sleep(CONFIG.retryDelayMs * Math.pow(CONFIG.retryBackoffMultiplier, attempt - 1));
                continue;
            }

            // Log final error with structured format
            if (!silent) {
                console.error('❌ Coinglass request failed:', formatError(error, {
                    requestId,
                    endpoint,
                    params: requestConfig.params,
                    attempt,
                    duration
                }));
            }

            break;
        }
    }

    // Return empty array on failure (consistent with previous behavior for non-rate-limit errors)
    // Caller can check .length to detect failure
    return [];
}

/**
 * =============================================================================
 * RESPONSE NORMALIZATION
 * =============================================================================
 */

/**
 * Normalize API response to consistent format
 * @param {any} data - Raw response data
 * @returns {Array} Normalized array
 */
function normalizeResponse(data) {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (typeof data === 'object') {
        // Some endpoints return { list: [...] } or { data: [...] }
        if (Array.isArray(data.list)) return data.list;
        if (Array.isArray(data.data)) return data.data;
    }
    return [];
}

/**
 * Clean params object - remove null/undefined values
 * @param {Object} params - Raw params
 * @returns {Object} Cleaned params
 */
function cleanParams(params) {
    const cleaned = {};
    for (const [key, value] of Object.entries(params)) {
        if (value !== null && value !== undefined && value !== '') {
            cleaned[key] = value;
        }
    }
    return cleaned;
}

/**
 * Check if error is transient (worth retrying)
 */
function isTransientError(error) {
    if (!error) return false;

    // Network errors
    if (error.code === 'ECONNRESET' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
        return true;
    }

    // Server errors (5xx)
    if (error.response?.status >= 500) {
        return true;
    }

    return false;
}

/**
 * Sleep utility
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * =============================================================================
 * DATA FETCHERS (Raw - no business logic)
 * =============================================================================
 * These are thin wrappers that call the core request function.
 * Business logic (windowing, validation, etc.) belongs in the service layer.
 */

/**
 * Fetch price OHLC history
 * @param {Object} params - { exchange, symbol, interval, limit, startTime?, endTime? }
 * @returns {Promise<Array>} Price candle data
 */
async function getPriceHistory(params) {
    const { exchange, symbol, interval, limit, startTime, endTime } = params;

    return request('/futures/price/history', {
        exchange,
        symbol,
        interval,
        limit,
        start_time: startTime,
        end_time: endTime
    });
}

/**
 * Fetch open interest OHLC history
 * @param {Object} params - { exchange, symbol, interval, limit, startTime?, endTime? }
 * @returns {Promise<Array>} OI candle data
 */
async function getOIHistory(params) {
    const { exchange, symbol, interval, limit, startTime, endTime } = params;

    return request('/futures/open-interest/history', {
        exchange,
        symbol,
        interval,
        limit,
        start_time: startTime,
        end_time: endTime
    });
}

/**
 * Fetch funding rate history
 * @param {Object} params - { exchange, symbol, interval, limit, startTime?, endTime? }
 * @returns {Promise<Array>} Funding rate data
 */
async function getFundingHistory(params) {
    const { exchange, symbol, interval, limit, startTime, endTime } = params;

    return request('/futures/funding-rate/history', {
        exchange,
        symbol,
        interval,
        limit,
        start_time: startTime,
        end_time: endTime
    });
}

/**
 * Fetch taker buy/sell volume (for CVD calculation)
 * @param {Object} params - { exchange, symbol, interval, limit, startTime?, endTime? }
 * @returns {Promise<Array>} Taker volume data
 */
async function getTakerBuySellVolume(params) {
    const { exchange, symbol, interval, limit, startTime, endTime } = params;

    return request('/futures/v2/taker-buy-sell-volume/history', {
        exchange,
        symbol,
        interval,
        limit,
        start_time: startTime,
        end_time: endTime
    });
}

/**
 * =============================================================================
 * EXPORTS
 * =============================================================================
 */
module.exports = {
    // Core
    request,
    formatError,

    // Data fetchers
    getPriceHistory,
    getOIHistory,
    getFundingHistory,
    getTakerBuySellVolume,

    // Config (for external reference)
    CONFIG
};
