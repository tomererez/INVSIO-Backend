// src/backtest/scoreboardService.js - Stage 3: Scoreboard & Metrics Aggregation
// Aggregates labeled replay states into quality metrics for calibration
//
// Metrics Generated:
// - Accuracy by bias (LONG/SHORT/WAIT)
// - Accuracy by confidence bucket (0-3, 3-6, 6-8, 8-10)
// - WAIT correctness rate (correct WAIT in NOISE)
// - Performance by regime/scenario
// - Labeled vs pending counts

const stateStorage = require('../services/stateStorage');
const logger = require('../utils/logger');

/**
 * =======================================================================
 * CONFIDENCE BUCKETS
 * =======================================================================
 */

const CONFIDENCE_BUCKETS = [
    { name: '0-3', min: 0, max: 3 },
    { name: '3-6', min: 3, max: 6 },
    { name: '6-8', min: 6, max: 8 },
    { name: '8-10', min: 8, max: 10 }
];

/**
 * Get the bucket name for a confidence value
 */
function getConfidenceBucket(confidence) {
    for (const bucket of CONFIDENCE_BUCKETS) {
        if (confidence >= bucket.min && confidence < bucket.max) {
            return bucket.name;
        }
    }
    // Handle edge case of exactly 10
    if (confidence >= 10) return '8-10';
    return '0-3';
}

/**
 * =======================================================================
 * MAIN SCOREBOARD FUNCTIONS
 * =======================================================================
 */

/**
 * Get comprehensive scoreboard metrics
 * 
 * @param {Object} options
 * @param {string} options.batchId - Optional: filter to specific batch
 * @param {number} options.fromDate - Optional: start timestamp
 * @param {number} options.toDate - Optional: end timestamp
 * @param {string} options.symbol - Symbol to filter (default: BTC)
 */
async function getScoreboard(options = {}) {
    const {
        batchId,
        fromDate,
        toDate,
        symbol = 'BTC'
    } = options;

    const client = stateStorage.getSupabase();
    if (!client) {
        return { success: false, error: 'Database not configured' };
    }

    try {
        // Build query for labeled states (from replay_states table)
        let query = client
            .from('replay_states')
            .select('*')
            .eq('symbol', symbol)
            .eq('status', 'COMPLETED')
            .not('outcome_label', 'is', null);

        if (batchId) {
            query = query.eq('batch_id', batchId);
        }
        if (fromDate) {
            query = query.gte('timestamp', fromDate);
        }
        if (toDate) {
            query = query.lte('timestamp', toDate);
        }

        const { data: labeledStates, error } = await query;

        if (error) {
            logger.error('Error fetching labeled states:', error);
            return { success: false, error: error.message };
        }

        if (!labeledStates || labeledStates.length === 0) {
            return {
                success: true,
                totalStates: 0,
                labeledStates: 0,
                message: 'No labeled states found'
            };
        }

        // Count pending (unlabeled) states from replay_states
        let pendingQuery = client
            .from('replay_states')
            .select('*', { count: 'exact', head: true })
            .eq('symbol', symbol)
            .eq('status', 'COMPLETED')
            .is('outcome_label', null);

        if (batchId) {
            pendingQuery = pendingQuery.eq('batch_id', batchId);
        }

        const { count: pendingCount } = await pendingQuery;

        // Calculate all metrics
        const scoreboard = {
            success: true,
            totalStates: labeledStates.length + (pendingCount || 0),
            labeledStates: labeledStates.length,
            pendingStates: pendingCount || 0,

            // Core accuracy metrics
            accuracyByBias: calculateAccuracyByBias(labeledStates),
            accuracyByConfidence: calculateAccuracyByConfidence(labeledStates),

            // WAIT analysis
            waitCorrectness: calculateWaitCorrectness(labeledStates),

            // Regime/scenario performance
            performanceByRegime: calculatePerformanceByRegime(labeledStates),
            performanceByScenario: calculatePerformanceByScenario(labeledStates),

            // Outcome distribution
            outcomeDistribution: calculateOutcomeDistribution(labeledStates),

            // Overall statistics
            overallStats: calculateOverallStats(labeledStates),

            // Directional accuracy (LONG vs SHORT breakdown)
            directionalAccuracy: calculateDirectionalAccuracy(labeledStates),

            // Confidence calibration analysis
            confidenceCalibration: analyzeConfidenceCalibration(labeledStates),

            // Phase 9: New metrics
            regimeExpectations: validateRegimeExpectations(labeledStates),
            waitEffectiveness: calculateWaitEffectiveness(labeledStates),
            failureAnalysis: analyzeFailureReasons(labeledStates),

            // Enhancement 2-3: Timeframe and Alignment
            timeframeAccuracy: calculateAccuracyByTimeframe(labeledStates),
            alignmentAccuracy: calculateAlignmentAccuracy(labeledStates)
        };

        return scoreboard;

    } catch (error) {
        logger.error('Error generating scoreboard:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Calculate accuracy grouped by bias (LONG/SHORT/WAIT)
 */
function calculateAccuracyByBias(states) {
    const result = {
        LONG: { total: 0, correct: 0, accuracy: 0 },
        SHORT: { total: 0, correct: 0, accuracy: 0 },
        WAIT: { total: 0, correct: 0, accuracy: 0 }
    };

    for (const state of states) {
        const bias = state.bias;
        const outcome = state.outcome_label;

        if (!result[bias]) continue;

        result[bias].total++;

        // Determine correctness
        // LONG/SHORT are "correct" if outcome is CONTINUATION
        // WAIT is "correct" if outcome is NOISE
        const isCorrect =
            (bias !== 'WAIT' && outcome === 'CONTINUATION') ||
            (bias === 'WAIT' && outcome === 'NOISE');

        if (isCorrect) {
            result[bias].correct++;
        }
    }

    // Calculate percentages
    for (const bias in result) {
        if (result[bias].total > 0) {
            result[bias].accuracy = Number(
                ((result[bias].correct / result[bias].total) * 100).toFixed(1)
            );
        }
    }

    return result;
}

/**
 * Calculate accuracy grouped by confidence bucket
 */
function calculateAccuracyByConfidence(states) {
    const result = {};

    for (const bucket of CONFIDENCE_BUCKETS) {
        result[bucket.name] = { total: 0, correct: 0, accuracy: 0 };
    }

    for (const state of states) {
        const confidence = state.confidence || 0;
        const bucketName = getConfidenceBucket(confidence);
        const outcome = state.outcome_label;
        const bias = state.bias;

        if (!result[bucketName]) continue;

        result[bucketName].total++;

        // Correctness: directional signals → CONTINUATION, WAIT → NOISE
        const isCorrect =
            (bias !== 'WAIT' && outcome === 'CONTINUATION') ||
            (bias === 'WAIT' && outcome === 'NOISE');

        if (isCorrect) {
            result[bucketName].correct++;
        }
    }

    // Calculate percentages
    for (const bucket in result) {
        if (result[bucket].total > 0) {
            result[bucket].accuracy = Number(
                ((result[bucket].correct / result[bucket].total) * 100).toFixed(1)
            );
        }
    }

    return result;
}

/**
 * Calculate WAIT correctness (WAIT is correct when outcome is NOISE)
 */
function calculateWaitCorrectness(states) {
    const waitStates = states.filter(s => s.bias === 'WAIT');

    if (waitStates.length === 0) {
        return { total: 0, correctInNoise: 0, rate: 0 };
    }

    const correctWaits = waitStates.filter(s => s.outcome_label === 'NOISE');

    return {
        total: waitStates.length,
        correctInNoise: correctWaits.length,
        rate: Number(((correctWaits.length / waitStates.length) * 100).toFixed(1))
    };
}

/**
 * Calculate directional accuracy (LONG vs SHORT breakdown with WAIT tracking)
 * Fix #2: Provides explicit LONG/SHORT comparison for bias tuning
 */
function calculateDirectionalAccuracy(states) {
    const labeled = states.filter(s => s.outcome_label);

    const longSignals = labeled.filter(s => s.bias === 'LONG');
    const shortSignals = labeled.filter(s => s.bias === 'SHORT');
    const waitSignals = labeled.filter(s => s.bias === 'WAIT');

    const longCorrect = longSignals.filter(s => s.outcome_label === 'CONTINUATION').length;
    const shortCorrect = shortSignals.filter(s => s.outcome_label === 'CONTINUATION').length;

    const longAccuracy = longSignals.length > 0 ? Number(((longCorrect / longSignals.length) * 100).toFixed(1)) : null;
    const shortAccuracy = shortSignals.length > 0 ? Number(((shortCorrect / shortSignals.length) * 100).toFixed(1)) : null;

    // Calculate imbalance - flag if one direction has significantly fewer samples
    const directionalImbalance = longSignals.length > 0 && shortSignals.length > 0
        ? Math.abs(longSignals.length - shortSignals.length) > Math.max(longSignals.length, shortSignals.length) * 0.5
        : true; // Imbalanced if one direction has zero signals

    // Calculate accuracy gap
    const accuracyGap = (longAccuracy !== null && shortAccuracy !== null)
        ? Number((longAccuracy - shortAccuracy).toFixed(1))
        : null;

    return {
        longCount: longSignals.length,
        longCorrect,
        longAccuracy,
        shortCount: shortSignals.length,
        shortCorrect,
        shortAccuracy,
        waitCount: waitSignals.length,
        waitPct: labeled.length > 0 ? Number(((waitSignals.length / labeled.length) * 100).toFixed(1)) : 0,
        directionalImbalance,
        accuracyGap,
        interpretation: directionalImbalance
            ? 'Warning: Imbalanced signals - need more data for reliable comparison'
            : accuracyGap !== null && Math.abs(accuracyGap) > 10
                ? `Gap detected: ${accuracyGap > 0 ? 'LONG' : 'SHORT'} outperforms by ${Math.abs(accuracyGap)}%`
                : 'Balanced: LONG and SHORT perform similarly'
    };
}

/**
 * Calculate performance grouped by regime
 */
function calculatePerformanceByRegime(states) {
    const result = {};

    for (const state of states) {
        const regime = state.primary_regime || state.regime_state || 'unknown';
        const outcome = state.outcome_label;
        const bias = state.bias;

        if (!result[regime]) {
            result[regime] = { total: 0, correct: 0, accuracy: 0 };
        }

        result[regime].total++;

        const isCorrect =
            (bias !== 'WAIT' && outcome === 'CONTINUATION') ||
            (bias === 'WAIT' && outcome === 'NOISE');

        if (isCorrect) {
            result[regime].correct++;
        }
    }

    // Calculate percentages
    for (const regime in result) {
        if (result[regime].total > 0) {
            result[regime].accuracy = Number(
                ((result[regime].correct / result[regime].total) * 100).toFixed(1)
            );
        }
    }

    return result;
}

/**
 * Calculate performance grouped by exchange scenario
 */
function calculatePerformanceByScenario(states) {
    const result = {};

    for (const state of states) {
        const scenario = state.exchange_scenario || 'unknown';
        const outcome = state.outcome_label;
        const bias = state.bias;

        if (!result[scenario]) {
            result[scenario] = { total: 0, correct: 0, accuracy: 0 };
        }

        result[scenario].total++;

        const isCorrect =
            (bias !== 'WAIT' && outcome === 'CONTINUATION') ||
            (bias === 'WAIT' && outcome === 'NOISE');

        if (isCorrect) {
            result[scenario].correct++;
        }
    }

    // Calculate percentages
    for (const scenario in result) {
        if (result[scenario].total > 0) {
            result[scenario].accuracy = Number(
                ((result[scenario].correct / result[scenario].total) * 100).toFixed(1)
            );
        }
    }

    return result;
}

/**
 * Calculate outcome distribution
 */
function calculateOutcomeDistribution(states) {
    const result = {
        CONTINUATION: 0,
        REVERSAL: 0,
        NOISE: 0
    };

    for (const state of states) {
        const outcome = state.outcome_label;
        if (result[outcome] !== undefined) {
            result[outcome]++;
        }
    }

    const total = states.length;

    return {
        counts: result,
        percentages: {
            CONTINUATION: total > 0 ? Number(((result.CONTINUATION / total) * 100).toFixed(1)) : 0,
            REVERSAL: total > 0 ? Number(((result.REVERSAL / total) * 100).toFixed(1)) : 0,
            NOISE: total > 0 ? Number(((result.NOISE / total) * 100).toFixed(1)) : 0
        }
    };
}

/**
 * Calculate overall statistics
 */
function calculateOverallStats(states) {
    if (states.length === 0) {
        return {
            totalSignals: 0,
            directionalSignals: 0,
            waitSignals: 0,
            overallAccuracy: 0,
            directionalAccuracy: 0
        };
    }

    const directionalStates = states.filter(s => s.bias !== 'WAIT');
    const waitStates = states.filter(s => s.bias === 'WAIT');

    const directionalCorrect = directionalStates.filter(s => s.outcome_label === 'CONTINUATION').length;
    const waitCorrect = waitStates.filter(s => s.outcome_label === 'NOISE').length;

    const totalCorrect = directionalCorrect + waitCorrect;

    return {
        totalSignals: states.length,
        directionalSignals: directionalStates.length,
        waitSignals: waitStates.length,
        overallAccuracy: Number(((totalCorrect / states.length) * 100).toFixed(1)),
        directionalAccuracy: directionalStates.length > 0
            ? Number(((directionalCorrect / directionalStates.length) * 100).toFixed(1))
            : 0
    };
}

/**
 * Analyze confidence calibration (does higher confidence = better accuracy?)
 * Fix #3: Added minimum sample size filter to avoid noise from small buckets
 */
function analyzeConfidenceCalibration(states) {
    const bucketAccuracies = calculateAccuracyByConfidence(states);

    // Get all bucket values with their data
    const allBucketValues = Object.entries(bucketAccuracies)
        .filter(([_, data]) => data.total > 0)
        .map(([bucket, data]) => ({
            bucket,
            accuracy: data.accuracy,
            total: data.total,
            hasMinSamples: data.total >= 5 // Flag buckets with sufficient samples
        }))
        .sort((a, b) => a.bucket.localeCompare(b.bucket));

    // For monotonicity check, only use buckets with >= 5 samples
    const validBucketValues = allBucketValues.filter(b => b.hasMinSamples);

    let isMonotonic = false;
    let correlation = null;

    // Need at least 2 valid buckets to check monotonicity
    if (validBucketValues.length >= 2) {
        // Check if each bucket has higher accuracy than the previous
        isMonotonic = validBucketValues.every((v, i, arr) =>
            i === 0 || v.accuracy >= arr[i - 1].accuracy
        );

        // Simple correlation: compare first and last bucket
        const firstBucket = validBucketValues[0];
        const lastBucket = validBucketValues[validBucketValues.length - 1];

        if (firstBucket && lastBucket) {
            correlation = lastBucket.accuracy - firstBucket.accuracy;
        }
    }

    // Calculate how many buckets have insufficient samples
    const insufficientSamples = allBucketValues.filter(b => !b.hasMinSamples).length;

    return {
        isMonotonic,
        correlation: correlation !== null ? Number(correlation.toFixed(1)) : null,
        bucketBreakdown: allBucketValues,
        validBucketsCount: validBucketValues.length,
        insufficientSamplesCount: insufficientSamples,
        interpretation: validBucketValues.length < 2
            ? 'Insufficient data: Need at least 2 buckets with 5+ samples each'
            : isMonotonic
                ? '✓ Well calibrated: Higher confidence correlates with better accuracy'
                : correlation > 0
                    ? '⚠ Partial: Generally higher confidence is better, but not perfectly monotonic'
                    : '⚠ Mis-calibrated: Confidence scores may not predict accuracy well'
    };
}

/**
 * =======================================================================
 * FIX 4: REGIME EXPECTATION VALIDATION
 * =======================================================================
 * Check if regime-bias alignment matches expected outcomes
 */

const REGIME_EXPECTATIONS = {
    distribution: 'SHORT',
    accumulation: 'LONG',
    healthy_bull: 'LONG',
    healthy_bear: 'SHORT',
    long_trap: 'SHORT',
    short_trap: 'LONG',
    short_squeeze: 'LONG',
    long_squeeze: 'SHORT'
};

function validateRegimeExpectations(states) {
    const regimeResults = {};

    for (const state of states) {
        const regime = state.primary_regime || state.regime_state || 'unknown';
        const bias = state.bias;
        const outcome = state.outcome_label;

        if (!regimeResults[regime]) {
            regimeResults[regime] = {
                total: 0,
                expectedBias: REGIME_EXPECTATIONS[regime] || null,
                correctBias: 0,
                correctOutcome: 0,
                biasMatches: 0
            };
        }

        regimeResults[regime].total++;

        // Check if bias matched expectation
        const expected = REGIME_EXPECTATIONS[regime];
        if (expected && bias === expected) {
            regimeResults[regime].biasMatches++;
        }

        // Check if outcome was correct
        const isCorrect =
            (bias !== 'WAIT' && outcome === 'CONTINUATION') ||
            (bias === 'WAIT' && outcome === 'NOISE');

        if (isCorrect) {
            regimeResults[regime].correctOutcome++;
        }

        // Check if correct bias led to correct outcome
        if (expected && bias === expected && isCorrect) {
            regimeResults[regime].correctBias++;
        }
    }

    // Calculate percentages and identify issues
    const issues = [];
    for (const regime in regimeResults) {
        const r = regimeResults[regime];
        if (r.total > 0) {
            r.biasMatchRate = Number(((r.biasMatches / r.total) * 100).toFixed(1));
            r.outcomeAccuracy = Number(((r.correctOutcome / r.total) * 100).toFixed(1));
            r.biasAccuracy = r.biasMatches > 0
                ? Number(((r.correctBias / r.biasMatches) * 100).toFixed(1))
                : 0;

            // Flag problematic regimes
            if (r.expectedBias && r.biasMatches >= 5 && r.biasAccuracy < 50) {
                issues.push(`${regime}: Expected bias ${r.expectedBias} has only ${r.biasAccuracy}% accuracy`);
            }
        }
    }

    return {
        byRegime: regimeResults,
        issues,
        hasIssues: issues.length > 0
    };
}

/**
 * =======================================================================
 * FIX 5: WAIT EFFECTIVENESS METRIC
 * =======================================================================
 * WAIT should identify dangerous/choppy periods. If WAIT periods are calmer
 * than trade periods, the WAIT logic is inverted.
 */

function calculateWaitEffectiveness(states) {
    const waitStates = states.filter(s =>
        s.bias === 'WAIT' &&
        s.outcome_move_pct !== null &&
        s.outcome_move_pct !== undefined
    );
    const tradeStates = states.filter(s =>
        ['LONG', 'SHORT'].includes(s.bias) &&
        s.outcome_move_pct !== null &&
        s.outcome_move_pct !== undefined
    );

    if (waitStates.length === 0 || tradeStates.length === 0) {
        return {
            waitVolatility: null,
            tradeVolatility: null,
            effectivenessRatio: null,
            isEffective: null,
            warning: 'Insufficient data: Need both WAIT and trade states with outcome data'
        };
    }

    // Calculate average absolute move during each period
    const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;

    const waitMoves = waitStates.map(s => Math.abs(s.outcome_move_pct));
    const tradeMoves = tradeStates.map(s => Math.abs(s.outcome_move_pct));

    const waitVolatility = Number(avg(waitMoves).toFixed(2));
    const tradeVolatility = Number(avg(tradeMoves).toFixed(2));
    const effectivenessRatio = Number((waitVolatility / tradeVolatility).toFixed(2));

    // Also check MFE/MAE if available
    const waitMAE = waitStates.filter(s => s.outcome_mae != null).map(s => Math.abs(s.outcome_mae));
    const tradeMAE = tradeStates.filter(s => s.outcome_mae != null).map(s => Math.abs(s.outcome_mae));

    const avgWaitMAE = waitMAE.length > 0 ? Number(avg(waitMAE).toFixed(2)) : null;
    const avgTradeMAE = tradeMAE.length > 0 ? Number(avg(tradeMAE).toFixed(2)) : null;

    // WAIT is effective if WAIT periods have higher volatility/oscillation
    // Ratio > 0.8 means WAIT periods are at least 80% as volatile (flagging risky periods)
    const isEffective = effectivenessRatio >= 0.8;

    let warning = null;
    if (effectivenessRatio < 0.5) {
        warning = 'WAIT logic inverted: WAIT periods are much calmer than trade periods. WAIT is filtering out good opportunities.';
    } else if (effectivenessRatio < 0.8) {
        warning = 'WAIT may be too conservative: WAIT periods are calmer than trade periods.';
    }

    return {
        waitCount: waitStates.length,
        tradeCount: tradeStates.length,
        waitVolatility,
        tradeVolatility,
        effectivenessRatio,
        avgWaitMAE,
        avgTradeMAE,
        isEffective,
        warning,
        interpretation: isEffective
            ? '✓ WAIT is correctly identifying risky/choppy periods'
            : '⚠ WAIT may be filtering out good trading opportunities'
    };
}

/**
 * =======================================================================
 * FIX 6: ERROR BUCKETING (Failure Reason Analysis)
 * =======================================================================
 * When signals fail (REVERSAL outcome), categorize WHY they failed.
 */

const FAILURE_CATEGORIES = {
    REGIME_MISREAD: 'Detected wrong regime',
    CVD_MISLEADING: 'CVD pointed wrong direction',
    FUNDING_MISS: 'Funding extreme didnt cause reversal',
    STRUCTURE_FALSE: 'Break of structure that wasnt real',
    OI_MISINTERPRETATION: 'OI signal was wrong',
    TIMEFRAME_CONFLICT: 'Lower TF overrode correct macro signal',
    DATA_QUALITY: 'Stale or unreliable data',
    UNKNOWN: 'Unknown failure reason'
};

function classifyFailure(state, fullState) {
    // Extract signals from full state JSON if available
    const fs = fullState || state.full_state_json || {};
    const finalDecision = fs.finalDecision || {};
    const bias = state.bias;

    // Check for timeframe conflict
    const macroAnchored = state.macro_anchored;
    if (bias !== 'WAIT' && macroAnchored === false) {
        // Signal went against macro - could be timeframe conflict
        return 'TIMEFRAME_CONFLICT';
    }

    // Check CVD direction mismatch
    const cvdSignal = finalDecision.cvdSignal || fs.cvd?.interpretation?.bias;
    if (cvdSignal) {
        if ((bias === 'LONG' && cvdSignal === 'SHORT') ||
            (bias === 'SHORT' && cvdSignal === 'LONG')) {
            return 'CVD_MISLEADING';
        }
    }

    // Check regime expectation mismatch
    const regime = state.primary_regime || state.regime_state;
    const expectedBias = REGIME_EXPECTATIONS[regime];
    if (expectedBias && bias !== expectedBias && bias !== 'WAIT') {
        return 'REGIME_MISREAD';
    }

    // Check funding extremes
    const funding = state.funding_rate;
    if (funding !== null) {
        const isExtremeFunding = Math.abs(funding) > 0.05;
        if (isExtremeFunding) {
            // We expected a funding-driven reversal that didn't happen
            return 'FUNDING_MISS';
        }
    }

    // Check for low confidence (potential data quality issue)
    const confidence = state.confidence;
    if (confidence !== null && confidence < 3) {
        return 'DATA_QUALITY';
    }

    return 'UNKNOWN';
}

function analyzeFailureReasons(states) {
    const failures = states.filter(s => s.outcome_label === 'REVERSAL' && s.bias !== 'WAIT');

    if (failures.length === 0) {
        return {
            totalFailures: 0,
            byCategory: {},
            dominantFailure: null,
            dominantCount: 0,
            message: 'No failures to analyze (or all signals are WAIT)'
        };
    }

    const categories = {};

    for (const state of failures) {
        const category = classifyFailure(state, state.full_state_json);
        categories[category] = (categories[category] || 0) + 1;
    }

    // Sort by count descending
    const sorted = Object.entries(categories).sort((a, b) => b[1] - a[1]);

    // Build breakdown with descriptions
    const breakdown = {};
    for (const [cat, count] of sorted) {
        breakdown[cat] = {
            count,
            percentage: Number(((count / failures.length) * 100).toFixed(1)),
            description: FAILURE_CATEGORIES[cat] || cat
        };
    }

    return {
        totalFailures: failures.length,
        byCategory: breakdown,
        dominantFailure: sorted[0]?.[0] || null,
        dominantCount: sorted[0]?.[1] || 0,
        dominantPercentage: sorted[0] ? Number(((sorted[0][1] / failures.length) * 100).toFixed(1)) : 0,
        recommendation: sorted[0]
            ? `Focus on fixing ${sorted[0][0]}: ${FAILURE_CATEGORIES[sorted[0][0]] || 'Unknown issue'}`
            : null
    };
}

/**
 * =======================================================================
 * ENHANCEMENT 2: Multi-Timeframe Accuracy Breakdown
 * =======================================================================
 * Calculate accuracy per timeframe (30m, 1h, 4h, 1d)
 */

function calculateAccuracyByTimeframe(states) {
    const result = {};

    for (const state of states) {
        const timeframe = state.timeframe || 'unknown';
        const outcome = state.outcome_label;
        const bias = state.bias;

        if (!result[timeframe]) {
            result[timeframe] = { total: 0, correct: 0, accuracy: 0 };
        }

        result[timeframe].total++;

        const isCorrect =
            (bias !== 'WAIT' && outcome === 'CONTINUATION') ||
            (bias === 'WAIT' && outcome === 'NOISE');

        if (isCorrect) {
            result[timeframe].correct++;
        }
    }

    // Calculate percentages and find best/worst
    let best = null;
    let worst = null;

    for (const tf in result) {
        if (result[tf].total >= 5) {  // Minimum sample size
            result[tf].accuracy = Number(
                ((result[tf].correct / result[tf].total) * 100).toFixed(1)
            );

            if (!best || result[tf].accuracy > result[best].accuracy) {
                best = tf;
            }
            if (!worst || result[tf].accuracy < result[worst].accuracy) {
                worst = tf;
            }
        }
    }

    return {
        byTimeframe: result,
        bestTimeframe: best,
        worstTimeframe: worst,
        recommendation: best && worst && best !== worst
            ? `${best} performs best (${result[best]?.accuracy}%), ${worst} needs attention (${result[worst]?.accuracy}%)`
            : null
    };
}

/**
 * =======================================================================
 * ENHANCEMENT 3: Bucket Alignment Tracking
 * =======================================================================
 * Track accuracy when MACRO+MICRO+(SCALPING) all agree vs conflict
 */

function calculateAlignmentAccuracy(states) {
    const aligned = { total: 0, correct: 0, accuracy: 0 };
    const conflicted = { total: 0, correct: 0, accuracy: 0 };

    for (const state of states) {
        const outcome = state.outcome_label;
        const bias = state.bias;

        // Extract hierarchy biases from state or full_state_json
        const macroBias = state.macro_bias;
        const microBias = state.micro_bias || bias;
        const scalpingBias = state.scalping_bias;

        // Determine if aligned (all non-null biases match, or at least MACRO+MICRO match)
        const biases = [macroBias, microBias, scalpingBias].filter(b =>
            b && b !== 'WAIT' && b !== 'undefined'
        );

        const uniqueBiases = [...new Set(biases)];
        const isAligned = uniqueBiases.length <= 1;  // All agree or only one direction

        const isCorrect =
            (bias !== 'WAIT' && outcome === 'CONTINUATION') ||
            (bias === 'WAIT' && outcome === 'NOISE');

        if (isAligned) {
            aligned.total++;
            if (isCorrect) aligned.correct++;
        } else {
            conflicted.total++;
            if (isCorrect) conflicted.correct++;
        }
    }

    // Calculate accuracies
    aligned.accuracy = aligned.total > 0
        ? Number(((aligned.correct / aligned.total) * 100).toFixed(1))
        : 0;
    conflicted.accuracy = conflicted.total > 0
        ? Number(((conflicted.correct / conflicted.total) * 100).toFixed(1))
        : 0;

    const gap = aligned.accuracy - conflicted.accuracy;

    return {
        aligned,
        conflicted,
        alignmentBoost: Number(gap.toFixed(1)),
        isWorking: gap > 0,
        interpretation: gap > 10
            ? '✓ Strong: Aligned signals perform much better than conflicted'
            : gap > 0
                ? '⚠ Moderate: Alignment helps but gap is small'
                : '⚠ Issue: Conflicted signals perform as well or better than aligned'
    };
}

/**
 * =======================================================================
 * ENHANCEMENT 4: Baseline Storage System
 * =======================================================================
 * Store current scoreboard as baseline for comparison
 */

// In-memory baseline storage (would use DB in production)
const baselineStore = new Map();

async function saveBaseline(name, scoreboard) {
    const baseline = {
        id: `baseline_${Date.now()}`,
        name: name || `Baseline ${new Date().toISOString()}`,
        savedAt: Date.now(),
        metrics: {
            totalStates: scoreboard.totalStates,
            labeledStates: scoreboard.labeledStates,
            overallAccuracy: scoreboard.overallStats?.overallAccuracy || 0,
            directionalAccuracy: scoreboard.directionalAccuracy || {},
            waitCorrectnessRate: scoreboard.waitCorrectness?.rate || 0,
            isMonotonic: scoreboard.confidenceCalibration?.isMonotonic || false,
            waitEffective: scoreboard.waitEffectiveness?.isEffective || null,
            dominantFailure: scoreboard.failureAnalysis?.dominantFailure || null,
            timeframeAccuracy: scoreboard.timeframeAccuracy || {},
            alignmentAccuracy: scoreboard.alignmentAccuracy || {}
        }
    };

    baselineStore.set(baseline.id, baseline);
    logger.info(`📏 Saved baseline: ${baseline.name} (${baseline.id})`);

    return baseline;
}

function getBaselines() {
    return Array.from(baselineStore.values()).sort((a, b) => b.savedAt - a.savedAt);
}

function compareToBaseline(currentScoreboard, baselineId) {
    const baseline = baselineStore.get(baselineId);
    if (!baseline) {
        return { success: false, error: 'Baseline not found' };
    }

    const current = {
        overallAccuracy: currentScoreboard.overallStats?.overallAccuracy || 0,
        waitCorrectnessRate: currentScoreboard.waitCorrectness?.rate || 0,
        longAccuracy: currentScoreboard.directionalAccuracy?.longAccuracy || 0,
        shortAccuracy: currentScoreboard.directionalAccuracy?.shortAccuracy || 0
    };

    const base = {
        overallAccuracy: baseline.metrics.overallAccuracy,
        waitCorrectnessRate: baseline.metrics.waitCorrectnessRate,
        longAccuracy: baseline.metrics.directionalAccuracy?.longAccuracy || 0,
        shortAccuracy: baseline.metrics.directionalAccuracy?.shortAccuracy || 0
    };

    const delta = {
        overallAccuracy: Number((current.overallAccuracy - base.overallAccuracy).toFixed(1)),
        waitCorrectnessRate: Number((current.waitCorrectnessRate - base.waitCorrectnessRate).toFixed(1)),
        longAccuracy: Number((current.longAccuracy - base.longAccuracy).toFixed(1)),
        shortAccuracy: Number((current.shortAccuracy - base.shortAccuracy).toFixed(1))
    };

    const improved = delta.overallAccuracy > 0;
    const totalDelta = delta.overallAccuracy;

    return {
        success: true,
        baseline: {
            id: baseline.id,
            name: baseline.name,
            savedAt: baseline.savedAt
        },
        current,
        base,
        delta,
        improved,
        summary: improved
            ? `📈 Improved by ${totalDelta}% overall accuracy`
            : totalDelta < 0
                ? `📉 Declined by ${Math.abs(totalDelta)}% overall accuracy`
                : '➡️ No change in overall accuracy'
    };
}

function deleteBaseline(baselineId) {
    return baselineStore.delete(baselineId);
}

/**
 * Get scoreboard summary (lightweight version)
 */
async function getScoreboardSummary(options = {}) {
    const scoreboard = await getScoreboard(options);

    if (!scoreboard.success) {
        return scoreboard;
    }

    return {
        success: true,
        totalStates: scoreboard.totalStates,
        labeledStates: scoreboard.labeledStates,
        pendingStates: scoreboard.pendingStates,
        overallAccuracy: scoreboard.overallStats?.overallAccuracy || 0,
        directionalAccuracy: scoreboard.overallStats?.directionalAccuracy || 0,
        waitCorrectnessRate: scoreboard.waitCorrectness?.rate || 0,
        isConfidenceCalibrated: scoreboard.confidenceCalibration?.isMonotonic || false,
        waitEffective: scoreboard.waitEffectiveness?.isEffective || null,
        dominantFailure: scoreboard.failureAnalysis?.dominantFailure || null
    };
}

/**
 * =======================================================================
 * EXPORTS
 * =======================================================================
 */

module.exports = {
    getScoreboard,
    getScoreboardSummary,

    // Individual metric functions (for testing)
    calculateAccuracyByBias,
    calculateAccuracyByConfidence,
    calculateWaitCorrectness,
    calculateDirectionalAccuracy,
    calculatePerformanceByRegime,
    calculatePerformanceByScenario,
    calculateOutcomeDistribution,
    calculateOverallStats,
    analyzeConfidenceCalibration,

    // Phase 9 metrics
    validateRegimeExpectations,
    calculateWaitEffectiveness,
    analyzeFailureReasons,

    // Enhancement 2-3 metrics
    calculateAccuracyByTimeframe,
    calculateAlignmentAccuracy,

    // Enhancement 4: Baselines
    saveBaseline,
    getBaselines,
    compareToBaseline,
    deleteBaseline,

    // Helpers
    getConfidenceBucket,
    classifyFailure,
    CONFIDENCE_BUCKETS,
    REGIME_EXPECTATIONS,
    FAILURE_CATEGORIES
};


