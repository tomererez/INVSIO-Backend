// src/backtest/replayRunner.js - Stage 3: Historical Replay Engine
// Provides zero-lookahead historical replay for backtesting narrative correctness
//
// Key Guarantees:
// - ZERO LOOKAHEAD: All data fetched is strictly <= asOfTimestamp
// - IDEMPOTENT: Same (batchId, asOfTimestamp, symbol) produces same result
// - RESUMABLE: Batch can be interrupted and resumed without duplicates
// - AUTO-SYNC: Automatically syncs edge data when encountering gaps

const { v4: uuidv4 } = require('uuid');
const historicalDataService = require('../services/historicalDataService');
const historicalCandleStorage = require('../services/historicalCandleStorage');
const coinglassClient = require('../services/coinglassClient');
const marketMetrics = require('../services/marketMetrics');
const stateStorage = require('../services/stateStorage');
const configService = require('../services/configService');
const logger = require('../utils/logger');
const cronControl = require('../utils/cronControl');
const { InsufficientDataError, alignEndTimeToLastClosedCandle } = require('../services/dataUtils');

// Lazy-load sync job to avoid circular dependency
let syncHistoricalData = null;
function getSyncJob() {
    if (!syncHistoricalData) {
        try {
            syncHistoricalData = require('../jobs/syncHistoricalData');
        } catch (e) {
            logger.warn('syncHistoricalData not available:', e.message);
        }
    }
    return syncHistoricalData;
}

// Lazy-load labeling job to avoid circular dependency
let outcomeLabelingJob = null;
function getLabelingJob() {
    if (!outcomeLabelingJob) {
        try {
            outcomeLabelingJob = require('./outcomeLabelingJob');
        } catch (e) {
            logger.warn('outcomeLabelingJob not available:', e.message);
        }
    }
    return outcomeLabelingJob;
}

/**
 * =======================================================================
 * CONFIGURATION
 * =======================================================================
 */

// Minimum window requirements per timeframe (in candles)
// These ensure the analyzer has enough lookback context
const WINDOW_REQUIREMENTS = {
    '30m': {
        minCandles: 50,      // ~25 hours of context
        fetchCandles: 100,   // Fetch extra to ensure enough after slicing
        intervalMs: 30 * 60 * 1000
    },
    '1h': {
        minCandles: 168,     // 7 days of context
        fetchCandles: 200,
        intervalMs: 60 * 60 * 1000
    },
    '4h': {
        minCandles: 126,     // 3 weeks of context
        fetchCandles: 150,
        intervalMs: 4 * 60 * 60 * 1000
    },
    '1d': {
        minCandles: 60,      // 60 days of context
        fetchCandles: 90,
        intervalMs: 24 * 60 * 60 * 1000
    }
};

// Rate limiting configuration
const RATE_LIMIT_CONFIG = {
    delayBetweenApiCalls: 2500,   // 2.5 seconds between Coinglass calls
    delayBetweenSamples: 5000,    // 5 seconds between full sample runs
    maxRetries: 3,
    retryBackoffMs: 5000,
    rateLimitCooldownMs: 30000    // 30 seconds if rate limited
};

// Batch status enum
const BATCH_STATUS = {
    PENDING: 'PENDING',
    RUNNING: 'RUNNING',
    COMPLETED: 'COMPLETED',
    FAILED: 'FAILED',
    PAUSED: 'PAUSED'
};

// Sample status enum
const SAMPLE_STATUS = {
    PENDING: 'PENDING',
    RUNNING: 'RUNNING',
    COMPLETED: 'COMPLETED',
    FAILED: 'FAILED',
    FAILED_INSUFFICIENT_DATA: 'FAILED_INSUFFICIENT_DATA'
};

/**
 * =======================================================================
 * IN-MEMORY BATCH STATE (MVP - would use Redis in production)
 * =======================================================================
 */

const batchStore = new Map();  // batchId -> BatchState

class BatchState {
    constructor(config) {
        this.batchId = config.batchId || uuidv4();
        this.symbol = config.symbol || 'BTCUSDT';
        this.startTime = config.startTime;
        this.endTime = config.endTime;
        this.stepMs = config.stepMs;
        this.horizons = config.horizons || ['MICRO'];
        this.maxSamples = config.maxSamples || 100;
        this.useLocalOnly = config.useLocalOnly !== false;  // Default: true (use database)

        this.status = BATCH_STATUS.PENDING;
        this.samples = [];           // Array of { asOfTimestamp, status, stateId, error }
        this.completedSamples = 0;
        this.failedSamples = 0;
        this.startedAt = null;
        this.updatedAt = Date.now();
        this.error = null;
    }

    toJSON() {
        return {
            batchId: this.batchId,
            symbol: this.symbol,
            startTime: this.startTime,
            endTime: this.endTime,
            stepMs: this.stepMs,
            horizons: this.horizons,
            status: this.status,
            totalSamples: this.samples.length,
            completedSamples: this.completedSamples,
            failedSamples: this.failedSamples,
            remainingSamples: this.samples.length - this.completedSamples - this.failedSamples,
            startedAt: this.startedAt,
            updatedAt: this.updatedAt,
            eta: this.calculateEta(),
            error: this.error,
            useLocalOnly: this.useLocalOnly,
            dataSource: this.useLocalOnly ? 'local_database' : 'coinglass_api'
        };
    }

    calculateEta() {
        if (this.status !== BATCH_STATUS.RUNNING) return null;
        if (this.completedSamples === 0) return null;

        const elapsed = Date.now() - this.startedAt;
        const avgTimePerSample = elapsed / this.completedSamples;
        const remaining = this.samples.length - this.completedSamples - this.failedSamples;

        return Math.round(remaining * avgTimePerSample);
    }
}

/**
 * =======================================================================
 * HELPER FUNCTIONS
 * =======================================================================
 */

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Generate sample timestamps for a batch
 */
function generateSampleTimestamps(startTime, endTime, stepMs, maxSamples) {
    const timestamps = [];
    let current = startTime;

    while (current <= endTime && timestamps.length < maxSamples) {
        timestamps.push(current);
        current += stepMs;
    }

    return timestamps;
}

/**
 * Parse step size string to milliseconds
 */
function parseStepSize(stepSize) {
    const map = {
        '30m': 30 * 60 * 1000,
        '1h': 60 * 60 * 1000,
        '4h': 4 * 60 * 60 * 1000,
        '1d': 24 * 60 * 60 * 1000
    };
    return map[stepSize] || map['1h'];
}

/**
 * Check if a state already exists for this replay sample (idempotency)
 * Uses unique constraint on (batch_id, as_of_timestamp, symbol)
 */
async function checkExistingState(batchId, asOfTimestamp, symbol) {
    try {
        const result = await stateStorage.checkExistingReplayState(
            batchId,
            asOfTimestamp,
            symbol.replace('USDT', '').replace('USD', '')
        );
        return result?.id || null;
    } catch (err) {
        logger.warn('Error checking existing state:', err.message);
        return null;
    }
}

/**
 * =======================================================================
 * AUTO-SYNC FOR EDGE DATA
 * =======================================================================
 * When requested timestamp is near the edge of synced data, automatically
 * sync the latest candles to ensure complete coverage.
 */

async function autoSyncEdgeData(requestedTimestamp) {
    const syncJob = getSyncJob();
    if (!syncJob) {
        logger.warn('[AUTO-SYNC] Sync job not available');
        return false;
    }

    try {
        // Check coverage in database
        const coverage = await historicalCandleStorage.getDataCoverage();

        if (!coverage?.overall?.latest) {
            logger.info('[AUTO-SYNC] No data coverage found, syncing recent data...');
            await syncJob.startSync({ daysBack: 7, force: false });
            return true;
        }

        const latestInDb = coverage.overall.latest;
        const now = Date.now();
        const hourMs = 60 * 60 * 1000;

        // If requested timestamp is within 24 hours of latest data OR within 24 hours of now
        const nearEdge = (requestedTimestamp > latestInDb - (24 * hourMs)) ||
            (now - requestedTimestamp < 48 * hourMs);

        if (nearEdge) {
            logger.info(`[AUTO-SYNC] Requested time ${new Date(requestedTimestamp).toISOString()} is near edge of data (latest: ${new Date(latestInDb).toISOString()})`);
            logger.info('[AUTO-SYNC] Syncing recent data across all timeframes...');

            // Sync recent data (last 3 days) for all timeframes
            await syncJob.startSync({
                daysBack: 3,
                force: false,
                exchanges: ['Binance', 'Bybit'],
                timeframes: ['30m', '1h', '4h', '1d'],
                dataTypes: ['price', 'oi', 'funding', 'taker_volume']
            });

            // Wait for sync to complete (poll status)
            let attempts = 0;
            const maxAttempts = 60; // 5 minutes max
            while (attempts < maxAttempts) {
                await sleep(5000);
                const status = syncJob.getSyncStatus();
                if (!status.isRunning) {
                    logger.info('[AUTO-SYNC] Sync completed');
                    break;
                }
                attempts++;
            }

            return true;
        }

        return false;

    } catch (error) {
        logger.error('[AUTO-SYNC] Error during auto-sync:', error.message);
        return false;
    }
}

/**
 * =======================================================================
 * DATA FETCHING - ADAPTIVE STRATEGY
 * =======================================================================
 * 
 * Primary: Use endTime parameter if Coinglass API supports it
 * Fallback: Fetch fixed window, slice client-side to <= asOfTimestamp
 */

/**
 * Slice data array to include only candles with time <= asOfTimestamp
 */
function sliceDataToTimestamp(dataArray, asOfTimestamp) {
    if (!Array.isArray(dataArray)) return [];
    return dataArray.filter(candle => {
        const candleTime = candle.time || candle.t || candle.timestamp;
        return candleTime && candleTime <= asOfTimestamp;
    });
}


/**
 * Validate that we have enough candles after slicing
 */
function validateDataAdequacy(data, timeframe) {
    const req = WINDOW_REQUIREMENTS[timeframe];
    if (!req) return { valid: true, reason: 'Unknown timeframe, skipping validation' };

    const count = Array.isArray(data) ? data.length : 0;

    if (count < req.minCandles) {
        return {
            valid: false,
            reason: `Insufficient data for ${timeframe}: got ${count} candles, need ${req.minCandles}`,
            got: count,
            required: req.minCandles
        };
    }

    return { valid: true, count };
}

/**
 * Fetch historical data for a single exchange up to asOfTimestamp
 * Uses historicalDataService which handles time alignment, retry logic, and validation
 * 
 * REPLAY MODE: Uses local database ONLY (no Coinglass API calls)
 * This makes replays instant and rate-limit-free.
 */
async function fetchExchangeDataAtTimestamp(exchange, symbol, timeframes, asOfTimestamp, options = {}) {
    const { useLocalOnly = true } = options;  // Default: use database only for replay

    const result = {};
    const metadata = {
        exchange,
        asOfTimestamp,
        endTimeAligned: alignEndTimeToLastClosedCandle(timeframes[0], asOfTimestamp),
        candlesCapturedByTF: {},
        dataRange: { earliest: null, latest: null },
        strategy: useLocalOnly ? 'local_database' : 'historical_service',
        useLocalOnly
    };

    for (const tf of timeframes) {
        try {
            // No rate limit delay needed when using local database
            if (!useLocalOnly) {
                await sleep(RATE_LIMIT_CONFIG.delayBetweenApiCalls);
            }

            // Use historicalDataService - with useLocalOnly flag for replay mode
            const fetchOptions = { useLocalOnly };
            const [priceData, oiData, fundingData, cvdData] = await Promise.all([
                historicalDataService.getPriceHistoryAt(exchange, symbol, tf, asOfTimestamp, fetchOptions),
                historicalDataService.getOIHistoryAt(exchange, symbol, tf, asOfTimestamp, fetchOptions),
                historicalDataService.getFundingHistoryAt(exchange, symbol, tf, asOfTimestamp, fetchOptions),
                historicalDataService.getTakerVolumeAt(exchange, symbol, tf, asOfTimestamp, fetchOptions)
            ]);

            // Track data range from price data
            if (priceData.length > 0) {
                const times = priceData.map(c => c.time).filter(Boolean);
                const earliest = Math.min(...times);
                const latest = Math.max(...times);

                if (!metadata.dataRange.earliest || earliest < metadata.dataRange.earliest) {
                    metadata.dataRange.earliest = earliest;
                }
                if (!metadata.dataRange.latest || latest > metadata.dataRange.latest) {
                    metadata.dataRange.latest = latest;
                }
            }

            metadata.candlesCapturedByTF[tf] = {
                price: priceData.length,
                oi: oiData.length,
                funding: fundingData.length,
                cvd: cvdData.length
            };

            result[tf] = {
                price: priceData,
                oi: oiData,
                funding: fundingData,
                cvd: cvdData
            };

        } catch (error) {
            // Use structured error logging (fixes garbled output)
            logger.error(`Failed to fetch ${exchange} ${tf} data:`, coinglassClient.formatError(error, {
                exchange,
                symbol,
                timeframe: tf,
                asOfTimestamp
            }));
            throw error;
        }
    }

    return { data: result, metadata };
}

/**
 * Fetch all data needed for replay at a specific timestamp
 * 
 * @param {number} asOfTimestamp - The "as of" timestamp
 * @param {string} symbol - Trading pair
 * @param {Object} options - { timeframes, useLocalOnly }
 */
async function fetchHistoricalDataAtTimestamp(asOfTimestamp, symbol, options = {}) {
    const timeframes = options.timeframes || ['30m', '1h', '4h', '1d'];
    const useLocalOnly = options.useLocalOnly !== false;  // Default true for replay
    const bybitSymbol = symbol === 'BTCUSDT' ? 'BTCUSD' : symbol;

    const dataSource = useLocalOnly ? '💾 LOCAL DATABASE' : '🌐 API';
    logger.info(`📊 Fetching historical data for asOfTimestamp: ${new Date(asOfTimestamp).toISOString()} [${dataSource}]`);

    const fetchOptions = { useLocalOnly };
    const binanceResult = await fetchExchangeDataAtTimestamp('Binance', symbol, timeframes, asOfTimestamp, fetchOptions);
    const bybitResult = await fetchExchangeDataAtTimestamp('Bybit', bybitSymbol, timeframes, asOfTimestamp, fetchOptions);

    // Merge metadata
    const metadata = {
        asOfTimestamp,
        binance: binanceResult.metadata,
        bybit: bybitResult.metadata,
        dataRange: {
            earliest: Math.min(
                binanceResult.metadata.dataRange.earliest || Infinity,
                bybitResult.metadata.dataRange.earliest || Infinity
            ),
            latest: Math.max(
                binanceResult.metadata.dataRange.latest || 0,
                bybitResult.metadata.dataRange.latest || 0
            )
        }
    };

    // CRITICAL: Verify no lookahead
    if (metadata.dataRange.latest > asOfTimestamp) {
        throw new Error(`LOOKAHEAD VIOLATION: Latest data ${metadata.dataRange.latest} > asOfTimestamp ${asOfTimestamp}`);
    }

    return {
        binance: binanceResult.data,
        bybit: bybitResult.data,
        metadata
    };
}

/**
 * =======================================================================
 * SNAPSHOT BUILDER - Convert raw data to marketMetrics format
 * =======================================================================
 */

function buildSnapshotFromHistoricalData(rawData, timeframe = '4h') {
    const { binance, bybit } = rawData;

    // Helper to calculate change %
    const calcChange = (arr, key = 'close') => {
        if (!arr || arr.length < 2) return 0;
        const curr = arr[arr.length - 1][key] || arr[arr.length - 1].oi || 0;
        const prev = arr[arr.length - 2][key] || arr[arr.length - 2].oi || 0;
        if (!prev || prev === 0) return 0;
        return ((curr - prev) / prev) * 100;
    };

    // Helper to calculate CVD
    const calcCVD = (cvdArr) => {
        if (!cvdArr || cvdArr.length === 0) return 0;
        return cvdArr.reduce((acc, c) => {
            const buy = Number(c.taker_buy_volume_usd || c.buyVol || 0);
            const sell = Number(c.taker_sell_volume_usd || c.sellVol || 0);
            return acc + (buy - sell);
        }, 0);
    };

    // Helper to calculate funding average
    const calcFundingAvg = (fundingArr) => {
        if (!fundingArr || fundingArr.length === 0) return 0;
        const rates = fundingArr.map(f => f.rate || f.close || 0);
        return (rates.reduce((a, b) => a + b, 0) / rates.length) * 100;
    };

    // Build snapshot for each timeframe
    const snapshot = { Binance: {}, Bybit: {} };
    const history = {};

    const timeframes = Object.keys(binance);

    for (const tf of timeframes) {
        const binTf = binance[tf] || {};
        const byTf = bybit[tf] || {};

        const binPrice = binTf.price || [];
        const binOI = binTf.oi || [];
        const binFunding = binTf.funding || [];
        const binCVD = binTf.cvd || [];

        const byPrice = byTf.price || [];
        const byOI = byTf.oi || [];
        const byCVD = byTf.cvd || [];

        snapshot.Binance[tf] = {
            price: binPrice[binPrice.length - 1]?.close || 0,
            price_change: calcChange(binPrice, 'close'),
            oi: binOI[binOI.length - 1]?.oi || 0,
            oi_change: calcChange(binOI, 'oi'),
            cvd: calcCVD(binCVD),
            funding_rate_avg_pct: calcFundingAvg(binFunding),
            volume: binPrice[binPrice.length - 1]?.volume || 0
        };

        snapshot.Bybit[tf] = {
            price: byPrice[byPrice.length - 1]?.close || 0,
            price_change: calcChange(byPrice, 'close'),
            oi: byOI[byOI.length - 1]?.oi || 0,
            oi_change: calcChange(byOI, 'oi'),
            cvd: calcCVD(byCVD),
            funding_rate_avg_pct: 0,
            volume: byPrice[byPrice.length - 1]?.volume || 0
        };
    }

    // Build history for technical analysis (use the primary timeframe)
    const primaryTf = timeframe;
    const binPrimaryPrice = binance[primaryTf]?.price || [];

    history.priceHistory = binPrimaryPrice.map(p => ({
        time: p.time,
        close: p.close,
        price: p.close,
        open: p.open,
        high: p.high,
        low: p.low
    }));

    history.oiHistory = binance[primaryTf]?.oi || [];
    history.fundingHistory = binance[primaryTf]?.funding || [];

    return { snapshot, history };
}

/**
 * =======================================================================
 * SINGLE REPLAY EXECUTION
 * =======================================================================
 */

async function runReplayAtTimestamp(asOfTimestamp, symbol, options = {}) {
    const { batchId, horizons = ['MICRO'], skipDuplicateCheck = false } = options;

    const replayId = uuidv4();
    const symbolNorm = symbol.replace('USDT', '').replace('USD', '');

    logger.info(`🔄 Running replay at ${new Date(asOfTimestamp).toISOString()} (${replayId})`);

    // Check idempotency - skip if already exists
    if (!skipDuplicateCheck && batchId) {
        const existingId = await checkExistingState(batchId, asOfTimestamp, symbol);
        if (existingId) {
            logger.info(`⏭️ Skipping duplicate replay (existing state: ${existingId})`);
            return {
                success: true,
                skipped: true,
                stateId: existingId,
                reason: 'Already exists'
            };
        }
    }

    try {
        // Fetch historical data with zero lookahead
        const rawData = await fetchHistoricalDataAtTimestamp(asOfTimestamp, symbol, options);

        // Build snapshot in marketMetrics format
        const { snapshot, history } = buildSnapshotFromHistoricalData(rawData, '4h');

        // Run the analyzer (same as live mode)
        const metrics = marketMetrics.calculateMarketMetrics({ snapshot, history });

        // Prepare replay state
        const replayState = {
            ...metrics,
            mode: 'HISTORICAL',
            replayId,
            replayMeta: {
                batchId,
                asOfTimestamp,
                createdAt: Date.now(),
                dataRange: rawData.metadata.dataRange,
                candlesCapturedByTF: {
                    binance: rawData.metadata.binance.candlesCapturedByTF,
                    bybit: rawData.metadata.bybit.candlesCapturedByTF
                }
            }
        };

        // Save to replay_states table (separate from live market_states)
        // FIX 7: Include config version for reproducibility
        const configVersion = configService.getCachedVersion();
        const configSource = configService.getConfigSource();

        const saveResult = await stateStorage.saveReplayState({
            batchId,
            asOfTimestamp,
            symbol: symbolNorm,
            marketState: replayState,
            metadata: {
                dataRange: rawData.metadata.dataRange,
                candlesCapturedByTF: {
                    binance: rawData.metadata.binance.candlesCapturedByTF,
                    bybit: rawData.metadata.bybit.candlesCapturedByTF
                },
                configVersion,
                configSource,
                status: 'COMPLETED'
            }
        });

        if (!saveResult.success) {
            throw new Error(saveResult.error || 'Failed to save replay state');
        }

        logger.info(`✅ Replay completed: ${saveResult.id}`);

        return {
            success: true,
            stateId: saveResult.id,
            replayId,
            asOfTimestamp,
            decision: metrics.finalDecision,
            dataRange: rawData.metadata.dataRange
        };

    } catch (error) {
        logger.error(`❌ Replay failed at ${new Date(asOfTimestamp).toISOString()}:`, error.message);

        // Determine failure type
        const isInsufficientData = error.message.includes('Insufficient data');

        return {
            success: false,
            error: error.message,
            status: isInsufficientData ? SAMPLE_STATUS.FAILED_INSUFFICIENT_DATA : SAMPLE_STATUS.FAILED,
            asOfTimestamp
        };
    }
}

/**
 * =======================================================================
 * BATCH REPLAY EXECUTION (with queue and rate limiting)
 * =======================================================================
 */

async function runBatchReplay(config) {
    const {
        startTime,
        endTime,
        stepSize = '1h',
        maxSamples = 100,
        symbol = 'BTCUSDT',
        horizons = ['MICRO']
    } = config;

    const stepMs = parseStepSize(stepSize);
    const startMs = new Date(startTime).getTime();
    const endMs = new Date(endTime).getTime();

    // Create batch state
    const batch = new BatchState({
        batchId: config.batchId || uuidv4(),
        symbol,
        startTime: startMs,
        endTime: endMs,
        stepMs,
        horizons,
        maxSamples
    });

    // Generate sample timestamps
    const timestamps = generateSampleTimestamps(startMs, endMs, stepMs, maxSamples);

    // Initialize sample tracking
    batch.samples = timestamps.map(ts => ({
        asOfTimestamp: ts,
        status: SAMPLE_STATUS.PENDING,
        stateId: null,
        error: null
    }));

    // Check for existing samples (resume support)
    for (let i = 0; i < batch.samples.length; i++) {
        const sample = batch.samples[i];
        const existingId = await checkExistingState(batch.batchId, sample.asOfTimestamp, symbol);
        if (existingId) {
            sample.status = SAMPLE_STATUS.COMPLETED;
            sample.stateId = existingId;
            batch.completedSamples++;
        }
    }

    // Store batch
    batchStore.set(batch.batchId, batch);

    logger.info(`📦 Created batch ${batch.batchId}: ${timestamps.length} samples, ${batch.completedSamples} already completed`);

    // Start async execution (don't await - return immediately)
    executeBatchAsync(batch);

    return batch.toJSON();
}

/**
 * Execute batch asynchronously (single worker, rate limited when using API)
 * 
 * When useLocalOnly=true (default for replay):
 * - No rate limiting needed (local database is instant)
 * - No need to pause cron job (not hitting API)
 */
async function executeBatchAsync(batch) {
    const useLocalOnly = batch.useLocalOnly !== false;  // Default true for replay

    batch.status = BATCH_STATUS.RUNNING;
    batch.startedAt = Date.now();
    batch.updatedAt = Date.now();

    // Only pause cron if using API (not needed for local database)
    if (!useLocalOnly) {
        cronControl.pauseCron(`Batch ${batch.batchId} running`);
    }

    const dataSource = useLocalOnly ? '💾 LOCAL' : '🌐 API';
    logger.info(`🚀 Starting batch execution: ${batch.batchId} [${dataSource}]`);

    try {
        for (let i = 0; i < batch.samples.length; i++) {
            const sample = batch.samples[i];

            // Skip already completed samples
            if (sample.status === SAMPLE_STATUS.COMPLETED) {
                continue;
            }

            // Check if batch was paused/cancelled
            if (batch.status === BATCH_STATUS.PAUSED || batch.status === BATCH_STATUS.FAILED) {
                logger.info(`⏸️ Batch ${batch.batchId} halted at sample ${i}`);
                break;
            }

            sample.status = SAMPLE_STATUS.RUNNING;
            batch.updatedAt = Date.now();

            // Execute with retry logic
            let result;
            let retries = 0;

            while (retries < RATE_LIMIT_CONFIG.maxRetries) {
                try {
                    result = await runReplayAtTimestamp(sample.asOfTimestamp, batch.symbol, {
                        batchId: batch.batchId,
                        horizons: batch.horizons
                    });
                    break;  // Success, exit retry loop

                } catch (error) {
                    retries++;

                    // Check if rate limited
                    const isRateLimited = error.message.includes('429') || error.message.includes('rate limit');
                    const isInsufficientData = error.message.includes('Insufficient data');

                    if (isRateLimited) {
                        logger.warn(`⏳ Rate limited, cooling down for ${RATE_LIMIT_CONFIG.rateLimitCooldownMs}ms`);
                        await sleep(RATE_LIMIT_CONFIG.rateLimitCooldownMs);
                    } else if (isInsufficientData && retries === 1) {
                        // First insufficient data error - try auto-sync
                        logger.info(`🔄 Insufficient data at ${new Date(sample.asOfTimestamp).toISOString()}, triggering auto-sync...`);
                        const synced = await autoSyncEdgeData(sample.asOfTimestamp);
                        if (synced) {
                            logger.info('🔄 Auto-sync triggered, retrying sample...');
                            await sleep(2000);  // Small delay after sync
                        } else {
                            result = { success: false, error: error.message, status: SAMPLE_STATUS.FAILED_INSUFFICIENT_DATA };
                        }
                    } else if (retries < RATE_LIMIT_CONFIG.maxRetries) {
                        logger.warn(`⚠️ Retry ${retries}/${RATE_LIMIT_CONFIG.maxRetries} for sample ${i}`);
                        await sleep(RATE_LIMIT_CONFIG.retryBackoffMs * retries);
                    } else {
                        result = { success: false, error: error.message, status: SAMPLE_STATUS.FAILED };
                    }
                }
            }

            // Update sample status
            if (result.success) {
                sample.status = SAMPLE_STATUS.COMPLETED;
                sample.stateId = result.stateId;
                batch.completedSamples++;
            } else {
                sample.status = result.status || SAMPLE_STATUS.FAILED;
                sample.error = result.error;
                batch.failedSamples++;
            }

            batch.updatedAt = Date.now();

            // Progress logging
            const progress = ((batch.completedSamples + batch.failedSamples) / batch.samples.length * 100).toFixed(1);
            logger.info(`📊 Batch ${batch.batchId}: ${progress}% complete (${batch.completedSamples} done, ${batch.failedSamples} failed)`);

            // Delay between samples - only needed when using API (not local database)
            if (!useLocalOnly && i < batch.samples.length - 1) {
                await sleep(RATE_LIMIT_CONFIG.delayBetweenSamples);
            }
        }

        // Finalize batch status
        const remaining = batch.samples.length - batch.completedSamples - batch.failedSamples;

        if (remaining === 0) {
            batch.status = batch.failedSamples > 0 && batch.completedSamples === 0
                ? BATCH_STATUS.FAILED
                : BATCH_STATUS.COMPLETED;
        } else {
            batch.status = BATCH_STATUS.PAUSED;
        }

        batch.updatedAt = Date.now();

        logger.info(`✅ Batch ${batch.batchId} finished: ${batch.status} (${batch.completedSamples}/${batch.samples.length} completed)`);

        // ===========================================
        // ENHANCEMENT 1: Auto-label for historical replays
        // ===========================================
        // For historical batches, the "future" data already exists in the past,
        // so we can immediately label outcomes without waiting
        if (batch.status === BATCH_STATUS.COMPLETED && batch.completedSamples > 0) {
            await autoLabelBatchStates(batch);
        }

    } catch (error) {
        logger.error(`❌ Batch ${batch.batchId} failed:`, error.message);
        batch.status = BATCH_STATUS.FAILED;
        batch.error = error.message;
        batch.updatedAt = Date.now();
    } finally {
        // Only resume cron if we paused it (API mode)
        if (!useLocalOnly) {
            cronControl.resumeCron();
        }
    }
}

/**
 * Resume a paused batch
 */
async function resumeBatch(batchId) {
    const batch = batchStore.get(batchId);

    if (!batch) {
        return { success: false, error: 'Batch not found' };
    }

    if (batch.status === BATCH_STATUS.RUNNING) {
        return { success: false, error: 'Batch already running' };
    }

    if (batch.status === BATCH_STATUS.COMPLETED) {
        return { success: false, error: 'Batch already completed' };
    }

    logger.info(`▶️ Resuming batch ${batchId}`);

    // Restart async execution
    executeBatchAsync(batch);

    return { success: true, batch: batch.toJSON() };
}

/**
 * Pause a running batch
 */
function pauseBatch(batchId) {
    const batch = batchStore.get(batchId);

    if (!batch) {
        return { success: false, error: 'Batch not found' };
    }

    if (batch.status !== BATCH_STATUS.RUNNING) {
        return { success: false, error: 'Batch not running' };
    }

    batch.status = BATCH_STATUS.PAUSED;
    batch.updatedAt = Date.now();

    logger.info(`⏸️ Pausing batch ${batchId}`);

    return { success: true, batch: batch.toJSON() };
}

/**
 * Get batch status
 */
function getBatchStatus(batchId) {
    const batch = batchStore.get(batchId);

    if (!batch) {
        return null;
    }

    return batch.toJSON();
}

/**
 * Get batch results (completed samples)
 */
async function getBatchResults(batchId, options = {}) {
    const batch = batchStore.get(batchId);

    if (!batch) {
        return { success: false, error: 'Batch not found' };
    }

    // Fetch states from replay_states table
    const states = await stateStorage.getReplayStates(batchId, {
        limit: options.limit || 200,
        offset: options.offset || 0,
        includeFullState: options.includeFullState || false
    });

    return {
        success: true,
        batchId,
        status: batch.status,
        totalSamples: batch.samples.length,
        returnedSamples: states.length,
        states
    };
}

/**
 * Get batch failures
 */
function getBatchFailures(batchId) {
    const batch = batchStore.get(batchId);

    if (!batch) {
        return { success: false, error: 'Batch not found' };
    }

    const failures = batch.samples.filter(s =>
        s.status === SAMPLE_STATUS.FAILED ||
        s.status === SAMPLE_STATUS.FAILED_INSUFFICIENT_DATA
    );

    return {
        success: true,
        batchId,
        totalFailures: failures.length,
        failures: failures.map(f => ({
            asOfTimestamp: f.asOfTimestamp,
            status: f.status,
            error: f.error
        }))
    };
}

/**
 * List all batches
 */
function listBatches() {
    return Array.from(batchStore.values()).map(b => b.toJSON());
}

/**
 * =======================================================================
 * AUTO-LABELING FOR HISTORICAL REPLAYS
 * =======================================================================
 * Enhancement 1: Automatically label batch states after replay completes
 * For historical backtests, the "future" data already exists, so we can
 * immediately label outcomes without waiting for time to pass.
 */

async function autoLabelBatchStates(batch) {
    const labelingJob = getLabelingJob();
    if (!labelingJob) {
        logger.warn(`[AUTO-LABEL] Labeling service not available for batch ${batch.batchId}`);
        return { success: false, reason: 'Labeling service not available' };
    }

    logger.info(`🏷️ [AUTO-LABEL] Starting automatic labeling for batch ${batch.batchId}...`);

    try {
        const symbolNorm = batch.symbol.replace('USDT', '').replace('USD', '');

        // Label with MICRO horizon (default)
        const result = await labelingJob.labelPendingStates({
            batchId: batch.batchId,
            horizon: 'MICRO',
            limit: batch.completedSamples + 10, // Label all completed states
            symbol: symbolNorm
        });

        if (result.labeled > 0) {
            logger.info(`✅ [AUTO-LABEL] Labeled ${result.labeled} states for batch ${batch.batchId}`);
        } else {
            logger.info(`ℹ️ [AUTO-LABEL] No states labeled for batch ${batch.batchId} (${result.skipped || 0} skipped, ${result.errors || 0} errors)`);
        }

        return result;

    } catch (error) {
        logger.error(`❌ [AUTO-LABEL] Failed for batch ${batch.batchId}:`, error.message);
        return { success: false, error: error.message };
    }
}

/**
 * =======================================================================
 * EXPORTS
 * =======================================================================
 */

module.exports = {
    // Single replay
    runReplayAtTimestamp,

    // Batch operations
    runBatchReplay,
    resumeBatch,
    pauseBatch,
    getBatchStatus,
    getBatchResults,
    getBatchFailures,
    listBatches,
    deleteBatch: (batchId) => batchStore.delete(batchId),

    // Auto-labeling
    autoLabelBatchStates,

    // Constants
    BATCH_STATUS,
    SAMPLE_STATUS,
    WINDOW_REQUIREMENTS,

    // Helpers (for testing)
    parseStepSize,
    generateSampleTimestamps,
    sliceDataToTimestamp,
    validateDataAdequacy
};
