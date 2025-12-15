# System Logic Status - December 2025

**Last Updated:** 2025-12-12  
**Version:** v2.3.1 (P0 CVD Fix Applied)  
**Build:** 2.2.1 | `buildInfo.p0CvdFix = true`  
**Status:** ✅ ALL SYSTEMS OPERATIONAL

---

## Table of Contents
1. [Golden Rules](#1-golden-rules)
2. [Timeframe Thresholds](#2-timeframe-thresholds)
3. [Classifier Functions](#3-classifier-functions)
4. [Exchange Divergence Engine](#4-exchange-divergence-engine)
5. [Market Regime Detection](#5-market-regime-detection)
6. [Weighted Decision Engine](#6-weighted-decision-engine)
7. [CVD Reliability System](#7-cvd-reliability-system)
8. [Funding Pain Analysis](#8-funding-pain-analysis)
9. [Whale/Retail Ratio](#9-whaleretail-ratio)
10. [Timeframe Buckets](#10-timeframe-buckets)
11. [Confidence Scale](#11-confidence-scale)
12. [API Output Reference](#12-api-output-reference)

---

## 1. Golden Rules

These are the foundational principles that drive all analysis:

| # | Rule | Implication |
|---|------|-------------|
| 1 | **Binance = Noise. Bybit = Truth.** | Retail trades on Binance USDT-M, whales on Bybit COIN-M |
| 2 | **Price shows direction. OI shows intention.** | Price moves are effects; OI moves are causes |
| 3 | **Funding shows crowding.** | High funding = crowded longs, low/negative = crowded shorts |
| 4 | **CVD reveals aggression.** | Positive CVD = aggressive buying, Negative = aggressive selling |
| 5 | **OI drop in rallies = weakness.** | Whales exiting during price rise = distribution |
| 6 | **OI rise in declines = strength.** | Smart money buying dips = accumulation |
| 7 | **Divergence without OI confirmation is worthless.** | Always require OI confirmation |
| 8 | **Smart money leaves footprints in Bybit COIN-M.** | Watch Bybit for whale signals |

---

## 2. Timeframe Thresholds

Each timeframe has specific thresholds that define what constitutes "noise" vs "significant" moves:

```javascript
const THRESHOLDS = {
  '30m': {
    price: { noise: 0.25, strong: 0.5 },   // Price % change thresholds
    oi: { quiet: 0.15, aggressive: 0.3 },  // OI % change thresholds
    funding: 0.03                           // Funding rate % threshold
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
```

**How to read:**
- A 0.3% price move on 30m is "normal", but on 4h it's just "noise"
- A 1.5% OI change on 30m is "aggressive", on 1d it's only "normal"

---

## 3. Classifier Functions

Raw data is passed through classifiers to determine **Direction** and **Strength**.

### 3.1 Price Move Classifier
```
classifyPriceMove(changePct, timeframe) → { direction, strength }
```

| Range | Direction | Strength |
|-------|-----------|----------|
| `|change| < noise` | FLAT | noise |
| `noise ≤ |change| < strong` | UP/DOWN | normal |
| `|change| ≥ strong` | UP/DOWN | strong |

### 3.2 OI Move Classifier
```
classifyOiMove(changePct, timeframe) → { direction, strength }
```

| Range | Direction | Strength |
|-------|-----------|----------|
| `|change| < quiet` | FLAT | quiet |
| `quiet ≤ |change| < aggressive` | RISING/FALLING | normal |
| `|change| ≥ aggressive` | RISING/FALLING | aggressive |

### 3.3 Funding Level Classifier
```
classifyFundingLevel(rate, zScore) → { level, bias }
```

| Z-Score Range | Level | Bias |
|---------------|-------|------|
| `zScore > 2` | critical_high | SHORT |
| `zScore > 1` | high | SHORT |
| `zScore < -2` | critical_low | LONG |
| `zScore < -1` | low | LONG |
| otherwise | normal | NEUTRAL |

---

## 4. Exchange Divergence Engine

Detects 9 distinct scenarios based on Binance vs Bybit divergence:

### 4.1 Scenario Detection Table

| Scenario | Conditions | Bias | Confidence |
|----------|------------|------|------------|
| **whale_distribution** | Price UP + Bybit OI FALLING + Binance OI RISING + CVD negative | SHORT | 8-10 |
| **whale_accumulation** | Bybit OI RISING + OI delta < -0.5 + CVD positive | LONG | 7-10 |
| **retail_fomo_rally** | Price UP strong + Binance OI aggressive + Funding high + Bybit OI not aggressive | SHORT | 6-8 |
| **short_squeeze_setup** | Price DOWN + OI RISING + Funding negative + CVD positive | LONG | 5-8 |
| **whale_hedging** | Bybit OI aggressive FALLING + Price flat | WAIT | 5-7 |
| **synchronized_bullish** | Both exchanges OI RISING + Price UP + CVD positive | LONG | 6-8 |
| **synchronized_bearish** | Both exchanges OI RISING + Price DOWN + CVD negative | SHORT | 6-8 |
| **bybit_leading** | Bybit OI aggressive move + Binance quiet | Follow Bybit | 6-7 |
| **binance_noise** | Binance OI aggressive + Bybit quiet | WAIT | 5-6 |
| **unclear** | No clear pattern | WAIT | 4 |

### 4.2 Key Divergence Logic

```javascript
// Whale Distribution Detection
const distConditions = [
  priceUp,           // Price is rising
  priceStrong,       // Strong move (above threshold)
  bybitOiFalling,    // Whales exiting
  bybitOiAggressive, // Significant exit
  binanceOiRising,   // Retail buying
  binanceCvdNegative // But CVD negative (selling pressure)
];
// Requires 4+ conditions + priceUp + bybitOiFalling
```

---

## 5. Market Regime Detection

Identifies the current market phase for strategic positioning:

### 5.1 Regime Types

| Regime | SubType | Conditions | Bias |
|--------|---------|------------|------|
| **distribution** | whale_exit | Price flat/up + OI rising + Funding high + CVD negative | SHORT |
| **accumulation** | whale_entry | Price flat + OI rising + Funding negative + CVD positive | LONG |
| **trap** | long_trap | Price UP + OI rising + Funding high + CVD negative | SHORT |
| **trap** | short_trap | Price DOWN + OI rising + Funding negative + CVD positive | LONG |
| **trending** | healthy_bull | Price UP + OI rising + Funding normal + CVD positive | LONG |
| **trending** | healthy_bear | Price DOWN + OI rising + CVD negative | SHORT |
| **covering** | short_squeeze | Price UP + OI falling + Funding high | LONG |
| **covering** | long_squeeze | Price DOWN + OI falling + Funding negative | SHORT |
| **range** | chop | Price flat + OI flat | WAIT |
| **unclear** | mixed | No clear pattern | WAIT |

### 5.2 Regime → Bias Mapping

```javascript
const regimeBias =
  regime === "distribution" || subType === "long_trap" ? "SHORT" :
  regime === "accumulation" || subType === "short_trap" ? "LONG" :
  subType === "healthy_bull" ? "LONG" :
  subType === "healthy_bear" ? "SHORT" : "WAIT";
```

---

## 6. Weighted Decision Engine

Final bias is calculated using a transparent weighted sum formula.

### 6.1 Signal Weights

| Signal | Weight | Description |
|--------|--------|-------------|
| Exchange Divergence | 35% | Whale vs retail behavior |
| Market Regime | 20% | Current market phase |
| Market Structure | 15% | Support/resistance levels |
| Volume Profile | 10% | VAL/VAH/POC positioning |
| Technical Analysis | 10% | EMA trend + momentum |
| Funding | 5% | Crowding indicator |
| CVD | 5% | Aggression indicator |

### 6.2 Score Calculation

```javascript
// For each signal:
contribution = confidence × weight

// Accumulate:
if (signal === "LONG") longScore += contribution
if (signal === "SHORT") shortScore += contribution
if (signal === "WAIT") waitScore += contribution

// Final bias:
if (longScore > shortScore && longScore > waitScore) bias = "LONG"
if (shortScore > longScore && shortScore > waitScore) bias = "SHORT"
else bias = "WAIT"
```

### 6.3 Conflict Penalty

When signals are contradictory, confidence is reduced:

```javascript
// Conflict ratio = minority / majority
conflictRatio = Math.min(longScore, shortScore) / Math.max(longScore, shortScore)

// Bonus for alignment, penalty for conflict
conflictBonus = (1 - conflictRatio) * 2  // 0 to 2 points

// Added to noTradeConfidence when signals conflict
noTradeConfidence = waitScore + conflictBonus
```

### 6.4 Final Confidence

Two separate confidence values are calculated:

| Metric | Formula | When Used |
|--------|---------|-----------|
| **directionConfidence** | `max(longScore, shortScore)` | When bias is LONG or SHORT |
| **noTradeConfidence** | `waitScore + conflictBonus` | When bias is WAIT |

```javascript
// Final confidence depends on bias
if (directionConfidence > noTradeConfidence) {
  finalBias = longScore > shortScore ? "LONG" : "SHORT";
  finalConfidence = directionConfidence;
} else {
  finalBias = "WAIT";
  finalConfidence = noTradeConfidence;
}
```

---

## 7. CVD Reliability System

CVD reliability is split into two checks for precision:

### 7.1 Data Completeness Check (`cvdDataComplete`)

| Check | Failure Condition |
|-------|-------------------|
| No data | `takerData.length === 0` |
| Insufficient candles | `actualCandles < minCandles (80%)` |
| Too many gaps | `consecutiveZeros > 3` |

### 7.2 Market Impact Check (`cvdMarketImpactReliable`)

Minimum average volume per candle thresholds:

| Timeframe | Min Volume/Candle |
|-----------|-------------------|
| 30m | $500K |
| 1h | $1M |
| 4h | $5M |
| 1d | $50M |

### 7.3 Combined Reliability

```javascript
cvdReliableForTf = cvdDataComplete && cvdMarketImpactReliable

// If unreliable:
cvdWeight = 0      // Excluded from decision
cvdBias = "WAIT"   // Neutral signal
// Warning added to response
```

### 7.4 CVD Window Configuration

| Timeframe | API Interval | Window Candles | Coverage |
|-----------|--------------|----------------|----------|
| 30m | m30 | 48 | 24 hours |
| 1h | h1 | 24 | 24 hours |
| 4h | h4 | 18 | 72 hours |
| 1d | h24 | 14 | 2 weeks |

---

## 8. Funding Pain Analysis

Calculates the actual dollar-cost pressure on positions:

### 8.1 Pain Index Formula

```javascript
painIndex ($M) = (fundingRate % / 100) × openInterest ($) / 1e6

// Example: 0.05% funding on $8B OI = $4M pain per 8h
```

### 8.2 Pain Levels

| Level | Threshold | Implication |
|-------|-----------|-------------|
| **low** | < $3M / 8hr | Normal conditions |
| **elevated** | $3-8M / 8hr | Increasing pressure |
| **high** | > $8M / 8hr | Squeeze probability high |
| **critical** | > $15M / 8hr | Imminent liquidation cascade |

### 8.3 Funding Bias Logic

```javascript
// Based on Z-Score of funding rate
zScore > 2  → fundingBias = "SHORT", extremeLevel = "critical_high"
zScore > 1  → fundingBias = "SHORT", extremeLevel = "high"
zScore < -2 → fundingBias = "LONG",  extremeLevel = "critical_low"
zScore < -1 → fundingBias = "LONG",  extremeLevel = "low"
else        → fundingBias = "WAIT",  extremeLevel = "normal"
```

---

## 9. Whale/Retail Ratio

Compares Bybit (whales) vs Binance (retail) activity:

### 9.1 Reliability Thresholds

| Timeframe | Min OI % Change | Min USD Change |
|-----------|-----------------|----------------|
| 30m, 1h (scalping) | 0.2% | $2M |
| 4h, 1d (macro) | 0.5% | $10M |

### 9.2 Ratio Calculation

```javascript
if (bybitChange < MIN_PCT || bybitChangeUsd < MIN_USD) {
  return { ratio: 1, reliable: false, reason: "..." }
}

if (binanceChange < MIN_PCT) {
  // Retail quiet, whales active
  return { ratio: min(bybitChange / MIN_PCT, 5), reliable: true }
}

// Normal case with cap
return { ratio: min(bybitChange / binanceChange, 10), reliable: true }
```

### 9.3 Dominant Player Classification

| Ratio | Dominant |
|-------|----------|
| > 1.5 | whales |
| < 0.5 | retail |
| 0.5-1.5 | balanced |

---

## 10. Timeframe Buckets

Analysis is aggregated into three strategic buckets:

| Bucket | Timeframes | Purpose |
|--------|------------|---------|
| **MACRO** | 1d, 4h | Overall trend and bias anchor |
| **MICRO** | 4h, 1h | Intraday swing setups |
| **SCALPING** | 1h, 30m | Entry timing and momentum |

### 10.1 Bucket Aggregation

```javascript
// Average scores from constituent timeframes
avgLong = average(tf.scores.long for tf in bucket)
avgShort = average(tf.scores.short for tf in bucket)
avgWait = average(tf.scores.wait for tf in bucket)

// Determine bucket bias
if (avgLong > avgShort * 1.2) bias = "BULLISH"
else if (avgShort > avgLong * 1.2) bias = "BEARISH"
else bias = "NEUTRAL"

// Average confidence (0-10 scale)
confidence = average(tf.confidence for tf in bucket)
```

### 10.2 Trade Stance Derivation

```javascript
// Threshold: 6.0 on 0-10 scale
if (confidence >= 6.0) {
  if (bias === "BEARISH") tradeStance = "LOOK_FOR_SHORTS"
  if (bias === "BULLISH") tradeStance = "LOOK_FOR_LONGS"
} else {
  tradeStance = "AVOID_TRADING"
}
```

---

## 11. Confidence Scale

All confidence values use a **0-10 scale** for consistency:

### 11.1 Scale Reference

| Range | Meaning | Trade Recommendation |
|-------|---------|---------------------|
| 0-2 | Very weak | Avoid trading |
| 3-4 | Weak | Reduce size significantly |
| 5-6 | Moderate | Normal position, tight stops |
| 7-8 | Strong | Full position allowed |
| 9-10 | Very strong | High conviction setup |

### 11.2 Confidence Types

| Field | Meaning |
|-------|---------|
| `confidence` | Main confidence value (context-dependent) |
| `confidenceType` | Either "directionConfidence" or "noTradeConfidence" |
| `directionConfidence` | Confidence in LONG or SHORT direction |
| `noTradeConfidence` | Confidence that no trade should be taken |

---

## 12. API Output Reference

### 12.1 Top-Level finalDecision

```json
{
  "bias": "WAIT",
  "confidence": 9.3,
  "confidenceType": "noTradeConfidence",
  "directionConfidence": 1.2,
  "noTradeConfidence": 9.3,
  "scores": { "long": 1.2, "short": 0.5, "wait": 2.5 },
  "signals": [...],
  "warnings": [...],
  "tradeStance": "AVOID_TRADING",
  "riskMode": "DEFENSIVE"
}
```

### 12.2 CVD Metadata

```json
{
  "cvd": -551374991.14,
  "cvdNormalized": -0.015,
  "cvdResolution": "h4",
  "cvdIntervalUsed": "h4",
  "cvdRequestedTimeframe": "4h",
  "cvdDataComplete": true,
  "cvdMarketImpactReliable": true,
  "cvdReliableForTf": true,
  "cvdAvgVolumePerCandle": 2037189831.42
}
```

### 12.3 Timeframe Bucket

```json
{
  "macro": {
    "bias": "NEUTRAL",
    "confidence": 9.3,
    "confidenceScale": "0-10",
    "confidenceType": "noTradeConfidence",
    "tradeStance": "AVOID_TRADING"
  }
}
```

### 12.4 Build Info (for verification)

```json
{
  "meta": {
    "buildInfo": {
      "version": "2.2.1",
      "buildDate": "2025-12-12T13:30:00Z",
      "p0CvdFix": true,
      "cvdIntervals": ["m30", "h1", "h4", "h24"]
    }
  }
}
```

---

## Appendix: Quick Reference

### Trade Decision Matrix

| Scenario | Bias | Confidence | Action |
|----------|------|------------|--------|
| Whale Distribution | SHORT | 8+ | Look for shorts |
| Whale Accumulation | LONG | 7+ | Look for longs |
| Long Trap | SHORT | 6+ | Exit longs, consider shorts |
| Short Trap | LONG | 6+ | Exit shorts, consider longs |
| Range/Chop | WAIT | N/A | No trade |
| Funding Critical High | SHORT | 7+ | Expect longs to get squeezed |
| Funding Critical Low | LONG | 7+ | Expect shorts to get squeezed |

### Signal Priority (Descending)

1. Exchange Divergence (35%) - Whale vs retail
2. Market Regime (20%) - Phase identification
3. Market Structure (15%) - Key levels
4. Technical + Volume (20%) - Confirmation
5. Funding + CVD (10%) - Crowding signals

---

*Documented by Antigravity AI - December 2025*
