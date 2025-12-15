# INVSIO — Logical Implementation & Validation Plan (Antigravity-Ready)

This document converts the Claude Backtest Execution Plan into a **logic-only, system-behavior specification**, aligned with the INVSIO MASTER SPEC.

⚠️ No code. No algorithms. No file names.
This document defines what the system must do, not how it is coded.

Before executing any stage, Antigravity must read:
- Master_Spec.md
- This document in full

---

## STAGE 1 — Market State Truth & Logging Foundation

### Objective
Ensure the system produces a single, auditable truth per analysis cycle.

### System Requirements
- The analyzer emits exactly one Market State Object per cycle.
- Each state represents the system’s best understanding of the market at that moment.
- States are produced even when the outcome is WAIT.

### Required State Contents
- Timestamp & price reference
- Market bias (Bullish / Bearish / Neutral / WAIT)
- Confidence score (0–10)
- Market regime classification
- Active liquidity / structure context
- Component-level influence summaries
- Human-readable, non-directive reasoning

### Logging Behavior
- Every state is logged as a snapshot.
- No overwriting, no silent corrections.
- Each snapshot can later be evaluated against outcomes.

### Validation Goal
Every historical decision can be reconstructed and explained.

---

## STAGE 2 — Outcome Labeling & Ground Truth

### Objective
Create a reality-based evaluation layer independent of trading results.

### Outcome Labels
Each Market State resolves into exactly one:
- Reversal
- Continuation
- Noise / Chop

### Time Horizons
- Scalping: minutes
- Micro: hours
- Macro: days

### Principles
- Labels evaluate narrative correctness, not profitability.
- A correct WAIT in chop is a success.
- Labels are deterministic and repeatable.

### Validation Goal
The system can be judged on whether it read the market correctly.

---

## STAGE 3 — Backtest Quality Metrics (Non-PnL)

### Objective
Measure the quality of the Analyzer as an intelligence system.

### Primary Metrics
- Directional accuracy of bias
- Regime classification accuracy
- WAIT effectiveness
- False positive rate
- Confidence monotonicity

### Confidence Bands
Results are grouped by confidence ranges (e.g. 1–2, 3–4 … 9–10).

### Validation Goal
Determine whether the Analyzer is improving meaningfully.

---

## STAGE 4 — Error Bucketing & Dominant Failure

### Objective
Enable disciplined improvement without overfitting.

### Error Categories
- Regime misclassification
- Structure misread
- Liquidity misinterpretation
- Derivatives noise
- Data ambiguity

### Rules
- Only one dominant failure is addressed per iteration.
- No multi-fix releases.

---

## STAGE 5 — Confidence Calibration

### Objective
Align confidence scores with real-world reliability.

### Principles
- Higher confidence must equal higher correctness.
- Silence is preferable to false certainty.

---

## STAGE 6 — Iteration Governance

### Objective
Prevent regression and uncontrolled drift.

### Rules
- One logic change per cycle
- Mandatory re-evaluation before deployment
