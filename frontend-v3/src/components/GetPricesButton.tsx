import { useState } from 'react';
import {
  Button,
  CircularProgress,
  Alert,
  Stack,
  Card,
  CardContent,
  Typography,
  Chip,
} from '@mui/material';
import {
  AttachMoney,
  Hotel as HotelIcon,
  Flight as FlightIcon,
} from '@mui/icons-material';
import BookingButton from './BookingButton';

interface GetPricesButtonProps {
  destination: string;
  checkIn: string;
  checkOut: string;
  origin?: string;
}

/**
 * GetPricesButton Component
 *
 * Shows a button that fetches real hotel and flight prices
 * Displays results with BookingButton for each item
 *
 * @example
 * <GetPricesButton
 *   destination="Dubai"
 *   checkIn="2025-03-01"
 *   checkOut="2025-03-05"
 *   origin="TLV"
 * />
 */
export default function GetPricesButton({
  destination,
  checkIn,
  checkOut,
  origin = 'TLV',
}: GetPricesButtonProps) {
  const [loading, setLoading] = useState(false);
  const [prices, setPrices] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchPrices = async () => {
    setLoading(true);
    setError(null);

    try {
      console.log('🔍 Fetching prices for:', {
        destination,
        checkIn,
        checkOut,
        origin,
      });

      const response = await fetch('/api/ai/get-real-prices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          destination,
          checkIn,
          checkOut,
          origin,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to get prices');
      }

      const data = await response.json();
      console.log('✅ Prices received:', data);
      setPrices(data);
    } catch (err) {
      console.error('❌ Error fetching prices:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch prices');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack spacing={2}>
      {/* Get Prices Button */}
      <Button
        variant="contained"
        color="success"
        size="large"
        onClick={fetchPrices}
        disabled={loading}
        startIcon={loading ? <CircularProgress size={20} /> : <AttachMoney />}
        sx={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          '&:hover': {
            background: 'linear-gradient(135deg, #764ba2 0%, #667eea 100%)',
          },
          fontWeight: 600,
        }}
      >
        {loading ? 'Getting Real Prices...' : '💰 Get Real Prices & Book'}
      </Button>

      {/* Error Message */}
      {error && (
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Results */}
      {prices && (
        <Stack spacing={3}>
          {/* Summary */}
          <Alert severity="success" icon={<AttachMoney />}>
            Found {prices.totalHotels} hotels and {prices.totalFlights} flights!
            {prices.averageHotelPrice &&
              ` Avg hotel: $${prices.averageHotelPrice}`}
            {prices.averageFlightPrice &&
              ` | Avg flight: $${prices.averageFlightPrice}`}
          </Alert>

          {/* Hotels */}
          {prices.hotels && prices.hotels.length > 0 && (
            <Stack spacing={2}>
              <Typography
                variant="h6"
                sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
              >
                <HotelIcon /> Hotels ({prices.hotels.length})
              </Typography>

              {prices.hotels.map((hotel: any, index: number) => (
                <Card key={index} variant="outlined">
                  <CardContent>
                    <Stack
                      direction="row"
                      justifyContent="space-between"
                      alignItems="center"
                    >
                      <Stack spacing={1}>
                        <Typography variant="h6">{hotel.name}</Typography>
                        <Stack direction="row" spacing={1} alignItems="center">
                          {hotel.stars && (
                            <Chip
                              label={`${hotel.stars}★`}
                              size="small"
                              color="warning"
                            />
                          )}
                          {hotel.rating && (
                            <Chip label={`⭐ ${hotel.rating}`} size="small" />
                          )}
                        </Stack>
                        <Typography variant="body2" color="text.secondary">
                          ${hotel.pricePerNight}/night | Total: ${hotel.price}
                        </Typography>
                        {hotel.location && (
                          <Typography variant="caption" color="text.secondary">
                            📍 {hotel.location}
                          </Typography>
                        )}
                      </Stack>

                      {/* Book Now Button */}
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
            </Stack>
          )}

          {/* Flights */}
          {prices.flights && prices.flights.length > 0 && (
            <Stack spacing={2}>
              <Typography
                variant="h6"
                sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
              >
                <FlightIcon /> Flights ({prices.flights.length})
              </Typography>

              {prices.flights.map((flight: any, index: number) => (
                <Card key={index} variant="outlined">
                  <CardContent>
                    <Stack
                      direction="row"
                      justifyContent="space-between"
                      alignItems="center"
                    >
                      <Stack spacing={1}>
                        <Typography variant="h6">
                          {flight.departure?.airport} →{' '}
                          {flight.arrival?.airport}
                        </Typography>
                        <Typography variant="body2">
                          {flight.airline} {flight.flightNumber}
                        </Typography>
                        <Stack direction="row" spacing={1}>
                          <Chip
                            label={
                              flight.stops === 0
                                ? 'Direct'
                                : `${flight.stops} stops`
                            }
                            size="small"
                            color={flight.stops === 0 ? 'success' : 'default'}
                          />
                          {flight.duration && (
                            <Chip label={flight.duration} size="small" />
                          )}
                        </Stack>
                        <Typography variant="body2" color="text.secondary">
                          📅 {flight.departure?.date}
                        </Typography>
                      </Stack>

                      {/* Book Now Button */}
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
            </Stack>
          )}

          {/* Commission Notice */}
          {prices.affiliate && (
            <Alert severity="info" icon={<AttachMoney />}>
              💰 You earn commission from every booking made through these
              links!
            </Alert>
          )}
        </Stack>
      )}
    </Stack>
  );
}
