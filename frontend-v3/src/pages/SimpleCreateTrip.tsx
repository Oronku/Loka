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
  Container,
  Fade,
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
import { motion } from 'framer-motion';
import AnimatedLogo from '../components/AnimatedLogo';
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
        background: '#ffffff',
        py: { xs: 3, md: 6 },
        position: 'relative',
      }}
    >
      <Container maxWidth="md" sx={{ position: 'relative', zIndex: 1 }}>
        <Fade in timeout={600}>
          <Box>
            {/* Header */}
            <motion.div
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5 }}
            >
              <Stack spacing={2} mb={4} alignItems="center">
                <Box sx={{ mb: 1 }}>
                  <AnimatedLogo width="clamp(80px, 15vw, 120px)" />
                </Box>
                <Typography
                  variant="h3"
                  fontWeight={700}
                  textAlign="center"
                  sx={{
                    color: 'text.primary',
                    fontSize: { xs: '2rem', md: '2.5rem' },
                  }}
                >
                  {t('createNewTrip')}
                </Typography>
                <Typography
                  variant="h6"
                  textAlign="center"
                  sx={{
                    color: 'text.secondary',
                    fontWeight: 400,
                    fontSize: { xs: '0.95rem', md: '1.1rem' },
                  }}
                >
                  {t('startWithBasics')}
                </Typography>
              </Stack>
            </motion.div>

            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <Paper
                elevation={3}
                sx={{
                  p: { xs: 3, md: 5 },
                  borderRadius: 4,
                  bgcolor: 'white',
                  border: '1px solid',
                  borderColor: 'divider',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
                }}
              >
          <Stack spacing={3}>
            {/* Error Alert */}
            {error && (
              <Alert severity="error" onClose={() => setError(null)}>
                {error}
              </Alert>
            )}

            {/* Trip Name */}
            <Box>
              <Typography
                variant="subtitle2"
                fontWeight={600}
                mb={1.5}
                sx={{ color: 'text.primary' }}
              >
                {t('tripNameRequired')}
              </Typography>
              <TextField
                fullWidth
                placeholder={t('tripNamePlaceholder')}
                value={tripName}
                onChange={(e) => setTripName(e.target.value)}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 2,
                    transition: 'all 0.3s',
                    '&:hover': {
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    },
                    '&.Mui-focused': {
                      boxShadow: '0 4px 12px rgba(25, 118, 210, 0.2)',
                    },
                  },
                }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <FlightTakeoff sx={{ color: 'primary.main' }} />
                    </InputAdornment>
                  ),
                }}
              />
            </Box>

            {/* Destinations */}
            <Box>
              <Typography
                variant="subtitle2"
                fontWeight={600}
                mb={1.5}
                sx={{ color: 'text.primary' }}
              >
                {t('destinationsRequired')}{' '}
                {destinations.length > 0 && (
                  <Chip
                    label={destinations.length}
                    size="small"
                    color="primary"
                    sx={{ ml: 0.5, height: 20 }}
                  />
                )}
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
                variant="outlined"
                onClick={handleAddDestination}
                disabled={!destinationInput.trim()}
                sx={{
                  mt: 1.5,
                  borderRadius: 2,
                  textTransform: 'none',
                  '&:hover': {
                    transform: 'translateY(-2px)',
                    boxShadow: 2,
                  },
                  transition: 'all 0.2s',
                }}
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
                      sx={{
                        mb: 1,
                        borderRadius: 2,
                        fontWeight: 500,
                        '&:hover': {
                          transform: 'scale(1.05)',
                        },
                        transition: 'transform 0.2s',
                      }}
                    />
                  ))}
                </Stack>
              )}
            </Box>

            {/* Dates */}
            <LocalizationProvider dateAdapter={AdapterDateFns}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <Box flex={1}>
                  <Typography
                    variant="subtitle2"
                    fontWeight={600}
                    mb={1.5}
                    sx={{ color: 'text.primary' }}
                  >
                    {t('startDateRequired')}
                  </Typography>
                  <DatePicker
                    value={startDate}
                    onChange={setStartDate}
                    slotProps={{
                      textField: {
                        fullWidth: true,
                        sx: {
                          '& .MuiOutlinedInput-root': {
                            borderRadius: 2,
                            transition: 'all 0.3s',
                            '&:hover': {
                              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                            },
                            '&.Mui-focused': {
                              boxShadow: '0 4px 12px rgba(25, 118, 210, 0.2)',
                            },
                          },
                        },
                        InputProps: {
                          startAdornment: (
                            <InputAdornment position="start">
                              <CalendarToday sx={{ color: 'primary.main' }} />
                            </InputAdornment>
                          ),
                        },
                      },
                    }}
                  />
                </Box>
                <Box flex={1}>
                  <Typography
                    variant="subtitle2"
                    fontWeight={600}
                    mb={1.5}
                    sx={{ color: 'text.primary' }}
                  >
                    {t('endDateRequired')}
                  </Typography>
                  <DatePicker
                    value={endDate}
                    onChange={setEndDate}
                    minDate={startDate || undefined}
                    slotProps={{
                      textField: {
                        fullWidth: true,
                        sx: {
                          '& .MuiOutlinedInput-root': {
                            borderRadius: 2,
                            transition: 'all 0.3s',
                            '&:hover': {
                              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                            },
                            '&.Mui-focused': {
                              boxShadow: '0 4px 12px rgba(25, 118, 210, 0.2)',
                            },
                          },
                        },
                        InputProps: {
                          startAdornment: (
                            <InputAdornment position="start">
                              <CalendarToday sx={{ color: 'primary.main' }} />
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
              <Typography
                variant="subtitle2"
                fontWeight={600}
                mb={1.5}
                sx={{ color: 'text.primary' }}
              >
                {t('descriptionOptional')}
              </Typography>
              <TextField
                fullWidth
                multiline
                rows={3}
                placeholder={t('descriptionPlaceholder')}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 2,
                    transition: 'all 0.3s',
                    '&:hover': {
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    },
                    '&.Mui-focused': {
                      boxShadow: '0 4px 12px rgba(25, 118, 210, 0.2)',
                    },
                  },
                }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment
                      position="start"
                      sx={{ alignSelf: 'flex-start', mt: 1 }}
                    >
                      <Description sx={{ color: 'primary.main' }} />
                    </InputAdornment>
                  ),
                }}
              />
            </Box>

            {/* Participants */}
            <Box>
              <Typography
                variant="subtitle2"
                fontWeight={600}
                mb={1.5}
                sx={{ color: 'text.primary' }}
              >
                {t('participantsOptional')}{' '}
                {participants.length > 0 && (
                  <Chip
                    label={participants.length}
                    size="small"
                    color="secondary"
                    sx={{ ml: 0.5, height: 20 }}
                  />
                )}
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
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 2,
                    transition: 'all 0.3s',
                    '&:hover': {
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    },
                    '&.Mui-focused': {
                      boxShadow: '0 4px 12px rgba(25, 118, 210, 0.2)',
                    },
                  },
                }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <People sx={{ color: 'primary.main' }} />
                    </InputAdornment>
                  ),
                }}
              />
              <Button
                size="small"
                variant="outlined"
                onClick={handleAddParticipant}
                disabled={!participantInput.trim()}
                sx={{
                  mt: 1.5,
                  borderRadius: 2,
                  textTransform: 'none',
                  '&:hover': {
                    transform: 'translateY(-2px)',
                    boxShadow: 2,
                  },
                  transition: 'all 0.2s',
                }}
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
                      sx={{
                        mb: 1,
                        borderRadius: 2,
                        fontWeight: 500,
                        '&:hover': {
                          transform: 'scale(1.05)',
                        },
                        transition: 'transform 0.2s',
                      }}
                    />
                  ))}
                </Stack>
              )}
            </Box>

            {/* Info Box */}
            <Alert
              severity="info"
              sx={{
                bgcolor: 'primary.lighter',
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'primary.main',
                '& .MuiAlert-icon': {
                  color: 'primary.main',
                },
              }}
            >
              <Typography variant="body2" fontWeight={500}>
                {t('tipAfterCreation')}
              </Typography>
              <Typography variant="caption" display="block" mt={0.5}>
                {t('flightsHotelsEtc')}
              </Typography>
            </Alert>

            {/* Action Buttons */}
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={2}
              justifyContent="space-between"
              sx={{ mt: 2 }}
            >
              <Button
                variant="outlined"
                size="large"
                onClick={() => navigate('/trips')}
                disabled={loading}
                sx={{
                  borderRadius: 2,
                  textTransform: 'none',
                  fontWeight: 600,
                  px: 4,
                  '&:hover': {
                    transform: 'translateY(-2px)',
                    boxShadow: 4,
                  },
                  transition: 'all 0.2s',
                }}
              >
                {t('cancel')}
              </Button>
              <Button
                variant="contained"
                size="large"
                endIcon={
                  loading ? (
                    <CircularProgress size={20} color="inherit" />
                  ) : (
                    <ArrowForward />
                  )
                }
                onClick={handleCreateTrip}
                disabled={loading}
                sx={{
                  minWidth: { xs: '100%', sm: 220 },
                  borderRadius: 2,
                  textTransform: 'none',
                  fontWeight: 600,
                  px: 4,
                  bgcolor: 'primary.main',
                  boxShadow: '0 4px 15px rgba(25, 118, 210, 0.3)',
                  '&:hover': {
                    transform: 'translateY(-2px)',
                    boxShadow: '0 6px 20px rgba(25, 118, 210, 0.4)',
                    bgcolor: 'primary.dark',
                  },
                  '&:disabled': {
                    bgcolor: 'grey.300',
                  },
                  transition: 'all 0.3s',
                }}
              >
                {loading ? t('creatingTrip') : t('createTripAndContinue')}
              </Button>
            </Stack>
          </Stack>
              </Paper>
            </motion.div>

            {/* Additional Info */}
            <Typography
              variant="caption"
              sx={{
                color: 'text.secondary',
                textAlign: 'center',
                display: 'block',
                mt: 3,
              }}
            >
              {t('requiredFields')}
            </Typography>
          </Box>
        </Fade>
      </Container>
    </Box>
  );
}
