// src/backtest/runBacktest.js - SmartTrading Backtesting
// Uses marketMetrics.js directly to test the AI analyzer accuracy

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const path = require('path');
const fs = require('fs');

// Import existing services
const marketDataService = require('../services/marketDataService');
const marketMetrics = require('../services/marketMetrics');

/**
 * =======================================================================
 * CONFIGURATION
 * =======================================================================
 */
const DEFAULT_CONFIG = {
  symbol: 'BTCUSDT',
  interval: '4h',
  days: 90,

  // Trading parameters
  initialCapital: 10000,
  positionSizePercent: 10,
  leverage: 2,
  stopLossPercent: 2,
  takeProfitPercent: 4,
  minConfidence: 7,

  // Output
  outputDir: path.join(__dirname, '../../backtest_results'),
  saveResults: true
};

/**
 * =======================================================================
 * DATA FETCHER - Gets historical data for backtesting
 * =======================================================================
 */
async function fetchHistoricalData(options = {}) {
  const { symbol, interval, days } = options;
  const limit = Math.min(days * (24 / (interval === '4h' ? 4 : 24)), 500);

  console.log(`📊 Fetching ${limit} candles from Coinglass API...`);
  console.log(`   This will take ~${Math.ceil(limit * 2.5 * 8 / 1000 / 60)} minutes due to rate limits\n`);

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const bybitSymbol = symbol === 'BTCUSDT' ? 'BTCUSD' : symbol;
  const cvdInterval = interval === '4h' ? 'h4' : 'h24';

  // Fetch all data
  console.log('   [1/8] Binance Price...');
  const binancePrice = await marketDataService.getPriceHistory('Binance', symbol, interval, limit);
  await sleep(2500);

  console.log('   [2/8] Binance OI...');
  const binanceOI = await marketDataService.getOIHistory('Binance', symbol, interval, limit);
  await sleep(2500);

  console.log('   [3/8] Binance Funding...');
  const binanceFunding = await marketDataService.getFundingHistory('Binance', symbol, interval, limit);
  await sleep(2500);

  console.log('   [4/8] Binance CVD...');
  const binanceCVD = await marketDataService.getTakerBuySellVolume('Binance', symbol, cvdInterval, limit);
  await sleep(2500);

  console.log('   [5/8] Bybit Price...');
  const bybitPrice = await marketDataService.getPriceHistory('Bybit', bybitSymbol, interval, limit);
  await sleep(2500);

  console.log('   [6/8] Bybit OI...');
  const bybitOI = await marketDataService.getOIHistory('Bybit', bybitSymbol, interval, limit);
  await sleep(2500);

  console.log('   [7/8] Bybit Funding...');
  const bybitFunding = await marketDataService.getFundingHistory('Bybit', bybitSymbol, interval, limit);
  await sleep(2500);

  console.log('   [8/8] Bybit CVD...');
  const bybitCVD = await marketDataService.getTakerBuySellVolume('Bybit', bybitSymbol, cvdInterval, limit);

  console.log(`\n✅ Fetched ${binancePrice.length} candles\n`);

  return {
    binance: { price: binancePrice, oi: binanceOI, funding: binanceFunding, cvd: binanceCVD },
    bybit: { price: bybitPrice, oi: bybitOI, funding: bybitFunding, cvd: bybitCVD }
  };
}

/**
 * =======================================================================
 * BUILD SNAPSHOTS - Convert historical data to marketMetrics format
 * =======================================================================
 */
function buildSnapshots(rawData, index, lookback = 10) {
  const { binance, bybit } = rawData;

  // Get slice of data up to current index
  const binPriceSlice = binance.price.slice(Math.max(0, index - lookback), index + 1);
  const binOISlice = binance.oi.slice(Math.max(0, index - lookback), index + 1);
  const binFundingSlice = binance.funding.slice(Math.max(0, index - lookback), index + 1);
  const binCVDSlice = binance.cvd.slice(Math.max(0, index - lookback), index + 1);

  const byPriceSlice = bybit.price.slice(Math.max(0, index - lookback), index + 1);
  const byOISlice = bybit.oi.slice(Math.max(0, index - lookback), index + 1);
  const byCVDSlice = bybit.cvd.slice(Math.max(0, index - lookback), index + 1);

  if (binPriceSlice.length < 2) return null;

  // Calculate metrics for current candle
  const calcChange = (arr, key = 'close') => {
    if (arr.length < 2) return 0;
    const curr = arr[arr.length - 1][key] || arr[arr.length - 1].oi;
    const prev = arr[arr.length - 2][key] || arr[arr.length - 2].oi;
    if (!prev || prev === 0) return 0;
    return ((curr - prev) / prev) * 100;
  };

  const calcCVD = (cvdArr) => {
    if (!cvdArr || cvdArr.length === 0) return 0;
    return cvdArr.reduce((acc, c) => {
      const buy = Number(c.taker_buy_volume_usd || c.buyVol || 0);
      const sell = Number(c.taker_sell_volume_usd || c.sellVol || 0);
      return acc + (buy - sell);
    }, 0);
  };

  const calcFundingAvg = (fundingArr) => {
    if (!fundingArr || fundingArr.length === 0) return 0;
    const rates = fundingArr.map(f => f.rate || f.close || 0);
    return (rates.reduce((a, b) => a + b, 0) / rates.length) * 100;
  };

  // Build snapshot in the format marketMetrics expects
  const snapshot = {
    Binance: {
      '4h': {
        price: binPriceSlice[binPriceSlice.length - 1]?.close || 0,
        price_change: calcChange(binPriceSlice, 'close'),
        oi: binOISlice[binOISlice.length - 1]?.oi || 0,
        oi_change: calcChange(binOISlice, 'oi'),
        cvd: calcCVD(binCVDSlice),
        funding_rate_avg_pct: calcFundingAvg(binFundingSlice),
        volume: binPriceSlice[binPriceSlice.length - 1]?.volume || 0
      }
    },
    Bybit: {
      '4h': {
        price: byPriceSlice[byPriceSlice.length - 1]?.close || 0,
        price_change: calcChange(byPriceSlice, 'close'),
        oi: byOISlice[byOISlice.length - 1]?.oi || 0,
        oi_change: calcChange(byOISlice, 'oi'),
        cvd: calcCVD(byCVDSlice),
        funding_rate_avg_pct: 0,
        volume: byPriceSlice[byPriceSlice.length - 1]?.volume || 0
      }
    }
  };

  // Build history for technical analysis
  const history = {
    priceHistory: binance.price.slice(0, index + 1).map(p => ({
      time: p.time,
      close: p.close,
      price: p.close,
      open: p.open,
      high: p.high,
      low: p.low
    })),
    oiHistory: binance.oi.slice(0, index + 1),
    fundingHistory: binance.funding.slice(0, index + 1)
  };

  return { snapshot, history };
}

/**
 * =======================================================================
 * TRADE SIMULATOR
 * =======================================================================
 */
class TradeSimulator {
  constructor(config) {
    this.config = config;
    this.capital = config.initialCapital;
    this.trades = [];
    this.openPosition = null;
    this.equity = [config.initialCapital];
    this.maxDrawdown = 0;
    this.peakEquity = config.initialCapital;
  }

  processSignal(decision, price, timestamp) {
    const { bias, confidence } = decision;

    // Check exit conditions
    if (this.openPosition) {
      const pnl = this.calculatePnL(price);

      // Stop Loss
      if (pnl <= -this.config.stopLossPercent) {
        this.closePosition(price, timestamp, 'stop_loss');
      }
      // Take Profit
      else if (pnl >= this.config.takeProfitPercent) {
        this.closePosition(price, timestamp, 'take_profit');
      }
      // Signal Reversal
      else if (this.openPosition.direction !== bias &&
        bias !== 'WAIT' &&
        confidence >= this.config.minConfidence) {
        this.closePosition(price, timestamp, 'signal_reversal');
      }
    }

    // Check entry conditions
    if (!this.openPosition &&
      bias !== 'WAIT' &&
      confidence >= this.config.minConfidence) {
      this.openPosition = {
        direction: bias,
        entryPrice: price,
        entryTime: timestamp,
        size: (this.capital * this.config.positionSizePercent / 100) * this.config.leverage
      };
    }

    this.updateEquity(price);
  }

  calculatePnL(currentPrice) {
    if (!this.openPosition) return 0;
    const { direction, entryPrice } = this.openPosition;
    const pnl = direction === 'LONG'
      ? ((currentPrice - entryPrice) / entryPrice) * 100
      : ((entryPrice - currentPrice) / entryPrice) * 100;
    return pnl * this.config.leverage;
  }

  closePosition(price, timestamp, reason) {
    if (!this.openPosition) return;

    const pnlPercent = this.calculatePnL(price);
    const pnlAmount = (this.openPosition.size * pnlPercent) / 100;

    this.capital += pnlAmount;

    this.trades.push({
      direction: this.openPosition.direction,
      entryPrice: this.openPosition.entryPrice,
      exitPrice: price,
      entryTime: this.openPosition.entryTime,
      exitTime: timestamp,
      pnlPercent: Number(pnlPercent.toFixed(2)),
      pnlAmount: Number(pnlAmount.toFixed(2)),
      reason
    });

    this.openPosition = null;
  }

  updateEquity(price) {
    let equity = this.capital;
    if (this.openPosition) {
      equity += (this.openPosition.size * this.calculatePnL(price)) / 100;
    }
    this.equity.push(equity);

    if (equity > this.peakEquity) this.peakEquity = equity;
    const dd = ((this.peakEquity - equity) / this.peakEquity) * 100;
    if (dd > this.maxDrawdown) this.maxDrawdown = dd;
  }

  getStats() {
    const wins = this.trades.filter(t => t.pnlPercent > 0);
    const losses = this.trades.filter(t => t.pnlPercent <= 0);

    return {
      totalTrades: this.trades.length,
      winningTrades: wins.length,
      losingTrades: losses.length,
      winRate: this.trades.length ? Number((wins.length / this.trades.length * 100).toFixed(2)) : 0,
      avgWin: wins.length ? Number((wins.reduce((s, t) => s + t.pnlPercent, 0) / wins.length).toFixed(2)) : 0,
      avgLoss: losses.length ? Number((Math.abs(losses.reduce((s, t) => s + t.pnlPercent, 0)) / losses.length).toFixed(2)) : 0,
      totalReturn: Number(((this.capital - this.config.initialCapital) / this.config.initialCapital * 100).toFixed(2)),
      maxDrawdown: Number(this.maxDrawdown.toFixed(2)),
      finalCapital: Number(this.capital.toFixed(2))
    };
  }
}

/**
 * =======================================================================
 * MAIN BACKTEST RUNNER
 * =======================================================================
 */
/**
 * =======================================================================
 * MOCK DATA GENERATOR - For Demo Mode
 * =======================================================================
 */
function generateMockHistoricalData(days, interval = '4h') {
  console.log('🧪 Generating somewhat realistic MOCK data for simulation...');

  const candlesPerDay = interval === '4h' ? 6 : 1440 / Number(interval.replace('m', ''));
  const totalCandles = Math.floor(days * candlesPerDay);

  const binancePrice = [];
  const binanceOI = [];
  const binanceFunding = [];
  const binanceCVD = [];

  const bybitPrice = [];
  const bybitOI = [];
  const bybitFunding = [];
  const bybitCVD = [];

  let price = 50000;
  let oi = 1000000;
  let time = Date.now() - (totalCandles * (interval === '4h' ? 4 : 1) * 60 * 60 * 1000);

  for (let i = 0; i < totalCandles; i++) {
    // 1. Price (Random Walk with momentum)
    const trend = Math.sin(i / 50) * 200; // gentle wave
    const noise = (Math.random() - 0.5) * 500;
    price += trend + noise;
    if (price < 10000) price = 10000;

    // 2. OI (Correlated + Divergences)
    // Create some divergences for the analyzer to find
    const scenario = Math.random();
    let oiChange = (Math.random() - 0.5) * 10000;

    if (scenario > 0.9) {
      // Divergence: Price Up, Retail OI Up, Whale OI Down (Distribution)
      oiChange += 20000;
    }
    oi += oiChange;
    if (oi < 100000) oi = 100000;

    const bybitOiVal = scenario > 0.9 ? oi * 0.8 : oi * 1.05; // Whale divergence

    // 3. Funding
    const fundingRate = (Math.random() - 0.4) * 0.02; // Mostly positive

    // 4. CVD
    const cvdVal = (Math.random() - 0.5) * 10000000;

    // Common time
    const t = time + i * (interval === '4h' ? 14400000 : 3600000);

    // Push objects matching marketDataService format
    const pObj = { time: t, close: price, open: price * 0.99, high: price * 1.01, low: price * 0.98, volume: Math.random() * 1000 };
    const oiObj = { time: t, oi: oi };
    const fObj = { time: t, close: fundingRate, rate: fundingRate }; // 'close' and 'rate' alias
    const cvdObj = { time: t, taker_buy_volume_usd: cvdVal > 0 ? cvdVal : 0, taker_sell_volume_usd: cvdVal < 0 ? -cvdVal : 0 };

    binancePrice.push(pObj);
    binanceOI.push(oiObj);
    binanceFunding.push(fObj);
    binanceCVD.push(cvdObj);

    bybitPrice.push({ ...pObj, close: price + (Math.random() - 0.5) * 50 }); // Small arb gap
    bybitOI.push({ time: t, oi: bybitOiVal });
    bybitFunding.push(fObj);
    bybitCVD.push({ ...cvdObj, taker_buy_volume_usd: cvdVal > 0 ? cvdVal * 1.2 : 0 }); // Whales flow differently
  }

  return {
    binance: { price: binancePrice, oi: binanceOI, funding: binanceFunding, cvd: binanceCVD },
    bybit: { price: bybitPrice, oi: bybitOI, funding: bybitFunding, cvd: bybitCVD }
  };
}

/**
 * =======================================================================
 * MAIN BACKTEST RUNNER
 * =======================================================================
 */
async function runBacktest(config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  console.log("\n" + "=".repeat(60));
  console.log("🚀 SmartTrading Backtest - Using marketMetrics.js");
  console.log("=".repeat(60));
  console.log(`Symbol: ${cfg.symbol} | Interval: ${cfg.interval} | Days: ${cfg.days}`);
  console.log(`Capital: $${cfg.initialCapital} | Leverage: ${cfg.leverage}x`);
  console.log(`SL: ${cfg.stopLossPercent}% | TP: ${cfg.takeProfitPercent}% | Min Confidence: ${cfg.minConfidence}`);
  console.log("=".repeat(60) + "\n");

  let rawData;

  // Decide whether to fetch real data or generate mock data
  const isDemo = cfg.demo === true || !process.env.COINGLASS_API_KEY;

  if (isDemo) {
    if (!process.env.COINGLASS_API_KEY) {
      console.log("⚠️ No COINGLASS_API_KEY found. Switching to DEMO MODE with synthetic data.");
    } else {
      console.log("⚠️ Demo mode requested. Using synthetic data.");
    }
    rawData = generateMockHistoricalData(cfg.days, cfg.interval);
  } else {
    // Fetch historical data
    rawData = await fetchHistoricalData(cfg);
  }

  const totalCandles = rawData.binance.price.length;

  // Run backtest
  console.log("🔄 Running backtest with marketMetrics.js...\n");

  const simulator = new TradeSimulator(cfg);
  const signals = [];
  const scenarioCounts = {};
  const regimeCounts = {};

  const lookback = 50; // Need history for technical analysis

  for (let i = lookback; i < totalCandles; i++) {
    // Build snapshot for this point in time
    const data = buildSnapshots(rawData, i);
    if (!data) continue;

    // Use marketMetrics.calculateMarketMetrics - THE SAME AS AI ANALYZER
    const metrics = marketMetrics.calculateMarketMetrics(data.snapshot, data.history);

    const price = rawData.binance.price[i].close;
    const timestamp = rawData.binance.price[i].time;

    // Extract decision from metrics
    const decision = metrics.finalDecision || { bias: 'WAIT', confidence: 5 };

    // Track scenarios and regimes
    const scenario = metrics.exchangeDivergence?.scenario || 'unknown';
    const regime = metrics.marketRegime?.regime || 'unknown';
    scenarioCounts[scenario] = (scenarioCounts[scenario] || 0) + 1;
    regimeCounts[regime] = (regimeCounts[regime] || 0) + 1;

    // Process signal
    simulator.processSignal(decision, price, timestamp);

    signals.push({
      time: timestamp,
      price,
      bias: decision.bias,
      confidence: decision.confidence,
      scenario,
      regime,
      // Add equity which was missing in original
      equity: simulator.equity[simulator.equity.length - 1]
    });

    // Progress indicator
    if (i % 100 === 0) {
      process.stdout.write(`   Processing candle ${i}/${totalCandles}...\r`);
    }
  }

  // Close any open position
  if (simulator.openPosition) {
    const lastPrice = rawData.binance.price[totalCandles - 1].close;
    const lastTime = rawData.binance.price[totalCandles - 1].time;
    simulator.closePosition(lastPrice, lastTime, 'end_of_backtest');
  }

  console.log("\n");

  // Print results
  const stats = simulator.getStats();

  console.log("=".repeat(60));
  console.log("📈 BACKTEST RESULTS");
  console.log("=".repeat(60));

  console.log("\n📊 Performance:");
  console.log(`   Total Return:    ${stats.totalReturn > 0 ? '+' : ''}${stats.totalReturn}%`);
  console.log(`   Final Capital:   $${stats.finalCapital.toLocaleString()}`);
  console.log(`   Max Drawdown:    ${stats.maxDrawdown}%`);

  console.log("\n📋 Trades:");
  console.log(`   Total:           ${stats.totalTrades}`);
  console.log(`   Win Rate:        ${stats.winRate}%`);
  console.log(`   Avg Win:         +${stats.avgWin}%`);
  console.log(`   Avg Loss:        -${stats.avgLoss}%`);

  // Signal distribution
  const signalDist = { LONG: 0, SHORT: 0, WAIT: 0 };
  signals.forEach(s => signalDist[s.bias] = (signalDist[s.bias] || 0) + 1);

  console.log("\n📡 Signal Distribution:");
  console.log(`   LONG:  ${signalDist.LONG} (${(signalDist.LONG / signals.length * 100).toFixed(1)}%)`);
  console.log(`   SHORT: ${signalDist.SHORT} (${(signalDist.SHORT / signals.length * 100).toFixed(1)}%)`);
  console.log(`   WAIT:  ${signalDist.WAIT} (${(signalDist.WAIT / signals.length * 100).toFixed(1)}%)`);

  // Scenario distribution
  console.log("\n🎯 Exchange Divergence Scenarios:");
  Object.entries(scenarioCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([scenario, count]) => {
      console.log(`   ${scenario}: ${count} (${(count / signals.length * 100).toFixed(1)}%)`);
    });

  // Regime distribution
  console.log("\n🏛️ Market Regimes:");
  Object.entries(regimeCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([regime, count]) => {
      console.log(`   ${regime}: ${count} (${(count / signals.length * 100).toFixed(1)}%)`);
    });

  // Last trades
  if (simulator.trades.length > 0) {
    console.log("\n📋 Last 5 Trades:");
    simulator.trades.slice(-5).forEach(t => {
      const emoji = t.pnlPercent > 0 ? "✅" : "❌";
      console.log(`   ${emoji} ${t.direction} | $${t.entryPrice.toFixed(0)} → $${t.exitPrice.toFixed(0)} | ${t.pnlPercent > 0 ? '+' : ''}${t.pnlPercent}% | ${t.reason}`);
    });
  }

  console.log("\n" + "=".repeat(60));

  // Save results
  if (cfg.saveResults) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backtest_${cfg.symbol}_${timestamp}.json`;

    try {
      if (!fs.existsSync(cfg.outputDir)) {
        fs.mkdirSync(cfg.outputDir, { recursive: true });
      }

      fs.writeFileSync(path.join(cfg.outputDir, filename), JSON.stringify({
        config: cfg,
        stats,
        trades: simulator.trades,
        signalDistribution: signalDist,
        scenarioDistribution: scenarioCounts,
        regimeDistribution: regimeCounts
      }, null, 2));

      console.log(`✅ Saved to ${cfg.outputDir}/${filename}`);
    } catch (err) {
      console.log(`⚠️ Could not save: ${err.message}`);
    }
  }

  return { stats, trades: simulator.trades, signals };
}

/**
 * =======================================================================
 * CLI
 * =======================================================================
 */
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes('--help')) {
    console.log(`
SmartTrading Backtest
=====================

Usage: node src/backtest/runBacktest.js [options]

Options:
  --days=N              Days of historical data (default: 90)
  --leverage=N          Leverage multiplier (default: 2)
  --stopLoss=N          Stop loss % (default: 2)
  --takeProfit=N        Take profit % (default: 4)
  --minConfidence=N     Min confidence to trade (default: 7)

Example:
  node src/backtest/runBacktest.js --days=60 --leverage=3
`);
    process.exit(0);
  }

  const config = {};
  args.forEach(arg => {
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      if (key === 'days') config.days = Number(value);
      if (key === 'leverage') config.leverage = Number(value);
      if (key === 'stopLoss') config.stopLossPercent = Number(value);
      if (key === 'takeProfit') config.takeProfitPercent = Number(value);
      if (key === 'minConfidence') config.minConfidence = Number(value);
    }
  });

  runBacktest(config).catch(console.error);
}

module.exports = { runBacktest };
