# 💰 Pricing System - MeetLoca

## Overview

Unified pricing system for hotels and flights with affiliate tracking.

## Current Status

### ✅ Working

- **Hotels (RapidAPI Booking.com)**: Real prices, 5 hotels or specific hotel
- **City Detection**: Smart city extraction from addresses
- **Affiliate Links**: Booking.com with tracking
- **Frontend UI**: "Get Real Prices" buttons in Add Hotel/Flight forms

### ❌ Issues to Fix

1. **Flights API**: Travelpayouts returns wrong destinations (VNO instead of LON)
2. **Inconsistent Search**: Different logic in different places
3. **No Trip-Level Pricing**: Can't calculate total trip cost

## Proposed Solution

### 1. Unified API Endpoint

```
POST /api/ai/get-prices
{
  "type": "hotel" | "flight" | "trip",
  "hotel": {
    "cityName": "London",
    "hotelName": "Hilton" (optional),
    "checkIn": "2025-12-28",
    "checkOut": "2026-01-01"
  },
  "flight": {
    "origin": "TLV",
    "destination": "LHR",
    "departDate": "2025-12-28",
    "returnDate": "2026-01-01" (optional)
  }
}
```

### 2. Response Format

```json
{
  "hotels": [
    {
      "id": "123",
      "name": "Hilton London",
      "stars": 4,
      "price": 450,
      "pricePerNight": 112,
      "rating": 8.5,
      "bookingLink": "https://booking.com/...?aid=2371057&label=meetloca"
    }
  ],
  "flights": [
    {
      "id": "456",
      "airline": "British Airways",
      "price": 350,
      "departure": {...},
      "arrival": {...},
      "bookingLink": "https://skyscanner.com/...?affiliate=meetloca"
    }
  ],
  "totals": {
    "hotels": 450,
    "flights": 350,
    "total": 800,
    "currency": "USD"
  }
}
```

### 3. APIs to Use

#### Hotels (Current - Working ✅)

- **RapidAPI Booking.com**: Real-time prices
- **Affiliate**: Booking.com (aid=2371057)

#### Flights (Need to Replace ❌)

Options:

1. **RapidAPI Skyscanner**: Better results than Travelpayouts
2. **Kiwi.com API**: Good affiliate program
3. **Affiliate Links Only**: Skip prices, just show booking links

### 4. Implementation Steps

#### Phase 1: Fix Flights (Now)

- [ ] Remove Travelpayouts flights (not working)
- [ ] Add RapidAPI Skyscanner OR
- [ ] Just show "Search Flights" link to Skyscanner with affiliate

#### Phase 2: Centralize Logic

- [ ] Create `/api/pricing` endpoint
- [ ] Move all price fetching to one service
- [ ] Consistent frontend component

#### Phase 3: Trip-Level Pricing

- [ ] Calculate total trip cost
- [ ] Show breakdown: hotels + flights + activities
- [ ] Budget vs actual comparison

## Decision Needed

### Flights Strategy:

**Option A**: RapidAPI Skyscanner (costs money but works)
**Option B**: Affiliate link only (free but no prices shown)
**Option C**: Different API (Kiwi, Amadeus, etc.)

### Recommendation: **Option B** (Short term)

- Show "Search Flights" button
- Opens Skyscanner/Booking.com with affiliate
- User sees prices there, we get commission
- Same as hotels approach

## Files to Update

### Backend

- `backend/routes/ai.js` - Simplify get-real-prices
- `backend/services/rapidApiFlights.js` - New service (if Option A)
- Remove `backend/services/travelpayouts.js` flights code

### Frontend

- `frontend-v2/src/components/AddItemForms.tsx` - Unified price display
- `frontend-v2/src/components/GetPricesButton.tsx` - Reusable component
- `frontend-v2/src/pages/TripDetails.tsx` - Total trip pricing

## Next Actions

1. **Decision**: Which flights strategy?
2. **Implement**: Based on decision
3. **Test**: Full user flow
4. **Deploy**: Production

---

_Last Updated: 2025-12-21_
