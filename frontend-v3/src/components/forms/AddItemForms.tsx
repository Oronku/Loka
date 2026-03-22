import { useEffect, useState } from 'react';
import SearchAutocomplete from '../SearchAutocomplete';
import type { Trip } from '../../types/domain';
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
  addRideToTrip,
  addAttractionToTrip,
  rideDistance,
  placesAutocomplete,
  placeDetails,
} from '../../services/api';
import { AddFlightForm } from './AddFlightForm';
import { AddHotelForm } from './addHotelForm';

export { AddFlightForm, AddHotelForm };
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
