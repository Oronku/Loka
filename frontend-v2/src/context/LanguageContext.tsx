import React, { createContext, useContext, useState, useEffect } from 'react';

type Language = 'he' | 'en';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
  isRTL: boolean;
}

const LanguageContext = createContext<LanguageContextType | undefined>(
  undefined
);

// Translation dictionary
const translations: Record<Language, Record<string, string>> = {
  he: {
    // Navigation
    home: 'דף הבית',
    trips: 'טיולים',
    newTrip: 'טיול חדש',
    quicket: 'Quicket',
    profile: 'הגדרות פרופיל',
    friends: 'חברים',
    checkIn: 'צ׳ק אין',
    logout: 'התנתק',
    dashboard: 'לוח בקרה',

    // Common
    save: 'שמור',
    cancel: 'בטל',
    delete: 'מחק',
    edit: 'ערוך',
    add: 'הוסף',
    search: 'חפש',
    loading: 'טוען...',
    error: 'שגיאה',
    success: 'הצלחה',
    confirm: 'אישור',
    close: 'סגור',

    // Trip details
    flights: 'טיסות',
    hotels: 'מלונות',
    attractions: 'אטרקציות',
    rides: 'נסיעות',
    expenses: 'הוצאות',
    checklist: 'רשימת משימות',
    itinerary: 'מסלול',

    // Dates
    startDate: 'תאריך התחלה',
    endDate: 'תאריך סיום',
    checkInDate: 'צ׳ק אין',
    checkOutDate: 'צ׳ק אאוט',

    // Actions
    viewDetails: 'הצג פרטים',
    addFlight: 'הוסף טיסה',
    addHotel: 'הוסף מלון',
    addAttraction: 'הוסף אטרקציה',
    addRide: 'הוסף נסיעה',
    shareTrip: 'שתף טיול',

    // Messages
    noTrips: 'אין טיולים',
    noFlights: 'אין טיסות',
    noHotels: 'אין מלונות',
    noAttractions: 'אין אטרקציות',
    noRides: 'אין נסיעות',
    welcomeMessage: 'ברוכים הבאים ל-Meet Loka',
    tripCreated: 'הטיול נוצר בהצלחה',
    tripUpdated: 'הטיול עודכן בהצלחה',
    tripDeleted: 'הטיול נמחק בהצלחה',
    itemAdded: 'הפריט נוסף בהצלחה',
    itemUpdated: 'הפריט עודכן בהצלחה',
    itemDeleted: 'הפריט נמחק בהצלחה',
    errorOccurred: 'אירעה שגיאה',
    loadingTrips: 'טוען טיולים...',
    loadingDetails: 'טוען פרטים...',

    // More common
    back: 'חזור',
    next: 'הבא',
    previous: 'הקודם',
    submit: 'שלח',
    update: 'עדכן',
    create: 'צור',
    yes: 'כן',
    no: 'לא',
    continue: 'המשך',
    finish: 'סיים',

    // Extended trip details
    timeline: 'ציר זמן',
    map: 'מפה',
    overview: 'סקירה',
    details: 'פרטים',

    // Dates & Times
    date: 'תאריך',
    time: 'שעה',
    duration: 'משך',
    arrivalTime: 'שעת הגעה',
    departureTime: 'שעת יציאה',
    day: 'יום',
    days: 'ימים',
    night: 'לילה',
    nights: 'לילות',

    // Extended actions
    editTrip: 'ערוך טיול',
    deleteTrip: 'מחק טיול',
    duplicateTrip: 'שכפל טיול',
    exportTrip: 'ייצא טיול',
    invite: 'הזמן',
    share: 'שתף',

    // Trip creation
    tripName: 'שם הטיול',
    destination: 'יעד',
    destinations: 'יעדים',
    travelers: 'מטיילים',
    budget: 'תקציב',
    notes: 'הערות',
    description: 'תיאור',

    // Flight details
    flightNumber: 'מספר טיסה',
    airline: 'חברת תעופה',
    departure: 'המראה',
    arrival: 'נחיתה',
    departureAirport: 'שדה תעופה ממנו',
    arrivalAirport: 'שדה תעופה אליו',
    terminal: 'טרמינל',
    gate: 'שער',
    seat: 'מושב',
    baggage: 'מטען',
    bookingReference: 'אסמכתא',

    // Hotel details
    hotelName: 'שם המלון',
    address: 'כתובת',
    room: 'חדר',
    roomType: 'סוג חדר',
    checkInTime: 'שעת צ׳ק אין',
    checkOutTime: 'שעת צ׳ק אאוט',
    confirmation: 'אישור',
    amenities: 'שירותים',
    rating: 'דירוג',

    // Attraction details
    attractionName: 'שם האטרקציה',
    category: 'קטגוריה',
    visitDate: 'תאריך ביקור',
    visitTime: 'שעת ביקור',
    openingHours: 'שעות פתיחה',
    ticketPrice: 'מחיר כרטיס',
    website: 'אתר',
    phoneNumber: 'טלפון',

    // Ride details
    pickupLocation: 'מיקום איסוף',
    dropoffLocation: 'מיקום הורדה',
    pickupTime: 'שעת איסוף',
    vehicle: 'רכב',
    driver: 'נהג',
    distance: 'מרחק',
    estimatedTime: 'זמן משוער',

    // Costs
    cost: 'עלות',
    totalCost: 'עלות כוללת',
    costPerPerson: 'עלות לאדם',
    paid: 'שולם',
    pending: 'ממתין',
    currency: 'מטבע',

    // Statistics
    travelOverview: 'סקירת טיולים',
    totalFlights: 'סה״כ טיסות',
    totalHotels: 'סה״כ מלונות',
    totalAttractions: 'סה״כ אטרקציות',
    totalSpent: 'סה״כ הוצאות',
    totalDays: 'סה״כ ימים',
    popularDestinations: 'יעדים פופולריים',
    flightTime: 'זמן טיסה',
    acrossAllTrips: 'מכל הטיולים',
    flightsTaken: 'טיסות שבוצעו',
    inAir: 'באוויר',
    nightsStayed: 'לילות שהייה',
    hotelsBooked: 'מלונות שהוזמנו',
    destinationsVisited: 'יעדים',
    citiesVisited: 'ערים שבוקרו',
    costBreakdown: 'פירוט הוצאות',
    topDestinations: 'יעדים מובילים',

    // Search & Filter
    searchPlaceholder: 'חיפוש...',
    filter: 'סינון',
    sortBy: 'מיין לפי',
    showAll: 'הצג הכל',
    showLess: 'הצג פחות',

    // User & Social
    sharedWith: 'משותף עם',
    owner: 'בעלים',
    participant: 'משתתף',
    inviteFriends: 'הזמן חברים',
    addParticipant: 'הוסף משתתף',

    // Other
    optional: 'אופציונלי',
    required: 'חובה',
    recommended: 'מומלץ',
    popular: 'פופולרי',
    new: 'חדש',
    featured: 'מומלץ',

    // Home page
    yourAdventures: 'ההרפתקאות שלך',
    planYourNextTrip: 'תכנן את הטיול המושלם שלך',
    organizeEverything: 'ארגן טיסות, מלונות, אטרקציות ותחבורה במקום אחד',
    createNewTrip: 'צור טיול חדש',
    myTrips: 'הטיולים שלי',
    statistics: 'סטטיסטיקות',
    sharedWithYou: 'משותף איתך',
    trip: 'טיול',
    tripsCount: 'טיולים',
    noTripsYet: 'אין טיולים עדיין',
    startPlanningFirstTrip: 'התחל לתכנן את הטיול הראשון שלך',
    getStarted: 'התחל',
    viewTrip: 'הצג טיול',
    flightsCount: 'טיסות',
    hotelsCount: 'מלונות',
    activitiesCount: 'פעילויות',
    viewOnly: 'צפייה בלבד',

    // Trip Creation Wizard
    createNewTripTitle: 'צור טיול חדש',
    tripBasicInfo: 'מידע בסיסי',
    whereAreYouGoing: 'לאן אתה נוסע?',
    tripNamePlaceholder: 'לדוגמה: טיול לאירופה 2025',
    tripNameHelper: 'תן שם לטיול שלך שיעזור לך לזהות אותו בקלות',
    whenAreYouTraveling: 'מתי אתה נוסע?',
    selectDates: 'בחר תאריכים',
    from: 'מ',
    to: 'עד',
    tripDuration: 'משך הטיול',
    daysCount: 'ימים',
    whoIsTraveling: 'מי נוסע?',
    numberOfTravelers: 'מספר מטיילים',
    adults: 'מבוגרים',
    children: 'ילדים',
    infants: 'תינוקות',
    addTripDescription: 'הוסף תיאור (אופציונלי)',
    descriptionPlaceholder: 'ספר משהו על הטיול שלך...',
    reviewAndCreate: 'סקור וצור',
    tripSummary: 'סיכום הטיול',
    reviewDetails: 'סקור את הפרטים ולחץ על צור טיול',
    tripDetails: 'פרטי הטיול',
    travelDates: 'תאריכי הנסיעה',
    tripCreationSuccess: 'הטיול נוצר בהצלחה!',
    goToTrip: 'עבור לטיול',
    createAnother: 'צור טיול נוסף',
    step: 'שלב',
    of: 'מתוך',
    stepBasicInfo: 'מידע בסיסי',
    stepDates: 'תאריכים',
    stepTravelers: 'מטיילים',
    stepReview: 'סקירה',
    enterTripName: 'הזן שם לטיול',
    selectStartDate: 'בחר תאריך התחלה',
    selectEndDate: 'בחר תאריך סיום',
    invalidDateRange: 'תאריך הסיום חייב להיות אחרי תאריך ההתחלה',
    atLeastOneTraveler: 'חייב להיות לפחות מטייל אחד',
    creatingTrip: 'יוצר טיול...',
    destination_field: 'יעד',
    addDestination: 'הוסף יעד',
    destinations_plural: 'יעדים',
    multiCity: 'ריבוי ערים',

    // Quicket
    quicketMarketplace: 'שוק Quicket',
    quicketDescription:
      'קנה ומכור פריטי נסיעה שאינם ניתנים להחזר - טיסות, מלונות, אטרקציות ואירועים',
    browse: 'עיין',
    myItems: 'הפריטים שלי',
    saved: 'שמורים',
    chats: 'צ׳אטים',
    alerts: 'התראות',
    browseItems: 'עיין בפריטים',
    searchQuicket: 'חפש ב-Quicket...',
    filterByType: 'סנן לפי סוג',
    allTypes: 'כל הסוגים',
    priceRange: 'טווח מחירים',
    location: 'מיקום',
    dateRange: 'טווח תאריכים',
    applyFilters: 'החל סינונים',
    clearFilters: 'נקה סינונים',
    noItemsFound: 'לא נמצאו פריטים',
    tryAdjustingFilters: 'נסה להתאים את הסינונים שלך',
    listItem: 'פרסם פריט',
    editItem: 'ערוך פריט',
    deleteItem: 'מחק פריט',
    markAsSold: 'סמן כנמכר',
    contactSeller: 'צור קשר עם המוכר',
    saveItem: 'שמור פריט',
    unsaveItem: 'הסר שמירה',
    itemDetails: 'פרטי הפריט',
    sellerInfo: 'מידע על המוכר',
    price: 'מחיר',
    originalPrice: 'מחיר מקורי',
    savings: 'חיסכון',
    availability: 'זמינות',
    condition: 'מצב',
    new_condition: 'חדש',
    used: 'משומש',
    excellent: 'מצוין',
    good: 'טוב',
    fair: 'בינוני',
    available: 'זמין',
    sold: 'נמכר',
    pendingStatus: 'ממתין',
    listYourItem: 'פרסם את הפריט שלך',
    itemType: 'סוג פריט',
    itemTitle: 'כותרת הפריט',
    itemDescription: 'תיאור הפריט',
    itemPrice: 'מחיר',
    uploadPhotos: 'העלה תמונות',
    publishItem: 'פרסם פריט',
    updateItem: 'עדכן פריט',
    myListings: 'הפרסומים שלי',
    savedItems: 'פריטים שמורים',
    noSavedItems: 'אין פריטים שמורים',
    startBrowsing: 'התחל לעיין',
    recentChats: 'צ׳אטים אחרונים',
    noChats: 'אין צ׳אטים',
    sendMessage: 'שלח הודעה',
    typeMessage: 'הקלד הודעה...',
  },
  en: {
    // Navigation
    home: 'Home',
    trips: 'Trips',
    newTrip: 'New Trip',
    quicket: 'Quicket',
    profile: 'Profile Settings',
    friends: 'Friends',
    checkIn: 'Check In',
    logout: 'Logout',
    dashboard: 'Dashboard',

    // Common
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    add: 'Add',
    search: 'Search',
    loading: 'Loading...',
    error: 'Error',
    success: 'Success',
    confirm: 'Confirm',
    close: 'Close',

    // Trip details
    flights: 'Flights',
    hotels: 'Hotels',
    attractions: 'Attractions',
    rides: 'Rides',
    expenses: 'Expenses',
    checklist: 'Checklist',
    itinerary: 'Itinerary',

    // Dates
    startDate: 'Start Date',
    endDate: 'End Date',
    checkInDate: 'Check In',
    checkOutDate: 'Check Out',

    // Actions
    viewDetails: 'View Details',
    addFlight: 'Add Flight',
    addHotel: 'Add Hotel',
    addAttraction: 'Add Attraction',
    addRide: 'Add Ride',
    shareTrip: 'Share Trip',

    // Messages
    noTrips: 'No trips',
    noFlights: 'No flights',
    noHotels: 'No hotels',
    noAttractions: 'No attractions',
    noRides: 'No rides',
    welcomeMessage: 'Welcome to Meet Loka',
    tripCreated: 'Trip created successfully',
    tripUpdated: 'Trip updated successfully',
    tripDeleted: 'Trip deleted successfully',
    itemAdded: 'Item added successfully',
    itemUpdated: 'Item updated successfully',
    itemDeleted: 'Item deleted successfully',
    errorOccurred: 'An error occurred',
    loadingTrips: 'Loading trips...',
    loadingDetails: 'Loading details...',

    // More common
    back: 'Back',
    next: 'Next',
    previous: 'Previous',
    submit: 'Submit',
    update: 'Update',
    create: 'Create',
    yes: 'Yes',
    no: 'No',
    continue: 'Continue',
    finish: 'Finish',

    // Extended trip details
    timeline: 'Timeline',
    map: 'Map',
    overview: 'Overview',
    details: 'Details',

    // Dates & Times
    date: 'Date',
    time: 'Time',
    duration: 'Duration',
    arrivalTime: 'Arrival Time',
    departureTime: 'Departure Time',
    day: 'Day',
    days: 'Days',
    night: 'Night',
    nights: 'Nights',

    // Extended actions
    editTrip: 'Edit Trip',
    deleteTrip: 'Delete Trip',
    duplicateTrip: 'Duplicate Trip',
    exportTrip: 'Export Trip',
    invite: 'Invite',
    share: 'Share',

    // Trip creation
    tripName: 'Trip Name',
    destination: 'Destination',
    destinations: 'Destinations',
    travelers: 'Travelers',
    budget: 'Budget',
    notes: 'Notes',
    description: 'Description',

    // Flight details
    flightNumber: 'Flight Number',
    airline: 'Airline',
    departure: 'Departure',
    arrival: 'Arrival',
    departureAirport: 'Departure Airport',
    arrivalAirport: 'Arrival Airport',
    terminal: 'Terminal',
    gate: 'Gate',
    seat: 'Seat',
    baggage: 'Baggage',
    bookingReference: 'Booking Reference',

    // Hotel details
    hotelName: 'Hotel Name',
    address: 'Address',
    room: 'Room',
    roomType: 'Room Type',
    checkInTime: 'Check-in Time',
    checkOutTime: 'Check-out Time',
    confirmation: 'Confirmation',
    amenities: 'Amenities',
    rating: 'Rating',

    // Attraction details
    attractionName: 'Attraction Name',
    category: 'Category',
    visitDate: 'Visit Date',
    visitTime: 'Visit Time',
    openingHours: 'Opening Hours',
    ticketPrice: 'Ticket Price',
    website: 'Website',
    phoneNumber: 'Phone Number',

    // Ride details
    pickupLocation: 'Pickup Location',
    dropoffLocation: 'Dropoff Location',
    pickupTime: 'Pickup Time',
    vehicle: 'Vehicle',
    driver: 'Driver',
    distance: 'Distance',
    estimatedTime: 'Estimated Time',

    // Costs
    cost: 'Cost',
    totalCost: 'Total Cost',
    costPerPerson: 'Cost Per Person',
    paid: 'Paid',
    pending: 'Pending',
    currency: 'Currency',

    // Statistics
    travelOverview: 'Travel Overview',
    totalFlights: 'Total Flights',
    totalHotels: 'Total Hotels',
    totalAttractions: 'Total Attractions',
    totalSpent: 'Total Spent',
    totalDays: 'Total Days',
    popularDestinations: 'Popular Destinations',
    flightTime: 'Flight Time',
    acrossAllTrips: 'Across all trips',
    flightsTaken: 'Flights Taken',
    inAir: 'in air',
    nightsStayed: 'Nights Stayed',
    hotelsBooked: 'hotels booked',
    destinationsVisited: 'Destinations',
    citiesVisited: 'Cities visited',
    costBreakdown: 'Cost Breakdown',
    topDestinations: 'Top Destinations',

    // Search & Filter
    searchPlaceholder: 'Search...',
    filter: 'Filter',
    sortBy: 'Sort By',
    showAll: 'Show All',
    showLess: 'Show Less',

    // User & Social
    sharedWith: 'Shared With',
    owner: 'Owner',
    participant: 'Participant',
    inviteFriends: 'Invite Friends',
    addParticipant: 'Add Participant',

    // Other
    optional: 'Optional',
    required: 'Required',
    recommended: 'Recommended',
    popular: 'Popular',
    new: 'New',
    featured: 'Featured',

    // Home page
    yourAdventures: 'Your Adventures',
    planYourNextTrip: 'Plan Your Perfect Trip',
    organizeEverything:
      'Organize flights, hotels, attractions, and transportation all in one place',
    createNewTrip: 'Create New Trip',
    myTrips: 'My Trips',
    statistics: 'Statistics',
    sharedWithYou: 'Shared with You',
    trip: 'Trip',
    tripsCount: 'Trips',
    noTripsYet: 'No trips yet',
    startPlanningFirstTrip: 'Start planning your first trip',
    getStarted: 'Get Started',
    viewTrip: 'View Trip',
    flightsCount: 'flights',
    hotelsCount: 'hotels',
    activitiesCount: 'activities',
    viewOnly: 'View Only',

    // Trip Creation Wizard
    createNewTripTitle: 'Create New Trip',
    tripBasicInfo: 'Basic Information',
    whereAreYouGoing: 'Where are you going?',
    tripNamePlaceholder: 'e.g., Europe Trip 2025',
    tripNameHelper: 'Give your trip a name that helps you identify it easily',
    whenAreYouTraveling: 'When are you traveling?',
    selectDates: 'Select dates',
    from: 'From',
    to: 'To',
    tripDuration: 'Trip Duration',
    daysCount: 'days',
    whoIsTraveling: 'Who is traveling?',
    numberOfTravelers: 'Number of travelers',
    adults: 'Adults',
    children: 'Children',
    infants: 'Infants',
    addTripDescription: 'Add description (optional)',
    descriptionPlaceholder: 'Tell us about your trip...',
    reviewAndCreate: 'Review & Create',
    tripSummary: 'Trip Summary',
    reviewDetails: 'Review the details and click Create Trip',
    tripDetails: 'Trip Details',
    travelDates: 'Travel Dates',
    tripCreationSuccess: 'Trip created successfully!',
    goToTrip: 'Go to Trip',
    createAnother: 'Create Another Trip',
    step: 'Step',
    of: 'of',
    stepBasicInfo: 'Basic Info',
    stepDates: 'Dates',
    stepTravelers: 'Travelers',
    stepReview: 'Review',
    enterTripName: 'Enter trip name',
    selectStartDate: 'Select start date',
    selectEndDate: 'Select end date',
    invalidDateRange: 'End date must be after start date',
    atLeastOneTraveler: 'Must have at least one traveler',
    creatingTrip: 'Creating trip...',
    destination_field: 'Destination',
    addDestination: 'Add Destination',
    destinations_plural: 'Destinations',
    multiCity: 'Multi-city',

    // Quicket
    quicketMarketplace: 'Quicket Marketplace',
    quicketDescription:
      'Buy and sell non-refundable travel items - flights, hotels, attractions, and events',
    browse: 'Browse',
    myItems: 'My Items',
    saved: 'Saved',
    chats: 'Chats',
    alerts: 'Alerts',
    browseItems: 'Browse Items',
    searchQuicket: 'Search Quicket...',
    filterByType: 'Filter by Type',
    allTypes: 'All Types',
    priceRange: 'Price Range',
    location: 'Location',
    dateRange: 'Date Range',
    applyFilters: 'Apply Filters',
    clearFilters: 'Clear Filters',
    noItemsFound: 'No items found',
    tryAdjustingFilters: 'Try adjusting your filters',
    listItem: 'List Item',
    editItem: 'Edit Item',
    deleteItem: 'Delete Item',
    markAsSold: 'Mark as Sold',
    contactSeller: 'Contact Seller',
    saveItem: 'Save Item',
    unsaveItem: 'Unsave Item',
    itemDetails: 'Item Details',
    sellerInfo: 'Seller Info',
    price: 'Price',
    originalPrice: 'Original Price',
    savings: 'Savings',
    availability: 'Availability',
    condition: 'Condition',
    new_condition: 'New',
    used: 'Used',
    excellent: 'Excellent',
    good: 'Good',
    fair: 'Fair',
    available: 'Available',
    sold: 'Sold',
    pendingStatus: 'Pending',
    listYourItem: 'List Your Item',
    itemType: 'Item Type',
    itemTitle: 'Item Title',
    itemDescription: 'Item Description',
    itemPrice: 'Price',
    uploadPhotos: 'Upload Photos',
    publishItem: 'Publish Item',
    updateItem: 'Update Item',
    myListings: 'My Listings',
    savedItems: 'Saved Items',
    noSavedItems: 'No saved items',
    startBrowsing: 'Start Browsing',
    recentChats: 'Recent Chats',
    noChats: 'No chats',
    sendMessage: 'Send Message',
    typeMessage: 'Type a message...',
  },
};

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // Load language from localStorage or default to Hebrew
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('app-language');
    return (saved as Language) || 'he';
  });

  // Update localStorage and document direction when language changes
  useEffect(() => {
    localStorage.setItem('app-language', language);
    document.documentElement.dir = language === 'he' ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
  };

  const t = (key: string): string => {
    return translations[language][key] || key;
  };

  const isRTL = language === 'he';

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, isRTL }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
}
