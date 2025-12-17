// =============================================================================
// src/services/configService.js
// =============================================================================
// Config-Driven Calibration System - Service Layer
// Handles loading, validating, saving, and versioning of analyzer parameters.
//
// Storage: Supabase (not JSON files) for production compatibility
// Features:
//   - Optimistic locking (version check on save)
//   - Weights sum validation (must equal 1.0)
//   - Append-only history for audit trail
//   - Atomic saves (no partial writes)

const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');

// =============================================================================
// SUPABASE CLIENT
// =============================================================================

let supabase = null;

function getSupabase() {
    if (!supabase) {
        const url = process.env.SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
        if (url && key) {
            supabase = createClient(url, key);
        }
    }
    return supabase;
}

// =============================================================================
// DEFAULT CONFIG (Fallback + Initial Seed)
// =============================================================================

const DEFAULT_CONFIG = {
    meta: {
        version: '1.0.0',
        last_modified_at: new Date().toISOString(),
        modified_by: 'system',
        notes: 'Initial configuration extracted from marketMetrics.js'
    },

    thresholds: {
        '30m': {
            price: { noise: 0.25, strong: 0.5 },
            oi: { quiet: 0.15, aggressive: 0.3 },
            funding: 0.03
        },
        '1h': {
            price: { noise: 0.4, strong: 0.8 },
            oi: { quiet: 0.25, aggressive: 0.5 },
            funding: 0.04
        },
        '4h': {
            price: { noise: 0.65, strong: 1.3 },
            oi: { quiet: 0.5, aggressive: 1.0 },
            funding: 0.05
        },
        '1d': {
            price: { noise: 1.15, strong: 2.3 },
            oi: { quiet: 1.0, aggressive: 2.0 },
            funding: 0.06
        },
        cvd: {
            '30m': { slopeStrong: 0.02, slopeWeak: 0.005, divergenceMin: 0.01 },
            '1h': { slopeStrong: 0.025, slopeWeak: 0.008, divergenceMin: 0.015 },
            '4h': { slopeStrong: 0.03, slopeWeak: 0.01, divergenceMin: 0.02 },
            '1d': { slopeStrong: 0.04, slopeWeak: 0.015, divergenceMin: 0.025 }
        },
        vwap: {
            innerBand: 0.01,
            outerBand: 0.02
        }
    },

    weights: {
        signals: {
            exchange_divergence: 0.35,
            market_regime: 0.20,
            structure: 0.15,
            technical: 0.10,
            cvd: 0.10,
            vwap: 0.05,
            funding: 0.05
        }
    },

    gates: {
        whaleRetail: {
            scalping: { minPct: 0.2, minUsd: 2000000 },
            macro: { minPct: 0.5, minUsd: 10000000 }
        },
        minConfidence: 5,
        minSampleSize: 5,
        maxStalenessMinutes: 30
    },

    penalties: {
        conflict: 0.15,
        staleness: 0.10,
        lowLiquidity: 0.10,
        unreliableData: 0.20
    },

    bounds: {
        weights: { min: 0.01, max: 0.60, maxStepPct: 25 },
        thresholds: { maxStepPct: 15 },
        gates: { maxStepPct: 10 },
        penalties: { min: 0.01, max: 0.50, maxStepPct: 15 }
    }
};

// =============================================================================
// VALIDATION
// =============================================================================

const WEIGHTS_SUM_TOLERANCE = 0.001;

/**
 * Validate config structure, bounds, and weights sum
 * @param {Object} config - Config to validate
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
function validateConfig(config) {
    const errors = [];
    const warnings = [];

    // 1. Check required top-level keys
    const requiredKeys = ['thresholds', 'weights', 'gates', 'penalties'];
    for (const key of requiredKeys) {
        if (!config[key]) {
            errors.push(`Missing required key: ${key}`);
        }
    }

    // 2. Validate weights sum to 1.0
    if (config.weights?.signals) {
        const weights = Object.values(config.weights.signals);
        const sum = weights.reduce((a, b) => a + b, 0);

        if (Math.abs(sum - 1.0) > WEIGHTS_SUM_TOLERANCE) {
            errors.push(`Signal weights must sum to 1.0, got ${sum.toFixed(4)}`);
        }

        // Check individual weight bounds
        const bounds = config.bounds?.weights || DEFAULT_CONFIG.bounds.weights;
        for (const [key, value] of Object.entries(config.weights.signals)) {
            if (value < bounds.min) {
                errors.push(`Weight '${key}' = ${value} is below minimum ${bounds.min}`);
            }
            if (value > bounds.max) {
                errors.push(`Weight '${key}' = ${value} is above maximum ${bounds.max}`);
            }
        }
    }

    // 3. Validate penalty bounds
    if (config.penalties) {
        const bounds = config.bounds?.penalties || DEFAULT_CONFIG.bounds.penalties;
        for (const [key, value] of Object.entries(config.penalties)) {
            if (typeof value === 'number') {
                if (value < bounds.min) {
                    errors.push(`Penalty '${key}' = ${value} is below minimum ${bounds.min}`);
                }
                if (value > bounds.max) {
                    errors.push(`Penalty '${key}' = ${value} is above maximum ${bounds.max}`);
                }
            }
        }
    }

    // 4. Validate threshold structure
    const timeframes = ['30m', '1h', '4h', '1d'];
    if (config.thresholds) {
        for (const tf of timeframes) {
            if (!config.thresholds[tf]) {
                warnings.push(`Missing thresholds for timeframe: ${tf}`);
            }
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}

/**
 * Validate delta between current and proposed config
 * @param {Object} current - Current config
 * @param {Object} proposed - Proposed config
 * @returns {{ valid: boolean, violations: string[] }}
 */
function validateDelta(current, proposed) {
    const violations = [];
    const bounds = proposed.bounds || current.bounds || DEFAULT_CONFIG.bounds;

    // Helper to get nested value
    const getValue = (obj, path) => {
        return path.split('.').reduce((o, k) => (o || {})[k], obj);
    };

    // Check weights delta
    if (current.weights?.signals && proposed.weights?.signals) {
        const maxDelta = bounds.weights?.maxStepPct || 25;

        for (const key of Object.keys(proposed.weights.signals)) {
            const oldVal = current.weights.signals[key];
            const newVal = proposed.weights.signals[key];

            if (oldVal && newVal && oldVal !== 0) {
                const deltaPct = Math.abs((newVal - oldVal) / oldVal) * 100;
                if (deltaPct > maxDelta) {
                    violations.push(`Weight '${key}' delta ${deltaPct.toFixed(1)}% exceeds max ${maxDelta}%`);
                }
            }
        }
    }

    // Check penalties delta
    if (current.penalties && proposed.penalties) {
        const maxDelta = bounds.penalties?.maxStepPct || 15;

        for (const key of Object.keys(proposed.penalties)) {
            const oldVal = current.penalties[key];
            const newVal = proposed.penalties[key];

            if (typeof oldVal === 'number' && typeof newVal === 'number' && oldVal !== 0) {
                const deltaPct = Math.abs((newVal - oldVal) / oldVal) * 100;
                if (deltaPct > maxDelta) {
                    violations.push(`Penalty '${key}' delta ${deltaPct.toFixed(1)}% exceeds max ${maxDelta}%`);
                }
            }
        }
    }

    return {
        valid: violations.length === 0,
        violations
    };
}

// =============================================================================
// CORE FUNCTIONS
// =============================================================================

// In-memory cache
let cachedConfig = null;
let cachedVersion = null;
let configSource = 'not_loaded'; // 'database' | 'fallback' | 'not_loaded'
let configLoadedAt = null;

/**
 * Initialize config on server startup
 * Call this once when the server starts
 * @returns {Promise<Object>} Loaded config info
 */
async function initializeConfig() {
    logger.info('[CONFIG] Initializing config from database...');

    try {
        const result = await loadConfig();

        if (result.error) {
            logger.warn('[CONFIG] Failed to load from database, using fallback defaults');
            configSource = 'fallback';
        } else {
            configSource = 'database';
            logger.info(`[CONFIG] Loaded version ${result.version} from database`);
        }

        configLoadedAt = new Date().toISOString();

        return {
            success: true,
            version: cachedVersion,
            source: configSource,
            loadedAt: configLoadedAt
        };

    } catch (err) {
        logger.error('[CONFIG] Initialization failed:', err);
        cachedConfig = DEFAULT_CONFIG;
        cachedVersion = '1.0.0';
        configSource = 'fallback';
        configLoadedAt = new Date().toISOString();

        return {
            success: false,
            version: '1.0.0',
            source: 'fallback',
            error: err.message
        };
    }
}

/**
 * Reload config from database (cache invalidation)
 * Call this after config is saved via Calibration Panel
 * @returns {Promise<Object>} New config info
 */
async function reloadConfig() {
    logger.info('[CONFIG] Reloading config from database...');

    // Clear cache
    cachedConfig = null;
    cachedVersion = null;

    // Reload from database
    return await initializeConfig();
}

/**
 * Get config source ('database' | 'fallback' | 'not_loaded')
 */
function getConfigSource() {
    return configSource;
}

/**
 * Get cached version string
 */
function getCachedVersion() {
    return cachedVersion;
}

/**
 * Get config load timestamp
 */
function getConfigLoadedAt() {
    return configLoadedAt;
}

/**
 * Load current active config from database
 * @returns {Promise<Object>} Current config with version
 */
async function loadConfig() {
    const client = getSupabase();

    if (!client) {
        logger.warn('[CONFIG] No Supabase client, using default config');
        return { config: DEFAULT_CONFIG, version: '1.0.0' };
    }

    try {
        const { data, error } = await client
            .from('analyzer_config')
            .select('*')
            .limit(1)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                // No config exists, seed with default
                logger.info('[CONFIG] No config found, seeding default');
                await seedDefaultConfig();
                return { config: DEFAULT_CONFIG, version: '1.0.0' };
            }
            throw error;
        }

        cachedConfig = data.config_json;
        cachedVersion = data.version;

        return {
            config: data.config_json,
            version: data.version,
            created_at: data.created_at,
            created_by: data.created_by,
            validation_status: data.validation_status
        };

    } catch (err) {
        logger.error('[CONFIG] Failed to load config:', err);
        return { config: DEFAULT_CONFIG, version: '1.0.0', error: err.message };
    }
}

/**
 * Save new config version with optimistic locking
 * @param {Object} newConfig - New config to save
 * @param {string} basedOnVersion - Version user is editing (for conflict detection)
 * @param {string} createdBy - Who is making the change
 * @param {string} notes - Required notes explaining the change
 * @param {string} action - Action type: 'update', 'rollback', 'ai_import'
 * @returns {Promise<Object>} Result with success/error
 */
async function saveConfig(newConfig, basedOnVersion, createdBy, notes, action = 'update') {
    const client = getSupabase();

    if (!client) {
        return { success: false, error: 'Database not configured' };
    }

    if (!notes || notes.trim().length < 5) {
        return { success: false, error: 'Notes are required (min 5 characters)' };
    }

    try {
        // 1. Load current config
        const current = await loadConfig();

        // 2. Optimistic locking - check version hasn't changed
        if (basedOnVersion && current.version !== basedOnVersion) {
            return {
                success: false,
                error: 'Version conflict',
                message: `Config was modified by someone else. Your version: ${basedOnVersion}, Current: ${current.version}. Please refresh.`,
                conflict: true
            };
        }

        // 3. Validate new config
        const validation = validateConfig(newConfig);
        if (!validation.valid) {
            return {
                success: false,
                error: 'Validation failed',
                validationErrors: validation.errors
            };
        }

        // 4. Validate delta (if updating existing config)
        if (current.config && action === 'update') {
            const deltaValidation = validateDelta(current.config, newConfig);
            if (!deltaValidation.valid) {
                return {
                    success: false,
                    error: 'Delta exceeds allowed bounds',
                    violations: deltaValidation.violations
                };
            }
        }

        // 5. Compute new version
        const newVersion = incrementVersion(current.version || '1.0.0');

        // 6. Compute diff summary
        const diffSummary = computeDiff(current.config, newConfig);

        // 7. Update meta
        newConfig.meta = {
            ...newConfig.meta,
            version: newVersion,
            last_modified_at: new Date().toISOString(),
            modified_by: createdBy
        };

        // 8. Save to history (append-only)
        const { error: historyError } = await client
            .from('analyzer_config_history')
            .insert({
                version: newVersion,
                config_json: newConfig,
                previous_config_json: current.config,
                diff_summary: diffSummary,
                created_by: createdBy,
                notes: notes,
                based_on_version: basedOnVersion,
                action: action,
                validation_status: 'not_validated'
            });

        if (historyError) {
            throw historyError;
        }

        // 9. Update/insert active config
        const { error: upsertError } = await client
            .from('analyzer_config')
            .upsert({
                id: current.id || undefined,
                version: newVersion,
                config_json: newConfig,
                created_by: createdBy,
                notes: notes,
                validation_status: 'not_validated'
            }, { onConflict: 'id' });

        if (upsertError) {
            throw upsertError;
        }

        // 10. Update cache
        cachedConfig = newConfig;
        cachedVersion = newVersion;

        logger.info(`[CONFIG] Saved new version ${newVersion} by ${createdBy}`);

        return {
            success: true,
            version: newVersion,
            warnings: validation.warnings,
            diff_summary: diffSummary
        };

    } catch (err) {
        logger.error('[CONFIG] Failed to save config:', err);
        return { success: false, error: err.message };
    }
}

/**
 * Rollback to a previous version (creates new version, doesn't rewrite history)
 * @param {string} targetVersion - Version to rollback to
 * @param {string} createdBy - Who is performing rollback
 * @returns {Promise<Object>} Result
 */
async function rollbackToVersion(targetVersion, createdBy) {
    const client = getSupabase();

    if (!client) {
        return { success: false, error: 'Database not configured' };
    }

    try {
        // Find the target version in history
        const { data: historyEntry, error } = await client
            .from('analyzer_config_history')
            .select('*')
            .eq('version', targetVersion)
            .single();

        if (error || !historyEntry) {
            return { success: false, error: `Version ${targetVersion} not found in history` };
        }

        // Get current version for based_on
        const current = await loadConfig();

        // Save the old config as a new version
        return await saveConfig(
            historyEntry.config_json,
            current.version,
            createdBy,
            `Rollback to version ${targetVersion}`,
            'rollback'
        );

    } catch (err) {
        logger.error('[CONFIG] Rollback failed:', err);
        return { success: false, error: err.message };
    }
}

/**
 * Get version history
 * @param {number} limit - Max entries to return
 * @returns {Promise<Array>} History entries
 */
async function getVersionHistory(limit = 50) {
    const client = getSupabase();

    if (!client) {
        return [];
    }

    try {
        const { data, error } = await client
            .from('analyzer_config_history')
            .select('version, created_at, created_by, notes, action, validation_status, diff_summary')
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) throw error;
        return data || [];

    } catch (err) {
        logger.error('[CONFIG] Failed to load history:', err);
        return [];
    }
}

/**
 * Get a specific version from history
 * @param {string} version - Version to retrieve
 * @returns {Promise<Object|null>} Config for that version
 */
async function getVersion(version) {
    const client = getSupabase();

    if (!client) return null;

    try {
        const { data, error } = await client
            .from('analyzer_config_history')
            .select('*')
            .eq('version', version)
            .single();

        if (error) throw error;
        return data;

    } catch (err) {
        logger.error('[CONFIG] Failed to get version:', err);
        return null;
    }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Seed default config into database
 */
async function seedDefaultConfig() {
    const client = getSupabase();
    if (!client) return;

    try {
        // Insert into history
        await client
            .from('analyzer_config_history')
            .insert({
                version: '1.0.0',
                config_json: DEFAULT_CONFIG,
                previous_config_json: null,
                diff_summary: null,
                created_by: 'system',
                notes: 'Initial configuration seed',
                action: 'initial',
                validation_status: 'not_validated'
            });

        // Insert active config
        await client
            .from('analyzer_config')
            .insert({
                version: '1.0.0',
                config_json: DEFAULT_CONFIG,
                created_by: 'system',
                notes: 'Initial configuration seed',
                validation_status: 'not_validated'
            });

        logger.info('[CONFIG] Seeded default config');

    } catch (err) {
        logger.error('[CONFIG] Failed to seed default config:', err);
    }
}

/**
 * Increment semantic version
 */
function incrementVersion(version) {
    const parts = version.split('.').map(Number);
    parts[2] = (parts[2] || 0) + 1; // Increment patch
    return parts.join('.');
}

/**
 * Compute diff between two configs
 */
function computeDiff(oldConfig, newConfig) {
    const changes = [];

    // Helper to flatten object
    const flatten = (obj, prefix = '') => {
        const result = {};
        for (const key in obj) {
            const path = prefix ? `${prefix}.${key}` : key;
            if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
                Object.assign(result, flatten(obj[key], path));
            } else {
                result[path] = obj[key];
            }
        }
        return result;
    };

    const oldFlat = flatten(oldConfig || {});
    const newFlat = flatten(newConfig || {});

    // Find changes
    const allKeys = new Set([...Object.keys(oldFlat), ...Object.keys(newFlat)]);

    for (const key of allKeys) {
        if (key.startsWith('meta.')) continue; // Skip meta changes

        const oldVal = oldFlat[key];
        const newVal = newFlat[key];

        if (oldVal !== newVal) {
            let deltaPct = null;
            if (typeof oldVal === 'number' && typeof newVal === 'number' && oldVal !== 0) {
                deltaPct = ((newVal - oldVal) / oldVal) * 100;
            }

            changes.push({
                path: key,
                old: oldVal,
                new: newVal,
                delta_pct: deltaPct !== null ? Number(deltaPct.toFixed(2)) : null
            });
        }
    }

    return {
        total_changes: changes.length,
        changes: changes.slice(0, 50) // Limit to 50 changes in summary
    };
}

/**
 * Get cached config (fast path for hot code paths)
 */
function getCachedConfig() {
    return cachedConfig || DEFAULT_CONFIG;
}

/**
 * Get specific config value with fallback
 */
function getConfigValue(path, fallback = null) {
    const config = getCachedConfig();
    const result = path.split('.').reduce((o, k) => (o || {})[k], config);

    if (result === undefined || result === null) {
        logger.warn(`[CONFIG] Missing config value: ${path}, using fallback`);
        return fallback;
    }

    return result;
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
    // Initialization (call on startup)
    initializeConfig,
    reloadConfig,

    // Core functions
    loadConfig,
    saveConfig,
    rollbackToVersion,
    getVersionHistory,
    getVersion,

    // Validation
    validateConfig,
    validateDelta,

    // Fast access (for hot paths in marketMetrics.js)
    getCachedConfig,
    getConfigValue,
    getCachedVersion,
    getConfigSource,
    getConfigLoadedAt,

    // Constants
    DEFAULT_CONFIG,
    WEIGHTS_SUM_TOLERANCE
};
