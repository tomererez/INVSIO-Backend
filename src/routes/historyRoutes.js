// historyRoutes.js - Phase 4: History API Endpoints
// Provides access to historical market states, alerts, and statistics

const express = require('express');
const router = express.Router();
const { stateStorage } = require('../services');
const logger = require('../utils/logger');

/**
 * GET /api/history/states
 * Get historical market states
 * Query params: from, to, limit
 */
router.get('/states', async (req, res) => {
    try {
        const { from, to, limit = 100 } = req.query;

        // Parse dates
        const fromDate = from ? new Date(from).getTime() : null;
        const toDate = to ? new Date(to).getTime() : null;
        const limitNum = Math.min(parseInt(limit) || 100, 500);

        logger.info(`Fetching state history: from=${from}, to=${to}, limit=${limitNum}`);

        const states = await stateStorage.getStateHistory('BTC', fromDate, toDate, limitNum);

        res.json({
            success: true,
            data: states,
            meta: {
                count: states.length,
                limit: limitNum,
                from: fromDate ? new Date(fromDate).toISOString() : null,
                to: toDate ? new Date(toDate).toISOString() : null
            }
        });
    } catch (error) {
        logger.error('Error fetching state history:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/history/states/:id
 * Get a specific market state by ID
 */
router.get('/states/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const state = await stateStorage.getStateById(id);

        if (!state) {
            return res.status(404).json({
                success: false,
                error: 'State not found'
            });
        }

        res.json({
            success: true,
            data: state
        });
    } catch (error) {
        logger.error('Error fetching state by ID:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/history/states/latest
 * Get the most recent market state
 */
router.get('/states/latest', async (req, res) => {
    try {
        const state = await stateStorage.getLatestState('BTC');

        if (!state) {
            return res.json({
                success: true,
                data: null,
                message: 'No states stored yet'
            });
        }

        res.json({
            success: true,
            data: state
        });
    } catch (error) {
        logger.error('Error fetching latest state:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/history/alerts
 * Get alert history
 * Query params: from, to, type, limit
 */
router.get('/alerts', async (req, res) => {
    try {
        const { from, to, type, limit = 100 } = req.query;

        const fromDate = from ? new Date(from).getTime() : null;
        const toDate = to ? new Date(to).getTime() : null;
        const limitNum = Math.min(parseInt(limit) || 100, 500);

        logger.info(`Fetching alert history: from=${from}, to=${to}, type=${type}, limit=${limitNum}`);

        const alerts = await stateStorage.getAlertHistory(fromDate, toDate, type, limitNum);

        res.json({
            success: true,
            data: alerts,
            meta: {
                count: alerts.length,
                limit: limitNum,
                type: type || 'all',
                from: fromDate ? new Date(fromDate).toISOString() : null,
                to: toDate ? new Date(toDate).toISOString() : null
            }
        });
    } catch (error) {
        logger.error('Error fetching alert history:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/history/alerts/:id/acknowledge
 * Acknowledge an alert
 */
router.post('/alerts/:id/acknowledge', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await stateStorage.acknowledgeAlert(id);

        if (result.success) {
            res.json({
                success: true,
                message: `Alert ${id} acknowledged`
            });
        } else {
            res.status(404).json({
                success: false,
                error: 'Alert not found or already acknowledged'
            });
        }
    } catch (error) {
        logger.error('Error acknowledging alert:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/history/stats
 * Get aggregated statistics
 * Query params: from, to
 */
router.get('/stats', async (req, res) => {
    try {
        const { from, to } = req.query;

        const fromDate = from ? new Date(from).getTime() : null;
        const toDate = to ? new Date(to).getTime() : null;

        logger.info(`Fetching aggregated stats: from=${from}, to=${to}`);

        const stats = await stateStorage.getAggregatedStats('BTC', fromDate, toDate);

        if (!stats) {
            return res.json({
                success: true,
                data: null,
                message: 'No data available for the specified period'
            });
        }

        res.json({
            success: true,
            data: stats,
            meta: {
                from: fromDate ? new Date(fromDate).toISOString() : null,
                to: toDate ? new Date(toDate).toISOString() : null
            }
        });
    } catch (error) {
        logger.error('Error fetching stats:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/history/summaries
 * Get daily summaries
 * Query params: from, to, limit
 */
router.get('/summaries', async (req, res) => {
    try {
        const { from, to, limit = 30 } = req.query;
        const limitNum = Math.min(parseInt(limit) || 30, 365);

        logger.info(`Fetching daily summaries: from=${from}, to=${to}, limit=${limitNum}`);

        const summaries = await stateStorage.getDailySummaries(from, to, limitNum);

        res.json({
            success: true,
            data: summaries,
            meta: {
                count: summaries.length,
                limit: limitNum
            }
        });
    } catch (error) {
        logger.error('Error fetching daily summaries:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/history/summaries/generate
 * Generate daily summary for a specific date
 * Body: { date: 'YYYY-MM-DD' }
 */
router.post('/summaries/generate', async (req, res) => {
    try {
        const { date } = req.body;

        if (!date) {
            return res.status(400).json({
                success: false,
                error: 'Date is required (format: YYYY-MM-DD)'
            });
        }

        logger.info(`Generating daily summary for: ${date}`);

        const result = await stateStorage.generateDailySummary(date);

        if (!result) {
            return res.json({
                success: false,
                message: 'No data available for the specified date'
            });
        }

        res.json({
            success: result.success,
            data: result
        });
    } catch (error) {
        logger.error('Error generating daily summary:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/history/db-stats
 * Get database statistics
 */
router.get('/db-stats', async (req, res) => {
    try {
        const stats = await stateStorage.getDatabaseStats();

        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        logger.error('Error fetching database stats:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/history/cleanup
 * Run data cleanup based on retention policy
 */
router.post('/cleanup', async (req, res) => {
    try {
        logger.info('Running data cleanup...');

        const result = await stateStorage.cleanupOldData();

        res.json({
            success: true,
            data: result,
            message: 'Cleanup completed'
        });
    } catch (error) {
        logger.error('Error during cleanup:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
