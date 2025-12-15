# SmarTrading Backend - AI Market Analyzer

Backend מתקדם לניתוח שוק קריפטו בזמן אמת עם AI, משתמש ב-**Coinglass API** למידע מקצועי.

## 🎯 מה זה עושה?

המערכת הזו:
- מושכת נתוני שוק **מקצועיים** מ-**Coinglass API**
- נתונים מדויקים מ-Binance ו-Bybit: מחיר, OI, funding rate, long/short ratio, נפח
- **נתוני Liquidations אמיתיים** (longs/shorts) - הערך המוסף הגדול!
- מנרמלת ומעבדת את המטריקות לפורמט נקי
- שומרת את הנתונים ב-cache ל-30 דקות (חוסך API calls)
- מעדכנת אוטומטית כל 30 דקות ברקע
- מספקת API מהיר ויציב לחיבור ל-Base44

## 📋 דרישות

- **Node.js** 18+ ([הורד כאן](https://nodejs.org))
- **npm** (מגיע עם Node.js)

## 🚀 התקנה

### 1. Clone או העתק את הקבצים

```bash
# אם יש לך Git
git clone <repository-url>
cd smartrading-backend

# או פשוט העתק את כל התיקייה
```

### 2. התקן תלויות

```bash
npm install
```

### 3. הגדר Environment Variables

העתק את הקובץ `.env.example` ל-`.env`:

```bash
cp .env.example .env
```

**חשוב מאוד!** ערוך את `.env` והוסף את ה-Coinglass API key שלך:

```env
PORT=3000
NODE_ENV=development
COINGLASS_API_KEY=YOUR_ACTUAL_API_KEY_HERE  # ⚠️ חובה!
CACHE_DURATION_MINUTES=30
RATE_LIMIT_WINDOW_MINUTES=5
RATE_LIMIT_MAX_REQUESTS=10
LOG_LEVEL=info
```

**איך לקבל API key?**
1. לך ל: https://www.coinglass.com/
2. הירשם / התחבר
3. API Settings → Create API Key
4. העתק את הkey לקובץ `.env`

📖 **מדריך מפורט:** קרא את `COINGLASS_SETUP.md`

### 4. הרץ את הסרבר

**פיתוח (עם auto-restart):**
```bash
npm run dev
```

**Production:**
```bash
npm start
```

השרת יעלה על: http://localhost:3000

## 📡 API Endpoints

### 1. בדיקת בריאות
```
GET /health
```

תגובה:
```json
{
  "status": "ok",
  "timestamp": "2025-11-18T10:30:00.000Z",
  "uptime": 123.45,
  "environment": "development"
}
```

### 2. קבלת ניתוח שוק BTC (העיקרי!)
```
GET /api/ai-market-analyzer/btc
```

פרמטרים אופציונליים:
- `?refresh=true` - אלץ רענון (דלג על cache)

תגובה:
```json
{
  "symbol": "BTC",
  "timestamp": "2025-11-18T10:30:00.000Z",
  "binance": {
    "pair": "BTCUSDT",
    "price": 96500,
    "price_change_24h_pct": -2.3,
    "oi": 3800000000,
    "funding_rate": 0.032,
    "long_short_ratio": 1.8,
    "volume_24h": 12500000000,
    "cvd_signal": "rising_against_price"
  },
  "bybit": {
    "pair": "BTCUSD",
    "price": 96620,
    "price_change_24h_pct": -2.1,
    "oi": 1400000000,
    "funding_rate": 0.004,
    "long_short_ratio": 0.9,
    "volume_24h": 4200000000,
    "cvd_signal": "falling_with_price"
  },
  "liquidations_24h": {
    "long_liq_usd": null,
    "short_liq_usd": null,
    "note": "Liquidation data requires premium API"
  },
  "meta": {
    "source": "public_apis",
    "refresh_interval": "30m",
    "cached": true,
    "cached_at": "2025-11-18T10:00:00.000Z",
    "age_minutes": 30,
    "data_quality": "excellent"
  }
}
```

### 3. סטטיסטיקות Cache
```
GET /api/ai-market-analyzer/cache-stats
```

### 4. ניקוי Cache (לבדיקות)
```
POST /api/ai-market-analyzer/clear-cache
```

Body (אופציונלי):
```json
{
  "key": "market_snapshot_btc"
}
```

## 🏗️ ארכיטקטורה

```
smartrading-backend/
├── src/
│   ├── index.js                 # נקודת כניסה ראשית + Express server
│   ├── routes/
│   │   └── marketAnalyzer.js    # API routes
│   ├── services/
│   │   ├── binanceService.js    # שליפת נתונים מ-Binance
│   │   ├── bybitService.js      # שליפת נתונים מ-Bybit
│   │   └── marketAnalyzerService.js  # לוגיקה מרכזית
│   └── utils/
│       ├── logger.js            # Winston logging
│       └── cache.js             # מנהל cache
├── logs/                        # קבצי log
├── .env                         # הגדרות סביבה
├── .env.example                 # תבנית להגדרות
├── package.json
└── README.md
```

## 🎨 תכונות מתקדמות

### ✅ Caching חכם
- נתונים נשמרים ל-30 דקות
- עדכון אוטומטי ברקע כל 30 דקות
- התחלה מהירה - cache נטען בהפעלה

### ✅ Rate Limiting
- הגנה מפני spam
- 10 בקשות לכל 5 דקות (ניתן להגדרה)

### ✅ Error Handling מקצועי
- Fallback למקרה של כשל ב-API
- Logging מפורט של שגיאות
- תגובות ברורות ללקוח

### ✅ Logging מתקדם
- Winston logger עם רמות שונות
- שמירה לקבצים: `logs/error.log`, `logs/combined.log`
- צבעים בקונסול בפיתוח

### ✅ Background Jobs
- Cron job לרענון אוטומטי
- מבטיח שהנתונים תמיד עדכניים

## 🔌 חיבור ל-Base44

ב-Base44, צור HTTP GET Action:

**URL:**
```
https://YOUR-DEPLOYED-URL/api/ai-market-analyzer/btc
```

**Headers:**
```
Content-Type: application/json
```

השתמש בתגובה ב-AI Prompt:

```
Here is the latest BTC market snapshot:
{{response}}

Analyze according to the system instructions...
```

## 🌐 Deployment

### אופציה 1: Railway (מומלץ!)

1. **הירשם ל-Railway:** https://railway.app
2. **צור פרויקט חדש:**
   - New Project → Deploy from GitHub
   - או: Empty Project → Deploy from local
3. **הוסף את ה-environment variables:**
   ```
   PORT=3000
   NODE_ENV=production
   CACHE_DURATION_MINUTES=30
   ```
4. **Deploy!**
   - Railway יזהה את `package.json` אוטומטית
   - הוא ירוץ `npm start`
   - תקבל URL: `https://smartrading-backend-production.up.railway.app`

**עלות:** $5/חודש (500 שעות חינם בחודש הראשון)

### אופציה 2: Vercel

⚠️ **לא מומלץ** - Vercel הוא לserverless, לא מתאים לcron jobs ארוכים.

### אופציה 3: VPS (DigitalOcean, AWS, etc.)

אם אתה רוצה שליטה מלאה:

```bash
# על הסרבר
git clone <repo>
cd smartrading-backend
npm install
npm install -g pm2

# הגדר .env
nano .env

# הרץ עם pm2
pm2 start src/index.js --name smartrading-backend
pm2 save
pm2 startup
```

## 🧪 בדיקות

```bash
# בדוק שהכל עובד
curl http://localhost:3000/health

# קבל נתוני שוק
curl http://localhost:3000/api/ai-market-analyzer/btc

# אלץ רענון
curl "http://localhost:3000/api/ai-market-analyzer/btc?refresh=true"
```

## 🐛 Debugging

אם משהו לא עובד:

1. **בדוק את ה-logs:**
   ```bash
   tail -f logs/combined.log
   tail -f logs/error.log
   ```

2. **בדוק שהפורט פנוי:**
   ```bash
   lsof -i :3000
   ```

3. **ודא שה-.env תקין:**
   ```bash
   cat .env
   ```

4. **הרץ בטרמינל לראות שגיאות:**
   ```bash
   npm run dev
   ```

## 🔮 שדרוגים עתידיים

- [ ] **Coinglass API** - נתוני liquidations מדויקים ($50-100/חודש)
- [ ] **Historical data** - שמירת OI changes בפועל
- [ ] **WebSocket** - עדכונים בזמן אמת
- [ ] **More pairs** - ETH, SOL, וכו'
- [ ] **Authentication** - API keys ללקוחות
- [ ] **Database** - PostgreSQL לhistorical analysis

## 📞 תמיכה

אם יש בעיה או שאלה:
1. בדוק את ה-logs
2. בדוק את ה-health endpoint
3. נסה `npm run dev` לראות שגיאות
4. צור issue או פנה אליי

## 📄 License

ISC - משתמש חופשי

---

**נבנה עם ❤️ עבור SmarTrading**
# SmarTrading
# SmarTrading
# SmarTrading
# smartrading-backend
