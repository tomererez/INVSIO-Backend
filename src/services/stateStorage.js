// stateStorage.js - Phase 4: Storage Layer & State Persistence
// Persists market state history to Supabase PostgreSQL

const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');

/**
 * =======================================================================
 * SUPABASE CONFIGURATION
 * =======================================================================
 */

const DB_CONFIG = {
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_SERVICE_KEY,
    retentionDays: {
        detailedStates: 90,
        dailySummaries: 365 * 2, // 2 years
        alerts: 90
    }
};

/**
 * =======================================================================
 * TIME-BASED DEDUPLICATION CONFIG
 * =======================================================================
 * States are saved once per scan cycle to prevent duplicates while
 * ensuring complete history for outcome labeling.
 */

const DEDUP_CONFIG = {
    // Default scan cycle interval in milliseconds (5 minutes)
    // This means max 1 state saved per 5-minute bucket
    scanCycleMs: 5 * 60 * 1000,

    // In-memory cache of recently saved time buckets
    // Key: "BTC:1702389600000" (symbol:timeBucket)
    // Value: { savedAt: timestamp, stateId: uuid }
    recentSaves: new Map(),

    // How long to keep dedup entries in memory (1 hour)
    cacheRetentionMs: 60 * 60 * 1000
};

/**
 * Calculate the normalized time bucket for deduplication.
 * Uses floor(timestamp / interval) to group requests into buckets.
 * 
 * @param {number} timestamp - Timestamp in milliseconds
 * @param {number} intervalMs - Bucket interval in milliseconds
 * @returns {number} Normalized time bucket
 */
function getTimeBucket(timestamp, intervalMs = DEDUP_CONFIG.scanCycleMs) {
    return Math.floor(timestamp / intervalMs) * intervalMs;
}

/**
 * Check if a state was already saved for this time bucket.
 * 
 * @param {string} symbol - Symbol (e.g., 'BTC')
 * @param {number} timeBucket - Normalized time bucket
 * @returns {Object|null} Previous save info or null
 */
function checkDedupCache(symbol, timeBucket) {
    const key = `${symbol}:${timeBucket}`;
    const cached = DEDUP_CONFIG.recentSaves.get(key);

    if (cached) {
        return cached;
    }
    return null;
}

/**
 * Record a save in the dedup cache.
 * 
 * @param {string} symbol - Symbol (e.g., 'BTC')
 * @param {number} timeBucket - Normalized time bucket
 * @param {string} stateId - UUID of saved state
 */
function recordDedupSave(symbol, timeBucket, stateId) {
    const key = `${symbol}:${timeBucket}`;
    DEDUP_CONFIG.recentSaves.set(key, {
        savedAt: Date.now(),
        stateId,
        timeBucket
    });

    // Clean up old entries
    cleanupDedupCache();
}

/**
 * Clean up old entries from dedup cache.
 */
function cleanupDedupCache() {
    const now = Date.now();
    const cutoff = now - DEDUP_CONFIG.cacheRetentionMs;

    for (const [key, value] of DEDUP_CONFIG.recentSaves.entries()) {
        if (value.savedAt < cutoff) {
            DEDUP_CONFIG.recentSaves.delete(key);
        }
    }
}

// Initialize Supabase client
let supabase = null;

function getSupabase() {
    if (!supabase) {
        if (!DB_CONFIG.supabaseUrl || !DB_CONFIG.supabaseKey) {
            console.error('❌ Supabase credentials not configured! Set SUPABASE_URL and SUPABASE_SERVICE_KEY');
            return null;
        }
        supabase = createClient(DB_CONFIG.supabaseUrl, DB_CONFIG.supabaseKey);
        console.log('✅ Supabase client initialized');
    }
    return supabase;
}

/**
 * =======================================================================
 * MARKET STATE FUNCTIONS
 * =======================================================================
 */

async function saveMarketState(marketState, options = {}) {
    const client = getSupabase();
    if (!client) return { success: false, error: 'Supabase not configured' };

    const timestamp = marketState.timestamp || Date.now();
    const symbol = options.symbol || 'BTC';

    // =========================================================================
    // TIME-BASED DEDUPLICATION
    // =========================================================================
    // Check if we already saved a state for this time bucket
    const timeBucket = getTimeBucket(timestamp);
    const existingSave = checkDedupCache(symbol, timeBucket);

    if (existingSave && !options.forceOverwrite) {
        // Already saved a state for this time bucket
        console.log(`⏱️ State dedup: Already saved for bucket ${new Date(timeBucket).toISOString()}, stateId: ${existingSave.stateId}`);
        return {
            success: true,
            id: existingSave.stateId,
            timestamp,
            deduplicated: true,
            timeBucket
        };
    }

    const id = uuidv4();

    // Extract key fields from market state
    const decision = marketState.finalDecision || {};
    const exchange = marketState.exchangeDivergence || {};
    const regime = marketState.marketRegime || {};
    const raw = marketState.raw || {};
    const binance4h = raw.binance?.['4h'] || {};
    const bybit4h = raw.bybit?.['4h'] || {};

    // Stage 2: Extract timeframe buckets for hierarchy validation
    const buckets = marketState.timeframeBuckets || {};
    const macroBucket = buckets.macro || {};
    const microBucket = buckets.micro || {};
    const scalpingBucket = buckets.scalping || {};

    const record = {
        id,
        timestamp,
        symbol: 'BTC',
        timeframe: marketState.timeframe || '4h',
        bias: decision.bias || null,
        confidence: decision.confidence || null,
        trade_stance: decision.tradeStance || null,
        primary_regime: decision.primaryRegime || regime.regime || null,
        risk_mode: decision.riskMode || null,
        exchange_scenario: exchange.scenario || null,
        binance_oi_change: exchange.binance?.oi_change || binance4h.oi_change || null,
        bybit_oi_change: exchange.bybit?.oi_change || bybit4h.oi_change || null,
        binance_cvd: exchange.binance?.cvd_billions || null,
        bybit_cvd: exchange.bybit?.cvd_billions || null,
        regime_state: regime.regime || null,
        regime_subtype: regime.subType || null,
        funding_rate: binance4h.funding_rate_avg_pct || null,
        price: binance4h.price || null,
        // Store as native JSON object, not stringified - enables introspection
        full_state_json: marketState,
        created_at: new Date().toISOString(),

        // =====================================================================
        // STAGE 2: HIERARCHY VALIDATION FIELDS
        // =====================================================================
        // These capture the three-layer hierarchy state for later validation

        macro_bias: macroBucket.bias || null,
        macro_confidence: macroBucket.confidence || null,
        micro_bias: microBucket.bias || null,
        micro_confidence: microBucket.confidence || null,
        scalping_bias: scalpingBucket.bias || null,
        scalping_confidence: scalpingBucket.confidence || null,
        // Was macro anchoring applied?
        macro_anchored: decision.macroAnchored || false,
        // Was there a hierarchy warning?
        hierarchy_warning: decision.warning || null,

        // =====================================================================
        // STAGE 2: OUTCOME LABELING FIELDS (populated later by updateStateOutcome)
        // =====================================================================
        outcome_label: null,
        outcome_reason: null,
        outcome_horizon: null,
        outcome_price: null,
        outcome_move_pct: null,
        outcome_mfe: null,
        outcome_mae: null,
        outcome_labeled_at: null
    };

    try {
        const { data, error } = await client
            .from('market_states')
            .insert(record)
            .select('id')
            .single();

        if (error) {
            console.error('❌ Supabase saveMarketState error:', error);
            return { success: false, error: error.message };
        }

        // Record in dedup cache to prevent duplicate saves
        recordDedupSave(symbol, timeBucket, id);
        console.log(`✅ State saved: ${id} for bucket ${new Date(timeBucket).toISOString()}`);

        return { success: true, id, timestamp, timeBucket };
    } catch (error) {
        console.error('❌ Error saving market state:', error);
        return { success: false, error: error.message };
    }
}

async function getStateHistory(symbol = 'BTC', fromDate = null, toDate = null, limit = 100) {
    const client = getSupabase();
    if (!client) return [];

    try {
        let query = client
            .from('market_states')
            .select(`
                id, timestamp, symbol, timeframe,
                bias, confidence, trade_stance, primary_regime, risk_mode,
                exchange_scenario, regime_state, regime_subtype,
                price, funding_rate
            `)
            .eq('symbol', symbol)
            .order('timestamp', { ascending: false })
            .limit(limit);

        if (fromDate) {
            query = query.gte('timestamp', fromDate);
        }
        if (toDate) {
            query = query.lte('timestamp', toDate);
        }

        const { data, error } = await query;

        if (error) {
            console.error('❌ Supabase getStateHistory error:', error);
            return [];
        }

        return data || [];
    } catch (error) {
        console.error('❌ Error getting state history:', error);
        return [];
    }
}

async function getLatestState(symbol = 'BTC') {
    const client = getSupabase();
    if (!client) return null;

    try {
        const { data, error } = await client
            .from('market_states')
            .select('*')
            .eq('symbol', symbol)
            .order('timestamp', { ascending: false })
            .limit(1)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                // No rows found - not an error
                return null;
            }
            console.error('❌ Supabase getLatestState error:', error);
            return null;
        }

        if (data && data.full_state_json) {
            // Handle both native JSON (new) and stringified JSON (old records)
            if (typeof data.full_state_json === 'string') {
                data.full_state = JSON.parse(data.full_state_json);
            } else {
                data.full_state = data.full_state_json;
            }
        }

        return data;
    } catch (error) {
        console.error('❌ Error getting latest state:', error);
        return null;
    }
}

async function getStateById(id) {
    const client = getSupabase();
    if (!client) return null;

    try {
        const { data, error } = await client
            .from('market_states')
            .select('*')
            .eq('id', id)
            .single();

        if (error) {
            console.error('❌ Supabase getStateById error:', error);
            return null;
        }

        if (data && data.full_state_json) {
            // Handle both native JSON (new) and stringified JSON (old records)
            if (typeof data.full_state_json === 'string') {
                data.full_state = JSON.parse(data.full_state_json);
            } else {
                data.full_state = data.full_state_json;
            }
        }

        return data;
    } catch (error) {
        console.error('❌ Error getting state by ID:', error);
        return null;
    }
}

async function getStateCount(symbol = 'BTC') {
    const client = getSupabase();
    if (!client) return 0;

    try {
        const { count, error } = await client
            .from('market_states')
            .select('*', { count: 'exact', head: true })
            .eq('symbol', symbol);

        if (error) {
            console.error('❌ Supabase getStateCount error:', error);
            return 0;
        }

        return count || 0;
    } catch (error) {
        console.error('❌ Error getting state count:', error);
        return 0;
    }
}

/**
 * =======================================================================
 * STAGE 2: OUTCOME LABELING FUNCTIONS
 * =======================================================================
 * These functions support the outcome labeling system defined in
 * outcomeLabeler.js. They allow attaching outcome labels to market
 * states after the evaluation horizon has expired.
 */

/**
 * Update a market state with its outcome label.
 * Called after horizon expiry to attach the outcome (Reversal/Continuation/Noise).
 * 
 * @param {string} stateId - The ID of the market state to update
 * @param {Object} outcomeData - Outcome data from calculateOutcomeLabel()
 * @returns {Object} { success: boolean, error?: string }
 */
async function updateStateOutcome(stateId, outcomeData) {
    const client = getSupabase();
    if (!client) return { success: false, error: 'Supabase not configured' };

    if (!stateId) {
        return { success: false, error: 'State ID is required' };
    }

    if (!outcomeData || !outcomeData.label) {
        return { success: false, error: 'Outcome data with label is required' };
    }

    const updateRecord = {
        outcome_label: outcomeData.label,
        outcome_reason: outcomeData.reason || null,
        outcome_horizon: outcomeData.horizon || null,
        outcome_price: outcomeData.finalPrice || null,
        outcome_move_pct: outcomeData.finalMovePercent || null,
        outcome_mfe: outcomeData.maxFavorableExcursion || null,
        outcome_mae: outcomeData.maxAdverseExcursion || null,
        outcome_labeled_at: Date.now()
    };

    try {
        const { error } = await client
            .from('market_states')
            .update(updateRecord)
            .eq('id', stateId);

        if (error) {
            console.error('❌ Supabase updateStateOutcome error:', error);
            return { success: false, error: error.message };
        }

        return { success: true, stateId, label: outcomeData.label };
    } catch (error) {
        console.error('❌ Error updating state outcome:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get market states that haven't been labeled with outcomes yet.
 * Used by the outcome labeling job to find states ready for evaluation.
 * 
 * @param {string} symbol - Symbol to filter by (default: 'BTC')
 * @param {number} maxAgeMs - Only get states older than this (to ensure horizon expired)
 * @param {number} limit - Maximum states to return
 * @returns {Array} Array of unlabeled market states
 */
async function getUnlabeledStates(symbol = 'BTC', maxAgeMs = 8 * 60 * 60 * 1000, limit = 100) {
    const client = getSupabase();
    if (!client) return [];

    // Only get states older than maxAgeMs to ensure horizon has expired
    const cutoffTimestamp = Date.now() - maxAgeMs;

    try {
        const { data, error } = await client
            .from('market_states')
            .select('*')
            .eq('symbol', symbol)
            .is('outcome_label', null)  // Not yet labeled
            .lt('timestamp', cutoffTimestamp)  // Old enough for horizon to expire
            .order('timestamp', { ascending: true })  // Oldest first
            .limit(limit);

        if (error) {
            console.error('❌ Supabase getUnlabeledStates error:', error);
            return [];
        }

        // Parse full state JSON for each record (handle both native and stringified)
        return (data || []).map(row => {
            let fullState = null;
            if (row.full_state_json) {
                fullState = typeof row.full_state_json === 'string'
                    ? JSON.parse(row.full_state_json)
                    : row.full_state_json;
            }
            return { ...row, full_state: fullState };
        });
    } catch (error) {
        console.error('❌ Error getting unlabeled states:', error);
        return [];
    }
}

/**
 * Get outcome statistics for a date range.
 * Used for quality analysis and backtest validation.
 * 
 * @param {string} symbol - Symbol to filter by
 * @param {number} fromDate - Start timestamp
 * @param {number} toDate - End timestamp
 * @returns {Object} Outcome statistics
 */
async function getOutcomeStats(symbol = 'BTC', fromDate = null, toDate = null) {
    const client = getSupabase();
    if (!client) return null;

    try {
        let query = client
            .from('market_states')
            .select('bias, confidence, outcome_label, outcome_move_pct, outcome_mfe, outcome_mae, macro_anchored')
            .eq('symbol', symbol)
            .not('outcome_label', 'is', null);  // Only labeled states

        if (fromDate) query = query.gte('timestamp', fromDate);
        if (toDate) query = query.lte('timestamp', toDate);

        const { data, error } = await query;

        if (error) {
            console.error('❌ Supabase getOutcomeStats error:', error);
            return null;
        }

        if (!data || data.length === 0) {
            return { total: 0, noData: true };
        }

        // Calculate statistics
        const stats = {
            total: data.length,
            byLabel: {
                CONTINUATION: 0,
                REVERSAL: 0,
                NOISE: 0
            },
            byBias: {
                LONG: { total: 0, continuation: 0, reversal: 0, noise: 0 },
                SHORT: { total: 0, continuation: 0, reversal: 0, noise: 0 },
                WAIT: { total: 0, continuation: 0, reversal: 0, noise: 0 }
            },
            directionalAccuracy: null,
            macroAnchoredAccuracy: null,
            avgMovePercent: null,
            avgMFE: null,
            avgMAE: null
        };

        let totalMove = 0;
        let totalMFE = 0;
        let totalMAE = 0;
        let moveCount = 0;
        let macroAnchoredCorrect = 0;
        let macroAnchoredTotal = 0;

        for (const row of data) {
            const label = row.outcome_label;
            const bias = row.bias;

            // Count by label
            if (stats.byLabel[label] !== undefined) {
                stats.byLabel[label]++;
            }

            // Count by bias
            if (bias in stats.byBias) {
                stats.byBias[bias].total++;
                if (label === 'CONTINUATION') stats.byBias[bias].continuation++;
                if (label === 'REVERSAL') stats.byBias[bias].reversal++;
                if (label === 'NOISE') stats.byBias[bias].noise++;
            }

            // Accumulate move stats
            if (row.outcome_move_pct !== null) {
                totalMove += Math.abs(row.outcome_move_pct);
                moveCount++;
            }
            if (row.outcome_mfe !== null) totalMFE += row.outcome_mfe;
            if (row.outcome_mae !== null) totalMAE += row.outcome_mae;

            // Macro anchoring analysis
            if (row.macro_anchored) {
                macroAnchoredTotal++;
                if (label === 'CONTINUATION') macroAnchoredCorrect++;
            }
        }

        // Calculate directional accuracy
        const totalDirectional = stats.byBias.LONG.total + stats.byBias.SHORT.total;
        const totalContinuations = stats.byBias.LONG.continuation + stats.byBias.SHORT.continuation;

        if (totalDirectional > 0) {
            stats.directionalAccuracy = Number(
                ((totalContinuations / totalDirectional) * 100).toFixed(1)
            );
        }

        // Macro anchoring accuracy
        if (macroAnchoredTotal > 0) {
            stats.macroAnchoredAccuracy = Number(
                ((macroAnchoredCorrect / macroAnchoredTotal) * 100).toFixed(1)
            );
        }

        // Average stats
        if (moveCount > 0) {
            stats.avgMovePercent = Number((totalMove / moveCount).toFixed(2));
            stats.avgMFE = Number((totalMFE / data.length).toFixed(2));
            stats.avgMAE = Number((totalMAE / data.length).toFixed(2));
        }

        return stats;
    } catch (error) {
        console.error('❌ Error getting outcome stats:', error);
        return null;
    }
}

/**
 * =======================================================================
 * ALERT PERSISTENCE FUNCTIONS
 * =======================================================================
 */

async function saveAlert(alert, marketStateId = null) {
    const client = getSupabase();
    if (!client) return { success: false, error: 'Supabase not configured' };

    const id = alert.id || uuidv4();

    const record = {
        id,
        timestamp: alert.timestamp || Date.now(),
        alert_type: alert.category || alert.alert_type || 'UNKNOWN',
        priority: alert.priority || 'medium',
        title: alert.title || '',
        description: alert.description || '',
        context_json: JSON.stringify(alert.context || {}),
        actionable_insight: alert.actionableInsight || '',
        market_state_id: marketStateId,
        acknowledged: false,
        created_at: new Date().toISOString()
    };

    try {
        const { error } = await client
            .from('alerts_history')
            .insert(record);

        if (error) {
            console.error('❌ Supabase saveAlert error:', error);
            return { success: false, error: error.message };
        }

        return { success: true, id };
    } catch (error) {
        console.error('❌ Error saving alert:', error);
        return { success: false, error: error.message };
    }
}

async function saveAlerts(alerts, marketStateId = null) {
    const results = [];
    for (const alert of alerts) {
        const result = await saveAlert(alert, marketStateId);
        results.push(result);
    }
    return results;
}

async function getAlertHistory(fromDate = null, toDate = null, alertType = null, limit = 100) {
    const client = getSupabase();
    if (!client) return [];

    try {
        let query = client
            .from('alerts_history')
            .select(`
                *,
                market_states (bias, confidence, regime_state)
            `)
            .order('timestamp', { ascending: false })
            .limit(limit);

        if (fromDate) {
            query = query.gte('timestamp', fromDate);
        }
        if (toDate) {
            query = query.lte('timestamp', toDate);
        }
        if (alertType) {
            query = query.eq('alert_type', alertType);
        }

        const { data, error } = await query;

        if (error) {
            console.error('❌ Supabase getAlertHistory error:', error);
            return [];
        }

        // Parse context JSON
        return (data || []).map(row => ({
            ...row,
            context: row.context_json ? JSON.parse(row.context_json) : {}
        }));
    } catch (error) {
        console.error('❌ Error getting alert history:', error);
        return [];
    }
}

async function acknowledgeAlert(alertId) {
    const client = getSupabase();
    if (!client) return { success: false, error: 'Supabase not configured' };

    try {
        const { error } = await client
            .from('alerts_history')
            .update({
                acknowledged: true,
                acknowledged_at: Date.now()
            })
            .eq('id', alertId);

        if (error) {
            console.error('❌ Supabase acknowledgeAlert error:', error);
            return { success: false, error: error.message };
        }

        return { success: true };
    } catch (error) {
        console.error('❌ Error acknowledging alert:', error);
        return { success: false, error: error.message };
    }
}

async function getAlertCount(alertType = null) {
    const client = getSupabase();
    if (!client) return 0;

    try {
        let query = client
            .from('alerts_history')
            .select('*', { count: 'exact', head: true });

        if (alertType) {
            query = query.eq('alert_type', alertType);
        }

        const { count, error } = await query;

        if (error) {
            console.error('❌ Supabase getAlertCount error:', error);
            return 0;
        }

        return count || 0;
    } catch (error) {
        console.error('❌ Error getting alert count:', error);
        return 0;
    }
}

/**
 * =======================================================================
 * STATISTICS FUNCTIONS
 * =======================================================================
 */

async function getAggregatedStats(symbol = 'BTC', fromDate = null, toDate = null) {
    const client = getSupabase();
    if (!client) return null;

    try {
        // Build filters
        let stateQuery = client
            .from('market_states')
            .select('bias, confidence, regime_state, price, timestamp')
            .eq('symbol', symbol);

        if (fromDate) stateQuery = stateQuery.gte('timestamp', fromDate);
        if (toDate) stateQuery = stateQuery.lte('timestamp', toDate);

        const { data: states, error: statesError } = await stateQuery;

        if (statesError) {
            console.error('❌ Supabase getAggregatedStats error:', statesError);
            return null;
        }

        if (!states || states.length === 0) {
            return {
                period: { from: fromDate, to: toDate, totalStates: 0 },
                bias: {},
                regimes: {},
                overall: { avgConfidence: null, priceRange: { min: null, max: null } },
                alerts: {}
            };
        }

        // Calculate bias distribution
        const biasCounts = {};
        const regimeCounts = {};
        let totalConfidence = 0;
        let confidenceCount = 0;
        let minPrice = Infinity;
        let maxPrice = -Infinity;
        let firstTimestamp = Infinity;
        let lastTimestamp = -Infinity;

        states.forEach(state => {
            // Bias
            const bias = state.bias || 'null';
            if (!biasCounts[bias]) biasCounts[bias] = { count: 0, totalConf: 0 };
            biasCounts[bias].count++;
            if (state.confidence) biasCounts[bias].totalConf += state.confidence;

            // Regime
            const regime = state.regime_state || 'null';
            if (!regimeCounts[regime]) regimeCounts[regime] = { count: 0, totalConf: 0 };
            regimeCounts[regime].count++;
            if (state.confidence) regimeCounts[regime].totalConf += state.confidence;

            // Overall stats
            if (state.confidence) {
                totalConfidence += state.confidence;
                confidenceCount++;
            }
            if (state.price) {
                minPrice = Math.min(minPrice, state.price);
                maxPrice = Math.max(maxPrice, state.price);
            }
            if (state.timestamp) {
                firstTimestamp = Math.min(firstTimestamp, state.timestamp);
                lastTimestamp = Math.max(lastTimestamp, state.timestamp);
            }
        });

        const totalStates = states.length;

        // Format bias distribution
        const biasPercentages = {};
        Object.entries(biasCounts).forEach(([bias, data]) => {
            biasPercentages[bias] = {
                count: data.count,
                percentage: (data.count / totalStates * 100).toFixed(1),
                avgConfidence: data.count > 0 ? (data.totalConf / data.count).toFixed(1) : null
            };
        });

        // Format regime distribution
        const regimePercentages = {};
        Object.entries(regimeCounts).forEach(([regime, data]) => {
            regimePercentages[regime] = {
                count: data.count,
                percentage: (data.count / totalStates * 100).toFixed(1),
                avgConfidence: data.count > 0 ? (data.totalConf / data.count).toFixed(1) : null
            };
        });

        // Get alert stats
        let alertQuery = client
            .from('alerts_history')
            .select('alert_type, priority');

        if (fromDate) alertQuery = alertQuery.gte('timestamp', fromDate);
        if (toDate) alertQuery = alertQuery.lte('timestamp', toDate);

        const { data: alerts } = await alertQuery;

        const alertDistribution = {};
        (alerts || []).forEach(alert => {
            if (!alertDistribution[alert.alert_type]) alertDistribution[alert.alert_type] = {};
            if (!alertDistribution[alert.alert_type][alert.priority]) {
                alertDistribution[alert.alert_type][alert.priority] = 0;
            }
            alertDistribution[alert.alert_type][alert.priority]++;
        });

        return {
            period: {
                from: fromDate || (firstTimestamp !== Infinity ? firstTimestamp : null),
                to: toDate || (lastTimestamp !== -Infinity ? lastTimestamp : null),
                totalStates
            },
            bias: biasPercentages,
            regimes: regimePercentages,
            overall: {
                avgConfidence: confidenceCount > 0 ? (totalConfidence / confidenceCount).toFixed(1) : null,
                priceRange: {
                    min: minPrice !== Infinity ? minPrice : null,
                    max: maxPrice !== -Infinity ? maxPrice : null
                }
            },
            alerts: alertDistribution
        };
    } catch (error) {
        console.error('❌ Error getting aggregated stats:', error);
        return null;
    }
}

/**
 * =======================================================================
 * DAILY SUMMARY FUNCTIONS
 * =======================================================================
 */

async function generateDailySummary(date) {
    const client = getSupabase();
    if (!client) return { success: false, error: 'Supabase not configured' };

    // date should be in YYYY-MM-DD format
    const startOfDay = new Date(date).setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(date).setUTCHours(23, 59, 59, 999);

    const stats = await getAggregatedStats('BTC', startOfDay, endOfDay);
    if (!stats || stats.period.totalStates === 0) {
        return null;
    }

    const id = uuidv4();

    // Determine predominant bias
    let predominantBias = 'WAIT';
    let maxCount = 0;
    Object.entries(stats.bias).forEach(([bias, data]) => {
        if (data.count > maxCount) {
            maxCount = data.count;
            predominantBias = bias;
        }
    });

    try {
        // Get price data
        const { data: prices } = await client
            .from('market_states')
            .select('price, timestamp')
            .eq('symbol', 'BTC')
            .gte('timestamp', startOfDay)
            .lte('timestamp', endOfDay)
            .order('timestamp', { ascending: true });

        const openPrice = prices?.[0]?.price || null;
        const closePrice = prices?.[prices.length - 1]?.price || null;
        const highPrice = stats.overall.priceRange.max;
        const lowPrice = stats.overall.priceRange.min;

        // Count alerts
        const { count: totalAlerts } = await client
            .from('alerts_history')
            .select('*', { count: 'exact', head: true })
            .gte('timestamp', startOfDay)
            .lte('timestamp', endOfDay);

        const { count: highPriorityAlerts } = await client
            .from('alerts_history')
            .select('*', { count: 'exact', head: true })
            .gte('timestamp', startOfDay)
            .lte('timestamp', endOfDay)
            .in('priority', ['high', 'critical']);

        const record = {
            id,
            date,
            symbol: 'BTC',
            avg_confidence: parseFloat(stats.overall.avgConfidence) || null,
            predominant_bias: predominantBias,
            bias_long_pct: parseFloat(stats.bias.LONG?.percentage) || 0,
            bias_short_pct: parseFloat(stats.bias.SHORT?.percentage) || 0,
            bias_wait_pct: parseFloat(stats.bias.WAIT?.percentage) || 0,
            regime_distribution_json: JSON.stringify(stats.regimes),
            total_alerts: totalAlerts || 0,
            high_priority_alerts: highPriorityAlerts || 0,
            open_price: openPrice,
            close_price: closePrice,
            high_price: highPrice,
            low_price: lowPrice,
            state_count: stats.period.totalStates,
            created_at: new Date().toISOString()
        };

        const { error } = await client
            .from('daily_summaries')
            .upsert(record, { onConflict: 'date' });

        if (error) {
            console.error('❌ Supabase generateDailySummary error:', error);
            return { success: false, error: error.message };
        }

        return { success: true, id, date };
    } catch (error) {
        console.error('❌ Error generating daily summary:', error);
        return { success: false, error: error.message };
    }
}

async function getDailySummaries(fromDate = null, toDate = null, limit = 30) {
    const client = getSupabase();
    if (!client) return [];

    try {
        let query = client
            .from('daily_summaries')
            .select('*')
            .order('date', { ascending: false })
            .limit(limit);

        if (fromDate) {
            query = query.gte('date', fromDate);
        }
        if (toDate) {
            query = query.lte('date', toDate);
        }

        const { data, error } = await query;

        if (error) {
            console.error('❌ Supabase getDailySummaries error:', error);
            return [];
        }

        return (data || []).map(row => ({
            ...row,
            regime_distribution: row.regime_distribution_json ? JSON.parse(row.regime_distribution_json) : {}
        }));
    } catch (error) {
        console.error('❌ Error getting daily summaries:', error);
        return [];
    }
}

/**
 * =======================================================================
 * CLEANUP / RETENTION FUNCTIONS
 * =======================================================================
 */

async function cleanupOldData() {
    const client = getSupabase();
    if (!client) return { error: 'Supabase not configured' };

    const now = Date.now();
    const detailedCutoff = now - (DB_CONFIG.retentionDays.detailedStates * 24 * 60 * 60 * 1000);
    const alertsCutoff = now - (DB_CONFIG.retentionDays.alerts * 24 * 60 * 60 * 1000);

    try {
        // Delete old detailed states
        const { count: statesDeleted } = await client
            .from('market_states')
            .delete({ count: 'exact' })
            .lt('timestamp', detailedCutoff);

        // Delete old alerts
        const { count: alertsDeleted } = await client
            .from('alerts_history')
            .delete({ count: 'exact' })
            .lt('timestamp', alertsCutoff);

        console.log(`🧹 Cleanup: Deleted ${statesDeleted || 0} old states, ${alertsDeleted || 0} old alerts`);

        return {
            statesDeleted: statesDeleted || 0,
            alertsDeleted: alertsDeleted || 0
        };
    } catch (error) {
        console.error('❌ Error during cleanup:', error);
        return { error: error.message };
    }
}

/**
 * =======================================================================
 * DATABASE UTILITIES
 * =======================================================================
 */

async function getDatabaseStats() {
    const client = getSupabase();
    if (!client) return { error: 'Supabase not configured' };

    try {
        const stateCount = await getStateCount();
        const alertCount = await getAlertCount();

        // Get summary count
        const { count: summaryCount } = await client
            .from('daily_summaries')
            .select('*', { count: 'exact', head: true });

        // Get date range
        const { data: earliest } = await client
            .from('market_states')
            .select('timestamp')
            .order('timestamp', { ascending: true })
            .limit(1)
            .single();

        const { data: latest } = await client
            .from('market_states')
            .select('timestamp')
            .order('timestamp', { ascending: false })
            .limit(1)
            .single();

        return {
            totalStates: stateCount,
            totalAlerts: alertCount,
            totalSummaries: summaryCount || 0,
            dateRange: {
                earliest: earliest?.timestamp ? new Date(earliest.timestamp).toISOString() : null,
                latest: latest?.timestamp ? new Date(latest.timestamp).toISOString() : null
            },
            database: 'Supabase PostgreSQL',
            retentionPolicy: DB_CONFIG.retentionDays
        };
    } catch (error) {
        console.error('❌ Error getting database stats:', error);
        return { error: error.message };
    }
}

// No-op for Supabase (connection is managed by the client)
async function closeDatabase() {
    console.log('ℹ️ Supabase connection closed');
}

/**
 * =======================================================================
 * EXPORTS
 * =======================================================================
 */

module.exports = {
    // Market State functions
    saveMarketState,
    getStateHistory,
    getLatestState,
    getStateById,
    getStateCount,

    // =====================================================================
    // STAGE 2: OUTCOME LABELING FUNCTIONS
    // =====================================================================
    updateStateOutcome,
    getUnlabeledStates,
    getOutcomeStats,

    // Alert functions
    saveAlert,
    saveAlerts,
    getAlertHistory,
    acknowledgeAlert,
    getAlertCount,

    // Statistics
    getAggregatedStats,

    // Daily summaries
    generateDailySummary,
    getDailySummaries,

    // Maintenance
    cleanupOldData,
    getDatabaseStats,
    closeDatabase,

    // Config
    DB_CONFIG,

    // Deduplication helpers (for debugging/testing)
    DEDUP_CONFIG,
    getTimeBucket
};
