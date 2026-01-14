import { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  TextField,
  Grid,
  Alert,
  CircularProgress,
  Stack,
  Divider,
  Chip,
} from '@mui/material';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import { Trip, RideLeg } from '../types/domain';
import { calculateRideRoute, addRideToTrip } from '../services/api';

interface Location {
  id: string;
  name: string;
  address: string;
  type: 'airport' | 'hotel' | 'attraction';
  date?: string;
  time?: string;
}

interface GenerateRideProps {
  trip: Trip;
  onRideAdded: (updatedTrip: Trip) => void;
  onClose?: () => void;
  initialSelection?: Array<{
    type: string;
    index: number;
    name: string;
    address: string;
  }>;
}

export default function GenerateRide({
  trip,
  onRideAdded,
  onClose,
  initialSelection,
}: GenerateRideProps) {
  const [locations, setLocations] = useState<Location[]>([]);
  const [startLocation, setStartLocation] = useState<string>('');
  const [endLocation, setEndLocation] = useState<string>('');
  const [generatedRide, setGeneratedRide] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Editable fields
  const [rideType, setRideType] = useState<'taxi' | 'rental'>('taxi');
  const [departureDate, setDepartureDate] = useState('');
  const [departureTime, setDepartureTime] = useState('');
  const [cost, setCost] = useState('');
  const [notes, setNotes] = useState('');

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Extract all locations from the trip
    const tripLocations: Location[] = [];

    // Add airports from flights
    trip.flights.forEach((flight, idx) => {
      // Departure airport
      if (!tripLocations.find((l) => l.id === `flight-dep-${idx}`)) {
        // Handle both ISO format (2025-11-13T05:15:00) and space format (2025-11-13 05:15+02:00)
        const depParts = flight.departureDateTime.includes('T')
          ? flight.departureDateTime.split('T')
          : flight.departureDateTime.split(' ');
        tripLocations.push({
          id: `flight-dep-${idx}`,
          name: `${flight.departureAirportCode} Airport`,
          address: flight.departureAirportCode,
          type: 'airport',
          date: depParts[0],
          time: depParts[1]?.slice(0, 5),
        });
      }
      // Arrival airport
      if (!tripLocations.find((l) => l.id === `flight-arr-${idx}`)) {
        // Handle both ISO format (2025-11-13T05:15:00) and space format (2025-11-13 05:15+02:00)
        const arrParts = flight.arrivalDateTime.includes('T')
          ? flight.arrivalDateTime.split('T')
          : flight.arrivalDateTime.split(' ');
        tripLocations.push({
          id: `flight-arr-${idx}`,
          name: `${flight.arrivalAirportCode} Airport`,
          address: flight.arrivalAirportCode,
          type: 'airport',
          date: arrParts[0],
          time: arrParts[1]?.slice(0, 5),
        });
      }
    });

    // Add hotels - add for EACH day of the stay
    trip.hotels.forEach((hotel, idx) => {
      const checkInDate = new Date(hotel.checkIn.split('T')[0]);
      const checkOutDate = new Date(hotel.checkOut.split('T')[0]);

      // Generate all dates in the stay range
      const currentDate = new Date(checkInDate);
      let dayIndex = 0;
      while (currentDate <= checkOutDate) {
        const dateStr = currentDate.toISOString().split('T')[0];
        tripLocations.push({
          id: `hotel-${idx}-day-${dayIndex}`,
          name: `${hotel.name} (Day ${dayIndex + 1})`,
          address: hotel.address,
          type: 'hotel',
          date: dateStr,
        });
        currentDate.setDate(currentDate.getDate() + 1);
        dayIndex++;
      }
    });

    // Add attractions
    trip.attractions.forEach((attraction, idx) => {
      tripLocations.push({
        id: `attraction-${idx}`,
        name: attraction.name,
        address: attraction.address,
        type: 'attraction',
        date: attraction.scheduledDate.split('T')[0],
        time: attraction.scheduledTime,
      });
    });

    setLocations(tripLocations);

    // Auto-select initial locations if provided
    if (initialSelection && initialSelection.length === 2) {
      let startId = `${initialSelection[0].type}-${initialSelection[0].index}`;
      let endId = `${initialSelection[1].type}-${initialSelection[1].index}`;

      // For hotels, if the simple ID doesn't exist, try with day-0 suffix
      if (
        initialSelection[0].type === 'hotel' &&
        !tripLocations.find((l) => l.id === startId)
      ) {
        startId = `hotel-${initialSelection[0].index}-day-0`;
      }
      if (
        initialSelection[1].type === 'hotel' &&
        !tripLocations.find((l) => l.id === endId)
      ) {
        endId = `hotel-${initialSelection[1].index}-day-0`;
      }

      setStartLocation(startId);
      setEndLocation(endId);

      // Auto-generate ride after a short delay to ensure state is set
      setTimeout(() => {
        const start = tripLocations.find((l) => l.id === startId);
        const end = tripLocations.find((l) => l.id === endId);
        if (start && end) {
          autoGenerateRide(start.address, end.address, start.date, start.time);
        }
      }, 100);
    }
  }, [trip, initialSelection]);

  const autoGenerateRide = async (
    originAddr: string,
    destAddr: string,
    date?: string,
    time?: string
  ) => {
    setLoading(true);
    setError(null);

    try {
      const result = await calculateRideRoute(originAddr, destAddr);
      setGeneratedRide(result);
      if (date) {
        setDepartureDate(date);
      }
      if (time) {
        setDepartureTime(time);
      }
    } catch (e: any) {
      setError(
        e?.response?.data?.message || e.message || 'Failed to calculate route'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateRide = async () => {
    if (!startLocation || !endLocation) {
      setError('Please select both start and end locations');
      return;
    }

    const start = locations.find((l) => l.id === startLocation);
    const end = locations.find((l) => l.id === endLocation);

    if (!start || !end) return;

    setLoading(true);
    setError(null);

    try {
      const result = await calculateRideRoute(start.address, end.address);
      setGeneratedRide(result);

      // Set initial values based on location times
      if (start.date) {
        setDepartureDate(start.date);
        // If we have a time for the start location, use it, otherwise leave empty
        if (start.time) {
          setDepartureTime(start.time);
        }
      }
    } catch (e: any) {
      setError(
        e?.response?.data?.message || e.message || 'Failed to calculate route'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSaveRide = async () => {
    if (!generatedRide || !departureDate) {
      setError('Please generate a ride and set a departure date');
      return;
    }

    const start = locations.find((l) => l.id === startLocation);
    const end = locations.find((l) => l.id === endLocation);

    if (!start || !end) return;

    setSaving(true);
    setError(null);

    try {
      const rideData: RideLeg = {
        type: rideType,
        pickup: start.name,
        dropoff: end.name,
        distance: generatedRide.distance,
        duration: generatedRide.duration,
        date: departureDate,
        time: departureTime || undefined,
        cost: cost ? Number(cost) : undefined,
        notes: notes || undefined,
      };

      const updatedTrip = await addRideToTrip(trip.id, rideData);
      onRideAdded(updatedTrip);

      // Reset form
      setStartLocation('');
      setEndLocation('');
      setGeneratedRide(null);
      setDepartureDate('');
      setDepartureTime('');
      setCost('');
      setNotes('');
      setRideType('taxi');

      onClose?.();
    } catch (e: any) {
      setError(e?.response?.data?.message || e.message || 'Failed to add ride');
    } finally {
      setSaving(false);
    }
  };

  const getLocationIcon = (type: string) => {
    switch (type) {
      case 'airport':
        return '✈️';
      case 'hotel':
        return '🏨';
      case 'attraction':
        return '🎯';
      default:
        return '📍';
    }
  };

  return (
    <Card>
      <CardContent>
        <Stack direction="row" alignItems="center" spacing={1} mb={2}>
          <DirectionsCarIcon color="primary" />
          <Typography variant="h6">Generate Ride Between Locations</Typography>
        </Stack>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Grid container spacing={2}>
          {/* Location Selection */}
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth>
              <InputLabel>Start Location</InputLabel>
              <Select
                value={startLocation}
                label="Start Location"
                onChange={(e) => setStartLocation(e.target.value)}
              >
                <MenuItem value="">
                  <em>Select start location</em>
                </MenuItem>
                {locations.map((loc) => (
                  <MenuItem key={loc.id} value={loc.id}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <span>{getLocationIcon(loc.type)}</span>
                      <span>{loc.name}</span>
                      {loc.date && (
                        <Chip
                          size="small"
                          label={`${loc.date}${loc.time ? ` ${loc.time}` : ''}`}
                        />
                      )}
                    </Stack>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12} sm={6}>
            <FormControl fullWidth>
              <InputLabel>Destination</InputLabel>
              <Select
                value={endLocation}
                label="Destination"
                onChange={(e) => setEndLocation(e.target.value)}
              >
                <MenuItem value="">
                  <em>Select destination</em>
                </MenuItem>
                {locations.map((loc) => (
                  <MenuItem key={loc.id} value={loc.id}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <span>{getLocationIcon(loc.type)}</span>
                      <span>{loc.name}</span>
                      {loc.date && (
                        <Chip
                          size="small"
                          label={`${loc.date}${loc.time ? ` ${loc.time}` : ''}`}
                        />
                      )}
                    </Stack>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12}>
            <Button
              variant="contained"
              fullWidth
              onClick={handleGenerateRide}
              disabled={!startLocation || !endLocation || loading}
              startIcon={
                loading ? <CircularProgress size={20} /> : <DirectionsCarIcon />
              }
            >
              {loading ? 'Calculating Route...' : 'Generate Ride'}
            </Button>
          </Grid>
        </Grid>

        {/* Generated Ride Results */}
        {generatedRide && (
          <>
            <Divider sx={{ my: 3 }} />

            <Alert severity="success" sx={{ mb: 2 }}>
              Route calculated successfully!
            </Alert>

            <Grid container spacing={2}>
              <Grid item xs={6}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="caption" color="text.secondary">
                      Distance
                    </Typography>
                    <Typography variant="h6">
                      {generatedRide.distance}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={6}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="caption" color="text.secondary">
                      Duration
                    </Typography>
                    <Typography variant="h6">
                      {generatedRide.duration}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              {/* Editable Fields */}
              <Grid item xs={12}>
                <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
                  Ride Details
                </Typography>
              </Grid>

              <Grid item xs={12} sm={4}>
                <FormControl fullWidth>
                  <InputLabel>Ride Type</InputLabel>
                  <Select
                    value={rideType}
                    label="Ride Type"
                    onChange={(e) =>
                      setRideType(e.target.value as 'taxi' | 'rental')
                    }
                  >
                    <MenuItem value="taxi">Taxi / Ride</MenuItem>
                    <MenuItem value="rental">Car Rental</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth
                  type="date"
                  label="Departure Date"
                  value={departureDate}
                  onChange={(e) => setDepartureDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  required
                />
              </Grid>

              <Grid item xs={12} sm={4}>
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
                  type="number"
                  label="Cost (Optional)"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  InputProps={{ startAdornment: '$' }}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Notes (Optional)"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g., Uber, pre-booked"
                />
              </Grid>

              <Grid item xs={12}>
                <Stack direction="row" spacing={2}>
                  <Button
                    variant="contained"
                    fullWidth
                    onClick={handleSaveRide}
                    disabled={!departureDate || saving}
                    startIcon={saving ? <CircularProgress size={20} /> : null}
                  >
                    {saving ? 'Adding Ride...' : 'Add Ride to Itinerary'}
                  </Button>
                  {onClose && (
                    <Button
                      variant="outlined"
                      onClick={onClose}
                      disabled={saving}
                    >
                      Cancel
                    </Button>
                  )}
                </Stack>
              </Grid>
            </Grid>
          </>
        )}
      </CardContent>
    </Card>
  );
}
