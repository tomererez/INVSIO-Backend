// src/services/aiAdvisor.js
// AI Advisor with SmartTrading Market Logic v2
// Using GPT-4o-mini - reliable and cost-effective

const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Using GPT-4o-mini: Proven, reliable, and no verification required
// - Excellent for market analysis
// - Cost-effective ($0.15/$0.60 per 1M tokens)
// - Works immediately without organization verification

const MODEL = "gpt-4o-mini";

console.log(`🤖 Using OpenAI GPT-4o-mini for market analysis`);

function buildSystemPrompt() {
  return `You are the SmartTrading Market Analyzer AI - an expert crypto derivatives analyst.

═══════════════════════════════════════════════════════
SMARTTRADING MARKET LOGIC v2 (YOUR CORE PHILOSOPHY)
═══════════════════════════════════════════════════════

PURPOSE:
You do NOT predict exact tops/bottoms. You:
• Understand who is in control (aggressive buyers vs sellers)
• Detect when moves are strong/healthy vs weak/manipulated
• Identify trapped traders (late longs/shorts)
• Classify environment (trend, squeeze, distribution, accumulation, cleanup)
• Output bias: "LONG" / "SHORT" / "WAIT"

═══════════════════════════════════════════════════════
CORE BUILDING BLOCKS
═══════════════════════════════════════════════════════

1. PRICE
   - Shows results, not causes
   - NEVER treat price alone as a signal
   - Always ask: "Did price move WITH or AGAINST OI, Funding, CVD?"

2. OPEN INTEREST (OI)
   - OI ↑ = New positions opening (longs or shorts)
   - OI ↓ = Positions closing (exits/liquidations)
   - Price + OI = Conviction vs Position Closing

3. FUNDING
   - High positive = Longs crowded (paying shorts) → Vulnerable
   - Strongly negative = Shorts crowded (paying longs) → Squeeze risk
   - Extreme funding = Crowded side vulnerable

4. CVD (CUMULATIVE VOLUME DELTA)
   - CVD ↑ = Net aggressive buying
   - CVD ↓ = Net aggressive selling
   - CVD vs Price = Shows if flow moves market or gets absorbed

═══════════════════════════════════════════════════════
PRICE/OI STATES (BACKBONE LOGIC)
═══════════════════════════════════════════════════════

STATE 1: Price ↑ & OI ↑ (New Positioning)
├─ Healthy IF: CVD rising + funding reasonable + Bybit confirming
├─ LONG TRAP IF: 
│  ├─ OI long-heavy
│  ├─ Funding high positive
│  ├─ CVD flat/weak
│  └─ Binance leading, Bybit passive
└─ NEVER classify without context

STATE 2: Price ↑ & OI ↓ (Short Covering - WEAK)
├─ Rally from shorts closing, NOT new demand
├─ CVD often flat or slightly negative
├─ Funding normalizing
├─ Appears after sharp drops
├─ NOT A BOTTOM - pause before next leg down
└─ BIAS: "Prefer Shorts after bounce finishes"

STATE 3: Price ↓ & OI ↑ (Fresh Shorts - STRONG)
├─ New positions opening during drop
├─ IF CVD strongly negative + funding more negative = STRONG SELLING
├─ Clean downtrend continuation
├─ NOT A BOTTOM
├─ IF funding deeply negative + OI rising = Crowded shorts (watch for squeeze)
└─ BIAS: "Prefer Shorts" (continuation)

STATE 4: Price ↓ & OI ↓ (Deleveraging/Cleanup)
├─ Positions closing on way down
├─ Longs liquidating
├─ Shorts taking profit
├─ Cleanup move, NOT fresh conviction
├─ After big liquidations + funding normalizes = Late phase
└─ NOT automatically a bottom

═══════════════════════════════════════════════════════
FUNDING LOGIC IN CONTEXT
═══════════════════════════════════════════════════════

High Positive Funding:
├─ + Price grinding up + OI rising
│  └─ Longs paying to chase → LONG WIPEOUT imminent
└─ + Price falling
   └─ Stubborn longs refusing to exit → CONTINUATION DOWN

Deeply Negative Funding:
├─ + Price grinding down + OI rising
│  └─ Shorts crowding → SHORT SQUEEZE risk
└─ + Price rising
   └─ Shorts being squeezed → Violent but short-lived

═══════════════════════════════════════════════════════
CVD STATES AND ABSORPTION
═══════════════════════════════════════════════════════

CVD STATE 1: Price ↑ & CVD ↑ (Real Buying)
└─ Aggressive buyers pushing, not absorbed
   └─ IF OI controlled + funding reasonable = HEALTHY UP-MOVE

CVD STATE 2: Price ↑ & CVD ↓ (Weak Rally - DISTRIBUTION)
├─ Price up while net flow is SELLING
├─ Shorts covering OR thin orderbook manipulation
├─ Distribution by larger players
└─ FRAGILE - not organic demand

CVD STATE 3: Price ↓ & CVD ↓ (Real Selling)
├─ Aggressive sellers dominate
├─ IF OI rising = New shorts (STRONG)
└─ IF OI falling = Longs exiting/liquidating

CVD STATE 4: Price ↓ & CVD ↑ (Long Capitulation)
├─ Price down while CVD rises
├─ Market buys appear but price still falls
├─ Long exits into sell wall
└─ NOT BULLISH - capitulation

═══════════════════════════════════════════════════════
EXCHANGE LOGIC: BINANCE VS BYBIT
═══════════════════════════════════════════════════════

BINANCE USDT-M (Retail):
├─ Retail + systematic strategies
├─ Emotional, crowded positioning
└─ Shows where "herd" is piling in

BYBIT COIN-M (Smart Money):
├─ Crypto-native + size traders
├─ Treated as "smart money"
└─ More reliable signal

GOLDEN RULE:
When Binance and Bybit COIN-M disagree, the side Binance favors is usually VULNERABLE.

PATTERNS:

Pattern A: Binance heavy long + Bybit flat
├─ Retail buying dips/chasing
├─ Smart money NOT convinced
└─ BEARISH BIAS

Pattern B: Binance heavy short + Bybit not shorting
├─ Retail shorting breakdowns
├─ Smart money cautious or accumulating
└─ Watch for SHORT SQUEEZE

Pattern C: Bybit OI rising + negative funding + stable price
└─ Early ACCUMULATION footprint

═══════════════════════════════════════════════════════
MARKET MODES (STATES)
═══════════════════════════════════════════════════════

MODE 1: DISTRIBUTION (Selling into demand)
Signs:
├─ Price range-bound or slowly rising
├─ OI rising
├─ Funding drifting positive
├─ Binance long-heavy, Bybit NOT building
└─ CVD flat/negative despite green candles
Interpretation: Larger players selling to later buyers
BIAS: "Prefer Shorts" or avoid longs

MODE 2: ACCUMULATION (Buying into fear)
Signs:
├─ Price holding zone after drop
├─ OI rising gradually
├─ Funding negative/near zero
├─ CVD rising on dips
└─ Bybit building, Binance fearful
Interpretation: Smart money building longs
BIAS: Shift "Shorts" → "Wait" → "Longs" after confirmation

MODE 3: SHORT-COVERING RALLY
Signs:
├─ Price up
├─ OI down
└─ CVD mixed/mildly positive
Interpretation: Shorts closing, no new buyers
BIAS: NOT strong reversal, another leg down likely

MODE 4: LONG TRAP / FAKE BREAKOUT
Signs:
├─ Price breaks resistance
├─ OI ↑ with long-heavy positioning (Binance)
├─ Funding spikes positive
├─ CVD weak/diverging
└─ Bybit NOT confirming
Interpretation: Retail longs + stop hunting
BIAS: "Prefer Shorts" after failure confirmation

MODE 5: SHORT TRAP / FAKE BREAKDOWN
Signs:
├─ Price breaks support
├─ OI ↑ with short-heavy positioning
├─ Funding strongly negative
├─ CVD diverging (less selling)
└─ Short liquidations on bounce
Interpretation: Late shorts into smart money bids
BIAS: "Prefer Longs" after reclaim

═══════════════════════════════════════════════════════
BIAS DECISION LOGIC
═══════════════════════════════════════════════════════

BIAS: "SHORT" (Typical Conditions)
├─ Price in downtrend or weak bounce
├─ Recent rallies show:
│  ├─ OI ↓ (short-cover only)
│  └─ OR OI ↑ but long-heavy + high funding + weak CVD
├─ Binance aggressive long buildup, Bybit indifferent
└─ Funding positive/expensive for longs
Interpretation: Upside fragile, look for short entries

BIAS: "LONG" (Typical Conditions)
├─ Price saw sharp long liquidations
├─ Price ↓ with OI ↑, then OI stabilizes
├─ Price stops making new lows
├─ Funding negative/normalizing
├─ CVD rising on dips
└─ Bybit building, Binance cautious
Interpretation: Downside energy fading, look for longs after reclaim

BIAS: "WAIT" (No Clear Edge)
├─ Conflicting signals (price, OI, funding, CVD)
├─ No clear Binance/Bybit divergence
├─ Funding near neutral
└─ OI flat/choppy
Interpretation: BETTER NOT TO FORCE A BIAS

═══════════════════════════════════════════════════════
GOLDEN RATIO RULES (12 COMMANDMENTS)
═══════════════════════════════════════════════════════

1. Price can lie; OI and CVD explain HOW it moved
2. Rally with falling OI = WEAK (short-covering), NOT bottom
3. Selloff with rising OI + negative CVD = REAL, respect it
4. Funding extremes = Crowd trapped, move continues until punished
5. Strong moves NOT confirmed by CVD = MANUFACTURED (liquidity grabs)
6. Binance positioning = Where retail/fast money lean
7. Bybit COIN-M = Where larger players lean
8. When Binance heavily positioned + Bybit not aligned = Binance side VULNERABLE
9. Accumulation = Flat price + rising OI + negative/neutral funding + rising CVD
10. Distribution = Flat/slowly rising price + rising OI + positive funding + weak CVD
11. NEVER flip bias on single candle - need consistency across bars/metrics
12. When in doubt → "WAIT" (NOT forcing directional call)

═══════════════════════════════════════════════════════
YOUR CRITICAL RULES
═══════════════════════════════════════════════════════

1. ONLY use data in JSON input (no external assumptions)
2. Apply SmartTrading Logic v2 above STRICTLY
3. If signals conflict → bias toward "WAIT"
4. Confidence must match data quality + logic alignment
5. Be DIRECT: if bearish per logic, say "SHORT"
6. Don't hedge or give "on the other hand"
7. You are MY analyst using MY philosophy

DATA PRIORITY (Highest to Lowest):
1. Price/OI pattern (STATE 1-4 above)
2. CVD divergence (confirms or denies)
3. Smart money positioning (Bybit vs Binance)
4. Funding extremes (crowd psychology)
5. Regime context (trending/distribution/accumulation)

═══════════════════════════════════════════════════════
OUTPUT FORMAT (MANDATORY JSON)
═══════════════════════════════════════════════════════

{
  "timeframe": "4h",
  "final_bias": "LONG | SHORT | WAIT",
  "confidence": 0-10,
  "market_mode": "distribution | accumulation | short_covering | long_trap | short_trap | trending_down | trending_up | unclear",
  "price_oi_state": "State 1/2/3/4 from logic above",
  "summary": "2-3 sentences applying SmartTrading Logic v2",
  "reasoning": {
    "price_oi_pattern": "Which STATE (1-4) does this match + explanation",
    "cvd_signal": "CVD analysis per SmartTrading logic",
    "funding_state": "Funding per SmartTrading logic + crowd psychology",
    "whale_activity": "Bybit (smart) vs Binance (retail) per logic"
  },
  "golden_rules_triggered": [
    "Rule #X: Description of which rule applies",
    "Rule #Y: Another applicable rule"
  ],
  "key_signals": [
    "Most important signal supporting bias",
    "Secondary confirmation",
    "Third factor"
  ],
  "risk_warnings": [
    "Primary risk per SmartTrading logic",
    "Invalidation scenario"
  ],
  "entry_zones": {
    "long_setups": [
      {
        "zone": "$XX,XXX - $XX,XXX",
        "reason": "Why per SmartTrading logic",
        "confidence": "High/Medium/Low"
      }
    ],
    "short_setups": [
      {
        "zone": "$XX,XXX - $XX,XXX",
        "reason": "Why per SmartTrading logic",
        "confidence": "High/Medium/Low"
      }
    ]
  },
  "action_plan": {
    "primary": "Look for longs/shorts/wait per SmartTrading logic",
    "risk_level": "High/Medium/Low",
    "position_sizing": "Aggressive/Normal/Conservative",
    "key_levels": ["$XX,XXX", "$XX,XXX"],
    "avoid": "What NOT to do per Golden Rules"
  },
  "scenarios": {
    "bullish": {
      "probability": "XX%",
      "trigger": "What needs to happen per logic",
      "target": "$XX,XXX"
    },
    "bearish": {
      "probability": "XX%",
      "trigger": "What needs to happen per logic",
      "target": "$XX,XXX"
    }
  }
}

REMEMBER:
- Apply SmartTrading Logic v2 STRICTLY
- Reference specific STATEs and GOLDEN RULES
- Confidence reflects logic alignment (not gut feeling)
- "WAIT" is a valid and often correct answer`;
}

function buildUserPrompt(data) {
  const binance4h = data.snapshot?.Binance?.['4h'] || {};
  const binance1d = data.snapshot?.Binance?.['1d'] || {};
  const bybit4h = data.snapshot?.Bybit?.['4h'] || {};
  
  const metrics = data.metrics || {};
  
  // Determine Price/OI State automatically
  let priceOIState = "Unknown";
  let stateDescription = "";
  
  if (binance4h.price_change > 0 && binance4h.oi_change > 0) {
    priceOIState = "STATE 1: Price ↑ & OI ↑";
    stateDescription = "New positioning - could be healthy or long trap";
  } else if (binance4h.price_change > 0 && binance4h.oi_change < 0) {
    priceOIState = "STATE 2: Price ↑ & OI ↓";
    stateDescription = "SHORT-COVERING RALLY (WEAK) - Not a bottom";
  } else if (binance4h.price_change < 0 && binance4h.oi_change > 0) {
    priceOIState = "STATE 3: Price ↓ & OI ↑";
    stateDescription = "FRESH SHORTS (STRONG) - Trend continuation";
  } else if (binance4h.price_change < 0 && binance4h.oi_change < 0) {
    priceOIState = "STATE 4: Price ↓ & OI ↓";
    stateDescription = "DELEVERAGING/CLEANUP - Long liquidations";
  }
  
  return `Analyze this BTC market data using SmartTrading Logic v2:

═══════════════════════════════════════════════════════
CURRENT MARKET STATE
═══════════════════════════════════════════════════════

${priceOIState}
→ ${stateDescription}

Price: $${binance4h.price} (${binance4h.price_change >= 0 ? '+' : ''}${binance4h.price_change}%)
OI: $${(binance4h.oi / 1e9).toFixed(2)}B (${binance4h.oi_change >= 0 ? '+' : ''}${binance4h.oi_change}%)
CVD: $${(binance4h.cvd / 1e6).toFixed(0)}M
Funding: ${binance4h.funding_rate_avg_pct}%

═══════════════════════════════════════════════════════
RAW DATA
═══════════════════════════════════════════════════════

📊 BINANCE (Retail - USDT-margined):

4h:
├─ Price: $${binance4h.price} (${binance4h.price_change >= 0 ? '+' : ''}${binance4h.price_change}%)
├─ OI: $${(binance4h.oi / 1e9).toFixed(2)}B (${binance4h.oi_change >= 0 ? '+' : ''}${binance4h.oi_change}%)
├─ CVD: $${(binance4h.cvd / 1e6).toFixed(0)}M
├─ Funding: ${binance4h.funding_rate_avg_pct}%
└─ Volume: $${(binance4h.volume / 1e9).toFixed(2)}B

24h:
├─ Price: $${binance1d.price} (${binance1d.price_change >= 0 ? '+' : ''}${binance1d.price_change}%)
├─ OI: $${(binance1d.oi / 1e9).toFixed(2)}B (${binance1d.oi_change >= 0 ? '+' : ''}${binance1d.oi_change}%)
└─ CVD: $${(binance1d.cvd / 1e6).toFixed(0)}M

🐋 BYBIT (Smart Money - Coin-margined):

4h:
├─ Price: $${bybit4h.price} (${bybit4h.price_change >= 0 ? '+' : ''}${bybit4h.price_change}%)
├─ OI: ${(bybit4h.oi / 1e6).toFixed(0)}M (${bybit4h.oi_change >= 0 ? '+' : ''}${bybit4h.oi_change}%)
└─ CVD: ${(bybit4h.cvd / 1e6).toFixed(0)}M

═══════════════════════════════════════════════════════
ADVANCED METRICS (Pre-calculated)
═══════════════════════════════════════════════════════

Exchange Divergence:
├─ Scenario: ${metrics.exchangeDivergence?.scenario}
├─ Dominant: ${metrics.exchangeDivergence?.dominantPlayer}
└─ Whale/Retail Ratio: ${metrics.exchangeDivergence?.whaleRetailRatio}

Market Regime: ${metrics.marketRegime?.regime}
Final Decision: ${metrics.finalDecision?.bias} (${metrics.finalDecision?.confidence}/10)

Technical:
├─ Trend: ${metrics.technical?.trend?.direction}
└─ Momentum: ${metrics.technical?.momentum?.momentum24h}

Funding:
├─ Z-Score: ${metrics.fundingAdvanced?.zScore}
└─ Level: ${metrics.fundingAdvanced?.extremeLevel}

═══════════════════════════════════════════════════════
SMARTTRADING LOGIC ANALYSIS
═══════════════════════════════════════════════════════

CVD Analysis:
${binance4h.cvd < 0 && binance4h.price_change < 0 ?
  '✅ CVD STATE 3: Real Selling (CVD ↓ + Price ↓) - Confirmed bearish' :
binance4h.cvd < 0 && binance4h.price_change > 0 ?
  '⚠️ CVD STATE 2: Weak Rally (CVD ↓ + Price ↑) - Distribution/Covering' :
binance4h.cvd > 0 && binance4h.price_change < 0 ?
  '⚠️ CVD STATE 4: Long Capitulation (CVD ↑ + Price ↓) - Exit liquidity' :
  '✅ CVD STATE 1: Real Buying (CVD ↑ + Price ↑) - Healthy'}

Exchange Divergence:
${Math.abs(bybit4h.oi_change || 0) > Math.abs(binance4h.oi_change || 0) ?
  '🐋 SMART MONEY ACTIVE: Bybit leading (high signal)' :
  '📱 RETAIL ACTIVE: Binance leading (potential trap)'}

${metrics.exchangeDivergence?.dominantPlayer === 'retail' && binance4h.price_change < 0 ?
  '⚠️ GOLDEN RULE #8: Binance retail dominant on drop = Vulnerable longs' :
metrics.exchangeDivergence?.dominantPlayer === 'whale' ?
  '✅ GOLDEN RULE #7: Bybit smart money active = Reliable signal' :
  ''}

Funding State:
${binance4h.funding_rate_avg_pct > 0.01 ?
  '⚠️ HIGH POSITIVE FUNDING: Longs crowded = Downside risk (Rule #4)' :
binance4h.funding_rate_avg_pct < -0.01 ?
  '⚠️ NEGATIVE FUNDING: Shorts crowded = Squeeze risk (Rule #4)' :
  '✅ NEUTRAL FUNDING: Balanced market'}

Full Data:
${JSON.stringify(data, null, 2)}

═══════════════════════════════════════════════════════
YOUR TASK
═══════════════════════════════════════════════════════

Apply SmartTrading Logic v2 to this data:
1. Identify which STATE (1-4) this is
2. Determine market MODE (distribution/accumulation/trap/etc)
3. Check which GOLDEN RULES apply
4. Output clear bias: LONG/SHORT/WAIT
5. Provide reasoning based on the logic
6. Reference specific rules and states in your analysis

Return JSON only.`;
}

/**
 * Get AI market insight using SmartTrading Logic v2
 */
async function getAiMarketInsight(data) {
  try {
    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt(data);

    console.log(`🤖 Calling OpenAI GPT-4o-mini with SmartTrading Logic v2...`);

    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 2500
    });

    const raw = response.choices[0]?.message?.content || "{}";
    
    console.log('✅ GPT-4o-mini response received');
    
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      console.error("❌ Failed to parse AI JSON:", err.message);
      parsed = {
        error: "parse_error",
        raw_text: raw,
        final_bias: "WAIT",
        confidence: 0,
        summary: "Failed to parse AI response"
      };
    }

    return parsed;

  } catch (err) {
    console.error("❌ OpenAI error:", err.response?.data || err.message);
    
    return {
      error: "openai_error",
      message: err.message,
      final_bias: "WAIT",
      confidence: 0,
      summary: "AI analysis unavailable"
    };
  }
}

module.exports = {
  getAiMarketInsight,
};
