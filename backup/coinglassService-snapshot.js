const axios = require('axios');
const logger = require('../utils/logger');

class CoinglassService {
  constructor() {
    this.baseURL = 'https://open-api-v4.coinglass.com/api';
    this.apiKey = process.env.COINGLASS_API_KEY;

    if (!this.apiKey) {
      logger.warn(
        'COINGLASS_API_KEY is not set. CoinglassService requests will fail until you set it in .env'
      );
    }
  }

  /**
   * Wrapper כללי ל־GET ל־Coinglass v4
   */
  async request(endpoint, params = {}) {
    if (!this.apiKey) {
      throw new Error('Missing COINGLASS_API_KEY');
    }

    try {
      const url = `${this.baseURL}${endpoint}`;

      const res = await axios.get(url, {
        headers: {
          // בדיוק כמו ה־curl שעבד לך:
          // curl -H "CG-API-KEY: xxx" ...
          'CG-API-KEY': this.apiKey,
        },
        params,
        timeout: 10000,
      });

      const body = res.data || {};

      // הצלחה ב־Coinglass v4: code === "0" או 0
      if (body.code !== '0' && body.code !== 0) {
        const msg = body.msg || 'Unknown Coinglass error';
        logger.error(`Coinglass API error [${endpoint}]: ${msg}`, {
          endpoint,
          params,
          code: body.code,
        });
        throw new Error(`Coinglass API error: ${msg}`);
      }

      return body.data || [];
    } catch (err) {
      logger.error(`Coinglass HTTP error [${endpoint}]: ${err.message}`, {
        endpoint,
        params,
      });
      throw err;
    }
  }

  /**
   * פורמט נוח לשורה אחת של Exchange מתוך /futures/pairs-markets
   */
  formatExchangeRow(row) {
    if (!row) {
      return {
        pair: null,
        price: null,
        price_change_24h_pct: null,
        oi: null,
        oi_change_24h_pct: null,
        funding_rate: null,
        long_short_ratio: null,
        volume_24h: null,
        volume_change_24h_pct: null,
        long_volume_usd: null,
        short_volume_usd: null,
        long_liq_usd_24h: null,
        short_liq_usd_24h: null,
        error: 'Data unavailable',
      };
    }

    const longVol = Number(row.long_volume_usd ?? 0);
    const shortVol = Number(row.short_volume_usd ?? 0);
    const longShortRatio =
      longVol > 0 && shortVol > 0 ? longVol / shortVol : null;

    return {
      pair: row.instrument_id || row.symbol || null,
      price: row.current_price ?? null,
      price_change_24h_pct: row.price_change_percent_24h ?? null,
      oi: row.open_interest_usd ?? null,
      oi_change_24h_pct: row.open_interest_change_percent_24h ?? null,
      funding_rate: row.funding_rate ?? null,
      long_short_ratio: longShortRatio,
      volume_24h: row.volume_usd ?? null,
      volume_change_24h_pct: row.volume_usd_change_percent_24h ?? null,
      long_volume_usd: row.long_volume_usd ?? null,
      short_volume_usd: row.short_volume_usd ?? null,
      long_liq_usd_24h: row.long_liquidation_usd_24h ?? null,
      short_liq_usd_24h: row.short_liquidation_usd_24h ?? null,
    };
  }

  /**
   * מביא Taker Buy/Sell Volume (CVD approximation)
   * Endpoint: /futures/taker-buy-sell-volume/history
   */
  async getTakerBuySell(exchange, symbol, interval = 'h4') {
    try {
      const data = await this.request('/futures/taker-buy-sell-volume/history', {
        exchange,
        symbol,
        interval
      });

      if (!data || data.length === 0) {
        return null;
      }

      // לוקח את הנקודה האחרונה
      const latest = data[data.length - 1];
      const buy = Number(latest.taker_buy_volume_usd || 0);
      const sell = Number(latest.taker_sell_volume_usd || 0);
      const total = buy + sell;
      
      return {
        buy_volume: buy,
        sell_volume: sell,
        net_volume: buy - sell,
        buy_ratio: total > 0 ? (buy / total) * 100 : 50,
        timestamp: latest.time
      };
    } catch (error) {
      logger.warn(`Taker buy/sell not available for ${exchange}/${symbol}/${interval}: ${error.message}`);
      return null;
    }
  }

  /**
   * מחזיר Snapshot שוק ל־BTC:
   * Binance → BTCUSDT (USDT margined)
   * Bybit   → BTCUSD  (coin margined)
   * מחזיר נתונים גם ל-4h וגם ל-24h
   */
  async getMarketData(symbol = 'BTC') {
    const symbolUpper = symbol.toUpperCase();

    logger.info(
      `Fetching Coinglass data for ${symbolUpper} (4h + 24h)...`
    );

    // מבצע קריאות במקביל: markets 4h, markets 24h, taker 4h, taker 24h
    const [markets4h, markets24h, binanceTaker4h, bybitTaker4h, binanceTaker24h, bybitTaker24h] = await Promise.all([
      this.request('/futures/pairs-markets', { symbol: symbolUpper, time_type: '4h' }),
      this.request('/futures/pairs-markets', { symbol: symbolUpper, time_type: '24h' }),
      this.getTakerBuySell('Binance', `${symbolUpper}USDT`, 'h4'),
      this.getTakerBuySell('Bybit', `${symbolUpper}USD`, 'h4'),
      this.getTakerBuySell('Binance', `${symbolUpper}USDT`, 'h24'),
      this.getTakerBuySell('Bybit', `${symbolUpper}USD`, 'h24')
    ]);

    // Binance – BTCUSDT / BTC/USDT
    const binanceRow4h = markets4h.find(
      (row) =>
        row.exchange_name === 'Binance' &&
        (row.symbol === `${symbolUpper}/USDT` || row.instrument_id === `${symbolUpper}USDT`)
    );
    
    const binanceRow24h = markets24h.find(
      (row) =>
        row.exchange_name === 'Binance' &&
        (row.symbol === `${symbolUpper}/USDT` || row.instrument_id === `${symbolUpper}USDT`)
    );

    // Bybit – BTCUSD / BTC/USD (coin margined)
    const bybitRow4h = markets4h.find(
      (row) =>
        row.exchange_name === 'Bybit' &&
        (row.symbol === `${symbolUpper}/USD` || row.instrument_id === `${symbolUpper}USD`)
    );
    
    const bybitRow24h = markets24h.find(
      (row) =>
        row.exchange_name === 'Bybit' &&
        (row.symbol === `${symbolUpper}/USD` || row.instrument_id === `${symbolUpper}USD`)
    );

    if (!binanceRow4h && !bybitRow4h && !binanceRow24h && !bybitRow24h) {
      logger.warn(`No Coinglass data found for ${symbolUpper}`);
    }

    const binance = {
      '4h': {
        ...this.formatExchangeRow(binanceRow4h),
        ...(binanceTaker4h && {
          cvd_buy_volume: binanceTaker4h.buy_volume,
          cvd_sell_volume: binanceTaker4h.sell_volume,
          cvd_net_volume: binanceTaker4h.net_volume,
          cvd_buy_ratio: binanceTaker4h.buy_ratio
        })
      },
      '24h': {
        ...this.formatExchangeRow(binanceRow24h),
        ...(binanceTaker24h && {
          cvd_buy_volume: binanceTaker24h.buy_volume,
          cvd_sell_volume: binanceTaker24h.sell_volume,
          cvd_net_volume: binanceTaker24h.net_volume,
          cvd_buy_ratio: binanceTaker24h.buy_ratio
        })
      }
    };
    
    const bybit = {
      '4h': {
        ...this.formatExchangeRow(bybitRow4h),
        ...(bybitTaker4h && {
          cvd_buy_volume: bybitTaker4h.buy_volume,
          cvd_sell_volume: bybitTaker4h.sell_volume,
          cvd_net_volume: bybitTaker4h.net_volume,
          cvd_buy_ratio: bybitTaker4h.buy_ratio
        })
      },
      '24h': {
        ...this.formatExchangeRow(bybitRow24h),
        ...(bybitTaker24h && {
          cvd_buy_volume: bybitTaker24h.buy_volume,
          cvd_sell_volume: bybitTaker24h.sell_volume,
          cvd_net_volume: bybitTaker24h.net_volume,
          cvd_buy_ratio: bybitTaker24h.buy_ratio
        })
      }
    };

    // סכום ליקווידציות (מ-24h)
    const longLiq =
      Number(binance['24h'].long_liq_usd_24h || 0) +
      Number(bybit['24h'].long_liq_usd_24h || 0);
    const shortLiq =
      Number(binance['24h'].short_liq_usd_24h || 0) +
      Number(bybit['24h'].short_liq_usd_24h || 0);

    const snapshot = {
      symbol: symbolUpper,
      timestamp: new Date().toISOString(),
      binance,
      bybit,
      liquidations_24h: {
        long_liq_usd: longLiq || null,
        short_liq_usd: shortLiq || null,
        total_liq_usd: longLiq || shortLiq ? longLiq + shortLiq : null,
      },
      meta: {
        source: 'coinglass_api',
        refresh_interval: '30m',
      },
    };

    logger.info('Coinglass market snapshot built successfully', {
      symbol: snapshot.symbol,
    });

    return snapshot;
  }
}

module.exports = new CoinglassService();