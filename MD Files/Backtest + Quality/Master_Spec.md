# AI Market Analyzer – MASTER SPEC  
### Logic Architecture + Backtest & Calibration Framework  
*(Merged & Unified – INVSIO Flagship Spec)*

---

## 1. Vision & Purpose

The AI Market Analyzer is **not a signal generator** and not a trading bot.  
It is a **real-time market intelligence engine** whose only job is to answer:

> “What is the current market environment, how strong is it, and what is worth paying attention to right now?”

This spec merges:
- **Logic discipline & decision hierarchy** (real-time robustness)
- **Backtest, validation & calibration rigor** (statistical truth)

The result is a system that:
- Thinks clearly  
- Speaks rarely  
- Can be trusted  

---

## 2. Non‑Negotiable Principles

1. **Silence is a feature**  
   WAIT is a valid and often optimal output.

2. **Bias before signals**  
   The system produces *market states*, not trade commands.

3. **Confidence must be earned**  
   A higher confidence score must empirically mean higher correctness.

4. **One change per iteration**  
   Logic evolves through controlled experimentation only.

---

## 3. Decision Hierarchy (Core Logic)

### 3.1 Three‑Layer Contract

#### Layer 1 – Macro (Permission Layer)
Timeframes: 4H / 1D  
Defines:
- Allowed direction(s)
- Dominant regime (trend, distribution, accumulation, chop)

If Macro is unclear or conflicting → **WAIT is enforced**.

---

#### Layer 2 – Micro (Setup Layer)
Timeframes: 30m / 1H / 15m  
Defines:
- Structure (BoS, range, compression)
- Liquidity context
- OI & CVD behavior
- Regime alignment

If no valid setup → **no signal regardless of scalping triggers**.

---

#### Layer 3 – Scalping (Trigger Layer)
Timeframes: 1m / 5m  
Defines:
- Entry timing
- Short-term rejection / absorption
- Micro divergences

Triggers are **ignored** unless Macro + Micro grant permission.

---

## 4. Signal Components & Gating Logic

Components (examples):
- Exchange Divergence
- Market Regime
- Structure
- Volume Profile
- CVD
- OI
- Funding

### 4.1 Gating Rules (Critical)

- Components may be **disabled contextually**, not just weighted.
- Examples:
  - Mixed exchange divergence → warning only, not score input
  - Funding affects bias only at extremes
  - Scalping components cannot override Macro

This reduces false positives more effectively than weight tuning alone.

---

## 5. Liquidity as First‑Class Logic

### Phase 1 – Manual (MVP)
Supported zones:
1. Range highs / lows  
2. Equal highs / lows  
3. Clear swing highs / lows  

Each zone contributes:
- Proximity score
- Reaction score
- Sweep score

Zones act as **context amplifiers**, not standalone signals.

---

### Phase 2 – Automated (Future)
After sufficient labeled history:
- Clustered highs/lows
- Stop pool detection
- Validation against manual accuracy

---

## 6. Market State Object (Single Source of Truth)

Each analysis cycle outputs **one Market State Object** containing:

- Global Bias (Bullish / Bearish / Neutral / WAIT)
- Confidence (calibrated)
- Regime
- Key liquidity zones
- Notable events
- Component contributions
- Human‑readable reasoning

All UI, alerts, AI Coach, and backtests consume this object.

---

## 7. Mandatory Logging (Production Requirement)

### 7.1 Per‑Cycle Snapshot
Logged every analysis cycle:
- Timestamp, price
- Bias & confidence
- Component raw scores, weights, gates
- Regime & structure state
- OI / CVD / funding context
- Reasoning text

### 7.2 Delayed Outcome Log
After horizon expiry:
- Outcome label (Reversal / Continuation / Noise)
- Max favorable & adverse excursion
- Time to threshold

Without this, improvement is impossible.

---

## 8. Ground Truth & Labeling

### 8.1 Outcome Labels
- Reversal  
- Continuation  
- Noise / Chop  

This measures **narrative correctness**, not PnL.

### 8.2 Horizons
- Scalping: 10–60 min  
- Micro: 2–8 hours  
- Macro: 1–5 days  

Movement thresholds start percentage‑based, later ATR‑based.

---

## 9. Backtest & Validation Framework

### 9.1 What We Measure (Not PnL)
- Directional accuracy
- Regime prediction accuracy
- WAIT effectiveness
- Confidence monotonicity
- False positive rate

### 9.2 Confidence Calibration
Group results by confidence bands (1–2, 3–4 … 9–10):
- Hit rate
- Avg MFE / MAE
- Noise rate

Adjust thresholds until:
> Higher confidence → measurably better outcomes

---

## 10. Iteration Loop (Strict)

1. Collect 50–200 recent states
2. Error bucketing:
   - Regime errors
   - Structure errors
   - Liquidity misreads
   - OI / CVD noise
3. Fix **one dominant failure**
4. Re‑run backtests
5. Deploy only if metrics improve

---

## 11. KPIs That Actually Matter

- False positives ↓
- WAIT rate ↑ in chop
- Accuracy for confidence ≥7 ↑
- Bias stability ↑
- Reasoning consistency ↑

---

## 12. Enforcement Rules (MVP)

- Mixed signals → WAIT or very low confidence
- Chop regime → no signals
- Macro overrides Micro & Scalping
- No liquidity → reduced confidence

---

## 13. Execution Roadmap (14 Days)

**Days 1–2**
- Full logging
- Label framework

**Days 3–5**
- Error bucketing
- Identify dominant failure

**Days 6–9**
- Single logic fix
- Backtest comparison

**Days 10–12**
- Confidence calibration

**Days 13–14**
- Manual liquidity integration

---

## Final Statement

This specification produces a system that:
- Thinks before it speaks  
- Knows when it does not know  
- Improves through evidence, not intuition  

This is the foundation for a **trustworthy market intelligence platform**, not a noisy signal machine.
