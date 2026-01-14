import { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Typography,
  Grid,
  Card,
  CardContent,
  CardMedia,
  CardActions,
  Button,
  TextField,
  MenuItem,
  Chip,
  CircularProgress,
  Alert,
  InputAdornment,
  Paper,
} from '@mui/material';
import {
  Search,
  LocationOn,
  CalendarToday,
  People,
  TrendingUp,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useLanguage } from '../context/LanguageContext';

interface PublicTrip {
  _id: string;
  title: string;
  destination: string;
  description: string;
  startDate: string;
  endDate: string;
  duration: number;
  pricePerPerson: number;
  currency: string;
  maxParticipants: number;
  currentParticipants: number;
  coverImage?: string;
  agencyName?: string;
  status: string;
  tags?: string[];
}

export default function PublicTripsPage() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [trips, setTrips] = useState<PublicTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [destinationFilter, setDestinationFilter] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [sortBy, setSortBy] = useState('date'); // date, price, popular
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [agencyFilter, setAgencyFilter] = useState('');

  // Get all unique tags from trips
  const allTags = Array.from(
    new Set(trips.flatMap((trip) => trip.tags || []))
  ).sort();

  // Get all unique agencies from trips
  const allAgencies = Array.from(
    new Set(trips.map((trip) => trip.agencyName).filter(Boolean))
  ).sort();

  useEffect(() => {
    loadTrips();
  }, [destinationFilter, minPrice, maxPrice]);

  const loadTrips = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (destinationFilter) params.append('destination', destinationFilter);
      if (minPrice) params.append('minPrice', minPrice);
      if (maxPrice) params.append('maxPrice', maxPrice);

      const response = await api.get(
        `/organized-trips/public?${params.toString()}`
      );
      setTrips(response.data.trips || []);
    } catch (err: any) {
      setError(err.response?.data?.error || t('errorLoadingTrips'));
    } finally {
      setLoading(false);
    }
  };

  const filteredTrips = trips
    .filter((trip) => {
      // Search query filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch =
          trip.title.toLowerCase().includes(query) ||
          trip.destination.toLowerCase().includes(query) ||
          trip.description.toLowerCase().includes(query);
        if (!matchesSearch) return false;
      }

      // Tags filter
      if (selectedTags.length > 0) {
        const tripTags = trip.tags || [];
        const matchesTags = selectedTags.every((tag) => tripTags.includes(tag));
        if (!matchesTags) return false;
      }

      // Agency filter
      if (agencyFilter && trip.agencyName !== agencyFilter) {
        return false;
      }

      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'price') {
        return a.pricePerPerson - b.pricePerPerson;
      } else if (sortBy === 'popular') {
        return b.currentParticipants - a.currentParticipants;
      } else {
        // date
        return (
          new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
        );
      }
    });

  const getAvailableSpots = (trip: PublicTrip) => {
    return trip.maxParticipants - trip.currentParticipants;
  };

  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 4 }}>
        {/* Header */}
        <Box sx={{ mb: 4, textAlign: 'center' }}>
          <Typography variant="h3" fontWeight={700} gutterBottom>
            🌍 טיולים מאורגנים
          </Typography>
          <Typography variant="h6" color="text.secondary">
            גלו את הטיולים המדהימים שלנו ברחבי העולם
          </Typography>
        </Box>

        {/* Filters */}
        <Paper sx={{ p: 3, mb: 4 }}>
          <Grid container spacing={2}>
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                placeholder={t('searchTrips')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Search />
                    </InputAdornment>
                  ),
                }}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <TextField
                fullWidth
                select
                label={t('destination')}
                value={destinationFilter}
                onChange={(e) => setDestinationFilter(e.target.value)}
              >
                <MenuItem value="">{t('all')}</MenuItem>
                <MenuItem value="תאילנד">{t('thailand')}</MenuItem>
                <MenuItem value="יוון">{t('greece')}</MenuItem>
                <MenuItem value="איטליה">{t('italy')}</MenuItem>
                <MenuItem value="ספרד">{t('spain')}</MenuItem>
                <MenuItem value="טורקיה">{t('turkey')}</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <TextField
                fullWidth
                type="number"
                label={t('minPrice')}
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">₪</InputAdornment>
                  ),
                }}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <TextField
                fullWidth
                type="number"
                label={t('maxPrice')}
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">₪</InputAdornment>
                  ),
                }}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <TextField
                fullWidth
                select
                label={t('sort')}
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                <MenuItem value="date">תאריך</MenuItem>
                <MenuItem value="price">מחיר</MenuItem>
                <MenuItem value="popular">פופולריים</MenuItem>
              </TextField>
            </Grid>
            {allAgencies.length > 0 && (
              <Grid item xs={12} sm={6} md={2}>
                <TextField
                  fullWidth
                  select
                  label={t('agency')}
                  value={agencyFilter}
                  onChange={(e) => setAgencyFilter(e.target.value)}
                >
                  <MenuItem value="">כל הסוכנויות</MenuItem>
                  {allAgencies.map((agency) => (
                    <MenuItem key={agency} value={agency}>
                      {agency}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
            )}
          </Grid>
        </Paper>

        {/* Tags Filter */}
        {allTags.length > 0 && (
          <Box sx={{ mt: 2, mb: 3 }}>
            <Typography variant="subtitle2" gutterBottom>
              סינון לפי תגיות:
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {allTags.map((tag) => (
                <Chip
                  key={tag}
                  label={`#${tag}`}
                  onClick={() => {
                    if (selectedTags.includes(tag)) {
                      setSelectedTags(selectedTags.filter((t) => t !== tag));
                    } else {
                      setSelectedTags([...selectedTags, tag]);
                    }
                  }}
                  color={selectedTags.includes(tag) ? 'primary' : 'default'}
                  variant={selectedTags.includes(tag) ? 'filled' : 'outlined'}
                  sx={{ cursor: 'pointer' }}
                />
              ))}
              {selectedTags.length > 0 && (
                <Chip
                  label={t('clearAll')}
                  onClick={() => setSelectedTags([])}
                  color="error"
                  variant="outlined"
                  size="small"
                  sx={{ cursor: 'pointer' }}
                />
              )}
            </Box>
          </Box>
        )}

        {/* Results */}
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        ) : error ? (
          <Alert severity="error">{error}</Alert>
        ) : filteredTrips.length === 0 ? (
          <Alert severity="info">לא נמצאו טיולים התואמים לחיפוש</Alert>
        ) : (
          <>
            <Typography variant="h6" gutterBottom>
              נמצאו {filteredTrips.length} טיולים
            </Typography>
            <Grid container spacing={3}>
              {filteredTrips.map((trip) => (
                <Grid item xs={12} md={6} lg={4} key={trip._id}>
                  <Card
                    sx={{
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      transition: 'transform 0.2s',
                      '&:hover': {
                        transform: 'translateY(-4px)',
                        boxShadow: 4,
                      },
                    }}
                  >
                    {trip.coverImage ? (
                      <CardMedia
                        component="img"
                        height="200"
                        image={trip.coverImage}
                        alt={trip.title}
                      />
                    ) : (
                      <Box
                        sx={{
                          height: 200,
                          bgcolor: 'primary.main',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <LocationOn sx={{ fontSize: 64, color: 'white' }} />
                      </Box>
                    )}
                    <CardContent sx={{ flexGrow: 1 }}>
                      <Typography variant="h6" gutterBottom fontWeight={700}>
                        {trip.title}
                      </Typography>
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.5,
                          mb: 1,
                        }}
                      >
                        <LocationOn fontSize="small" color="action" />
                        <Typography variant="body2" color="text.secondary">
                          {trip.destination}
                        </Typography>
                      </Box>
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.5,
                          mb: 2,
                        }}
                      >
                        <CalendarToday fontSize="small" color="action" />
                        <Typography variant="body2" color="text.secondary">
                          {new Date(trip.startDate).toLocaleDateString('he-IL')}{' '}
                          - {trip.duration} ימים
                        </Typography>
                      </Box>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{
                          mb: 2,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                        }}
                      >
                        {trip.description}
                      </Typography>
                      {trip.tags && trip.tags.length > 0 && (
                        <Box
                          sx={{
                            mb: 2,
                            display: 'flex',
                            gap: 0.5,
                            flexWrap: 'wrap',
                          }}
                        >
                          {trip.tags.slice(0, 3).map((tag) => (
                            <Chip
                              key={tag}
                              label={`#${tag}`}
                              size="small"
                              color="secondary"
                              variant="outlined"
                            />
                          ))}
                          {trip.tags.length > 3 && (
                            <Chip
                              label={`+${trip.tags.length - 3}`}
                              size="small"
                              variant="outlined"
                            />
                          )}
                        </Box>
                      )}
                      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                        <Chip
                          icon={<People />}
                          label={`${getAvailableSpots(trip)} מקומות פנויים`}
                          size="small"
                          color={
                            getAvailableSpots(trip) > 5 ? 'success' : 'warning'
                          }
                        />
                        {trip.agencyName && (
                          <Chip
                            label={trip.agencyName}
                            size="small"
                            variant="outlined"
                          />
                        )}
                      </Box>
                    </CardContent>
                    <CardActions
                      sx={{
                        justifyContent: 'space-between',
                        px: 2,
                        pb: 2,
                      }}
                    >
                      <Typography variant="h6" color="primary" fontWeight={700}>
                        ₪{trip.pricePerPerson.toLocaleString()}
                      </Typography>
                      <Button
                        variant="contained"
                        onClick={() => navigate(`/organized-trips/${trip._id}`)}
                      >
                        פרטים נוספים
                      </Button>
                    </CardActions>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </>
        )}
      </Box>
    </Container>
  );
}
