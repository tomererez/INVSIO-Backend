// outcomeLabeler.js - STAGE 2: Outcome Labeling & Ground Truth
// Creates a reality-based evaluation layer independent of trading results

/**
 * =======================================================================
 * STAGE 2 REQUIREMENTS (from INVSIO_LOGIC_ONLY_IMPLEMENTATION_PLAN.md)
 * =======================================================================
 * 
 * Objective: Create a reality-based evaluation layer independent of trading results.
 * 
 * Each Market State resolves into exactly one label:
 * - Reversal
 * - Continuation
 * - Noise / Chop
 * 
 * Labels evaluate narrative correctness, not profitability.
 * A correct WAIT in chop is a success.
 * Labels are deterministic and repeatable.
 */

/**
 * =======================================================================
 * OUTCOME LABEL DEFINITIONS
 * =======================================================================
 */

const OUTCOME_LABELS = {
    REVERSAL: 'REVERSAL',       // Direction predicted, market reversed instead
    CONTINUATION: 'CONTINUATION', // Direction predicted, market continued as expected
    NOISE: 'NOISE',             // Market moved sideways / no significant move
    PENDING: 'PENDING'          // Horizon not yet expired, outcome unknown
};

/**
 * =======================================================================
 * TIME HORIZON DEFINITIONS (from Master_Spec.md Section 8.2)
 * =======================================================================
 */

const TIME_HORIZONS = {
    SCALPING: {
        name: 'SCALPING',
        minMinutes: 10,
        maxMinutes: 60,
        lookbackCandles: {
            '30m': 2,   // 2 x 30m = 60min
            '1h': 1     // 1 x 1h = 60min
        },
        // Threshold: what % move is "significant" (not noise)?
        // Start percentage-based, later can be ATR-based
        significanceThreshold: 0.3 // 0.3% move = significant for scalping
    },
    MICRO: {
        name: 'MICRO',
        minMinutes: 120,  // 2 hours
        maxMinutes: 480,  // 8 hours
        lookbackCandles: {
            '1h': 8,   // 8 x 1h = 8 hours
            '4h': 2    // 2 x 4h = 8 hours
        },
        significanceThreshold: 0.8 // 0.8% move = significant for micro
    },
    MACRO: {
        name: 'MACRO',
        minMinutes: 1440,   // 1 day
        maxMinutes: 7200,   // 5 days
        lookbackCandles: {
            '4h': 30,  // 30 x 4h = 5 days
            '1d': 5    // 5 x 1d = 5 days
        },
        significanceThreshold: 2.0 // 2% move = significant for macro
    }
};

/**
 * =======================================================================
 * OUTCOME LABELING LOGIC
 * =======================================================================
 */

/**
 * Determine the outcome label for a market state based on subsequent price action.
 * 
 * This is DETERMINISTIC and REPEATABLE:
 * - Same inputs always produce same outputs
 * - No randomness or external state
 * 
 * @param {Object} marketState - The market state at signal time
 * @param {Array} futurePrices - Array of future prices AFTER the signal
 * @param {string} horizon - One of: SCALPING, MICRO, MACRO
 * @returns {Object} Outcome label with metadata
 */
function calculateOutcomeLabel(marketState, futurePrices, horizon) {
    const horizonConfig = TIME_HORIZONS[horizon];
    if (!horizonConfig) {
        throw new Error(`Invalid horizon: ${horizon}. Must be one of: ${Object.keys(TIME_HORIZONS).join(', ')}`);
    }

    // Extract bias from market state
    const decision = marketState.finalDecision || {};
    const bias = decision.bias;
    const confidence = decision.confidence || 0;

    // Get reference price at signal time
    const signalPrice = marketState.raw?.binance?.['4h']?.price ||
        marketState.raw?.binance?.['1h']?.price ||
        marketState.exchangeDivergence?.binance?.price ||
        null;

    if (!signalPrice) {
        return {
            label: OUTCOME_LABELS.PENDING,
            reason: 'No reference price available at signal time',
            horizon,
            bias,
            confidence
        };
    }

    if (!futurePrices || futurePrices.length === 0) {
        return {
            label: OUTCOME_LABELS.PENDING,
            reason: 'No future price data available yet',
            horizon,
            bias,
            confidence,
            signalPrice
        };
    }

    // Calculate max favorable/adverse excursion and final price
    let maxFavorable = 0;  // Best move in predicted direction
    let maxAdverse = 0;    // Worst move against predicted direction
    const finalPrice = futurePrices[futurePrices.length - 1];

    // Direction multiplier: +1 for LONG (price up = favorable), -1 for SHORT (price down = favorable)
    const directionMultiplier =
        (bias === 'LONG' || bias === 'BULLISH') ? 1 :
            (bias === 'SHORT' || bias === 'BEARISH') ? -1 :
                0; // WAIT has no direction to verify

    // Special case: WAIT signals
    if (bias === 'WAIT' || bias === 'NEUTRAL' || directionMultiplier === 0) {
        return calculateWaitOutcome(signalPrice, futurePrices, horizonConfig);
    }

    // Calculate excursions for directional signals
    for (const price of futurePrices) {
        const movePercent = ((price - signalPrice) / signalPrice) * 100;
        const directionalMove = movePercent * directionMultiplier;

        if (directionalMove > maxFavorable) {
            maxFavorable = directionalMove;
        }
        if (directionalMove < maxAdverse) {
            maxAdverse = directionalMove;
        }
    }

    const finalMovePercent = ((finalPrice - signalPrice) / signalPrice) * 100;
    const finalDirectionalMove = finalMovePercent * directionMultiplier;
    const significanceThreshold = horizonConfig.significanceThreshold;

    // LABELING LOGIC (Deterministic):
    // 1. CONTINUATION = price moved in predicted direction beyond threshold
    // 2. REVERSAL = price moved AGAINST predicted direction beyond threshold
    // 3. NOISE = no significant move in either direction

    let label;
    let reason;

    if (finalDirectionalMove >= significanceThreshold) {
        // Price moved in predicted direction
        label = OUTCOME_LABELS.CONTINUATION;
        reason = `Price moved ${finalDirectionalMove.toFixed(2)}% in predicted direction (${bias})`;
    } else if (finalDirectionalMove <= -significanceThreshold) {
        // Price moved against predicted direction
        label = OUTCOME_LABELS.REVERSAL;
        reason = `Price reversed ${Math.abs(finalDirectionalMove).toFixed(2)}% against ${bias} prediction`;
    } else {
        // No significant move
        label = OUTCOME_LABELS.NOISE;
        reason = `Price moved only ${finalDirectionalMove.toFixed(2)}%, below ${significanceThreshold}% threshold`;
    }

    return {
        label,
        reason,
        horizon,
        bias,
        confidence,
        signalPrice,
        finalPrice,
        finalMovePercent: Number(finalMovePercent.toFixed(2)),
        maxFavorableExcursion: Number(maxFavorable.toFixed(2)),
        maxAdverseExcursion: Number(Math.abs(maxAdverse).toFixed(2)),
        significanceThreshold,
        candlesAnalyzed: futurePrices.length
    };
}

/**
 * Calculate outcome for WAIT signals.
 * WAIT is considered CORRECT if:
 * - Market was choppy (high volatility, low directionality)
 * - OR no significant directional move occurred
 * 
 * WAIT is considered INCORRECT if:
 * - Market had a clear directional move that could have been captured
 */
function calculateWaitOutcome(signalPrice, futurePrices, horizonConfig) {
    const finalPrice = futurePrices[futurePrices.length - 1];
    const significanceThreshold = horizonConfig.significanceThreshold;

    // Calculate range (volatility proxy)
    let maxPrice = signalPrice;
    let minPrice = signalPrice;

    for (const price of futurePrices) {
        if (price > maxPrice) maxPrice = price;
        if (price < minPrice) minPrice = price;
    }

    const rangePercent = ((maxPrice - minPrice) / signalPrice) * 100;
    const finalMovePercent = ((finalPrice - signalPrice) / signalPrice) * 100;
    const absoluteMove = Math.abs(finalMovePercent);

    // Directionality score: how much of the range was directional vs choppy?
    // High directionality = final move captures most of the range
    // Low directionality = choppy, final move << range
    const directionality = rangePercent > 0 ? absoluteMove / rangePercent : 0;

    let label;
    let reason;

    if (absoluteMove >= significanceThreshold * 1.5 && directionality > 0.6) {
        // There was a clear trending move - WAIT missed an opportunity
        // This is an "incorrect WAIT" but we label it as CONTINUATION (there WAS a move)
        label = OUTCOME_LABELS.CONTINUATION;
        reason = `WAIT during trending move: ${absoluteMove.toFixed(2)}% move with ${(directionality * 100).toFixed(0)}% directionality`;
    } else if (rangePercent > significanceThreshold * 2 && directionality < 0.4) {
        // High volatility but low directionality = correct WAIT (chop)
        label = OUTCOME_LABELS.NOISE;
        reason = `Correct WAIT: High volatility (${rangePercent.toFixed(2)}% range) but choppy (${(directionality * 100).toFixed(0)}% directionality)`;
    } else if (absoluteMove < significanceThreshold) {
        // No significant move either way - WAIT was correct
        label = OUTCOME_LABELS.NOISE;
        reason = `Correct WAIT: No significant move (${absoluteMove.toFixed(2)}% < ${significanceThreshold}% threshold)`;
    } else {
        // Some move but moderate - neutral WAIT
        label = OUTCOME_LABELS.NOISE;
        reason = `Ambiguous: ${absoluteMove.toFixed(2)}% move with ${(directionality * 100).toFixed(0)}% directionality`;
    }

    return {
        label,
        reason,
        horizon: horizonConfig.name,
        bias: 'WAIT',
        confidence: null,
        signalPrice,
        finalPrice,
        finalMovePercent: Number(finalMovePercent.toFixed(2)),
        rangePercent: Number(rangePercent.toFixed(2)),
        directionality: Number(directionality.toFixed(2)),
        significanceThreshold,
        candlesAnalyzed: futurePrices.length,
        // Special fields for WAIT analysis
        waitCorrect: label === OUTCOME_LABELS.NOISE
    };
}

/**
 * =======================================================================
 * BATCH LABELING FUNCTIONS
 * =======================================================================
 */

/**
 * Label multiple market states with outcomes.
 * Used for backtesting and historical analysis.
 * 
 * @param {Array} marketStates - Array of market state objects with timestamps
 * @param {Array} priceHistory - Complete price history covering all states + horizons
 * @param {string} horizon - Horizon to evaluate (SCALPING, MICRO, MACRO)
 * @returns {Array} Market states with outcome labels attached
 */
function labelMarketStates(marketStates, priceHistory, horizon) {
    const horizonConfig = TIME_HORIZONS[horizon];
    if (!horizonConfig) {
        throw new Error(`Invalid horizon: ${horizon}`);
    }

    // Sort price history by timestamp for binary search
    const sortedPrices = [...priceHistory].sort((a, b) => a.time - b.time);

    const labeledStates = [];

    for (const state of marketStates) {
        const stateTimestamp = state.timestamp;

        // Find future prices after this state's timestamp
        const futurePrices = extractFuturePrices(
            sortedPrices,
            stateTimestamp,
            horizonConfig.maxMinutes
        );

        // Calculate outcome
        const outcome = calculateOutcomeLabel(state, futurePrices, horizon);

        // Attach outcome to state
        labeledStates.push({
            ...state,
            outcome: {
                ...outcome,
                labeledAt: Date.now(),
                horizonUsed: horizon
            }
        });
    }

    return labeledStates;
}

/**
 * Extract future prices from price history starting from a given timestamp.
 * 
 * @param {Array} sortedPrices - Sorted array of {time, close/price} objects
 * @param {number} fromTimestamp - Start timestamp (state time)
 * @param {number} maxMinutes - Maximum minutes to look ahead
 * @returns {Array} Array of prices (just the values)
 */
function extractFuturePrices(sortedPrices, fromTimestamp, maxMinutes) {
    const maxTimestamp = fromTimestamp + (maxMinutes * 60 * 1000);
    const futurePrices = [];

    for (const candle of sortedPrices) {
        // Only include prices AFTER the state timestamp
        if (candle.time > fromTimestamp && candle.time <= maxTimestamp) {
            futurePrices.push(candle.close || candle.price);
        }
    }

    return futurePrices;
}

/**
 * =======================================================================
 * VALIDATION HELPERS
 * =======================================================================
 */

/**
 * Check if a market state has sufficient data to be labeled.
 * 
 * @param {Object} marketState - The market state to validate
 * @returns {Object} { valid: boolean, reason: string }
 */
function validateStateForLabeling(marketState) {
    if (!marketState) {
        return { valid: false, reason: 'Market state is null or undefined' };
    }

    if (!marketState.timestamp) {
        return { valid: false, reason: 'Market state missing timestamp' };
    }

    if (!marketState.finalDecision) {
        return { valid: false, reason: 'Market state missing finalDecision' };
    }

    if (!marketState.finalDecision.bias) {
        return { valid: false, reason: 'Market state missing bias in finalDecision' };
    }

    // Check for reference price
    const hasPrice =
        marketState.raw?.binance?.['4h']?.price ||
        marketState.raw?.binance?.['1h']?.price ||
        marketState.exchangeDivergence?.binance?.price;

    if (!hasPrice) {
        return { valid: false, reason: 'Market state missing reference price' };
    }

    return { valid: true, reason: null };
}

/**
 * =======================================================================
 * SUMMARY STATISTICS
 * =======================================================================
 */

/**
 * Calculate summary statistics for a set of labeled states.
 * 
 * @param {Array} labeledStates - Array of states with outcome labels attached
 * @returns {Object} Summary statistics
 */
function calculateLabelingSummary(labeledStates) {
    const summary = {
        total: labeledStates.length,
        byLabel: {
            [OUTCOME_LABELS.CONTINUATION]: 0,
            [OUTCOME_LABELS.REVERSAL]: 0,
            [OUTCOME_LABELS.NOISE]: 0,
            [OUTCOME_LABELS.PENDING]: 0
        },
        byBias: {
            LONG: { total: 0, continuation: 0, reversal: 0, noise: 0 },
            SHORT: { total: 0, continuation: 0, reversal: 0, noise: 0 },
            WAIT: { total: 0, correct: 0, incorrect: 0 }
        },
        directionalAccuracy: null,
        waitCorrectRate: null
    };

    for (const state of labeledStates) {
        const outcome = state.outcome;
        if (!outcome) continue;

        // Count by label
        if (summary.byLabel[outcome.label] !== undefined) {
            summary.byLabel[outcome.label]++;
        }

        // Count by bias
        const bias = outcome.bias;
        if (bias === 'LONG' || bias === 'BULLISH') {
            summary.byBias.LONG.total++;
            if (outcome.label === OUTCOME_LABELS.CONTINUATION) summary.byBias.LONG.continuation++;
            if (outcome.label === OUTCOME_LABELS.REVERSAL) summary.byBias.LONG.reversal++;
            if (outcome.label === OUTCOME_LABELS.NOISE) summary.byBias.LONG.noise++;
        } else if (bias === 'SHORT' || bias === 'BEARISH') {
            summary.byBias.SHORT.total++;
            if (outcome.label === OUTCOME_LABELS.CONTINUATION) summary.byBias.SHORT.continuation++;
            if (outcome.label === OUTCOME_LABELS.REVERSAL) summary.byBias.SHORT.reversal++;
            if (outcome.label === OUTCOME_LABELS.NOISE) summary.byBias.SHORT.noise++;
        } else if (bias === 'WAIT' || bias === 'NEUTRAL') {
            summary.byBias.WAIT.total++;
            if (outcome.waitCorrect) {
                summary.byBias.WAIT.correct++;
            } else {
                summary.byBias.WAIT.incorrect++;
            }
        }
    }

    // Calculate directional accuracy
    // = (Long continuations + Short continuations) / (Total directional signals)
    const totalDirectional = summary.byBias.LONG.total + summary.byBias.SHORT.total;
    const totalContinuations = summary.byBias.LONG.continuation + summary.byBias.SHORT.continuation;

    if (totalDirectional > 0) {
        summary.directionalAccuracy = Number(((totalContinuations / totalDirectional) * 100).toFixed(1));
    }

    // Calculate WAIT correct rate
    if (summary.byBias.WAIT.total > 0) {
        summary.waitCorrectRate = Number(
            ((summary.byBias.WAIT.correct / summary.byBias.WAIT.total) * 100).toFixed(1)
        );
    }

    return summary;
}

/**
 * =======================================================================
 * EXPORTS
 * =======================================================================
 */

module.exports = {
    // Core labeling
    calculateOutcomeLabel,
    labelMarketStates,

    // Helpers
    extractFuturePrices,
    validateStateForLabeling,
    calculateLabelingSummary,

    // Constants
    OUTCOME_LABELS,
    TIME_HORIZONS
};
