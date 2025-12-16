# Notification System Usage Guide

## Overview

מערכת התראות מתוחכמת עם תמיכה מלאה בעברית/אנגלית ו-RTL.

## Quick Start

### 1. Import the hook

```tsx
import { useNotification } from '../context/NotificationContext';
```

### 2. Use in your component

```tsx
function MyComponent() {
  const { showSuccess, showError, showWarning, showInfo } = useNotification();

  const handleSave = async () => {
    try {
      await saveData();
      showSuccess(t('savedSuccessfully')); // ✅ Success
    } catch (error) {
      showError(t('actionFailed')); // ❌ Error
    }
  };

  return <button onClick={handleSave}>Save</button>;
}
```

## API Reference

### Available Methods

#### `showSuccess(message: string, duration?: number)`

הצגת הודעת הצלחה ירוקה

```tsx
showSuccess('הפעולה בוצעה בהצלחה!');
showSuccess('נשמר!', 2000); // Custom duration
```

#### `showError(message: string, duration?: number)`

הצגת הודעת שגיאה אדומה

```tsx
showError('אירעה שגיאה בשמירה');
showError('חיבור נכשל', 5000); // Longer duration for errors
```

#### `showWarning(message: string, duration?: number)`

הודעת אזהרה כתומה

```tsx
showWarning('יש לבדוק את השדות');
```

#### `showInfo(message: string, duration?: number)`

הודעת מידע כחולה

```tsx
showInfo('התהליך עשוי לקחת זמן...');
```

#### `showNotification(message: string, type: 'success' | 'error' | 'warning' | 'info', duration?: number)`

שיטה כללית

```tsx
showNotification('הודעה', 'info', 3000);
```

## Common Patterns

### With Translation

```tsx
const { t } = useLanguage();
const { showSuccess, showError } = useNotification();

// Success
showSuccess(t('savedSuccessfully'));
showSuccess(t('createdSuccessfully'));
showSuccess(t('updatedSuccessfully'));
showSuccess(t('deletedSuccessfully'));

// Error
showError(t('actionFailed'));
showError(t('errorOccurred'));
showError(t('pleaseCheckConnection'));
showError(t('sessionExpired'));
showError(t('noPermission'));
```

### API Error Handling

```tsx
try {
  const response = await fetch('/api/endpoint', { ... });
  if (!response.ok) {
    throw new Error('Failed');
  }
  showSuccess(t('savedSuccessfully'));
} catch (error: any) {
  const errorMsg = error?.response?.data?.message || error.message || t('errorOccurred');
  showError(errorMsg);
}
```

### With Custom Messages

```tsx
// Check-in success with place name
showSuccess(`✓ ${t('checkIn')} ${placeName}!`);

// Item deleted with name
showSuccess(`🗑️ ${itemName} ${t('deletedSuccessfully')}`);

// Trip created
showSuccess(`🎉 ${tripName} ${t('createdSuccessfully')}`);
```

### Loading States

```tsx
const handleAction = async () => {
  setLoading(true);
  showInfo(t('loading')); // Optional

  try {
    await performAction();
    showSuccess(t('actionCompleted'));
  } catch (error) {
    showError(t('actionFailed'));
  } finally {
    setLoading(false);
  }
};
```

## Features

### ✅ RTL Support

המערכת תומכת באופן מלא ב-RTL - ההתראות מיושרות אוטומטית לפי כיוון השפה.

### ✅ Auto-hide

ברירת מחדל: 4 שניות. אפשר להגדיר משך זמן מותאם אישית.

### ✅ Animations

אנימציית Slide מלמעלה עם fade in/out חלק.

### ✅ Queue Support

ההתראות מוצגות אחת אחרי השנייה אוטומטית.

### ✅ Click to Dismiss

אפשר לסגור התראה ידנית עם לחיצה על X.

### ✅ Color Coded

- 🟢 Success (Green)
- 🔴 Error (Red)
- 🟠 Warning (Orange)
- 🔵 Info (Blue)

## Integration Examples

### CheckIn.tsx

```tsx
const handleCheckIn = async () => {
  try {
    const response = await fetch('/api/checkins', { ... });
    if (response.ok) {
      showSuccess(`✓ ${t('checkIn')} ${selectedPlace.name}!`);
    } else {
      showError(t('checkInFailed'));
    }
  } catch (error) {
    showError(t('checkInError'));
  }
};
```

### NewTripWizard.tsx

```tsx
const handleCreate = async () => {
  try {
    const newTrip = await createTrip(data);
    showSuccess(t('tripCreationSuccess'));
    navigate(`/trips/${newTrip._id}`);
  } catch (e: any) {
    showError(e?.response?.data?.message || t('errorOccurred'));
  }
};
```

### Home.tsx (Delete trip)

```tsx
const handleDeleteTrip = async (tripId: string, tripName: string) => {
  try {
    await deleteTrip(tripId);
    showSuccess(`${tripName} ${t('deletedSuccessfully')}`);
    fetchTrips(); // Refresh list
  } catch (error) {
    showError(t('actionFailed'));
  }
};
```

## Styling

המערכת משתמשת ב-Material-UI Alert component עם:

- Border radius: 12px (rounded corners)
- Font weight: 600 (semi-bold)
- Min width: 280px (mobile) / 400px (desktop)
- Shadow: elevation 6
- Icon size: 28px
- Position: Top center

## Best Practices

1. **Always use translations** - שימוש ב-t() לתמיכה רב-לשונית
2. **Specific error messages** - הודעות שגיאה ספציפיות ומועילות
3. **Don't overuse** - לא להציף את המשתמש בהתראות
4. **Appropriate duration** - שגיאות: 5000ms, הצלחות: 3000ms
5. **User actions** - תמיד לתת feedback על פעולות משתמש
6. **Network errors** - טיפול נכון בבעיות רשת
7. **Emojis** (optional) - להוסיף emojis להודעות להעשרה ויזואלית

## Migration from alert()

### Before ❌

```tsx
alert('נשמר בהצלחה!');
alert('שגיאה בשמירה');
```

### After ✅

```tsx
showSuccess(t('savedSuccessfully'));
showError(t('actionFailed'));
```

## Error Boundary

מערכת טיפול בשגיאות ברמת האפליקציה זמינה אוטומטית דרך `ErrorBoundary` component.

### Features:

- ✅ Catches React errors
- ✅ Translated error messages
- ✅ Development mode: Shows error details
- ✅ Production mode: User-friendly message
- ✅ Reset/Go Home buttons

אין צורך לעשות כלום - ErrorBoundary כבר מעוטף סביב כל האפליקציה ב-App.tsx!

---

🎉 **המערכת מוכנה לשימוש!** השתמש בה בכל מקום באפליקציה להודעות מקצועיות ומתורגמות.
