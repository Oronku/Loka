# מערכת ניהול סוכנויות

## סקירה כללית

מערכת ניהול סוכנויות רב-משתמשים המאפשרת לאדמיני סוכנויות לנהל סוכנים באמצעות **מערכת הזמנות**, לצפות בנתונים מצטברים של הסוכנות ולעקוב אחר הביצועים.

## תכונות

### 1. רמות הרשאה

**שלוש רמות משתמשים:**

- **Admin גלובלי (isAdmin)** - גישה מלאה לכל המערכת, כל הסוכנויות
- **אדמין סוכנות (isAgencyAdmin)** - ניהול סוכנים וצפייה בנתונים של הסוכנות שלו בלבד
- **סוכן (isAgent)** - יצירה וניהול של טיולים מאורגנים

**הבדל חשוב:**

- אדמין סוכנות **לא רואה** את רשימת כל המשתמשים במערכת
- הוא יכול **להזמין** משתמשים חדשים למייל בלבד
- רק Admin גלובלי רואה את כל המשתמשים

### 2. מערכת הזמנות (Invitation System)

**תהליך הוספת סוכן:**

1. **אדמין סוכנות** שולח הזמנה למייל:
   - מזין כתובת מייל של המשתמש
   - (אופציונלי) מזין שם
   - ההזמנה נשמרת ב-DB עם סטטוס "pending"
   - תוקף ההזמנה: 7 ימים

2. **המשתמש מקבל הזמנה**:
   - רואה את ההזמנה בדף הפרופיל שלו
   - יכול לאשר או לדחות
   - אם מאשר - הופך לסוכן בסוכנות

3. **אדמין הסוכנות יכול**:
   - לראות רשימת הזמנות ממתינות
   - לבטל הזמנה שטרם אושרה

**יתרונות:**

- ✅ פרטיות - אדמין סוכנות לא רואה משתמשים אחרים
- ✅ שליטה - המשתמש מחליט אם להצטרף
- ✅ מעקב - ניתן לראות הזמנות ממתינות/אושרו/נדחו

### 3. דשבורד סוכנות

**נתונים מצטברים:**

- 📊 מספר סוכנים בסוכנות
- ✈️ טיולים פעילים / סה"כ טיולים
- 👥 סה"כ משתתפים בכל הטיולים
- 💰 הכנסות מוערכות (משתתפים × מחיר)
- 📅 יציאות קרובות (30 יום הקרובים)

**טבלאות:**

- **Tab 1 - סוכנים**: רשימת כל סוכני הסוכנות עם סטטיסטיקות
- **Tab 2 - הזמנות**: הזמנות ממתינות/אושרו/נדחו
- **Tab 3 - טיולים**: טיולים אחרונים מכל הסוכנים

### 4. ניהול סוכנים

**פעולות זמינות:**

- 📧 **שליחת הזמנה** למייל של משתמש
- 📋 **צפייה בהזמנות** ממתינות ואושרו
- ✏️ **עריכת פרטי סוכן** (טלפון, רישיון)
- 👑 **הפיכת סוכן לאדמין סוכנות**
- ❌ **הסרת סוכן** מהסוכנות (לא מוחק את המשתמש)

## מבנה הקוד

### Backend

#### Routes - `/backend/routes/agency.js` (NEW)

```javascript
// Authentication middleware
router.use(verifyGoogleToken, isAgencyAdmin);

// Endpoints:
GET  /api/agency/stats              // נתונים סטטיסטיים
GET  /api/agency/agents             // רשימת סוכנים
GET  /api/agency/available-users    // משתמשים זמינים להוספה
POST /api/agency/agents/add         // הוסף סוכן
PUT  /api/agency/agents/:userId     // ערוך סוכן
DELETE /api/agency/agents/:userId   // הסר סוכן
GET  /api/agency/trips              // כל טיולי הסוכנות
```

**Middleware - isAgencyAdmin:**

```javascript
const isAgencyAdmin = (req, res, next) => {
  if (!req.user?.isAdmin && !req.user?.isAgencyAdmin) {
    return res.status(403).json({
      message: "Access denied. Agency admin privileges required.",
    });
  }
  next();
};
```

#### MongoDB Schema

**User Document:**

```javascript
{
  _id: ObjectId,
  email: string,
  name: string,
  isAdmin: boolean,        // גלובלי
  isAgent: boolean,        // סוכן
  isAgencyAdmin: boolean,  // אדמין סוכנות (NEW)
  agencyName: string,      // שם הסוכנות
  agentPhone: string,
  agencyLicense: string,
  createdAt: Date
}
```

**Agency Invitation Document (NEW):**

```javascript
{
  _id: ObjectId,
  email: string,              // מייל המוזמן
  name: string,               // שם (אופציונלי)
  agencyName: string,         // סוכנות מזמינה
  invitedBy: string,          // userId של המזמין
  invitedByName: string,      // שם המזמין
  status: string,             // "pending", "accepted", "rejected", "expired"
  createdAt: Date,
  expiresAt: Date,            // 7 ימים מיצירה
  acceptedAt: Date,           // אם אושר
  acceptedBy: string,         // userId שאישר
  rejectedAt: Date            // אם נדחה
}
```

### Frontend

#### Component - `/frontend-v2/src/pages/AgencyDashboard.tsx` (NEW)

**State Management:**

```typescript
interface AgencyStat {
  agencyName: string;
  totalAgents: number;
  totalTrips: number;
  publishedTrips: number;
  activeTrips: number;
  totalParticipants: number;
  totalRevenue: number;
  upcomingDepartures: number;
  recentTrips: any[];
  agents: any[];
}

interface Agent {
  _id: string;
  name: string;
  email: string;
  agentPhone?: string;
  agencyLicense?: string;
  isAdmin: boolean;
  isAgencyAdmin: boolean;
  tripCount: number;
  activeTrips: number;
}
```

**Main Features:**

1. **Statistics Cards** - ארבעה כרטיסים עם נתונים עיקריים
2. **Agents Table** - טבלה מפורטת עם אפשרות עריכה והסרה
3. **Recent Trips Table** - טיולים אחרונים מכל הסוכנים
4. **Add Agent Dialog** - בחירת משתמשים והוספתם כסוכנים
5. **Edit Agent Dialog** - עדכון פרטי סוכן והרשאות

#### Updated Files

**`frontend-v2/src/services/api.ts`:**

```typescript
export interface User {
  // ... existing fields
  isAgencyAdmin?: boolean; // NEW
}
```

**`frontend-v2/src/components/Layout.tsx`:**

- Added import: `Business` icon
- Added menu item for agency dashboard (visible to isAgencyAdmin || isAdmin)

**`frontend-v2/src/App.tsx`:**

```tsx
<Route
  path="/agency"
  element={
    <AgentRoute>
      {" "}
      // Uses same route as agents
      <Layout>
        <AgencyDashboard />
      </Layout>
    </AgentRoute>
  }
/>
```

**`backend/middleware/auth.js`:**

```javascript
req.user = {
  // ... existing fields
  isAgencyAdmin: dbUser?.isAgencyAdmin || false, // NEW
};
```

**`backend/index.js`:**

```javascript
import agencyRoutes from "./routes/agency.js";
app.use("/api/agency", agencyRoutes);
```

## API Documentation

### Agency Statistics

#### GET /api/agency/stats

מחזיר נתונים מצטברים של הסוכנות.

**Response:**

```json
{
  "agencyName": "Oron Travel Agency",
  "totalAgents": 5,
  "totalTrips": 23,
  "publishedTrips": 18,
  "activeTrips": 12,
  "totalParticipants": 142,
  "totalRevenue": 1240000,
  "upcomingDepartures": 3,
  "recentTrips": [...],
  "agents": [...]
}
```

### Invitation Management

#### POST /api/agency/invitations/send

שליחת הזמנה לסוכן חדש.

**Request:**

```json
{
  "email": "newagent@example.com",
  "name": "שם הסוכן" // אופציונלי
}
```

**Response:**

```json
{
  "message": "הזמנה נשלחה בהצלחה",
  "invitationId": "60d5ec49f1b2c8b1f8c4e5a1",
  "email": "newagent@example.com"
}
```

#### GET /api/agency/invitations

קבלת כל ההזמנות של הסוכנות.

**Response:**

```json
[
  {
    "_id": "60d5ec49f1b2c8b1f8c4e5a1",
    "email": "newagent@example.com",
    "name": "שם הסוכן",
    "agencyName": "Oron Travel Agency",
    "invitedBy": "userId123",
    "invitedByName": "Oron Kurtz",
    "status": "pending",
    "createdAt": "2026-01-03T10:00:00Z",
    "expiresAt": "2026-01-10T10:00:00Z"
  }
]
```

#### DELETE /api/agency/invitations/:invitationId

ביטול הזמנה ממתינה.

**Response:**

```json
{
  "message": "הזמנה בוטלה"
}
```

### User Side - Invitation Handling

#### GET /api/auth/invitations

קבלת הזמנות עבור המשתמש המחובר (לפי מייל).

**Response:**

```json
[
  {
    "_id": "60d5ec49f1b2c8b1f8c4e5a1",
    "email": "myemail@example.com",
    "agencyName": "Oron Travel Agency",
    "invitedByName": "Oron Kurtz",
    "status": "pending",
    "createdAt": "2026-01-03T10:00:00Z",
    "expiresAt": "2026-01-10T10:00:00Z"
  }
]
```

#### POST /api/auth/invitations/:invitationId/accept

אישור הצטרפות לסוכנות.

**Response:**

```json
{
  "message": "ההזמנה אושרה בהצלחה!",
  "agencyName": "Oron Travel Agency"
}
```

#### POST /api/auth/invitations/:invitationId/reject

דחיית הזמנה.

**Response:**

```json
{
  "message": "ההזמנה נדחתה"
}
```

### Agent Management

}

````

### GET /api/agency/agents

**Response:**

```json
[
  {
    "_id": "123...",
    "name": "John Doe",
    "email": "john@example.com",
    "agentPhone": "050-1234567",
    "agencyLicense": "LIC-12345",
    "isAdmin": false,
    "isAgencyAdmin": true,
    "tripCount": 8,
    "activeTrips": 5,
    "createdAt": "2024-01-01T00:00:00Z"
  }
]
````

### POST /api/agency/agents/add

**Request:**

```json
{
  "userId": "user_id_here"
}
```

**Response:**

```json
{
  "message": "Agent added successfully",
  "userId": "user_id_here",
  "agencyName": "Oron Travel Agency"
}
```

### PUT /api/agency/agents/:userId

**Request:**

```json
{
  "agentPhone": "050-9876543",
  "agencyLicense": "NEW-LIC-456",
  "isAgencyAdmin": true
}
```

### DELETE /api/agency/agents/:userId

**Note:** מסיר את סטטוס הסוכן אבל לא מוחק את המשתמש מהמערכת.

**Response:**

```json
{
  "message": "Agent removed from agency successfully"
}
```

### GET /api/agency/trips

מחזיר את כל הטיולים של כל הסוכנים בסוכנות.

## תרחישי שימוש

### 1. הוספת סוכן חדש

```
1. אדמין סוכנות נכנס לדשבורד הסוכנות
2. לוחץ על "הוסף סוכן"
3. רואה רשימת משתמשים זמינים
4. לוחץ "הוסף" ליד המשתמש הרצוי
5. המשתמש הופך לסוכן בסוכנות
```

### 2. הפיכת סוכן לאדמין סוכנות

```
1. אדמין סוכנות בוחר סוכן מהטבלה
2. לוחץ "ערוך"
3. מפעיל את המתג "אדמין סוכנות"
4. שומר
5. הסוכן מקבל הרשאות אדמין סוכנות
```

### 3. צפייה בנתוני סוכנות

```
1. אדמין סוכנות/סוכן נכנס לדשבורד
2. רואה את:
   - כרטיסי סטטיסטיקה מצטברים
   - טבלת סוכנים עם מספר טיולים
   - טיולים אחרונים מכל הסוכנות
```

## אבטחה

### הרשאות

- **isAgencyAdmin** יכול לנהל רק סוכנים מהסוכנות שלו
- **isAdmin (גלובלי)** יכול לנהל כל סוכנות
- בדיקת שייכות לסוכנות בכל endpoint

### Validations

```javascript
// בדיקה שהסוכן שייך לסוכנות של המשתמש
if (!req.user.isAdmin) {
  const agent = await users.findOne({ _id: new ObjectId(userId) });
  if (!agent || agent.agencyName !== agencyName) {
    return res.status(403).json({
      error: "Agent does not belong to your agency",
    });
  }
}
```

## Migration / Setup

### להוסיף isAgencyAdmin למשתמש קיים:

```javascript
// MongoDB
db.users.updateOne(
  { email: "admin@agency.com" },
  {
    $set: {
      isAgencyAdmin: true,
      agencyName: "Your Agency Name",
    },
  }
);
```

### סקריפט לאתחול אדמין סוכנות:

```javascript
// backend/set-agency-admin.js
import { MongoClient } from "mongodb";

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();

const db = client.db("meetloca");
await db.collection("users").updateOne(
  { email: "agency-admin@example.com" },
  {
    $set: {
      isAgent: true,
      isAgencyAdmin: true,
      agencyName: "My Travel Agency",
      agentPhone: "050-1234567",
      agencyLicense: "LIC-12345",
    },
  }
);

console.log("✓ Agency admin created");
await client.close();
```

## UI Flow

### Navigation

```
User Login → Check permissions:
  ├─ isAdmin? → Show "Admin Dashboard" in menu
  ├─ isAgencyAdmin? → Show "ניהול סוכנות" in menu
  └─ isAgent? → Show "Agent Dashboard" in menu
```

### Agency Dashboard Tabs

```
Tab 1: סוכנים
  ├─ Table with all agents
  ├─ Trip counts per agent
  ├─ Edit/Delete buttons
  └─ Add Agent button

Tab 2: טיולים אחרונים
  ├─ Recent trips from all agents
  ├─ Trip status
  └─ Participant counts
```

## Future Enhancements

1. **ניתוח ביצועים**
   - גרפים של הכנסות לאורך זמן
   - השוואת ביצועים בין סוכנים
   - דירוג סוכנים לפי הכנסות/משתתפים

2. **יעדים ומטרות**
   - הגדרת יעדי מכירה חודשיים
   - מעקב אחר התקדמות
   - התראות על חריגות

3. **דוחות מפורטים**
   - ייצוא לאקסל
   - דוחות חודשיים/שנתיים
   - ניתוח פילוח לקוחות

4. **הודעות פנימיות**
   - תקשורת בין אדמין סוכנות לסוכנים
   - הודעות על טיולים חדשים
   - עדכונים חשובים

5. **אישורים ובקרה**
   - אישור טיולים חדשים על ידי אדמין סוכנות
   - בקרת תמחור
   - אישורי הנחות

---

**תאריך יצירה**: 3 בינואר 2026  
**גרסה**: 1.0  
**מפתח**: GitHub Copilot
