const axios = require("axios");

const API_KEY = process.env.COINGLASS_API_KEY || '6fef45f51d10452995d9925cc0688798';
const BASE_URL = "https://open-api-v4.coinglass.com/api";

/**
 * 1. Price OHLC History
 * מחזיר candle אחד אחרון של מחיר
 */
async function getPriceOHLC(exchange = "Binance", symbol = "BTCUSDT", interval = "4h") {
  try {
    const url = `${BASE_URL}/futures/price/history`;

    const { data } = await axios.get(url, {
      params: { exchange, symbol, interval, limit: 2 },
      headers: { "accept": "application/json", "CG-API-KEY": API_KEY }
    });

    if (data.code !== "0") {
      throw new Error(`API Error: ${data.msg}`);
    }

    if (!data.data || data.data.length === 0) {
      throw new Error("No price data returned");
    }

    const candle = data.data[data.data.length - 1];

    return {
      time: candle.time,
      open: Number(candle.open),
      high: Number(candle.high),
      low: Number(candle.low),
      close: Number(candle.close)
    };

  } catch (err) {
    console.error("getPriceOHLC error:", err.message);
    throw err;
  }
}

/**
 * 2. Open Interest OHLC History
 * מחזיר candle אחד אחרון של Open Interest
 */
async function getOpenInterestOHLC(exchange = "Binance", symbol = "BTCUSDT", interval = "4h") {
  try {
    const url = `${BASE_URL}/futures/open-interest/history`;

    const { data } = await axios.get(url, {
      params: { exchange, symbol, interval, limit: 2 },
      headers: { "accept": "application/json", "CG-API-KEY": API_KEY }
    });

    if (data.code !== "0") {
      throw new Error(`API Error: ${data.msg}`);
    }

    if (!data.data || data.data.length === 0) {
      throw new Error("No OI data returned");
    }

    const candle = data.data[data.data.length - 1];

    return {
      time: candle.time || candle.t,
      open: Number(candle.open || candle.o),
      high: Number(candle.high || candle.h),
      low: Number(candle.low || candle.l),
      close: Number(candle.close || candle.c)
    };

  } catch (err) {
    console.error("getOpenInterestOHLC error:", err.message);
    throw err;
  }
}

/**
 * 3. Funding Rate History
 * מחזיר funding rate אחרון או ממוצע
 */
async function getFundingRateHistory(exchange = "Binance", symbol = "BTCUSDT", interval = "4h", limit = 4) {
  try {
    const url = `${BASE_URL}/futures/funding-rate/history`;

    const { data } = await axios.get(url, {
      params: { exchange, symbol, interval, limit },
      headers: { "accept": "application/json", "CG-API-KEY": API_KEY }
    });

    if (data.code !== "0") {
      throw new Error(`API Error: ${data.msg}`);
    }

    if (!data.data || data.data.length === 0) {
      throw new Error("No funding rate data returned");
    }

    // מחזיר את האחרון + ממוצע של כל הנקודות
    const rates = data.data.map(r => Number(r.rate || r.fundingRate || 0));
    const latest = rates[rates.length - 1];
    const average = rates.reduce((a, b) => a + b, 0) / rates.length;

    return {
      latest_rate: latest,
      average_rate: average,
      time: data.data[data.data.length - 1].time || data.data[data.data.length - 1].t
    };

  } catch (err) {
    console.error("getFundingRateHistory error:", err.message);
    throw err;
  }
}

/**
 * 4. Taker Buy/Sell Volume History
 * מחזיר נתוני CVD (buy/sell volumes)
 */
async function getTakerBuySellVolume(exchange = "Binance", symbol = "BTCUSDT", interval = "h4") {
  try {
    const url = `${BASE_URL}/futures/v2/taker-buy-sell-volume/history`;

    const { data } = await axios.get(url, {
      params: { exchange, symbol, interval, limit: 1 },
      headers: { "accept": "application/json", "CG-API-KEY": API_KEY }
    });

    if (data.code !== "0") {
      throw new Error(`API Error: ${data.msg}`);
    }

    if (!data.data || data.data.length === 0) {
      throw new Error("No taker volume data returned");
    }

    const latest = data.data[data.data.length - 1];
    const buyVol = Number(latest.taker_buy_volume_usd || latest.buyVol || 0);
    const sellVol = Number(latest.taker_sell_volume_usd || latest.sellVol || 0);
    const total = buyVol + sellVol;

    return {
      buy_volume: buyVol,
      sell_volume: sellVol,
      net_volume: buyVol - sellVol,
      buy_ratio: total > 0 ? (buyVol / total) * 100 : 50,
      time: latest.time || latest.t
    };

  } catch (err) {
    console.error("getTakerBuySellVolume error:", err.message);
    throw err;
  }
}

/**
 * 5. חישוב Price Change
 * מחשב את השינוי במחיר בין נקודות זמן
 */
async function calculatePriceChange(exchange = "Binance", symbol = "BTCUSDT", interval = "4h", periods = 1) {
  try {
    const url = `${BASE_URL}/futures/price/history`;

    const { data } = await axios.get(url, {
      params: { exchange, symbol, interval, limit: periods + 1 },
      headers: { "accept": "application/json", "CG-API-KEY": API_KEY }
    });

    if (data.code !== "0" || !data.data || data.data.length < 2) {
      throw new Error("Not enough price data for calculation");
    }

    const latest = Number(data.data[data.data.length - 1].close);
    const previous = Number(data.data[data.data.length - 1 - periods].close);
    const change = ((latest - previous) / previous) * 100;

    return {
      current_price: latest,
      previous_price: previous,
      change_pct: change,
      change_abs: latest - previous
    };

  } catch (err) {
    console.error("calculatePriceChange error:", err.message);
    throw err;
  }
}

/**
 * 6. חישוב OI Change
 * מחשב את השינוי ב-Open Interest
 */
async function calculateOIChange(exchange = "Binance", symbol = "BTCUSDT", interval = "4h", periods = 1) {
  try {
    const url = `${BASE_URL}/futures/open-interest/history`;

    const { data } = await axios.get(url, {
      params: { exchange, symbol, interval, limit: periods + 1 },
      headers: { "accept": "application/json", "CG-API-KEY": API_KEY }
    });

    if (data.code !== "0" || !data.data || data.data.length < 2) {
      throw new Error("Not enough OI data for calculation");
    }

    const latest = Number(data.data[data.data.length - 1].close || data.data[data.data.length - 1].c);
    const previous = Number(data.data[data.data.length - 1 - periods].close || data.data[data.data.length - 1 - periods].c);
    const change = ((latest - previous) / previous) * 100;

    return {
      current_oi: latest,
      previous_oi: previous,
      change_pct: change,
      change_abs: latest - previous
    };

  } catch (err) {
    console.error("calculateOIChange error:", err.message);
    throw err;
  }
}

module.exports = {
  getPriceOHLC,
  getOpenInterestOHLC,
  getFundingRateHistory,
  getTakerBuySellVolume,
  calculatePriceChange,
  calculateOIChange
};
