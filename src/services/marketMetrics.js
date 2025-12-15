// marketMetrics.js - ULTIMATE VERSION
// Strategic Whale Analysis (Claude) + Technical Depth (ChatGPT)
// Based on SmartTrading Market Analyzer Logic Document

/**
 * =======================================================================
 * GOLDEN RULES (from PDF)
 * =======================================================================
 * 1. Binance = noise. Bybit = truth.
 * 2. Price shows direction. OI shows intention.
 * 3. Funding shows crowding.
 * 4. CVD reveals aggression.
 * 5. OI drop in rallies = weakness.
 * 6. OI rise in declines = strength.
 * 7. Divergence without OI confirmation is worthless.
 * 8. Smart money leaves footprints in Bybit COIN-M.
 */

/**
 * =======================================================================
 * PART 0.1: TIMEFRAME-AWARE THRESHOLDS
 * =======================================================================
 * These thresholds define what constitutes "noise" vs "significant" moves
 * for each timeframe. This prevents treating a 0.3% 30m move the same as
 * a 0.3% daily move.
 */

const THRESHOLDS = {
  '30m': {
    price: { noise: 0.25, strong: 0.5 },
    oi: { quiet: 0.15, aggressive: 0.3 },
    funding: 0.03
  },
  '1h': {
    price: { noise: 0.4, strong: 0.8 },
    oi: { quiet: 0.25, aggressive: 0.5 },
    funding: 0.04
  },
  '4h': {
    price: { noise: 0.65, strong: 1.3 },
    oi: { quiet: 0.5, aggressive: 1.0 },
    funding: 0.05
  },
  '1d': {
    price: { noise: 1.15, strong: 2.3 },
    oi: { quiet: 1.0, aggressive: 2.0 },
    funding: 0.06
  }
};

/**
 * =======================================================================
 * PART 0.2: CLASSIFIER FUNCTIONS
 * =======================================================================
 * These functions classify raw percentage changes into meaningful categories
 * based on timeframe-specific thresholds.
 */

/**
 * Classify a price move based on timeframe thresholds
 * @param {number} changePct - Price change percentage
 * @param {string} timeframe - Timeframe (30m, 1h, 4h, 1d)
 * @returns {Object} { direction: 'UP'|'DOWN'|'FLAT', strength: 'noise'|'normal'|'strong' }
 */
function classifyPriceMove(changePct, timeframe) {
  const t = THRESHOLDS[timeframe] || THRESHOLDS['4h'];
  const abs = Math.abs(changePct || 0);

  if (abs < t.price.noise) return { direction: 'FLAT', strength: 'noise' };

  const direction = changePct > 0 ? 'UP' : 'DOWN';
  const strength = abs >= t.price.strong ? 'strong' : 'normal';

  return { direction, strength };
}

/**
 * Classify an OI move based on timeframe thresholds
 * @param {number} changePct - OI change percentage
 * @param {string} timeframe - Timeframe (30m, 1h, 4h, 1d)
 * @returns {Object} { direction: 'RISING'|'FALLING'|'FLAT', strength: 'quiet'|'normal'|'aggressive' }
 */
function classifyOiMove(changePct, timeframe) {
  const t = THRESHOLDS[timeframe] || THRESHOLDS['4h'];
  const abs = Math.abs(changePct || 0);

  if (abs < t.oi.quiet) return { direction: 'FLAT', strength: 'quiet' };

  const direction = changePct > 0 ? 'RISING' : 'FALLING';
  const strength = abs >= t.oi.aggressive ? 'aggressive' : 'normal';

  return { direction, strength };
}

/**
 * Classify funding level using zScore as primary indicator
 * @param {number} rate - Current funding rate
 * @param {number} zScore - Z-score relative to historical funding
 * @returns {Object} { level: string, bias: 'LONG'|'SHORT'|'NEUTRAL' }
 */
function classifyFundingLevel(rate, zScore) {
  // Use zScore as primary (relative to history)
  if (zScore !== null && zScore !== undefined) {
    if (zScore > 2) return { level: 'critical_high', bias: 'SHORT' };
    if (zScore > 1) return { level: 'high', bias: 'SHORT' };
    if (zScore < -2) return { level: 'critical_low', bias: 'LONG' };
    if (zScore < -1) return { level: 'low', bias: 'LONG' };
  }
  return { level: 'normal', bias: 'NEUTRAL' };
}

/**
 * Compute confidence based on number of conditions met
 * @param {Array<boolean>} conditions - Array of condition results
 * @returns {number} Confidence score 0-10
 */
function computeConfidence(conditions) {
  const met = conditions.filter(c => c).length;
  return Math.round((met / conditions.length) * 10);
}


/**
 * =======================================================================
 * PART 0: TECHNICAL UTILS (from ChatGPT)
 * =======================================================================
 */

class TechnicalUtils {
  static safeArray(arr) {
    return Array.isArray(arr) ? arr : [];
  }

  static last(arr) {
    arr = this.safeArray(arr);
    return arr.length ? arr[arr.length - 1] : null;
  }

  static sma(values, length) {
    const arr = this.safeArray(values);
    if (arr.length < length || length <= 0) return null;
    const slice = arr.slice(-length);
    const sum = slice.reduce((acc, v) => acc + v, 0);
    return sum / length;
  }

  static ema(values, length) {
    const arr = this.safeArray(values);
    if (arr.length < length || length <= 0) return null;
    const k = 2 / (length + 1);
    let ema = arr[0];
    for (let i = 1; i < arr.length; i++) {
      ema = arr[i] * k + ema * (1 - k);
    }
    return ema;
  }

  static std(values) {
    const arr = this.safeArray(values);
    if (!arr.length) return null;
    const mean = arr.reduce((acc, v) => acc + v, 0) / arr.length;
    const variance = arr.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / arr.length;
    return Math.sqrt(variance);
  }

  static pctChange(from, to) {
    if (from === null || from === 0 || from === undefined || to == null) {
      return null;
    }
    return ((to - from) / Math.abs(from)) * 100;
  }

  static slope(values) {
    const arr = this.safeArray(values);
    const n = arr.length;
    if (n < 2) return null;

    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += arr[i];
      sumXY += i * arr[i];
      sumXX += i * i;
    }

    const numerator = n * sumXY - sumX * sumY;
    const denominator = n * sumXX - sumX * sumX;
    return denominator === 0 ? null : numerator / denominator;
  }

  static zScore(value, values) {
    const mean = this.sma(values, values.length);
    const std = this.std(values);
    if (mean === null || std === null || std === 0) return null;
    return (value - mean) / std;
  }
}

/**
 * =======================================================================
 * PART 1: EXCHANGE DIVERGENCE ENGINE (Claude - Strategic)
 * =======================================================================
 */

function analyzeExchangeDivergence(binance4h, bybit4h, timeframe = '4h') {
  const b = {
    price: binance4h.price || 0,
    priceChange: binance4h.price_change || 0,
    oi: binance4h.oi || 0,
    oiChange: binance4h.oi_change || 0,
    cvd: binance4h.cvd || 0,
    cvdReliable: binance4h.cvdReliableForTf !== false, // P0 FIX
    funding: binance4h.funding_rate_avg_pct || 0,
    volume: binance4h.volume || 0
  };

  const y = {
    price: bybit4h.price || 0,
    priceChange: bybit4h.price_change || 0,
    oi: bybit4h.oi || 0,
    oiChange: bybit4h.oi_change || 0,
    cvd: bybit4h.cvd || 0,
    cvdReliable: bybit4h.cvdReliableForTf !== false, // P0 FIX
    funding: bybit4h.funding_rate_avg_pct || 0,
    volume: bybit4h.volume || 0
  };

  // Use classifiers for timeframe-aware analysis
  const binancePriceMove = classifyPriceMove(b.priceChange, timeframe);
  const bybitPriceMove = classifyPriceMove(y.priceChange, timeframe);
  const binanceOiMove = classifyOiMove(b.oiChange, timeframe);
  const bybitOiMove = classifyOiMove(y.oiChange, timeframe);

  const deltas = {
    oi: b.oiChange - y.oiChange,
    cvd: (b.cvd - y.cvd) / 1e9,
    funding: b.funding - y.funding,
    volumeComparison: compareVolumeDirection(b.volume, y.volume)
  };

  // Classified conditions (timeframe-aware)
  const priceUp = binancePriceMove.direction === 'UP';
  const priceDown = binancePriceMove.direction === 'DOWN';
  const priceStrong = binancePriceMove.strength === 'strong';

  const binanceOiRising = binanceOiMove.direction === 'RISING';
  const binanceOiFalling = binanceOiMove.direction === 'FALLING';
  const binanceOiAggressive = binanceOiMove.strength === 'aggressive';

  const bybitOiRising = bybitOiMove.direction === 'RISING';
  const bybitOiFalling = bybitOiMove.direction === 'FALLING';
  const bybitOiAggressive = bybitOiMove.strength === 'aggressive';

  // P0 FIX: CVD conditions are neutralized if CVD is unreliable for either exchange
  const cvdReliable = b.cvdReliable && y.cvdReliable;
  const binanceCvdNegative = cvdReliable && b.cvd < 0;
  const binanceCvdPositive = cvdReliable && b.cvd > 0;
  const bybitCvdPositive = cvdReliable && y.cvd > 0;
  const bybitCvdNegative = cvdReliable && y.cvd < 0;

  const fundingHigh = b.funding > THRESHOLDS[timeframe]?.funding || 0.05;
  const fundingNegative = b.funding < 0;

  // Issue 3 Fix: Safe whale/retail ratio calculation with thresholds
  const whaleRetailCalc = calculateWhaleRetailRatio(y.oiChange, b.oiChange, y.oi, timeframe);
  const whaleRetailRatio = whaleRetailCalc.ratio;

  let scenario, confidence, bias, warnings = [];

  // P0 FIX: Add warning if CVD is unreliable
  if (!cvdReliable) {
    warnings.push(`CVD excluded from divergence analysis: ${!b.cvdReliable ? 'Binance CVD unreliable' : 'Bybit CVD unreliable'}`);
  }

  // SCENARIO 1: WHALE DISTRIBUTION (requires strong moves)
  const distConditions = [
    priceUp,
    priceStrong,
    bybitOiFalling,
    bybitOiAggressive,
    binanceOiRising,
    binanceCvdNegative
  ];
  if (distConditions.filter(c => c).length >= 4 && priceUp && bybitOiFalling) {
    scenario = "whale_distribution";
    confidence = computeConfidence(distConditions);
    bias = confidence >= 8 ? "STRONG_SHORT" : "SHORT";
    warnings = [
      "🔴 CRITICAL: Whales are DUMPING on retail",
      `Bybit OI -${Math.abs(y.oiChange).toFixed(2)}% while Binance +${b.oiChange.toFixed(2)}%`,
      "Smart money exiting while retail FOMO buying",
      "This is a MAJOR reversal signal - expect dump"
    ];
  }

  // SCENARIO 2: WHALE ACCUMULATION
  else if (bybitOiRising && deltas.oi < -0.5 && bybitCvdPositive) {
    const accumConditions = [bybitOiRising, bybitOiAggressive, bybitCvdPositive, deltas.oi < -1];
    scenario = "whale_accumulation";
    confidence = computeConfidence(accumConditions) + 5; // Base 5 + conditions
    confidence = Math.min(confidence, 10);
    bias = confidence >= 8 ? "STRONG_LONG" : "LONG";
    warnings = [
      "🐋 Whales are ACCUMULATING",
      `Bybit OI +${y.oiChange.toFixed(2)}% outpacing Binance`,
      "Smart money showing strong conviction",
      "Bybit COIN-M showing real demand - high confidence buy signal"
    ];
  }

  // SCENARIO 3: RETAIL FOMO RALLY
  else if (priceUp && binanceOiRising && !bybitOiRising && binanceCvdNegative && fundingHigh) {
    const fomoConditions = [priceUp, priceStrong, binanceOiRising, binanceOiAggressive, !bybitOiRising, binanceCvdNegative, fundingHigh];
    scenario = "retail_fomo_rally";
    confidence = computeConfidence(fomoConditions);
    bias = "SHORT";
    warnings = [
      "🚨 Retail FOMO rally - whales ABSENT",
      `Binance OI +${b.oiChange.toFixed(2)}% while Bybit flat`,
      "Funding high, CVD negative = weak rally",
      "Smart money not participating - expect rejection"
    ];
  }

  // SCENARIO 4: SHORT SQUEEZE SETUP
  else if (binanceOiRising && priceDown && fundingNegative && bybitOiRising && bybitCvdPositive) {
    const squeezeConditions = [binanceOiRising, priceDown, fundingNegative, bybitOiRising, bybitCvdPositive];
    scenario = "short_squeeze_setup";
    confidence = computeConfidence(squeezeConditions) + 3;
    confidence = Math.min(confidence, 10);
    bias = "LONG";
    warnings = [
      "⚡ SHORT SQUEEZE forming",
      "Binance shorts crowded with negative funding",
      "Bybit whales accumulating - preparing to squeeze",
      "Expect violent move up to liquidate retail shorts"
    ];
  }

  // SCENARIO 5: WHALE HEDGING
  else if (priceUp && bybitOiRising && y.cvd < 0 && whaleRetailRatio > 1.5) {
    const hedgeConditions = [priceUp, bybitOiRising, bybitCvdNegative, whaleRetailRatio > 2];
    scenario = "whale_hedging";
    confidence = computeConfidence(hedgeConditions) + 3;
    confidence = Math.min(confidence, 10);
    bias = "SHORT";
    warnings = [
      "🛡️ Whales HEDGING the rally",
      `Bybit OI rising ${whaleRetailRatio.toFixed(1)}x faster than Binance`,
      "Bybit CVD negative = whales selling/shorting",
      "Smart money positioning for downside"
    ];
  }

  // SCENARIO 6: SYNCHRONIZED BULLISH
  else if (priceUp && binanceOiRising && bybitOiRising && binanceCvdPositive && bybitCvdPositive && !fundingHigh) {
    const bullConditions = [priceUp, priceStrong, binanceOiRising, bybitOiRising, binanceCvdPositive, bybitCvdPositive, !fundingHigh];
    scenario = "synchronized_bullish";
    confidence = computeConfidence(bullConditions);
    bias = confidence >= 7 ? "LONG" : "WAIT";
    warnings = [
      "✅ Healthy BULLISH consensus",
      "Both retail and whales buying",
      "CVD positive on both exchanges",
      "Funding not overheated - sustainable rally"
    ];
  }

  // SCENARIO 7: SYNCHRONIZED BEARISH
  else if (priceDown && binanceCvdNegative && bybitCvdNegative && (binanceOiRising || bybitOiRising)) {
    const bearConditions = [priceDown, priceStrong, binanceCvdNegative, bybitCvdNegative, binanceOiRising || bybitOiRising];
    scenario = "synchronized_bearish";
    confidence = computeConfidence(bearConditions);
    bias = confidence >= 7 ? "SHORT" : "WAIT";
    warnings = [
      "🔻 Strong BEARISH consensus",
      "Both retail and whales selling",
      "Fresh shorts opening on both exchanges",
      "Expect continuation down"
    ];
  }

  // SCENARIO 8: BYBIT LEADING
  else if (whaleRetailRatio > 2) {
    const bybitDirection = y.oiChange > 0 ? "accumulating" : "distributing";
    scenario = "bybit_leading";
    confidence = Math.min(5 + Math.floor(whaleRetailRatio), 10);
    bias = y.oiChange > 0 ? "LONG" : "SHORT";
    warnings = [
      `📊 Bybit LEADING with ${bybitDirection}`,
      `Whale activity ${whaleRetailRatio.toFixed(1)}x stronger than retail`,
      "Smart money making directional bet",
      "Follow the whales - they usually know first"
    ];
  }

  // SCENARIO 9: BINANCE NOISE (use threshold-aware check)
  else if (binanceOiAggressive && bybitOiMove.strength === 'quiet') {
    scenario = "binance_noise";
    confidence = 6;
    bias = "WAIT";
    warnings = [
      "📢 Binance NOISE - retail overreacting",
      "Bybit whales unfazed and stable",
      "Wait for Bybit confirmation before trading",
      "Retail panic/FOMO does not equal real move"
    ];
  }

  // DEFAULT
  else {
    scenario = "unclear";
    confidence = 4;
    bias = "WAIT";
    warnings = ["Mixed signals - no clear divergence pattern"];
  }

  return {
    scenario,
    confidence,
    bias,
    // Include classified data for debugging/transparency
    classified: {
      binancePrice: binancePriceMove,
      bybitPrice: bybitPriceMove,
      binanceOi: binanceOiMove,
      bybitOi: bybitOiMove
    },
    binance: {
      character: binanceOiRising && fundingHigh ? "retail_euphoria" :
        binanceOiRising && fundingNegative ? "retail_panic_shorts" : "neutral",
      oi_change: b.oiChange,
      cvd_billions: Number((b.cvd / 1e9).toFixed(2)),
      funding: b.funding,
      leverage_score: calculateLeverageScore(b.funding, b.oiChange)
    },
    bybit: {
      character: bybitOiRising && bybitCvdPositive ? "whale_accumulation" :
        bybitOiFalling && priceUp ? "whale_distribution" : "neutral",
      oi_change: y.oiChange,
      cvd_billions: Number((y.cvd / 1e9).toFixed(2)),
      funding: y.funding,
      conviction: bybitOiAggressive ? "high" : bybitOiMove.strength === 'normal' ? "medium" : "low"
    },
    deltas: {
      oi: Number(deltas.oi.toFixed(2)),
      cvd_billions: Number(deltas.cvd.toFixed(2)),
      funding: Number(deltas.funding.toFixed(4))
    },
    whaleRetailRatio: Number(whaleRetailRatio.toFixed(2)),
    whaleRetailReliable: whaleRetailCalc.reliable,
    whaleRetailReason: whaleRetailCalc.reason,
    dominantPlayer: whaleRetailRatio > 1.5 ? "whales" : whaleRetailRatio < 0.5 ? "retail" : "balanced",
    volumeComparison: deltas.volumeComparison,
    warnings
  };
}

/**
 * Issue 3 Fix: Calculate Whale/Retail Ratio with safety thresholds
 * Prevents inflated ratios during quiet periods
 */
// Issue 3 Fix: Calculate Whale/Retail Ratio with safety thresholds
// P1: Whale/Retail Reliability by Timeframe (Percent + Notional)
function calculateWhaleRetailRatio(bybitOiChange, binanceOiChange, bybitOiUsd = 0, timeframe = '4h') {
  const bybitAbs = Math.abs(bybitOiChange);
  const binanceAbs = Math.abs(binanceOiChange);

  // Timeframe-specific thresholds
  const isScalping = ['30m', '1h'].includes(timeframe);
  const MIN_PCT = isScalping ? 0.2 : 0.5;
  const MIN_USD = isScalping ? 2_000_000 : 10_000_000; // $2M for scalping, $10M for macro

  const bybitChangeUsd = Math.abs((bybitOiChange / 100) * bybitOiUsd);

  // Checks
  if (bybitAbs < MIN_PCT) {
    return { ratio: 1, reliable: false, reason: `Bybit change ${bybitAbs.toFixed(2)}% below threshold ${MIN_PCT}%` };
  }

  if (bybitChangeUsd < MIN_USD) {
    return { ratio: 1, reliable: false, reason: `Bybit USD delta $${(bybitChangeUsd / 1000000).toFixed(1)}M below minimum $${(MIN_USD / 1000000).toFixed(0)}M` };
  }

  // If Binance is quiet but Bybit active, cap the ratio
  if (binanceAbs < MIN_PCT) {
    return {
      ratio: Math.min(bybitAbs / MIN_PCT, 5), // Cap at 5x
      reliable: true,
      reason: 'Retail quiet, whale activity detected'
    };
  }

  // Normal calculation with reasonable cap
  return {
    ratio: Math.min(bybitAbs / binanceAbs, 10), // Cap at 10x
    reliable: true,
    reason: null
  };
}

/**
 * Issue 4 Fix: Compare volume direction instead of raw subtraction
 * Binance uses USDT, Bybit uses Contracts - direct subtraction is meaningless
 */
function compareVolumeDirection(binanceVol, bybitVol) {
  const total = binanceVol + bybitVol;

  if (total === 0) {
    return {
      binancePct: 50,
      bybitPct: 50,
      dominant: 'balanced',
      description: 'No volume data'
    };
  }

  const binancePct = (binanceVol / total * 100);
  const bybitPct = (bybitVol / total * 100);

  // Determine dominant (requires 1.5x more volume)
  let dominant = 'balanced';
  if (binanceVol > bybitVol * 1.5) {
    dominant = 'retail';
  } else if (bybitVol > binanceVol * 1.5) {
    dominant = 'whale';
  }

  return {
    binancePct: Number(binancePct.toFixed(1)),
    bybitPct: Number(bybitPct.toFixed(1)),
    dominant,
    description: dominant === 'whale' ? 'Whales more active' :
      dominant === 'retail' ? 'Retail more active' : 'Balanced activity'
  };
}

function calculateLeverageScore(funding, oiChange) {
  let score = 5;
  if (funding > 0.1) score += 3;
  else if (funding > 0.05) score += 2;
  if (oiChange > 3) score += 2;
  else if (oiChange > 1.5) score += 1;
  return Math.min(10, score);
}

/**
 * =======================================================================
 * PART 2: ADVANCED TECHNICAL METRICS (ChatGPT)
 * =======================================================================
 */

function calculateTechnicalMetrics(priceHistory, oiHistory, fundingHistory) {
  if (!priceHistory || !priceHistory.length) {
    return {
      trend: null,
      momentum: null,
      volatility: null,
      technicalBias: "WAIT"
    };
  }

  const closes = priceHistory.map(c => c.close || c.price);
  const lastPrice = closes[closes.length - 1];

  // Trend Strength (using slope of EMA)
  const ema20 = TechnicalUtils.ema(closes, 20);
  const ema50 = TechnicalUtils.ema(closes, 50);
  const trendSlope = TechnicalUtils.slope(closes.slice(-20));

  let trendDirection = "sideways";
  let trendStrength = 0;

  if (trendSlope !== null) {
    const normalizedSlope = trendSlope / (lastPrice * 0.01);
    trendStrength = Math.max(-1, Math.min(1, normalizedSlope));

    if (trendStrength > 0.1) trendDirection = "up";
    else if (trendStrength < -0.1) trendDirection = "down";
  }

  // Momentum (24-period change)
  const momentum24 = closes.length >= 24
    ? TechnicalUtils.pctChange(closes[closes.length - 24], lastPrice)
    : null;

  // Realized Volatility
  let volatility = null;
  if (closes.length >= 30) {
    const returns = [];
    for (let i = 1; i < closes.length; i++) {
      const r = Math.log(closes[i] / closes[i - 1]);
      if (isFinite(r)) returns.push(r);
    }
    const std = TechnicalUtils.std(returns);
    if (std !== null) {
      volatility = std * Math.sqrt(returns.length) * 100;
    }
  }

  // Max Drawdown
  let maxDrawdown = 0;
  let peak = closes[0];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > peak) peak = closes[i];
    const dd = (closes[i] - peak) / peak;
    if (dd < maxDrawdown) maxDrawdown = dd;
  }

  // Technical Bias
  let technicalBias = "WAIT";
  if (ema20 !== null && ema50 !== null) {
    if (ema20 > ema50 && trendDirection === "up") {
      technicalBias = "LONG";
    } else if (ema20 < ema50 && trendDirection === "down") {
      technicalBias = "SHORT";
    }
  }

  return {
    trend: {
      direction: trendDirection,
      strength: Number(trendStrength.toFixed(2)),
      ema20: ema20 !== null ? Number(ema20.toFixed(2)) : null,
      ema50: ema50 !== null ? Number(ema50.toFixed(2)) : null
    },
    momentum: {
      momentum24h: momentum24 !== null ? Number(momentum24.toFixed(2)) : null
    },
    volatility: {
      realized: volatility !== null ? Number(volatility.toFixed(2)) : null,
      maxDrawdown: Number((maxDrawdown * 100).toFixed(2))
    },
    technicalBias
  };
}

/**
 * =======================================================================
 * PART 3: FUNDING & OI ADVANCED ANALYSIS (ChatGPT)
 * =======================================================================
 */

function analyzeFundingAdvanced(fundingHistory, priceHistory, currentOI = 0) {
  if (!fundingHistory || !fundingHistory.length) {
    return {
      current: null,
      zScore: null,
      trend: null,
      extremeLevel: "normal",
      painIndex: 0,
      painLevel: "low",
      painWarning: null
    };
  }

  const rates = fundingHistory.map(f => f.close || f.rate || f.funding_rate_avg_pct || 0);
  const currentRate = rates[rates.length - 1];

  // Z-Score
  const zScore = TechnicalUtils.zScore(currentRate, rates);

  // Trend
  const slope = TechnicalUtils.slope(rates);
  let trend = "flat";
  if (slope !== null) {
    if (slope > 0) trend = "increasing";
    else if (slope < 0) trend = "decreasing";
  }

  // Use Classifiers (Refactor Step 1.5)
  const classification = classifyFundingLevel(currentRate, zScore);
  const extremeLevel = classification.level;

  // Pain Index Calculation
  // ROI ($) = Rate (%) * OI ($)
  // currentRate is usually percentage (0.01 = 0.01%). So divide by 100.
  const painIndex = (Math.abs(currentRate) / 100) * currentOI;
  const painIndexMillions = painIndex / 1000000;

  const PAIN_ELEVATED = 3;  // $3M per 8hr
  const PAIN_CRITICAL = 8;  // $8M per 8hr

  let painLevel = 'low';
  if (painIndexMillions > PAIN_CRITICAL) painLevel = 'critical';
  else if (painIndexMillions > PAIN_ELEVATED) painLevel = 'elevated';

  const painWarning = painLevel !== 'low'
    ? `⚠️ Pain Index $${painIndexMillions.toFixed(1)}M/8hr - squeeze risk ${painLevel}`
    : null;

  return {
    current: Number(currentRate.toFixed(4)),
    zScore: zScore !== null ? Number(zScore.toFixed(2)) : null,
    trend,
    extremeLevel,
    fundingBias: classification.bias,
    painIndex: Number(painIndexMillions.toFixed(2)),
    painLevel,
    painWarning
  };
}

function analyzeOiAdvanced(oiHistory, priceHistory) {
  if (!oiHistory || !oiHistory.length) {
    return {
      current: null,
      change24h: null,
      trend: null,
      priceDivergence: null
    };
  }

  const oiValues = oiHistory.map(o => o.close || o.oi);
  const currentOi = oiValues[oiValues.length - 1];

  // 24-period change
  const change24h = oiValues.length >= 24
    ? TechnicalUtils.pctChange(oiValues[oiValues.length - 24], currentOi)
    : null;

  // Trend
  const oiSlope = TechnicalUtils.slope(oiValues.slice(-20));
  let trend = "flat";
  if (oiSlope !== null) {
    if (oiSlope > 0) trend = "increasing";
    else if (oiSlope < 0) trend = "decreasing";
  }

  // Price Divergence
  let priceDivergence = "aligned";
  if (priceHistory && priceHistory.length >= 20) {
    const priceCloses = priceHistory.map(p => p.close || p.price).slice(-20);
    const priceSlope = TechnicalUtils.slope(priceCloses);

    if (priceSlope !== null && oiSlope !== null) {
      if (priceSlope > 0 && oiSlope < 0) priceDivergence = "bearish_divergence";
      else if (priceSlope < 0 && oiSlope > 0) priceDivergence = "bullish_divergence";
    }
  }

  return {
    current: Number(currentOi.toFixed(2)),
    change24h: change24h !== null ? Number(change24h.toFixed(2)) : null,
    trend,
    priceDivergence
  };
}

/**
 * =======================================================================
 * PART 2.5: VOLUME PROFILE ANALYSIS (POC, VAH, VAL)
 * =======================================================================
 */

function analyzeVolumeProfile(priceHistory, bins = 50) {
  if (!priceHistory || priceHistory.length < 10) {
    return {
      poc: null,
      vah: null,
      val: null,
      profile: []
    };
  }

  // 1. Find Range
  let min = Infinity;
  let max = -Infinity;
  priceHistory.forEach(p => {
    if (p.low < min) min = p.low;
    if (p.high > max) max = p.high;
  });

  if (min === max) {
    return { poc: min, vah: min, val: min, profile: [] };
  }

  const range = max - min;
  const binSize = range / bins;

  // 2. Distribute Volume
  const profile = new Array(bins).fill(0).map((_, i) => ({
    price: min + (i * binSize) + (binSize / 2),
    volume: 0,
    index: i
  }));

  priceHistory.forEach(p => {
    // Determine which bins this candle touches
    const startBin = Math.max(0, Math.floor((p.low - min) / binSize));
    const endBin = Math.min(bins - 1, Math.floor((p.high - min) / binSize));

    // Distribute volume uniformly across touched bins
    // A better approx would be Gaussian, but uniform is standard for TPO
    const binsTouched = endBin - startBin + 1;
    const volPerBin = p.volume / binsTouched;

    for (let i = startBin; i <= endBin; i++) {
      profile[i].volume += volPerBin;
    }
  });

  // 3. Find POC (Point of Control)
  let maxVol = 0;
  let pocIndex = 0;

  profile.forEach((bin, i) => {
    if (bin.volume > maxVol) {
      maxVol = bin.volume;
      pocIndex = i;
    }
  });

  const poc = profile[pocIndex].price;

  // 4. Calculate Value Area (70% of total volume)
  const totalVolume = profile.reduce((acc, bin) => acc + bin.volume, 0);
  const targetVolume = totalVolume * 0.70;

  let currentVolume = maxVol;
  let upIndex = pocIndex;
  let downIndex = pocIndex;

  // Expand from POC outwards
  while (currentVolume < targetVolume) {
    const nextUp = upIndex < bins - 1 ? profile[upIndex + 1].volume : 0;
    const nextDown = downIndex > 0 ? profile[downIndex - 1].volume : 0;

    if (nextUp === 0 && nextDown === 0) break; // Should not happen

    if (nextUp > nextDown) {
      upIndex = Math.min(bins - 1, upIndex + 1);
      currentVolume += profile[upIndex].volume;
    } else {
      downIndex = Math.max(0, downIndex - 1);
      currentVolume += profile[downIndex].volume;
    }
  }

  const vah = profile[upIndex].price;
  const val = profile[downIndex].price;

  return {
    poc: Number(poc.toFixed(2)),
    vah: Number(vah.toFixed(2)),
    val: Number(val.toFixed(2)),
    totalVolume: Number(totalVolume.toFixed(0)),
    // Return simplified profile for plotting if needed (top 10 levels?)
    // For now, just metrics
  };
}

/**
 * =======================================================================
 * PART 2.6: STRUCTURE ANALYSIS (Swings, Support/Res)
 * =======================================================================
 */
function analyzeStructure(priceHistory) {
  if (!priceHistory || priceHistory.length < 10) {
    return { structure: 'unclear', support: null, resistance: null, swings: [] };
  }

  // Identify Swings (Fractals)
  const swings = [];
  const left = 2; // Bars to the left
  const right = 2; // Bars to the right

  for (let i = left; i < priceHistory.length - right; i++) {
    const high = priceHistory[i].high;
    const low = priceHistory[i].low;

    // Check High
    let isSwingHigh = true;
    for (let j = 1; j <= left; j++) { if (priceHistory[i - j].high >= high) isSwingHigh = false; }
    for (let j = 1; j <= right; j++) { if (priceHistory[i + j].high > high) isSwingHigh = false; }

    // Check Low
    let isSwingLow = true;
    for (let j = 1; j <= left; j++) { if (priceHistory[i - j].low <= low) isSwingLow = false; }
    for (let j = 1; j <= right; j++) { if (priceHistory[i + j].low < low) isSwingLow = false; }

    if (isSwingHigh) swings.push({ type: 'high', price: high, index: i });
    if (isSwingLow) swings.push({ type: 'low', price: low, index: i });
  }

  // Find nearest S/R
  const currentPrice = priceHistory[priceHistory.length - 1].close;

  // Resistance: Lowest swing high above current price
  const resistances = swings.filter(s => s.type === 'high' && s.price > currentPrice)
    .sort((a, b) => a.price - b.price);
  const resistance = resistances.length > 0 ? resistances[0].price : null;

  // Support: Highest swing low below current price
  const supports = swings.filter(s => s.type === 'low' && s.price < currentPrice)
    .sort((a, b) => b.price - a.price);
  const support = supports.length > 0 ? supports[0].price : null;

  // Recent Structure Break (BoS)
  // Check if we closed above the most recent swing high or below recent swing low in last 3 candles
  let bos = null;
  const recentHighs = swings.filter(s => s.type === 'high' && s.index < priceHistory.length - 1).sort((a, b) => b.index - a.index);
  const recentLows = swings.filter(s => s.type === 'low' && s.index < priceHistory.length - 1).sort((a, b) => b.index - a.index);

  if (recentHighs.length > 0 && currentPrice > recentHighs[0].price) {
    bos = "bullish_bos";
  } else if (recentLows.length > 0 && currentPrice < recentLows[0].price) {
    bos = "bearish_bos";
  }

  return {
    resistance: resistance ? Number(resistance.toFixed(2)) : null,
    support: support ? Number(support.toFixed(2)) : null,
    bos,
    lastSwingHigh: recentHighs.length ? Number(recentHighs[0].price.toFixed(2)) : null,
    lastSwingLow: recentLows.length ? Number(recentLows[0].price.toFixed(2)) : null
  };
}

/**
 * =======================================================================
 * ISSUE 1 FIX: MACRO ANCHORING
 * Prevents lower timeframes (30m, 1h) from overriding macro direction (4h, 1d)
 * =======================================================================
 */

/**
 * Get the consensus bias from macro timeframes (4h, 1d)
 * Returns null if no strong macro consensus exists
 */
function getMacroBias(tfDecisions) {
  const tf4h = tfDecisions['4h'];
  const tf1d = tfDecisions['1d'];

  if (!tf4h && !tf1d) return null;

  const bias4h = tf4h?.bias;
  const bias1d = tf1d?.bias;
  const conf4h = tf4h?.confidence || 0;
  const conf1d = tf1d?.confidence || 0;

  // Normalize bias to directional
  const dir4h = (bias4h === 'LONG' || bias4h === 'STRONG_LONG') ? 'LONG' :
    (bias4h === 'SHORT' || bias4h === 'STRONG_SHORT') ? 'SHORT' : 'WAIT';
  const dir1d = (bias1d === 'LONG' || bias1d === 'STRONG_LONG') ? 'LONG' :
    (bias1d === 'SHORT' || bias1d === 'STRONG_SHORT') ? 'SHORT' : 'WAIT';

  // RULE 1: Both macro timeframes agree with confidence ≥ 6
  if (dir4h === dir1d && dir4h !== 'WAIT' && conf4h >= 6 && conf1d >= 6) {
    return dir4h;
  }

  // RULE 2: 1d alone is very strong (≥7) - it anchors
  if (conf1d >= 7 && dir1d !== 'WAIT') {
    return dir1d;
  }

  // RULE 3: 4h alone is very strong (≥7) and 1d is neutral
  if (conf4h >= 7 && dir4h !== 'WAIT' && dir1d === 'WAIT') {
    return dir4h;
  }

  return null; // No strong macro anchor
}

/**
 * Apply Macro Anchoring to prevent noise (30m/1h) from overriding signal (4h/1d)
 */
function applyMacroAnchoring(aggregatedResult, tfDecisions) {
  const macroBias = getMacroBias(tfDecisions);
  const signalBias = aggregatedResult.bias;

  // No strong macro anchor - allow signal through
  if (!macroBias) {
    return {
      ...aggregatedResult,
      overridden: false,
      reason: null
    };
  }

  // Normalize signal bias direction
  const signalDirection = (signalBias === 'LONG' || signalBias === 'STRONG_LONG') ? 'LONG' :
    (signalBias === 'SHORT' || signalBias === 'STRONG_SHORT') ? 'SHORT' : 'WAIT';

  // If macro and signal agree, or signal is already WAIT - no override needed
  if (macroBias === signalDirection || signalDirection === 'WAIT') {
    return {
      ...aggregatedResult,
      overridden: false,
      reason: null
    };
  }

  // CONFLICT: Macro opposes signal - override to WAIT with reduced confidence
  const overrideReason = macroBias === 'SHORT' && signalDirection === 'LONG'
    ? '⚠️ MACRO ANCHORING: Long signal overridden by bearish 4h/1d macro'
    : '⚠️ MACRO ANCHORING: Short signal overridden by bullish 4h/1d macro';

  console.log(`[MACRO ANCHOR] ${overrideReason}`);

  return {
    bias: 'WAIT',
    confidence: Math.min(aggregatedResult.confidence, 4), // Cap at 4/10
    overridden: true,
    reason: overrideReason,
    originalBias: signalBias,
    originalConfidence: aggregatedResult.confidence,
    macroBias: macroBias
  };
}

/**
 * =======================================================================
 * PART 4: MARKET REGIME DETECTION (Claude)
 * =======================================================================
 */

function detectMarketRegime(binance4h, bybit4h, exchangeScenario, timeframe = '4h') {
  const priceChange = binance4h.price_change || 0;
  const oiChange = binance4h.oi_change || 0;
  const funding = binance4h.funding_rate_avg_pct || 0;
  const cvd = binance4h.cvd || 0;

  // P0 FIX: Check CVD reliability before using in regime detection
  const cvdReliable = binance4h.cvdReliableForTf !== false;
  const cvdResolution = binance4h.cvdResolution;

  // Use classifiers for timeframe-aware analysis
  const priceMove = classifyPriceMove(priceChange, timeframe);
  const oiMove = classifyOiMove(oiChange, timeframe);

  const priceUp = priceMove.direction === 'UP';
  const priceDown = priceMove.direction === 'DOWN';
  const priceFlat = priceMove.direction === 'FLAT';
  const priceStrong = priceMove.strength === 'strong';

  const oiRising = oiMove.direction === 'RISING';
  const oiFalling = oiMove.direction === 'FALLING';
  const oiFlat = oiMove.direction === 'FLAT';
  const oiAggressive = oiMove.strength === 'aggressive';

  const fundingThreshold = THRESHOLDS[timeframe]?.funding || 0.05;
  const fundingHigh = funding > fundingThreshold;
  const fundingNegative = funding < 0;

  // P0 FIX: CVD conditions are neutralized if CVD is unreliable
  // This prevents misleading regime detection based on bad CVD data
  const cvdNegative = cvdReliable && cvd < 0;
  const cvdPositive = cvdReliable && cvd > 0;

  let regime, subType, confidence, characteristics = [];

  // REGIME 1: DISTRIBUTION
  const distConditions = [
    priceFlat || priceUp,
    oiRising,
    fundingHigh,
    cvdNegative,
    exchangeScenario === "whale_distribution" || exchangeScenario === "retail_fomo_rally"
  ];
  if (exchangeScenario === "whale_distribution" ||
    (distConditions.filter(c => c).length >= 4)) {
    regime = "distribution";
    subType = "whale_exit";
    confidence = computeConfidence(distConditions);
    characteristics = [
      "Smart money distributing to retail",
      "Price stable/rising while whales exit",
      "Funding high = retail overleveraged",
      "Expect sharp reversal soon"
    ];
  }

  // REGIME 2: ACCUMULATION
  else if (exchangeScenario === "whale_accumulation" ||
    (priceFlat && oiRising && fundingNegative && cvdPositive)) {
    const accumConditions = [priceFlat, oiRising, oiAggressive, fundingNegative, cvdPositive];
    regime = "accumulation";
    subType = "whale_entry";
    confidence = computeConfidence(accumConditions) + 4;
    confidence = Math.min(confidence, 10);
    characteristics = [
      "Smart money accumulating",
      "Price stable while whales buy",
      "Funding negative = retail shorts crowded",
      "Strong setup for upside move"
    ];
  }

  // REGIME 3: LONG TRAP
  else if (priceUp && oiRising && fundingHigh && cvdNegative) {
    const trapConditions = [priceUp, priceStrong, oiRising, oiAggressive, fundingHigh, cvdNegative];
    regime = "trap";
    subType = "long_trap";
    confidence = computeConfidence(trapConditions);
    characteristics = [
      "Price pumping but CVD negative",
      "Funding extremely high = longs crowded",
      "OI rising = retail piling in at top",
      "Classic bull trap - shorts will win"
    ];
  }

  // REGIME 4: SHORT TRAP
  else if (priceDown && oiRising && fundingNegative && cvdPositive) {
    const trapConditions = [priceDown, priceStrong, oiRising, fundingNegative, cvdPositive];
    regime = "trap";
    subType = "short_trap";
    confidence = computeConfidence(trapConditions);
    characteristics = [
      "Price dumping but CVD positive",
      "Funding negative = shorts crowded",
      "Smart money buying the dip",
      "Classic bear trap - longs will win"
    ];
  }

  // REGIME 5: SHORT COVERING (handled after defaults now for correct priority)
  // REGIME 6: TRENDING BULLISH
  else if (priceUp && oiRising && !fundingHigh && cvdPositive && exchangeScenario === "synchronized_bullish") {
    const trendConditions = [priceUp, priceStrong, oiRising, !fundingHigh, cvdPositive];
    regime = "trending";
    subType = "healthy_bull";
    confidence = computeConfidence(trendConditions);
    characteristics = [
      "Price and OI rising together",
      "CVD positive = real buying",
      "Funding reasonable = sustainable",
      "Both retail and whales buying"
    ];
  }

  // REGIME 7: TRENDING BEARISH
  else if (priceDown && oiRising && cvdNegative && exchangeScenario === "synchronized_bearish") {
    const trendConditions = [priceDown, priceStrong, oiRising, cvdNegative];
    regime = "trending";
    subType = "healthy_bear";
    confidence = computeConfidence(trendConditions);
    characteristics = [
      "Price falling while OI rising",
      "CVD negative = real selling",
      "Fresh shorts opening",
      "Both retail and whales selling"
    ];
  }

  // DEFAULT
  else {
    regime = "unclear";
    subType = "mixed_signals";
    confidence = 4;
    characteristics = ["No clear regime - wait for clarity"];
  }

  // Handle Long Squeeze (High priority override)
  if (priceDown && oiFalling) {
    const squeezeConditions = [priceDown, priceStrong, oiFalling, oiAggressive];
    regime = "covering";
    subType = "long_squeeze";
    confidence = computeConfidence(squeezeConditions) + 5;
    confidence = Math.min(confidence, 10);
    characteristics = [
      "Price falling while OI falling",
      "Longs closing/liquidating - panic selling",
      "NOT new shorts - covering only",
      "Don't catch falling knife - wait for OI to stabilize"
    ];
  }

  // Handle Short Covering (High priority override)
  if (priceUp && oiFalling) {
    const coverConditions = [priceUp, priceStrong, oiFalling, oiAggressive];
    regime = "covering";
    subType = "short_squeeze";
    confidence = computeConfidence(coverConditions) + 5;
    confidence = Math.min(confidence, 10);
    characteristics = [
      "Price rising but OI falling",
      "Shorts closing = weak rally",
      "Not sustainable - no new buyers",
      "Expect fizzle at resistance"
    ];
  }

  // Handle Range/Chop (Lowest priority - final check)
  if (priceFlat && oiFlat) {
    regime = "range";
    subType = "chop";
    confidence = 3;
    characteristics = [
      "Price flat, OI flat - no directional conviction",
      "No edge in this environment",
      "Wait for breakout or regime change"
    ];
  }

  return {
    regime,
    subType,
    confidence,
    characteristics,
    // Include classified data for transparency
    classified: {
      price: priceMove,
      oi: oiMove
    }
  };
}

/**
 * =======================================================================
 * PART 4.5: DERIVED STANCE & RISK (New)
 * =======================================================================
 */

function deriveTradeStance(bias, regime, confidence) {
  // Rule 1: Low confidence = avoid
  if (confidence < 5) {
    return "AVOID_TRADING";
  }

  // Rule 2: Dangerous regimes = avoid (even with bias)
  if (regime.regime === "range" || regime.subType === "chop") {
    return "AVOID_TRADING";
  }

  // Rule 3: Traps and covering = avoid (don't chase)
  if (regime.regime === "trap" || regime.regime === "covering") {
    return "AVOID_TRADING";
  }

  // Rule 4: Clear bias with good regime = trade
  if (bias === "LONG") return "LOOK_FOR_LONGS";
  if (bias === "SHORT") return "LOOK_FOR_SHORTS";

  return "AVOID_TRADING";
}

function deriveRiskMode(regime, confidence, exchangeAlignment) {
  // Defensive conditions
  if (regime.regime === "trap") return "DEFENSIVE";
  if (regime.regime === "covering") return "DEFENSIVE";
  if (confidence < 6) return "DEFENSIVE";

  // Aggressive conditions (all must be true)
  if (confidence >= 8 &&
    exchangeAlignment === "synchronized" &&
    (regime.subType === "healthy_bull" || regime.subType === "healthy_bear")) {
    return "AGGRESSIVE";
  }

  return "NORMAL";
}

/**
 * =======================================================================
 * PART 5: WEIGHTED DECISION ENGINE (Claude)
 * =======================================================================
 */

function calculateWeightedDecision(
  binanceData,
  bybitData,
  exchangeAnalysis,
  regimeAnalysis,
  technicalMetrics,
  fundingAdvanced,
  volumeProfile,
  structure,
  options = { timeframe: '4h', cvdResolution: '4h' }
) {
  const signals = [];

  // Signal 1: Exchange Divergence (35% weight)
  signals.push({
    name: "exchange_divergence",
    signal: exchangeAnalysis.bias,
    confidence: exchangeAnalysis.confidence, // 0-10
    weight: 0.35,
    reasoning: exchangeAnalysis.warnings[0]
  });

  // Signal 2: Market Regime (20% weight)
  const regimeBias =
    regimeAnalysis.regime === "distribution" || regimeAnalysis.subType === "long_trap" ? "SHORT" :
      regimeAnalysis.regime === "accumulation" || regimeAnalysis.subType === "short_trap" ? "LONG" :
        regimeAnalysis.subType === "healthy_bull" ? "LONG" :
          regimeAnalysis.subType === "healthy_bear" ? "SHORT" : "WAIT";

  signals.push({
    name: "market_regime",
    signal: regimeBias,
    confidence: regimeAnalysis.confidence,
    weight: 0.20,
    reasoning: regimeAnalysis.characteristics[0]
  });

  // Signal 3: Structure Analysis (15% weight)
  let structureBias = "WAIT";
  let structureConf = 5;
  let structureReason = "Structure is neutral";

  if (structure) {
    if (structure.bos === "bullish_bos") {
      structureBias = "LONG";
      structureConf = 9;
      structureReason = "Bullish Break of Structure (BoS)";
    } else if (structure.bos === "bearish_bos") {
      structureBias = "SHORT";
      structureConf = 9;
      structureReason = "Bearish Break of Structure (BoS)";
    } else if (binanceData.price && structure.support && binanceData.price <= structure.support * 1.01) {
      structureBias = "LONG";
      structureConf = 7;
      structureReason = "Price at Support Level";
    } else if (binanceData.price && structure.resistance && binanceData.price >= structure.resistance * 0.99) {
      structureBias = "SHORT";
      structureConf = 7;
      structureReason = "Price at Resistance Level";
    }
  }

  signals.push({
    name: "structure",
    signal: structureBias,
    confidence: structureConf,
    weight: 0.15,
    reasoning: structureReason
  });

  // Signal 4: Volume Profile (10% weight)
  let vpBias = "WAIT";
  let vpConf = 5;
  let vpReason = "Inside value area";

  if (volumeProfile && volumeProfile.val && volumeProfile.vah) {
    const price = binanceData.price;
    if (price < volumeProfile.val) {
      vpBias = "LONG";
      vpConf = 7;
      vpReason = "Price below Value Area (Oversold)";
    } else if (price > volumeProfile.vah) {
      vpBias = "SHORT";
      vpConf = 7;
      vpReason = "Price above Value Area (Overbought)";
    } else if (Math.abs(price - volumeProfile.poc) / price < 0.005) {
      vpReason = "Price at Point of Control (Fair Value)";
    }
  }

  signals.push({
    name: "volume_profile",
    signal: vpBias,
    confidence: vpConf,
    weight: 0.10,
    reasoning: vpReason
  });

  // Signal 5: Technical Analysis (10% weight)
  const techBias = technicalMetrics.technicalBias || "WAIT";
  const techStrength = technicalMetrics.trend?.strength || 0;
  const techDirection = technicalMetrics.trend?.direction || "unknown";

  signals.push({
    name: "technical",
    signal: techBias,
    confidence: Math.abs(techStrength) * 10,
    weight: 0.10,
    reasoning: techDirection !== "unknown"
      ? `Trend ${techDirection} with strength ${techStrength}`
      : "No technical data available"
  });

  // Signal 6: Funding (5% weight)
  const fundingExtreme = fundingAdvanced?.extremeLevel || "normal";
  const fundingBias = fundingAdvanced?.fundingBias || "WAIT";
  const fundingZ = fundingAdvanced?.zScore || 0;

  signals.push({
    name: "funding",
    signal: fundingBias,
    confidence: Math.abs(fundingZ) * 2, // Approx confidence from Z
    weight: 0.05,
    reasoning: `Funding ${fundingExtreme} (Pain: $${fundingAdvanced?.painIndex || 0}M)`
  });

  // Signal 7: CVD (5% weight) - P0 FIX: Enhanced CVD Gating
  const cvd = binanceData.cvd || 0;
  const cvdNormalized = binanceData.cvdNormalized || 0;
  const cvdReliable = binanceData.cvdReliableForTf !== false; // Default to true for backward compat
  const cvdResolution = binanceData.cvdResolution;  // Actual API interval (m30, h1, h4, h24)
  const cvdRequestedTf = binanceData.cvdRequestedTimeframe || options.timeframe;  // Requested TF
  const cvdDataReason = binanceData.cvdReason;
  const priceChange = binanceData.price_change || 0;

  // CVD Resolution Logic - now uses actual metadata from data service
  let cvdWeight = 0.05;
  let cvdReason = `CVD ${cvd > 0 ? 'positive' : 'negative'} (${cvdNormalized > 0 ? '+' : ''}${(cvdNormalized * 100).toFixed(1)}% normalized) [${cvdResolution || 'unknown'}]`;
  let cvdBias =
    priceChange > 0 && cvd < 0 ? "SHORT" :
      priceChange < 0 && cvd > 0 ? "LONG" :
        priceChange > 0 && cvd > 0 ? "LONG" :
          priceChange < 0 && cvd < 0 ? "SHORT" : "WAIT";

  // P0 FIX: CVD reliability gating based on actual data quality
  let cvdWarning = null;

  // Gate 1: Resolution mismatch (legacy case - 24h data on scalping TF)
  if (['30m', '1h'].includes(options.timeframe) && cvdResolution === 'h24') {
    cvdWeight = 0;
    cvdReason = "CVD excluded: 24h aggregate data used for scalping timeframe";
    cvdBias = "WAIT";
    cvdWarning = "CVD excluded: resolution mismatch (h24 data on scalping TF)";
  }
  // Gate 2: Data reliability check from calculateCVDPerTimeframe
  else if (!cvdReliable) {
    cvdWeight = 0;
    cvdReason = `CVD excluded: ${cvdDataReason || 'insufficient data quality'}`;
    cvdBias = "WAIT";
    cvdWarning = `CVD excluded: ${cvdDataReason || 'data quality issue'}`;
  }
  // Gate 3: Requested timeframe sanity check - verify we got data for the TF we asked for
  else if (cvdRequestedTf !== options.timeframe) {
    cvdWeight = 0;
    cvdReason = `CVD excluded: requested ${cvdRequestedTf} but analyzing ${options.timeframe}`;
    cvdBias = "WAIT";
    cvdWarning = `CVD excluded: timeframe mismatch (${cvdRequestedTf} vs ${options.timeframe})`;
  }

  signals.push({
    name: "cvd",
    signal: cvdBias,
    confidence: cvdReliable ? 6 : 0,
    weight: cvdWeight,
    reasoning: cvdReason,
    // P0 FIX: Include CVD metadata in signal for transparency
    metadata: {
      cvdResolution,
      cvdNormalized,
      // Split reliability flags
      cvdDataComplete: binanceData.cvdDataComplete,
      cvdMarketImpactReliable: binanceData.cvdMarketImpactReliable,
      cvdReliable,  // Combined flag (both must be true)
      cvdWindowCandles: binanceData.cvdWindowCandles,
      cvdActualCandles: binanceData.cvdActualCandles,
      cvdAvgVolumePerCandle: binanceData.cvdAvgVolumePerCandle,
      cvdWarning
    }
  });

  // P0-1: Confidence Scale Contract (0-10)
  let longScore = 0, shortScore = 0, waitScore = 0;
  let totalActiveWeight = 0;

  signals.forEach(s => {
    // Dynamically sum active weights (in case CVD is 0)
    totalActiveWeight += s.weight;

    // sideScore = Σ(confidence * weight)
    const contribution = s.confidence * s.weight;

    if (s.signal === "LONG" || s.signal === "STRONG_LONG") {
      longScore += contribution;
    } else if (s.signal === "SHORT" || s.signal === "STRONG_SHORT") {
      shortScore += contribution;
    } else {
      waitScore += contribution;
    }
  });

  // Normalize scores to 0-10 scale based on active weight
  if (totalActiveWeight > 0) {
    longScore = (longScore / totalActiveWeight); // Scale 0-10
    shortScore = (shortScore / totalActiveWeight);
    waitScore = (waitScore / totalActiveWeight);
  }

  // P1: Dual Confidence Output
  const directionConfidence = Math.max(longScore, shortScore);
  const minSide = Math.min(longScore, shortScore);
  const maxSide = Math.max(longScore, shortScore);

  // conflictBonus = clamp( min/max * 3, 0..3)
  const conflictBonus = maxSide > 0.1 ? Math.min((minSide / maxSide) * 3, 3) : 0;

  // noTradeConfidence (0–10)
  const noTradeConfidence = Math.max(0, Math.min(10, 10 - directionConfidence + conflictBonus));

  // Bias Decision
  let finalBias, finalConfidence;

  // Logic: Clear Winner vs Noise
  // If Long dominates Short AND Long dominates Wait (convincingly)
  if (longScore > shortScore * 1.3 && longScore > waitScore * 0.8) {
    finalBias = "LONG";
    finalConfidence = directionConfidence;
  } else if (shortScore > longScore * 1.3 && shortScore > waitScore * 0.8) {
    finalBias = "SHORT";
    finalConfidence = directionConfidence;
  } else {
    finalBias = "WAIT";
    finalConfidence = noTradeConfidence;
  }

  // P0 FIX: Collect warnings from signals
  const warnings = [];
  signals.forEach(s => {
    if (s.metadata?.cvdWarning) {
      warnings.push(s.metadata.cvdWarning);
    }
  });

  return {
    bias: finalBias,
    confidence: Number(finalConfidence.toFixed(1)),
    // P0 FIX: Clarify what confidence represents and include both values at top-level
    confidenceType: finalBias === 'WAIT' ? 'noTradeConfidence' : 'directionConfidence',
    directionConfidence: Number(directionConfidence.toFixed(1)),  // NEW: Top-level for consistency
    noTradeConfidence: Number(noTradeConfidence.toFixed(1)),      // NEW: Top-level for consistency
    scores: {
      long: Number(longScore.toFixed(1)),
      short: Number(shortScore.toFixed(1)),
      wait: Number(waitScore.toFixed(1))
    },
    signals,
    // P0 FIX: Warnings array for CVD and other signal issues
    warnings,
    // P1 Metrics (kept for backward compatibility)
    metrics: {
      directionConfidence: Number(directionConfidence.toFixed(1)),
      noTradeConfidence: Number(noTradeConfidence.toFixed(1)),
      conflictBonus: Number(conflictBonus.toFixed(1))
    },
    // Metrics from previous
    painIndex: fundingAdvanced?.painIndex || 0,
    painLevel: fundingAdvanced?.painLevel || "low",
    painWarning: fundingAdvanced?.painWarning,
    reasoning: signals
      .filter(s => s.weight > 0 && s.confidence >= 5) // weighted > 0
      .sort((a, b) => b.weight - a.weight)
      .map(s => s.reasoning)
  };
}


/**
 * =======================================================================
 * PART 5.5: TIMEFRAME BUCKETS (MACRO / MICRO / SCALPING)
 * =======================================================================
 */

/**
 * Derive trade stance for a bucket based on bias and confidence
 * D) P0 FIX: Now uses 0-10 confidence scale (threshold 6.0 = 60% threshold)
 */
function deriveTradeStanceFromBucket(bias, confidence) {
  // D) Threshold is now 6.0 on 0-10 scale (equivalent to old 60 on 0-100)
  if (confidence >= 6.0) {
    if (bias === 'BEARISH') return 'LOOK_FOR_SHORTS';
    if (bias === 'BULLISH') return 'LOOK_FOR_LONGS';
  }
  return 'AVOID_TRADING';
}

/**
 * Generate narrative summary and bullets for a bucket
 */
function generateBucketNarrative(bucketName, tfData, bias, confidence) {
  const summaries = {
    macro: {
      BULLISH: 'Uptrend intact. Higher highs and higher lows structure maintained.',
      BEARISH: 'Downtrend intact. Lower highs and lower lows structure.',
      NEUTRAL: 'Macro structure unclear. Waiting for directional break.'
    },
    micro: {
      BULLISH: 'Strong momentum on swing timeframes. Buyers in control.',
      BEARISH: 'Weak bounces rejected. Sellers controlling swing timeframe.',
      NEUTRAL: 'Consolidating within range. Mixed signals from exchanges.'
    },
    scalping: {
      BULLISH: 'Intraday momentum bullish. Short-term longs favorable.',
      BEARISH: 'Intraday momentum bearish. Short-term shorts favorable.',
      NEUTRAL: 'Chop zone. No clear intraday edge.'
    }
  };

  const summary = summaries[bucketName]?.[bias] || 'Analysis in progress.';

  // Generate bullets based on available data
  const bullets = [];

  tfData.forEach(tf => {
    if (!tf) return;

    const exchange = tf.exchangeDivergence;
    const regime = tf.marketRegime;
    const decision = tf.finalDecision;

    // OI observations
    if (exchange?.bybit?.oi_change !== undefined) {
      const oiChange = exchange.bybit.oi_change;
      if (Math.abs(oiChange) > 1) {
        if (oiChange > 0 && bias === 'BEARISH') {
          bullets.push('OI rising into decline - new shorts entering');
        } else if (oiChange > 0 && bias === 'BULLISH') {
          bullets.push('OI rising with price - trend confirmation');
        } else if (oiChange < 0) {
          bullets.push('OI declining - position unwinding');
        }
      }
    }

    // CVD observations
    if (exchange?.bybit?.cvd_billions !== undefined) {
      const cvd = exchange.bybit.cvd_billions;
      if (cvd < -0.5) {
        bullets.push('CVD negative - selling pressure');
      } else if (cvd > 0.5) {
        bullets.push('CVD positive - buying pressure');
      }
    }

    // Funding observations
    if (tf.fundingAdvanced?.zScore !== undefined) {
      const fundingZ = tf.fundingAdvanced.zScore;
      if (fundingZ > 1.5) {
        bullets.push('Funding elevated - crowded longs');
      } else if (fundingZ < -1.5) {
        bullets.push('Funding negative - crowded shorts');
      } else if (Math.abs(fundingZ) < 0.5) {
        bullets.push('Funding neutral - balanced positioning');
      }
    }

    // Regime observations
    if (regime?.regime) {
      if (regime.regime === 'trending') {
        bullets.push('Trending regime - follow the move');
      } else if (regime.regime === 'ranging') {
        bullets.push('Ranging regime - fade extremes');
      } else if (regime.regime === 'volatile') {
        bullets.push('High volatility - reduce size');
      }
    }
  });

  // Dedupe and limit bullets
  const uniqueBullets = [...new Set(bullets)].slice(0, 3);

  // Add default bullets if none generated
  if (uniqueBullets.length === 0) {
    if (bias === 'BULLISH') {
      uniqueBullets.push('Price structure favoring longs');
      uniqueBullets.push('Momentum aligned with buyers');
    } else if (bias === 'BEARISH') {
      uniqueBullets.push('Price structure favoring shorts');
      uniqueBullets.push('Momentum aligned with sellers');
    } else {
      uniqueBullets.push('Mixed signals across exchanges');
      uniqueBullets.push('Wait for clear directional break');
    }
  }

  return { summary, bullets: uniqueBullets };
}

/**
 * Generate timeframe buckets: MACRO, MICRO, SCALPING
 */
function generateTimeframeBuckets(tfMetrics) {
  const bucketConfig = {
    macro: { timeframes: ['1d', '4h'], name: 'MACRO' },
    micro: { timeframes: ['4h', '1h'], name: 'MICRO' },
    scalping: { timeframes: ['1h', '30m'], name: 'SCALPING' }
  };

  const buckets = {};

  for (const [bucketKey, config] of Object.entries(bucketConfig)) {
    const tfData = config.timeframes
      .map(tf => tfMetrics[tf])
      .filter(Boolean);

    if (tfData.length === 0) {
      // Default bucket when no data
      buckets[bucketKey] = {
        bias: 'NEUTRAL',
        tradeStance: 'AVOID_TRADING',
        confidence: 0,
        status: 'neutral',
        summary: 'Insufficient data for analysis.',
        bullets: ['Waiting for data...'],
        timeframes: config.timeframes
      };
      continue;
    }

    // Aggregate scores from constituent timeframes
    let totalLong = 0, totalShort = 0, totalWait = 0, count = 0;

    tfData.forEach(tf => {
      if (tf.finalDecision?.scores) {
        totalLong += tf.finalDecision.scores.long || 0;
        totalShort += tf.finalDecision.scores.short || 0;
        totalWait += tf.finalDecision.scores.wait || 0;
        count++;
      }
    });

    const avgLong = count > 0 ? totalLong / count : 0;
    const avgShort = count > 0 ? totalShort / count : 0;
    const avgWait = count > 0 ? totalWait / count : 0;

    // Determine bucket bias
    let bias = 'NEUTRAL';
    let confidence = 0;

    const total = avgLong + avgShort + avgWait;
    if (total > 0) {
      const maxScore = Math.max(avgLong, avgShort, avgWait);

      if (maxScore === avgLong && avgLong > avgShort * 1.2) {
        bias = 'BULLISH';
      } else if (maxScore === avgShort && avgShort > avgLong * 1.2) {
        bias = 'BEARISH';
      } else {
        bias = 'NEUTRAL';
      }
    }

    // D) P0 FIX: Confidence is now on 0-10 scale (no more *10 multiplier)
    // This matches the per-timeframe finalDecision confidence scale
    let totalConf = 0;
    tfData.forEach(tf => {
      totalConf += tf.finalDecision?.confidence || 0;
    });
    const avgConf = count > 0 ? totalConf / count : 0;
    confidence = Number(avgConf.toFixed(1));  // Keep on 0-10 scale

    // Clamp confidence to 0-10 (not 0-100 anymore)
    confidence = Math.max(0, Math.min(10, confidence));

    // Derive trade stance
    const tradeStance = deriveTradeStanceFromBucket(bias, confidence);

    // Generate narrative
    const { summary, bullets } = generateBucketNarrative(bucketKey, tfData, bias, confidence);

    buckets[bucketKey] = {
      bias,
      tradeStance,
      confidence,
      // D) P0 FIX: Clarify confidence meaning and scale
      confidenceScale: '0-10',  // Explicit scale indicator
      confidenceType: bias === 'NEUTRAL' ? 'noTradeConfidence' : 'directionConfidence',
      status: bias.toLowerCase(),
      summary,
      bullets,
      timeframes: config.timeframes
    };
  }

  return buckets;
}

/**
 * =======================================================================
 * PART 6: MAIN CALCULATOR
 * =======================================================================
 */

function calculateMarketMetrics(marketData, historicalData = {}) {
  // 1. Parsing Input
  let snapshot, historyMap;

  if (marketData.snapshot && marketData.history) {
    // New format: history is a map keyed by timeframe
    snapshot = marketData.snapshot;
    historyMap = marketData.history;
  } else if (marketData.Binance || marketData.Bybit) {
    // Old format - direct snapshot, history in second arg
    snapshot = marketData;
    // Assume historicalData is for 4h or default
    historyMap = { "4h": historicalData };
  } else {
    throw new Error("Invalid marketData format");
  }

  const timeframes = ['30m', '1h', '4h', '1d'];
  const weights = { '30m': 0.25, '1h': 0.25, '4h': 0.30, '1d': 0.20 };

  const tfMetrics = {};
  const tfDecisions = {};

  // 2. Loop Timeframes and Calculate Logic Layer 2 (Single TF)
  for (const tf of timeframes) {
    const binanceData = snapshot.Binance?.[tf];
    const bybitData = snapshot.Bybit?.[tf];

    // Skip if missing critical data
    if (!binanceData || !binanceData.price) continue;

    const tfHistory = historyMap[tf] || {};
    const priceHistory = tfHistory.priceHistory || [];
    const oiHistory = tfHistory.oiHistory || [];
    const fundingHistory = tfHistory.fundingHistory || [];

    // 2.1 Exchange Divergence
    const exchangeAnalysis = analyzeExchangeDivergence(binanceData, bybitData, tf);

    // 2.2 Technical Metrics
    const technicalMetrics = calculateTechnicalMetrics(priceHistory, oiHistory, fundingHistory);

    // 2.3 Advanced Funding
    const fundingAdvanced = analyzeFundingAdvanced(fundingHistory, priceHistory, binanceData.oi);

    // 2.4 OI Advanced
    const oiAdvanced = analyzeOiAdvanced(oiHistory, priceHistory);

    // 2.5 Volume Profile
    const volumeProfile = analyzeVolumeProfile(priceHistory);

    // 2.6 Structure
    const structure = analyzeStructure(priceHistory);

    // 2.7 Regime
    const regimeAnalysis = detectMarketRegime(binanceData, bybitData, exchangeAnalysis.scenario, tf);

    // 2.8 Weighted Decision
    const decision = calculateWeightedDecision(
      binanceData,
      bybitData,
      exchangeAnalysis,
      regimeAnalysis,
      technicalMetrics,
      fundingAdvanced,
      volumeProfile,
      structure,
      { timeframe: tf, cvdResolution: tf } // Assume resolution matches TF for now
    );

    tfMetrics[tf] = {
      exchangeDivergence: exchangeAnalysis,
      marketRegime: regimeAnalysis,
      technical: technicalMetrics,
      fundingAdvanced,
      oiAdvanced,
      volumeProfile,
      structure,
      finalDecision: decision
    };
    tfDecisions[tf] = decision;
  }

  // 3. Aggregate Decisions (Layer 3)
  let aggLong = 0, aggShort = 0, aggWait = 0;
  let totalWeight = 0;

  for (const tf of timeframes) {
    if (tfDecisions[tf]) {
      const w = weights[tf];
      aggLong += tfDecisions[tf].scores.long * w;
      aggShort += tfDecisions[tf].scores.short * w;
      aggWait += tfDecisions[tf].scores.wait * w;
      totalWeight += w;
    }
  }

  // Normalize scores
  if (totalWeight > 0) {
    aggLong = Number((aggLong / totalWeight).toFixed(1));
    aggShort = Number((aggShort / totalWeight).toFixed(1));
    aggWait = Number((aggWait / totalWeight).toFixed(1));
  }

  // Determine Final Bias
  const maxScore = Math.max(aggLong, aggShort, aggWait);
  let finalBias, finalConfidence;

  // 1.2x buffer for bias confirmation vs opposite
  if (maxScore === aggLong && aggLong > aggShort * 1.2) {
    finalBias = "LONG";
    finalConfidence = maxScore; // Already 0-10
  } else if (maxScore === aggShort && aggShort > aggLong * 1.2) {
    finalBias = "SHORT";
    finalConfidence = maxScore;
  } else {
    finalBias = "WAIT";
    finalConfidence = maxScore;
  }

  // Cap at 10 just in case
  finalConfidence = Math.min(finalConfidence, 10);
  finalConfidence = Number(finalConfidence.toFixed(1));

  // =========================================================================
  // ISSUE 1 FIX: MACRO ANCHORING
  // Prevent lower timeframes (30m, 1h) from overriding macro direction (4h, 1d)
  // =========================================================================
  const macroAnchorResult = applyMacroAnchoring(
    { bias: finalBias, confidence: finalConfidence },
    tfDecisions
  );

  // Apply macro override if triggered
  finalBias = macroAnchorResult.bias;
  finalConfidence = macroAnchorResult.confidence;
  const macroOverrideReason = macroAnchorResult.reason;
  const wasMacroOverridden = macroAnchorResult.overridden;

  // 4. Derive Higher Level State (Layer 4)
  // Use 4h as Primary Regime source (Macro view) - Fallback to 1h if 4h missing
  const primaryMetrics = tfMetrics['4h'] || tfMetrics['1h'] || tfMetrics['30m'];
  const primaryRegimeAnalysis = primaryMetrics?.marketRegime || { regime: 'unclear', subType: 'mixed_signals' };

  const primaryRegime = primaryRegimeAnalysis.regime;
  let tradeStance = deriveTradeStance(finalBias, primaryRegimeAnalysis, finalConfidence);

  // Calculate exchange alignment from 4h
  const exchangeAlignmentVal = primaryMetrics?.exchangeDivergence?.bias;
  const exchangeAlignment = (exchangeAlignmentVal === 'STRONG_LONG' || exchangeAlignmentVal === 'LONG' ||
    exchangeAlignmentVal === 'STRONG_SHORT' || exchangeAlignmentVal === 'SHORT')
    ? 'synchronized' : 'mixed';

  const riskMode = deriveRiskMode(primaryRegimeAnalysis, finalConfidence, exchangeAlignment);

  // Add macro override warning to reasoning if triggered
  let finalReasoning = primaryMetrics?.finalDecision?.reasoning || [];
  if (wasMacroOverridden && macroOverrideReason) {
    finalReasoning = [macroOverrideReason, ...finalReasoning];
  }

  // =========================================================================
  // TIMEFRAME BUCKETS (MACRO / MICRO / SCALPING)
  // =========================================================================

  const timeframeBuckets = generateTimeframeBuckets(tfMetrics);

  // Apply Macro Hierarchy - MACRO anchors the final decision
  let macroAnchored = false;
  let hierarchyWarning = null;

  const macroBucket = timeframeBuckets.macro;
  const scalpingBucket = timeframeBuckets.scalping;

  if (macroBucket.confidence >= 60 && macroBucket.bias !== 'NEUTRAL') {
    const lowerTfOpposing =
      (macroBucket.bias === 'BEARISH' && scalpingBucket.bias === 'BULLISH') ||
      (macroBucket.bias === 'BULLISH' && scalpingBucket.bias === 'BEARISH');

    if (!lowerTfOpposing) {
      // MACRO anchors the decision
      finalBias = macroBucket.bias === 'BEARISH' ? 'SHORT' : 'LONG';
      tradeStance = macroBucket.tradeStance;
      macroAnchored = true;

      if (scalpingBucket.bias === 'NEUTRAL') {
        hierarchyWarning = 'Lower TF consolidating - wait for setup';
      }
    } else {
      hierarchyWarning = 'Lower TF opposing macro trend - reduced conviction';
    }
  }

  // Construct Final Output
  // Preserve top-level 4h metrics for backward compatibility, but update Final Decision
  return {
    timestamp: Date.now(),
    timeframe: "4h", // Keeping this as "main" timeframe identifier for now

    // Top-Level Metrics (Prefer 4h)
    exchangeDivergence: primaryMetrics?.exchangeDivergence,
    marketRegime: primaryMetrics?.marketRegime,

    // Updated Final Decision with Aggregated Logic
    finalDecision: {
      bias: finalBias,
      confidence: finalConfidence,
      scores: {
        long: aggLong,
        short: aggShort,
        wait: aggWait
      },
      signals: primaryMetrics?.finalDecision?.signals || [], // Show signals from Primary TF
      reasoning: finalReasoning,
      macroOverride: wasMacroOverridden ? {
        triggered: true,
        reason: macroOverrideReason
      } : null,

      // NEW FIELDS
      tradeStance,
      primaryRegime,
      riskMode,

      // MACRO HIERARCHY FIELDS
      macroAnchored,
      warning: hierarchyWarning
    },

    // Technicals (Prefer 4h)
    technical: primaryMetrics?.technical,
    fundingAdvanced: primaryMetrics?.fundingAdvanced,
    oiAdvanced: primaryMetrics?.oiAdvanced,
    volumeProfile: primaryMetrics?.volumeProfile,
    structure: primaryMetrics?.structure,

    // Timeframe Deep Dive (New)
    timeframes: tfMetrics,

    // TIMEFRAME BUCKETS (MACRO / MICRO / SCALPING)
    timeframeBuckets,

    // Raw Data
    raw: {
      binance: snapshot.Binance,
      bybit: snapshot.Bybit
    }
  };
}

// =======================================================================
// EXPORTS
// =======================================================================

module.exports = {
  calculateMarketMetrics,
  analyzeExchangeDivergence,
  detectMarketRegime,
  calculateWeightedDecision,
  calculateTechnicalMetrics,
  analyzeFundingAdvanced,
  analyzeOiAdvanced,
  analyzeVolumeProfile,
  analyzeStructure,
  deriveTradeStance,
  deriveRiskMode,
  TechnicalUtils,
  // New Issue Fixes
  applyMacroAnchoring,
  getMacroBias,
  calculateWhaleRetailRatio,
  compareVolumeDirection,
  // Timeframe Buckets
  generateTimeframeBuckets,
  deriveTradeStanceFromBucket
};
