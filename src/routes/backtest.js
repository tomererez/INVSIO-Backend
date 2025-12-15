// src/routes/backtest.js - Backtest API endpoint with demo mode
const express = require('express');
const router = express.Router();
const path = require('path');
const logger = require('../utils/logger');

// Only require runBacktest if API key exists
let runBacktest = null;
if (process.env.COINGLASS_API_KEY) {
  try {
    runBacktest = require('../backtest/runBacktest').runBacktest;
  } catch (e) {
    logger.warn('Could not load backtest module:', e.message);
  }
}

/**
 * Generate realistic demo backtest results
 */
function generateDemoBacktestResults(params) {
  const {
    initialCapital = 10000,
    days = 60,
    leverage = 2,
    stopLossPercent = 2,
    takeProfitPercent = 4
  } = params;

  // Generate realistic random stats
  const totalTrades = Math.floor(days * 1.2 + Math.random() * 30);
  const winRate = 45 + Math.random() * 15;
  const winningTrades = Math.floor(totalTrades * winRate / 100);
  const losingTrades = totalTrades - winningTrades;
  const avgWin = takeProfitPercent * (0.6 + Math.random() * 0.6);
  const avgLoss = stopLossPercent * (0.7 + Math.random() * 0.4);
  const profitFactor = (winningTrades * avgWin) / (losingTrades * avgLoss || 1);
  const totalReturn = ((winningTrades * avgWin) - (losingTrades * avgLoss)) * leverage * 0.15;
  const maxDrawdown = 3 + Math.random() * 8;
  const finalCapital = initialCapital * (1 + totalReturn / 100);

  // Generate demo trades
  const trades = [];
  let price = 97000;
  for (let i = 0; i < Math.min(totalTrades, 50); i++) {
    const direction = Math.random() > 0.5 ? 'LONG' : 'SHORT';
    const isWin = Math.random() < winRate / 100;
    const pnlPercent = isWin
      ? avgWin * (0.5 + Math.random())
      : -avgLoss * (0.5 + Math.random());

    const entryPrice = price;
    const exitPrice = direction === 'LONG'
      ? price * (1 + pnlPercent / 100 / leverage)
      : price * (1 - pnlPercent / 100 / leverage);

    trades.push({
      direction,
      entryPrice: Math.round(entryPrice),
      exitPrice: Math.round(exitPrice),
      pnlPercent: Number(pnlPercent.toFixed(2)),
      reason: ['stop_loss', 'take_profit', 'signal_reversal'][Math.floor(Math.random() * 3)]
    });

    price = exitPrice + (Math.random() - 0.5) * 500;
  }

  // Generate signal distribution
  const signalDistribution = {
    LONG: Math.floor(30 + Math.random() * 30),
    SHORT: Math.floor(80 + Math.random() * 60),
    WAIT: Math.floor(100 + Math.random() * 80)
  };

  // Generate scenario distribution
  const scenarioDistribution = {
    unclear: Math.floor(100 + Math.random() * 80),
    bybit_leading: Math.floor(50 + Math.random() * 40),
    synchronized_bearish: Math.floor(30 + Math.random() * 20),
    whale_distribution: Math.floor(15 + Math.random() * 15),
    whale_accumulation: Math.floor(8 + Math.random() * 10),
    retail_fomo_rally: Math.floor(5 + Math.random() * 10),
    binance_noise: Math.floor(5 + Math.random() * 8),
    whale_hedging: Math.floor(1 + Math.random() * 3),
    synchronized_bullish: Math.floor(3 + Math.random() * 5),
    short_squeeze_setup: Math.floor(2 + Math.random() * 4)
  };

  // Generate regime distribution
  const regimeDistribution = {
    unclear: Math.floor(180 + Math.random() * 100),
    distribution: Math.floor(15 + Math.random() * 15),
    trap: Math.floor(10 + Math.random() * 10),
    accumulation: Math.floor(8 + Math.random() * 8),
    covering: Math.floor(5 + Math.random() * 5),
    trending: Math.floor(3 + Math.random() * 5)
  };

  // Generate equity curve
  const equityCurve = [];
  let equity = initialCapital;
  for (let i = 0; i < 100; i++) {
    equity += (Math.random() - 0.45) * 150 * leverage;
    equity = Math.max(equity, initialCapital * 0.7);
    equityCurve.push({
      time: i,
      equity: Number(equity.toFixed(2))
    });
  }

  return {
    success: true,
    demo: true,
    stats: {
      totalReturn: Number(totalReturn.toFixed(2)),
      finalCapital: Number(finalCapital.toFixed(2)),
      maxDrawdown: Number(maxDrawdown.toFixed(2)),
      totalTrades,
      winRate: Number(winRate.toFixed(2)),
      winningTrades,
      losingTrades,
      avgWin: Number(avgWin.toFixed(2)),
      avgLoss: Number(avgLoss.toFixed(2)),
      profitFactor: Number(profitFactor.toFixed(2)),
      sharpeRatio: Number((0.8 + Math.random() * 1.2).toFixed(2))
    },
    trades,
    signalDistribution,
    scenarioDistribution,
    regimeDistribution,
    equityCurve,
    message: 'Demo backtest results - configure COINGLASS_API_KEY for real backtesting'
  };
}

/**
 * POST /api/backtest/run
 * Run a backtest with given parameters
 */
router.post('/run', async (req, res) => {
  try {
    const params = {
      symbol: req.body.symbol || 'BTCUSDT',
      interval: req.body.interval || '4h',
      days: req.body.days || 60,
      initialCapital: req.body.initialCapital || 10000,
      leverage: req.body.leverage || 2,
      stopLossPercent: req.body.stopLossPercent || 2,
      takeProfitPercent: req.body.takeProfitPercent || 4,
      minConfidence: req.body.minConfidence || 7,
      positionSizePercent: req.body.positionSizePercent || 10
    };

    // If no API key or demo requested, return demo results
    if (!process.env.COINGLASS_API_KEY || req.body.demo === true) {
      logger.info('Using demo backtest results (no API key configured)');
      const demoResults = generateDemoBacktestResults(params);
      return res.json(demoResults);
    }

    // Real backtest
    if (!runBacktest) {
      logger.warn('Backtest module not available, using demo');
      return res.json(generateDemoBacktestResults(params));
    }

    logger.info('Starting real backtest', { symbol: params.symbol, interval: params.interval, days: params.days });

    const results = await runBacktest({
      ...params,
      saveResults: false
    });

    // Handle if runBacktest returns undefined (API key check failed)
    if (!results) {
      logger.warn('Backtest returned no results, using demo');
      return res.json(generateDemoBacktestResults(params));
    }

    // Format response for frontend
    const response = {
      success: true,
      demo: false,
      stats: results.stats,
      trades: results.trades.slice(-50),
      signalDistribution: {},
      scenarioDistribution: {},
      regimeDistribution: {},
      equityCurve: []
    };

    // Calculate distributions from signals
    if (results.signals) {
      results.signals.forEach(s => {
        response.signalDistribution[s.bias] = (response.signalDistribution[s.bias] || 0) + 1;
        if (s.scenario) {
          response.scenarioDistribution[s.scenario] = (response.scenarioDistribution[s.scenario] || 0) + 1;
        }
        if (s.regime) {
          response.regimeDistribution[s.regime] = (response.regimeDistribution[s.regime] || 0) + 1;
        }
      });

      const step = Math.max(1, Math.floor(results.signals.length / 100));
      response.equityCurve = results.signals
        .filter((_, i) => i % step === 0)
        .map((s, i) => ({
          time: i,
          equity: s.equity || params.initialCapital
        }));
    }

    logger.info('Backtest completed', {
      totalTrades: results.stats.totalTrades,
      totalReturn: results.stats.totalReturn
    });

    res.json(response);

  } catch (error) {
    logger.error('Backtest failed:', error);
    // Return demo results on error
    logger.info('Falling back to demo backtest results due to error');
    const demoResults = generateDemoBacktestResults(req.body);
    demoResults.fallback = true;
    demoResults.error = error.message;
    res.json(demoResults);
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
    demoAvailable: true,
    message: process.env.COINGLASS_API_KEY
      ? 'Backtest service ready with live data'
      : 'Demo mode only - configure COINGLASS_API_KEY for real backtesting'
  });
});

module.exports = router;
