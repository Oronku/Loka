import express from "express";
import { getDb } from "../config/database.js";
import { verifyGoogleToken } from "../middleware/auth.js";
import { ObjectId } from "mongodb";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import googleApi from "../services/googleApi.js";
import travelpayouts from "../services/travelpayouts.js";
import rapidApiHotels from "../services/rapidApiHotels.js";
import googleFlights from "../services/googleFlights.js";
import duffel from "../services/duffel.js";

const router = express.Router();

// PUBLIC endpoint - Get real prices (no auth required for price checking)
router.post("/get-real-prices", async (req, res) => {
  try {
    const { destination, hotelName, checkIn, checkOut, origin } = req.body;

    console.log(
      `💰 Getting real prices for ${destination}${hotelName ? ` - ${hotelName}` : ""}`
    );

    const results = {
      destination: destination,
      hotels: [],
      flights: [],
      averageHotelPrice: null,
      averageFlightPrice: null,
      affiliate: true,
    };

    // Fetch hotels using RapidAPI (real prices from Booking.com)
    if (destination && checkIn && checkOut && rapidApiHotels.isConfigured()) {
      try {
        const hotels = await rapidApiHotels.searchHotels(
          destination,
          checkIn,
          checkOut,
          2,
          hotelName // Pass specific hotel name if provided
        );
        results.hotels = hotels || [];

        if (hotels && hotels.length > 0) {
          const avgPrice =
            hotels.reduce((sum, h) => sum + (h.price || 0), 0) / hotels.length;
          results.averageHotelPrice = Math.round(avgPrice);
        }
      } catch (err) {
        console.error("Hotel search error:", err.message);
      }
    }

    // Fetch flights using Duffel API
    if (origin && destination && checkIn && duffel.isConfigured()) {
      try {
        console.log(
          `✈️ Searching flights with Duffel: ${origin} → ${destination}`
        );

        const flights = await duffel.searchFlights(
          origin,
          destination,
          checkIn,
          checkOut || null, // Return date (null for one-way)
          2, // Adults
          "economy"
        );
        results.flights = flights || [];

        if (flights && flights.length > 0) {
          const avgPrice =
            flights.reduce((sum, f) => sum + (f.price || 0), 0) /
            flights.length;
          results.averageFlightPrice = Math.round(avgPrice);
          console.log(
            `✅ Found ${flights.length} flights from Duffel, avg: $${results.averageFlightPrice}`
          );
        } else {
          console.log("⚠️ No flights found from Duffel");
        }
      } catch (err) {
        console.error("Duffel flight search error:", err.message);
        // Don't fail the whole request if flights fail
        results.flightsError = err.message;
      }
    }

    console.log(
      `✅ Found ${results.hotels.length} hotels, ${results.flights.length} flights`
    );

    res.json(results);
  } catch (error) {
    console.error("Get Real Prices Error:", error);
    res.status(500).json({
      error: "Failed to get prices",
      details: error.message,
    });
  }
});

// Apply auth middleware to all routes below this point
router.use(verifyGoogleToken);

// Initialize OpenAI if key is present
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

// Initialize Gemini if key is present
const genAI =
  process.env.GEMINI_API_KEY &&
  process.env.GEMINI_API_KEY !==
    "GET_FROM_https://aistudio.google.com/app/apikey"
    ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    : null;

// Process AI message
router.post("/message", async (req, res) => {
  try {
    const { message, context } = req.body;
    const db = getDb();
    const userId = req.user.id;

    // 1. Get user's trips for context
    const trips = await db
      .collection("trips")
      .find({
        $or: [{ userId: userId }, { "sharedWith.userId": userId }],
      })
      .toArray();

    // 2. Use OpenAI if available
    if (openai) {
      try {
        const systemPrompt = `
You are Loka, a smart travel assistant for the MeetLoka app.
Your goal is to help users plan, manage, and understand their trips.
You have access to the user's current trips: ${JSON.stringify(
          trips.map((t) => ({
            id: t._id,
            name: t.name,
            dates: t.startDate + " to " + t.endDate,
            destinations: t.destinations,
          }))
        )}

When a user asks to create a trip or add items, you should use the available tools.
Always be helpful, concise, and friendly.
        `;

        const completion = await openai.chat.completions.create({
          model: "gpt-4-turbo-preview",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: message },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "create_trip",
                description: "Create a new trip with destination and dates",
                parameters: {
                  type: "object",
                  properties: {
                    destination: { type: "string" },
                    startDate: {
                      type: "string",
                      format: "date",
                      description: "YYYY-MM-DD",
                    },
                    endDate: {
                      type: "string",
                      format: "date",
                      description: "YYYY-MM-DD",
                    },
                    name: { type: "string" },
                  },
                  required: ["destination", "startDate", "endDate", "name"],
                },
              },
            },
            {
              type: "function",
              function: {
                name: "add_flight",
                description: "Add a flight to a trip",
                parameters: {
                  type: "object",
                  properties: {
                    airline: { type: "string" },
                    flightNumber: { type: "string" },
                    departure: { type: "string", description: "Airport code" },
                    arrival: { type: "string", description: "Airport code" },
                    date: { type: "string", format: "date" },
                    time: { type: "string", format: "time" },
                  },
                  required: [
                    "airline",
                    "flightNumber",
                    "departure",
                    "arrival",
                    "date",
                    "time",
                  ],
                },
              },
            },
          ],
          tool_choice: "auto",
        });

        const responseMessage = completion.choices[0].message;

        // Check if AI wants to call a function
        if (responseMessage.tool_calls) {
          const toolCall = responseMessage.tool_calls[0];
          const functionName = toolCall.function.name;
          const functionArgs = JSON.parse(toolCall.function.arguments);

          let action = null;
          let responseText = "";

          if (functionName === "create_trip") {
            action = {
              type: "CREATE_TRIP",
              data: functionArgs,
            };
            responseText = `I can help with that. I've prepared a trip to ${functionArgs.destination}. Shall I create it?`;
          } else if (functionName === "add_flight") {
            action = {
              type: "ADD_FLIGHT",
              data: functionArgs,
            };
            responseText = `I found flight ${functionArgs.flightNumber}. Would you like me to add it?`;
          }

          return res.json({
            text: responseText,
            action: action,
            timestamp: new Date(),
          });
        }

        // Normal text response
        return res.json({
          text: responseMessage.content,
          action: null,
          timestamp: new Date(),
        });
      } catch (aiError) {
        console.error("OpenAI API Error:", aiError);
        // Fallback to rule-based if API fails
      }
    }

    // --- FALLBACK: Rule-based system (if no OpenAI key or error) ---

    let responseText = "";
    let action = null;

    const lowerMsg = message.toLowerCase();

    if (lowerMsg.includes("create") && lowerMsg.includes("trip")) {
      // Trip creation flow
      if (lowerMsg.includes("dubai")) {
        action = {
          type: "CREATE_TRIP",
          data: {
            destination: "Dubai, UAE",
            startDate: "2025-11-13",
            endDate: "2025-11-16",
            name: "Trip to Dubai",
          },
        };
        responseText =
          "I can help with that. I've prepared a trip to Dubai from Nov 13 to Nov 16. Shall I create it?";
      } else {
        responseText =
          "I'd love to help you plan a trip. Where would you like to go and when?";
      }
    } else if (lowerMsg.includes("flight")) {
      // Flight handling
      if (lowerMsg.includes("ly315")) {
        action = {
          type: "ADD_FLIGHT",
          data: {
            airline: "El Al",
            flightNumber: "LY315",
            departure: "TLV",
            arrival: "LHR",
            date: "2025-11-13",
            time: "10:00",
          },
        };
        responseText =
          "I found flight LY315 from Tel Aviv to London on Nov 13. Would you like me to add it to your trip?";
      } else {
        responseText =
          "I can check flight details for you. Which flight number are you interested in?";
      }
    } else if (lowerMsg.includes("hotel")) {
      responseText =
        "I can help manage your accommodation. What hotel are you staying at?";
    } else {
      // General conversation
      responseText =
        "I'm Loka, your AI travel assistant. I can help you plan trips, track flights, and manage your itinerary. How can I help you today?";
    }

    // 3. Return response
    res.json({
      text: responseText,
      action: action,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("AI Error:", error);
    res.status(500).json({ error: "Failed to process message" });
  }
});

// Execute AI action (create trip, add item, etc)
router.post("/action", async (req, res) => {
  try {
    const { actionType, actionData } = req.body;
    const db = getDb();
    const userId = req.user.id;

    if (actionType === "CREATE_TRIP") {
      const newTrip = {
        userId,
        name: actionData.name,
        destinations: [actionData.destination],
        startDate: actionData.startDate,
        endDate: actionData.endDate,
        createdAt: new Date(),
        updatedAt: new Date(),
        flights: [],
        hotels: [],
        attractions: [],
      };

      await db.collection("trips").insertOne(newTrip);
      res.json({ success: true, message: "Trip created successfully!" });
    } else {
      res.json({ success: true, message: "Action completed" });
    }
  } catch (error) {
    console.error("Action Error:", error);
    res.status(500).json({ error: "Failed to execute action" });
  }
});

// Generate AI-powered itinerary suggestions
router.post("/suggest-itinerary", async (req, res) => {
  try {
    const { trip, preferences } = req.body;
    const userId = req.user.id;

    // Validate OpenAI is available
    if (!openai) {
      return res.status(503).json({
        error: "AI service is not available. Please configure OpenAI API key.",
      });
    }

    // Validate trip data
    if (!trip || !trip.destinations || !trip.startDate || !trip.endDate) {
      return res.status(400).json({
        error:
          "Trip data is incomplete. Please provide destinations and dates.",
      });
    }

    // Calculate trip duration and generate dates array
    const startDate = new Date(trip.startDate);
    const endDate = new Date(trip.endDate);
    const tripDays =
      Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;

    const dates = [];
    for (let i = 0; i < tripDays; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      dates.push(date.toISOString().split("T")[0]);
    }

    // Build context about existing trip items
    const existingItems = {
      hotels: trip.hotels || [],
      attractions: trip.attractions || [],
      flights: trip.flights || [],
      transportations: trip.transportations || [],
    };

    // Build the prompt
    const systemPrompt = `
You are Loka, an expert travel planner AI. Your task is to generate personalized day-by-day itinerary suggestions for a trip.

TRIP DETAILS:
- Destinations: ${trip.destinations.map((d) => d.name || d).join(", ")}
- Dates: ${trip.startDate} to ${trip.endDate} (${tripDays} days)
- Existing Hotels: ${existingItems.hotels.map((h) => h.name).join(", ") || "None"}
- Existing Attractions: ${existingItems.attractions.map((a) => a.name).join(", ") || "None"}

USER PREFERENCES:
- Interests: ${preferences.interests || "General tourism"}
- Daily Budget: ${preferences.dailyBudget || "Not specified"}
- Pace: ${preferences.pace || "moderate"} (relaxed = 2-3 activities/day, moderate = 3-4, packed = 5-6)

INSTRUCTIONS:
1. Generate suggestions for each day of the trip
2. Consider the user's interests and budget
3. Respect the chosen pace (don't over-schedule)
4. Include variety: mix of attractions, restaurants, and activities
5. Consider logistics: group nearby locations together
6. For each suggestion, provide:
   - type: "attraction", "restaurant", "hotel", or "activity"
   - name: Clear, specific name
   - description: Brief 1-2 sentence description
   - location: Specific address or area name
   - estimatedCost: Number in local currency (optional)
   - suggestedTime: Time of day like "9:00 AM" or "Evening" (optional)
   - duration: Like "2 hours" or "3-4 hours" (optional)
   - reason: Brief explanation why this fits their interests (optional)

Return ONLY a valid JSON array in this exact format:
[
  {
    "date": "YYYY-MM-DD",
    "suggestions": [
      {
        "type": "attraction",
        "name": "Example Museum",
        "description": "Famous art museum with Renaissance collection",
        "location": "123 Main St, City Center",
        "estimatedCost": 25,
        "suggestedTime": "10:00 AM",
        "duration": "2-3 hours",
        "reason": "Perfect for culture enthusiasts"
      }
    ]
  }
]

Do not include any text before or after the JSON array.
`;

    const userPrompt = `Generate a personalized ${tripDays}-day itinerary for this trip. Return only the JSON array.`;

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4-turbo-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 4000,
      });

      let responseContent = completion.choices[0].message.content.trim();

      // Clean up the response - remove markdown code blocks if present
      responseContent = responseContent
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "");

      // Parse the JSON response
      const suggestions = JSON.parse(responseContent);

      // Validate the response structure
      if (!Array.isArray(suggestions)) {
        throw new Error("Invalid response format: expected array");
      }

      // Validate each day has the required structure
      for (const day of suggestions) {
        if (!day.date || !Array.isArray(day.suggestions)) {
          throw new Error("Invalid day structure");
        }
      }

      return res.json({
        success: true,
        suggestions: suggestions,
        tripDays: tripDays,
        aiProvider: "openai",
      });
    } catch (aiError) {
      console.error("OpenAI API Error:", aiError);

      // Check if it's a parsing error
      if (aiError instanceof SyntaxError) {
        return res.status(500).json({
          error: "Failed to parse AI response. Please try again.",
          details: aiError.message,
        });
      }

      return res.status(500).json({
        error: "Failed to generate suggestions. Please try again.",
        details: aiError.message,
      });
    }
  } catch (error) {
    console.error("Suggest Itinerary Error:", error);
    res.status(500).json({
      error: "Failed to generate itinerary suggestions",
      details: error.message,
    });
  }
});

// NEW: Smart AI Trip Creation - Uses Gemini + Google Places for real data
router.post("/create-smart-trip", async (req, res) => {
  try {
    const { trip, preferences } = req.body;
    const userId = req.user.id;

    // Validate we have at least one AI service
    if (!genAI && !openai) {
      return res.status(503).json({
        error:
          "AI service is not available. Please configure GEMINI_API_KEY or OPENAI_API_KEY.",
      });
    }

    // Validate trip data
    if (!trip || !trip.destinations || !trip.startDate || !trip.endDate) {
      return res.status(400).json({
        error:
          "Trip data is incomplete. Please provide destinations and dates.",
      });
    }

    const startDate = new Date(trip.startDate);
    const endDate = new Date(trip.endDate);
    const tripDays =
      Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;

    const destinations = Array.isArray(trip.destinations)
      ? trip.destinations
      : [trip.destinations];
    const mainDestination = destinations[0];

    console.log(
      `🤖 Smart Trip Creation: ${mainDestination} for ${tripDays} days`
    );

    // Strategy: Use Gemini for real places, OpenAI for creative descriptions
    const useGemini = genAI !== null;
    const aiProvider = useGemini ? "gemini" : "openai";

    let itinerary = [];

    if (useGemini) {
      // GEMINI PATH: Get real places with Google integration
      console.log("🔵 Using Gemini + Google Places for real data");

      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

      const prompt = `You are a travel planning AI with access to Google Places data.
      
Create a ${tripDays}-day itinerary for ${mainDestination}.

Trip Details:
- Destination: ${mainDestination}
- Dates: ${trip.startDate} to ${trip.endDate}
- Interests: ${preferences?.interests || "general tourism, culture, food"}
- Pace: ${preferences?.pace || "moderate"}
- Budget: ${preferences?.dailyBudget || "moderate"}

For EACH day, suggest 3-5 activities including:
- Famous attractions (museums, landmarks, viewpoints)
- Local restaurants (breakfast, lunch, dinner spots)
- Activities (walking tours, experiences)

Return ONLY a JSON array with this EXACT structure:
[
  {
    "day": 1,
    "date": "${trip.startDate}",
    "theme": "Arrival & City Center",
    "activities": [
      {
        "time": "10:00 AM",
        "type": "attraction",
        "name": "EXACT attraction name",
        "description": "Brief description",
        "duration": "2 hours",
        "estimatedCost": 25,
        "searchQuery": "attraction name + ${mainDestination}"
      }
    ]
  }
]

CRITICAL: Use REAL place names that exist in ${mainDestination}. Make searchQuery very specific.
Return only valid JSON, no markdown, no explanation.`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      let text = response.text();

      // Clean response
      text = text
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();

      const geminiItinerary = JSON.parse(text);

      // Now enhance with REAL Google Places data
      console.log("📍 Enriching with Google Places API...");

      for (const day of geminiItinerary) {
        const enrichedActivities = [];

        for (const activity of day.activities) {
          try {
            // Search for the real place using Google Places
            const searchQuery =
              activity.searchQuery || `${activity.name} ${mainDestination}`;
            const placeData = await googleApi.searchPlaceByText(searchQuery);

            if (placeData) {
              enrichedActivities.push({
                ...activity,
                placeId: placeData.place_id,
                location: placeData.formatted_address || activity.location,
                coordinates: placeData.geometry?.location,
                rating: placeData.rating,
                userRatingsTotal: placeData.user_ratings_total,
                photos: placeData.photos?.slice(0, 3),
                realPlace: true,
              });
              console.log(
                `  ✅ Found: ${activity.name} (${placeData.place_id})`
              );
            } else {
              // Keep original if not found
              enrichedActivities.push({ ...activity, realPlace: false });
              console.log(`  ⚠️  Not found: ${activity.name}`);
            }
          } catch (err) {
            console.error(
              `  ❌ Error searching ${activity.name}:`,
              err.message
            );
            enrichedActivities.push({ ...activity, realPlace: false });
          }
        }

        day.activities = enrichedActivities;
      }

      itinerary = geminiItinerary;
    } else if (openai) {
      // OPENAI PATH: Creative descriptions (fallback)
      console.log("🟢 Using OpenAI for creative itinerary");

      const systemPrompt = `Create a ${tripDays}-day itinerary for ${mainDestination}.
Return only valid JSON array with day-by-day activities.`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4-turbo-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Create detailed ${tripDays}-day plan` },
        ],
        temperature: 0.7,
        max_tokens: 3000,
      });

      let text = completion.choices[0].message.content.trim();
      text = text.replace(/```json\n?/g, "").replace(/```\n?/g, "");
      itinerary = JSON.parse(text);
    }

    res.json({
      success: true,
      itinerary: itinerary,
      tripDays: tripDays,
      aiProvider: aiProvider,
      enrichedWithGooglePlaces: useGemini,
      totalActivities: itinerary.reduce(
        (sum, day) => sum + (day.activities?.length || 0),
        0
      ),
    });
  } catch (error) {
    console.error("Smart Trip Creation Error:", error);
    res.status(500).json({
      error: "Failed to create smart trip",
      details: error.message,
    });
  }
});

export default router;
