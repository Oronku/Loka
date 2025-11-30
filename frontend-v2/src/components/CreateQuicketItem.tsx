import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Grid,
  Typography,
  Alert,
  Box,
  Card,
  CardContent,
  FormControlLabel,
  Checkbox,
  CircularProgress,
} from '@mui/material';
import { Add, Close } from '@mui/icons-material';
import PDFUploadButton from './PDFUploadButton';
import QuicketPlaceSearch, { type PlaceData } from './QuicketPlaceSearch';
import { createQuicketItem } from '../services/quicketApi';

interface CreateQuicketItemProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function CreateQuicketItem({
  open,
  onClose,
  onSuccess,
}: CreateQuicketItemProps) {
  const [type, setType] = useState<'flight' | 'hotel' | 'attraction' | 'event'>(
    'flight'
  );
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priceOriginal, setPriceOriginal] = useState('');
  const [priceSelling, setPriceSelling] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [location, setLocation] = useState('');
  const [startDatetime, setStartDatetime] = useState('');
  const [endDatetime, setEndDatetime] = useState('');

  // Flight specific
  const [flightNumber, setFlightNumber] = useState('');
  const [airline, setAirline] = useState('');
  const [departureAirport, setDepartureAirport] = useState('');
  const [arrivalAirport, setArrivalAirport] = useState('');
  const [canChangeName, setCanChangeName] = useState(false);

  // Hotel specific
  const [hotelName, setHotelName] = useState('');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [numberOfRooms, setNumberOfRooms] = useState('');
  const [mealPlan, setMealPlan] = useState('');

  // Place data (for hotels, attractions, restaurants)
  const [selectedPlace, setSelectedPlace] = useState<PlaceData | null>(null);
  const [photoUrl, setPhotoUrl] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handlePlaceSelect = (place: PlaceData) => {
    setSelectedPlace(place);
    setLocation(place.address);
    setPhotoUrl(place.photoUrl || '');

    if (type === 'hotel') {
      setHotelName(place.name);
      setTitle(place.name);
    } else if (type === 'attraction') {
      setTitle(place.name);
    }
  };

  const handleClearPlace = () => {
    setSelectedPlace(null);
    setPhotoUrl('');
  };

  const handlePDFExtracted = (data: any) => {
    if (data.type === 'flight') {
      setType('flight');
      setAirline(data.airline || '');
      setFlightNumber(data.flightNumber || '');
      setDepartureAirport(data.departureAirportCode || '');
      setArrivalAirport(data.arrivalAirportCode || '');
      setStartDatetime(data.departureDateTime?.split(' ')[0] || '');
      setTitle(
        `Flight ${data.flightNumber || ''} - ${data.departureAirportCode || ''} to ${data.arrivalAirportCode || ''}`
      );
      setLocation(
        `${data.departureAirportCode || ''} → ${data.arrivalAirportCode || ''}`
      );
    } else if (data.type === 'hotel') {
      setType('hotel');
      setHotelName(data.name || '');
      setCheckIn(data.checkIn || '');
      setCheckOut(data.checkOut || '');
      setStartDatetime(data.checkIn || '');
      setEndDatetime(data.checkOut || '');
      if (data.numberOfRooms) {
        setNumberOfRooms(data.numberOfRooms.toString());
      }
      setTitle(data.name || '');
      setLocation(data.address || '');
    }
  };

  const handleSubmit = async () => {
    try {
      setLoading(true);
      setError(null);

      // Validation
      if (!title.trim()) {
        setError('Title is required');
        setLoading(false);
        return;
      }
      if (!priceSelling || parseFloat(priceSelling) <= 0) {
        setError('Selling price is required and must be greater than 0');
        setLoading(false);
        return;
      }

      // Build metadata based on type
      const metadata: any = {};

      // Add place data if available
      if (selectedPlace) {
        metadata.placeId = selectedPlace.placeId;
        metadata.placeName = selectedPlace.name;
        metadata.placeAddress = selectedPlace.address;
        metadata.placeLocation = selectedPlace.location;
        metadata.placeRating = selectedPlace.rating;
        if (photoUrl) metadata.photoUrl = photoUrl;
      }

      if (type === 'flight') {
        if (flightNumber) metadata.flightNumber = flightNumber;
        if (airline) metadata.airline = airline;
        if (departureAirport) metadata.departureAirport = departureAirport;
        if (arrivalAirport) metadata.arrivalAirport = arrivalAirport;
        metadata.canChangeName = canChangeName;
      } else if (type === 'hotel') {
        if (hotelName) metadata.hotelName = hotelName;
        if (checkIn) metadata.checkIn = checkIn;
        if (checkOut) metadata.checkOut = checkOut;
        if (numberOfRooms) metadata.numberOfRooms = parseInt(numberOfRooms);
        if (mealPlan) metadata.mealPlan = mealPlan;
      }

      const itemData = {
        type,
        title,
        description,
        priceOriginal: priceOriginal ? parseFloat(priceOriginal) : undefined,
        priceSelling: parseFloat(priceSelling),
        currency,
        location,
        startDatetime: startDatetime || undefined,
        endDatetime: endDatetime || undefined,
        metadata,
      };

      await createQuicketItem(itemData);
      setSuccess(true);
      setLoading(false);

      // Reset form after short delay
      setTimeout(() => {
        handleClose();
        if (onSuccess) onSuccess();
      }, 1500);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create item');
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      // Reset all fields
      setType('flight');
      setTitle('');
      setDescription('');
      setPriceOriginal('');
      setPriceSelling('');
      setCurrency('USD');
      setLocation('');
      setStartDatetime('');
      setEndDatetime('');
      setFlightNumber('');
      setAirline('');
      setDepartureAirport('');
      setArrivalAirport('');
      setCanChangeName(false);
      setHotelName('');
      setCheckIn('');
      setCheckOut('');
      setNumberOfRooms('');
      setMealPlan('');
      setError(null);
      setSuccess(false);
      onClose();
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="h6">Create Quicket Item</Typography>
          <Button onClick={handleClose} disabled={loading}>
            <Close />
          </Button>
        </Box>
      </DialogTitle>

      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {success && (
          <Alert severity="success" sx={{ mb: 2 }}>
            Item created successfully!
          </Alert>
        )}

        {/* PDF Upload */}
        <Card sx={{ mb: 3, bgcolor: 'primary.50' }}>
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
              Upload a flight ticket or hotel reservation to auto-fill details
            </Typography>
            <PDFUploadButton
              acceptedType="both"
              onDataExtracted={handlePDFExtracted}
            />
          </CardContent>
        </Card>

        <Grid container spacing={2}>
          {/* Type Selection */}
          <Grid item xs={12}>
            <TextField
              fullWidth
              select
              label="Item Type"
              value={type}
              onChange={(e) => setType(e.target.value as any)}
              required
            >
              <MenuItem value="flight">Flight</MenuItem>
              <MenuItem value="hotel">Hotel</MenuItem>
              <MenuItem value="attraction">Attraction</MenuItem>
              <MenuItem value="event">Event</MenuItem>
            </TextField>
          </Grid>

          {/* Common Fields */}
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder={`e.g., ${type === 'flight' ? 'Flight LY315 TLV-JFK' : type === 'hotel' ? 'Hilton Hotel 3 Nights' : 'Item title'}`}
            />
          </Grid>

          <Grid item xs={12}>
            <TextField
              fullWidth
              multiline
              rows={3}
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Provide details about your item, why you're selling, any restrictions, etc."
            />
          </Grid>

          {/* Place Search for Hotels, Attractions */}
          {(type === 'hotel' || type === 'attraction') && (
            <Grid item xs={12}>
              <QuicketPlaceSearch
                onPlaceSelect={handlePlaceSelect}
                selectedPlace={selectedPlace}
                onClear={handleClearPlace}
                label={
                  type === 'hotel'
                    ? 'Search for Hotel'
                    : 'Search for Attraction/Restaurant'
                }
                placeholder={
                  type === 'hotel'
                    ? 'e.g., Hilton Dubai, Marriott...'
                    : 'e.g., Eiffel Tower, Central Park...'
                }
                types={
                  type === 'hotel'
                    ? 'lodging'
                    : 'tourist_attraction|restaurant|point_of_interest'
                }
              />
            </Grid>
          )}

          {/* Manual Location Input for Flights and Events */}
          {(type === 'flight' || type === 'event') && (
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="City or route"
              />
            </Grid>
          )}

          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              select
              label="Currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              <MenuItem value="USD">USD</MenuItem>
              <MenuItem value="EUR">EUR</MenuItem>
              <MenuItem value="GBP">GBP</MenuItem>
              <MenuItem value="ILS">ILS</MenuItem>
            </TextField>
          </Grid>

          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              type="number"
              label="Original Price"
              value={priceOriginal}
              onChange={(e) => setPriceOriginal(e.target.value)}
              placeholder="Optional"
            />
          </Grid>

          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              type="number"
              label="Selling Price"
              value={priceSelling}
              onChange={(e) => setPriceSelling(e.target.value)}
              required
            />
          </Grid>

          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              type="datetime-local"
              label={type === 'hotel' ? 'Check-in' : 'Start Date/Time'}
              value={startDatetime}
              onChange={(e) => setStartDatetime(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>

          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              type="datetime-local"
              label={type === 'hotel' ? 'Check-out' : 'End Date/Time'}
              value={endDatetime}
              onChange={(e) => setEndDatetime(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>

          {/* Flight Specific Fields */}
          {type === 'flight' && (
            <>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Airline"
                  value={airline}
                  onChange={(e) => setAirline(e.target.value)}
                  placeholder="e.g., El Al, Delta"
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Flight Number"
                  value={flightNumber}
                  onChange={(e) => setFlightNumber(e.target.value)}
                  placeholder="e.g., LY315"
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Departure Airport"
                  value={departureAirport}
                  onChange={(e) => setDepartureAirport(e.target.value)}
                  placeholder="e.g., TLV"
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Arrival Airport"
                  value={arrivalAirport}
                  onChange={(e) => setArrivalAirport(e.target.value)}
                  placeholder="e.g., JFK"
                />
              </Grid>

              <Grid item xs={12}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={canChangeName}
                      onChange={(e) => setCanChangeName(e.target.checked)}
                    />
                  }
                  label="Name change allowed on this ticket"
                />
              </Grid>
            </>
          )}

          {/* Hotel Specific Fields */}
          {type === 'hotel' && (
            <>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Hotel Name"
                  value={hotelName}
                  onChange={(e) => setHotelName(e.target.value)}
                  placeholder="e.g., Hilton Tel Aviv"
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  type="number"
                  label="Number of Rooms"
                  value={numberOfRooms}
                  onChange={(e) => setNumberOfRooms(e.target.value)}
                  placeholder="1"
                />
              </Grid>

              <Grid item xs={12}>
                <TextField
                  fullWidth
                  select
                  label="Meal Plan"
                  value={mealPlan}
                  onChange={(e) => setMealPlan(e.target.value)}
                >
                  <MenuItem value="">None</MenuItem>
                  <MenuItem value="breakfast">Breakfast Included</MenuItem>
                  <MenuItem value="half-board">Half Board</MenuItem>
                  <MenuItem value="full-board">Full Board</MenuItem>
                  <MenuItem value="all-inclusive">All Inclusive</MenuItem>
                </TextField>
              </Grid>
            </>
          )}
        </Grid>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button onClick={handleClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={loading || success}
          startIcon={loading ? <CircularProgress size={20} /> : <Add />}
        >
          {loading ? 'Creating...' : 'Create Item'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
