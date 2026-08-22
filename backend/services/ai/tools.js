/**
 * OpenAI tool (function) definitions for the Loka assistant.
 *
 * IMPORTANT: tools here NEVER mutate the database. The runner converts each
 * tool call into a ChangeSet operation (a proposed diff). The change is only
 * written when the user (or an agent policy) applies the proposal.
 */

const tripIdParam = {
  type: "string",
  description:
    "Target trip id. Use the literal string \"__new__\" when the item belongs to a trip being created in this same turn.",
};

export const READ_ONLY_TOOLS = new Set(["web_search"]);

const timeConfidenceParam = {
  type: "string",
  enum: ["confirmed", "guess"],
  description:
    "confirmed = the user said this time, or you looked it up from a real page or opening hours. guess = you are inferring a typical hour. Omit time and set this to guess when you do not actually know.",
};

const bookingUrlParam = {
  type: "string",
  description: "Official booking or ticket URL when you found one.",
};

const sourceUrlParam = {
  type: "string",
  description:
    "The page you used to confirm hours, prices, or booking. Must be a real URL from web_search citations — never invent it.",
};

export const TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "update_trip",
      description:
        "Propose updating an EXISTING trip's metadata (name, destination, dates). Use this when the user wants to change trip details — never use create_trip for that.",
      parameters: {
        type: "object",
        properties: {
          tripId: {
            type: "string",
            description: "Id of the existing trip to update.",
          },
          name: { type: "string", description: "New trip name" },
          destination: { type: "string", description: "New city or country" },
          startDate: { type: "string", description: "New start date YYYY-MM-DD" },
          endDate: { type: "string", description: "New end date YYYY-MM-DD" },
        },
        required: ["tripId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_trip",
      description: "Propose permanently deleting an existing trip. Owner-only action.",
      parameters: {
        type: "object",
        properties: {
          tripId: {
            type: "string",
            description: "Id of the trip to delete.",
          },
        },
        required: ["tripId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_trip",
      description:
        "Propose creating a brand-NEW trip with a destination and date range. Only when the user explicitly wants a new trip — never for editing an existing one.",
      parameters: {
        type: "object",
        properties: {
          destination: { type: "string", description: "City or country name" },
          startDate: { type: "string", description: "YYYY-MM-DD" },
          endDate: { type: "string", description: "YYYY-MM-DD" },
          name: { type: "string", description: "Short descriptive trip name" },
        },
        required: ["destination", "startDate", "endDate", "name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_flight",
      description: "Propose adding a flight to a trip.",
      parameters: {
        type: "object",
        properties: {
          tripId: tripIdParam,
          airline: { type: "string" },
          flightNumber: { type: "string" },
          departure: { type: "string", description: "Departure airport code" },
          arrival: { type: "string", description: "Arrival airport code" },
          date: { type: "string", description: "YYYY-MM-DD" },
          time: { type: "string", description: "HH:MM departure time" },
        },
        required: ["tripId", "flightNumber", "departure", "arrival", "date", "time"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_hotel",
      description: "Propose adding a hotel stay to a trip.",
      parameters: {
        type: "object",
        properties: {
          tripId: tripIdParam,
          name: { type: "string" },
          address: { type: "string" },
          checkIn: { type: "string", description: "YYYY-MM-DD" },
          checkOut: { type: "string", description: "YYYY-MM-DD" },
          arrivalTime: { type: "string", description: "HH:MM, default 15:00" },
        },
        required: ["tripId", "name", "checkIn", "checkOut"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_ride",
      description: "Propose adding a taxi/transfer/rental ride to a trip.",
      parameters: {
        type: "object",
        properties: {
          tripId: tripIdParam,
          type: { type: "string", enum: ["taxi", "rental", "transfer"] },
          pickup: { type: "string" },
          dropoff: { type: "string" },
          date: { type: "string", description: "YYYY-MM-DD" },
          time: { type: "string", description: "HH:MM pickup time" },
          duration: { type: "string", description: "e.g. '45 minutes'" },
        },
        required: ["tripId", "pickup", "dropoff", "date", "time"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_attraction",
      description:
        "Propose adding a single restaurant, attraction, or activity to a trip.",
      parameters: {
        type: "object",
        properties: {
          tripId: tripIdParam,
          type: { type: "string", enum: ["restaurant", "attraction", "activity", "other"] },
          name: { type: "string" },
          location: { type: "string" },
          date: { type: "string", description: "YYYY-MM-DD" },
          time: {
            type: "string",
            description:
              "HH:MM. Omit if you do not know a real time — a default will be proposed and marked as a guess.",
          },
          timeConfidence: timeConfidenceParam,
          bookingUrl: bookingUrlParam,
          sourceUrl: sourceUrlParam,
          price: { type: "number", description: "Price amount when you found one" },
          currency: { type: "string", description: "ISO currency code, e.g. HUF, EUR" },
          durationMinutes: { type: "number" },
          website: { type: "string" },
          notes: { type: "string" },
        },
        required: ["tripId", "type", "name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_activities",
      description:
        "Propose adding several attractions/restaurants at once (e.g. a full day plan or itinerary).",
      parameters: {
        type: "object",
        properties: {
          tripId: tripIdParam,
          activities: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: { type: "string", enum: ["restaurant", "attraction", "activity", "other"] },
                name: { type: "string" },
                location: { type: "string" },
                date: { type: "string", description: "YYYY-MM-DD" },
                time: {
                  type: "string",
                  description:
                    "HH:MM. Omit if you do not know a real time — a default will be proposed and marked as a guess.",
                },
                timeConfidence: timeConfidenceParam,
                bookingUrl: bookingUrlParam,
                sourceUrl: sourceUrlParam,
                price: { type: "number" },
                currency: { type: "string" },
                durationMinutes: { type: "number" },
                website: { type: "string" },
                notes: { type: "string" },
              },
              required: ["type", "name"],
            },
          },
        },
        required: ["tripId", "activities"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_item",
      description:
        "Propose editing an existing item on a trip (change time, date, name, etc). Use the item id from the trip context.",
      parameters: {
        type: "object",
        properties: {
          tripId: tripIdParam,
          entity: { type: "string", enum: ["flight", "hotel", "ride", "attraction"] },
          itemId: { type: "string", description: "id of the existing item to edit" },
          changes: {
            type: "object",
            description:
              "Key/value fields to change, e.g. { \"scheduledTime\": \"21:00\", \"timeConfidence\": \"confirmed\", \"bookingUrl\": \"https://…\" }",
            additionalProperties: true,
          },
        },
        required: ["tripId", "entity", "itemId", "changes"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remove_item",
      description: "Propose removing an existing item from a trip. Use the item id from the trip context.",
      parameters: {
        type: "object",
        properties: {
          tripId: tripIdParam,
          entity: { type: "string", enum: ["flight", "hotel", "ride", "attraction"] },
          itemId: { type: "string", description: "id of the existing item to remove" },
        },
        required: ["tripId", "entity", "itemId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Look up live tour operating hours, available dates, prices, and official booking links. Read-only — does not change the trip. Use the citations to propose add_attraction or update_item with a real time (timeConfidence confirmed), bookingUrl, and the source page.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Search query, e.g. \"Hungarian Parliament tour hours prices booking\".",
          },
        },
        required: ["query"],
      },
    },
  },
];
