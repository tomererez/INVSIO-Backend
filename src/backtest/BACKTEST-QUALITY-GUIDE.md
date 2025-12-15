# AI Market Analyzer - Backtest Quality Guide & Implementation Plan

> **Document Version:** 1.0  
> **Date:** December 12, 2025  
> **Purpose:** Define what constitutes a quality backtest for a bias/confidence system and plan improvements

---

## Table of Contents

1. [Understanding Your System](#1-understanding-your-system)
2. [Current Backtest Problems](#2-current-backtest-problems)
3. [What Quality Backtest Measures](#3-what-quality-backtest-measures)
4. [The Right Metrics](#4-the-right-metrics)
5. [Implementation Plan](#5-implementation-plan)
6. [Validation Criteria](#6-validation-criteria)
7. [Common Pitfalls to Avoid](#7-common-pitfalls-to-avoid)

---

## 1. Understanding Your System

### 1.1 What Your System Actually Outputs

Your AI Market Analyzer is **NOT** a signal generator. It's a **decision-support system** that outputs:

| Output | Type | Purpose |
|--------|------|---------|
| **Bias** | LONG / SHORT / WAIT | Directional view of the market |
| **Confidence** | 0-10 scale | How certain the system is |
| **Trade Stance** | LOOK_FOR_LONGS / SHORTS / AVOID | Actionable guidance |
| **Market Regime** | distribution / accumulation / trap / etc. | Market context |
| **Timeframe Buckets** | MACRO / MICRO / SCALPING | Multi-TF perspective |

### 1.2 Why This Matters for Backtesting

Traditional backtests assume:
```
Signal = "BUY at $100,000 with SL at $98,000"
```

Your system says:
```
"The environment favors looking for longs. Confidence: 7/10. 
Regime: healthy_bull. Smart money is accumulating."
```

**This requires a fundamentally different testing approach.**

### 1.3 The Core Questions Your Backtest Should Answer

1. **Directional Accuracy:** When bias is LONG, does price tend to go up?
2. **Confidence Calibration:** Is confidence=9 actually more reliable than confidence=5?
3. **WAIT Effectiveness:** Does WAIT correctly identify dangerous/choppy periods?
4. **Regime Accuracy:** Does "distribution" actually precede drops?
5. **Bucket Alignment:** When all 3 buckets agree, is the signal stronger?

---

## 2. Current Backtest Problems

### 2.1 Critical: Logic Desync

**Problem:** `backtestEngine.js` contains an **old copy** of the analysis logic with static thresholds (0.5% for all timeframes), while `marketMetrics.js` uses dynamic thresholds per timeframe.

**Impact:** You're testing a different system than what runs in production.

**Severity:** 🔴 Critical - Invalidates all backtest results

### 2.2 Critical: Missing CVD Metadata

**Problem:** `buildSnapshots()` in `runBacktest.js` doesn't include CVD reliability fields:
- `cvdReliableForTf`
- `cvdResolution`
- `cvdNormalized`
- `cvdWindowCandles`
- `cvdActualCandles`

**Impact:** CVD reliability gates don't function during backtest. The backtest might use CVD data that production would exclude.

**Severity:** 🔴 Critical - P0 CVD fix not tested

### 2.3 Major: Single Timeframe Only

**Problem:** Backtest only builds `4h` snapshots, ignoring 30m, 1h, and 1d.

**Impact:** 
- MACRO/MICRO/SCALPING buckets can't be tested
- Multi-timeframe aggregation logic untested
- Macro anchoring rule untested

**Severity:** 🟠 Major - Core feature untested

### 2.4 Major: Wrong Success Metric

**Problem:** Backtest measures "did the trade make money?" but your system outputs bias, not trades.

**Impact:** Win rate of simulated trades ≠ accuracy of bias predictions

**Example:**
- System says LONG with confidence=8
- You simulate a trade with 2% SL
- Price goes up 5% then pulls back 3%, hitting your SL
- Trade = Loss ❌
- But bias was correct! ✅

**Severity:** 🟠 Major - Measuring wrong thing

### 2.5 Moderate: No Confidence Analysis

**Problem:** All trades with confidence ≥ minConfidence are treated equally.

**Impact:** Can't answer "Is confidence=9 actually better than confidence=7?"

**Severity:** 🟡 Moderate - Missing key insight

### 2.6 Moderate: WAIT Not Analyzed

**Problem:** WAIT signals are simply skipped, not analyzed.

**Impact:** Can't validate that WAIT correctly identifies dangerous periods.

**Severity:** 🟡 Moderate - Core feature untested

### 2.7 Minor: Unrealistic Mock Data

**Problem:** `generateMockHistoricalData()` creates random data without realistic market patterns.

**Impact:** Demo mode results are meaningless.

**Severity:** 🟢 Minor - Only affects demos

---

## 3. What Quality Backtest Measures

### 3.1 Primary Metrics (Must Have)

#### A) Directional Accuracy by Bias

**Question:** When the system says LONG, how often does price go up over the next N candles?

**Measurement:**
- For each bias signal (LONG/SHORT), record price at signal time
- Record price after 1, 2, 4, and 8 candles
- Calculate % of times direction was correct

**Target:** > 55% accuracy (significantly better than random 50%)

#### B) Confidence Calibration

**Question:** Is higher confidence actually more reliable?

**Measurement:**
- Group all signals by confidence bucket (0-4, 5-6, 7-8, 9-10)
- Calculate directional accuracy for each bucket
- Check for monotonic relationship (higher conf = higher accuracy)

**Target:** Clear positive correlation between confidence and accuracy

**Example of Good Calibration:**
| Confidence | Accuracy | Signals |
|------------|----------|---------|
| 0-4 | 48% | 250 |
| 5-6 | 54% | 180 |
| 7-8 | 62% | 95 |
| 9-10 | 71% | 35 |

**Example of Bad Calibration (Problem!):**
| Confidence | Accuracy | Signals |
|------------|----------|---------|
| 0-4 | 51% | 250 |
| 5-6 | 53% | 180 |
| 7-8 | 49% | 95 |
| 9-10 | 52% | 35 |

#### C) WAIT Effectiveness

**Question:** Does WAIT correctly identify periods to avoid?

**Measurement:**
- Calculate volatility (or range %) during WAIT periods
- Compare to volatility during LONG/SHORT periods
- Calculate "avoided loss" - what would have happened if traded during WAIT

**Target:** 
- Higher volatility during WAIT (choppy market correctly identified)
- OR lower directional moves during WAIT (no clear trend to capture)

#### D) Regime Accuracy

**Question:** Do detected regimes actually predict what happens next?

**Measurement:**
- After "distribution" regime, measure returns over next 4-24 hours
- After "accumulation" regime, measure returns over next 4-24 hours
- After "trap" regimes, check if reversal occurred

**Targets:**
| Regime | Expected Outcome | Target Accuracy |
|--------|-----------------|-----------------|
| distribution | Price drops | > 60% |
| accumulation | Price rises | > 60% |
| long_trap | Price drops | > 55% |
| short_trap | Price rises | > 55% |
| healthy_bull | Continued uptrend | > 55% |
| healthy_bear | Continued downtrend | > 55% |

### 3.2 Secondary Metrics (Should Have)

#### E) Bucket Alignment Bonus

**Question:** Are signals stronger when all 3 buckets (MACRO/MICRO/SCALPING) agree?

**Measurement:**
- Separate signals where all 3 buckets agree vs. mixed
- Compare accuracy between groups

**Target:** Aligned signals should have > 10% higher accuracy

#### F) Exchange Divergence Scenario Accuracy

**Question:** Do specific scenarios predict correctly?

**Measurement:**
- Track outcomes for each scenario type
- whale_distribution → should predict drops
- whale_accumulation → should predict rises
- retail_fomo_rally → should predict reversals

#### G) Time-Based Analysis

**Question:** Does accuracy vary by market conditions?

**Measurement:**
- Accuracy during high volatility vs. low volatility
- Accuracy during trending vs. ranging markets
- Accuracy by time of day/week

### 3.3 Risk Metrics (Nice to Have)

#### H) Maximum Consecutive Errors

**Question:** What's the worst streak of wrong predictions?

**Why It Matters:** Even 60% accuracy can have streaks of 8-10 wrong calls.

#### I) Recovery Time

**Question:** After a wrong high-confidence call, how long until a correct one?

#### J) False Confidence Rate

**Question:** What % of high-confidence (8+) signals are wrong?

**Target:** < 30% of high-confidence signals should be wrong

---

## 4. The Right Metrics

### 4.1 Metrics You Should Track

| Category | Metric | Formula | Target |
|----------|--------|---------|--------|
| **Accuracy** | Directional Accuracy | Correct Direction / Total Signals | > 55% |
| **Accuracy** | High-Conf Accuracy | Correct (conf≥8) / Total (conf≥8) | > 65% |
| **Calibration** | Confidence Correlation | Pearson(confidence, correct) | > 0.3 |
| **Calibration** | Brier Score | Mean((confidence - outcome)²) | < 0.2 |
| **WAIT** | WAIT Volatility Ratio | Vol(WAIT periods) / Vol(Trade periods) | > 1.2 |
| **WAIT** | WAIT Avoidance Value | Hypothetical loss avoided | > 0 |
| **Regime** | Distribution Accuracy | % times price fell after | > 60% |
| **Regime** | Accumulation Accuracy | % times price rose after | > 60% |
| **Alignment** | Bucket Agreement Bonus | Accuracy(aligned) - Accuracy(mixed) | > 10% |
| **Risk** | Max Consecutive Wrong | Longest streak of errors | < 10 |
| **Risk** | High-Conf Error Rate | Wrong (conf≥8) / Total (conf≥8) | < 35% |

### 4.2 Metrics You Should NOT Rely On

| Bad Metric | Why It's Wrong |
|------------|---------------|
| **Trade Win Rate** | Depends on SL/TP settings, not system quality |
| **Total Return** | Depends on position sizing, leverage - not system quality |
| **Profit Factor** | Same issue - trading parameters mask system quality |
| **Sharpe Ratio** | Only meaningful for actual trading, not bias prediction |

### 4.3 The Fundamental Measurement

For each signal, record:

```
{
  timestamp: "2025-01-15T08:00:00Z",
  price_at_signal: 95000,
  bias: "LONG",
  confidence: 7.5,
  trade_stance: "LOOK_FOR_LONGS",
  regime: "accumulation",
  scenario: "whale_accumulation",
  buckets: {
    macro: "BULLISH",
    micro: "BULLISH", 
    scalping: "NEUTRAL"
  },
  
  // Outcomes (filled later)
  price_after_1_candle: 95200,
  price_after_4_candles: 96100,
  price_after_8_candles: 94800,
  
  // Derived
  direction_correct_1: true,   // price went up
  direction_correct_4: true,
  direction_correct_8: false,  // price eventually dropped
  max_favorable_move: 2.3%,    // highest point reached
  max_adverse_move: -1.2%      // lowest point before favorable
}
```

---

## 5. Implementation Plan

### Phase 1: Fix Critical Issues (Day 1-2)

#### Task 1.1: Eliminate Logic Duplication

**Goal:** Ensure backtest uses exact same logic as production.

**Approach:**
- Delete `SignalGenerator` class from `backtestEngine.js`
- Import `calculateMarketMetrics` from `marketMetrics.js` directly
- `runBacktest.js` already does this correctly - verify it's the only entry point

**Verification:**
- Run same data through both paths
- Outputs must be identical

#### Task 1.2: Add CVD Metadata to Snapshots

**Goal:** Enable CVD reliability gates in backtest.

**Approach:**
- Update `buildSnapshots()` function
- Add all CVD metadata fields that production expects
- For historical data, calculate reliability based on candle count

**Fields to Add:**
- `cvdReliableForTf`: Based on whether we have enough candles
- `cvdResolution`: Should match the interval we fetched
- `cvdNormalized`: Calculate CVD / total volume
- `cvdWindowCandles`: Expected window size for this TF
- `cvdActualCandles`: Actual candles we have

#### Task 1.3: Multi-Timeframe Support

**Goal:** Test MACRO/MICRO/SCALPING buckets.

**Approach:**
- Fetch data for 30m, 1h, 4h, 1d
- Build snapshots for all timeframes
- Pass complete snapshot to `calculateMarketMetrics`

**Challenge:** 
- Different candle counts per timeframe
- Need to align timestamps

**Solution:**
- Use 4h as base timeframe
- For each 4h candle, find corresponding 30m, 1h, 1d candles
- 1d candle: use the one containing current 4h
- 30m/1h: use last N candles that fit within 4h window

---

### Phase 2: Implement Correct Metrics (Day 3-4)

#### Task 2.1: Directional Accuracy Tracker

**Goal:** Measure if bias correctly predicts direction.

**Approach:**
- After generating each signal, record price
- Look ahead 1, 2, 4, 8 candles
- Compare direction of move to bias
- Store results for analysis

**Output:**
```
Directional Accuracy Report
===========================
Lookahead: 4 candles (16 hours)

LONG signals: 156
  Correct: 94 (60.3%)
  Wrong: 62 (39.7%)

SHORT signals: 189  
  Correct: 112 (59.3%)
  Wrong: 77 (40.7%)

Overall: 59.7%
```

#### Task 2.2: Confidence Calibration Analyzer

**Goal:** Verify confidence score is meaningful.

**Approach:**
- Group all signals by confidence bucket
- Calculate accuracy per bucket
- Check for monotonic relationship
- Calculate correlation coefficient

**Output:**
```
Confidence Calibration Report
=============================
Bucket    | Signals | Accuracy | Avg Move
----------|---------|----------|----------
0.0 - 3.0 |     45  |   48.9%  |   +0.1%
3.0 - 5.0 |    123  |   52.0%  |   +0.3%
5.0 - 7.0 |    198  |   57.6%  |   +0.8%
7.0 - 9.0 |     87  |   64.4%  |   +1.4%
9.0 - 10  |     12  |   75.0%  |   +2.1%

Correlation: 0.42 ✅ (Good calibration)
```

#### Task 2.3: WAIT Period Analyzer

**Goal:** Validate WAIT signals identify dangerous periods.

**Approach:**
- Identify all WAIT periods (consecutive WAIT signals)
- Calculate volatility during each period
- Calculate what would have happened if traded
- Compare to trade periods

**Output:**
```
WAIT Effectiveness Report
=========================
WAIT periods analyzed: 34
Avg duration: 3.2 candles (12.8 hours)

During WAIT:
  Avg volatility: 2.8%
  Avg directional move: 0.4%
  Simulated loss (if traded): -$847

During LONG/SHORT:
  Avg volatility: 1.9%
  Avg directional move: 1.2%

Conclusion: WAIT correctly identifies 
choppy, directionless periods ✅
```

#### Task 2.4: Regime Accuracy Tracker

**Goal:** Validate regime detection.

**Approach:**
- For each regime detected, record subsequent price action
- Calculate accuracy per regime type
- Identify any regimes that don't predict well

**Output:**
```
Regime Accuracy Report
======================
Regime          | Count | Expected | Actual | Accuracy
----------------|-------|----------|--------|----------
distribution    |    28 | DROP     | 19/28  |   67.9% ✅
accumulation    |    15 | RISE     | 10/15  |   66.7% ✅
long_trap       |    12 | DROP     |  7/12  |   58.3% ✅
short_trap      |     8 | RISE     |  5/8   |   62.5% ✅
healthy_bull    |    22 | RISE     | 14/22  |   63.6% ✅
healthy_bear    |    18 | DROP     | 11/18  |   61.1% ✅
unclear         |   187 | NONE     |  N/A   |    N/A
```

---

### Phase 3: Enhanced Analysis (Day 5-6)

#### Task 3.1: Bucket Alignment Analysis

**Goal:** Test if aligned buckets produce better signals.

**Approach:**
- Categorize signals by bucket alignment
- ALL_ALIGNED: All 3 buckets same direction
- PARTIAL: 2 out of 3 agree
- MIXED: All different or mostly NEUTRAL
- Compare accuracy between categories

#### Task 3.2: Scenario Performance Breakdown

**Goal:** Identify which scenarios are most reliable.

**Approach:**
- Group signals by exchange divergence scenario
- Calculate accuracy per scenario
- Identify scenarios that should be trusted more/less

#### Task 3.3: Time-Series Validation

**Goal:** Ensure backtest isn't overfitting.

**Approach:**
- Split data: 70% train, 30% test
- Calculate metrics on both sets
- Large difference = overfitting problem

---

### Phase 4: Reporting & Visualization (Day 7)

#### Task 4.1: Comprehensive Report Generator

**Goal:** Single report with all metrics.

**Sections:**
1. Executive Summary (pass/fail status)
2. Directional Accuracy
3. Confidence Calibration
4. WAIT Effectiveness
5. Regime Accuracy
6. Bucket Alignment
7. Scenario Performance
8. Risk Metrics
9. Recommendations

#### Task 4.2: Dashboard Updates

**Goal:** Visualize new metrics in BacktestDashboard.jsx

**New Charts:**
- Confidence vs Accuracy scatter plot
- Regime accuracy bar chart
- WAIT period timeline
- Bucket alignment breakdown

---

## 6. Validation Criteria

### 6.1 Minimum Acceptance Criteria

For the backtest to be considered valid:

| Criterion | Requirement |
|-----------|-------------|
| Logic sync | Production and backtest produce identical outputs |
| Sample size | ≥ 200 signals total |
| Time coverage | ≥ 60 days of data |
| Market diversity | Includes both up and down periods |
| Timeframe coverage | Tests all 4 timeframes |

### 6.2 System Quality Criteria

For the AI Market Analyzer to be considered production-ready:

| Metric | Minimum | Good | Excellent |
|--------|---------|------|-----------|
| Directional Accuracy | > 53% | > 57% | > 62% |
| High-Conf Accuracy (8+) | > 58% | > 65% | > 72% |
| Confidence Correlation | > 0.15 | > 0.30 | > 0.45 |
| WAIT Volatility Ratio | > 1.0 | > 1.3 | > 1.6 |
| Distribution Regime Acc | > 55% | > 62% | > 70% |
| Accumulation Regime Acc | > 55% | > 62% | > 70% |
| High-Conf Error Rate | < 45% | < 35% | < 25% |

### 6.3 Red Flags (Fail Conditions)

If any of these occur, the system needs fixes:

| Red Flag | Implication |
|----------|-------------|
| Directional accuracy < 50% | System is worse than random |
| Negative confidence correlation | Higher confidence = worse results |
| WAIT volatility ratio < 0.8 | WAIT triggers during good trading times |
| Any regime accuracy < 45% | Regime detection is broken |
| High-conf error rate > 50% | Confidence scores are meaningless |

---

## 7. Common Pitfalls to Avoid

### 7.1 Look-Ahead Bias

**What:** Using future information to make decisions.

**Example:** Using the close price of a candle to generate a signal, then measuring from that same candle.

**Prevention:** 
- Signal generated at candle N can only use data up to candle N-1
- Measurement starts from candle N+1

### 7.2 Survivorship Bias

**What:** Only testing on successful periods.

**Example:** Testing only on 2024 bull market, ignoring 2022 crash.

**Prevention:**
- Include diverse market conditions
- Specifically test on known crash periods
- Test on at least one bear market period

### 7.3 Overfitting

**What:** System works on test data but fails on new data.

**Signs:**
- Very high accuracy (> 70%) with many parameters
- Large difference between train/test performance
- System fails when parameters change slightly

**Prevention:**
- Use walk-forward validation
- Keep parameters minimal
- Test on out-of-sample data

### 7.4 Cherry-Picking Parameters

**What:** Adjusting SL/TP/position size until backtest looks good.

**Why It's Bad:** Those parameters won't work in the future.

**Prevention:**
- Test system accuracy independently of trading parameters
- If you must simulate trades, use fixed parameters
- Report sensitivity analysis (how much results change with parameter changes)

### 7.5 Ignoring Transaction Costs

**What:** Assuming trades are free.

**Reality:** Each trade costs ~0.1% (spread + fees).

**Prevention:**
- Include realistic costs in any trade simulation
- For bias-only backtests, this doesn't apply

### 7.6 Wrong Timeframe for Measurement

**What:** Measuring outcomes at inappropriate intervals.

**Example:** 4h bias measured at 5-minute returns.

**Prevention:**
- Match measurement timeframe to signal timeframe
- 4h signal → measure at 4h, 8h, 16h, 24h
- NOT at 1h or 5m

### 7.7 Treating All Signals Equally

**What:** Not accounting for confidence levels.

**Prevention:**
- Always break down metrics by confidence
- High-confidence errors are worse than low-confidence errors
- System should have FEWER high-confidence signals

---

## Summary: Implementation Priority

| Priority | Task | Effort | Impact |
|----------|------|--------|--------|
| **P0** | Fix logic duplication | 2 hours | Critical |
| **P0** | Add CVD metadata | 1 hour | Critical |
| **P0** | Multi-timeframe support | 4 hours | Critical |
| **P1** | Directional accuracy metric | 2 hours | High |
| **P1** | Confidence calibration | 2 hours | High |
| **P1** | WAIT effectiveness | 2 hours | High |
| **P1** | Regime accuracy | 2 hours | High |
| **P2** | Bucket alignment analysis | 2 hours | Medium |
| **P2** | Scenario breakdown | 2 hours | Medium |
| **P2** | Time-series validation | 3 hours | Medium |
| **P3** | Enhanced reporting | 4 hours | Low |
| **P3** | Dashboard updates | 4 hours | Low |

**Total Estimated Effort: ~30 hours (4-5 days)**

---

## Final Notes

### The Goal of Your Backtest

Your backtest should answer ONE question:

> **"Does the AI Market Analyzer correctly identify market conditions 
> and provide reliable bias/confidence outputs?"**

It should NOT answer:
- "How much money would I make?"
- "What's the optimal SL/TP?"
- "What leverage should I use?"

Those are trading strategy questions that depend on the TRADER, not the analyzer.

### Success Definition

Your AI Market Analyzer is successful if:

1. **When it says LONG with high confidence** → Price usually goes up
2. **When it says SHORT with high confidence** → Price usually goes down
3. **When it says WAIT** → Market is actually choppy/unclear
4. **Higher confidence** → Actually more reliable than lower confidence
5. **Regime detection** → Actually predicts what happens next

If all 5 are true, the system is valuable regardless of any simulated "trading" performance.

---

*Document Author: Claude (AI Assistant)*  
*For: INVSIO.AI - AI Market Analyzer*  
*Date: December 12, 2025*
