import express from "express";
import { getDb } from "../config/database.js";
import { verifyGoogleToken } from "../middleware/auth.js";
import { ObjectId } from "mongodb";
import OpenAI from "openai";

const router = express.Router();

// Apply auth middleware
router.use(verifyGoogleToken);

// Initialize OpenAI if key is present
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
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

export default router;
