// marketDataService.js
// LIVE data fetching - responsible for fetching current market data for AI models
// Uses coinglassClient as single source of truth for API communication
//
// NOTE: This service is for LIVE data only (limit-based, ends at "now")
// For historical/replay data, use historicalDataService.js

const coinglassClient = require('./coinglassClient');

/**
 * Wrapper for backward compatibility - delegates to coinglassClient
 * @deprecated Use coinglassClient.request() directly for new code
 */
async function coinglassGET(endpoint, params = {}) {
  return coinglassClient.request(endpoint, params);
}

// ---------------------------
// Issue 5 Fix: Data Staleness Validation
// ---------------------------

/**
 * Validates that candle data is fresh (not stale from API lag/maintenance)
 * @param {Array} candles - Array of candle data
 * @param {string} timeframe - Timeframe (e.g., '30m', '1h', '4h', '1d')
 * @param {number} maxLagMultiplier - How many TF intervals before data is considered stale (default: 2)
 * @returns {Object} - { valid: boolean, reason: string, ageMinutes: number }
 */
function validateDataFreshness(candles, timeframe, maxLagMultiplier = 2) {
  if (!candles || candles.length === 0) {
    return { valid: false, reason: 'No candle data received', ageMinutes: null };
  }

  const latestCandle = candles[candles.length - 1];

  // Handle various timestamp formats from Coinglass
  const candleTime = latestCandle.time || latestCandle.t || latestCandle.timestamp || latestCandle.createTime;

  if (!candleTime) {
    return { valid: false, reason: 'No timestamp in candle data', ageMinutes: null };
  }

  // Convert to ms timestamp
  let candleTimestamp = candleTime;
  if (typeof candleTime === 'string') {
    candleTimestamp = new Date(candleTime).getTime();
  } else if (candleTime < 1e12) {
    // If timestamp is in seconds, convert to ms
    candleTimestamp = candleTime * 1000;
  }

  const now = Date.now();

  // Calculate max acceptable age based on timeframe
  const timeframeMs = {
    '1m': 60 * 1000,
    '5m': 5 * 60 * 1000,
    '15m': 15 * 60 * 1000,
    '30m': 30 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    'h1': 60 * 60 * 1000,
    '4h': 4 * 60 * 60 * 1000,
    'h4': 4 * 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000,
    'd1': 24 * 60 * 60 * 1000
  };

  const tfMs = timeframeMs[timeframe] || 60 * 60 * 1000; // Default 1h
  const maxAge = tfMs * maxLagMultiplier;
  const actualAge = now - candleTimestamp;
  const ageMinutes = Math.round(actualAge / 60000);

  if (actualAge > maxAge) {
    const maxAgeMinutes = Math.round(maxAge / 60000);
    return {
      valid: false,
      reason: `Data stale: ${ageMinutes}min old, max allowed: ${maxAgeMinutes}min`,
      ageMinutes,
      stale: true
    };
  }

  return { valid: true, ageMinutes, stale: false };
}

// ---------------------------
// Fetchers
// ---------------------------

// Price OHLC
async function getPriceOHLC(exchange, symbol, interval = "4h", limit = 10) {
  return await coinglassGET("/futures/price/history", {
    exchange,
    symbol,
    interval,
    limit,
  });
}

// Open Interest OHLC
async function getOpenInterestOHLC(exchange, symbol, interval = "4h", limit = 10) {
  return await coinglassGET("/futures/open-interest/history", {
    exchange,
    symbol,
    interval,
    limit,
  });
}

// Funding Rate OHLC
async function getFundingRateOHLC(exchange, symbol, interval = "4h", limit = 10) {
  return await coinglassGET("/futures/funding-rate/history", {
    exchange,
    symbol,
    interval,
    limit,
  });
}

// Taker Buy/Sell (CVD)
async function getTakerBuySellVolume(exchange, symbol, interval = "h4", limit = 100) {
  return await coinglassGET("/futures/v2/taker-buy-sell-volume/history", {
    exchange,
    symbol,
    interval,
    limit,
  });
}

// ---------------------------
// Historical Data Fetchers (NEW)
// ---------------------------

// Get price history for technical analysis
async function getPriceHistory(exchange, symbol, interval = "4h", limit = 50) {
  const data = await coinglassGET("/futures/price/history", {
    exchange,
    symbol,
    interval,
    limit,
  });

  // Issue 5: Validate data freshness (WARN ONLY mode)
  const freshness = validateDataFreshness(data, interval);
  if (!freshness.valid) {
    console.warn(`⚠️ STALE DATA [${exchange} ${symbol} ${interval}]: ${freshness.reason}`);
  }

  // Transform to consistent format
  const transformed = data.map(candle => ({
    time: candle.time,
    open: Number(candle.open),
    high: Number(candle.high),
    low: Number(candle.low),
    close: Number(candle.close),
    volume: Number(candle.volume_usd || 0),
    price: Number(candle.close), // Alias for marketMetrics
    _stale: freshness.stale || false,
    _ageMinutes: freshness.ageMinutes
  }));

  return transformed;
}

// Get OI history for technical analysis
async function getOIHistory(exchange, symbol, interval = "4h", limit = 50) {
  const data = await coinglassGET("/futures/open-interest/history", {
    exchange,
    symbol,
    interval,
    limit,
  });

  return data.map(candle => ({
    time: candle.time,
    open: Number(candle.open || candle.o),
    high: Number(candle.high || candle.h),
    low: Number(candle.low || candle.l),
    close: Number(candle.close || candle.c),
    oi: Number(candle.close || candle.c) // Alias for marketMetrics
  }));
}

// Get funding rate history for technical analysis
async function getFundingHistory(exchange, symbol, interval = "4h", limit = 30) {
  const data = await coinglassGET("/futures/funding-rate/history", {
    exchange,
    symbol,
    interval,
    limit,
  });

  return data.map(candle => ({
    time: candle.time,
    open: Number(candle.open),
    high: Number(candle.high),
    low: Number(candle.low),
    close: Number(candle.close),
    rate: Number(candle.close), // Alias for marketMetrics
    funding_rate_avg_pct: Number(candle.close * 100) // Convert to percentage
  }));
}

// ---------------------------
// Calculations
// ---------------------------

// Price / OI change %
function calculateChange(latest, previous) {
  if (!latest || !previous || previous === 0) return null;
  return Number((((latest - previous) / previous) * 100).toFixed(2));
}

// Extract volume from price OHLC - flexible based on use case
function extractVolumeFromPriceOHLC(priceData, mode = "single") {
  if (!priceData?.length) return { volume: null, volume_sum: null };

  const lastCandle = priceData[priceData.length - 1];
  const singleVolume = Number(lastCandle.volume_usd || 0);

  // Sum all volumes for macro analysis
  const totalVolume = priceData.reduce((acc, candle) => {
    return acc + Number(candle.volume_usd || 0);
  }, 0);

  return {
    volume: Number(singleVolume.toFixed(2)),      // Last candle only
    volume_sum: Number(totalVolume.toFixed(2)),    // Sum of all candles (for macro)
    volume_avg: Number((totalVolume / priceData.length).toFixed(2)) // Average per candle
  };
}

/**
 * =======================================================================
 * CVD CONFIGURATION (P0 FIX: Timeframe-Correct CVD)
 * =======================================================================
 * 
 * Each timeframe has a defined rolling window to prevent macro bleed.
 * IMPORTANT: windowCandles is based on the actual API interval, not the timeframe.
 * 
 * Coinglass STARTUP plan supports taker-buy/sell intervals: m30, h1, h4, h24
 * (≥30m resolution is available on STARTUP)
 */
const CVD_WINDOW_CONFIG = {
  '30m': {
    apiInterval: 'm30',  // Real 30m data from Coinglass
    windowCandles: 48,   // 48 x 30m = 24 hours
    minCandles: 38,      // 80% threshold
    description: '48 x 30m candles = 24h window'
  },
  '1h': {
    apiInterval: 'h1',   // Real 1h data
    windowCandles: 24,   // 24 x 1h = 24 hours
    minCandles: 19,      // 80% threshold
    description: '24 x 1h candles = 24h window'
  },
  '4h': {
    apiInterval: 'h4',   // Real 4h data
    windowCandles: 18,   // 18 x 4h = 72 hours
    minCandles: 14,      // 80% threshold
    description: '18 x 4h candles = 72h window'
  },
  '1d': {
    apiInterval: 'h24',  // Real 24h data
    windowCandles: 14,   // 14 x 24h = 2 weeks
    minCandles: 11,      // 80% threshold
    description: '14 x 24h candles = 2 week window'
  }
};

/**
 * Get the API interval for a given timeframe
 * Returns the actual Coinglass API interval format
 */
function getCVDApiInterval(timeframe) {
  return CVD_WINDOW_CONFIG[timeframe]?.apiInterval || 'h4';
}

// Legacy CVD calculation (backward compatibility)
function calculateCVD(takerData) {
  if (!takerData?.length) return 0;

  const cvd = takerData.reduce((acc, c) => {
    const buy = Number(c.taker_buy_volume_usd || c.buyVol || 0);
    const sell = Number(c.taker_sell_volume_usd || c.sellVol || 0);
    return acc + (buy - sell);
  }, 0);

  return Number(cvd.toFixed(2));
}

/**
 * NEW: Calculate CVD with slope analysis using normalized deltas
 * 
 * Per-candle delta is normalized to -1 to +1 range:
 *   delta = (buy - sell) / (buy + sell)
 * 
 * This allows cross-exchange and cross-timeframe comparison.
 * 
 * @param {Array} takerData - Taker buy/sell history from Coinglass
 * @param {number} slopeWindow - Number of candles for slope calculation (default: 10)
 * @returns {Object} CVD result with slope and direction
 */
function calculateCVDWithSlope(takerData, slopeWindow = 10) {
  const result = {
    cvdTotal: 0,
    cvdTotalNormalized: 0,
    cvdSlope: 0,
    cvdSlopeNormalized: 0,
    cvdDirection: 'flat',
    cvdSeries: [],
    cvdSeriesNormalized: []
  };

  if (!takerData?.length) {
    return result;
  }

  // Step 1: Calculate per-candle normalized deltas and build cumulative series
  let cumulativeRaw = 0;
  let cumulativeNorm = 0;

  takerData.forEach(candle => {
    const buy = Number(candle.taker_buy_volume_usd || candle.buyVol || 0);
    const sell = Number(candle.taker_sell_volume_usd || candle.sellVol || 0);
    const total = buy + sell;

    // Raw delta (USD)
    const rawDelta = buy - sell;
    cumulativeRaw += rawDelta;
    result.cvdSeries.push(cumulativeRaw);

    // Normalized delta (-1 to +1)
    // Avoid division by zero
    const normDelta = total > 0 ? (buy - sell) / total : 0;
    cumulativeNorm += normDelta;
    result.cvdSeriesNormalized.push(cumulativeNorm);
  });

  result.cvdTotal = Number(cumulativeRaw.toFixed(2));
  result.cvdTotalNormalized = Number(cumulativeNorm.toFixed(4));

  // Step 2: Calculate slope of recent N candles (normalized series)
  if (result.cvdSeriesNormalized.length >= slopeWindow) {
    const recentNorm = result.cvdSeriesNormalized.slice(-slopeWindow);
    result.cvdSlopeNormalized = calculateSlope(recentNorm);

    // Also calculate raw slope for reference
    const recentRaw = result.cvdSeries.slice(-slopeWindow);
    result.cvdSlope = calculateSlope(recentRaw);
  }

  // Step 3: Determine direction based on normalized slope
  // Use small threshold to filter noise
  const DIRECTION_THRESHOLD = 0.001;
  if (result.cvdSlopeNormalized > DIRECTION_THRESHOLD) {
    result.cvdDirection = 'rising';
  } else if (result.cvdSlopeNormalized < -DIRECTION_THRESHOLD) {
    result.cvdDirection = 'falling';
  } else {
    result.cvdDirection = 'flat';
  }

  return result;
}

/**
 * Simple linear regression slope calculation
 * @param {Array<number>} values - Array of numeric values
 * @returns {number} Slope of the line
 */
function calculateSlope(values) {
  const n = values.length;
  if (n < 2) return 0;

  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumXX += i * i;
  }

  const numerator = n * sumXY - sumX * sumY;
  const denominator = n * sumXX - sumX * sumX;

  return denominator === 0 ? 0 : numerator / denominator;
}

/**
 * P0 FIX: Calculate CVD per timeframe with proper windowing and reliability
 * 
 * @param {Array} takerData - Taker buy/sell history from Coinglass
 * @param {string} timeframe - Target timeframe ('30m', '1h', '4h', '1d')
 * @returns {Object} CVD result with metadata
 */
function calculateCVDPerTimeframe(takerData, timeframe) {
  const config = CVD_WINDOW_CONFIG[timeframe] || CVD_WINDOW_CONFIG['4h'];
  const { apiInterval, windowCandles, minCandles, description } = config;

  // Minimum volume thresholds for market impact reliability
  // Below these, CVD may not reflect meaningful order flow
  const MIN_AVG_VOLUME_PER_CANDLE = {
    '30m': 500000,    // $500K/30m = low activity threshold
    '1h': 1000000,    // $1M/hour
    '4h': 5000000,    // $5M/4h
    '1d': 50000000    // $50M/day
  };
  const minVolumeThreshold = MIN_AVG_VOLUME_PER_CANDLE[timeframe] || 1000000;

  // Default result structure with split reliability flags
  const result = {
    cvd: 0,
    cvdDelta: 0,                           // Last bar delta
    cvdNormalized: 0,                      // CVD / total volume (for cross-exchange comparison)
    cvdResolution: apiInterval,            // ACTUAL API interval used (m30, h1, h4, h24)
    cvdIntervalUsed: apiInterval,          // Exact interval param sent to Coinglass
    cvdRequestedTimeframe: timeframe,      // Original requested timeframe (30m, 1h, 4h, 1d)
    cvdWindowCandles: windowCandles,
    cvdActualCandles: 0,
    // SPLIT RELIABILITY FLAGS
    cvdDataComplete: false,                // NEW: Sufficient candles with no major gaps
    cvdMarketImpactReliable: false,        // NEW: Volume high enough for meaningful signals
    cvdReliableForTf: false,               // COMBINED: true only when BOTH above are true
    cvdDataReason: null,                   // Reason if cvdDataComplete is false
    cvdMarketReason: null,                 // Reason if cvdMarketImpactReliable is false
    cvdReason: null,                       // Legacy: combined reason
    cvdWindowDescription: description,
    // Volume metrics for debugging
    cvdTotalVolume: 0,
    cvdAvgVolumePerCandle: 0,
    cvdMinVolumeThreshold: minVolumeThreshold
  };

  // Reliability Check 1: No data
  if (!takerData?.length) {
    result.cvdDataReason = 'No taker data received';
    result.cvdReason = 'No taker data received';
    return result;
  }

  // Take only the last N candles for the window
  const windowData = takerData.slice(-windowCandles);
  result.cvdActualCandles = windowData.length;

  // Reliability Check 2: Insufficient candles (< 80% of expected)
  if (windowData.length < minCandles) {
    result.cvdDataReason = `Insufficient candles: ${windowData.length}/${windowCandles} (need ${minCandles}+)`;
    result.cvdReason = result.cvdDataReason;
    return result;
  }

  // Process data and calculate metrics
  let consecutiveZeros = 0;
  let maxConsecutiveZeros = 0;
  let totalVolume = 0;
  let cvdAccumulator = 0;

  for (let i = 0; i < windowData.length; i++) {
    const c = windowData[i];
    const buy = Number(c.taker_buy_volume_usd || c.buyVol || 0);
    const sell = Number(c.taker_sell_volume_usd || c.sellVol || 0);
    const candleVolume = buy + sell;
    const delta = buy - sell;

    totalVolume += candleVolume;
    cvdAccumulator += delta;

    if (candleVolume === 0) {
      consecutiveZeros++;
      maxConsecutiveZeros = Math.max(maxConsecutiveZeros, consecutiveZeros);
    } else {
      consecutiveZeros = 0;
    }
  }

  // Store volume metrics
  const avgVolumePerCandle = totalVolume / windowData.length;
  result.cvdTotalVolume = Number(totalVolume.toFixed(2));
  result.cvdAvgVolumePerCandle = Number(avgVolumePerCandle.toFixed(2));

  // Reliability Check 3: Too many consecutive zero-volume candles
  if (maxConsecutiveZeros > 3) {
    result.cvd = Number(cvdAccumulator.toFixed(2));
    result.cvdDataReason = `Too many consecutive zero-volume candles: ${maxConsecutiveZeros}`;
    result.cvdReason = result.cvdDataReason;
    return result;
  }

  // Data completeness check PASSED
  result.cvdDataComplete = true;
  result.cvdDataReason = null;

  // Calculate last bar delta
  const lastCandle = windowData[windowData.length - 1];
  const lastBuy = Number(lastCandle.taker_buy_volume_usd || lastCandle.buyVol || 0);
  const lastSell = Number(lastCandle.taker_sell_volume_usd || lastCandle.sellVol || 0);
  result.cvdDelta = Number((lastBuy - lastSell).toFixed(2));

  // Set CVD value
  result.cvd = Number(cvdAccumulator.toFixed(2));

  // Calculate normalized CVD (CVD / total volume)
  if (totalVolume > 0) {
    result.cvdNormalized = Number((cvdAccumulator / totalVolume).toFixed(4));
  }

  // Market Impact Check: Is volume high enough for meaningful CVD signal?
  if (avgVolumePerCandle < minVolumeThreshold) {
    result.cvdMarketImpactReliable = false;
    result.cvdMarketReason = `Low volume: avg $${(avgVolumePerCandle / 1e6).toFixed(2)}M/candle (need $${(minVolumeThreshold / 1e6).toFixed(1)}M+)`;
    result.cvdReason = result.cvdMarketReason;
    // cvdReliableForTf stays false - low volume exchanges shouldn't drive decisions
    return result;
  }

  // Market impact check PASSED
  result.cvdMarketImpactReliable = true;
  result.cvdMarketReason = null;

  // BOTH checks passed - CVD is fully reliable for this timeframe
  result.cvdReliableForTf = true;
  result.cvdReason = null;

  return result;
}

// Funding rate average - INCLUDE NEGATIVE VALUES
function calculateFundingAverage(fundingData) {
  if (!fundingData?.length) return null;

  // Extract close values and convert to numbers - KEEP NEGATIVE VALUES
  const values = fundingData
    .map(c => Number(c.close || c.rate || c.fundingRate || 0))
    .filter(v => !Number.isNaN(v)); // Only filter NaN, keep negative and zero

  if (values.length === 0) return null;

  const sum = values.reduce((a, b) => a + b, 0);
  const avg = sum / values.length;

  // Return as percentage with 4 decimals (e.g., 0.0056 = 0.56%)
  return Number((avg * 100).toFixed(4));
}

// ---------------------------
// Unified Market Snapshot Builder
// ---------------------------

// Helper for delay
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function getMarketSnapshot(exchange, symbol, intervals = ["4h", "1d"]) {
  const result = {};

  for (const tf of intervals) {
    try {
      // Fetch sequentially with 800ms delay (Safe for 80 req/min limit)
      const priceOHLC = await getPriceOHLC(exchange, symbol, tf, 10);
      await sleep(800);

      const oiOHLC = await getOpenInterestOHLC(exchange, symbol, tf, 10);
      await sleep(800);

      const fundingOHLC = await getFundingRateOHLC(exchange, symbol, tf, 10);
      await sleep(800);

      // P0 FIX: Use correct interval mapping per timeframe
      // Now uses actual API intervals: m30, h1, h4, h24 (not the old buggy h24 default)
      const cvdConfig = CVD_WINDOW_CONFIG[tf] || CVD_WINDOW_CONFIG['4h'];
      const cvdInterval = cvdConfig.apiInterval;
      const takerVolume = await getTakerBuySellVolume(exchange, symbol, cvdInterval, cvdConfig.windowCandles + 10);
      await sleep(800);

      // Validate we have enough data (at least 2 candles for change calculation)
      if (!priceOHLC?.length || priceOHLC.length < 2 ||
        !oiOHLC?.length || oiOHLC.length < 2) {
        console.warn(`⚠️ Insufficient data for ${exchange} ${symbol} ${tf}`);
        result[tf] = null;
        continue;
      }

      // Arrays are returned in chronological order, so LAST item is the latest
      const latestPrice = priceOHLC[priceOHLC.length - 1];
      const previousPrice = priceOHLC[priceOHLC.length - 2];
      const latestOI = oiOHLC[oiOHLC.length - 1];
      const previousOI = oiOHLC[oiOHLC.length - 2];

      const volumeData = extractVolumeFromPriceOHLC(priceOHLC);

      // P0 FIX: Calculate CVD with per-timeframe windowing and reliability checks
      const cvdResult = calculateCVDPerTimeframe(takerVolume, tf);

      result[tf] = {
        price: Number(latestPrice?.close || 0),
        price_change: calculateChange(
          Number(latestPrice?.close || 0),
          Number(previousPrice?.close || 0)
        ),
        oi: Number(latestOI?.close || latestOI?.high || 0),
        oi_change: calculateChange(
          Number(latestOI?.close || latestOI?.high || 0),
          Number(previousOI?.close || previousOI?.high || 0)
        ),
        volume: volumeData.volume,           // Last candle volume (for micro analysis)
        volume_sum: volumeData.volume_sum,   // Sum of 10 candles (for macro analysis)
        volume_avg: volumeData.volume_avg,   // Average per candle

        // P0 FIX: CVD now includes full metadata with split reliability
        cvd: cvdResult.cvd,                            // Raw CVD value (backward compatible)
        cvdDelta: cvdResult.cvdDelta,                  // Last bar delta
        cvdNormalized: cvdResult.cvdNormalized,        // Normalized for cross-exchange comparison
        cvdResolution: cvdResult.cvdResolution,        // Actual API interval used (m30, h1, h4, h24)
        cvdIntervalUsed: cvdResult.cvdIntervalUsed,    // Exact interval sent to Coinglass API
        cvdRequestedTimeframe: cvdResult.cvdRequestedTimeframe,  // Original requested TF
        cvdWindowCandles: cvdResult.cvdWindowCandles,  // Expected window size
        cvdActualCandles: cvdResult.cvdActualCandles,  // Actual candles received
        // Split reliability flags
        cvdDataComplete: cvdResult.cvdDataComplete,              // Sufficient candles, no gaps
        cvdMarketImpactReliable: cvdResult.cvdMarketImpactReliable,  // Volume high enough
        cvdReliableForTf: cvdResult.cvdReliableForTf,            // BOTH above must be true
        cvdDataReason: cvdResult.cvdDataReason,                  // Reason if data incomplete
        cvdMarketReason: cvdResult.cvdMarketReason,              // Reason if low volume
        cvdReason: cvdResult.cvdReason,                          // Legacy combined reason
        // Volume metrics for debugging
        cvdTotalVolume: cvdResult.cvdTotalVolume,
        cvdAvgVolumePerCandle: cvdResult.cvdAvgVolumePerCandle,

        funding_rate_avg_pct: calculateFundingAverage(fundingOHLC),
      };
    } catch (err) {
      console.error(`❌ Error constructing snapshot for ${exchange} ${symbol} ${tf}:`, err.message);
      result[tf] = null;
    }
  }

  return result;
}

// ---------------------------
// Main exported function (UPDATED)
// ---------------------------
async function getFuturesMarketData(symbol = "BTCUSDT", options = {}) {
  const {
    includeHistory = true,
    timeframes = ["4h", "1d"], // Default: macro analysis
    // Available timeframes: "1m", "5m", "15m", "30m", "1h", "4h", "1d"
  } = options;

  const exchanges = ["Binance", "Bybit"];
  const snapshot = {};

  // Fetch snapshot data for both exchanges
  let exchangeErrors = [];

  for (const ex of exchanges) {
    // Map symbol for Bybit - use COIN-MARGINED (BTCUSD) instead of USDT-M
    let exSymbol = symbol;
    if (ex === "Bybit" && symbol === "BTCUSDT") {
      exSymbol = "BTCUSD"; // Bybit coin-margined = smart money
    }

    try {
      snapshot[ex] = await getMarketSnapshotMultiTF(ex, exSymbol, timeframes);
    } catch (err) {
      // Phase 5: Return partial data if one exchange fails
      console.error(`⚠️ Exchange ${ex} failed:`, err.message);
      exchangeErrors.push({ exchange: ex, error: err.message });
      snapshot[ex] = null;
    }
  }

  // Log if running on partial data
  if (exchangeErrors.length > 0) {
    console.warn(`⚠️ Running with partial data. Failed exchanges: ${exchangeErrors.map(e => e.exchange).join(', ')}`);
  }

  // If history is not requested, return only snapshot
  if (!includeHistory) {
    return snapshot;
  }

  // Fetch historical data (using Binance as primary source)
  // Fetch for ALL requested timeframes
  let history = {};
  const historyStartTime = Date.now();

  try {
    console.log(`📊 Fetching history for ${timeframes.length} timeframes: ${timeframes.join(', ')}`);

    for (let i = 0; i < timeframes.length; i++) {
      const tf = timeframes[i];
      const tfStartTime = Date.now();
      console.log(`  [${i + 1}/${timeframes.length}] Fetching ${tf} history...`);

      // Fetch sequentially with 800ms delay (Safe for 80 req/min limit)
      const priceHist = await getPriceHistory("Binance", symbol, tf, 50);
      console.log(`    ✓ ${tf} price history (${Date.now() - tfStartTime}ms)`);
      await sleep(800);

      const oiHist = await getOIHistory("Binance", symbol, tf, 50);
      console.log(`    ✓ ${tf} OI history (${Date.now() - tfStartTime}ms)`);
      await sleep(800);

      const fundingHist = await getFundingHistory("Binance", symbol, tf, 30);
      console.log(`    ✓ ${tf} funding history (${Date.now() - tfStartTime}ms)`);
      await sleep(800);

      history[tf] = {
        priceHistory: priceHist,
        oiHistory: oiHist,
        fundingHistory: fundingHist
      };

      console.log(`  ✅ ${tf} complete in ${Date.now() - tfStartTime}ms`);
    }

    console.log(`📊 All history fetched in ${(Date.now() - historyStartTime) / 1000}s`);
  } catch (err) {
    console.error(`⚠️ Error fetching historical data:`, err.message);
  }

  return {
    snapshot,
    history,
    // Phase 5: Include partial data metadata
    _meta: {
      exchangeErrors: exchangeErrors.length > 0 ? exchangeErrors : null,
      partialData: exchangeErrors.length > 0
    }
  };
}

// Helper function for multi-timeframe snapshot
async function getMarketSnapshotMultiTF(exchange, symbol, timeframes) {
  const result = {};

  for (const tf of timeframes) {
    try {
      const snapshotData = await getMarketSnapshot(exchange, symbol, [tf]);
      result[tf] = snapshotData[tf];
    } catch (err) {
      console.error(`⚠️ Error fetching ${exchange} ${symbol} ${tf}:`, err.message);
      result[tf] = null;
    }
  }

  return result;
}

// ---------------------------
// Exports
// ---------------------------
module.exports = {
  getFuturesMarketData,
  getPriceOHLC,
  getOpenInterestOHLC,
  getFundingRateOHLC,
  getTakerBuySellVolume,
  getPriceHistory,
  getOIHistory,
  getFundingHistory,
  calculateChange,
  calculateCVD,
  calculateCVDPerTimeframe,  // P0 FIX: New per-timeframe CVD with reliability
  CVD_WINDOW_CONFIG,         // P0 FIX: Window configuration for CVD
  getCVDApiInterval,         // P0 FIX: Get API interval for timeframe
  calculateFundingAverage,
  getMarketSnapshot,
  getMarketSnapshotMultiTF,
  validateDataFreshness
};
