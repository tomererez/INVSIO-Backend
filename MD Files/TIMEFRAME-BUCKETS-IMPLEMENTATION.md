# Timeframe Buckets Implementation Plan

**Date:** 2025-12-12  
**Status:** ✅ COMPLETED  
**Estimated Time:** 20 minutes

---

## 1. Executive Summary

Implement a 3-tier timeframe analysis system (MACRO/MICRO/SCALPING) with hierarchical decision-making where MACRO bucket anchors the final trading decision.

---

## 2. Timeframe Bucket Definitions

| Bucket | Timeframes | Purpose | Target Trader |
|--------|------------|---------|---------------|
| **MACRO** | 1D + 4H | Trend direction, major structure | Position/Swing traders |
| **MICRO** | 4H + 1H | Swing timing, entry zones | Swing traders |
| **SCALPING** | 1H + 30M | Intraday momentum, quick entries | Day traders |

---

## 3. Backend Implementation

### 3.1 New Function: `generateTimeframeBuckets()`

**File:** `src/services/marketMetrics.js`

```javascript
function generateTimeframeBuckets(tfMetrics) {
  // Bucket definitions
  const bucketConfig = {
    macro: { timeframes: ['1d', '4h'], weight: 0.5 },
    micro: { timeframes: ['4h', '1h'], weight: 0.3 },
    scalping: { timeframes: ['1h', '30m'], weight: 0.2 }
  };

  const buckets = {};
  
  for (const [bucketName, config] of Object.entries(bucketConfig)) {
    const tfData = config.timeframes
      .map(tf => tfMetrics[tf])
      .filter(Boolean);
    
    if (tfData.length === 0) {
      buckets[bucketName] = createDefaultBucket(config.timeframes);
      continue;
    }
    
    // Aggregate bias scores from constituent timeframes
    const avgLong = average(tfData.map(d => d.finalDecision?.scores?.long || 0));
    const avgShort = average(tfData.map(d => d.finalDecision?.scores?.short || 0));
    const avgWait = average(tfData.map(d => d.finalDecision?.scores?.wait || 0));
    
    // Determine bucket bias
    const bias = determineBias(avgLong, avgShort, avgWait);
    const confidence = calculateConfidence(avgLong, avgShort, avgWait);
    
    // Determine tradeStance
    const tradeStance = deriveTradeStanceFromBucket(bias, confidence);
    
    // Generate summary and bullets
    const { summary, bullets } = generateBucketNarrative(bucketName, tfData, bias);
    
    buckets[bucketName] = {
      bias,
      tradeStance,
      confidence,
      status: bias.toLowerCase(),
      summary,
      bullets,
      timeframes: config.timeframes
    };
  }
  
  return buckets;
}
```

---

### 3.2 TradeStance Logic Per Bucket

```javascript
function deriveTradeStanceFromBucket(bias, confidence) {
  if (confidence >= 60) {
    if (bias === 'BEARISH') return 'LOOK_FOR_SHORTS';
    if (bias === 'BULLISH') return 'LOOK_FOR_LONGS';
  }
  return 'AVOID_TRADING';
}
```

---

### 3.3 New Function: `applyMacroHierarchy()`

**File:** `src/services/marketMetrics.js`

```javascript
function applyMacroHierarchy(finalDecision, buckets) {
  const macro = buckets.macro;
  const scalping = buckets.scalping;
  
  // If MACRO has conviction (>= 60%) and is not neutral
  if (macro.confidence >= 60 && macro.bias !== 'NEUTRAL') {
    
    // Check if lower TF is opposing
    const lowerTfOpposing = 
      (macro.bias === 'BEARISH' && scalping.bias === 'BULLISH') ||
      (macro.bias === 'BULLISH' && scalping.bias === 'BEARISH');
    
    if (!lowerTfOpposing) {
      // MACRO anchors the decision
      finalDecision.bias = macro.bias === 'BEARISH' ? 'SHORT' : 'LONG';
      finalDecision.tradeStance = macro.tradeStance;
      finalDecision.macroAnchored = true;
      
      // Add warning if scalping is neutral (consolidating)
      if (scalping.bias === 'NEUTRAL') {
        finalDecision.warning = 'Lower TF consolidating - wait for setup';
      }
    } else {
      // Lower TF opposing - add conflict warning
      finalDecision.warning = 'Lower TF opposing macro trend - reduced conviction';
      finalDecision.macroAnchored = false;
    }
  } else {
    finalDecision.macroAnchored = false;
  }
  
  return finalDecision;
}
```

---

### 3.4 Integration Point in `calculateMarketMetrics()`

**Location:** Before final return statement (~line 1403)

```javascript
// Generate timeframe buckets
const timeframeBuckets = generateTimeframeBuckets(tfMetrics);

// Apply macro hierarchy to final decision
const enhancedDecision = applyMacroHierarchy({
  bias: finalBias,
  confidence: finalConfidence,
  tradeStance,
  scores: { long: aggLong, short: aggShort, wait: aggWait },
  signals: primaryMetrics?.finalDecision?.signals || [],
  reasoning: finalReasoning,
  macroOverride: wasMacroOverridden ? { triggered: true, reason: macroOverrideReason } : null,
  primaryRegime,
  riskMode
}, timeframeBuckets);

// Add to return object
return {
  // ... existing fields ...
  finalDecision: enhancedDecision,
  timeframeBuckets,  // NEW
  // ... rest of return ...
};
```

---

## 4. Expected Response Structure

```json
{
  "success": true,
  "data": {
    "timestamp": 1702345678000,
    
    "finalDecision": {
      "bias": "SHORT",
      "confidence": 7.2,
      "tradeStance": "LOOK_FOR_SHORTS",
      "macroAnchored": true,
      "warning": "Lower TF consolidating - wait for setup",
      "scores": { "long": 2, "short": 8, "wait": 3 },
      "signals": [...],
      "reasoning": [...],
      "primaryRegime": "trending",
      "riskMode": "NORMAL"
    },
    
    "timeframeBuckets": {
      "macro": {
        "bias": "BEARISH",
        "tradeStance": "LOOK_FOR_SHORTS",
        "confidence": 72,
        "status": "bearish",
        "summary": "Downtrend intact. Lower highs/lower lows structure.",
        "bullets": [
          "OI rising into price decline - new shorts",
          "CVD negative on both exchanges"
        ],
        "timeframes": ["1d", "4h"]
      },
      "micro": {
        "bias": "BEARISH",
        "tradeStance": "LOOK_FOR_SHORTS",
        "confidence": 58,
        "status": "bearish",
        "summary": "Weak bounces rejected. Sellers in control.",
        "bullets": [
          "Funding resetting from negative",
          "Bybit OI declining - whale distribution"
        ],
        "timeframes": ["4h", "1h"]
      },
      "scalping": {
        "bias": "NEUTRAL",
        "tradeStance": "AVOID_TRADING",
        "confidence": 40,
        "status": "neutral",
        "summary": "Chop zone. No clear intraday edge.",
        "bullets": [
          "Price flat, OI flat - no conviction",
          "Wait for breakout or structure break"
        ],
        "timeframes": ["1h", "30m"]
      }
    },
    
    "exchangeDivergence": {...},
    "marketRegime": {...},
    "timeframes": {...}
  }
}
```

---

## 5. Frontend Implementation

### 5.1 New Component: `TimeframeBucketCard`

**File:** `frontend/src/MarketAnalyzerTester.jsx`

```jsx
function TimeframeBucketCard({ title, subtitle, bias, tradeStance, confidence, summary, bullets }) {
  const getBiasColor = (bias) => {
    if (bias === 'BULLISH') return 'bg-emerald-500';
    if (bias === 'BEARISH') return 'bg-red-500';
    return 'bg-slate-500';
  };
  
  const getBiasTextColor = (bias) => {
    if (bias === 'BULLISH') return 'text-emerald-400';
    if (bias === 'BEARISH') return 'text-red-400';
    return 'text-slate-400';
  };

  return (
    <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-white font-bold">{title}</h3>
          <p className="text-slate-400 text-xs">{subtitle}</p>
        </div>
        <span className={`px-2 py-1 rounded text-xs font-bold ${getBiasColor(bias)} text-white`}>
          {bias}
        </span>
      </div>
      
      <p className="text-slate-300 text-sm mb-3">{summary}</p>
      
      <ul className="space-y-1">
        {bullets.map((bullet, i) => (
          <li key={i} className="text-slate-400 text-xs flex items-center gap-2">
            <span className={getBiasTextColor(bias)}>•</span>
            {bullet}
          </li>
        ))}
      </ul>
      
      <div className="mt-3 pt-3 border-t border-slate-700/50 flex justify-between">
        <span className="text-slate-500 text-xs">Confidence</span>
        <span className={`text-sm font-mono ${getBiasTextColor(bias)}`}>
          {confidence}%
        </span>
      </div>
    </div>
  );
}
```

---

### 5.2 Warning Banner Component

```jsx
{data.finalDecision?.macroAnchored && data.finalDecision?.warning && (
  <div className="bg-amber-500/20 border border-amber-500/30 rounded-lg p-3 flex items-center gap-2">
    <AlertTriangle className="w-5 h-5 text-amber-400" />
    <span className="text-amber-400 text-sm">
      {data.finalDecision.warning}
    </span>
  </div>
)}
```

---

### 5.3 Layout Integration

Add below the main gauge section:

```jsx
{/* Timeframe Buckets */}
{marketData?.timeframeBuckets && (
  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
    <TimeframeBucketCard
      title="MACRO"
      subtitle="D-4H TIMEFRAME"
      {...marketData.timeframeBuckets.macro}
    />
    <TimeframeBucketCard
      title="MICRO"
      subtitle="4H-1H TIMEFRAME"
      {...marketData.timeframeBuckets.micro}
    />
    <TimeframeBucketCard
      title="SCALPING"
      subtitle="1H-30M TIMEFRAME"
      {...marketData.timeframeBuckets.scalping}
    />
  </div>
)}
```

---

## 6. Files to Modify

| File | Changes | Est. Lines |
|------|---------|------------|
| `src/services/marketMetrics.js` | Add `generateTimeframeBuckets()`, `deriveTradeStanceFromBucket()`, `applyMacroHierarchy()`, `generateBucketNarrative()` | +150 |
| `src/services/marketMetrics.js` | Modify `calculateMarketMetrics()` to integrate | +10 |
| `frontend/src/MarketAnalyzerTester.jsx` | Add `TimeframeBucketCard` component | +60 |
| `frontend/src/MarketAnalyzerTester.jsx` | Add warning banner + layout integration | +30 |

**Total: ~250 lines**

---

## 7. Execution Order

| Step | Task | Time |
|------|------|------|
| 1 | Add helper functions to `marketMetrics.js` | 5 min |
| 2 | Add `generateTimeframeBuckets()` | 5 min |
| 3 | Add `applyMacroHierarchy()` | 3 min |
| 4 | Integrate into `calculateMarketMetrics()` return | 2 min |
| 5 | Add `TimeframeBucketCard` to frontend | 3 min |
| 6 | Add warning banner to frontend | 2 min |
| 7 | Test end-to-end | 2 min |

**Total: ~22 minutes**

---

## 8. Success Criteria

- [ ] `/api/ai-market-analyzer/btc` returns `timeframeBuckets` object
- [ ] Each bucket has: `bias`, `tradeStance`, `confidence`, `status`, `summary`, `bullets`, `timeframes`
- [ ] `finalDecision.macroAnchored` is set correctly
- [ ] `finalDecision.warning` appears when lower TF consolidating
- [ ] Frontend displays 3 bucket cards
- [ ] Frontend shows warning banner when applicable

---

## READY FOR EXECUTION ✅
