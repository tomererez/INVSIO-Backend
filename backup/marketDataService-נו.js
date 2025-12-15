// marketDataService.js
// Responsible for fetching + unifying Futures market data for AI models

const axios = require("axios");

const BASE_URL = "https://open-api-v4.coinglass.com/api";
const API_KEY = process.env.COINGLASS_API_KEY;

// ---------------------------
// Generic request wrapper
// ---------------------------
async function coinglassGET(endpoint, params = {}) {
  try {
    const { data } = await axios.get(`${BASE_URL}${endpoint}`, {
      params,
      headers: {
        accept: "application/json",
        "CG-API-KEY": API_KEY
      }
    });

    if (data.code !== "0") {
      console.warn("⚠️ Coinglass API warning:", endpoint, params, data.msg);
      return [];
    }

    return data.data || [];
  } catch (err) {
    console.error(`❌ Coinglass error at ${endpoint}:`, err?.response?.data || err.message);
    return [];
  }
}

// ---------------------------
// Fetchers
// ---------------------------

// Price OHLC
async function getPriceOHLC(exchange, symbol, interval = "4h", limit = 10) {
  return await coinglassGET("/futures/price/history", {
    exchange,
    symbol,
    interval,
    limit,
  });
}

// Open Interest OHLC
async function getOpenInterestOHLC(exchange, symbol, interval = "4h", limit = 10) {
  return await coinglassGET("/futures/open-interest/history", {
    exchange,
    symbol,
    interval,
    limit,
  });
}

// Funding Rate OHLC
async function getFundingRateOHLC(exchange, symbol, interval = "4h", limit = 10) {
  return await coinglassGET("/futures/funding-rate/history", {
    exchange,
    symbol,
    interval,
    limit,
  });
}

// Taker Buy/Sell (CVD)
async function getTakerBuySellVolume(exchange, symbol, interval = "h4", limit = 100) {
  return await coinglassGET("/futures/v2/taker-buy-sell-volume/history", {
    exchange,
    symbol,
    interval,
    limit,
  });
}

// ---------------------------
// Calculations
// ---------------------------

// Price / OI change %
function calculateChange(latest, previous) {
  if (!latest || !previous || previous === 0) return null;
  return ((latest - previous) / previous) * 100;
}

// Extract volume from price OHLC
function extractVolumeFromPriceOHLC(priceData) {
  if (!priceData?.length) return { volume: null };
  
  // Price OHLC doesn't have volume in the response - returning null
  // Volume needs to be fetched from a different endpoint if available
  return { volume: null };
}

// CVD (Taker Buy vs Sell)
function calculateCVD(takerData) {
  if (!takerData?.length) return 0;

  return takerData.reduce((acc, c) => {
    const buy = Number(c.taker_buy_volume_usd || c.buyVol || 0);
    const sell = Number(c.taker_sell_volume_usd || c.sellVol || 0);
    return acc + (buy - sell);
  }, 0);
}

// Funding rate average
function calculateFundingAverage(fundingData) {
  if (!fundingData?.length) return null;

  const values = fundingData.map(c => Number(c.rate || c.fundingRate || 0));
  const sum = values.reduce((a, b) => a + b, 0);
  return sum / values.length;
}

// ---------------------------
// Unified Market Snapshot Builder
// ---------------------------

async function getMarketSnapshot(exchange, symbol) {
  const intervals = ["4h", "1d"];
  const result = {};

  for (const tf of intervals) {
    const [
      priceOHLC,
      oiOHLC,
      fundingOHLC,
      takerVolume
    ] = await Promise.all([
      getPriceOHLC(exchange, symbol, tf, 10),
      getOpenInterestOHLC(exchange, symbol, tf, 10),
      getFundingRateOHLC(exchange, symbol, tf, 10),
      getTakerBuySellVolume(exchange, symbol, tf === "4h" ? "h4" : "h24", 100),
    ]);

    // Arrays are returned in chronological order, so LAST item is the latest
    const latestPrice = priceOHLC[priceOHLC.length - 1];
    const previousPrice = priceOHLC[priceOHLC.length - 2];
    const latestOI = oiOHLC[oiOHLC.length - 1];
    const previousOI = oiOHLC[oiOHLC.length - 2];

    result[tf] = {
      price: Number(latestPrice?.close || 0),
      price_change: calculateChange(
        Number(latestPrice?.close || 0),
        Number(previousPrice?.close || 0)
      ),
      oi: Number(latestOI?.close || latestOI?.c || 0),
      oi_change: calculateChange(
        Number(latestOI?.close || latestOI?.c || 0),
        Number(previousOI?.close || previousOI?.c || 0)
      ),
      volume: extractVolumeFromPriceOHLC(priceOHLC).volume,
      cvd: calculateCVD(takerVolume),
      funding_avg: calculateFundingAverage(fundingOHLC),
    };
  }

  return result;
}

// ---------------------------
// Main exported function
// ---------------------------
async function getFuturesMarketData(symbol = "BTCUSDT") {
  const exchanges = ["Binance", "Bybit"];
  const results = {};

  for (const ex of exchanges) {
    try {
      results[ex] = await getMarketSnapshot(ex, symbol);
    } catch (err) {
      console.error(`❌ Error fetching data for ${ex}:`, err.message);
      results[ex] = null;
    }
  }

  return results;
}

// ---------------------------
// Exports
// ---------------------------
module.exports = {
  getFuturesMarketData,
  getPriceOHLC,
  getOpenInterestOHLC,
  getFundingRateOHLC,
  getTakerBuySellVolume,
  calculateChange,
  calculateCVD,
  calculateFundingAverage,
  getMarketSnapshot
};
