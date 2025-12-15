// src/routes/marketAnalyzer.js - UPDATED WITH AI

const express = require('express');
const router = express.Router();
const { marketDataService, marketMetrics } = require('../services');
const { getAiMarketInsight } = require('../services/aiAdvisor');
const cacheManager = require('../utils/cache');
const logger = require('../utils/logger');

/**
 * GET /api/ai-market-analyzer/btc
 * Returns comprehensive BTC market analysis with AI insight
 */
router.get('/btc', async (req, res) => {
  const cacheKey = 'market_snapshot_btc';
  
  try {
    const forceRefresh = req.query.refresh === 'true';

    // Check cache
    if (!forceRefresh) {
      const cached = cacheManager.get(cacheKey);
      if (cached) {
        logger.info('Returning cached market data with AI');
        const cachedResponse = cached.data;
        
        return res.json({
          success: cachedResponse.success,
          data: cachedResponse.data,
          meta: {
            ...cachedResponse.meta,
            cached: true,
            cached_at: cached.cachedAt,
            age_minutes: Math.floor(cached.age / 60000)
          }
        });
      }
    }

    // Fetch fresh data
    logger.info('Fetching fresh market data from Coinglass...');
    const { snapshot, history } = await marketDataService.getFuturesMarketData('BTCUSDT');

    // Calculate metrics
    logger.info('Calculating market metrics...');
    const metrics = marketMetrics.calculateMarketMetrics(snapshot, history);

    // Get AI insight
    logger.info('Getting AI market insight from OpenAI...');
    const aiInsight = await getAiMarketInsight({
      snapshot,
      metrics,
      history
    });

    // Build response
    const response = {
      success: true,
      data: {
        // Core metrics (your calculations)
        metrics,
        
        // AI analysis (OpenAI interpretation)
        aiInsight,
        
        // Raw data for reference
        raw: {
          binance: snapshot.Binance,
          bybit: snapshot.Bybit
        }
      },
      meta: {
        cached: false,
        timestamp: new Date().toISOString(),
        source: 'coinglass_api_v4 + openai',
        exchange_mapping: {
          binance: 'BTCUSDT (USDT-margined)',
          bybit: 'BTCUSD (coin-margined)'
        }
      }
    };

    // Cache the result
    cacheManager.set(cacheKey, response);
    logger.info('Market data with AI cached successfully');

    res.json(response);

  } catch (error) {
    logger.error('Error in /api/ai-market-analyzer/btc:', error);
    res.status(500).json({
      success: false,
      error: 'failed_to_fetch_market_data',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ... rest of your routes (cache-stats, clear-cache, health)

module.exports = router;
