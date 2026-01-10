import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Paper,
  TextField,
  Button,
  Typography,
  Stack,
  Alert,
  CircularProgress,
  Chip,
  Autocomplete,
  InputAdornment,
} from '@mui/material';
import { DatePicker, LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import {
  FlightTakeoff,
  CalendarToday,
  Description,
  People,
  LocationOn,
  ArrowForward,
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import {
  createTrip as createTripAPI,
  citiesAutocomplete,
} from '../services/api';

export default function SimpleCreateTrip() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useLanguage();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [tripName, setTripName] = useState('');
  const [destinations, setDestinations] = useState<string[]>([]);
  const [destinationInput, setDestinationInput] = useState('');
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [description, setDescription] = useState('');
  const [participants, setParticipants] = useState<string[]>([]);
  const [participantInput, setParticipantInput] = useState('');

  // Dynamic destination search
  const [destinationSuggestions, setDestinationSuggestions] = useState<any[]>(
    []
  );
  const [loadingDestinations, setLoadingDestinations] = useState(false);

  // Search for destinations using Google Places API
  useEffect(() => {
    if (destinationInput.trim().length < 2) {
      setDestinationSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoadingDestinations(true);
      try {
        const results = await citiesAutocomplete(destinationInput.trim());
        console.log('Cities search results:', results);

        // Handle both 'predictions' and 'suggestions' response formats
        const suggestions = results.predictions || results.suggestions || [];

        console.log('City suggestions:', suggestions);
        setDestinationSuggestions(suggestions);
      } catch (error) {
        console.error('Error searching destinations:', error);
        setDestinationSuggestions([]);
      } finally {
        setLoadingDestinations(false);
      }
    }, 500); // Debounce 500ms

    return () => clearTimeout(timer);
  }, [destinationInput]);

  // Popular destinations for suggestions when no input
  const popularDestinations = [
    t('telAviv'),
    t('jerusalem'),
    t('eilat'),
    t('newYork'),
    t('london'),
    t('paris'),
    t('barcelona'),
    t('rome'),
    t('dubai'),
    t('bangkok'),
    t('tokyo'),
    t('bali'),
  ];

  const handleAddDestination = () => {
    if (
      destinationInput.trim() &&
      !destinations.includes(destinationInput.trim())
    ) {
      setDestinations([...destinations, destinationInput.trim()]);
      setDestinationInput('');
    }
  };

  const handleRemoveDestination = (dest: string) => {
    setDestinations(destinations.filter((d) => d !== dest));
  };

  const handleAddParticipant = () => {
    if (
      participantInput.trim() &&
      !participants.includes(participantInput.trim())
    ) {
      setParticipants([...participants, participantInput.trim()]);
      setParticipantInput('');
    }
  };

  const handleRemoveParticipant = (name: string) => {
    setParticipants(participants.filter((p) => p !== name));
  };

  const validateForm = () => {
    if (!tripName.trim()) {
      setError(t('pleaseEnterTripName'));
      return false;
    }
    if (destinations.length === 0) {
      setError(t('pleaseAddDestination'));
      return false;
    }
    if (!startDate) {
      setError(t('pleaseSelectStartDate'));
      return false;
    }
    if (!endDate) {
      setError(t('pleaseSelectEndDate'));
      return false;
    }
    if (endDate < startDate) {
      setError(t('endDateMustBeAfterStart'));
      return false;
    }
    return true;
  };

  const handleCreateTrip = async () => {
    setError(null);

    if (!validateForm()) {
      return;
    }

    try {
      setLoading(true);

      // Create trip with minimal data
      const tripData = {
        name: tripName.trim(),
        destinations: destinations.map((d) => d), // Will be parsed by backend
        startDate: startDate!.toISOString(),
        endDate: endDate!.toISOString(),
        description: description.trim() || undefined,
        flights: [],
        hotels: [],
        rides: [],
        attractions: [],
        // Store participants as comments/notes for now
        // Can be used for sharing later when we implement full sharing
      };

      const createdTrip = await createTripAPI(tripData);

      // Navigate to the trip details page
      navigate(`/trips/${createdTrip.id}`);
    } catch (err: any) {
      console.error('Error creating trip:', err);
      setError(err.response?.data?.message || t('errorCreatingTrip'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: 'grey.50',
        py: 4,
      }}
    >
      <Box sx={{ maxWidth: 700, mx: 'auto', px: 2 }}>
        {/* Header */}
        <Stack spacing={1} mb={4} alignItems="center">
          <FlightTakeoff sx={{ fontSize: 56, color: 'primary.main' }} />
          <Typography variant="h4" fontWeight={700} textAlign="center">
            {t('createNewTrip')}
          </Typography>
          <Typography variant="body2" color="text.secondary" textAlign="center">
            {t('startWithBasics')}
          </Typography>
        </Stack>

        <Paper elevation={3} sx={{ p: 4, borderRadius: 3 }}>
          <Stack spacing={3}>
            {/* Error Alert */}
            {error && (
              <Alert severity="error" onClose={() => setError(null)}>
                {error}
              </Alert>
            )}

            {/* Trip Name */}
            <Box>
              <Typography variant="subtitle2" fontWeight={600} mb={1}>
                {t('tripNameRequired')}
              </Typography>
              <TextField
                fullWidth
                placeholder={t('tripNamePlaceholder')}
                value={tripName}
                onChange={(e) => setTripName(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <FlightTakeoff color="action" />
                    </InputAdornment>
                  ),
                }}
              />
            </Box>

            {/* Destinations */}
            <Box>
              <Typography variant="subtitle2" fontWeight={600} mb={1}>
                {t('destinationsRequired')}{' '}
                {destinations.length > 0 && `(${destinations.length})`}
              </Typography>
              <Autocomplete
                freeSolo
                options={
                  destinationSuggestions.length > 0
                    ? destinationSuggestions.map(
                        (s) => s.description || s.name || ''
                      )
                    : popularDestinations
                }
                loading={loadingDestinations}
                value={destinationInput}
                onChange={(_, newValue) => {
                  if (newValue && typeof newValue === 'string') {
                    setDestinationInput(newValue);
                  }
                }}
                inputValue={destinationInput}
                onInputChange={(_, newInputValue) => {
                  setDestinationInput(newInputValue);
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    placeholder={t('destinationPlaceholder')}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddDestination();
                      }
                    }}
                    InputProps={{
                      ...params.InputProps,
                      startAdornment: (
                        <>
                          <InputAdornment position="start">
                            <LocationOn color="action" />
                          </InputAdornment>
                          {params.InputProps.startAdornment}
                        </>
                      ),
                      endAdornment: (
                        <>
                          {loadingDestinations ? (
                            <CircularProgress color="inherit" size={20} />
                          ) : null}
                          {params.InputProps.endAdornment}
                        </>
                      ),
                    }}
                  />
                )}
              />
              <Button
                size="small"
                onClick={handleAddDestination}
                disabled={!destinationInput.trim()}
                sx={{ mt: 1 }}
              >
                {t('addDestination')}
              </Button>

              {destinations.length > 0 && (
                <Stack direction="row" spacing={1} flexWrap="wrap" mt={2}>
                  {destinations.map((dest) => (
                    <Chip
                      key={dest}
                      label={dest}
                      onDelete={() => handleRemoveDestination(dest)}
                      color="primary"
                      sx={{ mb: 1 }}
                    />
                  ))}
                </Stack>
              )}
            </Box>

            {/* Dates */}
            <LocalizationProvider dateAdapter={AdapterDateFns}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <Box flex={1}>
                  <Typography variant="subtitle2" fontWeight={600} mb={1}>
                    {t('startDateRequired')}
                  </Typography>
                  <DatePicker
                    value={startDate}
                    onChange={setStartDate}
                    slotProps={{
                      textField: {
                        fullWidth: true,
                        InputProps: {
                          startAdornment: (
                            <InputAdornment position="start">
                              <CalendarToday color="action" />
                            </InputAdornment>
                          ),
                        },
                      },
                    }}
                  />
                </Box>
                <Box flex={1}>
                  <Typography variant="subtitle2" fontWeight={600} mb={1}>
                    {t('endDateRequired')}
                  </Typography>
                  <DatePicker
                    value={endDate}
                    onChange={setEndDate}
                    minDate={startDate || undefined}
                    slotProps={{
                      textField: {
                        fullWidth: true,
                        InputProps: {
                          startAdornment: (
                            <InputAdornment position="start">
                              <CalendarToday color="action" />
                            </InputAdornment>
                          ),
                        },
                      },
                    }}
                  />
                </Box>
              </Stack>
            </LocalizationProvider>

            {/* Description */}
            <Box>
              <Typography variant="subtitle2" fontWeight={600} mb={1}>
                {t('descriptionOptional')}
              </Typography>
              <TextField
                fullWidth
                multiline
                rows={3}
                placeholder={t('descriptionPlaceholder')}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment
                      position="start"
                      sx={{ alignSelf: 'flex-start', mt: 1 }}
                    >
                      <Description color="action" />
                    </InputAdornment>
                  ),
                }}
              />
            </Box>

            {/* Participants */}
            <Box>
              <Typography variant="subtitle2" fontWeight={600} mb={1}>
                {t('participantsOptional')}{' '}
                {participants.length > 0 && `(${participants.length})`}
              </Typography>
              <TextField
                fullWidth
                placeholder={t('participantName')}
                value={participantInput}
                onChange={(e) => setParticipantInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddParticipant();
                  }
                }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <People color="action" />
                    </InputAdornment>
                  ),
                }}
              />
              <Button
                size="small"
                onClick={handleAddParticipant}
                disabled={!participantInput.trim()}
                sx={{ mt: 1 }}
              >
                {t('addParticipant')}
              </Button>

              {participants.length > 0 && (
                <Stack direction="row" spacing={1} flexWrap="wrap" mt={2}>
                  {participants.map((name) => (
                    <Chip
                      key={name}
                      label={name}
                      onDelete={() => handleRemoveParticipant(name)}
                      color="secondary"
                      sx={{ mb: 1 }}
                    />
                  ))}
                </Stack>
              )}
            </Box>

            {/* Info Box */}
            <Alert severity="info" sx={{ bgcolor: 'primary.lighter' }}>
              <Typography variant="body2" fontWeight={500}>
                {t('tipAfterCreation')}
              </Typography>
              <Typography variant="caption" display="block" mt={0.5}>
                {t('flightsHotelsEtc')}
              </Typography>
            </Alert>

            {/* Action Buttons */}
            <Stack direction="row" spacing={2} justifyContent="space-between">
              <Button
                variant="outlined"
                size="large"
                onClick={() => navigate('/trips')}
                disabled={loading}
              >
                {t('cancel')}
              </Button>
              <Button
                variant="contained"
                size="large"
                endIcon={
                  loading ? <CircularProgress size={20} /> : <ArrowForward />
                }
                onClick={handleCreateTrip}
                disabled={loading}
                sx={{ minWidth: 180 }}
              >
                {loading ? t('creatingTrip') : t('createTripAndContinue')}
              </Button>
            </Stack>
          </Stack>
        </Paper>

        {/* Additional Info */}
        <Typography
          variant="caption"
          color="text.secondary"
          textAlign="center"
          display="block"
          mt={3}
        >
          {t('requiredFields')}
        </Typography>
      </Box>
    </Box>
  );
}
