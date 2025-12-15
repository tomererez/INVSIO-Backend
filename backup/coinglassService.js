const axios = require('axios');
const logger = require('../utils/logger');

class CoinglassService {
  constructor() {
    this.baseURL = 'https://open-api.coinglass.com/public/v2';
    this.apiKey = process.env.COINGLASS_API_KEY;
    
    if (!this.apiKey) {
      logger.warn('COINGLASS_API_KEY not found in environment variables');
    }
  }

  /**
   * Get comprehensive market data for BTC from both Binance and Bybit
   */
  async getMarketData() {
    try {
      logger.info('Fetching Coinglass market data...');

      // Parallel requests for better performance
      const [
        binanceData,
        bybitData,
        liquidations,
        globalLongShort
      ] = await Promise.all([
        this.getExchangeData('Binance', 'BTC'),
        this.getExchangeData('Bybit', 'BTC'),
        this.getLiquidations('BTC'),
        this.getGlobalLongShortRatio('BTC')
      ]);

      const result = {
        binance: this.formatExchangeData(binanceData, 'BTCUSDT', globalLongShort?.Binance),
        bybit: this.formatExchangeData(bybitData, 'BTCUSD', globalLongShort?.Bybit),
        liquidations_24h: liquidations
      };

      logger.info('Coinglass data fetched successfully');
      return result;

    } catch (error) {
      logger.error('Error fetching Coinglass data:', error.message);
      throw new Error(`Coinglass API error: ${error.message}`);
    }
  }

  /**
   * Get data for specific exchange and symbol
   */
  async getExchangeData(exchange, symbol) {
    try {
      // Get OI, Funding, and Price data
      const [oiData, fundingData, priceData] = await Promise.all([
        this.getOpenInterest(exchange, symbol),
        this.getFundingRate(exchange, symbol),
        this.getPrice(exchange, symbol)
      ]);

      return {
        exchange,
        symbol,
        oi: oiData,
        funding: fundingData,
        price: priceData
      };

    } catch (error) {
      logger.error(`Error fetching ${exchange} data:`, error.message);
      return null;
    }
  }

  /**
   * Get Open Interest data
   * Endpoint: /indicator/open-interest
   */
  async getOpenInterest(exchange, symbol) {
    const url = `${this.baseURL}/indicator/open-interest`;
    
    const response = await axios.get(url, {
      headers: {
        'coinglassSecret': this.apiKey
      },
      params: {
        symbol: symbol,
        exchange: exchange,
        interval: '0' // Latest data
      },
      timeout: 10000
    });

    if (response.data?.success && response.data?.data?.length > 0) {
      const latest = response.data.data[response.data.data.length - 1];
      
      return {
        current: parseFloat(latest.openInterest) || 0,
        change_24h: parseFloat(latest.oiChangePercent) || 0,
        volume_24h: parseFloat(latest.volumeUsd) || 0,
        timestamp: latest.createTime
      };
    }

    return { current: 0, change_24h: 0, volume_24h: 0, timestamp: null };
  }

  /**
   * Get Funding Rate data
   * Endpoint: /indicator/funding-rate
   */
  async getFundingRate(exchange, symbol) {
    const url = `${this.baseURL}/indicator/funding-rate`;
    
    const response = await axios.get(url, {
      headers: {
        'coinglassSecret': this.apiKey
      },
      params: {
        symbol: symbol,
        exchange: exchange
      },
      timeout: 10000
    });

    if (response.data?.success && response.data?.data?.length > 0) {
      const latest = response.data.data[response.data.data.length - 1];
      
      return {
        rate: parseFloat(latest.rate) * 100 || 0, // Convert to percentage
        timestamp: latest.createTime
      };
    }

    return { rate: 0, timestamp: null };
  }

  /**
   * Get Price data
   * Endpoint: /indicator/price
   */
  async getPrice(exchange, symbol) {
    const url = `${this.baseURL}/indicator/price`;
    
    const response = await axios.get(url, {
      headers: {
        'coinglassSecret': this.apiKey
      },
      params: {
        symbol: symbol,
        exchange: exchange,
        interval: '0' // Latest
      },
      timeout: 10000
    });

    if (response.data?.success && response.data?.data?.length > 0) {
      const latest = response.data.data[response.data.data.length - 1];
      const prev = response.data.data[0]; // First data point (24h ago)
      
      const currentPrice = parseFloat(latest.price) || 0;
      const oldPrice = parseFloat(prev.price) || currentPrice;
      const change24h = oldPrice > 0 ? ((currentPrice - oldPrice) / oldPrice) * 100 : 0;

      return {
        current: currentPrice,
        change_24h_pct: change24h,
        timestamp: latest.createTime
      };
    }

    return { current: 0, change_24h_pct: 0, timestamp: null };
  }

  /**
   * Get Liquidations data (24h)
   * Endpoint: /indicator/liquidation
   */
  async getLiquidations(symbol) {
    try {
      const url = `${this.baseURL}/indicator/liquidation`;
      
      const response = await axios.get(url, {
        headers: {
          'coinglassSecret': this.apiKey
        },
        params: {
          symbol: symbol,
          interval: '24h'
        },
        timeout: 10000
      });

      if (response.data?.success && response.data?.data) {
        const data = response.data.data;
        
        return {
          long_liq_usd: parseFloat(data.longLiquidationUsd) || 0,
          short_liq_usd: parseFloat(data.shortLiquidationUsd) || 0,
          total_liq_usd: parseFloat(data.totalLiquidationUsd) || 0,
          timestamp: data.createTime
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
   * Get Global Long/Short Ratio
   * Endpoint: /indicator/long-short-ratio
   */
  async getGlobalLongShortRatio(symbol) {
    try {
      const url = `${this.baseURL}/indicator/long-short-ratio`;
      
      const response = await axios.get(url, {
        headers: {
          'coinglassSecret': this.apiKey
        },
        params: {
          symbol: symbol,
          interval: '0' // Latest
        },
        timeout: 10000
      });

      if (response.data?.success && response.data?.data) {
        const exchanges = response.data.data;
        
        // Extract Binance and Bybit ratios
        const result = {};
        
        for (const exchange of exchanges) {
          if (exchange.exchangeName === 'Binance' || exchange.exchangeName === 'Bybit') {
            const longAccount = parseFloat(exchange.longAccount) || 0.5;
            const shortAccount = parseFloat(exchange.shortAccount) || 0.5;
            const ratio = shortAccount > 0 ? longAccount / shortAccount : 1;
            
            result[exchange.exchangeName] = {
              long_account: longAccount,
              short_account: shortAccount,
              ratio: ratio
            };
          }
        }
        
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
  formatExchangeData(data, pair, longShortData) {
    if (!data || !data.price) {
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

    const longShortRatio = longShortData?.ratio || 1;
    const netLongs = longShortData?.long_account || 0.5;
    const netShorts = longShortData?.short_account || 0.5;

    return {
      pair: pair,
      price: data.price.current,
      price_change_24h_pct: data.price.change_24h_pct,
      oi: data.oi.current,
      oi_change_24h_pct: data.oi.change_24h,
      funding_rate: data.funding.rate,
      long_short_ratio: longShortRatio,
      volume_24h: data.oi.volume_24h,
      net_longs: netLongs,
      net_shorts: netShorts,
      cvd_signal: this.calculateCVDSignal(
        data.price.change_24h_pct,
        data.oi.change_24h,
        longShortRatio
      )
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
