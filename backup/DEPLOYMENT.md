# מדריך Deployment - SmarTrading Backend

## 🚀 Deployment ל-Railway (מומלץ!)

Railway הוא הפתרון הכי פשוט ומהיר. עלות: **$5/חודש** (500 שעות חינם בחודש הראשון).

### שלב 1: הכנה

1. **צור חשבון GitHub** (אם אין לך)
2. **העלה את הקוד ל-GitHub:**

```bash
cd smartrading-backend

# אתחל Git
git init

# הוסף את כל הקבצים
git add .

# Commit
git commit -m "Initial commit - SmarTrading Backend"

# צור repository ב-GitHub ואז:
git remote add origin https://github.com/YOUR_USERNAME/smartrading-backend.git
git branch -M main
git push -u origin main
```

### שלב 2: Deploy ל-Railway

1. **הירשם ל-Railway:**
   - לך ל: https://railway.app
   - התחבר עם GitHub

2. **צור פרויקט חדש:**
   - לחץ על "New Project"
   - בחר "Deploy from GitHub repo"
   - בחר את ה-repository שלך: `smartrading-backend`

3. **הגדר Environment Variables:**
   - בפאנל של Railway, לחץ על הפרויקט
   - לך ל-"Variables"
   - הוסף:
   ```
   NODE_ENV=production
   PORT=3000
   CACHE_DURATION_MINUTES=30
   RATE_LIMIT_WINDOW_MINUTES=5
   RATE_LIMIT_MAX_REQUESTS=10
   LOG_LEVEL=info
   ```

4. **Deploy!**
   - Railway יזהה את `package.json` אוטומטית
   - הוא יבנה ויריץ את הפרויקט
   - תקבל URL כמו: `https://smartrading-backend-production.up.railway.app`

### שלב 3: בדיקה

```bash
# בדוק health
curl https://YOUR-RAILWAY-URL.up.railway.app/health

# בדוק market analyzer
curl https://YOUR-RAILWAY-URL.up.railway.app/api/ai-market-analyzer/btc
```

✅ אם הכל עובד - מעולה!

---

## 🌐 אלטרנטיבות ל-Deployment

### אופציה 2: Render.com (חינם!)

Render מציעה tier חינמי, אבל השרת "ישן" אחרי 15 דקות ללא שימוש.

1. **הירשם ל-Render:** https://render.com
2. **צור Web Service חדש:**
   - New → Web Service
   - Connect your GitHub repo
3. **הגדרות:**
   - **Name:** smartrading-backend
   - **Environment:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** Free (או Starter - $7/month)
4. **Environment Variables:** הוסף כמו ב-Railway
5. **Deploy!**

**חסרון:** בתוכנית החינמית, השרת ישן ולוקח 30 שניות להתעורר.

---

### אופציה 3: DigitalOcean Droplet (שליטה מלאה)

אם אתה רוצה VPS משלך:

**עלות:** $6/חודש (Droplet הכי בסיסי)

#### שלב 1: צור Droplet

1. הירשם ל-DigitalOcean: https://digitalocean.com
2. צור Droplet חדש:
   - **Image:** Ubuntu 22.04 LTS
   - **Plan:** Basic ($6/month)
   - **Location:** Frankfurt (הכי קרוב לישראל)
   - **Authentication:** SSH keys (מומלץ) או Password

#### שלב 2: התחבר לשרת

```bash
ssh root@YOUR_DROPLET_IP
```

#### שלב 3: התקן Node.js

```bash
# עדכן מערכת
apt update && apt upgrade -y

# התקן Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs

# וודא שהותקן
node -v
npm -v
```

#### שלב 4: Clone והתקן

```bash
# התקן Git
apt install -y git

# Clone הפרויקט
cd /var/www
git clone https://github.com/YOUR_USERNAME/smartrading-backend.git
cd smartrading-backend

# התקן dependencies
npm install

# צור .env
nano .env
```

הדבק:
```env
NODE_ENV=production
PORT=3000
CACHE_DURATION_MINUTES=30
RATE_LIMIT_WINDOW_MINUTES=5
RATE_LIMIT_MAX_REQUESTS=10
LOG_LEVEL=info
```

שמור: `CTRL+X`, `Y`, `Enter`

#### שלב 5: התקן PM2 (Process Manager)

```bash
npm install -g pm2

# הרץ את האפליקציה
pm2 start src/index.js --name smartrading-backend

# שמור את הקונפיגורציה
pm2 save

# הפעל PM2 בהפעלה
pm2 startup
# הרץ את הפקודה שPM2 מציג
```

#### שלב 6: הגדר Nginx (Reverse Proxy)

```bash
apt install -y nginx

# צור קובץ קונפיג
nano /etc/nginx/sites-available/smartrading
```

הדבק:
```nginx
server {
    listen 80;
    server_name YOUR_DOMAIN_OR_IP;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

שמור והפעל:
```bash
ln -s /etc/nginx/sites-available/smartrading /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx
```

#### שלב 7: הגדר Firewall

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw enable
```

#### שלב 8: (אופציונלי) SSL עם Let's Encrypt

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d your-domain.com
```

✅ **סיימת!** השרת שלך זמין ב: `http://YOUR_IP` או `https://your-domain.com`

---

## 🔄 עדכון אחרי Deployment

### Railway/Render
- פשוט תעשה `git push` - הם יעשו deploy אוטומטי!

### DigitalOcean
```bash
ssh root@YOUR_IP
cd /var/www/smartrading-backend
git pull
npm install
pm2 restart smartrading-backend
```

---

## 🧪 בדיקת Production

אחרי deployment, בדוק:

```bash
# 1. Health check
curl https://YOUR-URL/health

# 2. Market data
curl https://YOUR-URL/api/ai-market-analyzer/btc

# 3. Cache stats
curl https://YOUR-URL/api/ai-market-analyzer/cache-stats
```

---

## 🔧 Troubleshooting

### Railway/Render

**שגיאת Build:**
- בדוק ב-Logs של Railway
- ודא ש-`package.json` תקין
- ודא שיש `src/index.js`

**Application Crash:**
- בדוק Logs
- ודא שכל ה-Environment Variables הוגדרו
- נסה להריץ לוקלית: `npm start`

### DigitalOcean

**אפליקציה לא עובדת:**
```bash
# בדוק סטטוס
pm2 status

# ראה logs
pm2 logs smartrading-backend

# Restart
pm2 restart smartrading-backend
```

**Nginx לא עובד:**
```bash
# בדוק סטטוס
systemctl status nginx

# ראה logs
tail -f /var/log/nginx/error.log
```

---

## 💡 טיפים

1. **Railway** - הכי מהיר ופשוט, מושלם להתחלה
2. **Render Free** - טוב לבדיקות, אבל לא production
3. **DigitalOcean** - אם אתה רוצה שליטה מלאה וזול יותר בטווח ארוך

**ההמלצה שלי:** תתחיל עם **Railway**, זה עובד מיד ועולה רק $5.

---

**זקוק לעזרה?** פנה אליי עם פרטי השגיאה!
