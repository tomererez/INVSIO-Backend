// src/bot/tradingBot.js - SmartTrading Live Trading Bot
// Uses existing services from smarttrading-backend

const crypto = require('crypto');
const axios = require('axios');
const { SignalGenerator } = require('../backtest/backtestEngine');

// Import existing services (נתיב יחסי מתוך src/bot)
const marketDataService = require('../services/marketDataService');
const marketMetrics = require('../services/marketMetrics');

/**
 * =======================================================================
 * CONFIGURATION
 * =======================================================================
 */
const CONFIG = {
  symbol: 'BTCUSDT',
  positionSizePercent: 10,
  leverage: 2,
  stopLossPercent: 2,
  takeProfitPercent: 4,
  minConfidence: 7,
  checkInterval: 4 * 60 * 60 * 1000, // 4 hours
  
  enableTelegram: true,
  enableAutoTrading: false,
  dryRun: true,
};

/**
 * =======================================================================
 * TELEGRAM NOTIFIER
 * =======================================================================
 */
class TelegramNotifier {
  constructor() {
    this.botToken = process.env.TELEGRAM_BOT_TOKEN;
    this.chatId = process.env.TELEGRAM_CHAT_ID;
    this.enabled = !!(this.botToken && this.chatId);
    
    if (!this.enabled) {
      console.log('⚠️ Telegram not configured (set TELEGRAM_BOT_TOKEN & TELEGRAM_CHAT_ID)');
    }
  }

  async send(message) {
    if (!this.enabled) {
      console.log('📱 [TELEGRAM]:', message.substring(0, 100) + '...');
      return;
    }

    try {
      await axios.post(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
        chat_id: this.chatId,
        text: message,
        parse_mode: 'Markdown'
      });
    } catch (err) {
      console.error('❌ Telegram error:', err.message);
    }
  }

  async sendSignal(signal, marketData, analysis) {
    const emoji = signal.bias === 'LONG' ? '🟢' : signal.bias === 'SHORT' ? '🔴' : '⚪';
    const stars = '⭐'.repeat(Math.min(Math.round(signal.confidence), 10));
    
    const divergence = analysis?.exchangeDivergence || {};
    const regime = analysis?.marketRegime || {};
    
    const message = `
${emoji} *SmartTrading Signal*
━━━━━━━━━━━━━━━━━━━━

*Bias:* ${signal.bias}
*Confidence:* ${signal.confidence}/10 ${stars}

*Scores:*
• Long: ${signal.scores.long}
• Short: ${signal.scores.short}
• Wait: ${signal.scores.wait}

*Exchange Divergence:*
• Scenario: ${divergence.scenario || 'N/A'}
• Binance OI: ${marketData.binance?.oi_change || 0}%
• Bybit OI: ${marketData.bybit?.oi_change || 0}%

*Market Regime:*
• ${regime.regime || 'N/A'} (${regime.subType || ''})

*Market Data:*
• Price: $${(marketData.binance?.price || 0).toLocaleString()}
• Funding: ${(marketData.binance?.funding_rate_avg_pct || 0).toFixed(4)}%

_${new Date().toISOString()}_
`;
    
    await this.send(message);
  }

  async sendTradeExecution(trade) {
    const emoji = trade.side === 'BUY' ? '🟢' : '🔴';
    
    const message = `
${emoji} *Trade Executed*
━━━━━━━━━━━━━━━━━━━━

*Symbol:* ${trade.symbol}
*Side:* ${trade.side}
*Size:* ${trade.quantity}
*Price:* $${trade.price.toLocaleString()}

*Risk Management:*
• Stop Loss: $${trade.stopLoss.toLocaleString()}
• Take Profit: $${trade.takeProfit.toLocaleString()}

_${new Date().toISOString()}_
`;
    
    await this.send(message);
  }

  async sendError(error) {
    await this.send(`🚨 *Error*\n${error.message || error}`);
  }
}

/**
 * =======================================================================
 * BINANCE FUTURES CLIENT
 * =======================================================================
 */
class BinanceFuturesClient {
  constructor() {
    this.apiKey = process.env.BINANCE_API_KEY;
    this.apiSecret = process.env.BINANCE_API_SECRET;
    this.baseUrl = 'https://fapi.binance.com';
    this.enabled = !!(this.apiKey && this.apiSecret);
    
    if (!this.enabled) {
      console.log('⚠️ Binance not configured (set BINANCE_API_KEY & BINANCE_API_SECRET)');
    }
  }

  sign(queryString) {
    return crypto
      .createHmac('sha256', this.apiSecret)
      .update(queryString)
      .digest('hex');
  }

  async request(method, endpoint, params = {}) {
    if (!this.enabled) {
      console.log(`🔒 [BINANCE DISABLED] ${method} ${endpoint}`);
      return null;
    }

    const timestamp = Date.now();
    const queryString = Object.entries({ ...params, timestamp })
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    
    const signature = this.sign(queryString);
    const url = `${this.baseUrl}${endpoint}?${queryString}&signature=${signature}`;

    try {
      const response = await axios({ method, url, headers: { 'X-MBX-APIKEY': this.apiKey } });
      return response.data;
    } catch (err) {
      console.error(`❌ Binance error:`, err.response?.data || err.message);
      throw err;
    }
  }

  async getBalance() {
    const account = await this.request('GET', '/fapi/v2/balance');
    if (!account) return null;
    const usdt = account.find(a => a.asset === 'USDT');
    return usdt ? parseFloat(usdt.availableBalance) : 0;
  }

  async getPosition(symbol) {
    const positions = await this.request('GET', '/fapi/v2/positionRisk', { symbol });
    if (!positions?.length) return null;
    const p = positions[0];
    return {
      symbol: p.symbol,
      positionAmt: parseFloat(p.positionAmt),
      entryPrice: parseFloat(p.entryPrice),
      unrealizedProfit: parseFloat(p.unRealizedProfit),
      leverage: parseInt(p.leverage)
    };
  }

  async setLeverage(symbol, leverage) {
    return this.request('POST', '/fapi/v1/leverage', { symbol, leverage });
  }

  async marketOrder(symbol, side, quantity) {
    return this.request('POST', '/fapi/v1/order', { symbol, side, type: 'MARKET', quantity });
  }

  async stopLossOrder(symbol, side, quantity, stopPrice) {
    return this.request('POST', '/fapi/v1/order', {
      symbol, side, type: 'STOP_MARKET', quantity, stopPrice, closePosition: 'true'
    });
  }

  async takeProfitOrder(symbol, side, quantity, stopPrice) {
    return this.request('POST', '/fapi/v1/order', {
      symbol, side, type: 'TAKE_PROFIT_MARKET', quantity, stopPrice, closePosition: 'true'
    });
  }

  async closePosition(symbol) {
    const position = await this.getPosition(symbol);
    if (!position || position.positionAmt === 0) return null;
    const side = position.positionAmt > 0 ? 'SELL' : 'BUY';
    return this.marketOrder(symbol, side, Math.abs(position.positionAmt));
  }

  async getPrice(symbol) {
    try {
      const res = await axios.get(`${this.baseUrl}/fapi/v1/ticker/price`, { params: { symbol } });
      return parseFloat(res.data.price);
    } catch (err) {
      return null;
    }
  }
}

/**
 * =======================================================================
 * TRADING BOT
 * =======================================================================
 */
class TradingBot {
  constructor(config = {}) {
    this.config = { ...CONFIG, ...config };
    this.telegram = new TelegramNotifier();
    this.binance = new BinanceFuturesClient();
    this.lastSignal = null;
    this.isRunning = false;
  }

  /**
   * Fetch market data using existing services
   */
  async fetchMarketData() {
    console.log('📡 Fetching market data...');
    
    const result = await marketDataService.getFuturesMarketData(this.config.symbol, {
      includeHistory: true,
      timeframes: ['4h']
    });
    
    return result;
  }

  /**
   * Analyze market using existing marketMetrics
   */
  async analyze() {
    console.log('\n🔍 Analyzing market...');
    
    const rawData = await this.fetchMarketData();
    
    // Use existing marketMetrics
    const analysis = marketMetrics.calculateMarketMetrics(rawData);
    
    // Get data for signal generator
    const binance4h = rawData.snapshot?.Binance?.['4h'] || {};
    const bybit4h = rawData.snapshot?.Bybit?.['4h'] || {};
    const priceHistory = rawData.history?.priceHistory || [];
    const fundingHistory = rawData.history?.fundingHistory || [];
    
    // Generate signal
    const signal = SignalGenerator.generateSignal(
      binance4h,
      bybit4h,
      priceHistory,
      fundingHistory
    );
    
    console.log(`📊 Signal: ${signal.bias} | Confidence: ${signal.confidence}/10`);
    console.log(`   Scores - Long: ${signal.scores.long} | Short: ${signal.scores.short} | Wait: ${signal.scores.wait}`);
    console.log(`   Scenario: ${analysis?.exchangeDivergence?.scenario || 'N/A'}`);
    console.log(`   Regime: ${analysis?.marketRegime?.regime || 'N/A'}`);
    
    return { 
      signal, 
      marketData: { binance: binance4h, bybit: bybit4h },
      analysis 
    };
  }

  /**
   * Execute trade
   */
  async executeTrade(signal, marketData) {
    if (!this.config.enableAutoTrading) {
      console.log('⚠️ Auto trading disabled - signal only');
      return null;
    }
    
    if (this.config.dryRun) {
      console.log(`🧪 [DRY RUN] Would execute: ${signal.bias}`);
      return { dryRun: true, signal };
    }
    
    const price = marketData.binance.price;
    const balance = await this.binance.getBalance();
    
    if (!balance) throw new Error('Could not fetch balance');
    
    const positionValue = (balance * this.config.positionSizePercent / 100) * this.config.leverage;
    const quantity = (positionValue / price).toFixed(3);
    
    const stopLoss = signal.bias === 'LONG'
      ? price * (1 - this.config.stopLossPercent / 100)
      : price * (1 + this.config.stopLossPercent / 100);
    
    const takeProfit = signal.bias === 'LONG'
      ? price * (1 + this.config.takeProfitPercent / 100)
      : price * (1 - this.config.takeProfitPercent / 100);
    
    await this.binance.setLeverage(this.config.symbol, this.config.leverage);
    
    const side = signal.bias === 'LONG' ? 'BUY' : 'SELL';
    const order = await this.binance.marketOrder(this.config.symbol, side, quantity);
    
    const slSide = signal.bias === 'LONG' ? 'SELL' : 'BUY';
    await this.binance.stopLossOrder(this.config.symbol, slSide, quantity, stopLoss.toFixed(2));
    await this.binance.takeProfitOrder(this.config.symbol, slSide, quantity, takeProfit.toFixed(2));
    
    const trade = { symbol: this.config.symbol, side, quantity, price, stopLoss, takeProfit, order };
    
    await this.telegram.sendTradeExecution(trade);
    
    return trade;
  }

  /**
   * Main tick function
   */
  async tick() {
    try {
      const { signal, marketData, analysis } = await this.analyze();
      
      // Send Telegram alert
      if (this.config.enableTelegram) {
        await this.telegram.sendSignal(signal, marketData, analysis);
      }
      
      // Check if we should trade
      if (signal.confidence >= this.config.minConfidence && signal.bias !== 'WAIT') {
        if (this.lastSignal !== signal.bias) {
          console.log(`\n🎯 New signal: ${signal.bias} (was: ${this.lastSignal || 'none'})`);
          
          if (this.lastSignal && this.lastSignal !== 'WAIT') {
            console.log('📤 Closing existing position...');
            if (this.config.enableAutoTrading && !this.config.dryRun) {
              await this.binance.closePosition(this.config.symbol);
            }
          }
          
          await this.executeTrade(signal, marketData);
          this.lastSignal = signal.bias;
        } else {
          console.log(`⏸️ Signal unchanged: ${signal.bias}`);
        }
      } else {
        console.log(`⏸️ No action - confidence ${signal.confidence} < ${this.config.minConfidence} or WAIT`);
      }
      
    } catch (err) {
      console.error('❌ Tick error:', err.message);
      await this.telegram.sendError(err);
    }
  }

  /**
   * Start bot
   */
  async start() {
    console.log('\n' + '='.repeat(60));
    console.log('🤖 SmartTrading Bot Starting');
    console.log('='.repeat(60));
    console.log(`Symbol: ${this.config.symbol}`);
    console.log(`Leverage: ${this.config.leverage}x`);
    console.log(`SL: ${this.config.stopLossPercent}% | TP: ${this.config.takeProfitPercent}%`);
    console.log(`Min Confidence: ${this.config.minConfidence}/10`);
    console.log(`Auto Trading: ${this.config.enableAutoTrading ? 'ENABLED' : 'DISABLED'}`);
    console.log(`Dry Run: ${this.config.dryRun ? 'YES' : 'NO'}`);
    console.log(`Telegram: ${this.telegram.enabled ? 'ENABLED' : 'DISABLED'}`);
    console.log(`Binance: ${this.binance.enabled ? 'ENABLED' : 'DISABLED'}`);
    console.log('='.repeat(60));
    
    await this.tick();
    
    this.isRunning = true;
    this.interval = setInterval(() => this.tick(), this.config.checkInterval);
    
    console.log(`\n✅ Bot running. Next check in ${this.config.checkInterval / 1000 / 60} minutes.`);
  }

  stop() {
    if (this.interval) clearInterval(this.interval);
    this.isRunning = false;
    console.log('🛑 Bot stopped');
  }
}

/**
 * =======================================================================
 * EXPORTS
 * =======================================================================
 */
module.exports = { TradingBot, TelegramNotifier, BinanceFuturesClient, CONFIG };

/**
 * =======================================================================
 * CLI
 * =======================================================================
 */
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--help')) {
    console.log(`
SmartTrading Bot
================

Usage: node src/bot/tradingBot.js [options]

Options:
  --auto      Enable auto trading
  --live      Disable dry run (real trades!)
  --once      Run once and exit

Environment:
  COINGLASS_API_KEY     Required for market data
  TELEGRAM_BOT_TOKEN    For alerts
  TELEGRAM_CHAT_ID      For alerts  
  BINANCE_API_KEY       For trading
  BINANCE_API_SECRET    For trading
`);
    process.exit(0);
  }
  
  const config = {
    enableAutoTrading: args.includes('--auto'),
    dryRun: !args.includes('--live'),
  };
  
  const bot = new TradingBot(config);
  
  if (args.includes('--once')) {
    bot.tick().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
  } else {
    bot.start();
    process.on('SIGINT', () => { bot.stop(); process.exit(0); });
  }
}
