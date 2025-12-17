// src/routes/replayRoutes.js - Stage 3: Historical Replay API Endpoints
// Provides REST API for running and monitoring replay backtests

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');

// Import replay services
const replayRunner = require('../backtest/replayRunner');
const { stateStorage } = require('../services');

// Lazy-load services that may not exist yet
let outcomeLabelingJob = null;
let scoreboardService = null;

try {
    outcomeLabelingJob = require('../backtest/outcomeLabelingJob');
} catch (e) {
    logger.warn('outcomeLabelingJob not yet available');
}

try {
    scoreboardService = require('../backtest/scoreboardService');
} catch (e) {
    logger.warn('scoreboardService not yet available');
}

/**
 * =======================================================================
 * SINGLE REPLAY
 * =======================================================================
 */

/**
 * POST /api/replay/single
 * Run replay at a single timestamp
 * 
 * Body:
 * {
 *   asOfTimestamp: "2025-12-14T08:00:00Z" | 1702540800000,
 *   symbol: "BTCUSDT",
 *   horizons: ["MICRO"]
 * }
 */
router.post('/single', async (req, res) => {
    try {
        const { asOfTimestamp, symbol = 'BTCUSDT', horizons = ['MICRO'] } = req.body;

        if (!asOfTimestamp) {
            return res.status(400).json({
                success: false,
                error: 'asOfTimestamp is required'
            });
        }

        // Parse timestamp
        const timestamp = typeof asOfTimestamp === 'number'
            ? asOfTimestamp
            : new Date(asOfTimestamp).getTime();

        if (isNaN(timestamp)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid asOfTimestamp format'
            });
        }

        // Validate timestamp is in the past
        if (timestamp > Date.now()) {
            return res.status(400).json({
                success: false,
                error: 'asOfTimestamp must be in the past'
            });
        }

        logger.info(`Running single replay at ${new Date(timestamp).toISOString()}`);

        const result = await replayRunner.runReplayAtTimestamp(timestamp, symbol, {
            horizons,
            skipDuplicateCheck: true  // For single runs, always execute
        });

        res.json(result);

    } catch (error) {
        logger.error('Single replay failed:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * =======================================================================
 * BATCH REPLAY
 * =======================================================================
 */

/**
 * POST /api/replay/batch
 * Start a batch replay over a date range
 * 
 * Body:
 * {
 *   startTime: "2025-12-01T00:00:00Z",
 *   endTime: "2025-12-14T00:00:00Z",
 *   stepSize: "1h",          // 30m, 1h, 4h, 1d
 *   maxSamples: 100,         // Cap for API protection
 *   symbol: "BTCUSDT",
 *   horizons: ["MICRO"]
 * }
 */
router.post('/batch', async (req, res) => {
    try {
        const {
            startTime,
            endTime,
            stepSize = '1h',
            maxSamples = 100,
            symbol = 'BTCUSDT',
            horizons = ['MICRO'],
            batchId  // Optional: for resume
        } = req.body;

        // Validation
        if (!startTime || !endTime) {
            return res.status(400).json({
                success: false,
                error: 'startTime and endTime are required'
            });
        }

        const startMs = new Date(startTime).getTime();
        const endMs = new Date(endTime).getTime();

        if (isNaN(startMs) || isNaN(endMs)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid date format'
            });
        }

        if (startMs >= endMs) {
            return res.status(400).json({
                success: false,
                error: 'startTime must be before endTime'
            });
        }

        if (endMs > Date.now()) {
            return res.status(400).json({
                success: false,
                error: 'endTime must be in the past'
            });
        }

        // Validate stepSize
        const validSteps = ['30m', '1h', '4h', '1d'];
        if (!validSteps.includes(stepSize)) {
            return res.status(400).json({
                success: false,
                error: `stepSize must be one of: ${validSteps.join(', ')}`
            });
        }

        // Cap maxSamples
        const cappedMaxSamples = Math.min(maxSamples, 200);
        if (maxSamples > 200) {
            logger.warn(`maxSamples capped from ${maxSamples} to 200`);
        }

        logger.info(`Starting batch replay: ${startTime} to ${endTime}, step=${stepSize}, max=${cappedMaxSamples}`);

        const result = await replayRunner.runBatchReplay({
            startTime,
            endTime,
            stepSize,
            maxSamples: cappedMaxSamples,
            symbol,
            horizons,
            batchId
        });

        res.json({
            success: true,
            message: 'Batch started',
            ...result
        });

    } catch (error) {
        logger.error('Batch replay failed:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/replay/status/:batchId
 * Get batch progress and status
 * 
 * Response:
 * {
 *   batchId: "uuid",
 *   symbol: "BTCUSDT",
 *   status: "RUNNING",
 *   totalSamples: 100,
 *   completedSamples: 45,
 *   remainingSamples: 52,
 *   failedSamples: 3,
 *   startedAt: 1702540800000,
 *   updatedAt: 1702541200000,
 *   eta: 120000,  // ms remaining
 *   error: null
 * }
 */
router.get('/status/:batchId', (req, res) => {
    try {
        const { batchId } = req.params;

        const status = replayRunner.getBatchStatus(batchId);

        if (!status) {
            return res.status(404).json({
                success: false,
                error: 'Batch not found'
            });
        }

        res.json({
            success: true,
            ...status
        });

    } catch (error) {
        logger.error('Get batch status failed:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/replay/results/:batchId
 * Get completed results for a batch
 */
router.get('/results/:batchId', async (req, res) => {
    try {
        const { batchId } = req.params;
        const { limit = 100, offset = 0 } = req.query;

        const results = await replayRunner.getBatchResults(batchId, {
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

        if (!results.success) {
            return res.status(404).json(results);
        }

        res.json(results);

    } catch (error) {
        logger.error('Get batch results failed:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/replay/failures/:batchId
 * Get failed samples for a batch
 */
router.get('/failures/:batchId', (req, res) => {
    try {
        const { batchId } = req.params;

        const failures = replayRunner.getBatchFailures(batchId);

        if (!failures.success) {
            return res.status(404).json(failures);
        }

        res.json(failures);

    } catch (error) {
        logger.error('Get batch failures failed:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/replay/resume/:batchId
 * Resume a paused batch
 */
router.post('/resume/:batchId', async (req, res) => {
    try {
        const { batchId } = req.params;

        const result = await replayRunner.resumeBatch(batchId);

        if (!result.success) {
            return res.status(400).json(result);
        }

        res.json(result);

    } catch (error) {
        logger.error('Resume batch failed:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/replay/pause/:batchId
 * Pause a running batch
 */
router.post('/pause/:batchId', (req, res) => {
    try {
        const { batchId } = req.params;

        const result = replayRunner.pauseBatch(batchId);

        if (!result.success) {
            return res.status(400).json(result);
        }

        res.json(result);

    } catch (error) {
        logger.error('Pause batch failed:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/replay/batches
 * List all batches
 */
router.get('/batches', (req, res) => {
    try {
        const batches = replayRunner.listBatches();

        res.json({
            success: true,
            count: batches.length,
            batches
        });

    } catch (error) {
        logger.error('List batches failed:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * DELETE /api/replay/batch/:batchId
 * Delete all replay states for a batch
 */
router.delete('/batch/:batchId', async (req, res) => {
    try {
        const { batchId } = req.params;

        if (!batchId) {
            return res.status(400).json({
                success: false,
                error: 'batchId is required'
            });
        }

        logger.info(`Deleting batch ${batchId}...`);

        // Delete from Supabase
        const client = stateStorage.getSupabase();
        if (!client) {
            return res.status(500).json({
                success: false,
                error: 'Database not configured'
            });
        }

        const { data, error } = await client
            .from('replay_states')
            .delete()
            .eq('batch_id', batchId)
            .select('id');

        if (error) {
            logger.error('Delete batch failed:', error);
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }

        const deletedCount = data?.length || 0;
        logger.info(`Deleted ${deletedCount} states from batch ${batchId}`);

        // Also remove from in-memory store if present
        try {
            replayRunner.deleteBatch(batchId);
        } catch (e) {
            // In-memory store might not have it, that's okay
        }

        res.json({
            success: true,
            batchId,
            deletedCount,
            message: `Deleted ${deletedCount} replay states`
        });

    } catch (error) {
        logger.error('Delete batch failed:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});


/**
 * GET /api/replay/history
 * Get all persisted replay states for frontend hydration (no batchId filter)
 */
router.get('/history', async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 100, 500);
        const symbol = req.query.symbol || 'BTC';

        logger.info(`Fetching all replay states: symbol=${symbol}, limit=${limit}`);

        const states = await stateStorage.getAllReplayStates({ limit, symbol });

        res.json({
            success: true,
            data: states,
            meta: {
                count: states.length,
                limit,
                symbol
            }
        });
    } catch (error) {
        logger.error('Get replay history failed:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/replay/stats
 * Get aggregated statistics from replay_states for the BacktestGuidePanel
 */
router.get('/stats', async (req, res) => {
    try {
        const symbol = req.query.symbol || 'BTC';

        // Get all replay states for stats calculation
        const states = await stateStorage.getAllReplayStates({ limit: 1000, symbol });

        if (!states || states.length === 0) {
            return res.json({
                success: true,
                totalStates: 0,
                labeledCount: 0,
                biasDistribution: { LONG: 0, SHORT: 0, WAIT: 0 },
                avgConfidence: 0,
                confidenceRange: { min: 0, max: 0 },
                regimeDistribution: {},
                issues: ['No replay data found. Run some backtests first!']
            });
        }

        // Calculate stats
        const totalStates = states.length;
        const labeledCount = states.filter(s => s.outcome_label).length;

        // Bias distribution
        const biasDistribution = { LONG: 0, SHORT: 0, WAIT: 0 };
        states.forEach(s => {
            const bias = s.bias || 'WAIT';
            if (biasDistribution[bias] !== undefined) {
                biasDistribution[bias]++;
            } else {
                biasDistribution.WAIT++;
            }
        });

        // Confidence stats
        const confidences = states.map(s => s.confidence || 0).filter(c => c > 0);
        const avgConfidence = confidences.length > 0
            ? confidences.reduce((a, b) => a + b, 0) / confidences.length
            : 0;
        const confidenceRange = {
            min: confidences.length > 0 ? Math.min(...confidences) : 0,
            max: confidences.length > 0 ? Math.max(...confidences) : 0
        };

        // Regime distribution
        const regimeDistribution = {};
        states.forEach(s => {
            const regime = s.primary_regime || s.regime_state || 'unknown';
            regimeDistribution[regime] = (regimeDistribution[regime] || 0) + 1;
        });

        // Detect issues
        const issues = [];
        if (labeledCount === 0) {
            issues.push('No Outcome Labels: Run the "Label Outcomes" job to calculate accuracy.');
        }
        if (totalStates < 200) {
            issues.push(`Low Sample Size: Only ${totalStates} states. Need 200+ for statistical significance.`);
        }
        const waitPct = (biasDistribution.WAIT / totalStates) * 100;
        if (waitPct > 80) {
            issues.push(`Too Many WAIT Signals: ${waitPct.toFixed(0)}% are WAIT. May indicate overly conservative thresholds.`);
        }
        if (biasDistribution.LONG < 10 && biasDistribution.SHORT < 10) {
            issues.push('Too Few Directional Signals: Need more LONG/SHORT signals to test directional accuracy.');
        }
        if (confidenceRange.max < 6) {
            issues.push(`Low Confidence Range: Max confidence is ${confidenceRange.max.toFixed(1)}. High-confidence behavior untested.`);
        }

        res.json({
            success: true,
            totalStates,
            labeledCount,
            biasDistribution,
            avgConfidence,
            confidenceRange,
            regimeDistribution,
            issues
        });

    } catch (error) {
        logger.error('Get replay stats failed:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * =======================================================================
 * OUTCOME LABELING
 * =======================================================================
 */

/**
 * POST /api/replay/label
 * Trigger outcome labeling job for replay states
 * 
 * Body:
 * {
 *   batchId: "uuid",         // Optional: label specific batch
 *   horizon: "MICRO",        // Which horizon to evaluate
 *   limit: 100               // Max states to label
 * }
 */
router.post('/label', async (req, res) => {
    try {
        if (!outcomeLabelingJob) {
            return res.status(501).json({
                success: false,
                error: 'Outcome labeling not yet implemented'
            });
        }

        const { batchId, horizon = 'MICRO', limit = 100 } = req.body;

        const result = await outcomeLabelingJob.labelPendingStates({
            batchId,
            horizon,
            limit
        });

        res.json(result);

    } catch (error) {
        logger.error('Labeling job failed:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/replay/labeling-status
 * Get labeling progress (pending vs labeled)
 */
router.get('/labeling-status', async (req, res) => {
    try {
        if (!outcomeLabelingJob) {
            return res.status(501).json({
                success: false,
                error: 'Outcome labeling not yet implemented'
            });
        }

        const { batchId } = req.query;

        const status = await outcomeLabelingJob.getLabelingStatus({ batchId });

        res.json({
            success: true,
            ...status
        });

    } catch (error) {
        logger.error('Get labeling status failed:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * =======================================================================
 * SCOREBOARD / METRICS
 * =======================================================================
 */

/**
 * GET /api/replay/scoreboard
 * Get aggregated metrics for labeled replay states
 * 
 * Query params:
 *   batchId (optional) - Filter to specific batch
 *   fromDate (optional) - Start date filter
 *   toDate (optional) - End date filter
 */
router.get('/scoreboard', async (req, res) => {
    try {
        if (!scoreboardService) {
            return res.status(501).json({
                success: false,
                error: 'Scoreboard service not yet implemented'
            });
        }

        const { batchId, fromDate, toDate } = req.query;

        const scoreboard = await scoreboardService.getScoreboard({
            batchId,
            fromDate: fromDate ? new Date(fromDate).getTime() : null,
            toDate: toDate ? new Date(toDate).getTime() : null
        });

        res.json({
            success: true,
            ...scoreboard
        });

    } catch (error) {
        logger.error('Get scoreboard failed:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/replay/scoreboard/:batchId
 * Get scoreboard for a specific batch
 */
router.get('/scoreboard/:batchId', async (req, res) => {
    try {
        if (!scoreboardService) {
            return res.status(501).json({
                success: false,
                error: 'Scoreboard service not yet implemented'
            });
        }

        const { batchId } = req.params;

        const scoreboard = await scoreboardService.getScoreboard({ batchId });

        res.json({
            success: true,
            batchId,
            ...scoreboard
        });

    } catch (error) {
        logger.error('Get batch scoreboard failed:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * =======================================================================
 * OUTCOME LABELING
 * =======================================================================
 */

/**
 * POST /api/replay/label
 * Trigger outcome labeling for pending replay states
 * 
 * Body:
 * {
 *   batchId: "uuid" (optional - filter to specific batch),
 *   horizon: "MICRO" | "SCALPING" | "MACRO" (default: MICRO),
 *   limit: 50 (max states to label per call),
 *   symbol: "BTC" (default: BTC)
 * }
 */
router.post('/label', async (req, res) => {
    if (!outcomeLabelingJob) {
        return res.status(503).json({
            success: false,
            error: 'Outcome labeling service not available'
        });
    }

    try {
        const { batchId, horizon = 'MICRO', limit = 50, symbol = 'BTC' } = req.body;

        logger.info(`[LABEL] Starting labeling: horizon=${horizon}, limit=${limit}, symbol=${symbol}`);

        const result = await outcomeLabelingJob.labelPendingStates({
            batchId,
            horizon,
            limit,
            symbol
        });

        res.json({
            success: true,
            ...result
        });

    } catch (error) {
        logger.error('Outcome labeling failed:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/replay/label/status
 * Get labeling status (pending vs labeled counts)
 */
router.get('/label/status', async (req, res) => {
    if (!outcomeLabelingJob) {
        return res.status(503).json({
            success: false,
            error: 'Outcome labeling service not available'
        });
    }

    try {
        const { batchId, symbol = 'BTC' } = req.query;

        const status = await outcomeLabelingJob.getLabelingStatus({
            batchId,
            symbol
        });

        res.json({
            success: true,
            ...status
        });

    } catch (error) {
        logger.error('Get labeling status failed:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * =======================================================================
 * SCOREBOARD (Comprehensive Metrics)
 * =======================================================================
 */

/**
 * GET /api/replay/scoreboard
 * Get comprehensive backtest scoreboard with all metrics
 * 
 * Query params:
 * - batchId: filter to specific batch
 * - symbol: filter by symbol (default: BTC)
 * - fromDate: start timestamp
 * - toDate: end timestamp
 */
router.get('/scoreboard', async (req, res) => {
    if (!scoreboardService) {
        return res.status(503).json({
            success: false,
            error: 'Scoreboard service not available'
        });
    }

    try {
        const { batchId, symbol = 'BTC', fromDate, toDate } = req.query;

        const scoreboard = await scoreboardService.getScoreboard({
            batchId,
            symbol,
            fromDate: fromDate ? parseInt(fromDate) : undefined,
            toDate: toDate ? parseInt(toDate) : undefined
        });

        res.json({
            success: true,
            ...scoreboard
        });

    } catch (error) {
        logger.error('Get scoreboard failed:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/replay/scoreboard/summary
 * Get lightweight scoreboard summary
 */
router.get('/scoreboard/summary', async (req, res) => {
    if (!scoreboardService) {
        return res.status(503).json({
            success: false,
            error: 'Scoreboard service not available'
        });
    }

    try {
        const { batchId, symbol = 'BTC' } = req.query;

        const summary = await scoreboardService.getScoreboardSummary({
            batchId,
            symbol
        });

        res.json({
            success: true,
            ...summary
        });

    } catch (error) {
        logger.error('Get scoreboard summary failed:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * =======================================================================
 * BASELINES (Enhancement 4)
 * =======================================================================
 */

/**
 * POST /api/replay/baseline
 * Save current scoreboard as a baseline
 */
router.post('/baseline', async (req, res) => {
    if (!scoreboardService) {
        return res.status(503).json({
            success: false,
            error: 'Scoreboard service not available'
        });
    }

    try {
        const { name, symbol = 'BTC' } = req.body;

        // Get current scoreboard
        const scoreboard = await scoreboardService.getScoreboard({ symbol });

        if (!scoreboard.success) {
            return res.status(400).json({
                success: false,
                error: 'Could not generate scoreboard for baseline'
            });
        }

        // Save as baseline
        const baseline = await scoreboardService.saveBaseline(name, scoreboard);

        res.json({
            success: true,
            message: 'Baseline saved',
            baseline
        });

    } catch (error) {
        logger.error('Save baseline failed:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/replay/baselines
 * List all saved baselines
 */
router.get('/baselines', (req, res) => {
    if (!scoreboardService) {
        return res.status(503).json({
            success: false,
            error: 'Scoreboard service not available'
        });
    }

    try {
        const baselines = scoreboardService.getBaselines();

        res.json({
            success: true,
            count: baselines.length,
            baselines
        });

    } catch (error) {
        logger.error('Get baselines failed:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/replay/baseline/compare/:baselineId
 * Compare current scoreboard to a baseline
 */
router.get('/baseline/compare/:baselineId', async (req, res) => {
    if (!scoreboardService) {
        return res.status(503).json({
            success: false,
            error: 'Scoreboard service not available'
        });
    }

    try {
        const { baselineId } = req.params;
        const { symbol = 'BTC' } = req.query;

        // Get current scoreboard
        const scoreboard = await scoreboardService.getScoreboard({ symbol });

        if (!scoreboard.success) {
            return res.status(400).json({
                success: false,
                error: 'Could not generate current scoreboard for comparison'
            });
        }

        // Compare to baseline
        const comparison = scoreboardService.compareToBaseline(scoreboard, baselineId);

        if (!comparison.success) {
            return res.status(404).json(comparison);
        }

        res.json(comparison);

    } catch (error) {
        logger.error('Compare to baseline failed:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * DELETE /api/replay/baseline/:baselineId
 * Delete a baseline
 */
router.delete('/baseline/:baselineId', (req, res) => {
    if (!scoreboardService) {
        return res.status(503).json({
            success: false,
            error: 'Scoreboard service not available'
        });
    }

    try {
        const { baselineId } = req.params;
        const deleted = scoreboardService.deleteBaseline(baselineId);

        res.json({
            success: deleted,
            message: deleted ? 'Baseline deleted' : 'Baseline not found'
        });

    } catch (error) {
        logger.error('Delete baseline failed:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * =======================================================================
 * HEALTH / STATUS
 * =======================================================================
 */

/**
 * GET /api/replay/health
 * Check replay service health
 */
router.get('/health', (req, res) => {
    const batches = replayRunner.listBatches();
    const runningBatches = batches.filter(b => b.status === 'RUNNING').length;

    res.json({
        success: true,
        service: 'replay',
        status: 'operational',
        activeBatches: runningBatches,
        totalBatches: batches.length,
        features: {
            singleReplay: true,
            batchReplay: true,
            outcomeLabeling: !!outcomeLabelingJob,
            scoreboard: !!scoreboardService,
            baselines: !!scoreboardService
        }
    });
});

module.exports = router;


