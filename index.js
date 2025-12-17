// Supabase Migration + Timeframe Buckets + Math Engine + Conflict Penalty - 2025-12-12 03:49
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const rateLimit = require('express-rate-limit');

const logger = require('./src/utils/logger');
const cacheManager = require('./src/utils/cache');
const cronControl = require('./src/utils/cronControl');
const { marketDataService, marketMetrics, alertService, stateStorage } = require('./src/services');
const configService = require('./src/services/configService');
const marketAnalyzerRoutes = require('./src/routes/marketAnalyzer');
const backtestRoutes = require('./src/routes/backtest');
const historyRoutes = require('./src/routes/historyRoutes');
const replayRoutes = require('./src/routes/replayRoutes');
const configRoutes = require('./src/routes/configRoutes');
const dataRoutes = require('./src/routes/dataRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== BUILD INFO (P0 FIX: Version tracking) =====
const BUILD_INFO = {
  version: '2.2.1',
  buildDate: '2025-12-12T13:30:00Z',
  gitRef: process.env.GIT_SHA || 'local-dev',
  p0CvdFix: true,  // Confirms timeframe-correct CVD is deployed
  cvdIntervals: ['m30', 'h1', 'h4', 'h24']  // Available CVD intervals
};

// ===== TRUST PROXY (Required for Railway/production) =====
app.set('trust proxy', 1);

// ===== MIDDLEWARE =====

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? ['https://app.invsio.com', 'https://invsio.com']
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

// Request logging middleware (skip noisy polling endpoints)
const SILENT_ENDPOINTS = ['/api/data/sync/status', '/health'];
app.use((req, res, next) => {
  if (!SILENT_ENDPOINTS.includes(req.path)) {
    logger.info(`${req.method} ${req.path}`, {
      ip: req.ip,
      userAgent: req.get('user-agent')
    });
  }
  next();
});

// ===== ROUTES =====

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'invsio-backend',
    version: BUILD_INFO.version,
    buildInfo: BUILD_INFO,  // P0 FIX: Include full build info for verification
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    features: {
      marketAnalyzer: true,
      backtest: true,
      p0CvdFix: BUILD_INFO.p0CvdFix
    }
  });
});

// Market analyzer routes
app.use('/api/ai-market-analyzer', marketAnalyzerRoutes);

// Backtest routes
app.use('/api/backtest', backtestRoutes);

// History routes (Phase 4)
app.use('/api/history', historyRoutes);

// Replay backtest routes (Stage 3)
app.use('/api/replay', replayRoutes);

// Config calibration routes (Phase 8)
app.use('/api/config', configRoutes);

// Historical data routes (Phase 10)
app.use('/api/data', dataRoutes);

// Root route
app.get('/', (req, res) => {
  res.json({
    service: 'INVSIO Backend',
    status: 'running',
    version: '2.2.0',
    endpoints: {
      health: 'GET /health',
      marketAnalyzer: 'GET /api/ai-market-analyzer/btc',
      marketExplain: 'GET /api/ai-market-analyzer/btc/explain',
      historyStates: 'GET /api/history/states',
      historyAlerts: 'GET /api/history/alerts',
      historyStats: 'GET /api/history/stats',
      backtestRun: 'POST /api/backtest/run',
      backtestStatus: 'GET /api/backtest/status'
    }
  });
});


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
      'POST /api/ai-market-analyzer/clear-cache',
      'POST /api/backtest/run',
      'GET /api/backtest/status'
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
 * Cron jobs for market data refresh
 * DISABLED by default to avoid rate limits during development
 * Set ENABLE_CRON_JOBS=true in .env to enable
 */
if (process.env.NODE_ENV !== 'test' && process.env.ENABLE_CRON_JOBS === 'true') {
  // Run every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    // Check if cron is paused (during replay batches)
    if (cronControl.shouldSkip()) {
      logger.info('⏸️ Cron skipped: Replay batch in progress');
      return;
    }

    logger.info('🔄 Running scheduled market data refresh...');
    try {
      const { snapshot, history } = await marketDataService.getFuturesMarketData('BTCUSDT', {
        timeframes: ['30m', '1h', '4h', '1d']
      });
      const metrics = marketMetrics.calculateMarketMetrics({ snapshot, history });

      // Check for alerts
      const alerts = alertService.checkAlerts(metrics);

      // Save state to database
      const saveResult = await stateStorage.saveMarketState(metrics);
      if (saveResult.success) {
        logger.info(`💾 Market state saved: ${saveResult.id}`);

        // Save alerts if any
        if (alerts.length > 0) {
          await stateStorage.saveAlerts(alerts, saveResult.id);
          logger.info(`🔔 ${alerts.length} alerts saved`);
        }
      }

      cacheManager.set('market_snapshot_btc', {
        success: true,
        data: { ...metrics, alerts },
        meta: {
          cached: false,
          timestamp: new Date().toISOString(),
          source: 'coinglass_api_v4',
          stateId: saveResult.id
        }
      });

      logger.info('✅ Scheduled refresh completed successfully');
    } catch (error) {
      logger.error('❌ Scheduled refresh failed:', error);
    }
  });

  // Daily summary generation at midnight
  cron.schedule('0 0 * * *', async () => {
    logger.info('📊 Generating daily summary...');
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const dateStr = yesterday.toISOString().split('T')[0];

      const result = await stateStorage.generateDailySummary(dateStr);
      if (result && result.success) {
        logger.info(`✅ Daily summary generated for ${dateStr}`);
      }

      // Run cleanup
      const cleanup = await stateStorage.cleanupOldData();
      logger.info(`🧹 Cleanup: ${cleanup.statesDeleted || 0} states, ${cleanup.alertsDeleted || 0} alerts removed`);
    } catch (error) {
      logger.error('❌ Daily summary generation failed:', error);
    }
  });

  logger.info('⏰ Background cron jobs initialized (refresh every 5 min, daily summary at midnight)');
} else {
  logger.info('ℹ️ Cron jobs disabled (set ENABLE_CRON_JOBS=true to enable)');
}

// ===== SERVER STARTUP =====

app.listen(PORT, async () => {
  logger.info(`🚀 INVSIO Backend v2.2 running on port ${PORT}`);
  logger.info(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`⏱️  Cache duration: ${process.env.CACHE_DURATION_MINUTES || 30} minutes`);
  logger.info(`🔗 Exchange mapping: Binance=BTCUSDT, Bybit=BTCUSD`);
  logger.info(`📈 Backtest API: ${process.env.COINGLASS_API_KEY ? 'Ready' : 'No API key'}`);
  logger.info(`💾 Database: Supabase PostgreSQL`);

  // ===== PHASE 8: CONFIG INITIALIZATION =====
  try {
    const configResult = await configService.initializeConfig();
    logger.info(`⚙️  Config loaded: v${configResult.version} (source: ${configResult.source})`);
  } catch (configError) {
    logger.warn('⚠️ Config initialization failed:', configError.message);
    logger.info('   └─ Using fallback defaults');
  }

  // ===== PHASE 5: STATE HYDRATION ON STARTUP =====
  try {
    logger.info('🔄 Hydrating state from database...');

    // 1. Hydrate Deduplication Cache (Prevent duplicate state saves)
    await stateStorage.hydrateDedupCache('BTC');

    // 2. Hydrate Alert Cooldowns (Prevent duplicate alerts)
    // Look back 4 hours (max alert cooldown)
    const alertLookback = 4 * 60 * 60 * 1000;
    const recentAlerts = await stateStorage.getAlertHistory(Date.now() - alertLookback, null, null, 500);
    alertService.hydrateCooldowns(recentAlerts);

    // 3. Hydrate Previous State (Context for trends)
    const lastState = await stateStorage.getLatestState('BTC');

    if (lastState && lastState.full_state_json) {
      // full_state_json is already parsed by Supabase (JSONB → JS object)
      const parsedState = typeof lastState.full_state_json === 'string'
        ? JSON.parse(lastState.full_state_json)
        : lastState.full_state_json;
      alertService.setPreviousState(parsedState);
      logger.info(`✅ State hydrated from ${new Date(lastState.timestamp).toISOString()}`);
      logger.info(`   └─ Last bias: ${lastState.bias}, confidence: ${lastState.confidence}`);
    } else {
      logger.info('ℹ️ No previous state found - starting fresh');
    }
  } catch (hydrationError) {
    logger.error('⚠️ State hydration failed:', hydrationError.message);
    logger.info('   └─ Continuing without previous state');
  }

  // Pre-populate cache on startup - DISABLED to avoid rate limits
  // The cache will be populated on the first request or cron job instead
  // This prevents the "Too Many Requests" errors on server restart
  if (process.env.ENABLE_STARTUP_CACHE === 'true') {
    setTimeout(async () => {
      try {
        logger.info('🔄 Pre-populating cache...');
        const startTime = Date.now();

        const { snapshot, history } = await marketDataService.getFuturesMarketData('BTCUSDT', {
          timeframes: ['30m', '1h', '4h', '1d']
        });
        const metrics = marketMetrics.calculateMarketMetrics({ snapshot, history });

        // Check for alerts
        const alerts = alertService.checkAlerts(metrics);

        // Log alert events
        if (alerts.length > 0) {
          alerts.forEach(alert => {
            logger.info(`🔔 ALERT FIRED: [${alert.type}] ${alert.title}`, {
              priority: alert.priority,
              id: alert.id
            });
          });
        }

        // Save initial state to database
        const saveResult = await stateStorage.saveMarketState(metrics);
        if (saveResult.success) {
          logger.info(`💾 Initial market state saved: ${saveResult.id}`);

          if (alerts.length > 0) {
            await stateStorage.saveAlerts(alerts, saveResult.id);
            logger.info(`🔔 ${alerts.length} initial alerts saved`);
          }
        }

        cacheManager.set('market_snapshot_btc', {
          success: true,
          data: { ...metrics, alerts },
          meta: {
            cached: false,
            timestamp: new Date().toISOString(),
            source: 'coinglass_api_v4',
            stateId: saveResult.id
          }
        });

        const duration = Date.now() - startTime;
        logger.info(`✅ Initial cache populated in ${(duration / 1000).toFixed(1)}s`);
      } catch (error) {
        logger.error('❌ Failed to populate initial cache:', error.message);
      }
    }, 2000);
  } else {
    logger.info('ℹ️ Startup cache pre-population disabled (set ENABLE_STARTUP_CACHE=true to enable)');
  }
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
