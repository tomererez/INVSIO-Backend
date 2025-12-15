// llmExplainer.js - Phase 3: LLM Explanation Layer
// LLM explains the Rules Engine output - NEVER changes decisions

// OpenAI implementation - Replaced Anthropic 2025-12-12
// Phase 3: LLM Explanation Layer

/**
 * =======================================================================
 * CONFIGURATION
 * =======================================================================
 */

// LLM_CONFIG moved to local scope to avoid redundancy or use module level if preferred.
// Keeping it simple.

// In-memory cache for LLM responses
const explanationCache = new Map();

/**
 * =======================================================================
 * SYSTEM PROMPT
 * =======================================================================
 */

const SYSTEM_PROMPT = `# INVSIO Market Analyzer - Explanation Layer

You are an expert market analyst explaining the output of INVSIO's Rules Engine for BTC futures markets.

## YOUR ROLE
- Explain WHY the system reached its conclusion
- Highlight what conditions would CHANGE the current bias
- Provide actionable context for the trader
- Surface potential risks the trader should be aware of

## YOU MUST NEVER
- Change or override the bias/tradeStance from the Rules Engine
- Say "buy" or "sell" as directives
- Make predictions beyond what the data supports
- Suggest the Rules Engine is wrong
- Use phrases like "you should" or "I recommend"

## GOLDEN RULES (for context - these are fundamental truths the system uses)
1. Bybit COIN-M (coin-margined) = smart money / whales
2. Binance USDT (USDT-margined) = retail + some institutional
3. When they diverge, trust Bybit - smart money knows first
4. Price shows direction, OI shows intention, CVD reveals aggression
5. Funding = crowding indicator (extreme funding = squeeze risk)
6. OI drop in rallies = weakness (shorts covering, not new buyers)
7. OI rise in declines = strength (new shorts, conviction)

## EXCHANGE DIVERGENCE SCENARIOS
The system detects these patterns:
- whale_distribution: Bybit selling while Binance buying - whales exiting to retail
- whale_accumulation: Bybit buying while Binance flat - whales loading
- retail_fomo_rally: Binance OI rising, Bybit flat - weak rally
- short_squeeze_setup: Negative funding + Bybit accumulating - squeeze coming
- synchronized_bullish/bearish: Both exchanges aligned - strong conviction

## MARKET REGIMES
- distribution: Smart money exiting into retail demand
- accumulation: Smart money loading while retail absent
- trap (long_trap/short_trap): Deceptive price movement, caution warranted
- covering (short_squeeze/long_squeeze): Forced position closing, not new conviction
- trending (healthy_bull/healthy_bear): Genuine trend with aligned participation
- range/chop: No edge, flat price and OI

## OUTPUT FORMAT
You must respond with a valid JSON object containing exactly these fields:
{
  "executiveSummary": "2-3 sentences explaining the current market state",
  "keyObservations": ["3-5 bullet points of key observations"],
  "whatWouldChange": {
    "toFlipBullish": ["conditions that would flip bias bullish"],
    "toFlipBearish": ["conditions that would flip bias bearish"],
    "toReduceConfidence": ["conditions that would reduce confidence"]
  },
  "riskConsiderations": ["1-2 risk factors to watch"],
  "traderTip": "One actionable tip based on the current regime"
}

Keep language educational, not directive.
Use "environment favors" not "you should".
Be concise but insightful.`;

/**
 * =======================================================================
 * HELPER FUNCTIONS
 * =======================================================================
 */

function getCacheKey(marketState) {
    // Create a cache key based on key state elements
    const bias = marketState.finalDecision?.bias || 'WAIT';
    const regime = marketState.marketRegime?.regime || 'unclear';
    const subType = marketState.marketRegime?.subType || 'unknown';
    const scenario = marketState.exchangeDivergence?.scenario || 'unclear';
    const confidence = Math.floor(marketState.finalDecision?.confidence || 0);

    return `${bias}_${regime}_${subType}_${scenario}_${confidence}`;
}

function isCacheValid(cachedEntry) {
    if (!cachedEntry) return false;
    return Date.now() - cachedEntry.timestamp < LLM_CONFIG.cacheTtlMs;
}

function buildLLMInput(marketState) {
    // Extract relevant data for LLM context
    const decision = marketState.finalDecision || {};
    const regime = marketState.marketRegime || {};
    const exchange = marketState.exchangeDivergence || {};
    const raw = marketState.raw || {};

    // Get 4h metrics if available
    const binance4h = raw.binance?.['4h'] || {};
    const bybit4h = raw.bybit?.['4h'] || {};

    return {
        decision: {
            bias: decision.bias || 'WAIT',
            tradeStance: decision.tradeStance || 'AVOID_TRADING',
            confidence: decision.confidence || 0,
            primaryRegime: decision.primaryRegime || regime.regime || 'unclear',
            riskMode: decision.riskMode || 'NORMAL'
        },
        regime: {
            state: regime.regime || 'unclear',
            subType: regime.subType || 'unknown',
            characteristics: regime.characteristics || []
        },
        exchange: {
            scenario: exchange.scenario || 'unclear',
            bybit: {
                oi_change: exchange.bybit?.oi_change || 0,
                cvd_billions: exchange.bybit?.cvd_billions || 0,
                funding: exchange.bybit?.funding || 0,
                character: exchange.bybit?.character || 'neutral'
            },
            binance: {
                oi_change: exchange.binance?.oi_change || 0,
                cvd_billions: exchange.binance?.cvd_billions || 0,
                funding: exchange.binance?.funding || 0,
                character: exchange.binance?.character || 'neutral'
            },
            warnings: exchange.warnings || []
        },
        metrics: {
            price: binance4h.price || 0,
            price_change_4h: binance4h.price_change || 0,
            oi_change_4h: binance4h.oi_change || 0,
            funding: binance4h.funding_rate_avg_pct || 0,
            cvd: binance4h.cvd || 0
        }
    };
}

/**
 * =======================================================================
 * FALLBACK TEMPLATES
 * =======================================================================
 */

function generateFallbackExplanation(marketState) {
    const regime = marketState.marketRegime?.regime || 'unclear';
    const subType = marketState.marketRegime?.subType || 'unknown';
    const bias = marketState.finalDecision?.bias || 'WAIT';
    const confidence = marketState.finalDecision?.confidence || 0;
    const characteristics = marketState.marketRegime?.characteristics || [];
    const scenario = marketState.exchangeDivergence?.scenario || 'unclear';

    // Template-based summaries
    const summaryTemplates = {
        distribution: `The market is in a Distribution phase with ${bias} bias at ${confidence}/10 confidence. Smart money appears to be reducing exposure while retail continues to participate. This pattern often precedes significant moves to the downside.`,
        accumulation: `The market is in an Accumulation phase with ${bias} bias at ${confidence}/10 confidence. Smart money appears to be loading positions while retail remains absent or bearish. This pattern often precedes significant moves to the upside.`,
        trap: `The market is showing a ${subType === 'long_trap' ? 'Long Trap' : 'Short Trap'} pattern. Current price movement may be deceptive. Exercise caution as ${subType === 'long_trap' ? 'longs' : 'shorts'} may be at risk.`,
        covering: `The market is in a ${subType === 'short_squeeze' ? 'Short Squeeze' : 'Long Squeeze'} phase. Price movement is driven by forced position closing rather than new conviction. This suggests the move may lack sustainability.`,
        trending: `The market is in a ${subType === 'healthy_bull' ? 'Healthy Bullish' : 'Healthy Bearish'} trend with ${bias} bias at ${confidence}/10 confidence. Both retail and smart money show aligned participation, suggesting genuine conviction.`,
        range: `The market is in a Range/Chop phase with no clear directional edge. Both price and OI are flat, indicating low conviction from all participants. Consider waiting for a breakout.`,
        unclear: `Market signals are mixed with ${bias} bias at ${confidence}/10 confidence. No clear regime pattern detected. Consider reduced position sizing or waiting for clarity.`
    };

    // Template-based observations
    const observationTemplates = {
        distribution: [
            "Smart money (Bybit) appears to be reducing exposure",
            "Retail (Binance) continues to buy into the move",
            "Exchange divergence suggests whale distribution",
            "Funding may indicate crowded positioning"
        ],
        accumulation: [
            "Smart money (Bybit) appears to be accumulating",
            "Retail (Binance) is absent or bearish",
            "Exchange divergence suggests whale loading",
            "Funding may indicate crowded shorts"
        ],
        trap: [
            `${subType === 'long_trap' ? 'Price rising but CVD negative' : 'Price falling but CVD positive'}`,
            `${subType === 'long_trap' ? 'Funding extremely high' : 'Funding extremely negative'}`,
            "OI rising suggests retail piling in",
            "Classic trap pattern forming"
        ],
        covering: [
            `Price ${subType === 'short_squeeze' ? 'rising' : 'falling'} while OI falling`,
            `${subType === 'short_squeeze' ? 'Shorts' : 'Longs'} closing positions`,
            "Move driven by covering, not new conviction",
            "May lack sustainability at extremes"
        ],
        trending: [
            "Price and OI moving in alignment",
            "CVD confirms directional conviction",
            "Both exchanges showing aligned participation",
            "Funding reasonable - sustainable trend"
        ],
        range: [
            "Price flat with no clear direction",
            "OI flat - no new positioning",
            "Low conviction from all participants",
            "Wait for breakout pattern"
        ],
        unclear: characteristics.length > 0 ? characteristics : ["Mixed signals detected", "No clear pattern forming"]
    };

    // What would change templates
    const changeTemplates = {
        toFlipBullish: bias === 'LONG' ? [] : [
            "Bybit OI starts rising with positive CVD",
            "Price breaks above resistance with OI confirmation",
            "Funding normalizes or goes negative"
        ],
        toFlipBearish: bias === 'SHORT' ? [] : [
            "Bybit OI starts falling with negative CVD",
            "Price breaks below support with OI confirmation",
            "Funding spikes to extreme positive"
        ],
        toReduceConfidence: [
            "Exchange divergence pattern breaks down",
            "OI and price relationship changes",
            "Conflicting signals emerge across timeframes"
        ]
    };

    // Risk templates
    const riskTemplates = {
        distribution: [
            "Distribution can last longer than expected - patience required",
            "Watch for short squeeze if funding goes extremely negative"
        ],
        accumulation: [
            "Accumulation can extend before breakout",
            "Watch for dump if whales start distributing"
        ],
        trap: [
            `${subType === 'long_trap' ? 'Longs' : 'Shorts'} at elevated risk`,
            "Consider tight stops if positioned against the trap"
        ],
        covering: [
            "Covering-driven moves often reverse sharply",
            "Wait for OI stabilization before new positions"
        ],
        trending: [
            "Trends can extend further than expected",
            "Watch for exhaustion signs (OI divergence)"
        ],
        range: [
            "False breakouts common in range environments",
            "No edge in choppy conditions"
        ],
        unclear: [
            "Low conviction environment - reduce risk",
            "Wait for clearer signals before acting"
        ]
    };

    // Trader tips
    const tipTemplates = {
        distribution: "In distribution phases, wait for bounces to resistance rather than chasing breakdowns.",
        accumulation: "In accumulation phases, look for dips to support rather than chasing breakouts.",
        trap: `Be cautious with ${subType === 'long_trap' ? 'long' : 'short'} positions. Consider waiting for trap confirmation before acting.`,
        covering: "Covering-driven moves often exhaust. Wait for OI stabilization before positioning.",
        trending: `Look for pullbacks to add to ${subType === 'healthy_bull' ? 'long' : 'short'} positions in the direction of the trend.`,
        range: "In range environments, consider sitting out or trading only from clear levels with tight stops.",
        unclear: "When signals are mixed, reducing position size or waiting is often the wisest approach."
    };

    return {
        executiveSummary: summaryTemplates[regime] || summaryTemplates.unclear,
        keyObservations: observationTemplates[regime] || observationTemplates.unclear,
        whatWouldChange: changeTemplates,
        riskConsiderations: riskTemplates[regime] || riskTemplates.unclear,
        traderTip: tipTemplates[regime] || tipTemplates.unclear,
        llmGenerated: false,
        fallbackReason: 'template'
    };
}

/**
 * =======================================================================
 * MAIN LLM FUNCTION
 * =======================================================================
 */

// OpenAI implementation
const OpenAI = require('openai');

const LLM_CONFIG = {
    model: 'gpt-5.2', // Current best model as requested
    maxTokens: 1024,
    temperature: 0.3,
    cacheTtlMs: 5 * 60 * 1000,
    timeoutMs: 60000
};

// ... (keep system prompt constant) ...

async function generateExplanation(marketState) {
    // Check cache first
    const cacheKey = getCacheKey(marketState);
    const cached = explanationCache.get(cacheKey);

    if (isCacheValid(cached)) {
        return {
            ...cached.data,
            cached: true,
            cacheAge: Math.floor((Date.now() - cached.timestamp) / 1000)
        };
    }

    // Build input for LLM
    const llmInput = buildLLMInput(marketState);

    try {
        const startTime = Date.now();

        // Initialize OpenAI client
        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });

        // Phase 5: Create timeout promise
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error(`LLM timeout after ${LLM_CONFIG.timeoutMs / 1000}s`));
            }, LLM_CONFIG.timeoutMs);
        });

        // Call OpenAI with timeout
        const messagePromise = openai.chat.completions.create({
            model: LLM_CONFIG.model,
            max_tokens: LLM_CONFIG.maxTokens,
            temperature: LLM_CONFIG.temperature,
            messages: [
                {
                    role: 'system',
                    content: SYSTEM_PROMPT
                },
                {
                    role: 'user',
                    content: `Analyze and explain this market state from the Rules Engine:

${JSON.stringify(llmInput, null, 2)}

Provide your explanation as a JSON object with the exact structure specified in your instructions.`
                }
            ]
        });

        // Race between LLM call and timeout
        const message = await Promise.race([messagePromise, timeoutPromise]);

        const duration = Date.now() - startTime;
        if (duration > 30000) {
            console.warn(`⏱️ Slow LLM call: took ${duration}ms`);
        }

        // Parse response
        const responseText = message.choices[0].message.content;

        // Extract JSON from response (handle markdown code blocks if present)
        let jsonStr = responseText;
        const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
            jsonStr = jsonMatch[1].trim();
        }

        const explanation = JSON.parse(jsonStr);

        // Validate required fields
        if (!explanation.executiveSummary || !explanation.keyObservations) {
            throw new Error('Invalid LLM response structure');
        }

        // Add metadata
        const result = {
            ...explanation,
            llmGenerated: true,
            cached: false,
            generatedAt: new Date().toISOString(),
            durationMs: duration
        };

        // Cache the result
        explanationCache.set(cacheKey, {
            data: result,
            timestamp: Date.now()
        });

        return result;

    } catch (error) {
        console.error('LLM explanation failed:', error.message);

        // Return fallback template
        const fallback = generateFallbackExplanation(marketState);
        fallback.fallbackReason = error.message;

        return fallback;
    }
}

/**
 * =======================================================================
 * CACHE MANAGEMENT
 * =======================================================================
 */

function clearExplanationCache() {
    explanationCache.clear();
}

function getExplanationCacheStats() {
    const entries = Array.from(explanationCache.entries());
    return {
        size: explanationCache.size,
        entries: entries.map(([key, value]) => ({
            key,
            age: Math.floor((Date.now() - value.timestamp) / 1000),
            valid: isCacheValid(value)
        }))
    };
}

/**
 * =======================================================================
 * EXPORTS
 * =======================================================================
 */

module.exports = {
    generateExplanation,
    generateFallbackExplanation,
    clearExplanationCache,
    getExplanationCacheStats,
    LLM_CONFIG
};
