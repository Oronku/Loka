# Meet Loca - ארכיטקטורת המערכת

## 🎯 תקציר

Meet Loca היא פלטפורמה דו-מודלית לניהול טיולים המשרתת **שני סוגי משתמשים שונים**:

1. **🧳 משתמשים פרטיים** - אנשים שמתכננים טיולים לעצמם ולחברים
2. **✈️ סוכני נסיעות** - מקצוענים שמאר גנים טיולים קבוצתיים

---

## 📊 מודל הנתונים - Collections

### 1. `trips` - טיולים פרטיים

**מטרה:** טיולים אישיים שמשתמשים רגילים יוצרים לעצמם

**מאפיינים:**

- בעלות אישית (`userId`)
- אפשר לשתף עם חברים (`sharedWith[]`)
- גמיש ופשוט - כל אחד מתכנן כרצונו
- ללא מערכת תשלומים
- ללא משתתפים חיצוניים

**Schema:**

```javascript
{
  _id: ObjectId,
  userId: String,              // בעל הטיול
  title: String,
  destination: String,
  startDate: Date,
  endDate: Date,

  // שיתוף
  sharedWith: [{
    userId: String,
    email: String,
    name: String,
    permission: "view" | "edit"
  }],

  // תוכן
  flights: [],
  hotels: [],
  rides: [],
  attractions: [],

  createdAt: Date,
  updatedAt: Date
}
```

**Endpoints:**

```
GET    /api/trips              // הטיולים שלי + משותפים איתי
POST   /api/trips              // יצירת טיול חדש
GET    /api/trips/:id          // פרטי טיול
PUT    /api/trips/:id          // עדכון טיול
DELETE /api/trips/:id          // מחיקת טיול
POST   /api/trips/:id/share    // שיתוף עם חבר
```

**UI Routes:**

```
/                              // דשבורד - הטיולים שלי
/trip/new                      // יצירת טיול חדש
/trips/:id                     // פרטי טיול
```

---

### 2. `organized_trips` - טיולים מאורגנים

**מטרה:** טיולים מקצועיים שסוכנים מארגנים לקבוצות

**מאפיינים:**

- שייך לסוכן (`agentId`) וסוכנות (`agencyName`)
- מערכת משתתפים מלאה
- תמחור ותשלומים
- סטטוסים וזמינות
- ניראות ציבורית (`visibility`)
- תגיות לסינון (`tags`)

**Schema:**

```javascript
{
  _id: ObjectId,
  agentId: String,             // הסוכן שיצר
  agentName: String,
  agencyName: String,
  type: "organized",

  // מידע בסיסי
  title: String,
  destination: String,
  description: String,
  startDate: Date,
  endDate: Date,
  duration: Number,            // ימים

  // קיבולת ותמחור
  maxParticipants: Number,
  pricePerPerson: Number,
  currency: String,

  // סטטוס
  status: "draft" | "published" | "full" | "in_progress" | "completed" | "cancelled",
  visibility: "public" | "private" | "draft",

  // תיוגים
  tags: ["צילום", "צלילה", "משפחות"],

  // משתתפים
  participants: [{
    userId: String,            // אופציונלי - אם רשום
    email: String,
    name: String,
    phone: String,
    status: "invited" | "confirmed" | "paid" | "cancelled",
    invitedAt: Date,
    joinedAt: Date,
    paidAmount: Number,
    personalDocs: []
  }],

  // בקשות הרשמה ממתינות
  pendingRegistrations: [{
    name: String,
    email: String,
    phone: String,
    message: String,
    status: "pending",
    requestedAt: Date
  }],

  // מסלול מפורט
  itinerary: [{
    day: Number,
    date: Date,
    title: String,
    description: String,
    activities: []
  }],

  // מסמכים
  documents: [{
    type: String,
    url: String,
    fileName: String,
    forUser: String,           // null = לכולם
    uploadedAt: Date
  }],

  // עדכונים
  updates: [{
    type: "announcement" | "itinerary_change" | "reminder",
    title: String,
    message: String,
    recipients: [],            // ריק = לכולם
    createdAt: Date
  }],

  includedServices: [],
  notIncludedServices: [],

  createdAt: Date,
  updatedAt: Date
}
```

**Endpoints:**

```
// Public - ללא אימות
GET    /api/organized-trips/public              // רשימה ציבורית
GET    /api/organized-trips/:id                 // צפייה בטיול
POST   /api/organized-trips/:id/register        // בקשת הרשמה
GET    /api/organized-trips/participant/:email/trips  // הטיולים שלי

// Agent Only - רק לסוכנים
GET    /api/agent/stats                         // סטטיסטיקות
GET    /api/agent/trips                         // הטיולים שלי
POST   /api/agent/trips/create                  // יצירת טיול
PUT    /api/agent/trips/:id                     // עדכון טיול
POST   /api/agent/trips/:id/invite              // הזמנת משתתף
POST   /api/agent/trips/:id/update              // שליחת עדכון
POST   /api/agent/trips/:id/upload-document     // העלאת מסמך
PUT    /api/agent/trips/:id/visibility          // שינוי ניראות
POST   /api/agent/trips/:id/publish             // פרסום טיול
POST   /api/agent/trips/:id/cancel              // ביטול טיול
```

**UI Routes:**

```
// Public
/organized-trips               // רשימת טיולים ציבורית
/organized-trips/:id           // צפייה בטיול
/my-trips                      // הטיולים שלי (לפי מייל)

// Agent Only
/agent                         // דשבורד סוכן
/agent/trips/new               // יצירת טיול מאורגן
/agent/trips/:id               // ניהול טיול
```

---

## 👥 סוגי משתמשים והרשאות

### 1. **Regular User** - משתמש רגיל

**יכולות:**

- ✅ יצירת טיולים פרטיים (`trips`)
- ✅ שיתוף טיולים עם חברים
- ✅ צפייה בטיולים מאורגנים ציבוריים
- ✅ הרשמה לטיולים מאורגנים
- ❌ לא יכול ליצור טיולים מאורגנים

**Permissions:**

```javascript
{
  isAdmin: false,
  isAgent: false,
  isAgencyAdmin: false
}
```

---

### 2. **Agent** - סוכן נסיעות

**יכולות:**

- ✅ כל יכולות המשתמש הרגיל
- ✅ יצירת טיולים מאורגנים (`organized_trips`)
- ✅ ניהול משתתפים
- ✅ שליחת עדכונים
- ✅ העלאת מסמכים
- ❌ לא יכול לנהל סוכנים אחרים

**Permissions:**

```javascript
{
  isAdmin: false,
  isAgent: true,
  isAgencyAdmin: false,
  agencyName: "סוכנות ABC"
}
```

**Navigation:**

```
Header Menu:
  - 🏠 בית (טיולים פרטיים)
  - ✈️ טיולים מאורגנים (ציבורי)
  - 💼 Agent Dashboard (ניהול)
  - ➕ יצירת טיול מאורגן
```

---

### 3. **Agency Admin** - מנהל סוכנות

**יכולות:**

- ✅ כל יכולות הסוכן
- ✅ ניהול סוכנים בסוכנות שלו
- ✅ שליחת הזמנות לסוכנים חדשים
- ✅ צפייה בסטטיסטיקות הסוכנות
- ✅ הסרת סוכנים
- ❌ לא רואה משתמשים מחוץ לסוכנות

**Permissions:**

```javascript
{
  isAdmin: false,
  isAgent: true,
  isAgencyAdmin: true,
  agencyName: "סוכנות ABC"
}
```

**Navigation:**

```
Header Menu:
  - ... (כל תפריט הסוכן)
  - 🏢 ניהול סוכנות
```

**Agency Dashboard Tabs:**

1. **סוכנים** - רשימת סוכנים + הזמנות
2. **הזמנות** - pending/accepted/rejected
3. **טיולים אחרונים** - מכל הסוכנים

---

### 4. **Super Admin** - מנהל מערכת

**יכולות:**

- ✅ כל יכולות המערכת
- ✅ רואה את **כל המשתמשים**
- ✅ ניהול הרשאות למשתמשים
- ✅ הפיכת משתמשים לסוכנים
- ✅ סטטיסטיקות כלל המערכת

**Permissions:**

```javascript
{
  isAdmin: true,
  isAgent: true,              // בדרך כלל גם כן
  isAgencyAdmin: true         // בדרך כלל גם כן
}
```

**Navigation:**

```
Header Menu:
  - ... (כל התפריטים)
  - ⚙️ Admin Dashboard
```

**Admin Dashboard Tabs:**

1. **Overview** - סקירה כללית
2. **Users** - ניהול משתמשים
3. **Agents** - ניהול סוכנים
4. **Destinations** - יעדים פופולריים
5. **Flights** - סטטיסטיקות טיסות
6. **Trips** - סטטיסטיקות טיולים

---

## 🔐 מערכת האימות

### Authentication Flow

```
1. Login (Google OAuth)
   ↓
2. Backend verifies token
   ↓
3. Creates/Updates user in DB
   ↓
4. Returns user object with permissions:
   {
     id: "...",
     email: "...",
     name: "...",
     isAdmin: Boolean,
     isAgent: Boolean,
     isAgencyAdmin: Boolean,
     agencyName: String
   }
   ↓
5. Frontend stores in AuthContext
   ↓
6. Routes render based on permissions
```

### Route Protection

**ProtectedRoute:**

```tsx
// דורש רק התחברות
<ProtectedRoute>
  <Home />
</ProtectedRoute>
```

**AgentRoute:**

```tsx
// דורש isAgent OR isAdmin
<AgentRoute>
  <AgentDashboard />
</AgentRoute>
```

**AdminRoute:**

```tsx
// דורש isAdmin בלבד
<AdminRoute>
  <AdminDashboard />
</AdminRoute>
```

---

## 🎭 תרחישי שימוש

### תרחיש 1: משתמש פרטי מתכנן טיול לחופשה

```
1. User logs in → redirected to /
2. Sees personal trips dashboard
3. Clicks "New Trip" → /trip/new
4. Creates trip with flights, hotels
5. Trip saved in `trips` collection
6. Shares with friend via email
7. Friend can view/edit based on permission
```

**Database:**

```javascript
// trips collection
{
  userId: "user123",
  title: "חופשה ברומא",
  destination: "Rome",
  sharedWith: [{
    userId: "friend456",
    email: "friend@example.com",
    permission: "view"
  }]
}
```

---

### תרחיש 2: סוכן מארגן טיול קבוצתי

```
1. Agent logs in → sees Agent Dashboard option
2. Clicks /agent → sees their organized trips
3. Clicks "Create Organized Trip"
4. Fills:
   - Title: "טיול צילום גלפגוס"
   - Max participants: 16
   - Price: ₪42,900
   - Tags: ["צילום", "טבע"]
   - Itinerary: 11 days
5. Saves as "draft"
6. Reviews and clicks "Publish"
7. Status → "published", visibility → "public"
8. Trip appears in /organized-trips (public page)
```

**Database:**

```javascript
// organized_trips collection
{
  agentId: "agent789",
  agentName: "Oron Kurtz",
  agencyName: "Oron Travel Agency",
  type: "organized",
  title: "טיול צילום גלפגוס",
  maxParticipants: 16,
  pricePerPerson: 42900,
  status: "published",
  visibility: "public",
  tags: ["צילום", "טבע"],
  participants: []  // ריק בהתחלה
}
```

---

### תרחיש 3: לקוח מצטרף לטיול מאורגן

```
1. User (not logged in) browses /organized-trips
2. Filters by tag "צילום"
3. Clicks on "טיול גלפגוס"
4. Reads details, itinerary, price
5. Clicks "Register Interest"
6. Fills form: name, email, phone, message
7. Submission → added to `pendingRegistrations`
8. Agent sees request in dashboard
9. Agent clicks "Approve" → user moved to `participants`
10. Agent clicks "Invite" → sends email with details
```

**Database Flow:**

```javascript
// Step 7: After registration
{
  pendingRegistrations: [{
    name: "דני כהן",
    email: "dani@example.com",
    phone: "050-1234567",
    status: "pending",
    requestedAt: "2026-01-04T10:30:00Z"
  }]
}

// Step 9: After approval
{
  pendingRegistrations: [],  // הוסר
  participants: [{
    userId: null,  // עדיין לא רשום
    email: "dani@example.com",
    name: "דני כהן",
    phone: "050-1234567",
    status: "invited",
    invitedAt: "2026-01-04T11:00:00Z",
    paidAmount: 0
  }]
}
```

---

### תרחיש 4: Agency Admin מנהל סוכנים

```
1. Agency Admin logs in
2. Sees "ניהול סוכנות" in menu
3. Navigates to /agency
4. Tab "סוכנים" shows:
   - אורון כורץ (10 טיולים)
   - שרה לוי (5 טיולים)
5. Clicks "Invite Agent"
6. Enters email: newagent@example.com
7. Invitation sent → stored in `agency_invitations`
8. New agent receives email
9. Agent accepts → status "accepted"
10. Agent now has isAgent: true, agencyName: "ABC"
```

---

## 🗂️ היררכיית התיקיות

```
meet-loca/
├── backend/
│   ├── routes/
│   │   ├── trips.js              // 🧳 Private trips
│   │   ├── organizedTrips.js     // ✈️ Public organized trips
│   │   ├── agent.js              // 💼 Agent management
│   │   ├── agency.js             // 🏢 Agency management
│   │   ├── admin.js              // ⚙️ Super admin
│   │   ├── auth.js               // 🔐 Authentication
│   │   └── ...
│   ├── middleware/
│   │   └── auth.js               // verifyGoogleToken
│   └── index.js
│
├── frontend-v2/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Home.tsx                    // 🧳 Private trips dashboard
│   │   │   ├── NewTripWizard.tsx           // 🧳 Create private trip
│   │   │   ├── TripDetails.tsx             // 🧳 Private trip details
│   │   │   ├── PublicTripsPage.tsx         // ✈️ Browse organized trips
│   │   │   ├── PublicTripView.tsx          // ✈️ View organized trip
│   │   │   ├── ParticipantDashboard.tsx    // ✈️ My organized trips
│   │   │   ├── AgentDashboard.tsx          // 💼 Agent dashboard
│   │   │   ├── CreateOrganizedTrip.tsx     // 💼 Create organized trip
│   │   │   ├── ManageOrganizedTrip.tsx     // 💼 Manage trip
│   │   │   ├── AgencyDashboard.tsx         // 🏢 Agency management
│   │   │   └── AdminDashboard.tsx          // ⚙️ Super admin
│   │   ├── components/
│   │   │   ├── ProtectedRoute.tsx          // Any logged-in user
│   │   │   ├── AgentRoute.tsx              // isAgent || isAdmin
│   │   │   ├── AdminRoute.tsx              // isAdmin only
│   │   │   └── Layout.tsx                  // Navigation
│   │   └── context/
│   │       └── AuthContext.tsx             // User state
│   └── ...
│
└── ARCHITECTURE.md (this file)
```

---

## 🔄 הבדלים עיקריים בין שני המודלים

| Feature          | 🧳 Private Trips     | ✈️ Organized Trips             |
| ---------------- | -------------------- | ------------------------------ |
| **Collection**   | `trips`              | `organized_trips`              |
| **Owner**        | userId (personal)    | agentId (professional)         |
| **Participants** | sharedWith (friends) | participants (customers)       |
| **Visibility**   | Private by default   | Public/Private/Draft           |
| **Pricing**      | N/A                  | pricePerPerson + currency      |
| **Payments**     | N/A                  | paidAmount tracking            |
| **Status**       | Simple               | draft→published→full→completed |
| **Discovery**    | Not searchable       | Public listing with filters    |
| **Tags**         | N/A                  | Tags for categorization        |
| **Documents**    | N/A                  | Shared docs for participants   |
| **Updates**      | N/A                  | Announcements to group         |
| **Itinerary**    | Flexible             | Structured day-by-day          |

---

## 📍 Routes Summary

### Frontend Routes

```
Public (No Auth):
  /login                           - Login page
  /organized-trips                 - Browse organized trips
  /organized-trips/:id             - View trip details
  /my-trips                        - Participant dashboard (by email)

Protected (Logged In):
  /                                - Home (private trips)
  /trip/new                        - Create private trip
  /trips/:id                       - Trip details
  /quicket                         - Quicket marketplace
  /friends                         - Friends management
  /check-in                        - Check-in feature
  /profile                         - Profile settings

Agent Only:
  /agent                           - Agent dashboard
  /agent/trips/new                 - Create organized trip
  /agent/trips/:id                 - Manage organized trip

Agency Admin:
  /agency                          - Agency management

Super Admin:
  /admin                           - Admin dashboard
```

### Backend API Routes

```
Authentication:
  POST   /api/auth/google          - Google OAuth login
  GET    /api/auth/invitations     - My invitations
  POST   /api/auth/invitations/:id/accept
  POST   /api/auth/invitations/:id/reject

Private Trips (Authenticated):
  GET    /api/trips                - My trips + shared with me
  POST   /api/trips                - Create trip
  GET    /api/trips/:id            - Trip details
  PUT    /api/trips/:id            - Update trip
  DELETE /api/trips/:id            - Delete trip
  POST   /api/trips/:id/share      - Share with friend
  ...

Organized Trips (Public):
  GET    /api/organized-trips/public
  GET    /api/organized-trips/:id
  POST   /api/organized-trips/:id/register
  GET    /api/organized-trips/participant/:email/trips

Agent (isAgent || isAdmin):
  GET    /api/agent/stats
  GET    /api/agent/trips
  POST   /api/agent/trips/create
  PUT    /api/agent/trips/:id
  POST   /api/agent/trips/:id/invite
  POST   /api/agent/trips/:id/update
  POST   /api/agent/trips/:id/upload-document
  PUT    /api/agent/trips/:id/visibility
  POST   /api/agent/trips/:id/publish
  POST   /api/agent/trips/:id/cancel

Agency (isAgencyAdmin || isAdmin):
  GET    /api/agency/stats
  GET    /api/agency/agents
  POST   /api/agency/invitations/send
  GET    /api/agency/invitations
  DELETE /api/agency/invitations/:id
  PUT    /api/agency/agents/:userId
  DELETE /api/agency/agents/:userId

Admin (isAdmin):
  GET    /api/admin/users
  POST   /api/admin/users/:id/toggle-admin
  POST   /api/admin/users/:id/toggle-agent
  GET    /api/admin/stats
  ...
```

---

## 🎨 UI/UX Decision Tree

```
User Login
    │
    ├─ isAdmin = true
    │   └─→ Show ALL menu options
    │       ├─ Personal trips (/)
    │       ├─ Agent Dashboard (/agent)
    │       ├─ Agency Management (/agency)
    │       └─ Admin Dashboard (/admin)
    │
    ├─ isAgencyAdmin = true (but not admin)
    │   └─→ Show Agent + Agency
    │       ├─ Personal trips (/)
    │       ├─ Agent Dashboard (/agent)
    │       └─ Agency Management (/agency)
    │
    ├─ isAgent = true (but not agency admin)
    │   └─→ Show Agent only
    │       ├─ Personal trips (/)
    │       └─ Agent Dashboard (/agent)
    │
    └─ Regular User
        └─→ Show Personal only
            ├─ Personal trips (/)
            └─ Browse organized trips (/organized-trips)
```

---

## 🚀 Next Steps (Proposed Features)

### For Participants (Organized Trips)

- [ ] **Guest participants without registration**
  - Agent can add name + email + phone
  - When user registers, auto-link by email
  - Show "X pending trips" on first login

### For Payments

- [ ] Stripe integration
- [ ] Payment tracking per participant
- [ ] Automatic receipts
- [ ] Deposit + final payment flow

### For Communication

- [ ] Email notifications (SendGrid/Mailgun)
- [ ] WhatsApp integration for updates
- [ ] In-app chat between agent and participants

### For Content

- [ ] Image uploads (Cloudinary/S3)
- [ ] Trip gallery
- [ ] Document management
- [ ] PDF exports

---

## 📚 Related Documentation

- [QUICKSTART.md](./QUICKSTART.md) - Quick setup guide
- [SETUP.md](./SETUP.md) - Detailed installation
- [AGENCY_MANAGEMENT.md](./AGENCY_MANAGEMENT.md) - Agency features
- [TAGS_AND_FILTERING.md](./TAGS_AND_FILTERING.md) - Tag system
- [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) - Phase 3 summary

---

**Last Updated:** January 4, 2026  
**Version:** 2.0  
**Maintained by:** Development Team
