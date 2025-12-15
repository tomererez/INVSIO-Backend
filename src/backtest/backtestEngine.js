// src/backtest/backtestEngine.js - SmartTrading Backtesting Engine

/**
 * =======================================================================
 * TECHNICAL UTILS
 * =======================================================================
 */
class TechnicalUtils {
  static safeArray(arr) {
    return Array.isArray(arr) ? arr : [];
  }

  static last(arr) {
    arr = this.safeArray(arr);
    return arr.length ? arr[arr.length - 1] : null;
  }

  static sma(values, length) {
    const arr = this.safeArray(values);
    if (arr.length < length || length <= 0) return null;
    const slice = arr.slice(-length);
    return slice.reduce((acc, v) => acc + v, 0) / length;
  }

  static ema(values, length) {
    const arr = this.safeArray(values);
    if (arr.length < length || length <= 0) return null;
    const k = 2 / (length + 1);
    let ema = arr[0];
    for (let i = 1; i < arr.length; i++) {
      ema = arr[i] * k + ema * (1 - k);
    }
    return ema;
  }

  static std(values) {
    const arr = this.safeArray(values);
    if (!arr.length) return null;
    const mean = arr.reduce((acc, v) => acc + v, 0) / arr.length;
    const variance = arr.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / arr.length;
    return Math.sqrt(variance);
  }

  static pctChange(from, to) {
    if (from === null || from === 0 || to == null) return null;
    return ((to - from) / Math.abs(from)) * 100;
  }

  static slope(values) {
    const arr = this.safeArray(values);
    const n = arr.length;
    if (n < 2) return null;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += arr[i];
      sumXY += i * arr[i];
      sumXX += i * i;
    }
    const numerator = n * sumXY - sumX * sumY;
    const denominator = n * sumXX - sumX * sumX;
    return denominator === 0 ? null : numerator / denominator;
  }

  static zScore(value, values) {
    const mean = this.sma(values, values.length);
    const std = this.std(values);
    if (mean === null || std === null || std === 0) return null;
    return (value - mean) / std;
  }
}

/**
 * =======================================================================
 * SIGNAL GENERATOR - Same logic as marketMetrics.js
 * =======================================================================
 */
class SignalGenerator {
  
  static analyzeExchangeDivergence(binanceData, bybitData) {
    const b = {
      priceChange: binanceData.price_change || 0,
      oiChange: binanceData.oi_change || 0,
      cvd: binanceData.cvd || 0,
      funding: binanceData.funding_rate_avg_pct || binanceData.funding || 0
    };
    
    const y = {
      priceChange: bybitData.price_change || 0,
      oiChange: bybitData.oi_change || 0,
      cvd: bybitData.cvd || 0,
      funding: bybitData.funding_rate_avg_pct || bybitData.funding || 0
    };
    
    const priceUp = b.priceChange > 0.5;
    const priceDown = b.priceChange < -0.5;
    const binanceOiRising = b.oiChange > 0.5;
    const bybitOiRising = y.oiChange > 0.5;
    const bybitOiFalling = y.oiChange < -0.5;
    const binanceCvdNegative = b.cvd < 0;
    const bybitCvdPositive = y.cvd > 0;
    const fundingHigh = b.funding > 0.05;
    const fundingNegative = b.funding < 0;
    
    // SCENARIO 1: WHALE DISTRIBUTION
    if (priceUp && bybitOiFalling && binanceOiRising && binanceCvdNegative) {
      return { scenario: "whale_distribution", bias: "STRONG_SHORT", confidence: 10 };
    }
    
    // SCENARIO 2: WHALE ACCUMULATION
    if (bybitOiRising && (b.oiChange - y.oiChange) < -0.5 && bybitCvdPositive) {
      return { scenario: "whale_accumulation", bias: "STRONG_LONG", confidence: 9 };
    }
    
    // SCENARIO 3: RETAIL FOMO RALLY
    if (priceUp && binanceOiRising && !bybitOiRising && binanceCvdNegative && fundingHigh) {
      return { scenario: "retail_fomo", bias: "SHORT", confidence: 9 };
    }
    
    // SCENARIO 4: SHORT SQUEEZE SETUP
    if (binanceOiRising && priceDown && fundingNegative && bybitOiRising && bybitCvdPositive) {
      return { scenario: "short_squeeze", bias: "LONG", confidence: 8 };
    }
    
    // SCENARIO 5: SYNCHRONIZED BULLISH
    if (priceUp && binanceOiRising && bybitOiRising && b.cvd > 0 && y.cvd > 0 && !fundingHigh) {
      return { scenario: "sync_bullish", bias: "LONG", confidence: 8 };
    }
    
    // SCENARIO 6: SYNCHRONIZED BEARISH
    if (priceDown && b.cvd < 0 && y.cvd < 0) {
      return { scenario: "sync_bearish", bias: "SHORT", confidence: 8 };
    }
    
    return { scenario: "unclear", bias: "WAIT", confidence: 4 };
  }
  
  static detectMarketRegime(data) {
    const price_change = data.price_change || 0;
    const oi_change = data.oi_change || 0;
    const funding = data.funding_rate_avg_pct || data.funding || 0;
    const cvd = data.cvd || 0;
    
    const priceUp = price_change > 0.5;
    const priceDown = price_change < -0.5;
    const oiRising = oi_change > 0.5;
    const oiFalling = oi_change < -0.5;
    const fundingHigh = funding > 0.05;
    const fundingNegative = funding < 0;
    const cvdNegative = cvd < 0;
    const cvdPositive = cvd > 0;
    
    if (priceUp && oiRising && fundingHigh && cvdNegative) {
      return { regime: "long_trap", bias: "SHORT", confidence: 8 };
    }
    
    if (priceDown && oiRising && fundingNegative && cvdPositive) {
      return { regime: "short_trap", bias: "LONG", confidence: 7 };
    }
    
    if (priceUp && oiFalling) {
      return { regime: "short_covering", bias: "WAIT", confidence: 6 };
    }
    
    if (priceUp && oiRising && !fundingHigh && cvdPositive) {
      return { regime: "healthy_bull", bias: "LONG", confidence: 8 };
    }
    
    if (priceDown && oiRising && cvdNegative) {
      return { regime: "healthy_bear", bias: "SHORT", confidence: 8 };
    }
    
    return { regime: "unclear", bias: "WAIT", confidence: 4 };
  }
  
  static calculateTechnicalBias(priceHistory) {
    if (!priceHistory || priceHistory.length < 50) {
      return { bias: "WAIT", confidence: 0 };
    }
    
    const closes = priceHistory.map(c => c.close || c.price);
    const ema20 = TechnicalUtils.ema(closes, 20);
    const ema50 = TechnicalUtils.ema(closes, 50);
    const slope = TechnicalUtils.slope(closes.slice(-20));
    const lastPrice = closes[closes.length - 1];
    
    if (ema20 === null || ema50 === null) {
      return { bias: "WAIT", confidence: 0 };
    }
    
    let bias = "WAIT";
    let confidence = 5;
    
    if (ema20 > ema50 && slope > 0) {
      bias = "LONG";
      confidence = lastPrice > ema20 ? 7 : 5;
    } else if (ema20 < ema50 && slope < 0) {
      bias = "SHORT";
      confidence = lastPrice < ema20 ? 7 : 5;
    }
    
    return { bias, confidence, ema20, ema50 };
  }
  
  static analyzeFunding(fundingHistory) {
    if (!fundingHistory || fundingHistory.length < 10) {
      return { bias: "WAIT", confidence: 0 };
    }
    
    const rates = fundingHistory.map(f => f.rate || f.funding_rate_avg_pct || f.close);
    const current = rates[rates.length - 1];
    const zScore = TechnicalUtils.zScore(current, rates);
    
    let bias = "WAIT";
    let confidence = 5;
    
    if (current > 0.1) { bias = "SHORT"; confidence = 9; }
    else if (current > 0.05) { bias = "SHORT"; confidence = 7; }
    else if (current < -0.1) { bias = "LONG"; confidence = 9; }
    else if (current < -0.05) { bias = "LONG"; confidence = 7; }
    
    return { bias, confidence, current, zScore };
  }
  
  static generateSignal(binanceData, bybitData, priceHistory, fundingHistory) {
    const signals = [];
    
    // Signal 1: Exchange Divergence (40%)
    const divergence = this.analyzeExchangeDivergence(binanceData, bybitData);
    signals.push({ ...divergence, weight: 0.40, name: "divergence" });
    
    // Signal 2: Market Regime (25%)
    const regime = this.detectMarketRegime(binanceData);
    signals.push({ ...regime, weight: 0.25, name: "regime" });
    
    // Signal 3: Technical (15%)
    const technical = this.calculateTechnicalBias(priceHistory);
    signals.push({ ...technical, weight: 0.15, name: "technical" });
    
    // Signal 4: Funding (12%)
    const funding = this.analyzeFunding(fundingHistory);
    signals.push({ ...funding, weight: 0.12, name: "funding" });
    
    // Signal 5: CVD (8%)
    const cvdBias = binanceData.cvd > 0 ? "LONG" : binanceData.cvd < 0 ? "SHORT" : "WAIT";
    signals.push({ bias: cvdBias, confidence: 6, weight: 0.08, name: "cvd" });
    
    // Calculate weighted scores
    let longScore = 0, shortScore = 0, waitScore = 0;
    
    signals.forEach(s => {
      const weightedConf = (s.confidence / 10) * s.weight * 100;
      if (s.bias === "LONG" || s.bias === "STRONG_LONG") {
        longScore += weightedConf * (s.bias === "STRONG_LONG" ? 1.5 : 1);
      } else if (s.bias === "SHORT" || s.bias === "STRONG_SHORT") {
        shortScore += weightedConf * (s.bias === "STRONG_SHORT" ? 1.5 : 1);
      } else {
        waitScore += weightedConf;
      }
    });
    
    const maxScore = Math.max(longScore, shortScore, waitScore);
    let finalBias, finalConfidence;
    
    if (maxScore === longScore && longScore > shortScore * 1.3) {
      finalBias = "LONG";
      finalConfidence = Math.min((longScore / 40) * 10, 10);
    } else if (maxScore === shortScore && shortScore > longScore * 1.3) {
      finalBias = "SHORT";
      finalConfidence = Math.min((shortScore / 40) * 10, 10);
    } else {
      finalBias = "WAIT";
      finalConfidence = 5;
    }
    
    return {
      bias: finalBias,
      confidence: Number(finalConfidence.toFixed(1)),
      scores: { 
        long: Number(longScore.toFixed(1)), 
        short: Number(shortScore.toFixed(1)), 
        wait: Number(waitScore.toFixed(1)) 
      },
      signals
    };
  }
}

/**
 * =======================================================================
 * TRADE SIMULATOR
 * =======================================================================
 */
class TradeSimulator {
  constructor(config = {}) {
    this.initialCapital = config.initialCapital || 10000;
    this.positionSizePercent = config.positionSizePercent || 10;
    this.leverage = config.leverage || 1;
    this.stopLossPercent = config.stopLossPercent || 2;
    this.takeProfitPercent = config.takeProfitPercent || 4;
    this.minConfidence = config.minConfidence || 7;
    this.reset();
  }
  
  reset() {
    this.capital = this.initialCapital;
    this.trades = [];
    this.openPosition = null;
    this.equity = [this.initialCapital];
    this.maxDrawdown = 0;
    this.peakEquity = this.initialCapital;
  }
  
  processSignal(signal, currentPrice, timestamp) {
    if (this.openPosition) {
      const shouldClose = this.checkExit(currentPrice, signal);
      if (shouldClose) {
        this.exitPosition(currentPrice, timestamp, shouldClose.reason);
      }
    }
    
    if (!this.openPosition && signal.confidence >= this.minConfidence) {
      if (signal.bias === "LONG" || signal.bias === "SHORT") {
        this.enterPosition(signal.bias, currentPrice, timestamp, signal);
      }
    }
    
    this.updateEquity(currentPrice);
  }
  
  checkExit(currentPrice, signal) {
    if (!this.openPosition) return null;
    
    const { direction, entryPrice } = this.openPosition;
    const pnlPercent = direction === "LONG" 
      ? ((currentPrice - entryPrice) / entryPrice) * 100 * this.leverage
      : ((entryPrice - currentPrice) / entryPrice) * 100 * this.leverage;
    
    if (pnlPercent <= -this.stopLossPercent) return { reason: "stop_loss", pnl: pnlPercent };
    if (pnlPercent >= this.takeProfitPercent) return { reason: "take_profit", pnl: pnlPercent };
    
    if ((direction === "LONG" && signal.bias === "SHORT" && signal.confidence >= this.minConfidence) ||
        (direction === "SHORT" && signal.bias === "LONG" && signal.confidence >= this.minConfidence)) {
      return { reason: "signal_reversal", pnl: pnlPercent };
    }
    
    return null;
  }
  
  enterPosition(direction, price, timestamp, signal) {
    const positionSize = (this.capital * this.positionSizePercent / 100) * this.leverage;
    this.openPosition = {
      direction, entryPrice: price, entryTime: timestamp, size: positionSize,
      signal: signal.signals.map(s => `${s.name}:${s.bias}`).join(", ")
    };
  }
  
  exitPosition(price, timestamp, reason) {
    if (!this.openPosition) return;
    
    const { direction, entryPrice, entryTime, size, signal } = this.openPosition;
    const pnlPercent = direction === "LONG"
      ? ((price - entryPrice) / entryPrice) * 100 * this.leverage
      : ((entryPrice - price) / entryPrice) * 100 * this.leverage;
    
    const pnlAmount = (size * pnlPercent) / 100;
    this.capital += pnlAmount;
    
    this.trades.push({
      direction, entryPrice, exitPrice: price, entryTime, exitTime: timestamp,
      pnlPercent: Number(pnlPercent.toFixed(2)), pnlAmount: Number(pnlAmount.toFixed(2)),
      reason, signal
    });
    
    this.openPosition = null;
  }
  
  updateEquity(currentPrice) {
    let currentEquity = this.capital;
    
    if (this.openPosition) {
      const { direction, entryPrice, size } = this.openPosition;
      const unrealizedPnl = direction === "LONG"
        ? ((currentPrice - entryPrice) / entryPrice) * size
        : ((entryPrice - currentPrice) / entryPrice) * size;
      currentEquity += unrealizedPnl;
    }
    
    this.equity.push(currentEquity);
    
    if (currentEquity > this.peakEquity) this.peakEquity = currentEquity;
    const drawdown = ((this.peakEquity - currentEquity) / this.peakEquity) * 100;
    if (drawdown > this.maxDrawdown) this.maxDrawdown = drawdown;
  }
  
  getStats() {
    const totalTrades = this.trades.length;
    const winningTrades = this.trades.filter(t => t.pnlPercent > 0);
    const losingTrades = this.trades.filter(t => t.pnlPercent <= 0);
    
    const winRate = totalTrades > 0 ? (winningTrades.length / totalTrades) * 100 : 0;
    const avgWin = winningTrades.length > 0 ? winningTrades.reduce((s, t) => s + t.pnlPercent, 0) / winningTrades.length : 0;
    const avgLoss = losingTrades.length > 0 ? Math.abs(losingTrades.reduce((s, t) => s + t.pnlPercent, 0) / losingTrades.length) : 0;
    const profitFactor = avgLoss > 0 ? avgWin / avgLoss : avgWin;
    const totalReturn = ((this.capital - this.initialCapital) / this.initialCapital) * 100;
    
    const returns = [];
    for (let i = 1; i < this.equity.length; i++) {
      returns.push((this.equity[i] - this.equity[i-1]) / this.equity[i-1]);
    }
    const avgReturn = returns.length > 0 ? returns.reduce((a,b) => a+b, 0) / returns.length : 0;
    const stdReturn = TechnicalUtils.std(returns) || 0.01;
    const sharpeRatio = stdReturn > 0 ? (avgReturn / stdReturn) * Math.sqrt(252) : 0;
    
    return {
      totalTrades, winningTrades: winningTrades.length, losingTrades: losingTrades.length,
      winRate: Number(winRate.toFixed(2)), avgWin: Number(avgWin.toFixed(2)), avgLoss: Number(avgLoss.toFixed(2)),
      profitFactor: Number(profitFactor.toFixed(2)), totalReturn: Number(totalReturn.toFixed(2)),
      maxDrawdown: Number(this.maxDrawdown.toFixed(2)), sharpeRatio: Number(sharpeRatio.toFixed(2)),
      finalCapital: Number(this.capital.toFixed(2))
    };
  }
}

/**
 * =======================================================================
 * BACKTESTER
 * =======================================================================
 */
class Backtester {
  constructor(config = {}) {
    this.config = {
      initialCapital: config.initialCapital || 10000,
      positionSizePercent: config.positionSizePercent || 10,
      leverage: config.leverage || 1,
      stopLossPercent: config.stopLossPercent || 2,
      takeProfitPercent: config.takeProfitPercent || 4,
      minConfidence: config.minConfidence || 7,
      lookbackPeriod: config.lookbackPeriod || 50,
      ...config
    };
    this.simulator = new TradeSimulator(this.config);
  }
  
  run(data) {
    this.simulator.reset();
    const results = [];
    const startIndex = this.config.lookbackPeriod;
    
    for (let i = startIndex; i < data.length; i++) {
      const candle = data[i];
      const priceHistory = data.slice(i - this.config.lookbackPeriod, i).map(d => ({ close: d.binance.price }));
      
      const signal = SignalGenerator.generateSignal(
        candle.binance, candle.bybit, priceHistory, candle.fundingHistory || []
      );
      
      this.simulator.processSignal(signal, candle.binance.price, candle.time);
      
      results.push({
        time: candle.time, price: candle.binance.price, signal: signal.bias,
        confidence: signal.confidence, position: this.simulator.openPosition?.direction || null,
        equity: this.simulator.equity[this.simulator.equity.length - 1]
      });
    }
    
    if (this.simulator.openPosition) {
      const lastPrice = data[data.length - 1].binance.price;
      this.simulator.exitPosition(lastPrice, data[data.length - 1].time, "end_of_backtest");
    }
    
    return { stats: this.simulator.getStats(), trades: this.simulator.trades, equity: this.simulator.equity, signals: results };
  }
  
  optimize(data, paramRanges) {
    const results = [];
    const slRange = paramRanges.stopLoss || [1, 2, 3];
    const tpRange = paramRanges.takeProfit || [2, 4, 6];
    const confRange = paramRanges.minConfidence || [6, 7, 8];
    const levRange = paramRanges.leverage || [1, 2, 3];
    
    for (const sl of slRange) {
      for (const tp of tpRange) {
        for (const conf of confRange) {
          for (const lev of levRange) {
            this.config.stopLossPercent = sl;
            this.config.takeProfitPercent = tp;
            this.config.minConfidence = conf;
            this.config.leverage = lev;
            
            this.simulator = new TradeSimulator(this.config);
            const result = this.run(data);
            
            results.push({
              params: { stopLoss: sl, takeProfit: tp, minConfidence: conf, leverage: lev },
              stats: result.stats
            });
          }
        }
      }
    }
    
    results.sort((a, b) => b.stats.totalReturn - a.stats.totalReturn);
    return results;
  }
}

/**
 * =======================================================================
 * DATA GENERATOR
 * =======================================================================
 */
class DataGenerator {
  static generateSyntheticData(options = {}) {
    const { days = 90, timeframeHours = 4, basePrice = 95000, volatility = 0.02, trendStrength = 0.001 } = options;
    
    const candlesPerDay = 24 / timeframeHours;
    const totalCandles = days * candlesPerDay;
    const data = [];
    
    let price = basePrice;
    let oi = 50000000000;
    let trend = 0;
    
    for (let i = 0; i < totalCandles; i++) {
      trend += (Math.random() - 0.5) * trendStrength;
      trend *= 0.98;
      
      const change = (Math.random() - 0.5) * volatility + trend;
      price *= (1 + change);
      
      const oiChange = change > 0 ? (Math.random() * 3) - 1 : (Math.random() * 3) - 2;
      oi *= (1 + oiChange / 100);
      
      const whaleStrength = Math.random();
      const retailFomo = Math.random() > 0.7;
      const binanceCvd = change > 0 ? (retailFomo ? -Math.random() * 5e9 : Math.random() * 3e9) : (Math.random() - 0.5) * 4e9;
      const bybitCvd = whaleStrength > 0.6 ? -binanceCvd * 0.3 : binanceCvd * 0.5;
      const funding = (change * 10) + (Math.random() - 0.5) * 0.02;
      
      data.push({
        time: Date.now() - (totalCandles - i) * timeframeHours * 3600000,
        binance: {
          price: Number(price.toFixed(2)), price_change: Number((change * 100).toFixed(2)),
          oi: Number(oi.toFixed(0)), oi_change: Number(oiChange.toFixed(2)),
          cvd: Number(binanceCvd.toFixed(0)), funding_rate_avg_pct: Number(funding.toFixed(4))
        },
        bybit: {
          price: Number(price.toFixed(2)), price_change: Number((change * 100).toFixed(2)),
          oi: Number((oi * 0.3).toFixed(0)), oi_change: Number((oiChange * (whaleStrength > 0.5 ? 1.5 : 0.5)).toFixed(2)),
          cvd: Number(bybitCvd.toFixed(0)), funding_rate_avg_pct: Number((funding * 0.9).toFixed(4))
        }
      });
    }
    
    return data;
  }
}

/**
 * =======================================================================
 * EXPORTS
 * =======================================================================
 */
module.exports = { Backtester, TradeSimulator, SignalGenerator, DataGenerator, TechnicalUtils };
