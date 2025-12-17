const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');

// =======================================================================
// CONFIG
// =======================================================================

const DB_CONFIG = {
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_SERVICE_KEY
};

const RESOLUTION_CONFIG = {
    // Candles to wait before checking resolution
    WAIT_CANDLES: {
        '30m': 6,  // 3 hours
        '1h': 4,  // 4 hours
        '4h': 3,  // 12 hours
        '1d': 2   // 2 days
    },
    MAX_EXTENSIONS: 1,
    DATA_GAP_THRESHOLD: 0.20, // 20%
    OI_DROP_THRESHOLD: 0.30,  // 30%
    OI_STABLE_RANGE: 0.15     // 15%
};

// =======================================================================
// DB CLIENT
// =======================================================================

let supabase = null;

function getSupabase() {
    if (!supabase) {
        if (!DB_CONFIG.supabaseUrl || !DB_CONFIG.supabaseKey) {
            console.error('❌ Supabase credentials not configured!');
            return null;
        }
        supabase = createClient(DB_CONFIG.supabaseUrl, DB_CONFIG.supabaseKey);
    }
    return supabase;
}

// =======================================================================
// DB OPERATIONS
// =======================================================================

async function saveAbsorptionEvent(event) {
    const client = getSupabase();
    if (!client) return { success: false, error: 'DB not connected' };

    try {
        // Generate ID if not present
        const record = {
            id: event.id || uuidv4(),
            symbol: event.symbol || 'BTC',
            timeframe: event.timeframe,
            cvd_direction: event.cvdDirection, // map camelCase to snake_case
            cvd_strength: event.cvdStrength,
            cvd_noise_floor: event.cvdNoiseFloor,
            oi_behavior: event.oiBehavior,
            oi_at_detection: event.oiAtDetection,
            price_response: event.priceResponse,
            price_at_detection: event.priceAtDetection,
            location: event.location,
            sr_level_used: event.srLevelUsed,
            detected_at: event.detectedAt
        };

        const { data, error } = await client
            .from('absorption_events')
            .insert(record)
            .select('id')
            .single();

        if (error) {
            // Check for unique violation (duplicate open event)
            if (error.code === '23505') {
                return { success: false, duplicate: true };
            }
            console.error('❌ Error saving absorption event:', error);
            return { success: false, error: error.message };
        }

        return { success: true, id: data.id };
    } catch (err) {
        console.error('❌ Exception saving absorption:', err);
        return { success: false, error: err.message };
    }
}

async function getUnresolvedAbsorptions(symbol = 'BTC') {
    const client = getSupabase();
    if (!client) return [];

    const { data, error } = await client
        .from('absorption_events')
        .select('*')
        .eq('symbol', symbol)
        .is('resolved_at', null);

    if (error) {
        console.error('❌ Error fetching unresolved absorptions:', error);
        return [];
    }
    return data || [];
}

async function resolveAbsorption(id, resolution, reason, criteria) {
    const client = getSupabase();
    if (!client) return { success: false };

    const { error } = await client
        .from('absorption_events')
        .update({
            resolved_at: Date.now(),
            resolution,
            resolution_reason: reason,
            resolution_criteria: criteria
        })
        .eq('id', id);

    if (error) {
        console.error(`❌ Error resolving absorption ${id}:`, error);
        return { success: false, error: error.message };
    }
    return { success: true };
}

async function extendAbsorption(id) {
    const client = getSupabase();
    if (!client) return { success: false };

    // Atomically increment extensions_used
    // Actually standard supabase update is simplest
    const { error } = await client.rpc('increment_absorption_extension', { row_id: id });

    // Stick to simple update if RPC not defined
    if (error) {
        // Fallback: Read-Modify-Write (less safe but OK for low volume)
        const { data } = await client.from('absorption_events').select('extensions_used').eq('id', id).single();
        if (data) {
            await client
                .from('absorption_events')
                .update({ extensions_used: (data.extensions_used || 0) + 1 })
                .eq('id', id);
        }
    }
    return { success: true };
}

// =======================================================================
// RESOLUTION LOGIC (Phase 2)
// =======================================================================

/**
 * Check and resolve all open absorption events based on market data
 * @param {Object} currentData - { candles: {}, currentOI, currentPrice, structure }
 */
async function checkAndResolveAbsorptions(currentData) {
    const unresolved = await getUnresolvedAbsorptions(currentData.symbol || 'BTC');
    if (!unresolved.length) return [];

    const resolutions = [];

    for (const event of unresolved) {
        const { timeframe, detected_at, extensions_used } = event;
        const N = RESOLUTION_CONFIG.WAIT_CANDLES[timeframe] || 4;

        // 1. Get candles for this timeframe
        const candles = currentData.candles ? (currentData.candles[timeframe] || []) : [];
        if (!candles.length) continue;

        // 2. Count candles since detection
        // Find index of candle containing detected_at
        const detectionIndex = candles.findIndex(c => {
            const t = c.timestamp || c.time || c.openTime || c.t;
            return t >= detected_at;
        });

        if (detectionIndex === -1) continue; // Too old or missing data

        const candlesSince = candles.length - 1 - detectionIndex;

        // 3. Check Timing
        if (candlesSince < N) continue; // Too early

        // 4. Data Gathering for Resolution Window
        // We analyze the window [detectionIndex ... end]
        const windowCandles = candles.slice(detectionIndex);

        // Perform Checks
        const result = evaluateResolution(event, windowCandles, currentData);

        if (result.action === 'RESOLVE') {
            await resolveAbsorption(event.id, result.resolution, result.reason, result.criteria);
            resolutions.push({ ...event, resolution: result.resolution, reason: result.reason });
        } else if (result.action === 'EXTEND') {
            if (extensions_used < RESOLUTION_CONFIG.MAX_EXTENSIONS) {
                await extendAbsorption(event.id);
            } else {
                await resolveAbsorption(event.id, 'EXPIRED', 'Max extensions reached', {});
            }
        } else if (result.action === 'EXPIRE') {
            await resolveAbsorption(event.id, 'EXPIRED', result.reason, {});
        }
    }

    return resolutions;
}

/**
 * Evaluate a single event
 */
function evaluateResolution(event, candles, marketData) {
    // Helper to get price from candle safely
    const getHigh = c => Number(c.high || c.h || c.close);
    const getLow = c => Number(c.low || c.l || c.close);
    const getClose = c => Number(c.close || c.c || c.price);

    const oiHistory = marketData.oiHistory || [];

    const { cvd_direction, sr_level_used, oi_at_detection, price_at_detection } = event;
    const isBuying = cvd_direction === 'buying';
    const srLevel = Number(sr_level_used);

    // Criteria Matches
    const matches = {
        trap: {
            sweep: false,
            break: false,
            oi_unwind: false
        },
        accum: {
            location: false,
            range: false,
            oi_stable: false
        }
    };

    // --- 1. CHECK TRAP CRITERIA ---

    // Criterion 1: Sweep + Rejection
    let sweepDetected = false;
    for (const c of candles) {
        if (isBuying) {
            if (srLevel && getHigh(c) > srLevel && getClose(c) < srLevel) {
                sweepDetected = true;
            }
        } else {
            if (srLevel && getLow(c) < srLevel && getClose(c) > srLevel) {
                sweepDetected = true;
            }
        }
    }
    matches.trap.sweep = sweepDetected;

    // Criterion 2: Reversal + Break
    const currentStructure = marketData.structure || {};
    if (isBuying) {
        if (currentStructure.support && getClose(candles[candles.length - 1]) < currentStructure.support) {
            matches.trap.break = true;
        }
    } else {
        if (currentStructure.resistance && getClose(candles[candles.length - 1]) > currentStructure.resistance) {
            matches.trap.break = true;
        }
    }

    // Criterion 3: OI Spike + Drop + Reversal
    if (oiHistory.length) {
        const detectionTime = Number(event.detected_at);
        const recentOi = oiHistory.filter(x => x.timestamp >= detectionTime).map(x => x.oi);
        if (recentOi.length > 0) {
            const peakOi = Math.max(...recentOi);
            const currentOi = recentOi[recentOi.length - 1];
            const increase = peakOi - Number(oi_at_detection);

            if (increase > 0) {
                const drop = peakOi - currentOi;
                const dropRatio = drop / increase;

                const priceReversed = isBuying
                    ? getClose(candles[candles.length - 1]) < Number(price_at_detection)
                    : getClose(candles[candles.length - 1]) > Number(price_at_detection);

                if (dropRatio > 0.3 && priceReversed) {
                    matches.trap.oi_unwind = true;
                }
            }
        }
    }

    // --- 2. CHECK ACCUMULATION/DISTRIBUTION CRITERIA ---

    // Criterion 1: Correct Location
    if (isBuying) {
        matches.accum.location = (event.location === 'near_support');
    } else {
        matches.accum.location = (event.location === 'near_resistance');
    }

    // Criterion 2: Range Holds
    matches.accum.range = !matches.trap.break;

    // Criterion 3: OI Stable
    const upper = Number(oi_at_detection) * 1.15;
    const lower = Number(oi_at_detection) * 0.85;
    if (oiHistory.length) {
        const recentOi = oiHistory.filter(x => x.timestamp >= Number(event.detected_at)).map(x => x.oi);
        const maxOi = Math.max(...recentOi);
        const minOi = Math.min(...recentOi);
        if (maxOi <= upper && minOi >= lower) {
            matches.accum.oi_stable = true;
        }
    } else {
        const currentOi = marketData.currentOI || 0;
        if (currentOi <= upper && currentOi >= lower) {
            matches.accum.oi_stable = true;
        }
    }

    // --- 3. DETERMINE RESOLUTION ---

    // Count matches
    const trapCount = Object.values(matches.trap).filter(x => x).length;
    const accumCount = Object.values(matches.accum).filter(x => x).length;

    // Decision Logic
    if (trapCount >= 2) {
        return {
            action: 'RESOLVE',
            resolution: 'TRAP',
            reason: `Trap confirmed (${trapCount}/3 criteria: ${Object.keys(matches.trap).filter(k => matches.trap[k]).join(', ')})`,
            criteria: matches
        };
    }

    if (accumCount >= 2) {
        const type = isBuying ? 'ACCUMULATION' : 'DISTRIBUTION';
        return {
            action: 'RESOLVE',
            resolution: type,
            reason: `${type} confirmed (${accumCount}/3 criteria: ${Object.keys(matches.accum).filter(k => matches.accum[k]).join(', ')})`,
            criteria: matches
        };
    }

    // Check expiration
    const N = RESOLUTION_CONFIG.WAIT_CANDLES[event.timeframe] || 4;
    const detectionIndex = candles.findIndex(c => (c.timestamp || c.time || c.t) >= Number(event.detected_at));
    const candlesSince = candles.length - 1 - detectionIndex;

    if (candlesSince > N * 2) {
        return {
            action: 'EXPIRE',
            reason: 'Time window expired without distinct pattern',
            criteria: matches
        };
    }

    return { action: 'WAIT' };
}

module.exports = {
    saveAbsorptionEvent,
    getUnresolvedAbsorptions,
    resolveAbsorption,
    checkAndResolveAbsorptions,
    // Export for testing
    evaluateResolution
};
