// src/routes/backtest.js - Backtest API endpoint
const express = require('express');
const router = express.Router();
const path = require('path');
const { runBacktest } = require('../backtest/runBacktest');
const logger = require('../utils/logger');

/**
 * POST /api/backtest/run
 * Run a backtest with given parameters
 */
router.post('/run', async (req, res) => {
  try {
    const {
      symbol = 'BTCUSDT',
      interval = '4h',
      days = 60,
      initialCapital = 10000,
      leverage = 2,
      stopLossPercent = 2,
      takeProfitPercent = 4,
      minConfidence = 7,
      positionSizePercent = 10
    } = req.body;

    logger.info('Starting backtest', { symbol, interval, days });

    const results = await runBacktest({
      symbol,
      interval,
      days,
      initialCapital,
      leverage,
      stopLossPercent,
      takeProfitPercent,
      minConfidence,
      positionSizePercent,
      saveResults: false // Don't save to file when called via API
    });

    // Format response for frontend
    const response = {
      success: true,
      stats: results.stats,
      trades: results.trades.slice(-50), // Last 50 trades
      signalDistribution: {},
      scenarioDistribution: {},
      regimeDistribution: {},
      equityCurve: []
    };

    // Calculate distributions from signals
    if (results.signals) {
      results.signals.forEach(s => {
        // Signal distribution
        response.signalDistribution[s.bias] = (response.signalDistribution[s.bias] || 0) + 1;
        
        // Scenario distribution
        if (s.scenario) {
          response.scenarioDistribution[s.scenario] = (response.scenarioDistribution[s.scenario] || 0) + 1;
        }
        
        // Regime distribution
        if (s.regime) {
          response.regimeDistribution[s.regime] = (response.regimeDistribution[s.regime] || 0) + 1;
        }
      });

      // Build equity curve (sample every 5 points for performance)
      const step = Math.max(1, Math.floor(results.signals.length / 100));
      response.equityCurve = results.signals
        .filter((_, i) => i % step === 0)
        .map((s, i) => ({
          time: i,
          equity: s.equity || initialCapital
        }));
    }

    logger.info('Backtest completed', { 
      totalTrades: results.stats.totalTrades,
      totalReturn: results.stats.totalReturn 
    });

    res.json(response);

  } catch (error) {
    logger.error('Backtest failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/backtest/status
 * Check if backtest is available
 */
router.get('/status', (req, res) => {
  res.json({
    success: true,
    available: !!process.env.COINGLASS_API_KEY,
    message: process.env.COINGLASS_API_KEY 
      ? 'Backtest service ready'
      : 'COINGLASS_API_KEY not configured'
  });
});

module.exports = router;
