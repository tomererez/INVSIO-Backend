// src/backtest/outcomeLabelingJob.js - Stage 3: Outcome Labeling for Replay States
// Labels replay states with outcomes using future candles AFTER asOfTimestamp
//
// Key Guarantees:
// - Uses ONLY future data (strictly AFTER asOfTimestamp)
// - Deterministic and repeatable (same inputs = same outputs)
// - WAIT correctness is supported (WAIT correct if market was choppy)
// - Uses LOCAL database for historical data (avoids API calls during backtest)

const marketDataService = require('../services/marketDataService');
const historicalCandleStorage = require('../services/historicalCandleStorage');
const stateStorage = require('../services/stateStorage');
const outcomeLabeler = require('../services/outcomeLabeler');
const logger = require('../utils/logger');

/**
 * =======================================================================
 * CONFIGURATION
 * =======================================================================
 */

const LABELING_CONFIG = {
    // Delay between API calls to respect rate limits (only used for fallback)
    delayBetweenApiCalls: 2500,

    // Default max age for unlabeled states (8 hours for MICRO horizon)
    defaultMaxAgeMs: {
        SCALPING: 60 * 60 * 1000,        // 1 hour
        MICRO: 8 * 60 * 60 * 1000,       // 8 hours
        MACRO: 5 * 24 * 60 * 60 * 1000   // 5 days
    },

    // How many future candles to fetch per horizon
    futureCandlesToFetch: {
        SCALPING: 12,   // 12 x 5min = 60 min
        MICRO: 24,      // 24 x 1h = 24 hours
        MACRO: 30       // 30 x 4h = 5 days
    },

    // Timeframe to use for fetching future prices
    horizonTimeframe: {
        SCALPING: '30m',  // Use 30m since we don't store 5m
        MICRO: '1h',
        MACRO: '4h'
    }
};

/**
 * =======================================================================
 * HELPER FUNCTIONS
 * =======================================================================
 */

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Fetch future prices AFTER a given timestamp
 * USES LOCAL DATABASE FIRST - avoids API calls during backtest!
 */
async function fetchFuturePrices(afterTimestamp, symbol, horizon) {
    const timeframe = LABELING_CONFIG.horizonTimeframe[horizon] || '1h';
    const limit = LABELING_CONFIG.futureCandlesToFetch[horizon] || 24;
    const symbolNorm = symbol.replace('USDT', '').replace('USD', '');

    try {
        // Calculate time range for future data
        const intervalMs = {
            '30m': 30 * 60 * 1000,
            '1h': 60 * 60 * 1000,
            '4h': 4 * 60 * 60 * 1000,
            '1d': 24 * 60 * 60 * 1000
        }[timeframe] || (60 * 60 * 1000);

        const endTime = afterTimestamp + (intervalMs * limit * 2);

        // TRY LOCAL DATABASE FIRST
        const localCandles = await historicalCandleStorage.getCandles({
            exchange: 'Binance',
            symbol: symbolNorm,
            timeframe,
            startTime: afterTimestamp + 1,  // Strictly AFTER the timestamp
            endTime: endTime
        });

        if (localCandles && localCandles.length >= Math.min(limit, 5)) {
            // Use local data
            const futurePrices = localCandles
                .filter(c => c.timestamp > afterTimestamp && c.close)
                .sort((a, b) => a.timestamp - b.timestamp)
                .slice(0, limit);

            logger.debug(`[LABELING] Using ${futurePrices.length} local candles for outcome labeling`);

            return futurePrices.map(c => ({
                time: c.timestamp,
                price: Number(c.close),
                high: Number(c.high),
                low: Number(c.low),
                open: Number(c.open)
            }));
        }

        // FALLBACK TO API (only if local data insufficient)
        logger.warn(`[LABELING] Local data insufficient for ${symbolNorm}/${timeframe} after ${new Date(afterTimestamp).toISOString()}, falling back to API`);
        await sleep(LABELING_CONFIG.delayBetweenApiCalls);
        const priceData = await marketDataService.getPriceHistory('Binance', symbol, timeframe, limit * 2);

        if (!priceData || priceData.length === 0) {
            return [];
        }

        // Filter to only include candles AFTER the state timestamp
        const futurePrices = priceData
            .filter(candle => candle.time > afterTimestamp)
            .sort((a, b) => a.time - b.time)
            .slice(0, limit);

        return futurePrices.map(c => ({
            time: c.time,
            price: c.close,
            high: c.high,
            low: c.low,
            open: c.open
        }));

    } catch (error) {
        logger.error(`Failed to fetch future prices for ${symbol}:`, error.message);
        return [];
    }
}

/**
 * Get the effective timestamp for a state (as_of_timestamp for replay, timestamp for live)
 */
function getStateEffectiveTimestamp(state) {
    // For replay states, use the as_of_timestamp field
    if (state.as_of_timestamp) {
        return state.as_of_timestamp;
    }
    // Fallback for legacy format
    if (state.replay_as_of_timestamp) {
        return state.replay_as_of_timestamp;
    }
    // For live states, use the regular timestamp
    return state.timestamp;
}

/**
 * =======================================================================
 * MAIN LABELING FUNCTIONS
 * =======================================================================
 */

/**
 * Label pending states for a given horizon
 * 
 * @param {Object} options
 * @param {string} options.batchId - Optional: filter to specific batch
 * @param {string} options.horizon - Horizon to evaluate (SCALPING, MICRO, MACRO)
 * @param {number} options.limit - Max states to label
 * @param {string} options.symbol - Symbol to filter (default: BTC)
 */
async function labelPendingStates(options = {}) {
    const {
        batchId,
        horizon = 'MICRO',
        limit = 100,
        symbol = 'BTCUSDT'
    } = options;

    const horizonConfig = outcomeLabeler.TIME_HORIZONS[horizon];
    if (!horizonConfig) {
        return { success: false, error: `Invalid horizon: ${horizon}` };
    }

    const maxAgeMs = LABELING_CONFIG.defaultMaxAgeMs[horizon] || 8 * 60 * 60 * 1000;

    logger.info(`📊 Starting outcome labeling job: horizon=${horizon}, limit=${limit}`);

    // Get unlabeled replay states old enough for horizon to have expired
    const symbolNorm = symbol.replace('USDT', '').replace('USD', '');
    const unlabeledStates = await stateStorage.getUnlabeledReplayStates({
        batchId,
        symbol: symbolNorm,
        maxAgeMs: maxAgeMs,
        limit
    });

    if (unlabeledStates.length === 0) {
        logger.info('📊 No unlabeled states found matching criteria');
        return {
            success: true,
            labeled: 0,
            skipped: 0,
            failed: 0,
            message: 'No states to label'
        };
    }

    logger.info(`📊 Found ${unlabeledStates.length} states to label`);

    let labeled = 0;
    let skipped = 0;
    let failed = 0;

    for (const state of unlabeledStates) {
        const effectiveTimestamp = getStateEffectiveTimestamp(state);

        try {
            // Fetch future prices AFTER the state timestamp
            const futurePrices = await fetchFuturePrices(effectiveTimestamp, symbol, horizon);

            if (futurePrices.length === 0) {
                logger.warn(`⚠️ No future prices available for state ${state.id}`);
                skipped++;
                continue;
            }

            // Build market state object for labeling
            const marketState = state.full_state || {
                finalDecision: {
                    bias: state.bias,
                    confidence: state.confidence
                },
                price: state.price
            };

            // Calculate outcome label
            const outcome = outcomeLabeler.calculateOutcomeLabel(
                marketState,
                futurePrices.map(p => p.price),
                horizon
            );

            if (!outcome || !outcome.label) {
                logger.warn(`⚠️ Could not calculate outcome for state ${state.id}`);
                skipped++;
                continue;
            }

            // Calculate MFE/MAE if we have the data
            let mfe = null;
            let mae = null;

            if (futurePrices.length > 0 && state.price) {
                const bias = state.bias;
                const entryPrice = state.price;

                const highs = futurePrices.map(p => p.high || p.price);
                const lows = futurePrices.map(p => p.low || p.price);

                const maxHigh = Math.max(...highs);
                const maxLow = Math.min(...lows);

                if (bias === 'LONG') {
                    mfe = ((maxHigh - entryPrice) / entryPrice) * 100;
                    mae = ((entryPrice - maxLow) / entryPrice) * 100;
                } else if (bias === 'SHORT') {
                    mfe = ((entryPrice - maxLow) / entryPrice) * 100;
                    mae = ((maxHigh - entryPrice) / entryPrice) * 100;
                }
            }

            // Update replay state with outcome
            const updateResult = await stateStorage.updateReplayStateOutcome(state.id, {
                label: outcome.label,
                reason: outcome.reason,
                horizon: horizon,
                finalPrice: futurePrices[futurePrices.length - 1]?.price,
                finalMovePercent: outcome.movePercent,
                maxFavorableExcursion: mfe,
                maxAdverseExcursion: mae
            });

            if (updateResult.success) {
                labeled++;
                logger.info(`✅ Labeled state ${state.id}: ${state.bias} → ${outcome.label}`);
            } else {
                failed++;
                logger.error(`❌ Failed to update state ${state.id}: ${updateResult.error}`);
            }

        } catch (error) {
            failed++;
            logger.error(`❌ Error labeling state ${state.id}:`, error.message);
        }

        // Small delay between states
        await sleep(500);
    }

    logger.info(`📊 Labeling complete: ${labeled} labeled, ${skipped} skipped, ${failed} failed`);

    return {
        success: true,
        labeled,
        skipped,
        failed,
        total: unlabeledStates.length
    };
}

/**
 * Get labeling status (pending vs labeled counts) for replay states
 */
async function getLabelingStatus(options = {}) {
    const { batchId, symbol = 'BTC' } = options;

    const client = stateStorage.getSupabase();
    if (!client) {
        return { success: false, error: 'Database not configured' };
    }

    try {
        // Count total replay states
        let totalQuery = client
            .from('replay_states')
            .select('*', { count: 'exact', head: true })
            .eq('symbol', symbol)
            .eq('status', 'COMPLETED');

        if (batchId) {
            totalQuery = totalQuery.eq('batch_id', batchId);
        }

        const { count: totalCount } = await totalQuery;

        // Count labeled states
        let labeledQuery = client
            .from('replay_states')
            .select('*', { count: 'exact', head: true })
            .eq('symbol', symbol)
            .eq('status', 'COMPLETED')
            .not('outcome_label', 'is', null);

        if (batchId) {
            labeledQuery = labeledQuery.eq('batch_id', batchId);
        }

        const { count: labeledCount } = await labeledQuery;

        // Count by outcome label
        let breakdownQuery = client
            .from('replay_states')
            .select('outcome_label')
            .eq('symbol', symbol)
            .eq('status', 'COMPLETED')
            .not('outcome_label', 'is', null);

        if (batchId) {
            breakdownQuery = breakdownQuery.eq('batch_id', batchId);
        }

        const { data: labeledStates } = await breakdownQuery;

        const breakdown = {
            CONTINUATION: 0,
            REVERSAL: 0,
            NOISE: 0
        };

        (labeledStates || []).forEach(s => {
            if (breakdown[s.outcome_label] !== undefined) {
                breakdown[s.outcome_label]++;
            }
        });

        return {
            success: true,
            totalStates: totalCount || 0,
            labeledStates: labeledCount || 0,
            pendingStates: (totalCount || 0) - (labeledCount || 0),
            breakdown,
            percentLabeled: totalCount ? ((labeledCount / totalCount) * 100).toFixed(1) : 0
        };

    } catch (error) {
        logger.error('Error getting labeling status:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Label a single state (useful for testing)
 */
async function labelSingleState(stateId, horizon = 'MICRO', symbol = 'BTCUSDT') {
    const state = await stateStorage.getStateById(stateId);

    if (!state) {
        return { success: false, error: 'State not found' };
    }

    if (state.outcome_label) {
        return { success: false, error: 'State already labeled', label: state.outcome_label };
    }

    const effectiveTimestamp = getStateEffectiveTimestamp(state);
    const futurePrices = await fetchFuturePrices(effectiveTimestamp, symbol, horizon);

    if (futurePrices.length === 0) {
        return { success: false, error: 'No future prices available' };
    }

    const marketState = state.full_state || {
        finalDecision: {
            bias: state.bias,
            confidence: state.confidence
        },
        price: state.price
    };

    const outcome = outcomeLabeler.calculateOutcomeLabel(
        marketState,
        futurePrices.map(p => p.price),
        horizon
    );

    if (!outcome || !outcome.label) {
        return { success: false, error: 'Could not calculate outcome' };
    }

    const updateResult = await stateStorage.updateStateOutcome(state.id, {
        label: outcome.label,
        reason: outcome.reason,
        horizon: horizon,
        finalPrice: futurePrices[futurePrices.length - 1]?.price,
        finalMovePercent: outcome.movePercent
    });

    return {
        success: updateResult.success,
        stateId,
        label: outcome.label,
        reason: outcome.reason,
        movePercent: outcome.movePercent,
        error: updateResult.error
    };
}

/**
 * =======================================================================
 * EXPORTS
 * =======================================================================
 */

module.exports = {
    labelPendingStates,
    getLabelingStatus,
    labelSingleState,

    // Helpers for testing
    fetchFuturePrices,
    getStateEffectiveTimestamp,

    // Config
    LABELING_CONFIG
};
