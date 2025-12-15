# 🚀 התחלה מהירה - 5 דקות עד שזה רץ!

## צעד 1: הורד Node.js

אם אין לך Node.js:
1. לך ל: https://nodejs.org
2. הורד LTS version (18 או 20)
3. התקן (Next → Next → Install)
4. פתח Terminal וודא:
   ```bash
   node -v
   npm -v
   ```

## צעד 2: התקן את הפרויקט

```bash
cd smartrading-backend

# התקן תלויות (יקח דקה)
npm install
```

## צעד 3: הגדר Environment

```bash
# העתק את ה-template
cp .env.example .env

# או צור .env ידנית עם:
PORT=3000
NODE_ENV=development
CACHE_DURATION_MINUTES=30
```

## צעד 4: הרץ!

```bash
npm run dev
```

אמור לראות:
```
🚀 SmarTrading Backend running on port 3000
📊 Environment: development
⏱️  Cache duration: 30 minutes
✅ Initial cache populated successfully
```

## צעד 5: בדוק שזה עובד

**בדיקה 1 - Health:**
פתח דפדפן: http://localhost:3000/health

אמור לראות:
```json
{
  "status": "ok",
  "timestamp": "2025-11-18...",
  "uptime": 5.2,
  "environment": "development"
}
```

**בדיקה 2 - Market Data:**
פתח דפדפן: http://localhost:3000/api/ai-market-analyzer/btc

אמור לראות JSON גדול עם נתוני Binance + Bybit!

---

## ✅ עבד? מעולה!

עכשיו יש לך:
- ✅ Backend שרץ על http://localhost:3000
- ✅ API endpoint ל-market data
- ✅ Cache אוטומטי כל 30 דקות
- ✅ Logs ב-`logs/combined.log`

---

## 🔌 חיבור ל-Base44

ב-Base44, צור HTTP GET Action:

**URL:** `http://localhost:3000/api/ai-market-analyzer/btc`
(או אם עשית deploy: `https://YOUR-RAILWAY-URL/api/ai-market-analyzer/btc`)

**Response:** תקבל JSON עם כל הנתונים

---

## 📝 הצעדים הבאים

1. **בדוק את ה-README.md** - דוקומנטציה מלאה
2. **בדוק את DEPLOYMENT.md** - איך לעלות ל-production
3. **התאם אישית** - שנה את ה-cache duration, rate limits, וכו'

---

## 🆘 בעיות?

**"Cannot find module..."**
```bash
npm install
```

**"Port 3000 already in use"**
```bash
# שנה PORT ב-.env ל-3001
# או סגור את מה שרץ על 3000
```

**"API errors"**
- זה נורמלי לפעמים, Binance/Bybit APIs יכולים להיות עסוקים
- הbackend ימשיך לנסות ויחזור לnormal

---

**זהו! אתה מוכן. בהצלחה! 🚀**
