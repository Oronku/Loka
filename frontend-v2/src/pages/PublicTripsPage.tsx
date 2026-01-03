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
}

export default function PublicTripsPage() {
  const navigate = useNavigate();
  const [trips, setTrips] = useState<PublicTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [destinationFilter, setDestinationFilter] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [sortBy, setSortBy] = useState('date'); // date, price, popular

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
      setError(err.response?.data?.error || 'שגיאה בטעינת טיולים');
    } finally {
      setLoading(false);
    }
  };

  const filteredTrips = trips
    .filter((trip) => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          trip.title.toLowerCase().includes(query) ||
          trip.destination.toLowerCase().includes(query) ||
          trip.description.toLowerCase().includes(query)
        );
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
                placeholder="חיפוש טיולים..."
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
                label="יעד"
                value={destinationFilter}
                onChange={(e) => setDestinationFilter(e.target.value)}
              >
                <MenuItem value="">הכל</MenuItem>
                <MenuItem value="תאילנד">תאילנד</MenuItem>
                <MenuItem value="יוון">יוון</MenuItem>
                <MenuItem value="איטליה">איטליה</MenuItem>
                <MenuItem value="ספרד">ספרד</MenuItem>
                <MenuItem value="טורקיה">טורקיה</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <TextField
                fullWidth
                type="number"
                label="מחיר מינימום"
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
                label="מחיר מקסימום"
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
                label="מיון"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                <MenuItem value="date">תאריך</MenuItem>
                <MenuItem value="price">מחיר</MenuItem>
                <MenuItem value="popular">פופולריים</MenuItem>
              </TextField>
            </Grid>
          </Grid>
        </Paper>

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
                        onClick={() => navigate(`/trips/${trip._id}`)}
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
