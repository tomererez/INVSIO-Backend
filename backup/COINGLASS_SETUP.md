# 🔑 מדריך הגדרת Coinglass API

## מה זה Coinglass?

Coinglass הוא ספק מידע מוביל לנתוני דריוטיבים של קריפטו. הוא מספק:
- ✅ Open Interest (OI) מדויק מכל הבורסות
- ✅ Funding Rates בזמן אמת
- ✅ Long/Short Ratios
- ✅ **Liquidations Data** (זה הערך המוסף הגדול!)
- ✅ נתונים היסטוריים

---

## 🚀 התחלה מהירה

### שלב 1: קבל API Key

1. לך ל: https://www.coinglass.com/
2. הירשם / התחבר
3. לך ל-API Settings
4. צור API Key חדש
5. העתק את ה-key

### שלב 2: הגדר ב-Backend

פתח את `.env` והוסף את ה-key שלך:

```env
COINGLASS_API_KEY=your_actual_api_key_here
```

**חשוב:** אל תשתף את ה-key עם אף אחד!

### שלב 3: הרץ את הBackend

```bash
npm run dev
```

אם הכל תקין, תראה:
```
🚀 SmarTrading Backend running on port 3000
✅ Initial cache populated successfully
```

### שלב 4: בדוק שזה עובד

```bash
curl http://localhost:3000/api/ai-market-analyzer/btc
```

אמור לראות JSON עם נתונים אמיתיים מCoinglass!

---

## 📊 מה הAPI מחזיר?

### Binance Data (BTCUSDT)
```json
{
  "pair": "BTCUSDT",
  "price": 96500,
  "price_change_24h_pct": -2.3,
  "oi": 3800000000,
  "oi_change_24h_pct": 7.1,
  "funding_rate": 0.032,
  "long_short_ratio": 1.8,
  "volume_24h": 12500000000,
  "net_longs": 0.64,
  "net_shorts": 0.36,
  "cvd_signal": "rising_against_price"
}
```

### Bybit Data (BTCUSD)
```json
{
  "pair": "BTCUSD",
  "price": 96620,
  "price_change_24h_pct": -2.1,
  "oi": 1400000000,
  "oi_change_24h_pct": 3.2,
  "funding_rate": 0.004,
  "long_short_ratio": 0.9,
  "volume_24h": 4200000000,
  "net_longs": 0.47,
  "net_shorts": 0.53,
  "cvd_signal": "falling_with_price"
}
```

### Liquidations (הערך המוסף!)
```json
{
  "long_liq_usd": 210000000,
  "short_liq_usd": 95000000,
  "total_liq_usd": 305000000,
  "timestamp": "2025-11-18T12:30:00Z"
}
```

---

## 🎯 Endpoints שה-Backend משתמש בהם

המערכת שלנו משתמשת ב-5 endpoints של Coinglass:

### 1. Open Interest
```
GET /public/v2/indicator/open-interest
```
מחזיר: OI נוכחי, שינוי 24h, volume

### 2. Funding Rate
```
GET /public/v2/indicator/funding-rate
```
מחזיר: Funding rate נוכחי

### 3. Price
```
GET /public/v2/indicator/price
```
מחזיר: מחיר נוכחי, שינוי 24h

### 4. Long/Short Ratio
```
GET /public/v2/indicator/long-short-ratio
```
מחזיר: יחס long/short accounts לכל בורסה

### 5. Liquidations
```
GET /public/v2/indicator/liquidation
```
מחזיר: liquidations של longs ושל shorts (24h)

---

## 💰 תמחור Coinglass

| Plan | Price | Requests/Day | Features |
|------|-------|--------------|----------|
| **Free** | $0 | 100 | Basic data |
| **Basic** | $50/mo | 10,000 | + Liquidations |
| **Pro** | $100/mo | 50,000 | + Historical data |
| **Enterprise** | Custom | Unlimited | + Custom endpoints |

**המלצה:** תתחיל עם Basic ($50) - זה מספיק ל-AI Market Analyzer.

---

## 🔧 הגדרות מתקדמות

### שינוי Cache Duration

אם אתה רוצה לעדכן יותר/פחות, שנה ב-`.env`:

```env
# עדכון כל 15 דקות
CACHE_DURATION_MINUTES=15

# עדכון כל שעה
CACHE_DURATION_MINUTES=60
```

### Rate Limiting

Coinglass מגביל לפי plan שלך. אם אתה מקבל שגיאות 429:

```env
# הגדל את הwindow
RATE_LIMIT_WINDOW_MINUTES=10

# או הקטן את המקסימום
RATE_LIMIT_MAX_REQUESTS=5
```

---

## 🐛 Troubleshooting

### שגיאה: "COINGLASS_API_KEY not found"

**פתרון:**
1. בדוק ש-`.env` קיים בתיקייה הראשית
2. ודא שהשם `COINGLASS_API_KEY` (לא Coinglass_api_key)
3. אין רווחים לפני/אחרי ה-=
4. Restart את הbackend

```bash
# נכון:
COINGLASS_API_KEY=abc123xyz

# לא נכון:
COINGLASS_API_KEY = abc123xyz
coinglass_api_key=abc123xyz
```

### שגיאה: 401 Unauthorized

**פתרון:**
- ה-API key לא תקין
- בדוק שהעתקת את כל הkey (לפעמים יש אותיות בסוף)
- צור key חדש בCoinglass

### שגיאה: 429 Too Many Requests

**פתרון:**
- הגעת למכסת הrequests היומית
- שדרג את הplan שלך
- או הגדל את `CACHE_DURATION_MINUTES` ל-60

### שגיאה: "Data unavailable"

**פתרון:**
- Coinglass API יכול להיות עסוק
- בדוק logs: `tail -f logs/error.log`
- נסה שוב אחרי דקה
- המערכת תשתמש בfallback data

---

## 📈 בדיקת Quality

### בדוק שהנתונים הגיוניים:

```bash
# קבל נתונים
curl http://localhost:3000/api/ai-market-analyzer/btc | jq '.'

# בדוק:
# ✅ price הגיוני (90000-100000 לBTC)
# ✅ oi_change_24h_pct לא מטורף (בין -20% ל+20%)
# ✅ funding_rate סביר (-0.1% ל+0.1%)
# ✅ liquidations_24h יש נתונים (לא null)
```

### בדוק cache:

```bash
curl http://localhost:3000/api/ai-market-analyzer/cache-stats
```

אמור לראות:
```json
{
  "totalEntries": 1,
  "cacheDurationMinutes": 30,
  "entries": [
    {
      "key": "market_snapshot_btc",
      "age": 5,
      "expiresIn": 25
    }
  ]
}
```

---

## 🔒 אבטחת ה-API Key

### **לעולם אל תעשה את זה:**

❌ Commit את `.env` ל-Git
❌ שתף את ה-key בpublic repo
❌ שלח את ה-key במייל
❌ תשים את ה-key בקוד עצמו

### **כן תעשה את זה:**

✅ השתמש ב-`.env` (ה-`.gitignore` כבר מגן עליו)
✅ ב-production, הגדר Environment Variables בפלטפורמה
✅ סובב את הkey מדי פעם (צור חדש, מחק ישן)
✅ הגבל IP addresses אם אפשר (בהגדרות Coinglass)

---

## 🚀 Deployment ל-Production

### Railway

```bash
# בפאנל של Railway:
1. Settings → Variables
2. הוסף: COINGLASS_API_KEY = your_key
3. Deploy!
```

### Render

```bash
# בהגדרות של Web Service:
1. Environment → Add Environment Variable
2. Key: COINGLASS_API_KEY
3. Value: your_key
4. Save
```

### DigitalOcean

```bash
# בSSH:
cd /var/www/smartrading-backend
nano .env
# הוסף את הkey
# שמור: CTRL+X, Y, Enter

pm2 restart smartrading-backend
```

---

## 📊 ניטור שימוש

כדי לראות כמה requests עשית היום:

1. לך ל-Coinglass Dashboard
2. API Usage → Statistics
3. בדוק Daily/Monthly usage

**טיפ:** הגדר alert כשאתה מתקרב ל-80% מהמכסה.

---

## 💡 אופטימיזציה

### הפחת requests:

1. **הגדל cache:**
   ```env
   CACHE_DURATION_MINUTES=60
   ```

2. **הפחת auto-refresh:**
   ערוך `src/index.js`:
   ```javascript
   // כל שעה במקום כל 30 דקות
   cron.schedule('0 * * * *', async () => {
   ```

3. **בקש רק מה שצריך:**
   אם לא צריך liquidations, הסר את הקריאה ל-`getLiquidations()`

---

## 🎓 למידה נוספת

- **Coinglass Docs:** https://docs.coinglass.com/
- **API Reference:** https://docs.coinglass.com/api
- **Rate Limits:** https://docs.coinglass.com/rate-limits
- **Support:** support@coinglass.com

---

## ✅ Checklist סופי

לפני שאתה הולך live:

- [ ] API key מוגדר ב-`.env`
- [ ] Backend רץ ללא שגיאות
- [ ] `/api/ai-market-analyzer/btc` מחזיר נתונים אמיתיים
- [ ] `liquidations_24h` יש בו מספרים (לא null)
- [ ] Cache עובד (בדקת `/cache-stats`)
- [ ] Base44 מחובר ועובד
- [ ] AI מחזיר ניתוחים איכותיים
- [ ] Deploy ל-production הצליח
- [ ] Environment variables מוגדרים ב-production
- [ ] כל הפיצ'רים עובדים ב-production URL

---

**מוכן! עכשיו יש לך נתוני Coinglass מלאים! 🎉**
