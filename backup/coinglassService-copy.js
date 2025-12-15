const axios = require('axios');
const logger = require('../utils/logger');

class CoinglassService {
  constructor() {
    this.baseURL = 'https://open-api-v4.coinglass.com/api';
    this.apiKey = process.env.COINGLASS_API_KEY || '6fef45f51d10452995d9925cc0688798';
    
    if (!this.apiKey) {
      logger.warn('COINGLASS_API_KEY not found in environment variables');
    }
  }

  /**
   * Make API request with proper headers
   */
  async request(endpoint, params = {}) {
    try {
      const response = await axios.get(`${this.baseURL}${endpoint}`, {
        headers: {
          'coinglassSecret': this.apiKey
        },
        params,
        timeout: 10000
      });

      return response.data;
    } catch (error) {
      logger.error(`Coinglass API error [${endpoint}]:`, error.message);
      throw error;
    }
  }

  /**
   * Get comprehensive market data for BTC
   */
  async getMarketData() {
    try {
      logger.info('Fetching Coinglass market data...');

      // Get market data, liquidations, and long/short ratios in parallel
      const [
        binancePairMarket,
        bybitPairMarket,
        liquidationsData,
        longShortData
      ] = await Promise.all([
        this.getPairMarket('Binance', 'BTCUSDT'),
        this.getPairMarket('Bybit', 'BTCUSDT'),
        this.getLiquidations('BTC'),
        this.getGlobalLongShortRatio('BTC')
      ]);

      const result = {
        binance: this.formatExchangeData(binancePairMarket, 'BTCUSDT', 'Binance', longShortData),
        bybit: this.formatExchangeData(bybitPairMarket, 'BTCUSDT', 'Bybit', longShortData),
        liquidations_24h: liquidationsData
      };

      logger.info('Coinglass data fetched successfully');
      return result;

    } catch (error) {
      logger.error('Error fetching Coinglass data:', error.message);
      throw error;
    }
  }

  /**
   * Get pair market data (price, OI, funding, volume)
   * Endpoint: /futures/pairs-markets
   */
  async getPairMarket(exchange, symbol) {
    try {
      const data = await this.request('/futures/pairs-markets', {
        symbol: symbol,
        exchange: exchange
      });

      if (data && data.success && data.data) {
        return data.data;
      }

      return null;
    } catch (error) {
      logger.error(`Error fetching ${exchange} pair market:`, error.message);
      return null;
    }
  }

  /**
   * Get Liquidations data (24h aggregated)
   * Endpoint: /futures/liquidation/aggregated-history
   */
  async getLiquidations(symbol) {
    try {
      const data = await this.request('/futures/liquidation/aggregated-history', {
        symbol: symbol,
        interval: 'h24'
      });

      if (data && data.success && data.data && data.data.length > 0) {
        const latest = data.data[data.data.length - 1];
        
        return {
          long_liq_usd: parseFloat(latest.longLiquidationUsd) || 0,
          short_liq_usd: parseFloat(latest.shortLiquidationUsd) || 0,
          total_liq_usd: (parseFloat(latest.longLiquidationUsd) || 0) + (parseFloat(latest.shortLiquidationUsd) || 0),
          timestamp: latest.createTime
        };
      }

      return {
        long_liq_usd: null,
        short_liq_usd: null,
        total_liq_usd: null,
        timestamp: null
      };

    } catch (error) {
      logger.error('Error fetching liquidations:', error.message);
      return {
        long_liq_usd: null,
        short_liq_usd: null,
        total_liq_usd: null,
        error: 'Failed to fetch liquidations'
      };
    }
  }

  /**
   * Get Global Long/Short Account Ratio
   * Endpoint: /futures/global-long-short-account-ratio/history
   */
  async getGlobalLongShortRatio(symbol) {
    try {
      const data = await this.request('/futures/global-long-short-account-ratio/history', {
        symbol: symbol,
        interval: 'h1'
      });

      if (data && data.success && data.data && data.data.length > 0) {
        // Get latest data for each exchange
        const result = {};
        
        data.data.forEach(exchange => {
          if (exchange.data && exchange.data.length > 0) {
            const latest = exchange.data[exchange.data.length - 1];
            const longAccount = parseFloat(latest.longAccount) || 0.5;
            const shortAccount = parseFloat(latest.shortAccount) || 0.5;
            const ratio = shortAccount > 0 ? longAccount / shortAccount : 1;
            
            result[exchange.exchangeName] = {
              long_account: longAccount,
              short_account: shortAccount,
              ratio: ratio
            };
          }
        });
        
        return result;
      }

      return null;

    } catch (error) {
      logger.error('Error fetching long/short ratio:', error.message);
      return null;
    }
  }

  /**
   * Format exchange data into standard structure
   */
  formatExchangeData(pairData, pair, exchangeName, longShortData) {
    if (!pairData) {
      return {
        pair: pair,
        price: null,
        price_change_24h_pct: null,
        oi: null,
        oi_change_24h_pct: null,
        funding_rate: null,
        long_short_ratio: null,
        volume_24h: null,
        net_longs: null,
        net_shorts: null,
        cvd_signal: null,
        error: 'Data unavailable'
      };
    }

    const longShort = longShortData?.[exchangeName];
    const longShortRatio = longShort?.ratio || 1;
    const netLongs = longShort?.long_account || 0.5;
    const netShorts = longShort?.short_account || 0.5;

    const price = parseFloat(pairData.price) || 0;
    const priceChange = parseFloat(pairData.priceChangePercent) || 0;
    const oi = parseFloat(pairData.openInterest) || 0;
    const oiChange = parseFloat(pairData.openInterestChange) || 0;
    const fundingRate = parseFloat(pairData.rate) || 0;
    const volume = parseFloat(pairData.volUsd) || 0;

    return {
      pair: pair,
      price: price,
      price_change_24h_pct: priceChange,
      oi: oi,
      oi_change_24h_pct: oiChange,
      funding_rate: fundingRate * 100, // Convert to percentage
      long_short_ratio: longShortRatio,
      volume_24h: volume,
      net_longs: netLongs,
      net_shorts: netShorts,
      cvd_signal: this.calculateCVDSignal(priceChange, oiChange, longShortRatio)
    };
  }

  /**
   * Calculate CVD signal based on price, OI, and positioning
   */
  calculateCVDSignal(priceChange, oiChange, longShortRatio) {
    // Price down, OI up, longs heavy = potential accumulation (contrarian buy)
    if (priceChange < -1 && oiChange > 0 && longShortRatio > 1.2) {
      return 'rising_against_price';
    }
    
    // Price up, OI up, shorts heavy = potential short squeeze
    if (priceChange > 1 && oiChange > 0 && longShortRatio < 0.8) {
      return 'rising_with_short_squeeze';
    }
    
    // Price up, OI down = distribution (weak rally)
    if (priceChange > 1 && oiChange < -2) {
      return 'falling_with_price';
    }
    
    // Price down, OI down = healthy correction
    if (priceChange < -1 && oiChange < -2) {
      return 'falling_healthy';
    }

    return 'neutral';
  }
}

module.exports = new CoinglassService();