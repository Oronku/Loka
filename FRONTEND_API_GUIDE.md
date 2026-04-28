# Loka Frontend API Integration Guide

A quick reference guide for integrating with the Loka backend API.

---

## Quick Start

### 1. Setup Base Configuration

```javascript
// src/services/api.ts (or similar)
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

const api = {
  async request(endpoint, options = {}) {
    const token = localStorage.getItem('authToken');
    const headers = {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` }),
      ...options.headers,
    };

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      if (response.status === 401) {
        // Handle token expiration
        localStorage.removeItem('authToken');
        window.location.href = '/login';
      }
      throw new Error(`API Error: ${response.status}`);
    }

    return response.json();
  },

  get(endpoint) {
    return this.request(endpoint, { method: 'GET' });
  },

  post(endpoint, body) {
    return this.request(endpoint, { method: 'POST', body: JSON.stringify(body) });
  },

  put(endpoint, body) {
    return this.request(endpoint, { method: 'PUT', body: JSON.stringify(body) });
  },

  delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  },
};

export default api;
```

---

## Common Workflows

### Authentication Flow

```javascript
// Login and store token
async function login(email, password) {
  const response = await api.post('/auth/login', { email, password });
  localStorage.setItem('authToken', response.token);
  localStorage.setItem('user', JSON.stringify(response));
  return response;
}

// Logout
function logout() {
  localStorage.removeItem('authToken');
  localStorage.removeItem('user');
}

// Get current user
async function getCurrentUser() {
  return api.get('/auth/profile');
}

// Register
async function register(email, password, name) {
  const response = await api.post('/auth/register', { email, password, name });
  localStorage.setItem('authToken', response.token);
  return response;
}
```

### Trip Management

```javascript
// Create a new trip
async function createTrip(tripData) {
  // tripData: { name, startDate, endDate, destination, color }
  return api.post('/trips', tripData);
}

// Get all user trips
async function getUserTrips() {
  return api.get('/trips');
}

// Get single trip details
async function getTripDetails(tripId) {
  return api.get(`/trips/${tripId}`);
}

// Update trip
async function updateTrip(tripId, updates) {
  return api.put(`/trips/${tripId}`, updates);
}

// Delete trip
async function deleteTrip(tripId) {
  return api.delete(`/trips/${tripId}`);
}

// Update trip checklist
async function updateTripChecklist(tripId, checklist) {
  return api.put(`/trips/${tripId}/checklist`, { checklist });
}

// Share trip with friends
async function shareTrip(tripId) {
  return api.post(`/trips/${tripId}/share`, {});
}
```

### Hotel Search

```javascript
// Search hotels by name
async function searchHotels(input) {
  if (input.length < 2) return [];
  return api.get(`/hotels/autocomplete?input=${encodeURIComponent(input)}`);
}

// Get hotel details
async function getHotelDetails(placeId) {
  return api.get(`/hotels/details?place_id=${placeId}`);
}

// Calculate distance to airport
async function getDistanceToAirport(hotelPlaceId, airportCode) {
  return api.get(
    `/hotels/distance-from-airport?hotel_place_id=${hotelPlaceId}&airport_code=${airportCode}`
  );
}
```

### Flight Search

```javascript
// Search flights
async function searchFlights(from, to, date, options = {}) {
  const params = new URLSearchParams({
    from,
    to,
    ...(date && { date }),
    ...options, // directOnly, airline, etc
  });
  return api.get(`/flights/search-route?${params}`);
}

// Get real flight data by flight number
async function getFlightData(flightNumber, date) {
  return api.get(`/flights/search/${flightNumber}?date=${date}`);
}

// Search airports
async function searchAirports(query) {
  if (query.length < 2) return [];
  return api.get(`/flights/airports/search?query=${encodeURIComponent(query)}`);
}
```

### Places & Attractions

```javascript
// Search attractions
async function searchPlaces(input, types) {
  const params = new URLSearchParams({ input });
  if (types) params.append('types', types);
  return api.get(`/places/autocomplete?${params}`);
}

// Get place details
async function getPlaceDetails(placeId) {
  return api.get(`/places/details?place_id=${placeId}`);
}

// Find nearby attractions
async function findNearby(lat, lng, radius = 1000, type) {
  const params = new URLSearchParams({ lat, lng, radius });
  if (type) params.append('type', type);
  return api.get(`/places/nearby?${params}`);
}

// Search by category
async function searchByCategory(lat, lng, category, radius = 1000) {
  return api.get(
    `/places/search-by-category?lat=${lat}&lng=${lng}&category=${category}&radius=${radius}`
  );
}
```

### Messaging & Chat

```javascript
// Create a chat
async function createChat(contextType, contextId, participants) {
  return api.post('/chats', { contextType, contextId, participants });
}

// Get user chats
async function getUserChats(contextType = null) {
  const params = new URLSearchParams();
  if (contextType) params.append('contextType', contextType);
  return api.get(`/chats?${params}`);
}

// Get chat messages
async function getChatMessages(chatId, limit = 50, before = null) {
  const params = new URLSearchParams({ limit });
  if (before) params.append('before', before);
  return api.get(`/chats/${chatId}/messages?${params}`);
}

// Send message
async function sendMessage(chatId, text, attachments = []) {
  return api.post(`/chats/${chatId}/messages`, { text, attachments });
}

// Mark messages as read
async function markAsRead(chatId, messageIds) {
  return api.put(`/chats/${chatId}/read`, { messageIds });
}
```

### Friends

```javascript
// Get friends list
async function getFriends() {
  return api.get('/friends');
}

// Search for users
async function searchUsers(query) {
  if (query.length < 2) return [];
  return api.get(`/friends/search?query=${encodeURIComponent(query)}`);
}

// Send friend request
async function sendFriendRequest(receiverId) {
  return api.post('/friends/request', { receiverId });
}

// Get pending friend requests
async function getFriendRequests() {
  return api.get('/friends/requests');
}
```

### Quicket Marketplace

```javascript
// Search quicket items
async function searchQuicketItems(filters = {}) {
  const params = new URLSearchParams(filters);
  return api.get(`/quicket/items?${params}`);
}

// Get item details
async function getQuicketItem(itemId) {
  return api.get(`/quicket/items/${itemId}`);
}

// Create quicket item
async function createQuicketItem(itemData) {
  // itemData: { type, title, description, priceSelling, currency, destination, images }
  return api.post('/quicket/items', itemData);
}

// Update item
async function updateQuicketItem(itemId, updates) {
  return api.put(`/quicket/items/${itemId}`, updates);
}

// Delete item
async function deleteQuicketItem(itemId) {
  return api.delete(`/quicket/items/${itemId}`);
}

// Like item
async function likeQuicketItem(itemId, likeType = 'save') {
  return api.post(`/quicket/items/${itemId}/like`, { likeType });
}

// Unlike item
async function unlikeQuicketItem(itemId) {
  return api.post(`/quicket/items/${itemId}/dislike`, {});
}
```

### Budgets

```javascript
// Get trip budget
async function getTripBudget(tripId) {
  return api.get(`/budgets/${tripId}`);
}

// Create budget
async function createBudget(tripId, totalBudget, currency, categories = {}) {
  return api.post(`/budgets/${tripId}`, { totalBudget, currency, categories });
}

// Update budget
async function updateBudget(tripId, updates) {
  return api.put(`/budgets/${tripId}`, updates);
}

// Delete budget
async function deleteBudget(tripId) {
  return api.delete(`/budgets/${tripId}`);
}
```

### Weather

```javascript
// Get weather forecast
async function getWeatherForecast(city, date) {
  return api.get(`/weather?city=${encodeURIComponent(city)}&date=${date}`);
}
```

### AI Assistance

```javascript
// Get real prices (public - no auth needed)
async function getRealPrices(destination, hotelName, checkIn, checkOut, origin) {
  return fetch(`${API_BASE_URL}/ai/get-real-prices`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ destination, hotelName, checkIn, checkOut, origin }),
  }).then(r => r.json());
}

// Chat with AI assistant
async function chatWithAI(message, context = {}) {
  return api.post('/ai/message', { message, context });
}

// Execute AI action
async function executeAIAction(actionType, actionData) {
  return api.post('/ai/action', { actionType, actionData });
}
```

### Organized Trips (Public)

```javascript
// Get public organized trips
async function getPublicTrips(filters = {}) {
  const params = new URLSearchParams(filters);
  return fetch(`${API_BASE_URL}/organized-trips/public?${params}`)
    .then(r => r.json());
}

// Get trip details (public)
async function getPublicTripDetails(tripId) {
  return fetch(`${API_BASE_URL}/organized-trips/${tripId}`)
    .then(r => r.json());
}

// Register for organized trip (public)
async function registerForOrganizedTrip(tripId, name, email, phone, message = '') {
  return fetch(`${API_BASE_URL}/organized-trips/${tripId}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, phone, message }),
  }).then(r => r.json());
}

// Get trips for participant
async function getParticipantTrips(email) {
  return fetch(`${API_BASE_URL}/organized-trips/participant/${email}/trips`)
    .then(r => r.json());
}
```

### Rides

```javascript
// Calculate distance
async function calculateDistance(from, to, mode = 'driving') {
  return api.get(
    `/rides/distance?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&mode=${mode}`
  );
}

// Calculate route
async function calculateRoute(origin, destination) {
  return api.post('/rides/calculate-route', { origin, destination });
}

// Get location autocomplete
async function getLocationAutocomplete(input) {
  if (input.length < 2) return [];
  return api.get(`/rides/location-autocomplete?input=${encodeURIComponent(input)}`);
}

// Get location details
async function getLocationDetails(placeId) {
  return api.get(`/rides/location-details?place_id=${placeId}`);
}

// Get ride estimates
async function getRideEstimates(pickup, dropoff, modes = []) {
  return api.post('/rides/estimate', { pickup, dropoff, modes });
}

// Smart checkout time
async function getSmartCheckoutTime(hotelAddress, airportCode, flightDepartureTime) {
  return api.post('/rides/smart-checkout', {
    hotelAddress,
    airportCode,
    flightDepartureTime,
  });
}
```

---

## Error Handling

```javascript
// Standard error handler
async function handleApiCall(promise) {
  try {
    return await promise;
  } catch (error) {
    if (error.message.includes('401')) {
      // Handle unauthorized
      logout();
      window.location.href = '/login';
    } else if (error.message.includes('403')) {
      // Handle forbidden
      console.error('Access denied');
    } else if (error.message.includes('404')) {
      // Handle not found
      console.error('Resource not found');
    } else {
      // Handle generic error
      console.error('API error:', error);
    }
    throw error;
  }
}

// Usage in components
try {
  const trips = await handleApiCall(getUserTrips());
} catch (error) {
  setError('Failed to load trips');
}
```

---

## React Hook Examples

### useApi Hook

```javascript
// hooks/useApi.ts
import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';

export function useApi(fetchFn, dependencies = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchFn();
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [...dependencies]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { data, loading, error, refetch: fetch };
}

// Usage in component
function TripsList() {
  const { data: trips, loading, error } = useApi(() => api.get('/trips'));

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <ul>
      {trips?.map(trip => (
        <li key={trip._id}>{trip.name}</li>
      ))}
    </ul>
  );
}
```

---

## Environment Variables

Create `.env.local` file in your frontend root:

```env
REACT_APP_API_URL=http://localhost:3001/api
REACT_APP_GOOGLE_MAPS_API_KEY=your_google_maps_key
REACT_APP_GOOGLE_FLIGHT_API_KEY=your_google_flights_key
```

---

## Testing API Calls

### Using cURL

```bash
# Login
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}'

# Get trips (with token)
curl -X GET http://localhost:3001/api/trips \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Create trip
curl -X POST http://localhost:3001/api/trips \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"name":"Paris Trip","startDate":"2024-06-01","endDate":"2024-06-10","destination":"Paris"}'
```

### Using Postman

1. Import the OpenAPI spec: `openapi.yaml`
2. Set up environment variable: `{{baseUrl}}`
3. Create a "Login" request to `/auth/login` and save the token
4. Use {{token}} in Authorization header for other requests

---

## Response Examples

### Success Response
```json
{
  "data": { /* response data */ },
  "message": "Success"
}
```

### Error Response
```json
{
  "error": "Bad Request",
  "message": "Invalid email format"
}
```

---

## Common Status Codes

| Code | Meaning | Action |
|------|---------|--------|
| 200 | OK | Success |
| 201 | Created | Resource created successfully |
| 400 | Bad Request | Check input data |
| 401 | Unauthorized | Login required or token expired |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource doesn't exist |
| 500 | Server Error | Contact support |

---

## Performance Tips

1. **Debounce search queries**
   ```javascript
   import { debounce } from 'lodash';
   
   const debouncedSearch = debounce(async (query) => {
     const results = await searchPlaces(query);
   }, 500);
   ```

2. **Pagination for lists**
   ```javascript
   // Load initial data
   const trips = await api.get('/trips?page=1&limit=20');
   
   // Load more on scroll
   const nextPage = await api.get('/trips?page=2&limit=20');
   ```

3. **Cache API responses**
   ```javascript
   const cache = new Map();
   
   async function getCachedData(key, fetchFn) {
     if (cache.has(key)) return cache.get(key);
     const data = await fetchFn();
     cache.set(key, data);
     return data;
   }
   ```

4. **Request cancellation**
   ```javascript
   const controller = new AbortController();
   
   api.get('/trips', { signal: controller.signal });
   
   // Cancel on cleanup
   controller.abort();
   ```

---

## Troubleshooting

### CORS Errors
- Ensure backend is running on `http://localhost:3001`
- Check that your frontend origin is whitelisted
- Verify `credentials: true` is set in fetch options

### 401 Unauthorized
- Token may have expired
- Check token is being stored correctly in localStorage
- Verify token is included in Authorization header

### 404 Not Found
- Check endpoint path spelling
- Verify resource IDs are correct
- Ensure resource hasn't been deleted

### Slow Requests
- Check network tab in DevTools
- Use pagination for large datasets
- Consider caching frequently accessed data

---

**Last Updated:** April 2024  
**API Version:** 1.0
