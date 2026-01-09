import { useEffect, useState } from 'react';
import SearchAutocomplete from './SearchAutocomplete';
import PDFUploadButton from './PDFUploadButton';
import BookingButton from './BookingButton';
import type { Trip } from '../types/domain';
import {
  TextField,
  Button,
  Stack,
  Alert,
  FormControlLabel,
  Checkbox,
  CircularProgress,
  Grid,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Box,
  Paper,
  Divider,
  Typography,
  Card,
  CardContent,
  Chip,
  Tabs,
  Tab,
} from '@mui/material';
import { DirectionsCar } from '@mui/icons-material';
import {
  addFlightToTrip,
  addHotelToTrip,
  addRideToTrip,
  addAttractionToTrip,
  searchFlightByNumber,
  searchFlightsByRoute,
  searchAirports,
  hotelAutocomplete,
  hotelDetails,
  rideDistance,
  placesAutocomplete,
  placeDetails,
} from '../services/api';

/**
 * Parse and format a datetime string while preserving the original timezone.
 * Handles formats like "2025-11-13 10:20+04:00" or "2025-11-13T10:20:00+04:00"
 * Returns the time and date in the original timezone, not converted to user's local time.
 */
function formatDateTimeLocal(dateTimeStr: string): {
  date: string;
  time: string;
  full: string;
} {
  if (!dateTimeStr) return { date: '', time: '', full: '' };

  // Handle both ISO format (2025-11-13T10:20:00+04:00) and space format (2025-11-13 10:20+04:00)
  const parts = dateTimeStr.includes('T')
    ? dateTimeStr.split('T')
    : dateTimeStr.split(' ');

  const datePart = parts[0]; // "2025-11-13"
  const timePart = parts[1]?.split(/[+-]/)[0] || ''; // "10:20:00" or "10:20"
  const timeOnly = timePart.slice(0, 5); // "10:20"

  // Format full datetime for display (date + time, no timezone conversion)
  const monthNames = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const [year, month, day] = datePart.split('-');
  const formattedDate = `${monthNames[parseInt(month) - 1]} ${parseInt(day)}, ${year}`;
  const formattedTime = timeOnly;

  return {
    date: datePart,
    time: timeOnly,
    full: `${formattedDate} ${formattedTime}`,
  };
}

export function AddFlightForm({
  tripId,
  onUpdated,
  onDone,
}: {
  tripId: string;
  onUpdated: (t: Trip) => void;
  onDone?: () => void;
}) {
  const [mode, setMode] = useState<'search' | 'route' | 'manual'>('search');
  const [flightNumber, setFlightNumber] = useState('');
  const [date, setDate] = useState('');
  const [flightData, setFlightData] = useState<any | null>(null);

  // Route search fields
  const [origin, setOrigin] = useState<any | null>(null);
  const [destination, setDestination] = useState<any | null>(null);
  const [routeFlights, setRouteFlights] = useState<any[]>([]);
  const [selectedFlight, setSelectedFlight] = useState<any | null>(null);

  // Manual entry fields
  const [airline, setAirline] = useState('');
  const [departureAirport, setDepartureAirport] = useState('');
  const [arrivalAirport, setArrivalAirport] = useState('');
  const [departureTime, setDepartureTime] = useState('');
  const [arrivalTime, setArrivalTime] = useState('');

  // User inputs
  const [cost, setCost] = useState<string>('');
  const [numberOfTickets, setNumberOfTickets] = useState<string>('');
  const [costType, setCostType] = useState<'per-ticket' | 'total'>('total');
  const [carryOn, setCarryOn] = useState(false);
  const [checked, setChecked] = useState(false);
  const [bookingNumber, setBookingNumber] = useState('');
  const [bookingAgency, setBookingAgency] = useState('');

  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Real prices from affiliate API
  const [realPrices, setRealPrices] = useState<any>(null);
  const [loadingPrices, setLoadingPrices] = useState(false);

  async function searchFlight() {
    if (!flightNumber.trim() || !date) return;
    setErr(null);
    setSearching(true);
    setFlightData(null);
    try {
      const data = await searchFlightByNumber(flightNumber.trim(), date);
      setFlightData(data);
    } catch (e: any) {
      setErr(e?.response?.data?.message || e.message);
      setFlightData(null);
    } finally {
      setSearching(false);
    }
  }

  async function searchRoute() {
    if (!origin?.code || !destination?.code || !date) return;
    setErr(null);
    setSearching(true);
    setRouteFlights([]);
    setSelectedFlight(null);
    try {
      const data = await searchFlightsByRoute(
        origin.code,
        destination.code,
        date
      );
      setRouteFlights(data.flights || []);
    } catch (e: any) {
      setErr(e?.response?.data?.message || e.message);
      setRouteFlights([]);
    } finally {
      setSearching(false);
    }
  }

  // Fetch real prices from Travelpayouts API
  async function fetchRealPrices() {
    const flight = flightData || selectedFlight;
    if (!flight) return;

    const originCode = flight.departureAirportCode || flight.departure?.iata;
    const destCode = flight.arrivalAirportCode || flight.arrival?.iata;

    if (!originCode || !destCode || !date) return;

    setLoadingPrices(true);
    setRealPrices(null);
    try {
      const response = await fetch(
        'http://localhost:3001/api/ai/get-real-prices',
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            origin: originCode,
            destination: destCode,
            checkIn: date,
            checkOut: date, // Same day for flights
          }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        setRealPrices(data);
      }
    } catch (e: any) {
      console.error('Failed to fetch real prices:', e);
    } finally {
      setLoadingPrices(false);
    }
  }

  async function saveFlight() {
    setErr(null);
    setBusy(true);
    try {
      let segment: any;

      if (mode === 'search' && flightData) {
        // Save from API search by flight number
        segment = {
          airline: flightData.airline,
          flightNumber: flightData.flightNumber || flightNumber.trim(),
          departureAirportCode: flightData.departureAirportCode,
          arrivalAirportCode: flightData.arrivalAirportCode,
          departureDateTime: flightData.departureDateTime,
          arrivalDateTime: flightData.arrivalDateTime,
          durationMinutes: flightData.durationMinutes,
          aircraftType: flightData.aircraftType,
          terminal: flightData.terminal,
          gate: flightData.gate,
          cost: cost ? Number(cost) : undefined,
          numberOfTickets: numberOfTickets
            ? Number(numberOfTickets)
            : undefined,
          costType: costType,
          carryOn,
          checkedBag: checked,
          bookingNumber: bookingNumber || undefined,
          bookingAgency: bookingAgency || undefined,
        };
      } else if (mode === 'route' && selectedFlight) {
        // Save from route search - transform nested structure to flat
        segment = {
          airline: selectedFlight.airline,
          flightNumber: selectedFlight.flightNumber,
          departureAirportCode:
            selectedFlight.departure?.iata ||
            selectedFlight.departureAirportCode,
          arrivalAirportCode:
            selectedFlight.arrival?.iata || selectedFlight.arrivalAirportCode,
          departureDateTime:
            selectedFlight.departure?.scheduled ||
            selectedFlight.departureDateTime,
          arrivalDateTime:
            selectedFlight.arrival?.scheduled || selectedFlight.arrivalDateTime,
          durationMinutes: selectedFlight.durationMinutes,
          aircraftType: selectedFlight.aircraft || selectedFlight.aircraftType,
          terminal: {
            departure: selectedFlight.departure?.terminal,
            arrival: selectedFlight.arrival?.terminal,
          },
          gate: selectedFlight.gate,
          cost: cost ? Number(cost) : undefined,
          numberOfTickets: numberOfTickets
            ? Number(numberOfTickets)
            : undefined,
          costType: costType,
          carryOn,
          checkedBag: checked,
          bookingNumber: bookingNumber || undefined,
          bookingAgency: bookingAgency || undefined,
        };
      } else {
        // Save manual entry
        const depDateTime =
          date && departureTime ? `${date}T${departureTime}` : date;
        const arrDateTime =
          date && arrivalTime ? `${date}T${arrivalTime}` : date;

        segment = {
          airline: airline || 'Unknown',
          flightNumber: flightNumber.trim(),
          departureAirportCode: departureAirport.toUpperCase(),
          arrivalAirportCode: arrivalAirport.toUpperCase(),
          departureDateTime: depDateTime,
          arrivalDateTime: arrDateTime,
          cost: cost ? Number(cost) : undefined,
          numberOfTickets: numberOfTickets
            ? Number(numberOfTickets)
            : undefined,
          costType: costType,
          carryOn,
          checkedBag: checked,
          bookingNumber: bookingNumber || undefined,
          bookingAgency: bookingAgency || undefined,
        };
      }

      const updated = await addFlightToTrip(tripId, segment);
      onUpdated(updated);

      // Reset form
      setFlightNumber('');
      setDate('');
      setFlightData(null);
      setOrigin(null);
      setDestination(null);
      setRouteFlights([]);
      setSelectedFlight(null);
      setAirline('');
      setDepartureAirport('');
      setArrivalAirport('');
      setDepartureTime('');
      setArrivalTime('');
      setCost('');
      setNumberOfTickets('');
      setCostType('total');
      setCarryOn(false);
      setChecked(false);
      setBookingNumber('');
      setBookingAgency('');
      setMode('search');
      onDone?.();
    } catch (e: any) {
      setErr(e?.response?.data?.message || e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box>
      {err && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {err}
        </Alert>
      )}

      {/* PDF Upload */}
      <Card sx={{ mb: 3, bgcolor: 'info.50' }}>
        <CardContent>
          <Typography variant="subtitle2" gutterBottom>
            📄 Quick Import from PDF
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            display="block"
            mb={2}
          >
            Upload your flight ticket PDF to automatically fill in details
          </Typography>
          <PDFUploadButton
            acceptedType="flight"
            onDataExtracted={(data) => {
              // Auto-fill manual form with extracted data
              setMode('manual');
              if (data.type === 'flight') {
                setAirline(data.airline || '');
                setFlightNumber(data.flightNumber || '');
                setDepartureAirport(data.departureAirportCode || '');
                setArrivalAirport(data.arrivalAirportCode || '');
                setDate(data.departureDateTime?.split(' ')[0] || '');
                setDepartureTime(
                  data.departureDateTime?.split(' ')[1]?.slice(0, 5) || ''
                );
                setArrivalTime(
                  data.arrivalDateTime?.split(' ')[1]?.slice(0, 5) || ''
                );
                if (data.bookingNumber) {
                  setBookingNumber(data.bookingNumber);
                }
              }
            }}
          />
        </CardContent>
      </Card>

      {/* Mode Selector */}
      <Card sx={{ mb: 3 }}>
        <Tabs
          value={mode}
          onChange={(_, v) => {
            setMode(v);
            setFlightData(null);
            setRouteFlights([]);
            setSelectedFlight(null);
            setErr(null);
          }}
          variant="fullWidth"
        >
          <Tab value="search" label="By Flight Number" />
          <Tab value="route" label="By Route" />
          <Tab value="manual" label="Manual Entry" />
        </Tabs>
      </Card>

      {/* Search Mode */}
      {mode === 'search' && (
        <>
          <Card variant="outlined" sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="subtitle1" gutterBottom fontWeight="bold">
                Search Flight
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Flight Number"
                    placeholder="e.g. IZ603, LY315, BA123"
                    value={flightNumber}
                    onChange={(e) => setFlightNumber(e.target.value)}
                    required
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    type="date"
                    label="Flight Date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    required
                  />
                </Grid>
              </Grid>
              <Stack direction="row" spacing={2} mt={2}>
                <Button
                  variant="contained"
                  disabled={!flightNumber.trim() || !date || searching}
                  onClick={searchFlight}
                  endIcon={searching && <CircularProgress size={20} />}
                >
                  {searching ? 'Searching…' : 'Search Flight'}
                </Button>
                {!flightData && (
                  <Button variant="outlined" onClick={() => setMode('manual')}>
                    Can't find flight? Add manually
                  </Button>
                )}
              </Stack>
            </CardContent>
          </Card>
        </>
      )}

      {/* Route Search Mode */}
      {mode === 'route' && (
        <>
          <Card variant="outlined" sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="subtitle1" gutterBottom fontWeight="bold">
                Search Flights by Route
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={4}>
                  <SearchAutocomplete
                    label="Origin Airport"
                    placeholder="e.g. TLV, JFK, LHR"
                    minChars={2}
                    value={origin}
                    fetchOptions={async (q: string) => {
                      const result = await searchAirports(q);
                      return result.airports || [];
                    }}
                    getOptionLabel={(airport: any) =>
                      `${airport.code} - ${airport.name}`
                    }
                    onSelect={(airport: any) => setOrigin(airport)}
                    isOptionEqualToValue={(option: any, value: any) =>
                      option.code === value.code
                    }
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <SearchAutocomplete
                    label="Destination Airport"
                    placeholder="e.g. DXB, LAX, CDG"
                    minChars={2}
                    value={destination}
                    fetchOptions={async (q: string) => {
                      const result = await searchAirports(q);
                      return result.airports || [];
                    }}
                    getOptionLabel={(airport: any) =>
                      `${airport.code} - ${airport.name}`
                    }
                    onSelect={(airport: any) => setDestination(airport)}
                    isOptionEqualToValue={(option: any, value: any) =>
                      option.code === value.code
                    }
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField
                    fullWidth
                    type="date"
                    label="Flight Date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    required
                  />
                </Grid>
              </Grid>
              <Button
                variant="contained"
                disabled={
                  !origin?.code || !destination?.code || !date || searching
                }
                onClick={searchRoute}
                endIcon={searching && <CircularProgress size={20} />}
                sx={{ mt: 2 }}
              >
                {searching ? 'Searching…' : 'Search Flights'}
              </Button>
            </CardContent>
          </Card>

          {/* Flight List Results */}
          {routeFlights.length > 0 && (
            <Card variant="outlined" sx={{ mb: 3 }}>
              <CardContent>
                <Typography variant="subtitle1" gutterBottom fontWeight="bold">
                  Available Flights ({routeFlights.length})
                </Typography>
                <Stack spacing={2}>
                  {routeFlights.map((flight, idx) => (
                    <Paper
                      key={idx}
                      variant="outlined"
                      sx={{
                        p: 2,
                        cursor: 'pointer',
                        border: selectedFlight === flight ? 2 : 1,
                        borderColor:
                          selectedFlight === flight
                            ? 'primary.main'
                            : 'divider',
                        bgcolor:
                          selectedFlight === flight
                            ? 'primary.50'
                            : 'background.paper',
                        '&:hover': { bgcolor: 'action.hover' },
                      }}
                      onClick={() => setSelectedFlight(flight)}
                    >
                      <Stack
                        direction="row"
                        justifyContent="space-between"
                        alignItems="center"
                      >
                        <Box>
                          <Typography variant="subtitle2" fontWeight="bold">
                            {flight.airline} - {flight.flightNumber}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {flight.departure?.iata ||
                              flight.departureAirportCode}{' '}
                            →{' '}
                            {flight.arrival?.iata || flight.arrivalAirportCode}
                          </Typography>
                        </Box>
                        <Box textAlign="right">
                          <Typography variant="body2">
                            {(() => {
                              const depDateTime =
                                flight.departure?.scheduled ||
                                flight.departureDateTime;
                              const arrDateTime =
                                flight.arrival?.scheduled ||
                                flight.arrivalDateTime;
                              const depTime = depDateTime
                                ? formatDateTimeLocal(depDateTime).time
                                : '--:--';
                              const arrTime = arrDateTime
                                ? formatDateTimeLocal(arrDateTime).time
                                : '--:--';
                              return `${depTime} - ${arrTime}`;
                            })()}
                          </Typography>
                          {flight.durationMinutes && (
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              {Math.floor(flight.durationMinutes / 60)}h{' '}
                              {flight.durationMinutes % 60}m
                            </Typography>
                          )}
                        </Box>
                      </Stack>
                      <Stack direction="row" spacing={1} mt={1}>
                        {(flight.stops === 0 || !flight.stops) && (
                          <Chip label="Direct" color="success" size="small" />
                        )}
                        {(flight.aircraft || flight.aircraftType) && (
                          <Chip
                            label={flight.aircraft || flight.aircraftType}
                            size="small"
                          />
                        )}
                      </Stack>
                    </Paper>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          )}

          {routeFlights.length === 0 &&
            !searching &&
            date &&
            origin &&
            destination && (
              <Alert severity="info" sx={{ mb: 3 }}>
                No flights found for this route. Try searching by flight number
                or add manually.
              </Alert>
            )}
        </>
      )}

      {/* Manual Mode */}
      {mode === 'manual' && (
        <>
          <Alert severity="success" icon="✈️" sx={{ mb: 3 }}>
            <Typography variant="body2" fontWeight="bold">
              Add Flight You've Already Booked
            </Typography>
            <Typography variant="caption">
              Use this form to add flights you've already purchased. Enter the
              details from your ticket.
            </Typography>
          </Alert>

          <Card variant="outlined" sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="subtitle1" gutterBottom fontWeight="bold">
                Enter Flight Details Manually
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Flight Number"
                    placeholder="e.g. IZ603"
                    value={flightNumber}
                    onChange={(e) => setFlightNumber(e.target.value)}
                    required
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Airline"
                    placeholder="e.g. Arkia Israeli Airlines"
                    value={airline}
                    onChange={(e) => setAirline(e.target.value)}
                    required
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Departure Airport"
                    placeholder="e.g. TLV"
                    value={departureAirport}
                    onChange={(e) => setDepartureAirport(e.target.value)}
                    required
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Arrival Airport"
                    placeholder="e.g. DXB"
                    value={arrivalAirport}
                    onChange={(e) => setArrivalAirport(e.target.value)}
                    required
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    type="date"
                    label="Flight Date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    required
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    type="time"
                    label="Departure Time"
                    value={departureTime}
                    onChange={(e) => setDepartureTime(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    type="time"
                    label="Arrival Time"
                    value={arrivalTime}
                    onChange={(e) => setArrivalTime(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </>
      )}

      {/* Flight Details (shown after search) */}
      {(flightData || selectedFlight) && (
        <>
          <Card variant="outlined" sx={{ mb: 3, bgcolor: 'primary.50' }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Flight Details
              </Typography>

              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <Box display="flex" alignItems="center" gap={1}>
                    <Chip
                      label={(flightData || selectedFlight).airline}
                      color="primary"
                    />
                    <Typography variant="h6" fontWeight="bold">
                      {(flightData || selectedFlight).flightNumber}
                    </Typography>
                  </Box>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <Paper sx={{ p: 2 }}>
                    <Typography variant="caption" color="text.secondary">
                      Departure
                    </Typography>
                    <Typography variant="h6" fontWeight="bold">
                      {(flightData || selectedFlight).departureAirportCode ||
                        (flightData || selectedFlight).departure?.iata}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {
                        formatDateTimeLocal(
                          (flightData || selectedFlight).departureDateTime ||
                            (flightData || selectedFlight).departure?.scheduled
                        ).full
                      }
                    </Typography>
                    {((flightData || selectedFlight).terminal?.departure ||
                      (flightData || selectedFlight).departure?.terminal) && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        display="block"
                        mt={1}
                      >
                        Terminal:{' '}
                        {(flightData || selectedFlight).terminal?.departure ||
                          (flightData || selectedFlight).departure?.terminal}
                      </Typography>
                    )}
                    {((flightData || selectedFlight).gate?.departure ||
                      (flightData || selectedFlight).departure?.gate) && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        display="block"
                      >
                        Gate:{' '}
                        {(flightData || selectedFlight).gate?.departure ||
                          (flightData || selectedFlight).departure?.gate}
                      </Typography>
                    )}
                  </Paper>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <Paper sx={{ p: 2 }}>
                    <Typography variant="caption" color="text.secondary">
                      Arrival
                    </Typography>
                    <Typography variant="h6" fontWeight="bold">
                      {(flightData || selectedFlight).arrivalAirportCode ||
                        (flightData || selectedFlight).arrival?.iata}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {
                        formatDateTimeLocal(
                          (flightData || selectedFlight).arrivalDateTime ||
                            (flightData || selectedFlight).arrival?.scheduled
                        ).full
                      }
                    </Typography>
                    {((flightData || selectedFlight).terminal?.arrival ||
                      (flightData || selectedFlight).arrival?.terminal) && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        display="block"
                        mt={1}
                      >
                        Terminal:{' '}
                        {(flightData || selectedFlight).terminal?.arrival ||
                          (flightData || selectedFlight).arrival?.terminal}
                      </Typography>
                    )}
                    {((flightData || selectedFlight).gate?.arrival ||
                      (flightData || selectedFlight).arrival?.gate) && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        display="block"
                      >
                        Gate:{' '}
                        {(flightData || selectedFlight).gate?.arrival ||
                          (flightData || selectedFlight).arrival?.gate}
                      </Typography>
                    )}
                  </Paper>
                </Grid>

                {(flightData || selectedFlight).durationMinutes && (
                  <Grid item xs={12}>
                    <Alert severity="info" icon={false}>
                      <Stack direction="row" spacing={2} alignItems="center">
                        <Typography variant="body2">
                          <strong>Duration:</strong>{' '}
                          {Math.floor(
                            (flightData || selectedFlight).durationMinutes / 60
                          )}
                          h{' '}
                          {(flightData || selectedFlight).durationMinutes % 60}m
                        </Typography>
                        {((flightData || selectedFlight).aircraftType ||
                          (flightData || selectedFlight).aircraft) && (
                          <Typography variant="body2">
                            <strong>Aircraft:</strong>{' '}
                            {(flightData || selectedFlight).aircraftType ||
                              (flightData || selectedFlight).aircraft}
                          </Typography>
                        )}
                      </Stack>
                    </Alert>
                  </Grid>
                )}
              </Grid>
            </CardContent>
          </Card>

          {/* Info: Use Manual Entry for flights */}
          <Alert severity="info" icon="ℹ️" sx={{ mb: 3 }}>
            <Typography variant="body2" fontWeight="bold" gutterBottom>
              Add Your Flight Booking
            </Typography>
            <Typography variant="caption">
              After finding your flight details above, enter your booking
              information and the price you paid below. Or use the "Manual
              Entry" tab to add a flight you've already purchased.
            </Typography>
          </Alert>

          {/* User Inputs Section - shown after search */}
          <Card variant="outlined" sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="subtitle1" gutterBottom fontWeight="bold">
                Your Booking Details
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Ticket Cost"
                    placeholder="Enter ticket price"
                    type="number"
                    value={cost}
                    onChange={(e) => setCost(e.target.value)}
                    InputProps={{ startAdornment: '$' }}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Booking Number"
                    placeholder="e.g. ABC123"
                    value={bookingNumber}
                    onChange={(e) => setBookingNumber(e.target.value)}
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Booking Agency"
                    placeholder="e.g. Expedia, Booking.com"
                    value={bookingAgency}
                    onChange={(e) => setBookingAgency(e.target.value)}
                  />
                </Grid>
                <Grid item xs={12}>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    gutterBottom
                  >
                    Baggage
                  </Typography>
                  <Stack direction="row" spacing={2}>
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={carryOn}
                          onChange={(e) => setCarryOn(e.target.checked)}
                        />
                      }
                      label="Carry-on Trolley"
                    />
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={checked}
                          onChange={(e) => setChecked(e.target.checked)}
                        />
                      }
                      label="Checked Baggage"
                    />
                  </Stack>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </>
      )}

      {/* Ticket and Cost Information (shown for all modes) */}
      {((mode === 'search' && flightData) ||
        (mode === 'route' && selectedFlight) ||
        mode === 'manual') && (
        <Card variant="outlined" sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="subtitle1" gutterBottom fontWeight="bold">
              Ticket & Cost Information
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth
                  label="Number of Tickets"
                  placeholder="e.g. 2"
                  type="number"
                  value={numberOfTickets}
                  onChange={(e) => setNumberOfTickets(e.target.value)}
                  inputProps={{ min: 1 }}
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth
                  label="Cost"
                  placeholder="Enter price"
                  type="number"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  InputProps={{ startAdornment: '$' }}
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <FormControl fullWidth>
                  <InputLabel>Cost Type</InputLabel>
                  <Select
                    value={costType}
                    label="Cost Type"
                    onChange={(e) =>
                      setCostType(e.target.value as 'per-ticket' | 'total')
                    }
                  >
                    <MenuItem value="per-ticket">Per Ticket</MenuItem>
                    <MenuItem value="total">Total</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}

      {/* User Inputs for Manual Mode */}
      {mode === 'manual' && (
        <Card variant="outlined" sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="subtitle1" gutterBottom fontWeight="bold">
              Booking Details
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Booking Number"
                  placeholder="e.g. ABC123"
                  value={bookingNumber}
                  onChange={(e) => setBookingNumber(e.target.value)}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Booking Agency"
                  placeholder="e.g. Expedia, Booking.com"
                  value={bookingAgency}
                  onChange={(e) => setBookingAgency(e.target.value)}
                />
              </Grid>
              <Grid item xs={12}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Baggage
                </Typography>
                <Stack direction="row" spacing={2}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={carryOn}
                        onChange={(e) => setCarryOn(e.target.checked)}
                      />
                    }
                    label="Carry-on Trolley"
                  />
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={checked}
                        onChange={(e) => setChecked(e.target.checked)}
                      />
                    }
                    label="Checked Baggage"
                  />
                </Stack>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}

      {/* Save Button */}
      {((mode === 'search' && flightData) ||
        (mode === 'route' && selectedFlight) ||
        (mode === 'manual' &&
          flightNumber &&
          date &&
          departureAirport &&
          arrivalAirport)) && (
        <Button
          variant="contained"
          size="large"
          disabled={busy}
          onClick={saveFlight}
          endIcon={busy && <CircularProgress size={20} />}
        >
          {busy ? 'Adding Flight…' : 'Add Flight to Trip'}
        </Button>
      )}

      {/* Empty state for search mode */}
      {mode === 'search' && !flightData && !searching && (
        <Box
          display="flex"
          alignItems="center"
          justifyContent="center"
          height={200}
          border={1}
          borderColor="divider"
          borderRadius={2}
          bgcolor="grey.50"
        >
          <Stack alignItems="center" spacing={1}>
            <Typography variant="body2" color="text.secondary">
              Enter flight number and date to search
            </Typography>
          </Stack>
        </Box>
      )}
    </Box>
  );
}

export function AddHotelForm({
  tripId,
  trip,
  onUpdated,
  onDone,
}: {
  tripId: string;
  trip?: Trip;
  onUpdated: (t: Trip) => void;
  onDone?: () => void;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [hotelDetail, setHotelDetail] = useState<any | null>(null);

  // Initialize with trip dates if available
  const initialCheckIn = trip?.startDate
    ? trip.startDate.includes('T')
      ? trip.startDate.split('T')[0]
      : trip.startDate.slice(0, 10)
    : '';
  const initialCheckOut = trip?.endDate
    ? trip.endDate.includes('T')
      ? trip.endDate.split('T')[0]
      : trip.endDate.slice(0, 10)
    : '';

  const [checkIn, setCheckIn] = useState(initialCheckIn);
  const [checkOut, setCheckOut] = useState(initialCheckOut);
  const [arrivalTime, setArrivalTime] = useState('');
  const [nights, setNights] = useState('');
  const [cost, setCost] = useState('');
  const [includesMeals, setIncludesMeals] = useState(false);
  const [mealPlan, setMealPlan] = useState<
    'breakfast' | 'half-board' | 'all-inclusive'
  >('breakfast');
  const [numberOfRooms, setNumberOfRooms] = useState('');
  const [reservationNames, setReservationNames] = useState<string[]>(['']);
  const [bookedFrom, setBookedFrom] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Real prices from affiliate API
  const [realHotelPrices, setRealHotelPrices] = useState<any>(null);
  const [loadingHotelPrices, setLoadingHotelPrices] = useState(false);

  // Update reservation names array when number of rooms changes
  useEffect(() => {
    const numRooms = parseInt(numberOfRooms) || 1;
    if (numRooms > 0) {
      setReservationNames((prev) => {
        const newArray = Array(numRooms).fill('');
        // Preserve existing values
        for (let i = 0; i < Math.min(prev.length, numRooms); i++) {
          newArray[i] = prev[i];
        }
        return newArray;
      });
    }
  }, [numberOfRooms]);

  // Auto-calculate nights when check-in or check-out changes
  useEffect(() => {
    if (checkIn && checkOut) {
      const checkInDate = new Date(checkIn);
      const checkOutDate = new Date(checkOut);
      if (checkInDate < checkOutDate) {
        const diffTime = checkOutDate.getTime() - checkInDate.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        setNights(diffDays.toString());
      } else {
        setNights('');
      }
    } else {
      setNights('');
    }
  }, [checkIn, checkOut]);

  // Debounced search for hotels
  useEffect(() => {
    if (searchQuery.trim().length < 3) {
      setSearchResults([]);
      return;
    }
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const res = await hotelAutocomplete(searchQuery.trim());
        if (active) setSearchResults(res.suggestions || []);
      } catch (e) {
        console.error('Hotel search error:', e);
      }
    }, 500);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [searchQuery]);

  // Fetch hotel details when selected
  async function handleSelectHotel(hotel: any) {
    setSelected(hotel);
    setSearchResults([]); // Clear suggestions list
    setSearchQuery(hotel.name); // Update search field with selected hotel name
    setLoadingDetails(true);
    try {
      const det = await hotelDetails(hotel.placeId);
      setHotelDetail(det.hotel);
    } catch (e) {
      console.error('Error fetching hotel details:', e);
      setHotelDetail(null);
    } finally {
      setLoadingDetails(false);
    }
  }

  // Fetch real hotel prices from Travelpayouts API
  async function fetchRealHotelPrices() {
    if (!selected || !checkIn || !checkOut) return;

    // Extract city name from hotel address
    // Common city names to look for
    const knownCities = [
      'Dubai',
      'Abu Dhabi',
      'Paris',
      'London',
      'New York',
      'Tokyo',
      'Bangkok',
      'Singapore',
      'Hong Kong',
      'Seoul',
      'Rome',
      'Barcelona',
      'Amsterdam',
      'Berlin',
      'Madrid',
      'Vienna',
      'Prague',
      'Budapest',
      'Istanbul',
      'Athens',
      'Tel Aviv',
      'Jerusalem',
      'Eilat',
      'Haifa',
      'Los Angeles',
      'San Francisco',
      'Chicago',
      'Miami',
      'Las Vegas',
      'Boston',
      'Toronto',
      'Vancouver',
      'Sydney',
      'Melbourne',
      'Lisbon',
      'Copenhagen',
      'Stockholm',
      'Oslo',
      'Helsinki',
      'Brussels',
      'Zurich',
      'Geneva',
      'Milan',
      'Florence',
      'Venice',
      'Munich',
      'Frankfurt',
      'Hamburg',
      'Cairo',
      'Marrakech',
      'Casablanca',
      'Doha',
      'Riyadh',
      'Jeddah',
      'Muscat',
      'Amman',
      'Beirut',
      'Bucharest',
    ];

    const fullAddress =
      selected.formattedAddress || hotelDetail?.formattedAddress || '';

    // Try to find a known city in the address
    let cityName = null;
    for (const city of knownCities) {
      if (fullAddress.includes(city)) {
        cityName = city;
        break;
      }
    }

    // Fallback: extract from address parts
    if (!cityName) {
      const addressParts = fullAddress
        .split(/[-,]/)
        .map((p: string) => p.trim())
        .filter((p: string) => p.length > 0);

      if (addressParts.length >= 3) {
        // Format: [Hotel/Street, Street/Area, City, Country]
        // Take the second-to-last part (before country)
        cityName = addressParts[addressParts.length - 2];
      } else if (addressParts.length === 2) {
        // Format: [Hotel, City] or [Street, City]
        cityName = addressParts[1];
      } else if (addressParts.length === 1) {
        // Only one part, use it
        cityName = addressParts[0];
      } else {
        cityName = searchQuery; // last resort
      }

      // Clean up city name
      cityName = cityName
        .replace(/\d+/g, '') // Remove numbers
        .replace(/street|road|avenue|blvd|ave|calea|strada|sheikh|zayed/gi, '') // Remove street terms
        .trim();
    }

    console.log(
      '🏙️ Searching prices for city:',
      cityName,
      'from address:',
      fullAddress
    );
    console.log('📅 Dates:', checkIn, 'to', checkOut);

    // Validate cityName is a string
    if (!cityName || typeof cityName !== 'string') {
      console.error('❌ Invalid city name:', cityName);
      setLoadingHotelPrices(false);
      return;
    }

    // Get selected hotel name
    const hotelName = selected?.name || hotelDetail?.name || null;

    setLoadingHotelPrices(true);
    setRealHotelPrices(null);
    try {
      const response = await fetch(
        'http://localhost:3001/api/ai/get-real-prices',
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            destination: cityName,
            hotelName: hotelName, // Send specific hotel name if selected
            checkIn,
            checkOut,
            origin: 'TLV',
          }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        setRealHotelPrices(data);
      }
    } catch (e: any) {
      console.error('Failed to fetch real hotel prices:', e);
    } finally {
      setLoadingHotelPrices(false);
    }
  }

  async function add() {
    if (!selected || !checkIn || !checkOut) return;
    setErr(null);
    setBusy(true);
    try {
      const hotelPayload = {
        placeId: selected.placeId,
        name: hotelDetail?.name || selected.name,
        address: hotelDetail?.formattedAddress || selected.formattedAddress,
        checkIn,
        checkOut,
        arrivalTime: arrivalTime || undefined,
        nights: nights ? Number(nights) : undefined,
        cost: cost ? Number(cost) : undefined,
        rating: hotelDetail?.rating || null,
        includesMeals: includesMeals,
        mealPlan: includesMeals ? mealPlan : undefined,
        numberOfRooms: numberOfRooms ? Number(numberOfRooms) : undefined,
        reservationNames:
          reservationNames.filter((name) => name.trim() !== '').length > 0
            ? reservationNames.filter((name) => name.trim() !== '')
            : undefined,
        bookedFrom: bookedFrom || undefined,
      };
      const updated = await addHotelToTrip(tripId, hotelPayload as any);
      onUpdated(updated);
      setSearchQuery('');
      setSearchResults([]);
      setSelected(null);
      setHotelDetail(null);
      setCheckIn('');
      setCheckOut('');
      setArrivalTime('');
      setNights('');
      setCost('');
      setIncludesMeals(false);
      setMealPlan('breakfast');
      setNumberOfRooms('');
      setReservationNames(['']);
      setBookedFrom('');
      onDone?.();
    } catch (e: any) {
      setErr(e?.response?.data?.message || e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box>
      {err && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {err}
        </Alert>
      )}

      {/* PDF Upload */}
      <Card sx={{ mb: 3, bgcolor: 'success.50' }}>
        <CardContent>
          <Typography variant="subtitle2" gutterBottom>
            📄 Quick Import from PDF
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            display="block"
            mb={2}
          >
            Upload your hotel reservation PDF to automatically fill in details
          </Typography>
          <PDFUploadButton
            acceptedType="hotel"
            onDataExtracted={(data) => {
              if (data.type === 'hotel') {
                // Auto-fill form with extracted data
                setSearchQuery(data.name || '');
                setCheckIn(data.checkIn || '');
                setCheckOut(data.checkOut || '');
                if (data.numberOfRooms) {
                  setNumberOfRooms(data.numberOfRooms.toString());
                }
                if (data.guestName) {
                  setReservationNames([data.guestName]);
                }
                if (data.confirmationNumber) {
                  setBookedFrom(`Confirmation: ${data.confirmationNumber}`);
                }
                // searchQuery update will automatically trigger hotel search via useEffect
              }
            }}
          />
        </CardContent>
      </Card>

      <Grid container spacing={3}>
        {/* Left side - Search */}
        <Grid item xs={12} md={5}>
          <Stack spacing={2}>
            <TextField
              fullWidth
              label="Search Hotels"
              placeholder="Type hotel name or city..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoComplete="off"
            />

            {searchResults.length > 0 && (
              <Paper
                variant="outlined"
                sx={{ maxHeight: 400, overflow: 'auto' }}
              >
                <Stack divider={<Divider />}>
                  {searchResults.map((hotel) => (
                    <Box
                      key={hotel.placeId}
                      onClick={() => handleSelectHotel(hotel)}
                      sx={{
                        p: 2,
                        cursor: 'pointer',
                        bgcolor:
                          selected?.placeId === hotel.placeId
                            ? 'action.selected'
                            : 'transparent',
                        '&:hover': { bgcolor: 'action.hover' },
                      }}
                    >
                      <Typography variant="subtitle2" fontWeight="bold">
                        {hotel.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {hotel.formattedAddress}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              </Paper>
            )}

            {searchQuery.length >= 3 && searchResults.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                No hotels found. Try a different search.
              </Typography>
            )}
          </Stack>
        </Grid>

        {/* Right side - Hotel Details & Booking */}
        <Grid item xs={12} md={7}>
          {loadingDetails && (
            <Box display="flex" justifyContent="center" p={4}>
              <CircularProgress />
            </Box>
          )}

          {!loadingDetails && selected && (
            <Stack spacing={3}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    {hotelDetail?.name || selected.name}
                  </Typography>

                  {hotelDetail?.rating && (
                    <Box display="flex" alignItems="center" gap={1} mb={2}>
                      <Typography variant="body2" color="text.secondary">
                        Rating:
                      </Typography>
                      <Box display="flex" alignItems="center">
                        <Typography
                          variant="subtitle2"
                          fontWeight="bold"
                          color="primary"
                        >
                          {hotelDetail.rating}
                        </Typography>
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          ml={0.5}
                        >
                          / 5 ⭐
                        </Typography>
                      </Box>
                    </Box>
                  )}

                  <Typography
                    variant="body2"
                    color="text.secondary"
                    gutterBottom
                  >
                    <strong>Address:</strong>
                  </Typography>
                  <Typography variant="body2" paragraph>
                    {hotelDetail?.formattedAddress || selected.formattedAddress}
                  </Typography>

                  {hotelDetail?.distance && (
                    <Box mt={2} p={2} bgcolor="info.50" borderRadius={1}>
                      <Typography variant="caption" color="text.secondary">
                        Distance from airport:{' '}
                        <strong>{hotelDetail.distance}</strong>
                      </Typography>
                      {hotelDetail?.duration && (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          display="block"
                        >
                          Travel time: <strong>{hotelDetail.duration}</strong>
                        </Typography>
                      )}
                    </Box>
                  )}
                </CardContent>
              </Card>

              <Card variant="outlined">
                <CardContent>
                  <Typography
                    variant="subtitle1"
                    gutterBottom
                    fontWeight="bold"
                  >
                    Booking Details
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <TextField
                        fullWidth
                        type="date"
                        label="Check In"
                        value={checkIn}
                        onChange={(e) => setCheckIn(e.target.value)}
                        InputLabelProps={{ shrink: true }}
                        required
                      />
                    </Grid>
                    <Grid item xs={6}>
                      <TextField
                        fullWidth
                        type="date"
                        label="Check Out"
                        value={checkOut}
                        onChange={(e) => setCheckOut(e.target.value)}
                        InputLabelProps={{ shrink: true }}
                        required
                      />
                    </Grid>
                    <Grid item xs={6}>
                      <TextField
                        fullWidth
                        type="time"
                        label="Arrival Time (optional)"
                        value={arrivalTime}
                        onChange={(e) => setArrivalTime(e.target.value)}
                        InputLabelProps={{ shrink: true }}
                        helperText="Defaults to 15:00 if not specified"
                      />
                    </Grid>
                    <Grid item xs={6}>
                      <TextField
                        fullWidth
                        label="Nights"
                        type="number"
                        value={nights}
                        onChange={(e) => setNights(e.target.value)}
                        helperText="Auto-calculated from dates"
                        InputProps={{
                          readOnly: true,
                        }}
                      />
                    </Grid>
                    <Grid item xs={6}>
                      <TextField
                        fullWidth
                        label="Cost"
                        placeholder="Optional"
                        type="number"
                        value={cost}
                        onChange={(e) => setCost(e.target.value)}
                      />
                    </Grid>
                    <Grid item xs={12}>
                      <Divider sx={{ my: 1 }} />
                    </Grid>
                    <Grid item xs={12}>
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={includesMeals}
                            onChange={(e) => setIncludesMeals(e.target.checked)}
                          />
                        }
                        label="Hotel includes meals"
                      />
                    </Grid>
                    {includesMeals && (
                      <Grid item xs={12}>
                        <FormControl fullWidth>
                          <InputLabel id="meal-plan-label">
                            Meal Plan
                          </InputLabel>
                          <Select
                            labelId="meal-plan-label"
                            value={mealPlan}
                            label="Meal Plan"
                            onChange={(e) => setMealPlan(e.target.value as any)}
                          >
                            <MenuItem value="breakfast">Breakfast</MenuItem>
                            <MenuItem value="half-board">
                              Half-Board (Breakfast + Dinner)
                            </MenuItem>
                            <MenuItem value="all-inclusive">
                              All-Inclusive (Breakfast + Lunch + Dinner)
                            </MenuItem>
                          </Select>
                        </FormControl>
                      </Grid>
                    )}
                    <Grid item xs={12}>
                      <Divider sx={{ my: 1 }} />
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ mt: 1, display: 'block' }}
                      >
                        Additional Booking Information
                      </Typography>
                    </Grid>
                    <Grid item xs={12}>
                      <TextField
                        fullWidth
                        label="Number of Rooms"
                        placeholder="Optional"
                        type="number"
                        value={numberOfRooms}
                        onChange={(e) => setNumberOfRooms(e.target.value)}
                        inputProps={{ min: 1 }}
                      />
                    </Grid>
                    {numberOfRooms && parseInt(numberOfRooms) > 0 && (
                      <>
                        <Grid item xs={12}>
                          <Typography variant="caption" color="text.secondary">
                            Reservation Names ({parseInt(numberOfRooms)} room
                            {parseInt(numberOfRooms) > 1 ? 's' : ''})
                          </Typography>
                        </Grid>
                        {reservationNames.map((name, index) => (
                          <Grid item xs={12} sm={6} key={index}>
                            <TextField
                              fullWidth
                              label={`Room ${index + 1} - Reservation Name`}
                              placeholder="Optional"
                              value={name}
                              onChange={(e) => {
                                const newNames = [...reservationNames];
                                newNames[index] = e.target.value;
                                setReservationNames(newNames);
                              }}
                            />
                          </Grid>
                        ))}
                      </>
                    )}
                    <Grid item xs={12}>
                      <TextField
                        fullWidth
                        label="Booked From"
                        placeholder="e.g., Booking.com, Expedia, Direct"
                        value={bookedFrom}
                        onChange={(e) => setBookedFrom(e.target.value)}
                      />
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>

              {/* Get Real Hotel Prices & Booking */}
              {checkIn && checkOut && (
                <Card variant="outlined" sx={{ bgcolor: 'success.50' }}>
                  <CardContent>
                    <Stack
                      direction="row"
                      alignItems="center"
                      justifyContent="space-between"
                      mb={2}
                    >
                      <Typography variant="subtitle1" fontWeight="bold">
                        💰 Real Prices & Booking
                      </Typography>
                      <Button
                        variant="contained"
                        color="success"
                        onClick={fetchRealHotelPrices}
                        disabled={loadingHotelPrices}
                        startIcon={
                          loadingHotelPrices && <CircularProgress size={20} />
                        }
                      >
                        {loadingHotelPrices ? 'Loading...' : 'Get Real Prices'}
                      </Button>
                    </Stack>

                    {realHotelPrices?.hotels &&
                      realHotelPrices.hotels.length > 0 && (
                        <Stack spacing={2}>
                          <Alert severity="success">
                            Found {realHotelPrices.hotels.length} hotels! Avg: $
                            {realHotelPrices.averageHotelPrice?.toFixed(0)}
                            /night
                          </Alert>
                          {realHotelPrices.hotels
                            .slice(0, 3)
                            .map((hotel: any, idx: number) => (
                              <Paper key={idx} variant="outlined" sx={{ p: 2 }}>
                                <Grid container spacing={2} alignItems="center">
                                  <Grid item xs={12} sm={7}>
                                    <Typography
                                      variant="body2"
                                      fontWeight="bold"
                                    >
                                      {hotel.name}
                                    </Typography>
                                    <Typography
                                      variant="caption"
                                      color="text.secondary"
                                    >
                                      {hotel.stars &&
                                        `${'⭐'.repeat(hotel.stars)} • `}
                                      {hotel.location}
                                    </Typography>
                                    {hotel.rating && (
                                      <Typography
                                        variant="caption"
                                        color="primary"
                                        display="block"
                                      >
                                        Rating: {hotel.rating}/10
                                      </Typography>
                                    )}
                                  </Grid>
                                  <Grid item xs={12} sm={5}>
                                    <Stack spacing={1}>
                                      <Typography
                                        variant="caption"
                                        color="text.secondary"
                                      >
                                        ${hotel.pricePerNight}/night
                                      </Typography>
                                      <Stack
                                        direction="row"
                                        spacing={1}
                                        alignItems="center"
                                      >
                                        <Typography
                                          variant="h6"
                                          color="primary"
                                          fontWeight="bold"
                                        >
                                          ${hotel.price}
                                        </Typography>
                                        <Typography
                                          variant="caption"
                                          color="text.secondary"
                                        >
                                          total
                                        </Typography>
                                      </Stack>
                                      <BookingButton
                                        bookingLink={hotel.bookingLink}
                                        price={hotel.price}
                                        currency={hotel.currency || 'USD'}
                                        type="hotel"
                                        affiliate={hotel.affiliate}
                                        variant="chip"
                                        size="small"
                                      />
                                    </Stack>
                                  </Grid>
                                </Grid>
                              </Paper>
                            ))}
                        </Stack>
                      )}

                    {!realHotelPrices && !loadingHotelPrices && (
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        textAlign="center"
                      >
                        Click "Get Real Prices" to see current hotel prices and
                        booking options
                      </Typography>
                    )}
                  </CardContent>
                </Card>
              )}

              <Button
                variant="contained"
                size="large"
                disabled={!selected || !checkIn || !checkOut || busy}
                onClick={add}
                endIcon={busy && <CircularProgress size={20} />}
              >
                {busy ? 'Adding Hotel…' : 'Add Hotel to Trip'}
              </Button>
            </Stack>
          )}

          {!selected && !loadingDetails && (
            <Box
              display="flex"
              alignItems="center"
              justifyContent="center"
              height={300}
              border={1}
              borderColor="divider"
              borderRadius={2}
              bgcolor="grey.50"
            >
              <Typography variant="body2" color="text.secondary">
                Search and select a hotel to see details
              </Typography>
            </Box>
          )}
        </Grid>
      </Grid>
    </Box>
  );
}

export function AddRideForm({
  tripId,
  onUpdated,
  onDone,
}: {
  tripId: string;
  onUpdated: (t: Trip) => void;
  onDone?: () => void;
}) {
  const [rideType, setRideType] = useState<'taxi' | 'rental'>('taxi');
  const [searchQueryFrom, setSearchQueryFrom] = useState('');
  const [searchQueryTo, setSearchQueryTo] = useState('');
  const [searchResultsFrom, setSearchResultsFrom] = useState<any[]>([]);
  const [searchResultsTo, setSearchResultsTo] = useState<any[]>([]);
  const [fromSel, setFromSel] = useState<any | null>(null);
  const [toSel, setToSel] = useState<any | null>(null);
  const [rideDetails, setRideDetails] = useState<any | null>(null);

  // Common fields
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [cost, setCost] = useState('');
  const [mode, setMode] = useState('driving');

  // Taxi/Ride specific
  const [notes, setNotes] = useState('');

  // Car Rental specific
  const [voucherNumber, setVoucherNumber] = useState('');
  const [rentalCompany, setRentalCompany] = useState('');
  const [pickupDate, setPickupDate] = useState('');
  const [pickupTime, setPickupTime] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [returnTime, setReturnTime] = useState('');

  const [busy, setBusy] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Search for pickup locations
  useEffect(() => {
    if (searchQueryFrom.trim().length < 3) {
      setSearchResultsFrom([]);
      return;
    }
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const r = await placesAutocomplete(searchQueryFrom.trim());
        if (active) setSearchResultsFrom(r.suggestions || []);
      } catch (e) {
        console.error('Place search error:', e);
      }
    }, 500);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [searchQueryFrom]);

  // Search for dropoff locations
  useEffect(() => {
    if (searchQueryTo.trim().length < 3) {
      setSearchResultsTo([]);
      return;
    }
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const r = await placesAutocomplete(searchQueryTo.trim());
        if (active) setSearchResultsTo(r.suggestions || []);
      } catch (e) {
        console.error('Place search error:', e);
      }
    }, 500);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [searchQueryTo]);

  // Calculate distance when both locations are selected
  useEffect(() => {
    if (!fromSel || !toSel) {
      setRideDetails(null);
      return;
    }
    setLoadingDetails(true);
    rideDistance(
      `place_id:${fromSel.placeId}`,
      `place_id:${toSel.placeId}`,
      mode
    )
      .then((dist) => setRideDetails(dist))
      .catch((e) => console.error('Distance calculation error:', e))
      .finally(() => setLoadingDetails(false));
  }, [fromSel, toSel, mode]);

  async function add() {
    // Validate required fields based on ride type
    const hasRequiredFields =
      rideType === 'rental'
        ? fromSel && toSel && pickupDate && pickupTime
        : fromSel && toSel && date && time;

    if (!hasRequiredFields) return;

    setErr(null);
    setBusy(true);
    try {
      const payload: any = {
        type: rideType,
        pickup: fromSel.name,
        dropoff: toSel.name,
        pickupPlaceId: fromSel.placeId,
        dropoffPlaceId: toSel.placeId,
        distance: rideDetails?.distance,
        duration: rideDetails?.duration,
        mode,
        date: rideType === 'rental' ? pickupDate : date,
        time: rideType === 'rental' ? pickupTime : time,
        cost: cost ? Number(cost) : undefined,
      };

      // Add taxi/ride specific fields
      if (rideType === 'taxi') {
        payload.notes = notes || undefined;
      }

      // Add car rental specific fields
      if (rideType === 'rental') {
        payload.voucherNumber = voucherNumber || undefined;
        payload.rentalCompany = rentalCompany || undefined;
        payload.pickupDate = pickupDate;
        payload.pickupTime = pickupTime;
        payload.returnDate = returnDate || undefined;
        payload.returnTime = returnTime || undefined;
      }

      const updated = await addRideToTrip(tripId, payload);
      onUpdated(updated);

      // Reset all fields
      setSearchQueryFrom('');
      setSearchQueryTo('');
      setSearchResultsFrom([]);
      setSearchResultsTo([]);
      setFromSel(null);
      setToSel(null);
      setRideDetails(null);
      setDate('');
      setTime('');
      setCost('');
      setNotes('');
      setVoucherNumber('');
      setRentalCompany('');
      setPickupDate('');
      setPickupTime('');
      setReturnDate('');
      setReturnTime('');
      onDone?.();
    } catch (e: any) {
      setErr(e?.response?.data?.message || e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box>
      {err && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {err}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Left side - Search */}
        <Grid item xs={12} md={5}>
          <Stack spacing={3}>
            {/* Pickup Search */}
            <Box>
              <TextField
                fullWidth
                label="Pickup Location"
                placeholder="Search pickup location..."
                value={searchQueryFrom}
                onChange={(e) => setSearchQueryFrom(e.target.value)}
                autoComplete="off"
              />
              {searchResultsFrom.length > 0 && (
                <Paper
                  variant="outlined"
                  sx={{ maxHeight: 200, overflow: 'auto', mt: 1 }}
                >
                  <Stack divider={<Divider />}>
                    {searchResultsFrom.map((place) => (
                      <Box
                        key={place.placeId}
                        onClick={() => {
                          setFromSel(place);
                          setSearchQueryFrom('');
                          setSearchResultsFrom([]);
                        }}
                        sx={{
                          p: 1.5,
                          cursor: 'pointer',
                          bgcolor:
                            fromSel?.placeId === place.placeId
                              ? 'action.selected'
                              : 'transparent',
                          '&:hover': { bgcolor: 'action.hover' },
                        }}
                      >
                        <Typography variant="body2" fontWeight="medium">
                          {place.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {place.formattedAddress}
                        </Typography>
                      </Box>
                    ))}
                  </Stack>
                </Paper>
              )}
              {fromSel && (
                <Card variant="outlined" sx={{ mt: 1, bgcolor: 'success.50' }}>
                  <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Typography variant="caption" color="text.secondary">
                      Selected Pickup:
                    </Typography>
                    <Typography variant="body2" fontWeight="bold">
                      {fromSel.name}
                    </Typography>
                  </CardContent>
                </Card>
              )}
            </Box>

            {/* Dropoff Search */}
            <Box>
              <TextField
                fullWidth
                label="Drop-off Location"
                placeholder="Search drop-off location..."
                value={searchQueryTo}
                onChange={(e) => setSearchQueryTo(e.target.value)}
                autoComplete="off"
              />
              {searchResultsTo.length > 0 && (
                <Paper
                  variant="outlined"
                  sx={{ maxHeight: 200, overflow: 'auto', mt: 1 }}
                >
                  <Stack divider={<Divider />}>
                    {searchResultsTo.map((place) => (
                      <Box
                        key={place.placeId}
                        onClick={() => {
                          setToSel(place);
                          setSearchQueryTo('');
                          setSearchResultsTo([]);
                        }}
                        sx={{
                          p: 1.5,
                          cursor: 'pointer',
                          bgcolor:
                            toSel?.placeId === place.placeId
                              ? 'action.selected'
                              : 'transparent',
                          '&:hover': { bgcolor: 'action.hover' },
                        }}
                      >
                        <Typography variant="body2" fontWeight="medium">
                          {place.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {place.formattedAddress}
                        </Typography>
                      </Box>
                    ))}
                  </Stack>
                </Paper>
              )}
              {toSel && (
                <Card variant="outlined" sx={{ mt: 1, bgcolor: 'info.50' }}>
                  <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Typography variant="caption" color="text.secondary">
                      Selected Drop-off:
                    </Typography>
                    <Typography variant="body2" fontWeight="bold">
                      {toSel.name}
                    </Typography>
                  </CardContent>
                </Card>
              )}
            </Box>
          </Stack>
        </Grid>

        {/* Right side - Ride Details */}
        <Grid item xs={12} md={7}>
          {loadingDetails && (
            <Box display="flex" justifyContent="center" p={4}>
              <CircularProgress />
            </Box>
          )}

          {!loadingDetails && (fromSel || toSel) && (
            <Stack spacing={3}>
              {fromSel && toSel && (
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Route Details
                    </Typography>

                    <Stack spacing={2}>
                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          From:
                        </Typography>
                        <Typography variant="body2">{fromSel.name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {fromSel.formattedAddress}
                        </Typography>
                      </Box>

                      <Divider />

                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          To:
                        </Typography>
                        <Typography variant="body2">{toSel.name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {toSel.formattedAddress}
                        </Typography>
                      </Box>
                    </Stack>

                    {rideDetails && (
                      <Box mt={3} p={2} bgcolor="primary.50" borderRadius={1}>
                        <Grid container spacing={2}>
                          <Grid item xs={6}>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              Distance
                            </Typography>
                            <Typography variant="h6" color="primary">
                              {rideDetails.distance}
                            </Typography>
                          </Grid>
                          <Grid item xs={6}>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              Duration
                            </Typography>
                            <Typography variant="h6" color="primary">
                              {rideDetails.duration}
                            </Typography>
                          </Grid>
                        </Grid>
                      </Box>
                    )}
                  </CardContent>
                </Card>
              )}

              {(!fromSel || !toSel) && (
                <Alert severity="info">
                  Please select both pickup and drop-off locations to continue
                </Alert>
              )}

              {/* Ride Type Selection */}
              <Card variant="outlined">
                <CardContent>
                  <Typography
                    variant="subtitle1"
                    gutterBottom
                    fontWeight="bold"
                  >
                    Ride Type
                  </Typography>
                  <FormControl fullWidth>
                    <InputLabel>Type</InputLabel>
                    <Select
                      value={rideType}
                      label="Type"
                      onChange={(e) =>
                        setRideType(e.target.value as 'taxi' | 'rental')
                      }
                    >
                      <MenuItem value="taxi">🚕 Taxi / Private Ride</MenuItem>
                      <MenuItem value="rental">🚗 Car Rental</MenuItem>
                    </Select>
                  </FormControl>
                </CardContent>
              </Card>

              {/* Date and Time - Required for both types */}
              <Card variant="outlined">
                <CardContent>
                  <Typography
                    variant="subtitle1"
                    gutterBottom
                    fontWeight="bold"
                  >
                    {rideType === 'taxi' ? 'Ride Schedule' : 'Pickup Schedule'}
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        type="date"
                        label="Date"
                        value={rideType === 'rental' ? pickupDate : date}
                        onChange={(e) =>
                          rideType === 'rental'
                            ? setPickupDate(e.target.value)
                            : setDate(e.target.value)
                        }
                        InputLabelProps={{ shrink: true }}
                        required
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        type="time"
                        label="Time"
                        value={rideType === 'rental' ? pickupTime : time}
                        onChange={(e) =>
                          rideType === 'rental'
                            ? setPickupTime(e.target.value)
                            : setTime(e.target.value)
                        }
                        InputLabelProps={{ shrink: true }}
                        required
                      />
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>

              {/* Car Rental Specific Fields */}
              {rideType === 'rental' && (
                <Card variant="outlined">
                  <CardContent>
                    <Typography
                      variant="subtitle1"
                      gutterBottom
                      fontWeight="bold"
                    >
                      Rental Details
                    </Typography>
                    <Grid container spacing={2}>
                      <Grid item xs={12} sm={6}>
                        <TextField
                          fullWidth
                          label="Rental Company"
                          placeholder="e.g., Hertz, Enterprise"
                          value={rentalCompany}
                          onChange={(e) => setRentalCompany(e.target.value)}
                        />
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <TextField
                          fullWidth
                          label="Voucher Number"
                          placeholder="Optional"
                          value={voucherNumber}
                          onChange={(e) => setVoucherNumber(e.target.value)}
                        />
                      </Grid>
                      <Grid item xs={12}>
                        <Divider sx={{ my: 1 }}>
                          <Chip label="Return Schedule" size="small" />
                        </Divider>
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <TextField
                          fullWidth
                          type="date"
                          label="Return Date"
                          value={returnDate}
                          onChange={(e) => setReturnDate(e.target.value)}
                          InputLabelProps={{ shrink: true }}
                        />
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <TextField
                          fullWidth
                          type="time"
                          label="Return Time"
                          value={returnTime}
                          onChange={(e) => setReturnTime(e.target.value)}
                          InputLabelProps={{ shrink: true }}
                        />
                      </Grid>
                    </Grid>
                  </CardContent>
                </Card>
              )}

              {/* Taxi/Ride Specific Fields */}
              {rideType === 'taxi' && (
                <Card variant="outlined">
                  <CardContent>
                    <Typography
                      variant="subtitle1"
                      gutterBottom
                      fontWeight="bold"
                    >
                      Additional Details
                    </Typography>
                    <TextField
                      fullWidth
                      label="Notes"
                      placeholder="Driver name, phone number, or other details..."
                      multiline
                      rows={3}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </CardContent>
                </Card>
              )}

              {/* Transportation Mode & Cost */}
              <Card variant="outlined">
                <CardContent>
                  <Typography
                    variant="subtitle1"
                    gutterBottom
                    fontWeight="bold"
                  >
                    Additional Settings
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={6}>
                      <FormControl fullWidth>
                        <InputLabel>Transportation Mode</InputLabel>
                        <Select
                          value={mode}
                          label="Transportation Mode"
                          onChange={(e) => setMode(e.target.value)}
                        >
                          <MenuItem value="driving">🚗 Driving</MenuItem>
                          <MenuItem value="walking">🚶 Walking</MenuItem>
                          <MenuItem value="bicycling">🚴 Bicycling</MenuItem>
                          <MenuItem value="transit">🚌 Transit</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        label="Cost"
                        placeholder="Optional"
                        type="number"
                        value={cost}
                        onChange={(e) => setCost(e.target.value)}
                      />
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>

              <Button
                variant="contained"
                size="large"
                disabled={
                  !fromSel ||
                  !toSel ||
                  (rideType === 'rental'
                    ? !pickupDate || !pickupTime
                    : !date || !time) ||
                  busy
                }
                onClick={add}
                endIcon={busy && <CircularProgress size={20} />}
              >
                {busy
                  ? 'Adding Ride…'
                  : `Add ${rideType === 'rental' ? 'Car Rental' : 'Ride'} to Trip`}
              </Button>
            </Stack>
          )}

          {!fromSel && !toSel && !loadingDetails && (
            <Box
              display="flex"
              alignItems="center"
              justifyContent="center"
              height={400}
              border={1}
              borderColor="divider"
              borderRadius={2}
              bgcolor="grey.50"
            >
              <Stack alignItems="center" spacing={1}>
                <DirectionsCar sx={{ fontSize: 48, color: 'text.disabled' }} />
                <Typography variant="body2" color="text.secondary">
                  Select pickup and drop-off locations to begin
                </Typography>
              </Stack>
            </Box>
          )}
        </Grid>
      </Grid>
    </Box>
  );
}

export function AddAttractionForm({
  tripId,
  onUpdated,
  onDone,
}: {
  tripId: string;
  onUpdated: (t: Trip) => void;
  onDone?: () => void;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [sel, setSel] = useState<any | null>(null);
  const [placeDetail, setPlaceDetail] = useState<any | null>(null);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [cost, setCost] = useState('');
  const [numberOfTickets, setNumberOfTickets] = useState('');
  const [costType, setCostType] = useState<'per-ticket' | 'total'>('total');
  const [attractionType, setAttractionType] = useState<
    | 'restaurant'
    | 'park'
    | 'show'
    | 'museum'
    | 'event'
    | 'theme-park'
    | 'water-park'
    | 'custom'
  >('restaurant');
  const [customType, setCustomType] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Debounced search for attractions
  useEffect(() => {
    if (searchQuery.trim().length < 3) {
      setSearchResults([]);
      return;
    }
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const r = await placesAutocomplete(searchQuery.trim());
        if (active) setSearchResults(r.suggestions || []);
      } catch (e) {
        console.error('Place search error:', e);
      }
    }, 500);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [searchQuery]);

  // Fetch place details when selected
  async function handleSelectPlace(place: any) {
    setSel(place);
    setSearchResults([]); // Clear search results after selection
    setLoadingDetails(true);
    try {
      const det = await placeDetails(place.placeId);
      setPlaceDetail(det.place);
    } catch (e) {
      console.error('Error fetching place details:', e);
      setPlaceDetail(null);
    } finally {
      setLoadingDetails(false);
    }
  }

  async function add() {
    if (!sel || !date) return;
    setErr(null);
    setBusy(true);
    try {
      const payload = {
        placeId: sel.placeId,
        name: placeDetail?.name || sel.name,
        address: placeDetail?.formattedAddress || sel.formattedAddress,
        scheduledDate: date,
        scheduledTime: time || undefined,
        rating: placeDetail?.rating || null,
        cost: cost ? Number(cost) : undefined,
        numberOfTickets: numberOfTickets ? Number(numberOfTickets) : undefined,
        costType: costType,
        attractionType: attractionType,
        customType: attractionType === 'custom' ? customType : undefined,
      };
      const updated = await addAttractionToTrip(tripId, payload as any);
      onUpdated(updated);
      setSearchQuery('');
      setSearchResults([]);
      setSel(null);
      setPlaceDetail(null);
      setDate('');
      setTime('');
      setCost('');
      setNumberOfTickets('');
      setCostType('total');
      setAttractionType('restaurant');
      setCustomType('');
      onDone?.();
    } catch (e: any) {
      setErr(e?.response?.data?.message || e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box>
      {err && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {err}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Left side - Search */}
        <Grid item xs={12} md={5}>
          <Stack spacing={2}>
            <TextField
              fullWidth
              label="Search Attractions"
              placeholder="e.g., Burj Khalifa, restaurants, parks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoComplete="off"
            />

            {searchResults.length > 0 && (
              <Paper
                variant="outlined"
                sx={{ maxHeight: 400, overflow: 'auto' }}
              >
                <Stack divider={<Divider />}>
                  {searchResults.map((place) => (
                    <Box
                      key={place.placeId}
                      onClick={() => handleSelectPlace(place)}
                      sx={{
                        p: 2,
                        cursor: 'pointer',
                        bgcolor:
                          sel?.placeId === place.placeId
                            ? 'action.selected'
                            : 'transparent',
                        '&:hover': { bgcolor: 'action.hover' },
                      }}
                    >
                      <Typography variant="subtitle2" fontWeight="bold">
                        {place.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {place.formattedAddress}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              </Paper>
            )}

            {searchQuery.length >= 3 && searchResults.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                No places found. Try a different search.
              </Typography>
            )}
          </Stack>
        </Grid>

        {/* Right side - Attraction Details & Schedule */}
        <Grid item xs={12} md={7}>
          {loadingDetails && (
            <Box display="flex" justifyContent="center" p={4}>
              <CircularProgress />
            </Box>
          )}

          {!loadingDetails && sel && (
            <Stack spacing={3}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    {placeDetail?.name || sel.name}
                  </Typography>

                  {placeDetail?.rating && (
                    <Box display="flex" alignItems="center" gap={1} mb={2}>
                      <Typography variant="body2" color="text.secondary">
                        Rating:
                      </Typography>
                      <Box display="flex" alignItems="center">
                        <Typography
                          variant="subtitle2"
                          fontWeight="bold"
                          color="primary"
                        >
                          {placeDetail.rating}
                        </Typography>
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          ml={0.5}
                        >
                          / 5 ⭐
                        </Typography>
                      </Box>
                    </Box>
                  )}

                  <Typography
                    variant="body2"
                    color="text.secondary"
                    gutterBottom
                  >
                    <strong>Address:</strong>
                  </Typography>
                  <Typography variant="body2" paragraph>
                    {placeDetail?.formattedAddress || sel.formattedAddress}
                  </Typography>

                  {placeDetail?.types && (
                    <Box mt={2}>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        gutterBottom
                        display="block"
                      >
                        Categories:
                      </Typography>
                      <Box display="flex" flexWrap="wrap" gap={0.5}>
                        {placeDetail.types.slice(0, 5).map((type: string) => (
                          <Chip
                            key={type}
                            label={type.replace(/_/g, ' ')}
                            size="small"
                          />
                        ))}
                      </Box>
                    </Box>
                  )}
                </CardContent>
              </Card>

              <Card variant="outlined">
                <CardContent>
                  <Typography
                    variant="subtitle1"
                    gutterBottom
                    fontWeight="bold"
                  >
                    Visit Details
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={12}>
                      <FormControl fullWidth>
                        <InputLabel id="attraction-type-label">Type</InputLabel>
                        <Select
                          labelId="attraction-type-label"
                          value={attractionType}
                          label="Type"
                          onChange={(e) =>
                            setAttractionType(e.target.value as any)
                          }
                        >
                          <MenuItem value="restaurant">Restaurant</MenuItem>
                          <MenuItem value="park">Park</MenuItem>
                          <MenuItem value="show">Show</MenuItem>
                          <MenuItem value="museum">Museum</MenuItem>
                          <MenuItem value="event">Event</MenuItem>
                          <MenuItem value="theme-park">Theme Park</MenuItem>
                          <MenuItem value="water-park">Water Park</MenuItem>
                          <MenuItem value="custom">Custom</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                    {attractionType === 'custom' && (
                      <Grid item xs={12}>
                        <TextField
                          fullWidth
                          label="Custom Type Name"
                          placeholder="e.g., Shopping, Beach, etc."
                          value={customType}
                          onChange={(e) => setCustomType(e.target.value)}
                          required
                        />
                      </Grid>
                    )}
                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        type="date"
                        label="Date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        InputLabelProps={{ shrink: true }}
                        required
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        type="time"
                        label="Time"
                        value={time}
                        onChange={(e) => setTime(e.target.value)}
                        InputLabelProps={{ shrink: true }}
                      />
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <TextField
                        fullWidth
                        label="Number of Tickets"
                        placeholder="e.g. 2"
                        type="number"
                        value={numberOfTickets}
                        onChange={(e) => setNumberOfTickets(e.target.value)}
                        inputProps={{ min: 1 }}
                      />
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <TextField
                        fullWidth
                        label="Cost"
                        placeholder="Optional"
                        type="number"
                        value={cost}
                        onChange={(e) => setCost(e.target.value)}
                      />
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <FormControl fullWidth>
                        <InputLabel>Cost Type</InputLabel>
                        <Select
                          value={costType}
                          label="Cost Type"
                          onChange={(e) =>
                            setCostType(
                              e.target.value as 'per-ticket' | 'total'
                            )
                          }
                        >
                          <MenuItem value="per-ticket">Per Ticket</MenuItem>
                          <MenuItem value="total">Total</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>

              <Button
                variant="contained"
                size="large"
                disabled={!sel || !date || busy}
                onClick={add}
                endIcon={busy && <CircularProgress size={20} />}
              >
                {busy ? 'Adding Attraction…' : 'Add Attraction to Trip'}
              </Button>
            </Stack>
          )}

          {!sel && !loadingDetails && (
            <Box
              display="flex"
              alignItems="center"
              justifyContent="center"
              height={300}
              border={1}
              borderColor="divider"
              borderRadius={2}
              bgcolor="grey.50"
            >
              <Typography variant="body2" color="text.secondary">
                Search and select an attraction to see details
              </Typography>
            </Box>
          )}
        </Grid>
      </Grid>
    </Box>
  );
}
