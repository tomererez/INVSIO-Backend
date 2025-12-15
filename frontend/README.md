# Market Analyzer Tester UI

A comprehensive testing dashboard for the AI Market Analyzer backend, built with React, Tailwind CSS, and Recharts.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Backend server running on port 3000

### Running the Tester

1. **Start the backend** (from repository root):
   ```bash
   npm run dev
   ```

2. **Start the frontend** (from `/frontend` directory):
   ```bash
   cd frontend
   npm run dev
   ```

3. Open http://localhost:5173 in your browser

## 🎛️ Features

### Live Tester Tab
- **Overview** - Main market bias, confidence, scenario detection, and regime analysis
- **Exchanges** - Side-by-side Binance vs Bybit comparison with divergence analysis
- **Signals** - Weighted signal components and decision reasoning
- **History** - Signal tracking over time with confidence charts
- **Raw Data** - JSON inspector for debugging all data structures

### Backtest Lab Tab
- Configure backtest parameters (symbol, interval, days, capital, leverage)
- Set risk/reward settings (stop loss, take profit, min confidence)
- View equity curves and performance metrics
- Analyze signal and scenario distributions
- Review trade history

## 📊 Demo Mode

The system automatically uses **demo data** when:
- No `COINGLASS_API_KEY` is configured in `.env`
- API requests fail
- You add `?demo=true` to the API endpoint

Demo data provides realistic random values for:
- BTC price around $97,500
- Random exchange divergence scenarios
- Random market regimes
- Technical indicators
- CVD, OI, and funding metrics

## 🔧 API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/ai-market-analyzer/btc` | Main analysis (uses demo if no API key) |
| `GET /api/ai-market-analyzer/demo` | Always returns demo data |
| `GET /api/ai-market-analyzer/health` | Health check with API key status |
| `GET /api/ai-market-analyzer/cache-stats` | Cache statistics |
| `POST /api/ai-market-analyzer/clear-cache` | Clear cache |
| `POST /api/backtest/run` | Run backtest |
| `GET /api/backtest/status` | Check backtest availability |

## 🎨 UI Components

### Main Views

1. **BiasIndicator** - Large colored badge showing LONG/SHORT/WAIT with confidence bar
2. **ScenarioTag** - Display detected exchange divergence scenario
3. **RegimeCard** - Show market regime with characteristics
4. **ExchangeCard** - Per-exchange metrics (price, OI, CVD, funding)
5. **SignalsList** - Weighted signal breakdown
6. **JsonViewer** - Expandable raw data inspector

### Charts

- **Decision Scores Pie Chart** - LONG/SHORT/WAIT score distribution
- **Signal History Area Chart** - Confidence tracking over time
- **Equity Curve** - Backtest performance visualization

## 📁 File Structure

```
frontend/
├── src/
│   ├── App.jsx                    # Main app with navigation
│   ├── MarketAnalyzerTester.jsx   # Live tester dashboard
│   ├── BacktestDashboard.jsx      # Backtest interface
│   ├── components/ui/             # Shared UI components
│   │   ├── button.jsx
│   │   ├── card.jsx
│   │   ├── input.jsx
│   │   ├── label.jsx
│   │   └── tabs.jsx
│   ├── index.css                  # Tailwind + custom styles
│   └── main.jsx                   # React entry point
├── package.json
├── tailwind.config.js
└── vite.config.js
```

## 🔑 Setting Up Live Data

To use real Coinglass data instead of demo data:

1. Create a `.env` file in the repository root:
   ```bash
   cp .env.example .env
   ```

2. Add your Coinglass API key:
   ```
   COINGLASS_API_KEY=your_actual_key_here
   ```

3. Restart the backend server

## 🛠️ Customization

### Adding New Scenarios

Edit `src/routes/marketAnalyzer.js` to add new scenarios to the `generateDemoData()` function.

### Styling

The app uses Tailwind CSS with a dark theme. Key color meanings:
- **Emerald** - LONG/bullish signals
- **Red** - SHORT/bearish signals  
- **Amber** - WAIT/neutral signals
- **Purple** - Whale/smart money indicators
- **Blue** - Retail indicators

## ⚠️ Important Notes

- Demo data changes on every refresh (simulates market volatility)
- The History tab only tracks signals from the current session
- Backtest requires API key for historical data
- All timestamps are in local time

## 📝 License

Part of the INVSIO platform. For educational purposes only.
