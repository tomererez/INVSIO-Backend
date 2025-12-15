// src/routes/marketAnalyzer.js
const express = require('express');
const router = express.Router();
const marketDataService = require('../services/marketDataService');
const marketMetrics = require('../services/marketMetrics');
const { getAiMarketInsight } = require('../services/aiAdvisor');
const cacheManager = require('../utils/cache');
const logger = require('../utils/logger');

/**
 * GET /api/ai-market-analyzer/btc
 * Returns BTC market analysis WITH OpenAI insight
 */
router.get('/btc', async (req, res) => {
  const cacheKey = 'market_snapshot_btc';
  
  try {
    const forceRefresh = req.query.refresh === 'true';

    // Check cache first
    if (!forceRefresh) {
      const cached = cacheManager.get(cacheKey);
      if (cached) {
        logger.info('✅ Returning cached market data with AI');
        return res.json({
          success: true,
          data: cached.data,
          meta: {
            ...cached.meta,
            cached: true,
            cached_at: cached.cachedAt,
            age_minutes: Math.floor(cached.age / 60000)
          }
        });
      }
    }

    // Step 1: Fetch market data from Coinglass
    logger.info('📊 Fetching market data from Coinglass...');
    const { snapshot, history } = await marketDataService.getFuturesMarketData('BTCUSDT', {
      includeHistory: true,
      timeframes: ['4h', '1d']
    });

    // Step 2: Calculate metrics
    logger.info('🔢 Calculating market metrics...');
    const metrics = marketMetrics.calculateMarketMetrics(snapshot, history);

    // Step 3: Get OpenAI AI insight
    logger.info('🤖 Getting OpenAI analysis...');
    const aiInsight = await getAiMarketInsight({
      snapshot,
      metrics,
      history
    });

    // Build response
    const responseData = {
      // All your existing metrics
      ...metrics,
      
      // Add OpenAI insight
      aiInsight,
      
      // Keep raw data
      raw: {
        binance: snapshot.Binance,
        bybit: snapshot.Bybit
      }
    };

    const response = {
      success: true,
      data: responseData,
      meta: {
        cached: false,
        timestamp: new Date().toISOString(),
        source: 'coinglass_api_v4 + openai_gpt4o-mini',
        exchange_mapping: {
          binance: 'BTCUSDT (USDT-margined)',
          bybit: 'BTCUSD (coin-margined)'
        }
      }
    };

    // Cache the complete result
    cacheManager.set(cacheKey, response);
    logger.info('✅ Market data with AI cached successfully');

    res.json(response);

  } catch (error) {
    logger.error('❌ Error in /api/ai-market-analyzer/btc:', error);
    res.status(500).json({
      success: false,
      error: 'failed_to_fetch_market_data',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/ai-market-analyzer/cache-stats
 * Get cache statistics
 */
router.get('/cache-stats', (req, res) => {
  const stats = cacheManager.getStats();
  res.json({
    success: true,
    data: stats,
    timestamp: new Date().toISOString()
  });
});

/**
 * POST /api/ai-market-analyzer/clear-cache
 * Clear all cache
 */
router.post('/clear-cache', (req, res) => {
  const cleared = cacheManager.clearAll();
  logger.info(`🗑️ Cache cleared: ${cleared} entries`);
  
  res.json({
    success: true,
    message: `Cleared ${cleared} cache entries`,
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /api/ai-market-analyzer/health
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    features: {
      coinglass: true,
      metrics: true,
      openai: !!process.env.OPENAI_API_KEY,
      cache: true
    }
  });
});

module.exports = router;
