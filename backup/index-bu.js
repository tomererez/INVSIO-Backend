require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const rateLimit = require('express-rate-limit');

const logger = require('./src/utils/logger');
const cacheManager = require('./src/utils/cache');
const { marketDataService, marketMetrics } = require('./src/services');
const marketAnalyzerRoutes = require('./src/routes/marketAnalyzer');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== MIDDLEWARE =====

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://tradesmarter.base44.app', 'https://smartrading.com'] 
    : '*',
  credentials: true
}));

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: (process.env.RATE_LIMIT_WINDOW_MINUTES || 5) * 60 * 1000,
  max: process.env.RATE_LIMIT_MAX_REQUESTS || 100,
  message: {
    error: 'too_many_requests',
    message: 'Too many requests from this IP, please try again later.',
    retryAfter: process.env.RATE_LIMIT_WINDOW_MINUTES || 5
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to API routes only
app.use('/api/', limiter);

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  next();
});

// ===== ROUTES =====

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'smartrading-backend',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Market analyzer routes
app.use('/api/ai-market-analyzer', marketAnalyzerRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'not_found',
    message: 'Endpoint not found',
    path: req.path,
    availableEndpoints: [
      'GET /health',
      'GET /api/ai-market-analyzer/btc',
      'GET /api/ai-market-analyzer/health',
      'GET /api/ai-market-analyzer/cache-stats',
      'POST /api/ai-market-analyzer/clear-cache'
    ]
  });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    error: 'internal_server_error',
    message: process.env.NODE_ENV === 'production' 
      ? 'An unexpected error occurred' 
      : err.message
  });
});

// ===== BACKGROUND TASKS =====

/**
 * Cron job to pre-cache market data every 30 minutes
 * Runs at minute 15 and 45 to avoid startup conflicts
 */
if (process.env.NODE_ENV !== 'test') {
  // Run at :15 and :45 past every hour (avoids startup collision)
  cron.schedule('15,45 * * * *', async () => {
    logger.info('🔄 Running scheduled market data refresh...');
    try {
      const { snapshot, history } = await marketDataService.getFuturesMarketData('BTCUSDT');
      const metrics = marketMetrics.calculateMarketMetrics(snapshot, history);
      
      cacheManager.set('market_snapshot_btc', {
        success: true,
        data: metrics,
        meta: {
          cached: false,
          timestamp: new Date().toISOString(),
          source: 'coinglass_api_v4'
        }
      });
      
      logger.info('✅ Scheduled refresh completed successfully');
    } catch (error) {
      logger.error('❌ Scheduled refresh failed:', error);
    }
  });

  logger.info('⏰ Background cron job initialized (runs at :15 and :45)');
}

// ===== SERVER STARTUP =====

app.listen(PORT, async () => {
  logger.info(`🚀 SmarTrading Backend v2.0 running on port ${PORT}`);
  logger.info(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`⏱️  Cache duration: ${process.env.CACHE_DURATION_MINUTES || 30} minutes`);
  logger.info(`🔗 Exchange mapping: Binance=BTCUSDT, Bybit=BTCUSD`);
  
  // Pre-populate cache on startup (with delay to avoid rate limits)
  setTimeout(async () => {
    try {
      logger.info('🔄 Pre-populating cache...');
      const { snapshot, history } = await marketDataService.getFuturesMarketData('BTCUSDT');
      const metrics = marketMetrics.calculateMarketMetrics(snapshot, history);
      
      cacheManager.set('market_snapshot_btc', {
        success: true,
        data: metrics,
        meta: {
          cached: false,
          timestamp: new Date().toISOString(),
          source: 'coinglass_api_v4'
        }
      });
      
      logger.info('✅ Initial cache populated successfully');
    } catch (error) {
      logger.error('❌ Failed to populate initial cache:', error.message);
    }
  }, 2000); // 2 second delay after startup
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

module.exports = app;
