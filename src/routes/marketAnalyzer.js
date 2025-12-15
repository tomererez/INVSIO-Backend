const express = require('express');
const router = express.Router();
const { marketDataService, marketMetrics, alertService, llmExplainer, stateStorage } = require('../services');
const cacheManager = require('../utils/cache');
const logger = require('../utils/logger');

// A) P0 FIX: Version tracking for deployment verification
const BUILD_VERSION = {
  version: '2.2.1',
  buildDate: '2025-12-12T13:30:00Z',
  p0CvdFix: true,
  cvdIntervals: ['m30', 'h1', 'h4', 'h24']
};

/**
 * Generate realistic demo data for testing UI without API key
 */
function generateDemoData() {
  const btcPrice = 97500 + (Math.random() - 0.5) * 2000;
  const priceChange = (Math.random() - 0.5) * 4;
  const oiChange = (Math.random() - 0.5) * 6;
  const bybitOiChange = (Math.random() - 0.5) * 8;
  const fundingRate = (Math.random() - 0.5) * 0.08;
  const cvd = (Math.random() - 0.5) * 5e9;
  const bybitCvd = (Math.random() - 0.5) * 2e9;

  // Determine scenario based on random conditions
  const scenarios = [
    'whale_distribution', 'whale_accumulation', 'retail_fomo_rally',
    'short_squeeze_setup', 'whale_hedging', 'synchronized_bullish',
    'synchronized_bearish', 'bybit_leading', 'binance_noise', 'unclear'
  ];
  const regimes = ['distribution', 'accumulation', 'trap', 'covering', 'trending', 'unclear'];
  const biases = ['LONG', 'SHORT', 'WAIT', 'STRONG_LONG', 'STRONG_SHORT'];

  const randomScenario = scenarios[Math.floor(Math.random() * scenarios.length)];
  const randomRegime = regimes[Math.floor(Math.random() * regimes.length)];
  const randomBias = biases[Math.floor(Math.random() * biases.length)];
  const confidence = 4 + Math.random() * 6;

  return {
    timestamp: Date.now(),
    timeframe: "4h",

    // Exchange Divergence Analysis
    exchangeDivergence: {
      scenario: randomScenario,
      confidence: Math.floor(confidence),
      bias: randomBias,
      binance: {
        character: priceChange > 0 && fundingRate > 0.03 ? 'retail_euphoria' :
          priceChange < 0 && fundingRate < -0.01 ? 'retail_panic_shorts' : 'neutral',
        oi_change: Number(oiChange.toFixed(2)),
        cvd_billions: Number((cvd / 1e9).toFixed(2)),
        funding: Number(fundingRate.toFixed(4)),
        leverage_score: Math.floor(5 + Math.random() * 5)
      },
      bybit: {
        character: bybitOiChange > 0 && bybitCvd > 0 ? 'whale_accumulation' :
          bybitOiChange < 0 && priceChange > 0 ? 'whale_distribution' : 'neutral',
        oi_change: Number(bybitOiChange.toFixed(2)),
        cvd_billions: Number((bybitCvd / 1e9).toFixed(2)),
        funding: Number((fundingRate + (Math.random() - 0.5) * 0.02).toFixed(4)),
        conviction: Math.abs(bybitOiChange) > 2 ? 'high' : Math.abs(bybitOiChange) > 1 ? 'medium' : 'low'
      },
      deltas: {
        oi: Number((oiChange - bybitOiChange).toFixed(2)),
        cvd_billions: Number(((cvd - bybitCvd) / 1e9).toFixed(2)),
        funding: Number((Math.random() * 0.02 - 0.01).toFixed(4)),
        volume_billions: Number((Math.random() * 2 - 1).toFixed(2))
      },
      whaleRetailRatio: Number((0.5 + Math.random() * 2).toFixed(2)),
      dominantPlayer: Math.random() > 0.6 ? 'whales' : Math.random() > 0.3 ? 'retail' : 'balanced',
      warnings: [
        randomScenario === 'whale_distribution' ? '🔴 CRITICAL: Whales are DUMPING on retail' :
          randomScenario === 'whale_accumulation' ? '🐋 Whales are ACCUMULATING' :
            randomScenario === 'retail_fomo_rally' ? '🚨 Retail FOMO rally - whales ABSENT' :
              '⚠️ Mixed signals - monitoring market conditions',
        `Price ${priceChange > 0 ? 'up' : 'down'} ${Math.abs(priceChange).toFixed(2)}% while OI ${oiChange > 0 ? 'rising' : 'falling'}`,
        `Funding rate at ${(fundingRate * 100).toFixed(3)}% - ${Math.abs(fundingRate) > 0.05 ? 'EXTREME' : 'normal'} levels`
      ]
    },

    // Market Regime
    marketRegime: {
      regime: randomRegime,
      subType: randomRegime === 'trap' ? (Math.random() > 0.5 ? 'long_trap' : 'short_trap') :
        randomRegime === 'trending' ? (Math.random() > 0.5 ? 'healthy_bull' : 'healthy_bear') :
          randomRegime === 'covering' ? 'short_squeeze' : 'mixed_signals',
      confidence: Math.floor(confidence),
      characteristics: [
        randomRegime === 'distribution' ? 'Smart money distributing to retail' :
          randomRegime === 'accumulation' ? 'Smart money accumulating' :
            randomRegime === 'trap' ? 'Price movement may be deceptive' :
              'Market showing mixed signals',
        `OI ${oiChange > 0 ? 'rising' : 'falling'} with price ${priceChange > 0 ? 'up' : 'down'}`,
        `CVD suggests ${cvd > 0 ? 'buying' : 'selling'} pressure dominates`
      ]
    },

    // Final Decision
    finalDecision: {
      bias: randomBias,
      confidence: Number(confidence.toFixed(1)),
      scores: {
        long: Number((10 + Math.random() * 20).toFixed(1)),
        short: Number((10 + Math.random() * 20).toFixed(1)),
        wait: Number((5 + Math.random() * 15).toFixed(1))
      },
      signals: [
        {
          name: 'exchange_divergence',
          signal: randomBias,
          confidence: confidence,
          weight: 0.40,
          reasoning: `${randomScenario.replace(/_/g, ' ')} scenario detected`
        },
        {
          name: 'market_regime',
          signal: randomRegime === 'accumulation' || randomRegime === 'trending' ? 'LONG' :
            randomRegime === 'distribution' ? 'SHORT' : 'WAIT',
          confidence: confidence - 1,
          weight: 0.25,
          reasoning: `Market in ${randomRegime} regime`
        },
        {
          name: 'technical',
          signal: priceChange > 0 ? 'LONG' : priceChange < 0 ? 'SHORT' : 'WAIT',
          confidence: Math.abs(priceChange) * 2,
          weight: 0.15,
          reasoning: `Trend ${priceChange > 0 ? 'up' : 'down'} with momentum`
        },
        {
          name: 'funding',
          signal: fundingRate > 0.03 ? 'SHORT' : fundingRate < -0.03 ? 'LONG' : 'WAIT',
          confidence: Math.abs(fundingRate) * 100,
          weight: 0.12,
          reasoning: `Funding ${Math.abs(fundingRate) > 0.03 ? 'extreme' : 'normal'} at ${(fundingRate * 100).toFixed(3)}%`
        },
        {
          name: 'cvd',
          signal: cvd > 0 ? 'LONG' : cvd < 0 ? 'SHORT' : 'WAIT',
          confidence: 6,
          weight: 0.08,
          reasoning: `CVD ${cvd > 0 ? 'positive' : 'negative'}`
        }
      ],
      reasoning: [
        `${randomScenario.replace(/_/g, ' ')} pattern identified in exchange divergence`,
        `Market regime suggests ${randomRegime} phase`,
        `${randomBias} bias with ${confidence.toFixed(1)}/10 confidence`
      ]
    },

    // Technical Metrics
    technical: {
      trend: {
        direction: priceChange > 0.5 ? 'up' : priceChange < -0.5 ? 'down' : 'sideways',
        strength: Number((Math.random() * 0.8 - 0.4).toFixed(2)),
        ema20: Number((btcPrice * (1 + (Math.random() - 0.5) * 0.02)).toFixed(2)),
        ema50: Number((btcPrice * (1 + (Math.random() - 0.5) * 0.04)).toFixed(2))
      },
      momentum: {
        momentum24h: Number((priceChange * 2 + (Math.random() - 0.5) * 2).toFixed(2))
      },
      volatility: {
        realized: Number((15 + Math.random() * 20).toFixed(2)),
        maxDrawdown: Number((-5 - Math.random() * 10).toFixed(2))
      },
      technicalBias: priceChange > 1 ? 'LONG' : priceChange < -1 ? 'SHORT' : 'WAIT'
    },

    // Funding Advanced
    fundingAdvanced: {
      current: Number((fundingRate * 100).toFixed(4)),
      zScore: Number((fundingRate * 10).toFixed(2)),
      trend: fundingRate > 0.02 ? 'increasing' : fundingRate < -0.02 ? 'decreasing' : 'flat',
      extremeLevel: Math.abs(fundingRate) > 0.1 ? 'critical_high' :
        Math.abs(fundingRate) > 0.05 ? 'high' : 'normal'
    },

    // OI Advanced
    oiAdvanced: {
      current: Number((15 + Math.random() * 10) * 1e9),
      change24h: Number(oiChange.toFixed(2)),
      trend: oiChange > 1 ? 'increasing' : oiChange < -1 ? 'decreasing' : 'flat',
      priceDivergence: priceChange > 0 && oiChange < 0 ? 'bearish_divergence' :
        priceChange < 0 && oiChange > 0 ? 'bullish_divergence' : 'aligned'
    },

    // Raw Data
    raw: {
      binance: {
        "4h": {
          price: Number(btcPrice.toFixed(2)),
          price_change: Number(priceChange.toFixed(2)),
          oi: Number((18 + Math.random() * 5) * 1e9),
          oi_change: Number(oiChange.toFixed(2)),
          cvd: Number(cvd.toFixed(0)),
          funding_rate_avg_pct: Number((fundingRate * 100).toFixed(4)),
          volume: Number((10 + Math.random() * 5) * 1e9)
        },
        "1d": {
          price: Number(btcPrice.toFixed(2)),
          price_change: Number((priceChange * 1.5).toFixed(2)),
          oi: Number((18 + Math.random() * 5) * 1e9),
          oi_change: Number((oiChange * 1.2).toFixed(2)),
          cvd: Number((cvd * 2).toFixed(0)),
          funding_rate_avg_pct: Number((fundingRate * 100).toFixed(4)),
          volume: Number((50 + Math.random() * 20) * 1e9)
        }
      },
      bybit: {
        "4h": {
          price: Number((btcPrice + (Math.random() - 0.5) * 50).toFixed(2)),
          price_change: Number((priceChange + (Math.random() - 0.5) * 0.5).toFixed(2)),
          oi: Number((5 + Math.random() * 2) * 1e9),
          oi_change: Number(bybitOiChange.toFixed(2)),
          cvd: Number(bybitCvd.toFixed(0)),
          funding_rate_avg_pct: Number(((fundingRate + (Math.random() - 0.5) * 0.02) * 100).toFixed(4)),
          volume: Number((3 + Math.random() * 2) * 1e9)
        },
        "1d": {
          price: Number((btcPrice + (Math.random() - 0.5) * 50).toFixed(2)),
          price_change: Number((priceChange * 1.5 + (Math.random() - 0.5) * 0.5).toFixed(2)),
          oi: Number((5 + Math.random() * 2) * 1e9),
          oi_change: Number((bybitOiChange * 1.2).toFixed(2)),
          cvd: Number((bybitCvd * 2).toFixed(0)),
          funding_rate_avg_pct: Number(((fundingRate + (Math.random() - 0.5) * 0.02) * 100).toFixed(4)),
          volume: Number((15 + Math.random() * 8) * 1e9)
        }
      }
    },

    // Alerts (demo mode returns empty array)
    alerts: []
  };
}

/**
 * GET /api/ai-market-analyzer/btc
 * Returns comprehensive BTC market analysis with whale vs retail intelligence
 * Cached for 30 minutes (configurable)
 * Falls back to demo data if API key is missing
 */
router.get('/btc', async (req, res) => {
  const startTime = Date.now(); // Phase 5: Request timing
  const cacheKey = 'market_snapshot_btc';
  const useDemo = req.query.demo === 'true' || !process.env.COINGLASS_API_KEY;

  try {
    // If demo mode or no API key, return demo data
    if (useDemo) {
      logger.info('Using demo data (no API key configured)');
      const demoData = generateDemoData();
      return res.json({
        success: true,
        data: demoData,
        meta: {
          cached: false,
          demo: true,
          timestamp: new Date().toISOString(),
          source: 'demo_data',
          message: 'Demo data - configure COINGLASS_API_KEY for live data',
          exchange_mapping: {
            binance: 'BTCUSDT (USDT-margined)',
            bybit: 'BTCUSD (coin-margined)'
          }
        }
      });
    }

    // Check if we want to force refresh
    const forceRefresh = req.query.refresh === 'true';

    // Try to get from cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = cacheManager.get(cacheKey);
      if (cached) {
        const duration = Date.now() - startTime;
        logger.info(`Returning cached market data (${duration}ms)`);

        // Extract the actual response from cache
        // cache.get() returns { data, age, cachedAt }
        const cachedResponse = cached.data;

        // =====================================================================
        // SAVE STATE EVEN ON CACHE HIT (with deduplication)
        // =====================================================================
        // The stateStorage.saveMarketState uses time-based deduplication
        // so this won't create duplicates - max 1 save per 5-minute bucket
        let stateId = cachedResponse.meta?.stateId || null;
        try {
          const saveResult = await stateStorage.saveMarketState(cachedResponse.data);
          if (saveResult.success && !saveResult.deduplicated) {
            stateId = saveResult.id;
            logger.info(`State saved on cache hit: ${stateId}`);
          } else if (saveResult.deduplicated) {
            stateId = saveResult.id;
            logger.info(`State deduplicated on cache hit: ${stateId}`);
          }
        } catch (saveError) {
          logger.warn('Failed to save state on cache hit:', saveError.message);
        }

        return res.json({
          success: cachedResponse.success,
          data: cachedResponse.data,
          meta: {
            ...cachedResponse.meta,
            cached: true,
            // A) P0 FIX: Include build info for version verification
            buildInfo: BUILD_VERSION,
            cached_at: cached.cachedAt,
            age_minutes: Math.floor(cached.age / 60000),
            responseTime: `${duration}ms`,
            stateId  // Include stateId in response
          }
        });
      }
    }

    // Fetch fresh data with history
    logger.info('Fetching fresh market data from Coinglass...');
    const { snapshot, history } = await marketDataService.getFuturesMarketData('BTCUSDT', {
      timeframes: ['30m', '1h', '4h', '1d']
    });

    // Calculate comprehensive metrics
    logger.info('Calculating market metrics...');
    const metrics = marketMetrics.calculateMarketMetrics({ snapshot, history });

    // Phase 5: Log macro anchoring triggers
    if (metrics.finalDecision?.macroOverride?.triggered) {
      logger.info(`🔒 MACRO ANCHORING: ${metrics.finalDecision.macroOverride.reason}`);
    }

    // Check for alerts (compare with previous state)
    logger.info('Checking for alerts...');
    const alerts = alertService.checkAlerts(metrics);

    // Phase 5: Log alert fire events
    if (alerts.length > 0) {
      alerts.forEach(alert => {
        logger.info(`🔔 ALERT FIRED: [${alert.category}] ${alert.title}`, {
          priority: alert.priority,
          id: alert.id
        });
      });
    }

    // Save state to database (non-blocking)
    let stateId = null;
    try {
      const saveResult = await stateStorage.saveMarketState(metrics);
      if (saveResult.success) {
        stateId = saveResult.id;
        logger.info(`State saved: ${stateId}`);

        // Save alerts if any (link to state)
        if (alerts.length > 0) {
          await stateStorage.saveAlerts(alerts, stateId);
        }
      }
    } catch (saveError) {
      logger.warn('Failed to save state to database:', saveError.message);
    }

    const duration = Date.now() - startTime;

    // Build response
    const response = {
      success: true,
      data: {
        ...metrics,
        alerts // Include alerts in data
      },
      meta: {
        cached: false,
        timestamp: new Date().toISOString(),
        source: 'coinglass_api_v4',
        // A) P0 FIX: Include build info for version verification
        buildInfo: BUILD_VERSION,
        alertsGenerated: alerts.length,
        stateId,
        responseTime: `${duration}ms`,
        exchange_mapping: {
          binance: 'BTCUSDT (USDT-margined)',
          bybit: 'BTCUSD (coin-margined)'
        }
      }
    };

    // Store in cache
    cacheManager.set(cacheKey, response);
    logger.info(`Market data fetched and cached in ${(duration / 1000).toFixed(1)}s. ${alerts.length} alerts generated.`);

    res.json(response);

  } catch (error) {
    logger.error('Error in /api/ai-market-analyzer/btc:', error);

    // Fall back to demo data on error
    logger.info('Falling back to demo data due to error');
    const demoData = generateDemoData();
    return res.json({
      success: true,
      data: demoData,
      meta: {
        cached: false,
        demo: true,
        fallback: true,
        timestamp: new Date().toISOString(),
        source: 'demo_data_fallback',
        error: error.message,
        message: 'Using demo data due to API error',
        exchange_mapping: {
          binance: 'BTCUSDT (USDT-margined)',
          bybit: 'BTCUSD (coin-margined)'
        }
      }
    });
  }
});

/**
 * GET /api/ai-market-analyzer/btc/explain
 * Returns LLM-generated explanation of current market state
 * Separate from main analysis - optional enrichment layer
 * Cached for 5 minutes to reduce API costs
 */
router.get('/btc/explain', async (req, res) => {
  const cacheKey = 'market_snapshot_btc';
  const useDemo = req.query.demo === 'true' || !process.env.COINGLASS_API_KEY;

  try {
    let marketState;

    // Try to get cached market state first
    const cached = cacheManager.get(cacheKey);
    if (cached && cached.data && cached.data.data) {
      marketState = cached.data.data;
      logger.info('Using cached market state for explanation');
    } else if (useDemo) {
      // Use demo data if no cache and no API key
      marketState = generateDemoData();
      logger.info('Using demo data for explanation');
    } else {
      // Fetch fresh data if no cache
      logger.info('Fetching fresh market data for explanation...');
      const { snapshot, history } = await marketDataService.getFuturesMarketData('BTCUSDT', {
        timeframes: ['30m', '1h', '4h', '1d']
      });
      marketState = marketMetrics.calculateMarketMetrics({ snapshot, history });
    }

    // Generate LLM explanation
    logger.info('Generating LLM explanation...');
    const explanation = await llmExplainer.generateExplanation(marketState);

    res.json({
      success: true,
      data: {
        explanation,
        marketSummary: {
          bias: marketState.finalDecision?.bias,
          confidence: marketState.finalDecision?.confidence,
          tradeStance: marketState.finalDecision?.tradeStance,
          primaryRegime: marketState.finalDecision?.primaryRegime || marketState.marketRegime?.regime,
          riskMode: marketState.finalDecision?.riskMode
        }
      },
      meta: {
        timestamp: new Date().toISOString(),
        llmGenerated: explanation.llmGenerated !== false,
        cached: explanation.cached || false,
        source: explanation.llmGenerated !== false ? 'claude-sonnet' : 'fallback_template'
      }
    });

  } catch (error) {
    logger.error('Error in /api/ai-market-analyzer/btc/explain:', error);

    // Return fallback explanation
    const demoState = generateDemoData();
    const fallback = llmExplainer.generateFallbackExplanation(demoState);

    res.json({
      success: true,
      data: {
        explanation: fallback,
        marketSummary: {
          bias: demoState.finalDecision?.bias,
          confidence: demoState.finalDecision?.confidence,
          tradeStance: 'AVOID_TRADING',
          primaryRegime: demoState.marketRegime?.regime,
          riskMode: 'DEFENSIVE'
        }
      },
      meta: {
        timestamp: new Date().toISOString(),
        llmGenerated: false,
        cached: false,
        source: 'fallback_template',
        error: error.message
      }
    });
  }
});

/**
 * GET /api/ai-market-analyzer/demo
 * Always returns demo data for UI testing
 */
router.get('/demo', (req, res) => {
  const demoData = generateDemoData();
  res.json({
    success: true,
    data: demoData,
    meta: {
      cached: false,
      demo: true,
      timestamp: new Date().toISOString(),
      source: 'demo_data',
      exchange_mapping: {
        binance: 'BTCUSDT (USDT-margined)',
        bybit: 'BTCUSD (coin-margined)'
      }
    }
  });
});

/**
 * GET /api/ai-market-analyzer/cache-stats
 * Returns cache statistics (useful for debugging)
 */
router.get('/cache-stats', (req, res) => {
  const stats = cacheManager.getStats();
  res.json({
    success: true,
    data: stats
  });
});

/**
 * POST /api/ai-market-analyzer/clear-cache
 * Manually clear cache (useful for testing)
 */
router.post('/clear-cache', (req, res) => {
  const key = req.body.key;

  if (key) {
    const cleared = cacheManager.clear(key);
    res.json({
      success: cleared,
      message: cleared ? `Cache cleared for key: ${key}` : `Key not found: ${key}`
    });
  } else {
    cacheManager.clearAll();
    res.json({
      success: true,
      message: 'All cache cleared'
    });
  }
});

/**
 * GET /api/ai-market-analyzer/health
 * Health check for the analyzer service
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'ai-market-analyzer',
    status: 'operational',
    api_key_configured: !!process.env.COINGLASS_API_KEY,
    anthropic_key_configured: !!process.env.ANTHROPIC_API_KEY,
    demo_mode: !process.env.COINGLASS_API_KEY,
    features: {
      exchange_divergence: '9 scenarios',
      market_regime: '9 regimes (incl. long_squeeze, range/chop)',
      technical_analysis: 'EMA, momentum, volatility',
      funding_analysis: 'Z-score, extremes',
      weighted_decision: '7 signals',
      multi_timeframe: '30m, 1h, 4h, 1d with weighting',
      alerts: '6 alert types with cooldowns',
      llm_explanation: 'Claude Sonnet with fallback templates'
    },
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /api/ai-market-analyzer/alert-stats
 * Returns alert system statistics (useful for debugging)
 */
router.get('/alert-stats', (req, res) => {
  const stats = alertService.getAlertStats();
  res.json({
    success: true,
    data: stats,
    alertTypes: Object.keys(alertService.ALERT_CONFIG)
  });
});

/**
 * GET /api/ai-market-analyzer/explanation-stats
 * Returns LLM explanation cache statistics
 */
router.get('/explanation-stats', (req, res) => {
  const stats = llmExplainer.getExplanationCacheStats();
  res.json({
    success: true,
    data: stats,
    config: {
      model: llmExplainer.LLM_CONFIG.model,
      cacheTtlMinutes: llmExplainer.LLM_CONFIG.cacheTtlMs / 60000
    }
  });
});

/**
 * POST /api/ai-market-analyzer/clear-explanation-cache
 * Clear LLM explanation cache (useful for testing)
 */
router.post('/clear-explanation-cache', (req, res) => {
  llmExplainer.clearExplanationCache();
  res.json({
    success: true,
    message: 'LLM explanation cache cleared'
  });
});

/**
 * POST /api/ai-market-analyzer/clear-alerts
 * Clear alert cooldowns (useful for testing)
 */
router.post('/clear-alerts', (req, res) => {
  alertService.clearCooldowns();
  res.json({
    success: true,
    message: 'Alert cooldowns cleared'
  });
});

// =========================================================================
// PHASE 5: DEBUG API ENDPOINTS
// =========================================================================

/**
 * GET /api/ai-market-analyzer/debug/status
 * Combined health check + live metrics for debug dashboard
 */
router.get('/debug/status', async (req, res) => {
  const startTime = Date.now();

  try {
    // Get cached data if available
    const cached = cacheManager.get('market_snapshot_btc');
    const previousState = alertService.getPreviousState();
    const alertStats = alertService.getAlertStats();

    // Get DB stats
    let dbStats = null;
    try {
      dbStats = await stateStorage.getDatabaseStats();
    } catch (e) {
      dbStats = { error: e.message };
    }

    // Get cache stats
    const cacheStats = cacheManager.stats ? cacheManager.stats() : {
      keys: cacheManager.keys ? cacheManager.keys().length : 'N/A'
    };

    res.json({
      success: true,
      data: {
        // Server Status
        server: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          environment: process.env.NODE_ENV || 'development'
        },

        // Current Market State
        currentState: cached ? {
          bias: cached.data?.finalDecision?.bias,
          confidence: cached.data?.finalDecision?.confidence,
          tradeStance: cached.data?.finalDecision?.tradeStance,
          regime: cached.data?.marketRegime?.regime,
          riskMode: cached.data?.finalDecision?.riskMode,
          macroOverride: cached.data?.finalDecision?.macroOverride,
          timestamp: cached.meta?.timestamp,
          cached: cached.meta?.cached,
          stateId: cached.meta?.stateId
        } : null,

        // Alert System
        alerts: {
          ...alertStats,
          previousStateAge: previousState?.timestamp
            ? Math.round((Date.now() - previousState.timestamp) / 60000) + ' minutes'
            : null
        },

        // Database
        database: dbStats,

        // Cache
        cache: cacheStats,

        // Response Timing
        responseTime: Date.now() - startTime + 'ms'
      }
    });
  } catch (error) {
    logger.error('Debug status error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/ai-market-analyzer/debug/db-stats
 * Detailed database statistics
 */
router.get('/debug/db-stats', async (req, res) => {
  try {
    const stats = await stateStorage.getDatabaseStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('DB stats error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/ai-market-analyzer/debug/alert-stats
 * Alert system statistics
 */
router.get('/debug/alert-stats', (req, res) => {
  try {
    const stats = alertService.getAlertStats();
    res.json({
      success: true,
      data: {
        ...stats,
        config: alertService.ALERT_CONFIG
      }
    });
  } catch (error) {
    logger.error('Alert stats error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/ai-market-analyzer/debug/force-refresh
 * Bypass cache and fetch fresh data
 */
router.post('/debug/force-refresh', async (req, res) => {
  const startTime = Date.now();
  logger.info('🔧 DEBUG: Force refresh initiated');

  try {
    // Clear cache first
    cacheManager.del('market_snapshot_btc');

    // Fetch fresh data
    const { snapshot, history } = await marketDataService.getFuturesMarketData('BTCUSDT', {
      timeframes: ['30m', '1h', '4h', '1d']
    });

    const metrics = marketMetrics.calculateMarketMetrics({ snapshot, history });
    const alerts = alertService.checkAlerts(metrics);

    // Log alerts
    if (alerts.length > 0) {
      alerts.forEach(alert => {
        logger.info(`🔔 ALERT FIRED: [${alert.type}] ${alert.title}`);
      });
    }

    // Save to database
    const saveResult = await stateStorage.saveMarketState(metrics);
    if (saveResult.success && alerts.length > 0) {
      await stateStorage.saveAlerts(alerts, saveResult.id);
    }

    // Update cache
    cacheManager.set('market_snapshot_btc', {
      success: true,
      data: { ...metrics, alerts },
      meta: {
        cached: false,
        timestamp: new Date().toISOString(),
        source: 'debug_force_refresh',
        stateId: saveResult.id
      }
    });

    const duration = Date.now() - startTime;
    logger.info(`🔧 DEBUG: Force refresh completed in ${(duration / 1000).toFixed(1)}s`);

    res.json({
      success: true,
      data: {
        bias: metrics.finalDecision?.bias,
        confidence: metrics.finalDecision?.confidence,
        tradeStance: metrics.finalDecision?.tradeStance,
        regime: metrics.marketRegime?.regime,
        riskMode: metrics.finalDecision?.riskMode,
        macroOverride: metrics.finalDecision?.macroOverride,
        alertsGenerated: alerts.length,
        stateId: saveResult.id,
        duration: `${(duration / 1000).toFixed(1)}s`
      }
    });
  } catch (error) {
    logger.error('Force refresh error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/ai-market-analyzer/debug/llm-stats
 * LLM explanation cache statistics
 */
router.get('/debug/llm-stats', (req, res) => {
  try {
    const stats = llmExplainer.getExplanationCacheStats();
    res.json({
      success: true,
      data: {
        cacheSize: stats.size,
        entries: stats.entries.map(e => ({
          key: e.key,
          ageSeconds: e.age,
          ageFormatted: e.age > 60 ? `${Math.floor(e.age / 60)}m ${e.age % 60}s` : `${e.age}s`,
          valid: e.valid
        })),
        config: {
          model: llmExplainer.LLM_CONFIG.model,
          maxTokens: llmExplainer.LLM_CONFIG.maxTokens,
          temperature: llmExplainer.LLM_CONFIG.temperature,
          cacheTtlMinutes: llmExplainer.LLM_CONFIG.cacheTtlMs / 60000,
          timeoutSeconds: llmExplainer.LLM_CONFIG.timeoutMs / 1000
        }
      }
    });
  } catch (error) {
    logger.error('LLM stats error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/ai-market-analyzer/debug/config
 * System configuration (read-only)
 */
router.get('/debug/config', (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        timeframeWeights: {
          '30m': '25%',
          '1h': '25%',
          '4h': '30%',
          '1d': '20%',
          description: 'Aggregation weights for multi-TF bias calculation'
        },
        macroAnchoring: {
          enabled: true,
          consensusThreshold: 6,
          singleTfThreshold: 7,
          description: 'Prevents lower TFs from overriding macro direction'
        },
        exchangeHierarchy: {
          primary: 'Bybit (COIN-M)',
          secondary: 'Binance (USDT-M)',
          rationale: 'Bybit COIN-M = smart money, Binance USDT-M = retail',
          symbolMapping: {
            BTC: { Binance: 'BTCUSDT', Bybit: 'BTCUSD' }
          }
        },
        alertCooldowns: {
          BIAS_SHIFT: '30 minutes',
          REGIME_CHANGE: '1 hour',
          CONFIDENCE_SPIKE: '1 hour',
          TRAP_DETECTED: '1 hour',
          SQUEEZE_ACTIVE: '1 hour',
          FUNDING_EXTREME: '4 hours'
        },
        thresholds: {
          tradeStanceConfidence: 5,
          fundingZScoreExtreme: 2,
          stalenessMultiplier: 2,
          whaleRatioMinActivity: '0.3%',
          whaleRatioMaxCap: '10x',
          volumeDominanceThreshold: '1.5x'
        },
        apiLimits: {
          coinglassTimeoutMs: 30000,
          llmTimeoutMs: 60000,
          cacheDurationMinutes: process.env.CACHE_DURATION_MINUTES || 30
        }
      }
    });
  } catch (error) {
    logger.error('Config endpoint error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
