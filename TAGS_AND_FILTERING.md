# מערכת תגיות וסינון לטיולים מאורגנים

## סקירה כללית

הוספנו מערכת תגיות מקיפה למערכת הטיולים המאורגנים, המאפשרת סיווג וסינון טיולים לפי קטגוריות וסוכנויות.

## תכונות שהוספו

### 1. תגיות לטיולים (#Tags)

- **הוספת תגיות**: סוכנים יכולים להוסיף תגיות לטיולים בעת יצירה או עריכה
- **תגיות מומלצות**: צילום, צלילה, גלישה, סקי, משפחות, ילדים, יוקרה, טבע
- **תצוגה**: התגיות מוצגות כ-Chips עם # בדפי הטיולים

### 2. סינון לפי תגיות

- **סינון מרובה**: ניתן לבחור מספר תגיות במקביל
- **סינון דינמי**: רשימת התגיות מתעדכנת אוטומטית לפי הטיולים הקיימים
- **נקה הכל**: כפתור מהיר לביטול כל הסינונים

### 3. סינון לפי סוכנות

- **רשימת סוכנויות**: תפריט נפתח עם כל הסוכנויות הפעילות
- **סינון יחיד**: בחירת סוכנות מסוימת מציגה רק את טיוליה

## קבצים שעודכנו

### Frontend - Types

**`frontend-v2/src/types/organizedTrip.ts`**

```typescript
// Added to OrganizedTrip interface (line 40-42)
tags?: string[];

// Added to CreateOrganizedTripData interface (line 202)
tags?: string[];
```

### Frontend - Pages

**`frontend-v2/src/pages/CreateOrganizedTrip.tsx`**

- **Line 133**: Added `tags: []` to formData initial state
- **Line 138**: Added `newTag` state variable
- **Lines 320-366**: Added tags input UI in Step 0:
  - TextField for adding new tags
  - Button to add tag
  - Chips display with delete capability
  - Enter key support for quick adding

**`frontend-v2/src/pages/PublicTripsPage.tsx`**

- **Line 46**: Added `tags?: string[]` to PublicTrip interface
- **Lines 58-60**: Added selectedTags state and agency filter
- **Lines 62-68**: Calculate unique tags and agencies from trips
- **Lines 95-100**: Added tags and agency filtering logic
- **Lines 228-259**: Added Tags Filter UI with clickable chips
- **Lines 220-236**: Added agency dropdown filter
- **Lines 348-365**: Display tags in trip cards (max 3 + counter)

**`frontend-v2/src/pages/PublicTripView.tsx`**

- **Line 64**: Added `tags?: string[]` to PublicTrip interface
- **Lines 229-239**: Display tags as chips below trip header

**`frontend-v2/src/pages/ManageOrganizedTrip.tsx`**

- **Lines 336-347**: Display tags in trip management header

### Backend - Routes

**`backend/routes/organizedTrips.js`**

- **Line 24**: Added `tags` and `agencyName` to query parameters
- **Lines 54-57**: Added tags filter with `$all` operator (requires all selected tags)
- **Lines 59-62**: Added agency name filter with regex (case-insensitive)

### Backend - Sample Data

**`backend/create-sample-trip.js`**

- **Line 74**: Added `tags: ['צילום', 'טבע', 'יוקרה']` to Galapagos sample trip

## איך להשתמש

### הוספת תגיות לטיול חדש

1. גש ל-"צור טיול מאורגן"
2. ב-Step 0 (מידע בסיסי), מצא את שדה "תגיות (#)"
3. הקלד תגית ולחץ Enter או "הוסף"
4. התגית תתוסף כ-Chip למטה
5. ללחוץ על X בצ'יפ כדי למחוק תגית

### סינון טיולים לפי תגיות

1. גש לדף "טיולים מאורגנים"
2. תחת שורת הסינונים, תראה את כל התגיות הזמינות
3. לחץ על תגית כדי להפעיל את הסינון (תהפוך לצבע מלא)
4. ניתן לבחור מספר תגיות - הטיולים חייבים לכלול את כולן
5. לחץ "נקה הכל" כדי לבטל את כל הסינונים

### סינון לפי סוכנות

1. גש לדף "טיולים מאורגנים"
2. בתפריט הנפתח "סוכנות", בחר סוכנות מסוימת
3. רק טיולים של הסוכנות הזו יוצגו
4. בחר "כל הסוכנויות" כדי לבטל את הסינון

## API Endpoints

### GET /api/organized-trips/public

**Query Parameters:**

- `tags` (string | string[]): סינון לפי תגיות
- `agencyName` (string): סינון לפי שם סוכנות
- `destination` (string): סינון לפי יעד
- `minPrice` (number): מחיר מינימום
- `maxPrice` (number): מחיר מקסימום
- `startDate` (string): תאריך התחלה
- `endDate` (string): תאריך סיום
- `limit` (number): מספר תוצאות מקסימלי (ברירת מחדל: 20)

**Example:**

```bash
# Filter by tags
GET /api/organized-trips/public?tags=צילום&tags=טבע

# Filter by agency
GET /api/organized-trips/public?agencyName=Oron Travel Agency

# Combined filters
GET /api/organized-trips/public?tags=צילום&agencyName=Oron Travel Agency&minPrice=10000
```

## MongoDB Query Logic

### Tags Filter

```javascript
// Requires ALL selected tags to be present
if (tags) {
  const tagsArray = Array.isArray(tags) ? tags : [tags];
  filter.tags = { $all: tagsArray };
}
```

### Agency Filter

```javascript
// Case-insensitive partial match
if (agencyName) {
  filter.agencyName = new RegExp(agencyName, "i");
}
```

## דוגמת טיול עם תגיות

```javascript
{
  _id: ObjectId("69597915ca92a72657061e10"),
  title: "טיול צילום באיי גלפגוס - 11 ימים",
  destination: "איי גלפגוס, אקוודור",
  agencyName: "Oron Travel Agency",
  tags: ["צילום", "טבע", "יוקרה"],
  pricePerPerson: 42900,
  status: "published",
  visibility: "public",
  // ... שאר השדות
}
```

## UI Components

### Tag Input (CreateOrganizedTrip)

```tsx
<TextField
  value={newTag}
  onChange={(e) => setNewTag(e.target.value)}
  onKeyPress={(e) => {
    if (e.key === 'Enter') {
      // Add tag logic
    }
  }}
/>
<Button onClick={addTag}>הוסף</Button>

{formData.tags?.map((tag) => (
  <Chip
    label={`#${tag}`}
    onDelete={() => removeTag(tag)}
    color="primary"
  />
))}
```

### Tag Filter (PublicTripsPage)

```tsx
{
  allTags.map((tag) => (
    <Chip
      key={tag}
      label={`#${tag}`}
      onClick={() => toggleTag(tag)}
      color={selectedTags.includes(tag) ? "primary" : "default"}
      variant={selectedTags.includes(tag) ? "filled" : "outlined"}
    />
  ));
}
```

## תכונות עתידיות מוצעות

1. **תגיות מוגדרות מראש**: רשימת תגיות מומלצות עם autocomplete
2. **ניהול תגיות**: ממשק אדמין לניהול תגיות גלובליות
3. **תגיות פופולריות**: הצגת התגיות הנפוצות ביותר
4. **קטגוריות**: קיבוץ תגיות לקטגוריות (ספורט, משפחות, טבע, וכו')
5. **צבעים מותאמים**: צבעים שונים לסוגי תגיות שונים
6. **SEO**: שימוש בתגיות למטא-דאטה ו-SEO
7. **סטטיסטיקות**: ניתוח פופולריות של תגיות במערכת האדמין

## בדיקות

### בדיקות ידניות שבוצעו:

✅ יצירת טיול עם תגיות  
✅ הצגת תגיות בכרטיס הטיול  
✅ סינון לפי תגית אחת  
✅ סינון לפי מספר תגיות  
✅ סינון לפי סוכנות  
✅ שילוב סינונים מרובים  
✅ ניקוי סינונים  
✅ הצגת תגיות בדף הטיול המלא  
✅ הצגת תגיות בניהול הטיול

## תאימות דפדפנים

- ✅ Chrome/Edge
- ✅ Firefox
- ✅ Safari
- ✅ Mobile browsers

## נגישות

- ✅ כפתורי תגיות נגישים למקלדת
- ✅ תמיכה ב-RTL לעברית
- ✅ Chips עם קונטרסט מספיק
- ✅ תמיכה ב-screen readers

---

**תאריך יצירה**: 31 בדצמבר 2024  
**גרסה**: 1.0  
**מפתח**: GitHub Copilot
