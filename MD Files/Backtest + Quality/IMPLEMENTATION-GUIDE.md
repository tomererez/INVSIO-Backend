# AI Market Analyzer — MASTER SPECIFICATION

> **The Brain + The Lab**  
> How the system thinks + How the system is validated  
> Version: 1.0 | December 12, 2025

---

## Document Structure

| Part | Focus | Source |
|------|-------|--------|
| **Part A** | Philosophy & Thinking | Signal discipline, hierarchy, gating |
| **Part B** | Implementation Rules | What's already built, what's enforced |
| **Part C** | Validation & Testing | Metrics, calibration, backtest |
| **Part D** | Execution Plan | Phased roadmap |

---

# PART A: THE BRAIN — How The System Thinks

## A.1 Non-Negotiable Principles

These are laws, not guidelines:

### Principle 1: Fewer Signals = More Trust
```
❌ Wrong: "The system is smart because it always has an opinion"
✅ Right: "The system is trusted because it speaks only when confident"
```

A system that signals constantly is noise, not intelligence. WAIT is a valid and valuable output.

### Principle 2: Confidence Must Be Calibrated
```
❌ Wrong: Confidence = "how strongly the code feels"
✅ Right: Confidence = probability that direction is correct
```

If confidence=8 signals are wrong 50% of the time, the number 8 is a lie.

### Principle 3: Hierarchy Before Calculation
```
❌ Wrong: Calculate everything, then average
✅ Right: Check permission first, then calculate
```

Lower timeframes cannot override higher timeframes. Period.

### Principle 4: One Change Per Iteration
```
❌ Wrong: "Let's improve OI, CVD, and funding together"
✅ Right: "Let's fix OI first, measure, then move to CVD"
```

Multiple simultaneous changes make improvement unmeasurable.

---

## A.2 The Three-Layer Decision Architecture

The Analyzer operates on three layers with strict hierarchy:

```
┌─────────────────────────────────────────────────────┐
│  MACRO (1d + 4h)                                    │
│  ═══════════════                                    │
│  Role: PERMISSION LAYER                             │
│  Question: "Is trading allowed in this direction?"  │
│  Output: Allowed bias direction + context           │
└─────────────────────────────────────────────────────┘
                        ↓
                   (if permitted)
                        ↓
┌─────────────────────────────────────────────────────┐
│  MICRO (4h + 1h)                                    │
│  ═══════════════                                    │
│  Role: SETUP VALIDATION LAYER                       │
│  Question: "Is there a valid setup right now?"      │
│  Output: Setup quality + entry zone                 │
└─────────────────────────────────────────────────────┘
                        ↓
                   (if setup valid)
                        ↓
┌─────────────────────────────────────────────────────┐
│  SCALPING (1h + 30m)                                │
│  ════════════════════                               │
│  Role: EXECUTION TRIGGER LAYER                      │
│  Question: "Is this the right moment to act?"       │
│  Output: Timing signal + urgency                    │
└─────────────────────────────────────────────────────┘
```

### Hierarchy Rules (Enforced)

| Rule | Description |
|------|-------------|
| **Macro Veto** | If MACRO is bearish with conf≥60%, MICRO cannot flip to bullish |
| **No Permission = No Signal** | If MACRO says WAIT, lower layers are ignored |
| **Alignment Bonus** | When all 3 layers agree, confidence increases |
| **Conflict Penalty** | When layers disagree, confidence decreases |

### What Each Layer Controls

| Layer | Timeframes | Lookback | Decision Horizon |
|-------|------------|----------|------------------|
| MACRO | 1d, 4h | Days to weeks | Position/Swing trades |
| MICRO | 4h, 1h | Hours to days | Day trades |
| SCALPING | 1h, 30m | Minutes to hours | Scalp entries |

---

## A.3 Signal Philosophy

### When To Speak vs When To Stay Silent

The system should output a directional bias ONLY when:

1. **Macro permits** — Higher TF context supports direction
2. **Setup exists** — Structure + OI + CVD align
3. **Confidence is real** — Based on conditions, not wishful thinking
4. **Data is reliable** — CVD, funding, OI all available and fresh

If ANY of these fail → Output = WAIT

### The WAIT Decision Tree

```
START
  │
  ├─ Is Macro confident (≥60%) in a direction?
  │   ├─ NO → WAIT (no permission)
  │   └─ YES → Continue
  │
  ├─ Does Micro align or at least not oppose?
  │   ├─ OPPOSES → WAIT (conflict)
  │   └─ ALIGNS/NEUTRAL → Continue
  │
  ├─ Is regime tradeable (not chop/unclear)?
  │   ├─ CHOP → WAIT (no edge)
  │   └─ TRADEABLE → Continue
  │
  ├─ Is confidence > threshold (typically 5)?
  │   ├─ NO → WAIT (too uncertain)
  │   └─ YES → OUTPUT BIAS
  │
  └─ OUTPUT: LONG or SHORT with confidence
```

### Signal Reduction Goals

| Metric | Current State | Target |
|--------|---------------|--------|
| % of time in WAIT | ~50% | 60-70% |
| Signals per day (4h TF) | ~3-4 | 1-2 |
| High-confidence (≥8) signals per week | Many | 2-5 |

**Philosophy:** A signal should feel like a gift, not an obligation.

---

## A.4 Gating Logic (Context Gates)

Instead of just weighting signals, we use **gates** that block bad inputs entirely.

### Gate 1: CVD Reliability Gate

```
IF cvdReliableForTf = false:
  - CVD weight = 0 (excluded from score)
  - CVD bias = WAIT
  - Warning added to output
```

**Conditions that trigger unreliable:**
- < 80% of expected candles received
- Resolution mismatch (h24 data on 30m TF)
- > 3 consecutive zero-volume candles

### Gate 2: Macro Anchoring Gate

```
IF macro.confidence ≥ 60% AND macro.bias != NEUTRAL:
  - Lower TFs cannot flip the final bias
  - They can only reduce confidence
  - Warning: "Macro anchored — lower TF opposing"
```

### Gate 3: Conflict Detection Gate

```
conflictRatio = min(longScore, shortScore) / max(longScore, shortScore)

IF conflictRatio > 0.7:
  - Apply penalty: confidence *= (1 - conflictRatio * 0.5)
  - High conflict = high uncertainty
```

**Example:**
- Long=8, Short=7 → ratio=0.875 → 44% confidence reduction
- Long=8, Short=2 → ratio=0.25 → 12% confidence reduction

### Gate 4: Regime Gate

```
IF regime = "chop" OR regime = "unclear":
  - tradeStance = AVOID_TRADING
  - Confidence capped at 4
```

### Gate 5: Data Staleness Gate

```
IF data_age > 2 × timeframe_interval:
  - Warning: "Stale data"
  - Confidence reduced by 20%

IF data_age > 4 × timeframe_interval:
  - Component excluded from decision
```

---

## A.5 Confidence Model

### Dual Confidence Output

The system outputs TWO confidence measures:

| Type | Meaning | Range |
|------|---------|-------|
| **directionConfidence** | How sure about LONG vs SHORT | 0-10 |
| **noTradeConfidence** | How sure trading is a bad idea | 0-10 |

**Interpretation Matrix:**

| Direction Conf | NoTrade Conf | Meaning |
|----------------|--------------|---------|
| High (7+) | Low (0-3) | Strong signal, trade with conviction |
| Medium (4-6) | Low (0-3) | Weak signal, smaller position |
| Low (0-3) | High (7+) | Clear WAIT, stay out |
| Low (0-3) | Low (0-3) | Uncertain, probably WAIT |
| Both medium | Both medium | Conflict, reduce size or wait |

### Confidence Scale Contract

All confidence scores use 0-10 scale:
- 0-2: Very low (essentially noise)
- 3-4: Low (weak signal)
- 5-6: Medium (tradeable with caution)
- 7-8: High (confident signal)
- 9-10: Very high (rare, strong conviction)

**Enforcement:** `confidenceScale: "0-10"` included in all outputs.

---

## A.6 Regime Detection Philosophy

### Regimes Are Predictive, Not Descriptive

A regime label should predict what happens NEXT, not just describe current state.

| Regime | What It Predicts | Expected Outcome |
|--------|------------------|------------------|
| distribution | Smart money exiting | Price drops coming |
| accumulation | Smart money entering | Price rises coming |
| long_trap | Longs about to get rekt | Sharp reversal down |
| short_trap | Shorts about to get rekt | Sharp reversal up |
| healthy_bull | Sustainable uptrend | Continuation up |
| healthy_bear | Sustainable downtrend | Continuation down |
| short_covering | Shorts closing, not new longs | Temporary pump, then fade |
| chop | No directional edge | Avoid trading |
| unclear | Insufficient data/signal | Wait for clarity |

### Regime → Stance Mapping

| Regime | Allowed Trade Stance |
|--------|---------------------|
| distribution | LOOK_FOR_SHORTS only |
| accumulation | LOOK_FOR_LONGS only |
| long_trap | AVOID or SHORT |
| short_trap | AVOID or LONG |
| healthy_bull | LOOK_FOR_LONGS |
| healthy_bear | LOOK_FOR_SHORTS |
| short_covering | AVOID (false signal) |
| chop | AVOID_TRADING |
| unclear | AVOID_TRADING |

---

## A.7 Exchange Divergence Philosophy

### The Core Insight

```
Binance = Retail behavior (noise, FOMO, late)
Bybit Coin-M = Smart money behavior (early, intentional)
```

### Scenario Interpretation

| Scenario | What It Means | Bias |
|----------|---------------|------|
| whale_distribution | Smart money selling into retail buying | SHORT |
| whale_accumulation | Smart money buying while retail hesitates | LONG |
| retail_fomo_rally | Retail piling in, whales not confirming | SHORT (fade) |
| short_squeeze_setup | Shorts overcrowded, whales buying | LONG |
| synchronized_bullish | Both agree on up | LONG (high conf) |
| synchronized_bearish | Both agree on down | SHORT (high conf) |
| binance_noise | Binance active, Bybit quiet | Ignore Binance |
| bybit_leading | Bybit moving first | Follow Bybit |
| unclear | No clear pattern | WAIT |

### When Divergence Matters vs Doesn't

**Matters:**
- Strong divergence (OI difference > 1%)
- Sustained (not just 1 candle)
- Confirms regime detection

**Doesn't Matter:**
- Small differences (< 0.5%)
- Noisy/choppy conditions
- Contradicts macro structure

---

## A.8 Liquidity Concepts (Phase 2)

> **Note:** Full liquidity implementation is Phase 2. This section defines the thinking.

### Three Types of Liquidity Zones

1. **Range Highs/Lows** — Obvious levels everyone sees
2. **Equal Highs/Lows** — Stop clusters above/below
3. **Swing Highs/Lows** — Structure-based levels

### How Liquidity Affects Decisions

| Zone Proximity | Effect |
|----------------|--------|
| Price approaching liquidity | Expect volatility/sweep |
| Price just swept liquidity | Potential reversal zone |
| Price far from liquidity | Cleaner directional moves |

### Phase 1 (Now): Manual Recognition
- Identify obvious liquidity pools manually
- Note them in analysis reasoning
- Don't auto-calculate yet

### Phase 2 (Future): Automated Detection
- Detect clustered highs/lows programmatically
- Calculate proximity scores
- Add sweep detection

---

# PART B: THE IMPLEMENTATION — What's Already Built

## B.1 Current System State

### Core Components (Implemented ✅)

| Component | Status | File |
|-----------|--------|------|
| Dynamic thresholds per TF | ✅ Done | marketMetrics.js |
| CVD reliability gating | ✅ Done | marketMetrics.js, marketDataService.js |
| Dual confidence model | ✅ Done | marketMetrics.js |
| Timeframe buckets | ✅ Done | marketMetrics.js |
| Macro anchoring | ✅ Done | marketMetrics.js |
| Conflict penalty | ✅ Done | marketMetrics.js |
| Pain Index | ✅ Done | marketMetrics.js |
| Regime detection | ✅ Done | marketMetrics.js |
| Exchange divergence | ✅ Done | marketMetrics.js |
| 4-timeframe analysis | ✅ Done | 30m, 1h, 4h, 1d |

### Recent Fixes (P0 CVD Fix)

| Fix | Description | Status |
|-----|-------------|--------|
| CVD resolution per TF | 30m→m30, 1h→h1, 4h→h4, 1d→h24 | ✅ Deployed |
| CVD reliability metadata | cvdReliableForTf, cvdReason, etc. | ✅ Deployed |
| Confidence scale fix | All outputs on 0-10 scale | ✅ Deployed |
| Build info | Version tracking in API response | ✅ Deployed |

### API Output Structure

```javascript
{
  timestamp: 1702389600000,
  timeframe: "4h",
  
  finalDecision: {
    bias: "SHORT",
    confidence: 6.2,
    confidenceType: "directionConfidence",
    directionConfidence: 6.2,
    noTradeConfidence: 3.8,
    tradeStance: "LOOK_FOR_SHORTS",
    primaryRegime: "distribution",
    riskMode: "NORMAL",
    macroAnchored: true,
    warning: null
  },
  
  timeframeBuckets: {
    macro: { bias: "BEARISH", confidence: 7.1, ... },
    micro: { bias: "BEARISH", confidence: 5.8, ... },
    scalping: { bias: "NEUTRAL", confidence: 4.2, ... }
  },
  
  exchangeDivergence: { scenario: "whale_distribution", ... },
  marketRegime: { regime: "distribution", ... },
  
  // Per-timeframe deep dive
  timeframes: {
    "30m": { ... },
    "1h": { ... },
    "4h": { ... },
    "1d": { ... }
  }
}
```

---

## B.2 Threshold Configuration

### Price Move Thresholds (Per Timeframe)

| TF | Noise (ignore) | Strong (significant) |
|----|----------------|---------------------|
| 30m | < 0.25% | > 0.5% |
| 1h | < 0.4% | > 0.8% |
| 4h | < 0.65% | > 1.3% |
| 1d | < 1.15% | > 2.3% |

### OI Change Thresholds (Per Timeframe)

| TF | Quiet (ignore) | Aggressive (notable) |
|----|----------------|---------------------|
| 30m | < 0.15% | > 0.3% |
| 1h | < 0.25% | > 0.5% |
| 4h | < 0.5% | > 1.0% |
| 1d | < 1.0% | > 2.0% |

### CVD Window Configuration

| TF | API Interval | Window | Min Candles (80%) |
|----|--------------|--------|-------------------|
| 30m | m30 | 48 candles (24h) | 38 |
| 1h | h1 | 24 candles (24h) | 19 |
| 4h | h4 | 18 candles (72h) | 14 |
| 1d | h24 | 14 candles (2wk) | 11 |

---

## B.3 Signal Weights

Current signal weights in `calculateWeightedDecision`:

| Signal | Weight | Notes |
|--------|--------|-------|
| Exchange Divergence | 35% | Primary signal |
| Market Regime | 20% | Context |
| Structure | 15% | S/R, BoS |
| Volume Profile | 10% | POC, VAH, VAL |
| Technical | 10% | EMA, trend |
| Funding | 5% | Extremes only |
| CVD | 5% | When reliable |

**Note:** CVD weight = 0 when `cvdReliableForTf = false`

---

# PART C: THE LAB — How The System Is Validated

## C.1 What We're Actually Testing

### Not Testing (Wrong Approach)

| Bad Metric | Why It's Wrong |
|------------|---------------|
| Trade Win Rate | Depends on SL/TP, not system quality |
| Total Return | Depends on leverage, position size |
| Profit Factor | Trading parameters mask system quality |
| Sharpe Ratio | Only meaningful for actual trading |

### Actually Testing (Right Approach)

| Metric | What It Measures |
|--------|------------------|
| Directional Accuracy | Does bias correctly predict direction? |
| Confidence Calibration | Is confidence=8 better than confidence=5? |
| WAIT Effectiveness | Does WAIT identify dangerous periods? |
| Regime Accuracy | Do regimes predict outcomes? |
| Bucket Alignment Value | Are aligned signals more accurate? |

---

## C.2 Primary Metrics (Must Have)

### Metric 1: Directional Accuracy

**Question:** When bias is LONG, does price go up?

**Measurement:**
```
For each signal where bias = LONG or SHORT:
  1. Record price at signal time
  2. Record price after 1, 2, 4, 8 candles
  3. Direction correct = bias matches actual move
  4. Calculate % correct
```

**Targets:**

| Lookahead | Minimum | Good | Excellent |
|-----------|---------|------|-----------|
| 1 candle | 52% | 55% | 58% |
| 4 candles | 53% | 57% | 62% |
| 8 candles | 54% | 58% | 63% |

### Metric 2: Confidence Calibration

**Question:** Does higher confidence = higher accuracy?

**Measurement:**
```
Group all signals by confidence bucket:
  - 0-4: Should be ~50% accurate (noise)
  - 5-6: Should be ~55% accurate
  - 7-8: Should be ~62% accurate
  - 9-10: Should be ~70% accurate

Calculate correlation between confidence and accuracy
```

**Target:** Positive correlation > 0.3

**Red Flag:** If confidence=9 isn't more accurate than confidence=5, the confidence score is meaningless.

### Metric 3: WAIT Effectiveness

**Question:** Does WAIT correctly identify bad trading periods?

**Measurement:**
```
For all WAIT periods:
  1. Calculate volatility (range %)
  2. Calculate directionality (trend strength)
  3. Compare to LONG/SHORT periods

WAIT should have:
  - Higher volatility (chop)
  - OR lower directionality (no trend)
  - OR both
```

**Target:** WAIT volatility ratio > 1.2x trade periods

### Metric 4: Regime Accuracy

**Question:** Do detected regimes predict outcomes?

**Measurement:**
```
For each regime detected:
  1. Record expected outcome (distribution → drop)
  2. Check actual outcome over next 4-24 hours
  3. Calculate accuracy per regime type
```

**Targets:**

| Regime | Expected | Target Accuracy |
|--------|----------|-----------------|
| distribution | Price drops | > 60% |
| accumulation | Price rises | > 60% |
| long_trap | Reversal down | > 55% |
| short_trap | Reversal up | > 55% |
| healthy_bull | Continuation up | > 55% |
| healthy_bear | Continuation down | > 55% |

---

## C.3 Secondary Metrics (Should Have)

### Metric 5: Bucket Alignment Bonus

**Question:** Are signals stronger when all 3 buckets agree?

```
All aligned: MACRO + MICRO + SCALPING same direction
Partial: 2 out of 3 agree
Mixed: All different or mostly NEUTRAL

Target: Aligned accuracy > Mixed accuracy + 10%
```

### Metric 6: Scenario Accuracy

**Question:** Which exchange divergence scenarios are most reliable?

```
For each scenario type:
  - whale_distribution → did price drop?
  - whale_accumulation → did price rise?
  - retail_fomo_rally → did reversal occur?
  
Identify scenarios that work vs don't work
```

### Metric 7: High-Confidence Error Rate

**Question:** How often do confident signals fail?

```
High-confidence = confidence ≥ 8
Error = direction was wrong

Target: < 35% of high-confidence signals should be wrong
Red Flag: > 50% error rate = confidence is broken
```

---

## C.4 Error Bucketing Framework

When signals fail, categorize WHY:

### Error Categories

| Category | Description | Example |
|----------|-------------|---------|
| **Regime Misread** | Wrong regime detected | Called "distribution" during accumulation |
| **False Structure** | BoS that wasn't real | Support break that immediately reclaimed |
| **CVD Misleading** | CVD diverged from outcome | CVD positive but price dropped |
| **OI Misinterpretation** | OI signal was wrong | Rising OI wasn't new longs |
| **Funding Extreme Miss** | Funding extreme didn't reverse | 0.1% funding, price kept going |
| **Timeframe Conflict** | Lower TF overrode correct macro | 30m noise killed 4h signal |
| **Data Quality** | Bad/stale data caused error | CVD from wrong resolution |

### Error Analysis Process

1. **Collect** — Log 50-200 signals with outcomes
2. **Categorize** — Assign each error to a category
3. **Prioritize** — Find the dominant failure mode
4. **Fix** — Address ONLY that mode
5. **Measure** — Re-run backtest
6. **Repeat** — Move to next failure mode

---

## C.5 Backtest Requirements

### Current Backtest Problems (To Fix)

| Problem | Impact | Fix |
|---------|--------|-----|
| Logic desync | Testing different system than prod | Use marketMetrics.js directly |
| Missing CVD metadata | CVD gates don't work | Add all CVD fields to snapshots |
| Single timeframe | Buckets not tested | Build multi-TF snapshots |
| Wrong success metric | Measuring trades not bias | Add directional accuracy |

### Correct Backtest Output

```javascript
{
  // Directional Accuracy
  directionalAccuracy: {
    overall: 57.3,
    byLookahead: { "1": 54.2, "4": 57.3, "8": 58.1 },
    byBias: { LONG: 58.1, SHORT: 56.5 }
  },
  
  // Confidence Calibration
  confidenceCalibration: {
    buckets: {
      "0-4": { signals: 245, accuracy: 49.8 },
      "5-6": { signals: 189, accuracy: 55.0 },
      "7-8": { signals: 98, accuracy: 63.3 },
      "9-10": { signals: 23, accuracy: 73.9 }
    },
    correlation: 0.42
  },
  
  // WAIT Effectiveness
  waitEffectiveness: {
    waitPeriods: 34,
    avgVolatilityDuringWait: 2.8,
    avgVolatilityDuringTrade: 1.9,
    volatilityRatio: 1.47
  },
  
  // Regime Accuracy
  regimeAccuracy: {
    distribution: { count: 28, accuracy: 67.9 },
    accumulation: { count: 15, accuracy: 66.7 },
    // ...
  },
  
  // Error Analysis
  errorBreakdown: {
    regime_misread: 23,
    false_structure: 18,
    cvd_misleading: 15,
    // ...
  }
}
```

---

## C.6 Validation Criteria

### Minimum Acceptance (Must Pass)

| Criterion | Requirement |
|-----------|-------------|
| Directional accuracy | > 53% |
| Confidence correlation | > 0.15 |
| WAIT volatility ratio | > 1.0 |
| All regime accuracy | > 50% |
| High-conf error rate | < 50% |

### Production Ready (Target)

| Criterion | Target |
|-----------|--------|
| Directional accuracy | > 57% |
| Confidence correlation | > 0.30 |
| WAIT volatility ratio | > 1.3 |
| All regime accuracy | > 60% |
| High-conf error rate | < 35% |

### Red Flags (Fail Conditions)

| Red Flag | Meaning |
|----------|---------|
| Accuracy < 50% | Worse than random |
| Negative confidence correlation | Higher conf = worse results |
| WAIT ratio < 0.8 | WAIT triggers at wrong times |
| Any regime < 45% | Regime detection broken |
| High-conf error > 50% | Confidence meaningless |

---

# PART D: EXECUTION PLAN

## D.1 Phase Overview

```
┌────────────────────────────────────────────────────────────┐
│  PHASE 1: Foundation (Week 1-2)                            │
│  ════════════════════════════════                          │
│  - Complete logging infrastructure                         │
│  - Fix backtest issues                                     │
│  - Establish ground truth labels                           │
└────────────────────────────────────────────────────────────┘
                            ↓
┌────────────────────────────────────────────────────────────┐
│  PHASE 2: Measurement (Week 3)                             │
│  ═════════════════════════════                             │
│  - Run full backtest with correct metrics                  │
│  - Calculate all primary metrics                           │
│  - Identify dominant failure mode                          │
└────────────────────────────────────────────────────────────┘
                            ↓
┌────────────────────────────────────────────────────────────┐
│  PHASE 3: Calibration (Week 4)                             │
│  ══════════════════════════════                            │
│  - Fix dominant failure mode                               │
│  - Calibrate confidence scores                             │
│  - Re-run backtest, verify improvement                     │
└────────────────────────────────────────────────────────────┘
                            ↓
┌────────────────────────────────────────────────────────────┐
│  PHASE 4: Iteration (Week 5+)                              │
│  ═════════════════════════════                             │
│  - Address next failure mode                               │
│  - Add secondary metrics                                   │
│  - Begin liquidity concepts                                │
└────────────────────────────────────────────────────────────┘
```

---

## D.2 Phase 1: Foundation (Week 1-2)

### Task 1.1: Complete Signal Logging

**Goal:** Every analysis cycle logged with full context.

**Log Structure:**
```javascript
{
  timestamp: "2025-01-15T08:00:00Z",
  price: 95000,
  
  // Decision
  bias: "LONG",
  confidence: 7.5,
  tradeStance: "LOOK_FOR_LONGS",
  
  // Context
  regime: "accumulation",
  scenario: "whale_accumulation",
  buckets: { macro: "BULLISH", micro: "BULLISH", scalping: "NEUTRAL" },
  
  // Component scores
  signals: [
    { name: "exchange_divergence", bias: "LONG", confidence: 8, weight: 0.35 },
    { name: "market_regime", bias: "LONG", confidence: 7, weight: 0.20 },
    // ...
  ],
  
  // Warnings
  warnings: [],
  cvdReliable: true,
  macroAnchored: false
}
```

### Task 1.2: Outcome Labeling

**Goal:** Define how to label signal outcomes.

**Outcome Types:**
- **CORRECT** — Bias matched actual move
- **INCORRECT** — Bias was opposite of actual move
- **NEUTRAL** — No significant move occurred

**Measurement Windows:**
- 1 candle (immediate)
- 4 candles (short-term)
- 8 candles (medium-term)

### Task 1.3: Fix Backtest Issues

**Tasks:**
1. Ensure backtest uses `marketMetrics.calculateMarketMetrics()` only
2. Add all CVD metadata fields to `buildSnapshots()`
3. Build multi-timeframe snapshots (30m, 1h, 4h, 1d)
4. Add directional accuracy calculation
5. Add confidence calibration report

---

## D.3 Phase 2: Measurement (Week 3)

### Task 2.1: Run Full Backtest

**Parameters:**
- Period: 90+ days
- Timeframes: All 4 (30m, 1h, 4h, 1d)
- Include both bull and bear periods

### Task 2.2: Calculate Metrics

**Generate:**
1. Directional accuracy report
2. Confidence calibration chart
3. WAIT effectiveness analysis
4. Regime accuracy breakdown
5. Error category distribution

### Task 2.3: Identify Dominant Failure

**Process:**
1. Review all incorrect signals
2. Categorize into error buckets
3. Find the bucket with most errors
4. That's your first fix target

---

## D.4 Phase 3: Calibration (Week 4)

### Task 3.1: Fix Dominant Failure

**Example Fixes by Category:**

| Failure Category | Potential Fix |
|-----------------|---------------|
| Regime misread | Tighten regime detection conditions |
| False structure | Require confirmation candles |
| CVD misleading | Reduce CVD weight or add gate |
| Funding miss | Only use funding at extremes (z > 2) |
| TF conflict | Strengthen macro anchoring |

### Task 3.2: Calibrate Confidence

**Process:**
1. Group historical signals by confidence bucket
2. Calculate actual accuracy per bucket
3. Adjust confidence formula so scores match reality
4. Higher buckets should have higher accuracy

### Task 3.3: Verify Improvement

**Run backtest again with same data:**
- Directional accuracy should improve
- Confidence calibration should improve
- Dominant error count should decrease

**If no improvement:** Revert change, try different fix.

---

## D.5 Phase 4: Iteration (Week 5+)

### Continuous Improvement Loop

```
1. Identify next dominant failure
2. Hypothesize fix
3. Implement fix
4. Run backtest
5. Compare before/after
6. If better → keep, if worse → revert
7. Repeat
```

### Secondary Enhancements

After primary metrics are good:
- Add bucket alignment analysis
- Add scenario-specific accuracy
- Add time-of-day analysis
- Begin liquidity zone concepts

---

## D.6 Weekly Checklist

### Every Monday: Review

- [ ] Review past week's signals
- [ ] Count correct/incorrect by category
- [ ] Update error buckets
- [ ] Identify any new patterns

### Every Wednesday: Analyze

- [ ] Deep dive on top 3 failures
- [ ] Propose one fix
- [ ] Document hypothesis

### Every Friday: Implement & Test

- [ ] Implement proposed fix
- [ ] Run backtest on recent data
- [ ] Compare metrics
- [ ] Decide: keep or revert

---

# Summary: Brain + Lab Integration

## The Complete Flow

```
┌─────────────────┐      ┌─────────────────┐
│                 │      │                 │
│   THE BRAIN     │      │    THE LAB      │
│   (Part A)      │      │   (Part C)      │
│                 │      │                 │
│  • Philosophy   │      │  • Metrics      │
│  • Hierarchy    │      │  • Calibration  │
│  • Gating       │      │  • Validation   │
│  • Discipline   │      │  • Error Track  │
│                 │      │                 │
└────────┬────────┘      └────────┬────────┘
         │                        │
         │    ┌──────────────┐    │
         └───→│              │←───┘
              │  IMPLEMENT   │
              │   (Part B)   │
              │              │
              │  • Code      │
              │  • Config    │
              │  • Deploy    │
              │              │
              └──────┬───────┘
                     │
                     ↓
              ┌──────────────┐
              │              │
              │   EXECUTE    │
              │   (Part D)   │
              │              │
              │  • Plan      │
              │  • Measure   │
              │  • Iterate   │
              │              │
              └──────────────┘
```

## Key Takeaways

1. **The Brain defines HOW to think** — Hierarchy, gating, signal discipline
2. **The Lab defines HOW to test** — Metrics, calibration, validation
3. **Implementation connects them** — Code that enforces brain, outputs for lab
4. **Execution makes it real** — Phased plan with measurable progress

## Success Definition

The AI Market Analyzer is successful when:

1. ✅ When it says LONG with high confidence → Price usually goes up
2. ✅ When it says SHORT with high confidence → Price usually goes down
3. ✅ When it says WAIT → Market is actually choppy/unclear
4. ✅ Higher confidence → Actually more reliable
5. ✅ Regime detection → Actually predicts outcomes
6. ✅ Signals are rare → But meaningful when they occur

---

*Master Document v1.0*  
*Brain + Lab Framework*  
*December 12, 2025*
