# Loka Travel Platform - API Specification

**Base URL:** `http://localhost:3001/api`  
**Version:** 1.0  
**Authentication:** JWT tokens (except for public endpoints marked as such)

---

## Table of Contents

- [Authentication](#authentication)
- [Response Formats](#response-formats)
- [API Endpoints](#api-endpoints)
  - [Auth](#auth)
  - [Trips](#trips)
  - [Hotels](#hotels)
  - [Flights](#flights)
  - [Rides](#rides)
  - [Places](#places)
  - [Chats](#chats)
  - [Friends](#friends)
  - [Check-ins](#check-ins)
  - [Quicket](#quicket)
  - [Budgets](#budgets)
  - [Weather](#weather)
  - [AI Assistant](#ai-assistant)
  - [Admin](#admin)
  - [Agent](#agent)
  - [Agency](#agency)
  - [Organized Trips](#organized-trips)

---

## Authentication

### How to Authenticate
1. Use `/api/auth/register` or `/api/auth/login` to get a JWT token
2. Pass the token in request headers:
   ```
   Authorization: Bearer <JWT_TOKEN>
   ```

### Public Endpoints (No Auth Required)
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/ai/get-real-prices`
- `GET /api/organized-trips/public`
- `GET /api/organized-trips/:id`
- `POST /api/organized-trips/:id/register`
- `GET /api/organized-trips/participant/:email/trips`
- `GET /api/health`

### Special Roles
- **Admin**: Requires `isAdmin` flag on account
- **Agent**: Requires `isAgent` flag on account
- **Agency Admin**: Requires `isAdmin` within agency (`agencyAdminAt` field)

---

## Response Formats

### Success Response
```json
{
  "data": { /* response data */ },
  "message": "Success"
}
```

Or directly returns the data object depending on endpoint implementation.

### Error Response
```json
{
  "error": "Error message",
  "message": "Detailed error description"
}
```

### Standard HTTP Status Codes
- `200` - OK (successful request)
- `201` - Created (resource created)
- `400` - Bad Request (validation error)
- `401` - Unauthorized (invalid/missing auth)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found (resource not found)
- `500` - Internal Server Error

---

## API Endpoints

---

## Auth

### Register User
```http
POST /api/auth/register
```

**Public Endpoint** ✓

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123",
  "name": "John Doe"
}
```

**Response:** User object with JWT token

**Example cURL:**
```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "SecurePass123",
    "name": "John Doe"
  }'
```

---

### Login
```http
POST /api/auth/login
```

**Public Endpoint** ✓

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Response:** User object with JWT token

---

### Get Profile
```http
GET /api/auth/profile
```

**Authentication:** Required ✓

**Response:**
```json
{
  "_id": "user_id",
  "email": "user@example.com",
  "name": "John Doe",
  "preferredCurrency": "USD",
  "isAdmin": false,
  "isAgent": false
}
```

---

### Update Profile
```http
PUT /api/auth/profile
```

**Authentication:** Required ✓

**Request Body:**
```json
{
  "name": "Jane Doe",
  "preferredCurrency": "EUR"
}
```

---

### Change Password
```http
PUT /api/auth/change-password
```

**Authentication:** Required ✓

**Request Body:**
```json
{
  "currentPassword": "oldPassword123",
  "newPassword": "newPassword123"
}
```

---

### Get Agency Invitations
```http
GET /api/auth/invitations
```

**Authentication:** Required ✓

**Response:** Array of pending invitations

---

### Accept Agency Invitation
```http
POST /api/auth/invitations/:invitationId/accept
```

**Authentication:** Required ✓

**Path Parameters:**
- `invitationId` - The invitation ID

---

### Reject Agency Invitation
```http
POST /api/auth/invitations/:invitationId/reject
```

**Authentication:** Required ✓

**Path Parameters:**
- `invitationId` - The invitation ID

---

## Trips

### Get All Trips
```http
GET /api/trips
```

**Authentication:** Required ✓

**Response:** Array of trips owned by or shared with user

---

### Create Trip
```http
POST /api/trips
```

**Authentication:** Required ✓

**Request Body:**
```json
{
  "name": "Europe Adventure",
  "startDate": "2024-06-01",
  "endDate": "2024-06-15",
  "destination": "Paris",
  "color": "#FF5733"
}
```

**Response:** Created trip object

---

### Get Trip Details
```http
GET /api/trips/:id
```

**Authentication:** Required ✓

**Path Parameters:**
- `id` - Trip ID

**Response:** Trip object with all details

---

### Update Trip
```http
PUT /api/trips/:id
```

**Authentication:** Required ✓

**Path Parameters:**
- `id` - Trip ID

**Request Body:**
```json
{
  "name": "Updated Trip Name",
  "startDate": "2024-06-01",
  "endDate": "2024-06-20"
}
```

---

### Delete Trip
```http
DELETE /api/trips/:id
```

**Authentication:** Required ✓ (Owner only)

**Path Parameters:**
- `id` - Trip ID

---

### Update Trip Checklist
```http
PUT /api/trips/:id/checklist
```

**Authentication:** Required ✓

**Path Parameters:**
- `id` - Trip ID

**Request Body:**
```json
{
  "checklist": [
    { "item": "Book flights", "completed": true },
    { "item": "Pack luggage", "completed": false }
  ]
}
```

---

### Share Trip
```http
POST /api/trips/:id/share
```

**Authentication:** Required ✓

**Path Parameters:**
- `id` - Trip ID

---

## Hotels

### Search Hotels (Autocomplete)
```http
GET /api/hotels/autocomplete
```

**Authentication:** Not required

**Query Parameters:**
- `input` (required) - Hotel name prefix (minimum 2 characters)

**Response:** Array of hotel suggestions with place IDs

**Example:**
```
GET /api/hotels/autocomplete?input=hilton
```

---

### Get Hotel Details
```http
GET /api/hotels/details
```

**Authentication:** Not required

**Query Parameters:**
- `place_id` (required) - Google Places place ID

**Response:**
```json
{
  "name": "Hilton Paris",
  "address": "123 Rue de Rivoli, Paris",
  "rating": 4.5,
  "reviews": 1250,
  "photos": ["url1", "url2"],
  "phoneNumber": "+33 1 23 45 67 89",
  "website": "https://hiltonparis.com"
}
```

---

### Get Distance to Airport
```http
GET /api/hotels/distance-from-airport
```

**Authentication:** Not required

**Query Parameters:**
- `hotel_place_id` (required) - Hotel's place ID
- `airport_code` (required) - IATA airport code (e.g., "CDG")

**Response:**
```json
{
  "distance": "15.2 km",
  "estimatedDrivingTime": "25 mins"
}
```

---

## Flights

### Search Flights by Route
```http
GET /api/flights/search-route
```

**Authentication:** Not required

**Query Parameters:**
- `from` (required) - Origin airport code
- `to` (required) - Destination airport code
- `date` (optional) - Departure date (YYYY-MM-DD)
- `directOnly` (optional) - Boolean, only direct flights
- `airline` (optional) - Filter by airline code

**Response:** Array of available flights

---

### Get Real Flight Data
```http
GET /api/flights/search/:flightNumber
```

**Authentication:** Not required

**Path Parameters:**
- `flightNumber` - Flight number (e.g., "AA123")

**Query Parameters:**
- `date` (required) - Flight date (YYYY-MM-DD)

**Response:**
```json
{
  "flightNumber": "AA123",
  "airline": "American Airlines",
  "aircraft": "Boeing 787",
  "departure": "2024-06-01T10:30:00Z",
  "arrival": "2024-06-01T18:45:00Z",
  "duration": "8h 15m",
  "operatingAirline": "AA"
}
```

---

### Search Airports
```http
GET /api/flights/airports/search
```

**Authentication:** Not required

**Query Parameters:**
- `query` (required) - Airport name or code (minimum 2 characters)

**Response:** Array of airport suggestions

**Example:**
```
GET /api/flights/airports/search?query=paris
```

---

## Rides

### Calculate Distance
```http
GET /api/rides/distance
```

**Authentication:** Not required

**Query Parameters:**
- `from` (required) - Origin address/location name
- `to` (required) - Destination address/location name
- `mode` (optional) - "driving" or "transit" (default: "driving")

**Response:**
```json
{
  "distance": "12.5 km",
  "duration": "25 mins",
  "mode": "driving"
}
```

---

### Calculate Route
```http
POST /api/rides/calculate-route
```

**Authentication:** Not required

**Request Body:**
```json
{
  "origin": "Eiffel Tower, Paris",
  "destination": "Louvre Museum, Paris"
}
```

**Response:**
```json
{
  "distance": "4.2 km",
  "duration": "12 mins",
  "route": { /* polyline data */ }
}
```

---

### Get Location Autocomplete
```http
GET /api/rides/location-autocomplete
```

**Authentication:** Not required

**Query Parameters:**
- `input` (required) - Location name prefix (minimum 2 characters)

**Response:** Array of location suggestions

---

### Get Location Details
```http
GET /api/rides/location-details
```

**Authentication:** Not required

**Query Parameters:**
- `place_id` (required) - Google Places place ID

**Response:**
```json
{
  "name": "Eiffel Tower",
  "address": "5 Avenue Anatole France, 75007 Paris",
  "lat": 48.8584,
  "lng": 2.2945,
  "placeId": "ChIJ8f03e6AqoUcRDrHkFFGhD5k"
}
```

---

### Get Ride Estimates
```http
POST /api/rides/estimate
```

**Authentication:** Not required

**Request Body:**
```json
{
  "pickup": "Charles de Gaulle Airport",
  "dropoff": "Central Paris",
  "modes": ["uber", "taxi", "shuttle"]
}
```

**Response:**
```json
{
  "estimates": [
    {
      "service": "uber",
      "estimatedPrice": "$35-45",
      "duration": "25-35 mins"
    }
  ]
}
```

---

### Smart Checkout Time
```http
POST /api/rides/smart-checkout
```

**Authentication:** Not required

**Request Body:**
```json
{
  "hotelAddress": "123 Rue de Paris, Paris",
  "airportCode": "CDG",
  "flightDepartureTime": "2024-06-15T14:00:00Z"
}
```

**Response:**
```json
{
  "recommendedCheckoutTime": "2024-06-15T11:15:00Z",
  "bufferMinutes": 45
}
```

---

## Places

### Search Places (Autocomplete)
```http
GET /api/places/autocomplete
```

**Authentication:** Not required

**Query Parameters:**
- `input` (required) - Place name prefix
- `types` (optional) - Comma-separated types (restaurant, museum, park, etc.)

**Response:** Array of place suggestions

---

### Get Place Details
```http
GET /api/places/details
```

**Authentication:** Not required

**Query Parameters:**
- `place_id` (required) - Google Places place ID

**Response:**
```json
{
  "name": "Louvre Museum",
  "address": "Rue de Rivoli, Paris",
  "lat": 48.8606,
  "lng": 2.3352,
  "rating": 4.7,
  "reviews": 45000,
  "openingHours": {
    "monday": "9:00 AM - 6:00 PM",
    "closed_on": ["Tuesday"]
  },
  "phone": "+33 1 40 20 53 17",
  "website": "https://www.louvre.fr",
  "photos": ["url1", "url2", "url3"]
}
```

---

### Search Nearby Places
```http
GET /api/places/nearby
```

**Authentication:** Not required

**Query Parameters:**
- `lat` (required) - Latitude
- `lng` (required) - Longitude
- `radius` (optional) - Search radius in meters (default: 1000)
- `type` (optional) - Place type (restaurant, hotel, museum, etc.)

**Example:**
```
GET /api/places/nearby?lat=48.8606&lng=2.3352&radius=500&type=restaurant
```

---

### Search by Category
```http
GET /api/places/search-by-category
```

**Authentication:** Not required

**Query Parameters:**
- `lat` (required) - Latitude
- `lng` (required) - Longitude
- `category` (required) - Category (restaurant, museum, park, etc.)
- `radius` (optional) - Search radius in meters (default: 1000)

---

### Get Place Photo
```http
GET /api/places/photo
```

**Authentication:** Not required

**Query Parameters:**
- `photo_reference` (required) - Photo reference from place details
- `maxwidth` (optional) - Maximum width in pixels (default: 400)

---

## Chats

### Create Chat
```http
POST /api/chats
```

**Authentication:** Required ✓

**Request Body:**
```json
{
  "contextType": "trip|quicket_item|direct",
  "contextId": "optional_context_id",
  "participants": ["user_id_1", "user_id_2"]
}
```

**Response:** Created chat object

---

### Get User's Chats
```http
GET /api/chats
```

**Authentication:** Required ✓

**Query Parameters:**
- `contextType` (optional) - Filter by type (trip, quicket_item, direct)
- `status` (optional) - Filter by status (active, archived)

**Response:** Array of chats

---

### Get Chat Details
```http
GET /api/chats/:chatId
```

**Authentication:** Required ✓

**Path Parameters:**
- `chatId` - Chat ID

**Response:** Chat object with metadata

---

### Get Chat Messages
```http
GET /api/chats/:chatId/messages
```

**Authentication:** Required ✓

**Path Parameters:**
- `chatId` - Chat ID

**Query Parameters:**
- `limit` (optional) - Number of messages to fetch (default: 50)
- `before` (optional) - Message ID to fetch messages before

**Response:** Array of messages with pagination info

---

### Send Message
```http
POST /api/chats/:chatId/messages
```

**Authentication:** Required ✓

**Path Parameters:**
- `chatId` - Chat ID

**Request Body:**
```json
{
  "text": "Message content",
  "attachments": [
    {
      "type": "image|file",
      "url": "https://example.com/image.jpg"
    }
  ]
}
```

**Response:** Created message object

---

### Mark Messages as Read
```http
PUT /api/chats/:chatId/read
```

**Authentication:** Required ✓

**Path Parameters:**
- `chatId` - Chat ID

**Request Body:**
```json
{
  "messageIds": ["msg_id_1", "msg_id_2"]
}
```

---

## Friends

### Get Friends List
```http
GET /api/friends
```

**Authentication:** Required ✓

**Response:** Array of accepted friend connections

---

### Search Users
```http
GET /api/friends/search
```

**Authentication:** Required ✓

**Query Parameters:**
- `query` (required) - User name or email (minimum 2 characters)

**Response:** Array of matching users

---

### Send Friend Request
```http
POST /api/friends/request
```

**Authentication:** Required ✓

**Request Body:**
```json
{
  "receiverId": "friend_user_id"
}
```

---

### Get Friend Requests
```http
GET /api/friends/requests
```

**Authentication:** Required ✓

**Response:** Array of pending received friend requests

---

## Check-ins

### Create Check-in
```http
POST /api/checkins
```

**Authentication:** Required ✓

**Request Body:**
```json
{
  "placeId": "google_place_id",
  "name": "Eiffel Tower",
  "location": {
    "lat": 48.8584,
    "lng": 2.2945
  }
}
```

**Response:** Created check-in object

---

### Get Check-ins
```http
GET /api/checkins
```

**Authentication:** Required ✓

**Response:** Array of user's last 50 check-ins

---

## Quicket

### Search Items
```http
GET /api/quicket/items
```

**Authentication:** Not required

**Query Parameters:**
- `type` (optional) - Item type (luggage, tour_guide, etc.)
- `minPrice` (optional) - Minimum price
- `maxPrice` (optional) - Maximum price
- `destination` (optional) - Destination filter
- `sort` (optional) - Sort order (newest, price_asc, price_desc)
- `page` (optional) - Page number (default: 1)
- `limit` (optional) - Items per page (default: 20)

**Response:** Paginated array of items

---

### Get Item Details
```http
GET /api/quicket/items/:id
```

**Authentication:** Not required

**Path Parameters:**
- `id` - Item ID

**Response:**
```json
{
  "_id": "item_id",
  "type": "luggage",
  "title": "29\" Hard Shell Luggage",
  "description": "Barely used, excellent condition",
  "sellerId": "user_id",
  "priceSelling": 80,
  "currency": "USD",
  "destination": "Paris",
  "views": 145,
  "createdAt": "2024-05-15T10:30:00Z"
}
```

---

### Create Item
```http
POST /api/quicket/items
```

**Authentication:** Required ✓

**Request Body:**
```json
{
  "type": "luggage",
  "title": "29\" Hard Shell Luggage",
  "description": "Barely used, excellent condition",
  "priceSelling": 80,
  "currency": "USD",
  "destination": "Paris",
  "images": ["url1", "url2"]
}
```

**Response:** Created item object

---

### Update Item
```http
PUT /api/quicket/items/:id
```

**Authentication:** Required ✓ (Seller only)

**Path Parameters:**
- `id` - Item ID

**Request Body:** Item fields to update

---

### Delete Item
```http
DELETE /api/quicket/items/:id
```

**Authentication:** Required ✓ (Seller only)

**Path Parameters:**
- `id` - Item ID

---

### Like Item
```http
POST /api/quicket/items/:id/like
```

**Authentication:** Required ✓

**Path Parameters:**
- `id` - Item ID

**Request Body:**
```json
{
  "likeType": "save|heart|interested"
}
```

---

### Unlike Item
```http
POST /api/quicket/items/:id/dislike
```

**Authentication:** Required ✓

**Path Parameters:**
- `id` - Item ID

---

## Budgets

### Get Trip Budget
```http
GET /api/budgets/:tripId
```

**Authentication:** Required ✓

**Path Parameters:**
- `tripId` - Trip ID

**Response:**
```json
{
  "tripId": "trip_id",
  "totalBudget": 5000,
  "currency": "USD",
  "categories": {
    "flights": { "budget": 1200, "spent": 950 },
    "hotels": { "budget": 2000, "spent": 1850 },
    "food": { "budget": 1000, "spent": 450 },
    "activities": { "budget": 800, "spent": 200 }
  }
}
```

---

### Create Budget
```http
POST /api/budgets/:tripId
```

**Authentication:** Required ✓

**Path Parameters:**
- `tripId` - Trip ID

**Request Body:**
```json
{
  "totalBudget": 5000,
  "currency": "USD",
  "categories": {
    "flights": 1200,
    "hotels": 2000,
    "food": 1000,
    "activities": 800
  }
}
```

---

### Update Budget
```http
PUT /api/budgets/:tripId
```

**Authentication:** Required ✓

**Path Parameters:**
- `tripId` - Trip ID

**Request Body:** Budget fields to update

---

### Delete Budget
```http
DELETE /api/budgets/:tripId
```

**Authentication:** Required ✓

**Path Parameters:**
- `tripId` - Trip ID

---

## Weather

### Get Weather Forecast
```http
GET /api/weather
```

**Authentication:** Not required

**Query Parameters:**
- `city` (required) - City name
- `date` (required) - Forecast date (YYYY-MM-DD)

**Response:**
```json
{
  "city": "Paris",
  "date": "2024-06-15",
  "temperature": {
    "high": 22,
    "low": 16,
    "unit": "C"
  },
  "condition": "Partly Cloudy",
  "humidity": 65,
  "windSpeed": 12,
  "precipitation": 10
}
```

---

## AI Assistant

### Get Real Prices
```http
POST /api/ai/get-real-prices
```

**Public Endpoint** ✓

**Request Body:**
```json
{
  "destination": "Paris",
  "hotelName": "Hilton Paris",
  "checkIn": "2024-06-01",
  "checkOut": "2024-06-05",
  "origin": "New York"
}
```

**Response:**
```json
{
  "hotel": {
    "name": "Hilton Paris",
    "pricePerNight": 250,
    "totalPrice": 1000,
    "currency": "USD"
  },
  "flight": {
    "price": 450,
    "currency": "USD"
  }
}
```

---

### Send Message to AI
```http
POST /api/ai/message
```

**Authentication:** Required ✓

**Request Body:**
```json
{
  "message": "Can you help me plan a 5-day trip to Paris?",
  "context": {
    "tripId": "optional_trip_id",
    "previousMessages": []
  }
}
```

**Response:** AI assistant's response

---

### Execute AI Action
```http
POST /api/ai/action
```

**Authentication:** Required ✓

**Request Body:**
```json
{
  "actionType": "create_trip|add_flight|add_hotel|search_flights",
  "actionData": {
    /* action-specific data */
  }
}
```

---

## Admin

### Get User Statistics
```http
GET /api/admin/users/statistics
```

**Authentication:** Required ✓  
**Admin Role:** Required ✓

**Response:**
```json
{
  "totalUsers": 1500,
  "activeThisMonth": 450,
  "newThisMonth": 120,
  "growthRate": "8.5%"
}
```

---

### Get Destination Statistics
```http
GET /api/admin/destinations/statistics
```

**Authentication:** Required ✓  
**Admin Role:** Required ✓

**Response:** Statistics about popular destinations and trips

---

### Get Flights Statistics
```http
GET /api/admin/flights/statistics
```

**Authentication:** Required ✓  
**Admin Role:** Required ✓

**Response:** Statistics about flight searches and bookings

---

### Get Trips Statistics
```http
GET /api/admin/trips/statistics
```

**Authentication:** Required ✓  
**Admin Role:** Required ✓

**Response:** Statistics about upcoming, ongoing, and completed trips

---

### Get All Users
```http
GET /api/admin/users/all
```

**Authentication:** Required ✓  
**Admin Role:** Required ✓

**Response:** Array of all users with metadata

---

### Toggle User Admin Status
```http
POST /api/admin/users/:userId/toggle-admin
```

**Authentication:** Required ✓  
**Admin Role:** Required ✓

**Path Parameters:**
- `userId` - User ID to toggle

---

### Get All Agents
```http
GET /api/admin/agents
```

**Authentication:** Required ✓  
**Admin Role:** Required ✓

**Response:** Array of all agents with trip counts

---

### Update Agent Details
```http
PUT /api/admin/agents/:userId
```

**Authentication:** Required ✓  
**Admin Role:** Required ✓

**Path Parameters:**
- `userId` - Agent user ID

**Request Body:**
```json
{
  "agencyName": "Travel Agency Name",
  "agencyLicense": "LICENSE123",
  "agentPhone": "+1-555-123-4567"
}
```

---

### Toggle Agent Status
```http
PATCH /api/admin/agents/:userId/toggle-agent
```

**Authentication:** Required ✓  
**Admin Role:** Required ✓

**Path Parameters:**
- `userId` - User ID

**Request Body:**
```json
{
  "isAgent": true
}
```

---

## Agent

### Get Dashboard Statistics
```http
GET /api/agent/dashboard/stats
```

**Authentication:** Required ✓  
**Agent Role:** Required ✓

**Response:** Agent-specific dashboard statistics

---

### Get Organized Trips
```http
GET /api/agent/trips
```

**Authentication:** Required ✓  
**Agent Role:** Required ✓

**Response:** Array of organized trips created by agent

---

### Create Organized Trip
```http
POST /api/agent/trips/create
```

**Authentication:** Required ✓  
**Agent Role:** Required ✓

**Request Body:**
```json
{
  "name": "Paris Museum Tour",
  "destination": "Paris",
  "startDate": "2024-07-01",
  "endDate": "2024-07-05",
  "description": "5-day guided museum tour",
  "price": 1500,
  "currency": "USD",
  "maxParticipants": 20
}
```

---

### Get Organized Trip Details
```http
GET /api/agent/trips/:id
```

**Authentication:** Required ✓  
**Agent Role:** Required ✓

**Path Parameters:**
- `id` - Trip ID

---

### Update Organized Trip
```http
PUT /api/agent/trips/:id
```

**Authentication:** Required ✓  
**Agent Role:** Required ✓

**Path Parameters:**
- `id` - Trip ID

**Request Body:** Trip fields to update

---

### Update Trip Visibility
```http
PATCH /api/agent/trips/:id/visibility
```

**Authentication:** Required ✓  
**Agent Role:** Required ✓

**Path Parameters:**
- `id` - Trip ID

**Request Body:**
```json
{
  "visibility": "public|private|draft"
}
```

---

## Agency

### Get Agency Statistics
```http
GET /api/agency/stats
```

**Authentication:** Required ✓  
**Agency Admin Role:** Required ✓

**Response:** Agency-specific statistics

---

### Get Agency Agents
```http
GET /api/agency/agents
```

**Authentication:** Required ✓  
**Agency Admin Role:** Required ✓

**Response:** Array of all agents in agency

---

### Send Agency Invitation
```http
POST /api/agency/invitations/send
```

**Authentication:** Required ✓  
**Agency Admin Role:** Required ✓

**Request Body:**
```json
{
  "email": "newagent@example.com",
  "name": "New Agent"
}
```

---

### Get Agency Invitations
```http
GET /api/agency/invitations
```

**Authentication:** Required ✓  
**Agency Admin Role:** Required ✓

**Response:** Array of pending invitations

---

### Cancel Invitation
```http
DELETE /api/agency/invitations/:invitationId
```

**Authentication:** Required ✓  
**Agency Admin Role:** Required ✓

**Path Parameters:**
- `invitationId` - Invitation ID

---

### Add Agent to Agency
```http
POST /api/agency/agents/add
```

**Authentication:** Required ✓  
**Agency Admin Role:** Required ✓

**Request Body:**
```json
{
  "userId": "user_id_to_add"
}
```

---

### Update Agent in Agency
```http
PUT /api/agency/agents/:userId
```

**Authentication:** Required ✓  
**Agency Admin Role:** Required ✓

**Path Parameters:**
- `userId` - Agent user ID

**Request Body:**
```json
{
  "agentPhone": "+1-555-987-6543",
  "agencyLicense": "NEW_LICENSE",
  "isAdmin": true
}
```

---

## Organized Trips

### Get Public Organized Trips
```http
GET /api/organized-trips/public
```

**Public Endpoint** ✓

**Query Parameters:**
- `destination` (optional) - Filter by destination
- `minPrice` (optional) - Minimum price
- `maxPrice` (optional) - Maximum price
- `tags` (optional) - Comma-separated tags
- `agencyName` (optional) - Filter by agency

**Response:** Array of public organized trips

---

### Get Organized Trip Details
```http
GET /api/organized-trips/:id
```

**Public Endpoint** ✓

**Path Parameters:**
- `id` - Trip ID

**Response:** Full trip details including itinerary and pricing

---

### Register for Trip
```http
POST /api/organized-trips/:id/register
```

**Public Endpoint** ✓

**Path Parameters:**
- `id` - Trip ID

**Request Body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "+1-555-123-4567",
  "message": "Interested in joining"
}
```

**Response:** Booking confirmation

---

### Get Participant Trips
```http
GET /api/organized-trips/participant/:email/trips
```

**Public Endpoint** ✓

**Path Parameters:**
- `email` - Participant email

**Response:** Array of trips where participant is registered

---

## Health Check

### API Health Status
```http
GET /api/health
```

**Public Endpoint** ✓

**Response:**
```json
{
  "status": "OK",
  "timestamp": "2024-05-15T10:30:00.000Z"
}
```

---

## Quick Reference

### Base URL
```
http://localhost:3001/api
```

### Authentication Header
```
Authorization: Bearer <JWT_TOKEN>
```

### CORS Configuration
- ✓ Allowed Origins: `http://localhost:5190`, `http://localhost:5191`, `http://localhost:5192`
- ✓ Credentials: Enabled
- ✓ Methods: GET, POST, PUT, DELETE, PATCH

### Common Status Codes
| Code | Meaning |
|------|---------|
| 200 | OK |
| 201 | Created |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 500 | Internal Server Error |

---

## Examples & Recipes

### Complete Trip Planning Flow
1. `POST /api/auth/login` - Authenticate user
2. `POST /api/trips` - Create a new trip
3. `GET /api/flights/search-route` - Search for flights
4. `GET /api/hotels/autocomplete` - Find hotels
5. `GET /api/hotels/details` - Get hotel information
6. `POST /api/budgets/:tripId` - Set budget for trip
7. `POST /api/chats` - Create chat to share trip
8. `PUT /api/trips/:id` - Update trip details

### Agent Package Setup Flow
1. `POST /api/agent/trips/create` - Create organized trip package
2. `PATCH /api/agent/trips/:id/visibility` - Set to public
3. `GET /api/organized-trips/public` - Browse as public
4. `POST /api/organized-trips/:id/register` - Register participants

### Finding Travel Deals
1. `POST /api/ai/get-real-prices` - Get current prices
2. `GET /api/quicket/items` - Browse marketplace items
3. `POST /api/places/nearby` - Find attractions nearby
4. `GET /api/weather` - Check weather forecast

---

**Last Updated:** April 2024  
**Documentation Version:** 1.0
