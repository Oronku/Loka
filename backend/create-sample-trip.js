import "dotenv/config";
import { MongoClient, ObjectId } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI;

async function createSampleTrip() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log("✓ Connected to MongoDB");

    const db = client.db("meetloca");
    const organizedTrips = db.collection("organized_trips");
    const users = db.collection("users");

    // Find the agent user (oronku@gmail.com)
    const agent = await users.findOne({ email: "oronku@gmail.com" });
    if (!agent) {
      console.error("❌ Agent user not found. Run set-agent.js first.");
      return;
    }

    console.log("✓ Found agent:", agent.name);

    // Create comprehensive Galapagos Photo Tour
    const galapagosTrip = {
      agentId: agent._id.toString(),
      agentName: agent.name,
      agencyName: agent.agencyName || "Oron Travel Agency",
      type: "organized",

      // Basic Info
      title: "טיול צילום באיי גלפגוס - 11 ימים",
      destination: "איי גלפגוס, אקוודור",
      description: `חוויית צילום ייחודית באחד ממקומות הטבע המדהימים בעולם! 

טיול צילום מודרך באיי גלפגוס - המקום שבו דרווין פיתח את תורת האבולוציה. 

🌋 נחקור איים וולקניים מרהיבים
🦭 נצלם חיות בר ייחודיות: צבי ענק, איגואנות ימיות, אריות ים, פינגווינים
🌊 שנורקלינג עם כרישים ואריות ים
📸 הדרכת צילום מקצועית לאורך כל הטיול
🚢 שייט יוקרתי בין האיים

הטיול כולל:
• טיסות פנימיות באקוודור
• 7 לילות על סיפון יאכטה יוקרתית (M/C Millenium)
• 2 לילות בקיטו
• כל הארוחות
• מדריך צילום מקצועי ישראלי
• מדריך טבע מקומי דובר אנגלית
• כל הטיולים והפעילויות
• ציוד שנורקלינג

אידיאלי למצלמי טבע ואנשי מקצוע!`,

      // Dates
      startDate: "2026-08-15",
      endDate: "2026-08-25",
      duration: 11,

      // Capacity & Pricing
      maxParticipants: 16,
      currentParticipants: 0,
      pricePerPerson: 42900, // ILS
      currency: "ILS",

      // Status
      status: "published", // Already published
      visibility: "public", // Public visibility

      // Tags for filtering
      tags: ["צילום", "טבע", "יוקרה"],

      // Participants
      participants: [],

      // Detailed Itinerary
      itinerary: [
        {
          day: 1,
          date: "2026-08-15",
          title: "יציאה לאקוודור",
          description: "טיסה לקיטו, בירת אקוודור",
          activities: [
            {
              type: "transport",
              time: "20:00",
              title: "טיסה ישירה תל אביב - קיטו",
              description: "טיסה ישירה עם חברת תעופה בינלאומית",
              location: "נתב״ג",
              included: true,
              bookingRequired: true,
            },
          ],
        },
        {
          day: 2,
          date: "2026-08-16",
          title: "הגעה לקיטו וסיור בעיר",
          description: "נחיתה בבוקר, מעבר למלון, וסיור בעיר ההיסטורית",
          activities: [
            {
              type: "transport",
              time: "08:00",
              title: "נחיתה בקיטו",
              description: "העברה למלון בלב העיר ההיסטורית",
              location: "שדה התעופה הבינלאומי קיטו",
              included: true,
              bookingRequired: false,
            },
            {
              type: "accommodation",
              time: "12:00",
              title: "צ'ק-אין במלון Casa Gangotena",
              description: "מלון בוטיק יוקרתי בלב העיר העתיקה",
              location: "Plaza San Francisco, Quito",
              included: true,
              bookingRequired: false,
            },
            {
              type: "attraction",
              time: "15:00",
              title: "סיור צילום בעיר העתיקה של קיטו",
              description: "העיר העתיקה היפה בדרום אמריקה - אתר מורשת עולמית",
              location: "Centro Histórico de Quito",
              included: true,
              bookingRequired: false,
            },
            {
              type: "meal",
              time: "19:00",
              title: "ארוחת ערב במסעדה מקומית",
              description: "ארוחת היכרות עם המשתתפים",
              location: "Quito",
              included: true,
              bookingRequired: false,
            },
          ],
        },
        {
          day: 3,
          date: "2026-08-17",
          title: "טיסה לגלפגוס והפלגה",
          description: "טיסה בבוקר לאי באלטרה ועלייה על היאכטה",
          activities: [
            {
              type: "transport",
              time: "09:00",
              title: "טיסה לאי באלטרה (סנטה קרוז)",
              description: "טיסה פנימית ~2 שעות",
              location: "Baltra Island",
              included: true,
              bookingRequired: true,
            },
            {
              type: "accommodation",
              time: "12:00",
              title: "עלייה על היאכטה M/C Millenium",
              description: "יאכטה יוקרתית עם 8 קבינות מפוארות",
              location: "Baltra Port",
              included: true,
              bookingRequired: false,
            },
            {
              type: "attraction",
              time: "15:00",
              title: "צילום באי באלטרה",
              description: "ציפורים ימיות ונופי חוף מדהימים",
              location: "Baltra Island",
              included: true,
              bookingRequired: false,
            },
          ],
        },
        {
          day: 4,
          date: "2026-08-18",
          title: "אי פלזה סור - אריות ים ואיגואנות",
          description: "יום מלא של צילום חיות בר ייחודיות",
          activities: [
            {
              type: "attraction",
              time: "08:00",
              title: "טיול צילום באי פלזה סור",
              description:
                "אריות ים, איגואנות צהובות, ציפורים טרופיות, קקטוסים ענקיים",
              location: "Plaza Sur Island",
              included: true,
              bookingRequired: false,
            },
            {
              type: "attraction",
              time: "14:00",
              title: "שנורקלינג עם אריות ים",
              description: "חוויית שנורקל בלתי נשכחת",
              location: "Plaza Sur",
              included: true,
              bookingRequired: false,
            },
            {
              type: "other",
              time: "16:00",
              title: "סדנת צילום - הגדרות למצבי אור מורכבים",
              description: "הדרכה מקצועית מהמדריך הישראלי",
              location: "על סיפון היאכטה",
              included: true,
              bookingRequired: false,
            },
          ],
        },
        {
          day: 5,
          date: "2026-08-19",
          title: "אי סנטה פה - פינגווינים וכרישים",
          description: "האי הצעיר ביותר, נופים וולקניים מרהיבים",
          activities: [
            {
              type: "attraction",
              time: "07:00",
              title: "טיול באי סנטה פה",
              description:
                "צילום שטחי לבה, פינגווינים של גלפגוס, איגואנות ימיות",
              location: "Santa Fe Island",
              included: true,
              bookingRequired: false,
            },
            {
              type: "attraction",
              time: "14:00",
              title: "שנורקלינג עם כרישי שונית",
              description: "צילום תת-ימי עם כרישים, צבי ים וקרניים",
              location: "Kicker Rock",
              included: true,
              bookingRequired: false,
            },
          ],
        },
        {
          day: 6,
          date: "2026-08-20",
          title: "אי אספניולה - אלבטרוסים",
          description: "האי הדרומי ביותר - גן עדן לצפרים",
          activities: [
            {
              type: "attraction",
              time: "08:00",
              title: "צילום אלבטרוסים",
              description:
                "האי היחיד בעולם שבו מקננים אלבטרוסים גלים - ציפורים מדהימות",
              location: "Española Island",
              included: true,
              bookingRequired: false,
            },
            {
              type: "attraction",
              time: "13:00",
              title: "גרדנר ביי",
              description: "חוף חול לבן עם אריות ים ומגוון ציפורים",
              location: "Gardner Bay",
              included: true,
              bookingRequired: false,
            },
          ],
        },
        {
          day: 7,
          date: "2026-08-21",
          title: "אי פלורנה - פוסט אופיס ביי",
          description: "היסטוריה, צבי ענק ושנורקלינג",
          activities: [
            {
              type: "attraction",
              time: "08:00",
              title: 'התיבה ההיסטורית "Post Office Bay"',
              description: "תיבת דואר מ-1793 שעדיין בשימוש - מסורת מרתקת",
              location: "Floreana Island",
              included: true,
              bookingRequired: false,
            },
            {
              type: "attraction",
              time: "14:00",
              title: "שנורקלינג באצ'מפיון",
              description: "צילום תת-ימי עם צבי ים, כרישים וקרניים",
              location: "Champion Islet",
              included: true,
              bookingRequired: false,
            },
          ],
        },
        {
          day: 8,
          date: "2026-08-22",
          title: "מרכז המחקר צ'רלס דרווין",
          description: "מפגש עם צבי הענק והיסטוריה מדעית",
          activities: [
            {
              type: "attraction",
              time: "09:00",
              title: "מרכז המחקר של דרווין ותחנת הגידול",
              description: "צילום צבי ענק מקרוב, למידה על שימור המינים",
              location: "Charles Darwin Research Station",
              included: true,
              bookingRequired: false,
            },
            {
              type: "attraction",
              time: "14:00",
              title: "סיור בעיירה פוארטו איורה",
              description: "קניות מזכרות, תצפית על כרישים בנמל",
              location: "Puerto Ayora",
              included: true,
              bookingRequired: false,
            },
          ],
        },
        {
          day: 9,
          date: "2026-08-23",
          title: "נורת' סימור - פרגטות וציפורים כחולות",
          description: "אי המפורסם בציפורים הצבעוניות",
          activities: [
            {
              type: "attraction",
              time: "08:00",
              title: "צילום ציפורי פרגטה וכחולות רגליים",
              description:
                "מופע הרחבת כיס האוויר האדום של הזכרים - חוויה ייחודית",
              location: "North Seymour Island",
              included: true,
              bookingRequired: false,
            },
            {
              type: "other",
              time: "16:00",
              title: "סדנת עריכה - ביקורת תמונות",
              description: "ביקורת קבוצתית לתמונות הטיול",
              location: "על היאכטה",
              included: true,
              bookingRequired: false,
            },
          ],
        },
        {
          day: 10,
          date: "2026-08-24",
          title: "חזרה לקיטו - ארוחת סיום",
          description: "טיסה חזרה ליבשת ולילה אחרון בקיטו",
          activities: [
            {
              type: "transport",
              time: "10:00",
              title: "טיסה חזרה לקיטו",
              description: "נפרדים מהגלפגוס",
              location: "Baltra Airport",
              included: true,
              bookingRequired: true,
            },
            {
              type: "accommodation",
              time: "14:00",
              title: "חזרה למלון בקיטו",
              description: "מנוחה ומקלחת",
              location: "Casa Gangotena",
              included: true,
              bookingRequired: false,
            },
            {
              type: "meal",
              time: "19:00",
              title: "ארוחת סיום חגיגית",
              description: "ארוחה מיוחדת עם כל המשתתפים",
              location: "מסעדת בוטיק בקיטו",
              included: true,
              bookingRequired: false,
            },
          ],
        },
        {
          day: 11,
          date: "2026-08-25",
          title: "טיסה חזרה לישראל",
          description: "סיום הטיול והמראה חזרה",
          activities: [
            {
              type: "transport",
              time: "16:00",
              title: "טיסה חזרה לישראל",
              description: "נחיתה למחרת בבוקר",
              location: "קיטו",
              included: true,
              bookingRequired: true,
            },
          ],
        },
      ],

      // Documents (empty for now, will be added by agent)
      documents: [],

      // Updates
      updates: [],

      // Included Services
      includedServices: [
        "✈️ כל הטיסות (בינלאומיות ופנימיות)",
        "🚢 7 לילות על יאכטה יוקרתית M/C Millenium",
        "🏨 2 לילות במלון 5 כוכבים בקיטו (Casa Gangotena)",
        "🍽️ פנסיון מלא - כל הארוחות כולל חטיפים",
        "📸 מדריך צילום ישראלי מקצועי לאורך כל הטיול",
        "🌿 מדריך טבע מקומי מוסמך (אנגלית)",
        "🎫 כל דמי הכניסה לפארקים ואתרים",
        "🤿 ציוד שנורקלינג איכותי",
        "🚤 כל הטיולים והפעילויות המפורטים בתוכנית",
        "💼 ביטוח נסיעות מקיף",
        "👥 קבוצה קטנה - מקסימום 16 משתתפים",
        "📚 חומר לימוד והכנה לפני הטיול",
      ],

      // Not Included
      notIncludedServices: [
        "🎒 הוצאות אישיות",
        "🍷 משקאות אלכוהוליים",
        "💰 טיפים למדריכים וצוות (מקובל ~150-200$ לאדם)",
        "📸 ציוד צילום אישי (מצלמה, עדשות)",
        "🏥 חיסונים (מומלץ להתעדכן)",
        "✈️ השדרוג מחלקת תיירות לעסקים",
        "🚕 העברות פרטיות שלא בתוכנית",
      ],

      // Important Info
      meetingPoint:
        "נקודת המפגש: שדה התעופה בן גוריון, טרמינל 3, דלפק הרשמה של חברת התעופה. נפגש 3 שעות לפני הטיסה.",

      importantNotes: `📋 מידע חשוב לטיול:

🎒 ציוד מומלץ לצילום:
- מצלמה DSLR/Mirrorless
- עדשת טלה (300-400mm מומלץ מאוד)
- עדשה רחבה (16-35mm)
- מצלמה/עדשה עמידה למים לצילום תת-ימי
- סוללות ומטענים
- כרטיסי זיכרון בנפח גדול
- מחשב נייד לעריכה וגיבוי

🌡️ אקלים:
- טמפרטורות: 22-28 מעלות בממוצע
- עונה יבשה - מזג אוויר נוח
- מומלץ בגדים קלים, כובע ומשקפי שמש

💊 חיסונים:
- לא נדרשים חיסונים חובה
- מומלץ: הפטיטיס A+B, טיפואיד
- ייעוץ עם מרפאת נוסעים

🏊 שנורקלינג:
- לא נדרשת ניסיון קודם
- ציוד איכותי מסופק
- אפשרות להשכרת ציוד צלילה

📱 תקשורת:
- WiFi זמין על היאכטה (מוגבל)
- מומלץ כרטיס SIM מקומי באקוודור
- רשת סלולרית מוגבלת באיים

💳 כסף:
- מטבע: דולר אמריקאי (USD)
- כרטיסי אשראי מקובלים
- מומלץ למשוך מזומן בקיטו`,

      // Images (will be added later)
      coverImage:
        "https://phototeva.co.il/wp-content/uploads/2024/12/שנורקול-עם-אריות-ים-צילום-עופר-קידר-1200x800.jpg",
      gallery: [
        "https://phototeva.co.il/wp-content/uploads/2024/12/איי-גלפגוס-צילום-עופר-קידר-1200x800.jpg",
        "https://phototeva.co.il/wp-content/uploads/2024/12/צב-ענק-באיי-גלפגוס-צילום-עופר-קידר-1200x800.jpg",
      ],

      // Metadata
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Insert the trip
    const result = await organizedTrips.insertOne(galapagosTrip);
    console.log("✓ Sample trip created successfully!");
    console.log("✓ Trip ID:", result.insertedId);
    console.log("✓ Trip title:", galapagosTrip.title);
    console.log("✓ Status:", galapagosTrip.status);
    console.log("✓ Visibility:", galapagosTrip.visibility);
    console.log("\n📱 You can now view this trip at:");
    console.log(
      `   Agent: http://localhost:5191/agent/trips/${result.insertedId}`
    );
    console.log(`   Public: http://localhost:5191/trips/${result.insertedId}`);
    console.log(`   All trips: http://localhost:5191/trips`);
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await client.close();
    console.log("\n✓ Disconnected from MongoDB");
  }
}

createSampleTrip();
