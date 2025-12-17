# Absorption Detection & Resolution - Logic Specification v3 (Final)

## Overview

Two-phase detection system for Absorption events:
1. **Phase 1 (Real-time):** Detect Absorption as it happens
2. **Phase 2 (After N candles):** Classify as TRAP or ACCUMULATION/DISTRIBUTION

---

## Core Concept

### What is Absorption?
```
Absorption = Aggressive buying/selling (CVD) WITHOUT price response

CVD strong + Price not moving = Someone is absorbing the flow
```

### Why it matters:
- Absorption near resistance → likely distribution / long trap
- Absorption near support → likely accumulation / short trap
- But we don't KNOW until we see what happens next

---

## Database Table: `absorption_events`

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| market_state_id | UUID | FK to market_states |
| detected_at | BIGINT | Timestamp of detection |
| symbol | TEXT | 'BTC' |
| timeframe | TEXT | '30m' / '1h' / '4h' / '1d' |
| cvd_direction | TEXT | 'buying' / 'selling' |
| cvd_strength | DECIMAL | Normalized CVD slope value |
| cvd_noise_floor | DECIMAL | Dynamic threshold used for detection |
| oi_behavior | TEXT | 'rising' / 'stable' / 'falling' |
| oi_at_detection | DECIMAL | OI value when detected |
| price_response | TEXT | 'flat' / 'opposite' |
| price_at_detection | DECIMAL | Price when detected |
| location | TEXT | 'near_resistance' / 'near_support' / 'mid_range' |
| sr_level_used | DECIMAL | The actual S/R level used for location |
| resolved_at | BIGINT | Timestamp when resolved (NULL until resolved) |
| resolution | TEXT | 'TRAP' / 'ACCUMULATION' / 'DISTRIBUTION' / 'EXPIRED' |
| resolution_reason | TEXT | Human-readable explanation |
| resolution_criteria | JSONB | Which criteria matched |
| extensions_used | INTEGER | Number of times resolution was extended (max 1) |
| created_at | TIMESTAMPTZ | Record creation time |

### Database Constraint (Prevent Duplicate Open Events):
```sql
CREATE UNIQUE INDEX absorption_unique_open 
ON absorption_events (symbol, timeframe, cvd_direction) 
WHERE resolved_at IS NULL;
```

---

## CVD Slope Calculation (Exact Definition)

**This is the single source of truth for cvdSlopeNorm calculation:**

### Step 1: Per-candle Normalized Delta
```
FOR each candle:
  buyUsd = taker_buy_volume_usd
  sellUsd = taker_sell_volume_usd
  totalUsd = buyUsd + sellUsd
  
  IF totalUsd > 0:
    perCandleDelta = (buyUsd - sellUsd) / totalUsd
  ELSE:
    perCandleDelta = 0
    
Result: value between -1 and +1 per candle
```

### Step 2: Build Normalized Series
```
cvdSeriesNorm = array of last 50 perCandleDelta values
(ordered oldest to newest)
```

### Step 3: Calculate Slope on Recent Window
```
recentWindow = cvdSeriesNorm.slice(-10)  // last 10 candles only
cvdSlopeNorm = linearRegressionSlope(recentWindow)

Linear regression slope formula:
  slope = (n * Σxy - Σx * Σy) / (n * Σx² - (Σx)²)
  where x = index (0-9), y = perCandleDelta value
```

### Step 4: Calculate Dynamic Noise Floor
```
cvdNoiseFloor = standardDeviation(cvdSeriesNorm) * 1.5

Note: STD is calculated on FULL 50 candles, not just last 10
This gives a stable baseline for "what is normal" in this market
```

### Summary:
```
cvdSlopeNorm = slope of last 10 normalized deltas
cvdNoiseFloor = STD of last 50 normalized deltas × 1.5
CVD is "strong" when: |cvdSlopeNorm| > cvdNoiseFloor
```

---

## Phase 1: Detection Logic

### Trigger Conditions (ALL must be true):

**Condition 1: Strong CVD (Dynamic Threshold)**
```
Calculate cvdNoiseFloor as defined above.

CVD is "strong" if:
  |cvdSlopeNorm| > cvdNoiseFloor

Store cvdNoiseFloor in the event for debugging/validation.
```

**Condition 2: Price Not Responding**
```
Price threshold per timeframe:
  30m: 0.25%
  1h:  0.4%
  4h:  0.65%
  1d:  1.15%

Price not responding if EITHER:
  - Price is flat: |priceChange| < threshold
  - Price is OPPOSITE to CVD:
    - CVD rising (buying) + priceChange < 0
    - CVD falling (selling) + priceChange > 0
```

### Location Classification (Strict Definition):

```
S/R Definition (ONLY use this - no alternatives):
  resistance = lastSwingHigh from structure detection
  support = lastSwingLow from structure detection

Near threshold: 0.3%

Classification:
  IF price > resistance * 0.997 → location = "near_resistance"
  IF price < support * 1.003 → location = "near_support"  
  ELSE → location = "mid_range"

REQUIRED: Store sr_level_used in the event (the actual price level used).
```

### Detection Output:

```json
{
  "detected": true,
  "cvdDirection": "buying | selling",
  "cvdStrength": 0.035,
  "cvdNoiseFloor": 0.018,
  "oiBehavior": "rising | stable | falling",
  "oiAtDetection": 7895465243,
  "priceResponse": "flat | opposite",
  "priceAtDetection": 86500,
  "location": "near_resistance | near_support | mid_range",
  "srLevelUsed": 87200,
  "detectedAt": 1702389600000
}
```

### Action on Detection:
1. Check if open absorption already exists (same symbol/tf/direction)
   - If exists: Do NOT create duplicate (DB constraint will prevent anyway)
   - If not: Insert new event
2. Add warning to market state output
3. **DO NOT modify bias** - detection phase is observation only
4. **DO NOT modify confidence** - detection phase is observation only

---

## Phase 2: Resolution Logic

### Timing - When to Check:

| Timeframe | Check after N candles | Time equivalent | Max extension |
|-----------|----------------------|-----------------|---------------|
| 30m | 6 candles | 3 hours | +3 candles |
| 1h | 4 candles | 4 hours | +2 candles |
| 4h | 3 candles | 12 hours | +1 candle |
| 1d | 2 candles | 2 days | +1 candle |

### Extension Rules (Strict):
```
maxExtensions = 1
extensionAllowed ONLY IF: missing > 20% of expected candles (data gap)

IF extended once AND still unresolved:
  resolution = "EXPIRED"
  resolution_reason = "Could not resolve within allowed window"

NEVER extend because "still unclear" - that is NOT a valid reason.
```

### Resolution Criteria:

#### TRAP (2 out of 3 must be true):

| # | Criterion | Strict Definition |
|---|-----------|-------------------|
| 1 | Sweep + Rejection | Price wicked beyond S/R level (sr_level_used) then closed back inside range within same or next candle |
| 2 | Reversal + Break | Price broke the OPPOSITE swing within N candles (if buying absorption → price broke swing low; if selling absorption → price broke swing high) |
| 3 | OI Spike + Drop + Reversal | ALL THREE must occur: (a) OI increased during absorption period, (b) OI dropped >30% of that increase within N candles, (c) Price moved against absorption direction during the OI drop |

**OI Threshold: 30% - This is the ONLY number used throughout this spec.**

#### ACCUMULATION (2 out of 3 must be true):

| # | Criterion | Strict Definition |
|---|-----------|-------------------|
| 1 | Correct Location | Buying absorption near support OR Selling absorption near resistance |
| 2 | Range Holds | Price stayed within range - did NOT break swing opposite to CVD direction |
| 3 | OI Stable | OI remained within ±15% of oi_at_detection, no single candle with >30% OI drop |

#### DISTRIBUTION (same logic as ACCUMULATION but):
- Selling absorption near resistance that holds
- Results in SHORT bias implication

### Resolution Logic Flow:

```
EVERY ANALYSIS CYCLE:

1. Query all unresolved absorptions:
   SELECT * FROM absorption_events 
   WHERE resolved_at IS NULL 
   AND symbol = 'BTC'

2. FOR EACH unresolved absorption:
   
   a. Calculate candles_since_detection
   b. Get N for this timeframe
   
   c. IF candles_since_detection < N:
      → Skip (too early)
      
   d. IF candles_since_detection >= N:
      → Run resolution checks
      
   e. Fetch data since detection:
      - Price candles
      - OI values
      - Swing levels
      
   f. Check for data gaps:
      IF missing > 20% of expected candles:
        IF extensions_used == 0:
          → Extend: UPDATE extensions_used = 1, continue to next cycle
        ELSE:
          → Expire: resolution = "EXPIRED"
          
   g. Count TRAP criteria matches (0-3)
   h. Count ACCUMULATION criteria matches (0-3)
   
   i. Determine resolution:
      IF trap_matches >= 2:
        resolution = "TRAP"
        IF cvd_direction == "buying":
          bias_implication = "SHORT" (longs trapped)
        ELSE:
          bias_implication = "LONG" (shorts trapped)
          
      ELSE IF accum_matches >= 2:
        IF cvd_direction == "buying":
          resolution = "ACCUMULATION"
          bias_implication = "LONG"
        ELSE:
          resolution = "DISTRIBUTION" 
          bias_implication = "SHORT"
          
      ELSE IF candles_since_detection > N * 2:
        resolution = "EXPIRED"
        bias_implication = "WAIT"
        
      ELSE:
        → Continue monitoring (don't resolve yet)
        
   j. UPDATE absorption_events:
      SET resolved_at = now(),
          resolution = <r>,
          resolution_reason = <explanation>,
          resolution_criteria = <JSON of which criteria matched>
```

---

## Integration with Market State

### During Detection (Phase 1):

```json
{
  "absorption": {
    "status": "DETECTING",
    "cvdDirection": "buying",
    "location": "near_resistance",
    "detectedAt": 1702389600000,
    "warning": "Buying absorption detected near resistance - monitoring"
  }
}
```

**CRITICAL RULES during DETECTING phase:**
- DO NOT modify bias
- DO NOT modify confidence
- DO NOT "reduce confidence slightly"
- DO NOT add any penalty
- ONLY add the warning field to output
- Let normal signals determine bias/confidence completely

### After Resolution (Phase 2):

```json
{
  "absorption": {
    "status": "RESOLVED",
    "resolution": "TRAP",
    "biasImplication": "SHORT",
    "confidenceBonus": 2,
    "criteriaMatched": ["sweep_rejection", "oi_spike_drop"],
    "reason": "Buying absorption near resistance resolved as TRAP - sweep rejected, OI unwound with price reversal"
  }
}
```

### Impact on Final Decision:

```
IF absorption.status == "DETECTING":
  → DO NOTHING
  → No bias change
  → No confidence change
  → Warning in output only

IF absorption.status == "RESOLVED":

  IF resolution == "TRAP":
    → Add +2 confidence to opposite bias
    → Add reasoning: "Recent {direction} trap confirmed"
    
  IF resolution == "ACCUMULATION":
    → Add +2 confidence to LONG
    → Add reasoning: "Accumulation phase completed"
    
  IF resolution == "DISTRIBUTION":
    → Add +2 confidence to SHORT
    → Add reasoning: "Distribution phase completed"
    
  IF resolution == "EXPIRED":
    → No impact on bias
    → No impact on confidence
    → Add reasoning: "Previous absorption signal expired without resolution"
```

---

## Implementation Steps

### Step 1: Add CVD Calculation Functions
- Location: `marketMetrics.js`
- Functions:
  - `calculatePerCandleDelta(candle)` → returns normalized delta (-1 to +1)
  - `buildCvdSeriesNorm(candles, windowSize = 50)` → returns array
  - `calculateCvdSlopeNorm(cvdSeriesNorm, slopeWindow = 10)` → returns slope
  - `calculateCvdNoiseFloor(cvdSeriesNorm)` → returns STD * 1.5

### Step 2: Add Detection Function
- Location: `marketMetrics.js`
- Function: `detectAbsorption(cvdData, oiData, priceData, structure, timeframe)`
- Must store: cvdNoiseFloor, srLevelUsed, oiAtDetection, priceAtDetection
- Returns: Absorption object or null

### Step 3: Add Database Operations
- Location: `services/absorptionService.js` (new file)
- Functions:
  - `saveAbsorptionEvent(event)` - handles duplicate gracefully
  - `getUnresolvedAbsorptions(symbol)`
  - `resolveAbsorption(id, resolution, reason, criteria)`
  - `extendAbsorption(id)` - increment extensions_used

### Step 4: Add Resolution Checker
- Location: `services/absorptionService.js`
- Function: `checkAndResolveAbsorptions(currentMarketData)`
- Implements full resolution logic
- Called every analysis cycle

### Step 5: Integrate with Market State Output
- Modify `calculateMarketMetrics()`:
  1. Call `detectAbsorption()` 
  2. Call `checkAndResolveAbsorptions()`
  3. Add `absorption` field to output
  4. Apply confidence bonus ONLY for RESOLVED events
  5. NEVER modify anything for DETECTING events

---

## Edge Cases

### Multiple Absorptions (Different Timeframes)
- Can have open absorptions on 1h AND 4h simultaneously
- Each resolved independently based on its own N candles
- Higher timeframe resolution takes priority in final decision

### Absorption During Absorption (Same Timeframe)
```
IF new absorption detected while previous unresolved:
  IF same cvd_direction:
    → Do nothing (DB constraint prevents duplicate)
    → Existing event continues tracking
  IF opposite cvd_direction:
    → Resolve previous as "INVALIDATED" 
    → Create new event for opposite direction
```

### Data Gaps
```
IF missing > 20% of expected candles in resolution window:
  IF extensions_used == 0:
    → Extend by N/2 candles
    → SET extensions_used = 1
  ELSE:
    → Resolve as "EXPIRED"
    → reason = "Insufficient data for resolution"
```

### Absorption Resolves But Market Already Moved
```
IF resolution == "TRAP" but price already reversed >2% from detection price:
  → Still record the resolution
  → Reduce confidence bonus to +1 instead of +2
  → reason includes: "Late confirmation - move already occurred"
```

---

## Example Scenarios

### Scenario 1: Long Trap
```
Detection:
  - cvdSlopeNorm = 0.04, cvdNoiseFloor = 0.02 → strong (0.04 > 0.02) ✓
  - Price change: +0.1% (flat, threshold 0.4% for 1h) ✓
  - Location: near_resistance (price 86,900, resistance 87,000)
  - OI: rising
  
After 4 candles (1h timeframe):
  ✓ Criterion 1: Price wicked to 87,150 then closed at 86,400 (sweep_rejection)
  ✓ Criterion 2: Price broke swing low 86,200 (reversal_break)
  ✓ Criterion 3: OI 7.9B → 8.1B → 7.84B (spike +0.2B, then drop 0.26B = 130% of increase > 30%) + price reversed
  
Resolution: TRAP (3/3 criteria)
Bias implication: SHORT
Confidence bonus: +2
```

### Scenario 2: Accumulation
```
Detection:
  - cvdSlopeNorm = 0.03, cvdNoiseFloor = 0.015 → strong ✓
  - Price change: -0.2% (opposite to buying CVD) ✓
  - Location: near_support (price 85,100, support 85,000)
  - OI: rising
  
After 4 candles:
  ✓ Criterion 1: Correct location (buying near support)
  ✓ Criterion 2: Price held above 85,000, no break of swing low (range_holds)
  ✓ Criterion 3: OI stable: 7.8B → 7.85B → 7.82B (within ±15%)
  
Resolution: ACCUMULATION (3/3 criteria)
Bias implication: LONG
Confidence bonus: +2
```

### Scenario 3: Expired
```
Detection:
  - CVD strong, price flat
  - Location: mid_range (not near S/R)
  - OI: stable
  
After 4 candles:
  ✗ Criterion 1 (TRAP): No sweep
  ✗ Criterion 2 (TRAP): No reversal break
  ✗ Criterion 3 (TRAP): No OI spike/drop pattern
  ✗ Criterion 1 (ACCUM): Location not "correct" (mid-range)
  ✓ Criterion 2 (ACCUM): Range held
  ✓ Criterion 3 (ACCUM): OI stable
  
Score: TRAP 0/3, ACCUM 2/3 but location wrong → doesn't qualify

After 8 candles (extended once for data gap):
  Still no clear pattern
  
Resolution: EXPIRED
Bias implication: None
Confidence bonus: 0
```

---

## Confidence Scoring Summary

| Resolution | Confidence Bonus | Condition |
|------------|-----------------|-----------|
| TRAP | +2 | Normal |
| TRAP (late) | +1 | Price already moved >2% |
| ACCUMULATION | +2 | Normal |
| DISTRIBUTION | +2 | Normal |
| EXPIRED | 0 | No impact |
| DETECTING | 0 | **No impact whatsoever** |

---

## Validation Checklist

Before deployment, verify ALL of these:

- [ ] `cvdSlopeNorm` calculated on last 10 candles of normalized series
- [ ] `cvdNoiseFloor` calculated as STD of last 50 candles × 1.5
- [ ] S/R uses ONLY `lastSwingHigh` / `lastSwingLow` (no alternatives)
- [ ] DB unique constraint prevents duplicate open events
- [ ] Extension allowed only once, only for data gaps (>20% missing)
- [ ] DETECTING phase has ZERO impact on bias
- [ ] DETECTING phase has ZERO impact on confidence
- [ ] RESOLVED phase adds exactly +2 (or +1 if late) confidence bonus
- [ ] OI threshold is 30% everywhere (not 50%, not any other number)
- [ ] TRAP OI criterion requires ALL THREE sub-conditions

---

## Constants Reference

```
OI_DROP_THRESHOLD = 0.30 (30%) — used everywhere for OI criteria
OI_STABLE_RANGE = 0.15 (±15%) — for ACCUMULATION OI stable check
NEAR_SR_THRESHOLD = 0.003 (0.3%) — for location classification
CVD_NOISE_MULTIPLIER = 1.5 — for calculating noise floor
CVD_SERIES_WINDOW = 50 — candles for building normalized series
CVD_SLOPE_WINDOW = 10 — candles for calculating slope

PRICE_THRESHOLDS = {
  '30m': 0.0025 (0.25%)
  '1h':  0.004 (0.4%)
  '4h':  0.0065 (0.65%)
  '1d':  0.0115 (1.15%)
}

RESOLUTION_CANDLES = {
  '30m': 6
  '1h':  4
  '4h':  3
  '1d':  2
}

MAX_EXTENSIONS = 1
DATA_GAP_THRESHOLD = 0.20 (20%)
LATE_CONFIRMATION_THRESHOLD = 0.02 (2%)
```

---

## Summary

```
Detection: 
  |cvdSlopeNorm| > cvdNoiseFloor + Price not responding 
  → Flag as DETECTING
  → Add warning only
  → DO NOT touch bias or confidence

Resolution (after N candles):
  Check 3 criteria for TRAP (need 2/3)
  Check 3 criteria for ACCUMULATION/DISTRIBUTION (need 2/3)
  
Impact: 
  RESOLVED → +2 confidence to implied bias
  DETECTING → warning only, zero impact
  EXPIRED → zero impact
```

---

*Version 3 - Final*
*All thresholds unified, CVD calculation fully specified, DETECTING impact explicitly prohibited*
