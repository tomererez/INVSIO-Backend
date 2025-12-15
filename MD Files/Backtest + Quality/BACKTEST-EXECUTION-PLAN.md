# AI Market Analyzer — Backtest Improvement Plan

> **4 Prompts | ~1-2 Days Total**  
> **Reference Docs:** MASTER-SPEC.md + BACKTEST-QUALITY-GUIDE.md

---

## Overview

| Prompt | Focus | Estimated Time |
|--------|-------|----------------|
| **Prompt 1** | Fix Backtest Infrastructure | 2-3 hours |
| **Prompt 2** | Implement Correct Metrics | 2-3 hours |
| **Prompt 3** | Run Full Analysis | 1-2 hours |
| **Prompt 4** | Calibrate & Document | 1-2 hours |

---

# PROMPT 1: Fix Backtest Infrastructure

```
FIRST: Read these files completely before starting:
- /project/docs/MASTER-SPEC.md (sections 3, 4, 6, 7)
- /project/docs/BACKTEST-QUALITY-GUIDE.md (sections 2.1, 2.2, 2.3, 3)

TASK: Fix all backtest infrastructure issues so it tests the REAL production system

CONTEXT:
The current backtest has critical problems that make its results meaningless:
1. Logic duplication - backtestEngine.js has OLD code with static thresholds
2. Missing CVD metadata - CVD reliability gates don't work in backtest
3. Single timeframe - only 4h tested, MACRO/MICRO/SCALPING buckets untested
4. No outcome tracking - can't measure directional accuracy

YOU MUST FIX ALL FOUR:

═══════════════════════════════════════════════════════════════════════════════
ISSUE 1: LOGIC DUPLICATION
═══════════════════════════════════════════════════════════════════════════════
PROBLEM: backtestEngine.js contains duplicate SignalGenerator class with hardcoded 0.5% thresholds. Production marketMetrics.js uses dynamic thresholds per timeframe.

FIX:
- Remove ALL duplicate analysis logic from backtestEngine.js
- Import and use functions directly from marketMetrics.js
- Ensure runBacktest.js uses ONLY marketMetrics.calculateMarketMetrics()
- Verify identical input → identical output between production and backtest

═══════════════════════════════════════════════════════════════════════════════
ISSUE 2: MISSING CVD METADATA
═══════════════════════════════════════════════════════════════════════════════
PROBLEM: buildSnapshots() doesn't include CVD reliability fields. The P0 CVD fix gates don't function during backtest.

FIX:
- Study how production calculates CVD metadata in marketDataService.js
- Add to each snapshot: cvdReliableForTf, cvdResolution, cvdNormalized, cvdWindowCandles, cvdActualCandles
- Use same reliability thresholds:
  • 30m: needs 38+ of 48 candles
  • 1h: needs 19+ of 24 candles  
  • 4h: needs 14+ of 18 candles
  • 1d: needs 11+ of 14 candles

═══════════════════════════════════════════════════════════════════════════════
ISSUE 3: SINGLE TIMEFRAME
═══════════════════════════════════════════════════════════════════════════════
PROBLEM: Only 4h snapshots are built. MACRO (1d+4h), MICRO (4h+1h), SCALPING (1h+30m) bucket logic is untested.

FIX:
- Modify fetchHistoricalData() to fetch 30m, 1h, 4h, 1d data
- Modify buildSnapshots() to create snapshots for ALL 4 timeframes
- Structure output to match what marketMetrics.calculateMarketMetrics() expects
- Handle timestamp alignment between different timeframe candles
- Add delays/caching to handle API rate limits

═══════════════════════════════════════════════════════════════════════════════
ISSUE 4: NO OUTCOME TRACKING
═══════════════════════════════════════════════════════════════════════════════
PROBLEM: We only track trade P&L. We need to track if BIAS was correct regardless of trade execution.

FIX:
- For each signal, record price at signal time
- Look ahead 1, 2, 4, 8 candles and record future prices
- Calculate: did price move in direction of bias?
- Calculate max favorable excursion (MFE) and max adverse excursion (MAE)
- Attach outcome data to each signal object
- Handle WAIT signals separately (no direction to verify)

═══════════════════════════════════════════════════════════════════════════════

SUCCESS CRITERIA:
□ No duplicate analysis logic exists anywhere
□ CVD reliability gates work during backtest
□ All 4 timeframes processed, bucket logic testable
□ Every signal has outcome data attached
□ Running backtest with same data as production API gives identical decisions
```

---

# PROMPT 2: Implement Correct Metrics

```
FIRST: Read these files completely before starting:
- /project/docs/MASTER-SPEC.md (sections 9, 10, 11)
- /project/docs/BACKTEST-QUALITY-GUIDE.md (sections 4, 5, 6)

TASK: Implement all metrics needed to properly evaluate a bias/confidence system

CONTEXT:
Traditional backtest metrics (win rate, P&L, Sharpe) are WRONG for this system.
We output BIAS + CONFIDENCE, not trade signals.
We need metrics that answer: "Is the bias correct? Is confidence meaningful?"

CREATE THESE 5 METRIC CALCULATORS:

═══════════════════════════════════════════════════════════════════════════════
METRIC 1: DIRECTIONAL ACCURACY
═══════════════════════════════════════════════════════════════════════════════
PURPOSE: When bias is LONG, does price go up? When SHORT, does price go down?

CALCULATE:
- Overall accuracy (% of correct directional calls)
- Accuracy by bias type (LONG vs SHORT separately)
- Accuracy by lookahead period (1, 2, 4, 8 candles)
- Sample sizes for statistical significance

TARGETS:
- Minimum: > 53%
- Good: > 57%
- Excellent: > 62%

═══════════════════════════════════════════════════════════════════════════════
METRIC 2: CONFIDENCE CALIBRATION
═══════════════════════════════════════════════════════════════════════════════
PURPOSE: Does higher confidence actually mean higher accuracy?

CALCULATE:
- Group signals by confidence bucket: 0-4, 5-6, 7-8, 9-10
- Calculate accuracy for each bucket
- Calculate correlation coefficient between confidence and accuracy
- Determine if calibrated (correlation > 0.3)

OUTPUT:
- Table: bucket → signal count, accuracy, avg confidence
- Correlation coefficient
- Boolean: isCalibrated
- Interpretation text

RED FLAGS:
- Negative correlation = higher confidence means WORSE results
- Flat correlation = confidence is meaningless noise

═══════════════════════════════════════════════════════════════════════════════
METRIC 3: WAIT EFFECTIVENESS
═══════════════════════════════════════════════════════════════════════════════
PURPOSE: Does WAIT correctly identify dangerous/choppy periods?

CALCULATE:
- Identify all WAIT periods (consecutive WAIT signals)
- Calculate volatility during WAIT periods (price range %)
- Calculate volatility during LONG/SHORT periods
- Volatility ratio = WAIT volatility / trade volatility
- Hypothetical loss if traded during WAIT

TARGETS:
- Volatility ratio > 1.2 (WAIT periods are choppier)
- Low directionality during WAIT (no clear trend)

═══════════════════════════════════════════════════════════════════════════════
METRIC 4: REGIME ACCURACY
═══════════════════════════════════════════════════════════════════════════════
PURPOSE: Do detected regimes actually predict what happens next?

CALCULATE:
For each regime, define expected outcome and check:
- distribution → price should drop
- accumulation → price should rise
- long_trap → reversal down
- short_trap → reversal up
- healthy_bull → continuation up
- healthy_bear → continuation down

OUTPUT:
- Table: regime → expected outcome, actual accuracy, sample size
- List of problematic regimes (< 50% accuracy)

TARGETS:
- Each regime > 55% accurate
- distribution/accumulation > 60% accurate

═══════════════════════════════════════════════════════════════════════════════
METRIC 5: ERROR BUCKETING
═══════════════════════════════════════════════════════════════════════════════
PURPOSE: When signals fail, categorize WHY they failed

ERROR CATEGORIES:
1. REGIME_MISREAD - Wrong regime detected
2. FALSE_STRUCTURE - BoS that wasn't real
3. CVD_MISLEADING - CVD pointed wrong direction
4. OI_MISINTERPRETATION - OI signal was wrong
5. FUNDING_EXTREME_MISS - Funding extreme didn't reverse
6. TIMEFRAME_CONFLICT - Lower TF overrode correct macro
7. DATA_QUALITY - Bad/stale/unreliable data

CALCULATE:
- For each incorrect signal, analyze which component was most wrong
- Assign primary error category
- Count errors by category
- Identify "dominant failure mode" (most common error)

OUTPUT:
- Error counts by category
- Percentage breakdown
- Dominant failure mode highlighted

═══════════════════════════════════════════════════════════════════════════════

SUCCESS CRITERIA:
□ All 5 metrics implemented and tested
□ Metrics integrated into backtest output
□ Clear pass/fail indicators against targets
□ Can answer: "What is our directional accuracy? Is confidence calibrated?"
```

---

# PROMPT 3: Run Full Analysis

```
FIRST: Read these files completely before starting:
- /project/docs/MASTER-SPEC.md (section 7 - Logging requirements)
- /project/docs/BACKTEST-QUALITY-GUIDE.md (section 6 - Validation Criteria)

TASK: Run comprehensive backtest and generate complete analysis report

═══════════════════════════════════════════════════════════════════════════════
STEP 1: RUN FULL BACKTEST
═══════════════════════════════════════════════════════════════════════════════
PARAMETERS:
- Period: 90 days minimum
- Timeframes: All 4 (30m, 1h, 4h, 1d)
- Use real historical data (not mock)
- Include diverse market conditions (up, down, sideways)

GENERATE ALL METRICS:
- Directional accuracy report
- Confidence calibration report
- WAIT effectiveness report
- Regime accuracy report
- Error bucketing report
- Signal distribution (LONG/SHORT/WAIT counts)
- Bucket alignment analysis (when all 3 agree vs mixed)

═══════════════════════════════════════════════════════════════════════════════
STEP 2: IDENTIFY DOMINANT FAILURE MODE
═══════════════════════════════════════════════════════════════════════════════
FROM ERROR BUCKETING:
1. Find the category with most errors
2. Pull 5-10 specific examples from that category
3. Analyze: what conditions lead to this error?
4. Document the pattern
5. Propose specific fix (do NOT implement yet)

IMPORTANT: Identify ONE dominant failure only. We fix one thing at a time.

═══════════════════════════════════════════════════════════════════════════════
STEP 3: GENERATE BASELINE REPORT
═══════════════════════════════════════════════════════════════════════════════
CREATE MARKDOWN REPORT WITH:

## Current Performance Baseline

### Directional Accuracy
- Overall: X%
- LONG: X%
- SHORT: X%
- Status: PASS/FAIL (target > 53%)

### Confidence Calibration
- Correlation: X
- Bucket breakdown table
- Status: PASS/FAIL (target correlation > 0.15)

### WAIT Effectiveness
- Volatility ratio: X
- Status: PASS/FAIL (target > 1.0)

### Regime Accuracy
- Per-regime breakdown table
- Status: PASS/FAIL per regime (target > 55%)

### Error Distribution
- Category breakdown
- Dominant failure: [CATEGORY]

### Signal Distribution
- LONG: X%
- SHORT: X%
- WAIT: X%

### Recommendations
1. [Dominant failure fix proposal]
2. [Secondary issues to address later]

═══════════════════════════════════════════════════════════════════════════════

OUTPUT FILES:
1. backtest_results_YYYY-MM-DD.json - Raw data
2. BASELINE_REPORT.md - Human-readable analysis
3. Console summary with pass/fail status

SUCCESS CRITERIA:
□ Complete backtest runs without errors
□ All metrics calculated
□ Dominant failure identified with examples
□ Baseline report generated
□ Clear pass/fail status for each metric
```

---

# PROMPT 4: Calibrate & Document

```
FIRST: Read these files completely before starting:
- /project/docs/MASTER-SPEC.md (sections 9.2, 10, 11)
- /project/docs/BACKTEST-QUALITY-GUIDE.md (section 7 - Common Pitfalls)
- The BASELINE_REPORT.md generated in Prompt 3

TASK: Fix the dominant failure, calibrate confidence, and set up ongoing improvement process

═══════════════════════════════════════════════════════════════════════════════
STEP 1: FIX DOMINANT FAILURE MODE
═══════════════════════════════════════════════════════════════════════════════
Based on the dominant failure identified in the baseline report:

RULES:
- Change ONLY what addresses the identified failure
- Do NOT change multiple things at once
- Prefer gating logic over weight changes
- Make the SMALLEST possible change that could fix the issue
- Document exactly what was changed

COMMON FIXES BY FAILURE TYPE:
- REGIME_MISREAD → Tighten regime detection conditions
- FALSE_STRUCTURE → Require confirmation candles for BoS
- CVD_MISLEADING → Add stricter CVD gate or reduce weight
- OI_MISINTERPRETATION → Add OI trend confirmation requirement
- FUNDING_EXTREME_MISS → Only use funding at z-score > 2
- TIMEFRAME_CONFLICT → Strengthen macro anchoring rule
- DATA_QUALITY → Stricter staleness/reliability checks

═══════════════════════════════════════════════════════════════════════════════
STEP 2: VALIDATE IMPROVEMENT
═══════════════════════════════════════════════════════════════════════════════
Re-run backtest with same parameters as Prompt 3.

COMPARE TO BASELINE:
| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Directional Accuracy | X% | Y% | +/-Z% |
| Confidence Correlation | X | Y | +/-Z |
| WAIT Volatility Ratio | X | Y | +/-Z |
| Dominant Error Count | X | Y | -Z |

DECISION:
- If metrics improved → KEEP the change
- If metrics worse → REVERT and try different approach
- If mixed results → analyze carefully, probably revert

═══════════════════════════════════════════════════════════════════════════════
STEP 3: CALIBRATE CONFIDENCE
═══════════════════════════════════════════════════════════════════════════════
Review confidence calibration report. Adjust if needed.

TARGET CALIBRATION:
| Confidence | Target Accuracy |
|------------|-----------------|
| 3-4 | ~50% (noise level) |
| 5-6 | ~55% |
| 7-8 | ~62% |
| 9-10 | ~70% |

IF NOT CALIBRATED:
- If all overconfident → scale confidence down globally
- If specific buckets wrong → adjust thresholds for those ranges
- Add more penalty for signal conflicts
- Reduce confidence when data quality is poor

Make incremental adjustments, re-test after each.

═══════════════════════════════════════════════════════════════════════════════
STEP 4: CREATE DOCUMENTATION & PROCESS
═══════════════════════════════════════════════════════════════════════════════
CREATE: IMPROVEMENT_LOG.md

## Improvement Log

### Iteration 1 - [Date]
**Dominant Failure:** [Category]
**Fix Applied:** [Description]
**Result:** Improved/Reverted
**Metrics Change:**
- Directional Accuracy: X% → Y%
- Confidence Correlation: X → Y

### Remaining Issues (Priority Order)
1. [Next dominant failure]
2. [Secondary issue]
3. [Future enhancement]

---

CREATE: WEEKLY_CHECKLIST.md

## Weekly Backtest Review Checklist

### Monday: Review
□ Run backtest on past week's data
□ Check all metrics against targets
□ Identify any new error patterns

### Wednesday: Analyze  
□ Deep dive on any failing metrics
□ Analyze top 5 errors from the week
□ Propose fix if needed

### Friday: Iterate
□ Implement proposed fix (if any)
□ Re-run backtest
□ Compare before/after
□ Document results

---

UPDATE: MARKET-ANALYZER-STATUS.md
Add section on backtest quality metrics and current state.

═══════════════════════════════════════════════════════════════════════════════

SUCCESS CRITERIA:
□ Dominant failure addressed (metrics improved or documented why reverted)
□ Confidence calibration reviewed and adjusted if needed
□ IMPROVEMENT_LOG.md created with first iteration documented
□ WEEKLY_CHECKLIST.md created for ongoing process
□ Clear path forward for next iterations
```
SANITY CHECK (Before Next Iteration):
□ Can I explain the current logic in 2 sentences?
□ Would a trader trust this more than yesterday?
□ Am I improving signal QUALITY or just METRICS?
□ Have I added complexity that doesn't help the user?

IF ANY "NO" → Stop and simplify before continuing
---

# Quick Reference: Files Required

Ensure these exist in `/project/docs/` before starting:

| File | Content |
|------|---------|
| `MASTER-SPEC.md` | Philosophy, hierarchy, gating rules |
| `BACKTEST-QUALITY-GUIDE.md` | Metrics, targets, validation criteria |

---

# Execution Summary

```
PROMPT 1 → Fix infrastructure (logic, CVD, multi-TF, outcomes)
    ↓
PROMPT 2 → Implement 5 metrics (accuracy, calibration, WAIT, regime, errors)
    ↓
PROMPT 3 → Run analysis, identify failure, generate baseline
    ↓
PROMPT 4 → Fix, validate, calibrate, document
    ↓
REPEAT Prompt 3-4 for continuous improvement
```

**Total Time: ~8-12 hours of AI execution**

---

*Execution Plan v2.0 - Condensed for AI*  
*December 2025*
