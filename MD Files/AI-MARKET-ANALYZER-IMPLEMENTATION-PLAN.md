# AI Market Analyzer – Implementation Plan

> **Document Created:** December 11, 2025  
> **Last Updated:** December 12, 2025  
> **Purpose:** Step-by-step logical implementation guide for building the AI Market Analyzer  
> **Approach:** Rules-First with LLM Enhancement

---

## 🎯 Core Architecture Decision

### Rules Engine = Source of Truth for Signals
### LLM = Explanation & Coaching Layer Only

**Why Rules-First:**
1. **Backtestable** - Same input = same output, can validate edge over years
2. **Deterministic** - No model drift, no surprise behavior changes
3. **Controllable** - You know exactly why a signal was generated
4. **Fast** - No API latency for critical decisions

**LLM Role (Non-Critical):**
- Generate human-readable explanations
- Provide coaching insights
- Highlight what to watch
- Never changes the bias/stance from Rules Engine

---

## 📊 Current State Assessment

### ✅ Already Implemented (in marketMetrics.js)

| Component | Status | Notes |
|-----------|--------|-------|
| **Exchange Hierarchy** | ✅ Done | "Bybit = truth, Binance = noise" in Golden Rules |
| **Exchange Divergence** | ✅ Done | 9 scenarios (whale_distribution, accumulation, etc.) |
| **Regime Detection** | ✅ Done | 7 regimes (distribution, accumulation, traps, etc.) |
| **Weighted Decision** | ✅ Done | 5 signals, bias + confidence |
| **Technical Utils** | ✅ Done | SMA, EMA, slope, z-score |

### ❌ Missing (Must Add)

| Component | Priority | Notes |
|-----------|----------|-------|
| **Long Squeeze** | 🔴 Critical | Price ↓ + OI ↓ = longs liquidating |
| **Range/Chop** | 🔴 Critical | No edge state, must signal WAIT |
| **tradeStance** | 🔴 Critical | LOOK_FOR_LONGS / LOOK_FOR_SHORTS / AVOID_TRADING |
| **riskMode** | 🟡 Important | NORMAL / DEFENSIVE / AGGRESSIVE |
| **Multi-TF** | 🟡 Important | Currently only 4h used, 1d data fetched but ignored |
| **Alerts** | 🟡 Important | No alert system exists |
| **LLM Layer** | 🟢 Later | For explanation only |

### ❌ Does NOT Exist (Despite STATUS.md claims)

| Component | STATUS.md Said | Reality |
|-----------|----------------|---------|
| Volume Profile (POC/VAH/VAL) | ✅ Done | ❌ Not in code |
| Structure Detection (Swing H/L) | ✅ Done | ❌ Not in code |

---

## Table of Contents

0. [Layer 0: Data Source & Configuration](#layer-0-data-source--configuration)
1. [Layer 1: Feature Extraction Logic](#layer-1-feature-extraction-logic)
2. [Layer 2: Single-Timeframe Analysis Logic](#layer-2-single-timeframe-analysis-logic)
3. [Layer 3: Multi-Timeframe Aggregation Logic](#layer-3-multi-timeframe-aggregation-logic)
4. [Layer 4: Market State Object Logic](#layer-4-market-state-object-logic)
5. [Layer 5: AI Reasoning Layer Logic](#layer-5-ai-reasoning-layer-logic)
6. [Layer 6: Alert System Logic](#layer-6-alert-system-logic)
7. [Layer 7: Storage & History Logic](#layer-7-storage--history-logic)
8. [Implementation Sequence](#implementation-sequence)
9. [Appendices](#appendix-a-signal-weight-reference)

---

# Layer 0: Data Source & Configuration

## 0.1 Single Data Source: Coinglass

**CRITICAL: All market data is sourced exclusively from Coinglass API.**

We do NOT connect directly to Binance or Bybit exchanges. Coinglass aggregates data from multiple exchanges, and we query Coinglass for:
- Binance USDT perpetual data
- Bybit Coin-Margined perpetual data

This simplifies our architecture (one API integration) but means we're bound by Coinglass plan limitations.

## 0.2 Coinglass Plan Configuration

The system must be **plan-aware** and adjust available features based on the active Coinglass subscription.

### Plan Definitions

```
COINGLASS_PLANS = {
  STARTUP: {
    name: 'STARTUP'
    price: '$79/month'
    minInterval: '30m'
    availableTimeframes: ['30m', '1h', '4h', '1d']
    rateLimit: 80  // requests per minute
    features: {
      realtime: true
      historical: true
      liquidationHeatmap: true
      websocket: false
    }
  },
  
  STANDARD: {
    name: 'STANDARD'
    price: '$299/month'
    minInterval: '5m'
    availableTimeframes: ['5m', '15m', '30m', '1h', '4h', '1d']
    rateLimit: 200
    features: {
      realtime: true
      historical: true
      liquidationHeatmap: true
      websocket: true
      coinsMarkets: true
    }
  },
  
  PROFESSIONAL: {
    name: 'PROFESSIONAL'
    price: '$499/month'
    minInterval: '1m'
    availableTimeframes: ['1m', '5m', '15m', '30m', '1h', '4h', '1d']
    rateLimit: 500
    features: {
      realtime: true
      historical: true
      liquidationHeatmap: true
      websocket: true
      coinsMarkets: true
      prioritySupport: true
    }
  }
}
```

### Active Plan Configuration

```
// Environment/Config variable
COINGLASS_ACTIVE_PLAN = 'STARTUP'  // Change this when upgrading

// Runtime access
const activePlan = COINGLASS_PLANS[COINGLASS_ACTIVE_PLAN]
const availableTimeframes = activePlan.availableTimeframes
const minInterval = activePlan.minInterval
```

## 0.3 Timeframe Layer Configuration

Timeframes are grouped into **analysis layers**. Each layer can be enabled/disabled based on data availability.

### Layer Definitions

```
TIMEFRAME_LAYERS = {
  SCALPING: {
    id: 'scalping'
    name: 'Scalping Layer'
    timeframes: ['1m', '5m', '15m']
    requiredMinInterval: '1m'  // Need at least 1m data
    purpose: 'Ultra short-term timing and scalp entries'
    enabledByDefault: false
  },
  
  INTRADAY: {
    id: 'intraday'
    name: 'Intraday Layer'
    timeframes: ['30m', '1h']
    requiredMinInterval: '30m'
    purpose: 'Day trading and swing entry timing'
    enabledByDefault: true
  },
  
  MACRO: {
    id: 'macro'
    name: 'Macro Layer'
    timeframes: ['4h', '1d']
    requiredMinInterval: '30m'  // 4h/1d always available
    purpose: 'Overall trend and major structure'
    enabledByDefault: true
  }
}
```

### Dynamic Layer Activation

```
function getEnabledLayers(activePlan) {
  const enabledLayers = []
  
  for (const [layerId, layer] of Object.entries(TIMEFRAME_LAYERS)) {
    // Check if plan supports the required minimum interval
    const planMinMinutes = intervalToMinutes(activePlan.minInterval)
    const layerRequiredMinutes = intervalToMinutes(layer.requiredMinInterval)
    
    if (planMinMinutes <= layerRequiredMinutes) {
      enabledLayers.push({
        ...layer,
        enabled: true,
        availableTimeframes: layer.timeframes.filter(tf => 
          activePlan.availableTimeframes.includes(tf)
        )
      })
    }
  }
  
  return enabledLayers
}

// Example outputs:
// STARTUP plan  → [INTRADAY, MACRO] enabled
// STANDARD plan → [INTRADAY, MACRO] enabled, partial SCALPING (5m, 15m)
// PROFESSIONAL  → [SCALPING, INTRADAY, MACRO] all enabled
```

## 0.4 Timeframe Weighting Configuration

Weights must be **dynamic** based on which layers are active.

### Weight Presets

```
WEIGHT_PRESETS = {
  // When only INTRADAY + MACRO available (STARTUP plan)
  TWO_LAYER: {
    layers: {
      INTRADAY: 0.50,  // 50%
      MACRO: 0.50      // 50%
    },
    timeframes: {
      '30m': 0.25,
      '1h': 0.25,
      '4h': 0.30,
      '1d': 0.20
    }
  },
  
  // When SCALPING + INTRADAY + MACRO available (PROFESSIONAL plan)
  THREE_LAYER: {
    layers: {
      SCALPING: 0.25,  // 25%
      INTRADAY: 0.35,  // 35%
      MACRO: 0.40      // 40%
    },
    timeframes: {
      '1m': 0.05,
      '5m': 0.08,
      '15m': 0.12,
      '30m': 0.15,
      '1h': 0.20,
      '4h': 0.25,
      '1d': 0.15
    }
  },
  
  // Partial scalping (STANDARD plan - 5m minimum)
  PARTIAL_SCALPING: {
    layers: {
      SCALPING: 0.20,  // 20% (reduced - missing 1m)
      INTRADAY: 0.35,  // 35%
      MACRO: 0.45      // 45%
    },
    timeframes: {
      '5m': 0.08,
      '15m': 0.12,
      '30m': 0.15,
      '1h': 0.20,
      '4h': 0.27,
      '1d': 0.18
    }
  }
}
```

### Weight Selection Logic

```
function getActiveWeights(activePlan) {
  const enabledLayers = getEnabledLayers(activePlan)
  const layerIds = enabledLayers.map(l => l.id)
  
  if (layerIds.includes('scalping') && activePlan.minInterval === '1m') {
    return WEIGHT_PRESETS.THREE_LAYER
  } else if (layerIds.includes('scalping')) {
    return WEIGHT_PRESETS.PARTIAL_SCALPING
  } else {
    return WEIGHT_PRESETS.TWO_LAYER
  }
}
```

## 0.5 Available Coinglass Endpoints (STARTUP Plan)

**All data for both Binance USDT and Bybit Coin-M comes from these endpoints:**

| Data Type | Endpoint | Min Interval | Notes |
|-----------|----------|--------------|-------|
| Price OHLC | `/api/price/ohlc-history` | 30m | Price, Open, High, Low, Close |
| Open Interest | `/api/futures/open-interest/history` | 30m | Per exchange |
| Aggregated OI | `/api/futures/open-interest/aggregated-history` | 30m | Cross-exchange |
| Funding Rate | `/api/futures/funding-rate/history` | 30m | Per exchange |
| OI-Weighted Funding | `/api/futures/funding-rate/oi-weight-history` | 30m | Weighted average |
| Taker Buy/Sell | `/api/futures/v2/taker-buy-sell-volume/history` | 30m | For CVD calculation |
| Liquidations | `/api/futures/liquidation/history` | 30m | Per pair |
| Aggregated Liqs | `/api/futures/liquidation/aggregated-history` | 30m | Cross-exchange |
| Long/Short Ratio | `/api/futures/global-long-short-account-ratio/history` | 30m | Sentiment |
| Liquidation Heatmap | `/api/futures/liquidation/heatmap/model1-3` | Real-time | Liq levels |
| Liquidation Map | `/api/futures/liquidation/map` | Real-time | Price levels |

**Real-time endpoints (no interval restriction):**
- `/api/futures/funding-rate/exchange-list` - Current funding
- `/api/futures/open-interest/exchange-list` - Current OI
- `/api/futures/liquidation/order` - Recent liquidations
- `/api/futures/taker-buy-sell-volume/exchange-list` - Current taker ratio

## 0.6 Exchange Configuration

```
EXCHANGE_CONFIG = {
  'binance-usdt': {
    id: 'binance-usdt'
    name: 'Binance USDT Perpetual'
    coinglassExchange: 'Binance'
    coinglassSymbol: 'BTCUSDT'
    marginType: 'USDT'
    enabled: true
  },
  
  'bybit-coinm': {
    id: 'bybit-coinm'
    name: 'Bybit Coin-Margined'
    coinglassExchange: 'Bybit'
    coinglassSymbol: 'BTCUSD'
    marginType: 'Coin'
    enabled: true
  }
}

// Future expansion example:
// 'okx-usdt': {
//   id: 'okx-usdt'
//   name: 'OKX USDT Perpetual'
//   coinglassExchange: 'OKX'
//   coinglassSymbol: 'BTC-USDT-SWAP'
//   marginType: 'USDT'
//   enabled: false  // Not active yet
// }
```

## 0.7 System Activation Commands

When upgrading Coinglass plan, the system responds to configuration changes:

```
// Pseudo-code for plan upgrade handling

function upgradePlan(newPlanId) {
  // 1. Update config
  COINGLASS_ACTIVE_PLAN = newPlanId
  
  // 2. Recalculate enabled layers
  const enabledLayers = getEnabledLayers(COINGLASS_PLANS[newPlanId])
  
  // 3. Update weights
  const activeWeights = getActiveWeights(COINGLASS_PLANS[newPlanId])
  
  // 4. Initialize new timeframe analyzers if needed
  for (const layer of enabledLayers) {
    for (const tf of layer.availableTimeframes) {
      if (!timeframeAnalyzers.has(tf)) {
        initializeTimeframeAnalyzer(tf)
      }
    }
  }
  
  // 5. Log activation
  console.log(`Plan upgraded to ${newPlanId}`)
  console.log(`Enabled layers: ${enabledLayers.map(l => l.name).join(', ')}`)
  console.log(`Available timeframes: ${enabledLayers.flatMap(l => l.availableTimeframes).join(', ')}`)
  
  // 6. Trigger full refresh
  refreshAllData()
}

// Example usage:
// upgradePlan('PROFESSIONAL')
// Output:
// > Plan upgraded to PROFESSIONAL
// > Enabled layers: Scalping Layer, Intraday Layer, Macro Layer
// > Available timeframes: 1m, 5m, 15m, 30m, 1h, 4h, 1d
```

---

## 0.8 Exchange Hierarchy (ALREADY IMPLEMENTED ✅)

### The Golden Rules

These rules are already encoded in `marketMetrics.js` and form the foundation of all analysis:

```
GOLDEN RULES:
1. Binance = noise. Bybit = truth.
2. Price shows direction. OI shows intention.
3. Funding shows crowding.
4. CVD reveals aggression.
5. OI drop in rallies = weakness.
6. OI rise in declines = strength.
7. Divergence without OI confirmation is worthless.
8. Smart money leaves footprints in Bybit COIN-M.
```

### Exchange Tiers

| Tier | Exchange | Contract | What It Represents | Weight |
|------|----------|----------|-------------------|--------|
| **Tier 1** | Bybit | COIN-M (BTCUSD) | Whale/Smart money flow | Primary signal |
| **Tier 2** | Binance | USDT-M (BTCUSDT) | Retail + some institutional | Confirmation/noise filter |

### Exchange Divergence Scenarios (ALREADY IMPLEMENTED ✅)

The following 9 scenarios are already detected in `analyzeExchangeDivergence()`:

| Scenario | Bybit Behavior | Binance Behavior | Interpretation | Bias |
|----------|----------------|------------------|----------------|------|
| `whale_distribution` | OI falling | OI rising + CVD negative | Whales dumping on retail | STRONG_SHORT |
| `whale_accumulation` | OI rising + CVD positive | OI lagging | Whales loading | STRONG_LONG |
| `retail_fomo_rally` | OI flat | OI rising + funding high | Retail FOMO, whales absent | SHORT |
| `short_squeeze_setup` | OI rising + CVD positive | OI rising + funding negative | Squeeze brewing | LONG |
| `whale_hedging` | OI rising + CVD negative | OI rising | Whales hedging rally | SHORT |
| `synchronized_bullish` | OI rising + CVD positive | OI rising + CVD positive | Both buying | LONG |
| `synchronized_bearish` | OI rising + CVD negative | OI rising + CVD negative | Both selling | SHORT |
| `bybit_leading` | High activity | Low activity | Follow whales | Per Bybit direction |
| `binance_noise` | Stable | High volatility | Ignore retail panic | WAIT |

---

## 0.9 Regime Definitions (MOSTLY IMPLEMENTED ✅)

### Current Regimes in Code

| Regime | SubType | Conditions | Bias | Status |
|--------|---------|------------|------|--------|
| `distribution` | `whale_exit` | Price flat/up + OI rising + Funding high + Bybit CVD negative | SHORT | ✅ Done |
| `accumulation` | `whale_entry` | Price flat + OI rising + Funding negative + CVD positive | LONG | ✅ Done |
| `trap` | `long_trap` | Price up + OI rising + Funding high + CVD negative | SHORT | ✅ Done |
| `trap` | `short_trap` | Price down + OI rising + Funding negative + CVD positive | LONG | ✅ Done |
| `covering` | `short_squeeze` | Price up + OI falling | WAIT | ✅ Done |
| `covering` | `long_squeeze` | Price down + OI falling | WAIT | ❌ **MISSING** |
| `trending` | `healthy_bull` | Price up + OI rising + CVD positive + Funding normal | LONG | ✅ Done |
| `trending` | `healthy_bear` | Price down + OI rising + CVD negative | SHORT | ✅ Done |
| `range` | `chop` | Price flat + OI flat | WAIT | ❌ **MISSING** |
| `unclear` | `mixed_signals` | No clear pattern | WAIT | ✅ Done |

### Regimes to Add

#### 1. Long Squeeze (CRITICAL)

```javascript
// Detection logic
if (priceDown && oiFalling) {
  regime = "covering";
  subType = "long_squeeze";
  bias = "WAIT";
  characteristics = [
    "Price falling while OI falling",
    "Longs closing/liquidating - panic selling",
    "NOT new shorts - covering only",
    "Don't catch falling knife - wait for OI to stabilize"
  ];
}
```

**Why it matters:** Without this, the system might interpret a long liquidation cascade as "bearish trend" and recommend shorting into exhaustion.

#### 2. Range/Chop (CRITICAL)

```javascript
// Detection logic
const priceFlat = Math.abs(priceChange) < 0.5;
const oiFlat = Math.abs(oiChange) < 0.5;

if (priceFlat && oiFlat) {
  regime = "range";
  subType = "chop";
  bias = "WAIT";
  confidence = 3; // Very low - no edge
  characteristics = [
    "Price flat, OI flat - no directional conviction",
    "No edge in this environment",
    "Wait for breakout or regime change"
  ];
}
```

**Why it matters:** The system MUST know when there's no edge. Trading chop = bleeding money to fees and spread.

---

## 0.10 Decision Output Enhancement (TO ADD)

### Current Output
```javascript
finalDecision: {
  bias: "LONG" | "SHORT" | "WAIT",
  confidence: 0-10,
  scores: { long, short, wait },
  signals: [...],
  reasoning: [...]
}
```

### Enhanced Output (TO IMPLEMENT)
```javascript
finalDecision: {
  // Existing
  bias: "LONG" | "SHORT" | "WAIT",
  confidence: 0-10,
  scores: { long, short, wait },
  signals: [...],
  reasoning: [...],
  
  // NEW - Trader-friendly outputs
  tradeStance: "LOOK_FOR_LONGS" | "LOOK_FOR_SHORTS" | "AVOID_TRADING",
  primaryRegime: "distribution" | "accumulation" | "trap" | "covering" | "trending" | "range",
  riskMode: "NORMAL" | "DEFENSIVE" | "AGGRESSIVE"
}
```

### TradeStance Derivation Logic

```javascript
function deriveTradeStance(bias, regime, confidence) {
  // Rule 1: Low confidence = avoid
  if (confidence < 5) {
    return "AVOID_TRADING";
  }
  
  // Rule 2: Dangerous regimes = avoid (even with bias)
  if (regime.state === "range" || regime.subType === "chop") {
    return "AVOID_TRADING";
  }
  
  // Rule 3: Traps and covering = avoid (don't chase)
  if (regime.state === "trap" || regime.state === "covering") {
    return "AVOID_TRADING";
  }
  
  // Rule 4: Clear bias with good regime = trade
  if (bias === "LONG") return "LOOK_FOR_LONGS";
  if (bias === "SHORT") return "LOOK_FOR_SHORTS";
  
  return "AVOID_TRADING";
}
```

### RiskMode Derivation Logic

```javascript
function deriveRiskMode(regime, confidence, exchangeAlignment) {
  // Defensive conditions
  if (regime.state === "trap") return "DEFENSIVE";
  if (regime.state === "covering") return "DEFENSIVE";
  if (confidence < 6) return "DEFENSIVE";
  
  // Aggressive conditions (all must be true)
  if (confidence >= 8 && 
      exchangeAlignment === "synchronized" &&
      (regime.subType === "healthy_bull" || regime.subType === "healthy_bear")) {
    return "AGGRESSIVE";
  }
  
  return "NORMAL";
}
```

### What Each RiskMode Means

| Mode | Position Size | Stop Distance | When |
|------|---------------|---------------|------|
| `DEFENSIVE` | 50% of normal | Tighter | Traps, covering, low confidence |
| `NORMAL` | 100% | Standard | Clear bias, good regime |
| `AGGRESSIVE` | 150% of normal | Can be wider | High confidence + full alignment |

---

# Layer 1: Feature Extraction Logic

## 1.1 Purpose

Transform raw market data into **meaningful, derived features** that the analysis engine can reason about. Features are the "vocabulary" the system uses to understand the market.

## 1.2 Data Sources

**Single Source: Coinglass API**

| Exchange | Symbol | Data Available | Notes |
|----------|--------|----------------|-------|
| Binance | BTCUSDT | Price, OI, Funding, CVD, Liqs, L/S Ratio | USDT-margined perp |
| Bybit | BTCUSD | Price, OI, Funding, CVD, Liqs, L/S Ratio | Coin-margined perp |

**Resolution depends on active Coinglass plan:**
- STARTUP: 30m minimum
- STANDARD: 5m minimum  
- PROFESSIONAL: 1m minimum

## 1.3 Feature Categories

### 1.3.1 Price & Trend Features

| Feature | Calculation Logic | Output | Purpose |
|---------|-------------------|--------|---------|
| **Trend Direction** | Compare price to EMA(20) and EMA(50). If price > both EMAs and EMA(20) > EMA(50) → Bullish. Inverse → Bearish. Mixed → Sideways | `bullish` / `bearish` / `sideways` | Establish directional context |
| **Trend Strength** | ADX-like calculation or slope of linear regression on last 20 candles | 0-100 score | How strong is the trend? |
| **Momentum** | Rate of change (ROC) over 14 periods + RSI positioning | `-100 to +100` | Is momentum accelerating or decelerating? |
| **Volatility State** | ATR as % of price, compare to 20-period average ATR | `low` / `normal` / `high` / `extreme` | Risk and opportunity context |
| **Price Position** | Where is price relative to recent range (20-period high/low)? | 0-100 (0 = at lows, 100 = at highs) | Overbought/oversold context |

### 1.3.2 Volume & Order Flow Features

| Feature | Calculation Logic | Output | Purpose |
|---------|-------------------|--------|---------|
| **Volume Trend** | Compare recent volume (5-period avg) to baseline (20-period avg) | `declining` / `normal` / `elevated` / `spike` | Participation level |
| **CVD Direction** | Slope of CVD over last N periods | `accumulating` / `distributing` / `neutral` | Who is more aggressive? |
| **CVD Divergence** | Price making new high but CVD not (or inverse) | `bullish_div` / `bearish_div` / `none` | Hidden weakness/strength |
| **Delta Imbalance** | Buy volume vs sell volume ratio in recent candles | `-1 to +1` (negative = sellers dominant) | Immediate aggression |

### 1.3.3 Open Interest Features

| Feature | Calculation Logic | Output | Purpose |
|---------|-------------------|--------|---------|
| **OI Direction** | Is OI increasing or decreasing over last N periods? | `building` / `declining` / `flat` | New positions vs. closing |
| **OI Change Magnitude** | % change in OI over period, compare to average | `normal` / `significant` / `extreme` | Size of positioning change |
| **OI-Price Relationship** | Matrix of OI direction + Price direction | See table below | Intent interpretation |
| **OI Divergence** | Price trending but OI not confirming | `bullish_div` / `bearish_div` / `none` | Trend exhaustion signal |

**OI-Price Relationship Matrix:**

| Price | OI | Interpretation |
|-------|-----|----------------|
| ↑ Up | ↑ Up | New longs entering – trend confirmation |
| ↑ Up | ↓ Down | Shorts closing – rally may exhaust |
| ↓ Down | ↑ Up | New shorts entering – trend confirmation |
| ↓ Down | ↓ Down | Longs closing – selloff may exhaust |
| → Flat | ↑ Up | Positioning building – breakout brewing |
| → Flat | ↓ Down | Positioning unwinding – low conviction |

### 1.3.4 Funding Rate Features

| Feature | Calculation Logic | Output | Purpose |
|---------|-------------------|--------|---------|
| **Funding Level** | Current funding rate | Raw value (e.g., 0.01%) | Cost of holding positions |
| **Funding Regime** | Z-score of funding vs 30-day average | `extreme_positive` / `positive` / `neutral` / `negative` / `extreme_negative` | Crowding signal |
| **Funding Trend** | Direction of funding over last N periods | `rising` / `falling` / `stable` | Sentiment shift |
| **Funding Flip** | Did funding cross zero recently? | `flipped_positive` / `flipped_negative` / `none` | Regime change |

**Funding Regime Thresholds:**
- Extreme Positive: Z-score > 2.0 (market very long, potential squeeze risk)
- Extreme Negative: Z-score < -2.0 (market very short, potential squeeze risk)
- Neutral: Z-score between -1.0 and 1.0

### 1.3.5 Liquidation Features

| Feature | Calculation Logic | Output | Purpose |
|---------|-------------------|--------|---------|
| **Recent Liq Volume** | Sum of liquidations (long + short) in last N periods | USD value | Activity level |
| **Liq Imbalance** | Long liqs vs short liqs ratio | `-1 to +1` | Who is getting liquidated? |
| **Liq Cluster** | Concentration of liquidations in time/price | `clustered` / `scattered` | Cascade risk |
| **Liq Spike** | Liquidations in last period vs average | `normal` / `elevated` / `cascade` | Forced selling/buying |

### 1.3.6 Structure Features

| Feature | Calculation Logic | Output | Purpose |
|---------|-------------------|--------|---------|
| **Swing High** | Local maximum with N candles lower on each side | Price level + timestamp | Key resistance |
| **Swing Low** | Local minimum with N candles higher on each side | Price level + timestamp | Key support |
| **Structure Bias** | Higher highs + higher lows = bullish structure | `bullish` / `bearish` / `range` | Market structure |
| **Break of Structure (BoS)** | Price closes beyond previous swing | `bullish_bos` / `bearish_bos` / `none` | Trend shift signal |
| **Weak High/Low** | Swing point that wasn't created with strong momentum/volume | Boolean flag on swing points | Likely to get swept |

### 1.3.7 Liquidity Features

| Feature | Calculation Logic | Output | Purpose |
|---------|-------------------|--------|---------|
| **Buy-side Liquidity** | Cluster of swing highs / equal highs above current price | Price level(s) + estimated size | Where shorts' stops are |
| **Sell-side Liquidity** | Cluster of swing lows / equal lows below current price | Price level(s) + estimated size | Where longs' stops are |
| **Nearest Liquidity** | Closest significant liquidity pool | Direction + distance | Immediate magnet |
| **Liquidity Sweep** | Price wicked through liquidity level then reversed | `buy_side_swept` / `sell_side_swept` / `none` | Stop hunt detected |

### 1.3.8 Volume Profile Features

| Feature | Calculation Logic | Output | Purpose |
|---------|-------------------|--------|---------|
| **POC (Point of Control)** | Price level with highest traded volume | Price level | Fair value / magnet |
| **VAH (Value Area High)** | Upper bound of 70% volume concentration | Price level | Upper acceptance |
| **VAL (Value Area Low)** | Lower bound of 70% volume concentration | Price level | Lower acceptance |
| **Single Prints** | Price levels with very low volume | Array of price levels | Fast-move zones |
| **Price vs Value** | Is price inside or outside value area? | `above_value` / `inside_value` / `below_value` | Mean reversion context |

### 1.3.9 Cross-Exchange Features

| Feature | Calculation Logic | Output | Purpose |
|---------|-------------------|--------|---------|
| **OI Distribution** | % of total OI on Binance vs Bybit | Ratio | Where is positioning concentrated? |
| **Funding Divergence** | Difference between Binance and Bybit funding | Spread value | Arbitrage / flow signal |
| **Flow Divergence** | CVD direction mismatch between exchanges | `aligned` / `binance_leading` / `bybit_leading` / `conflicting` | Which venue is driving? |
| **Price Premium** | Price difference between venues | Spread value | Stress indicator |

## 1.4 Feature Output Format

Each feature extraction cycle produces a **Feature Snapshot** per timeframe:

```
FeatureSnapshot {
  timestamp: number
  timeframe: string
  exchange: string
  
  price: {
    current: number
    trend: 'bullish' | 'bearish' | 'sideways'
    trendStrength: number (0-100)
    momentum: number (-100 to +100)
    volatility: 'low' | 'normal' | 'high' | 'extreme'
    positionInRange: number (0-100)
  }
  
  orderFlow: {
    volumeTrend: 'declining' | 'normal' | 'elevated' | 'spike'
    cvdDirection: 'accumulating' | 'distributing' | 'neutral'
    cvdDivergence: 'bullish_div' | 'bearish_div' | 'none'
    deltaImbalance: number (-1 to +1)
  }
  
  openInterest: {
    direction: 'building' | 'declining' | 'flat'
    changeMagnitude: 'normal' | 'significant' | 'extreme'
    priceRelationship: string (from matrix)
    divergence: 'bullish_div' | 'bearish_div' | 'none'
  }
  
  funding: {
    level: number
    regime: 'extreme_positive' | 'positive' | 'neutral' | 'negative' | 'extreme_negative'
    trend: 'rising' | 'falling' | 'stable'
    recentFlip: 'flipped_positive' | 'flipped_negative' | 'none'
  }
  
  liquidations: {
    recentVolume: number
    imbalance: number (-1 to +1)
    clustering: 'clustered' | 'scattered'
    spike: 'normal' | 'elevated' | 'cascade'
  }
  
  structure: {
    bias: 'bullish' | 'bearish' | 'range'
    recentBoS: 'bullish_bos' | 'bearish_bos' | 'none'
    lastSwingHigh: { price: number, timestamp: number, isWeak: boolean }
    lastSwingLow: { price: number, timestamp: number, isWeak: boolean }
  }
  
  liquidity: {
    nearestBuySide: { price: number, distance: number }
    nearestSellSide: { price: number, distance: number }
    recentSweep: 'buy_side_swept' | 'sell_side_swept' | 'none'
  }
  
  volumeProfile: {
    poc: number
    vah: number
    val: number
    singlePrints: number[]
    priceVsValue: 'above_value' | 'inside_value' | 'below_value'
  }
}
```

## 1.5 Feature Calculation Frequency

**Frequency depends on active Coinglass plan and available timeframes.**

### STARTUP Plan (30m minimum) - Current Active

| Timeframe | All Features | Structure Features | Cycle Time |
|-----------|--------------|-------------------|------------|
| 30m | Every cycle | Every 15 min | 5 min |
| 1h | Every cycle | Every 30 min | 5 min |
| 4h | Every cycle | Every 1 hour | 5 min |
| 1d | Every cycle | Every 4 hours | 15 min |

### STANDARD Plan (5m minimum) - Future

| Timeframe | All Features | Structure Features | Cycle Time |
|-----------|--------------|-------------------|------------|
| 5m | Every cycle | Every 5 min | 1 min |
| 15m | Every cycle | Every 5 min | 1 min |
| 30m | Every cycle | Every 15 min | 5 min |
| 1h+ | Same as STARTUP | Same as STARTUP | 5 min |

### PROFESSIONAL Plan (1m minimum) - Future

| Timeframe | All Features | Structure Features | Cycle Time |
|-----------|--------------|-------------------|------------|
| 1m | Every cycle | Every 1 min | 30 sec |
| 5m | Every cycle | Every 2 min | 1 min |
| 15m | Every cycle | Every 5 min | 1 min |
| 30m+ | Same as STARTUP | Same as STARTUP | 5 min |

### Configuration-Driven Frequency

```
function getCalculationSchedule(activePlan) {
  const baseSchedule = {
    '1m':  { featureCycle: 30_000,  structureCycle: 60_000 },    // 30s / 1min
    '5m':  { featureCycle: 60_000,  structureCycle: 120_000 },   // 1min / 2min
    '15m': { featureCycle: 60_000,  structureCycle: 300_000 },   // 1min / 5min
    '30m': { featureCycle: 300_000, structureCycle: 900_000 },   // 5min / 15min
    '1h':  { featureCycle: 300_000, structureCycle: 1_800_000 }, // 5min / 30min
    '4h':  { featureCycle: 300_000, structureCycle: 3_600_000 }, // 5min / 1hr
    '1d':  { featureCycle: 900_000, structureCycle: 14_400_000 } // 15min / 4hr
  }
  
  // Filter to only available timeframes
  return Object.fromEntries(
    Object.entries(baseSchedule)
      .filter(([tf]) => activePlan.availableTimeframes.includes(tf))
  )
}
```

---

# Layer 2: Single-Timeframe Analysis Logic

## 2.1 Purpose

Take the Feature Snapshot for one timeframe and produce a **Timeframe Context** – a semantic interpretation of what's happening on that timeframe.

## 2.2 Input

One `FeatureSnapshot` (from Layer 1)

## 2.3 Output

```
TimeframeContext {
  timestamp: number
  timeframe: string
  
  bias: 'bullish' | 'bearish' | 'neutral'
  biasConfidence: number (0-100)
  
  context: string[] // Array of context tags
  
  keyLevels: {
    resistance: number[]
    support: number[]
    liquidityAbove: number[]
    liquidityBelow: number[]
    poc: number
    vah: number
    val: number
  }
  
  activeSignals: Signal[]
  
  narrative: string // Short text description
}

Signal {
  type: string
  direction: 'bullish' | 'bearish' | 'neutral'
  strength: 'weak' | 'moderate' | 'strong'
  description: string
}
```

## 2.4 Bias Determination Logic

The bias is determined through a **weighted signal scoring system**:

### 2.4.1 Signal Definitions

| Signal ID | Condition | Direction | Base Weight |
|-----------|-----------|-----------|-------------|
| `TREND_ALIGNED` | price.trend matches direction | Per trend | 20 |
| `MOMENTUM_STRONG` | abs(momentum) > 50 | Per momentum sign | 15 |
| `CVD_CONFIRMING` | cvdDirection aligns with price trend | Per CVD | 15 |
| `CVD_DIVERGENCE` | cvdDivergence detected | Opposite to price | 20 |
| `OI_BUILDING_WITH_TREND` | OI building + price trending | Per trend | 15 |
| `OI_DIVERGENCE` | OI divergence detected | Opposite to price | 15 |
| `FUNDING_EXTREME` | funding regime is extreme | Opposite to extreme | 10 |
| `FUNDING_FLIP` | recent funding flip | Per flip direction | 10 |
| `LIQUIDATION_CASCADE` | liq spike = cascade | Opposite to liquidated side | 20 |
| `STRUCTURE_BOS` | recent break of structure | Per BoS direction | 25 |
| `LIQUIDITY_SWEEP` | recent liquidity sweep | Opposite to sweep (reversal) | 20 |
| `PRICE_AT_VALUE` | price inside value area | Neutral (reduces confidence) | -10 |
| `PRICE_ABOVE_VALUE` | price above VAH | Bullish | 10 |
| `PRICE_BELOW_VALUE` | price below VAL | Bearish | 10 |
| `WEAK_HIGH_ABOVE` | weak high nearby above | Bullish (target) | 5 |
| `WEAK_LOW_BELOW` | weak low nearby below | Bearish (target) | 5 |

### 2.4.2 Scoring Algorithm

```
1. Initialize:
   - bullishScore = 0
   - bearishScore = 0
   - activeSignals = []

2. For each signal:
   - Check if condition is met
   - If met:
     - Add to appropriate score (bullish or bearish)
     - Record in activeSignals with strength
   
3. Calculate bias:
   - netScore = bullishScore - bearishScore
   - If netScore > 20: bias = 'bullish'
   - If netScore < -20: bias = 'bearish'
   - Else: bias = 'neutral'

4. Calculate confidence:
   - maxPossibleScore = sum of all weights
   - confidence = (abs(netScore) / maxPossibleScore) * 100
   - Apply confidence modifiers:
     - If volatility = 'extreme': confidence * 0.8
     - If conflicting signals > 3: confidence * 0.7
     - If volume = 'declining': confidence * 0.9
```

### 2.4.3 Signal Strength Classification

| Net Contribution | Strength |
|------------------|----------|
| < 10 | `weak` |
| 10-20 | `moderate` |
| > 20 | `strong` |

## 2.5 Context Tags Logic

Context tags describe *what type of market environment* this timeframe is showing.

### 2.5.1 Tag Definitions

| Tag | Conditions |
|-----|------------|
| `trending_bullish` | trend = bullish AND trendStrength > 50 |
| `trending_bearish` | trend = bearish AND trendStrength > 50 |
| `range_bound` | trend = sideways OR trendStrength < 30 |
| `high_volatility` | volatility = 'high' OR 'extreme' |
| `low_volatility` | volatility = 'low' |
| `accumulation` | OI building + price flat/slightly up + CVD positive |
| `distribution` | OI building + price flat/slightly down + CVD negative |
| `short_squeeze_risk` | funding extreme_negative + OI high + price rising |
| `long_squeeze_risk` | funding extreme_positive + OI high + price falling |
| `breakout_brewing` | range_bound + OI building + volatility low |
| `trend_exhaustion` | trending + OI declining + CVD divergence |
| `liquidity_hunt` | recent liquidity sweep detected |
| `cascade_event` | liquidation spike = cascade |
| `funding_reset` | recent funding flip |
| `new_positions_entering` | OI building significantly |
| `positions_closing` | OI declining significantly |

### 2.5.2 Tag Selection Logic

```
1. Evaluate all tag conditions against FeatureSnapshot
2. Add all matching tags to context array
3. Prioritize tags (some are mutually exclusive):
   - trending_* excludes range_bound
   - accumulation excludes distribution
4. Limit to top 5 most relevant tags if more than 5 match
```

## 2.6 Key Levels Extraction

```
keyLevels = {
  resistance: [
    structure.lastSwingHigh.price,
    volumeProfile.vah,
    // Any recent swing highs within 5% of current price
  ],
  
  support: [
    structure.lastSwingLow.price,
    volumeProfile.val,
    // Any recent swing lows within 5% of current price
  ],
  
  liquidityAbove: [
    liquidity.nearestBuySide.price,
    // Cluster of equal highs if detected
  ],
  
  liquidityBelow: [
    liquidity.nearestSellSide.price,
    // Cluster of equal lows if detected
  ],
  
  poc: volumeProfile.poc,
  vah: volumeProfile.vah,
  val: volumeProfile.val
}
```

## 2.7 Narrative Generation (Rule-Based)

The narrative is constructed from templates based on bias + top context tags:

### Template Examples:

**Bullish + trending_bullish + new_positions_entering:**
> "Strong bullish trend with new long positions entering. OI is building as price advances, suggesting genuine buying interest."

**Bearish + distribution + trend_exhaustion:**
> "Bearish bias with signs of distribution. Despite recent price action, OI divergence and negative CVD suggest weakening momentum."

**Neutral + range_bound + breakout_brewing:**
> "Market is range-bound but positioning is building. Watch for breakout as OI accumulates in tight range."

**Bullish + liquidity_hunt + funding_reset:**
> "Bullish after liquidity sweep below recent lows. Funding has reset, reducing short-term squeeze risk."

---

# Layer 3: Multi-Timeframe Aggregation Logic

## 3.1 Purpose

Combine all TimeframeContext objects into a **single coherent Global Market Context** that represents the overall state of BTC.

## 3.2 Input

Array of `TimeframeContext` objects for all analyzed timeframes:
- 1m, 5m, 15m (scalping layer)
- 30m, 1h (intraday layer)
- 4h, 1d (macro layer)

## 3.3 Output

```
GlobalMarketContext {
  timestamp: number
  
  globalBias: 'bullish' | 'bearish' | 'neutral'
  globalConfidence: number (0-100)
  
  timeframeAlignment: 'aligned' | 'mostly_aligned' | 'mixed' | 'conflicting'
  
  dominantScenario: string // Main narrative
  alternativeScenario: string // What to watch for
  
  keyLevels: {
    majorResistance: number[]
    majorSupport: number[]
    criticalLiquidity: number[]
    poc: number
  }
  
  globalContextTags: string[]
  
  perTimeframe: {
    [timeframe]: {
      bias: string
      confidence: number
      topTags: string[]
    }
  }
  
  suggestedStance: string // Non-directive suggestion
}
```

## 3.4 Timeframe Weighting

**Weights are dynamically loaded from Layer 0 configuration based on active Coinglass plan.**

### Current Active: STARTUP Plan (TWO_LAYER preset)

| Layer | Timeframes | Weight | Rationale |
|-------|------------|--------|-----------|
| Macro | 4h, 1d | 50% | Sets the overall direction |
| Intraday | 30m, 1h | 50% | Current market dynamics |

Within each layer:
- **Macro**: 4h = 30%, 1d = 20%
- **Intraday**: 1h = 25%, 30m = 25%

### Future: PROFESSIONAL Plan (THREE_LAYER preset)

| Layer | Timeframes | Weight | Rationale |
|-------|------------|--------|-----------|
| Macro | 4h, 1d | 40% | Sets the overall direction |
| Intraday | 30m, 1h | 35% | Current market dynamics |
| Scalping | 1m, 5m, 15m | 25% | Timing and immediate action |

Within each layer:
- **Macro**: 4h = 25%, 1d = 15%
- **Intraday**: 1h = 20%, 30m = 15%
- **Scalping**: 15m = 12%, 5m = 8%, 1m = 5%

### Dynamic Weight Loading

```
function getTimeframeWeights() {
  // Load from Layer 0 configuration
  const activePlan = COINGLASS_PLANS[COINGLASS_ACTIVE_PLAN]
  const weightPreset = getActiveWeights(activePlan)
  
  return weightPreset.timeframes
}

function getLayerWeights() {
  const activePlan = COINGLASS_PLANS[COINGLASS_ACTIVE_PLAN]
  const weightPreset = getActiveWeights(activePlan)
  
  return weightPreset.layers
}
```

## 3.5 Global Bias Calculation

### 3.5.1 Weighted Score Aggregation

```
1. For each timeframe:
   - Convert bias to score:
     - bullish = +1
     - neutral = 0
     - bearish = -1
   - Weight by confidence: biasScore * (confidence / 100)
   - Weight by timeframe importance: weightedScore * timeframeWeight

2. Sum all weighted scores

3. Determine global bias:
   - If totalScore > 0.25: globalBias = 'bullish'
   - If totalScore < -0.25: globalBias = 'bearish'
   - Else: globalBias = 'neutral'

4. Calculate global confidence:
   - Average of all (confidence * timeframeWeight)
   - Apply alignment modifier (see below)
```

### 3.5.2 Alignment Detection

```
function calculateAlignment(timeframeContexts) {
  // Get only enabled timeframes from config
  const enabledTimeframes = getEnabledTimeframes()
  const contexts = timeframeContexts.filter(ctx => 
    enabledTimeframes.includes(ctx.timeframe)
  )
  
  const totalCount = contexts.length
  
  // Count biases
  const bullishCount = contexts.filter(c => c.bias === 'bullish').length
  const bearishCount = contexts.filter(c => c.bias === 'bearish').length
  const neutralCount = contexts.filter(c => c.bias === 'neutral').length
  
  // Calculate alignment
  const maxBiasCount = Math.max(bullishCount, bearishCount, neutralCount)
  const alignmentRatio = maxBiasCount / totalCount
  
  let alignment
  if (alignmentRatio >= 0.80) {
    alignment = 'aligned'
  } else if (alignmentRatio >= 0.60) {
    alignment = 'mostly_aligned'
  } else if (alignmentRatio >= 0.40) {
    alignment = 'mixed'
  } else {
    alignment = 'conflicting'
  }
  
  // Apply confidence modifier
  const confidenceModifiers = {
    aligned: 1.0,
    mostly_aligned: 0.9,
    mixed: 0.7,
    conflicting: 0.5
  }
  
  return {
    alignment,
    confidenceModifier: confidenceModifiers[alignment],
    distribution: { bullishCount, bearishCount, neutralCount, totalCount }
  }
}
```

**Note:** With STARTUP plan (4 timeframes), alignment thresholds work as:
- `aligned`: 4/4 or 3/4 same direction (≥75%)
- `mostly_aligned`: 3/4 same direction (75%)
- `mixed`: 2/4 same direction (50%)
- `conflicting`: All different or 2-1-1 split

## 3.6 Scenario Generation

### 3.6.1 Dominant Scenario Logic

The dominant scenario is built from:
1. Global bias direction
2. Macro layer context tags
3. Key pattern detected

**Scenario Templates:**

| Condition | Dominant Scenario |
|-----------|-------------------|
| Global bullish + aligned + macro trending_bullish | "Strong bullish environment across all timeframes. Macro trend is intact with intraday confirmation." |
| Global bullish + mixed + macro bullish but intraday bearish | "Macro bullish trend with short-term pullback in progress. Higher timeframes support looking for long entries on weakness." |
| Global bearish + aligned + cascade_event | "Bearish across all timeframes with liquidation cascade. High probability of continued downside." |
| Global neutral + conflicting + breakout_brewing | "Conflicting signals across timeframes. Market is coiling for a move. Wait for directional clarity." |
| Global bullish + liquidity_hunt on lower TF | "Bullish macro with recent liquidity grab on lower timeframes. Potential springboard for continuation." |

### 3.6.2 Alternative Scenario Logic

Always present what would *change* the view:

```
If globalBias = 'bullish':
  alternativeScenario = "Bias invalidates if: [lowest macro support] breaks, 
                        or macro timeframe shifts bearish, 
                        or funding reaches extreme positive with OI divergence."

If globalBias = 'bearish':
  alternativeScenario = "Bias invalidates if: [highest macro resistance] breaks,
                        or macro timeframe shifts bullish,
                        or short squeeze triggers (funding extreme negative + price reclaim)."

If globalBias = 'neutral':
  alternativeScenario = "Watch for: breakout above [resistance] for bullish confirmation,
                        or breakdown below [support] for bearish confirmation."
```

## 3.7 Key Levels Consolidation

```
majorResistance = deduplicate and rank by importance:
  1. 1d swing high (if within 10% of price)
  2. 4h swing high
  3. 1d VAH
  4. Confluence zones (multiple TF levels within 0.5%)

majorSupport = deduplicate and rank by importance:
  1. 1d swing low (if within 10% of price)
  2. 4h swing low
  3. 1d VAL
  4. Confluence zones

criticalLiquidity = most significant liquidity pools:
  - Highest timeframe liquidity levels
  - Largest clusters
  
poc = 4h or 1d POC (prefer 4h for relevance)
```

## 3.8 Global Context Tags

Aggregate tags from all timeframes with weighting:

```
1. Collect all tags from all timeframes
2. Score each tag:
   - Base score = count of occurrences
   - Weighted score = sum of (timeframe weight) for each occurrence
3. Select top 5 tags by weighted score
4. Add special global tags:
   - 'multi_tf_aligned' if alignment = aligned
   - 'multi_tf_conflicting' if alignment = conflicting
   - 'macro_bullish' or 'macro_bearish' based on 4h+1d consensus
```

## 3.9 Suggested Stance Logic

**Non-directive language is critical here.**

| Condition | Suggested Stance |
|-----------|------------------|
| bullish + aligned + confidence > 70 | "Environment favors looking for long opportunities on pullbacks to support." |
| bullish + mixed + confidence 50-70 | "Cautiously bullish. Consider waiting for intraday alignment before new positions." |
| bearish + aligned + confidence > 70 | "Environment favors looking for short opportunities on bounces to resistance." |
| bearish + mixed + confidence 50-70 | "Cautiously bearish. Short-term bounces possible; look for weakness confirmation." |
| neutral + any alignment | "Environment is unclear. Consider reducing position size or waiting for directional clarity." |
| Any + confidence < 50 | "Low confidence environment. Sitting out or minimal exposure may be prudent." |
| Any + extreme volatility | "High volatility environment. If trading, consider tighter risk management." |

---

# Layer 4: Market State Object Logic

## 4.1 Purpose

Package the GlobalMarketContext into the **final Market State Object** – the contract between the Analyzer and all consumers (UI, Alerts, AI Coach).

## 4.2 Final Market State Object Structure

```
MarketStateObject {
  // === METADATA ===
  metadata: {
    symbol: 'BTC'
    venues: ['Binance-USDT', 'Bybit-CoinM']
    timestamp: number
    analysisVersion: string
    timeframesCovered: string[]
    dataQuality: 'full' | 'partial' | 'degraded'
  }
  
  // === GLOBAL BIAS ===
  globalBias: {
    direction: 'bullish' | 'bearish' | 'neutral'
    confidence: number (0-100)
    strength: 'weak' | 'moderate' | 'strong' | 'very_strong'
    stance: string // Non-directive suggestion
  }
  
  // === CONTEXT SUMMARY ===
  context: {
    timeframeAlignment: 'aligned' | 'mostly_aligned' | 'mixed' | 'conflicting'
    tags: string[] // Top 5 context tags
    dominantScenario: string
    alternativeScenario: string
  }
  
  // === KEY LEVELS & ZONES ===
  levels: {
    majorResistance: Level[]
    majorSupport: Level[]
    liquidityZones: LiquidityZone[]
    volumeProfile: {
      poc: number
      vah: number
      val: number
    }
  }
  
  // === RECENT EVENTS ===
  recentEvents: Event[]
  
  // === VENUE COMPARISON ===
  venueInsights: {
    oiDistribution: { binance: number, bybit: number }
    fundingSpread: number
    flowDivergence: 'aligned' | 'binance_leading' | 'bybit_leading' | 'conflicting'
    dominantVenue: 'binance' | 'bybit' | 'balanced'
    insight: string
  }
  
  // === PER-TIMEFRAME BREAKDOWN ===
  timeframes: {
    [tf]: {
      bias: 'bullish' | 'bearish' | 'neutral'
      confidence: number
      topSignals: string[]
      keyLevel: number // Most important level for this TF
    }
  }
  
  // === RAW METRICS (for advanced users / debugging) ===
  raw: {
    price: number
    change24h: number
    oiTotal: number
    oiChange24h: number
    fundingBinance: number
    fundingBybit: number
    cvd24h: number
    liquidations24h: { long: number, short: number }
  }
}

Level {
  price: number
  type: 'swing' | 'volume_profile' | 'liquidity' | 'confluence'
  timeframe: string
  significance: 'minor' | 'moderate' | 'major'
}

LiquidityZone {
  price: number
  side: 'buy_side' | 'sell_side'
  estimatedSize: 'small' | 'medium' | 'large'
  distance: number // % from current price
}

Event {
  timestamp: number
  type: string
  description: string
  significance: 'low' | 'medium' | 'high'
}
```

## 4.3 Strength Classification

| Confidence Range | Strength Label |
|------------------|----------------|
| 0-30 | `weak` |
| 31-55 | `moderate` |
| 56-75 | `strong` |
| 76-100 | `very_strong` |

## 4.4 Event Tracking

Track events that occurred since last analysis cycle:

| Event Type | Trigger | Significance |
|------------|---------|--------------|
| `structure_break` | BoS detected on any TF | High if 4h/1d, Medium if 1h, Low if lower |
| `liquidity_sweep` | Liquidity sweep detected | Medium-High |
| `funding_flip` | Funding crossed zero | Medium |
| `funding_extreme` | Funding entered extreme zone | Medium |
| `liquidation_spike` | Liquidations > 3x average | High if cascade, Medium otherwise |
| `oi_surge` | OI change > 2 std dev | Medium |
| `volatility_spike` | ATR spike > 2x average | Medium |
| `divergence_formed` | New CVD or OI divergence | Medium |
| `exchange_divergence` | Venues showing conflicting signals | Medium |

## 4.5 Data Quality Assessment

```
dataQuality determination:
- 'full': All data sources responding, all timeframes available
- 'partial': Some data missing (e.g., liquidations unavailable, one TF stale)
- 'degraded': Critical data missing or significantly stale (>15 min)
```

---

# Layer 5: AI Reasoning Layer Logic (EXPLANATION ONLY)

## 5.1 Purpose

**CRITICAL: The LLM does NOT make trading decisions.**

The LLM's role is to:
1. **Explain** the Rules Engine output in human-readable language
2. **Highlight** what to watch that could change the bias
3. **Provide** coaching insights based on the current regime
4. **Surface** potential risks the trader should be aware of

The LLM **NEVER**:
- Changes the bias from the Rules Engine
- Overrides tradeStance
- Generates buy/sell signals
- Makes predictions beyond what the rules support

## 5.2 Why LLM Cannot Be Source of Truth

| Problem | Impact on Trading |
|---------|-------------------|
| **Not backtestable** | Can't validate edge over historical data |
| **Non-deterministic** | Same input → different outputs |
| **Model drift** | OpenAI/Anthropic update models without notice |
| **Prompt sensitivity** | Slight wording changes → different results |
| **No version control** | Can't reproduce past decisions |

**Bottom line:** You can't put money behind something you can't test.

## 5.3 LLM Input Structure

The LLM receives a **read-only** MarketStateObject:

```
LLMInput {
  // From Rules Engine (READ ONLY - DO NOT MODIFY)
  decision: {
    bias: "LONG" | "SHORT" | "WAIT"
    tradeStance: "LOOK_FOR_LONGS" | "LOOK_FOR_SHORTS" | "AVOID_TRADING"
    confidence: 0-10
    primaryRegime: string
    riskMode: "NORMAL" | "DEFENSIVE" | "AGGRESSIVE"
  }
  
  // Context for explanation
  regime: {
    state: string
    subType: string
    characteristics: string[]
  }
  
  exchange: {
    scenario: string
    bybit: { oi_change, cvd, funding }
    binance: { oi_change, cvd, funding }
  }
  
  // Raw metrics for reference
  metrics: {
    price: number
    price_change_4h: number
    oi_change_4h: number
    funding: number
    cvd: number
  }
}
```

## 5.4 LLM System Prompt

```markdown
# INVSIO Market Analyzer - Explanation Layer

You are an expert market analyst explaining the output of INVSIO's Rules Engine.

## YOUR ROLE
- Explain WHY the system reached its conclusion
- Highlight what conditions would CHANGE the current bias
- Provide actionable context for the trader
- Surface potential risks

## YOU MUST NEVER
- Change or override the bias/tradeStance from the Rules Engine
- Say "buy" or "sell" as directives
- Make predictions beyond what the data supports
- Suggest the Rules Engine is wrong

## GOLDEN RULES (for context)
1. Bybit COIN-M = smart money / whales
2. Binance USDT = retail + some institutional
3. When they diverge, trust Bybit
4. Price + OI + CVD = intention
5. Funding = crowding indicator

## OUTPUT FORMAT
Provide:
1. **Executive Summary** (2-3 sentences)
2. **Key Observations** (3-5 bullets)
3. **What Would Change This** (conditions that flip the bias)
4. **Risk Considerations** (1-2 bullets)

Keep language educational, not directive.
Use "environment favors" not "you should".
```

## 5.5 LLM Output Structure

```
LLMOutput {
  executiveSummary: string  // 2-3 sentences max
  
  keyObservations: string[]  // 3-5 bullets
  
  whatWouldChange: {
    toFlipBullish: string[]   // If currently bearish/neutral
    toFlipBearish: string[]   // If currently bullish/neutral
    toReduceConfidence: string[]
  }
  
  riskConsiderations: string[]  // 1-2 bullets
  
  // Optional coaching
  traderTip: string | null  // One actionable tip based on regime
}
```

## 5.6 Example LLM Response

**Input:**
```json
{
  "decision": {
    "bias": "SHORT",
    "tradeStance": "LOOK_FOR_SHORTS",
    "confidence": 8,
    "primaryRegime": "distribution",
    "riskMode": "NORMAL"
  },
  "exchange": {
    "scenario": "whale_distribution",
    "bybit": { "oi_change": -1.2, "cvd": -450000000 },
    "binance": { "oi_change": 3.4, "cvd": 120000000 }
  }
}
```

**Output:**
```json
{
  "executiveSummary": "The market is in a Distribution phase. Smart money (Bybit) is actively reducing exposure while retail (Binance) continues to buy. This divergence historically precedes significant downside moves.",
  
  "keyObservations": [
    "Bybit COIN-M OI down 1.2% while Binance USDT OI up 3.4% - classic distribution",
    "CVD divergence: Bybit selling (-$450M), Binance buying (+$120M)",
    "Whales appear to be exiting into retail demand",
    "Funding elevated suggests crowded long positioning"
  ],
  
  "whatWouldChange": {
    "toFlipBullish": [
      "Bybit OI starts rising with positive CVD",
      "Binance OI drops (retail capitulation) while price holds"
    ],
    "toReduceConfidence": [
      "Price breaks above recent high with Bybit confirmation",
      "Funding normalizes without price drop"
    ]
  },
  
  "riskConsiderations": [
    "Distribution can last longer than expected - don't front-run",
    "Watch for short squeeze if funding goes extremely negative"
  ],
  
  "traderTip": "In distribution phases, wait for bounces to resistance rather than chasing breakdowns."
}
```

## 5.7 When to Invoke LLM

| Trigger | Frequency | Purpose |
|---------|-----------|---------|
| Regular update | Every 15-30 min | Fresh explanation |
| Regime change | On event | Explain what changed |
| User request | On demand | Detailed breakdown |

**NOT on every tick** - LLM calls are expensive and slow.

## 5.8 Fallback Behavior

If LLM fails or times out:

```javascript
function getLLMExplanation(marketState) {
  try {
    const response = await callLLM(marketState);
    return response;
  } catch (error) {
    // Fallback to rule-based templates
    return generateTemplateExplanation(marketState);
  }
}

function generateTemplateExplanation(state) {
  const templates = {
    distribution: "Market in distribution phase. Smart money reducing exposure while retail buying.",
    accumulation: "Market in accumulation phase. Smart money loading while retail absent.",
    trap: `${state.regime.subType} detected. Exercise caution.`,
    // ... etc
  };
  
  return {
    executiveSummary: templates[state.regime.state] || "Mixed signals. Wait for clarity.",
    keyObservations: state.regime.characteristics,
    llmAvailable: false
  };
}
```

## 5.9 LLM Integration Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Rules Engine (calculateMarketMetrics)                      │
│  - Deterministic                                            │
│  - Backtestable                                             │
│  - Source of truth                                          │
└─────────────────────────────────────────────────────────────┘
                              ↓
                    MarketStateObject
                              ↓
        ┌─────────────────────┴─────────────────────┐
        ↓                                           ↓
┌───────────────────┐                    ┌───────────────────┐
│  API Response     │                    │  LLM Layer        │
│  (immediate)      │                    │  (async, optional)│
│                   │                    │                   │
│  bias: "SHORT"    │                    │  "The market is   │
│  stance: "LOOK.." │                    │   in distribution │
│  confidence: 8    │                    │   phase because..."│
└───────────────────┘                    └───────────────────┘
```

The API returns the Rules Engine output immediately.
LLM explanation can be:
- Fetched separately via `/api/explain` endpoint
- Included in response if pre-cached
- Skipped entirely for programmatic consumers

---

# Layer 6: Alert System Logic

## 6.1 Purpose

Detect **meaningful market events** worthy of notifying the user, without spamming on every tick.

## 6.2 Alert Categories

| Category | Description | Default Priority |
|----------|-------------|------------------|
| `BIAS_SHIFT` | Global bias changed direction | High |
| `CONFIDENCE_SPIKE` | Confidence jumped significantly | Medium |
| `STRUCTURE_BREAK` | Major BoS on 4h or 1d | High |
| `LIQUIDITY_EVENT` | Significant liquidity sweep | Medium |
| `LIQUIDATION_CASCADE` | Major liquidation event | High |
| `FUNDING_EXTREME` | Funding reached extreme | Medium |
| `CONFLUENCE_ALERT` | Multiple signals aligned | High |
| `LEVEL_APPROACH` | Price nearing key level | Low |
| `DIVERGENCE_ALERT` | Significant divergence formed | Medium |

## 6.3 Alert Triggering Logic

### 6.3.1 BIAS_SHIFT

```
Trigger when:
  - previousState.globalBias.direction != currentState.globalBias.direction
  - AND change is not oscillation (check last 3 states)

Priority:
  - High if from bullish<->bearish
  - Medium if involving neutral

Cooldown: 30 minutes (don't alert on rapid flips)
```

### 6.3.2 CONFIDENCE_SPIKE

```
Trigger when:
  - abs(currentConfidence - previousConfidence) > 20
  - AND currentConfidence > 70 (spike to high confidence)

Priority:
  - High if confidence now > 80
  - Medium if confidence now 70-80

Cooldown: 1 hour
```

### 6.3.3 STRUCTURE_BREAK

```
Trigger when:
  - BoS detected on 4h or 1d timeframe
  - AND break is against previous bias (e.g., bullish BoS in bearish market)

Priority:
  - High for 1d breaks
  - Medium for 4h breaks

Cooldown: 4 hours for same direction
```

### 6.3.4 LIQUIDITY_EVENT

```
Trigger when:
  - liquidity.recentSweep != 'none' on 1h+ timeframe
  - AND sweep resulted in reversal (price moved 0.5%+ from sweep level)

Priority:
  - High if 4h+ liquidity sweep
  - Medium if 1h liquidity sweep

Cooldown: 2 hours
```

### 6.3.5 LIQUIDATION_CASCADE

```
Trigger when:
  - liquidations.spike = 'cascade'
  - AND liquidations volume > 2x daily average in short window

Priority: High

Cooldown: 1 hour
```

### 6.3.6 FUNDING_EXTREME

```
Trigger when:
  - funding.regime enters 'extreme_positive' or 'extreme_negative'
  - OR funding.regime exits extreme (normalization)

Priority:
  - Medium for entering extreme
  - Low for exiting extreme

Cooldown: 4 hours
```

### 6.3.7 CONFLUENCE_ALERT

```
Trigger when:
  - 3+ high-weight signals align in same direction
  - AND confidence > 75
  - AND timeframe alignment = 'aligned' or 'mostly_aligned'

Priority: High

Cooldown: 2 hours
```

### 6.3.8 LEVEL_APPROACH

```
Trigger when:
  - Price within 0.5% of major resistance or support
  - AND level is from 4h+ timeframe

Priority: Low

Cooldown: 30 minutes per level
```

## 6.4 Alert Object Structure

```
Alert {
  id: string (unique)
  timestamp: number
  category: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  
  title: string // Short headline
  description: string // 1-2 sentence explanation
  
  context: {
    previousState: { bias, confidence }
    currentState: { bias, confidence }
    triggerEvent: string
  }
  
  actionableInsight: string // What this means for the user
  
  relatedLevels: number[]
  
  expiresAt: number // When this alert becomes stale
}
```

## 6.5 Alert Generation Flow

```
1. Compare currentState to previousState

2. Check each alert category trigger condition

3. For triggered alerts:
   a. Check cooldown (skip if in cooldown)
   b. Generate alert object
   c. Set cooldown for this category
   d. Add to alert queue

4. Rank alerts by priority

5. Apply user filters (if any):
   - User's minimum priority threshold
   - User's enabled categories

6. Emit filtered alerts
```

## 6.6 Anti-Spam Logic

```
Global rate limit: Max 5 alerts per hour per user

Oscillation detection:
- Track bias changes over last 6 cycles
- If bias oscillated 3+ times, suppress BIAS_SHIFT alerts
- Instead, generate single "choppy/uncertain market" alert

Redundancy prevention:
- Don't alert on same event twice
- Hash event signature and check against recent alerts
```

---

# Layer 7: Storage & History Logic

## 7.1 Purpose

Persist data for:
1. Historical analysis and improvement
2. AI Coach functionality
3. User dashboards and performance tracking
4. Audit trail

## 7.2 Data to Store

### 7.2.1 Market State History

| Field | Type | Retention | Purpose |
|-------|------|-----------|---------|
| Full MarketStateObject | JSON | 90 days | Complete history |
| Bias + Confidence only | Numeric | 1 year | Long-term charts |
| Key events | Structured | 1 year | Event analysis |

### 7.2.2 Alert History

| Field | Type | Retention | Purpose |
|-------|------|-----------|---------|
| All generated alerts | JSON | 90 days | Alert performance analysis |
| Alert + user action | Linked | 90 days | Click-through tracking |

### 7.2.3 User Trade Journal

| Field | Type | Retention | Purpose |
|-------|------|-----------|---------|
| Trade entry (plan) | JSON | Indefinite | Journal |
| Trade outcome | JSON | Indefinite | Performance |
| Market state at entry | Reference | Indefinite | Coach analysis |
| Market state at exit | Reference | Indefinite | Coach analysis |

## 7.3 Database Schema (Conceptual)

### market_states
```sql
market_states {
  id: uuid PRIMARY KEY
  timestamp: timestamp NOT NULL
  symbol: varchar(10) NOT NULL
  
  bias_direction: varchar(10)
  bias_confidence: smallint
  bias_strength: varchar(20)
  
  alignment: varchar(20)
  context_tags: jsonb
  
  key_levels: jsonb
  venue_insights: jsonb
  
  full_state: jsonb // Complete MarketStateObject
  
  created_at: timestamp DEFAULT NOW()
}

INDEX ON (symbol, timestamp DESC)
INDEX ON (bias_direction, timestamp)
```

### alerts
```sql
alerts {
  id: uuid PRIMARY KEY
  timestamp: timestamp NOT NULL
  
  category: varchar(30)
  priority: varchar(10)
  
  title: varchar(200)
  description: text
  
  context: jsonb
  
  market_state_id: uuid REFERENCES market_states(id)
  
  created_at: timestamp DEFAULT NOW()
}

INDEX ON (category, timestamp DESC)
INDEX ON (priority, timestamp DESC)
```

### user_trades
```sql
user_trades {
  id: uuid PRIMARY KEY
  user_id: uuid NOT NULL
  
  symbol: varchar(10)
  direction: varchar(10) // long, short
  
  entry_price: decimal
  stop_loss: decimal
  take_profit: decimal
  
  risk_percent: decimal
  position_size: decimal
  
  market_state_at_entry: uuid REFERENCES market_states(id)
  
  outcome: varchar(10) // win, loss, breakeven, open
  exit_price: decimal
  result_r: decimal // R multiple
  result_pnl: decimal // Actual P&L
  
  market_state_at_exit: uuid REFERENCES market_states(id)
  
  notes_entry: text
  notes_exit: text
  
  created_at: timestamp
  closed_at: timestamp
}

INDEX ON (user_id, created_at DESC)
INDEX ON (user_id, outcome)
```

## 7.4 Query Patterns Needed

### For UI / Dashboard:
- Get latest market state
- Get market state history (last N hours/days)
- Get bias distribution over time period
- Get alert history

### For AI Coach:
- Get user trades with their market states
- Get trades where user went against bias
- Get trades with outcome vs market bias correlation
- Get user risk patterns over time

### For Performance Analysis:
- Get alert accuracy (did market move in predicted direction?)
- Get bias accuracy (did predicted bias hold for next N periods?)
- Get confidence calibration (high confidence = higher accuracy?)

## 7.5 Data Aggregation Jobs

### Hourly:
- Compress 1-minute states to hourly summary
- Calculate hourly bias distribution
- Aggregate alert counts

### Daily:
- Generate daily summary record
- Calculate daily accuracy metrics
- Prune expired detailed records

### Weekly:
- Generate weekly performance report data
- AI Coach weekly analysis trigger

---

# Implementation Sequence

## Priority Order (Revised Based on Current State)

```
Current Reality:
✅ Exchange Hierarchy - DONE (Golden Rules in code)
✅ 9 Exchange Scenarios - DONE (analyzeExchangeDivergence)
✅ 7 Regimes - DONE (detectMarketRegime) 
✅ Weighted Decision - DONE (calculateWeightedDecision)

❌ Missing: long_squeeze, chop/range
❌ Missing: tradeStance, riskMode
❌ Missing: Multi-TF aggregation (1d data unused)
❌ Missing: Alerts
❌ Missing: LLM explanation layer
```

---

## Phase 0: Configuration Foundation (Day 1-2)
**Goal: Establish config-driven architecture**

1. Create configuration system:
   - [ ] Implement COINGLASS_PLANS definitions
   - [ ] Implement TIMEFRAME_LAYERS definitions
   - [ ] Implement WEIGHT_PRESETS
   - [ ] Implement EXCHANGE_CONFIG
   - [ ] Create `getEnabledLayers()` function
   - [ ] Create `getActiveWeights()` function
   - [ ] Create `getEnabledTimeframes()` function

2. Environment setup:
   - [ ] Add COINGLASS_ACTIVE_PLAN env variable
   - [ ] Add plan upgrade handling function
   - [ ] Add logging for active configuration

**Deliverable:** System that can dynamically adjust to any Coinglass plan

---

## Phase 1: Harden Rules Engine (Week 1) 🔴 CRITICAL
**Goal: Complete the regime detection and add trader-friendly outputs**

### 1.1 Add Missing Regimes

```javascript
// In detectMarketRegime() - ADD:

// LONG SQUEEZE - longs getting liquidated
else if (priceDown && oiFalling) {
  regime = "covering";
  subType = "long_squeeze";
  bias = "WAIT";
  confidence = 7;
  characteristics = [
    "Price down + OI down = longs closing/liquidating",
    "Panic selling, not new shorts",
    "Don't catch falling knife",
    "Wait for OI to stabilize before looking for entries"
  ];
}

// CHOP / RANGE - no edge
else if (priceFlat && oiFlat) {
  regime = "range";
  subType = "chop";
  bias = "WAIT";
  confidence = 3;
  characteristics = [
    "No directional conviction",
    "Price and OI both flat",
    "No edge - avoid trading",
    "Wait for breakout or regime change"
  ];
}
```

### 1.2 Add TradeStance

```javascript
// New function in marketMetrics.js

function deriveTradeStance(bias, regime, confidence) {
  // Low confidence = always avoid
  if (confidence < 5) {
    return "AVOID_TRADING";
  }
  
  // Dangerous regimes = avoid even with bias
  const avoidRegimes = ["range", "trap", "covering"];
  if (avoidRegimes.includes(regime.state)) {
    return "AVOID_TRADING";
  }
  
  // Clear directional bias
  if (bias === "LONG") return "LOOK_FOR_LONGS";
  if (bias === "SHORT") return "LOOK_FOR_SHORTS";
  
  return "AVOID_TRADING";
}
```

### 1.3 Add RiskMode

```javascript
// New function in marketMetrics.js

function deriveRiskMode(regime, confidence, exchangeScenario) {
  // Defensive: traps, covering, low confidence
  if (regime.state === "trap") return "DEFENSIVE";
  if (regime.state === "covering") return "DEFENSIVE";
  if (confidence < 6) return "DEFENSIVE";
  
  // Aggressive: high confidence + synchronized + healthy trend
  const healthyTrends = ["healthy_bull", "healthy_bear"];
  const syncScenarios = ["synchronized_bullish", "synchronized_bearish"];
  
  if (confidence >= 8 && 
      healthyTrends.includes(regime.subType) &&
      syncScenarios.includes(exchangeScenario)) {
    return "AGGRESSIVE";
  }
  
  return "NORMAL";
}
```

### 1.4 Update calculateMarketMetrics Output

```javascript
// Modify the return statement in calculateMarketMetrics()

return {
  timestamp: Date.now(),
  timeframe: "4h",
  
  // ENHANCED DECISION OUTPUT
  finalDecision: {
    ...decision,
    tradeStance: deriveTradeStance(decision.bias, regimeAnalysis, decision.confidence),
    primaryRegime: regimeAnalysis.state,
    riskMode: deriveRiskMode(regimeAnalysis, decision.confidence, exchangeAnalysis.scenario)
  },
  
  // Rest unchanged...
  exchangeDivergence: exchangeAnalysis,
  marketRegime: regimeAnalysis,
  technical: technicalMetrics,
  fundingAdvanced,
  oiAdvanced,
  raw: { ... }
};
```

### 1.5 Phase 1 Checklist

- [ ] Add `long_squeeze` regime detection
- [ ] Add `range/chop` regime detection
- [ ] Create `deriveTradeStance()` function
- [ ] Create `deriveRiskMode()` function
- [ ] Update `calculateMarketMetrics()` output structure
- [ ] Update API response format
- [ ] Test all 9+ regimes return correct tradeStance
- [ ] Test edge cases (low confidence, conflicting signals)

**Deliverable:** API returns `tradeStance`, `primaryRegime`, and `riskMode` on every call

---

## Phase 2: Basic Alerts (Week 2)
**Goal: Notify on meaningful market changes**

### 2.1 Alert Types (MVP)

| Alert | Trigger | Priority |
|-------|---------|----------|
| `BIAS_SHIFT` | bias changed (LONG→SHORT, etc.) | High |
| `REGIME_CHANGE` | regime.state changed | High |
| `CONFIDENCE_SPIKE` | confidence jumped >3 points | Medium |
| `TRAP_DETECTED` | regime = trap (long_trap / short_trap) | High |
| `SQUEEZE_ACTIVE` | regime = covering (short/long squeeze) | Medium |
| `FUNDING_EXTREME` | funding z-score > 2 or < -2 | Medium |

### 2.2 Alert Logic

```javascript
function checkAlerts(currentState, previousState) {
  const alerts = [];
  
  // BIAS_SHIFT
  if (currentState.finalDecision.bias !== previousState?.finalDecision?.bias) {
    alerts.push({
      type: "BIAS_SHIFT",
      priority: "high",
      message: `Bias changed from ${previousState?.finalDecision?.bias} to ${currentState.finalDecision.bias}`,
      data: {
        from: previousState?.finalDecision?.bias,
        to: currentState.finalDecision.bias
      }
    });
  }
  
  // REGIME_CHANGE
  if (currentState.marketRegime.state !== previousState?.marketRegime?.state) {
    alerts.push({
      type: "REGIME_CHANGE",
      priority: "high",
      message: `Market regime changed to ${currentState.marketRegime.state}`,
      data: {
        from: previousState?.marketRegime?.state,
        to: currentState.marketRegime.state,
        subType: currentState.marketRegime.subType
      }
    });
  }
  
  // TRAP_DETECTED
  if (currentState.marketRegime.state === "trap") {
    alerts.push({
      type: "TRAP_DETECTED",
      priority: "high",
      message: `${currentState.marketRegime.subType} detected - exercise caution`,
      data: currentState.marketRegime
    });
  }
  
  // ... more alerts
  
  return alerts;
}
```

### 2.3 Phase 2 Checklist

- [ ] Create `checkAlerts()` function
- [ ] Store previous state for comparison
- [ ] Implement cooldown logic (no spam)
- [ ] Add alerts to API response
- [ ] Create `/api/alerts` endpoint for history
- [ ] Test alert generation for all scenarios

**Deliverable:** API returns relevant alerts with each analysis

---

## Phase 3: Multi-Timeframe Analysis (Week 3-4)
**Goal: Use all available timeframes (30m, 1h, 4h, 1d)**

### 3.1 Current Problem

```javascript
// In calculateMarketMetrics() - CURRENT:
const binance4h = snapshot.Binance?.["4h"] || {};
const binance1d = snapshot.Binance?.["1d"] || {};  // ← Fetched but NEVER USED!
```

### 3.2 Timeframe Analysis Structure

```javascript
// New: Analyze each timeframe independently
function analyzeTimeframe(data, tf) {
  return {
    timeframe: tf,
    bias: determineBias(data),
    confidence: calculateConfidence(data),
    regime: detectRegime(data),
    weight: TIMEFRAME_WEIGHTS[tf]
  };
}

// Aggregate all timeframes
function aggregateTimeframes(analyses) {
  let bullishScore = 0;
  let bearishScore = 0;
  
  for (const analysis of analyses) {
    const weight = analysis.weight;
    if (analysis.bias === "LONG") bullishScore += weight * (analysis.confidence / 10);
    if (analysis.bias === "SHORT") bearishScore += weight * (analysis.confidence / 10);
  }
  
  // Determine global bias
  const diff = bullishScore - bearishScore;
  let globalBias = "WAIT";
  if (diff > 0.2) globalBias = "LONG";
  if (diff < -0.2) globalBias = "SHORT";
  
  return {
    globalBias,
    globalConfidence: Math.abs(diff) * 10,
    alignment: calculateAlignment(analyses),
    perTimeframe: analyses
  };
}
```

### 3.3 Macro Anchoring Rule

**CRITICAL:** Lower timeframes can NEVER flip the macro bias.

```javascript
function applyMacroAnchoring(globalContext, macroAnalysis) {
  // If macro (4h+1d) says SHORT, lower TFs cannot flip to LONG
  // They can only:
  // 1. Confirm (increase confidence)
  // 2. Reduce confidence
  // 3. Recommend WAIT
  
  const macroBias = macroAnalysis.bias;
  
  if (globalContext.globalBias !== macroBias && macroBias !== "WAIT") {
    // Lower TFs disagree with macro
    return {
      ...globalContext,
      globalBias: macroBias,  // Macro wins
      globalConfidence: globalContext.globalConfidence * 0.7,  // But reduce confidence
      warning: "Lower timeframes show divergence from macro trend"
    };
  }
  
  return globalContext;
}
```

### 3.4 Phase 3 Checklist

- [ ] Refactor to analyze each TF independently
- [ ] Implement `analyzeTimeframe()` function
- [ ] Implement `aggregateTimeframes()` function
- [ ] Implement macro anchoring rule
- [ ] Update weights per TF (from Layer 0 config)
- [ ] Test alignment detection
- [ ] Test macro override scenarios
- [ ] Update API to show per-TF breakdown

**Deliverable:** Analysis uses all available timeframes with proper weighting

---

## Phase 4: LLM Explanation Layer (Week 5)
**Goal: Human-readable explanations (NOT decision making)**

### 4.1 Create THEORY_FOR_LLM.md

Condensed version of your trading theory (~500-1000 words):
- Golden Rules
- Regime definitions
- Exchange hierarchy
- Key patterns

### 4.2 Implement LLM Service

```javascript
// services/llmService.js

async function generateExplanation(marketState) {
  const prompt = buildPrompt(marketState);
  
  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      system: THEORY_FOR_LLM,
      messages: [{ role: "user", content: prompt }]
    });
    
    return parseExplanation(response);
  } catch (error) {
    return fallbackExplanation(marketState);
  }
}
```

### 4.3 Add Explanation Endpoint

```javascript
// routes/marketAnalyzer.js

// Separate endpoint - explanation is optional
router.get('/explain', async (req, res) => {
  const marketState = await getLatestMarketState();
  const explanation = await generateExplanation(marketState);
  res.json({ explanation });
});
```

### 4.4 Phase 4 Checklist

- [ ] Write THEORY_FOR_LLM.md (condensed)
- [ ] Create LLM service with proper prompting
- [ ] Implement fallback templates
- [ ] Add `/api/explain` endpoint
- [ ] Cache explanations (don't call LLM every request)
- [ ] Test explanation quality
- [ ] Ensure LLM never overrides bias

**Deliverable:** Optional LLM explanations that enhance but don't replace rules

---

## Phase 5: Polish & Production (Week 6+)

- [ ] Add database persistence for state history
- [ ] Add user trade journal correlation
- [ ] Performance optimization
- [ ] Rate limiting and caching
- [ ] Monitoring and logging
- [ ] Documentation

---

# Appendix A: Signal Weight Reference

| Signal | Weight | Notes |
|--------|--------|-------|
| EXCHANGE_DIVERGENCE | 40% | Core signal - Bybit vs Binance |
| MARKET_REGIME | 25% | Distribution/Accumulation/Trap |
| TECHNICAL | 15% | Trend + momentum |
| FUNDING | 12% | Crowding indicator |
| CVD | 8% | Aggressor flow confirmation |

---

# Appendix B: Regime Quick Reference

| Regime | SubType | Price | OI | CVD | Funding | Bias |
|--------|---------|-------|-----|-----|---------|------|
| distribution | whale_exit | flat/up | ↑ | ↓ (Bybit) | high | SHORT |
| accumulation | whale_entry | flat | ↑ | ↑ (Bybit) | negative | LONG |
| trap | long_trap | ↑ | ↑ | ↓ | high | SHORT |
| trap | short_trap | ↓ | ↑ | ↑ | negative | LONG |
| covering | short_squeeze | ↑ | ↓ | - | - | WAIT |
| covering | long_squeeze | ↓ | ↓ | - | - | WAIT |
| trending | healthy_bull | ↑ | ↑ | ↑ | normal | LONG |
| trending | healthy_bear | ↓ | ↑ | ↓ | - | SHORT |
| range | chop | flat | flat | mixed | - | WAIT |

---

# Appendix C: Confidence Calibration Targets

| Stated Confidence | Target Accuracy | Action |
|-------------------|-----------------|--------|
| 8-10 | 75%+ | Full position |
| 6-7 | 60%+ | Reduced position |
| 4-5 | 50%+ | Very small or avoid |
| 0-3 | N/A | Do not trade |

"Correct" = bias direction matched actual price movement over next 4h

---

# Appendix D: Plan Upgrade Quick Reference

## Current State: STARTUP Plan

```
Active Plan: STARTUP ($79/mo)
Min Interval: 30m
Available Timeframes: 30m, 1h, 4h, 1d
Enabled Layers: INTRADAY, MACRO
Weight Preset: TWO_LAYER
```

## What Changes on Upgrade

| Aspect | STARTUP | STANDARD | PROFESSIONAL |
|--------|---------|----------|--------------|
| Timeframes | 4 | 6 | 7 |
| Layers | 2 | 2.5 (partial scalping) | 3 |
| Min refresh | 5 min | 1 min | 30 sec |
| Rate limit | 80/min | 200/min | 500/min |
| Scalping bias | ❌ None | ⚠️ 5m-15m only | ✅ Full 1m-15m |

---

# Appendix E: Phase 2+ Features (NOT MVP)

These features are valuable but **not required for MVP**.

## Deferred Features

| Feature | Why Deferred | When to Add |
|---------|--------------|-------------|
| Volume Profile (POC/VAH/VAL) | Not in current code, significant work | After MTF |
| Structure Detection (Swing H/L) | Nice to have | After alerts |
| Liquidity Pools/Sweeps | Advanced | Phase 3 |
| Single Prints | Advanced | Phase 3 |
| Weak High/Low | Advanced | Phase 3 |
| AI Coach | Requires trade journal | Phase 4+ |
| Capitulation Detection | Edge case regime | After core working |

## Already Implemented (Don't Rebuild)

| Feature | Location |
|---------|----------|
| Exchange Hierarchy | Golden Rules in marketMetrics.js |
| 9 Exchange Scenarios | analyzeExchangeDivergence() |
| 7 Regimes | detectMarketRegime() |
| Weighted Decision | calculateWeightedDecision() |
| Funding Z-Score | analyzeFundingAdvanced() |
| OI Divergence | analyzeOiAdvanced() |

---

# Appendix F: API Response Contract

## After Phase 1 Completion

```json
{
  "timestamp": 1734000000000,
  "timeframe": "4h",
  
  "finalDecision": {
    "bias": "SHORT",
    "confidence": 8,
    "tradeStance": "LOOK_FOR_SHORTS",
    "primaryRegime": "distribution",
    "riskMode": "NORMAL",
    "reasoning": ["Whale distribution on Bybit", "Retail FOMO on Binance"]
  },
  
  "exchangeDivergence": {
    "scenario": "whale_distribution",
    "bybit": { "oi_change": -1.2, "cvd_billions": -0.45 },
    "binance": { "oi_change": 3.4, "cvd_billions": 0.12 }
  },
  
  "marketRegime": {
    "state": "distribution",
    "subType": "whale_exit"
  },
  
  "alerts": []
}
```

---

**End of Implementation Plan**

*This document should be used alongside MARKETANALYZER-INSTRUCTIONS.md*
