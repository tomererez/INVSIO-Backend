# CoinGlass API - STARTUP Plan Endpoints Reference

> **Plan Details:**  
> - **Price:** $79/month ($948/year with annual billing)  
> - **Endpoints:** 80+ Data endpoints  
> - **Rate Limit:** 80 requests/minute  
> - **Update Frequency:** ≤ 1 minute  
> - **Use Case:** Personal use  
> - **Support:** Priority email support

---

## Plan Limitations Summary

| Feature | STARTUP Limit |
|---------|---------------|
| Historical data interval | ≥ 30 minutes |
| Rate limit | 80 requests/min |
| Commercial use | ❌ Not allowed |

**Note:** For historical OHLC endpoints, STARTUP plan is limited to intervals of 30m and above (30m, 1h, 4h, 1d). Intervals below 30m (1m, 5m, 15m) require STANDARD plan or higher.

---

## Base URL

```
https://open-api-v4.coinglass.com
```

---

## FUTURES

### Trading Market

| Endpoint | Description | Available | Interval Limit |
|----------|-------------|-----------|----------------|
| `/futures/supported-coins` | Get supported futures coins | ✅ | - |
| `/futures/supported-exchanges` | Get supported exchanges | ✅ | - |
| `/futures/supported-exchange-pairs` | Get supported exchange and pairs | ✅ | - |
| `/api/futures/coins-markets` | Futures coin markets (comprehensive metrics) | ❌ | Standard+ |
| `/api/futures/pairs-markets` | Futures pair markets | ✅ | - |
| `/futures/price-change-list` | Price change list | ✅ | - |
| `/api/price/ohlc-history` | Price OHLC history | ✅ | ≥30m |

### Open Interest

| Endpoint | Description | Available | Interval Limit |
|----------|-------------|-----------|----------------|
| `/api/futures/open-interest/history` | Open Interest OHLC history | ✅ | ≥30m |
| `/api/futures/open-interest/aggregated-history` | Aggregated OI OHLC history | ✅ | ≥30m |
| `/api/futures/open-interest/aggregated-stablecoin-history` | Aggregated stablecoin OI OHLC | ✅ | ≥30m |
| `/api/futures/open-interest/aggregated-coin-margin-history` | Aggregated coin margin OI OHLC | ✅ | ≥30m |
| `/api/futures/open-interest/exchange-list` | OI by exchange list | ✅ | - |
| `/api/futures/open-interest/exchange-history-chart` | OI chart by exchange | ✅ | ≥30m |

### Funding Rate

| Endpoint | Description | Available | Interval Limit |
|----------|-------------|-----------|----------------|
| `/api/futures/funding-rate/history` | Funding rate OHLC history | ✅ | ≥30m |
| `/api/futures/funding-rate/oi-weight-history` | OI-weighted funding rate OHLC | ✅ | ≥30m |
| `/api/futures/funding-rate/vol-weight-history` | Volume-weighted funding rate OHLC | ✅ | ≥30m |
| `/api/futures/funding-rate/exchange-list` | Funding rate by exchange list | ✅ | Real-time |
| `/api/futures/funding-rate/accumulated-exchange-list` | Cumulative funding rate list | ✅ | - |
| `/api/futures/funding-rate/arbitrage` | Funding arbitrage opportunities | ✅ | Real-time |

### Long/Short Ratio

| Endpoint | Description | Available | Interval Limit |
|----------|-------------|-----------|----------------|
| `/api/futures/global-long-short-account-ratio/history` | Global long/short account ratio | ✅ | ≥30m |
| `/api/futures/top-long-short-account-ratio/history` | Top trader long/short ratio | ✅ | ≥30m |
| `/api/futures/top-long-short-position-ratio/history` | Top trader position ratio | ✅ | ≥30m |
| `/api/futures/taker-buy-sell-volume/exchange-list` | Exchange Taker Buy/Sell Ratio | ✅ | Real-time |

### Liquidation

| Endpoint | Description | Available | Interval Limit |
|----------|-------------|-----------|----------------|
| `/api/futures/liquidation/history` | Pair Liquidation History | ✅ | ≥30m |
| `/api/futures/liquidation/aggregated-history` | Coin Liquidation History | ✅ | ≥30m |
| `/api/futures/liquidation/coin-list` | Liquidation Coin List | ✅ | Real-time |
| `/api/futures/liquidation/exchange-list` | Liquidation Exchange List | ✅ | Real-time |
| `/api/futures/liquidation/order` | Liquidation Order (last 7 days) | ✅ | Real-time |
| `/api/futures/liquidation/heatmap/model1` | Pair Liquidation Heatmap Model1 | ✅ | Real-time |
| `/api/futures/liquidation/heatmap/model2` | Pair Liquidation Heatmap Model2 | ✅ | Real-time |
| `/api/futures/liquidation/heatmap/model3` | Pair Liquidation Heatmap Model3 | ✅ | Real-time |
| `/api/futures/liquidation/aggregated-heatmap/model1` | Coin Liquidation Heatmap Model1 | ✅ | Real-time |
| `/api/futures/liquidation/aggregated-heatmap/model2` | Coin Liquidation Heatmap Model2 | ✅ | Real-time |
| `/api/futures/liquidation/aggregated-heatmap/model3` | Coin Liquidation Heatmap Model3 | ✅ | Real-time |
| `/api/futures/liquidation/map` | Pair Liquidation Map | ✅ | Real-time |
| `/api/futures/liquidation/aggregated-map` | Coin Liquidation Map | ✅ | Real-time |

### Order Book

| Endpoint | Description | Available | Interval Limit |
|----------|-------------|-----------|----------------|
| `/api/futures/orderbook/ask-bids-history` | Pair Orderbook Bid&Ask(±range) | ✅ | ≥30m |
| `/api/futures/orderbook/aggregated-ask-bids-history` | Coin Orderbook Bid&Ask(±range) | ✅ | ≥30m |
| `/api/futures/orderbook/history` | Orderbook Heatmap | ✅ | - |
| `/api/futures/orderbook/large-limit-order` | Large Orderbook | ✅ | Real-time |
| `/api/futures/orderbook/large-limit-order-history` | Large Orderbook History | ✅ | - |

### Whale Positions (Hyperliquid)

| Endpoint | Description | Available | Interval Limit |
|----------|-------------|-----------|----------------|
| `/api/hyperliquid/whale-alert` | Hyperliquid Whale Alert | ✅ | Real-time |
| `/api/hyperliquid/whale-position` | Hyperliquid Whale Position | ✅ | Real-time |

### Taker Buy/Sell

| Endpoint | Description | Available | Interval Limit |
|----------|-------------|-----------|----------------|
| `/api/futures/v2/taker-buy-sell-volume/history` | Pair Taker Buy/Sell History | ✅ | ≥30m |
| `/api/futures/aggregated-taker-buy-sell-volume/history` | Coin Taker Buy/Sell History | ✅ | ≥30m |

---

## SPOTS

### Trading Market

| Endpoint | Description | Available | Interval Limit |
|----------|-------------|-----------|----------------|
| `/api/spot/supported-coins` | Supported Coins | ✅ | - |
| `/api/spot/supported-exchange-pairs` | Supported Exchange and Pairs | ✅ | - |
| `/api/spot/coins-markets` | Coins Markets | ✅ | - |
| `/api/spot/pairs-markets` | Pairs Markets | ✅ | - |
| `/api/spot/price/history` | Price OHLC History | ✅ | ≥30m |

### Order Book

| Endpoint | Description | Available | Interval Limit |
|----------|-------------|-----------|----------------|
| `/api/spot/orderbook/ask-bids-history` | Pair Orderbook Bid&Ask(±range) | ✅ | ≥30m |
| `/api/spot/orderbook/aggregated-ask-bids-history` | Coin Orderbook Bid&Ask(±range) | ✅ | ≥30m |
| `/api/spot/orderbook/history` | Orderbook Heatmap | ✅ | - |
| `/api/spot/orderbook/large-limit-order` | Large Orderbook | ✅ | Real-time |
| `/api/spot/orderbook/large-limit-order-history` | Large Orderbook History | ✅ | - |

### Taker Buy/Sell

| Endpoint | Description | Available | Interval Limit |
|----------|-------------|-----------|----------------|
| `/api/spot/taker-buy-sell-volume/history` | Pair Taker Buy/Sell History | ✅ | ≥30m |
| `/api/spot/aggregated-taker-buy-sell-volume/history` | Coin Taker Buy/Sell History | ✅ | ≥30m |

---

## OPTIONS

| Endpoint | Description | Available | Interval Limit |
|----------|-------------|-----------|----------------|
| `/api/option/max-pain` | Option Max Pain | ✅ | - |
| `/api/option/info` | Options Info | ✅ | - |
| `/api/option/exchange-oi-history` | Exchange Open Interest History | ✅ | - |
| `/api/option/exchange-vol-history` | Exchange Volume History | ✅ | - |

---

## ON-CHAIN

### Exchange Data

| Endpoint | Description | Available | Interval Limit |
|----------|-------------|-----------|----------------|
| `/api/exchange/assets` | Exchange Assets | ✅ | - |
| `/api/exchange/balance/list` | Exchange Balance List | ✅ | - |
| `/api/exchange/balance/chart` | Exchange Balance Chart | ✅ | - |

### Transactions

| Endpoint | Description | Available | Interval Limit |
|----------|-------------|-----------|----------------|
| `/api/exchange/chain/tx/list` | Exchange On-chain Transfers (ERC-20) | ✅ | - |

---

## ETF

### Bitcoin ETF

| Endpoint | Description | Available | Interval Limit |
|----------|-------------|-----------|----------------|
| `/api/etf/bitcoin/list` | Bitcoin ETF List | ✅ | - |
| `/api/hk-etf/bitcoin/flow-history` | Hong Kong ETF Flows History | ✅ | - |
| `/api/etf/bitcoin/net-assets/history` | ETF NetAssets History | ✅ | - |
| `/api/etf/bitcoin/flow-history` | ETF Flows History | ✅ | - |
| `/api/etf/bitcoin/premium-discount/history` | ETF Premium/Discount History | ✅ | - |
| `/api/etf/bitcoin/history` | ETF History | ✅ | - |
| `/api/etf/bitcoin/price/history` | ETF Price History | ✅ | - |
| `/api/etf/bitcoin/detail` | ETF Detail | ✅ | - |

### Ethereum ETF

| Endpoint | Description | Available | Interval Limit |
|----------|-------------|-----------|----------------|
| `/api/etf/ethereum/net-assets-history` | ETF NetAssets History | ✅ | - |
| `/api/etf/ethereum/list` | Ethereum ETF List | ✅ | - |
| `/api/etf/ethereum/flow-history` | ETF Flows History | ✅ | - |

### Grayscale

| Endpoint | Description | Available | Interval Limit |
|----------|-------------|-----------|----------------|
| `/api/grayscale/holdings-list` | Holdings List | ✅ | - |
| `/api/grayscale/premium-history` | Premium History | ✅ | - |

---

## INDICATORS

### Futures Indicators

| Endpoint | Description | Available | Interval Limit |
|----------|-------------|-----------|----------------|
| `/api/futures/rsi/list` | RSI List | ✅ | - |
| `/api/futures/basis/history` | Futures Basis | ✅ | - |

### Spot Indicators

| Endpoint | Description | Available | Interval Limit |
|----------|-------------|-----------|----------------|
| `/api/coinbase-premium-index` | Coinbase Premium Index | ✅ | - |
| `/api/bitfinex-margin-long-short` | Bitfinex Margin Long/Short | ✅ | - |
| `/api/borrow-interest-rate/history` | Borrow Interest Rate | ✅ | - |

### Market Indicators

| Endpoint | Description | Available | Interval Limit |
|----------|-------------|-----------|----------------|
| `/api/index/ahr999` | AHR999 Index | ✅ | - |
| `/api/index/puell-multiple` | Puell-Multiple | ✅ | - |
| `/api/index/stock-flow` | Stock-to-Flow Model | ✅ | - |
| `/api/index/pi-cycle-indicator` | Pi Cycle Top Indicator | ✅ | - |
| `/api/index/golden-ratio-multiplier` | Golden-Ratio-Multiplier | ✅ | - |
| `/api/index/bitcoin/profitable-days` | Bitcoin Profitable Days | ✅ | - |
| `/api/index/bitcoin/rainbow-chart` | Bitcoin-Rainbow-Chart | ✅ | - |
| `/api/index/fear-greed-history` | Crypto Fear & Greed Index | ✅ | - |
| `/api/index/stableCoin-marketCap-history` | StableCoin MarketCap History | ✅ | - |
| `/api/index/bitcoin/bubble-index` | Bitcoin Bubble Index | ✅ | - |
| `/api/bull-market-peak-indicator` | Bull Market Peak Indicators | ✅ | - |
| `/api/index/2-year-ma-multiplier` | Two Year MA Multiplier | ✅ | - |
| `/api/index/200-week-moving-average-heatmap` | 200-Week Moving Avg Heatmap | ✅ | - |

---

## ENDPOINTS NOT AVAILABLE ON STARTUP PLAN

These endpoints require **STANDARD** ($299/mo) or higher plans:

| Endpoint | Description | Required Plan |
|----------|-------------|---------------|
| `/api/futures/coins-markets` | Comprehensive futures coin metrics | Standard+ |
| Historical data at intervals < 30m | 1m, 5m, 15m candles | Standard+ |
| WebSocket streams | Real-time streaming | Standard+ |

---

## AUTHENTICATION

All API requests require authentication via header:

```
coinglassSecret: YOUR_API_KEY
```

**Example Request (Python):**

```python
import requests

API_KEY = "your_api_key_here"
BASE_URL = "https://open-api-v4.coinglass.com"

headers = {
    "accept": "application/json",
    "coinglassSecret": API_KEY
}

# Example: Get Funding Rate Exchange List
response = requests.get(
    f"{BASE_URL}/api/futures/funding-rate/exchange-list",
    headers=headers,
    params={"symbol": "BTC"}
)

print(response.json())
```

---

## RELEVANT ENDPOINTS FOR AI MARKET ANALYZER

Based on the MarketAnalyzer specifications, these are the most critical endpoints for your use case:

### Core Data (Real-time)
- `/api/futures/funding-rate/exchange-list` - Current funding rates
- `/api/futures/open-interest/exchange-list` - Current OI by exchange
- `/api/futures/liquidation/order` - Live liquidation orders
- `/api/futures/taker-buy-sell-volume/exchange-list` - Taker buy/sell ratio

### Historical Data (≥30m intervals)
- `/api/futures/open-interest/history` - OI OHLC for analysis
- `/api/futures/funding-rate/history` - Funding rate history
- `/api/futures/liquidation/history` - Liquidation history
- `/api/futures/v2/taker-buy-sell-volume/history` - Order flow history
- `/api/futures/global-long-short-account-ratio/history` - Long/short ratio

### Liquidation Analysis
- `/api/futures/liquidation/heatmap/model1-3` - Liquidation heatmaps
- `/api/futures/liquidation/map` - Liquidation price levels
- `/api/futures/liquidation/aggregated-map` - Aggregated liquidation levels

### Orderbook Depth
- `/api/futures/orderbook/large-limit-order` - Large orders
- `/api/futures/orderbook/ask-bids-history` - Historical orderbook depth

### Market Sentiment
- `/api/index/fear-greed-history` - Fear & Greed Index
- `/api/coinbase-premium-index` - Coinbase premium

---

## DOCUMENTATION LINKS

- **Full API Documentation:** https://docs.coinglass.com/
- **Pricing Page:** https://www.coinglass.com/pricing
- **Authentication Guide:** https://docs.coinglass.com/reference/authentication
- **Error Codes:** https://docs.coinglass.com/reference/responses-error-codes

---

*Last Updated: December 2024*
