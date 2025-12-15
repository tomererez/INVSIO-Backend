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
   * מחזיר Snapshot שוק ל־BTC:
   * Binance → BTCUSDT (USDT margined)
   * Bybit   → BTCUSD  (coin margined)
   */
  async getMarketData(symbol = 'BTC') {
    const symbolUpper = symbol.toUpperCase();

    logger.info(
      `Fetching Coinglass pairs-markets data for ${symbolUpper} (Binance: BTCUSDT, Bybit: BTCUSD)...`
    );

    // מביא את כל זוגות ה־BTC מכל הבורסות
    const markets = await this.request('/futures/pairs-markets', {
      symbol: symbolUpper,
    });

    // Binance – BTCUSDT / BTC/USDT
    const binanceRow = markets.find(
      (row) =>
        row.exchange_name === 'Binance' &&
        (
          row.symbol === `${symbolUpper}/USDT` ||   // BTC/USDT
          row.instrument_id === `${symbolUpper}USDT` // BTCUSDT
        )
    );

    // Bybit – BTCUSD / BTC/USD (coin margined)
    const bybitRow = markets.find(
      (row) =>
        row.exchange_name === 'Bybit' &&
        (
          row.symbol === `${symbolUpper}/USD` ||  // BTC/USD
          row.instrument_id === `${symbolUpper}USD` // BTCUSD
        )
    );

    if (!binanceRow && !bybitRow) {
      logger.warn(
        `No Coinglass pairs-markets data found for ${symbolUpper} on Binance/Bybit`
      );
    }

    const binance = this.formatExchangeRow(binanceRow);
    const bybit = this.formatExchangeRow(bybitRow);

    // סכום ליקווידציות 24h (אם יש)
    const longLiq =
      Number(binance.long_liq_usd_24h || 0) +
      Number(bybit.long_liq_usd_24h || 0);
    const shortLiq =
      Number(binance.short_liq_usd_24h || 0) +
      Number(bybit.short_liq_usd_24h || 0);

    const snapshot = {
      symbol: symbolUpper,
      timestamp: new Date().toISOString(),
      binance,
      bybit,
      liquidations_24h: {
        long_liq_usd: longLiq || null,
        short_liq_usd: shortLiq || null,
        total_liq_usd:
          longLiq || shortLiq ? longLiq + shortLiq : null,
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