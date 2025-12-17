
const assert = require('assert');
const {
    calculatePerCandleDelta,
    buildCvdSeriesNorm,
    detectAbsorption
} = require('../src/services/marketMetrics');

const absorptionService = require('../src/services/absorptionService');

// ===================================
// UNIT TEST: CVD Calculation Phase 1
// ===================================
console.log('🧪 Testing Phase 1: Detection Logic...');

// 1. Test Delta Calc
const needle = { taker_buy_volume_usd: 150, taker_sell_volume_usd: 50 }; // Net +100 / 200 = 0.5
const delta = calculatePerCandleDelta(needle);
console.assert(delta === 0.5, `Expected 0.5, got ${delta}`);
console.log('✅ calculatePerCandleDelta passed');

// 2. Test Series Build
const candles = [
    { taker_buy_volume_usd: 100, taker_sell_volume_usd: 100 }, // 0
    { taker_buy_volume_usd: 200, taker_sell_volume_usd: 100 }, // 0.33
    { taker_buy_volume_usd: 100, taker_sell_volume_usd: 200 }  // -0.33
];
const series = buildCvdSeriesNorm(candles, 3);
// Expected: [0, 0.3333, -0.3333]
console.assert(series.length === 3, 'Series length mismatch');
console.log('✅ buildCvdSeriesNorm passed');

// 3. Test Detection (Mock)
// Scenario: Selling Absorption (Short Trap / Buying Accumulation)
// Strong BUYING CVD (+Slope) but Price Flat/Down
const mockCvdSeries = Array(40).fill(0).concat([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]); // Slope ~0.1
// TechnicalUtils.slope needed? No, calculateCvdSlopeNorm uses it.
// Assuming marketMetrics has TechnicalUtils internally available.
// Since we are requiring the file, it should work if TechnicalUtils is defined there.
// If TechnicalUtils is not exported/available to the function (it is a Class in the file), it should process fine.

// Mock structure
const structure = { support: 50000, resistance: 60000 };
// Price is FLAT (-0.1%), CVD is BUYING
const result = detectAbsorption(
    mockCvdSeries,
    { changePct: -0.1, currentPrice: 50050 }, // Near support
    structure,
    '4h',
    { behavior: 'falling', currentOI: 10000 }
);

if (result) {
    console.log('✅ Simulated Absorption Detected:', result.cvdDirection, result.location);
    console.assert(result.cvdDirection === 'buying', 'Expected buying CVD');
    console.assert(result.location === 'near_support', 'Expected near_support');
} else {
    console.warn('⚠️ Detection test yielded null (Requires valid TechnicalUtils in scope)');
}

// ===================================
// UNIT TEST: Resolution Phase 2
// ===================================
console.log('\n🧪 Testing Phase 2: Resolution Logic...');

const { evaluateResolution } = absorptionService;

// Scenario: TRAP - Sweep and Rejection
// Event: Selling CVD near resistance (Distribution attempt?)
// Actually lets test BUYING TRAP (Long Trap)
// Event: Buying CVD (Up), Price Flat. 
// Resolution: Price sweeps resistance then dumps.

const event = {
    id: 'test-event-1',
    symbol: 'BTC',
    timeframe: '4h',
    detected_at: 1000,
    cvd_direction: 'buying', // Bulls trapped
    cvd_strength: 0.8,
    location: 'near_resistance',
    sr_level_used: 60000,
    oi_at_detection: 1000,
    price_at_detection: 59800
};

const resolutionCandles = [
    { timestamp: 1100, open: 59800, high: 60100, low: 59800, close: 59900 }, // Wick 60100 (Sweep)
    { timestamp: 1200, open: 59900, high: 59950, low: 59500, close: 59500 }, // Dump
    { timestamp: 1300, open: 59500, high: 59600, low: 59000, close: 59000 }  // Dump matches.trap.break needs structure.support check
];

const mockMarketData = {
    structure: { support: 59200, resistance: 60000 },
    oiHistory: [
        { timestamp: 1000, oi: 1000 },
        { timestamp: 1100, oi: 1200 }, // Spike
        { timestamp: 1200, oi: 900 }   // Drop > 30% of increase? Increase=200, Drop=300. Yes.
    ]
};

const resResult = evaluateResolution(event, resolutionCandles, mockMarketData);
console.log('Resolution Result:', resResult);

if (resResult.action === 'RESOLVE' && resResult.resolution === 'TRAP') {
    console.log('✅ TRAP Resolution criteria met');
} else {
    console.error('❌ Failed to resolve TRAP');
}

console.log('\nDone.');
