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

function analyzeExchangeDivergence(binance4h, bybit4h) {
  const b = {
    price: binance4h.price || 0,
    priceChange: binance4h.price_change || 0,
    oi: binance4h.oi || 0,
    oiChange: binance4h.oi_change || 0,
    cvd: binance4h.cvd || 0,
    funding: binance4h.funding_rate_avg_pct || 0,
    volume: binance4h.volume || 0
  };
  
  const y = {
    price: bybit4h.price || 0,
    priceChange: bybit4h.price_change || 0,
    oi: bybit4h.oi || 0,
    oiChange: bybit4h.oi_change || 0,
    cvd: bybit4h.cvd || 0,
    funding: bybit4h.funding_rate_avg_pct || 0,
    volume: bybit4h.volume || 0
  };
  
  const deltas = {
    oi: b.oiChange - y.oiChange,
    cvd: (b.cvd - y.cvd) / 1e9,
    funding: b.funding - y.funding,
    volume: b.volume - y.volume
  };
  
  const priceUp = b.priceChange > 0.5;
  const priceDown = b.priceChange < -0.5;
  const binanceOiRising = b.oiChange > 0.5;
  const bybitOiRising = y.oiChange > 0.5;
  const binanceOiFalling = b.oiChange < -0.5;
  const bybitOiFalling = y.oiChange < -0.5;
  const binanceCvdNegative = b.cvd < 0;
  const bybitCvdPositive = y.cvd > 0;
  const fundingHigh = b.funding > 0.05;
  const fundingNegative = b.funding < 0;
  
  const whaleRetailRatio = Math.abs(y.oiChange) / (Math.abs(b.oiChange) || 0.01);
  
  let scenario, confidence, bias, warnings = [];
  
  // SCENARIO 1: WHALE DISTRIBUTION
  if (priceUp && bybitOiFalling && binanceOiRising && binanceCvdNegative) {
    scenario = "whale_distribution";
    confidence = 10;
    bias = "STRONG_SHORT";
    warnings = [
      "🔴 CRITICAL: Whales are DUMPING on retail",
      `Bybit OI -${Math.abs(y.oiChange).toFixed(2)}% while Binance +${b.oiChange.toFixed(2)}%`,
      "Smart money exiting while retail FOMO buying",
      "This is a MAJOR reversal signal - expect dump"
    ];
  }
  
  // SCENARIO 2: WHALE ACCUMULATION
  else if (bybitOiRising && deltas.oi < -0.5 && bybitCvdPositive) {
    scenario = "whale_accumulation";
    confidence = 9;
    bias = "STRONG_LONG";
    warnings = [
      "🐋 Whales are ACCUMULATING",
      `Bybit OI +${y.oiChange.toFixed(2)}% outpacing Binance`,
      "Smart money showing strong conviction",
      "Bybit COIN-M showing real demand - high confidence buy signal"
    ];
  }
  
  // SCENARIO 3: RETAIL FOMO RALLY
  else if (priceUp && binanceOiRising && !bybitOiRising && binanceCvdNegative && fundingHigh) {
    scenario = "retail_fomo_rally";
    confidence = 9;
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
    scenario = "short_squeeze_setup";
    confidence = 8;
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
    scenario = "whale_hedging";
    confidence = 7;
    bias = "SHORT";
    warnings = [
      "🛡️ Whales HEDGING the rally",
      `Bybit OI rising ${whaleRetailRatio.toFixed(1)}x faster than Binance`,
      "Bybit CVD negative = whales selling/shorting",
      "Smart money positioning for downside"
    ];
  }
  
  // SCENARIO 6: SYNCHRONIZED BULLISH
  else if (priceUp && binanceOiRising && bybitOiRising && b.cvd > 0 && y.cvd > 0 && !fundingHigh) {
    scenario = "synchronized_bullish";
    confidence = 8;
    bias = "LONG";
    warnings = [
      "✅ Healthy BULLISH consensus",
      "Both retail and whales buying",
      "CVD positive on both exchanges",
      "Funding not overheated - sustainable rally"
    ];
  }
  
  // SCENARIO 7: SYNCHRONIZED BEARISH
  else if (priceDown && b.cvd < 0 && y.cvd < 0 && (binanceOiRising || bybitOiRising)) {
    scenario = "synchronized_bearish";
    confidence = 8;
    bias = "SHORT";
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
    confidence = 7;
    bias = y.oiChange > 0 ? "LONG" : "SHORT";
    warnings = [
      `📊 Bybit LEADING with ${bybitDirection}`,
      `Whale activity ${whaleRetailRatio.toFixed(1)}x stronger than retail`,
      "Smart money making directional bet",
      "Follow the whales - they usually know first"
    ];
  }
  
  // SCENARIO 9: BINANCE NOISE
  else if (Math.abs(b.oiChange) > 2 && Math.abs(y.oiChange) < 0.5) {
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
      conviction: Math.abs(y.oiChange) > 1 ? "high" : Math.abs(y.oiChange) > 0.5 ? "medium" : "low"
    },
    deltas: {
      oi: Number(deltas.oi.toFixed(2)),
      cvd_billions: Number(deltas.cvd.toFixed(2)),
      funding: Number(deltas.funding.toFixed(4)),
      volume_billions: Number((deltas.volume / 1e9).toFixed(2))
    },
    whaleRetailRatio: Number(whaleRetailRatio.toFixed(2)),
    dominantPlayer: whaleRetailRatio > 1.5 ? "whales" : whaleRetailRatio < 0.5 ? "retail" : "balanced",
    warnings
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

function analyzeFundingAdvanced(fundingHistory, priceHistory) {
  if (!fundingHistory || !fundingHistory.length) {
    return {
      current: null,
      zScore: null,
      trend: null,
      extremeLevel: "normal"
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
  
  // Extreme Level
  let extremeLevel = "normal";
  if (currentRate > 0.1) extremeLevel = "critical_high";
  else if (currentRate > 0.05) extremeLevel = "high";
  else if (currentRate < -0.1) extremeLevel = "critical_low";
  else if (currentRate < -0.05) extremeLevel = "low";
  
  return {
    current: Number(currentRate.toFixed(4)),
    zScore: zScore !== null ? Number(zScore.toFixed(2)) : null,
    trend,
    extremeLevel
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
 * PART 4: MARKET REGIME DETECTION (Claude)
 * =======================================================================
 */

function detectMarketRegime(binance4h, bybit4h, exchangeScenario) {
  const priceChange = binance4h.price_change || 0;
  const oiChange = binance4h.oi_change || 0;
  const funding = binance4h.funding_rate_avg_pct || 0;
  const cvd = binance4h.cvd || 0;
  
  const priceUp = priceChange > 0.5;
  const priceDown = priceChange < -0.5;
  const priceFlat = Math.abs(priceChange) < 0.5;
  const oiRising = oiChange > 0.5;
  const oiFalling = oiChange < -0.5;
  const fundingHigh = funding > 0.05;
  const fundingNegative = funding < 0;
  const cvdNegative = cvd < 0;
  const cvdPositive = cvd > 0;
  
  let regime, subType, confidence, characteristics = [];
  
  // REGIME 1: DISTRIBUTION
  if (exchangeScenario === "whale_distribution" || 
      (priceFlat && oiRising && fundingHigh && exchangeScenario === "retail_fomo_rally")) {
    regime = "distribution";
    subType = "whale_exit";
    confidence = 9;
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
    regime = "accumulation";
    subType = "whale_entry";
    confidence = 9;
    characteristics = [
      "Smart money accumulating",
      "Price stable while whales buy",
      "Funding negative = retail shorts crowded",
      "Strong setup for upside move"
    ];
  }
  
  // REGIME 3: LONG TRAP
  else if (priceUp && oiRising && fundingHigh && cvdNegative) {
    regime = "trap";
    subType = "long_trap";
    confidence = 8;
    characteristics = [
      "Price pumping but CVD negative",
      "Funding extremely high = longs crowded",
      "OI rising = retail piling in at top",
      "Classic bull trap - shorts will win"
    ];
  }
  
  // REGIME 4: SHORT TRAP
  else if (priceDown && oiRising && fundingNegative && cvdPositive) {
    regime = "trap";
    subType = "short_trap";
    confidence = 7;
    characteristics = [
      "Price dumping but CVD positive",
      "Funding negative = shorts crowded",
      "Smart money buying the dip",
      "Classic bear trap - longs will win"
    ];
  }
  
  // REGIME 5: SHORT COVERING
  else if (priceUp && oiFalling) {
    regime = "covering";
    subType = "short_squeeze";
    confidence = 9;
    characteristics = [
      "Price rising but OI falling",
      "Shorts closing = weak rally",
      "Not sustainable - no new buyers",
      "Expect fizzle at resistance"
    ];
  }
  
  // REGIME 6: TRENDING BULLISH
  else if (priceUp && oiRising && !fundingHigh && cvdPositive && exchangeScenario === "synchronized_bullish") {
    regime = "trending";
    subType = "healthy_bull";
    confidence = 8;
    characteristics = [
      "Price and OI rising together",
      "CVD positive = real buying",
      "Funding reasonable = sustainable",
      "Both retail and whales buying"
    ];
  }
  
  // REGIME 7: TRENDING BEARISH
  else if (priceDown && oiRising && cvdNegative && exchangeScenario === "synchronized_bearish") {
    regime = "trending";
    subType = "healthy_bear";
    confidence = 8;
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
  
  return {
    regime,
    subType,
    confidence,
    characteristics
  };
}

/**
 * =======================================================================
 * PART 5: WEIGHTED DECISION ENGINE (Claude)
 * =======================================================================
 */

function calculateWeightedDecision(
  binance4h, 
  bybit4h, 
  exchangeAnalysis, 
  regimeAnalysis,
  technicalMetrics,
  fundingAdvanced
) {
  const signals = [];
  
  // Signal 1: Exchange Divergence (40% weight)
  signals.push({
    name: "exchange_divergence",
    signal: exchangeAnalysis.bias,
    confidence: exchangeAnalysis.confidence,
    weight: 0.40,
    reasoning: exchangeAnalysis.warnings[0]
  });
  
  // Signal 2: Market Regime (25% weight)
  const regimeBias = 
    regimeAnalysis.regime === "distribution" || regimeAnalysis.subType === "long_trap" ? "SHORT" :
    regimeAnalysis.regime === "accumulation" || regimeAnalysis.subType === "short_trap" ? "LONG" :
    regimeAnalysis.subType === "healthy_bull" ? "LONG" :
    regimeAnalysis.subType === "healthy_bear" ? "SHORT" : "WAIT";
    
  signals.push({
    name: "market_regime",
    signal: regimeBias,
    confidence: regimeAnalysis.confidence,
    weight: 0.25,
    reasoning: regimeAnalysis.characteristics[0]
  });
  
  // Signal 3: Technical Analysis (15% weight)
  const techBias = technicalMetrics.technicalBias || "WAIT";
  const techStrength = technicalMetrics.trend?.strength || 0;
  const techDirection = technicalMetrics.trend?.direction || "unknown";
  
  signals.push({
    name: "technical",
    signal: techBias,
    confidence: Math.abs(techStrength) * 10,
    weight: 0.15,
    reasoning: techDirection !== "unknown" 
      ? `Trend ${techDirection} with strength ${techStrength}` 
      : "No technical data available"
  });
  
  // Signal 4: Funding (12% weight)
  const fundingExtreme = fundingAdvanced?.extremeLevel || "normal";
  const fundingCurrent = fundingAdvanced?.current || 0;
  const fundingZ = fundingAdvanced?.zScore || 0;
  
  const fundingBias = 
    fundingExtreme === "critical_high" ? "SHORT" :
    fundingExtreme === "high" ? "SHORT" :
    fundingExtreme === "critical_low" ? "LONG" :
    fundingExtreme === "low" ? "LONG" : "WAIT";
    
  signals.push({
    name: "funding",
    signal: fundingBias,
    confidence: Math.abs(fundingZ) * 2,
    weight: 0.12,
    reasoning: `Funding ${fundingExtreme} at ${fundingCurrent}%`
  });
  
  // Signal 5: CVD (8% weight)
  const cvd = binance4h.cvd || 0;
  const priceChange = binance4h.price_change || 0;
  const cvdBias = 
    priceChange > 0 && cvd < 0 ? "SHORT" :   // Price up, CVD negative → bearish divergence
    priceChange < 0 && cvd > 0 ? "LONG" :    // Price down, CVD positive → bullish divergence
    priceChange > 0 && cvd > 0 ? "LONG" :    // Price up, CVD positive → bullish confirmation
    priceChange < 0 && cvd < 0 ? "SHORT" :   // Price down, CVD negative → bearish confirmation
    "WAIT";
    
  signals.push({
    name: "cvd",
    signal: cvdBias,
    confidence: 6,
    weight: 0.08,
    reasoning: `CVD ${cvd > 0 ? 'positive' : 'negative'} while price ${priceChange > 0 ? 'up' : 'down'}`
  });
  
  // Calculate weighted scores
  let longScore = 0, shortScore = 0, waitScore = 0;
  
  signals.forEach(s => {
    const weightedConfidence = (s.confidence / 10) * s.weight * 100;
    if (s.signal === "LONG" || s.signal === "STRONG_LONG") {
      longScore += weightedConfidence * (s.signal === "STRONG_LONG" ? 1.5 : 1);
    } else if (s.signal === "SHORT" || s.signal === "STRONG_SHORT") {
      shortScore += weightedConfidence * (s.signal === "STRONG_SHORT" ? 1.5 : 1);
    } else {
      waitScore += weightedConfidence;
    }
  });
  
  // Determine final bias
  const maxScore = Math.max(longScore, shortScore, waitScore);
  let finalBias, finalConfidence;
  
  if (maxScore === longScore && longScore > shortScore * 1.3) {
    finalBias = "LONG";
    finalConfidence = Math.min((longScore / 40) * 10, 10);
  } else if (maxScore === shortScore && shortScore > longScore * 1.3) {
    finalBias = "SHORT";
    finalConfidence = Math.min((shortScore / 40) * 10, 10);
  } else {
    finalBias = "WAIT";
    finalConfidence = Math.min((waitScore / 30) * 10, 10);
  }
  
  return {
    bias: finalBias,
    confidence: Number(finalConfidence.toFixed(1)),
    scores: {
      long: Number(longScore.toFixed(1)),
      short: Number(shortScore.toFixed(1)),
      wait: Number(waitScore.toFixed(1))
    },
    signals,
    reasoning: signals
      .filter(s => s.confidence >= 6)
      .sort((a, b) => b.weight - a.weight)
      .map(s => s.reasoning)
  };
}

/**
 * =======================================================================
 * PART 6: MAIN CALCULATOR
 * =======================================================================
 */

function calculateMarketMetrics(marketData, historicalData = {}) {
  // Support both new format { snapshot, history } and old format (direct snapshot)
  let snapshot, history;
  
  if (marketData.snapshot && marketData.history) {
    // New format from getFuturesMarketData with includeHistory=true
    snapshot = marketData.snapshot;
    history = marketData.history;
  } else if (marketData.Binance || marketData.Bybit) {
    // Old format - direct snapshot
    snapshot = marketData;
    history = historicalData;
  } else {
    throw new Error("Invalid marketData format");
  }
  
  const binance4h = snapshot.Binance?.["4h"] || {};
  const binance1d = snapshot.Binance?.["1d"] || {};
  const bybit4h = snapshot.Bybit?.["4h"] || {};
  const bybit1d = snapshot.Bybit?.["1d"] || {};
  
  // Historical data for technical analysis
  const priceHistory = history.priceHistory || [];
  const oiHistory = history.oiHistory || [];
  const fundingHistory = history.fundingHistory || [];
  
  // Step 1: Exchange Divergence (CORE)
  const exchangeAnalysis = analyzeExchangeDivergence(binance4h, bybit4h);
  
  // Step 2: Technical Metrics
  const technicalMetrics = calculateTechnicalMetrics(priceHistory, oiHistory, fundingHistory);
  
  // Step 3: Advanced Funding Analysis
  const fundingAdvanced = analyzeFundingAdvanced(fundingHistory, priceHistory);
  
  // Step 4: Advanced OI Analysis
  const oiAdvanced = analyzeOiAdvanced(oiHistory, priceHistory);
  
  // Step 5: Market Regime
  const regimeAnalysis = detectMarketRegime(binance4h, bybit4h, exchangeAnalysis.scenario);
  
  // Step 6: Weighted Decision
  const decision = calculateWeightedDecision(
    binance4h, 
    bybit4h, 
    exchangeAnalysis, 
    regimeAnalysis,
    technicalMetrics,
    fundingAdvanced
  );
  
  return {
    timestamp: Date.now(),
    timeframe: "4h",
    
    // STRATEGIC ANALYSIS (Claude)
    exchangeDivergence: exchangeAnalysis,
    marketRegime: regimeAnalysis,
    finalDecision: decision,
    
    // TECHNICAL ANALYSIS (ChatGPT)
    technical: technicalMetrics,
    fundingAdvanced,
    oiAdvanced,
    
    // RAW DATA
    raw: {
      binance: { "4h": binance4h, "1d": binance1d },
      bybit: { "4h": bybit4h, "1d": bybit1d }
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
  TechnicalUtils
};
