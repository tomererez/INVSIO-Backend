// dataUtils.test.js
// Unit tests for dataUtils alignment, window sizing, and validation

const {
    intervalToMs,
    alignEndTimeToLastClosedCandle,
    alignStartTimeToBoundary,
    computeLookbackWindowMs,
    validateCandleSeries,
    InsufficientDataError
} = require('../services/dataUtils');

/**
 * =============================================================================
 * TEST RUNNER (Simple - no external dependencies)
 * =============================================================================
 */

let passCount = 0;
let failCount = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`✅ PASS: ${name}`);
        passCount++;
    } catch (error) {
        console.error(`❌ FAIL: ${name}`);
        console.error(`   Error: ${error.message}`);
        failCount++;
    }
}

function assertEqual(actual, expected, message = '') {
    if (actual !== expected) {
        throw new Error(`${message}\n   Expected: ${expected}\n   Actual: ${actual}`);
    }
}

function assertTrue(condition, message = 'Assertion failed') {
    if (!condition) {
        throw new Error(message);
    }
}

/**
 * =============================================================================
 * INTERVAL CONVERSION TESTS
 * =============================================================================
 */

test('intervalToMs - 30m', () => {
    assertEqual(intervalToMs('30m'), 30 * 60 * 1000);
});

test('intervalToMs - 1h', () => {
    assertEqual(intervalToMs('1h'), 60 * 60 * 1000);
});

test('intervalToMs - 4h', () => {
    assertEqual(intervalToMs('4h'), 4 * 60 * 60 * 1000);
});

test('intervalToMs - 1d', () => {
    assertEqual(intervalToMs('1d'), 24 * 60 * 60 * 1000);
});

test('intervalToMs - invalid throws', () => {
    let threw = false;
    try {
        intervalToMs('15m');
    } catch (e) {
        threw = true;
    }
    assertTrue(threw, 'Should throw for unknown interval');
});

/**
 * =============================================================================
 * TIMESTAMP ALIGNMENT TESTS
 * =============================================================================
 */

test('alignEndTimeToLastClosedCandle - 4h at 14:47 returns 12:00', () => {
    // 14:47 UTC on 2025-12-15
    // Current candle: 12:00-16:00 (not closed)
    // Last closed: 08:00-12:00 (end = 12:00)
    const asOf = new Date('2025-12-15T14:47:00.000Z').getTime();
    const aligned = alignEndTimeToLastClosedCandle('4h', asOf);
    const alignedDate = new Date(aligned);

    assertEqual(alignedDate.getUTCHours(), 12, 'Hour should be 12');
    assertEqual(alignedDate.getUTCMinutes(), 0, 'Minutes should be 0');
});

test('alignEndTimeToLastClosedCandle - 1h at 14:47 returns 14:00', () => {
    const asOf = new Date('2025-12-15T14:47:00.000Z').getTime();
    const aligned = alignEndTimeToLastClosedCandle('1h', asOf);
    const alignedDate = new Date(aligned);

    assertEqual(alignedDate.getUTCHours(), 14, 'Hour should be 14');
    assertEqual(alignedDate.getUTCMinutes(), 0, 'Minutes should be 0');
});

test('alignEndTimeToLastClosedCandle - 30m at 14:47 returns 14:30', () => {
    const asOf = new Date('2025-12-15T14:47:00.000Z').getTime();
    const aligned = alignEndTimeToLastClosedCandle('30m', asOf);
    const alignedDate = new Date(aligned);

    assertEqual(alignedDate.getUTCHours(), 14, 'Hour should be 14');
    assertEqual(alignedDate.getUTCMinutes(), 30, 'Minutes should be 30');
});

test('alignEndTimeToLastClosedCandle - exactly on boundary returns previous', () => {
    // If we're exactly at 12:00, the 08:00-12:00 candle just closed
    // So alignEnd should return 12:00 (end of 08:00-12:00 candle)
    const asOf = new Date('2025-12-15T12:00:00.000Z').getTime();
    const aligned = alignEndTimeToLastClosedCandle('4h', asOf);
    const alignedDate = new Date(aligned);

    assertEqual(alignedDate.getUTCHours(), 12, 'Hour should be 12');
});

test('alignStartTimeToBoundary - 4h at 14:47 returns 12:00', () => {
    const ts = new Date('2025-12-15T14:47:00.000Z').getTime();
    const aligned = alignStartTimeToBoundary('4h', ts);
    const alignedDate = new Date(aligned);

    assertEqual(alignedDate.getUTCHours(), 12, 'Hour should be 12');
    assertEqual(alignedDate.getUTCMinutes(), 0, 'Minutes should be 0');
});

/**
 * =============================================================================
 * LOOKBACK WINDOW TESTS
 * =============================================================================
 */

test('computeLookbackWindowMs - 50 candles of 30m = 25 hours', () => {
    const window = computeLookbackWindowMs('30m', 50);
    const hours = window / (60 * 60 * 1000);
    assertEqual(hours, 25, 'Should be 25 hours');
});

test('computeLookbackWindowMs - 168 candles of 1h = 7 days', () => {
    const window = computeLookbackWindowMs('1h', 168);
    const days = window / (24 * 60 * 60 * 1000);
    assertEqual(days, 7, 'Should be 7 days');
});

/**
 * =============================================================================
 * CANDLE SERIES VALIDATION TESTS
 * =============================================================================
 */

test('validateCandleSeries - valid series passes', () => {
    const endTime = new Date('2025-12-15T12:00:00.000Z').getTime();
    const candles = [
        { time: endTime - (4 * 60 * 60 * 1000) * 2 },  // -8h
        { time: endTime - (4 * 60 * 60 * 1000) * 1 },  // -4h
        { time: endTime }                                // end
    ];

    const result = validateCandleSeries(candles, '4h', endTime);
    assertTrue(result.valid, 'Should be valid');
});

test('validateCandleSeries - lookahead detected', () => {
    const endTime = new Date('2025-12-15T12:00:00.000Z').getTime();
    const candles = [
        { time: endTime - (4 * 60 * 60 * 1000) },  // -4h (ok)
        { time: endTime + (4 * 60 * 60 * 1000) }   // +4h (LOOKAHEAD!)
    ];

    const result = validateCandleSeries(candles, '4h', endTime);
    assertTrue(!result.valid, 'Should be invalid due to lookahead');
    assertTrue(result.issues.some(i => i.includes('LOOKAHEAD')), 'Should mention lookahead');
});

test('validateCandleSeries - gap detected', () => {
    const endTime = new Date('2025-12-15T12:00:00.000Z').getTime();
    const candles = [
        { time: endTime - (4 * 60 * 60 * 1000) * 10 },  // -40h
        // Missing many candles
        { time: endTime }                                  // end
    ];

    const result = validateCandleSeries(candles, '4h', endTime);
    assertTrue(result.issues.some(i => i.includes('Gap')), 'Should mention gap');
});

/**
 * =============================================================================
 * INSUFFICIENT DATA ERROR TESTS
 * =============================================================================
 */

test('InsufficientDataError - has correct message', () => {
    const error = new InsufficientDataError('30m', 48, 50);
    assertTrue(error.message.includes('30m'), 'Should mention interval');
    assertTrue(error.message.includes('48'), 'Should mention got count');
    assertTrue(error.message.includes('50'), 'Should mention need count');
});

test('InsufficientDataError - toLogObject works', () => {
    const error = new InsufficientDataError('30m', 48, 50, { exchange: 'Binance' });
    const logObj = error.toLogObject();

    assertEqual(logObj.interval, '30m');
    assertEqual(logObj.got, 48);
    assertEqual(logObj.need, 50);
    assertEqual(logObj.context.exchange, 'Binance');
});

/**
 * =============================================================================
 * RUN ALL TESTS
 * =============================================================================
 */

console.log('\n========================================');
console.log('Running dataUtils Tests');
console.log('========================================\n');

// All tests have been defined above and run synchronously

console.log('\n========================================');
console.log(`Results: ${passCount} passed, ${failCount} failed`);
console.log('========================================\n');

if (failCount > 0) {
    process.exit(1);
}
