import { useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Paper,
  Stack,
  TextField,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Alert,
} from '@mui/material';
import {
  AutoAwesome,
  Close,
  LocationOn,
  Schedule,
  AttachMoney,
  Restaurant,
  Hotel,
  LocalActivity,
  ExpandMore,
  Add,
  Check,
} from '@mui/icons-material';
import { useLanguage } from '../context/LanguageContext';
import { useNotification } from '../context/NotificationContext';
import type { Trip } from '../types/domain';

interface AIItinerarySuggesterProps {
  trip: Trip;
  onSuggestionsApplied: (updatedTrip: Trip) => void;
}

interface Suggestion {
  type: 'attraction' | 'restaurant' | 'hotel' | 'activity';
  name: string;
  description: string;
  location: string;
  estimatedCost?: number;
  suggestedTime?: string;
  duration?: string;
  reason?: string;
}

interface DaySuggestions {
  date: string;
  suggestions: Suggestion[];
}

export default function AIItinerarySuggester({
  trip,
  onSuggestionsApplied,
}: AIItinerarySuggesterProps) {
  const { t } = useLanguage();
  const { showSuccess, showError } = useNotification();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<DaySuggestions[]>([]);
  const [preferences, setPreferences] = useState({
    interests: '',
    budget: '',
    pace: 'moderate',
  });
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<string>>(
    new Set()
  );

  const handleOpen = () => setOpen(true);
  const handleClose = () => {
    setOpen(false);
    setSuggestions([]);
    setSelectedSuggestions(new Set());
  };

  const handleGenerateSuggestions = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(
        'http://localhost:3001/api/ai/suggest-itinerary',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            trip: {
              id: trip.id,
              name: trip.name,
              destinations: trip.destinations,
              startDate: trip.startDate,
              endDate: trip.endDate,
              flights: trip.flights,
              hotels: trip.hotels,
            },
            preferences,
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to generate suggestions');
      }

      const data = await response.json();
      setSuggestions(data.suggestions || []);
      showSuccess(t('suggestionsGenerated'));
    } catch (error) {
      console.error('Error generating suggestions:', error);
      showError(t('failedToGenerateSuggestions'));
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSuggestion = (
    dayIndex: number,
    suggestionIndex: number
  ) => {
    const key = `${dayIndex}-${suggestionIndex}`;
    const newSelected = new Set(selectedSuggestions);
    if (newSelected.has(key)) {
      newSelected.delete(key);
    } else {
      newSelected.add(key);
    }
    setSelectedSuggestions(newSelected);
  };

  const handleApplySuggestions = async () => {
    setLoading(true);
    try {
      // Convert selected suggestions to trip items
      const newAttractions: any[] = [];
      const newHotels: any[] = [];

      suggestions.forEach((day, dayIndex) => {
        day.suggestions.forEach((suggestion, suggestionIndex) => {
          const key = `${dayIndex}-${suggestionIndex}`;
          if (selectedSuggestions.has(key)) {
            if (
              suggestion.type === 'attraction' ||
              suggestion.type === 'activity' ||
              suggestion.type === 'restaurant'
            ) {
              newAttractions.push({
                placeId: `ai-${Date.now()}-${Math.random()}`,
                name: suggestion.name,
                address: suggestion.location,
                scheduledDate: day.date,
                scheduledTime: suggestion.suggestedTime || '10:00',
                cost: suggestion.estimatedCost || 0,
                notes: suggestion.description,
                type:
                  suggestion.type === 'restaurant'
                    ? 'restaurant'
                    : 'attraction',
              });
            } else if (suggestion.type === 'hotel') {
              newHotels.push({
                placeId: `ai-${Date.now()}-${Math.random()}`,
                name: suggestion.name,
                address: suggestion.location,
                checkIn: day.date,
                checkOut: day.date, // Would need logic to determine checkout
                nights: 1,
                cost: suggestion.estimatedCost || 0,
                notes: suggestion.description,
              });
            }
          }
        });
      });

      // Update trip via API - add items one by one
      const token = localStorage.getItem('authToken');

      // Add hotels
      for (const hotel of newHotels) {
        const hotelResponse = await fetch(
          `http://localhost:3001/api/trips/${trip.id}/hotels`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(hotel),
          }
        );

        if (!hotelResponse.ok) {
          const errorText = await hotelResponse.text();
          console.error(
            'Failed to add hotel:',
            hotelResponse.status,
            errorText
          );
          throw new Error(`Failed to add hotel: ${hotelResponse.status}`);
        }
      }

      // Add attractions
      for (const attraction of newAttractions) {
        const attractionResponse = await fetch(
          `http://localhost:3001/api/trips/${trip.id}/attractions`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(attraction),
          }
        );

        if (!attractionResponse.ok) {
          const errorText = await attractionResponse.text();
          console.error(
            'Failed to add attraction:',
            attractionResponse.status,
            errorText
          );
          throw new Error(
            `Failed to add attraction: ${attractionResponse.status}`
          );
        }
      }

      // Fetch updated trip
      const tripResponse = await fetch(
        `http://localhost:3001/api/trips/${trip.id}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!tripResponse.ok) {
        throw new Error('Failed to fetch updated trip');
      }

      const updatedTrip = await tripResponse.json();
      onSuggestionsApplied(updatedTrip);
      showSuccess(t('suggestionsApplied'));
      handleClose();
    } catch (error) {
      console.error('Error applying suggestions:', error);
      showError(t('failedToApplySuggestions'));
    } finally {
      setLoading(false);
    }
  };

  const getSuggestionIcon = (type: string) => {
    switch (type) {
      case 'restaurant':
        return <Restaurant />;
      case 'hotel':
        return <Hotel />;
      case 'activity':
        return <LocalActivity />;
      default:
        return <LocationOn />;
    }
  };

  return (
    <>
      <Button
        variant="contained"
        startIcon={<AutoAwesome />}
        onClick={handleOpen}
        size="small"
        sx={{
          borderRadius: 50,
          px: 2,
          py: 0.5,
          fontSize: '0.875rem',
          fontWeight: 600,
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          boxShadow: '0 2px 8px rgba(102, 126, 234, 0.3)',
          '&:hover': {
            background: 'linear-gradient(135deg, #5568d3 0%, #6a3f8f 100%)',
            boxShadow: '0 4px 12px rgba(102, 126, 234, 0.4)',
          },
        }}
      >
        {t('aiSuggestItinerary')}
      </Button>

      <Dialog
        open={open}
        onClose={handleClose}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 4,
            maxHeight: '90vh',
          },
        }}
      >
        <DialogTitle>
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
          >
            <Stack direction="row" alignItems="center" gap={2}>
              <Box
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: 3,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background:
                    'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                }}
              >
                <AutoAwesome />
              </Box>
              <Box>
                <Typography variant="h5" fontWeight={800}>
                  {t('aiSuggestItinerary')}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {trip.name} • {trip.destinations?.join(', ')}
                </Typography>
              </Box>
            </Stack>
            <IconButton onClick={handleClose} size="small">
              <Close />
            </IconButton>
          </Stack>
        </DialogTitle>

        <DialogContent>
          <Stack spacing={3}>
            {/* Loading Animation */}
            {loading && (
              <Paper
                elevation={0}
                sx={{
                  p: 5,
                  border: '1px solid',
                  borderColor: 'primary.light',
                  borderRadius: 3,
                  background:
                    'linear-gradient(135deg, rgba(102, 126, 234, 0.05) 0%, rgba(118, 75, 162, 0.05) 100%)',
                  textAlign: 'center',
                }}
              >
                <Stack spacing={3} alignItems="center">
                  {/* Animated Icon */}
                  <Box
                    sx={{
                      position: 'relative',
                      width: 120,
                      height: 120,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {/* Outer rotating circle */}
                    <Box
                      sx={{
                        position: 'absolute',
                        width: '100%',
                        height: '100%',
                        borderRadius: '50%',
                        border: '3px solid',
                        borderColor: 'primary.light',
                        borderTopColor: 'primary.main',
                        animation: 'spin 1.5s linear infinite',
                        '@keyframes spin': {
                          '0%': { transform: 'rotate(0deg)' },
                          '100%': { transform: 'rotate(360deg)' },
                        },
                      }}
                    />
                    {/* Inner pulsing circle */}
                    <Box
                      sx={{
                        position: 'absolute',
                        width: '80%',
                        height: '80%',
                        borderRadius: '50%',
                        background:
                          'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        animation: 'pulse 2s ease-in-out infinite',
                        '@keyframes pulse': {
                          '0%, 100%': {
                            transform: 'scale(0.9)',
                            opacity: 0.8,
                          },
                          '50%': {
                            transform: 'scale(1)',
                            opacity: 1,
                          },
                        },
                      }}
                    />
                    {/* Center icon */}
                    <AutoAwesome
                      sx={{
                        fontSize: 48,
                        color: 'white',
                        zIndex: 1,
                        animation: 'sparkle 1.5s ease-in-out infinite',
                        '@keyframes sparkle': {
                          '0%, 100%': {
                            transform: 'rotate(0deg) scale(1)',
                          },
                          '25%': {
                            transform: 'rotate(-10deg) scale(1.1)',
                          },
                          '50%': {
                            transform: 'rotate(10deg) scale(1)',
                          },
                          '75%': {
                            transform: 'rotate(-10deg) scale(1.1)',
                          },
                        },
                      }}
                    />
                  </Box>

                  {/* Loading text with animation */}
                  <Box>
                    <Typography
                      variant="h5"
                      fontWeight={700}
                      gutterBottom
                      sx={{
                        background:
                          'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        backgroundClip: 'text',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        animation: 'fadeInOut 2s ease-in-out infinite',
                        '@keyframes fadeInOut': {
                          '0%, 100%': { opacity: 0.7 },
                          '50%': { opacity: 1 },
                        },
                      }}
                    >
                      {t('generatingTitle')}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {t('generatingSubtitle')}
                    </Typography>
                  </Box>

                  {/* Progress dots */}
                  <Stack direction="row" spacing={1}>
                    {[0, 1, 2].map((i) => (
                      <Box
                        key={i}
                        sx={{
                          width: 12,
                          height: 12,
                          borderRadius: '50%',
                          bgcolor: 'primary.main',
                          animation: `bounce 1.4s ease-in-out ${i * 0.2}s infinite`,
                          '@keyframes bounce': {
                            '0%, 80%, 100%': {
                              transform: 'translateY(0)',
                              opacity: 0.5,
                            },
                            '40%': {
                              transform: 'translateY(-10px)',
                              opacity: 1,
                            },
                          },
                        }}
                      />
                    ))}
                  </Stack>
                </Stack>
              </Paper>
            )}

            {/* Preferences Section */}
            {suggestions.length === 0 && !loading && (
              <Paper
                elevation={0}
                sx={{
                  p: 3,
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 3,
                }}
              >
                <Typography variant="h6" fontWeight={700} gutterBottom>
                  {t('yourPreferences')}
                </Typography>
                <Stack spacing={2.5} sx={{ mt: 2 }}>
                  <TextField
                    label={t('interests')}
                    placeholder={t('interestsPlaceholder')}
                    fullWidth
                    multiline
                    rows={2}
                    value={preferences.interests}
                    onChange={(e) =>
                      setPreferences({
                        ...preferences,
                        interests: e.target.value,
                      })
                    }
                    helperText={t('interestsHelper')}
                  />

                  <TextField
                    label={t('dailyBudget')}
                    placeholder="$100"
                    fullWidth
                    value={preferences.budget}
                    onChange={(e) =>
                      setPreferences({ ...preferences, budget: e.target.value })
                    }
                    helperText={t('budgetHelper')}
                  />

                  <Box>
                    <Typography
                      variant="subtitle2"
                      fontWeight={600}
                      gutterBottom
                    >
                      {t('pace')}
                    </Typography>
                    <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                      {['relaxed', 'moderate', 'packed'].map((pace) => (
                        <Chip
                          key={pace}
                          label={t(pace)}
                          onClick={() =>
                            setPreferences({ ...preferences, pace })
                          }
                          color={
                            preferences.pace === pace ? 'primary' : 'default'
                          }
                          variant={
                            preferences.pace === pace ? 'filled' : 'outlined'
                          }
                        />
                      ))}
                    </Stack>
                  </Box>
                </Stack>

                <Button
                  variant="contained"
                  fullWidth
                  size="large"
                  onClick={handleGenerateSuggestions}
                  disabled={loading}
                  startIcon={
                    loading ? <CircularProgress size={20} /> : <AutoAwesome />
                  }
                  sx={{
                    mt: 3,
                    borderRadius: 3,
                    py: 1.5,
                    fontWeight: 700,
                  }}
                >
                  {loading ? t('generating') : t('generateSuggestions')}
                </Button>
              </Paper>
            )}

            {/* Suggestions Section */}
            {suggestions.length > 0 && (
              <>
                <Alert severity="info" sx={{ borderRadius: 2 }}>
                  {t('selectSuggestionsToAdd')}
                </Alert>

                {suggestions.map((day, dayIndex) => (
                  <Accordion
                    key={dayIndex}
                    defaultExpanded={dayIndex === 0}
                    sx={{
                      borderRadius: 3,
                      '&:before': { display: 'none' },
                      border: '1px solid',
                      borderColor: 'divider',
                    }}
                  >
                    <AccordionSummary expandIcon={<ExpandMore />}>
                      <Stack direction="row" alignItems="center" gap={2}>
                        <Schedule color="primary" />
                        <Box>
                          <Typography fontWeight={700}>
                            {new Date(day.date).toLocaleDateString()}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {day.suggestions.length} {t('suggestions')}
                          </Typography>
                        </Box>
                      </Stack>
                    </AccordionSummary>
                    <AccordionDetails>
                      <Stack spacing={2}>
                        {day.suggestions.map((suggestion, suggestionIndex) => {
                          const key = `${dayIndex}-${suggestionIndex}`;
                          const isSelected = selectedSuggestions.has(key);

                          return (
                            <Card
                              key={suggestionIndex}
                              elevation={0}
                              sx={{
                                border: '2px solid',
                                borderColor: isSelected
                                  ? 'primary.main'
                                  : 'divider',
                                borderRadius: 2.5,
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                '&:hover': {
                                  borderColor: 'primary.main',
                                  transform: 'translateY(-2px)',
                                  boxShadow: 2,
                                },
                              }}
                              onClick={() =>
                                handleToggleSuggestion(
                                  dayIndex,
                                  suggestionIndex
                                )
                              }
                            >
                              <CardContent>
                                <Stack
                                  direction="row"
                                  alignItems="flex-start"
                                  spacing={2}
                                >
                                  <Box
                                    sx={{
                                      width: 40,
                                      height: 40,
                                      borderRadius: 2,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      bgcolor: isSelected
                                        ? 'primary.main'
                                        : 'primary.light',
                                      color: isSelected
                                        ? 'white'
                                        : 'primary.main',
                                      flexShrink: 0,
                                    }}
                                  >
                                    {isSelected ? (
                                      <Check />
                                    ) : (
                                      getSuggestionIcon(suggestion.type)
                                    )}
                                  </Box>

                                  <Box sx={{ flex: 1 }}>
                                    <Stack
                                      direction="row"
                                      alignItems="center"
                                      spacing={1}
                                      mb={0.5}
                                    >
                                      <Typography fontWeight={700}>
                                        {suggestion.name}
                                      </Typography>
                                      <Chip
                                        label={t(suggestion.type)}
                                        size="small"
                                        sx={{ fontSize: '0.7rem' }}
                                      />
                                    </Stack>

                                    <Typography
                                      variant="body2"
                                      color="text.secondary"
                                      mb={1}
                                    >
                                      {suggestion.description}
                                    </Typography>

                                    <Stack
                                      direction="row"
                                      spacing={2}
                                      flexWrap="wrap"
                                    >
                                      <Chip
                                        icon={<LocationOn />}
                                        label={suggestion.location}
                                        size="small"
                                        variant="outlined"
                                      />
                                      {suggestion.suggestedTime && (
                                        <Chip
                                          icon={<Schedule />}
                                          label={suggestion.suggestedTime}
                                          size="small"
                                          variant="outlined"
                                        />
                                      )}
                                      {suggestion.estimatedCost && (
                                        <Chip
                                          icon={<AttachMoney />}
                                          label={`$${suggestion.estimatedCost}`}
                                          size="small"
                                          variant="outlined"
                                        />
                                      )}
                                    </Stack>

                                    {suggestion.reason && (
                                      <Typography
                                        variant="caption"
                                        color="text.secondary"
                                        sx={{
                                          mt: 1,
                                          display: 'block',
                                          fontStyle: 'italic',
                                        }}
                                      >
                                        💡 {suggestion.reason}
                                      </Typography>
                                    )}
                                  </Box>
                                </Stack>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </Stack>
                    </AccordionDetails>
                  </Accordion>
                ))}

                <Divider />

                <Stack direction="row" spacing={2}>
                  <Button
                    variant="outlined"
                    fullWidth
                    onClick={() => {
                      setSuggestions([]);
                      setSelectedSuggestions(new Set());
                    }}
                    sx={{ borderRadius: 3 }}
                  >
                    {t('regenerate')}
                  </Button>
                  <Button
                    variant="contained"
                    fullWidth
                    onClick={handleApplySuggestions}
                    disabled={selectedSuggestions.size === 0 || loading}
                    startIcon={
                      loading ? <CircularProgress size={20} /> : <Add />
                    }
                    sx={{ borderRadius: 3 }}
                  >
                    {loading
                      ? t('applying')
                      : `${t('addSelected')} (${selectedSuggestions.size})`}
                  </Button>
                </Stack>
              </>
            )}
          </Stack>
        </DialogContent>
      </Dialog>
    </>
  );
}
