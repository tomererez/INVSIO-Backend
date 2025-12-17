// src/routes/dataRoutes.js
// ============================================================================
// Historical Data API Routes
// ============================================================================
// Provides endpoints for managing historical data sync and coverage.
//
// Endpoints:
// - POST /api/data/sync - Start full sync
// - POST /api/data/sync/recent - Sync recent data only
// - GET /api/data/sync/status - Get sync progress
// - POST /api/data/sync/abort - Stop running sync
// - GET /api/data/coverage - Get data coverage info
// - GET /api/data/candles - Get candles for a range
//
// Created: 2025-12-17
// ============================================================================

const express = require('express');
const router = express.Router();
const syncHistoricalData = require('../jobs/syncHistoricalData');
const historicalCandleStorage = require('../services/historicalCandleStorage');
const logger = require('../utils/logger');

/**
 * =======================================================================
 * SYNC ENDPOINTS
 * =======================================================================
 */

/**
 * POST /api/data/sync
 * Start a historical data sync with optional filters
 * 
 * Body:
 * {
 *   daysBack: 90 (optional, default 90),
 *   force: false (optional, if true re-downloads all data),
 *   exchanges: ['Binance', 'Bybit'] (optional, filter exchanges),
 *   timeframes: ['30m', '1h', '4h', '1d'] (optional, filter timeframes),
 *   dataTypes: ['price', 'oi', 'funding', 'taker_volume'] (optional, filter data types)
 * }
 */
router.post('/sync', async (req, res) => {
    try {
        const {
            daysBack = 90,
            force = false,
            exchanges,
            timeframes,
            dataTypes
        } = req.body;

        logger.info(`[DATA] Starting sync: ${daysBack} days, force=${force}`);
        if (exchanges) logger.info(`[DATA]   Exchanges: ${exchanges.join(', ')}`);
        if (timeframes) logger.info(`[DATA]   Timeframes: ${timeframes.join(', ')}`);
        if (dataTypes) logger.info(`[DATA]   Data types: ${dataTypes.join(', ')}`);

        // Start sync in background with filters
        const result = syncHistoricalData.startSync({
            daysBack,
            force,
            exchanges,
            timeframes,
            dataTypes
        });

        // Return immediately with initial status
        res.json({
            success: true,
            message: 'Sync started',
            status: syncHistoricalData.getSyncStatus()
        });

    } catch (error) {
        logger.error('[DATA] Sync start error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/data/sync/recent
 * Sync only recent data (for keeping data fresh)
 * 
 * Body:
 * {
 *   days: 1 (optional, default 1)
 * }
 */
router.post('/sync/recent', async (req, res) => {
    try {
        const { days = 1 } = req.body;

        logger.info(`[DATA] Starting recent sync: ${days} days`);

        const result = syncHistoricalData.syncRecent(days);

        res.json({
            success: true,
            message: 'Recent sync started',
            status: syncHistoricalData.getSyncStatus()
        });

    } catch (error) {
        logger.error('[DATA] Recent sync error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/data/sync/status
 * Get current sync status and progress
 */
router.get('/sync/status', (req, res) => {
    try {
        const status = syncHistoricalData.getSyncStatus();

        res.json({
            success: true,
            ...status
        });

    } catch (error) {
        logger.error('[DATA] Status error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/data/sync/abort
 * Stop a running sync
 */
router.post('/sync/abort', (req, res) => {
    try {
        const result = syncHistoricalData.abortSync();
        res.json(result);

    } catch (error) {
        logger.error('[DATA] Abort error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/data/clear
 * Clear historical data (for re-syncing with new structure)
 * 
 * Body:
 * {
 *   exchange: 'Binance' (optional, filter by exchange),
 *   timeframe: '4h' (optional, filter by timeframe),
 *   phrase: 'Tomer Is The King' (required security phrase)
 * }
 */
router.post('/clear', async (req, res) => {
    try {
        const { exchange, timeframe, phrase } = req.body;
        const SECURITY_PHRASE = 'Tomer Is The King';

        if (phrase !== SECURITY_PHRASE) {
            return res.json({
                success: false,
                error: 'Security phrase required',
                hint: 'Type the security phrase to confirm deletion'
            });
        }

        logger.info(`[DATA] Clearing data${exchange ? ` for ${exchange}` : ''}${timeframe ? ` ${timeframe}` : ''}...`);

        const result = await syncHistoricalData.clearData({ exchange, timeframe, confirm: true });

        res.json(result);

    } catch (error) {
        logger.error('[DATA] Clear error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/data/verify
 * Verify database integrity by comparing random samples with Coinglass API
 * 
 * Body:
 * {
 *   sampleSize: 10 (optional, number of random samples to check),
 *   exchange: 'Binance' (optional, filter by exchange),
 *   timeframe: '4h' (optional, filter by timeframe)
 * }
 */
router.post('/verify', async (req, res) => {
    try {
        const {
            sampleSize = 10,
            exchange = 'Binance',
            timeframe = '4h',
            startTime,  // Optional: specific time range start (ms)
            endTime     // Optional: specific time range end (ms)
        } = req.body;
        const coinglassClient = require('../services/coinglassClient');

        // Use provided time range or default to last 30 days
        const queryStartTime = startTime || (Date.now() - 30 * 24 * 60 * 60 * 1000);
        const queryEndTime = endTime || Date.now();

        logger.info(`[DATA] Verifying ${sampleSize} samples from ${exchange} ${timeframe}...`);
        logger.info(`[DATA]   Time range: ${new Date(queryStartTime).toISOString()} to ${new Date(queryEndTime).toISOString()}`);

        // Get candles from database for the specified time range
        const allCandles = await historicalCandleStorage.getCandles({
            exchange,
            symbol: 'BTC',
            timeframe,
            startTime: queryStartTime,
            endTime: queryEndTime
        });

        if (allCandles.length === 0) {
            return res.json({
                success: false,
                error: 'No candles found in database for verification',
                verified: 0,
                total: 0
            });
        }

        // Pick random samples
        const samples = [];
        const shuffled = [...allCandles].sort(() => Math.random() - 0.5);
        const selectedCandles = shuffled.slice(0, Math.min(sampleSize, allCandles.length));

        let matches = 0;
        let mismatches = 0;
        const results = [];

        for (const dbCandle of selectedCandles) {
            try {
                // Fetch from Coinglass with proper time window
                const symbol = exchange === 'Binance' ? 'BTCUSDT' : 'BTCUSD';

                // Calculate proper time window based on interval
                const intervalMs = {
                    '30m': 30 * 60 * 1000,
                    '1h': 60 * 60 * 1000,
                    '4h': 4 * 60 * 60 * 1000,
                    '1d': 24 * 60 * 60 * 1000
                }[timeframe] || (4 * 60 * 60 * 1000);

                const apiData = await coinglassClient.getPriceHistory({
                    exchange,
                    symbol,
                    interval: timeframe,
                    limit: 5,
                    startTime: dbCandle.timestamp - intervalMs,
                    endTime: dbCandle.timestamp + intervalMs
                });

                if (apiData && apiData.length > 0) {
                    // Find the candle with matching timestamp, or closest one
                    let apiCandle = apiData.find(c => c.time === dbCandle.timestamp || c.t === dbCandle.timestamp);
                    if (!apiCandle) {
                        // Find closest candle
                        apiCandle = apiData.reduce((closest, c) => {
                            const candleTime = c.time || c.t;
                            const closestTime = closest?.time || closest?.t || 0;
                            return Math.abs(candleTime - dbCandle.timestamp) < Math.abs(closestTime - dbCandle.timestamp) ? c : closest;
                        }, apiData[0]);
                    }

                    const apiClose = Number(apiCandle.close || apiCandle.c);
                    const dbClose = Number(dbCandle.close);
                    const priceMatch = dbClose && Math.abs(dbClose - apiClose) < 1;

                    if (priceMatch) {
                        matches++;
                        results.push({
                            timestamp: dbCandle.timestamp,
                            date: new Date(dbCandle.timestamp).toISOString(),
                            status: 'match',
                            db: { close: dbClose },
                            api: { close: apiClose }
                        });
                    } else {
                        mismatches++;
                        results.push({
                            timestamp: dbCandle.timestamp,
                            date: new Date(dbCandle.timestamp).toISOString(),
                            status: 'mismatch',
                            db: { close: dbClose },
                            api: { close: apiClose }
                        });
                    }
                } else {
                    results.push({
                        timestamp: dbCandle.timestamp,
                        date: new Date(dbCandle.timestamp).toISOString(),
                        status: 'api_no_data'
                    });
                }

                // Rate limit between requests
                await new Promise(r => setTimeout(r, 100));

            } catch (err) {
                results.push({
                    timestamp: dbCandle.timestamp,
                    status: 'error',
                    error: err.message
                });
            }
        }

        const accuracy = selectedCandles.length > 0
            ? Math.round((matches / selectedCandles.length) * 100)
            : 0;

        res.json({
            success: true,
            verified: selectedCandles.length,
            matches,
            mismatches,
            accuracy: `${accuracy}%`,
            results
        });

    } catch (error) {
        logger.error('[DATA] Verify error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * =======================================================================
 * DATA COVERAGE ENDPOINTS
 * =======================================================================
 */

/**
 * GET /api/data/coverage
 * Get data coverage information (date ranges, row counts)
 */
router.get('/coverage', async (req, res) => {
    try {
        const { symbol = 'BTC' } = req.query;
        const coverage = await historicalCandleStorage.getDataCoverage(symbol);

        res.json(coverage);

    } catch (error) {
        logger.error('[DATA] Coverage error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/data/progress
 * Get sync progress from database (for history)
 */
router.get('/progress', async (req, res) => {
    try {
        const { symbol = 'BTC' } = req.query;
        const progress = await historicalCandleStorage.getSyncProgress(symbol);

        res.json({
            success: true,
            progress
        });

    } catch (error) {
        logger.error('[DATA] Progress error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * =======================================================================
 * DATA ACCESS ENDPOINTS
 * =======================================================================
 */

/**
 * GET /api/data/candles
 * Get candles for a specific range
 * 
 * Query params:
 * - exchange: 'Binance' or 'Bybit'
 * - symbol: 'BTC' (default)
 * - timeframe: '30m', '1h', '4h', '1d'
 * - startTime: timestamp (ms)
 * - endTime: timestamp (ms)
 */
router.get('/candles', async (req, res) => {
    try {
        const { exchange, symbol = 'BTC', timeframe, startTime, endTime } = req.query;

        if (!exchange || !timeframe) {
            return res.status(400).json({
                success: false,
                error: 'Missing required params: exchange, timeframe'
            });
        }

        const candles = await historicalCandleStorage.getCandles({
            exchange,
            symbol,
            timeframe,
            startTime: startTime ? parseInt(startTime) : undefined,
            endTime: endTime ? parseInt(endTime) : undefined
        });

        res.json({
            success: true,
            count: candles.length,
            candles
        });

    } catch (error) {
        logger.error('[DATA] Get candles error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/data/check
 * Check if we have data for a specific range (for backtest pre-check)
 * 
 * Query params:
 * - startTime: timestamp (ms)
 * - endTime: timestamp (ms)
 * - exchange: 'Binance' (default)
 * - timeframe: '4h' (default)
 */
router.get('/check', async (req, res) => {
    try {
        const { startTime, endTime, exchange = 'Binance', timeframe = '4h' } = req.query;

        if (!startTime || !endTime) {
            return res.status(400).json({
                success: false,
                error: 'Missing required params: startTime, endTime'
            });
        }

        const hasData = await historicalCandleStorage.hasDataForRange(
            parseInt(startTime),
            parseInt(endTime),
            { exchange, timeframe }
        );

        res.json({
            success: true,
            hasData,
            range: {
                start: new Date(parseInt(startTime)).toISOString(),
                end: new Date(parseInt(endTime)).toISOString()
            }
        });

    } catch (error) {
        logger.error('[DATA] Check error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * =======================================================================
 * HEALTH
 * =======================================================================
 */

/**
 * GET /api/data/health
 * Health check for data service
 */
router.get('/health', async (req, res) => {
    try {
        const client = historicalCandleStorage.getSupabase();
        const status = syncHistoricalData.getSyncStatus();

        res.json({
            success: true,
            service: 'historical-data',
            database: client ? 'connected' : 'not configured',
            syncRunning: status.isRunning,
            features: {
                sync: true,
                coverage: true,
                candles: true
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
