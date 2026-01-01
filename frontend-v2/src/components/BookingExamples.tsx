/**
 * HOW TO USE BOOKING BUTTONS WITH AFFILIATE LINKS
 *
 * This guide shows how to integrate Travelpayouts affiliate bookings
 * into your trip details page
 */

import React, { useState, useEffect } from 'react';
import BookingButton from '../components/BookingButton';
import {
  Card,
  CardContent,
  Typography,
  Stack,
  Box,
  CircularProgress,
  Alert,
} from '@mui/material';

// ============================================
// EXAMPLE 1: Display hotel with booking button
// ============================================

interface Hotel {
  name: string;
  price?: number;
  location?: string;
  bookingLink?: string;
  currency?: string;
  affiliate?: boolean;
}
function HotelCard({ hotel }: { hotel: Hotel }) {
  return (
    <Card>
      <CardContent>
        <Typography variant="h6">{hotel.name}</Typography>
        <Typography variant="body2" color="text.secondary">
          {hotel.location}
        </Typography>

        {/* Display price and booking button */}
        <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 2 }}>
          <BookingButton
            bookingLink={hotel.bookingLink}
            price={hotel.price}
            currency={hotel.currency || 'USD'}
            type="hotel"
            affiliate={hotel.affiliate}
            variant="button"
            size="medium"
          />
        </Stack>
      </CardContent>
    </Card>
  );
}

// ============================================
// EXAMPLE 2: Fetch real prices from backend
// ============================================

async function loadRealPrices(
  destination: string,
  checkIn: string,
  checkOut: string,
  origin: string
) {
  try {
    const response = await fetch('/api/ai/get-real-prices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        destination,
        checkIn,
        checkOut,
        origin,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to get real prices');
    }

    const data = await response.json();

    console.log('💰 Hotels with real prices:', data.hotels);
    console.log('✈️ Flights with real prices:', data.flights);

    // Each hotel/flight now has:
    // - price: number
    // - bookingLink: string (with affiliate tracking!)
    // - affiliate: true

    return data;
  } catch (error) {
    console.error('Error loading prices:', error);
    return null;
  }
}

// ============================================
// EXAMPLE 3: AI Trip Creation with Booking Links
// ============================================

async function createAITripWithBookings(): Promise<any> {
  // Step 1: Create trip with AI
  const aiResponse = await fetch('/api/ai/create-smart-trip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      trip: {
        destinations: ['Dubai'],
        startDate: '2025-03-01',
        endDate: '2025-03-05',
      },
      preferences: {
        interests: 'culture, food, sightseeing',
        pace: 'moderate',
      },
    }),
  });

  const aiData = await aiResponse.json();

  // Step 2: Get real prices for each activity
  for (const day of aiData.itinerary) {
    for (const activity of day.activities) {
      if (activity.type === 'hotel' && activity.placeId) {
        // Get real hotel prices
        const prices = await loadRealPrices(
          'Dubai',
          '2025-03-01',
          '2025-03-05'
        );

        // Match with AI suggestion
        activity.realPrice = prices?.hotels[0]?.price;
        activity.bookingLink = prices?.hotels[0]?.bookingLink;
        activity.affiliate = true;
      }
    }
  }

  return aiData;
}

// ============================================
// EXAMPLE 4: Complete Trip Display with Bookings
// ============================================

interface Trip {
  name: string;
  destinations: string[];
  startDate: string;
  endDate: string;
}
function TripDetailsWithBookings({ trip }: { trip: Trip }) {
  const [realPrices, setRealPrices] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);

  // Load real prices when component mounts
  useEffect(() => {
    async function fetchPrices() {
      setLoading(true);
      const prices = await loadRealPrices(
        trip.destinations[0],
        trip.startDate,
        trip.endDate,
        'TLV' // User's origin
      );
      setRealPrices(prices);
      setLoading(false);
    }

    if (trip.destinations && trip.startDate) {
      fetchPrices();
    }
  }, [trip]);

  return (
    <Box>
      <Typography variant="h4">{trip.name}</Typography>

      {/* Hotels Section */}
      <Typography variant="h5" sx={{ mt: 4 }}>
        Hotels
      </Typography>
      {loading && <CircularProgress />}

      {realPrices?.hotels.map((hotel: any, index: number) => (
        <Card key={index} sx={{ mb: 2 }}>
          <CardContent>
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
            >
              <Box>
                <Typography variant="h6">{hotel.name}</Typography>
                <Typography variant="body2" color="text.secondary">
                  ⭐ {hotel.rating} | {hotel.stars}★ Hotel
                </Typography>
                <Typography variant="body2">
                  ${hotel.pricePerNight}/night
                </Typography>
              </Box>

              {/* Book Now Button with Affiliate Link! */}
              <BookingButton
                bookingLink={hotel.bookingLink}
                price={hotel.price}
                currency={hotel.currency}
                type="hotel"
                affiliate={hotel.affiliate}
                variant="button"
                size="large"
              />
            </Stack>
          </CardContent>
        </Card>
      ))}

      {/* Flights Section */}
      <Typography variant="h5" sx={{ mt: 4 }}>
        Flights
      </Typography>
      {realPrices?.flights.map((flight: any, index: number) => (
        <Card key={index} sx={{ mb: 2 }}>
          <CardContent>
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
            >
              <Box>
                <Typography variant="h6">
                  {flight.departure?.airport} → {flight.arrival?.airport}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {flight.airline} {flight.flightNumber}
                </Typography>
                <Typography variant="body2">
                  {flight.stops === 0 ? 'Direct' : `${flight.stops} stops`}
                </Typography>
              </Box>

              {/* Book Flight Button */}
              <BookingButton
                bookingLink={flight.bookingLink}
                price={flight.price}
                currency={flight.currency}
                type="flight"
                affiliate={flight.affiliate}
                variant="button"
                size="large"
              />
            </Stack>
          </CardContent>
        </Card>
      ))}

      {/* Commission Info */}
      {realPrices && (
        <Alert severity="success" sx={{ mt: 2 }}>
          💰 You earn commission from every booking made through these links!
        </Alert>
      )}
    </Box>
  );
}

// ============================================
// EXAMPLE 5: Compact Display (Chip Variant)
// ============================================

function CompactHotelDisplay({ hotel }: { hotel: Hotel }) {
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Typography variant="body2">{hotel.name}</Typography>
      <BookingButton
        bookingLink={hotel.bookingLink}
        price={hotel.price}
        type="hotel"
        affiliate={true}
        variant="chip"
        size="small"
      />
    </Stack>
  );
}

export {
  HotelCard,
  loadRealPrices,
  createAITripWithBookings,
  TripDetailsWithBookings,
  CompactHotelDisplay,
};
