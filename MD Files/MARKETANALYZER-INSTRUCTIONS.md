

# AI Market Analyzer – Backend Architecture & Reasoning (Spec for Antigravity)

## 1. Purpose & Vision

The **AI Market Analyzer** is the flagship engine of the platform.

Its job is **not** to throw random “signals” or buy/sell calls.  
Its job is to act as a **real-time market intelligence brain** for BTC, running continuously in the background, and emitting a single, clean **Market State Object** every cycle.

That Market State Object answers, in human terms:

> “What is happening in the BTC market right now, across venues and timeframes,  
> how strong is that view, and which areas are most important to watch?”

The Analyzer must:

- See **deeper than normal indicators** (order flow, liquidity, OI, liquidations, funding).
- Work across **multiple timeframes at once** (from 1m to 1D).
- Merge data from **multiple venues** for the same asset (Bybit Coin-M + Binance USDT).
- Output **one structured state** that other layers (UI, AI Coach, Alerts) can consume.
- Be **rules-first** and use an LLM as a **reasoning and explanation layer**, not as a black-box oracle.

This document describes **what** to build and **how it behaves**, not the code or specific technologies.

---

## 2. MVP Scope

### 2.1 Supported Markets (v1)

- **Asset**: BTC only.
- **Venues**:
  - Bybit Coin-M futures (coin-margined BTC contract).
  - Binance USDT perpetual contract.

The engine treats these as **two different “views” of BTC** and can compare them to understand:

- Flows differences (who is more aggressive where).
- OI and funding divergences between venues.
- Where the more “aggressive” money is positioned.

Later, additional assets can be added using the same pattern.

---



### 2.2 Timeframes & Data Resolution Constraints

The Analyzer works conceptually across a full spectrum of timeframes:

- 1m, 5m,15m  → scalping layer
- 30m, 1h → intraday / micro layer
- 4h, 1d  → macro layer

Important implementation note:

- Coinglass currently provides data (candles and derivatives metrics such as OI, funding, liquidations) up to a **30-minute resolution** - due to API subscription limit - in the future we going to have access to all timeframes.
- Exchange data (Binance USDT, Bybit Coin-M) will provide candles at all required timeframes (1m up to 1d).

Therefore, the architecture assumes:

- **Price & volume** for all timeframes (1m–1d) are taken directly from the exchanges.
- **Derivatives metrics** from Coinglass are ingested at **30m resolution** and then:
  - Used directly for 30m analysis.
  - Aggregated into higher timeframes (1h, 4h, 1d) inside the engine.
  - Associated as “background context” for lower timeframes (1m, 5m, 15m).

This allows the system to keep the three key perspectives:

- **Scalping view** (1m, 5m)  
- **Intraday/micro view** (15m, 30m, 1h)  
- **Macro view** (4h, 1d)  



---

### 2.3 Data Requirements (Depth & Quality)

For BTC on each venue, the Analyzer expects **institutional-grade data**, including:

- Candles (OHLCV) per timeframe.
- Traded volume.
- **Order flow metrics**:
  - Aggressive buy vs sell volume (tape / delta).
  - Cumulative Volume Delta (CVD).
- **Open Interest**:
  - Per exchange, per contract.
  - Changes over the last cycles.
- **Liquidations**:
  - Long and short liqs, size and time clustering.
- **Funding rate**:
  - Current level.
  - Recent changes.
- Potentially: bid/ask depth snapshots or orderbook imbalance, if available.

If a data source does not provide everything, the Analyzer should still be designed as if this full set is the **target**. The architecture assumes **rich data**, not “minimal indicators”.

---

## 3. High-Level Architecture

The Analyzer can be thought of as a **pipeline with distinct layers**, running on a fixed schedule (e.g., every 1–5 minutes):

1. **Data Layer** – Fetches and normalizes raw market data from Bybit, Binance, and Coinglass-style sources.
2. **Feature Layer** – Converts raw data into derived features: indicators, structure, liquidity markers.
3. **Timeframe Analysis Layer** – Builds a structured understanding per timeframe.
4. **Multi-Timeframe Aggregation Layer** – Merges all timeframes into a coherent **Market Context**.
5. **Market State Engine** – Produces the final **Market State Object**.
6. **AI Reasoning Layer (LLM)** – Optional but powerful layer that refines stance and generates explanations.
7. **Alert Layer** – Decides if anything that happened in this cycle is “alert-worthy”.
8. **Storage & State Layer** – Persists data and makes the latest state available to the rest of the platform.
9. **AI Coach Layer (separate service)** – Reads history of Market States + user trades to give coaching feedback.

The output of the Analyzer is **not UI**.  
It is a structured, backend representation of “what’s going on right now”.

---

## 4. Execution Frequency & Computation Strategy

To balance depth and cost, the Analyzer should use a **hybrid schedule**:

- **Every 1 minute (lightweight pass):**
  - Update recent candles for the shortest timeframes.
  - Refresh order flow metrics, OI changes, liquidations, funding for the latest intervals.
  - Recompute fast features and short-term signals.

- **Every 5–15 minutes (heavy pass):**
  - Recompute volume profiles (POC/VAH/VAL).
  - Recalculate single prints and more expensive structure analysis.
  - Refresh longer timeframe context (1h, 4h, 1d) if needed.

The Market State Object can still be emitted every **1–5 minutes**, but some fields (like volume profile) may only change on the “heavy” cycles.

---

## 5. Core Components & Responsibilities

### 5.1 Data Layer – “Market Data Ingestion”

**Goal:** Maintain a consistent, normalized view of BTC market data from:

- Bybit Coin-M futures.
- Binance USDT perpetual.
- Coinglass-like derivatives metrics.

Responsibilities:

- Periodically fetch the latest:
  - Candle data for all required timeframes.
  - OI, liquidations, funding, long/short ratio.
  - Order flow metrics (CVD, delta) if available.
- Normalize everything into a **shared internal format**:
  - Same naming.
  - Same units (e.g., USD where possible).
  - Timestamps aligned.

This layer should hide all quirks of external APIs from the rest of the system.

---

### 5.2 Feature Layer – “Feature Extraction Engine”

**Goal:** Transform raw data into richer, synthetic features that the Analyzer can reason about.

Per symbol (BTC) and timeframe, the Feature Layer should derive:

- Trend and momentum features:
  - Direction (up/down/sideways).
  - Momentum strength.
  - Volatility.
- Order flow features:
  - CVD and its slope.
  - Imbalances between aggressive buyers/sellers.
  - Divergences between price and CVD.
- OI & derivatives features:
  - Direction and magnitude of OI change.
  - Funding regime (positive/negative, extreme/normal).
  - Clustered liquidations (time and price zones).
- Structure & liquidity features:
  - Swing highs and lows.
  - Potential weak highs/weak lows.
  - Detected liquidity pools (above/below recent structure).
  - Volume profile features:
    - POC (Point of Control).
    - VAH (Value Area High).
    - VAL (Value Area Low).
  - Single prints (thin volume zones) where price may react.

The output of the Feature Layer for each timeframe is a **structured feature snapshot**, not raw series.

---

### 5.3 Timeframe Analysis Layer – “Per-Timeframe Context”

**Goal:** Build a **semantic understanding** of each timeframe, using the features.

For each timeframe (1m, 5m, 15m, 30m, 1h, 4h, 1d), the Timeframe Analysis should answer:

- What is the current **context**?  
  Examples:
  - Accumulation / Distribution
  - Trend continuation / Trend exhaustion
  - Range-bound / Breakout conditions

- Has there been a recent **Break of Structure (BoS)**?
  - Bullish or bearish?
  - Where is the key level?

- Is there a **liquidity event**?
  - Sweep of obvious highs/lows.
  - Stop hunt characteristics.

- What is the **local bias** on this timeframe?
  - Bullish / Bearish / Neutral
  - With a local confidence score.

- Are there **strong confluence factors**?
  - Divergence + liquidity sweep + OI flush, etc.

This layer should output a **Timeframe Context Object** per timeframe, describing:

- Local bias.
- Context tags (e.g., “liquidity_grab”, “distribution”, “volatility_spike”).
- Key levels relevant for that timeframe.
- Any notable order flow / derivatives events.

---

### 5.4 Multi-Timeframe Aggregation Layer – “Global Market Context”

**Goal:** Combine the per-timeframe contexts into a **single, coherent view**.

This layer takes all Timeframe Context Objects and:

- Weighs them according to importance (e.g., 4h/1d have more “macro” weight, 1m/5m handle timing).
- Detects **alignment or conflict**:
  - All bullish → strong bullish environment.
  - Higher TF bullish, lower TF short-term bearish → pullback scenario.
  - Mixed, noisy → neutral/uncertain.

- Computes:
  - **Global bias** (bullish / bearish / neutral).
  - **Bias strength / confidence score** (0–1 or 0–100).
  - **Main scenario(s)**:
    - E.g., “Bullish macro with short-term corrective selling.”
  - **Key shared levels** to watch:
    - Liquidity zones.
    - POC, VAH, VAL.
    - Recent sweep zones.

The output is a **Global Market Context** describing BTC’s situation *as a whole*, across all timeframes and both venues.

---

### 5.5 Market State Engine – “Single Market State Object”

**Goal:** Produce the single **Market State Object** that represents the current status of BTC for the rest of the system.

On each analysis cycle, the Market State Engine emits a **Market State Object** that includes, at minimum:

1. **Metadata**
   - Symbol (BTC).
   - Venues considered (Bybit Coin-M, Binance USDT).
   - Timestamp of the analysis.
   - Timeframes covered.

2. **Global Bias**
   - Direction: bullish / bearish / neutral.
   - Confidence score.
   - Short textual stance: e.g., “Look for longs”, “Favorable for shorts”, “Wait / Unsure”.

3. **Context Summary**
   - Short list of high-level tags that describe what the market is doing:
     - Examples:
       - “macro_bullish”
       - “short_term_liquidity_grab”
       - “high_volatility”
       - “funding_extreme_positive”
       - “oi_long_liquidation_wave”

4. **Key Levels & Zones**
   - Important support and resistance levels.
   - Liquidity zones (buy-side / sell-side).
   - POC / VAH / VAL.
   - Single print areas.
   - Any particularly important prices to watch.

5. **Recent Notable Events**
   - e.g., “Major long liquidations on Bybit”, “Divergence between Binance and Bybit OI”, “RSI/CVD bullish divergence on 15m”.

6. **Venue Comparison Insights (if relevant)**
   - Where is OI more concentrated?
   - Which venue shows more aggressive buying/selling?
   - Any divergence between venues that matters.

7. **Suggested Stance (Non-Directive)**
   - This is **not** a call to “buy/sell”.
   - It is a description like:
     - “Environment favors looking for longs on pullbacks.”
     - “Environment is highly uncertain; wait for clarity.”
     - “Environment favors short setups after weak bounces.”

The Market State Object is **the core contract** between the Analyzer and everything else.

---

### 5.6 AI Reasoning Layer – “LLM-Enhanced Understanding”

**Goal:** Use an LLM as an **intelligent reasoning & explanation layer**, not as a replacement for the engine.

Every few minutes (e.g. every 3–5 minutes), the AI Reasoning Layer receives a **structured snapshot** of:

- The latest Market State Object.
- Recent history of states (last N cycles).
- Possibly a short history of conditions (e.g., persistent bullish bias + repeated liquidity sweeps).

Using a predefined prompt/spec (separate MD for the LLM), the AI Reasoning Layer:

- Sanity-checks the stance and confidence.
- Generates **human-readable explanations**:
  - What is happening?
  - Why does it matter?
  - What is the most important thing to watch right now?

- Optionally refines:
  - The stance (“look for longs/shorts/wait”) while still staying within safe, non-directive language.

This layer is responsible for **interpretation**, not raw computation.

The core logic and decisions still come from the rules-based engine + features.

---

### 5.7 Alert Layer – “Smart Event Detection”

**Goal:** Decide when the system should generate an “event” worth notifying the user about.

The Alert Layer uses the latest Market State Object and event flags from the Timeframe Analysis to decide if any **Alert Conditions** are met, such as:

- Confidence above a certain threshold (e.g., very strong bullish or bearish bias).
- Significant liquidity sweeps at key levels.
- Clusters of liquidations suggesting potential reversal.
- Very abnormal changes in funding or OI.
- Multiple confluence factors aligned (e.g., divergence + liquidity grab + key level).

The Alert Layer should:

- Apply simple to medium complexity rules:
  - Thresholds.
  - Cooldowns to avoid spamming.
  - Per-user filters (e.g., user wants only high-confidence alerts).

- Emit **Alert Objects** that describe:
  - What happened.
  - Why it matters.
  - How it relates to the current global bias.

Distribution channels (web, email, Telegram, mobile push) are **flexible**, but the Alert Layer itself is channel-agnostic. It only decides *when* something is alert-worthy and *what* the alert means.

---

### 5.8 Storage & State Layer – “History & Access”

**Goal:** Make the Analyzer’s output reusable, auditable, and improvable over time.

At minimum, the system should store:

- Historical Market State Objects for BTC over time.
- Historical features and/or timeframes analysis (optional level of depth).
- Historical Alerts.
- For AI Coach:  
  - User trades.
  - User interactions with alerts (opened / ignored / traded after).

This enables:

- Future performance analysis:
  - How did the bias behave around major moves?
  - How could rules be improved?

- AI Coach functionality:
  - Comparing user behavior to objective market conditions.
  - Explaining to the user when they fought the bias or over-traded in the wrong direction.

---

### 5.9 AI Coach Layer – “User Reflection Engine” (Separate Service)

**Goal:** Use market history + user behavior history to give personalized coaching, **without affecting the Analyzer logic**.

The AI Coach should:

- Read past Market State Objects over a chosen window (e.g., X days).
- Read user’s trade history for the same window.
- Detect patterns such as:
  - “You repeatedly looked for longs while the global bias was strongly bearish.”
  - “You traded during high volatility liquidation events without adjusting risk.”
  - “You ignored major confluence alerts and traded against them.”

- Generate **coaching feedback**:
  - Not trade calls, but reflections:
    - “You are over-tilted to longs in bearish phases.”
    - “You increase size after losses during uncertain bias periods.”

The Coach is **logically separate** from the Analyzer and does not change how the Analyzer thinks. It uses the Analyzer’s history as a mirror for the user.

---

## 6. Personalization Strategy

Personalization should affect **output and alerts**, not the core analysis of the market.

Examples of personalization:

- **Risk appetite**:
  - Conservative users: see fewer, higher-confidence alerts.
  - Aggressive users: can be exposed to more opportunistic alerts.

- **Time horizon preference**:
  - Short-term users: view and alerts lean more on 1m–15m context (still anchored to higher TF bias).
  - Swing users: more focus on 4h–1d context.

- **Alert sensitivity**:
  - Some users want only “very important” events.
  - Others want more frequent “heads-up” signals.

The underlying Market State Object remains the same for all users.  
Personalization affects how it is **filtered and delivered**, not how it is computed.

---

## 7. Safety & Non-Advice Principles

The Analyzer must **never** act as financial advice.

Design principles:

- The system **does not** output:
  - “Buy now”  
  - “Sell now”  
  - “Enter long at X / stop at Y”

- The system **does** output:
  - Bias (bullish/bearish/neutral).
  - Confidence.
  - Areas of interest.
  - Context and explanations, such as:
    - “Market currently favors bullish continuation after liquidity grab.”
    - “Environment is highly uncertain; bias is weak and conflicting.”

- All wording in the Market State and Alerts should emphasize:
  - **Observation, context, and scenarios**, not directives.

This is important for legal safety, user expectation management, and brand integrity.

---

## 8. Summary – What Antigravity Needs to Build

In simple terms, the AI Market Analyzer backend should behave like:

1. **A continuous BTC watcher**:
   - Reads Bybit + Binance + derivatives metrics.
   - Understands price, flow, and derivatives in depth.

2. **A multi-timeframe analyst**:
   - Sees 1m to 1D.
   - Builds context per timeframe.
   - Merges everything into a single coherent view.

3. **A bias engine**:
   - Chooses bullish/bearish/neutral.
   - Assigns confidence.
   - Identifies what matters most right now.

4. **A state emitter**:
   - On each cycle, produces one structured **Market State Object**.
   - This object feeds:
     - The UI.
     - AI Reasoning (explanations).
     - Alerts.
     - AI Coach (via historical storage).

5. **A storytelling layer (LLM)**:
   - Turns raw structure into intelligent explanations and interpretations.
   - Stays non-directive and safe.

6. **A foundation for future expansion**:
   - More assets.
   - More venues.
   - More users.
   - More personalization — without changing the core architecture.

The core idea:  
> A single, smart, always-on backend “brain” that understands the BTC market deeply and expresses it in a clean, structured way for everything else in the platform to use.

