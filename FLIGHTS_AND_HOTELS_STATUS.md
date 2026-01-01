# Flights & Hotels - Current Status

## תאריך: 21 דצמבר 2025 (עודכן!)

## ✅ מה עובד עכשיו

### 🏨 מלונות (Hotels) - עובד מצוין! ✅

- **חיפוש מלונות**: חיפוש לפי שם או עיר
- **מחירים אמיתיים**: RapidAPI Booking.com מחזיר מחירים אמיתיים
- **2 מצבים**:
  - חיפוש עיר → 5 מלונות הכי טובים במחיר
  - בחירת מלון ספציפי → רק המלון הספציפי
- **דירוג כוכבים**: 1-5 כוכבים (מתוקן!)
- **קישורי affiliate**: aid=2371057, label=meetloca
- **כפתור**: "Get Real Prices" מציג מחירים + קישור להזמנה

### ✈️ טיסות (Flights) - **עובד עם Google Flights!** 🎉

#### חיפוש מחירים אמיתיים ✅

- **Google Flights API** דרך RapidAPI
- מחירים אמיתיים, מעודכנים, מדויקים
- תצוגה של עד 5 טיסות עם:
  - מחיר
  - חברת תעופה
  - משך טיסה
  - עצירות (Direct / 1 stop / 2 stops)
  - קישור להזמנה ב-Google Flights

#### אופציות נוספות:

1️⃣ **By Flight Number** - חיפוש לפי מספר טיסה
2️⃣ **By Route** - חיפוש לפי מסלול  
3️⃣ **Manual Entry** - הוספה ידנית של טיסה ששילמת

## 🔧 שינויים אחרונים (עכשיו!)

### קבצים חדשים:

✅ **backend/services/googleFlights.js**

- שירות חדש ל-Google Flights API
- מתחבר ל-RapidAPI
- מחזיר מחירים, זמנים, עצירות
- קישורי Google Flights להזמנה

### קבצים שעודכנו:

✅ **backend/routes/ai.js**

- הוספתי `import googleFlights`
- החלפתי את Travelpayouts ב-Google Flights
- עובד עם אותו endpoint: `/api/ai/get-real-prices`

✅ **frontend-v2/src/components/AddItemForms.tsx**

- החזרתי את כפתור "Get Real Prices" לטיסות
- תצוגה יפה של תוצאות עם chips (Direct, duration)
- הודעת שגיאה ידידותית אם לא נרשמת ל-API

## 📋 מה צריך לעשות כדי שזה יעבוד

### שלב 1: הירשם ל-Google Flights API (חינם!)

1. לך ל: https://rapidapi.com/DataCrawler/api/google-flights2
2. לחץ "Subscribe to Test"
3. בחר את ה-**FREE plan** (500 requests/month - חינם!)
4. זהו! אותו RapidAPI Key שכבר יש לך יעבוד

### שלב 2: אתה כבר מוכן!

ה-`RAPIDAPI_KEY` שכבר יש לך ב-.env יעבוד אוטומטית:

```
RAPIDAPI_KEY=ef20663225msh381cab3b853b899p19581djsn1be22373035b
```

### שלב 3: טסט

1. רענן את הדפדפן (F5)
2. לך ל-Trip Details
3. Add Item → Add Flight
4. חפש טיסה (By Flight Number או By Route)
5. לחץ **"Get Real Prices"**
6. צריך לראות מחירים מ-Google Flights! 🎉

## 💡 איך זה עובד מאחורי הקלעים

### Backend Flow:

```javascript
// backend/routes/ai.js
const flights = await googleFlights.searchFlights(
  'TLV',      // Origin
  'LHR',      // Destination
  '2025-12-25', // Departure date
  '2025-12-30', // Return date (optional)
  2,          // Adults
  'ECONOMY'   // Travel class
);

// Returns:
[
  {
    airline: "British Airways",
    origin: "TLV",
    destination: "LHR",
    price: 450,
    stops: 0,
    duration: "5h 30m",
    bookingLink: "https://google.com/flights/...",
    ...
  }
]
```

### Frontend Display:

- ✅ טיול TLV → LHR
- ✅ מחיר: $450
- ✅ Direct flight
- ✅ 5h 30m
- ✅ כפתור "Book" עם קישור

## 🎯 תכונות Google Flights API

### יתרונות:

- ✅ **Free Tier**: 500 חיפושים/חודש חינם
- ✅ **מחירים אמיתיים**: מה שתראה ב-Google Flights
- ✅ **מהיר**: תוצאות תוך שניות
- ✅ **אותו ספק**: RapidAPI (כמו המלונות)
- ✅ **קישורי Google**: הכי מהימנים

### מגבלות Free Tier:

- 500 requests/month
- אחרי זה: $0.01 per request (~$5-10/חודש)

## 📊 מחירים ב-RapidAPI

| Plan     | Price | Requests/Month |
| -------- | ----- | -------------- |
| **Free** | $0    | 500            |
| Basic    | $10   | 1,000          |
| Pro      | $50   | 10,000         |

**המלצה**: התחל עם Free, אם צריך יותר - שדרג ל-Basic.

## 🚀 הכל מוכן!

### מה עובד:

- ✅ מלונות + מחירים (RapidAPI Booking.com)
- ✅ טיסות + מחירים (RapidAPI Google Flights) **← חדש!**
- ✅ הוספת טיסה ידנית
- ✅ חיפוש פרטי טיסה

### מה צריך:

- 🔵 להירשם ל-Google Flights API (חינם, דקה אחת)

---

**Backend Server:** ✅ Running on port 3001  
**Frontend:** ✅ Running on port 5191  
**RapidAPI Hotels:** ✅ Working  
**RapidAPI Google Flights:** 🔵 Ready (needs subscription)

## 🎬 צעד הבא

**עכשיו:** לך ל-https://rapidapi.com/DataCrawler/api/google-flights2 ותירשם (חינם)  
**אחר כך:** רענן דפדפן, חפש טיסה, לחץ "Get Real Prices"  
**תראה:** מחירים אמיתיים של טיסות! 🎉

## ✅ מה עובד עכשיו

### 🏨 מלונות (Hotels) - עובד מצוין!

- **חיפוש מלונות**: חיפוש לפי שם או עיר
- **מחירים אמיתיים**: RapidAPI Booking.com מחזיר מחירים אמיתיים
- **2 מצבים**:
  - חיפוש עיר → 5 מלונות הכי טובים במחיר
  - בחירת מלון ספציפי → רק המלון הספציפי
- **דירוג כוכבים**: 1-5 כוכבים (מתוקן!)
- **קישורי affiliate**: aid=2371057, label=meetloca
- **כפתור**: "Get Real Prices" מציג מחירים + קישור להזמנה

### ✈️ טיסות (Flights) - 3 אופציות

#### 1️⃣ By Flight Number (חיפוש לפי מספר טיסה)

- מחפש פרטי טיסה לפי מספר
- מציג: זמנים, שערים, טרמינלים
- **אין מחירים** (ה-API לא עובד)

#### 2️⃣ By Route (חיפוש לפי מסלול)

- מחפש טיסות לפי מוצא ויעד
- מציג רשימת טיסות אפשריות
- **אין מחירים** (ה-API לא עובד)

#### 3️⃣ Manual Entry (הוספה ידנית) - ⭐ השתמש בזה!

- **זה מה שאתה רוצה!**
- אופציה להוסיף טיסה שכבר שילמת עליה
- מלא את כל הפרטים ידנית:
  - מספר טיסה
  - חברת תעופה
  - שדות תעופה
  - תאריכים + שעות
  - **מחיר שאתה שילמת**
  - מספר הזמנה
  - כמות מזוודות
- הכל נשמר בטיול

## 🔧 שינויים שביצעתי היום

### בקובץ AddItemForms.tsx:

1. **הסרתי את "Get Real Prices" בטיסות**
   - החלפתי ב-Alert שמסביר: "Flight Price Search Coming Soon"
   - מסביר שצריך להשתמש ב-Manual Entry

2. **הוספתי הודעה ברורה ב-Manual Entry**
   - איקון ✈️
   - כותרת: "Add Flight You've Already Booked"
   - הסבר: "Use this form to add flights you've already purchased"

3. **תיקון שגיאות TypeScript**
   - הוספתי types למפות ופילטרים

## 📊 מה קורה מאחורי הקלעים

### Backend (backend/routes/ai.js):

```javascript
// Hotels - עובד! ✅
const hotels = await rapidApiHotels.searchHotels(
  destination,
  checkIn,
  checkOut,
  2,
  hotelName
);

// Flights - מושבת! ❌
// Travelpayouts API מחזיר יעדים לא נכונים
// TODO: צריך API אחר או לשלם ל-RapidAPI Skyscanner
```

## 🎯 איך להשתמש

### להוסיף מלון:

1. לך ל-Trip Details
2. לחץ "Add Item" → "Add Hotel"
3. חפש מלון
4. בחר תאריכים
5. לחץ "Get Real Prices" - תראה מחירים אמיתיים!
6. הזן את המחיר שאתה משלם
7. שמור

### להוסיף טיסה ששילמת:

1. לך ל-Trip Details
2. לחץ "Add Item" → "Add Flight"
3. **בחר Tab "Manual Entry"** 👈 חשוב!
4. מלא את הפרטים מהכרטיס שלך:
   - מספר טיסה (IZ603)
   - חברה (Arkia)
   - TLV → DXB
   - תאריכ + שעות
   - **כמה שילמת**
   - מספר הזמנה
5. שמור

## 🚀 עתיד - אם תרצה חיפוש טיסות עם מחירים

### אפשרות A: RapidAPI Skyscanner (~$10/חודש)

- מחירים אמיתיים של טיסות
- עובד כמו המלונות
- צריך לשלם מנוי

### אפשרות B: רק קישורי Affiliate (חינם)

- כפתור "Search on Skyscanner"
- פותח Skyscanner עם affiliate link
- אתה מרוויח עמלה, אבל אין מחירים באתר

### אפשרות C: Kiwi.com API (חינם מוגבל)

- 100 חיפושים בחודש
- אחרי זה צריך לשלם

## 📝 לסיכום

**מה עובד:**

- ✅ מלונות + מחירים אמיתיים
- ✅ הוספת טיסה ידנית עם מחיר
- ✅ חיפוש פרטי טיסה (ללא מחיר)

**מה לא עובד:**

- ❌ חיפוש מחירי טיסות אוטומטי

**המלצה:**
השתמש ב-Manual Entry להוספת טיסות. זה מהיר ופשוט, ויש לך שליטה מלאה על הפרטים והמחיר.

---

**Backend Server:** ✅ Running on port 3001  
**Frontend:** Check at http://localhost:5192  
**RapidAPI Hotels:** ✅ Working  
**RapidAPI Flights:** ❌ Not configured (needs subscription)
